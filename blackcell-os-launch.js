(()=>{'use strict';
const KEY='bc.os.fresh-launch.v1',SRC='blackcell-os-launch-david.mp3?v=20261125-os-launch1',MARK=2.798095,DURATION=4.75425;
const audio=new Audio(SRC);audio.preload='auto';audio.playbackRate=1;
function consume(){try{const t=Number(sessionStorage.getItem(KEY));sessionStorage.removeItem(KEY);return t>0&&Date.now()-t>=0&&Date.now()-t<180000}catch{return false}}
function consumePlayed(){try{const k='bc.os.launch-audio-played.v1',t=Number(sessionStorage.getItem(k));sessionStorage.removeItem(k);return t>0&&Date.now()-t>=0&&Date.now()-t<180000}catch{return false}}
function muted(){try{return localStorage.getItem('bcLandingMuted')==='1'}catch{return false}}
function isMobile(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>0&&matchMedia('(pointer: coarse)').matches)}
function canPlay(desktop){return !desktop.hidden&&!desktop.inert&&!muted()}
function stop(){try{audio.pause()}catch{}}
function retryButton(host,allowed,onPlay){
 if(!allowed())return null;
 const button=document.createElement('button');button.type='button';button.className='bc-os-launch-sound';button.setAttribute('aria-label','Play OS launch announcement');button.title='Play OS launch announcement';button.textContent='♪  Play startup audio';
 button.addEventListener('click',()=>{
  if(!allowed()){button.remove();return}
  button.disabled=true;audio.currentTime=0;
  // The play request must be made directly in the real tap handler.
  try{Promise.resolve(audio.play()).then(()=>{if(!allowed()){stop();button.remove();return}button.remove();onPlay?.()}).catch(()=>{button.disabled=false;button.textContent='♪  Retry startup audio'})}catch{button.disabled=false;button.textContent='♪  Retry startup audio'}
 });
 host.append(button);return button;
}
async function run({gate,desktop,ready,reveal,reduceMotion=false}){
 if(!ready())return false;
 const mark=gate.querySelector('.os-boot-mark'),overline=gate.querySelector('.overline'),message=gate.querySelector('#gateMessage'),progress=gate.querySelector('#osBootProgress');
 gate.classList.add('bc-os-cinematic');if(reduceMotion)gate.classList.add('bc-os-motion-reduced');
 if(mark)mark.innerHTML='<span class="bc-os-launch-b" aria-hidden="true">B</span>';
 if(overline)overline.textContent='OPERATING SYSTEM';
 if(message)message.textContent='SYSTEM INITIALIZED';
 if(progress)progress.style.width='12%';
 let playing=false,blocked=false,raf=0,finished=false,resolveReveal,tapButton=null;
 let started=performance.now();
 const done=new Promise(resolve=>{resolveReveal=resolve});
 const finish=()=>{if(finished)return;finished=true;cancelAnimationFrame(raf);tapButton?.remove();gate.classList.remove('bc-os-cinematic','bc-os-motion-reduced');if(!ready()){stop();resolveReveal(false);return}
  desktop.classList.add('bc-os-launch-reveal');if(reduceMotion)desktop.classList.add('bc-os-motion-reduced');const ok=reveal();
  if(!ok){stop();resolveReveal(false);return}
  setTimeout(()=>{desktop.classList.remove('bc-os-launch-reveal','bc-os-motion-reduced')},1200);
  if(blocked&&!isMobile())retryButton(desktop,()=>canPlay(desktop),()=>{blocked=false;playing=true});
  resolveReveal(true);
 };
 const alreadyPlayed=consumePlayed();
 if(!muted()&&!alreadyPlayed){
  try{audio.currentTime=0;audio.volume=1;playing=await Promise.race([Promise.resolve(audio.play()).then(()=>true).catch(()=>false),new Promise(r=>setTimeout(()=>r(false),1300))]);if(!playing){stop();blocked=true}}catch{stop();blocked=true}
 }
 if(!ready()){stop();return false}
 started=performance.now();
 // Mobile playback is best effort only. Never gate a verified OS on sound.
 if(blocked&&!isMobile())tapButton=retryButton(gate,()=>!finished&&ready()&&!muted(),()=>{playing=true;blocked=false;started=performance.now()});
 function tick(){if(finished)return;if(!ready()){finish();return}const wall=(performance.now()-started)/1000;const elapsed=playing?audio.currentTime:wall;if(progress)progress.style.width=Math.min(100,12+elapsed/2.27*88)+'%';
  if(elapsed>=MARK||wall>=MARK+2){finish();return}raf=requestAnimationFrame(tick)}
 raf=requestAnimationFrame(tick);
 const endGuard=setInterval(()=>{if(finished&&(!canPlay(desktop)||audio.ended||audio.paused)){stop();clearInterval(endGuard)}},200);
 const watchdog=setInterval(()=>{if(finished){clearInterval(watchdog);return}if(!ready()||performance.now()-started>(DURATION+5)*1000)finish()},250);
 return done;
}
/* Original, lightweight system tones. One lazily unlocked context per OS.
   No sound assets, network requests, intervals, or autoplay workarounds. */
const SOUND_PREF='bc.os.system-sounds.v1';
let soundContext=null,soundResume=null,soundPref={enabled:true,volume:.35},startupPending=false,startupSeen=false,disposed=false,lastSound=-Infinity;
try{
 const saved=JSON.parse(localStorage.getItem(SOUND_PREF)||'null');
 if(saved&&typeof saved.enabled==='boolean')soundPref.enabled=saved.enabled;
 else if(muted())soundPref.enabled=false;
 if(saved&&Number.isFinite(saved.volume))soundPref.volume=Math.max(0,Math.min(1,saved.volume));
}catch(_){}
const TONES=Object.freeze({
 startup:[[196,0,.55,.7],[293.66,.025,.64,.55],[392,.065,.70,.42],[587.33,.14,.50,.22]],
 open:[[523.25,0,.095,.68],[783.99,.055,.12,.32]],
 close:[[523.25,0,.09,.38],[329.63,.045,.12,.55]],
 minimize:[[392,0,.10,.40]],
 expand:[[440,0,.07,.38],[659.25,.05,.11,.38]],
 lock:[[392,0,.11,.45],[261.63,.07,.16,.65]],
 unlock:[[329.63,0,.12,.44],[523.25,.065,.17,.55]],
 notice:[[659.25,0,.12,.42],[880,.085,.17,.35]],
 test:[[523.25,0,.12,.52],[659.25,.075,.17,.48]]
});
const available=()=>Boolean(window.AudioContext||window.webkitAudioContext);
function voicePlaying(){
 return !audio.paused&&!audio.ended;
}
function audible(){return !disposed&&!document.hidden&&soundPref.enabled&&soundPref.volume>0}
function renderTone(name){
 if(!audible()||!TONES[name]||soundContext?.state!=='running'||voicePlaying())return false;
 const now=soundContext.currentTime;
 if(now-lastSound<.13)return false;
 lastSound=now;
 try{
  for(const [frequency,delay,length,level] of TONES[name]){
   const osc=soundContext.createOscillator(),gain=soundContext.createGain(),start=now+.008+delay,end=start+length;
   osc.type='sine';osc.frequency.setValueAtTime(frequency,start);
   gain.gain.setValueAtTime(.0001,start);
   gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level*soundPref.volume*.16),start+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,end);
   osc.connect(gain);gain.connect(soundContext.destination);
   osc.onended=()=>{try{osc.disconnect();gain.disconnect()}catch(_){}};
   osc.start(start);osc.stop(end+.018);
  }
  return true;
 }catch(_){return false}
}
function flushStartup(){
 if(startupPending&&renderTone('startup'))startupPending=false;
}
function unlockSounds(event){
 if(disposed||!event?.isTrusted||!audible()||!available())return Promise.resolve(false);
 try{
  const C=window.AudioContext||window.webkitAudioContext;
  soundContext ||= new C();
  if(soundContext.state==='running'){flushStartup();return Promise.resolve(true)}
  if(!soundResume){
   soundResume=Promise.resolve(soundContext.resume()).then(()=>{flushStartup();return soundContext.state==='running'}).catch(()=>false).finally(()=>{soundResume=null});
  }
  return soundResume;
 }catch(_){return Promise.resolve(false)}
}
for(const type of ['pointerdown','pointerup','touchend','keydown'])document.addEventListener(type,unlockSounds,{capture:true,passive:true});
window.addEventListener('blackcell:desktop-ready',()=>{
 if(startupSeen)return;startupSeen=true;
 // Do not replay a startup chime when a release simply reloads the OS.
 if(new URLSearchParams(location.search).has('bc_os_release')||muted()||!soundPref.enabled)return;
 startupPending=true;
 flushStartup();
});
audio.addEventListener('ended',flushStartup);
function playSystemSound(name){
 if(!audible()||!TONES[name])return false;
 if(startupPending){flushStartup();if(!startupPending)return false}
 return renderTone(name);
}
function setSoundPreference(next){
 if(typeof next?.enabled==='boolean')soundPref.enabled=next.enabled;
 if(Number.isFinite(next?.volume))soundPref.volume=Math.max(0,Math.min(1,next.volume));
 if(!soundPref.enabled)startupPending=false;
 try{localStorage.setItem(SOUND_PREF,JSON.stringify(soundPref))}catch(_){}
 return {...soundPref};
}
window.BLACKCELL_SYSTEM_SOUNDS=Object.freeze({
 preferences:()=>({...soundPref,available:available()}),
 setPreference:setSoundPreference,
 play:playSystemSound,
 preview:async event=>{if(!await unlockSounds(event))return false;return renderTone('test')}
});
window.addEventListener('pagehide',event=>{
 if(event.persisted)return;
 disposed=true;startupPending=false;
 try{void soundContext?.close().catch(()=>{})}catch(_){}
});
window.addEventListener('pagehide',stop);window.bcVerifiedOsLaunch={consume,run,isMobile};
})();