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
heading.append(branding,make('span','redline-sender-badge','SENDER ACCESS'));
const tabs=make('nav','redline-simple-tabs');tabs.setAttribute('aria-label','Sender sections');
const panes=make('div','redline-simple-panes');
const uploadPane=make('section','redline-simple-pane');uploadPane.dataset.redlinePane='upload';
const earningsPane=make('section','redline-simple-pane');earningsPane.dataset.redlinePane='earnings';earningsPane.hidden=true;
const historyPane=make('section','redline-simple-pane redline-photo-history-pane');
historyPane.dataset.redlinePane='history';historyPane.hidden=true;
const fiveStarPane=make('section','redline-simple-pane redline-five-star-pane');
fiveStarPane.dataset.redlinePane='five-star';fiveStarPane.hidden=true;
// Private chat stays in Photos & Chat.
for(const [key,label] of [['upload','Photos & Chat'],['earnings','Earnings'],['history','Photo History'],['five-star','5-Star Photos']]){
 const b=make('button','redline-simple-tab',label);b.type='button';b.dataset.simpleTab=key;
 b.addEventListener('click',()=>switchTab(key));
 tabs.append(b);
}
const uploadTitle=make('div','redline-upload-intro');
uploadTitle.append(make('span','redline-kicker','PRIVATE MEDIA'),make('h2','','Send a photo'));
uploadPane.append(uploadTitle);
const uploadMount=make('div','redline-upload-mount');uploadPane.append(uploadMount);
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
earningsBox.append(make('p','redline-earnings-hint','REDLINE records amounts and owner-confirmed settlements. It does not transfer money.'));
const archiveNotice=make('p','redline-archive-sender-notice');
const archiveButton=make('button','redline-archive-sender-button','VIEW PREVIOUS RECORDS');
archiveButton.type='button';archiveButton.hidden=true;
archiveButton.addEventListener('click',async()=>{
 archiveButton.disabled=true;
 try{
  await bridge()?.toggleArchive?.();
  messages=[];lastSync=0;
  renderChat();
  if(currentTab==='upload')await loadMessages();
 }catch(err){msgError.textContent='Archive is unavailable: '+String(err?.message||err)}
 finally{archiveButton.disabled=false}
});
earningsBox.append(archiveNotice,archiveButton);
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
 make('p','','All submitted photos, prices and ratings. Resend requires 5 stars AND an approved price of at least $0.01.'));
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
 make('p','','Resubmit a top-rated original for another review. Each resubmission is a new pending photo; the original rating and price remain unchanged.'));
