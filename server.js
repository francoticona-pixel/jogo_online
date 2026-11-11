const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = new Map();
const ARENA = { w: 1000, h: 620 };
const MAX_PLAYERS = 10;
const PLAYER_RADIUS = 17;
const BULLET_RADIUS = 4;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const WALLS = [
  { x: 245, y: 135, w: 130, h: 42 },
  { x: 625, y: 135, w: 130, h: 42 },
  { x: 245, y: 443, w: 130, h: 42 },
  { x: 625, y: 443, w: 130, h: 42 },
  { x: 468, y: 250, w: 64, h: 120 },
  { x: 100, y: 278, w: 55, h: 64 },
  { x: 845, y: 278, w: 55, h: 64 },
  { x: 452, y: 72, w: 96, h: 28 },
  { x: 452, y: 520, w: 96, h: 28 }
];

const SPAWNS = [
  { x: 100, y: 85 }, { x: 300, y: 85 }, { x: 500, y: 45 }, { x: 700, y: 85 }, { x: 900, y: 85 },
  { x: 100, y: 535 }, { x: 300, y: 535 }, { x: 500, y: 575 }, { x: 700, y: 535 }, { x: 900, y: 535 }
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
function roomState(room) {
  const now = Date.now();
  return {
    status: room.started ? "playing" : "waiting",
    maxPlayers: MAX_PLAYERS,
    hostId: room.hostId,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      number: p.number,
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp,
      score: p.score,
      alive: p.hp > 0,
      power: p.powerUntil > now ? p.power : null,
      powerLeft: p.powerUntil > now ? p.powerUntil - now : 0
    })),
    bullets: room.bullets.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
    crates: room.crates.map(c => ({ id: c.id, x: c.x, y: c.y, type: c.type }))
  };
}
function broadcast(room) {
  io.to(room.code).emit("state", roomState(room));
}
function broadcastRoomInfo(room) {
  io.to(room.code).emit("roomInfo", {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    count: room.players.size,
    maxPlayers: MAX_PLAYERS,
    players: [...room.players.values()].map(p => ({ id: p.id, number: p.number }))
  });
}
function resetPlayer(p, index) {
  const point = spawnPoint(index);
  p.x = point.x;
  p.y = point.y;
  p.angle = index < 5 ? Math.PI / 2 : -Math.PI / 2;
  p.hp = 100;
  p.power = null;
  p.powerUntil = 0;
  p.input = { up: false, down: false, left: false, right: false, shoot: false };
  p.nextShot = 0;
  p.respawnAt = 0;
}
function randomFreePoint(room) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = 70 + Math.random() * (ARENA.w - 140);
    const y = 70 + Math.random() * (ARENA.h - 140);
    if (hitsWall(x, y, 23)) continue;
    if ([...room.players.values()].some(p => p.hp > 0 && Math.hypot(p.x - x, p.y - y) < 75)) continue;
    return { x, y };
  }
  return { x: 500, y: 205 };
}
function spawnCrate(room) {
  if (room.crates.length >= 2) return;
  const spot = randomFreePoint(room);
  const types = ["rapid", "speed", "triple", "shield"];
  room.crateCounter++;
  room.crates.push({ id: room.crateCounter, x: spot.x, y: spot.y, type: types[Math.floor(Math.random() * types.length)] });
}
function createBullet(room, player, angle) {
  const speed = 12;
  room.bullets.push({
    owner: player.id,
    x: player.x + Math.cos(angle) * 23,
    y: player.y + Math.sin(angle) * 23,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 85,
    damage: 20
  });
}
function startRoom(room) {
  room.started = true;
  room.bullets = [];
  room.crates = [];
  room.players.forEach(p => {
    p.score = 0;
    resetPlayer(p, p.number - 1);
  });
  const now = Date.now();
  room.nextCrateAt = now + 9000;
  broadcastRoomInfo(room);
  broadcast(room);
}

