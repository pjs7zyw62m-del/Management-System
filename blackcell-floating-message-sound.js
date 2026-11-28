/* Same short two-note alert as BLACKCELL OS, for the standalone floating launcher.
   Audio activation and preferences remain browser-controlled. */
export function createFloatingMessageSound(){
 const key='bc.os.system-sounds.v1';
 let context=null,disposed=false,last=-Infinity;
 const events=['pointerdown','pointerup','touchend','keydown'];
 function preference(){
  try{const p=JSON.parse(localStorage.getItem(key)||'null');return {enabled:typeof p?.enabled==='boolean'?p.enabled:localStorage.getItem('bcLandingMuted')!=='1',volume:Number.isFinite(p?.volume)?Math.max(0,Math.min(1,p.volume)):.35}}catch(_){return {enabled:true,volume:.35}}
 }
 function activate(event){
  if(disposed||!event.isTrusted||document.hidden||window.BLACKCELL_SYSTEM_SOUNDS)return;
  const p=preference();if(!p.enabled||!p.volume)return;
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;context ||= new C();if(context.state!=='running')void context.resume().catch(()=>{})}catch(_){}
 }
 for(const type of events)document.addEventListener(type,activate,{capture:true,passive:true});
 function play(kind='message'){
  if(disposed||(document.hidden&&!['callring','ringback'].includes(kind)))return false;
  const p=preference();if(!p.enabled||!p.volume)return false;
  if(window.BLACKCELL_SYSTEM_SOUNDS)return window.BLACKCELL_SYSTEM_SOUNDS.play(kind);
  if(context?.state!=='running')return false;
  const now=context.currentTime;if(now-last<.35)return false;last=now;
  const tones=kind==='callring'?[[440,0,.28,.65],[659.25,.12,.28,.4],[440,.48,.28,.65],[659.25,.60,.28,.4]]:kind==='ringback'?[[440,0,.65,.4],[480,0,.65,.4]]:[[880,0,.15,.85],[1174.66,.105,.24,.70]];
  try{for(const [frequency,delay,duration,level] of tones){
   const start=now+.008+delay,end=start+duration,osc=context.createOscillator(),gain=context.createGain();
   osc.type='sine';osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level*p.volume*.16),start+.012);gain.gain.exponentialRampToValueAtTime(.0001,end);
   osc.connect(gain);gain.connect(context.destination);osc.onended=()=>{osc.disconnect();gain.disconnect()};osc.start(start);osc.stop(end+.018);
  }return true}catch(_){return false}
 }
 return {play,dispose(){disposed=true;for(const type of events)document.removeEventListener(type,activate,true);try{void context?.close().catch(()=>{})}catch(_){}}};
}
