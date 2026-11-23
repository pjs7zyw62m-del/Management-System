/* BLACKCELL REDLINE / receiver-trigger approval panel.
   This is a visible direct route from the receiver command header;
   amounts, words and enabled state always come from the verified server. */
(()=>{
'use strict';
const api=()=>window.BLACKCELL_REDLINE_API;
const snap=()=>api()?.snapshot?.();
const el=(tag,cls,text)=>{
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);return n;
};
const money=c=>'$'+((Number(c)||0)/100).toFixed(2);
const owner=()=>{
 const s=snap();
 return s?.isOwner===true&&s?.roomId&&s.roomActive&&!s.archiveMode&&
  !document.querySelector('#ledgerApp')?.hidden&&
  !document.querySelector('#activeRoom')?.hidden?s:null;
};
const dialog=el('dialog','redline-trigger-owner-dialog');
dialog.id='redlineOwnerTriggerWordsDialog';
dialog.setAttribute('aria-label','Receiver trigger words approval and earnings');
const top=el('div','redline-trigger-owner-top');
const heading=el('div');
heading.append(el('small','redline-trigger-owner-kicker','BLACKCELL REDLINE · RECEIVER CONTROL'),
 el('h2','','⚡ TRIGGER WORDS'));
const exit=el('button','redline-trigger-owner-close','✕ CLOSE');
exit.type='button';exit.addEventListener('click',()=>dialog.close());
top.append(heading,exit);
const description=el('p','redline-trigger-owner-help',
 'The sender chooses up to 10 words priced $0.10–$0.25. Only your NEW outgoing chat messages can record a matched word credit. There is no cooldown between messages.');
const enabled=el('div','redline-trigger-owner-status','LOADING VERIFIED STATUS…');
enabled.setAttribute('role','status');
const wordTitle=el('div','redline-trigger-owner-row');
wordTitle.append(el('strong','','SENDER WORDS AND PRICES'));
const count=el('span','redline-trigger-owner-count');
wordTitle.append(count);
const list=el('div','redline-trigger-owner-list');
const totals=el('div','redline-trigger-owner-total');
const recent=el('div','redline-trigger-owner-recent');
const enable=el('button','redline-trigger-owner-action','LOADING…');
enable.type='button';enable.disabled=true;
const note=el('p','redline-trigger-owner-note',
 'One credit per receiver message, maximum $0.25 each and $5.00 per UTC day. No cooldown. Changes to the sender’s word list automatically switch this OFF until you approve again. This is a private ledger, not an automatic card charge.');
const feedback=el('p','redline-trigger-owner-feedback');
feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
dialog.append(top,description,enabled,wordTitle,list,totals,recent,enable,note,feedback);
document.body.append(dialog);
let busy=false,currentRoom=null,status=null,lastPoll=0;
function render(d){
 if(!dialog.open||!d||d.room_id!==owner()?.roomId)return;
 status=d;
 const words=Array.isArray(d.words)?d.words:[];
 enabled.textContent=d.enabled
  ?'● ENABLED · New qualifying messages can record credits.'
  :'○ DISABLED · No new trigger charges can be recorded.';
 enabled.classList.toggle('is-on',d.enabled===true);
 count.textContent=words.length+' / 10';
 list.replaceChildren();
 if(!words.length)list.append(el('p','redline-trigger-owner-empty',
  'No words configured yet. The sender must open Earnings → ⚡ Trigger Words and save a word and its price first.'));
 for(const w of words){
  const item=el('div','redline-trigger-owner-word');
  item.append(el('strong','',String(w.word||'').slice(0,24)),
   el('span','',money(w.price_cents)));
  list.append(item);
 }
 totals.replaceChildren();
 totals.append(el('span','','SESSION TRIGGER CREDITS'),
  el('strong','',money(d.session_total_cents||0)));
 recent.replaceChildren();
 const hits=Array.isArray(d.recent)?d.recent:[];
 if(hits.length){
  recent.append(el('h3','','RECENT VERIFIED CREDITS'));
  for(const h of hits.slice(0,5)){
   const row=el('div','redline-trigger-owner-word');
   row.append(el('span','','“'+String(h.word||'').slice(0,24)+'”'),
    el('strong','',money(h.price_cents)));
   recent.append(row);
  }
 }else recent.append(el('p','redline-trigger-owner-empty',
  'No credits yet. Send a NEW message containing one of the listed whole words while this switch is enabled.'));
 enable.disabled=busy||(words.length===0&&!d.enabled);
 enable.textContent=d.enabled?'DISABLE TRIGGER WORDS':'ENABLE TRIGGER WORDS';
 enable.classList.toggle('is-on',d.enabled===true);
 const button=document.querySelector('#redlineReceiverTriggerQuick');
 if(button)button.textContent='⚡ TRIGGER WORDS · '+(d.enabled?'ON':'OFF');
}
async function refresh(force=false){
 const o=owner();
 if(!o||!api()?.triggerWordStatus||busy)return;
 if(!force&&Date.now()-lastPoll<9000)return;
 const roomId=o.roomId;busy=true;lastPoll=Date.now();
 try{
  const result=await api().triggerWordStatus(roomId);
  if(!owner()||owner().roomId!==roomId)return;
  currentRoom=roomId;status=result;render(result);
  feedback.textContent='';
 }catch(e){
  if(dialog.open)feedback.textContent='Could not load trigger settings: '+String(e?.message||e).slice(0,180);
 }finally{busy=false;if(status)render(status)}
}
async function open(){
 const o=owner();
 if(!o)return;
 if(!dialog.open)try{dialog.showModal()}catch(e){return}
 if(currentRoom!==o.roomId){
  status=null;currentRoom=o.roomId;
  enabled.textContent='LOADING VERIFIED STATUS…';
  enable.disabled=true;list.replaceChildren();
 }
 feedback.textContent='Loading receiver permissions and saved words…';
 lastPoll=0;await refresh(true);
}
enable.addEventListener('click',async()=>{
 const o=owner();
 if(!o||busy||!status||!api()?.setRoomFeature)return;
 const turnOn=!status.enabled;
 if(turnOn&&!(status.words||[]).length){
  feedback.textContent='The sender must save a word before you can enable it.';
  return;
 }
 if(turnOn&&!window.confirm(
  'ENABLE TRIGGER WORDS FOR THIS ROOM?\n\n'+
  'The saved sender words and prices shown here will apply only to your future chat messages. '+
  'Each matching message can record one $0.10–$0.25 ledger credit. '+
  'No cooldown; $5/day cap. Turn OFF at any time. REDLINE does not transfer money automatically.'))return;
 busy=true;enable.disabled=true;feedback.textContent=turnOn?'Enabling room trigger words…':'Disabling room trigger words…';
 try{
  await api().setRoomFeature(o.roomId,'trigger_words_enabled',turnOn);
  busy=false;lastPoll=0;
  await refresh(true);
  feedback.textContent='Trigger Words '+(turnOn?'ENABLED':'DISABLED')+'.';
  window.dispatchEvent(new Event('blackcell:redline:trigger-words-changed'));
 }catch(e){
  feedback.textContent='Failed to update: '+String(e?.message||e).slice(0,160);
 }finally{busy=false;if(status)render(status)}
});
dialog.addEventListener('close',()=>{feedback.textContent=''});
window.addEventListener('blackcell:redline:open-trigger-owner',()=>{void open()});
window.addEventListener('blackcell:redline:reset',()=>{if(dialog.open)dialog.close();currentRoom=null;status=null});
window.addEventListener('blackcell:redline:trigger-words-changed',()=>{
 if(dialog.open)void refresh(true);
});
window.addEventListener('blackcell:redline:state',()=>{
 const o=owner();
 if(dialog.open&&(!o||o.roomId!==currentRoom))dialog.close();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dialog.open)void refresh(true)});
window.setInterval(()=>{if(dialog.open)void refresh()},9000);
})();
