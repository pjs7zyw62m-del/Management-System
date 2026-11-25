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
 let playing=false,blocked=false,raf=0,finished=false,resolveReveal,tapButton=null,choice=null,waiting=false;
 const clearChoice=()=>{choice?.remove();choice=null;waiting=false};
 let started=performance.now();
 const done=new Promise(resolve=>{resolveReveal=resolve});
 const finish=()=>{if(finished)return;finished=true;cancelAnimationFrame(raf);tapButton?.remove();clearChoice();gate.classList.remove('bc-os-cinematic','bc-os-motion-reduced');if(!ready()){stop();resolveReveal(false);return}
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
 if(blocked&&isMobile()){
  waiting=true;
  choice=document.createElement('div');choice.className='bc-os-audio-choice';
  const explanation=document.createElement('p');explanation.textContent='Tap to play the startup announcement as BLACKCELL opens.';
  const sound=document.createElement('button');sound.type='button';sound.textContent='Enter OS with sound';sound.className='bc-os-audio-enter';
  const silent=document.createElement('button');silent.type='button';silent.textContent='Continue silently';silent.className='bc-os-audio-silent';
  choice.append(explanation,sound,silent);gate.append(choice);
  sound.addEventListener('click',()=>{
   if(finished||!ready()){finish();return}
   sound.disabled=true;audio.currentTime=0;
   // Invoke playback directly in the trusted tap, before any async work.
   let timer;
   const fail=()=>{if(finished||!waiting)return;stop();sound.disabled=false;explanation.textContent='Audio could not play. Retry or continue silently.'};
   try{const request=audio.play();timer=setTimeout(fail,8000);
    Promise.resolve(request).then(()=>{
     clearTimeout(timer);if(finished||!ready()||!waiting){stop();return}
     playing=true;blocked=false;started=performance.now();clearChoice();raf=requestAnimationFrame(tick);
    }).catch(()=>{clearTimeout(timer);fail()})
   }catch{clearTimeout(timer);fail()}
  });
  silent.addEventListener('click',()=>{stop();blocked=false;finish()});
  const guard=setInterval(()=>{if(finished||!waiting){clearInterval(guard);return}if(!ready()){clearInterval(guard);finish()}},250);
 }else if(blocked)tapButton=retryButton(gate,()=>!finished&&ready()&&!muted(),()=>{playing=true;blocked=false;started=performance.now()});
 function tick(){if(finished)return;if(!ready()){finish();return}const wall=(performance.now()-started)/1000;const elapsed=playing?audio.currentTime:wall;if(progress)progress.style.width=Math.min(100,12+elapsed/2.27*88)+'%';
  if(elapsed>=MARK||wall>=MARK+2){finish();return}raf=requestAnimationFrame(tick)}
 if(!waiting)raf=requestAnimationFrame(tick);
 const endGuard=setInterval(()=>{if(finished&&(!canPlay(desktop)||audio.ended||audio.paused)){stop();clearInterval(endGuard)}},200);
 const watchdog=setInterval(()=>{if(finished){clearInterval(watchdog);return}if(waiting)return;if(!ready()||performance.now()-started>(DURATION+5)*1000)finish()},250);
 return done;
}
window.addEventListener('pagehide',stop);window.bcVerifiedOsLaunch={consume,run,isMobile};
})();