/* WebGL 1 water shader; original procedural animation, with 2D fallback. */
(() => {
  'use strict';
  const layer = document.querySelector('.app');
  const overlay = document.getElementById('pond');
  if (!layer || !overlay || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'waterGL';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  layer.insertBefore(canvas,overlay);
  let gl;
  try { gl = canvas.getContext('webgl', {alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'}); } catch(e) {}
  if(!gl) {canvas.remove();return;}
  const vertex = `attribute vec2 aPosition; varying vec2 vUv; void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
  const fragment = `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize;
uniform float uTime;
uniform float uNight;
uniform vec3 uRipples[12];
uniform float uAspect;
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
vec2 hash22(vec2 p){return vec2(hash21(p),hash21(p+31.7));}
float wave(vec2 p,float t){
  float w=0.;
  w+=sin(p.x*9.+p.y*4.4+t*.83)*.24;
  w+=sin(p.x*5.2-p.y*8.3-t*1.12)*.27;
  w+=sin(p.x*17.3+p.y*13.7+t*1.46)*.11;
  w+=sin(length(p-vec2(.32,.57))*17.-t*.53)*.12;
  return w;
}
float rippleHeight(vec2 uv){
  vec2 position=uv;position.x*=uAspect;
  float h=0.;
  for(int i=0;i<12;i++){
    vec3 r=uRipples[i];
    if(r.z>0.){
      vec2 center=vec2(r.x*uAspect,r.y);
      float dist=length(position-center);
      float age=r.z;
      float front=age*.38;
      float envelope=exp(-pow((dist-front)*16.,2.))*exp(-age*1.4);
      h+=sin((dist-front)*75.)*envelope*.12;
    }
  }
  return h;
}
float liquidHeight(vec2 p){return wave(p,uTime)+rippleHeight(p);}
// Voronoi edges form the constantly morphing net-like sunlight caustics.
float cellular(vec2 p,float t){
  vec2 i=floor(p),f=fract(p);
  float d1=9.,d2=9.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y));
    vec2 rnd=hash22(i+o);
    vec2 q=o+.5+.39*sin(t*.46+rnd*6.283)-f;
    float d=dot(q,q);
    if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
  }
  return max(0.,sqrt(d2)-sqrt(d1));
}
void main(){
  vec2 uv=vUv;
  vec2 p=uv*vec2(uAspect,1.);
  float t=uTime;
  float eps=.004;
  float h=liquidHeight(p);
  vec2 grad=vec2(liquidHeight(p+vec2(eps,0.))-h,liquidHeight(p+vec2(0.,eps))-h)/eps;
  // Refracted UV coordinates and slowly flowing wave normal.
  vec2 refraction=grad*.0034;
  vec2 q=p+refraction+vec2(t*.013,-t*.008);
  float c1=cellular(q*10.5,t);
  float c2=cellular((q+vec2(5.7,3.2))*17.2,-t*.7);
  float lines=pow(1.-smoothstep(.01,.23,c1),7.)*.65
             +pow(1.-smoothstep(.015,.2,c2),9.)*.34;
  float deep=clamp(uv.y*.77 + uv.x*.27,0.,1.);
  vec3 mint=mix(vec3(.75,.91,.81),vec3(.25,.63,.64),deep);
  vec3 night=mix(vec3(.38,.56,.66),vec3(.10,.31,.45),deep);
  vec3 color=mix(mint,night,uNight);
  float broad=wave(q*.51,t*.5);
  color+=broad*.036;
  color+=vec3(.77,.97,.87)*lines*mix(.28,.20,uNight);
  vec3 normal=normalize(vec3(-grad*.12,1.));
  vec3 lightDir=normalize(vec3(-.35,.5,1.));
  float spec=pow(max(dot(reflect(-lightDir,normal),normalize(vec3(.07,.12,1.))),0.),35.);
  color+=vec3(.93,1.,.90)*spec*.25;
  // Wide soft skylight reflection across the water.
  float sky=exp(-pow((uv.x-.23-sin(uv.y*8.+t*.22)*.03)*2.1,2.))*exp(-pow((uv.y-.80)*2.5,2.));
  color+=vec3(.9,.91,.76)*sky*.13;
  // Shimmering pinpricks - limited and softened to prevent visual noise.
  vec2 sparkleGrid=floor((q+refraction*.5)*vec2(85.,61.));
  float star=hash21(sparkleGrid);
  float twinkle=pow(max(0.,sin(t*2.4+star*24.)),14.);
  float stars=step(.991,star)*twinkle;
  color+=vec3(1.,1.,.90)*stars*.35;
  color=mix(color,color*vec3(.80,.87,1.0),uNight*.35);
  gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;
  function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
  let program;
  try{
    program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  }catch(e){console.warn('Water shader unavailable; using 2D water fallback.',e);canvas.remove();return;}
  gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const attr=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
  const uSize=gl.getUniformLocation(program,'uSize'),uTime=gl.getUniformLocation(program,'uTime'),uNight=gl.getUniformLocation(program,'uNight'),uAspect=gl.getUniformLocation(program,'uAspect'),uRipples=gl.getUniformLocation(program,'uRipples[0]');
  const ripples=[];const boats=[...document.querySelectorAll('.boat')];const MAX_RIPPLES=12;
  const data=new Float32Array(MAX_RIPPLES*3);
  const start=performance.now();let previous=start, wakeAt=0, width=1,height=1,active=true;
  let quality=Math.min(devicePixelRatio||1,1.1)*(innerWidth<700?.65:.82);
  quality=Math.max(.55,quality);
  function resize(){const r=canvas.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);canvas.width=Math.max(1,Math.floor(width*quality));canvas.height=Math.max(1,Math.floor(height*quality));gl.viewport(0,0,canvas.width,canvas.height);}
  function addRipple(clientX,clientY,power=1){const rect=canvas.getBoundingClientRect();const x=(clientX-rect.left)/rect.width,y=1-(clientY-rect.top)/rect.height;if(!Number.isFinite(x)||!Number.isFinite(y)||x<-.1||x>1.1||y<-.1||y>1.1)return;ripples.push({x,y,age:.01,power});if(ripples.length>MAX_RIPPLES)ripples.shift();}
  let lastPointer=0;
  layer.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const now=performance.now();if(now-lastPointer>95){addRipple(e.clientX,e.clientY,.6);lastPointer=now;}},{passive:true});
  layer.addEventListener('pointerdown',e=>addRipple(e.clientX,e.clientY,1.5),{passive:true});
  function draw(now){if(!active)return;const dt=Math.min(.05,(now-previous)/1000);previous=now;
    for(let i=ripples.length-1;i>=0;i--){ripples[i].age+=dt;if(ripples[i].age>2.15)ripples.splice(i,1);}
    if(now-wakeAt>600){wakeAt=now;boats.forEach(b=>{const r=b.getBoundingClientRect();if(r.width>0&&r.height>0)addRipple(r.left+r.width*.5,r.top+r.height*.52,.3)});}
    data.fill(0);ripples.forEach((r,i)=>{data[i*3]=r.x;data[i*3+1]=r.y;data[i*3+2]=r.age});
    gl.uniform1f(uTime,(now-start)/1000);gl.uniform1f(uNight,layer.classList.contains('is-twilight')?1:0);gl.uniform2f(uSize,width,height);gl.uniform1f(uAspect,width/height);gl.uniform3fv(uRipples,data);
    gl.drawArrays(gl.TRIANGLES,0,6);requestAnimationFrame(draw);
  }
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();active=false;window.__pondWebGLActive=false;canvas.style.display='none';});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  window.addEventListener('resize',resize,{passive:true});resize();
  // The original 2D pond remains a transparent overlay for decorative petals.
  window.__pondWebGLActive=true;
  requestAnimationFrame(draw);
})();
