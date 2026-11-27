/* BLACKCELL REDLINE — sender messenger-first live session.
 * Presentation only: uses the existing verified room, private composer,
 * server-authoritative timer, photo viewer, settlement and upload handlers.
 * No fabricated prices, payments, external messaging or extra polling RPCs.
 */
(()=>{
'use strict';
const app=document.getElementById('ledgerApp');
const room=document.getElementById('activeRoom');
const home=document.getElementById('redlineSimpleSender');
if(!app||!room||!home)return;
const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
const pane=$('[data-redline-pane="upload"]',home);
const chat=$('.redline-message-card',pane);
const feed=$('.redline-message-feed',chat);
const composer=$('#redlineMessageComposer',chat);
const sendButton=$('.redline-chat-send',chat);
const addPhoto=$('.redline-chat-photo',chat);
const intro=$('.redline-upload-intro',pane);
const mount=$('.redline-upload-mount',pane);
const summary=$('.redline-upload-summary',pane);
const activity=$('.redline-activity-teaser',pane);
if(!pane||!chat||!feed||!composer||!addPhoto||!intro||!mount)return;
const create=(tag,cls,label)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(label!==undefined)el.textContent=label;
 return el;
};
const api=()=>window.BLACKCELL_REDLINE_API;
const snapshot=()=>api()?.snapshot?.()||null;
const sender=()=>{
 const s=snapshot();
 return Boolean(s&&!s.isOwner&&!app.hidden&&!room.hidden&&!home.hidden);
};
const tabs={
 upload:$('[data-simple-tab="upload"]',home),
 viewing:$('[data-simple-tab="viewing"]',home),
 earnings:$('[data-simple-tab="earnings"]',home),
 history:$('[data-simple-tab="history"]',home),
 stars:$('[data-simple-tab="five-star"]',home)
};
for(const [key,label] of Object.entries({
 upload:'Messages',viewing:'Viewing',earnings:'Earnings',
 history:'History',stars:'5 Stars'
})){if(tabs[key])tabs[key].textContent=label;}
// Mobile sender menu delegates to the original section actions.
const topbar=$('.topbar'),mobileMenu=create('div','rs-mobile-menu');
mobileMenu.hidden=true;
const menuToggle=create('button','rs-mobile-menu-toggle','☰ Menu');
menuToggle.type='button';menuToggle.setAttribute('aria-label','Open sender menu');
menuToggle.setAttribute('aria-expanded','false');menuToggle.setAttribute('aria-controls','redlineSenderMobileMenuItems');
const menuItems=create('nav','rs-mobile-menu-items');menuItems.id='redlineSenderMobileMenuItems';
menuItems.setAttribute('aria-label','Sender sections');menuItems.hidden=true;
function setMenuOpen(open){
 menuItems.hidden=!open;
 document.body.classList.toggle('rs-sender-menu-open',open);
 if(open){const r=menuToggle.getBoundingClientRect(),v=window.BLACKCELL_REDLINE_VISIBLE_VIEWPORT?.();const bottom=v?.bottom??(window.visualViewport?.height||innerHeight);menuItems.style.setProperty('--rs-menu-top',Math.max(4,Math.min(r.bottom+5,bottom-80))+'px');menuItems.style.setProperty('--rs-menu-height',Math.max(65,bottom-Math.min(r.bottom+5,bottom-80)-8)+'px');}
menuToggle.setAttribute('aria-expanded',String(open));
 menuToggle.setAttribute('aria-label',open?'Close sender menu':'Open sender menu');
}
const roomsHome=create('button','rd-home-shortcut rd-sender-mobile-home','← Rooms');roomsHome.type='button';roomsHome.hidden=true;roomsHome.setAttribute('aria-label','Return to REDLINE main room directory');roomsHome.addEventListener('click',()=>{setMenuOpen(false);api()?.returnToRooms?.()});topbar?.append(roomsHome);
const roomsMenu=create('button','rs-mobile-menu-item','← All Rooms');roomsMenu.type='button';roomsMenu.addEventListener('click',()=>{setMenuOpen(false);api()?.returnToRooms?.()});menuItems.append(roomsMenu);
const menuOptions=new Map();
const archiveMenu=create('button','rs-mobile-menu-item','View Previous Records');archiveMenu.type='button';archiveMenu.dataset.icon='history';
archiveMenu.addEventListener('click',async()=>{if(!sender()||archiveMenu.disabled)return;const s=snapshot();if(!s?.resetAt&&!s?.archiveMode)return;setMenuOpen(false);archiveMenu.disabled=true;try{await api().toggleArchive();if(sender()&&snapshot()?.roomId===s.roomId)tabs[s.archiveMode?'upload':'history']?.click()}catch(e){window.alert('Session records unavailable: '+String(e?.message||e))}finally{archiveMenu.disabled=false;update()}});
for(const [label,event] of [['Smoke Break','blackcell:redline:break-menu'],['♥ Favorites','blackcell:redline:favorites-menu']]){
 const item=create('button','rs-mobile-menu-item',label);item.type='button';item.dataset.breakMenu=event;item.addEventListener('click',()=>{setMenuOpen(false);if(sender())window.dispatchEvent(new Event(event))});menuItems.append(item);
}
for(const [key,label,icon] of [['upload','Messages','chat'],['viewing','Currently Viewing','view'],['earnings','Earnings','money'],['history','Photo History','history'],['stars','5-Star Photos','star']]){
 if(!tabs[key])continue;
 const item=create('button','rs-mobile-menu-item',label);item.type='button';item.dataset.icon=icon;
 item.addEventListener('click',()=>{setMenuOpen(false);if(sender())tabs[key].click()});
 menuItems.append(item);menuOptions.set(key,item);
}
menuItems.append(archiveMenu);
menuToggle.addEventListener('click',()=>{if(sender()&&!mobileMenu.hidden)setMenuOpen(menuItems.hidden)});
mobileMenu.append(menuToggle);document.body.append(menuItems);
document.addEventListener('pointerdown',e=>{if(!menuItems.hidden&&!mobileMenu.contains(e.target)&&!menuItems.contains(e.target))setMenuOpen(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menuItems.hidden){setMenuOpen(false);menuToggle.focus();e.preventDefault()}});
function syncMobileMenu(active){
 const show=active;
 roomsHome.hidden=true;
 if(mobileMenu.hidden===show)mobileMenu.hidden=!show;
 if(!show&&!menuItems.hidden)setMenuOpen(false);
 document.body.classList.toggle('rs-mobile-menu-active',show&&document.body.classList.contains('bc-ledger-mobile'));
 document.body.classList.toggle('rs-sender-menu-mounted',show);
 if(show){const host=!pane.hidden?senderHeader:recordMenuRow;if(mobileMenu.parentNode!==host){host.append(mobileMenu);setMenuOpen(false)}}
 recordMenuRow.hidden=!show||!pane.hidden;
 const s=snapshot();archiveMenu.textContent=s?.archiveMode?'Return to Current Session':'View Previous Records';archiveMenu.disabled=!s?.resetAt&&!s?.archiveMode;
 const breakState=document.querySelector('[data-break-action="request"]'),breakItem=menuItems.querySelector('[data-break-menu="blackcell:redline:break-menu"]');if(breakItem&&breakState){breakItem.textContent=breakState.textContent;breakItem.disabled=breakState.disabled||!!s?.archiveMode;}
 const favoriteItem=menuItems.querySelector('[data-break-menu="blackcell:redline:favorites-menu"]');if(favoriteItem)favoriteItem.disabled=!!s?.archiveMode;
 for(const [key,item] of menuOptions){
  const selected=tabs[key].getAttribute('aria-selected')==='true';
  item.classList.toggle('is-current',selected);
  if(selected)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  item.disabled=tabs[key].disabled;
 }
}
// The actual authenticated composer becomes the primary sender screen.
pane.insertBefore(chat,pane.firstElementChild);
const uploadDrawer=create('details','redline-messenger-upload');
uploadDrawer.id='redlineSenderMessengerUpload';
const uploadHandle=create('summary','redline-messenger-drawer-handle','＋ ADD PHOTOS · SECURE UPLOAD');
uploadDrawer.append(uploadHandle,intro,mount);
pane.append(uploadDrawer);
// Legacy activity and money widgets remain accessible beneath the conversation
// rather than pushing the message composer off-screen.
const recordDrawer=create('details','redline-messenger-records');
recordDrawer.append(create('summary','redline-messenger-drawer-handle',
 'SESSION DETAILS · PAYMENTS & ACTIVITY'));
if(summary)recordDrawer.append(summary);
if(activity)recordDrawer.append(activity);
pane.append(recordDrawer);
addPhoto.textContent='＋';
addPhoto.title='Add a private photo';
addPhoto.setAttribute('aria-controls',uploadDrawer.id);
addPhoto.setAttribute('aria-label','Open private photo upload');
// The message composer + now opens the REDLINE Phone/BLACKCELL Photos
// source chooser via the sender module. The drawer remains available below.
const closeUpload=create('button','redline-messenger-drawer-close','DONE');
closeUpload.type='button';
closeUpload.addEventListener('click',()=>{uploadDrawer.open=false;addPhoto.focus({preventScroll:true})});
uploadDrawer.insertBefore(closeUpload,intro);
uploadDrawer.addEventListener('toggle',()=>{
 addPhoto.setAttribute('aria-expanded',String(uploadDrawer.open));
 document.body.classList.toggle('redline-upload-sheet-open',sender()&&uploadDrawer.open);
});
addPhoto.setAttribute('aria-expanded','false');
// The REDLINE timer is already server-controlled and pinned in this chat.
// We display its live amount without creating any additional timer requests.
const liveStrip=create('details','redline-messenger-live-strip');
liveStrip.id='redlineSenderLiveSession';
liveStrip.setAttribute('aria-label','Live sender earnings and session details');
const stripHead=create('summary','redline-messenger-live-head');
function field(name,label){
 const wrap=create('span','redline-messenger-live-field '+name);
 const title=create('small','',label);
 const number=create('strong','','—');
 wrap.append(title,number);
 stripHead.append(wrap);
 return {title,number};
}
const timer=field('is-timer','LIVE TIMER');
const approved=field('is-approved','APPROVED');
const elapsed=field('is-elapsed','ELAPSED');
const details=create('div','redline-messenger-live-details');
const owed=create('span','','Owed $0.00');
const paid=create('span','','Recorded paid $0.00');
const pending=create('span','','0 pending photos');
const rate=create('span','','Timer not running');
details.append(owed,paid,pending,rate);
liveStrip.append(stripHead,details);
liveStrip.hidden=true;
const senderHeader=create('div','rs-sender-menu-header');senderHeader.append(liveStrip,mobileMenu);chat.insertBefore(senderHeader,$('.redline-chat-timer-slot',chat));
const recordMenuRow=create('div','rs-sender-menu-record-row');recordMenuRow.hidden=true;home.insertBefore(recordMenuRow,home.querySelector('.redline-simple-panes'));
// Currently Viewing is a quick route to the existing signed-image preview;
// we do not disclose another private image or duplicate server requests.
const quick=create('div','redline-messenger-quick');
const currentButton=create('button','','◉ Currently Viewing');
const historyButton=create('button','','▣ Photo History');
for(const button of [currentButton,historyButton])button.type='button';
currentButton.addEventListener('click',()=>tabs.viewing?.click());
historyButton.addEventListener('click',()=>tabs.history?.click());
quick.append(currentButton,historyButton);
quick.hidden=true;
chat.insertBefore(quick,composer);
const uploadProgress=create('div','rs-upload-progress');
uploadProgress.hidden=true;uploadProgress.setAttribute('role','status');uploadProgress.setAttribute('aria-live','polite');
const uploadProgressLabel=create('span','rs-upload-progress-label');
const uploadMeter=create('progress','rs-upload-progress-meter');uploadMeter.setAttribute('aria-label','Photo upload progress');
const uploadDismiss=create('button','rs-upload-progress-dismiss','×');uploadDismiss.type='button';uploadDismiss.setAttribute('aria-label','Dismiss upload summary');
let dismissedProgress=null;
uploadDismiss.addEventListener('click',()=>{dismissedProgress=window.BLACKCELL_REDLINE_UPLOAD_UI?.progress;uploadProgress.hidden=true});
uploadProgress.append(uploadProgressLabel,uploadMeter,uploadDismiss);
chat.insertBefore(uploadProgress,composer);
function syncUploadProgress(active){
 const p=window.BLACKCELL_REDLINE_UPLOAD_UI?.progress;
 const show=active&&p&&p.total>0&&p!==dismissedProgress;
 uploadProgress.hidden=!show;
 if(!show)return;
 const done=Math.min(p.total,p.done+p.failed);
 const label=p.phase==='saving'?'Saving queue · do not refresh':p.phase==='saved'?'Saved · refresh-safe':p.phase==='recovering'?'Resuming saved uploads · '+p.total+' remaining':p.phase==='waiting'?'Paused · saved queue will retry':p.active?'Uploading photos · '+done+'/'+p.total:'Uploaded '+p.done+' of '+p.total+(p.failed?' · '+p.failed+' failed':'')+(done<p.total?' · '+(p.total-done)+' not sent':'');
 if(uploadProgressLabel.textContent!==label)uploadProgressLabel.textContent=label;
 uploadProgressLabel.title=p.message||label;
 uploadMeter.max=p.total;uploadMeter.value=done;
 uploadDismiss.hidden=p.active||p.phase==='waiting';
 uploadProgress.classList.toggle('is-active',p.active);
}
const headerStrong=$('.redline-message-header strong',chat);
const headerSmall=$('.redline-message-header small',chat);
const senderDot=create('span','rs-brand-session-dot');
senderDot.hidden=true;senderDot.setAttribute('role','img');
const brandTitle=$('#ledgerBrand .brand-label strong');
brandTitle?.append(senderDot);
function syncSenderDot(active,s){
 const show=active&&document.body.classList.contains('bc-ledger-mobile');
 if(senderDot.hidden===show)senderDot.hidden=!show;
 const state=!show||!s?.roomId||s.archiveMode?'idle':s.roomActive===true?'active':s.roomActive===false?'ended':'idle';
 const description=state==='active'?'Verified · Active private room':state==='ended'?'Verified · Session ended':'Verified · No active room';
 if(senderDot.dataset.state!==state)senderDot.dataset.state=state;
 if(senderDot.getAttribute('aria-label')!==description){senderDot.setAttribute('aria-label',description);senderDot.title=description}
}
let lastRoomId=null;
function update(){
 const s=snapshot();
 const active=sender();
 const onChat=active&&!pane.hidden;
 document.body.classList.toggle('redline-sender-messenger',active);
 syncMobileMenu(active);
 syncSenderDot(active,s);
 syncUploadProgress(active);
 if(sendButton&&active&&document.body.classList.contains('bc-ledger-mobile')){
  sendButton.setAttribute('aria-label','Send message');sendButton.title='Send message';
 }
 liveStrip.hidden=!active;
 quick.hidden=!active;
 document.body.classList.toggle('redline-chat-immersive',onChat);
 if(!active){
  document.body.classList.remove('redline-upload-sheet-open');
  return;
 }
 if(chat.parentElement!==pane)pane.insertBefore(chat,pane.firstElementChild);
 if(s.roomId!==lastRoomId){
  lastRoomId=s.roomId;
  uploadDrawer.open=false;recordDrawer.open=false;liveStrip.open=false;
 }
 if(headerStrong)headerStrong.textContent=s.peerName||'REDLINE · PRIVATE CHAT';
 if(headerSmall)headerSmall.textContent=s.archiveMode?'PREVIOUS SESSION · READ ONLY':
  s.roomActive?'● LIVE PRIVATE SESSION · TWO PEOPLE':'PRIVATE ROOM CLOSED';
 approved.number.textContent=s.assigned||'$0.00';
 owed.textContent='Outstanding '+(s.owed||'$0.00');
 paid.textContent='Recorded paid '+(s.paid||'$0.00');
 pending.textContent=String(s.pending||0)+' awaiting review';
 const pinned=$('.redline-chat-timer-slot .redline-chat-timer[data-timer-phase="active"]',chat);
 const amount=$('.redline-chat-timer-amount',pinned)?.textContent||'';
 const clock=$('.redline-chat-timer-clock',pinned)?.textContent||'';
 const minuteRate=$('.redline-chat-timer-rate',pinned)?.textContent||'';
 if(pinned&&!s.archiveMode){
  timer.title.textContent='LIVE TIMER EARNED';
  timer.number.textContent=amount.replace(/\s*earned.*$/i,'')||'$0.0000';
  elapsed.number.textContent=clock.replace(/\s*elapsed.*$/i,'')||'00:00';
  rate.textContent=minuteRate||'Timer running';
 }else{
  timer.title.textContent='LIVE TIMER';
  timer.number.textContent='$0.0000';
  elapsed.number.textContent='—';
  rate.textContent='Timer not running';
 }
 liveStrip.classList.toggle('is-running',Boolean(pinned&&!s.archiveMode));
 addPhoto.disabled=Boolean(s.archiveMode||!s.roomActive||s.photoSendingPaused);
 addPhoto.title=s.photoSendingPaused?'Photo sending paused by receiver':'Add a private photo';
 if(!onChat){uploadDrawer.open=false;recordDrawer.open=false;}
}
// Android Chrome 108+ often resizes only its visual viewport for the
// software keyboard. The fullscreen REDLINE pane uses 100dvh + overflow:hidden
// and can otherwise cut off the composer when the user starts typing or
// returns from another Android app.
const textEntry=$('.redline-message-entry',chat);
const androidKeyboard=/Android/i.test(navigator.userAgent||'');
const visual=window.visualViewport;
let openViewportHeight=Math.max(window.innerHeight||0,visual?.height||0);
let viewportFrame=0;
function adjustKeyboard(){
 if(!androidKeyboard||!textEntry)return;
 const visible=Math.max(0,Math.round(visual?.height||window.innerHeight||0));
 const focused=sender()&&!pane.hidden&&document.activeElement===textEntry;
 const keyboardOpen=focused&&visible>170&&openViewportHeight-visible>105;
 document.body.classList.toggle('redline-android-keyboard-open',keyboardOpen);
 if(keyboardOpen){
  document.documentElement.style.setProperty('--redline-visible-height',visible+'px');
  document.body.dataset.redlineKeyboardMode='open';
 }else{
  document.documentElement.style.removeProperty('--redline-visible-height');
  document.body.dataset.redlineKeyboardMode='closed';
  if(!focused&&visible>openViewportHeight-28)openViewportHeight=Math.max(openViewportHeight,visible);
 }
}
function queueKeyboard(){
 if(!androidKeyboard)return;
 // Apply the keyboard inset synchronously. Android can suppress animation
 // frames during keyboard expansion or while a resumed tab is recovering.
 adjustKeyboard();
 if(viewportFrame)return;
 viewportFrame=window.requestAnimationFrame(()=>{viewportFrame=0;adjustKeyboard()});
}
if(androidKeyboard&&textEntry){
 textEntry.addEventListener('focus',()=>{
  queueKeyboard();
  // Delayed passes cover Android keyboard reveal and app-resume animation.
  window.setTimeout(queueKeyboard,160);
  window.setTimeout(queueKeyboard,450);
 });
 textEntry.addEventListener('blur',()=>{
  window.requestAnimationFrame(queueKeyboard);
  window.setTimeout(queueKeyboard,180);
 });
 visual?.addEventListener('resize',queueKeyboard);
 visual?.addEventListener('scroll',queueKeyboard);
 window.addEventListener('resize',queueKeyboard,{passive:true});
 window.addEventListener('pageshow',()=>{
  queueKeyboard();window.setTimeout(queueKeyboard,260);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueKeyboard()});
 window.addEventListener('orientationchange',()=>{
  // An orientation change establishes a new keyboard-free baseline after
  // the Android viewport settles, rather than using the old orientation.
  window.setTimeout(()=>{
   if(document.activeElement!==textEntry){
    openViewportHeight=Math.max(window.innerHeight||0,visual?.height||0);
   }
   queueKeyboard();
  },350);
 });
 queueKeyboard();
}
for(const event of ['blackcell:redline:bridge','blackcell:redline:state',
 'blackcell:redline:reset','blackcell:redline:session-mode',
 'blackcell:redline:timer-status','blackcell:redline:messages-changed','blackcell:redline:sender-tab','blackcell:redline:break-state'])
 window.addEventListener(event,update);
const observer=new MutationObserver(()=>requestAnimationFrame(update));
for(const node of [app,room,home,pane])observer.observe(node,{
 attributes:true,attributeFilter:['hidden']
});
for(const tab of Object.values(tabs))tab?.addEventListener('click',()=>requestAnimationFrame(update));
window.addEventListener('pageshow',update);
window.addEventListener('blackcell:redline:upload-progress',()=>syncUploadProgress(sender()));
window.addEventListener('blackcell:redline:device-mode',update);
window.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
window.setInterval(()=>{if(!document.hidden&&sender())update()},1000);
update();
})();
