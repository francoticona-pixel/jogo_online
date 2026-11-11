const socket = io({ transports: ["websocket", "polling"] });
const $ = id => document.getElementById(id);
const lobby = $("lobby"), gamePanel = $("gamePanel"), canvas = $("arena"), ctx = canvas.getContext("2d", { alpha: false });
let myId = null, myNumber = 0, roomCode = "";
let state = { players: [], bullets: [], crates: [], clones: [], explosions: [], status: "waiting" };
let roomInfo = { players: [], count: 0, maxPlayers: 10, hostId: null, started: false };
let mouse = { x: 800, y: 500 }, shooting = false;
const keys = Object.create(null);
const ARENA = { w: 1600, h: 1000 };
const ZOOM = 0.78;
let camera = { x: 800, y: 500 };
const renderedPlayers = new Map();
const renderedBullets = new Map();
const skinStyles = { classic:"#c5e36b", crimson:"#ff5268", ice:"#74d9ff", gold:"#f3c65f", toxic:"#8aff66" };
let selectedSkin="classic", selectedTheme="forest", selectedName="OPERADOR";
const powers = {
  rapid: { label: "TIRO RÁPIDO", icon: "»", color: "#f0bb62" },
  speed: { label: "VELOCIDADE", icon: "⚡", color: "#62c3dc" },
  triple: { label: "TIRO TRIPLO", icon: "⑂", color: "#d7a6f5" },
  shield: { label: "ESCUDO", icon: "◇", color: "#69d0a4" },
  invisibility: { label: "INVISIBILIDADE", icon: "◌", color: "#a6c9ff" },
  clone: { label: "CLONAGEM", icon: "⧉", color: "#c69cff" },
  bomb: { label: "BOMBA (3S)", icon: "✹", color: "#ff896c" },
  flame: { label: "LANÇA-CHAMAS", icon: "♨", color: "#ff713d" },
  medkit: { label: "KIT DE VIDA", icon: "+", color: "#ff6d87" },
  life: { label: "VIDA EXTRA", icon: "♥", color: "#ff4f72" }
};
const playerColors = ["#c5e36b", "#e46d5c", "#62c3dc", "#d7a6f5", "#f0bb62", "#69d0a4", "#f07caa", "#98a8ff", "#d6dfed", "#d2db70"];
const walls = [
  { x: 300, y: 200, w: 180, h: 55 }, { x: 1120, y: 200, w: 180, h: 55 },
  { x: 300, y: 745, w: 180, h: 55 }, { x: 1120, y: 745, w: 180, h: 55 },
  { x: 755, y: 350, w: 90, h: 300 }, { x: 155, y: 430, w: 90, h: 130 },
  { x: 1355, y: 430, w: 90, h: 130 }, { x: 600, y: 150, w: 400, h: 42 },
  { x: 600, y: 808, w: 400, h: 42 }, { x: 540, y: 445, w: 150, h: 75 },
  { x: 910, y: 480, w: 150, h: 75 }, { x: 520, y: 615, w: 120, h: 55 },
  { x: 960, y: 350, w: 120, h: 55 }
];
const mapCanvas = document.createElement("canvas");
mapCanvas.width = ARENA.w;
mapCanvas.height = ARENA.h;
const mapCtx = mapCanvas.getContext("2d");
function buildMap() {
  const palettes={forest:["#25382d","#101a17","#8c987e","#566b59","#293d32"],neon:["#211c3c","#080d20","#a76bff","#43336e","#17142b"],desert:["#57452d","#20170f","#d4ad6b","#997447","#4d3822"],ice:["#244457","#0d1c2a","#b6e7f4","#6897ae","#294b60"]};
  const palette=palettes[selectedTheme]||palettes.forest;
  const g = mapCtx.createLinearGradient(0, 0, ARENA.w, ARENA.h);
  g.addColorStop(0, palette[0]); g.addColorStop(1, palette[1]);
  mapCtx.fillStyle = g; mapCtx.fillRect(0, 0, ARENA.w, ARENA.h);
  mapCtx.strokeStyle = "rgba(161,190,160,.075)"; mapCtx.lineWidth = 1;
  for (let x = 0; x <= ARENA.w; x += 50) { mapCtx.beginPath(); mapCtx.moveTo(x,0); mapCtx.lineTo(x,ARENA.h); mapCtx.stroke(); }
  for (let y = 0; y <= ARENA.h; y += 50) { mapCtx.beginPath(); mapCtx.moveTo(0,y); mapCtx.lineTo(ARENA.w,y); mapCtx.stroke(); }
  for (const w of walls) {
    mapCtx.save(); mapCtx.shadowColor = "rgba(0,0,0,.5)"; mapCtx.shadowBlur = 18; mapCtx.shadowOffsetY = 9;
    const grad = mapCtx.createLinearGradient(w.x,w.y,w.x,w.y+w.h);
    grad.addColorStop(0,palette[2]); grad.addColorStop(.18,palette[3]); grad.addColorStop(1,palette[4]);
    mapCtx.fillStyle = grad; mapCtx.fillRect(w.x,w.y,w.w,w.h); mapCtx.restore();
    mapCtx.strokeStyle = selectedTheme==="neon"?"#c59cff":selectedTheme==="ice"?"#c7f2ff":selectedTheme==="desert"?"#f2d19a":"#a9b99c"; mapCtx.lineWidth = 3; mapCtx.strokeRect(w.x+1.5,w.y+1.5,w.w-3,w.h-3);
    mapCtx.strokeStyle = "rgba(10,20,15,.55)"; mapCtx.lineWidth = 2;
    for (let x=w.x+12;x<w.x+w.w-5;x+=28) { mapCtx.beginPath(); mapCtx.moveTo(x,w.y+7); mapCtx.lineTo(x,w.y+w.h-7); mapCtx.stroke(); }
  }
  mapCtx.strokeStyle = "rgba(197,227,107,.45)"; mapCtx.lineWidth = 4; mapCtx.setLineDash([16,14]);
  mapCtx.strokeRect(20,20,ARENA.w-40,ARENA.h-40); mapCtx.setLineDash([]);
}
buildMap();

