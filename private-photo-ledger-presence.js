/* BLACKCELL REDLINE presence: only the other verified member of this
   private room, not their activity anywhere else in BLACKCELL OS. */
(()=>{
'use strict';
const $=(q)=>document.querySelector(q);
const app=$('#ledgerApp'),room=$('#activeRoom'),header=$('.redline-message-header');
if(!app||!room||!header)return;
const indicator=document.createElement('span');
indicator.className='redline-peer-presence';
indicator.dataset.state='checking';
indicator.setAttribute('role','status');
indicator.setAttribute('aria-live','polite');
header.append(indicator);

const sessionId=globalThis.crypto?.randomUUID?.()||null;
const HEARTBEAT_MS=40000;
const STATUS_MS=25000;
let activeRoom=null,lastHeartbeat=0,lastStatus=0;
let heartbeating=false,checking=false;
const bridge=()=>window.BLACKCELL_REDLINE_API;
const current=()=>{
 const snap=bridge()?.snapshot?.();
 return snap&&!app.hidden&&!room.hidden&&!document.hidden&&snap.roomActive?snap:null;
};
function display(state,label,lastActive){
 indicator.dataset.state=state;
 indicator.textContent=label;
 indicator.title=state==='online'?'Currently active in this private REDLINE room':
 state==='offline'?'Not currently active in this private REDLINE room'+(lastActive?' · Last activity: '+new Date(lastActive).toLocaleString():''):
 state==='checking'?'Checking private room presence':'Presence could not be verified';
}
function peer(snap){
 return (snap?.peerName?.trim()||(snap?.isOwner?'Sender':'Owner')).slice(0,60);
}
function leave(){
 const oldRoom=activeRoom;
 activeRoom=null;lastHeartbeat=0;lastStatus=0;
 if(oldRoom&&sessionId)void bridge()?.presenceTouch?.(oldRoom,sessionId,false).catch(()=>{});
}
async function tick(){
 const snap=current();
 if(!snap||!sessionId||!bridge()?.presenceTouch||!bridge()?.presenceStatus){
  if(activeRoom)leave();
  display('unavailable',sessionId?'STATUS UNAVAILABLE':'STATUS UNAVAILABLE');
  return;
 }
 const roomId=snap.roomId;
 if(roomId!==activeRoom){
  if(activeRoom)leave();
  activeRoom=roomId;
  lastHeartbeat=0;lastStatus=0;
  display('checking',peer(snap)+' · CHECKING');
 }
 const now=Date.now();
 if(!heartbeating&&now-lastHeartbeat>=HEARTBEAT_MS){
  heartbeating=true;lastHeartbeat=now;
  try{await bridge().presenceTouch(roomId,sessionId,true)}
  catch(error){
   if(current()?.roomId===roomId)display('unavailable',peer(snap)+' · STATUS UNAVAILABLE');
  }finally{heartbeating=false}
 }
 if(!checking&&Date.now()-lastStatus>=STATUS_MS){
  checking=true;lastStatus=Date.now();
  try{
   const result=await bridge().presenceStatus(roomId);
   if(activeRoom!==roomId||current()?.roomId!==roomId)return;
   display(result.online?'online':'offline',peer(snap)+(result.online?' · ONLINE':' · OFFLINE'),result.lastActiveAt);
  }catch(error){
   if(activeRoom===roomId&&current()?.roomId===roomId)display('unavailable',peer(snap)+' · STATUS UNAVAILABLE');
  }finally{checking=false}
 }
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  leave();
  display('unavailable','STATUS PAUSED');
 }else void tick();
});
window.addEventListener('pagehide',leave);
for(const event of ['blackcell:redline:bridge','blackcell:redline:state',
 'blackcell:redline:session-mode','blackcell:redline:reset','pageshow']){
 window.addEventListener(event,()=>void tick());
}
new MutationObserver(()=>void tick()).observe(app,{attributes:true,attributeFilter:['hidden']});
new MutationObserver(()=>void tick()).observe(room,{attributes:true,attributeFilter:['hidden']});
window.setInterval(()=>void tick(),15000);
void tick();
})();
