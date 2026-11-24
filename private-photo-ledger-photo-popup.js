/* Independent presentation layer. Never moves the authenticated review queue,
   timer, dashboard, or conversation. All decisions use the existing controls. */
(()=>{
'use strict';
const q=(s,root=document)=>root.querySelector(s);
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
const btn=(label,action,cls='')=>{const el=make('button',cls,label);el.type='button';el.addEventListener('click',action);return el};
const snapshot=()=>window.BLACKCELL_REDLINE_API?.snapshot?.();
const popup=make('section','rd-ir-popup');popup.id='rdIndependentReview';popup.hidden=true;popup.setAttribute('role','region');popup.setAttribute('aria-label','Incoming photo review');
const header=make('header','rd-ir-head'),heading=make('div','rd-ir-title'),count=make('small','','');heading.append(make('strong','','Incoming photograph'),count);
const close=btn('×',()=>minimize(),'rd-ir-close'),minus=btn('−',()=>minimize(),'rd-ir-close');close.setAttribute('aria-label','Close photo review');minus.setAttribute('aria-label','Minimize photo review');header.append(heading,minus,close);
const scroll=make('div','rd-ir-scroll'),imageWrap=btn('',()=>original(),'rd-ir-image');imageWrap.setAttribute('aria-label','View full photo and zoom');const image=make('img');image.alt='Incoming private photograph';const placeholder=make('span','','Loading photo…');imageWrap.append(image,placeholder);
const zoom=make('span','rd-ir-zoom','⤢');zoom.setAttribute('aria-hidden','true');imageWrap.append(zoom);
const stars=make('div','rd-ir-stars');const starButtons=[];
for(let n=1;n<=5;n++){const b=btn('★',()=>{const c=canonical();const b=c?.panel.querySelectorAll('.rr-photo-rating-star')[n-1];if(b&&!b.disabled)b.click()},'rd-ir-star');b.setAttribute('aria-label','Rate '+n+' of 5 stars');starButtons.push(b);stars.append(b)}
const priceRow=make('div','rd-ir-price-row'),label=make('label','rd-ir-price','Photo price · USD'),price=make('input');price.type='text';price.inputMode='decimal';price.placeholder='0.00';price.setAttribute('aria-label','Photo price in USD');label.append(price);
const timerToggle=btn('◷ Timer',()=>{timerBox.hidden=!timerBox.hidden;timerToggle.setAttribute('aria-expanded',String(!timerBox.hidden));syncTimer()},'rd-ir-timer-toggle');timerToggle.setAttribute('aria-expanded','false');priceRow.append(label,timerToggle);
const timerBox=make('div','rd-ir-timer');timerBox.hidden=true;const rate=make('input');rate.type='text';rate.inputMode='decimal';rate.setAttribute('aria-label','Timer rate per minute');rate.placeholder='0.50';const timerStatus=make('small','');
const timerStart=btn('Start',()=>timerAction(true)),timerStop=btn('Stop',()=>timerAction(false));timerBox.append(rate,timerStart,timerStop,timerStatus);
const accept=btn('Submit & Next',()=>decision('accept'),'rd-ir-submit'),reject=btn('Reject photo',()=>decision('reject'),'rd-ir-reject'),feedback=make('small','rd-ir-feedback');feedback.setAttribute('role','status');
const controls=make('div','rd-ir-controls');const actions=make('div','rd-ir-actions');actions.append(accept,reject);controls.append(stars,priceRow,timerBox,actions,feedback);scroll.append(imageWrap);popup.append(header,scroll,controls);
const grip=make('div','rd-ir-grip');grip.setAttribute('role','separator');grip.setAttribute('aria-label','Resize photo review and chat');grip.setAttribute('aria-orientation','horizontal');grip.tabIndex=0;popup.append(grip);
const resume=btn('Photo waiting · Review',()=>{opened=true;schedule()},'rd-ir-resume');resume.hidden=true;resume.setAttribute('aria-controls',popup.id);
document.body.append(popup,resume);
const previewReceiver=window.REDLINE_DEV_CONFIG?.role==='receiver'&&window.parent!==window&&location.href==='about:srcdoc';
let scope='',known=new Set(),opened=false,current=null,queued=false,share=previewReceiver?.90:.76,pointer=null,expandedHost=null;
function setPreviewExpanded(host){if(expandedHost===host)return;expandedHost?.classList.remove('rd-ir-preview-expanded');expandedHost=host;expandedHost?.classList.add('rd-ir-preview-expanded')}
function minimize(){opened=false;popup.hidden=true;setPreviewExpanded(null);popup.removeAttribute('data-preview-top');schedule()}
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
 timerToggle.disabled=false;
 if(!timer){timerStart.disabled=timerStop.disabled=true;timerStatus.textContent='Timer unavailable in this preview.';return}
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
function resize(value){share=Math.max(.42,Math.min(.90,value));popup.style.setProperty('--rd-ir-share',(share*100).toFixed(1)+'%');grip.setAttribute('aria-valuenow',String(Math.round(share*100)));if(popup.hasAttribute('data-preview-top'))schedule()}
resize(share);
grip.addEventListener('pointerdown',e=>{pointer=e.pointerId;grip.setPointerCapture(pointer);e.preventDefault()});
grip.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const rect=popup.getBoundingClientRect();resize((e.clientY-rect.top)/Math.max(1,popup.hasAttribute('data-preview-top')?(window.visualViewport?.height||innerHeight):popup.parentElement.clientHeight))});
for(const event of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(event,()=>{pointer=null});
grip.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();resize(share+(e.key==='ArrowDown'?.05:-.05))});
function sync(){
 queued=false;
 const s=snapshot(),chat=q('#redlineReceiverChat'),dashboard=q('#redlineReceiverCommand');
 const valid=Boolean(s?.isOwner&&s.roomActive&&!s.archiveMode&&s.roomId&&chat&&!chat.hidden&&dashboard&&!dashboard.hidden&&!q('#ledgerApp')?.hidden);
 if(!valid){opened=false;scope='';known.clear();current=null;popup.hidden=resume.hidden=true;setPreviewExpanded(null);popup.removeAttribute('data-preview-top');image.removeAttribute('src');return}
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
 const conversation=q('.redline-message-card',chat),feed=conversation?.querySelector('.redline-message-feed');
 const topPreview=Boolean(previewReceiver&&mobile&&visible&&conversation&&feed?.parentNode===conversation);
 if(topPreview){
  // Fixed overlay starts at the phone viewport's top, including the branding.
  // Do not move or hide the original header, counters, or conversation.
  if(popup.parentNode!==document.body)document.body.append(popup);
  if(resume.parentNode!==conversation)conversation.insertBefore(resume,feed);
  popup.setAttribute('data-preview-top','');
 }else if(mobile&&conversation&&feed?.parentNode===conversation){
  popup.removeAttribute('data-preview-top');
  // The finance header, PAY control and pinned timer precede the feed.
  // Insert only our two new nodes, directly before the conversation feed.
  if(popup.parentNode!==conversation||popup.nextElementSibling!==feed)conversation.insertBefore(popup,feed);
  if(resume.parentNode!==conversation||resume.nextElementSibling!==popup)conversation.insertBefore(resume,popup);
 }else{
  popup.removeAttribute('data-preview-top');
  if(popup.parentNode!==document.body)document.body.append(popup);
  if(resume.parentNode!==document.body)document.body.append(resume);
 }
 const mobileReady=!mobile||Boolean(conversation&&feed?.parentNode===conversation);
 // Only the isolated developer receiver may reclaim the counter area. No live
 // financial header is hidden, moved, or modified by this preview experiment.
 setPreviewExpanded(null);
 if(topPreview){
  const viewport=window.visualViewport,top=viewport?.offsetTop||0,height=viewport?.height||innerHeight;
  const composer=q('.redline-message-composer',conversation),composerTop=composer?.getBoundingClientRect().top;
  const bottom=Number.isFinite(composerTop)&&composerTop>top?Math.min(top+height,composerTop):top+height-42;
  const available=Math.max(0,bottom-top-48);
  popup.style.setProperty('--rd-ir-top',top+'px');
  popup.style.setProperty('--rd-ir-top-height',Math.min(available,height*share)+'px');
 }else if(mobileReady&&mobile&&visible){const composer=q('.redline-message-composer',conversation);const available=Math.max(0,conversation.clientHeight-[...conversation.children].filter(el=>el!==popup&&el!==resume&&el!==feed&&!el.hidden&&getComputedStyle(el).display!=='none').reduce((n,el)=>n+el.getBoundingClientRect().height,0)-(expandedHost?40:48));popup.style.setProperty('--rd-ir-available',available+'px');}else popup.style.removeProperty('--rd-ir-available');
 popup.hidden=!visible||!mobileReady;resume.hidden=!next||visible||!summary||!mobileReady;
 const resumeText=pending.length+' photo'+(pending.length===1?'':'s')+' waiting · Review';if(resume.textContent!==resumeText)resume.textContent=resumeText;
 if(!next)return;
 const countText='1 of '+pending.length+' awaiting review';if(count.textContent!==countText)count.textContent=countText;
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
window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
setInterval(()=>{if(!popup.hidden)syncTimer()},500);
schedule();
})();
