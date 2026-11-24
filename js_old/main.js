(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const canvas = $('#pond');
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, dpr = 1, last = 0, frame = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touches = [];
  const petals = Array.from({length: reduceMotion ? 16 : 75}, (_, i) => ({
    x: Math.random(), y: Math.random(), size: 2.5 + Math.random() * 7,
    speed: .12 + Math.random() * .45, drift: Math.random() * 6.28,
    color: ['#f7d1bc','#ffffff','#edc9d3','#d6e9c8'][i % 4], spin: Math.random() * 7
  }));
  const bubbles = Array.from({length: 28}, () => ({x: Math.random(),y:Math.random(),r:2+Math.random()*6,t:Math.random()*10}));
  let pointer = {x:-999,y:-999};
  let hoveredBoat = false;
  let twilight = false;
  let soundOn = false, audioContext, oscillators = [];
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function ripple(x, y, strength = 1) {
    touches.push({x,y,r:0,life:1,s:strength});
    if (touches.length > 36) touches.shift();
  }
  function draw(now = 0) {
    const dt = Math.min((now-last)/1000 || .016,.05); last = now;
    frame += dt;
    ctx.clearRect(0,0,width,height);
    // Soft moving elliptical currents produce a watery scene without bitmap assets.
    for(let i=0;i<13;i++) {
      const x = ((i*187 + frame*(i%2 ? 2.8:-2.5)) % (width+500)+width+500)%(width+500)-250;
      const y = (height*.15 + i*97) % Math.max(height,1);
      ctx.beginPath(); ctx.ellipse(x,y,110+i%3*38,19+i%4*4,-.12,0,Math.PI*2);
      ctx.strokeStyle = twilight ? 'rgba(244,229,218,.09)' : 'rgba(255,255,255,.20)';
      ctx.lineWidth=1.5; ctx.stroke();
    }
    // Animated glints and drifting paper petals.
    for(const p of petals) {
      const x=(p.x*width + Math.sin(frame*.33+p.drift)*38 + frame*p.speed*8)%(width+25);
      const y=(p.y*height + Math.cos(frame*.45+p.drift)*15 + frame*p.speed*6)%(height+25);
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(frame*.7+p.spin)*.5);
      ctx.fillStyle=p.color;ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(0,0,p.size*.57,p.size,Math.PI/4,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(const b of bubbles){let x=b.x*width+Math.sin(frame+b.t)*8,y=b.y*height+Math.sin(frame*.5+b.t)*13;ctx.beginPath();ctx.arc(x,y,b.r,0,Math.PI*2);ctx.strokeStyle=twilight?'rgba(255,220,204,.15)':'rgba(255,255,255,.28)';ctx.lineWidth=1;ctx.stroke()}
    for(let i=touches.length-1;i>=0;i--){const r=touches[i];r.r+=dt*(110+50*r.s);r.life-=dt*.65; if(r.life<=0){touches.splice(i,1);continue;} for(let j=0;j<3;j++){ctx.beginPath();ctx.ellipse(r.x,r.y,r.r-j*17,r.r*.33-j*5,0,0,Math.PI*2);ctx.lineWidth=1.3;ctx.strokeStyle=`rgba(255,255,245,${r.life*(.43-j*.12)})`;ctx.stroke()}}
    if(!reduceMotion)requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize, {passive:true});resize();
  if(reduceMotion)draw(0);else requestAnimationFrame(draw);
  let lastRippleAt=0;
  canvas.closest('.app').addEventListener('pointermove', e => {
    if(e.pointerType==='touch')return;
    const rect=canvas.getBoundingClientRect();pointer={x:e.clientX-rect.left,y:e.clientY-rect.top};
    const now=performance.now();if(now-lastRippleAt>65){ripple(pointer.x,pointer.y,.43);lastRippleAt=now;}
  });
  canvas.closest('.app').addEventListener('pointerdown',e=>{const rect=canvas.getBoundingClientRect();ripple(e.clientX-rect.left,e.clientY-rect.top,1.5)});

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
