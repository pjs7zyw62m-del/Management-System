/* BLACKCELL REDLINE · original-quality private photo viewer.
   The authenticated REDLINE snapshot already contains original Bunny blob
   object URLs (or original legacy signed URLs). Never synthesize a public
   image link, downscale/replace the file, or bypass the room authorization.
   One adjacent image is decoded only after a photo is intentionally opened. */
(()=>{
 'use strict';
 const modal=document.getElementById('photoLightbox');
 const photo=document.getElementById('lightboxImage');
 const close=document.getElementById('closeLightbox');
 if(!modal||!photo||!close)return;
 const api=()=>window.BLACKCELL_REDLINE_API;
 const snapshot=()=>api()?.snapshot?.()||null;
 const validId=id=>typeof id==='string'&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 const validSource=url=>typeof url==='string'&&
  (url.startsWith('blob:')||url.startsWith('https://'));
 const available=()=>{
  const s=snapshot();
  if(!s||!s.roomId||!s.userId)return [];
  return (s.photoHistory||[]).filter(p=>p&&!p.removal_status&&!p.removed&&
   validId(p.id)&&validSource(p.image_url));
 };
 let activeRoom=null,activeId=null,preloadedKey='',preloader=null,preloadTicket=0;
 const make=(tag,cls,content)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(content!==undefined)element.textContent=content;
  return element;
 };
 const toolbar=make('div','redline-hd-toolbar');
 toolbar.setAttribute('role','group');
 toolbar.setAttribute('aria-label','Original photo navigation');
 const prev=make('button','redline-hd-nav','‹');
 const next=make('button','redline-hd-nav','›');
 prev.type='button';next.type='button';
 prev.setAttribute('aria-label','Previous original photograph');
 next.setAttribute('aria-label','Next original photograph');
 const label=make('span','redline-hd-resolution','ORIGINAL QUALITY');
 label.setAttribute('role','status');
 toolbar.append(prev,label,next);
 toolbar.hidden=true;
 modal.append(toolbar);
 function resetPreloader(){
  preloadTicket++;preloadedKey='';
  if(preloader){preloader.removeAttribute('src');preloader=null}
 }
 function eligible(s=snapshot()){
  return Boolean(s?.roomId&&s?.userId&&s?.photoHistory);
 }
 function currentList(){
  const s=snapshot();
  if(!eligible(s)||activeRoom&&s.roomId!==activeRoom)return [];
  return available();
 }
 function currentPhoto(){
  return currentList().find(p=>p.id===activeId)||null;
 }
 function updateLabel(){
  if(modal.hidden){toolbar.hidden=true;return}
  toolbar.hidden=false;
  const pictures=currentList();
  const index=pictures.findIndex(p=>p.id===activeId);
  const width=photo.complete&&photo.naturalWidth>0?photo.naturalWidth:0;
  const height=photo.complete&&photo.naturalHeight>0?photo.naturalHeight:0;
  label.textContent=width&&height
   ?'ORIGINAL · '+width+' × '+height
   :'ORIGINAL · LOADING';
  prev.disabled=index<=0;
  next.disabled=index<0||index>=pictures.length-1;
  prev.hidden=next.hidden=pictures.length<2;
 }
 function preloadNext(){
  const pictures=currentList();
  const index=pictures.findIndex(p=>p.id===activeId);
  if(modal.hidden||index<0||index>=pictures.length-1)return;
  const s=snapshot(),item=pictures[index+1];
  if(!item||!validSource(item.image_url))return;
  const key=s.roomId+':'+item.id+':'+item.image_url;
  if(key===preloadedKey)return;
  resetPreloader();
  preloadedKey=key;
  const ticket=preloadTicket;
  // Decode the already authorized original URL. No additional RPC,
  // background Bunny batch, or unapproved media transfer.
  const preview=new Image();
  preview.decoding='async';
  preloader=preview;
  preview.src=item.image_url;
  if(typeof preview.decode==='function'){
   void preview.decode().catch(()=>{}).finally(()=>{
    if(ticket!==preloadTicket)return;
    // Let the browser cache decoded pixels; do not retain media across rooms.
    preloader=null;
   });
  }
 }
 function select(id,{open=false,announce=false}={}){
  const s=snapshot();
  if(!eligible(s)||!validId(id))return false;
  const item=(s.photoHistory||[]).find(p=>p?.id===id&&!p.removal_status&&
   !p.removed&&validSource(p.image_url));
  if(!item)return false;
  const changed=activeRoom!==s.roomId||activeId!==id;
  activeRoom=s.roomId;activeId=id;
  if(changed)resetPreloader();
  photo.alt=item.caption||'Original private BLACKCELL REDLINE photograph';
  photo.decoding='async';
  // Use the exact private original object/signed URL from REDLINE.
  if(photo.getAttribute('src')!==item.image_url)photo.src=item.image_url;
  if(open){
   modal.hidden=false;
   document.body.style.overflow='hidden';
  }
  updateLabel();
  if(announce&&s.isOwner){
   window.dispatchEvent(new CustomEvent('blackcell:redline:photo-selected',
    {detail:{photoId:id}}));
  }
  if(!modal.hidden)preloadNext();
  return true;
 }
 function navigate(direction){
  const pictures=currentList();
  const idx=pictures.findIndex(p=>p.id===activeId);
  if(idx<0||idx+direction<0||idx+direction>=pictures.length)return;
  select(pictures[idx+direction].id,{announce:true});
 }
 prev.addEventListener('click',()=>navigate(-1));
 next.addEventListener('click',()=>navigate(1));
 function clear(){
  toolbar.hidden=true;
  activeId=null;activeRoom=null;
  resetPreloader();
 }
 function inferVisible(){
  const s=snapshot();
  if(modal.hidden){clear();return}
  if(!eligible(s)){close.click();return}
  if(activeRoom&&s.roomId!==activeRoom){close.click();return}
  const pictures=available();
  const item=pictures.find(p=>p.id===activeId&&
   p.image_url===photo.getAttribute('src'))||
   pictures.find(p=>p.image_url===photo.getAttribute('src'));
  if(item){
   activeRoom=s.roomId;activeId=item.id;
   updateLabel();preloadNext();
  }else if(activeRoom&&activeId){
   // A tombstone or session change immediately revokes this image.
   close.click();
  }else{
   toolbar.hidden=true;
  }
 }
 // Opening from the existing receiver history already dispatches this.
 // Do not change the in-place review page or chat scroller on selection.
 window.addEventListener('blackcell:redline:photo-selected',event=>{
  const id=event.detail?.photoId;
  if(!validId(id))return;
  const s=snapshot();
  const item=(s?.photoHistory||[]).find(p=>p.id===id&&!p.removal_status);
  if(!item)return;
  activeRoom=s.roomId;activeId=id;
  resetPreloader();
  if(!modal.hidden)updateLabel();
 });
 photo.addEventListener('load',()=>{updateLabel();if(!modal.hidden)preloadNext()});
 photo.addEventListener('error',()=>{
  if(!modal.hidden)label.textContent='ORIGINAL UNAVAILABLE · REFRESH REDLINE';
 });
 const observer=new MutationObserver(inferVisible);
 observer.observe(modal,{attributes:true,attributeFilter:['hidden']});
 observer.observe(photo,{attributes:true,attributeFilter:['src']});
 window.addEventListener('blackcell:redline:reset',()=>{
  if(!modal.hidden)close.click();
  clear();
 });
 window.addEventListener('blackcell:redline:state',()=>{
  if(!modal.hidden)inferVisible();
 });
 document.addEventListener('keydown',event=>{
  if(modal.hidden||event.altKey||event.ctrlKey||event.metaKey||
   /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;
  if(event.key==='ArrowRight'){event.preventDefault();navigate(1)}
  if(event.key==='ArrowLeft'){event.preventDefault();navigate(-1)}
 });
 window.BLACKCELL_REDLINE_HD_VIEWER=Object.freeze({
  open(photoId){return select(photoId,{open:true,announce:true})},
  quality:'original',
  preloadNext:true
 });
})();
