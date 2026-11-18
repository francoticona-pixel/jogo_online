const socket = io({ transports: ["websocket", "polling"] });
const $ = id => document.getElementById(id);
const lobby = $("lobby"), gamePanel = $("gamePanel"), canvas = $("arena"), ctx = canvas.getContext("2d", { alpha: false });
let myId = null, myNumber = 0, roomCode = "";
let state = { players: [], bullets: [], crates: [], clones: [], explosions: [], status: "waiting" };
let roomInfo = { players: [], count: 0, maxPlayers: 10, hostId: null, started: false };
let mouse = { x: 800, y: 500 }, shooting = false;
let audioContext=null,lastShotSound=0,lastPowerSound=null,lastWinnerSound=false,lastExplosionCount=0;
function playTone(freq=440,duration=.09,type="sine",volume=.035){
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioContext=audioContext||new AC();if(audioContext.state==="suspended")audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audioContext.currentTime);gain.gain.setValueAtTime(volume,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch{}
}
function playSound(kind){if(kind==="shot")playTone(150,.045,"square",.012);if(kind==="power"){playTone(520,.09,"sine",.04);setTimeout(()=>playTone(780,.13,"sine",.035),75);}if(kind==="explosion"){playTone(85,.24,"sawtooth",.05);}if(kind==="win"){playTone(523,.15,"triangle",.05);setTimeout(()=>playTone(659,.15,"triangle",.05),130);setTimeout(()=>playTone(784,.28,"triangle",.05),260);}if(kind==="flame")playTone(95,.06,"sawtooth",.012);}
const keys = Object.create(null);
const ARENA = { w: 2000, h: 1300 };
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
  medkit: { label: "KIT DE CURA", icon: "+", color: "#ff6d87" },
  life: { label: "VIDA EXTRA", icon: "♥", color: "#ff4f72" },
  rocket: { label: "MÍSSIL EXPLOSIVO", icon: "➤", color: "#ff9a52" },
  armor: { label: "BLINDAGEM", icon: "⬟", color: "#8bc7d9" },
  blackhole: { label: "BURACO NEGRO • 1 TIRO", icon: "✹", color: "#b58cff" },
  phase: { label: "FANTASMA", icon: "◈", color: "#7ee7ff" },
  electric: { label: "CHOQUE ELÉTRICO", icon: "ϟ", color: "#ffe45e" },
  blades: { label: "LÂMINAS ORBITAIS", icon: "✥", color: "#e4e8f0" },
  timeStop: { label: "PARAR O TEMPO", icon: "◷", color: "#9cb7ff" }
};
const playerColors = ["#c5e36b", "#e46d5c", "#62c3dc", "#d7a6f5", "#f0bb62", "#69d0a4", "#f07caa", "#98a8ff", "#d6dfed", "#d2db70"];
const walls = [
  { x: 300, y: 300, w: 105, h: 105 }, { x: 770, y: 250, w: 135, h: 95 },
  { x: 1510, y: 300, w: 115, h: 115 }, { x: 420, y: 850, w: 150, h: 90 },
  { x: 970, y: 250, w: 95, h: 175 }, { x: 1390, y: 780, w: 155, h: 100 },
  { x: 1700, y: 950, w: 110, h: 110 }, { x: 220, y: 650, w: 110, h: 150 },
  { x: 650, y: 570, w: 125, h: 100 }, { x: 1220, y: 500, w: 130, h: 105 },
  { x: 920, y: 900, w: 160, h: 90 }, { x: 1660, y: 560, w: 100, h: 145 },
  { x: 560, y: 180, w: 90, h: 95 }, { x: 1120, y: 1080, w: 115, h: 90 }
];
const mapCanvas = document.createElement("canvas");
mapCanvas.width = ARENA.w;
mapCanvas.height = ARENA.h;
const mapCtx = mapCanvas.getContext("2d");
function buildMap() {
  const palettes = {
    forest: ["#91bd59","#355f3d","#d5e88a","#4e874b"],
    jungle: ["#4cae62","#164b3b","#b8dc68","#287b68"],
    ice: ["#d9f5ff","#579fc9","#ffffff","#83d7ed"],
    tundra: ["#eaf7f8","#83b9ca","#ffffff","#628fa8"],
    desert: ["#f6d28a","#c87942","#ffe8ae","#a95b35"],
    volcano: ["#65434b","#211e2b","#ffad4f","#a83e32"],
    city: ["#8196a8","#354b61","#d1e3e8","#293b50"],
    neon: ["#44336f","#171b3d","#ff68d9","#42eaff"]
  };
  const p = palettes[selectedTheme] || palettes.forest;
  const grad = mapCtx.createLinearGradient(0,0,ARENA.w,ARENA.h);
  grad.addColorStop(0,p[0]); grad.addColorStop(1,p[1]);
  mapCtx.fillStyle=grad; mapCtx.fillRect(0,0,ARENA.w,ARENA.h);

  const ellipse=(x,y,rx,ry,color,rotation=0)=>{
    mapCtx.fillStyle=color; mapCtx.beginPath(); mapCtx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2); mapCtx.fill();
  };
  const rounded=(x,y,w,h,r,color,stroke)=>{
    mapCtx.beginPath(); mapCtx.roundRect(x,y,w,h,r); mapCtx.fillStyle=color; mapCtx.fill();
    if(stroke){mapCtx.strokeStyle=stroke;mapCtx.lineWidth=4;mapCtx.stroke();}
  };
  const tree=(x,y,scale=1)=>{
    ellipse(x+5*scale,y+17*scale,24*scale,12*scale,"rgba(15,35,20,.25)");
    mapCtx.fillStyle="#765034";mapCtx.fillRect(x-6*scale,y-2*scale,12*scale,25*scale);
    for(const [ox,oy,r,c] of [[-13,-8,20,"#1d6939"],[10,-13,23,"#348b43"],[0,-28,20,"#6ab84b"],[0,-7,15,"#83c957"]]){
      ellipse(x+ox*scale,y+oy*scale,r*scale,r*scale,c);
    }
    ellipse(x-8*scale,y-31*scale,5*scale,3*scale,"rgba(235,255,170,.5)");
  };
  const pine=(x,y,scale=1)=>{
    ellipse(x,y+16*scale,17*scale,7*scale,"rgba(25,55,85,.18)");
    mapCtx.fillStyle="#765b43";mapCtx.fillRect(x-4*scale,y+1*scale,8*scale,18*scale);
    for(let k=0;k<3;k++){
      mapCtx.beginPath();mapCtx.moveTo(x,y-35*scale+k*13*scale);
      mapCtx.lineTo(x-19*scale+k*3*scale,y+8*scale-k*5*scale);
      mapCtx.lineTo(x+19*scale-k*3*scale,y+8*scale-k*5*scale);
      mapCtx.closePath();mapCtx.fillStyle=["#176b72","#238b91","#48b4ae"][k];mapCtx.fill();
    }
    mapCtx.strokeStyle="rgba(240,255,255,.65)";mapCtx.lineWidth=3;
    mapCtx.beginPath();mapCtx.moveTo(x,y-30*scale);mapCtx.lineTo(x-9*scale,y-7*scale);mapCtx.stroke();
  };
  const cactus=(x,y,scale=1)=>{
    rounded(x-7*scale,y-28*scale,14*scale,57*scale,7*scale,"#38894d","#22663c");
    rounded(x-22*scale,y-12*scale,13*scale,29*scale,6*scale,"#4da95b","#22663c");
    rounded(x+9*scale,y-22*scale,13*scale,31*scale,6*scale,"#4da95b","#22663c");
    mapCtx.fillStyle="#d7ef9a";for(let i=0;i<5;i++)mapCtx.fillRect(x-2*scale,y-19*scale+i*9*scale,2*scale,3*scale);
  };
  const rock=(x,y,scale=1,base="#9c7956",light="#d5b58a")=>{
    mapCtx.beginPath();mapCtx.moveTo(x-30*scale,y+17*scale);mapCtx.lineTo(x-23*scale,y-12*scale);
    mapCtx.lineTo(x-4*scale,y-28*scale);mapCtx.lineTo(x+18*scale,y-20*scale);
    mapCtx.lineTo(x+31*scale,y+12*scale);mapCtx.closePath();mapCtx.fillStyle=base;mapCtx.fill();
    mapCtx.beginPath();mapCtx.moveTo(x-23*scale,y-12*scale);mapCtx.lineTo(x-4*scale,y-28*scale);
    mapCtx.lineTo(x+18*scale,y-20*scale);mapCtx.lineTo(x+3*scale,y-5*scale);mapCtx.closePath();mapCtx.fillStyle=light;mapCtx.fill();
  };
  const penguin=(x,y,scale=1)=>{
    ellipse(x,y+8*scale,12*scale,17*scale,"#1d3447");
    ellipse(x,y+8*scale,7*scale,12*scale,"#f4fbff");
    ellipse(x-4*scale,y-3*scale,2*scale,2*scale,"#fff");
    mapCtx.fillStyle="#ffb94d";mapCtx.beginPath();mapCtx.moveTo(x+7*scale,y+1*scale);mapCtx.lineTo(x+17*scale,y+5*scale);mapCtx.lineTo(x+7*scale,y+8*scale);mapCtx.fill();
    rounded(x-9*scale,y+22*scale,7*scale,4*scale,2*scale,"#ffb94d");
    rounded(x+2*scale,y+22*scale,7*scale,4*scale,2*scale,"#ffb94d");
  };

  // Chão e detalhes de terreno: a arena fica mais clara e colorida, sem grade pesada.
  mapCtx.fillStyle="rgba(255,255,255,.07)";mapCtx.fillRect(34,34,ARENA.w-68,ARENA.h-68);
  if(selectedTheme==="forest" || selectedTheme==="jungle"){
    for(let i=0;i<65;i++){
      const x=70+(i*173)%1860,y=60+(i*257)%1180;
      ellipse(x,y,28+(i%4)*9,13+(i%3)*5,i%2?"rgba(183,222,102,.18)":"rgba(20,82,47,.16)",i*.13);
    }
    // Clareiras e trilhas de terra
    mapCtx.strokeStyle=selectedTheme==="jungle"?"#b2a85b":"#c3ad72";mapCtx.lineWidth=54;mapCtx.lineCap="round";
    mapCtx.beginPath();mapCtx.moveTo(0,650);mapCtx.bezierCurveTo(420,520,610,800,1000,650);mapCtx.bezierCurveTo(1370,500,1640,760,2000,600);mapCtx.stroke();
    mapCtx.strokeStyle="rgba(255,230,157,.34)";mapCtx.lineWidth=7;mapCtx.stroke();
    // Lagoas pequenas nas bordas
    for(const [x,y,rx,ry] of [[130,1090,95,54],[1840,220,100,58]]){
      ellipse(x,y,rx+10,ry+10,"#8a7047");ellipse(x,y,rx,ry,selectedTheme==="jungle"?"#31b9a0":"#48b9c5");
      ellipse(x-20,y-12,rx*.45,ry*.2,"rgba(220,255,235,.35)");
    }
    for(let i=0;i<26;i++){const x=(i*271+80)%1900,y=(i*193+70)%1120;if(walls.some(w=>x>w.x-90&&x<w.x+w.w+90&&y>w.y-80&&y<w.y+w.h+80))continue;tree(x,y,.65+(i%3)*.16);}
    if(selectedTheme==="jungle"){
      mapCtx.strokeStyle="rgba(223,205,92,.7)";mapCtx.lineWidth=7;
      for(let i=0;i<10;i++){const x=80+i*200;mapCtx.beginPath();mapCtx.moveTo(x,0);mapCtx.quadraticCurveTo(x+80,240,x-20,430);mapCtx.stroke();}
      for(let i=0;i<12;i++){const x=(i*149)%1900,y=100+(i*227)%1050;ellipse(x,y,10,7,"#ed6f8e");ellipse(x+9,y+4,7,5,"#f4c84d");}
    }
  }else if(selectedTheme==="ice" || selectedTheme==="tundra"){
    // Placas de gelo, neve e lago congelado
    for(let i=0;i<55;i++){const x=(i*197)%2000,y=(i*283)%1300;ellipse(x,y,42+(i%4)*15,13+(i%3)*8,i%2?"rgba(255,255,255,.45)":"rgba(68,160,205,.2)",i*.17);}
    for(const [x,y,rx,ry] of [[430,660,180,105],[1510,330,145,85],[1510,1010,170,95]]){
      ellipse(x,y,rx+15,ry+12,"#397fba");ellipse(x,y,rx,ry,"#68c9e8");ellipse(x-25,y-22,rx*.55,ry*.23,"rgba(255,255,255,.48)");
      mapCtx.strokeStyle="rgba(255,255,255,.65)";mapCtx.lineWidth=5;mapCtx.beginPath();mapCtx.moveTo(x-rx*.4,y);mapCtx.lineTo(x-10,y-ry*.3);mapCtx.lineTo(x+rx*.25,y+ry*.2);mapCtx.stroke();
    }
    for(let i=0;i<19;i++){const x=70+(i*317)%1850,y=70+(i*211)%1150;if(walls.some(w=>x>w.x-65&&x<w.x+w.w+65&&y>w.y-65&&y<w.y+w.h+65))continue;pine(x,y,.65+(i%3)*.15);}
    for(const [x,y] of [[1800,1120],[1880,1180],[1940,1080],[1700,1200],[1600,1140]])penguin(x,y,.85);
    // Cristais azuis
    for(let i=0;i<16;i++){const x=(i*227+90)%1900,y=(i*163+90)%1150;mapCtx.beginPath();mapCtx.moveTo(x,y-24);mapCtx.lineTo(x+13,y+8);mapCtx.lineTo(x,y+20);mapCtx.lineTo(x-12,y+8);mapCtx.closePath();mapCtx.fillStyle=i%2?"#6bdcff":"#a5f0ff";mapCtx.fill();mapCtx.strokeStyle="#eaffff";mapCtx.stroke();}
  }else if(selectedTheme==="desert"){
    for(let i=0;i<48;i++){const x=(i*191)%2000,y=(i*277)%1300;ellipse(x,y,90+(i%4)*22,19+(i%3)*8,i%2?"rgba(255,232,166,.22)":"rgba(150,82,43,.13)",i*.12);}
    // Dunas onduladas
    mapCtx.strokeStyle="rgba(255,229,164,.34)";mapCtx.lineWidth=28;
    for(let i=0;i<7;i++){mapCtx.beginPath();mapCtx.moveTo(-50,i*210+80);mapCtx.bezierCurveTo(500,i*210-80,1200,i*210+180,2050,i*210+20);mapCtx.stroke();}
    // Oásis
    ellipse(1680,930,145,88,"#a85d37");ellipse(1680,922,128,72,"#26a9ad");ellipse(1645,900,55,18,"rgba(218,255,225,.4)");
    for(let i=0;i<22;i++){const x=70+(i*293)%1850,y=60+(i*191)%1160;if(walls.some(w=>x>w.x-70&&x<w.x+w.w+70&&y>w.y-70&&y<w.y+w.h+70))continue;if(i%3===0)cactus(x,y,.7+(i%2)*.2);else rock(x,y,.6+(i%3)*.2,"#a96c42","#e3ae68");}
    for(let i=0;i<15;i++){const x=(i*239)%1900,y=(i*179)%1200;ellipse(x,y,5,3,"#fff0bf");}
  }else if(selectedTheme==="volcano"){
    // Rocha escura com rios de lava bem vivos
    for(let i=0;i<60;i++){const x=(i*173)%2000,y=(i*251)%1300;rock(x,y,.55+(i%3)*.18,"#47313b","#73505a");}
    mapCtx.lineCap="round";mapCtx.strokeStyle="#8f2d27";mapCtx.lineWidth=46;
    mapCtx.beginPath();mapCtx.moveTo(0,250);mapCtx.bezierCurveTo(420,450,520,80,900,290);mapCtx.bezierCurveTo(1300,520,1500,200,2000,360);mapCtx.stroke();
    mapCtx.beginPath();mapCtx.moveTo(200,1300);mapCtx.bezierCurveTo(500,980,820,1150,1050,900);mapCtx.bezierCurveTo(1400,620,1600,1050,2000,850);mapCtx.stroke();
    mapCtx.strokeStyle="#ff7138";mapCtx.lineWidth=22;mapCtx.stroke();
    mapCtx.strokeStyle="#ffd36b";mapCtx.lineWidth=7;mapCtx.stroke();
    for(const [x,y,r] of [[350,380,78],[1080,700,62],[1680,280,85],[1550,1080,70]]){const lg=mapCtx.createRadialGradient(x,y,4,x,y,r);lg.addColorStop(0,"#fff2a0");lg.addColorStop(.35,"#ff8a37");lg.addColorStop(1,"rgba(255,70,30,0)");mapCtx.fillStyle=lg;mapCtx.beginPath();mapCtx.arc(x,y,r,0,Math.PI*2);mapCtx.fill();}
    for(let i=0;i<28;i++){const x=(i*227)%1950,y=(i*167)%1220;ellipse(x,y,3+(i%4)*2,3+(i%3)*2,"#ffcb6b");}
  }else if(selectedTheme==="city"){
    // Asfalto, avenidas e faixas de pedestres
    mapCtx.fillStyle="#39495b";mapCtx.fillRect(0,0,ARENA.w,ARENA.h);
    mapCtx.fillStyle="#52657a";mapCtx.fillRect(0,0,ARENA.w,ARENA.h);
    mapCtx.strokeStyle="#34465a";mapCtx.lineWidth=118;mapCtx.beginPath();mapCtx.moveTo(0,650);mapCtx.lineTo(2000,650);mapCtx.moveTo(1000,0);mapCtx.lineTo(1000,1300);mapCtx.stroke();
    mapCtx.strokeStyle="#f7d36b";mapCtx.lineWidth=5;mapCtx.setLineDash([34,28]);mapCtx.beginPath();mapCtx.moveTo(0,650);mapCtx.lineTo(2000,650);mapCtx.moveTo(1000,0);mapCtx.lineTo(1000,1300);mapCtx.stroke();mapCtx.setLineDash([]);
    for(let i=0;i<22;i++){const x=(i*317)%1900,y=(i*223)%1200;mapCtx.fillStyle=i%2?"#8396a8":"#a1b0bc";rounded(x,y,90,62,8,i%2?"#62758a":"#8398a9","#c3d0d8");rounded(x+9,y+8,72,45,5,"#34465a");for(let k=0;k<3;k++)rounded(x+15+k*22,y+14,12,10,2,i%2?"#ffd16d":"#7bd7e7");}
    for(let i=0;i<10;i++){const x=80+i*195;rounded(x,620,12,60,3,"#f6e9b9");rounded(x,710,12,60,3,"#f6e9b9");}
    // Praças com árvores
    for(const [x,y] of [[210,220],[1740,220],[220,1050],[1750,1050]]){rounded(x-80,y-48,160,96,18,"#3e805c","#8acb83");for(let k=0;k<5;k++)tree(x-55+k*28,y-2,.45);}
  }else{
    // Distrito cyberpunk: placas luminosas, plataformas e circuitos
    for(let i=0;i<36;i++){const x=(i*173)%2000,y=(i*251)%1300;rounded(x,y,70+(i%3)*25,32+(i%2)*18,5,i%2?"#27316b":"#3b286c",i%2?"#3ce8ff":"#f05cff");}
    mapCtx.strokeStyle="rgba(57,226,255,.38)";mapCtx.lineWidth=5;
    for(let i=0;i<12;i++){const y=100+i*100;mapCtx.beginPath();mapCtx.moveTo(0,y);mapCtx.lineTo(2000,y+((i%3)-1)*35);mapCtx.stroke();}
    for(const [x,y,c] of [[300,280,"#f15cff"],[1680,310,"#3ce8ff"],[320,1030,"#3ce8ff"],[1680,1020,"#f15cff"]]){
      mapCtx.shadowColor=c;mapCtx.shadowBlur=30;mapCtx.strokeStyle=c;mapCtx.lineWidth=8;mapCtx.beginPath();mapCtx.arc(x,y,62,0,Math.PI*2);mapCtx.stroke();mapCtx.shadowBlur=0;
      ellipse(x,y,24,24,c);
    }
    for(let i=0;i<18;i++){const x=(i*281)%1900,y=(i*197)%1200;ellipse(x,y,12,12,i%2?"#f45cff":"#39e8ff");}
  }

  // Camada de material: microtexturas desenhadas localmente (sem downloads durante a partida).
  // Semente fixa para que todos vejam exatamente o mesmo cenário.
  let seed=selectedTheme.split("").reduce((n,c)=>n+c.charCodeAt(0),173);
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  mapCtx.save();
  if(selectedTheme==="forest"||selectedTheme==="jungle"){
    for(let i=0;i<1750;i++){
      const x=rand()*ARENA.w,y=rand()*ARENA.h;
      mapCtx.strokeStyle=i%3?"rgba(22,65,31,.22)":"rgba(214,235,129,.22)";
      mapCtx.lineWidth=1+rand()*2;mapCtx.beginPath();mapCtx.moveTo(x,y);mapCtx.lineTo(x+rand()*8-4,y-3-rand()*8);mapCtx.stroke();
    }
    for(let i=0;i<90;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;ellipse(x,y,2+rand()*4,2+rand()*3,"rgba(230,215,135,.34)");}
  }else if(selectedTheme==="ice"||selectedTheme==="tundra"){
    for(let i=0;i<1100;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;ellipse(x,y,1+rand()*5,1+rand()*3,i%3?"rgba(255,255,255,.42)":"rgba(67,151,198,.2)");}
    for(let i=0;i<55;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;mapCtx.strokeStyle="rgba(255,255,255,.3)";mapCtx.lineWidth=1+rand()*2;mapCtx.beginPath();mapCtx.moveTo(x,y);mapCtx.lineTo(x+12+rand()*28,y-5-rand()*16);mapCtx.lineTo(x+22+rand()*35,y+rand()*10);mapCtx.stroke();}
  }else if(selectedTheme==="desert"){
    for(let i=0;i<1900;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;ellipse(x,y,1+rand()*3,1+rand()*2,i%2?"rgba(255,245,197,.32)":"rgba(139,76,38,.19)");}
    for(let i=0;i<65;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;mapCtx.strokeStyle="rgba(255,239,188,.28)";mapCtx.lineWidth=2+rand()*3;mapCtx.beginPath();mapCtx.moveTo(x,y);mapCtx.quadraticCurveTo(x+35,y-18,x+80,y-4);mapCtx.stroke();}
  }else if(selectedTheme==="volcano"){
    for(let i=0;i<1500;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;ellipse(x,y,1+rand()*4,1+rand()*3,i%4?"rgba(8,7,15,.3)":"rgba(255,113,56,.25)");}
    for(let i=0;i<95;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;mapCtx.strokeStyle=i%2?"rgba(255,101,46,.28)":"rgba(255,202,91,.2)";mapCtx.lineWidth=1+rand()*3;mapCtx.beginPath();mapCtx.moveTo(x,y);mapCtx.lineTo(x+rand()*25-12,y+rand()*28-14);mapCtx.stroke();}
  }else if(selectedTheme==="city"){
    for(let i=0;i<900;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;rounded(x,y,2+rand()*9,2+rand()*5,1,i%2?"rgba(16,27,40,.25)":"rgba(190,211,224,.12)");}
    mapCtx.strokeStyle="rgba(183,211,231,.14)";mapCtx.lineWidth=2;
    for(let i=0;i<35;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;mapCtx.beginPath();mapCtx.moveTo(x,y);mapCtx.lineTo(x+20+rand()*65,y+rand()*8);mapCtx.stroke();}
  }else{
    for(let i=0;i<1200;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;ellipse(x,y,1+rand()*3,1+rand()*3,i%2?"rgba(56,227,255,.22)":"rgba(238,73,255,.2)");}
    mapCtx.strokeStyle="rgba(61,228,255,.18)";mapCtx.lineWidth=2;
    for(let i=0;i<45;i++){const x=rand()*ARENA.w,y=rand()*ARENA.h;mapCtx.beginPath();mapCtx.moveTo(x,y);mapCtx.lineTo(x+rand()*70,y);mapCtx.lineTo(x+rand()*70,y+rand()*35);mapCtx.stroke();}
  }
  mapCtx.restore();

  // Sutil textura de chão, sem a grade escura que poluía a arena.
  mapCtx.save();mapCtx.strokeStyle="rgba(255,255,255,.075)";mapCtx.lineWidth=1;
  for(let x=0;x<ARENA.w;x+=100){mapCtx.beginPath();mapCtx.moveTo(x,0);mapCtx.lineTo(x,ARENA.h);mapCtx.stroke();}
  for(let y=0;y<ARENA.h;y+=100){mapCtx.beginPath();mapCtx.moveTo(0,y);mapCtx.lineTo(ARENA.w,y);mapCtx.stroke();}
  mapCtx.restore();

  // Os 14 pontos de colisão continuam alinhados ao servidor, mas agora viram peças de cenário detalhadas.
  for(const w of walls){
    const cx=w.x+w.w/2,cy=w.y+w.h/2,r=Math.min(w.w,w.h)*.48;
    mapCtx.save();mapCtx.shadowColor="rgba(8,15,25,.38)";mapCtx.shadowBlur=16;mapCtx.shadowOffsetY=9;
    if(selectedTheme==="forest"||selectedTheme==="jungle"){
      mapCtx.fillStyle="#765137";mapCtx.fillRect(cx-10,cy+4,20,Math.max(25,w.h*.36));
      for(const [ox,oy,rad,col] of [[-r*.38,-r*.1,r*.68,"#1e713b"],[r*.25,-r*.2,r*.72,"#3a9a48"],[0,-r*.55,r*.68,"#72c64d"],[0,0,r*.58,"#55a944"]])ellipse(cx+ox,cy+oy,rad,rad*.82,col);
      ellipse(cx-r*.24,cy-r*.63,r*.2,r*.1,"rgba(237,255,170,.55)");
    }else if(selectedTheme==="ice"||selectedTheme==="tundra"){
      mapCtx.beginPath();mapCtx.moveTo(cx-w.w*.5,cy+r*.55);mapCtx.lineTo(cx-w.w*.34,cy-r*.55);mapCtx.lineTo(cx-w.w*.05,cy-r*.9);mapCtx.lineTo(cx+w.w*.2,cy-r*.5);mapCtx.lineTo(cx+w.w*.5,cy+r*.55);mapCtx.closePath();mapCtx.fillStyle="#4aa8d2";mapCtx.fill();
      mapCtx.beginPath();mapCtx.moveTo(cx-w.w*.34,cy-r*.55);mapCtx.lineTo(cx-w.w*.05,cy-r*.9);mapCtx.lineTo(cx+w.w*.2,cy-r*.5);mapCtx.lineTo(cx,cy-r*.22);mapCtx.closePath();mapCtx.fillStyle="#effdff";mapCtx.fill();
      mapCtx.strokeStyle="#c9f7ff";mapCtx.lineWidth=4;mapCtx.stroke();
    }else if(selectedTheme==="desert"){
      rock(cx,cy,Math.max(.8,w.w/150),"#a75f39","#e7ad61");
      if(w.w<120)cactus(cx,cy,.65);
    }else if(selectedTheme==="volcano"){
      rock(cx,cy,Math.max(.8,w.w/150),"#352c3b","#9b5960");
      mapCtx.shadowBlur=0;mapCtx.strokeStyle="#ff7138";mapCtx.lineWidth=5;mapCtx.beginPath();mapCtx.moveTo(cx-12,cy-r*.5);mapCtx.lineTo(cx+4,cy);mapCtx.lineTo(cx-8,cy+r*.5);mapCtx.stroke();
    }else if(selectedTheme==="city"){
      rounded(w.x,w.y,w.w,w.h,8,"#52677c","#b5c8d6");rounded(w.x+9,w.y+9,w.w-18,w.h-18,5,"#293c50");
      for(let wx=w.x+17;wx<w.x+w.w-10;wx+=27)for(let wy=w.y+15;wy<w.y+w.h-8;wy+=26)rounded(wx,wy,11,13,2,"#ffd36e");
      mapCtx.fillStyle="rgba(255,255,255,.25)";mapCtx.fillRect(w.x+7,w.y+6,w.w-14,4);
    }else{
      rounded(w.x,w.y,w.w,w.h,9,"#342c68","#f05cff");rounded(w.x+9,w.y+9,w.w-18,w.h-18,5,"#1c3766","#43e7ff");
      mapCtx.shadowBlur=20;mapCtx.shadowColor="#42eaff";mapCtx.strokeStyle="#42eaff";mapCtx.lineWidth=3;mapCtx.strokeRect(w.x+17,w.y+17,w.w-34,w.h-34);
    }
    mapCtx.restore();
  }

  // Pontos de interesse e acabamento cinematográfico: cada bioma ganha uma identidade própria.
  // Esta camada é apenas visual; mantém intactas as colisões oficiais do servidor.
  const scenicSeed=selectedTheme.split("").reduce((n,c)=>n*31+c.charCodeAt(0),9173)>>>0;
  let scenicState=scenicSeed;
  const scenicRand=()=>{scenicState=(scenicState*1664525+1013904223)>>>0;return scenicState/4294967296;};
  const clearSpot=(x,y,pad=90)=>!walls.some(w=>x>w.x-pad&&x<w.x+w.w+pad&&y>w.y-pad&&y<w.y+w.h+pad);
  mapCtx.save();
  // Luz ambiente suave nas áreas de jogo e vinheta nas extremidades.
  const ambience=mapCtx.createRadialGradient(1000,640,120,1000,640,1280);
  ambience.addColorStop(0,"rgba(255,255,255,.10)");ambience.addColorStop(.72,"rgba(255,255,255,.015)");ambience.addColorStop(1,"rgba(5,12,20,.30)");
  mapCtx.fillStyle=ambience;mapCtx.fillRect(0,0,ARENA.w,ARENA.h);
  if(selectedTheme==="forest"||selectedTheme==="jungle"){
    // Clareiras circulares e pequenos canteiros de samambaias.
    for(const [x,y,r] of [[500,420,125],[1450,880,150],[1040,1080,90]]){
      const g=mapCtx.createRadialGradient(x,y,8,x,y,r);g.addColorStop(0,"rgba(205,229,126,.16)");g.addColorStop(1,"rgba(38,91,48,0)");
      mapCtx.fillStyle=g;mapCtx.beginPath();mapCtx.arc(x,y,r,0,Math.PI*2);mapCtx.fill();
    }
    for(let i=0;i<42;i++){const x=70+scenicRand()*1860,y=70+scenicRand()*1160;if(!clearSpot(x,y,45))continue;
      mapCtx.save();mapCtx.translate(x,y);mapCtx.rotate(scenicRand()*Math.PI);
      mapCtx.strokeStyle=i%2?"rgba(196,224,111,.62)":"rgba(25,92,56,.65)";mapCtx.lineWidth=3;
      for(let k=0;k<4;k++){mapCtx.beginPath();mapCtx.moveTo(0,0);mapCtx.quadraticCurveTo((k-1.5)*7,-10,(k-1.5)*12,-22-scenicRand()*12);mapCtx.stroke();}
      mapCtx.restore();
    }
  }else if(selectedTheme==="ice"||selectedTheme==="tundra"){
    // Fendas de gelo facetadas e pequenos montes de neve.
    for(let i=0;i<28;i++){const x=70+scenicRand()*1860,y=70+scenicRand()*1160;if(!clearSpot(x,y,48))continue;
      mapCtx.save();mapCtx.translate(x,y);mapCtx.rotate(scenicRand()*Math.PI);
      mapCtx.fillStyle="rgba(255,255,255,.24)";mapCtx.beginPath();mapCtx.moveTo(-22,8);mapCtx.lineTo(-5,-12);mapCtx.lineTo(3,-3);mapCtx.lineTo(22,-18);mapCtx.lineTo(11,12);mapCtx.closePath();mapCtx.fill();
      mapCtx.strokeStyle="rgba(67,157,204,.35)";mapCtx.lineWidth=2;mapCtx.stroke();mapCtx.restore();
    }
    for(const [x,y] of [[270,330],[1760,720],[1080,180]]){mapCtx.save();mapCtx.shadowColor="#a8edff";mapCtx.shadowBlur=24;mapCtx.fillStyle="#9ceaff";mapCtx.beginPath();mapCtx.moveTo(x,y-45);mapCtx.lineTo(x+18,y+5);mapCtx.lineTo(x,y+25);mapCtx.lineTo(x-16,y+5);mapCtx.closePath();mapCtx.fill();mapCtx.restore();}
  }else if(selectedTheme==="desert"){
    // Ruínas antigas, pedras de marco e trilhas de areia.
    mapCtx.save();mapCtx.globalAlpha=.34;mapCtx.strokeStyle="#fff0c1";mapCtx.lineWidth=12;mapCtx.lineCap="round";
    for(const [x,y] of [[360,300],[1570,360],[1180,1030]]){mapCtx.beginPath();mapCtx.arc(x,y,58,Math.PI*.15,Math.PI*1.8);mapCtx.stroke();mapCtx.fillStyle="#8d573d";mapCtx.fillRect(x-8,y-72,16,32);}
    mapCtx.restore();
    for(let i=0;i<24;i++){const x=70+scenicRand()*1860,y=70+scenicRand()*1160;if(!clearSpot(x,y,48))continue;rock(x,y,.35+scenicRand()*.35,"#a95f3b","#f0c17b");}
  }else if(selectedTheme==="volcano"){
    // Campos de basalto, rachaduras incandescentes e brasas.
    for(let i=0;i<34;i++){const x=70+scenicRand()*1860,y=70+scenicRand()*1160;if(!clearSpot(x,y,45))continue;
      mapCtx.strokeStyle=i%3?"rgba(255,105,49,.36)":"rgba(255,205,103,.42)";mapCtx.lineWidth=2+scenicRand()*2;
      mapCtx.beginPath();mapCtx.moveTo(x,y);mapCtx.lineTo(x+scenicRand()*18-9,y+scenicRand()*24);mapCtx.lineTo(x+scenicRand()*36-18,y+scenicRand()*42);mapCtx.stroke();
    }
    for(let i=0;i<24;i++){const x=scenicRand()*2000,y=scenicRand()*1300;const glow=mapCtx.createRadialGradient(x,y,1,x,y,18);glow.addColorStop(0,"rgba(255,211,105,.65)");glow.addColorStop(1,"rgba(255,75,35,0)");mapCtx.fillStyle=glow;mapCtx.beginPath();mapCtx.arc(x,y,18,0,Math.PI*2);mapCtx.fill();}
  }else if(selectedTheme==="city"){
    // Calçadas, canteiros e iluminação urbana.
    for(const [x,y] of [[250,430],[1740,850],[1100,220],[850,1080]]){rounded(x-72,y-35,144,70,14,"rgba(44,103,78,.82)","rgba(181,224,172,.65)");for(let k=0;k<4;k++){ellipse(x-45+k*30,y,10,9,"#65a96b");}}
    mapCtx.strokeStyle="rgba(226,238,244,.22)";mapCtx.lineWidth=3;mapCtx.setLineDash([12,16]);
    for(const y of [120,1180]){mapCtx.beginPath();mapCtx.moveTo(0,y);mapCtx.lineTo(2000,y);mapCtx.stroke();}
    mapCtx.setLineDash([]);
  }else{
    // Circuitos luminosos com nós e trilhas em ângulo reto.
    for(let i=0;i<26;i++){const x=60+scenicRand()*1880,y=60+scenicRand()*1180;if(!clearSpot(x,y,35))continue;const c=i%2?"rgba(66,234,255,.42)":"rgba(255,104,217,.4)";
      mapCtx.strokeStyle=c;mapCtx.lineWidth=3;mapCtx.beginPath();mapCtx.moveTo(x-25,y);mapCtx.lineTo(x+8,y);mapCtx.lineTo(x+8,y+22);mapCtx.stroke();
      mapCtx.fillStyle=c;mapCtx.beginPath();mapCtx.arc(x-25,y,4,0,Math.PI*2);mapCtx.fill();
    }
  }
  // Moldura interna fina e cantos destacados dão profundidade sem cobrir a arena.
  mapCtx.strokeStyle="rgba(255,255,255,.20)";mapCtx.lineWidth=2;mapCtx.strokeRect(30,30,ARENA.w-60,ARENA.h-60);
  for(const [x,y,sx,sy] of [[38,38,1,1],[1962,38,-1,1],[38,1262,1,-1],[1962,1262,-1,-1]]){
    mapCtx.strokeStyle="rgba(255,255,255,.52)";mapCtx.lineWidth=5;mapCtx.beginPath();mapCtx.moveTo(x,y+sy*34);mapCtx.lineTo(x,y);mapCtx.lineTo(x+sx*34,y);mapCtx.stroke();
  }
  mapCtx.restore();

  // Moldura temática e detalhes de borda.
  const border=selectedTheme==="ice"||selectedTheme==="tundra"?"#e8fbff":selectedTheme==="desert"?"#ffdb91":selectedTheme==="volcano"?"#ff7546":selectedTheme==="neon"?"#f05cff":selectedTheme==="city"?"#a9c9df":"#b8e66b";
  mapCtx.strokeStyle=border;mapCtx.lineWidth=8;mapCtx.globalAlpha=.72;mapCtx.strokeRect(14,14,ARENA.w-28,ARENA.h-28);mapCtx.globalAlpha=1;
  drawMapPreview();
}

