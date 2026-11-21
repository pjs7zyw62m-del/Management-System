/* REDLINE timed photo earnings — one selected photo, server clock and room RPCs.
   Complete minutes are accrued as a ledger obligation, not a funds transfer.
   Owner alone can start, stop or record paid; sender can read room status. */
(()=>{
'use strict';
const $=s=>document.querySelector(s);
const app=$('#ledgerApp'),room=$('#activeRoom');
if(!app||!room)return;
const make=(tag,cls,txt)=>{
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(txt!==undefined)n.textContent=String(txt);return n;
};
const btn=(txt,fn,cls)=>{
 const n=make('button',cls||'',txt);n.type='button';n.addEventListener('click',fn);return n;
};
const bridge=()=>window.BLACKCELL_REDLINE_API;
const money=c=>{
 try{
  const v=BigInt(String(c??0));
  return '$'+(v/100n).toLocaleString('en-US')+'.'+(v%100n).toString().padStart(2,'0');
 }catch{return '$0.00'}
};
const parseRate=value=>{
 const s=String(value||'').trim().replace(/[$,]/g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw Error('Enter a dollar rate, such as 0.50.');
 const [whole,frac='']=s.split('.');
 const cents=BigInt(whole)*100n+BigInt(frac.padEnd(2,'0'));
 if(cents<1n||cents>100000n)throw Error('Rate must be between $0.01 and $1,000 per minute.');
 return Number(cents);
};
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const labelPhoto=id=>id?'Photo '+id.slice(0,8).toUpperCase():'No photo selected';
let roomId=null,selectedId=null,latest=null,fetching=false,acting=false;
let lastStatusAt=0,lastHeartbeatAt=0,clockOffset=0,lastHistorySignature='';
const ownerPanel=make('details','rr-timer-panel');ownerPanel.id='redlinePhotoTimerPanel';
ownerPanel.open=true;
ownerPanel.setAttribute('aria-label','Selected photo timed earnings');
const title=make('summary','rr-timer-heading');
title.append(make('strong','','TIMED PHOTO EARNINGS'),make('small','','Completed minutes only · owner controlled'));
const chosen=make('span','rr-timer-selected','Select a photo');
const rateLabel=make('label','rr-timer-rate-label','RATE / MIN');
const rate=make('input','rr-timer-rate');rate.type='text';rate.inputMode='decimal';
rate.maxLength=14;rate.placeholder='0.50';rate.value='0.50';
// A leading decimal point becomes 0. automatically: .10 -> 0.10.
rate.addEventListener('input',()=>{
 if(!rate.value.startsWith('.'))return;
 const start=rate.selectionStart,end=rate.selectionEnd;
 rate.value='0'+rate.value;
 try{rate.setSelectionRange(start===null?rate.value.length:start+1,
  end===null?rate.value.length:end+1)}catch(_){}
});
rate.setAttribute('aria-label','Timed earnings dollars per completed minute');
rateLabel.append(rate);
const start=btn('▶ START TIMER',()=>void startTimer(),'rr-timer-start');
const stop=btn('■ STOP TIMER',()=>void stopTimer(),'rr-timer-stop');
const elapsed=make('strong','rr-timer-clock','00:00');
const earned=make('strong','rr-timer-money','$0.00');
const resetPick=btn('NEXT INCOMING',()=>selectIncoming(),'rr-timer-select-incoming');
const controls=make('div','rr-timer-controls');
controls.append(chosen,rateLabel,start,stop,resetPick);
title.append(elapsed,earned);
const note=make('p','rr-timer-note','Timer credits are tracked separately. They are not automatic money transfers.');
note.setAttribute('role','status');
const preview=make('div','rr-timer-selected-preview');
const previewImg=make('img','');previewImg.alt='Selected private photo for timed viewing';
const previewInfo=make('div','');
previewInfo.append(make('strong','','Selected priced photo'),
 make('small','','This is the timed photo, rather than the next pending submission.'));
const openOriginal=btn('VIEW FULL PHOTO',()=>{
 const b=$('[data-redline-photo-id="'+selectedId+'"] .photo-image-btn');
 b?.click();
},'rr-timer-full');
previewInfo.append(openOriginal);preview.append(previewImg,previewInfo);preview.hidden=true;
ownerPanel.append(title,controls,note);
const lower=make('details','rr-timer-ledger');
lower.id='redlineTimedEarningsLedger';
lower.setAttribute('aria-label','Timed photo earnings and payment record');
const total=make('div','rr-timer-totals','Timed earned: $0.00 · Owed: $0.00 · Recorded paid: $0.00');
const history=make('div','rr-timer-history');
const ledgerSummary=make('summary','','TIMED EARNINGS · VIEW RECORD');
lower.append(ledgerSummary,total,history);
// One pinned live timer status in the authenticated sender chat. No extra
// database writes or duplicate chat messages are created for the clock ticks.
const senderPanel=make('section','rr-timer-sender rr-timer-chat-status');
senderPanel.id='redlineSenderTimedEarnings';
senderPanel.setAttribute('aria-label','Live REDLINE timer in private chat');
const senderHead=make('div','rr-timer-sender-head');
const senderStatus=make('strong','rr-timer-sender-status','TIMER STARTED');
senderStatus.setAttribute('aria-live','polite');
const senderRate=make('span','rr-timer-sender-rate','');
senderHead.append(senderStatus,senderRate);
const senderMetrics=make('div','rr-timer-sender-metrics');
const senderTimeMetric=make('div','rr-timer-sender-metric');
senderTimeMetric.append(make('small','','TIME ELAPSED'));
const senderClock=make('strong','rr-timer-sender-clock','00:00');
senderTimeMetric.append(senderClock);
const senderAmountMetric=make('div','rr-timer-sender-metric');
senderAmountMetric.append(make('small','','EARNED SO FAR'));
const senderAmount=make('strong','rr-timer-sender-amount','$0.00');
senderAmountMetric.append(senderAmount);
senderMetrics.append(senderTimeMetric,senderAmountMetric);
const senderDetail=make('p','rr-timer-sender-detail','Amount increases for each completed minute.');
senderPanel.append(senderHead,senderMetrics,senderDetail);
senderPanel.hidden=true;
const duration=seconds=>{
 const n=Math.max(0,Math.floor(seconds));
 const pad=x=>String(x).padStart(2,'0');
 return n>=3600?Math.floor(n/3600)+':'+pad(Math.floor(n/60)%60)+':'+pad(n%60):
  pad(Math.floor(n/60))+':'+pad(n%60);
};
function snap(){return bridge()?.snapshot?.()||null}
function currentPhoto(){
 const card=$('#reviewQueueCurrent .photo-entry[data-redline-photo-id]');
 return card?.dataset.redlinePhotoId||null;
}
function selectIncoming(){
 window.dispatchEvent(new Event('blackcell:redline:next-incoming'));
 selectedId=currentPhoto();
 note.textContent=selectedId?'Selected '+labelPhoto(selectedId)+'.':'Waiting for an incoming photo.';
 render();
}
function pickPhoto(id){
 if(!uuid(id))return;
 if(latest?.active?.running&&latest.active.photo_id!==id){
  // Leaving one selected photo stops its timed accrual before the next is used.
  selectedId=id;
  note.textContent='Stopping the previous photo timer before switching…';
  void stopTimer(false);
  return;
 }
 selectedId=id;render();
}
window.addEventListener('blackcell:redline:photo-selected',e=>pickPhoto(e.detail?.photoId));
window.addEventListener('blackcell:redline:review-photo',e=>{
 const id=e.detail?.photoId;
 if(uuid(id)&&!latest?.active?.running&&selectedId!==id)pickPhoto(id);
});
window.addEventListener('blackcell:redline:photo-decided',e=>{
 if(latest?.active?.running&&latest.active.photo_id===e.detail?.photoId)void stopTimer(false);
 if(selectedId===e.detail?.photoId){selectedId=null;selectIncoming()}
});
// The verified timer stays in the normal photo viewer's bid sidebar.
// Opening the image-only popup never moves or duplicates the timer.
function mount(s){
 if(!s)return;
 const stage=$('#redlineReceiverReviewStage');
 const workspace=$('#redlineReceiverLiveWorkspace');
 const combined=!!workspace&&!workspace.hidden;
 const fallback=$('#activeRoom .timeline-column');
 const sidebar=$('#redlineLightboxReview');
 const besidePhoto=Boolean(sidebar&&!sidebar.hidden&&!s.archiveMode&&
  sidebar.closest('#redlineReceiverReviewStage, #ownerReviewQueue'));
 if(s.isOwner){
  if(besidePhoto&&ownerPanel.parentNode!==sidebar)sidebar.append(ownerPanel);
  else if(!besidePhoto&&combined&&workspace&&ownerPanel.previousElementSibling!==workspace)workspace.after(ownerPanel);
  else if(!besidePhoto&&!combined&&fallback&&ownerPanel.parentNode!==fallback)fallback.prepend(ownerPanel);
  const photoHost=combined?stage:fallback;
  if(photoHost&&preview.parentNode!==photoHost)photoHost.prepend(preview);
 }
 if(s.isOwner){
  const records=combined?$('#redlineReceiverPricedStage'):fallback;
  if(records&&lower.parentNode!==records)records.append(lower);
 }else{
  // Sender timer activity is rendered directly IN the chat message stream
  // by private-photo-ledger-simple-sender.js, rather than in a second panel.
  senderPanel.hidden=true;
 }
}
function err(text){note.textContent=String(text?.message||text||'Unable to save timer.').slice(0,230)}
async function callAction(action,feedback){
 if(acting)return;
 acting=true;start.disabled=stop.disabled=true;note.textContent=feedback;
 try{await action();await refresh(true)}catch(e){err(e)}
 finally{acting=false;render()}
}
async function startTimer(){
 const s=snap();
 if(!s?.isOwner||!s.roomActive||s.archiveMode||!selectedId)return;
 let cents;
 try{cents=parseRate(rate.value)}catch(e){err(e);return}
 await callAction(async()=>{
  await bridge().timerStart(selectedId,cents);
 },'Starting authenticated timed photo session…');
}
async function stopTimer(keepPhotoSelected=true){
 const id=latest?.active?.id;
 if(!id||!snap()?.isOwner)return;
 let committed=null;
 await callAction(async()=>{
  committed=await bridge().timerStop(id,{keepPhotoSelected});
  // Keep the photo whose timer just stopped visible with its final price,
  // instead of immediately switching to another pending photograph.
  if(committed?.photo_id&&keepPhotoSelected){
   selectedId=committed.photo_id;
   window.dispatchEvent(new CustomEvent('blackcell:redline:photo-selected',
    {detail:{photoId:committed.photo_id}}));
  }
 },'Stopping, pricing and submitting selected photo…');
 if(committed?.ok){
  note.textContent=committed.photo_auto_submitted||committed.photo_has_timer_price
   ?'PHOTO AUTO-SUBMITTED · '+money(committed.earned_cents)+' · '+committed.completed_minutes+' completed minute(s)'
   :'Timer stopped · '+money(committed.earned_cents)+' saved as timed earnings for this photo.';
 }
}
async function markPaid(id){
 if(!uuid(id)||!snap()?.isOwner||acting)return;
 if(!window.confirm('Record this timed earning as paid? REDLINE does not send money.'))return;
 await callAction(async()=>{await bridge().timerMarkPaid(id)},'Recording external payment confirmation…');
}
function tickAmount(){
 const a=latest?.active;
 if(!a?.running)return 0n;
 const now=Date.now()+clockOffset;
 const startMs=new Date(a.started_at).getTime();
 const until=Math.min(now,new Date(a.heartbeat_at).getTime()+45000);
 const minutes=Math.max(0,Math.floor((until-startMs)/60000));
 return BigInt(minutes)*BigInt(a.rate_cents||0);
}
function renderHistory(s){
 if(!latest)return;
 const recent=Array.isArray(latest.recent)?latest.recent:[];
 history.replaceChildren();
 const t=make('small','','Timed earnings are tracked separately from one-time photo prices.');
 history.append(t);
 for(const row of recent.slice(0,15)){
  const item=make('div','rr-timer-history-item');
  item.append(make('span','',labelPhoto(row.photo_id)+' · '+row.completed_minutes+' min × '+money(row.rate_cents)+'/min'),
   make('strong','',money(row.earned_cents)+(row.settled_at?' · PAID':' · OWED')));
  if(s?.isOwner&&!row.settled_at&&Number(row.earned_cents)>0){
   item.append(btn('RECORD PAID',()=>void markPaid(row.id),'rr-timer-paid'));
  }
  history.append(item);
 }
}
function render(){
 const s=snap();
 if(!s||s.roomId!==roomId){senderPanel.hidden=true;return}
 mount(s);
 const owner=s.isOwner&&!s.archiveMode;
 ownerPanel.hidden=!owner;
 lower.hidden=s.archiveMode;
 const running=latest?.active?.running===true;
 // A stopped timer comes from the same authenticated status RPC; show the
 // result briefly so the sender also knows their timer has ended.
 const nowMs=Date.now()+clockOffset;
 const active=latest?.active;
 const stopped=(!active&&Array.isArray(latest?.recent))?latest.recent[0]:null;
 const stoppedAt=Date.parse(stopped?.stopped_at||'');
 const recentStop=Boolean(stopped&&Number.isFinite(stoppedAt)&&
  nowMs>=stoppedAt&&nowMs-stoppedAt<600000);
 senderPanel.hidden=true;
 if(!senderPanel.hidden){
  const session=active||stopped;
  const startMs=Date.parse(session.started_at);
  const heartbeatMs=Date.parse(active?.heartbeat_at||'');
  const validStart=Number.isFinite(startMs);
  const isRunning=Boolean(active?.running&&validStart&&
   Number.isFinite(heartbeatMs)&&nowMs<=heartbeatMs+75000);
  const displayUntil=active
   ? Math.min(nowMs,Number.isFinite(heartbeatMs)?heartbeatMs+45000:nowMs)
   : stoppedAt;
  const seconds=validStart?Math.max(0,Math.floor((displayUntil-startMs)/1000)):0;
  const amount=active?(isRunning?tickAmount():BigInt(active.earned_cents||0)):BigInt(stopped?.earned_cents||0);
  senderStatus.textContent=isRunning?'● TIMER RUNNING':active?'TIMER DISCONNECTED':'■ TIMER STOPPED';
  senderRate.textContent=money(session.rate_cents)+'/minute';
  senderClock.textContent=duration(seconds);
  senderAmount.textContent=money(amount);
  senderDetail.textContent=isRunning
   ?'Photo '+String(session.photo_id||'').slice(0,8).toUpperCase()+
    ' · Earned amount increases each completed minute.'
   :active?'Timer connection lost. Amount shown is capped at the last verified heartbeat.'
   :'Final completed-minute amount · Timer stopped.';
 }

 const elapsedSec=running?Math.max(0,Math.floor((Date.now()+clockOffset-new Date(latest.active.started_at).getTime())/1000)):0;
 const m=Math.floor(elapsedSec/60),secs=elapsedSec%60;
 elapsed.textContent=running?String(m).padStart(2,'0')+':'+String(secs).padStart(2,'0'):'00:00';
 const activePay=tickAmount();
 earned.textContent=money(activePay);
 chosen.textContent=running?labelPhoto(latest.active.photo_id)+' · RUNNING':labelPhoto(selectedId);
 start.disabled=acting||!owner||!s.roomActive||!selectedId||running;
 stop.disabled=acting||!owner||!running;
 rate.disabled=running||acting||!owner;
 // The owner has ONE canonical photograph viewer: #reviewQueueCurrent.
 // Legacy timer preview could remain active after pricing and CSS hid the
 // newly pending photograph. Keep that preview permanently out of the
 // layout; the original photo and all timer controls remain in the receiver
 // queue and right-hand sidebar.
 preview.hidden=true;
 document.body.classList.remove('rr-timing-priced-photo');
 const displayedPhoto=currentPhoto();
 if(owner&&!running&&displayedPhoto&&selectedId!==displayedPhoto){
  selectedId=displayedPhoto;
  chosen.textContent=labelPhoto(selectedId);
 }
 if(!running&&latest?.active&&!latest.active.running){
  note.textContent='Timer lease expired. Start again after the previous session is finalized.';
 }
 if(latest){
  total.textContent='Timed earned: '+money(latest.assigned_cents)+' · Owed: '+money(latest.owed_cents)+' · Recorded paid: '+money(latest.paid_cents);
  if(s.isOwner){
   const signature=JSON.stringify(latest.recent||[]);
   if(signature!==lastHistorySignature){renderHistory(s);lastHistorySignature=signature}
  }
  // Sender's pinned chat status is updated in place above, once per second.
  // Existing earnings remain available in the sender's Earnings section.
 }
}
async function refresh(force=false){
 const s=snap();
 if(!s||!room||room.hidden||!bridge()?.timerStatus){
  roomId=null;latest=null;senderPanel.hidden=true;render();return;
 }
 if(s.roomId!==roomId){
  const oldTimer=latest?.active?.running&&snap()?.isOwner?latest.active.id:null;
  if(oldTimer)void bridge()?.timerStop?.(oldTimer).catch(()=>{});
  roomId=s.roomId;selectedId=null;latest=null;lastHeartbeatAt=0;lastStatusAt=0;lastHistorySignature='';
  selectIncoming();
 }
 mount(s);
 // Sender polls only while its authenticated room is in the foreground.
 // A five-second check picks up timer start/stop without creating chat spam.
 const pollMs=!s.isOwner&&s.roomActive&&!s.archiveMode?5000:12000;
 if(fetching||!force&&Date.now()-lastStatusAt<pollMs)return;
 fetching=true;lastStatusAt=Date.now();
 try{
  latest=await bridge().timerStatus(roomId);
  // One authenticated status snapshot feeds the sender chat and the
  // original photograph's final timed-price display without extra RPCs.
  if(snap()?.roomId===roomId){
   window.dispatchEvent(new CustomEvent('blackcell:redline:timer-status',{
    detail:{roomId,status:latest}
   }));
   window.dispatchEvent(new CustomEvent('blackcell:redline:timed-photo-summary',{
    detail:{roomId,photoTotals:latest.photo_totals||[]}
   }));
  }
  clockOffset=new Date(latest.server_now).getTime()-Date.now();
  if(latest.active?.running&&s.isOwner)selectedId=latest.active.photo_id;
  if(!selectedId)selectedId=currentPhoto()||s.entries?.find(e=>e.decision_status==='accepted')?.id||null;
 }catch(e){err(e)}
 finally{fetching=false;render()}
}
async function pulse(){
 const s=snap();
 if(!s||document.hidden||room.hidden||s.archiveMode)return;
 const active=latest?.active;
 if(s.isOwner&&active?.running&&!acting&&Date.now()-lastHeartbeatAt>=16000){
  lastHeartbeatAt=Date.now();
  try{await bridge().timerHeartbeat(active.id)}
  catch(e){err(e);await refresh(true)}
 }
 await refresh();
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  if(snap()?.isOwner&&latest?.active?.running)void bridge()?.timerStop?.(latest.active.id).catch(()=>{});
 }else void refresh(true);
});
window.addEventListener('pagehide',()=>{
 if(snap()?.isOwner&&latest?.active?.running)void bridge()?.timerStop?.(latest.active.id).catch(()=>{});
});
for(const evt of ['blackcell:redline:bridge','blackcell:redline:state','blackcell:redline:reset','blackcell:redline:session-mode']){
 window.addEventListener(evt,()=>{
  if(snap()?.archiveMode&&snap()?.isOwner&&latest?.active?.running)void stopTimer();
  void refresh(true);
 });
}
window.setInterval(()=>{render();void pulse()},1000);
void refresh(true);
})();
