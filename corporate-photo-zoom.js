/* BLACKCELL — Original-preserving full-photo zoom and similar-photo discovery.
 * Photos remain unmodified; all scaling/panning happens only in the viewer.
 * Zoom dwell is a possible interest signal, never a vote/favorite. */
export function createPhotoZoom({rediscovery,openPhoto}){
 const $=id=>document.getElementById(id);
 const stage=$('appleViewerStage');
 const viewer=$('applePhotoViewer');
 const controls=$('appleZoomControls');
 const zoomOut=$('appleZoomOut'),zoomIn=$('appleZoomIn'),fit=$('appleZoomFit'),percent=$('appleZoomPercent');
 const related=$('appleZoomRelated');
 let asset=null,img=null,scale=1,tx=0,ty=0;
 let timer=null,activeTime=0,lastTick=0,sessionRecorded=false,gesture=false;
 const pointers=new Map();
 let pinchDistance=0,pinchScale=1,panX=0,panY=0;
 const min=1,max=5;
 function clamp(n,a,b){return Math.min(b,Math.max(a,n))}
 function viewingAllowed(){
  if(!img||!asset||viewer.hidden||document.hidden||!document.hasFocus())return false;
  return !['militaryAssetOverlay','aiPhotoOverlay','tasteOverlay','predOverlayLayer','personalizationOverlay']
   .some(id=>$(id)?.hidden===false);
 }
 function stopTimer(){
  if(timer!==null){clearInterval(timer);timer=null}
  activeTime=0;lastTick=0;
 }
 function clearRelated(){related.hidden=true;related.replaceChildren()}
 function display(){
  if(!img)return;
  const maxX=Math.max(0,((img.clientWidth||1)*(scale-1))/2);
  const maxY=Math.max(0,((img.clientHeight||1)*(scale-1))/2);
  tx=clamp(tx,-maxX,maxX);ty=clamp(ty,-maxY,maxY);
  img.style.transform='translate3d('+tx.toFixed(1)+'px,'+ty.toFixed(1)+'px,0) scale('+scale.toFixed(3)+')';
  img.style.transformOrigin='center center';
  img.style.willChange='transform';
  stage.classList.toggle('bc-photo-is-zoomed',scale>1.02);
  percent.textContent=Math.round(scale*100)+'%';
  zoomOut.disabled=scale<=min;zoomIn.disabled=scale>=max;fit.disabled=scale<=min;
 }
 function triggerSimilar(){
  if(!asset)return;
  const requested=rediscovery.findSimilar(asset);
  related.replaceChildren();
  const h=document.createElement('div');h.className='bc-zoom-related-head';
  const label=document.createElement('div');
  const over=document.createElement('small');over.textContent='MILITARY LIBRARY / RELATED MEDIA';
  const title=document.createElement('strong');title.textContent='MORE LIKE THIS';
  label.append(over,title);
  const close=document.createElement('button');close.type='button';close.textContent='✕';
  close.setAttribute('aria-label','Close similar photos');
  close.addEventListener('click',()=>{related.hidden=true});
  h.append(label,close);related.append(h);
  const explanation=document.createElement('p');
  explanation.textContent=requested.length?
   'Matched using subject, branch, era and descriptive photo tags.':
   'No closely matched photos yet. Try adding subject and uniform tags to the archive.';
  related.append(explanation);
  const list=document.createElement('div');list.className='bc-zoom-related-list';
  for(const candidate of requested){
   const b=document.createElement('button');b.type='button';b.className='bc-zoom-related-item';
   const pic=document.createElement('img');pic.src=rediscovery.imageUrl(candidate);
   pic.alt=candidate.caption||candidate.filename||'Similar photo';pic.loading='lazy';
   const caption=document.createElement('span');
   caption.textContent=(candidate.caption||candidate.filename||'Military photo').slice(0,65);
   b.append(pic,caption);b.addEventListener('click',()=>{related.hidden=true;void openPhoto(candidate)});
   list.append(b);
  }
  related.append(list);related.hidden=false;
 }
 function startTimer(){
  stopTimer();if(!img||scale<1.3||sessionRecorded)return;
  lastTick=performance.now();
  timer=setInterval(()=>{
   const now=performance.now();
   const delta=Math.max(0,Math.min(now-lastTick,750));lastTick=now;
   if(scale<1.3||!viewingAllowed())return;
   activeTime+=delta;
   if(activeTime>=4000){
    sessionRecorded=true;stopTimer();
    void rediscovery.recordZoomHold(asset);
    triggerSimilar();
   }
  },250);
 }
 function applyZoom(n){
  if(!img)return;
  const previous=scale;scale=clamp(Math.round(n*100)/100,min,max);
  if(scale===1){tx=0;ty=0}
  display();
  if(scale>=1.3&&previous<1.3)startTimer();
  if(scale<1.3&&previous>=1.3)stopTimer();
 }
 function reset(){
  stopTimer();
  pointers.clear();pinchDistance=0;gesture=false;
  scale=1;tx=0;ty=0;sessionRecorded=false;
  if(img){img.style.transform='';img.style.willChange='';img.style.touchAction=''}
  if(stage)stage.classList.remove('bc-photo-is-zoomed');
  clearRelated();
 }
 function mount(nextAsset){
  reset();
  asset=nextAsset?.kind==='photo'?nextAsset:null;
  img=asset?stage.querySelector('img'):null;
  controls.hidden=!img;
  if(!img){percent.textContent='100%';return}
  img.style.touchAction='none';
  display();
 }
 function unmount(){reset();asset=null;img=null;controls.hidden=true}
 function isZoomed(){return scale>1.02}
 function blockSwipe(){return isZoomed()||gesture}
 zoomIn.addEventListener('click',()=>applyZoom(scale+.5));
 zoomOut.addEventListener('click',()=>applyZoom(scale-.5));
 fit.addEventListener('click',()=>applyZoom(1));
 stage.addEventListener('wheel',e=>{
  if(!img||!viewer||viewer.hidden)return;
  e.preventDefault();
  applyZoom(scale+(e.deltaY<0?.25:-.25));
 },{passive:false});
 stage.addEventListener('dblclick',e=>{
  if(!img||!img.contains(e.target))return;
  e.preventDefault();
  applyZoom(scale>=1.8?1:2);
 });
 function dist(){
  const coords=[...pointers.values()];
  return coords.length>=2?Math.hypot(coords[0].x-coords[1].x,coords[0].y-coords[1].y):0;
 }
 stage.addEventListener('pointerdown',e=>{
  if(!img||!img.contains(e.target))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1){panX=e.clientX;panY=e.clientY}
  if(pointers.size>=2){pinchDistance=dist();pinchScale=scale;gesture=true}
  if(scale>1.02||pointers.size>=2){try{stage.setPointerCapture(e.pointerId)}catch(_){}}
 });
 stage.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||!img)return;
  const prev=pointers.get(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){
   gesture=true;
   if(!pinchDistance){pinchDistance=dist();pinchScale=scale}
   const d=dist();if(d>0&&pinchDistance>0)applyZoom(pinchScale*d/pinchDistance);
  }else if(scale>1.02){
   tx+=e.clientX-prev.x;ty+=e.clientY-prev.y;display();
   gesture=true;
  }
 });
 function endPointer(e){
  pointers.delete(e.pointerId);
  if(pointers.size<2){pinchDistance=0;pinchScale=scale}
  if(pointers.size===0&&scale<=1.02){
   // Only hold the swipe guard through this touchend event.
   if(gesture)setTimeout(()=>{if(pointers.size===0)gesture=false},100);
  }
 }
 stage.addEventListener('pointerup',endPointer);
 stage.addEventListener('pointercancel',endPointer);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&timer!==null){activeTime=0;lastTick=performance.now()}
 });
 return {mount,unmount,isZoomed,blockSwipe};
}
