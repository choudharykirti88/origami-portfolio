(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const canvas = $('#pond');
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, dpr = 1, last = 0, frame = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Water layer: procedurally animated refraction, caustics, glints,
  // click/pointer ripples and wakes following each floating origami boat.
  const ripples = [];
  const reduceDensity = window.matchMedia('(max-width: 650px)').matches;
  const petals = Array.from({length: reduceMotion ? 10 : reduceDensity ? 28 : 55}, (_, i) => ({
    x: Math.random(), y: Math.random(), size: 2.2 + Math.random() * 5.5,
    speed: .07 + Math.random() * .19, phase: Math.random() * 6.28,
    color: ['#fff8eb','#f6d8ca','#ffffff','#e9edcb'][i % 4]
  }));
  const boatElements = [...document.querySelectorAll('.boat')];
  const boatHistory = new Map();
  const sparkles = Array.from({length: reduceDensity ? 24 : 60}, () => ({
    x:Math.random(),y:Math.random(),phase:Math.random()*Math.PI*2,size:1+Math.random()*2.2
  }));
  let twilight = false;
  let soundOn = false, audioContext, oscillators = [];
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  let pointer = {x:-999,y:-999};

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    boatHistory.clear();
  }
  function ripple(x, y, strength = 1, wake = false) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ripples.push({x,y,r:wake?8:2,life:1,strength,wake});
    if (ripples.length > 65) ripples.splice(0, ripples.length - 65);
  }
  function drawWaterBase(t) {
    const fill = ctx.createLinearGradient(0,0,width,height);
    if (twilight) {
      fill.addColorStop(0,'#b5b3ce');fill.addColorStop(.5,'#739eb0');fill.addColorStop(1,'#326e87');
    } else {
      fill.addColorStop(0,'#e7f1dd');fill.addColorStop(.43,'#b4dfcf');fill.addColorStop(1,'#70bcba');
    }
    ctx.fillStyle=fill;ctx.fillRect(0,0,width,height);
    const light = ctx.createRadialGradient(width*.34,height*.15,10,width*.46,height*.37,Math.max(width,height)*.82);
    light.addColorStop(0,twilight?'rgba(255,220,189,.20)':'rgba(255,255,236,.42)');
    light.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=light;ctx.fillRect(0,0,width,height);

    // Layered, slowly shifting sine wave bands. Vertical shape is deliberately shallow.
    const step = reduceDensity ? 14 : 10;
    for(let band=0;band<23;band++) {
      const y0=(band+.5)*height/23;
      ctx.beginPath();
      for(let x=-step;x<=width+step;x+=step){
        const y=y0 + Math.sin(x*.011+t*.85+band*.73)*8
                   + Math.sin(x*.025-t*.58+band*1.7)*3;
        if(x===-step)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=twilight?'rgba(230,242,249,.11)':'rgba(255,255,240,.19)';
      ctx.lineWidth=band%4===0?2.3:1.05;
      ctx.stroke();
    }
    // Animated caustic threads: underwater light patterns that continuously deform.
    const spacing=reduceDensity?76:56;
    for(let row=-1;row<Math.ceil(height/spacing)+1;row++){
      for(let col=-1;col<Math.ceil(width/spacing)+1;col++){
        const cx=col*spacing + Math.sin(t*.43+row*.8+col*.5)*15;
        const cy=row*spacing + Math.cos(t*.52+col*.9+row*.3)*12;
        const radius=spacing*(.38+Math.sin(t*.6+row+col)*.09);
        ctx.beginPath();
        ctx.moveTo(cx-radius,cy);
        ctx.bezierCurveTo(cx-radius*.45,cy-radius*.35,cx+radius*.30,cy-radius*.45,cx+radius,cy);
        ctx.bezierCurveTo(cx+radius*.39,cy+radius*.29,cx-radius*.35,cy+radius*.41,cx-radius,cy);
        ctx.strokeStyle=twilight?'rgba(221,239,245,.085)':'rgba(255,255,239,.16)';
        ctx.lineWidth=1.5;ctx.stroke();
      }
    }
  }
  function draw(now = 0) {
    const dt = Math.min(Math.max((now-last)/1000 || .016,0),.05);last=now;
    frame += dt;
    const t=frame;
    ctx.clearRect(0,0,width,height);
    if (!window.__pondWebGLActive) drawWaterBase(t);

    for(const glint of sparkles){
      const x=glint.x*width+Math.sin(t*.6+glint.phase)*14;
      const y=glint.y*height+Math.cos(t*.52+glint.phase)*10;
      const alpha=Math.pow(Math.max(0,Math.sin(t*1.45+glint.phase)),4)*.52;
      ctx.strokeStyle=`rgba(255,255,245,${alpha})`;
      ctx.lineWidth=1;ctx.beginPath();
      ctx.moveTo(x-glint.size*2,y);ctx.lineTo(x+glint.size*2,y);
      ctx.moveTo(x,y-glint.size);ctx.lineTo(x,y+glint.size);ctx.stroke();
    }
    for(const p of petals){
      const x=((p.x*width + t*p.speed*23 + Math.sin(t*.48+p.phase)*22)%(width+30));
      const y=((p.y*height + t*p.speed*11 + Math.cos(t*.55+p.phase)*12)%(height+30));
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*.64+p.phase)*.7);
      ctx.fillStyle=p.color;ctx.globalAlpha=.54;ctx.beginPath();
      ctx.ellipse(0,0,p.size*.52,p.size,.5,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    // Very small periodic wakes under moving boats, even without cursor input.
    if(!reduceMotion && Math.floor(t*2.7)!==Math.floor((t-dt)*2.7)){
      const rect=canvas.getBoundingClientRect();
      for(const boat of boatElements){
        const b=boat.getBoundingClientRect();
        if(b.width && b.height && b.bottom>rect.top && b.top<rect.bottom){
          const x=b.left+b.width*.5-rect.left;
          const y=b.top+b.height*.45-rect.top;
          const lastPos=boatHistory.get(boat);
          if(!lastPos || Math.hypot(x-lastPos.x,y-lastPos.y)>1.5){
            ripple(x,y,.42,true);
          }
          boatHistory.set(boat,{x,y});
        }
      }
    }
    for(let i=ripples.length-1;i>=0;i--){
      const r=ripples[i];r.r+=dt*(r.wake?38:108+32*r.strength);
      r.life-=dt*(r.wake?.9:.72);
      if(r.life<=0){ripples.splice(i,1);continue;}
      for(let ring=0;ring<(r.wake?2:4);ring++){
        const rad=r.r-ring*(r.wake?8:13);if(rad<=1)continue;
        ctx.beginPath();ctx.ellipse(r.x,r.y,rad,rad*.42,0,0,Math.PI*2);
        const alpha=r.life*(r.wake?.19:.38)*(1-ring*.21);
        ctx.strokeStyle=`rgba(255,255,249,${alpha})`;
        ctx.lineWidth=ring===0?2.4:1.25;ctx.stroke();
        if(ring===0){
          ctx.beginPath();ctx.ellipse(r.x,r.y+2,rad+3,(rad+3)*.42,0,0,Math.PI*2);
          ctx.strokeStyle=`rgba(29,111,111,${alpha*.23})`;ctx.lineWidth=1;ctx.stroke();
        }
      }
    }
    if(!reduceMotion)requestAnimationFrame(draw);
  }
  window.addEventListener('resize',resize,{passive:true});resize();
  if(reduceMotion)draw(0);else requestAnimationFrame(draw);
  let lastRippleAt=0;
  const app=canvas.closest('.app');
  app.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch'||reduceMotion)return;
    const rect=canvas.getBoundingClientRect();
    pointer={x:e.clientX-rect.left,y:e.clientY-rect.top};
    const now=performance.now();
    if(now-lastRippleAt>88){ripple(pointer.x,pointer.y,.56);lastRippleAt=now;}
  },{passive:true});
  app.addEventListener('pointerdown',e=>{
    const rect=canvas.getBoundingClientRect();
    ripple(e.clientX-rect.left,e.clientY-rect.top,1.5);
    if(reduceMotion)draw(0);
  },{passive:true});

  const views=['time','places','projects','shop','ask','socials'];
  const titles={time:'time tracker',places:"where i've been",projects:'my projects',shop:'tiny shop',ask:'ask me anything',socials:'socials'};
  let currentView=null;
  let lastFocused=null;
  const panel=$('#panel'), backdrop=$('#backdrop'), content=$('#panelContent');
  function openView(view){
    if(!views.includes(view))return;
    lastFocused=document.activeElement;
    currentView=view;
    $('#panelTitle').textContent=titles[view];
    $('#panelIndex').textContent=String(views.indexOf(view)+1).padStart(2,'0');
    content.replaceChildren($('#tpl-'+view).content.cloneNode(true));
    backdrop.hidden=false; panel.classList.add('is-open'); panel.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    panel.focus();
    if(view==='time')setupTimer();
    if(view==='ask')setupAsk();
    if(view==='shop')setupShop();
    window.location.hash=view;
  }
  function closeView(){
    currentView=null;
    panel.classList.remove('is-open');panel.setAttribute('aria-hidden','true');backdrop.hidden=true;
    document.body.style.overflow='';
    if(lastFocused && lastFocused.isConnected)lastFocused.focus();
    if(location.hash!=='#home')history.replaceState(null,'',location.pathname+location.search+'#home');
  }
  $$('.boat').forEach(boat=>{
    boat.addEventListener('click',()=>openView(boat.dataset.view));
    boat.addEventListener('pointerenter',()=>{const r=boat.getBoundingClientRect(),c=canvas.getBoundingClientRect();ripple(r.left+r.width/2-c.left,r.top+r.height/2-c.top,1.4)});
  });
  $('#closePanel').addEventListener('click',closeView);
  backdrop.addEventListener('click',closeView);
  $('#brand').addEventListener('click',e=>{if(currentView){e.preventDefault();closeView();}});
  $('#nextPanel').addEventListener('click',()=>openView(views[(views.indexOf(currentView)+1)%views.length]));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&currentView)closeView();
    if(e.key==='Tab'&&currentView){let items=$$('a[href],button:not([disabled]),textarea',panel).filter(el=>el.getClientRects().length);if(items.length){let first=items[0],end=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();end.focus()}else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first.focus()}}}
  });
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(views.includes(view)&&view!==currentView)openView(view);else if(!views.includes(view)&&currentView)closeView()});
  $('#quickNav').addEventListener('click',()=>openView('projects'));

  // Timer state is persistent across views, but resets on reload.
  let timerTotal=300,timerRemaining=300,timerRunning=false,timerEndsAt=0,timerInterval=null;
  const fmt=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function updateTimerDisplay(){const el=$('#trackerClock');if(el)el.textContent=fmt(timerRemaining);const btn=$('#startTimer');if(btn)btn.textContent=timerRunning?'pause & breathe Ⅱ':timerRemaining===0?'start again →':'start focusing →'}
  function syncTimer(){if(!timerRunning)return;timerRemaining=Math.max(0,Math.ceil((timerEndsAt-Date.now())/1000));if(timerRemaining===0){timerRunning=false;clearInterval(timerInterval);notify('a lovely little session finished ✳');}updateTimerDisplay()}
  function setupTimer(){syncTimer();updateTimerDisplay();$$('[data-minutes]',content).forEach(btn=>{btn.classList.toggle('active',+btn.dataset.minutes*60===timerTotal);btn.addEventListener('click',()=>{timerTotal=+btn.dataset.minutes*60;timerRemaining=timerTotal;timerRunning=false;clearInterval(timerInterval);$$('[data-minutes]',content).forEach(b=>b.classList.toggle('active',b===btn));updateTimerDisplay()})});$('#startTimer').addEventListener('click',()=>{if(timerRunning){syncTimer();timerRunning=false;clearInterval(timerInterval)}else{if(timerRemaining===0)timerRemaining=timerTotal;timerRunning=true;timerEndsAt=Date.now()+timerRemaining*1000;timerInterval=setInterval(syncTimer,250)}updateTimerDisplay()});$('#resetTimer').addEventListener('click',()=>{timerRunning=false;clearInterval(timerInterval);timerRemaining=timerTotal;updateTimerDisplay()})}

  const inboxKey='paperpond_notes_v1';
  function safeNotes(){try{const parsed=JSON.parse(localStorage.getItem(inboxKey)||'[]');return Array.isArray(parsed)?parsed.slice(0,20):[]}catch{return[]}}
  function showNotes(){const root=$('#inboxItems');if(!root)return;root.replaceChildren();const notes=safeNotes();if(!notes.length){const p=document.createElement('p');p.className='panel-caption';p.textContent='the first note could be yours ♡';root.appendChild(p)}notes.forEach(note=>{const card=document.createElement('article');card.className='inbox-note';const time=document.createElement('small');time.textContent=`anonymous · ${note.date}`;const message=document.createElement('p');message.textContent=note.text;card.append(time,message);root.append(card)})}
  function setupAsk(){const field=$('#askMessage');field.addEventListener('input',()=>{$('#charCounter').textContent=`${field.value.length} / 700`});$('#askForm').addEventListener('submit',e=>{e.preventDefault();const value=field.value.trim();if(!value)return;const notes=safeNotes();notes.unshift({text:value.slice(0,700),date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})});try{localStorage.setItem(inboxKey,JSON.stringify(notes.slice(0,20)));$('#formStatus').textContent='your little note is saved in this browser ♡';field.value='';$('#charCounter').textContent='0 / 700';showNotes()}catch{$('#formStatus').textContent='your browser blocked local storage, so this note was not saved'}});showNotes()}

  function setupShop(){$$('[data-wallpaper]',content).forEach(btn=>btn.addEventListener('click',()=>{const kind=btn.dataset.wallpaper;const peach=kind==='kind';const bg=peach?'#F6D5D0':'#DCE9C9',text=peach?'#A85C78':'#567B62',title=peach?'be kind to you':'small joys club',shape=peach?'✿':'✳';const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="${bg}"/><circle cx="540" cy="900" r="360" fill="#FFFFFF" opacity=".20"/><text x="540" y="750" text-anchor="middle" fill="${text}" font-size="230">${shape}</text><text x="540" y="990" text-anchor="middle" fill="${text}" font-family="Georgia,serif" font-size="82">${title}</text><text x="540" y="1060" text-anchor="middle" fill="${text}" font-family="Georgia,serif" font-size="45">a little reminder ♡</text></svg>`;const blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`paperpond-${kind}-wallpaper.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);notify('your wallpaper is ready ♡')}) )}

  let toastTimeout;
  function notify(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('show'),3300)}
  function tickClock(){const date=new Date();$('#localClock').textContent=date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:true}).toLowerCase()+' · wherever you are'}tickClock();setInterval(tickClock,30000);
  $('#modeBtn').addEventListener('click',()=>{twilight=!twilight;$('#app').classList.toggle('is-twilight',twilight);$('#modeBtn').innerHTML=twilight?'☾ <span>twilight pond</span>':'☀ <span>golden hour</span>';notify(twilight?'the pond is dreaming ✧':'welcome back to the sunshine ☀')});
  $('#soundBtn').addEventListener('click',async()=>{
    soundOn=!soundOn;
    const btn=$('#soundBtn');btn.setAttribute('aria-pressed',String(soundOn));btn.innerHTML=soundOn?'<span>♫</span><em>sound on</em>':'<span>♫</span><em>sound off</em>';
    if(soundOn){try{audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)();await audioContext.resume();const master=audioContext.createGain();master.gain.value=.012;master.connect(audioContext.destination);oscillators=[];[174.6,261.6,349.2].forEach((frequency,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.value=[.5,.23,.15][i];osc.connect(gain);gain.connect(master);osc.start();oscillators.push({osc,gain,master})});notify('a soft ambient hum is playing ♫')}catch{soundOn=false;btn.setAttribute('aria-pressed','false');notify('audio is unavailable in this browser')}}else{oscillators.forEach(({osc,master})=>{try{master.gain.setTargetAtTime(0,audioContext.currentTime,.12);setTimeout(()=>{try{osc.stop()}catch{}},500)}catch{}});oscillators=[]}
  });
  window.addEventListener('load',()=>{setTimeout(()=>$('#loader').classList.add('is-hidden'),800);const view=location.hash.slice(1);if(views.includes(view))setTimeout(()=>openView(view),1000)});
  // Fallback if the external font CDN is unavailable or page load stalls.
  setTimeout(()=>$('#loader').classList.add('is-hidden'),2400);
})();