const fiveStarStatus=make('p','redline-five-star-feedback');
fiveStarStatus.setAttribute('role','status');
const fiveStarList=make('div','redline-five-star-list');
fiveStarPane.append(fiveStarIntro,fiveStarStatus,fiveStarList);
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
const feed=make('div','redline-message-feed');feed.setAttribute('role','log');feed.setAttribute('aria-live','polite');
const empty=make('div','redline-chat-empty','No messages yet. Your conversation and photo-review updates will appear here.');
feed.append(empty);
const composer=make('form','redline-message-composer');
composer.id='redlineMessageComposer';
const photoAction=make('button','redline-chat-photo','PHOTO ABOVE');
photoAction.type='button';photoAction.setAttribute('aria-label','Open photo upload');
photoAction.addEventListener('click',()=>{if(!home.hidden)switchTab('upload')});
const entry=make('textarea','redline-message-entry');entry.maxLength=2000;entry.rows=1;entry.placeholder='Message REDLINE…';entry.setAttribute('aria-label','Private room message');
const send=make('button','redline-chat-send','SEND');send.type='submit';
composer.append(photoAction,entry,send);
const msgError=make('p','redline-message-error');msgError.setAttribute('role','status');
messageCard.append(msgHeader,feed,composer,msgError);
uploadPane.append(messageCard);
panes.append(uploadPane,earningsPane,historyPane,fiveStarPane);
home.append(heading,tabs,panes);
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
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  entry.focus({preventScroll:true});return;
 }
 ownerMount.append(messageCard);
 photoAction.hidden=true;
 ownerDialog.showModal();void loadMessages();
});
ownerDialog.addEventListener('close',()=>{
 const inline=receiverChatMount(),panel=receiverChatPanel();
 if(inline&&panel&&!panel.hidden)inline.append(messageCard);
 else uploadPane.append(messageCard);
 photoAction.hidden=Boolean(inline&&panel&&!panel.hidden);
 entry.value='';
});
ownerDialog.addEventListener('click',e=>{if(e.target===ownerDialog)ownerDialog.close()});
let currentTab='upload',lastRoom=null,lastSessionKey=null,messages=[],loading=false,posting=false,roomReady=false;
let lastSync=0,lastOwnerSession=null;
let timerStatus=null,timerRoomId=null,timerFingerprint='',timerOffset=0;
let timerPollInFlight=false,timerLastPoll=0,timerLoadError='';
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
    ?'TOP-PICK PHOTO RESUBMITTED · '+id+' · Waiting for receiver review'
    :'Photo '+id+' submitted',
   status:'sent'});
  if(e.decision_status==='rejected'&&e.decided_at)all.push({kind:'event',at:e.decided_at,text:'Photo '+id+' rejected',status:'rejected'});
  if(e.decision_status==='accepted'&&e.decided_at){
   const amount=money(e.amount_cents);
   all.push({kind:'event',at:e.decided_at,text:'Photo '+id+' approved — '+amount,status:'approved'});
  }
  if(e.settled_at&&e.decision_status==='accepted')all.push({kind:'event',at:e.settled_at,text:'Payment recorded — '+money(e.amount_cents),status:'paid'});
 }
 return all.sort((a,b)=>new Date(b.at)-new Date(a.at));
}
function renderActivity(snap){
 const events=createEvents(snap?.entries);
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
function appendRatingImage(parent,url,caption){
 if(typeof url!=='string'||!url.startsWith('https://'))return;
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
  const card=make('article','redline-top-pick-row');
  appendRatingImage(card,p.image_url,p.caption);
  const details=make('div','redline-top-pick-details');
  details.append(
   make('strong','',((p.stars===5)?'TOP PICK · ':'')+'#'+(index+1)+' · PHOTO '+String(p.id||'').slice(0,8).toUpperCase()),
   make('span','redline-top-pick-stars',starsText(p.stars)+' · '+p.stars+'/5'),
   make('small','',p.amount_cents===null?'Awaiting photo bid':'Approved bid '+money(p.amount_cents))
  );
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
 if(p.resubmissionAllowed)return '↻ RESEND FOR REVIEW';
 if(p.resubmission_origin_id)return 'ALREADY RESUBMITTED COPY';
 if(snap?.archiveMode)return 'ARCHIVED · RESEND UNAVAILABLE';
 if(!snap?.roomActive)return 'ROOM CLOSED';
 if(snap?.photoSendingPaused)return 'SENDING PAUSED';
 if(p.resubmissionStatus==='rejected')return 'REJECTED · RESEND CLOSED';
 if(p.resubmissionStatus==='pending')return 'AWAITING RECEIVER REVIEW';
 if(p.decision_status==='pending')return 'AWAITING FIRST REVIEW';
 if(p.stars!==5)return 'REQUIRES 5 STARS';
 if(BigInt(p.amount_cents||0)<1n)return 'REQUIRES $0.01 MINIMUM';
 return 'RESEND UNAVAILABLE';
}
async function resendHistoryPhoto(p,button,status,roomId){
 if(resubmittingId||!p.resubmissionAllowed)return;
 if(!window.confirm('Resend this 5-star original for another private review? Original price and stars remain unchanged.'))return;
 resubmittingId=p.id;button.disabled=true;button.textContent='RESENDING PRIVATELY…';
 status.textContent='Creating a new pending review copy…';
 try{
  const result=await bridge()?.resubmitFiveStarPhoto?.(p.id);
  if(result?.ok!==true)throw Error('Resubmission failed.');
  historyFeedback.textContent='Top pick resent; new review is pending.';
 }catch(e){historyFeedback.textContent='Resend failed: '+String(e?.message||e).slice(0,200)}
 finally{
  resubmittingId=null;const fresh=snapshot();
  if(fresh?.roomId===roomId){renderPhotoHistory(fresh);renderFiveStarPhotos(fresh)}
 }
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
  const card=make('article','redline-photo-history-row');
  appendRatingImage(card,p.image_url,p.caption);
  const info=make('div','redline-photo-history-details');
  const decision=p.decision_status==='accepted'?'APPROVED · '+money(p.amount_cents):
   p.decision_status==='rejected'?'REJECTED':'AWAITING REVIEW';
  info.append(make('strong','redline-history-title','PHOTO '+String(p.id||'').slice(0,8).toUpperCase()),
   make('span','redline-photo-history-stars',p.stars?starsText(p.stars)+' · '+p.stars+'/5':'NOT YET RATED'),
   make('small','redline-history-review',decision+' · '+dateText(p.created_at)));
  if(p.caption)info.append(make('p','redline-history-caption',p.caption));
  if(p.resubmissionCount)info.append(make('small','',p.resubmissionCount+' previous resend(s)'));
  const button=make('button','redline-photo-history-resend',historyResendLabel(p,snap));
  button.type='button';button.disabled=!p.resubmissionAllowed||Boolean(resubmittingId);
  const status=make('p','redline-five-star-row-status');status.setAttribute('role','status');
  button.addEventListener('click',()=>void resendHistoryPhoto(p,button,status,snap.roomId));
  info.append(button,status);card.append(info);historyList.append(card);
 }
 historyMore.hidden=photos.length<=historyVisible;
}
let resubmittingId=null;
function renderFiveStarPhotos(snap){
 fiveStarList.replaceChildren();
 if(!snap||!Array.isArray(snap.fiveStarPhotos)||!snap.fiveStarPhotos.length){
  fiveStarList.append(make('p','redline-five-star-empty',
   'No approved five-star photographs in this session yet.'));
  return;
 }
 for(const photo of snap.fiveStarPhotos){
  const card=make('article','redline-five-star-photo');
  appendRatingImage(card,photo.image_url,photo.caption);
  const details=make('div','redline-five-star-details');
  details.append(
   make('strong','redline-five-star-title','PHOTO '+photo.id.slice(0,8).toUpperCase()),
   make('span','redline-five-star-stars','★★★★★ · TOP PICK'),
   make('small','',photo.resubmissionCount+
    (photo.resubmissionCount===1?' previous resend':' previous resends')));
  if(photo.caption)details.append(make('p','redline-five-star-caption',photo.caption));
  let label='↻ RESUBMIT PHOTO';
  if(photo.resubmissionStatus==='pending')label='AWAITING RECEIVER REVIEW';
  if(photo.resubmissionStatus==='original-pending')label='AWAITING FIRST APPROVAL';
  if(photo.resubmissionStatus==='rejected')label='REJECTED · RESENDS CLOSED';
  if(snap.photoSendingPaused&&photo.resubmissionStatus==='ready')label='SENDING PAUSED BY RECEIVER';
  if(!snap.roomActive&&photo.resubmissionStatus==='ready')label='ROOM CLOSED';
  const action=make('button','redline-five-star-resubmit',label);
  action.type='button';
  action.disabled=Boolean(!photo.resubmissionAllowed||resubmittingId);
  action.dataset.photoId=photo.id;
  const status=make('p','redline-five-star-row-status');
  status.setAttribute('role','status');
  action.addEventListener('click',async()=>{
   if(resubmittingId||!photo.resubmissionAllowed)return;
   resubmittingId=photo.id;
   action.disabled=true;action.textContent='RESUBMITTING PRIVATELY…';
   status.textContent='Copying this five-star original to a new private review entry…';
   try{
    const result=await bridge()?.resubmitFiveStarPhoto?.(photo.id);
    if(result?.ok!==true)throw Error('New review entry was not created.');
    status.textContent='Photo resubmitted. Waiting for the receiver to accept or reject it.';
    fiveStarStatus.textContent='Five-star photo sent again for receiver review.';
   }catch(error){
    const message='Unable to resend: '+String(error?.message||error).slice(0,240);
    status.textContent=message;
    action.textContent='↻ TRY RESUBMITTING AGAIN';
    fiveStarStatus.textContent=message;
   }finally{
    resubmittingId=null;
    const fresh=snapshot();
    if(fresh?.roomId===snap.roomId)renderFiveStarPhotos(fresh);
   }
  });
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
 const active=timerStatus.active;
 if(active?.started_at)result.push({kind:'timer',phase:'active',at:active.started_at,timer:active});
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
 for(const card of feed.querySelectorAll('.redline-chat-timer[data-timer-phase="active"]')){
  if(card.dataset.timerId!==running?.id)continue;
  const data=timerNumbers(running,true);
  const clock=card.querySelector('.redline-chat-timer-clock');
  const amount=card.querySelector('.redline-chat-timer-amount');
  if(clock)clock.textContent=clockText(data.seconds)+' elapsed';
  if(amount)amount.textContent=data.display+' earned';
 }
}
function renderChat(){
 const snap=snapshot();feed.replaceChildren();
 const events=createEvents(snap?.entries).slice(0,80);
 const combined=[
  ...events.map(e=>({kind:'event',at:e.at,body:e.text,status:e.status})),
  ...timedEvents(snap),
  ...photoRatingEvents(snap),
  ...messages.map(m=>({kind:'chat',at:m.created_at,body:m.body,sender:m.sender_id,id:m.id}))
 ].sort((a,b)=>new Date(a.at)-new Date(b.at)).slice(-130);
 if(timerLoadError&&snap&&!app.hidden&&!room.hidden&&!snap.archiveMode){
  const warning=make('div','redline-chat-event redline-chat-timer-error');
  warning.append(make('strong','','TIMER STATUS UNAVAILABLE'),
   make('small','',timerLoadError+' · REDLINE will retry automatically.'));
  feed.append(warning);
 }
 if(!combined.length){
  if(!timerLoadError)feed.append(make('div','redline-chat-empty','No messages or photo updates yet.'));
  return;
 }
 for(const e of combined){
  if(e.kind==='event'){
   const card=make('div','redline-chat-event');
   card.append(make('strong','',e.body),make('small','',dateText(e.at)));
   feed.append(card);continue;
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
   rating.append(content);feed.append(rating);continue;
  }
  if(e.kind==='timer'){
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
   feed.append(card);continue;
  }
  const own=e.sender===snap?.userId;
  const bubble=make('article','redline-chat-bubble '+(own?'is-mine':'is-theirs'));
  bubble.append(make('p','',e.body),make('time','',dateText(e.at)));
  feed.append(bubble);
 }
 feed.scrollTop=feed.scrollHeight;
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
  renderChat();
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
  entry.value='';msgError.textContent='';
  await loadMessages();
 }catch(err){
  msgError.textContent='Message not sent: '+String(err?.message||'Please try again.').slice(0,200);
 }finally{posting=false;send.disabled=false}
});
entry.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();composer.requestSubmit()}});
function switchTab(tab){
 if(!isSender())return;
 currentTab=tab;
 for(const b of tabs.querySelectorAll('button')){
  const selected=b.dataset.simpleTab===tab;
  b.classList.toggle('is-current',selected);
  b.setAttribute('aria-selected',String(selected));
 }
 for(const pane of panes.children)pane.hidden=pane.dataset.redlinePane!==tab;
 if(tab==='upload'){void loadMessages();void pollSenderTimers(true)}
 home.scrollIntoView({behavior:'auto',block:'start'});
}
function syncOwnerChat(snap){
 const mount=receiverChatMount(),panel=receiverChatPanel();
 const ready=Boolean(snap?.isOwner&&!app.hidden&&!room.hidden&&mount&&panel&&!panel.hidden);
 if(!ready){
  lastOwnerSession=null;
  if(!ownerDialog.open&&messageCard.parentNode!==uploadPane){
   uploadPane.append(messageCard);photoAction.hidden=false;
  }
  return;
 }
 if(ownerDialog.open)return;
 if(messageCard.parentNode!==mount)mount.append(messageCard);
 photoAction.hidden=true;
 const key=snap.roomId+'|'+(snap.resetAt||'')+'|'+String(snap.archiveMode);
 if(key!==lastOwnerSession){
  lastOwnerSession=key;messages=[];lastSync=0;renderChat();void loadMessages();void pollSenderTimers(true);
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
  if(upload.parentNode!==uploadMount)uploadMount.append(upload);
  const sessionKey=snap.roomId+'|'+(snap.resetAt||'')+'|'+String(snap.archiveMode);
  if(sessionKey!==lastSessionKey){
   lastSessionKey=sessionKey;messages=[];lastSync=0;
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
  if(snap.roomId!==lastRoom){
   lastRoom=snap.roomId;messages=[];lastSync=0;
   renderChat();
  }
  if(!roomReady){roomReady=true;switchTab('upload')}
  if(currentTab==='upload'){renderChat();void pollSenderTimers()}
 }else{roomReady=false;syncOwnerChat(snap)}
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
window.addEventListener('blackcell:redline:messages-changed',()=>{if((isSender()&&currentTab==='upload')||ownerDialog.open||(receiverChatPanel()&&!receiverChatPanel().hidden))void loadMessages()});
window.addEventListener('blackcell:redline:receiver-ready',sync);
window.addEventListener('blackcell:redline:bridge',sync);
window.addEventListener('blackcell:redline:state',sync);
window.addEventListener('blackcell:redline:session-mode',sync);
window.addEventListener('blackcell:redline:reset',()=>{lastSessionKey=null;messages=[];lastSync=0;sync()});
window.addEventListener('pageshow',()=>{sync();void pollSenderTimers(true)});
window.addEventListener('visibilitychange',()=>{if(!document.hidden){
 if((isSender()&&currentTab==='upload')||ownerDialog.open||(receiverChatPanel()&&!receiverChatPanel().hidden))void loadMessages();
 void pollSenderTimers(true);
}});
window.setInterval(()=>{
 updateTimerCards();
 if(!document.hidden)void pollSenderTimers();
},1000);
window.setInterval(()=>{
 const active=(isSender()&&currentTab==='upload')||ownerDialog.open||(receiverChatPanel()&&!receiverChatPanel().hidden);
 if(!document.hidden&&active&&Date.now()-lastSync>9500)void loadMessages();
},10000);
sync();
})();