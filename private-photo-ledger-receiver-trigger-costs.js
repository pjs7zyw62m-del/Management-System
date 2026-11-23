/* BLACKCELL REDLINE receiver trigger costs (verified, read-only UI).
 * Persistent header cost only; no intrusive per-credit popup.
 * The payment balance comes from the existing authenticated server RPC.
 * No DOM writes within chat; no self-charging or speculative billing. */
(()=>{
 'use strict';
 const api=()=>window.BLACKCELL_REDLINE_API;
 const snap=()=>api()?.snapshot?.();
 const make=(tag,cls,value)=>{
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(value!==undefined)e.textContent=String(value);
  return e;
 };
 const money=v=>'$'+((Number(v)||0)/100).toFixed(2);
 const active=()=>{
  const s=snap();
  if(!s?.isOwner||!s.roomActive||!s.roomId||s.archiveMode||document.hidden||
   document.querySelector('#ledgerApp')?.hidden||
   document.querySelector('#activeRoom')?.hidden)return null;
  return s;
 };
 const strip=make('section','redline-receiver-trigger-costs');
 strip.id='redlineReceiverTriggerCost';
 strip.setAttribute('aria-label','Trigger Word costs added to your private REDLINE ledger');
 const label=make('span','redline-receiver-trigger-label','⚡ TRIGGER WORD COSTS');
 const total=make('strong','redline-receiver-trigger-total','$0.00');
 const recent=make('span','redline-receiver-trigger-recent','No trigger credits recorded this session');
 strip.append(label,total,recent);
 strip.addEventListener('click',()=>window.dispatchEvent(
  new Event('blackcell:redline:open-trigger-owner')));
 strip.setAttribute('role','button');
 strip.setAttribute('tabindex','0');
 strip.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){
   e.preventDefault();window.dispatchEvent(new Event('blackcell:redline:open-trigger-owner'));
  }
 });
 let room=null,ready=false,seen=new Set(),lastPoll=0,inFlight=false;
 const idOf=h=>String(h.recorded_at||'')+'|'+String(h.word||'')+'|'+String(h.price_cents||0);
 function clearRoom(next){
  room=next;ready=false;seen.clear();lastPoll=0;
  strip.remove();
 }
 function putInHeader(){
  const header=document.querySelector('#redlineReceiverCommand .rr-command-header');
  if(!header)return;
  if(strip.parentNode!==header)header.append(strip);
 }
 function render(data){
  putInHeader();
  const cents=Number(data.session_total_cents)||0;
  total.textContent=money(cents);
  const hits=Array.isArray(data.recent)?data.recent:[];
  recent.textContent=hits.length
   ?'Latest: “'+String(hits[0].word||'').slice(0,24)+'” +'+money(hits[0].price_cents)
   :'No trigger credits recorded this session';
 }
 async function poll(force=false){
  const current=active();
  if(!current){if(room!==null)clearRoom(null);return}
  if(room!==current.roomId)clearRoom(current.roomId);
  putInHeader();
  if(inFlight||!api()?.triggerWordStatus||
   (!force&&Date.now()-lastPoll<5000))return;
  inFlight=true;lastPoll=Date.now();const id=current.roomId;
  try{
   const result=await api().triggerWordStatus(id);
   if(active()?.roomId!==id||result?.ok!==true)return;
   render(result);
   const hits=Array.isArray(result.recent)?result.recent:[];
   if(!ready){
    // On first load show past earnings in strip but never replay old popups.
    for(const hit of hits)seen.add(idOf(hit));
    ready=true;
   }else{
    const news=[];
    for(const hit of hits){
     const key=idOf(hit);
     if(seen.has(key))continue;
     seen.add(key);
     if(Number(hit.price_cents)>=10&&Number(hit.price_cents)<=25)news.push(hit);
    }
    if(news.length){
     // Update the recorded balance silently; the original chat bubble
     // already displays the matched word with FEE/EARNED on each side.
     try{await api()?.roomPaymentStatus?.(id,false)}catch(_){}
    }
   }
   if(seen.size>200)seen=new Set([...seen].slice(-120));
  }catch(_){
   if(strip.isConnected)recent.textContent='Trigger cost status unavailable · Tap to inspect';
  }finally{inFlight=false}
 }
 window.addEventListener('blackcell:redline:owner-chat-sent',()=>{void poll(true)});
 window.addEventListener('blackcell:redline:state',()=>{void poll()});
 window.addEventListener('blackcell:redline:bridge',()=>{void poll(true)});
 window.addEventListener('blackcell:redline:reset',()=>clearRoom(null));
 window.addEventListener('pageshow',()=>{void poll(true)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll(true)});
 window.setInterval(()=>{void poll()},5000);
 void poll();
 window.BLACKCELL_REDLINE_RECEIVER_TRIGGER_COSTS=Object.freeze({refresh:()=>poll(true)});
})();