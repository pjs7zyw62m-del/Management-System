/* BLACKCELL REDLINE — Sender Upload + Earnings + Messages (v4).
   All money and photo facts come from the authenticated REDLINE bridge.
   The real upload form is moved, not cloned or replaced. Text chat uses a
   room-scoped RLS table, not the separate corporate Network chat.
*/
(()=>{
'use strict';
const $=(q,root=document)=>root.querySelector(q);
const make=(tag,cls,copy)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(copy!==undefined)el.textContent=copy;
 return el;
};
const app=$('#ledgerApp'),room=$('#activeRoom'),upload=$('#employeeUpload'),ownerSetup=$('#ownerSetup');
if(!app||!room||!upload||!ownerSetup)return;
const home=make('section','redline-simple-home');
home.id='redlineSimpleSender';home.hidden=true;
home.setAttribute('aria-label','BLACKCELL REDLINE sender workspace');
const heading=make('header','redline-simple-header');
const branding=make('div','redline-simple-brand');
branding.append(make('span','redline-simple-mark','B'));
const words=make('div','redline-simple-wordmark');
words.append(make('strong','','BLACKCELL'),make('strong','redline-accent','REDLINE'));
branding.append(words);
const roomsHome=make('button','rd-home-shortcut','← Rooms');roomsHome.type='button';roomsHome.setAttribute('aria-label','Return to REDLINE main room directory');roomsHome.addEventListener('click',()=>window.BLACKCELL_REDLINE_API?.returnToRooms?.());
heading.append(roomsHome,branding,make('span','redline-sender-badge','SENDER ACCESS'));
const tabs=make('nav','redline-simple-tabs');tabs.setAttribute('aria-label','Sender sections');
const panes=make('div','redline-simple-panes');
const uploadPane=make('section','redline-simple-pane');uploadPane.dataset.redlinePane='upload';
const viewingPane=make('section','redline-simple-pane redline-current-viewing-pane');viewingPane.dataset.redlinePane='viewing';viewingPane.hidden=true;
const earningsPane=make('section','redline-simple-pane');earningsPane.dataset.redlinePane='earnings';earningsPane.hidden=true;
const historyPane=make('section','redline-simple-pane redline-photo-history-pane');
historyPane.dataset.redlinePane='history';historyPane.hidden=true;
const fiveStarPane=make('section','redline-simple-pane redline-five-star-pane');
fiveStarPane.dataset.redlinePane='five-star';fiveStarPane.hidden=true;
// Private chat stays in Photos & Chat.
for(const [key,label] of [['upload','Photos & Chat'],['viewing','Currently Viewing'],['earnings','Earnings'],['history','Photo History'],['five-star','5-Star Photos']]){
 const b=make('button','redline-simple-tab',label);b.type='button';b.dataset.simpleTab=key;
 b.addEventListener('click',()=>switchTab(key));
 tabs.append(b);
}
const uploadTitle=make('div','redline-upload-intro');
uploadTitle.append(make('span','redline-kicker','PRIVATE MEDIA'),make('h2','','Send a photo'));
const triggerShortcut=make('button','redline-sender-trigger-shortcut','⚡ TRIGGER WORDS · SET PRICES');
triggerShortcut.type='button';
triggerShortcut.setAttribute('aria-label','Open the sender Trigger Words tutorial and pricing');
triggerShortcut.addEventListener('click',()=>{
 window.dispatchEvent(new Event('blackcell:redline:open-trigger-words'));
});
uploadTitle.append(triggerShortcut);
uploadPane.append(uploadTitle);
const uploadMount=make('div','redline-upload-mount');uploadPane.append(uploadMount);
const viewingIntro=make('header','redline-current-viewing-intro');
viewingIntro.append(make('span','redline-kicker','LIVE PRIVATE PHOTO'),
 make('h2','','Currently Viewing'),
 make('p','','The exact photo the receiver has selected in REDLINE. Updates automatically.'));
const viewingStatusLine=make('p','redline-current-viewing-status');viewingStatusLine.setAttribute('role','status');
const viewingPreview=make('div','redline-current-viewing-photo');
viewingPane.append(viewingIntro,viewingStatusLine,viewingPreview);
const earningsBox=make('section','redline-earnings-box');
earningsBox.append(make('div','redline-heading-kicker','WHAT YOU EARN'));
const earnedFields=make('div','redline-earnings-fields');
const dataValues={};
for(const [id,label] of [['pending','Pending review'],['owed','Approved / owed'],['paid','Recorded paid'],['total','Total approved']]){
 const line=make('div','redline-earnings-row');
 line.append(make('span','',label));
 const val=make('strong','','—');val.dataset.redlineAmount=id;
 dataValues[id]=val;line.append(val);earnedFields.append(line);
}
earningsBox.append(earnedFields);
 const partialPayments=make('section','redline-sender-payment-history');
 partialPayments.append(make('h3','','RECORDED PAYMENTS'));
 const paymentRows=make('div','redline-sender-payment-rows');
 partialPayments.append(paymentRows);
earningsBox.append(make('p','redline-earnings-hint','REDLINE records amounts and owner-confirmed settlements. It does not transfer money.'));
const archiveNotice=make('p','redline-archive-sender-notice');
const archiveButton=make('button','redline-archive-sender-button','VIEW PREVIOUS RECORDS');
archiveButton.type='button';archiveButton.hidden=true;
archiveButton.addEventListener('click',async()=>{
 archiveButton.disabled=true;
 try{
  await bridge()?.toggleArchive?.();
  messages=[];lastSync=0;chatInitialPositionPending=true;lastChatViewSignature='';
  renderChat();
  if(currentTab==='upload')await loadMessages();
 }catch(err){msgError.textContent='Archive is unavailable: '+String(err?.message||err)}
 finally{archiveButton.disabled=false}
});
earningsBox.append(archiveNotice,archiveButton,partialPayments);
const activityBox=make('section','redline-activity-box');
activityBox.append(make('h3','','Recent activity'));
const activityList=make('div','redline-activity-list');activityBox.append(activityList);
const returnUpload=make('button','redline-main-action','+ UPLOAD ANOTHER PHOTO');
returnUpload.type='button';returnUpload.addEventListener('click',()=>switchTab('upload'));
const topPicksBox=make('section','redline-top-picks-box');
topPicksBox.append(make('h3','','YOUR TOP PICKS'));
const topPicksNote=make('p','redline-top-picks-note',
 'Ranked by receiver stars, then approved bid when ratings match.');
const topPicksList=make('div','redline-top-picks-list');
topPicksBox.append(topPicksNote,topPicksList);
earningsPane.append(earningsBox,topPicksBox,activityBox,returnUpload);
const historyIntro=make('header','redline-photo-history-intro');
historyIntro.append(make('span','redline-kicker','PRIVATE SENDER COLLECTION'),
 make('h2','','Photo History'),
 make('p','','All submitted photos, prices and ratings. Reuse approved originals for a new private review without changing previous amounts or ratings.'));
const historyControls=make('div','redline-history-controls');
const historyAll=make('button','redline-history-filter is-current','ALL PHOTOS');
const historyPicks=make('button','redline-history-filter','5-STAR TOP PICKS');
const historyArchive=make('button','redline-history-archive','PREVIOUS RECORDS');
for(const b of [historyAll,historyPicks,historyArchive])b.type='button';
historyControls.append(historyAll,historyPicks,historyArchive);
const historyCount=make('small','redline-history-count');
const historyFeedback=make('p','redline-photo-history-feedback');historyFeedback.setAttribute('role','status');
const historyList=make('div','redline-photo-history-list');
const historyMore=make('button','redline-history-more','LOAD MORE PHOTOS');
historyMore.type='button';historyMore.hidden=true;
historyPane.append(historyIntro,historyControls,historyCount,historyFeedback,historyList,historyMore);
const fiveStarIntro=make('header','redline-five-star-intro');
fiveStarIntro.append(make('span','redline-kicker','RECEIVER-RATED PHOTOS'),
 make('h2','','Your 5-Star Photos'),
 make('p','','Reuse an approved original for another review. Each reuse creates a new pending photo; the original rating and price remain unchanged.'));
const fiveStarStatus=make('p','redline-five-star-feedback');
fiveStarStatus.setAttribute('role','status');
const fiveStarList=make('div','redline-five-star-list');
const fiveStarArchive=make('button','redline-history-archive','VIEW PREVIOUS RECORDS');
fiveStarArchive.type='button';fiveStarArchive.hidden=true;
fiveStarArchive.addEventListener('click',async()=>{
 fiveStarArchive.disabled=true;
 try{await bridge()?.toggleArchive?.();renderFiveStarPhotos(snapshot())}
 catch(e){fiveStarStatus.textContent=String(e?.message||e).slice(0,200)}
 finally{fiveStarArchive.disabled=false}
});
fiveStarPane.append(fiveStarIntro,fiveStarArchive,fiveStarStatus,fiveStarList);
const recordNav=make('nav','rd-sender-record-nav');recordNav.hidden=true;recordNav.setAttribute('aria-label','Sender records');
for(const [key,label] of [['upload','‹ Messages'],['earnings','Earnings'],['history','History'],['five-star','★ 5-Star']]){
 const b=make('button','',label);b.type='button';b.dataset.recordTab=key;b.addEventListener('click',()=>switchTab(key));recordNav.append(b);
}
const recordRefresh=make('button','rd-sender-record-refresh','↻ Refresh records');recordRefresh.type='button';recordRefresh.hidden=true;
const recordFeedback=make('p','rd-sender-record-feedback');recordFeedback.setAttribute('role','status');recordFeedback.hidden=true;
let recordsRefreshing=false;
async function refreshRecords(){
 if(recordsRefreshing||!isSender())return;
 recordsRefreshing=true;recordRefresh.disabled=true;recordFeedback.textContent='Refreshing private records…';
 try{if(bridge()?.refreshSenderRecords)await bridge().refreshSenderRecords();sync();recordFeedback.textContent='Records refreshed.'}
 catch(e){recordFeedback.textContent='Could not refresh: '+String(e?.message||e).slice(0,180)}
 finally{recordsRefreshing=false;recordRefresh.disabled=false}
}
recordRefresh.addEventListener('click',()=>void refreshRecords());
const summary=make('section','redline-upload-summary');
const summaryTitle=make('h3','','Your earnings');
const summaryRows=make('div','redline-summary-stats');
const summaryOwed=make('div','redline-summary-stat'),summaryPaid=make('div','redline-summary-stat');
summaryOwed.append(make('span','','APPROVED / OWED'));
const sOwed=make('strong','','$0.00');summaryOwed.append(sOwed);
summaryPaid.append(make('span','','RECORDED PAID'));
const sPaid=make('strong','','$0.00');summaryPaid.append(sPaid);
summaryRows.append(summaryOwed,summaryPaid);
summary.append(summaryTitle,summaryRows);
uploadPane.append(summary);
const activityTeaser=make('section','redline-activity-teaser');
activityTeaser.append(make('h3','','Recent activity'));
const teaserList=make('div','redline-activity-teaser-list');activityTeaser.append(teaserList);
const seeActivity=make('button','redline-link-action','SEE ALL EARNINGS');
seeActivity.type='button';seeActivity.addEventListener('click',()=>switchTab('earnings'));
activityTeaser.append(seeActivity);uploadPane.append(activityTeaser);
const messageCard=make('section','redline-message-card');
const msgHeader=make('header','redline-message-header');
const msgTitle=make('div');
msgTitle.append(make('strong','','PRIVATE CHAT — REDLINE'),make('small','','Two-way conversation · Owner + Sender only'));
msgHeader.append(msgTitle);
// Keep the running timer above, not inside, the independent message scroller.
const timerSlot=make('div','redline-chat-timer-slot');timerSlot.hidden=true;
timerSlot.setAttribute('aria-label','Active private photo timer');
const feed=make('div','redline-message-feed');feed.setAttribute('role','log');feed.setAttribute('aria-live','polite');
const empty=make('div','redline-chat-empty','No messages yet. Your conversation and photo-review updates will appear here.');
feed.append(empty);
const composer=make('form','redline-message-composer');
composer.id='redlineMessageComposer';
const photoAction=make('button','redline-chat-photo','PHOTO ABOVE');
photoAction.type='button';photoAction.setAttribute('aria-label','Open photo upload');
photoAction.addEventListener('click',()=>{if(home.hidden)return;switchTab('upload');window.BLACKCELL_REDLINE_UPLOAD_UI?.open?.()});
const entry=make('textarea','redline-message-entry');entry.maxLength=2000;entry.rows=1;entry.placeholder='Message REDLINE…';entry.setAttribute('aria-label','Private room message');
entry.setAttribute('dir','ltr');entry.setAttribute('inputmode','text');entry.setAttribute('enterkeyhint','send');
// Android 11 and other Android browsers can resume a suspended textarea with
// the caret stuck at the beginning, prepending each letter to the draft.
let androidRedlineCaretGuard=null;
if(/Android/i.test(navigator.userAgent||'')){
 void import('./corporate-chat-android-caret.js?v=20261122-redline-caret1')
  .then(({installAndroidChatCaretGuard})=>{
   androidRedlineCaretGuard=installAndroidChatCaretGuard(entry);
  }).catch(()=>{/* Native editor still remains available if helper cannot load. */});
}
const send=make('button','redline-chat-send','SEND');send.type='submit';
composer.append(photoAction,entry,send);
const typingNotice=make('div','redline-peer-typing','');typingNotice.hidden=true;
typingNotice.setAttribute('role','status');typingNotice.setAttribute('aria-live','polite');
const msgError=make('p','redline-message-error');msgError.setAttribute('role','status');
messageCard.append(msgHeader,timerSlot,feed,typingNotice,composer,msgError);
uploadPane.append(messageCard);
panes.append(uploadPane,viewingPane,earningsPane,historyPane,fiveStarPane);
home.append(heading,tabs,recordNav,recordRefresh,recordFeedback,panes);
room.insertBefore(home,$('.room-toolbar',room));
const ownerDialog=make('dialog','redline-owner-chat-dialog');
ownerDialog.id='redlineOwnerMessageDialog';
const ownerTop=make('header','redline-owner-chat-top');
ownerTop.append(make('strong','','REDLINE · PRIVATE MESSAGES'));
const ownerClose=make('button','','✕ CLOSE');ownerClose.type='button';ownerClose.addEventListener('click',()=>ownerDialog.close());
ownerTop.append(ownerClose);
const ownerMount=make('div','redline-owner-chat-mount');
ownerDialog.append(ownerTop,ownerMount);document.body.append(ownerDialog);
const ownerPanel=$('#ownerUploadInfo');
const ownerButton=make('button','redline-owner-open-messages','MESSAGE SENDER');
ownerButton.id='redlineOwnerMessageLaunch';ownerButton.type='button';
ownerPanel?.append(ownerButton);
const receiverChatMount=()=>$('#redlineReceiverChatMount');
const receiverChatPanel=()=>$('#redlineReceiverChat');
ownerButton.addEventListener('click',()=>{
 const snap=window.BLACKCELL_REDLINE_API?.snapshot?.();
 if(!snap?.isOwner)return;
 const panel=receiverChatPanel();
 if(panel&&!panel.hidden&&receiverChatMount()){
  // Focus the composer without jumping the entire receiver page.
  entry.focus({preventScroll:true});return;
 }
 ownerMount.append(messageCard);
 photoAction.hidden=true;
 ownerDialog.showModal();requestAnimationFrame(restoreReaderAnchor);
 void loadMessages();void pollChatStatus(true);
});
ownerDialog.addEventListener('close',()=>{
 const inline=receiverChatMount(),panel=receiverChatPanel();
 if(inline&&panel&&!panel.hidden)inline.append(messageCard);
 else uploadPane.append(messageCard);
 photoAction.hidden=Boolean(inline&&panel&&!panel.hidden);
 requestAnimationFrame(restoreReaderAnchor);
 entry.value='';
});
ownerDialog.addEventListener('click',e=>{if(e.target===ownerDialog)ownerDialog.close()});
let currentTab='upload',lastRoom=null,lastSessionKey=null,messages=[],loading=false,posting=false,roomReady=false;
let lastSync=0,lastOwnerSession=null,lastChatViewSignature='';
let chatInitialPositionPending=true,chatOwnSendPending=false;
// Keep a durable anchor for a human reading older messages. Chrome may silently
// reset scrollTop to 0 when the authenticated receiver panel is temporarily
// hidden/reparented or its flex layout is recalculated. Restoring "scrollBefore"
// from that zero is the source of the repeated top/bottom conversation jumps.
let readerAnchor=null,readerGestureUntil=0,readerRestoring=false;
function readerRoomKey(){
 const s=snapshot();
 return s?.roomId?s.roomId+'|'+String(Boolean(s.archiveMode)):null;
}
function saveReaderAnchor(){
 if(!feed.isConnected||feed.clientHeight<24)return;
 const roomKey=readerRoomKey();
 if(!roomKey)return;
 const max=Math.max(0,feed.scrollHeight-feed.clientHeight);
 if(max<40||max-feed.scrollTop<35){readerAnchor=null;return}
 const viewport=feed.getBoundingClientRect();
 const node=[...feed.children].find(el=>{
  if(!el.dataset.redlineItemKey)return false;
  const box=el.getBoundingClientRect();
  return box.bottom>viewport.top+2&&box.top<viewport.bottom;
 });
 readerAnchor={roomKey,top:feed.scrollTop,key:node?.dataset.redlineItemKey||'',
  offset:node?node.getBoundingClientRect().top-viewport.top:0};
}
function restoreReaderAnchor(){
 if(!readerAnchor||readerRestoring||!feed.isConnected||feed.clientHeight<24||
    readerRoomKey()!==readerAnchor.roomKey)return;
 // Do not compete with a wheel, drag, swipe or keyboard scroll in progress.
 if(Date.now()<readerGestureUntil)return;
 const max=Math.max(0,feed.scrollHeight-feed.clientHeight);
 let desired=Math.min(readerAnchor.top,max);
 if(readerAnchor.key){
  const anchor=[...feed.children].find(el=>el.dataset.redlineItemKey===readerAnchor.key);
  if(anchor){
   const top=anchor.getBoundingClientRect().top-feed.getBoundingClientRect().top+feed.scrollTop;
   desired=Math.max(0,Math.min(max,top-readerAnchor.offset));
  }
 }
 if(Math.abs(feed.scrollTop-desired)>1){
  readerRestoring=true;
  feed.scrollTop=desired;
  requestAnimationFrame(()=>{readerRestoring=false});
 }
}
function markReaderGesture(){
 chatInitialPositionPending=false;
 readerGestureUntil=Date.now()+900;
 // Capture after the browser processes the user's real scroll movement.
 requestAnimationFrame(()=>requestAnimationFrame(saveReaderAnchor));
}
for(const type of ['wheel','touchstart','pointerdown','keydown','touchmove','touchend'])
 feed.addEventListener(type,markReaderGesture,{passive:true});
feed.addEventListener('pointermove',event=>{
 if(event.buttons)markReaderGesture();
},{passive:true});
feed.addEventListener('pointerup',markReaderGesture,{passive:true});
feed.addEventListener('scroll',()=>{
 if(!readerRestoring&&Date.now()<readerGestureUntil)
  requestAnimationFrame(saveReaderAnchor);
},{passive:true});
if(typeof ResizeObserver!=='undefined'){
 const readerResizeObserver=new ResizeObserver(()=>{
  if(readerAnchor)requestAnimationFrame(restoreReaderAnchor);
 });
 readerResizeObserver.observe(feed);
 readerResizeObserver.observe(messageCard);
}
let timerStatus=null,timerRoomId=null,timerFingerprint='',timerOffset=0;
let timerPollInFlight=false,timerLastPoll=0,timerLoadError='';
let peerReadAt=null,peerTyping=false,markedReadId=null;
let viewingStatus=null,viewingRoomId=null,viewingInFlight=false,viewingLastPoll=0,viewingError='';
let typingRoom=null,lastTypingAt=0,chatStatusInFlight=false,lastChatStatusAt=0;
function bridge(){return window.BLACKCELL_REDLINE_API}
const snapshot=()=>bridge()?.snapshot?.()||null;
function isSender(){
 const snap=snapshot();
 return Boolean(snap&&!snap.isOwner&&!app.hidden&&!room.hidden);
}
function money(value){const n=BigInt(value||0);return '$'+(n/100n).toLocaleString('en-US')+'.'+(n%100n).toString().padStart(2,'0')}
// Show sub-cent earnings live without rounding every second into a charge.
function liveMoney(rateCents,elapsedSeconds){
 const seconds=BigInt(Math.max(0,Math.floor(Number(elapsedSeconds)||0)));
 const units=(BigInt(rateCents||0)*seconds*100n+30n)/60n;
 return '$'+(units/10000n).toLocaleString('en-US')+'.'+
  (units%10000n).toString().padStart(4,'0');
}
function dateText(iso){const d=new Date(iso);return Number.isNaN(d.valueOf())?'':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function createEvents(entries){
 const all=[];
 for(const e of entries||[]){
  const id=String(e.id||'').slice(0,8).toUpperCase();
  if(e.created_at)all.push({kind:'event',at:e.created_at,
   text:e.resubmission_origin_id
    ?'PHOTO REUSED · '+id+' · Waiting for receiver review'
    :'Photo '+id+' submitted',
   status:'sent'});
  if(e.decision_status==='rejected'&&e.decided_at)all.push({kind:'event',at:e.decided_at,text:'Photo '+id+' rejected',status:'rejected'});
  if(e.decision_status==='accepted'&&e.decided_at){
   const amount=money(e.amount_cents);
   all.push({kind:'event',at:e.decided_at,text:'Photo '+id+' approved — '+amount,status:'approved',photo:e});
  }
  if(e.settled_at&&e.decision_status==='accepted')all.push({kind:'event',at:e.settled_at,text:'Payment recorded — '+money(e.amount_cents),status:'paid'});
 }
 return all.sort((a,b)=>new Date(b.at)-new Date(a.at));
}
function paymentHistoryEvents(snap){
 const payments=Array.isArray(snap?.paymentHistory)?snap.paymentHistory:[];
 const credits=Array.isArray(snap?.photoActionBillCreditHistory)?snap.photoActionBillCreditHistory:[];
 return [
  ...payments.map(p=>({
   kind:'event',at:p.created_at,status:'paid',
   text:(p.kind==='full'?'FINAL PAYMENT RECORDED · ':'PARTIAL PAYMENT RECORDED · ')+money(p.amount_cents)
    +(p.note?' · '+p.note:'')
  })),
  ...credits.filter(c=>c.kind==='manual_rejection'||c.kind==='permanent_deletion')
   .map(c=>({
    kind:'event',at:c.credited_at,status:'bill-credit',
    text:'PHOTO '+String(c.photo_id||'').slice(0,8).toUpperCase()+
     (c.kind==='manual_rejection'?' REJECTED':' PERMANENTLY DELETED')+
     ' · BILL CREDIT -'+money(-Number(c.amount_cents||0))
   }))
 ];
}
function renderActivity(snap){
 const events=[...createEvents(snap?.entries),...paymentHistoryEvents(snap)]
  .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const show=(element,list)=>{
  element.replaceChildren();
  if(!list.length){element.append(make('p','redline-no-activity','No photo activity yet.'));return}
  for(const e of list){
   const row=make('div','redline-activity-item');
   row.append(make('span','redline-activity-dot',''));
   const info=make('div');
   info.append(make('strong','',e.text),make('small','',dateText(e.at)));
   row.append(info);element.append(row);
  }
 };
 show(activityList,events.slice(0,20));show(teaserList,events.slice(0,3));
}
function starsText(count){
 const n=Number.isInteger(count)?Math.max(0,Math.min(5,count)):0;
 return '★'.repeat(n)+'☆'.repeat(5-n);
}
function approvedPriceControl(photo,snap){
 return window.BLACKCELL_REDLINE_COUNTEROFFER_INLINE?.control?.(photo,snap)
  ||make('small','redline-current-viewing-price','APPROVED PRICE '+money(photo.amount_cents));
}
function renderCurrentlyViewing(snap){
 viewingPreview.replaceChildren();
 const id=viewingRoomId===snap?.roomId&&viewingStatus?.active?viewingStatus.photoId:null;
 if(snap?.archiveMode){viewingStatusLine.textContent='ARCHIVE · Live viewing only appears in the current session.';return}
 if(!snap?.roomActive){viewingStatusLine.textContent='ROOM CLOSED · No live photo selected.';return}
 if(viewingError){viewingStatusLine.textContent='VIEWING STATUS UNAVAILABLE · '+viewingError;return}
 if(!id){
  viewingStatusLine.textContent='WAITING · The receiver is not currently viewing a REDLINE photograph.';
  viewingPreview.append(make('p','redline-current-viewing-empty',
   'The receiver’s selected photograph will automatically appear here when they start reviewing.'));
  return;
 }
 const photo=Array.isArray(snap.photoHistory)?snap.photoHistory.find(p=>p.id===id):null;
 viewingStatusLine.textContent='● RECEIVER VIEWING NOW · PHOTO '+String(id).slice(0,8).toUpperCase();
 if(photo?.image_url&&(photo.image_url.startsWith('https://')||photo.image_url.startsWith('blob:'))){
  const img=make('img','redline-current-viewing-image');
  img.src=photo.image_url;img.alt=photo.caption||'Photograph selected by the REDLINE receiver';
  img.loading='eager';img.decoding='async';img.addEventListener('error',()=>{img.hidden=true});
  viewingPreview.append(img);
 }else viewingPreview.append(make('p','redline-current-viewing-empty',
  'The receiver selected this photograph. Loading its private preview…'));
 if(photo?.caption)viewingPreview.append(make('p','redline-current-viewing-caption',photo.caption));
 if(photo?.decision_status==='accepted')
  viewingPreview.append(approvedPriceControl(photo,snap));
 else if(photo?.decision_status==='pending')
  viewingPreview.append(make('small','redline-current-viewing-price','AWAITING RECEIVER REVIEW'));
 if(photo?.image_url&&!photo.removal_status){
  const open=make('button','redline-hd-open','⤢ VIEW ORIGINAL QUALITY');
  open.type='button';open.setAttribute('aria-label','Open receiver-selected photograph at original quality');
  open.addEventListener('click',()=>{
   window.BLACKCELL_REDLINE_HD_VIEWER?.open(photo.id);
  });
  viewingPreview.append(open);
 }
 const rootId=photo?.resubmission_origin_id||photo?.id;
 const original=(snap?.photoHistory||[]).find(p=>p.id===rootId);
 if(original?.resubmissionAllowed){
  const reuse=make('button','redline-reuse-photo-button','⟲ REUSE PHOTO');
  reuse.type='button';
  reuse.setAttribute('aria-label','Reuse the original for a new private review');
  reuse.addEventListener('click',()=>window.BLACKCELL_REDLINE_REUSE_UI?.open(rootId,reuse));
  viewingPreview.append(reuse);
 }
}
async function pollCurrentlyViewing(force=false){
 const snap=snapshot();
 if(!isSender()||!snap?.roomId||snap.archiveMode||document.hidden||
    !bridge()?.currentlyViewingStatus)return;
 if(viewingInFlight||(!force&&Date.now()-viewingLastPoll<2600))return;
 viewingLastPoll=Date.now();viewingInFlight=true;
 const roomId=snap.roomId;
 try{
  const result=await bridge().currentlyViewingStatus(roomId);
  if(snapshot()?.roomId!==roomId)return;
  const changed=viewingStatus?.photoId!==result.photoId||viewingStatus?.active!==result.active;
  viewingStatus=result;viewingRoomId=roomId;viewingError='';
  if(currentTab==='viewing'&&changed)renderCurrentlyViewing(snapshot());
 }catch(e){
  if(snapshot()?.roomId===roomId){
   viewingStatus=null;viewingRoomId=roomId;
   viewingError=String(e?.message||'Please try again.').slice(0,140);
   if(currentTab==='viewing')renderCurrentlyViewing(snapshot());
  }
 }finally{viewingInFlight=false}
}
function appendRatingImage(parent,url,caption){
 if(typeof url!=='string'||!(url.startsWith('https://')||url.startsWith('blob:')||(location.href==='about:srcdoc'&&/^data:image\/(png|jpeg|webp);base64,/.test(url))))return;
 const img=make('img','redline-rated-photo-image');
 img.src=url;img.alt=caption||'Receiver-rated private photo';
 img.loading='lazy';img.decoding='async';
 img.addEventListener('error',()=>{img.hidden=true});
 parent.append(img);
}
function renderTopPicks(snap){
 topPicksList.replaceChildren();
 if(!Array.isArray(snap?.topPicks)||!snap.topPicks.length){
  topPicksList.append(make('p','redline-top-picks-empty','No photo ratings yet.'));
  return;
 }
 for(const [index,p] of snap.topPicks.entries()){
  const card=make('article','redline-top-pick-row');card.dataset.breakPhotoId=p.id;
  appendRatingImage(card,p.image_url,p.caption);
  const details=make('div','redline-top-pick-details');
  details.append(
   make('strong','',((p.stars===5)?'TOP PICK · ':'')+'#'+(index+1)+' · PHOTO '+String(p.id||'').slice(0,8).toUpperCase()),
   make('span','redline-top-pick-stars',starsText(p.stars)+' · '+p.stars+'/5'),
   make('small','',p.amount_cents===null?'Awaiting photo bid':'APPROVED')
  );
  if(p.amount_cents!==null)details.append(approvedPriceControl(p,snap));
  const history=snap.photoHistory||[],item=history.find(x=>x.id===p.id);
  const original=history.find(x=>x.id===(item?.resubmission_origin_id||item?.id));
  if(original){
   const reuse=make('button','redline-five-star-resubmit','⟲ RESUBMIT PHOTO');reuse.type='button';reuse.title=historyResendLabel(original,snap);if(!original.resubmissionAllowed)details.append(make('small','rd-reuse-reason',reuse.title));
   reuse.disabled=!original.resubmissionAllowed;
   reuse.addEventListener('click',()=>window.BLACKCELL_REDLINE_REUSE_UI?.open(original.id,reuse));
   details.append(reuse);
  }
  card.append(details);topPicksList.append(card);
 }
}
let historyFilter='all',historyVisible=40;
historyAll.addEventListener('click',()=>{historyFilter='all';historyVisible=40;renderPhotoHistory(snapshot())});
historyPicks.addEventListener('click',()=>{historyFilter='picks';historyVisible=40;renderPhotoHistory(snapshot())});
historyMore.addEventListener('click',()=>{historyVisible+=40;renderPhotoHistory(snapshot())});
historyArchive.addEventListener('click',async()=>{
 if(historyArchive.disabled)return;
 historyArchive.disabled=true;historyFeedback.textContent='Opening photo records…';
 try{await bridge()?.toggleArchive?.();historyVisible=40;historyFeedback.textContent='';renderPhotoHistory(snapshot())}
 catch(e){historyFeedback.textContent=String(e?.message||e).slice(0,200)}
 finally{historyArchive.disabled=false}
});
function historyResendLabel(p,snap){
 if(p.resubmissionAllowed)return '⟲ RESUBMIT PHOTO';
 if(p.resubmission_origin_id)return 'REUSED COPY · SEE ORIGINAL';
 if(snap?.archiveMode)return 'ARCHIVED · REUSE UNAVAILABLE';
 if(!snap?.roomActive)return 'ROOM CLOSED';
 if(snap?.photoSendingPaused)return 'SENDING PAUSED';
 if(p.resubmissionStatus==='rejected')return 'REJECTED · REUSE CLOSED';
 if(p.resubmissionStatus==='pending')return 'REUSED COPY AWAITING REVIEW';
 if(p.decision_status==='pending')return 'AWAITING FIRST REVIEW';
 if(p.decision_status==='rejected')return 'REJECTED · CANNOT REUSE';
 return 'REUSE UNAVAILABLE';
}
async function resendHistoryPhoto(p,button,status,roomId){
 if(resubmittingId||!p.resubmissionAllowed)return;
 window.BLACKCELL_REDLINE_REUSE_UI?.open(p.id,button);
}
function renderPhotoHistory(snap){
 historyList.replaceChildren();
 const all=Array.isArray(snap?.photoHistory)?snap.photoHistory:[];
 const photos=historyFilter==='picks'?all.filter(p=>p.stars===5):all;
 historyAll.classList.toggle('is-current',historyFilter==='all');
 historyPicks.classList.toggle('is-current',historyFilter==='picks');
 historyAll.setAttribute('aria-pressed',String(historyFilter==='all'));
 historyPicks.setAttribute('aria-pressed',String(historyFilter==='picks'));
 historyCount.textContent=(snap?.archiveMode?'ARCHIVED · ':'CURRENT SESSION · ')+photos.length+
  (photos.length===1?' photo':' photos');
 historyArchive.hidden=!snap?.resetAt;
 historyArchive.textContent=snap?.archiveMode?'← RETURN TO CURRENT PHOTOS':'VIEW PREVIOUS RECORDS';
 if(!photos.length)historyList.append(make('p','redline-history-empty',
  historyFilter==='picks'?'No 5-star photos here.':'No photos sent in this '+(snap?.archiveMode?'archive.':'session yet.')));
 for(const p of photos.slice(0,historyVisible)){
  const card=make('article','redline-photo-history-row');card.dataset.breakPhotoId=p.resubmission_origin_id||p.id;
  appendRatingImage(card,p.image_url,p.caption);
  const info=make('div','redline-photo-history-details');
  const decision=p.decision_status==='accepted'?'APPROVED':
   p.decision_status==='rejected'?'REJECTED':'AWAITING REVIEW';
  info.append(make('strong','redline-history-title','PHOTO '+String(p.id||'').slice(0,8).toUpperCase()),
   make('span','redline-photo-history-stars',p.stars?starsText(p.stars)+' · '+p.stars+'/5':'NOT YET RATED'),
   make('small','redline-history-review',decision+' · '+dateText(p.created_at)));
  if(p.decision_status==='accepted')info.append(approvedPriceControl(p,snap));
  if(p.caption)info.append(make('p','redline-history-caption',p.caption));
  if(p.resubmissionCount)info.append(make('small','',p.resubmissionCount+' previous resend(s)'));
  const original=all.find(x=>x.id===(p.resubmission_origin_id||p.id))||p;
  const button=make('button','redline-photo-history-resend','⟲ RESUBMIT PHOTO');
  const reason=historyResendLabel(original,snap);button.title=reason;
  if(!original.resubmissionAllowed)info.append(make('small','rd-reuse-reason',reason));
  button.type='button';button.disabled=!original.resubmissionAllowed||Boolean(resubmittingId);
  const status=make('p','redline-five-star-row-status');status.setAttribute('role','status');
  button.addEventListener('click',()=>void resendHistoryPhoto(original,button,status,snap.roomId));
  if(p.image_url&&!p.removal_status){
   const view=make('button','redline-hd-open','⤢ VIEW ORIGINAL');
   view.type='button';view.setAttribute('aria-label','View this private original photograph full screen');
   view.addEventListener('click',()=>{
    window.BLACKCELL_REDLINE_HD_VIEWER?.open(p.id);
   });
   info.append(view);
  }
  info.append(button,status);card.append(info);historyList.append(card);
 }
 historyMore.hidden=photos.length<=historyVisible;
}
let resubmittingId=null;
function renderFiveStarPhotos(snap){
 fiveStarArchive.hidden=!snap?.resetAt;
 fiveStarArchive.textContent=snap?.archiveMode?'← RETURN TO CURRENT PHOTOS':'VIEW PREVIOUS RECORDS';
 fiveStarList.replaceChildren();
 if(!snap||!Array.isArray(snap.fiveStarPhotos)||!snap.fiveStarPhotos.length){
  fiveStarList.append(make('p','redline-five-star-empty',
   snap?.archiveMode?'No five-star photographs in previous records.':'No five-star photographs in this session yet. Check previous records if the session was reset.'));
  return;
 }
 for(const photo of snap.fiveStarPhotos){
  const card=make('article','redline-five-star-photo');card.dataset.breakPhotoId=photo.id;
  appendRatingImage(card,photo.image_url,photo.caption);
  const details=make('div','redline-five-star-details');
  details.append(
   make('strong','redline-five-star-title','PHOTO '+photo.id.slice(0,8).toUpperCase()),
   make('span','redline-five-star-stars','★★★★★ · TOP PICK'),
   make('small','',photo.resubmissionCount+
    (photo.resubmissionCount===1?' previous resend':' previous resends')));
  if(photo.caption)details.append(make('p','redline-five-star-caption',photo.caption));
  let label=snap.archiveMode?'ARCHIVED · VIEW ONLY':'⟲ REUSE PHOTO';
  if(photo.resubmissionStatus==='pending')label='AWAITING RECEIVER REVIEW';
  if(photo.resubmissionStatus==='original-pending')label='AWAITING FIRST APPROVAL';
  if(photo.resubmissionStatus==='rejected')label='REJECTED · REUSE CLOSED';
  if(snap.photoSendingPaused&&photo.resubmissionStatus==='ready')label='SENDING PAUSED BY RECEIVER';
  if(!snap.roomActive&&photo.resubmissionStatus==='ready')label='ROOM CLOSED';
  if(snap.archiveMode)label='ARCHIVED · VIEW ONLY';
  const action=make('button','redline-five-star-resubmit','⟲ RESUBMIT PHOTO');
  action.title=label;if(!photo.resubmissionAllowed)details.append(make('small','rd-reuse-reason',historyResendLabel(photo,snap)));
  action.type='button';
  action.disabled=Boolean(!photo.resubmissionAllowed||resubmittingId);
  action.dataset.photoId=photo.id;
  const status=make('p','redline-five-star-row-status');
  status.setAttribute('role','status');
  action.addEventListener('click',()=>{
   if(resubmittingId||!photo.resubmissionAllowed)return;
   window.BLACKCELL_REDLINE_REUSE_UI?.open(photo.id,action);
  });
  if(photo.image_url&&!photo.removal_status){
   const view=make('button','redline-hd-open','⤢ VIEW ORIGINAL');
   view.type='button';view.setAttribute('aria-label','View five-star photograph at original quality');
   view.addEventListener('click',()=>{
    window.BLACKCELL_REDLINE_HD_VIEWER?.open(photo.id);
   });
   details.append(view);
  }
  details.append(action,status);
  card.append(details);fiveStarList.append(card);
 }
}
function photoRatingEvents(snap){
 if(!isSender()||snap?.archiveMode||!Array.isArray(snap?.ratingEvents))return [];
 return snap.ratingEvents.filter(p=>p&&p.rated_at&&p.stars>=1&&p.stars<=5).map(p=>({
  kind:'rating',at:p.rated_at,photo:p
 }));
}
function renderEarnings(snap){
 paymentRows.replaceChildren();
 const payments=Array.isArray(snap.paymentHistory)?snap.paymentHistory:[];
 if(!payments.length){
  paymentRows.append(make('p','redline-no-activity','No partial payments recorded in this session.'));
 }else for(const p of payments.slice(0,30)){
  const line=make('div','redline-sender-payment-line');
  const info=make('div','');
  info.append(make('strong','',p.kind==='full'?'FINAL BALANCE PAYMENT':'PARTIAL PAYMENT'),
   make('small','',dateText(p.created_at)+(p.note?' · '+p.note:'')));
  line.append(info,make('strong','',money(p.amount_cents)));
  paymentRows.append(line);
 }
 if(Number(snap.photoActionBillCreditCents)>0){
  const credit=make('div','redline-sender-payment-line redline-sender-credit-line');
  const note=make('div','');
  note.append(make('strong','','PHOTO ACTION BILL CREDITS'),
   make('small','', 'Rejections $0.35 · Permanent deletions $1.00 each'));
  credit.append(note,make('strong','', '-'+money(snap.photoActionBillCreditCents)));
  paymentRows.prepend(credit);
 }
 dataValues.pending.textContent=String(snap.pending);
 dataValues.owed.textContent=snap.owed;
 dataValues.paid.textContent=snap.paid;
 dataValues.total.textContent=snap.assigned;
 sOwed.textContent=snap.owed;sPaid.textContent=snap.paid;
 renderActivity(snap);
 renderTopPicks(snap);
}
// Build timer events from the verified room ledger on BOTH sides.
// A receiver's start is visible immediately; the sender polls independently.
function timedEvents(snap){
 if(!snap||app.hidden||room.hidden||snap.archiveMode||timerRoomId!==snap.roomId||!timerStatus)return [];
 const result=[];
 const items=Array.isArray(timerStatus.recent)?timerStatus.recent.slice(0,30):[];
 for(const row of items){
  if(row.started_at)result.push({kind:'timer',phase:'start',at:row.started_at,timer:row});
  if(row.stopped_at)result.push({kind:'timer',phase:'stop',at:row.stopped_at,timer:row});
 }
 // The active timer is pinned separately ABOVE messages; no duplicate card.
 return result;
}
const clockText=seconds=>{
 const v=Math.max(0,Math.floor(seconds)),pad=n=>String(n).padStart(2,'0');
 return Math.floor(v/60)>=60
  ?Math.floor(v/3600)+':'+pad(Math.floor(v/60)%60)+':'+pad(v%60)
  :pad(Math.floor(v/60))+':'+pad(v%60);
};
function timerNumbers(row,active){
 const start=Date.parse(row.started_at);
 const heartbeat=Date.parse(row.heartbeat_at||'');
 const end=active
  ?Math.min(Date.now()+timerOffset,Number.isFinite(heartbeat)?heartbeat+45000:Date.now()+timerOffset)
  :Date.parse(row.stopped_at);
 const seconds=Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,Math.floor((end-start)/1000)):0;
 const cents=active?(BigInt(seconds)*BigInt(row.rate_cents||0)+30n)/60n:BigInt(row.earned_cents||0);
 const display=active?liveMoney(row.rate_cents,seconds):money(cents);
 return {seconds,cents,display};
}
function updateTimerCards(){
 if(!timerStatus||!snapshot()||app.hidden||room.hidden)return;
 const running=timerStatus.active;
 for(const card of timerSlot.querySelectorAll('.redline-chat-timer[data-timer-phase="active"]')){
  if(card.dataset.timerId!==running?.id)continue;
  const data=timerNumbers(running,true);
  const clock=card.querySelector('.redline-chat-timer-clock');
  const amount=card.querySelector('.redline-chat-timer-amount');
  if(clock)clock.textContent=clockText(data.seconds)+' elapsed';
  if(amount)amount.textContent=data.display+' earned';
 }
}
function makeTimerCard(e){
 const isActive=e.phase==='active',isStop=e.phase==='stop';
 const card=make('article','redline-chat-timer');
 card.dataset.timerId=e.timer.id;
 card.dataset.timerPhase=e.phase;
 const status=make('strong','redline-chat-timer-title',
  isStop?'■ TIMER STOPPED':isActive?'● TIMER STARTED · RUNNING':'▶ TIMER STARTED');
 const label=make('span','redline-chat-timer-rate',money(e.timer.rate_cents)+'/minute · '+liveMoney(e.timer.rate_cents,1)+'/second');
 const numbers=e.phase==='start'?{seconds:0,cents:0n,display:liveMoney(e.timer.rate_cents,0)}:timerNumbers(e.timer,isActive);
 const details=make('div','redline-chat-timer-values');
 details.append(make('span','redline-chat-timer-clock',clockText(numbers.seconds)+' elapsed'),
  make('span','redline-chat-timer-amount',numbers.display+(isStop?' final':' earned')));
 const foot=make('small','',isStop
  ?'Photo '+String(e.timer.photo_id||'').slice(0,8).toUpperCase()+' · Final elapsed-second amount recorded'
  :'Photo '+String(e.timer.photo_id||'').slice(0,8).toUpperCase()+' · '+dateText(e.at));
 card.append(status,label,details,foot);
 // The receiver has the full timed photo in its dedicated viewer; do not
 // insert that photograph again inside the pinned conversation timer.
 if(isActive&&!snapshot()?.isOwner){
  const photo=snapshot()?.photoHistory?.find(p=>p.id===e.timer.photo_id);
  const frame=make('div','redline-chat-timer-photo');
  frame.append(make('strong','','PHOTOGRAPH BEING TIMED'));
  if(photo?.image_url&&(photo.image_url.startsWith('https://')||photo.image_url.startsWith('blob:'))){
   const img=make('img','redline-chat-timer-image');img.src=photo.image_url;
   img.alt=photo.caption||'Photo currently being timed';img.loading='eager';img.decoding='async';
   img.addEventListener('error',()=>{img.hidden=true});frame.append(img);
  }else frame.append(make('small','','Private photo preview is loading…'));
  card.append(frame);
 }
 return card;
}
function chatVisible(snap=snapshot()){
 if(!snap||snap.archiveMode||app.hidden||room.hidden||document.hidden)return false;
 return snap.isOwner
  ?Boolean(ownerDialog.open||(receiverChatPanel()&&!receiverChatPanel().hidden))
  :currentTab==='upload'&&!home.hidden;
}
function updateTypingIndicator(){
 const snap=snapshot();
 typingNotice.hidden=!peerTyping||!chatVisible(snap);
 typingNotice.textContent=typingNotice.hidden?'':(snap?.peerName||'Other participant')+' is typing…';
}
async function pollChatStatus(force=false){
 const snap=snapshot();
 if(!chatVisible(snap)||!bridge()?.chatStatus){peerTyping=false;updateTypingIndicator();return}
 if(chatStatusInFlight||(!force&&Date.now()-lastChatStatusAt<2500))return;
 const roomId=snap.roomId;chatStatusInFlight=true;lastChatStatusAt=Date.now();
 try{
  const status=await bridge().chatStatus(roomId);
  if(snapshot()?.roomId!==roomId||!chatVisible(snapshot()))return;
  const readChanged=peerReadAt!==status.peerReadAt;
  peerReadAt=status.peerReadAt;peerTyping=status.peerTyping===true;
  updateTypingIndicator();
  if(readChanged)renderChat();
 }catch(_){peerTyping=false;updateTypingIndicator()}
 finally{chatStatusInFlight=false}
}
function reportRead(){
 const snap=snapshot();
 if(!chatVisible(snap)||!bridge()?.chatSignal)return;
 const latest=[...messages].reverse().find(m=>m.sender_id!==snap.userId);
 if(!latest||markedReadId===latest.id)return;
 markedReadId=latest.id;
 void bridge().chatSignal(snap.roomId,'read',latest.id).catch(()=>{
  if(markedReadId===latest.id)markedReadId=null;
 });
}
function stopTyping(){
 const roomId=typingRoom;typingRoom=null;
 if(roomId&&bridge()?.chatSignal)void bridge().chatSignal(roomId,'stopped').catch(()=>{});
}
function resetChatSignals(){
 if(typingRoom)stopTyping();
 peerReadAt=null;peerTyping=false;markedReadId=null;lastChatStatusAt=0;
 updateTypingIndicator();
}
entry.addEventListener('input',()=>{
 const snap=snapshot();
 if(!entry.value.trim()){stopTyping();return}
 if(!chatVisible(snap)||!snap.roomActive||!bridge()?.chatSignal)return;
 if(typingRoom===snap.roomId&&Date.now()-lastTypingAt<2500)return;
 typingRoom=snap.roomId;lastTypingAt=Date.now();
 void bridge().chatSignal(snap.roomId,'typing').catch(()=>{});
});
entry.addEventListener('blur',stopTyping);
// Stable chat keys keep existing message nodes alive across timers, receipts,
// photo state refreshes and background server polling.
function chatItemKey(e){
 if(e.kind==='trigger')return 'trigger-fee:'+String(e.id||'');
 if(e.kind==='chat')return 'message:'+String(e.id||e.at+'|'+e.sender+'|'+e.body);
 if(e.kind==='rating')return 'rating:'+String(e.photo?.id||'')+'|'+String(e.at||'');
 if(e.kind==='timer')return 'timer:'+String(e.timer?.id||'')+':'+e.phase;
 return 'event:'+String(e.at||'')+'|'+String(e.status||'')+'|'+String(e.body||'');
}
// The verified owner writes these messages through the private photo RPC.
function historyPhotoSignal(e,snap){
 if(e?.kind!=='chat'||!snap||typeof e.body!=='string')return null;
 const match=/^REDLINE_PHOTO_SIGNAL:v1:(looking|like):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(e.body);
 if(!match)return null;
 const fromOwner=snap.isOwner?e.sender===snap.userId:e.sender!==snap.userId;
 if(!fromOwner)return null;
 const photo=(snap.photoHistory||[]).find(p=>p.id===match[2]&&!p.removal_status);
 return {action:match[1].toLowerCase(),photo,photoId:match[2]};
}
function makeHistoryPhotoSignalCard(e,snap){
 const signal=historyPhotoSignal(e,snap);
 if(!signal)return null;
 const own=e.sender===snap.userId;
 const card=make('article','redline-chat-photo-signal '+(own?'is-mine':'is-theirs'));
 card.setAttribute('aria-label',signal.action==='like'?
  'Receiver likes this specific photograph':'Receiver is looking at this specific photograph');
 const photoBox=make('div','redline-chat-photo-signal-image');
 if(signal.photo?.image_url&&
   (signal.photo.image_url.startsWith('https://')||signal.photo.image_url.startsWith('blob:'))){
  const img=make('img');img.src=signal.photo.image_url;
  img.alt=signal.photo.caption||'Photograph referenced by the receiver';
  img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>{photoBox.replaceChildren(make('span','',
   'Private photo preview unavailable'))});
  photoBox.append(img);
 }else photoBox.append(make('span','','Photo preview loading…'));
 const content=make('div','redline-chat-photo-signal-content');
 const heading=signal.action==='like'
  ?(own?'♥ YOU LIKED THIS PHOTO':'♥ RECEIVER LIKES YOUR PHOTO')
  :(own?'◉ YOU SHARED WHAT YOU ARE LOOKING AT':'◉ RECEIVER IS LOOKING AT YOUR PHOTO');
 content.append(make('strong','',heading),make('small','',
  signal.action==='like'?'Personal photo appreciation':'Private photo viewing notice'));
 if(signal.photo?.caption)content.append(make('p','',signal.photo.caption));
 content.append(make('time','',dateText(e.at)));
 card.append(photoBox,content);
 return card;
}
function approvalNegotiationFingerprint(e,snap){
 if(e.status!=='approved'||!e.photo||snap?.isOwner)return null;
 const p=e.photo,svc=window.BLACKCELL_REDLINE_NEGOTIATION_INLINE;
 const status=svc?.status?.(p.id);
 return [p.id,p.amount_cents,p.settled_at,p.removal_status,p.auto_timer_session_id,snap?.roomActive,snap?.archiveMode,snap?.paymentHistory?.length,svc?.enabled?.(),status?.status,status?.offer_count,status?.owner_offer_cents,status?.offer_cents];
}
function renderChat({scrollToLatest=false}={}){
 const snap=snapshot();
 const events=createEvents(snap?.entries).slice(0,80);
 const latestOwn=[...messages].reverse().find(m=>m.sender_id===snap?.userId)?.id;
 const pinned=timerRoomId===snap?.roomId&&!snap?.archiveMode&&timerStatus?.active?.started_at
  ?{kind:'timer',phase:'active',at:timerStatus.active.started_at,timer:timerStatus.active}:null;
 const combined=[
  ...events.map(e=>({kind:'event',at:e.at,body:e.text,status:e.status,photo:e.photo})),
  ...paymentHistoryEvents(snap).map(e=>({kind:'event',at:e.at,body:e.text,status:e.status})),
  ...timedEvents(snap),
  ...photoRatingEvents(snap),
  ...messages.flatMap(m=>{
   // Independent read-only fee event follows the original message in chat.
   // The RPC attaches a fee only when that message has a recorded server hit.
   const normal={kind:'chat',at:m.created_at,body:m.body,sender:m.sender_id,id:m.id};
   const fee=m.triggerFee;
   if(!fee||!Number.isInteger(fee.price_cents)||
    fee.price_cents<10||fee.price_cents>25)return [normal];
   return [normal,{kind:'trigger',at:m.created_at,id:m.id,
    word:String(fee.word||'').slice(0,24),priceCents:fee.price_cents}];
  })
 ].sort((a,b)=>new Date(a.at)-new Date(b.at)).slice(-130);
 const latestMessage=combined.findLast?.(e=>e.kind==='chat'&&e.id===latestOwn);
 const latestRead=Boolean(latestMessage&&Number.isFinite(Date.parse(peerReadAt||''))&&
  Date.parse(peerReadAt)>=Date.parse(latestMessage.at));
 // Exclude changing signed-image URL tokens and receipt timestamps: neither
 // means the message stream changed. Only the receipt's visible state counts.
 const signature=JSON.stringify([
  snap?.roomId,snap?.resetAt,snap?.archiveMode,timerLoadError,latestRead,latestOwn,
  pinned?.timer?.id,pinned?.timer?.rate_cents,pinned?.timer?.photo_id,
  combined.map(e=>e.kind==='timer'
   ?[e.kind,e.phase,e.at,e.timer?.id,e.timer?.rate_cents,e.timer?.stopped_at,e.timer?.earned_cents]
   :e.kind==='rating'
    ?[e.kind,e.at,e.photo?.id,e.photo?.stars,e.photo?.caption,Boolean(e.photo?.image_url)]
    :e.kind==='chat'&&historyPhotoSignal(e,snap)
     ?[e.kind,e.at,e.id,e.body,e.sender,Boolean(historyPhotoSignal(e,snap)?.photo?.image_url)]
     :e.kind==='trigger'
      ?[e.kind,e.at,e.id,e.word,e.priceCents,snap?.isOwner]
      :[e.kind,e.at,e.id,e.body,e.sender,e.status,approvalNegotiationFingerprint(e,snap)])
 ]);
 // Only a true first opening or the user's own Send may follow the bottom.
 // A background live update must NEVER override a human's reading anchor.
 const followLatest=Boolean(scrollToLatest&&(chatOwnSendPending||
  (!readerAnchor&&feed.clientHeight>=24)));
 if(signature===lastChatViewSignature&&feed.dataset.redlineScrollReady==='true'){
  if(followLatest)feed.scrollTop=feed.scrollHeight;
  else restoreReaderAnchor();
  return;
 }
 lastChatViewSignature=signature;
 const retained=readerAnchor?.roomKey===readerRoomKey()?readerAnchor:null;
 const scrollBefore=retained?.top??feed.scrollTop;
 const viewport=feed.getBoundingClientRect();
 // Keep the first visible DOM node stationary even if earlier history arrives.
 const anchor=[...feed.children].find(el=>{
  const box=el.getBoundingClientRect();
  return box.bottom>viewport.top+2&&box.top<viewport.bottom;
 });
 const anchorTop=anchor?.getBoundingClientRect().top;
 const existing=new Map([...feed.children].filter(n=>n.dataset.redlineItemKey)
  .map(n=>[n.dataset.redlineItemKey,n]));
 const desired=[];
 const duplicateCounts=new Map();
 function addItem(baseKey,fingerprint,create){
  const occurrence=duplicateCounts.get(baseKey)||0;
  duplicateCounts.set(baseKey,occurrence+1);
  const key=baseKey+'#'+occurrence;
  let node=existing.get(key);
  if(!node||node.dataset.redlineItemContent!==fingerprint)node=create();
  node.dataset.redlineItemKey=key;
  node.dataset.redlineItemContent=fingerprint;
  desired.push(node);
 }
 // The timer lives above the independent conversation scroller. Don't
 // recreate its photo and DOM every time a read receipt changes.
 const pinId=pinned?.timer?.id||'';
 if(timerSlot.dataset.redlinePinnedId!==pinId){
  timerSlot.replaceChildren();
  timerSlot.dataset.redlinePinnedId=pinId;
  if(pinned){
   const card=makeTimerCard(pinned);
   card.classList.add('redline-chat-timer-pinned');
   card.setAttribute('aria-label','Active private timer pinned in the chat until it stops');
   card.setAttribute('aria-live','off');
   timerSlot.append(card);
  }
 }
 timerSlot.hidden=!pinned;
 if(timerLoadError&&snap&&!app.hidden&&!room.hidden&&!snap.archiveMode){
  addItem('timer-warning',timerLoadError,()=>{
   const warning=make('div','redline-chat-event redline-chat-timer-error');
   warning.append(make('strong','','TIMER STATUS UNAVAILABLE'),
    make('small','',timerLoadError+' · REDLINE will retry automatically.'));
   return warning;
  });
 }
 if(!combined.length&&!timerLoadError&&!pinned){
  addItem('empty-room','',()=>make('div','redline-chat-empty',
   'No messages or photo updates yet.'));
 }
 for(const e of combined){
  const key=chatItemKey(e);
  const own=e.kind==='chat'&&e.sender===snap?.userId;
  const receipt=own&&e.id===latestOwn?(latestRead?'read':'sent'):'';
  const fingerprint=JSON.stringify(e.kind==='chat'
   ?[e.at,e.body,e.sender,receipt,Boolean(historyPhotoSignal(e,snap)?.photo?.image_url)]
   :e.kind==='trigger'
    ?[e.at,e.id,e.word,e.priceCents,snap?.isOwner]
   :e.kind==='rating'
    ?[e.photo?.stars,e.photo?.caption,Boolean(e.photo?.image_url)]
    :e.kind==='timer'
     ?[e.phase,e.at,e.timer?.id,e.timer?.rate_cents,e.timer?.stopped_at,e.timer?.earned_cents]
     :[e.at,e.body,e.status,approvalNegotiationFingerprint(e,snap)]);
  addItem(key,fingerprint,()=>{
   if(e.kind==='event'){
    const card=make('div','redline-chat-event');
    if(e.status==='approved'&&e.photo&&!snap?.isOwner&&window.BLACKCELL_REDLINE_COUNTEROFFER_INLINE?.control){
     card.classList.add('redline-chat-approval-negotiation');
     card.append(window.BLACKCELL_REDLINE_COUNTEROFFER_INLINE.control(e.photo,snap,{chat:true,heading:e.body}));
    }else card.append(make('strong','',e.body));
    card.append(make('small','',dateText(e.at)));
    return card;
   }
   if(e.kind==='trigger'){
    // Independent event, like photo upload/reuse notices. The event key
    // comes from the triggering message ID, so it is never duplicated.
    const card=make('div','redline-chat-event redline-chat-trigger-event');
    const line=make('div','redline-chat-trigger-event-line');
    line.append(
     make('span','redline-chat-trigger-event-word','⚡ '+e.word),
     make('strong','redline-chat-trigger-event-amount',
      (snap?.isOwner?'FEE $':'EARNED +$')+(e.priceCents/100).toFixed(2))
    );
    card.append(line,make('small','',dateText(e.at)));
    card.setAttribute('aria-label',
     snap?.isOwner?'Trigger Word FEE recorded':'Trigger Word EARNED recorded');
    return card;
   }
   if(e.kind==='rating'){
    const photo=e.photo;
    const rating=make('article','redline-chat-rated-photo');
    rating.setAttribute('aria-label',photo.stars+' of 5 stars for a private photograph');
    appendRatingImage(rating,photo.image_url,photo.caption);
    const content=make('div','redline-chat-rated-content');
    content.append(
     make('strong','redline-chat-rated-heading',
      photo.stars===5?'★ TOP PICK · 5 STARS':'RECEIVER RATED YOUR PHOTO'),
     make('div','redline-chat-rated-stars',starsText(photo.stars)),
     make('small','','PHOTO '+String(photo.id||'').slice(0,8).toUpperCase()+' · '+dateText(e.at))
    );
    if(photo.caption)content.append(make('p','redline-chat-rated-caption',photo.caption));
    rating.append(content);return rating;
   }
   if(e.kind==='timer')return makeTimerCard(e);
   if(e.kind==='chat'){
    const photoNotice=makeHistoryPhotoSignalCard(e,snap);
    if(photoNotice)return photoNotice;
   }
   const bubble=make('article','redline-chat-bubble '+(own?'is-mine':'is-theirs'));
   bubble.append(make('p','',e.body),make('time','',dateText(e.at)));
   if(receipt){
    const read=receipt==='read';
    const label=make('small','redline-chat-read-receipt',read?'✓✓ Read':'✓ Sent');
    label.setAttribute('aria-label',read?'Read by recipient':'Message sent');
    bubble.append(label);
   }
   return bubble;
  });
 }
 // Reconcile only added, changed or removed records. Existing DOM elements
 // remain attached and retain their natural scroll anchor.
 let cursor=feed.firstChild;
 for(const node of desired){
  if(node===cursor)cursor=cursor.nextSibling;
  else feed.insertBefore(node,cursor);
 }
 const keep=new Set(desired);
 for(const node of [...feed.children])if(!keep.has(node))node.remove();
 feed.dataset.redlineScrollReady='true';
 if(followLatest)feed.scrollTop=feed.scrollHeight;
 else if(retained)restoreReaderAnchor();
 else if(anchor&&anchor.isConnected&&feed.contains(anchor)&&Number.isFinite(anchorTop)){
  const shift=anchor.getBoundingClientRect().top-anchorTop;
  feed.scrollTop=Math.max(0,Math.min(scrollBefore+shift,feed.scrollHeight-feed.clientHeight));
 }else feed.scrollTop=Math.max(0,Math.min(scrollBefore,feed.scrollHeight-feed.clientHeight));
 // Image decoding and Web OS flex reflows can happen after the DOM commit.
 // Re-anchor after layout, without moving the whole page or message composer.
 if(retained)requestAnimationFrame(restoreReaderAnchor);
}
async function loadMessages(){
 const snap=snapshot();
 if(!snap||loading)return;
 loading=true;
 try{
  const current=snap.roomId;
  const items=await bridge().loadMessages();
  if(snapshot()?.roomId!==current)return;
  messages=items;lastSync=Date.now();
  msgError.textContent='';
  renderChat({scrollToLatest:chatInitialPositionPending||chatOwnSendPending});
  chatInitialPositionPending=false;
  chatOwnSendPending=false;
  reportRead();
  void pollChatStatus();
 }catch(err){
  msgError.textContent='Messages could not be loaded. '+String(err?.message||'Try again.').slice(0,180);
 }finally{loading=false}
}
composer.addEventListener('submit',async e=>{
 e.preventDefault();
 if(posting)return;
 const text=entry.value.trim(),snap=snapshot();
 if(snap?.archiveMode){msgError.textContent='Return to the current session before sending a message.';return}
 if(!snap?.roomActive){msgError.textContent='This private room is closed.';return}
 if(!text||text.length>2000){msgError.textContent='Write a message up to 2,000 characters.';return}
 posting=true;send.disabled=true;msgError.textContent='Sending securely to the private room…';
 try{
  await bridge().sendMessage(text);
  entry.value='';androidRedlineCaretGuard?.reset();msgError.textContent='';stopTyping();
  // Sending is an explicit request to see the reply at the bottom.
  readerAnchor=null;
  chatOwnSendPending=true;
  await loadMessages();
 }catch(err){
  msgError.textContent='Message not sent: '+String(err?.message||'Please try again.').slice(0,200);
 }finally{posting=false;send.disabled=false}
});
let redlineImeComposing=false;
entry.addEventListener('compositionstart',()=>{redlineImeComposing=true});
entry.addEventListener('compositionend',()=>{redlineImeComposing=false});
entry.addEventListener('blur',()=>{redlineImeComposing=false});
entry.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!redlineImeComposing){
  e.preventDefault();composer.requestSubmit()
 }
});
function reflectRecordNavigation(){
 const records=isSender()&&currentTab!=='upload';
 document.body.classList.toggle('rd-sender-records-open',records);
 recordNav.hidden=recordRefresh.hidden=recordFeedback.hidden=!records;
 for(const b of recordNav.children)b.setAttribute('aria-current',b.dataset.recordTab===currentTab?'page':'false');
 if(records)document.body.classList.remove('redline-chat-immersive');
}
function switchTab(tab){
 if(!isSender()||!Array.from(panes.children).some(p=>p.dataset.redlinePane===tab))return;
 currentTab=tab;
 for(const b of tabs.querySelectorAll('button')){
  const selected=b.dataset.simpleTab===tab;
  b.classList.toggle('is-current',selected);
  b.setAttribute('aria-selected',String(selected));
 }
 for(const pane of panes.children)pane.hidden=pane.dataset.redlinePane!==tab;
 reflectRecordNavigation();
 if(tab!=='upload'){const snap=snapshot();if(snap){renderEarnings(snap);renderFiveStarPhotos(snap);renderPhotoHistory(snap)}void refreshRecords()}
 window.dispatchEvent(new Event('blackcell:redline:sender-tab'));
 if(tab==='upload'){void loadMessages();void pollSenderTimers(true);void pollChatStatus(true)}
 else{stopTyping();peerTyping=false;updateTypingIndicator()}
 if(tab==='viewing'){renderCurrentlyViewing(snapshot());void pollCurrentlyViewing(true)}
 // Switching a REDLINE tab must not scroll the entire conversation page.
}
let ownerChatNeedsResume=false;
function syncOwnerChat(snap){
 const mount=receiverChatMount(),panel=receiverChatPanel();
 const ready=Boolean(snap?.isOwner&&!app.hidden&&!room.hidden&&mount&&panel&&!panel.hidden);
 if(!ready){
  // Preserve the message DOM and scroll on a temporarily hidden room.
  // Queue a catch-up fetch for events missed while the panel was hidden.
  if(lastOwnerSession)ownerChatNeedsResume=true;
  return;
 }
 if(ownerDialog.open)return;
 if(messageCard.parentNode!==mount)mount.append(messageCard);
 // Preserve a previously read position when receiver visibility returns.
 if(readerAnchor)requestAnimationFrame(restoreReaderAnchor);
 photoAction.hidden=true;
 // A periodic refresh may normalize session-start metadata. That is NOT a
 // room change and must never destroy/reinitialize the visible conversation.
 // Explicit reset events clear the local thread when a new session begins.
 const key=snap.roomId+'|'+String(Boolean(snap.archiveMode));
 if(key!==lastOwnerSession){
  ownerChatNeedsResume=false;
  feed.dataset.redlineScrollReady='false';
  lastChatViewSignature='';
  if(readerAnchor?.roomKey!==readerRoomKey())readerAnchor=null;
  chatInitialPositionPending=!readerAnchor;
  lastOwnerSession=key;messages=[];lastSync=0;resetChatSignals();renderChat();void loadMessages();void pollSenderTimers(true);void pollChatStatus(true);
 }else if(ownerChatNeedsResume){
  ownerChatNeedsResume=false;
  void loadMessages();
 }
 send.disabled=Boolean(!snap.roomActive||snap.archiveMode);
 entry.disabled=Boolean(!snap.roomActive||snap.archiveMode);
 entry.placeholder=snap.archiveMode?'Return to current session to reply…':
  snap.roomActive?'Message your sender…':'This private room is closed';
}
function sync(){
 const snap=snapshot(),sender=isSender();
 home.hidden=!sender;
 document.body.classList.toggle('redline-sender-simple',sender);
 if(sender){
  // Reparent only for an actual verified sender role transition.
  if(messageCard.parentNode!==uploadPane){
   uploadPane.append(messageCard);photoAction.hidden=false;
  }
  if(upload.parentNode!==uploadMount)uploadMount.append(upload);
  const sessionKey=snap.roomId+'|'+String(Boolean(snap.archiveMode));
  if(sessionKey!==lastSessionKey){
   feed.dataset.redlineScrollReady='false';
   lastChatViewSignature='';
   if(readerAnchor?.roomKey!==readerRoomKey())readerAnchor=null;
   chatInitialPositionPending=!readerAnchor;
   lastSessionKey=sessionKey;messages=[];lastSync=0;resetChatSignals();
   viewingStatus=null;viewingRoomId=null;viewingError='';viewingLastPoll=0;
   timerRoomId=null;timerStatus=null;timerFingerprint='';timerLastPoll=0;timerLoadError='';
   renderChat();
   if(currentTab==='upload')void loadMessages();
  }
  archiveButton.hidden=!snap.resetAt;
  archiveButton.textContent=snap.archiveMode?'← RETURN TO CURRENT SESSION':'VIEW PREVIOUS RECORDS';
  archiveNotice.textContent=snap.archiveMode
   ?'ARCHIVE · Earlier earnings and messages are preserved. Return to the current session to send.'
   :snap.resetAt?'CURRENT SESSION · Earlier records and balances remain available in Archive.':'';
  send.disabled=Boolean(snap.archiveMode);
  entry.placeholder=snap.archiveMode?'Return to the current session to send…':'Message REDLINE…';
  renderEarnings(snap);
  renderFiveStarPhotos(snap);
  renderPhotoHistory(snap);
  if(currentTab==='viewing')renderCurrentlyViewing(snap);
  if(snap.roomId!==lastRoom){
   feed.dataset.redlineScrollReady='false';
   lastChatViewSignature='';
   if(readerAnchor?.roomKey!==readerRoomKey())readerAnchor=null;
   chatInitialPositionPending=!readerAnchor;
   lastRoom=snap.roomId;messages=[];lastSync=0;resetChatSignals();
   renderChat();
  }
  if(!roomReady){roomReady=true;switchTab('upload')}
  if(currentTab==='upload'){renderChat();void pollSenderTimers();void pollChatStatus()}
 }else{roomReady=false;syncOwnerChat(snap)}
 reflectRecordNavigation();
}
const observer=new MutationObserver(()=>requestAnimationFrame(sync));
for(const el of [app,room,upload,ownerSetup])observer.observe(el,{attributes:true,attributeFilter:['hidden']});
// Each participant reads authenticated timer status from the room ledger.
// The receiver also gets immediate in-page status events after START/STOP.
function receiveTimerStatus(roomId,next){
 const snap=snapshot();
 if(!snap||snap.roomId!==roomId||snap.archiveMode||app.hidden||room.hidden||!next?.ok)return;
 const fingerprint=JSON.stringify([next.active?.id||null,next.active?.running||null,
  ...(Array.isArray(next.recent)?next.recent.map(x=>[x.id,x.stopped_at]):[])]);
 const hadError=Boolean(timerLoadError);
 timerLoadError='';
 timerRoomId=roomId;timerStatus=next;
 const serverMs=Date.parse(next.server_now);
 if(Number.isFinite(serverMs))timerOffset=serverMs-Date.now();
 if(fingerprint!==timerFingerprint||hadError){
  timerFingerprint=fingerprint;
  renderChat();
 }else updateTimerCards();
}
async function pollSenderTimers(force=false){
 const snap=snapshot();
 if(!snap||snap.archiveMode||app.hidden||room.hidden||!bridge()?.timerStatus)return;
 const chatVisible=snap.isOwner
  ?Boolean(ownerDialog.open||(receiverChatPanel()&&!receiverChatPanel().hidden))
  :currentTab==='upload';
 if(!chatVisible)return;
 const id=snap.roomId,now=Date.now();
 if(timerPollInFlight||(!force&&now-timerLastPoll<(snap.isOwner?6000:2500)))return;
 timerLastPoll=now;timerPollInFlight=true;
 try{
  const status=await bridge().timerStatus(id);
  receiveTimerStatus(id,status);
 }catch(error){
  if(snapshot()?.roomId!==id)return;
  const message=String(error?.message||'Could not contact the timed-photo ledger').slice(0,160);
  if(timerLoadError!==message){
   timerLoadError=message;
   renderChat();
  }
 }finally{timerPollInFlight=false}
}
window.addEventListener('blackcell:redline:timer-status',event=>{
 if(event.detail)receiveTimerStatus(event.detail.roomId,event.detail.status);
});
window.addEventListener('blackcell:redline:negotiations-updated',event=>{
 const current=snapshot();
 if(!isSender()||!current||event.detail?.roomId!==current.roomId)return;
 if(currentTab==='upload')renderChat();
 if(currentTab==='viewing')renderCurrentlyViewing(current);
 if(currentTab==='history')renderPhotoHistory(current);
 if(currentTab==='earnings')renderTopPicks(current);
});
window.addEventListener('blackcell:redline:messages-changed',()=>{if((isSender()&&currentTab==='upload')||ownerDialog.open||(receiverChatPanel()&&!receiverChatPanel().hidden))void loadMessages()});
window.addEventListener('blackcell:redline:receiver-ready',sync);
window.addEventListener('blackcell:redline:bridge',sync);
window.addEventListener('blackcell:redline:state',sync);
window.addEventListener('blackcell:redline:session-mode',sync);
window.addEventListener('blackcell:redline:reset',()=>{
 readerAnchor=null;
 chatInitialPositionPending=true;lastChatViewSignature='';
 lastSessionKey=null;messages=[];lastSync=0;resetChatSignals();
 viewingStatus=null;viewingRoomId=null;viewingError='';viewingLastPoll=0;sync();
});
window.addEventListener('pageshow',()=>{sync();void pollSenderTimers(true);void pollCurrentlyViewing(true)});
window.addEventListener('visibilitychange',()=>{if(!document.hidden){
 if((isSender()&&currentTab==='upload')||ownerDialog.open||(receiverChatPanel()&&!receiverChatPanel().hidden))void loadMessages();
 void pollSenderTimers(true);void pollChatStatus(true);
}});
window.setInterval(()=>{
 updateTimerCards();
 if(!document.hidden)void pollSenderTimers();
},1000);
window.setInterval(()=>{if(!document.hidden)void pollChatStatus()},1500);
window.setInterval(()=>{if(!document.hidden)void pollCurrentlyViewing()},2600);
window.setInterval(()=>{
 const active=(isSender()&&currentTab==='upload')||ownerDialog.open||(receiverChatPanel()&&!receiverChatPanel().hidden);
 if(!document.hidden&&active&&Date.now()-lastSync>3800)void loadMessages();
},4000);
sync();
})();