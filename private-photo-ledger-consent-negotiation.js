/* REDLINE live room: owner-selected instant timers + optional sender stop + 3 counteroffer negotiation.
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
 return typeof p?.image_url==='string'&&(p.image_url.startsWith('https://')||p.image_url.startsWith('blob:'))?p.image_url:null;
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
const mountSettingsButton=()=>{
 // The receiver redesign hides .page-heading, so the old gear was invisible.
 // Keep one persistent owner button inside the VISIBLE receiver header.
 const receiverHeader=$('#redlineReceiverCommand .rr-command-header');
 const host=receiverHeader||heading;
 if(host&&settingsButton.parentNode!==host)host.append(settingsButton);
};
mountSettingsButton();
settingsButton.hidden=true;
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
let negotiations=[],negotiatingShownKey=null,negotiationActionBusy=false,negotiationRefreshQueued=false;

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
   await pollNegotiations(true);
  }catch(e){toggle.checked=!requested;settingsStatus.textContent=safeError(e)}
  finally{featureBusy=false;refreshSettings()}
 });
 row.append(content,toggle);return row;
}
function refreshSettings(){
 const s=snap();
 if(!s||!features||featureRoom!==s.roomId)return;
 toggleList.replaceChildren();
 settingsButton.hidden=!s.isOwner;
 if(!s.isOwner)return;
 settingsInfo.textContent='Owner controls · START TIMER starts immediately, without sender acceptance. '+
  'You can enable a 10-second NO response before your first two STOP attempts; '+
  'the third STOP ends the timer. Existing Decline & Stop remains a separate option. '+
  'Any time already elapsed stays in the private ledger.';
 toggleList.append(
  featureRow('Allow sender to say NO when you press STOP',
   'ON: sender has 10 seconds on the first two STOP attempts. NO continues the timer. '+
   'No response stops it; your third STOP is final. OFF: your STOP is immediate.',
   'sender_can_veto_stop_timer',features.sender_can_veto_stop_timer!==false,true),
  featureRow('Allow sender to decline and stop timer',
   'OFF: only you can stop. ON: the sender may immediately stop an active timer from REDLINE.',
   'sender_can_stop_timer',features.sender_can_stop_timer===true,true),
  featureRow('Price negotiations',
   'Allow up to three sender counteroffers above or below your original price. OFF keeps it final.',
   'negotiation_enabled',features.negotiation_enabled,true));
}
async function openSettings(){
 const s=snap();if(!roomActive()||!s.isOwner)return;
 settingsStatus.textContent='Loading owner room controls…';openDialog(settingsDlg);
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
// Timers now start immediately when the owner presses START.
 // The legacy 30-second approval popup is intentionally not displayed.
function displayTimerStatus(){
 if(timerDlg.open)timerDlg.close();
 lastTimerDialogId=null;
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
 if(cents===BigInt(original))
  throw Error('Enter a counteroffer above or below the original price.');
 if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Amount is too large.');
 return Number(cents);
}
function parseFinalAmount(value){
 const clean=String(value||'').trim().replace(/[$,]/g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(clean))throw Error('Enter a valid price in dollars, such as 12.50.');
 const [whole,decimal='']=clean.split('.');
 const cents=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
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
 if(negotiatingShownKey===key&&negotiateDlg.open)return;
 negotiatingShownKey=key;
 negotiateDlg.classList.add('redline-negotiation-ui');
 negotiateDlg.replaceChildren();
 const heading=make('div','redline-negotiation-heading');
 const brand=make('div','redline-negotiation-brand');
 brand.append(make('small','','BLACKCELL / PRIVATE AGREEMENT'),
  make('h2','','PRICE NEGOTIATION'));
 heading.append(brand,make('span','redline-negotiation-progress',
  offer.offer_count+' OF 3 · COUNTEROFFERS'));
 negotiateDlg.append(heading);
 const comparison=make('div','redline-negotiation-prices');
 const priceCard=(label,amount,cls)=>{
  const card=make('div','redline-negotiation-price '+cls);
  card.append(make('span','',label),make('strong','',cash(amount)));
  return card;
 };
 comparison.append(priceCard(s.isOwner?'YOUR ORIGINAL PRICE':'RECEIVER ORIGINAL PRICE',offer.original_cents,'is-original'));
 if(offer.status==='awaiting_owner'){
  comparison.append(priceCard('SENDER COUNTEROFFER',offer.offer_cents,'is-proposed'));
 }else if(offer.status==='awaiting_sender_owner'){
  comparison.append(priceCard('RECEIVER CUSTOM OFFER',offer.owner_offer_cents,'is-proposed'));
 }
 negotiateDlg.append(comparison);
 if(signedPhoto(offer.photo_id)){
  const visual=make('div','redline-negotiation-photo');
  photoPreview(visual,offer.photo_id);
  negotiateDlg.append(visual);
 }
 const actions=make('div','redline-negotiation-actions redline-consent-actions');
 if(!s.isOwner){
  const ownerReply=offer.status==='awaiting_sender_owner';
  negotiateDlg.append(make('p','redline-negotiation-explain',
   ownerReply
    ?'The receiver has sent a custom counteroffer of '+cash(offer.owner_offer_cents)+
     '. Your approval is required before that price is final. You can accept, decline, or counter again if you have attempts left.'
    :'Accept the original amount, or propose any higher or lower price. '+
     'The receiver makes the final decision. Up to three counteroffers are permitted.'));
  if(ownerReply){
   actions.append(action('ACCEPT '+cash(offer.owner_offer_cents),
     ()=>void actOnNegotiation(offer.photo_id,'accept_owner_offer'),'redline-negotiation-primary'),
    action('DECLINE OWNER OFFER',
     ()=>void actOnNegotiation(offer.photo_id,'reject_owner_offer'),'redline-negotiation-tertiary'),
    action('ACCEPT ORIGINAL '+cash(offer.original_cents),
     ()=>void actOnNegotiation(offer.photo_id,'accept_original'),'redline-negotiation-secondary'));
  }else{
   actions.append(action('ACCEPT ORIGINAL PRICE',
     ()=>void actOnNegotiation(offer.photo_id,'accept_original'),'redline-negotiation-secondary'));
  }
  if(offer.offer_count<3){
   const field=make('label','redline-negotiation-field');
   field.append(make('span','',ownerReply?'SEND ANOTHER COUNTEROFFER · USD':'YOUR COUNTEROFFER · USD'));
   const input=make('input','redline-consent-amount');
   input.type='text';input.inputMode='decimal';input.autocomplete='off';
   input.placeholder='Enter your proposed price';
   input.setAttribute('aria-label','Your counteroffer amount in dollars, higher or lower');
   field.append(input);negotiateDlg.append(field);
   actions.append(action('SEND COUNTEROFFER',()=>{
    try{
     const amount=parseCounter(input.value,offer.original_cents);
     if(ownerReply&&amount===Number(offer.owner_offer_cents))
      throw Error('Choose a different amount or accept the receiver’s offer.');
     void actOnNegotiation(offer.photo_id,'counter',amount);
    }catch(e){const el=$('.redline-negotiation-feedback',negotiateDlg);if(el)el.textContent=safeError(e)}
   },'redline-negotiation-primary'));
  }
 }else{
  negotiateDlg.append(make('p','redline-negotiation-explain',
   'Accept the sender’s price, keep your original, or send a custom counteroffer '+
   'back to the sender. Your proposed amount requires their response before it is final.'));
  actions.append(action('ACCEPT '+cash(offer.offer_cents),
   ()=>void actOnNegotiation(offer.photo_id,'accept_counter'),'redline-negotiation-primary'),
   action('KEEP MY ORIGINAL PRICE',()=>void actOnNegotiation(offer.photo_id,'finalize_original'),
   'redline-negotiation-secondary'),
   action(offer.offer_count>=3?'REJECT · YOUR PRICE FINAL':'REJECT COUNTER',
   ()=>void actOnNegotiation(offer.photo_id,'reject_counter'),'redline-negotiation-tertiary'));
 }
 negotiateDlg.append(actions);
 if(s.isOwner){
  const editor=make('div','redline-negotiation-custom');
  editor.append(make('h3','','SEND YOUR CUSTOM COUNTEROFFER'));
  editor.append(make('p','',
   'Enter the amount you want to offer. The sender will receive it and can accept, decline, '+
   'or counter again if attempts remain. The price is not finalized yet.'));
  const row=make('div','redline-negotiation-custom-row');
  const input=make('input','redline-consent-amount');
  input.type='text';input.inputMode='decimal';input.autocomplete='off';
  input.placeholder='Your counteroffer · USD';
  input.setAttribute('aria-label','Your custom counteroffer in US dollars sent to the sender');
  input.addEventListener('keydown',event=>{
   if(event.key==='Enter'){
    event.preventDefault();
    try{void actOnNegotiation(offer.photo_id,'set_owner_price',parseFinalAmount(input.value))}
    catch(e){const el=$('.redline-negotiation-feedback',negotiateDlg);if(el)el.textContent=safeError(e)}
   }
  });
  const save=action('SEND TO SENDER',()=>{
   try{void actOnNegotiation(offer.photo_id,'set_owner_price',parseFinalAmount(input.value))}
   catch(e){const el=$('.redline-negotiation-feedback',negotiateDlg);if(el)el.textContent=safeError(e)}
  },'redline-negotiation-primary');
  row.append(input,save);editor.append(row);negotiateDlg.append(editor);
 }
 const feedback=make('p','redline-negotiation-feedback redline-consent-feedback');
 feedback.setAttribute('role','status');negotiateDlg.append(feedback);
 openDialog(negotiateDlg);
}
async function pollNegotiations(force=false){
 const s=snap();
 if(!roomActive()||!api()?.priceNegotiationStatus)return;
 if(negotiationBusy){if(force)negotiationRefreshQueued=true;return;}
 if(!force&&Date.now()-lastNegotiationCheck<3400)return;
 negotiationBusy=true;lastNegotiationCheck=Date.now();const id=s.roomId;
 try{
  const data=await api().priceNegotiationStatus(id);
  if(snap()?.roomId!==id)return;
  negotiatingRoom=id;negotiations=Array.isArray(data.offers)?data.offers:[];
  const pending=s.isOwner
   ?negotiations.find(n=>n.status==='awaiting_owner')
   :(negotiations.find(n=>n.status==='awaiting_sender_owner')||
     negotiations.find(n=>n.status==='awaiting_sender'));
  if(data.enabled&&pending&&!timerDlg.open&&!settingsDlg.open)renderNegotiation(pending);
  else if(!pending&&negotiateDlg.open){negotiateDlg.close();negotiatingShownKey=null}
 }catch(e){
  const el=$('.redline-negotiation-feedback',negotiateDlg);
  if(el)el.textContent=safeError(e);
 }
 finally{
  negotiationBusy=false;
  if(negotiationRefreshQueued){negotiationRefreshQueued=false;void pollNegotiations(true)}
 }
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
 mountSettingsButton();
 const active=roomActive(),owner=active&&snap()?.isOwner===true;
 settingsButton.hidden=!owner;
 if(!active)return;
 void pollFeatures();void pollNegotiations();
}
window.addEventListener('blackcell:redline:open-settings',()=>{
 if(roomActive()&&snap()?.isOwner===true)void openSettings();
});
window.addEventListener('blackcell:redline:photo-decided',()=>{void pollNegotiations(true)});
window.addEventListener('blackcell:redline:negotiation-changed',()=>{void pollNegotiations(true)});
settingsDlg.addEventListener('close',()=>{void pollNegotiations(true)});
window.addEventListener('blackcell:redline:bridge',tick);
window.addEventListener('blackcell:redline:state',tick);
window.addEventListener('blackcell:redline:reset',tick);
window.addEventListener('pageshow',tick);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
window.setInterval(tick,1000);
tick();
})();