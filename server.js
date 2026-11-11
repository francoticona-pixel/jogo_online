const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  perMessageDeflate: false,
  httpCompression: false
});
app.use(express.static("public"));

const rooms = new Map();
const ARENA = { w: 2000, h: 1300 };
const MAX_PLAYERS = 10;
const PLAYER_RADIUS = 17;
const BULLET_RADIUS = 4;
const MAX_BULLETS_PER_ROOM = 140;
const TICK_MS = 1000 / 30;
const SNAPSHOT_MS = 1000 / 15;
const POWER_DURATION = 10000;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const WALLS = [
  { x: 250, y: 250, w: 250, h: 70 }, { x: 1500, y: 250, w: 250, h: 70 },
  { x: 250, y: 980, w: 250, h: 70 }, { x: 1500, y: 980, w: 250, h: 70 },
  { x: 920, y: 250, w: 160, h: 260 }, { x: 920, y: 790, w: 160, h: 260 },
  { x: 500, y: 520, w: 210, h: 90 }, { x: 1290, y: 690, w: 210, h: 90 },
  { x: 720, y: 850, w: 110, h: 190 }, { x: 1170, y: 260, w: 110, h: 190 },
  { x: 350, y: 650, w: 90, h: 250 }, { x: 1560, y: 430, w: 90, h: 250 },
  { x: 720, y: 390, w: 150, h: 55 }, { x: 1130, y: 855, w: 150, h: 55 },
  { x: 850, y: 620, w: 100, h: 70 }, { x: 1050, y: 620, w: 100, h: 70 },
  { x: 560, y: 850, w: 80, h: 80 }, { x: 1360, y: 370, w: 80, h: 80 }
];

const SPAWNS = [
  { x: 300, y: 300 }, { x: 700, y: 230 }, { x: 1000, y: 250 }, { x: 1300, y: 230 }, { x: 1700, y: 300 },
  { x: 300, y: 1000 }, { x: 700, y: 1070 }, { x: 1000, y: 1050 }, { x: 1300, y: 1070 }, { x: 1700, y: 1000 }
];