function drawMapPreview(){
  const preview=$("mapPreview"); if(!preview||!mapCanvas)return;
  const pctx=preview.getContext("2d");
  pctx.clearRect(0,0,preview.width,preview.height);
  pctx.drawImage(mapCanvas,0,0,ARENA.w,ARENA.h,0,0,preview.width,preview.height);
  pctx.fillStyle="rgba(5,10,7,.72)";pctx.fillRect(6,6,preview.width-12,19);
  pctx.fillStyle="#c5e36b";pctx.font="bold 10px monospace";pctx.textAlign="left";
  pctx.fillText(({forest:"FLORESTA",neon:"NEON CITY",desert:"DESERTO",ice:"GELO ANTIGO",tundra:"TUNDRA / PINGUINS",volcano:"VULCÃO",jungle:"SELVA",city:"CIDADE EM RUÍNAS"})[selectedTheme]||"ARENA",12,19);
}
buildMap();

$("skinSelect").addEventListener("change",e=>{selectedSkin=e.target.value;drawTankPreview();});
$("mapSelect").addEventListener("change",e=>{selectedTheme=e.target.value;buildMap();});
function drawTankArt(pctx,cx,cy,scale,color,skin){
  pctx.save();pctx.translate(cx,cy);pctx.scale(scale,scale);
  const grad=(x,y,w,h,a,b)=>{const g=pctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,a);g.addColorStop(.48,b);g.addColorStop(1,a);return g;};
  // Sombra e esteiras segmentadas
  pctx.fillStyle="rgba(0,0,0,.38)";pctx.beginPath();pctx.ellipse(0,8,33,23,0,0,Math.PI*2);pctx.fill();
  pctx.fillStyle="#111820";pctx.beginPath();pctx.roundRect(-29,-21,58,42,10);pctx.fill();
  pctx.fillStyle=grad(-26,-19,52,38,"#66727b","#252f38");pctx.beginPath();pctx.roundRect(-26,-19,52,38,8);pctx.fill();
  for(let y=-15;y<=13;y+=7){pctx.fillStyle="#9aa4a8";pctx.fillRect(-24,y,4,3);pctx.fillRect(20,y,4,3);}
  for(let x=-17;x<=13;x+=10){pctx.fillStyle="#0c1117";pctx.beginPath();pctx.arc(x,-17,2.3,0,Math.PI*2);pctx.arc(x,17,2.3,0,Math.PI*2);pctx.fill();}
  // Chassi facetado e placas laterais
  pctx.fillStyle=grad(-19,-15,38,30,"#f0f3e8",color);pctx.beginPath();pctx.roundRect(-19,-15,38,30,7);pctx.fill();
  pctx.fillStyle="rgba(255,255,255,.32)";pctx.beginPath();pctx.moveTo(-13,-11);pctx.lineTo(11,-11);pctx.lineTo(5,-6);pctx.lineTo(-13,-6);pctx.closePath();pctx.fill();
  pctx.fillStyle="rgba(0,0,0,.2)";pctx.fillRect(-16,7,32,4);
  pctx.strokeStyle="rgba(12,20,26,.7)";pctx.lineWidth=1.5;pctx.strokeRect(-15,-10,7,20);pctx.strokeRect(8,-10,7,20);
  // Torreta rotativa, escotilha e detalhes
  pctx.fillStyle="#17232b";pctx.beginPath();pctx.arc(0,0,11,0,Math.PI*2);pctx.fill();
  pctx.fillStyle=grad(-9,-9,18,18,"#dce5df",color);pctx.beginPath();pctx.roundRect(-9,-9,18,18,6);pctx.fill();
  pctx.fillStyle="rgba(255,255,255,.4)";pctx.beginPath();pctx.ellipse(-3,-5,4,2,-.3,0,Math.PI*2);pctx.fill();
  pctx.strokeStyle="rgba(16,24,30,.8)";pctx.lineWidth=2;pctx.beginPath();pctx.arc(0,0,7,0,Math.PI*2);pctx.stroke();
  // Canhão metálico com anéis e boca
  pctx.fillStyle=grad(3,-3,38,6,"#e9eef0","#667985");pctx.beginPath();pctx.roundRect(5,-3.5,34,7,3);pctx.fill();
  pctx.fillStyle="#253541";pctx.fillRect(29,-4,4,8);pctx.fillStyle="#dce5e8";pctx.fillRect(37,-4,4,8);
  pctx.fillStyle="#101820";pctx.beginPath();pctx.ellipse(41,0,2.5,3.2,0,0,Math.PI*2);pctx.fill();
  // rebites, riscos de pintura e marca central
  pctx.fillStyle="#e8f0e8";for(const [x,y] of [[-14,-10],[14,-10],[-14,10],[14,10]]){pctx.beginPath();pctx.arc(x,y,1.2,0,Math.PI*2);pctx.fill();}
  pctx.fillStyle=skin==="gold"?"#fff0a6":skin==="ice"?"#eaffff":skin==="toxic"?"#e0ff9a":"#f4f4df";pctx.fillRect(-3,-2,6,4);
  pctx.restore();
}
function drawTankPreview(){
  const preview=$("tankPreview");if(!preview)return;
  const pctx=preview.getContext("2d");pctx.clearRect(0,0,preview.width,preview.height);
  const color=skinStyles[selectedSkin]||skinStyles.classic;
  const bg=pctx.createLinearGradient(0,0,preview.width,preview.height);bg.addColorStop(0,"#192733");bg.addColorStop(1,"#0b1119");pctx.fillStyle=bg;pctx.fillRect(0,0,preview.width,preview.height);
  for(let i=0;i<70;i++){const x=(i*47)%preview.width,y=(i*29)%preview.height;pctx.fillStyle=i%2?"rgba(255,255,255,.035)":"rgba(100,190,220,.06)";pctx.fillRect(x,y,1+(i%3),1+(i%2));}
  drawTankArt(pctx,preview.width/2,preview.height/2-3,1.55,color,selectedSkin);
  pctx.fillStyle=color;pctx.font="bold 10px monospace";pctx.textAlign="center";pctx.fillText(selectedSkin.toUpperCase()+" • BLINDAGEM",preview.width/2,preview.height-7);
}

