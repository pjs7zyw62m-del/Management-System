/* BLACKCELL REDLINE — sender trigger credits, real Android popup.
   Authoritative source: corp_redline_trigger_status room-scoped RPC.
   Never derive or award money in browser; never mutate chat or scroll position. */
(()=>{
'use strict';
const api=()=>window.BLACKCELL_REDLINE_API;
const snapshot=()=>api()?.snapshot?.();
const make=(tag,cls,copy)=>{
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(copy!==undefined)n.textContent=copy;return n;
};
const money=v=>'$'+((Number(v)||0)/100).toFixed(2);
const veil=make('div','redline-trigger-earned-overlay');
veil.hidden=true;veil.setAttribute('role','dialog');
veil.setAttribute('aria-modal','true');
veil.setAttribute('aria-label','REDLINE trigger word credit recorded');
const card=make('section','redline-trigger-earned-card');
const close=make('button','redline-trigger-earned-close','×');
close.type='button';close.setAttribute('aria-label','Close trigger notification');
const eyebrow=make('small','redline-trigger-earned-eyebrow','BLACKCELL REDLINE · TRIGGER WORDS');
const symbol=make('div','redline-trigger-earned-symbol','⚡');
const headline=make('h2','redline-trigger-earned-title','TRIGGER ACTIVATED');
const amount=make('strong','redline-trigger-earned-amount');
const word=make('p','redline-trigger-earned-word');
const summary=make('p','redline-trigger-earned-summary');
const details=make('p','redline-trigger-earned-details','Recorded in your private REDLINE ledger.');
const dismiss=make('button','redline-trigger-earned-dismiss','CONTINUE REDLINE');
dismiss.type='button';
const confetti=make('div','redline-trigger-earned-confetti');confetti.setAttribute('aria-hidden','true');
card.append(close,eyebrow,symbol,headline,amount,word,summary,details,dismiss);
veil.append(confetti,card);document.body.append(veil);
let roomId=null,lastPoll=0,busy=false,ready=false,closing=null;
let seen=new Set(),queue=[],shownKey=null,hasTriggerSetup=false;
function active(){
 const s=snapshot();
 return s?.roomId&&!s.isOwner&&s.roomActive&&!s.archiveMode&&
  !document.hidden&&!document.getElementById('ledgerApp')?.hidden&&
  !document.getElementById('activeRoom')?.hidden?s:null;
}
function keyOf(h){
 return String(h.recorded_at||'')+'|'+String(h.word||'')+'|'+String(h.price_cents||0);
}
function clearTimer(){if(closing!==null){clearTimeout(closing);closing=null}}
function hide(){
 clearTimer();veil.hidden=true;confetti.replaceChildren();shownKey=null;
 if(queue.length&&active())showNext();
}
close.addEventListener('click',hide);dismiss.addEventListener('click',hide);
veil.addEventListener('click',e=>{if(e.target===veil)hide()});
document.addEventListener('keydown',e=>{if(!veil.hidden&&e.key==='Escape'){e.preventDefault();hide()}});
function showNext(){
 if(!veil.hidden||!queue.length||!active())return;
 const event=queue.shift();shownKey=keyOf(event);
 amount.textContent='+'+money(event.price_cents);
 word.textContent='“'+String(event.word||'').slice(0,24)+'” · Qualified match';
 summary.textContent='Trigger credit recorded. Your sender earnings have increased.';
 confetti.replaceChildren();
 for(let i=0;i<18;i++){
  const piece=make('i','redline-trigger-earned-piece');
  piece.style.setProperty('--i',String(i));
  piece.style.setProperty('--x',String((i*37)%100)+'%');
  piece.style.setProperty('--delay',String((i*29)%250)+'ms');
  confetti.append(piece);
 }
 veil.hidden=false;clearTimer();
 closing=setTimeout(()=>hide(),7000);
}
function resetRoom(id){
 roomId=id;lastPoll=0;ready=false;seen.clear();queue=[];
 clearTimer();veil.hidden=true;confetti.replaceChildren();shownKey=null;
}
async function poll(force=false){
 const s=active();
 if(!s||!api()?.triggerWordStatus){if(!s&&roomId)resetRoom(null);return}
 if(roomId!==s.roomId)resetRoom(s.roomId);
 const now=Date.now();
 if(busy||(!force&&now-lastPoll<4500))return;
 busy=true;lastPoll=now;const target=s.roomId;
 try{
  const response=await api().triggerWordStatus(target);
  const latest=active();
  if(latest?.roomId!==target||response?.ok!==true)return;
  const hits=Array.isArray(response.recent)?response.recent:[];
  if(!ready){
   // Initial sync establishes the current ledger baseline. Old credits do
   // not replay on page reload, room changes, or an Android tab returning.
   ready=true;for(const hit of hits)seen.add(keyOf(hit));
   return;
  }
  const newer=[];
  for(const hit of hits){
   const id=keyOf(hit);
   if(seen.has(id))continue;
   seen.add(id);
   if(response.enabled&&Number(hit.price_cents)>=10&&Number(hit.price_cents)<=25)
    newer.push(hit);
  }
  if(seen.size>250)seen=new Set([...seen].slice(-150));
  // The server returns newest first; play genuine new credits oldest first.
  if(newer.length){
   queue.push(...newer.reverse().slice(0,5));
   showNext();
   window.dispatchEvent(new Event('blackcell:redline:trigger-words-changed'));
  }
 }catch(_){
  // A transient RPC/network failure must not create a guessed payout.
 }finally{busy=false}
}
function tick(){
 const s=active();
 if(!s){if(roomId)resetRoom(null);return}
 if(s.roomId!==roomId)resetRoom(s.roomId);
 void poll();
}
window.addEventListener('blackcell:redline:bridge',tick);
window.addEventListener('blackcell:redline:state',tick);
window.addEventListener('blackcell:redline:reset',()=>resetRoom(null));
window.addEventListener('pageshow',()=>{void poll(true)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll(true)});
window.setInterval(tick,4500);
tick();
window.BLACKCELL_REDLINE_TRIGGER_ALERTS=Object.freeze({check:()=>poll(true)});
})();