function circleHitsRect(x, y, radius, rect) {
  const nearX = clamp(x, rect.x, rect.x + rect.w);
  const nearY = clamp(y, rect.y, rect.y + rect.h);
  return Math.hypot(x - nearX, y - nearY) < radius;
}
function hitsWall(x, y, radius = PLAYER_RADIUS) {
  return WALLS.some(w => circleHitsRect(x, y, radius, w));
}
function movePlayer(p, dx, dy) {
  const nx = clamp(p.x + dx, PLAYER_RADIUS, ARENA.w - PLAYER_RADIUS);
  const ny = clamp(p.y + dy, PLAYER_RADIUS, ARENA.h - PLAYER_RADIUS);
  if (!hitsWall(nx, p.y)) p.x = nx;
  if (!hitsWall(p.x, ny)) p.y = ny;
}
function spawnPoint(index) {
  const point = SPAWNS[index % SPAWNS.length];
  return { x: point.x, y: point.y };
}
function isConnectedPlayer(p) {
  return !!p.connected;
}
function roomState(room) {
  const now = Date.now();
  return {
    status: room.finished ? "finished" : room.started ? "playing" : "waiting",
    maxPlayers: MAX_PLAYERS,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      number: p.number,
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp,
      lives: p.lives,
      score: p.score,
      connected: p.connected,
      alive: p.connected && p.lives > 0 && p.hp > 0,
      respawning: p.connected && p.lives > 0 && p.hp <= 0,
      eliminated: !p.connected || p.lives <= 0,
      power: p.powerUntil > now ? p.power : null,
      powerLeft: p.powerUntil > now ? p.powerUntil - now : 0,
      invisible: p.invisibleUntil > now,
      invulnerableLeft: Math.max(0, p.invulnerableUntil - now),
      name: p.name || ("OP " + String(p.number).padStart(2,"0")),
      skin: p.skin || "classic"
    })),
    bullets: room.bullets.map(b => ({
      id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, type: b.type, fuseLeft: b.fuseAt ? Math.max(0,b.fuseAt-now) : 0
    })),
    crates: room.crates.map(c => ({ id: c.id, x: c.x, y: c.y, type: c.type })),
    clones: room.clones.map(c => ({
      id: c.id, owner: c.owner, number: c.number, x: c.x, y: c.y, angle: c.angle
    })),
    explosions: room.explosions.map(e => ({
      x: e.x, y: e.y, radius: e.radius,
      remaining: Math.max(0, e.expiresAt - now)
    })),
    rankings: room.rankings,
    theme: room.theme || "forest",
    gas: room.gas ? { x: room.gas.x, y: room.gas.y, radius: room.gas.radius, remaining: Math.max(0, room.gas.endsAt - now) } : null
  };
}
function broadcast(room) {
  room.lastBroadcastAt = Date.now();
  // State packets are replaceable snapshots: drop stale packets under network pressure.
  io.to(room.code).volatile.emit("state", roomState(room));
}
function broadcastRoomInfo(room) {
  const connected = [...room.players.values()].filter(isConnectedPlayer);
  io.to(room.code).emit("roomInfo", {
    code: room.code,
    hostId: room.hostId,
    status: room.finished ? "finished" : room.started ? "playing" : "waiting",
    started: room.started,
    theme: room.theme || "forest",
    count: connected.length,
    maxPlayers: MAX_PLAYERS,
    players: connected.map(p => ({ id: p.id, number: p.number, name: p.name, skin: p.skin }))
  });
}
function resetPlayer(p, index, resetLives = false, room = null) {
  const point = room ? randomRespawnPoint(room, p.id) : spawnPoint(index);
  p.x = point.x;
  p.y = point.y;
  p.angle = index < 5 ? Math.PI / 2 : -Math.PI / 2;
  p.hp = 100;
  if (resetLives) p.lives = 3;
  p.eliminated = false;
  p.power = null;
  p.powerUntil = 0;
  p.invisibleUntil = 0;
  p.input = { up: false, down: false, left: false, right: false, shoot: false };
  p.nextShot = 0;
  p.respawnAt = 0;
  p.invulnerableUntil = Date.now() + 3000;
}
function randomRespawnPoint(room, ignorePlayerId = null) {
  const gas = room.gas;
  const safeRadius = gas ? Math.max(80, gas.radius - 65) : Math.hypot(ARENA.w, ARENA.h);
  for (let attempt = 0; attempt < 260; attempt++) {
    const x = 55 + Math.random() * (ARENA.w - 110);
    const y = 55 + Math.random() * (ARENA.h - 110);
    if (hitsWall(x, y, 25)) continue;
    if (gas && Math.hypot(x - gas.x, y - gas.y) > safeRadius) continue;
    const occupied = [...room.players.values()].some(p =>
      p.id !== ignorePlayerId && p.connected && p.lives > 0 && p.hp > 0 &&
      Math.hypot(p.x - x, p.y - y) < 145
    );
    if (!occupied) return { x, y };
  }
  for (let radius = 80; radius <= safeRadius; radius += 55) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const x = clamp(gas ? gas.x + Math.cos(angle) * radius : ARENA.w / 2 + Math.cos(angle) * radius, 35, ARENA.w - 35);
      const y = clamp(gas ? gas.y + Math.sin(angle) * radius : ARENA.h / 2 + Math.sin(angle) * radius, 35, ARENA.h - 35);
      if (!hitsWall(x, y, 25) && (!gas || Math.hypot(x-gas.x,y-gas.y) <= safeRadius)) return {x,y};
    }
  }
  return { x: ARENA.w / 2, y: ARENA.h / 2 };
}
function randomFreePoint(room, ignorePlayerId = null) {
  return randomRespawnPoint(room, ignorePlayerId);
}
function spawnCrate(room) {
  if (room.crates.length >= 3) return;
  const spot = randomFreePoint(room);
  const types = ["rapid", "speed", "triple", "shield", "invisibility", "clone", "bomb", "flame", "medkit"];
  room.crateCounter++;
  room.crates.push({
    id: room.crateCounter,
    x: spot.x,
    y: spot.y,
    type: types[Math.floor(Math.random() * types.length)]
  });
}
function spawnClones(room, player, now) {
  const offsets = [{ x: -58, y: -48 }, { x: 58, y: 48 }];
  for (let i = 0; i < offsets.length; i++) {
    let x = clamp(player.x + offsets[i].x, 35, ARENA.w - 35);
    let y = clamp(player.y + offsets[i].y, 35, ARENA.h - 35);
    if (hitsWall(x, y, 20)) {
      x = clamp(player.x - offsets[i].x, 35, ARENA.w - 35);
      y = clamp(player.y - offsets[i].y, 35, ARENA.h - 35);
    }
    room.cloneCounter++;
    room.clones.push({
      id: room.cloneCounter,
      owner: player.id,
      number: player.number,
      x, y,
      angle: player.angle,
      phase: i * Math.PI,
      expiresAt: now + 7500
    });
  }
}
function createProjectile(room, player, angle, type = "normal") {
  const bomb = type === "bomb";
  room.bulletCounter++;
  room.bullets.push({
    id: room.bulletCounter,
    owner: player.id,
    x: player.x + Math.cos(angle) * (bomb ? 30 : 23),
    y: player.y + Math.sin(angle) * (bomb ? 30 : 23),
    vx: Math.cos(angle) * (bomb ? 7.2 : 12),
    vy: Math.sin(angle) * (bomb ? 7.2 : 12),
    life: bomb ? 105 : 75,
    damage: bomb ? 48 : type === "flame" ? 7 : 20,
    type,
    fuseAt: 0
  });
  if (room.bullets.length > MAX_BULLETS_PER_ROOM) {
    room.bullets.splice(0, room.bullets.length - MAX_BULLETS_PER_ROOM);
  }
}
function damagePlayer(room, target, amount, killerId, now) {
  if (!target.connected || target.lives <= 0 || target.hp <= 0 || target.invulnerableUntil > now) return false;
  const damage = target.power === "shield" && target.powerUntil > now
    ? Math.ceil(amount * 0.5)
    : amount;
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp > 0) return false;

  target.lives = Math.max(0, target.lives - 1);
  target.power = null;
  target.powerUntil = 0;
  target.invisibleUntil = 0;
  if (killerId && killerId !== target.id) {
    const killer = room.players.get(killerId);
    if (killer && killer.connected) killer.score++;
  }
  if (target.lives > 0) {
    target.respawnAt = now + 1600;
  } else {
    target.eliminated = true;
    target.respawnAt = 0;
  }
  return true;
}
function explodeBomb(room, bomb, now) {
  const radius = 132;
  room.explosions.push({
    x: bomb.x,
    y: bomb.y,
    radius,
    expiresAt: now + 520
  });
  for (const p of room.players.values()) {
    if (p.id === bomb.owner || !p.connected || p.lives <= 0 || p.hp <= 0) continue;
    const distance = Math.hypot(p.x - bomb.x, p.y - bomb.y);
    if (distance <= radius) {
      const falloff = Math.max(0.45, 1 - distance / (radius * 1.6));
      damagePlayer(room, p, Math.round(bomb.damage * falloff), bomb.owner, now);
    }
  }
  room.clones = room.clones.filter(c => Math.hypot(c.x - bomb.x, c.y - bomb.y) > radius);
}
function finishRoom(room) {
  if (!room.started || room.finished) return;
  const players = [...room.players.values()];
  const survivors = players.filter(p => p.connected && p.lives > 0);
  players.sort((a, b) => {
    const aActive = a.connected && a.lives > 0 ? 1 : 0;
    const bActive = b.connected && b.lives > 0 ? 1 : 0;
    return bActive - aActive || b.score - a.score || b.lives - a.lives || a.number - b.number;
  });
  // A sole survivor wins; if everyone is eliminated in the same server tick,
  // use eliminations/lives as a deterministic tiebreaker for the top spot.
  const winnerId = survivors.length === 1 ? survivors[0].id : players[0]?.id || null;
  room.winnerId = winnerId;
  room.rankings = players.slice(0, 3).map((p, index) => ({
    position: index + 1,
    id: p.id,
    number: p.number,
    score: p.score,
    lives: p.lives,
    name: p.name,
    skin: p.skin,
    winner: p.id === winnerId
  }));
  room.finished = true;
  room.started = false;
  room.bullets = [];
  room.crates = [];
  room.clones = [];
  room.explosions = [];
  broadcastRoomInfo(room);
  broadcast(room);
}
function checkRoomFinished(room) {
  if (!room.started) return;
  const remaining = [...room.players.values()].filter(p => p.connected && p.lives > 0);
  if (remaining.length <= 1) finishRoom(room);
}
function startRoom(room) {
  room.started = true;
  room.finished = false;
  room.winnerId = null;
  room.rankings = [];
  room.bullets = [];
  room.crates = [];
  room.clones = [];
  room.explosions = [];
  room.gas = { x: ARENA.w / 2, y: ARENA.h / 2, radius: 1050, startAt: Date.now() + 18000, endsAt: Date.now() + 198000 };
  room.players.forEach(p => {
    p.score = 0;
    if (p.connected) resetPlayer(p, p.number - 1, true);
    else {
      p.lives = 0;
      p.hp = 0;
      p.eliminated = true;
    }
  });
  const now = Date.now();
  room.nextCrateAt = now + 7000;
  room.lastBroadcastAt = 0;
  broadcastRoomInfo(room);
  broadcast(room);
}