$("skinSelect").addEventListener("change",e=>{selectedSkin=e.target.value;});
$("mapSelect").addEventListener("change",e=>{selectedTheme=e.target.value;buildMap();});
$("fullscreenBtn").addEventListener("click",async()=>{try{if(!document.fullscreenElement)await $("gamePanel").requestFullscreen();else await document.exitFullscreen();}catch{$("gameStatus").textContent="TELA CHEIA INDISPONÍVEL NESTE NAVEGADOR";}});
$("joinForm").addEventListener("submit", e => {
  e.preventDefault(); $("joinError").textContent = "";
  roomCode = $("roomCode").value.trim().toUpperCase();
  selectedName=($("playerName").value.trim()||"OPERADOR").slice(0,16);
  if (roomCode) socket.emit("joinRoom", {code:roomCode,name:selectedName,skin:selectedSkin});
});
socket.on("connect_error", () => { $("joinError").textContent = "Não foi possível conectar ao servidor. Atualize a página."; });
socket.on("joinError", msg => $("joinError").textContent = msg);
socket.on("startError", msg => { $("hostHint").textContent = msg; });
socket.on("joined", data => {
  myId = data.playerId; myNumber = data.playerNumber; roomCode = data.code;
  $("roomLabel").textContent = roomCode;
  $("playerLabel").textContent = selectedName;
  lobby.classList.add("hidden"); gamePanel.classList.remove("hidden"); startRender();
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
    tag.textContent = (p.name || ("OP "+String(p.number).padStart(2,"0"))) + (p.id === info.hostId ? " ★" : "");
    $("playersList").appendChild(tag);
  });
  const isHost = info.hostId === myId, start = $("startMatch");
  start.classList.toggle("hidden", !isHost);
  start.disabled = !isHost || count < 2 || info.started;
  $("hostHint").textContent = info.started ? "Partida em andamento." :
    (isHost ? "Você é o anfitrião. Comece com pelo menos 2 jogadores." : "Aguardando o anfitrião iniciar.");
  $("roomLobby").classList.toggle("hidden", info.started || info.status === "finished");
  $("waiting").classList.toggle("hidden", info.started || info.status === "finished");
});
socket.on("state", s => {
  state = s;
  $("gameStatus").textContent = s.status === "playing" ? s.players.filter(p => p.connected).length + " OPERADORES EM COMBATE" : s.status === "finished" ? "PARTIDA ENCERRADA" : "AGUARDANDO INÍCIO";
  const me = s.players.find(p => p.id === myId);
  if (me) {
    $("healthFill").style.width = me.hp + "%";
    $("healthText").textContent = me.lives > 0 ? Math.max(0,me.hp) + "%" : "ELIMINADO";
    $("livesText").textContent = String(me.lives);
    $("livesText").style.color = me.lives === 1 ? "#e46d5c" : "";
    const power = me.power && powers[me.power];
    $("powerHud").textContent = power ? power.label + "  " + Math.ceil(me.powerLeft / 1000) + "s" : "SEM PODER";
    $("powerHud").style.color = power ? power.color : "";
  }
  const scores = [...s.players].sort((a,b)=>b.score-a.score||b.lives-a.lives||a.number-b.number);
  $("scoreText").textContent = "ELIMINAÇÕES  " + scores.slice(0,3).map(p=>"OP"+p.number+" "+p.score).join("  •  ");
  if (s.status === "finished") showResults(s.rankings || []);
  else $("matchResult").classList.add("hidden");
});
function showResults(rankings) {
  $("matchResult").classList.remove("hidden");
  $("podiumList").innerHTML = "";
  const medals = ["🥇","🥈","🥉"];
  rankings.forEach((p,i)=>{
    const row=document.createElement("div"); row.className="podium-row rank-"+(i+1);
    const medal=document.createElement("strong"); medal.textContent=medals[i]||("#"+p.position);
    const name=document.createElement("span"); name.textContent=p.name||("OPERADOR "+String(p.number).padStart(2,"0"));
    const stats=document.createElement("small"); stats.textContent=p.score+" eliminações • "+p.lives+" vidas";
    row.append(medal,name,stats); $("podiumList").appendChild(row);
  });
  const champion=rankings[0];
  $("resultTitle").textContent=champion?.winner ? "VITÓRIA — "+(champion.name||"OPERADOR") : champion ? "TOP 1 — "+(champion.name||"OPERADOR") : "PARTIDA ENCERRADA";
}
$("returnLobby").addEventListener("click",()=>location.reload());
document.addEventListener("fullscreenchange",()=>{document.body.classList.toggle("playing-fullscreen",!!document.fullscreenElement);});
$("startMatch").addEventListener("click",()=>socket.emit("startGame"));
window.addEventListener("keydown",e=>{keys[e.key.toLowerCase()]=true;});
window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;});
canvas.addEventListener("mousemove",e=>{
  const rect=canvas.getBoundingClientRect();
  mouse.x=(e.clientX-rect.left)*canvas.width/rect.width;
  mouse.y=(e.clientY-rect.top)*canvas.height/rect.height;
});
canvas.addEventListener("mousedown",e=>{if(e.button===0)shooting=true;});
window.addEventListener("mouseup",()=>{shooting=false;});
$("copyCode").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(roomCode);$("copyCode").textContent="CÓDIGO COPIADO!";}
  catch{$("copyCode").textContent=roomCode;}
});

