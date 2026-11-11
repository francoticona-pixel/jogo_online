const socket = io();
const $ = id => document.getElementById(id);
const lobby = $("lobby"), gamePanel = $("gamePanel"), canvas = $("arena"), ctx = canvas.getContext("2d");
let myId = null, myNumber = 0, roomCode = "";
let state = { players: [], bullets: [], crates: [], status: "waiting" };
let roomInfo = { players: [], count: 0, maxPlayers: 10, hostId: null, started: false };
let mouse = { x: 500, y: 310 }, shooting = false;
const keys = {};
const walls = [
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
const playerColors = ["#c5e36b", "#e46d5c", "#62c3dc", "#d7a6f5", "#f0bb62", "#69d0a4", "#f07caa", "#98a8ff", "#d6dfed", "#d2db70"];
const powers = {
  rapid: { label: "TIRO RÁPIDO", icon: "»", color: "#f0bb62" },
  speed: { label: "VELOCIDADE", icon: "⚡", color: "#62c3dc" },
  triple: { label: "TIRO TRIPLO", icon: "⑂", color: "#d7a6f5" },
  shield: { label: "ESCUDO", icon: "◇", color: "#69d0a4" }
};

$("joinForm").addEventListener("submit", e => {
  e.preventDefault();
  $("joinError").textContent = "";
  roomCode = $("roomCode").value.trim().toUpperCase();
  if (roomCode) socket.emit("joinRoom", roomCode);
});
socket.on("joinError", msg => $("joinError").textContent = msg);
socket.on("startError", msg => { $("hostHint").textContent = msg; });
socket.on("joined", data => {
  myId = data.playerId;
  myNumber = data.playerNumber;
  roomCode = data.code;
  $("roomLabel").textContent = roomCode;
  $("playerLabel").textContent = "OPERADOR " + String(myNumber).padStart(2, "0");
  lobby.classList.add("hidden");
  gamePanel.classList.remove("hidden");
});
socket.on("roomInfo", info => {
  roomInfo = info;
  const count = info.count || 0;
  $("roomLobbyCount").textContent = count + " / " + info.maxPlayers + " OPERADORES";
  $("roomLobbyHelp").textContent = count >= info.maxPlayers ? "Sala cheia. O anfitrião já pode começar." : "Convide seus amigos usando o código " + info.code + ".";
  $("playersList").innerHTML = "";
  info.players.forEach(p => {
    const tag = document.createElement("span");
    tag.className = "player-chip" + (p.id === info.hostId ? " host" : "");
    tag.textContent = "OP " + String(p.number).padStart(2, "0") + (p.id === info.hostId ? " ★" : "");
    $("playersList").appendChild(tag);
  });
  const isHost = info.hostId === myId;
  const start = $("startMatch");
  start.classList.toggle("hidden", !isHost);
  start.disabled = !isHost || count < 2 || info.started;
  $("hostHint").textContent = info.started
    ? "Partida em andamento."
    : (isHost ? "Você é o anfitrião. Comece quando houver pelo menos 2 jogadores." : "Aguardando o anfitrião iniciar a partida.");
  $("roomLobby").classList.toggle("hidden", info.started);
  $("waiting").classList.toggle("hidden", info.started);
});
socket.on("state", s => {
  state = s;
  $("gameStatus").textContent = s.status === "playing" ? s.players.length + " OPERADORES EM COMBATE" : "AGUARDANDO INÍCIO";
  const me = s.players.find(p => p.id === myId);
  if (me) {
    $("healthFill").style.width = me.hp + "%";
    $("healthText").textContent = me.alive ? me.hp + "%" : "REAPARECENDO";
    const power = me.power && powers[me.power];
    $("powerHud").textContent = power ? power.label + "  " + Math.ceil(me.powerLeft / 1000) + "s" : "SEM PODER";
    $("powerHud").style.color = power ? power.color : "";
  }
  const scores = [...s.players].sort((a, b) => b.score - a.score || a.number - b.number);
  $("scoreText").textContent = "TOP  " + scores.slice(0, 3).map(p => "OP" + p.number + " " + p.score).join("  •  ");
});
socket.on("opponentLeft", () => {
  $("waiting").classList.remove("hidden");
  $("waiting").querySelector("strong").textContent = "JOGADOR DESCONECTOU";
});
$("startMatch").addEventListener("click", () => socket.emit("startGame"));

window.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});
canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * canvas.width / r.width;
  mouse.y = (e.clientY - r.top) * canvas.height / r.height;
});
canvas.addEventListener("mousedown", e => { if (e.button === 0) shooting = true; });
window.addEventListener("mouseup", () => { shooting = false; });
$("copyCode").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    $("copyCode").textContent = "CÓDIGO COPIADO!";
  } catch {
    $("copyCode").textContent = roomCode;
  }
});

