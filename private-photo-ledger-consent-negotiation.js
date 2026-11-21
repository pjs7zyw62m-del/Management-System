/* REDLINE live room: opt-in timed requests + 3 counteroffer negotiation.
   All mutations use verified, room-scoped RPCs. Status and countdowns are
   server-authoritative; no payment or charges are created by this UI. */
(()=>{
'use strict';
const $=(q,root=document)=>root.querySelector(q);
const api=()=>window.BLACKCELL_REDLINE_API;
const snap=()=>api()?.snapshot?.()||null;
const make=(tag,cls,label)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(label!==undefined)el.textContent=label;return el;
};
const cash=c=>{
 try{const n=BigInt(String(c??0));return '$'+(n/100n).toLocaleString('en-US')+'.'+
  (n%100n).toString().padStart(2,'0');}catch{return '$0.00'}
};
const safeError=e=>String(e?.message||e||'Please retry.').slice(0,180);
const signedPhoto=id=>{
 const p=snap()?.photoHistory?.find(x=>x.id===id);
 return typeof p?.image_url==='string'&&p.image_url.startsWith('https://')?p.image_url:null;
};
const photoPreview=(parent,id)=>{
 const url=signedPhoto(id);
 if(url){const img=make('img','redline-consent-photo');
  img.src=url;img.alt='Private photograph being reviewed';
  img.loading='eager';img.addEventListener('error',()=>{img.hidden=true});
  parent.append(img);
 }else parent.append(make('p','redline-consent-muted',
  'Photo '+String(id||'').slice(0,8).toUpperCase()+' · Private preview not yet available.'));
};
function modal(aria){
 const dlg=make('dialog','redline-consent-dialog');
 dlg.setAttribute('aria-label',aria);document.body.append(dlg);return dlg;
}
function action(label,fn,cls=''){
 const b=make('button','redline-consent-action '+cls,label);
 b.type='button';b.addEventListener('click',fn);return b;
}
function openDialog(dlg){
 if(!dlg.open&&snap()&&!document.hidden){
  try{dlg.showModal()}catch(_){}
 }
}
const settingsButton=action('⚙ REDLINE SETTINGS',()=>openSettings(),'redline-settings-launch');
settingsButton.id='redlineConsentSettingsOpen';
const heading=$('#ledgerApp .page-heading');
if(heading)heading.append(settingsButton);
const settingsDlg=modal('REDLINE feature settings');
const settingsHead=make('div','redline-consent-heading');
settingsHead.append(make('h2','','REDLINE SETTINGS'),
 action('✕ CLOSE',()=>settingsDlg.close(),'redline-consent-close'));
const settingsInfo=make('p','redline-consent-muted');
const toggleList=make('div','redline-consent-toggles');
const settingsStatus=make('p','redline-consent-feedback');
settingsStatus.setAttribute('role','status');
settingsDlg.append(settingsHead,settingsInfo,toggleList,settingsStatus);
const timerDlg=modal('Incoming timed photograph consent request');
timerDlg.id='redlineSenderTimerApproval';
const negotiateDlg=modal('Private photograph price negotiation');
negotiateDlg.id='redlinePriceNegotiation';
let features=null,featureRoom=null,lastFeatureCheck=0,featureBusy=false;
let timerRoom=null,lastTimerCheck=0,timerBusy=false,timerResponseBusy=false;
let timerLatest=null,serverOffset=0,lastTimerDialogId=null,lastTimerStage=0;
const dispatched=new Set();
let negotiatingRoom=null,lastNegotiationCheck=0,negotiationBusy=false;
let negotiations=[],negotiatingShownKey=null,negotiationActionBusy=false;

function roomActive(){
 const s=snap();
 return Boolean(s?.roomId&&!s.archiveMode&&s.roomActive&&!$('#ledgerApp')?.hidden&&
  !$('#activeRoom')?.hidden);
}
function featureRow(name,description,key,value,owner){
 const row=make('label','redline-feature-row');
 const content=make('div','');
 content.append(make('strong','',name),make('small','',description));
 const toggle=make('input','redline-feature-toggle');
 toggle.type='checkbox';toggle.checked=value;
 toggle.disabled=featureBusy||!owner;
 toggle.dataset.feature=key;
 toggle.setAttribute('aria-label',name);
 toggle.addEventListener('change',async()=>{
  if(featureBusy)return;
  const s=snap(),requested=toggle.checked;
  if(key==='sender_auto_accept'&&requested&&!window.confirm(
   'Allow timer requests you do not answer within 30 seconds to be approved automatically?\n\n'+
   'The timer will start only while the receiver is actively using REDLINE. '+
   'You can turn this OFF at any time.')){toggle.checked=false;return;}
  featureBusy=true;toggle.disabled=true;
  settingsStatus.textContent='Saving '+name.toLowerCase()+'…';
  try{
   features=await api().setRoomFeature(s.roomId,key,requested);
   featureRoom=s.roomId;settingsStatus.textContent=name+(requested?' enabled.':' disabled.');
   refreshSettings();
   await pollTimer(true);await pollNegotiations(true);
  }catch(e){toggle.checked=!requested;settingsStatus.textContent=safeError(e)}
  finally{featureBusy=false;refreshSettings()}
 });
 row.append(content,toggle);return row;
}
function refreshSettings(){
 const s=snap();
 if(!s||!features||featureRoom!==s.roomId)return;
 toggleList.replaceChildren();
 if(s.isOwner){
  settingsInfo.textContent='Receiver controls: turn either feature ON or OFF independently. '+
   'OFF disables new requests; disabling negotiations finalizes pending negotiations at your original price.';
  toggleList.append(
   featureRow('Timer consent requests',
    'Require sender consent before starting a paid photo timer. OFF disables new timers.',
    'timer_requests_enabled',features.timer_requests_enabled,true),
   featureRow('Price negotiations',
    'Allow up to three sender counteroffers. OFF keeps your original price final.',
    'negotiation_enabled',features.negotiation_enabled,true));
 }else{
  settingsInfo.textContent='Sender controls: you may decline any timer request. '+
   'Automatic approval is optional and is OFF unless you explicitly turn it ON.';
  toggleList.append(featureRow('Auto-approve after 30 seconds',
   'Only when you opt in: unanswered timer requests become approved after 30 seconds. '+
   'Decline at any time before the countdown ends.',
   'sender_auto_accept',features.sender_auto_accept,true));
 }
}
async function openSettings(){
 const s=snap();if(!roomActive())return;
 settingsStatus.textContent='Loading room controls…';openDialog(settingsDlg);
 await pollFeatures(true);
 refreshSettings();
}
async function pollFeatures(force=false){
 const s=snap();if(!roomActive()||!api()?.roomFeatureStatus)return;
 if(featureBusy||(!force&&Date.now()-lastFeatureCheck<12000))return;
 lastFeatureCheck=Date.now();featureBusy=true;const id=s.roomId;
 try{
  const data=await api().roomFeatureStatus(id);
  if(snap()?.roomId!==id)return;
  features=data;featureRoom=id;
  if(settingsDlg.open)refreshSettings();
 }catch(e){if(settingsDlg.open)settingsStatus.textContent=safeError(e)}
 finally{featureBusy=false}
}
async function sendTimerResponse(id,accept){
 if(timerResponseBusy)return;
 timerResponseBusy=true;
 try{
  await api().timerRequestRespond(id,accept);
  timerDlg.close();lastTimerDialogId=null;
  await pollTimer(true);
 }catch(e){
  const msg=$('.redline-timer-response-error',timerDlg);
  if(msg)msg.textContent=safeError(e);
 }finally{timerResponseBusy=false}
}
function renderTimerRequest(q){
 const s=snap();if(!s||s.isOwner)return;
 const remaining=Math.max(0,Math.ceil((Date.parse(q.expires_at)-Date.now()-serverOffset)/1000));
 const stage=remaining>20?1:remaining>10?2:3;
 if(timerDlg.open&&lastTimerDialogId===q.id&&lastTimerStage===stage){
  const clock=$('.redline-timer-response-clock',timerDlg);
  if(clock)clock.textContent=remaining+'s';
  return;
 }
 lastTimerDialogId=q.id;lastTimerStage=stage;
 timerDlg.replaceChildren();
 const top=make('div','redline-consent-heading');
 top.append(make('h2','','TIMED PHOTO REQUEST'),
  make('strong','redline-timer-response-clock',remaining+'s'));
 timerDlg.append(top,make('p','redline-consent-warning',
   'THE RECEIVER WANTS TO START A PAID TIMER'),
  make('p','redline-consent-muted',
   'Rate: '+cash(q.rate_cents)+'/minute · '+remaining+' seconds remaining'));
 photoPreview(timerDlg,q.photo_id);
 timerDlg.append(make('p','redline-consent-warning',
  'DECLINE CHANCE '+stage+' OF 3 · Tap DECLINE at any point to stop this request.'));
 timerDlg.append(make('p','redline-consent-muted',
  'If you previously enabled automatic approval, silence at 30 seconds counts as approval. '+
  'Otherwise, no response expires without starting the timer.'));
 const row=make('div','redline-consent-actions');
 row.append(action('✕ DECLINE TIMER',()=>void sendTimerResponse(q.id,false),'redline-consent-no'),
 action('✓ ACCEPT TIMER',()=>void sendTimerResponse(q.id,true),'redline-consent-yes'));
 const error=make('p','redline-timer-response-error redline-consent-feedback');
 timerDlg.append(row,error);
 openDialog(timerDlg);
}
function displayTimerStatus(){
 const s=snap(),q=timerLatest?.request;
 if(!roomActive()||!q){
  if(timerDlg.open)timerDlg.close();
  lastTimerDialogId=null;return;
 }
 if(!s.isOwner&&q.status==='pending')renderTimerRequest(q);
 else if(timerDlg.open){timerDlg.close();lastTimerDialogId=null}
 if(s.isOwner&&q.status==='accepted'&&!dispatched.has(q.id)){
  dispatched.add(q.id);
  window.dispatchEvent(new CustomEvent('blackcell:redline:timer-consent-approved',{
   detail:{id:q.id,roomId:s.roomId,photoId:q.photo_id,rateCents:q.rate_cents}
  }));
 }
 const status=$('#redlinePhotoTimerPanel .rr-timer-note');
 if(s.isOwner&&status&&!$('#redlinePhotoTimerPanel')?.hidden){
  if(q.status==='pending')status.textContent='APPROVAL PENDING · '+Math.max(0,
   Math.ceil((Date.parse(q.expires_at)-Date.now()-serverOffset)/1000))+
   's remaining · Sender may decline at any time.';
  if(q.status==='declined')status.textContent='REQUEST DECLINED · Timer did not start.';
  if(q.status==='expired')status.textContent='REQUEST EXPIRED · No charge was started.';
  if(q.status==='cancelled')status.textContent='REQUEST CANCELLED · No charge was started.';
 }
}
async function pollTimer(force=false){
 const s=snap();
 if(!roomActive()||!api()?.timerRequestStatus)return;
 if(timerBusy||(!force&&Date.now()-lastTimerCheck<2600))return;
 timerBusy=true;lastTimerCheck=Date.now();const id=s.roomId;
 try{
  const data=await api().timerRequestStatus(id);
  if(snap()?.roomId!==id)return;
  timerRoom=id;timerLatest=data;serverOffset=Date.parse(data.server_now)-Date.now();
  displayTimerStatus();
 }catch(e){
  if(timerDlg.open){
   const err=$('.redline-timer-response-error',timerDlg);
   if(err)err.textContent='Connection issue: '+safeError(e);
  }
 }finally{timerBusy=false}
}
function parseCounter(value,original){
 const clean=String(value||'').trim().replace(/[$,]/g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(clean))throw Error('Enter a dollar amount, such as 5.00.');
 const [whole,decimal='']=clean.split('.');
 const cents=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
 if(cents<0n||cents>=BigInt(original))
  throw Error('Counteroffer must be lower than the original price.');
 if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Amount is too large.');
 return Number(cents);
}
async function actOnNegotiation(photoId,action,amount=null){
 if(negotiationActionBusy)return;
 negotiationActionBusy=true;
 const feedback=$('.redline-negotiation-feedback',negotiateDlg);
 if(feedback)feedback.textContent='Recording response…';
 try{
  await api().priceNegotiationAction(photoId,action,amount);
  negotiateDlg.close();negotiatingShownKey=null;
  await pollNegotiations(true);
  window.dispatchEvent(new Event('blackcell:redline:state'));
 }catch(e){if(feedback)feedback.textContent=safeError(e)}
 finally{negotiationActionBusy=false}
}
function renderNegotiation(offer){
 const s=snap(),key=offer.photo_id+':'+offer.status+':'+offer.offer_count;
 if(negotiationShownKey===key&&negotiateDlg.open)return;
 negotiatingShownKey=key;
 negotiateDlg.replaceChildren();
 const header=make('div','redline-consent-heading');
 header.append(make('h2','','PRICE NEGOTIATION'),
  make('span','redline-consent-counter',offer.offer_count+'/3 COUNTEROFFERS'));
 negotiateDlg.append(header);
 photoPreview(negotiateDlg,offer.photo_id);
 negotiateDlg.append(make('p','redline-consent-warning',
  'RECEIVER ORIGINAL PRICE · '+cash(offer.original_cents)));
 const actions=make('div','redline-consent-actions');
 if(!s.isOwner){
  negotiateDlg.append(make('p','redline-consent-muted',
   'You may accept the original price or submit a lower counteroffer. '+
   'The receiver may reject each counteroffer. After the third rejected offer, '+
   'their original price is final.'));
  const input=make('input','redline-consent-amount');input.inputMode='decimal';
  input.placeholder='Your counteroffer in USD (e.g. 1.50)';
  input.setAttribute('aria-label','Your lower counteroffer amount in dollars');
  input.addEventListener('input',()=>{if(input.value.startsWith('.'))input.value='0'+input.value;});
  negotiateDlg.append(input);
  actions.append(action('ACCEPT ORIGINAL PRICE',()=>void actOnNegotiation(offer.photo_id,'accept_original'),'redline-consent-yes'),
   action('SEND COUNTEROFFER',()=>{
    try{void actOnNegotiation(offer.photo_id,'counter',parseCounter(input.value,offer.original_cents))}
    catch(e){const el=$('.redline-negotiation-feedback',negotiateDlg);if(el)el.textContent=safeError(e)}
   },'redline-consent-no'));
 }else{
  negotiateDlg.append(make('p','redline-consent-muted',
   'The sender proposes '+cash(offer.offer_cents)+
   '. You can accept it, reject it, or finish at your original price.'));
  actions.append(action('ACCEPT '+cash(offer.offer_cents),
    ()=>void actOnNegotiation(offer.photo_id,'accept_counter'),'redline-consent-yes'),
   action(offer.offer_count>=3?'REJECT · YOUR PRICE FINAL':'REJECT COUNTER',
    ()=>void actOnNegotiation(offer.photo_id,'reject_counter'),'redline-consent-no'),
   action('KEEP MY ORIGINAL PRICE',
    ()=>void actOnNegotiation(offer.photo_id,'finalize_original'),'redline-consent-neutral'));
 }
 negotiateDlg.append(actions,make('p','redline-negotiation-feedback redline-consent-feedback'));
 openDialog(negotiateDlg);
}
async function pollNegotiations(force=false){
 const s=snap();
 if(!roomActive()||!api()?.priceNegotiationStatus)return;
 if(negotiationBusy||(!force&&Date.now()-lastNegotiationCheck<3400))return;
 negotiationBusy=true;lastNegotiationCheck=Date.now();const id=s.roomId;
 try{
  const data=await api().priceNegotiationStatus(id);
  if(snap()?.roomId!==id)return;
  negotiatingRoom=id;negotiations=Array.isArray(data.offers)?data.offers:[];
  const pending=negotiations.find(n=>n.status===(s.isOwner?'awaiting_owner':'awaiting_sender'));
  if(data.enabled&&pending&&!timerDlg.open&&!settingsDlg.open)renderNegotiation(pending);
  else if(!pending&&negotiateDlg.open){negotiateDlg.close();negotiatingShownKey=null}
 }catch(e){const el=$('.redline-negotiation-feedback',negotiateDlg);if(el)el.textContent=safeError(e)}
 finally{negotiationBusy=false}
}
function resetIfRoomChanged(){
 const id=roomActive()?snap()?.roomId:null;
 if(id===timerRoom&&id===negotiatingRoom&&id===featureRoom)return;
 timerLatest=null;timerRoom=id;negotiations=[];negotiatingRoom=id;
 features=null;featureRoom=id;lastFeatureCheck=0;
 lastTimerCheck=0;lastNegotiationCheck=0;lastTimerDialogId=null;
 negotiatingShownKey=null;lastTimerStage=0;dispatched.clear();
 if(timerDlg.open)timerDlg.close();
 if(negotiateDlg.open)negotiateDlg.close();
 if(settingsDlg.open)settingsDlg.close();
}
function tick(){
 resetIfRoomChanged();
 if(!roomActive())return;
 displayTimerStatus();
 void pollTimer();void pollFeatures();void pollNegotiations();
}
window.addEventListener('blackcell:redline:photo-decided',()=>{void pollNegotiations(true)});
window.addEventListener('blackcell:redline:negotiation-changed',()=>{void pollNegotiations(true)});
window.addEventListener('blackcell:redline:bridge',tick);
window.addEventListener('blackcell:redline:state',tick);
window.addEventListener('blackcell:redline:reset',tick);
window.addEventListener('pageshow',tick);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
window.setInterval(tick,1000);
tick();
})();