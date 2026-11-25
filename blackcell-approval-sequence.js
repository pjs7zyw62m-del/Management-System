(()=>{'use strict';
const src='blackcell-access-granted-david.mp3?v=20261125-approved-audio2';
const steps=[
 {at:0,title:'IDENTITY VERIFIED',sub:'Corporate identity authenticated',count:1,progress:33},
 {at:1.81,title:'CLEARANCE CONFIRMED',sub:'Security authorization complete',count:2,progress:66},
 {at:3.89,title:'ACCESS GRANTED',sub:'Corporate authorization approved',count:3,progress:100},
 {at:5.30,title:'BLACKCELL',sub:'C O R P O R A T I O N',count:3,progress:100}
];
let context,bufferPromise,osBufferPromise,started=false;
const OS_SRC='blackcell-os-launch-david.mp3?v=20261125-os-launch1',OS_PLAYED='bc.os.launch-audio-played.v1';
const mobile=()=>/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>0&&matchMedia('(pointer: coarse)').matches);
const osBytes=mobile()?fetch(OS_SRC,{credentials:'same-origin'}).then(r=>r.ok?r.arrayBuffer():null).catch(()=>null):Promise.resolve(null);
const bytesPromise=fetch(src,{credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error('Audio unavailable');return r.arrayBuffer()}).catch(()=>null);
const preloaded=new Audio(src);preloaded.preload='auto';preloaded.load();
const muted=()=>{try{return localStorage.getItem('bcLandingMuted')==='1'}catch{return false}};
function prime(){
 if(muted())return;
 try{
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  context ||= new C();if(context.state==='suspended')context.resume().catch(()=>{});
  if(!bufferPromise)bufferPromise=bytesPromise.then(b=>b?context.decodeAudioData(b):null).catch(()=>null);
  if(mobile()&&!osBufferPromise)osBufferPromise=osBytes.then(b=>b?context.decodeAudioData(b):null).catch(()=>null);
 }catch{}
}
function stopEntrance(){
 try{if(window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.document.getElementById('bcGlassLoginFrame')===window.frameElement)window.parent.bcLandingAudio?.cancel()}catch{}
}
function show(screen,index){
 const s=steps[index],title=screen.querySelector('#bcApprovalTitle'),sub=screen.querySelector('#bcApprovalSub');
 screen.classList.toggle('granted',index>=2);screen.classList.toggle('welcome',index===3);
 screen.querySelector('#bcApprovalLabel').textContent=index===3?'WELCOME TO':'CORPORATE ACCESS GATEWAY';
 title.textContent=s.title;sub.textContent=s.sub;title.classList.remove('bc-approval-reveal');void title.offsetWidth;title.classList.add('bc-approval-reveal');
 screen.querySelectorAll('.bc-approval-check').forEach((c,i)=>{c.classList.toggle('done',i<s.count);c.querySelector('b').textContent=i<s.count?'✓':'○'});
 screen.querySelector('#bcApprovalFill').style.width=s.progress+'%';
}
async function continueMobileAudio(screen,previousMedia){
 if(!mobile()||muted())return false;
 // The same verified login document and AudioContext remain alive through
 // both clips; do not navigate until the final announcement has completed.
 screen.classList.remove('granted');screen.classList.add('welcome');
 screen.querySelector('#bcApprovalLabel').textContent='OPERATING SYSTEM';
 screen.querySelector('#bcApprovalTitle').textContent='BLACKCELL';
 screen.querySelector('#bcApprovalSub').textContent='Opening your secure workspace…';
 let played=false;
 if(context?.state==='running'&&osBufferPromise){
  const buffer=await Promise.race([osBufferPromise,new Promise(r=>setTimeout(()=>r(null),1200))]);
  if(buffer&&context.state==='running'){
   played=await new Promise(resolve=>{
    let source,guard,done=false;const start=context.currentTime;
    const finish=ok=>{if(done)return;done=true;clearTimeout(guard);try{source?.stop()}catch{}resolve(ok)};
    try{source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.onended=()=>finish(context.currentTime-start>=buffer.duration-.3);source.start();guard=setTimeout(()=>finish(false),Math.min(10000,buffer.duration*1000+1600));}catch{finish(false)}
    window.addEventListener('pagehide',()=>finish(false),{once:true});
   });
  }
 }
 if(!played&&previousMedia){
  // WebKit grants playback per media element; reuse the element that
  // successfully played approval, rather than creating another one.
  played=await new Promise(resolve=>{
   let done=false,timer;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);previousMedia.removeEventListener('ended',ended);previousMedia.removeEventListener('error',error);previousMedia.pause();resolve(ok)};
   const ended=()=>finish(true),error=()=>finish(false);
   previousMedia.addEventListener('ended',ended);previousMedia.addEventListener('error',error);
   timer=setTimeout(()=>finish(false),7500);
   try{previousMedia.src=OS_SRC;previousMedia.play().catch(()=>finish(false))}catch{finish(false)}
   window.addEventListener('pagehide',()=>finish(false),{once:true});
  });
 }
 if(!played){
  try{if(window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.document.getElementById('bcGlassLoginFrame')===window.frameElement)played=await window.parent.bcLandingAudio?.playOsLaunch?.()===true}catch{}
 }
 if(played)try{sessionStorage.setItem(OS_PLAYED,String(Date.now()))}catch{}
 return played;
}
async function run(navigate){
 if(started)return;started=true;
 const screen=document.getElementById('launchScreen');if(!screen){navigate();return}
 stopEntrance();document.getElementById('accessMergeScene')?.classList.remove('active','converging','approved');
 document.body.style.overflow='hidden';screen.classList.add('active');screen.setAttribute('aria-hidden','false');
 show(screen,0);
 let node=null,media=null,clock=()=>performance.now()/1000,origin=clock(),duration=7.392625;
 if(!muted()){
  try{
   if(context?.state==='suspended')await Promise.race([context.resume().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,500))]);
   if(context?.state==='running'&&bufferPromise){
    const buffer=await Promise.race([bufferPromise,new Promise(resolve=>setTimeout(()=>resolve(null),1500))]);
    if(buffer&&context.state==='running'){node=context.createBufferSource();node.buffer=buffer;node.connect(context.destination);origin=context.currentTime;clock=()=>context.currentTime;duration=buffer.duration;node.start()}
   }
  }catch{node=null}
  if(!node){
   try{
    media=preloaded;media.currentTime=0;media.playbackRate=1;media.volume=1;
    const playing=await Promise.race([Promise.resolve(media.play()).then(()=>true).catch(()=>false),new Promise(resolve=>setTimeout(()=>resolve(false),1800))]);
    if(playing){clock=()=>media.currentTime;origin=0;if(Number.isFinite(media.duration))duration=media.duration}
    else{media.pause();media=null}
   }catch{media?.pause();media=null}
  }
 }
 if(!node&&!media){clock=()=>performance.now()/1000;origin=clock()}
 let last=0,done=false,raf=0,limit;
 const finish=()=>{if(done)return;done=true;clearTimeout(limit);cancelAnimationFrame(raf);try{node?.stop()}catch{}media?.pause();if(mobile()&&!muted())void continueMobileAudio(screen,media).catch(()=>false).finally(navigate);else navigate()};
 if(node)node.onended=finish;
 if(media)media.addEventListener('ended',finish,{once:true});
 const tick=()=>{if(done)return;const elapsed=Math.max(0,clock()-origin);let next=last;while(next+1<steps.length&&elapsed>=steps[next+1].at)next++;if(next!==last){show(screen,next);last=next}if(elapsed>=duration){finish();return}raf=requestAnimationFrame(tick)};
 // A failed or stalled media request must never strand an authorized user.
 limit=setTimeout(finish,Math.max(8000,Math.min(11000,(duration+1.2)*1000)));
 raf=requestAnimationFrame(tick);
 window.addEventListener('pagehide',()=>{clearTimeout(limit);cancelAnimationFrame(raf);try{node?.stop()}catch{}media?.pause()},{once:true});
}
document.addEventListener('pointerdown',prime,{capture:true,passive:true});
document.addEventListener('pointerup',prime,{capture:true,passive:true});
document.addEventListener('touchend',prime,{capture:true,passive:true});
document.addEventListener('click',prime,{capture:true,passive:true});
document.addEventListener('keydown',prime,{capture:true});
for(const id of ['login','codeForm'])document.getElementById(id)?.addEventListener('submit',prime,true);
document.getElementById('continueVerified')?.addEventListener('click',prime,true);
window.bcAccessApproval={run};
})();