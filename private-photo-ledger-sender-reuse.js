/* BLACKCELL REDLINE · sender-only original photo reuse popup.
 * No photo is copied until the sender confirms. Storage and insert are
 * performed through the existing authenticated REDLINE API with database
 * checks; this UI never exposes another user's private media or credentials. */
(()=>{
 'use strict';
 const api=()=>window.BLACKCELL_REDLINE_API;
 const snapshot=()=>api()?.snapshot?.();
 const el=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 const overlay=el('div','redline-reuse-overlay');
 overlay.hidden=true;overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-labelledby','redlineReuseTitle');
 const panel=el('section','redline-reuse-dialog');
 const kicker=el('small','redline-reuse-kicker','BLACKCELL REDLINE · SENDER ACCESS');
 const title=el('h2','redline-reuse-title','REUSE THIS PHOTO?');
 title.id='redlineReuseTitle';
 const photo=el('div','redline-reuse-preview');
 const info=el('p','redline-reuse-description',
  'Send this original photograph back to your receiver as a new pending review.');
 const note=el('p','redline-reuse-note',
  'The original photo, its price, rating, and timer history remain unchanged. Reuse does not guarantee a bonus.');
 const feedback=el('p','redline-reuse-feedback','');
 feedback.setAttribute('role','status');
 feedback.setAttribute('aria-live','polite');
 const actions=el('div','redline-reuse-actions');
 const confirm=el('button','redline-reuse-confirm','⟲ REUSE PHOTO');
 confirm.type='button';
 const cancel=el('button','redline-reuse-cancel','CANCEL');
 cancel.type='button';
 actions.append(confirm,cancel);
 panel.append(kicker,title,photo,info,note,feedback,actions);
 overlay.append(panel);
 document.body.append(overlay);
 let selection=null,focusBefore=null,busy=false,done=false;
 const validSrc=src=>typeof src==='string'&&
  (src.startsWith('https://')||src.startsWith('blob:'));
 function close(){
  if(busy)return;
  overlay.hidden=true;selection=null;done=false;
  const target=focusBefore;focusBefore=null;
  try{target?.focus?.({preventScroll:true})}catch(_){}
 }
 cancel.addEventListener('click',close);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 document.addEventListener('keydown',e=>{
  if(overlay.hidden)return;
  if(e.key==='Escape'){e.preventDefault();close();return}
  if(e.key!=='Tab')return;
  const available=[confirm,cancel].filter(b=>!b.disabled);
  if(!available.length)return;
  const index=available.indexOf(document.activeElement);
  if(e.shiftKey&&index<=0){e.preventDefault();available.at(-1).focus()}
  else if(!e.shiftKey&&(index===available.length-1||index<0)){
   e.preventDefault();available[0].focus();
  }
 });
 function open(id,trigger){
  const s=snapshot();
  if(!s||s.isOwner||s.archiveMode||!s.roomActive||busy)return false;
  const chosen=(s.photoHistory||[]).find(p=>p.id===id);
  const rootId=chosen?.resubmission_origin_id||chosen?.id;
  const original=(s.photoHistory||[]).find(p=>p.id===rootId);
  if(!original||!original.resubmissionAllowed||original.removal_status)return false;
  selection={roomId:s.roomId,photoId:rootId};
  focusBefore=trigger||document.activeElement;
  photo.replaceChildren();
  if(validSrc(original.image_url)){
   const img=el('img','redline-reuse-image');
   img.src=original.image_url;img.decoding='async';
   img.alt=original.caption||'Private original photograph';
   img.addEventListener('error',()=>{photo.replaceChildren(el('span','','Private photo preview unavailable'))});
   photo.append(img);
  }else photo.append(el('span','','Original saved privately'));
  feedback.textContent='';
  confirm.disabled=false;confirm.textContent='⟲ REUSE PHOTO';
  cancel.disabled=false;cancel.textContent='CANCEL';done=false;
  overlay.hidden=false;
  confirm.focus({preventScroll:true});
  return true;
 }
 confirm.addEventListener('click',async()=>{
  if(busy||done||!selection)return;
  const s=snapshot(),{roomId,photoId}=selection;
  const original=s?.photoHistory?.find(p=>p.id===photoId);
  if(s?.roomId!==roomId||s?.archiveMode||!s?.roomActive||
   !original?.resubmissionAllowed||original.removal_status){
   feedback.textContent='Photo reuse is no longer available. Reopen Photo History.';
   return;
  }
  busy=true;confirm.disabled=true;cancel.disabled=true;
  confirm.textContent='REUSING PRIVATELY…';
  feedback.textContent='Creating a new pending review from the saved original…';
  try{
   const result=await api()?.reusePhoto?.(photoId);
   if(result?.ok!==true)throw Error('The private reuse was not accepted.');
   done=true;
   feedback.textContent='PHOTO REUSED · A new photograph is awaiting receiver review. Original unchanged.';
   confirm.textContent='✓ SENT FOR REVIEW';
   cancel.textContent='CLOSE';
   window.dispatchEvent(new Event('blackcell:redline:state'));
  }catch(error){
   feedback.textContent='Reuse failed: '+String(error?.message||error).slice(0,220);
   confirm.disabled=false;confirm.textContent='↻ TRY AGAIN';
  }finally{busy=false;cancel.disabled=false}
 });
 window.addEventListener('blackcell:redline:reset',close);
 window.BLACKCELL_REDLINE_REUSE_UI=Object.freeze({open});
})();