setInterval(() => {
  if (!myId || state.status !== "playing") return;
  const me = state.players.find(p => p.id === myId);
  if (!me || !me.alive) return;
  socket.emit("input", {
    up: keys.w || keys.arrowup,
    down: keys.s || keys.arrowdown,
    left: keys.a || keys.arrowleft,
    right: keys.d || keys.arrowright,
    angle: Math.atan2(mouse.y - me.y, mouse.x - me.x),
    shoot: shooting
  });
}, 1000 / 30);

function drawFloor() {
  const grad = ctx.createLinearGradient(0, 0, 1000, 620);
  grad.addColorStop(0, "#26362e");
  grad.addColorStop(1, "#18251f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1000, 620);
  ctx.strokeStyle = "rgba(161,190,160,.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1000; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 620); ctx.stroke();
  }
  for (let y = 0; y <= 620; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(197,227,107,.4)";
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 10]);
  ctx.strokeRect(18, 18, 964, 584);
  ctx.setLineDash([]);
  const glow = ctx.createRadialGradient(500, 310, 80, 500, 310, 500);
  glow.addColorStop(0, "rgba(95,130,94,.08)");
  glow.addColorStop(1, "rgba(0,0,0,.23)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1000, 620);
}
function drawWalls() {
  walls.forEach((w, index) => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 7;
    const grad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
    grad.addColorStop(0, "#89927d");
    grad.addColorStop(.15, "#596a58");
    grad.addColorStop(1, "#293b32");
    ctx.fillStyle = grad;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.restore();
    ctx.strokeStyle = "#a8b69a";
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    ctx.strokeStyle = "rgba(10,20,15,.55)";
    ctx.lineWidth = 1;
    for (let x = w.x + 9; x < w.x + w.w - 5; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, w.y + 7); ctx.lineTo(x, w.y + w.h - 7); ctx.stroke();
    }
    ctx.fillStyle = index % 2 ? "rgba(215,231,192,.18)" : "rgba(0,0,0,.13)";
    ctx.fillRect(w.x + 5, w.y + 5, w.w - 10, 4);
    ctx.fillStyle = "rgba(10,18,14,.55)";
    ctx.fillRect(w.x + 7, w.y + w.h - 7, w.w - 14, 3);
  });
}
function drawCrates() {
  (state.crates || []).forEach(crate => {
    const p = powers[crate.type] || powers.rapid;
    ctx.save();
    ctx.translate(crate.x, crate.y);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#101a15";
    ctx.fillRect(-15, -15, 30, 30);
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.color;
    ctx.fillRect(-12, -12, 24, 24);
    ctx.strokeStyle = "#f3f4db";
    ctx.lineWidth = 2;
    ctx.strokeRect(-12, -12, 24, 24);
    ctx.fillStyle = "#17231c";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.icon, 0, 1);
    ctx.restore();
    ctx.fillStyle = p.color;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.label, crate.x, crate.y - 22);
  });
}
function drawBullets() {
  (state.bullets || []).forEach(b => {
    const angle = Math.atan2(b.vy || 0, b.vx || 1);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    ctx.shadowColor = "#ffe49a";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "#fff4c7";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(5, 0); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f2c96b";
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}
function drawPlayer(p) {
  if (!p.alive) return;
  const color = playerColors[(p.number - 1) % playerColors.length];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#0a120e";
  ctx.fillRect(-18, -15, 38, 30);
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillRect(-14, -12, 27, 24);
  ctx.fillStyle = "#1c2b24";
  ctx.fillRect(-7, -8, 12, 16);
  ctx.fillStyle = "#d6ddca";
  ctx.fillRect(7, -5, 23, 10);
  ctx.fillStyle = "#fff1c2";
  ctx.fillRect(26, -2, 8, 4);
  ctx.restore();

  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(p.x - 21, p.y - 30, 42, 5);
  ctx.fillStyle = color;
  ctx.fillRect(p.x - 21, p.y - 30, 42 * Math.max(0, p.hp / 100), 5);
  ctx.fillStyle = "#e8eee5";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("OP " + String(p.number).padStart(2, "0") + (p.id === myId ? " • VOCÊ" : ""), p.x, p.y - 37);
  if (p.power && powers[p.power]) {
    ctx.strokeStyle = powers[p.power].color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.stroke();
  }
}
function draw() {
  drawFloor();
  drawWalls();
  drawCrates();
  drawBullets();
  state.players.forEach(drawPlayer);
  requestAnimationFrame(draw);
}
draw();