// Smaller input payload rate: 20 updates/s. Server remains authoritative at 30 simulation ticks/s.
setInterval(()=>{
  if(!myId||state.status!=="playing")return;
  const me=state.players.find(p=>p.id===myId);
  if(!me||!me.alive)return;
  const worldMouse=screenToWorld(mouse.x,mouse.y);
  socket.volatile.emit("input",{
    up:!!(keys.w||keys.arrowup),down:!!(keys.s||keys.arrowdown),
    left:!!(keys.a||keys.arrowleft),right:!!(keys.d||keys.arrowright),
    angle:Math.atan2(worldMouse.y-me.y,worldMouse.x-me.x),shoot:shooting
  });
},50);

function screenToWorld(x,y){
  return {x:(x-canvas.width/2)/ZOOM+camera.x,y:(y-canvas.height/2)/ZOOM+camera.y};
}
function drawCrates(){
  for(const crate of state.crates||[]){
    const p=powers[crate.type]||powers.rapid;
    ctx.save();ctx.translate(crate.x,crate.y);ctx.rotate(Math.sin(performance.now()/250)*.08);
    ctx.shadowColor=p.color;ctx.shadowBlur=24;ctx.fillStyle="#101a15";ctx.fillRect(-20,-20,40,40);
    ctx.shadowBlur=0;ctx.fillStyle=p.color;ctx.fillRect(-16,-16,32,32);
    ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.strokeRect(-16,-16,32,32);
    ctx.fillStyle="#17231c";ctx.font="bold 23px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(p.icon,0,1);ctx.restore();
    ctx.fillStyle=p.color;ctx.font="bold 13px monospace";ctx.textAlign="center";ctx.fillText(p.label,crate.x,crate.y-28);
  }
}
function drawPlayers(dt){
  for(const p of state.players){
    if(!p.connected||p.lives<=0||p.hp<=0)continue;
    if(p.invisible && p.id!==myId) continue;
    let r=renderedPlayers.get(p.id);
    if(!r){r={x:p.x,y:p.y,angle:p.angle};renderedPlayers.set(p.id,r);}
    const k=Math.min(.48,dt/75);
    r.x+=(p.x-r.x)*k;r.y+=(p.y-r.y)*k;
    let da=p.angle-r.angle;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;r.angle+=da*k;
    const color=skinStyles[p.skin]||playerColors[(p.number-1)%playerColors.length];
    const hidden=p.invisible&&p.id!==myId;
    ctx.save();ctx.translate(r.x,r.y);ctx.rotate(r.angle);
    ctx.globalAlpha=hidden ? 0.16 : 1;
    if(p.power==="shield"){ctx.strokeStyle=powers.shield.color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,27,0,Math.PI*2);ctx.stroke();}
    ctx.shadowColor=color;ctx.shadowBlur=hidden?3:17;
    ctx.fillStyle="#080d12";ctx.beginPath();ctx.roundRect(-21,-17,44,34,7);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-16,-12,31,24,5);ctx.fill();
    ctx.fillStyle="#17232b";ctx.fillRect(-7,-8,14,16);
    ctx.strokeStyle="rgba(255,255,255,.65)";ctx.lineWidth=2;ctx.strokeRect(-12,-9,7,18);ctx.strokeRect(2,-9,7,18);
    ctx.fillStyle="#d6e3e8";ctx.beginPath();ctx.roundRect(8,-5,27,10,3);ctx.fill();
    ctx.fillStyle="#fff1c2";ctx.fillRect(31,-2,7,4);
    ctx.fillStyle="rgba(255,255,255,.35)";ctx.fillRect(-14,-11,22,3);
    ctx.restore();
    ctx.globalAlpha=hidden ? 0.22 : 1;
    ctx.fillStyle="rgba(0,0,0,.6)";ctx.fillRect(r.x-25,r.y-38,50,6);
    ctx.fillStyle=color;ctx.fillRect(r.x-25,r.y-38,50*Math.max(0,p.hp/100),6);
    ctx.fillStyle="#f0f2e8";ctx.font="12px monospace";ctx.textAlign="center";
    ctx.fillText((p.name||("OP "+String(p.number).padStart(2,"0")))+(p.id===myId?" • VOCÊ":""),r.x,r.y-48);
    ctx.fillStyle="#e46d5c";ctx.font="bold 11px monospace";ctx.fillText("♥ "+p.lives,r.x,r.y+39);
    ctx.globalAlpha=1;
  }
}
function drawBullets(dt){
  const active = new Set();
  for(const b of state.bullets||[]){
    active.add(b.id);
    let r=renderedBullets.get(b.id);
    if(!r){r={x:b.x,y:b.y};renderedBullets.set(b.id,r);}
    const k=Math.min(.72,dt/55);
    r.x+=(b.x-r.x)*k;r.y+=(b.y-r.y)*k;
    ctx.save();ctx.translate(r.x,r.y);ctx.rotate(Math.atan2(b.vy,b.vx));
    const bomb=b.type==="bomb", flame=b.type==="flame";
    ctx.shadowColor=bomb?"#ff765c":flame?"#ff5a24":"#ffe49a";ctx.shadowBlur=bomb?22:flame?20:15;
    ctx.strokeStyle=bomb?"#ff8c68":flame?"#ff6b32":"#fff4c7";ctx.lineWidth=bomb?8:flame?10:4;
    ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(7,0);ctx.stroke();
    ctx.fillStyle=bomb?"#ff5d43":flame?"#ffd15a":"#f2c96b";ctx.beginPath();ctx.arc(0,0,bomb?7:flame?8:4,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  for(const id of renderedBullets.keys()) if(!active.has(id)) renderedBullets.delete(id);
}
function drawClones(){
  for(const c of state.clones||[]){
    ctx.save();ctx.globalAlpha=.62;ctx.translate(c.x,c.y);ctx.rotate(c.angle);
    ctx.strokeStyle="#c69cff";ctx.lineWidth=3;ctx.setLineDash([5,4]);ctx.strokeRect(-20,-16,40,32);ctx.setLineDash([]);
    ctx.fillStyle="#c69cff";ctx.fillRect(-13,-10,26,20);ctx.fillStyle="#20202d";ctx.fillRect(8,-5,23,10);
    ctx.restore();
  }
}
function drawExplosions(){
  for(const e of state.explosions||[]){
    const progress=1-e.remaining/520, radius=e.radius*progress;
    ctx.save();ctx.globalAlpha=Math.max(0,e.remaining/520);
    const g=ctx.createRadialGradient(e.x,e.y,8,e.x,e.y,Math.max(10,radius));
    g.addColorStop(0,"rgba(255,245,180,.95)");g.addColorStop(.35,"rgba(255,135,75,.7)");g.addColorStop(1,"rgba(255,75,45,0)");
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(e.x,e.y,radius,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}
let previousFrame=performance.now(), rendering=false;
function startRender(){
  if(rendering)return;
  rendering=true;previousFrame=performance.now();
  requestAnimationFrame(draw);
}
function draw(){
  if(gamePanel.classList.contains("hidden")){rendering=false;return;}
  const now=performance.now(),dt=Math.min(40,now-previousFrame);previousFrame=now;
  const me=state.players.find(p=>p.id===myId);
  if(me&&me.connected){
    const viewW=canvas.width/ZOOM, viewH=canvas.height/ZOOM;
    const targetX=Math.max(viewW/2,Math.min(ARENA.w-viewW/2,me.x));
    const targetY=Math.max(viewH/2,Math.min(ARENA.h-viewH/2,me.y));
    camera.x+=(targetX-camera.x)*.14;camera.y+=(targetY-camera.y)*.14;
  } else if(!myId){camera.x+=(800-camera.x)*.08;camera.y+=(500-camera.y)*.08;}
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle="#101a17";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(ZOOM,0,0,ZOOM,canvas.width/2-camera.x*ZOOM,canvas.height/2-camera.y*ZOOM);
  ctx.drawImage(mapCanvas,0,0);
  if(state.gas && state.gas.remaining>0){ctx.save();ctx.fillStyle="rgba(144,205,83,.23)";ctx.beginPath();ctx.rect(0,0,ARENA.w,ARENA.h);ctx.arc(state.gas.x,state.gas.y,state.gas.radius,0,Math.PI*2,true);ctx.fill("evenodd");ctx.strokeStyle="rgba(188,235,110,.9)";ctx.lineWidth=8;ctx.beginPath();ctx.arc(state.gas.x,state.gas.y,state.gas.radius,0,Math.PI*2);ctx.stroke();ctx.restore();}
  drawCrates();drawClones();drawExplosions();drawBullets(dt);drawPlayers(dt);
  ctx.setTransform(1,0,0,1,0,0);
  if(state.status!=="finished") requestAnimationFrame(draw);
  else rendering=false;
}
