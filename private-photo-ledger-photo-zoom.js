/* BLACKCELL REDLINE — photographic zoom, 2026-11-23.
   Real authenticated images only. No image data, URLs or zoom history
   leave this browser; existing photo review/pricing handlers are unchanged.
   Supports inline review AND independently zoomable original-photo popup. */
(()=>{
 'use strict';
 const MAX=6,FACTOR=1.5;
 const states=new WeakMap(),remember=new Map();
 let full=null,ensureQueued=false;
 const $=s=>document.querySelector(s);
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
 const modal=$('#photoLightbox'),fullImg=$('#lightboxImage');
 if(!modal||!fullImg)return;
 const liveImage=el=>el instanceof HTMLImageElement &&
  (el===fullImg||el.matches('#redlineReceiverReviewStage #reviewQueueCurrent .photo-entry>.photo-image-btn>img, #redlineReceiverReviewStage .rr-timer-selected-preview>img'));
 const isFull=s=>s?.kind==='full';
 const viewport=s=>isFull(s)?s.img.closest('.redline-review-large-image'):
  s.img.closest('.photo-image-btn')||s.img.parentElement;
 function apply(s){
  if(!s.img?.isConnected)return;
  s.scale=clamp(s.scale,1,MAX);
  if(s.scale<=1.001){s.scale=1;s.x=0;s.y=0}
  const r=viewport(s)?.getBoundingClientRect();
  if(r){
   const maxX=Math.max(0,(s.scale-1)*r.width/2),maxY=Math.max(0,(s.scale-1)*r.height/2);
   s.x=clamp(s.x,-maxX,maxX);s.y=clamp(s.y,-maxY,maxY);
  }
  s.img.style.transform='translate3d('+s.x.toFixed(1)+'px,'+s.y.toFixed(1)+'px,0) scale('+s.scale.toFixed(3)+')';
  s.img.dataset.redlineZoom=s.scale.toFixed(2);
  s.host?.classList.toggle('bc-photo-zoomed',s.scale>1);
  if(s.controls){
   const value=s.controls.querySelector('[data-zoom-label]');
   if(value)value.textContent=Math.round(s.scale*100)+'%';
   const minus=s.controls.querySelector('[data-redline-zoom="out"]');
   const plus=s.controls.querySelector('[data-redline-zoom="in"]');
   if(minus)minus.disabled=s.scale<=1.001;
   if(plus)plus.disabled=s.scale>=MAX-0.01;
  }
  if(!isFull(s))remember.set(s.key,{scale:s.scale,x:s.x,y:s.y});
 }
 function focusPoint(s,cx,cy){
  const r=viewport(s)?.getBoundingClientRect();
  return {x:(cx??(r?r.left+r.width/2:0))-(r?r.left+r.width/2:0),
   y:(cy??(r?r.top+r.height/2:0))-(r?r.top+r.height/2:0)};
 }
 function zoom(s,next,cx,cy){
  if(!s)return;
  next=clamp(next,1,MAX);
  const f=next/s.scale,p=focusPoint(s,cx,cy);
  s.x=s.x*f+(1-f)*p.x;
  s.y=s.y*f+(1-f)*p.y;
  s.scale=next;apply(s);
 }
 function reset(s){if(!s)return;s.scale=1;s.x=0;s.y=0;s.active.clear();apply(s)}
 function makeControls(s){
  const bar=document.createElement('div');
  bar.className='bc-photo-zoom-controls';bar.setAttribute('role','group');
  bar.setAttribute('aria-label',isFull(s)?'Enlarged photograph zoom controls':'Photograph zoom controls');
  for(const [action,label,aria] of [
   ['out','−','Zoom out photograph'],['reset','100%','Reset photograph to fit'],
   ['in','+','Zoom in photograph']]){
   const b=document.createElement('button');b.type='button';
   b.className='bc-photo-zoom-button';b.dataset.redlineZoom=action;
   b.setAttribute('aria-label',aria);b.title=aria;
   if(action==='reset')b.dataset.zoomLabel='true';
   b.textContent=label;
   b.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    if(action==='in')zoom(s,s.scale*FACTOR);
    else if(action==='out')zoom(s,s.scale/FACTOR);
    else reset(s);
   });
   bar.append(b);
  }
  s.host.append(bar);s.controls=bar;
 }
 function attach(img,host,kind,key){
  if(!img||!host)return;
  let s=states.get(img);
  if(s&&s.kind===kind&&s.key===key&&s.host===host&&s.controls?.isConnected){
   apply(s);return s;
  }
  const restored=kind==='inline'?remember.get(key):null;
  s={img,host,kind,key,scale:restored?.scale||1,x:restored?.x||0,
    y:restored?.y||0,controls:null,active:new Map(),
    lastPinch:0,dragged:false,suppressUntil:0};
  states.set(img,s);
  host.classList.add('bc-photo-zoom-host');
  img.classList.add('bc-photo-zoom-image');
  if(kind==='inline'){
   const parent=img.closest('.photo-image-btn');
   if(parent)parent.classList.add('bc-photo-zoom-viewport');
  }
  const old=host.querySelector(':scope > .bc-photo-zoom-controls');
  if(old)old.remove();
  makeControls(s);apply(s);
  if(kind==='inline'){
   // The original image itself still opens the signed full-size photo. Add
   // a visible button, rather than requiring the receiver to guess.
   host.querySelector(':scope > .bc-photo-open-large')?.remove();
   const open=document.createElement('button');open.type='button';
   open.className='bc-photo-open-large';open.textContent='⤢ VIEW LARGE';
   open.setAttribute('aria-label','Open the complete photograph in the enlarged zoomable viewer');
   open.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    const photoButton=img.closest('.photo-image-btn');
    if(photoButton){photoButton.click();return}
    const fullButton=host.querySelector('.rr-timer-full');
    if(fullButton)fullButton.click();
    else{
     const matched=[...document.querySelectorAll('#redlineReceiverPricedStage .photo-entry .photo-image-btn')]
      .find(el=>el.querySelector('img')?.src===img.src);
     matched?.click();
    }
   });
   host.append(open);
  }
  img.addEventListener('load',()=>{
   host.classList.remove('bc-photo-load-failed');
   host.querySelector(':scope > .bc-photo-load-message')?.remove();
  });
  img.addEventListener('error',()=>{
   if(!img.src||!img.isConnected)return;
   host.classList.add('bc-photo-load-failed');
   if(host.querySelector(':scope > .bc-photo-load-message'))return;
   const message=document.createElement('span');
   message.className='bc-photo-load-message';
   message.textContent='Photo could not load · refresh REDLINE to retry';
   message.setAttribute('role','status');host.append(message);
  });
  if(kind==='full')full=s;
  return s;
 }
 function ensureInline(){
  const images=document.querySelectorAll(
   '#redlineReceiverReviewStage #reviewQueueCurrent .photo-entry>.photo-image-btn>img,'+
   '#redlineReceiverReviewStage .rr-timer-selected-preview>img');
  for(const img of images){
   const entry=img.closest('.photo-entry');
   const host=entry||img.closest('.rr-timer-selected-preview');
   const id=entry?.dataset.redlinePhotoId||
    (img.closest('.rr-timer-selected-preview')?'timed:'+String(img.currentSrc||img.src):'inline:'+String(img.currentSrc||img.src));
   attach(img,host,'inline',id);
  }
 }
 function ensureFull(){
  const host=fullImg.closest('.redline-review-large-image');
  if(host)attach(fullImg,host,'full','full');
 }
 function ensure(){ensureInline();ensureFull()}
 function scheduleEnsure(){
  if(ensureQueued)return;ensureQueued=true;
  requestAnimationFrame(()=>{ensureQueued=false;ensure()});
 }
 function stateFor(el){return liveImage(el)?states.get(el):null}
 function pointDistance(points){
  const [a,b]=[...points.values()];
  return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;
 }
 function midpoint(points){
  const [a,b]=[...points.values()];
  return a&&b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:null;
 }
 // Wheel-to-zoom is confined to the photograph and never moves the chat.
 document.addEventListener('wheel',e=>{
  const s=stateFor(e.target);
  if(!s||modal?.hidden===false&&s.kind==='inline')return;
  e.preventDefault();
  zoom(s,s.scale*(e.deltaY<0?1.22:1/1.22),e.clientX,e.clientY);
 },{passive:false,capture:true});
 document.addEventListener('pointerdown',e=>{
  const s=stateFor(e.target);
  if(!s||e.pointerType==='mouse'&&e.button!==0||s.kind==='inline'&&!modal.hidden)return;
  s.active.set(e.pointerId,{x:e.clientX,y:e.clientY});
  s.dragged=false;
  s.lastPinch=s.active.size>=2?pointDistance(s.active):0;
  if(s.scale>1||s.active.size>1){
   try{e.target.setPointerCapture(e.pointerId)}catch(_){}
  }
 },{passive:true,capture:true});
 document.addEventListener('pointermove',e=>{
  const s=stateFor(e.target);
  if(!s||!s.active.has(e.pointerId))return;
  const old=s.active.get(e.pointerId);
  const dx=e.clientX-old.x,dy=e.clientY-old.y;
  s.active.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(s.active.size>=2){
   const dist=pointDistance(s.active),mid=midpoint(s.active);
   if(s.lastPinch&&dist&&mid)zoom(s,s.scale*dist/s.lastPinch,mid.x,mid.y);
   s.lastPinch=dist;
   if(Math.abs(dx)+Math.abs(dy)>2)s.dragged=true;
  }else if(s.scale>1){
   s.x+=dx;s.y+=dy;apply(s);
   if(Math.abs(dx)+Math.abs(dy)>2)s.dragged=true;
  }
  if(s.dragged&&e.cancelable)e.preventDefault();
 },{passive:false,capture:true});
 function finishPointer(e){
  const s=stateFor(e.target);
  if(!s||!s.active.has(e.pointerId))return;
  s.active.delete(e.pointerId);s.lastPinch=0;
  if(s.dragged)s.suppressUntil=Date.now()+350;
 }
 document.addEventListener('pointerup',finishPointer,true);
 document.addEventListener('pointercancel',finishPointer,true);
 // Normal photo click still opens the original. A pan is never mistaken for
 // a click/open; clicking the ORIGINAL now zooms instead of closing.
 document.addEventListener('click',e=>{
  if(e.target===fullImg){
   e.preventDefault();e.stopImmediatePropagation();
   const s=states.get(fullImg)||full;
   if(!s||Date.now()<s.suppressUntil||modal.hidden)return;
   if(s.scale>=MAX/FACTOR)reset(s);
   else zoom(s,s.scale*FACTOR,e.clientX,e.clientY);
   return;
  }
  const button=e.target?.closest?.('.photo-image-btn');
  const img=button?.querySelector('img.bc-photo-zoom-image');
  const s=img&&states.get(img);
  if(s&&Date.now()<s.suppressUntil){
   e.preventDefault();e.stopImmediatePropagation();
   s.suppressUntil=0;
  }
 },true);
 fullImg.addEventListener('keydown',e=>{
  if(modal.hidden)return;
  const s=states.get(fullImg)||full;
  if(!s)return;
  if(e.key==='Enter'||e.key===' '){
   e.preventDefault();zoom(s,s.scale>=MAX/FACTOR?1:s.scale*FACTOR);
  }
 });
 document.addEventListener('keydown',e=>{
  if(modal.hidden||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;
  const s=states.get(fullImg)||full;if(!s)return;
  if(e.key==='+'||e.key==='='){e.preventDefault();zoom(s,s.scale*FACTOR)}
  else if(e.key==='-'){e.preventDefault();zoom(s,s.scale/FACTOR)}
  else if(e.key==='0'){e.preventDefault();reset(s)}
 });
 const fullObserver=new MutationObserver(records=>{
  if(records.some(r=>r.attributeName==='src'||r.attributeName==='hidden')){
   ensureFull();reset(states.get(fullImg)||full);
  }
 });
 fullObserver.observe(fullImg,{attributes:true,attributeFilter:['src']});
 fullObserver.observe(modal,{attributes:true,attributeFilter:['hidden']});
 const queue=$('#reviewQueueCurrent'),stage=$('#redlineReceiverReviewStage');
 const reviewObserver=new MutationObserver(scheduleEnsure);
 if(queue)reviewObserver.observe(queue,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 if(stage&&stage!==queue)reviewObserver.observe(stage,{childList:true,subtree:true,attributes:true,attributeFilter:['src','hidden']});
 // The authenticated room may replace the next-photo element and dispatch a
 // state event in the same task. Attach immediately, not after a paint frame,
 // so zoom/large controls are ready on the very next photo without refresh.
 window.addEventListener('blackcell:redline:state',ensure);
 window.addEventListener('blackcell:redline:review-photo',ensure);
 window.addEventListener('blackcell:redline:photo-selected',ensure);
 ensure();
})();