io.on("connection", socket => {
  socket.on("joinRoom", rawCode => {
    if (socket.data.room) return socket.emit("joinError", "Você já está em uma sala.");
    const code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (!code) return socket.emit("joinError", "Digite um código de sala.");

    let room = rooms.get(code);
    if (!room) {
      room = {
        code,
        hostId: socket.id,
        players: new Map(),
        bullets: [],
        crates: [],
        crateCounter: 0,
        nextCrateAt: 0,
        started: false
      };
      rooms.set(code, room);
    }
    if (room.started) return socket.emit("joinError", "Essa partida já começou. Crie outra sala para entrar.");
    if (room.players.size >= MAX_PLAYERS) return socket.emit("joinError", "Sala cheia! O limite é de 10 jogadores.");

    const occupiedNumbers = new Set([...room.players.values()].map(p => p.number));
    let number = 1;
    while (occupiedNumbers.has(number) && number <= MAX_PLAYERS) number++;
    if (number > MAX_PLAYERS) return socket.emit("joinError", "Sala cheia! O limite é de 10 jogadores.");
    const point = spawnPoint(number - 1);
    const player = {
      id: socket.id,
      number,
      x: point.x,
      y: point.y,
      angle: 0,
      hp: 100,
      score: 0,
      power: null,
      powerUntil: 0,
      input: { up: false, down: false, left: false, right: false, shoot: false },
      nextShot: 0,
      respawnAt: 0
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
    if (room.players.size < 2) return socket.emit("startError", "É preciso ter pelo menos 2 jogadores para começar.");
    startRoom(room);
  });

  socket.on("input", input => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.started) return;
    const p = room.players.get(socket.id);
    if (!p || p.hp <= 0 || !input || typeof input !== "object") return;
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
    room.players.delete(socket.id);
    room.bullets = room.bullets.filter(b => b.owner !== socket.id);
    if (room.hostId === socket.id) {
      room.hostId = room.players.keys().next().value || null;
    }
    if (!room.players.size) {
      rooms.delete(code);
      return;
    }
    broadcastRoomInfo(room);
    broadcast(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.started) continue;

    for (const p of room.players.values()) {
      if (p.hp <= 0) {
        if (p.respawnAt && now >= p.respawnAt) {
          resetPlayer(p, p.number - 1);
        }
        continue;
      }
      if (p.powerUntil <= now) {
        p.power = null;
        p.powerUntil = 0;
      }

      const dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      const dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
      const length = Math.hypot(dx, dy) || 1;
      const speed = p.power === "speed" ? 6.6 : 4.2;
      movePlayer(p, dx / length * speed, dy / length * speed);

      const fireDelay = p.power === "rapid" ? 115 : 275;
      if (p.input.shoot && now >= p.nextShot) {
        p.nextShot = now + fireDelay;
        if (p.power === "triple") {
          createBullet(room, p, p.angle - 0.22);
          createBullet(room, p, p.angle);
          createBullet(room, p, p.angle + 0.22);
        } else {
          createBullet(room, p, p.angle);
        }
      }

      for (let i = room.crates.length - 1; i >= 0; i--) {
        const crate = room.crates[i];
        if (Math.hypot(p.x - crate.x, p.y - crate.y) < 27) {
          p.power = crate.type;
          p.powerUntil = now + 9000;
          room.crates.splice(i, 1);
        }
      }
    }

    for (const bullet of room.bullets) {
      const oldX = bullet.x;
      const oldY = bullet.y;
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.life--;
      if (hitsWall(bullet.x, bullet.y, BULLET_RADIUS) ||
          WALLS.some(w => circleHitsRect((oldX + bullet.x) / 2, (oldY + bullet.y) / 2, BULLET_RADIUS + 6, w))) {
        bullet.life = 0;
        continue;
      }
      for (const target of room.players.values()) {
        if (target.id === bullet.owner || target.hp <= 0) continue;
        if (Math.hypot(target.x - bullet.x, target.y - bullet.y) < PLAYER_RADIUS + BULLET_RADIUS + 2) {
          const damage = target.power === "shield" ? Math.ceil(bullet.damage * 0.5) : bullet.damage;
          target.hp = Math.max(0, target.hp - damage);
          bullet.life = 0;
          if (target.hp === 0) {
            const shooter = room.players.get(bullet.owner);
            if (shooter) shooter.score++;
            target.respawnAt = now + 1600;
          }
          break;
        }
      }
    }
    room.bullets = room.bullets.filter(b => b.life > 0 && b.x > 0 && b.x < ARENA.w && b.y > 0 && b.y < ARENA.h);

    if (now >= room.nextCrateAt) {
      spawnCrate(room);
      room.nextCrateAt = now + 15000 + Math.random() * 9000;
    }

    broadcast(room);
  }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("DUEL ARENA online em http://localhost:" + PORT));