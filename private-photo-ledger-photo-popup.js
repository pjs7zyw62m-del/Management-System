/* Independent presentation layer. Never moves the authenticated review queue,
   timer, dashboard, or conversation. All decisions use the existing controls. */
(()=>{
'use strict';
const q=(s,root=document)=>root.querySelector(s);
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
const btn=(label,action,cls='')=>{const el=make('button',cls,label);el.type='button';el.addEventListener('click',action);return el};
const snapshot=()=>window.BLACKCELL_REDLINE_API?.snapshot?.();
const popup=make('section','rd-ir-popup');popup.id='rdIndependentReview';popup.hidden=true;popup.setAttribute('role','region');popup.setAttribute('aria-label','Incoming photo review');
const header=make('header','rd-ir-head'),heading=make('div','rd-ir-title'),count=make('small','','');heading.append(make('strong','','Photo Review'),count);
const close=btn('×',()=>minimize(),'rd-ir-close'),minus=btn('−',()=>minimize(),'rd-ir-close');close.setAttribute('aria-label','Close photo review');minus.setAttribute('aria-label','Minimize photo review');header.append(heading,minus,close);
const scroll=make('div','rd-ir-scroll'),imageWrap=btn('',()=>original(),'rd-ir-image');imageWrap.setAttribute('aria-label','View full photo and zoom');const image=make('img');image.alt='Incoming private photograph';const placeholder=make('span','','Loading photo…');imageWrap.append(image,placeholder);
const zoom=btn('View full photo ⤢',()=>original(),'rd-ir-zoom');
const stars=make('div','rd-ir-stars');const starButtons=[];
for(let n=1;n<=5;n++){const b=btn('★',()=>{const c=canonical();const b=c?.panel.querySelectorAll('.rr-photo-rating-star')[n-1];if(b&&!b.disabled)b.click()},'rd-ir-star');b.setAttribute('aria-label','Rate '+n+' of 5 stars');starButtons.push(b);stars.append(b)}
const priceRow=make('div','rd-ir-price-row'),label=make('label','rd-ir-price','Photo price · USD'),price=make('input');price.type='text';price.inputMode='decimal';price.placeholder='0.00';price.setAttribute('aria-label','Photo price in USD');label.append(price);
const timerToggle=btn('Timer',()=>{timerBox.hidden=!timerBox.hidden;syncTimer()},'rd-ir-timer-toggle');priceRow.append(label,timerToggle);
const timerBox=make('div','rd-ir-timer');timerBox.hidden=true;const rate=make('input');rate.type='text';rate.inputMode='decimal';rate.setAttribute('aria-label','Timer rate per minute');rate.placeholder='0.50';const timerStatus=make('small','');
const timerStart=btn('Start',()=>timerAction(true)),timerStop=btn('Stop',()=>timerAction(false));timerBox.append(rate,timerStart,timerStop,timerStatus);
const accept=btn('Submit & Next',()=>decision('accept'),'rd-ir-submit'),reject=btn('Reject photo',()=>decision('reject'),'rd-ir-reject'),feedback=make('small','rd-ir-feedback');feedback.setAttribute('role','status');
scroll.append(imageWrap,zoom,stars,priceRow,timerBox,accept,reject,feedback);popup.append(header,scroll);
const grip=make('div','rd-ir-grip');grip.setAttribute('role','separator');grip.setAttribute('aria-label','Resize photo review and chat');grip.setAttribute('aria-orientation','horizontal');grip.tabIndex=0;popup.append(grip);
const resume=btn('Photo waiting · Review',()=>{opened=true;schedule()},'rd-ir-resume');resume.hidden=true;resume.setAttribute('aria-controls',popup.id);
document.body.append(popup,resume);
let scope='',known=new Set(),opened=false,current=null,queued=false,share=.52,pointer=null;
function minimize(){opened=false;popup.hidden=true;schedule()}
function canonical(){
 const s=snapshot(),card=q('#reviewQueueCurrent .photo-entry[data-redline-photo-id]'),panel=q('#redlineLightboxReview');
 if(!s?.isOwner||!s.roomActive||s.archiveMode||!current||card?.dataset.redlinePhotoId!==current.id||!panel||panel.hidden)return null;
 if(panel.dataset.redlinePhotoId&&panel.dataset.redlinePhotoId!==current.id)return null;
 return {card,panel};
}
function original(){canonical()?.card.querySelector('.photo-image-btn')?.click()}
function decision(kind){
 const c=canonical();if(!c){feedback.textContent='Photo controls are still loading.';return}
 const action=c.panel.querySelector(kind==='reject'?'.redline-review-actions .reject-photo':'.redline-review-actions .button-main');
 if(!action||action.disabled){feedback.textContent='Wait for the current decision to finish.';return}
 if(kind==='accept'){
  const value=price.value.trim();
  if(!/^(?:\d+|\d*\.\d{1,2})$/.test(value)){feedback.textContent='Enter a valid price, such as 0.25.';return}
  const target=c.panel.querySelector('.redline-review-amount');if(!target)return;target.value=value.startsWith('.')?'0'+value:value;
 }
 feedback.textContent='';action.click();schedule();
}
function syncTimer(){
 const timer=q('#redlinePhotoTimerPanel'),c=canonical();
 timerToggle.disabled=!timer;
 if(!timer){timerBox.hidden=true;return}
 const originalRate=q('.rr-timer-rate',timer),start=q('.rr-timer-start',timer),stop=q('.rr-timer-stop',timer);
 if(document.activeElement!==rate&&originalRate)rate.value=originalRate.value;
 timerStart.disabled=!c||!start||start.disabled;timerStop.disabled=!stop||stop.disabled;
 timerStatus.textContent=[q('.rr-timer-clock',timer)?.textContent,q('.rr-timer-money',timer)?.textContent].filter(Boolean).join(' · ');
}
function timerAction(starting){
 const timer=q('#redlinePhotoTimerPanel');if(!timer||!canonical())return;
 if(starting){
  // Select exactly the canonical pending photograph before starting.
  const select=q('.rr-timer-select-incoming',timer);select?.click();
  const originalRate=q('.rr-timer-rate',timer);if(originalRate){originalRate.value=rate.value;originalRate.dispatchEvent(new Event('input',{bubbles:true}))}
 }
 const action=q(starting?'.rr-timer-start':'.rr-timer-stop',timer);if(action&&!action.disabled)action.click();
}
function resize(value){share=Math.max(.27,Math.min(.68,value));popup.style.setProperty('--rd-ir-share',(share*100).toFixed(1)+'%');grip.setAttribute('aria-valuenow',String(Math.round(share*100)))}
resize(share);
grip.addEventListener('pointerdown',e=>{pointer=e.pointerId;grip.setPointerCapture(pointer);e.preventDefault()});
grip.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const rect=popup.getBoundingClientRect();resize((e.clientY-rect.top)/Math.max(1,popup.parentElement.clientHeight))});
for(const event of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(event,()=>{pointer=null});
grip.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();resize(share+(e.key==='ArrowDown'?.05:-.05))});
function sync(){
 queued=false;
 const s=snapshot(),chat=q('#redlineReceiverChat'),dashboard=q('#redlineReceiverCommand');
 const valid=Boolean(s?.isOwner&&s.roomActive&&!s.archiveMode&&s.roomId&&chat&&!chat.hidden&&dashboard&&!dashboard.hidden&&!q('#ledgerApp')?.hidden);
 if(!valid){opened=false;scope='';known.clear();current=null;popup.hidden=resume.hidden=true;return}
 const room=s.roomId+'|'+String(s.resetAt||'');
 if(room!==scope){scope=room;known.clear();opened=false;current=null;price.value='';timerBox.hidden=true}
 const pending=(s.photoHistory||[]).filter(p=>p.decision_status==='pending'&&!p.removal_status).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||String(a.id).localeCompare(String(b.id)));
 const fresh=pending.some(p=>!known.has(p.id));known=new Set(pending.map(p=>p.id));
 const card=q('#reviewQueueCurrent .photo-entry[data-redline-photo-id]');
 const next=pending.find(p=>p.id===card?.dataset.redlinePhotoId)||pending[0]||null;
 const mobile=document.body.classList.contains('bc-ledger-mobile');
 const summary=!mobile||document.body.dataset.ledgerView==='summary';
 if(fresh&&summary&&!document.activeElement?.matches('.redline-message-entry'))opened=true;
 if(!next)opened=false;
 if(current?.id!==next?.id){price.value='';feedback.textContent='';scroll.scrollTop=0}
 current=next;
 const visible=Boolean(opened&&next&&summary);
 // Mount the new presentation only. The original chat and controls stay put.
 if(mobile&&chat.parentNode===dashboard){
  if(popup.parentNode!==dashboard)dashboard.insertBefore(popup,chat);
  if(resume.parentNode!==dashboard)dashboard.insertBefore(resume,popup);
 }else{
  if(popup.parentNode!==document.body)document.body.append(popup);
  if(resume.parentNode!==document.body)document.body.append(resume);
 }
 popup.hidden=!visible;resume.hidden=!next||visible||!summary;
 resume.textContent=pending.length+' photo'+(pending.length===1?'':'s')+' waiting · Review';
 if(!next)return;
 count.textContent='1 of '+pending.length+' awaiting review';
 const src=next.image_url;
 if(src&&/^(blob:|https:\/\/|data:image\/)/.test(src)){if(image.getAttribute('src')!==src)image.src=src;image.hidden=false;placeholder.hidden=true}
 else{image.removeAttribute('src');image.hidden=true;placeholder.hidden=false}
 const c=canonical(),rating=Number(next.stars)||0;
 starButtons.forEach((b,i)=>{b.classList.toggle('is-filled',i<rating);b.disabled=!c||!!c.panel.querySelectorAll('.rr-photo-rating-star')[i]?.disabled});
 accept.disabled=!c||!!c.panel.querySelector('.redline-review-actions .button-main')?.disabled;
 reject.disabled=!c||!!c.panel.querySelector('.redline-review-actions .reject-photo')?.disabled;
 const note=c?.panel.querySelector('.redline-review-status')?.textContent;if(note)feedback.textContent=note;
 syncTimer();
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(sync)}}
for(const event of ['blackcell:redline:state','blackcell:redline:receiver-ready','blackcell:redline:review-photo','blackcell:redline:review-empty','blackcell:redline:device-mode','blackcell:redline:session-mode','pageshow','resize'])window.addEventListener(event,schedule);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popup.hidden&&q('#photoLightbox')?.hidden&&!q('dialog[open]'))minimize()});
new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class','data-ledger-view']});
setInterval(()=>{if(!popup.hidden)syncTimer()},500);
schedule();
})();
