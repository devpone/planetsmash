(() => {
  const root = document.querySelector('[data-smash-game]');
  if (!root) return;

  const canvas = root.querySelector('[data-game-canvas]');
  const ctx = canvas.getContext('2d');
  const scoreEl = root.querySelector('[data-game-score]');
  const livesEl = root.querySelector('[data-game-lives]');
  const statusEl = root.querySelector('[data-game-status]');
  const overlay = root.querySelector('[data-game-overlay]');
  const overlayKicker = root.querySelector('[data-game-kicker]');
  const overlayTitle = root.querySelector('[data-game-title]');
  const overlayCopy = root.querySelector('[data-game-copy]');
  const startBtn = root.querySelector('[data-game-start]');
  const exitBtn = root.querySelector('[data-game-exit]');
  const form = root.querySelector('[data-game-form]');
  const nameInput = root.querySelector('[data-game-name]');
  const formStatus = root.querySelector('[data-game-form-status]');
  const board = root.querySelector('[data-game-board]');
  const boardMoreBtn = root.querySelector('[data-game-board-more]');
  const leftBtn = root.querySelector('[data-game-left]');
  const rightBtn = root.querySelector('[data-game-right]');
  const fireBtn = root.querySelector('[data-game-fire]');
  const bombBtn = root.querySelector('[data-game-bomb]');
  const bombCountEl = root.querySelector('[data-game-bomb-count]');
  const stage = root.querySelector('.arcade-stage');

  const API = 'https://planet-funksprueche.devpone.workers.dev';
  const LOCAL_KEY = 'psb-arcade-highscores-v1';
  const WIDTH = 900;
  const HEIGHT = 600;
  const MAX_LIVES = 3;
  const HIT_GRACE_MS = 850;
  const logo = new Image();
  logo.src = 'assets/logo.webp?v=20260928';

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  let raf = 0;
  let lastTime = 0;
  let spawnTimer = 0;
  let state = 'idle';
  let score = 0;
  let lives = MAX_LIVES;
  let shots = [];
  let enemies = [];
  let particles = [];
  let keys = {left:false,right:false,fire:false};
  let lastShotAt = 0;
  let nextId = 1;
  let bombUsed = false;
  let invulnerableUntil = 0;
  let touchPointerId = null;
  let touchDriving = false;
  let lastBombPointerAt = 0;
  let mouseDriving = false;
  let currentScores = [];
  let boardExpanded = false;

  const player = {x:WIDTH/2,y:HEIGHT-96,w:92,h:92,speed:470};

  function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
  function now(){ return performance.now(); }

  function resetGame(){
    score = 0;
    lives = MAX_LIVES;
    shots = [];
    enemies = [];
    particles = [];
    player.x = WIDTH / 2;
    spawnTimer = 250;
    lastShotAt = 0;
    bombUsed = false;
    invulnerableUntil = 0;
    touchPointerId = null;
    touchDriving = false;
    mouseDriving = false;
    keys.fire = false;
    bombBtn.disabled = false;
    bombCountEl.textContent = '×1';
    scoreEl.textContent = '0';
    livesEl.textContent = '♥ ♥ ♥';
    statusEl.textContent = 'MISSION LÄUFT';
  }

  function startGame(){
    resetGame();
    state = 'running';
    overlay.hidden = true;
    exitBtn.hidden = true;
    stage.classList.remove('arcade-ended');
    form.hidden = true;
    formStatus.textContent = '';
    lastTime = now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    root.focus({preventScroll:true});
  }

  function endGame(){
    touchPointerId = null;
    touchDriving = false;
    mouseDriving = false;
    keys.fire = false;
    state = 'gameover';
    statusEl.textContent = 'MISSION BEENDET';
    overlayKicker.textContent = 'MISSION BEENDET';
    overlayTitle.textContent = score.toLocaleString('de-DE') + ' PUNKTE';
    overlayCopy.textContent = score > 0 ? 'Trag deinen Funknamen ein und sichere deinen Highscore.' : 'Noch einmal starten und den Burger-Planeten verteidigen.';
    startBtn.textContent = 'NOCHMAL SPIELEN ↗';
    form.hidden = score <= 0;
    overlay.hidden = false;
    exitBtn.hidden = false;
    stage.classList.add('arcade-ended');
    cancelAnimationFrame(raf);
    if (score > 0) setTimeout(() => nameInput.focus(), 80);
  }

  function shoot(){
    if (state !== 'running') return;
    const t = now();
    if (t - lastShotAt < 235) return;
    lastShotAt = t;
    shots.push({x:player.x,y:player.y-44,vy:-720,size:31});
  }

  function useBomb(){
    if (state !== 'running' || bombUsed) return;
    const targets = enemies.filter(enemy => !enemy.dead);
    if (!targets.length) return;

    bombUsed = true;
    bombBtn.disabled = true;
    bombCountEl.textContent = 'VERBRAUCHT';
    stage.classList.remove('bomb-flash');
    void stage.offsetWidth;
    stage.classList.add('bomb-flash');

    targets.forEach(enemy => {
      enemy.dead = true;
      burst(enemy.x, enemy.y);
      score += 100;
    });
    enemies = enemies.filter(enemy => !enemy.dead);
    scoreEl.textContent = score.toLocaleString('de-DE');

    window.setTimeout(() => stage.classList.remove('bomb-flash'), 520);
  }

  function spawnEnemy(){
    const size = 48 + Math.random() * 24;
    enemies.push({
      id: nextId++,
      x: size/2 + Math.random() * (WIDTH-size),
      y: -size,
      w: size,
      h: size * .72,
      vy: 90 + Math.random()*80 + Math.min(115, score/60),
      drift:(Math.random()-.5)*55,
      phase:Math.random()*Math.PI*2
    });
  }

  function hit(a,b){
    return Math.abs(a.x-b.x) < (a.w+b.w)/2 && Math.abs(a.y-b.y) < (a.h+b.h)/2;
  }

  function burst(x,y){
    for(let i=0;i<12;i++){
      const angle=Math.random()*Math.PI*2;
      const speed=45+Math.random()*150;
      particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.55+Math.random()*.45,size:2+Math.random()*4});
    }
  }

  function renderLives(){
    livesEl.textContent = Array.from({length:MAX_LIVES},(_,i)=>i<lives?'♥':'♡').join(' ');
  }

  function loseLife(){
    const t = now();
    if (t < invulnerableUntil || state !== 'running') return false;

    lives = Math.max(0, lives - 1);
    invulnerableUntil = t + HIT_GRACE_MS;
    renderLives();

    if (lives <= 0){
      endGame();
    } else {
      statusEl.textContent = 'TREFFER · ' + lives + (lives === 1 ? ' LEBEN' : ' LEBEN');
      window.setTimeout(()=>{
        if(state === 'running') statusEl.textContent = 'MISSION LÄUFT';
      }, HIT_GRACE_MS);
    }
    return true;
  }

  function update(dt){
    const dir=(keys.left?-1:0)+(keys.right?1:0);
    player.x=clamp(player.x+dir*player.speed*dt,player.w/2+8,WIDTH-player.w/2-8);
    if(keys.fire || mouseDriving) shoot();

    shots.forEach(s=>s.y+=s.vy*dt);
    shots=shots.filter(s=>s.y>-50);

    spawnTimer -= dt*1000;
    if(spawnTimer<=0){
      spawnEnemy();
      const pace=Math.max(360,920-Math.min(500,score*.035));
      spawnTimer=pace*(.78+Math.random()*.42);
    }

    enemies.forEach(e=>{
      e.y+=e.vy*dt;
      e.x+=Math.sin(e.y/75+e.phase)*e.drift*dt;
      e.x=clamp(e.x,e.w/2,WIDTH-e.w/2);
    });

    for(const shot of shots){
      if(shot.dead) continue;
      for(const enemy of enemies){
        if(enemy.dead) continue;
        const shotBox={x:shot.x,y:shot.y,w:shot.size*.8,h:shot.size*.8};
        if(hit(shotBox,enemy)){
          shot.dead=true;
          enemy.dead=true;
          score+=100;
          scoreEl.textContent=score.toLocaleString('de-DE');
          burst(enemy.x,enemy.y);
          break;
        }
      }
    }
    shots=shots.filter(s=>!s.dead);

    for(const enemy of enemies){
      if(enemy.dead) continue;
      const playerBox={x:player.x,y:player.y,w:player.w*.72,h:player.h*.7};
      if(hit(playerBox,enemy)){
        enemy.dead=true;
        burst(enemy.x,enemy.y);
        loseLife();
        if(state!=='running') return;
      } else if(enemy.y-enemy.h/2>HEIGHT){
        enemy.dead=true;
        loseLife();
        if(state!=='running') return;
      }
    }
    enemies=enemies.filter(e=>!e.dead);

    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=45*dt;p.life-=dt;});
    particles=particles.filter(p=>p.life>0);
  }

  function drawStars(t){
    ctx.fillStyle='#050309';
    ctx.fillRect(0,0,WIDTH,HEIGHT);
    for(let i=0;i<58;i++){
      const x=(i*137)%WIDTH;
      const y=((i*71)+(t*.02*(1+(i%3))))%HEIGHT;
      const alpha=.18+(i%5)*.1;
      ctx.fillStyle='rgba(226,210,245,'+alpha+')';
      ctx.fillRect(x,y,i%9===0?2:1,i%9===0?2:1);
    }
    const grad=ctx.createRadialGradient(WIDTH*.5,HEIGHT*.9,20,WIDTH*.5,HEIGHT*.9,520);
    grad.addColorStop(0,'rgba(104,52,155,.19)');
    grad.addColorStop(1,'rgba(5,3,9,0)');
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,WIDTH,HEIGHT);
  }

  function drawEnemy(enemy){
    const w = enemy.w;
    const h = enemy.h;
    const pulse = .72 + Math.sin(now()/180 + enemy.phase) * .18;

    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    ctx.shadowColor = 'rgba(158,92,255,.42)';
    ctx.shadowBlur = Math.max(5, w * .12);

    const dome = ctx.createLinearGradient(0,-h*.48,0,h*.05);
    dome.addColorStop(0,'#d9fbff');
    dome.addColorStop(.45,'#7fe5f2');
    dome.addColorStop(1,'#7041b8');
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.ellipse(0,-h*.12,w*.27,h*.31,0,Math.PI,Math.PI*2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.38)';
    ctx.beginPath();
    ctx.ellipse(-w*.07,-h*.23,w*.07,h*.085,-.4,0,Math.PI*2);
    ctx.fill();

    const hull = ctx.createLinearGradient(0,-h*.08,0,h*.34);
    hull.addColorStop(0,'#eef2f7');
    hull.addColorStop(.38,'#9fa9b8');
    hull.addColorStop(.72,'#596170');
    hull.addColorStop(1,'#2a2238');
    ctx.fillStyle = hull;
    ctx.strokeStyle = '#e5d5ff';
    ctx.lineWidth = Math.max(1.5,w*.025);
    ctx.beginPath();
    ctx.ellipse(0,h*.05,w*.47,h*.22,0,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#24192f';
    ctx.beginPath();
    ctx.ellipse(0,h*.18,w*.31,h*.12,0,0,Math.PI*2);
    ctx.fill();

    const lightY = h*.17;
    const lights = [
      [-.25,'#ffcf5a'],
      [-.09,'#78f5ff'],
      [.09,'#c88bff'],
      [.25,'#72ff9f']
    ];
    lights.forEach(([offset,color])=>{
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = Math.max(4,w*.08);
      ctx.beginPath();
      ctx.arc(w*offset,lightY,Math.max(2,w*.035),0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    ctx.restore();
  }

  function drawPlayer(){
    ctx.save();
    ctx.translate(player.x,player.y);
    const flame=18+Math.sin(now()/75)*7;
    const g=ctx.createLinearGradient(0,36,0,36+flame);
    g.addColorStop(0,'rgba(223,179,255,.95)');
    g.addColorStop(1,'rgba(124,64,184,0)');
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(-15,34);ctx.lineTo(0,36+flame);ctx.lineTo(15,34);ctx.closePath();ctx.fill();
    if(logo.complete && logo.naturalWidth){
      ctx.drawImage(logo,-player.w/2,-player.h/2,player.w,player.h);
    }else{
      ctx.fillStyle='#b276ff';
      ctx.beginPath();ctx.arc(0,0,33,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function draw(){
    drawStars(now());
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    shots.forEach(s=>{
      ctx.save();
      ctx.shadowColor='#c79cff';
      ctx.shadowBlur=12;
      ctx.font=s.size+'px system-ui, Apple Color Emoji, Segoe UI Emoji';
      ctx.fillText('🍔',s.x,s.y);
      ctx.restore();
    });

    enemies.forEach(drawEnemy);

    particles.forEach(p=>{
      ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle='#d4adff';
      ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
    });

    drawPlayer();
  }

  function loop(t){
    if(state!=='running') return;
    const dt=Math.min(.035,(t-lastTime)/1000 || .016);
    lastTime=t;
    update(dt);
    draw();
    if(state==='running') raf=requestAnimationFrame(loop);
  }

  function getLocalScores(){
    try{
      const parsed=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');
      return Array.isArray(parsed)?parsed:[];
    }catch{return [];}
  }

  function saveLocalScore(name,value){
    const scores=getLocalScores();
    scores.push({name,score:value,created_at:new Date().toISOString()});
    scores.sort((a,b)=>Number(b.score)-Number(a.score));
    localStorage.setItem(LOCAL_KEY,JSON.stringify(scores.slice(0,10)));
  }

  function renderScores(scores,remote){
    board.replaceChildren();
    currentScores=(Array.isArray(scores)?scores:[])
      .map(s=>({name:String(s.name||'Erdling').slice(0,24),score:Number(s.score)||0}))
      .filter(s=>s.score>=0)
      .sort((a,b)=>b.score-a.score)
      .slice(0,25);

    const clean=boardExpanded ? currentScores : currentScores.slice(0,10);

    if(!clean.length){
      const li=document.createElement('li');
      li.className='arcade-board-empty';
      li.textContent='Noch kein Highscore. Hol dir Platz 1.';
      board.append(li);
      boardMoreBtn.hidden=true;
      return;
    }

    clean.forEach(item=>{
      const li=document.createElement('li');
      const name=document.createElement('strong');
      const points=document.createElement('span');
      name.textContent=item.name;
      points.textContent=item.score.toLocaleString('de-DE');
      li.append(document.createTextNode(''),name,points);
      board.append(li);
    });

    boardMoreBtn.hidden=currentScores.length<=10;
    if(!boardMoreBtn.hidden){
      boardMoreBtn.textContent=boardExpanded?'TOP 10 ANZEIGEN ↑':'TOP 25 ANZEIGEN ↓';
      boardMoreBtn.setAttribute('aria-expanded',String(boardExpanded));
    }

    const note=root.querySelector('[data-game-board-note]');
    if(note) note.textContent=remote?'Globale Bestenliste · gespeichert werden maximal die Top 25.':'Aktuell lokaler Highscore auf diesem Gerät.';
  }

  async function fetchRemoteScores(){
    const res=await fetch(API+'/game/highscores',{cache:'no-store'});
    if(!res.ok) throw new Error('remote_unavailable');
    const data=await res.json();
    return Array.isArray(data.scores)
      ? data.scores
      : (Array.isArray(data.highscores) ? data.highscores : []);
  }

  async function postRemoteScore(name,value,createdAt=''){
    const payload={name,score:value};
    if(createdAt) payload.created_at=createdAt;

    const res=await fetch(API+'/game/highscores',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('save_failed');
    return res.json();
  }

  async function syncLocalScores(){
    const local=getLocalScores()
      .map(item=>({
        name:String(item.name||'').trim().replace(/\s+/g,' ').slice(0,24),
        score:Number(item.score),
        created_at:String(item.created_at||'')
      }))
      .filter(item=>item.name && Number.isInteger(item.score) && item.score>=0 && item.score%100===0)
      .slice(0,10);

    if(!local.length) return false;

    for(const item of local){
      await postRemoteScore(item.name,item.score,item.created_at);
    }

    try{ localStorage.removeItem(LOCAL_KEY); }catch{}
    return true;
  }

  async function loadScores(){
    try{
      let scores=await fetchRemoteScores();

      try{
        const synced=await syncLocalScores();
        if(synced) scores=await fetchRemoteScores();
      }catch{
        // Lokale Scores bleiben erhalten und werden beim nächsten Besuch erneut versucht.
      }

      renderScores(scores,true);
      return true;
    }catch{
      renderScores(getLocalScores(),false);
      return false;
    }
  }

  async function submitScore(event){
    event.preventDefault();
    const name=String(nameInput.value||'').trim().replace(/\s+/g,' ').slice(0,24);
    if(!name){formStatus.textContent='Bitte erst deinen Funknamen eingeben.';return;}
    const value=score;
    const submit=form.querySelector('button[type="submit"]');
    submit.disabled=true;
    formStatus.textContent='Highscore wird gespeichert …';

    let remoteSaved=false;
    let qualified=true;
    let cutoff=0;
    try{
      const result=await postRemoteScore(name,value);
      qualified=result.qualified!==false;
      cutoff=Number(result.cutoff||0);
      remoteSaved=qualified;
    }catch{
      saveLocalScore(name,value);
    }

    await loadScores();
    if(!qualified){
      formStatus.textContent='Knapp vorbei: Für die Top 25 brauchst du mehr als '+cutoff.toLocaleString('de-DE')+' Punkte.';
    }else{
      formStatus.textContent=remoteSaved?'Highscore global gespeichert. Willkommen in der Galaxis.':'Highscore auf diesem Gerät gespeichert. Die globale Verbindung ist gerade nicht erreichbar.';
    }
    submit.disabled=false;
    form.hidden=true;
  }

  function canvasPoint(event){
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (WIDTH / rect.width),
      y: (event.clientY - rect.top) * (HEIGHT / rect.height)
    };
  }

  function touchCanGrabPlayer(point){
    const grabWidth = Math.max(130, player.w * 1.7);
    const grabHeight = Math.max(130, player.h * 1.7);
    return Math.abs(point.x - player.x) <= grabWidth / 2 &&
      Math.abs(point.y - player.y) <= grabHeight / 2;
  }

  function movePlayerToTouch(event){
    const point = canvasPoint(event);
    player.x = clamp(point.x, player.w/2 + 8, WIDTH - player.w/2 - 8);
  }

  function movePlayerToMouse(event){
    const point = canvasPoint(event);
    player.x = clamp(point.x, player.w/2 + 8, WIDTH - player.w/2 - 8);
  }

  function setHeld(button,key){
    const down=e=>{e.preventDefault();keys[key]=true;if(key==='fire')shoot();};
    const up=e=>{e.preventDefault();keys[key]=false;};
    button.addEventListener('pointerdown',down);
    button.addEventListener('pointerup',up);
    button.addEventListener('pointercancel',up);
    button.addEventListener('pointerleave',up);
  }

  root.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea,button')) return;
    if(e.code==='ArrowLeft'||e.code==='KeyA'){mouseDriving=false;keys.left=true;e.preventDefault();}
    if(e.code==='ArrowRight'||e.code==='KeyD'){mouseDriving=false;keys.right=true;e.preventDefault();}
    if(e.code==='Space'){keys.fire=true;shoot();e.preventDefault();}
  });
  root.addEventListener('keyup',e=>{
    if(e.code==='ArrowLeft'||e.code==='KeyA') keys.left=false;
    if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=false;
    if(e.code==='Space') keys.fire=false;
  });

  setHeld(leftBtn,'left');
  setHeld(rightBtn,'right');
  setHeld(fireBtn,'fire');
  bombBtn.addEventListener('pointerdown',e=>{
    e.preventDefault();
    e.stopPropagation();
    lastBombPointerAt = now();
    useBomb();
  });
  bombBtn.addEventListener('click',e=>{
    if(e.detail === 0 || now() - lastBombPointerAt > 500) useBomb();
  });
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse') return;

    if(e.pointerType==='touch' || e.pointerType==='pen'){
      if(state!=='running' || touchPointerId!==null) return;
      const point = canvasPoint(e);
      if(!touchCanGrabPlayer(point)) return;

      e.preventDefault();
      touchPointerId = e.pointerId;
      touchDriving = true;
      movePlayerToTouch(e);
      keys.fire = true;
      shoot();
      try{ canvas.setPointerCapture(e.pointerId); }catch{}
    }
  });

  canvas.addEventListener('pointermove',e=>{
    if(e.pointerType==='mouse') return;

    if(!touchDriving || e.pointerId!==touchPointerId) return;
    e.preventDefault();
    movePlayerToTouch(e);
  });

  const releaseTouchDrive = e=>{
    if(e.pointerId!==touchPointerId) return;
    e.preventDefault();
    touchDriving = false;
    touchPointerId = null;
    keys.fire = false;
    try{
      if(canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    }catch{}
  };

  canvas.addEventListener('mousedown',e=>{
    if(state!=='running') return;

    if(e.button===0){
      e.preventDefault();
      mouseDriving=true;
      movePlayerToMouse(e);
      shoot();
      root.focus({preventScroll:true});
      return;
    }

    if(e.button===2){
      e.preventDefault();
      useBomb();
    }
  });

  canvas.addEventListener('mousemove',e=>{
    if(!mouseDriving || state!=='running') return;
    movePlayerToMouse(e);
  });

  window.addEventListener('mouseup',e=>{
    if(e.button===0){
      mouseDriving=false;
    }
  });

  canvas.addEventListener('contextmenu',e=>{
    e.preventDefault();
  });

  canvas.addEventListener('pointerup',releaseTouchDrive);
  canvas.addEventListener('pointercancel',releaseTouchDrive);
  canvas.addEventListener('lostpointercapture',e=>{
    if(e.pointerId!==touchPointerId) return;
    touchDriving = false;
    touchPointerId = null;
    keys.fire = false;
  });
  exitBtn.addEventListener('click',()=>{
    mouseDriving=false;
    touchDriving=false;
    touchPointerId=null;
    keys.fire=false;
    stage.classList.add('arcade-ended');
    const menu=document.querySelector('#speisekarte');
    if(menu) menu.scrollIntoView({behavior:'smooth',block:'start'});
    else window.location.hash='speisekarte';
  });

  startBtn.addEventListener('click',()=>{
    if(state==='paused'){
      state='running';
      overlay.hidden=true;
      lastTime=now();
      startBtn.textContent='MISSION STARTEN ↗';
      root.focus({preventScroll:true});
      raf=requestAnimationFrame(loop);
      return;
    }
    startGame();
  });
  boardMoreBtn.addEventListener('click',()=>{
    boardExpanded=!boardExpanded;
    renderScores(currentScores,true);
  });
  form.addEventListener('submit',submitScore);

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && state==='running'){
      state='paused';
      mouseDriving=false;
      cancelAnimationFrame(raf);
      overlayKicker.textContent='MISSION PAUSIERT';
      exitBtn.hidden=true;
      stage.classList.remove('arcade-ended');
      overlayTitle.textContent='KURZE FUNKSTILLE';
      overlayCopy.textContent='Zurück zur Mission?';
      form.hidden=true;
      startBtn.textContent='MISSION FORTSETZEN ↗';
      overlay.hidden=false;
    }
  });


  draw();
  loadScores();
})();