io.on("connection", socket => {
  socket.on("joinRoom", rawData => {
    if (socket.data.room) return socket.emit("joinError", "Você já está em uma sala.");
    const payload = rawData && typeof rawData === "object" ? rawData : {code:rawData};
    const code = String(payload.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const playerName = String(payload.name || "OPERADOR").replace(/[^\p{L}\p{N} _.-]/gu,"").trim().slice(0,16) || "OPERADOR";
    const allowedSkins = ["classic","crimson","ice","gold","toxic"];
    const playerSkin = allowedSkins.includes(payload.skin) ? payload.skin : "classic";
    if (!code) return socket.emit("joinError", "Digite um código de sala.");

    let room = rooms.get(code);
    if (!room) {
      room = {
        code,
        theme: ["forest","neon","desert","ice"].includes(payload.theme) ? payload.theme : "forest",
        hostId: socket.id,
        players: new Map(),
        bullets: [],
        crates: [],
        clones: [],
        explosions: [],
        rankings: [],
        winnerId: null,
        crateCounter: 0,
        cloneCounter: 0,
        bulletCounter: 0,
        nextCrateAt: 0,
        lastBroadcastAt: 0,
        started: false,
        finished: false
      };
      rooms.set(code, room);
    }
    if (room.started || room.finished) {
      return socket.emit("joinError", "Essa sala já está em uma partida. Aguarde uma nova sala.");
    }
    if ([...room.players.values()].filter(isConnectedPlayer).length >= MAX_PLAYERS) {
      return socket.emit("joinError", "Sala cheia! O limite é de 10 jogadores.");
    }

    const occupiedNumbers = new Set([...room.players.values()].map(p => p.number));
    let number = 1;
    while (occupiedNumbers.has(number) && number <= MAX_PLAYERS) number++;
    if (number > MAX_PLAYERS) return socket.emit("joinError", "Sala cheia! O limite é de 10 jogadores.");

    const point = spawnPoint(number - 1);
    const player = {
      id: socket.id,
      number,
      name: playerName,
      skin: playerSkin,
      x: point.x,
      y: point.y,
      angle: 0,
      hp: 100,
      lives: 3,
      score: 0,
      connected: true,
      eliminated: false,
      power: null,
      powerUntil: 0,
      invisibleUntil: 0,
      input: { up: false, down: false, left: false, right: false, shoot: false },
      nextShot: 0,
      respawnAt: 0,
      invulnerableUntil: 0
    };
    room.players.set(socket.id, player);
    socket.join(code);
    socket.data.room = code;
    socket.emit("joined", { code, playerId: socket.id, playerNumber: number, isHost: room.hostId === socket.id });
    broadcastRoomInfo(room);
    broadcast(room);
  });

  socket.on("startGame", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.started) return;
    if (room.hostId !== socket.id) return socket.emit("startError", "Somente quem criou a sala pode começar.");
    const connectedCount = [...room.players.values()].filter(isConnectedPlayer).length;
    if (connectedCount < 2) return socket.emit("startError", "É preciso ter pelo menos 2 jogadores para começar.");
    startRoom(room);
  });

  socket.on("input", input => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.started) return;
    const p = room.players.get(socket.id);
    if (!p || !p.connected || p.lives <= 0 || p.hp <= 0 || !input || typeof input !== "object") return;
    p.input = {
      up: !!input.up,
      down: !!input.down,
      left: !!input.left,
      right: !!input.right,
      shoot: !!input.shoot
    };
    if (Number.isFinite(input.angle)) p.angle = input.angle;
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) {
      p.connected = false;
      p.input = { up: false, down: false, left: false, right: false, shoot: false };
      if (room.started) {
        p.lives = 0;
        p.hp = 0;
        p.eliminated = true;
      } else if (!room.finished) {
        room.players.delete(socket.id);
      }
    }
    if (room.hostId === socket.id) {
      room.hostId = [...room.players.values()].find(candidate => candidate.connected)?.id || null;
    }
    const connectedCount = [...room.players.values()].filter(isConnectedPlayer).length;
    if (!connectedCount) {
      rooms.delete(code);
      return;
    }
    if (room.started) checkRoomFinished(room);
    broadcastRoomInfo(room);
    broadcast(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.started) continue;

    const players = [...room.players.values()];
    for (const p of players) {
      if (!p.connected || p.lives <= 0) continue;
      if (p.hp <= 0) {
        if (p.respawnAt && now >= p.respawnAt) {
          resetPlayer(p, p.number - 1, false, room);
        }
        continue;
      }
      if (p.powerUntil <= now) {
        p.power = null;
        p.powerUntil = 0;
      }
      if (p.invisibleUntil <= now) p.invisibleUntil = 0;

      const dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      const dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
      const length = Math.hypot(dx, dy) || 1;
      const speed = p.power === "speed" ? 7.8 : 6.2;
      movePlayer(p, dx / length * speed, dy / length * speed);

      let fireDelay = 275;
      if (p.power === "rapid") fireDelay = 125;
      else if (p.power === "triple") fireDelay = 330;
      else if (p.power === "bomb") fireDelay = 1100;
      else if (p.power === "flame") fireDelay = 145;
      if (p.input.shoot && now >= p.nextShot) {
        p.nextShot = now + fireDelay;
        if (p.power === "triple") {
          createProjectile(room, p, p.angle - 0.2);
          createProjectile(room, p, p.angle);
          createProjectile(room, p, p.angle + 0.2);
        } else {
          createProjectile(room, p, p.angle, p.power === "bomb" ? "bomb" : p.power === "flame" ? "flame" : "normal");
        }
      }

      for (let i = room.crates.length - 1; i >= 0; i--) {
        const crate = room.crates[i];
        if (Math.hypot(p.x - crate.x, p.y - crate.y) >= 30) continue;
        p.power = crate.type;
        p.powerUntil = now + POWER_DURATION;
        if (crate.type === "invisibility") p.invisibleUntil = now + 7800;
        if (crate.type === "medkit") { p.hp = Math.min(100, p.hp + 55); p.powerUntil = now + 2500; }
        if (crate.type === "life") { p.lives = Math.min(5, p.lives + 1); p.powerUntil = now + 2500; }
        if (crate.type === "clone") {
          spawnClones(room, p, now);
          p.powerUntil = now + 3000;
        }
        room.crates.splice(i, 1);
      }
    }

    for (const bullet of room.bullets) {
      const oldX = bullet.x;
      const oldY = bullet.y;
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.life--;

      if (bullet.type === "bomb") {
        if (!bullet.fuseAt) {
          let impact = hitsWall(bullet.x, bullet.y, 8) || bullet.x < 12 || bullet.x > ARENA.w - 12 || bullet.y < 12 || bullet.y > ARENA.h - 12;
          if (!impact) {
            for (const target of players) {
              if (target.id === bullet.owner || !target.connected || target.lives <= 0 || target.hp <= 0) continue;
              if (Math.hypot(target.x - bullet.x, target.y - bullet.y) < PLAYER_RADIUS + 9) { impact = true; break; }
            }
          }
          if (impact || bullet.life <= 0) { bullet.vx = 0; bullet.vy = 0; bullet.life = 95; bullet.fuseAt = now + 3000; }
        } else if (now >= bullet.fuseAt) { explodeBomb(room, bullet, now); bullet.life = 0; }
        continue;
      }

      if (bullet.type === "flame") {
        let flameHit = false;
        for (const target of players) {
          if (target.id === bullet.owner || !target.connected || target.lives <= 0 || target.hp <= 0) continue;
          if (Math.hypot(target.x - bullet.x, target.y - bullet.y) < PLAYER_RADIUS + 10) { damagePlayer(room,target,bullet.damage,bullet.owner,now); flameHit=true; break; }
        }
        if (flameHit || bullet.life <= 0 || hitsWall(bullet.x,bullet.y,5)) bullet.life=0;
        continue;
      }
      const hitWall = hitsWall(bullet.x, bullet.y, BULLET_RADIUS) ||
        WALLS.some(w => circleHitsRect((oldX + bullet.x) / 2, (oldY + bullet.y) / 2, BULLET_RADIUS + 6, w));
      if (hitWall) {
        bullet.life = 0;
        continue;
      }

      let hit = false;
      for (let i = room.clones.length - 1; i >= 0; i--) {
        const clone = room.clones[i];
        if (clone.owner === bullet.owner) continue;
        if (Math.hypot(clone.x - bullet.x, clone.y - bullet.y) < PLAYER_RADIUS + BULLET_RADIUS) {
          room.clones.splice(i, 1);
          bullet.life = 0;
          hit = true;
          break;
        }
      }
      if (hit) continue;

      for (const target of players) {
        if (target.id === bullet.owner || !target.connected || target.lives <= 0 || target.hp <= 0) continue;
        if (Math.hypot(target.x - bullet.x, target.y - bullet.y) < PLAYER_RADIUS + BULLET_RADIUS + 2) {
          damagePlayer(room, target, bullet.damage, bullet.owner, now);
          bullet.life = 0;
          break;
        }
      }
    }
    room.bullets = room.bullets.filter(b =>
      b.life > 0 && b.x > 0 && b.x < ARENA.w && b.y > 0 && b.y < ARENA.h
    );
    for (const clone of room.clones) {
      const owner = room.players.get(clone.owner);
      if (!owner || !owner.connected || owner.lives <= 0 || owner.hp <= 0) continue;
      const orbit = now / 620 + clone.phase;
      const targetX = clamp(owner.x + Math.cos(orbit) * 52, 30, ARENA.w - 30);
      const targetY = clamp(owner.y + Math.sin(orbit) * 42, 30, ARENA.h - 30);
      const nextX = clone.x + (targetX - clone.x) * 0.14;
      const nextY = clone.y + (targetY - clone.y) * 0.14;
      if (!hitsWall(nextX, clone.y, 19)) clone.x = nextX;
      if (!hitsWall(clone.x, nextY, 19)) clone.y = nextY;
      clone.angle = owner.angle;
    }
    room.clones = room.clones.filter(c => c.expiresAt > now);
    room.explosions = room.explosions.filter(e => e.expiresAt > now);

    if (room.gas && now >= room.gas.startAt) {
      const progress = clamp((now-room.gas.startAt)/(room.gas.endsAt-room.gas.startAt),0,1);
      room.gas.radius = 1050-progress*890;
      for (const p of players) if (p.connected && p.lives>0 && p.hp>0 && Math.hypot(p.x-room.gas.x,p.y-room.gas.y)>room.gas.radius) damagePlayer(room,p,0.22,null,now);
    }
    if (now >= room.nextCrateAt) {
      spawnCrate(room);
      room.nextCrateAt = now + 15000 + Math.random() * 9000;
    }

    checkRoomFinished(room);
    if (room.started && now - room.lastBroadcastAt >= SNAPSHOT_MS) {
      broadcast(room);
    }
  }
}, TICK_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log("DUEL ARENA online em http://localhost:" + PORT));