drawTankPreview();

$("fullscreenBtn").addEventListener("click",async()=>{try{if(!document.fullscreenElement)await $("gamePanel").requestFullscreen();else await document.exitFullscreen();}catch{$("gameStatus").textContent="TELA CHEIA INDISPONÍVEL NESTE NAVEGADOR";}});
$("joinForm").addEventListener("submit", e => {
  e.preventDefault(); $("joinError").textContent = "";
  roomCode = $("roomCode").value.trim().toUpperCase();
  selectedName=($("playerName").value.trim()||"OPERADOR").slice(0,16);
  if (roomCode) socket.emit("joinRoom", {code:roomCode,name:selectedName,skin:selectedSkin,theme:selectedTheme});
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
  if(info.theme && info.theme!==selectedTheme){selectedTheme=info.theme;$("mapSelect").value=selectedTheme;buildMap();}
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
  if(s.theme && s.theme!==selectedTheme){selectedTheme=s.theme;$("mapSelect").value=selectedTheme;buildMap();}
  $("gameStatus").textContent = s.status === "playing" ? s.players.filter(p => p.connected).length + " OPERADORES EM COMBATE" : s.status === "finished" ? "PARTIDA ENCERRADA" : "AGUARDANDO INÍCIO";
  const me = s.players.find(p => p.id === myId);
  if (me) {
    $("healthFill").style.width = me.hp + "%";
    $("healthText").textContent = me.lives > 0 ? Math.max(0,me.hp) + "%" : "ELIMINADO";
    $("livesText").textContent = String(me.lives);
    $("livesText").style.color = me.lives === 1 ? "#e46d5c" : "";
    const power = me.power && powers[me.power];
    $("powerHud").textContent = me.invulnerableLeft > 0 ? "ESCUDO " + Math.ceil(me.invulnerableLeft / 1000) + "s" : power ? power.label + "  " + Math.ceil(me.powerLeft / 1000) + "s" : "SEM PODER";
    $("powerHud").style.color = me.invulnerableLeft > 0 ? "#f7f3c2" : power ? power.color : "";
  }
  const scores = [...s.players].sort((a,b)=>b.score-a.score||b.lives-a.lives||a.number-b.number);
  $("scoreText").textContent = "ELIMINAÇÕES  " + scores.slice(0,3).map(p=>"OP"+p.number+" "+p.score).join("  •  ");
  if (s.status === "finished") showResults(s.rankings || []);
  else $("matchResult").classList.add("hidden");
  const activePower=me?.power||null;
  if(activePower && activePower!==lastPowerSound)playSound("power");
  lastPowerSound=activePower;
  const explosions=s.explosions?.length||0;if(explosions>lastExplosionCount)playSound("explosion");lastExplosionCount=explosions;
});
socket.on("winner", data=>{
  const banner=$("winnerBanner");
  if(banner){banner.textContent=(data?.name||"OPERADOR")+" GANHOU!";banner.classList.remove("hidden");}
  if(!lastWinnerSound){playSound("win");lastWinnerSound=true;}
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
  $("resultTitle").textContent=champion ? (champion.name||"OPERADOR")+" GANHOU!" : "PARTIDA ENCERRADA";
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

// Inputs a 30 Hz para reduzir atraso de controle; snapshots continuam compactos no servidor.
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
  if(shooting && performance.now()-lastShotSound>95){playSound(me.power==="flame"?"flame":"shot");lastShotSound=performance.now();}
},33);

