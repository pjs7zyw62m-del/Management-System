/* REDLINE timed photo earnings — one selected photo, server clock and room RPCs.
   Elapsed seconds are prorated from the per-minute rate; this ledger does not move funds.
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
// Running balance in 4-decimal dollars; final cents round once on the server.
const liveMoney=(rateCents,elapsedSeconds)=>{
 const seconds=BigInt(Math.max(0,Math.floor(Number(elapsedSeconds)||0)));
 const units=(BigInt(rateCents||0)*seconds*100n+30n)/60n;
 return '$'+(units/10000n).toLocaleString('en-US')+'.'+
  (units%10000n).toString().padStart(4,'0');
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
let roomId=null,selectedId=null,latest=null,fetching=false,acting=false,refreshQueued=false;
let lastStatusAt=0,lastHeartbeatAt=0,clockOffset=0,lastHistorySignature='',lastAdvancedTimerId=null;
let senderCanStop=false,senderStopBusy=false,senderFeatureAt=0;
const ownerPanel=make('details','rr-timer-panel');ownerPanel.id='redlinePhotoTimerPanel';
ownerPanel.open=true;
ownerPanel.setAttribute('aria-label','Selected photo timed earnings');
const title=make('summary','rr-timer-heading');
title.append(make('strong','','TIMED PHOTO EARNINGS'),make('small','','Every second counts · owner controlled'));
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
rate.setAttribute('aria-label','Timed earnings dollars per minute, prorated by elapsed second');
rateLabel.append(rate);
const start=btn('▶ START TIMER',()=>void startTimer(),'rr-timer-start');
const stop=btn('■ STOP TIMER',()=>void requestStopWithVeto(),'rr-timer-stop');
const elapsed=make('strong','rr-timer-clock','00:00');
const earned=make('strong','rr-timer-money','$0.0000');
const resetPick=btn('NEXT INCOMING',()=>selectIncoming(),'rr-timer-select-incoming');
const controls=make('div','rr-timer-controls');
controls.append(chosen,rateLabel,start,stop,resetPick);
title.append(elapsed,earned);
const note=make('p','rr-timer-note','Rate ÷ 60 every second. Final cents round once when stopped; REDLINE does not transfer money.');
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
const senderDetail=make('p','rr-timer-sender-detail','Amount increases every elapsed second.');
const senderStop=btn('✕ DECLINE & STOP TIMER',()=>void senderDeclineStop(),'rr-timer-sender-stop');
const senderStopStatus=make('p','rr-timer-sender-stop-status','');
// Receiver STOP: sender receives 10 seconds to say NO on attempts 1 and 2.
const stopVetoDlg=make('dialog','redline-stop-veto-dialog');
stopVetoDlg.id='redlineSenderStopVeto';
stopVetoDlg.setAttribute('aria-label','Receiver asked to stop the timer');
stopVetoDlg.setAttribute('aria-modal','true');
const stopVetoKicker=make('small','redline-stop-veto-kicker','BLACKCELL REDLINE / LIVE TIMER');
const stopVetoTitle=make('h2','','RECEIVER WANTS TO STOP');
const stopVetoMessage=make('p','','Press NO within 10 seconds to keep the timer running. If you do not respond, the timer stops.');
const stopVetoCountdown=make('strong','redline-stop-veto-clock','10');
const stopVetoAttempt=make('p','redline-stop-veto-attempt','STOP ATTEMPT 1 OF 3');
const stopVetoNo=btn('NO — KEEP TIMER RUNNING',()=>void declineReceiverStop(),'redline-stop-veto-no');
const stopVetoStatus=make('p','redline-stop-veto-status','');
stopVetoStatus.setAttribute('role','status');
stopVetoDlg.append(stopVetoKicker,stopVetoTitle,stopVetoMessage,stopVetoCountdown,
 stopVetoAttempt,stopVetoNo,stopVetoStatus);
document.body.append(stopVetoDlg);
let stopVetoBusy=false;
stopVetoDlg.addEventListener('cancel',event=>event.preventDefault());
// The timeout is enforced on the server; closing the popup never counts as NO.
function stopVetoRemaining(){
 const d=Date.parse(latest?.stop_prompt?.pending_until||'');
 if(!Number.isFinite(d))return 0;
 return Math.max(0,Math.ceil((d-(Date.now()+clockOffset))/1000));
}
async function declineReceiverStop(){
 const s=snap(),id=latest?.active?.id;
 if(stopVetoBusy||!s||s.isOwner||!s.roomActive||!uuid(id))return;
 if(stopVetoRemaining()<=0){await refresh(true);return}
 stopVetoBusy=true;stopVetoNo.disabled=true;stopVetoStatus.textContent='Sending NO…';
 try{
  const out=await bridge().senderVetoTimerStop(id);
  stopVetoStatus.textContent=out.status==='vetoed'
   ?'NO recorded. Timer continues.'
   :'Response saved.';
  if(stopVetoDlg.open)stopVetoDlg.close();
  await refresh(true);
 }catch(e){
  stopVetoStatus.textContent=String(e?.message||e).slice(0,180);
  await refresh(true);
 }finally{stopVetoBusy=false;stopVetoNo.disabled=false}
}
function renderStopVeto(s){
 const prompt=latest?.stop_prompt;
 const waiting=Boolean(s&&!s.isOwner&&!s.archiveMode&&s.roomActive&&
  !document.hidden&&room&&!room.hidden&&latest?.active?.running&&
  prompt?.status==='pending'&&stopVetoRemaining()>0);
 if(!waiting){
  if(stopVetoDlg.open)stopVetoDlg.close();
  return;
 }
 const left=stopVetoRemaining();
 stopVetoCountdown.textContent=String(left);
 stopVetoAttempt.textContent='STOP ATTEMPT '+prompt.attempts+' OF 3 · '+
  (Math.max(0,2-Number(prompt.attempts))+' MORE NO OPPORTUNITIES AFTER THIS');
 if(!stopVetoDlg.open){
  stopVetoStatus.textContent='';
  try{stopVetoDlg.showModal()}catch(_){stopVetoDlg.setAttribute('open','')}
 }
}

senderStopStatus.setAttribute('role','status');
senderPanel.append(senderHead,senderMetrics,senderDetail,senderStop,senderStopStatus);
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
 // During STOP the server is authoritative; never use stale active state to
 // interrupt the newly mounted next photo with an implicit second STOP.
 if(acting){selectedId=id;render();return}
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
 const appleTimer=$('#rrAppleTimerMount');
 const appleMode=!!appleTimer&&document.body.classList.contains('bc-redline-apple-mode');
 const besidePhoto=Boolean(sidebar&&!sidebar.hidden&&!s.archiveMode&&
  sidebar.closest('#redlineReceiverReviewStage, #ownerReviewQueue'));
 if(s.isOwner){
  if(appleMode){
   if(ownerPanel.parentNode!==appleTimer)appleTimer.prepend(ownerPanel);
   // Display the actual timer controls in the owner workstation.
   if(!ownerPanel.dataset.appleOpened){ownerPanel.open=true;ownerPanel.dataset.appleOpened='1';}
  }
  else if(besidePhoto&&ownerPanel.parentNode!==sidebar)sidebar.append(ownerPanel);
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
 },'Starting timed photo immediately…');
 if(latest?.active?.running)note.textContent='TIMER STARTED · Sender acceptance is not required.';
}
async function requestStopWithVeto(){
 const id=latest?.active?.id;
 if(!id||!snap()?.isOwner||acting)return;
 let result=null;
 await callAction(async()=>{
  result=await bridge().timerStopRequest(id);
  if(result?.status==='stopped'){
   // Bridge has already reconciled the finished photograph and rendered the next.
   lastAdvancedTimerId=id;
   selectedId=currentPhoto();
  }
 },'Requesting to stop timer…');
 if(!result?.ok)return;
 if(result.status==='pending'){
  note.textContent='STOP ATTEMPT '+result.attempts+' OF 3 · Sender has 10 seconds to say NO. '+
   'If no response, REDLINE stops the timer automatically.';
 }else if(result.status==='stopped'){
  note.textContent='TIMER STOPPED · '+money(result.earned_cents)+
   (result.photo_auto_submitted?' · PHOTO AUTO-SUBMITTED':'');
 }
}
async function stopTimer(keepPhotoSelected=false){
 const id=latest?.active?.id;
 if(!id||!snap()?.isOwner)return;
 let committed=null;
 await callAction(async()=>{
  committed=await bridge().timerStop(id,{keepPhotoSelected});
  // After STOP the next pending photo is now the visible selection.
  // Keep a stopped photo only when specifically requested in a history view.
  if(committed?.photo_id&&keepPhotoSelected){
   selectedId=committed.photo_id;
   window.dispatchEvent(new CustomEvent('blackcell:redline:photo-selected',
    {detail:{photoId:committed.photo_id}}));
  }else if(committed?.photo_id){
   selectedId=currentPhoto();
  }
 },'Stopping, pricing and submitting selected photo…');
 if(committed?.ok){
  note.textContent=committed.photo_auto_submitted||committed.photo_has_timer_price
   ?'PHOTO AUTO-SUBMITTED · '+money(committed.earned_cents)+' · '+duration(committed.elapsed_seconds||0)+' elapsed'+
      (!keepPhotoSelected&&currentPhoto()!==committed.photo_id?' · NEXT PHOTO READY':'')
   :'Timer stopped · '+money(committed.earned_cents)+' saved as timed earnings for this photo.';
 }
}
async function senderDeclineStop(){
 const s=snap(),id=latest?.active?.id;
 if(!s||s.isOwner||s.archiveMode||!s.roomActive||!senderCanStop||!uuid(id)||senderStopBusy)return;
 if(!window.confirm('Decline and stop this running photo timer now? The time already elapsed remains in REDLINE records.'))return;
 senderStopBusy=true;senderStop.disabled=true;senderStopStatus.textContent='Stopping timer…';
 try{
  const result=await bridge().senderStopTimer(id);
  senderStopStatus.textContent='Timer stopped · '+money(result.earned_cents)+' recorded for elapsed time.';
  await refresh(true);
 }catch(e){senderStopStatus.textContent='Could not stop timer: '+String(e?.message||e).slice(0,180)}
 finally{senderStopBusy=false;render()}
}
async function markPaid(id){
 if(!uuid(id)||!snap()?.isOwner||acting)return;
 if(!window.confirm('Record this timed earning as paid? REDLINE does not send money.'))return;
 await callAction(async()=>{await bridge().timerMarkPaid(id)},'Recording external payment confirmation…');
}
function tickSeconds(){
 const a=latest?.active;
 if(!a?.running)return 0;
 const now=Date.now()+clockOffset;
 const startMs=Date.parse(a.started_at),heartbeatMs=Date.parse(a.heartbeat_at);
 if(!Number.isFinite(startMs))return 0;
 const until=Math.min(now,Number.isFinite(heartbeatMs)?heartbeatMs+45000:now);
 return Math.max(0,Math.floor((until-startMs)/1000));
}
function renderHistory(s){
 if(!latest)return;
 const recent=Array.isArray(latest.recent)?latest.recent:[];
 history.replaceChildren();
 const t=make('small','','Timed earnings are tracked separately from one-time photo prices.');
 history.append(t);
 for(const row of recent.slice(0,15)){
  const item=make('div','rr-timer-history-item');
  item.append(make('span','',labelPhoto(row.photo_id)+' · '+duration(row.elapsed_seconds??((row.completed_minutes||0)*60))+' × '+money(row.rate_cents)+'/min'),
   make('strong','',money(row.earned_cents)+(row.settled_at?' · PAID':' · OWED')));
  if(s?.isOwner&&!row.settled_at&&Number(row.earned_cents)>0){
   item.append(btn('RECORD PAID',()=>void markPaid(row.id),'rr-timer-paid'));
  }
  history.append(item);
 }
}
function render(){
 const s=snap();
 if(!s||s.roomId!==roomId){senderPanel.hidden=true;if(stopVetoDlg.open)stopVetoDlg.close();return}
 mount(s);
 const owner=s.isOwner&&!s.archiveMode;
 ownerPanel.hidden=!owner;
 lower.hidden=s.archiveMode;
 const running=latest?.active?.running===true;
 renderStopVeto(s);
 // A stopped timer comes from the same authenticated status RPC; show the
 // result briefly so the sender also knows their timer has ended.
 const nowMs=Date.now()+clockOffset;
 const active=latest?.active;
 const stopped=(!active&&Array.isArray(latest?.recent))?latest.recent[0]:null;
 const stoppedAt=Date.parse(stopped?.stopped_at||'');
 const recentStop=Boolean(stopped&&Number.isFinite(stoppedAt)&&
  nowMs>=stoppedAt&&nowMs-stoppedAt<600000);
 senderPanel.hidden=true;
 const canSenderStop=Boolean(!s.isOwner&&!s.archiveMode&&running&&senderCanStop);
 senderStop.hidden=!canSenderStop;
 senderStop.disabled=senderStopBusy;
 const senderChat=document.querySelector('#redlineSimpleSender .redline-message-card');
 const pinned=senderChat?.querySelector('.redline-chat-timer-slot');
 if(pinned&&canSenderStop){
  if(senderStop.parentNode!==pinned)pinned.append(senderStop,senderStopStatus);
 }else if(senderStop.parentNode!==senderPanel)senderPanel.append(senderStop,senderStopStatus);
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
  const amount=active&&isRunning?liveMoney(active.rate_cents,seconds):money((active||stopped)?.earned_cents);
  senderStatus.textContent=isRunning?'● TIMER RUNNING':active?'TIMER DISCONNECTED':'■ TIMER STOPPED';
  senderRate.textContent=money(session.rate_cents)+'/minute';
  senderClock.textContent=duration(seconds);
  senderAmount.textContent=amount;
  senderDetail.textContent=isRunning
   ?'Photo '+String(session.photo_id||'').slice(0,8).toUpperCase()+
    ' · Earned amount increases every second.'
   :active?'Timer connection lost. Amount shown is capped at the last verified heartbeat.'
   :'Final elapsed-second amount · Timer stopped.';
 }

 const elapsedSec=running?tickSeconds():0;
 const m=Math.floor(elapsedSec/60),secs=elapsedSec%60;
 elapsed.textContent=running?String(m).padStart(2,'0')+':'+String(secs).padStart(2,'0'):'00:00';
 const activeSeconds=tickSeconds();
 earned.textContent=running?liveMoney(latest.active.rate_cents,activeSeconds):'$0.0000';
 chosen.textContent=running?labelPhoto(latest.active.photo_id)+' · RUNNING':labelPhoto(selectedId);
 start.disabled=acting||!owner||!s.roomActive||!selectedId||running;
 const awaitingStop=latest?.stop_prompt?.status==='pending'&&stopVetoRemaining()>0;
 stop.disabled=acting||!owner||!running||awaitingStop;
 if(owner&&running&&awaitingStop){
  note.textContent='WAITING '+stopVetoRemaining()+'s · STOP ATTEMPT '+
   latest.stop_prompt.attempts+' OF 3 · Sender may say NO.';
 }else if(owner&&running&&latest?.stop_prompt?.status==='vetoed'){
  note.textContent='SENDER SAID NO · Timer continues. '+latest.stop_prompt.attempts+
   ' of 3 STOP attempts used.';
 }
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
  roomId=s.roomId;selectedId=null;latest=null;lastHeartbeatAt=0;lastStatusAt=0;lastHistorySignature='';lastAdvancedTimerId=null;senderCanStop=false;senderFeatureAt=0;senderStopStatus.textContent='';
  selectIncoming();
 }
 mount(s);
 // Sender polls only while its authenticated room is in the foreground.
 // A five-second check picks up timer start/stop without creating chat spam.
 const hasLiveTimer=latest?.active?.running===true;
 const pendingStop=latest?.stop_prompt?.status==='pending';
 const pollMs=pendingStop?1200:(!s.isOwner&&s.roomActive&&!s.archiveMode
  ?(hasLiveTimer?1600:5000):12000);
 if(fetching){
  // Don't lose the forced post-START/STOP snapshot to an in-flight poll.
  if(force)refreshQueued=true;
  return;
 }
 if(!force&&Date.now()-lastStatusAt<pollMs)return;
 fetching=true;lastStatusAt=Date.now();
 try{
  const previousActive=latest?.active?.running?latest.active:null;
  latest=await bridge().timerStatus(roomId);
  if(previousActive&&!latest?.active?.running&&s.isOwner&&
     lastAdvancedTimerId!==previousActive.id){
   // Expiry of the 10-second response window is finalized by the status
   // RPC. It must also update the owner queue, just like the third STOP.
   const completed=latest?.recent?.find(x=>x.id===previousActive.id);
   if(completed){
    lastAdvancedTimerId=previousActive.id;
    await bridge()?.refreshTimerPhoto?.(completed,previousActive.id);
    selectedId=currentPhoto();
    note.textContent='STOP CONFIRMED · Final price saved · Next pending photo ready.';
   }
  }
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
  if(!s.isOwner&&latest.active?.running&&Date.now()-senderFeatureAt>=12000&&bridge()?.roomFeatureStatus){
   senderFeatureAt=Date.now();
   try{
    const features=await bridge().roomFeatureStatus(roomId);
    if(snap()?.roomId===roomId)senderCanStop=features.sender_can_stop_timer===true;
   }catch(_){senderCanStop=false}
  }else if(!latest.active?.running)senderCanStop=false;
  if(latest.active?.running&&s.isOwner)selectedId=latest.active.photo_id;
  if(!selectedId)selectedId=currentPhoto()||s.entries?.find(e=>e.decision_status==='accepted')?.id||null;
 }catch(e){err(e)}
 finally{
  fetching=false;render();
  if(refreshQueued){
   refreshQueued=false;
   void refresh(true);
  }
 }
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
