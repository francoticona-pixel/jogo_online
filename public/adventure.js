(() => {
  const adv = id => document.getElementById(id);
  const panel = adv("adventurePanel"), lobbyPanel = adv("lobby"), canvas = adv("adventureCanvas");
  if (!panel || !canvas) return;
  const ctx = canvas.getContext("2d");
  const SAVE_KEY = "duelArenaAdventureSaveV1";
  const readSave = () => {
    try { const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); return { unlocked: Math.max(1, Math.min(20, Number(data.unlocked) || 1)), completed: Array.isArray(data.completed) ? data.completed : [] }; }
    catch { return { unlocked: 1, completed: [] }; }
  };
  let save = readSave(), level = save.unlocked, active = false, ended = false, won = false;
  let player, enemies = [], shots = [], enemyShots = [], particles = [], keys = {}, mouse = {x:500,y:310}, firing = false, lastShot = 0, lastFrame = 0, raf = 0;
  const rand = (min,max) => Math.random()*(max-min)+min;
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch(e) {} adv("advSaved").textContent = "FASE " + String(save.unlocked).padStart(2,"0"); };
  const setOverlay = (title, description, button) => { adv("advOverlayTitle").textContent=title; adv("advOverlayText").textContent=description; adv("advStart").textContent=button; adv("advOverlay").classList.remove("hidden"); };
  const updateHud = () => {
    adv("advLevel").textContent=String(level).padStart(2,"0")+" / 20";
    adv("advEnemies").textContent=enemies.filter(e=>e.hp>0).length;
    adv("advHealth").textContent=Math.max(0,Math.ceil(player ? player.hp : 100))+"%";
    adv("advSaved").textContent="FASE "+String(save.unlocked).padStart(2,"0");
  };
  const spawnLevel = () => {
    const count = 4 + level * 2;
    player={x:500,y:310,hp:100,angle:0,invuln:0};
    enemies=[];shots=[];enemyShots=[];particles=[];
    for(let i=0;i<count;i++){
      let x,y;
      do { x=rand(65,935); y=rand(65,555); } while(Math.hypot(x-500,y-310)<230);
      const boss = level%5===0 && i===count-1;
      enemies.push({x,y,hp:boss?180:42+level*3,maxHp:boss?180:42+level*3,speed:(boss?1.05:1.25)+level*.045,fire:rand(350,1200),boss});
    }
    active=true;ended=false;won=false;lastShot=0;updateHud();adv("advOverlay").classList.add("hidden");
    if(!raf) raf=requestAnimationFrame(loop);
  };
  const startLevel = () => { spawnLevel(); };
  const finish = success => {
    if(ended)return; active=false;ended=true;won=success;
    if(success){
      if(!save.completed.includes(level))save.completed.push(level);
      save.unlocked=Math.max(save.unlocked,Math.min(20,level+1));persist();
      if(level===20)setOverlay("CAMPANHA CONCLUÍDA!","Você venceu as 20 fases do DUEL ARENA. Seu progresso foi salvo.","JOGAR NOVAMENTE");
      else setOverlay("FASE CONCLUÍDA","Todos os inimigos foram eliminados. A próxima missão foi desbloqueada e seu progresso está salvo.","PRÓXIMA FASE");
    } else setOverlay("MISSÃO FALHOU","Você foi eliminado. Tente novamente: a fase continua desbloqueada.","TENTAR NOVAMENTE");
    updateHud();
  };
  const shoot = () => {
    const now=performance.now();
    if(now-lastShot<190)return;
    lastShot=now;
    const a=player.angle;
    shots.push({x:player.x+Math.cos(a)*22,y:player.y+Math.sin(a)*22,vx:Math.cos(a)*12,vy:Math.sin(a)*12,life:75,damage:24});
  };
  const hitPlayer = damage => { if(player.invuln>0)return;player.hp-=damage;player.invuln=18;if(player.hp<=0){player.hp=0;finish(false);} };
  const update = dt => {
    if(!active)return;
    const step=Math.min(dt/16.67,2);
    let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
    let dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
    const len=Math.hypot(dx,dy)||1;
    player.x=clamp(player.x+dx/len*4.5*step,25,975);
    player.y=clamp(player.y+dy/len*4.5*step,25,595);
    player.angle=Math.atan2(mouse.y-player.y,mouse.x-player.x);
    if(firing)shoot();
    if(player.invuln>0)player.invuln-=step;
    for(const b of shots){b.x+=b.vx*step;b.y+=b.vy*step;b.life-=step;for(const e of enemies){if(e.hp>0&&Math.hypot(e.x-b.x,e.y-b.y)<(e.boss?30:20)){e.hp-=b.damage;b.life=0;for(let n=0;n<4;n++)particles.push({x:b.x,y:b.y,vx:rand(-2,2),vy:rand(-2,2),life:18});break;}}}
    shots=shots.filter(b=>b.life>0&&b.x>0&&b.x<1000&&b.y>0&&b.y<620);
    for(const b of enemyShots){b.x+=b.vx*step;b.y+=b.vy*step;b.life-=step;if(Math.hypot(player.x-b.x,player.y-b.y)<18){hitPlayer(b.damage);b.life=0;}}
    enemyShots=enemyShots.filter(b=>b.life>0&&b.x>0&&b.x<1000&&b.y>0&&b.y<620);
    for(const e of enemies){if(e.hp<=0)continue;const a=Math.atan2(player.y-e.y,player.x-e.x),dist=Math.hypot(player.x-e.x,player.y-e.y);if(dist>145){e.x+=Math.cos(a)*e.speed*step;e.y+=Math.sin(a)*e.speed*step;}e.fire-=dt;if(e.fire<=0&&dist<620){const sp=e.boss?5.2:4.2;enemyShots.push({x:e.x+Math.cos(a)*18,y:e.y+Math.sin(a)*18,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:160,damage:e.boss?18:11});e.fire=e.boss?620:rand(900,1500)-level*18;}if(dist<28)hitPlayer(e.boss?22:14);}
    for(const p of particles){p.x+=p.vx*step;p.y+=p.vy*step;p.life-=step;}
    particles=particles.filter(p=>p.life>0);
    const alive=enemies.filter(e=>e.hp>0).length;
    adv("advEnemies").textContent=alive;adv("advHealth").textContent=Math.ceil(player.hp)+"%";
    if(alive===0)finish(true);
  };
  const draw = () => {
    ctx.fillStyle="#283528";ctx.fillRect(0,0,1000,620);
    ctx.strokeStyle="#354534";ctx.lineWidth=1;
    for(let x=0;x<1000;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,620);ctx.stroke();}
    for(let y=0;y<620;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke();}
    ctx.strokeStyle="#718067";ctx.setLineDash([8,10]);ctx.strokeRect(18,18,964,584);ctx.setLineDash([]);
    // Coberturas táticas
    [[220,150,105,32],[675,150,105,32],[220,440,105,32],[675,440,105,32],[470,255,60,110],[90,285,45,55],[865,285,45,55]].forEach(([x,y,w,h])=>{ctx.fillStyle="#59604b";ctx.fillRect(x,y,w,h);ctx.fillStyle="#778064";ctx.fillRect(x,y,w,5);ctx.strokeStyle="#222b22";ctx.strokeRect(x,y,w,h);});
    for(const b of shots){ctx.fillStyle="#f5d77a";ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fill();}
    for(const b of enemyShots){ctx.fillStyle="#e46d5c";ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fill();}
    for(const e of enemies){if(e.hp<=0)continue;ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.atan2(player.y-e.y,player.x-e.x));ctx.fillStyle=e.boss?"#9c3440":"#d16b58";ctx.fillRect(-16,-13,e.boss?38:30,26);ctx.fillStyle="#222a20";ctx.fillRect(0,-6,e.boss?31:23,8);ctx.restore();ctx.fillStyle="#111";ctx.fillRect(e.x-20,e.y-25,40,5);ctx.fillStyle=e.boss?"#e6a64c":"#e46d5c";ctx.fillRect(e.x-20,e.y-25,40*Math.max(0,e.hp/e.maxHp),5);if(e.boss){ctx.fillStyle="#fff";ctx.font="10px monospace";ctx.textAlign="center";ctx.fillText("ELITE",e.x,e.y-32);}}
    for(const p of particles){ctx.fillStyle="#f5d77a";ctx.globalAlpha=Math.max(0,p.life/18);ctx.fillRect(p.x,p.y,4,4);ctx.globalAlpha=1;}
    if(player){ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.fillStyle="#111711";ctx.fillRect(-17,-14,35,28);ctx.fillStyle=player.invuln>0?"#ffffff":"#c5e36b";ctx.fillRect(-14,-12,26,24);ctx.fillStyle="#222a20";ctx.fillRect(-3,-7,26,8);ctx.fillStyle="#aeb69d";ctx.fillRect(13,-5,20,4);ctx.restore();}
    ctx.fillStyle="#edf1e8";ctx.font="12px monospace";ctx.textAlign="left";ctx.fillText("OPERAÇÃO "+String(level).padStart(2,"0")+"  //  AMEAÇA: "+(level%5===0?"ELITE":"CRÍTICA"),28,42);
  };
  function loop(time){raf=0;const dt=lastFrame?time-lastFrame:16.67;lastFrame=time;update(dt);draw();if(active)raf=requestAnimationFrame(loop);}
  adv("openAdventure").addEventListener("click",()=>{lobbyPanel.classList.add("hidden");adv("gamePanel").classList.add("hidden");panel.classList.remove("hidden");level=save.unlocked;player={hp:100};updateHud();setOverlay("SUA MISSÃO COMEÇA AGORA","Campanha de 20 fases em dificuldade muito alta. Elimine todos os inimigos para avançar. O progresso é salvo automaticamente.","INICIAR FASE "+String(level).padStart(2,"0"));});
  adv("backToLobby").addEventListener("click",()=>{active=false;if(raf)cancelAnimationFrame(raf);raf=0;panel.classList.add("hidden");lobbyPanel.classList.remove("hidden");});
  adv("advStart").addEventListener("click",()=>{if(won&&level<20)level++;else if(won&&level===20)level=1;else level=Math.min(level,save.unlocked);startLevel();});
  canvas.addEventListener("mousemove",e=>{const r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)*canvas.width/r.width;mouse.y=(e.clientY-r.top)*canvas.height/r.height;});
  canvas.addEventListener("mousedown",e=>{if(e.button===0)firing=true;});window.addEventListener("mouseup",()=>firing=false);
  window.addEventListener("keydown",e=>{keys[e.key.toLowerCase()]=true;if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase()))e.preventDefault();});
  window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;});
  persist();draw();
})();