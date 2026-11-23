/* BLACKCELL REDLINE — photo inspection within the negotiation popup.
   Reuses the authenticated signed image already displayed in the popup.
   No price, payment, or timer state is altered. */
(()=>{
 'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const MAX=6,FACTOR=1.5;
 const viewer=document.createElement('dialog');
 viewer.id='redlineNegotiationPhotoViewer';
 viewer.setAttribute('aria-label','Enlarged photograph for price negotiation');
 const header=document.createElement('div');header.className='rn-view-top';
 const title=document.createElement('strong');title.textContent='REDLINE · PHOTO INSPECTION';
 const closeButton=document.createElement('button');closeButton.type='button';
 closeButton.className='rn-view-close';closeButton.textContent='✕ CLOSE';
 header.append(title,closeButton);
 const stage=document.createElement('div');stage.className='rn-view-stage';
 const photo=document.createElement('img');photo.className='rn-view-image';
 photo.alt='Enlarged private photograph for negotiation';
 photo.draggable=false;
 stage.append(photo);
 const tools=document.createElement('div');tools.className='rn-view-tools';
 function button(label,aria){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  b.setAttribute('aria-label',aria);tools.append(b);return b;
 }
 const minus=button('−','Zoom out negotiation photograph');
 const value=button('100%','Reset negotiation photograph zoom');
 value.classList.add('rn-view-zoom-value');
 const plus=button('+','Zoom in negotiation photograph');
 viewer.append(header,stage,tools);
 document.body.append(viewer);
 let scale=1,x=0,y=0,gesture=new Map(),pinchDistance=0,dragged=false;
 let suppressedUntil=0,lastTrigger=null;
 function draw(){
  scale=clamp(scale,1,MAX);
  if(scale===1){x=0;y=0}
  const rect=stage.getBoundingClientRect();
  const maxX=(scale-1)*rect.width/2,maxY=(scale-1)*rect.height/2;
  x=clamp(x,-maxX,maxX);y=clamp(y,-maxY,maxY);
  photo.style.transform='translate3d('+x.toFixed(1)+'px,'+y.toFixed(1)+'px,0) scale('+scale.toFixed(3)+')';
  photo.dataset.zoomLevel=scale.toFixed(2);
  stage.classList.toggle('rn-zoomed',scale>1);
  value.textContent=Math.round(scale*100)+'%';
  minus.disabled=scale<=1;plus.disabled=scale>=MAX;
 }
 function reset(){scale=1;x=0;y=0;gesture.clear();draw()}
 function zoom(next,px,py){
  const rect=stage.getBoundingClientRect(),old=scale;
  const desired=clamp(next,1,MAX),factor=desired/old;
  const cx=px===undefined?0:px-(rect.left+rect.width/2);
  const cy=py===undefined?0:py-(rect.top+rect.height/2);
  x=x*factor+(1-factor)*cx;
  y=y*factor+(1-factor)*cy;
  scale=desired;draw();
 }
 const stop=()=>{if(viewer.open)viewer.close()};
 closeButton.addEventListener('click',stop);
 minus.addEventListener('click',()=>zoom(scale/FACTOR));
 plus.addEventListener('click',()=>zoom(scale*FACTOR));
 value.addEventListener('click',reset);
 viewer.addEventListener('close',()=>{
  photo.removeAttribute('src');reset();
  if(lastTrigger?.isConnected)lastTrigger.focus({preventScroll:true});
 });
 document.addEventListener('click',event=>{
  const trigger=event.target?.closest?.('#redlinePriceNegotiation .redline-negotiation-photo-open');
  if(!trigger)return;
  const source=trigger.querySelector('img');
  const url=source?.currentSrc||source?.src;
  if(!url)return;
  event.preventDefault();event.stopPropagation();
  lastTrigger=trigger;
  photo.src=url;reset();
  try{if(!viewer.open)viewer.showModal()}catch(_){}
 });
 photo.addEventListener('click',event=>{
  if(Date.now()<suppressedUntil)return;
  if(scale>=MAX/FACTOR)reset();
  else zoom(scale*FACTOR,event.clientX,event.clientY);
 });
 stage.addEventListener('wheel',event=>{
  if(!viewer.open)return;
  event.preventDefault();
  zoom(scale*(event.deltaY<0?1.22:1/1.22),event.clientX,event.clientY);
 },{passive:false});
 const pair=()=>[...gesture.values()];
 const distance=()=>{
  const pts=pair();return pts.length>=2?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):0;
 };
 photo.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  gesture.set(event.pointerId,{x:event.clientX,y:event.clientY});
  pinchDistance=distance();dragged=false;
  if(scale>1||gesture.size>1){
   try{photo.setPointerCapture(event.pointerId)}catch(_){}
  }
 });
 photo.addEventListener('pointermove',event=>{
  const old=gesture.get(event.pointerId);
  if(!old)return;
  const dx=event.clientX-old.x,dy=event.clientY-old.y;
  gesture.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(gesture.size>=2){
   const next=distance();
   if(pinchDistance>0&&next>0){
    const pts=pair(),cx=(pts[0].x+pts[1].x)/2,cy=(pts[0].y+pts[1].y)/2;
    zoom(scale*next/pinchDistance,cx,cy);
   }
   pinchDistance=next;dragged=true;
  }else if(scale>1){
   x+=dx;y+=dy;draw();
   if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;
  }
  if(dragged&&event.cancelable)event.preventDefault();
 },{passive:false});
 function pointerEnd(event){
  if(!gesture.has(event.pointerId))return;
  gesture.delete(event.pointerId);pinchDistance=distance();
  if(dragged)suppressedUntil=Date.now()+300;
 }
 photo.addEventListener('pointerup',pointerEnd);
 photo.addEventListener('pointercancel',pointerEnd);
 viewer.addEventListener('keydown',event=>{
  if(event.key==='+'||event.key==='='){event.preventDefault();zoom(scale*FACTOR)}
  else if(event.key==='-'){event.preventDefault();zoom(scale/FACTOR)}
  else if(event.key==='0'){event.preventDefault();reset()}
 });
 window.addEventListener('blackcell:redline:reset',stop);
 document.getElementById('redlinePriceNegotiation')?.addEventListener('close',stop);
})();
