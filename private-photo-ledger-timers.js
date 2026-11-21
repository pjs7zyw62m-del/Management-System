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
let lastStatusAt=0,lastHeartbeatAt=0,clockOffset=0;
const ownerPanel=make('section','rr-timer-panel');ownerPanel.id='redlinePhotoTimerPanel';
ownerPanel.setAttribute('aria-label','Selected photo timed earnings');
const title=make('div','rr-timer-heading');
title.append(make('strong','','TIMED PHOTO EARNINGS'),make('small','','Completed minutes only · owner controlled'));
const chosen=make('span','rr-timer-selected','Select a photo');
const rateLabel=make('label','rr-timer-rate-label','RATE / MIN');
const rate=make('input','rr-timer-rate');rate.type='text';rate.inputMode='decimal';
rate.maxLength=14;rate.placeholder='0.50';rate.value='0.50';
rate.setAttribute('aria-label','Timed earnings dollars per completed minute');
rateLabel.append(rate);
const start=btn('▶ START TIMER',()=>void startTimer(),'rr-timer-start');
const stop=btn('■ STOP TIMER',()=>void stopTimer(),'rr-timer-stop');
const elapsed=make('strong','rr-timer-clock','00:00');
const earned=make('strong','rr-timer-money','$0.00');
const resetPick=btn('NEXT INCOMING',()=>selectIncoming(),'rr-timer-select-incoming');
const controls=make('div','rr-timer-controls');
controls.append(chosen,rateLabel,start,stop,elapsed,earned,resetPick);
const note=make('p','rr-timer-note','Set a rate, select an image and start. Time is recorded by the server. This does not transfer money.');
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
ownerPanel.append(title,controls,note,preview);
const lower=make('section','rr-timer-ledger');
lower.id='redlineTimedEarningsLedger';
lower.setAttribute('aria-label','Timed photo earnings and payment record');
const total=make('div','rr-timer-totals','Timed earned: $0.00 · Owed: $0.00 · Recorded paid: $0.00');
const history=make('div','rr-timer-history');
lower.append(make('strong','','TIMED EARNINGS RECORD'),total,history);
const senderPanel=make('section','rr-timer-sender');
senderPanel.id='redlineSenderTimedEarnings';
senderPanel.append(make('strong','','TIMED PHOTO EARNINGS'),make('p','','Waiting for the receiver to start a timed photo.'));
function snap(){return bridge()?.snapshot?.()||null}
function currentPhoto(){
 const card=$('#reviewQueueCurrent .photo-entry[data-redline-photo-id]');
 return card?.dataset.redlinePhotoId||null;
}
function selectIncoming(){
 selectedId=currentPhoto();
 note.textContent=selectedId?'Selected '+labelPhoto(selectedId)+'.':'Waiting for an incoming photo.';
 render();
}
function pickPhoto(id){
 if(!uuid(id))return;
 if(latest?.active?.running&&latest.active.photo_id!==id){
  note.textContent='Stop the running timer before selecting another photo.';
  return;
 }
 selectedId=id;render();
}
window.addEventListener('blackcell:redline:photo-selected',e=>pickPhoto(e.detail?.photoId));
window.addEventListener('blackcell:redline:review-photo',e=>{
 if(!selectedId&&!latest?.active?.running)pickPhoto(e.detail?.photoId);
});
window.addEventListener('blackcell:redline:photo-decided',e=>{
 if(latest?.active?.running&&latest.active.photo_id===e.detail?.photoId)void stopTimer();
 if(selectedId===e.detail?.photoId){selectedId=null;selectIncoming()}
});
function mount(s){
 if(!s)return;
 const stage=$('#redlineReceiverReviewStage');
 if(s.isOwner&&stage&&ownerPanel.parentNode!==stage)stage.prepend(ownerPanel);
 if(s.isOwner){
  const records=$('#redlineReceiverPricedStage');
  if(records&&lower.parentNode!==records)records.append(lower);
 }else{
  const summary=$('#redlineSimpleSender .redline-upload-summary');
  if(summary&&senderPanel.parentNode!==summary)summary.append(senderPanel);
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
async function stopTimer(){
 const id=latest?.active?.id;
 if(!id||!snap()?.isOwner)return;
 await callAction(async()=>{await bridge().timerStop(id)},'Stopping and recording completed minutes…');
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
 if(!s||s.roomId!==roomId)return;
 mount(s);
 const owner=s.isOwner&&!s.archiveMode;
 ownerPanel.hidden=!owner;
 lower.hidden=s.archiveMode;
 senderPanel.hidden=s.isOwner||s.archiveMode;
 const running=latest?.active?.running===true;
 const elapsedSec=running?Math.max(0,Math.floor((Date.now()+clockOffset-new Date(latest.active.started_at).getTime())/1000)):0;
 const m=Math.floor(elapsedSec/60),secs=elapsedSec%60;
 elapsed.textContent=running?String(m).padStart(2,'0')+':'+String(secs).padStart(2,'0'):'00:00';
 const activePay=tickAmount();
 earned.textContent=money(activePay);
 chosen.textContent=running?labelPhoto(latest.active.photo_id)+' · RUNNING':labelPhoto(selectedId);
 start.disabled=acting||!owner||!s.roomActive||!selectedId||running;
 stop.disabled=acting||!owner||!running;
 rate.disabled=running||acting||!owner;
 const chosenEntry=s.entries?.find(e=>e.id===selectedId);
 const priced=Boolean(chosenEntry&&chosenEntry.decision_status==='accepted');
 const next=currentPhoto();
 preview.hidden=!priced||!owner;
 document.body.classList.toggle('rr-timing-priced-photo',priced&&owner);
 if(priced){
  const img=$('[data-redline-photo-id="'+selectedId+'"] .photo-image-btn img');
  if(img?.src&&img.src.startsWith('https://'))previewImg.src=img.src;
 }
 if(!running&&latest?.active&&!latest.active.running){
  note.textContent='Timer lease expired. Start again after the previous session is finalized.';
 }
 if(latest){
  total.textContent='Timed earned: '+money(latest.assigned_cents)+' · Owed: '+money(latest.owed_cents)+' · Recorded paid: '+money(latest.paid_cents);
  if(s.isOwner)renderHistory(s);
  if(!s.isOwner){
   senderPanel.replaceChildren(
    make('strong','','TIMED PHOTO EARNINGS'),
    make('p','',running?'Timer running · '+money(latest.active.rate_cents)+'/minute':
      'No timed photo currently running'),
    make('p','','Accrued '+money(latest.assigned_cents)+' · Owed '+money(latest.owed_cents)+' · Recorded paid '+money(latest.paid_cents)),
    make('small','','Recorded earnings only. Payment is handled separately.')
   );
  }
 }
}
async function refresh(force=false){
 const s=snap();
 if(!s||!room||room.hidden||!bridge()?.timerStatus){
  roomId=null;latest=null;render();return;
 }
 if(s.roomId!==roomId){
  roomId=s.roomId;selectedId=null;latest=null;lastHeartbeatAt=0;lastStatusAt=0;
  selectIncoming();
 }
 mount(s);
 if(fetching||!force&&Date.now()-lastStatusAt<12000)return;
 fetching=true;lastStatusAt=Date.now();
 try{
  latest=await bridge().timerStatus(roomId);
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
 window.addEventListener(evt,()=>void refresh(true));
}
window.setInterval(()=>{render();void pulse()},1000);
void refresh(true);
})();