function screenToWorld(x,y){
  return {x:(x-canvas.width/2)/ZOOM+camera.x,y:(y-canvas.height/2)/ZOOM+camera.y};
}
function drawCrates(){
  for(const crate of state.crates||[]){
    const p=powers[crate.type]||powers.rapid;
    ctx.save();ctx.translate(crate.x,crate.y);ctx.rotate(Math.sin(performance.now()/250)*.08);
    ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.fillStyle="#101a15";ctx.fillRect(-20,-20,40,40);
    ctx.shadowBlur=0;ctx.fillStyle=p.color;ctx.fillRect(-16,-16,32,32);
    ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.strokeRect(-16,-16,32,32);
    ctx.fillStyle="#17231c";ctx.font="bold 23px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(p.icon,0,1);ctx.restore();
    ctx.fillStyle=p.color;ctx.font="bold 13px monospace";ctx.textAlign="center";ctx.fillText(p.label,crate.x,crate.y-28);
  }
}
function drawPlayers(dt){
  for(const p of state.players){
    if(!p.connected||p.lives<=0||p.hp<=0||(p.invisible&&p.id!==myId))continue;
    let r=renderedPlayers.get(p.id);if(!r){r={x:p.x,y:p.y,angle:p.angle};renderedPlayers.set(p.id,r);}
    const k=1-Math.exp(-dt/(p.id===myId?34:62));r.x+=(p.x-r.x)*k;r.y+=(p.y-r.y)*k;
    let targetAngle=p.angle;if(p.id===myId){const aim=screenToWorld(mouse.x,mouse.y);targetAngle=Math.atan2(aim.y-r.y,aim.x-r.x);}
    let da=targetAngle-r.angle;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;if(p.id===myId)r.angle=targetAngle;else r.angle+=da*k;
    const color=skinStyles[p.skin]||playerColors[(p.number-1)%playerColors.length],hidden=p.invisible&&p.id!==myId;
    ctx.save();ctx.translate(r.x,r.y);ctx.rotate(r.angle);ctx.globalAlpha=hidden?.16:1;
    if(p.power==="shield"||p.invulnerableLeft>0){ctx.strokeStyle=p.invulnerableLeft>0?"#fff3b0":powers.shield.color;ctx.lineWidth=3;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,p.invulnerableLeft>0?34:29,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
    if(p.blades){const spin=performance.now()/180;for(let i=0;i<4;i++){ctx.save();ctx.rotate(spin+i*Math.PI/2);ctx.fillStyle="#e8f2ff";ctx.shadowColor="#8db9ff";ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(0,-40);ctx.lineTo(8,-18);ctx.lineTo(0,-11);ctx.lineTo(-8,-18);ctx.closePath();ctx.fill();ctx.restore();}}
    if(p.phased){ctx.strokeStyle="#7ee7ff";ctx.lineWidth=3;ctx.shadowColor="#7ee7ff";ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,31,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
    // Sombra projetada e tanque com acabamento metálico, placas e esteiras
    ctx.fillStyle="rgba(0,0,0,.36)";ctx.beginPath();ctx.ellipse(2,7,31,24,.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#0b1118";ctx.beginPath();ctx.roundRect(-27,-21,54,42,10);ctx.fill();
    const metal=ctx.createLinearGradient(-20,-20,22,22);metal.addColorStop(0,"#7c8a91");metal.addColorStop(.35,"#27343d");metal.addColorStop(.7,"#101a22");metal.addColorStop(1,"#56636a");
    ctx.fillStyle=metal;ctx.beginPath();ctx.roundRect(-24,-18,48,36,8);ctx.fill();
    for(let y=-14;y<=12;y+=7){ctx.fillStyle="#aab5b7";ctx.fillRect(-23,y,4,3);ctx.fillRect(19,y,4,3);ctx.fillStyle="#111820";ctx.fillRect(-18,y,2,3);ctx.fillRect(16,y,2,3);}
    const armor=ctx.createLinearGradient(-16,-14,16,14);armor.addColorStop(0,"#ffffff");armor.addColorStop(.16,color);armor.addColorStop(.68,color);armor.addColorStop(1,"#25323a");
    ctx.fillStyle=armor;ctx.beginPath();ctx.roundRect(-17,-13,34,26,6);ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.32)";ctx.beginPath();ctx.moveTo(-12,-10);ctx.lineTo(10,-10);ctx.lineTo(4,-5);ctx.lineTo(-12,-5);ctx.closePath();ctx.fill();
    ctx.fillStyle="rgba(0,0,0,.22)";ctx.fillRect(-14,7,28,3);
    ctx.strokeStyle="rgba(8,15,20,.75)";ctx.lineWidth=1.5;ctx.strokeRect(-13,-9,6,18);ctx.strokeRect(7,-9,6,18);
    // Torreta e canhão
    ctx.fillStyle="#101a22";ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();
    const turret=ctx.createRadialGradient(-4,-5,1,0,0,14);turret.addColorStop(0,"#e6edf0");turret.addColorStop(.28,color);turret.addColorStop(1,"#202d36");
    ctx.fillStyle=turret;ctx.beginPath();ctx.roundRect(-9,-9,18,18,6);ctx.fill();
    ctx.strokeStyle="rgba(10,17,24,.8)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.stroke();
    const barrel=ctx.createLinearGradient(4,-4,39,4);barrel.addColorStop(0,"#dce5e8");barrel.addColorStop(.35,"#61727d");barrel.addColorStop(.65,"#c4d0d4");barrel.addColorStop(1,"#34434e");
    ctx.fillStyle=barrel;ctx.beginPath();ctx.roundRect(5,-3.5,34,7,3);ctx.fill();
    ctx.fillStyle="#1b2831";ctx.fillRect(29,-4,4,8);ctx.fillStyle="#e0e8e8";ctx.fillRect(37,-4,4,8);
    ctx.fillStyle="#0b1117";ctx.beginPath();ctx.ellipse(41,0,2.5,3.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#f2f4df";for(const [x,y] of [[-13,-9],[13,-9],[-13,9],[13,9]]){ctx.beginPath();ctx.arc(x,y,1.1,0,Math.PI*2);ctx.fill();}
    if(p.id===myId&&shooting){const flash=12+Math.random()*9,g=ctx.createRadialGradient(42,0,1,42,0,flash);g.addColorStop(0,"#fffbd1");g.addColorStop(.3,"#ffc15c");g.addColorStop(1,"rgba(255,80,25,0)");ctx.fillStyle=g;ctx.beginPath();ctx.arc(42,0,flash,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    if(p.id===myId&&p.power==="clone"){ctx.save();ctx.strokeStyle="#c69cff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(r.x,r.y,34,0,Math.PI*2);ctx.stroke();ctx.restore();}
    const disguised=p.id!==myId&&(state.clones||[]).some(c=>c.owner===p.id);
    if(!disguised){ctx.globalAlpha=hidden?.22:1;ctx.fillStyle="rgba(0,0,0,.65)";ctx.fillRect(r.x-25,r.y-40,50,6);ctx.fillStyle=color;ctx.fillRect(r.x-25,r.y-40,50*Math.max(0,p.hp/100),6);ctx.fillStyle="#f0f2e8";ctx.font="bold 12px monospace";ctx.textAlign="center";ctx.fillText((p.name||("OP "+String(p.number).padStart(2,"0")))+(p.id===myId?" • VOCÊ":""),r.x,r.y-50);ctx.fillStyle="#e46d5c";ctx.font="bold 11px monospace";ctx.fillText("♥ "+p.lives,r.x,r.y+42);ctx.globalAlpha=1;}
  }
}
function drawBullets(dt){
  const active = new Set();
  for(const b of state.bullets||[]){
    active.add(b.id);
    let r=renderedBullets.get(b.id);
    if(!r){r={x:b.x,y:b.y};renderedBullets.set(b.id,r);}
    const k=1-Math.exp(-dt/38);
    r.x+=(b.x-r.x)*k;r.y+=(b.y-r.y)*k;
    ctx.save();ctx.translate(r.x,r.y);ctx.rotate(Math.atan2(b.vy,b.vx));
    const bomb=b.type==="bomb", flame=b.type==="flame", rocket=b.type==="rocket", electric=b.type==="electric", blackhole=b.type==="blackhole";
    if(blackhole){ctx.shadowColor="#9d68ff";ctx.shadowBlur=28;const pulse=10+Math.sin(performance.now()/65)*3;ctx.fillStyle="#090515";ctx.beginPath();ctx.arc(0,0,pulse,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#c4a2ff";ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,0,21,8,performance.now()/180,0,Math.PI*2);ctx.stroke();}
    else if(electric){ctx.shadowColor="#ffe45e";ctx.shadowBlur=20;ctx.strokeStyle="#fff3a0";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-16,0);ctx.lineTo(-5,-8);ctx.lineTo(1,7);ctx.lineTo(10,-7);ctx.lineTo(17,0);ctx.stroke();}
    else if(flame){
      const flicker=.78+Math.sin(performance.now()/32+b.id)*.22;
      const fire=ctx.createLinearGradient(-34,0,15,0);fire.addColorStop(0,"rgba(255,45,12,0)");fire.addColorStop(.35,"#ff4a16");fire.addColorStop(.72,"#ffb12f");fire.addColorStop(1,"#fff2a0");
      ctx.shadowColor="#ff4a16";ctx.shadowBlur=22;ctx.fillStyle=fire;ctx.beginPath();ctx.moveTo(-34,-7*flicker);ctx.quadraticCurveTo(-8,-13*flicker,16,0);ctx.quadraticCurveTo(-8,13*flicker,-34,7*flicker);ctx.closePath();ctx.fill();
      ctx.strokeStyle="rgba(255,235,145,.9)";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-22,0);ctx.quadraticCurveTo(-3,-3*flicker,13,0);ctx.stroke();
    }else if(rocket){
      const trail=ctx.createLinearGradient(-34,0,12,0);trail.addColorStop(0,"rgba(255,100,35,0)");trail.addColorStop(1,"#ffb45c");ctx.shadowColor="#ff6b32";ctx.shadowBlur=20;ctx.fillStyle=trail;ctx.fillRect(-34,-5,34,10);ctx.fillStyle="#d9e5ed";ctx.beginPath();ctx.moveTo(-9,-6);ctx.lineTo(12,0);ctx.lineTo(-9,6);ctx.closePath();ctx.fill();ctx.fillStyle="#ff6b32";ctx.fillRect(-15,-8,5,16);
    }else{
      ctx.shadowColor=bomb?"#ff765c":"#ffe49a";ctx.shadowBlur=bomb?28:15;
      ctx.strokeStyle=bomb?"#ff8c68":"#fff4c7";ctx.lineWidth=bomb?10:4;ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(7,0);ctx.stroke();
      ctx.fillStyle=bomb?"#ff5d43":"#f2c96b";ctx.beginPath();ctx.arc(0,0,bomb?9:4,0,Math.PI*2);ctx.fill();if(bomb){ctx.strokeStyle="rgba(255,190,115,.8)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,14+Math.sin(performance.now()/90)*3,0,Math.PI*2);ctx.stroke();}
    }
    if(bomb && b.fuseLeft>0){ctx.rotate(-Math.atan2(b.vy,b.vx));ctx.fillStyle="#fff";ctx.font="bold 11px monospace";ctx.textAlign="center";ctx.fillText((b.fuseLeft/1000).toFixed(1)+"s",0,-15);}
    ctx.restore();
  }
  for(const id of renderedBullets.keys()) if(!active.has(id)) renderedBullets.delete(id);
}
function drawClones(){
  for(const c of state.clones||[]){
    const owner=state.players.find(p=>p.id===c.owner);
    const color=owner?(skinStyles[owner.skin]||playerColors[(owner.number-1)%playerColors.length]):"#c5e36b";
    const ownerView=c.owner===myId;
    ctx.save();ctx.globalAlpha=1;ctx.translate(c.x,c.y);ctx.rotate(c.angle);
    if(ownerView){ctx.strokeStyle="#c69cff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,27,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle="#080d12";ctx.beginPath();ctx.roundRect(-23,-18,47,36,8);ctx.fill();
    ctx.fillStyle="#29333a";ctx.fillRect(-20,-16,42,5);ctx.fillRect(-20,11,42,5);
    ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-16,-12,31,24,5);ctx.fill();
    ctx.fillStyle="#17232b";ctx.beginPath();ctx.roundRect(-8,-9,18,18,5);ctx.fill();
    ctx.fillStyle="#d6e3e8";ctx.beginPath();ctx.roundRect(8,-5,27,10,3);ctx.fill();
    ctx.fillStyle="#fff1c2";ctx.fillRect(31,-2,7,4);
    ctx.restore();
  }
}
function drawExplosions(){
  for(const h of state.blackholes||[]){const pulse=1+Math.sin(performance.now()/95)*.045;ctx.save();ctx.translate(h.x,h.y);ctx.scale(pulse,pulse);const grad=ctx.createRadialGradient(0,0,8,0,0,h.radius);grad.addColorStop(0,"rgba(0,0,0,1)");grad.addColorStop(.22,"rgba(16,5,35,.98)");grad.addColorStop(.55,"rgba(112,48,190,.55)");grad.addColorStop(1,"rgba(160,110,255,0)");ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,h.radius,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#c7a7ff";ctx.lineWidth=5;ctx.shadowColor="#9e68ff";ctx.shadowBlur=24;ctx.beginPath();ctx.ellipse(0,0,h.radius*.48,h.radius*.16,performance.now()/550,0,Math.PI*2);ctx.stroke();ctx.restore();}
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
  const viewW=canvas.width/ZOOM, viewH=canvas.height/ZOOM;
  const me=state.players.find(p=>p.id===myId);
  if(me&&me.connected){
    const targetX=Math.max(viewW/2,Math.min(ARENA.w-viewW/2,me.x));
    const targetY=Math.max(viewH/2,Math.min(ARENA.h-viewH/2,me.y));
    const follow=1-Math.exp(-dt/90);camera.x+=(targetX-camera.x)*follow;camera.y+=(targetY-camera.y)*follow;
  } else if(!myId){camera.x+=(800-camera.x)*.08;camera.y+=(500-camera.y)*.08;}
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle="#101a17";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(ZOOM,0,0,ZOOM,canvas.width/2-camera.x*ZOOM,canvas.height/2-camera.y*ZOOM);
  const sx=Math.max(0,Math.min(ARENA.w-viewW,camera.x-viewW/2));
  const sy=Math.max(0,Math.min(ARENA.h-viewH,camera.y-viewH/2));
  ctx.drawImage(mapCanvas,sx,sy,viewW,viewH,sx,sy,viewW,viewH);
  if(state.gas && state.gas.remaining>0){ctx.save();ctx.fillStyle="rgba(144,205,83,.23)";ctx.beginPath();ctx.rect(0,0,ARENA.w,ARENA.h);ctx.arc(state.gas.x,state.gas.y,state.gas.radius,0,Math.PI*2,true);ctx.fill("evenodd");ctx.strokeStyle="rgba(188,235,110,.9)";ctx.lineWidth=8;ctx.beginPath();ctx.arc(state.gas.x,state.gas.y,state.gas.radius,0,Math.PI*2);ctx.stroke();ctx.restore();}
  drawCrates();drawClones();drawExplosions();drawBullets(dt);drawPlayers(dt);
  if(state.timeStop){ctx.save();ctx.fillStyle="rgba(105,145,255,.12)";ctx.fillRect(sx,sy,viewW,viewH);ctx.fillStyle="#d8e4ff";ctx.font="bold 24px monospace";ctx.textAlign="center";ctx.fillText("TEMPO CONGELADO • "+(state.timeStop.remaining/1000).toFixed(1)+"s",camera.x,camera.y-viewH*.42);ctx.restore();}
  ctx.setTransform(1,0,0,1,0,0);
  requestAnimationFrame(draw);
}
