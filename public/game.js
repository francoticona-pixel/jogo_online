const socket = io();
const $ = id => document.getElementById(id);
const lobby = $("lobby"), gamePanel = $("gamePanel"), canvas = $("arena"), ctx = canvas.getContext("2d");
let myId = null, myNumber = 0, roomCode = "", state = {players:[],bullets:[],status:"waiting"};
let mouse = {x:500,y:310}, shooting = false;
const keys = {};
const obstacles = [
  [300,130,100,34],[600,130,100,34],[300,450,100,34],[600,450,100,34],
  [470,250,60,120],[120,280,55,55],[825,280,55,55]
];

$("joinForm").addEventListener("submit", e => {
  e.preventDefault(); $("joinError").textContent = "";
  roomCode = $("roomCode").value.trim().toUpperCase();
  if (roomCode) socket.emit("joinRoom", roomCode);
});
socket.on("joinError", msg => $("joinError").textContent = msg);
socket.on("joined", data => {
  myId = data.playerId; myNumber = data.playerNumber; roomCode = data.code;
  $("roomLabel").textContent = roomCode; $("playerLabel").textContent = "JOGADOR " + myNumber;
  lobby.classList.add("hidden"); gamePanel.classList.remove("hidden");
});
socket.on("state", s => {
  state = s;
  $("waiting").classList.toggle("hidden", s.status === "playing");
  $("gameStatus").textContent = s.status === "playing" ? "COMBATE EM ANDAMENTO" : "AGUARDANDO OPONENTE";
  const me = s.players.find(p=>p.id===myId);
  if (me) { $("healthFill").style.width = me.hp+"%"; $("healthText").textContent=me.hp+"%"; }
  const sorted = [...s.players].sort((a,b)=>a.id.localeCompare(b.id));
  $("scoreText").textContent = "PLACAR  " + sorted.map(p=>p.score).join(" — ");
});
socket.on("opponentLeft", () => { $("waiting").classList.remove("hidden"); $("waiting").querySelector("strong").textContent="OPONENTE DESCONECTOU"; });

window.addEventListener("keydown",e=>{keys[e.key.toLowerCase()]=true;});
window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;});
canvas.addEventListener("mousemove",e=>{
  const r=canvas.getBoundingClientRect(); mouse.x=(e.clientX-r.left)*canvas.width/r.width; mouse.y=(e.clientY-r.top)*canvas.height/r.height;
});
canvas.addEventListener("mousedown",e=>{if(e.button===0) shooting=true;});
window.addEventListener("mouseup",()=>shooting=false);
$("copyCode").addEventListener("click", async ()=>{
  try { await navigator.clipboard.writeText(roomCode); $("copyCode").textContent="CÓDIGO COPIADO!"; }
  catch { $("copyCode").textContent=roomCode; }
});

setInterval(()=>{
  if (!myId || state.status!=="playing") return;
  const me=state.players.find(p=>p.id===myId); if(!me)return;
  socket.emit("input",{
    up:keys.w||keys.arrowup,down:keys.s||keys.arrowdown,
    left:keys.a||keys.arrowleft,right:keys.d||keys.arrowright,
    angle:Math.atan2(mouse.y-me.y,mouse.x-me.x),shoot:shooting
  });
},1000/30);

function draw(){
  ctx.clearRect(0,0,1000,620);
  ctx.fillStyle="#283528";ctx.fillRect(0,0,1000,620);
  ctx.strokeStyle="#354534";ctx.lineWidth=1;
  for(let x=0;x<1000;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,620);ctx.stroke();}
  for(let y=0;y<620;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke();}
  // Marcações da arena
  ctx.strokeStyle="#718067";ctx.setLineDash([8,10]);ctx.strokeRect(18,18,964,584);ctx.setLineDash([]);
  obstacles.forEach(([x,y,w,h])=>{
    ctx.fillStyle="#59604b";ctx.fillRect(x,y,w,h);
    ctx.fillStyle="#778064";ctx.fillRect(x,y,w,5);
    ctx.strokeStyle="#222b22";ctx.strokeRect(x,y,w,h);
    for(let k=10;k<w;k+=22){ctx.fillStyle="#303b30";ctx.fillRect(x+k,y+12,10,5);}
  });
  state.bullets.forEach(b=>{ctx.fillStyle="#f5d77a";ctx.shadowColor="#f5d77a";ctx.shadowBlur=12;ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;});
  state.players.forEach(p=>{
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.fillStyle="#111711";ctx.fillRect(-17,-14,35,28);
    ctx.fillStyle=p.id===myId?"#c5e36b":"#d16b58";ctx.fillRect(-14,-12,26,24);
    ctx.fillStyle="#222a20";ctx.fillRect(-3,-7,26,8);
    ctx.fillStyle="#aeb69d";ctx.fillRect(13,-5,20,4);
    ctx.restore();
    ctx.fillStyle="#0d120e";ctx.fillRect(p.x-22,p.y-28,44,5);
    ctx.fillStyle=p.id===myId?"#c5e36b":"#d16b58";ctx.fillRect(p.x-22,p.y-28,44*p.hp/100,5);
    ctx.font="10px monospace";ctx.textAlign="center";ctx.fillStyle="#edf1e8";ctx.fillText(p.id===myId?"VOCÊ":"OPONENTE",p.x,p.y-36);
  });
  requestAnimationFrame(draw);
}
draw();