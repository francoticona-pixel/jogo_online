const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = new Map();
const ARENA = { w: 1000, h: 620 };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function roomState(room) {
  return {
    players: [...room.players.values()].map(p => ({
      id: p.id, x: p.x, y: p.y, angle: p.angle, hp: p.hp, score: p.score
    })),
    bullets: room.bullets.map(b => ({ x: b.x, y: b.y })),
    status: room.players.size === 2 ? "playing" : "waiting"
  };
}
function broadcast(room) {
  io.to(room.code).emit("state", roomState(room));
}
function resetPlayer(p, index) {
  p.x = index === 0 ? 145 : 855;
  p.y = 310;
  p.angle = index === 0 ? 0 : Math.PI;
  p.hp = 100;
}

io.on("connection", socket => {
  socket.on("joinRoom", rawCode => {
    const code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (!code) return socket.emit("joinError", "Digite um código de sala.");
    let room = rooms.get(code);
    if (!room) {
      room = { code, players: new Map(), bullets: [], lastShot: new Map() };
      rooms.set(code, room);
    }
    if (room.players.size >= 2) return socket.emit("joinError", "Essa sala já está cheia.");
    const index = room.players.size;
    const p = { id: socket.id, x: 0, y: 0, angle: 0, hp: 100, score: 0 };
    resetPlayer(p, index);
    room.players.set(socket.id, p);
    socket.join(code);
    socket.data.room = code;
    socket.emit("joined", { code, playerId: socket.id, playerNumber: index + 1 });
    broadcast(room);
  });

  socket.on("input", input => {
    const room = rooms.get(socket.data.room);
    if (!room || room.players.size !== 2) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    const speed = 4.2;
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + dx / len * speed, 28, ARENA.w - 28);
    p.y = clamp(p.y + dy / len * speed, 28, ARENA.h - 28);
    if (Number.isFinite(input.angle)) p.angle = input.angle;
    if (input.shoot) {
      const now = Date.now();
      if (now - (room.lastShot.get(socket.id) || 0) > 280) {
        room.lastShot.set(socket.id, now);
        room.bullets.push({
          owner: socket.id,
          x: p.x + Math.cos(p.angle) * 27,
          y: p.y + Math.sin(p.angle) * 27,
          vx: Math.cos(p.angle) * 10,
          vy: Math.sin(p.angle) * 10,
          life: 90
        });
      }
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    room.players.delete(socket.id);
    room.bullets = room.bullets.filter(b => b.owner !== socket.id);
    io.to(code).emit("opponentLeft");
    if (!room.players.size) rooms.delete(code);
    else broadcast(room);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.size === 2) {
      for (const b of room.bullets) {
        b.x += b.vx; b.y += b.vy; b.life--;
        for (const p of room.players.values()) {
          if (p.id !== b.owner && p.hp > 0 && Math.hypot(p.x - b.x, p.y - b.y) < 23) {
            p.hp = Math.max(0, p.hp - 20);
            b.life = 0;
            if (p.hp === 0) {
              const shooter = room.players.get(b.owner);
              if (shooter) shooter.score++;
              setTimeout(() => {
                const players = [...room.players.values()];
                players.forEach((pl, i) => resetPlayer(pl, i));
                room.bullets = [];
                broadcast(room);
              }, 1300);
            }
            break;
          }
        }
      }
      room.bullets = room.bullets.filter(b =>
        b.life > 0 && b.x > 0 && b.x < ARENA.w && b.y > 0 && b.y < ARENA.h
      );
      broadcast(room);
    }
  }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`DUEL ARENA online em http://localhost:${PORT}`));