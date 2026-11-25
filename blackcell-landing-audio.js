(()=>{'use strict';
const button=document.getElementById('bcLandingSound');
if(!button)return;
const audio=new Audio();
audio.preload='auto';
const warning='blackcell-security-announcement.mp3';
const welcome='blackcell-welcome-david2.mp3';
const get=(storage,key)=>{try{return window[storage].getItem(key)}catch{return null}};
const set=(storage,key,value)=>{try{window[storage].setItem(key,value)}catch{}};
let muted=get('localStorage','bcLandingMuted')==='1';
let heard=get('sessionStorage','bcLandingWarningHeard')==='1';
let blocked=false,active=null,warningTask=null,entrance=false,epoch=0;
function update(){
 const label=muted?'Enable entrance audio':blocked?'Play security announcement':'Mute entrance audio';
 button.setAttribute('aria-label',label);button.title=label;
 button.setAttribute('aria-pressed',String(muted));
 button.classList.toggle('sound-muted',muted||blocked);
}
function stop(){if(active)active.finish(false);audio.pause()}
function clip(src,limit){
 if(muted)return Promise.resolve(false);
 stop();blocked=false;
 return new Promise(resolve=>{
  let done=false,started=false,startTimer,finishTimer;
  const finish=ok=>{
   if(done)return;done=true;
   clearTimeout(startTimer);clearTimeout(finishTimer);
   audio.removeEventListener('playing',playing);audio.removeEventListener('ended',ended);audio.removeEventListener('error',error);
   audio.pause();if(active&&active.finish===finish)active=null;
   update();resolve(ok);
  };
  const playing=()=>{if(started)return;started=true;blocked=false;clearTimeout(startTimer);finishTimer=setTimeout(()=>finish(false),limit);update()};
  const ended=()=>finish(true),error=()=>finish(false);
  active={finish,src};
  audio.addEventListener('playing',playing);audio.addEventListener('ended',ended);audio.addEventListener('error',error);
  audio.src=src;audio.playbackRate=1;audio.volume=1;
  startTimer=setTimeout(()=>finish(false),3000);
  try{Promise.resolve(audio.play()).catch(err=>{if(done)return;blocked=err&&err.name==='NotAllowedError';finish(false)})}catch{finish(false)}
 });
}
function startWarning(){
 if(muted||heard)return Promise.resolve(true);
 if(warningTask)return warningTask;
 const task=clip(warning,14000).then(ok=>{if(ok){heard=true;set('sessionStorage','bcLandingWarningHeard','1')}return ok}).finally(()=>{if(warningTask===task)warningTask=null});
 warningTask=task;return task;
}
function startEntrance(){
 entrance=true;++epoch;
 // Play directly within the trusted Authorized Access click, not after navigation.
 stop();
 if(muted)return Promise.resolve('muted');
 return clip(welcome,10000).then(ok=>ok?'played':muted?'muted':'retry');
}
function cancel(){entrance=false;++epoch;stop()}
button.addEventListener('click',()=>{
 if(muted||blocked){muted=false;blocked=false;set('localStorage','bcLandingMuted','0');update();if(!entrance&&!heard)startWarning();}
 else{muted=true;set('localStorage','bcLandingMuted','1');stop();update()}
});
document.addEventListener('click',event=>{
 if(!event.isTrusted||entrance||muted||heard||warningTask)return;
 if(event.target instanceof Element&&event.target.closest('#bcLandingSound,#launch,#skip'))return;
 startWarning();
});
window.addEventListener('pagehide',cancel);
window.bcLandingAudio={startEntrance,cancel};
update();if(!muted&&!heard)startWarning();
})();
