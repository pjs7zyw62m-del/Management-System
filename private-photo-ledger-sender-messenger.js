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
const $=(selector,root=document)=>root.querySelector(selector);
const pane=$('[data-redline-pane="upload"]',home);
const chat=$('.redline-message-card',pane);
const feed=$('.redline-message-feed',chat);
const composer=$('#redlineMessageComposer',chat);
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
addPhoto.addEventListener('click',()=>{
 if(!sender())return;
 uploadDrawer.open=!uploadDrawer.open;
 if(uploadDrawer.open)uploadHandle.focus({preventScroll:true});
});
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
chat.insertBefore(liveStrip,$('.redline-chat-timer-slot',chat));
// Currently Viewing is a quick route to the existing signed-image preview;
// we do not disclose another private image or duplicate server requests.
const quick=create('div','redline-messenger-quick');
const currentButton=create('button','','◉ Currently Viewing');
const historyButton=create('button','','▣ Photo History');
for(const button of [currentButton,historyButton])button.type='button';
currentButton.addEventListener('click',()=>tabs.viewing?.click());
historyButton.addEventListener('click',()=>tabs.history?.click());
quick.append(currentButton,historyButton);
chat.insertBefore(quick,composer);
const headerStrong=$('.redline-message-header strong',chat);
const headerSmall=$('.redline-message-header small',chat);
let lastRoomId=null;
function update(){
 const s=snapshot();
 const active=sender();
 const onChat=active&&!pane.hidden;
 document.body.classList.toggle('redline-sender-messenger',active);
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
  timer.number.textContent=amount.replace(/\\s*earned.*$/i,'')||'$0.0000';
  elapsed.number.textContent=clock.replace(/\\s*elapsed.*$/i,'')||'00:00';
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
for(const event of ['blackcell:redline:bridge','blackcell:redline:state',
 'blackcell:redline:reset','blackcell:redline:session-mode',
 'blackcell:redline:timer-status','blackcell:redline:messages-changed'])
 window.addEventListener(event,update);
const observer=new MutationObserver(()=>requestAnimationFrame(update));
for(const node of [app,room,home,pane])observer.observe(node,{
 attributes:true,attributeFilter:['hidden']
});
window.addEventListener('pageshow',update);
window.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
window.setInterval(()=>{if(!document.hidden&&sender())update()},1000);
update();
})();
