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
const messagesPane=make('section','redline-simple-pane');messagesPane.dataset.redlinePane='messages';messagesPane.hidden=true;
for(const [key,label] of [['upload','Upload'],['earnings','Earnings'],['messages','Messages']]){
 const b=make('button','redline-simple-tab',label);b.type='button';b.dataset.simpleTab=key;
 b.addEventListener('click',()=>switchTab(key));
 tabs.append(b);
}
const uploadTitle=make('div','redline-upload-intro');
uploadTitle.append(make('span','redline-kicker','PRIVATE MEDIA'),make('h2','','Send a photo'));
uploadTitle.append(make('p','','Choose a photo, add a note if you want, then send it privately for review.'));
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
const activityBox=make('section','redline-activity-box');
activityBox.append(make('h3','','Recent activity'));
const activityList=make('div','redline-activity-list');activityBox.append(activityList);
const returnUpload=make('button','redline-main-action','+ UPLOAD ANOTHER PHOTO');
returnUpload.type='button';returnUpload.addEventListener('click',()=>switchTab('upload'));
earningsPane.append(earningsBox,activityBox,returnUpload);
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
msgTitle.append(make('strong','','PRIVATE ROOM — REDLINE'),make('small','','Owner + Sender only'));
msgHeader.append(msgTitle);
const feed=make('div','redline-message-feed');feed.setAttribute('role','log');feed.setAttribute('aria-live','polite');
const empty=make('div','redline-chat-empty','No messages yet. Your conversation and photo-review updates will appear here.');
feed.append(empty);
const composer=make('form','redline-message-composer');
composer.id='redlineMessageComposer';
const photoAction=make('button','redline-chat-photo','+ PHOTO');
photoAction.type='button';photoAction.setAttribute('aria-label','Open photo upload');
photoAction.addEventListener('click',()=>{if(!home.hidden)switchTab('upload')});
const entry=make('textarea','redline-message-entry');entry.maxLength=2000;entry.rows=1;entry.placeholder='Message REDLINE…';entry.setAttribute('aria-label','Private room message');
const send=make('button','redline-chat-send','SEND');send.type='submit';
composer.append(photoAction,entry,send);
const msgError=make('p','redline-message-error');msgError.setAttribute('role','status');
messageCard.append(msgHeader,feed,composer,msgError);
messagesPane.append(messageCard);
panes.append(uploadPane,earningsPane,messagesPane);
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
ownerButton.addEventListener('click',()=>{
 const snap=window.BLACKCELL_REDLINE_API?.snapshot?.();
 if(!snap?.isOwner)return;
 ownerMount.append(messageCard);
 photoAction.hidden=true; // Owners cannot upload sender-only photos.
 ownerDialog.showModal();
 void loadMessages();
});
ownerDialog.addEventListener('close',()=>{messagesPane.append(messageCard);photoAction.hidden=false;entry.value=''});
ownerDialog.addEventListener('click',e=>{if(e.target===ownerDialog)ownerDialog.close()});
let currentTab='upload',lastRoom=null,messages=[],loading=false,posting=false,roomReady=false;
let lastSync=0;
function bridge(){return window.BLACKCELL_REDLINE_API}
const snapshot=()=>bridge()?.snapshot?.()||null;
function isSender(){
 const snap=snapshot();
 return Boolean(snap&&!snap.isOwner&&!app.hidden&&!room.hidden&&!upload.hidden);
}
function money(value){const n=BigInt(value||0);return '$'+(n/100n).toLocaleString('en-US')+'.'+(n%100n).toString().padStart(2,'0')}
function dateText(iso){const d=new Date(iso);return Number.isNaN(d.valueOf())?'':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function createEvents(entries){
 const all=[];
 for(const e of entries||[]){
  const id=String(e.id||'').slice(0,8).toUpperCase();
  if(e.created_at)all.push({kind:'event',at:e.created_at,text:'Photo '+id+' submitted',status:'sent'});
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
function renderEarnings(snap){
 dataValues.pending.textContent=String(snap.pending);
 dataValues.owed.textContent=snap.owed;
 dataValues.paid.textContent=snap.paid;
 dataValues.total.textContent=snap.assigned;
 sOwed.textContent=snap.owed;sPaid.textContent=snap.paid;
 renderActivity(snap);
}
function renderChat(){
 const snap=snapshot();feed.replaceChildren();
 const events=createEvents(snap?.entries).slice(0,80);
 const combined=[
  ...events.map(e=>({kind:'event',at:e.at,body:e.text,status:e.status})),
  ...messages.map(m=>({kind:'chat',at:m.created_at,body:m.body,sender:m.sender_id,id:m.id}))
 ].sort((a,b)=>new Date(a.at)-new Date(b.at)).slice(-130);
 if(!combined.length){feed.append(make('div','redline-chat-empty','No messages or photo updates yet.'));return}
 for(const e of combined){
  if(e.kind==='event'){
   const card=make('div','redline-chat-event');
   card.append(make('strong','',e.body),make('small','',dateText(e.at)));
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
 if(tab==='messages')void loadMessages();
 home.scrollIntoView({behavior:'auto',block:'start'});
}
function sync(){
 const snap=snapshot(),sender=isSender();
 home.hidden=!sender;
 document.body.classList.toggle('redline-sender-simple',sender);
 if(sender){
  if(upload.parentNode!==uploadMount)uploadMount.append(upload);
  renderEarnings(snap);
  if(snap.roomId!==lastRoom){
   lastRoom=snap.roomId;messages=[];lastSync=0;
   renderChat();
  }
  if(!roomReady){roomReady=true;switchTab('upload')}
  if(currentTab==='messages')renderChat();
 }else{roomReady=false}
}
const observer=new MutationObserver(()=>requestAnimationFrame(sync));
for(const el of [app,room,upload,ownerSetup])observer.observe(el,{attributes:true,attributeFilter:['hidden']});
window.addEventListener('blackcell:redline:bridge',sync);
window.addEventListener('blackcell:redline:state',sync);
window.addEventListener('pageshow',sync);
window.addEventListener('visibilitychange',()=>{if(!document.hidden&&(currentTab==='messages'||ownerDialog.open))void loadMessages()});
window.setInterval(()=>{
 const active=(isSender()&&currentTab==='messages')||ownerDialog.open;
 if(!document.hidden&&active&&Date.now()-lastSync>9500)void loadMessages();
},10000);
sync();
})();