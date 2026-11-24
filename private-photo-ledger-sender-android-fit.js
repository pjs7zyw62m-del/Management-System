/* REDLINE sender Android viewport fit.
   Calculate the visible space remaining beneath the real BLACKCELL topbar.
   Changes only a CSS size variable; never scroll/reparent the chat, remount
   messages, or touch Gboard's text input and selection. */
(()=>{
 'use strict';
 const preview=location.href==='about:srcdoc'&&window.REDLINE_DEV_CONFIG?.role==='sender';
 // All mobile senders use the same measured full-height chat; desktop remains unchanged.
 const app=document.getElementById('ledgerApp');
 const home=document.getElementById('redlineSimpleSender');
 const pane=home?.querySelector('[data-redline-pane="upload"]');
 if(!app||!home||!pane)return;
 const KEY='--redline-android-chat-app-height';
 const root=document.documentElement;
 const visual=window.visualViewport;
 let frame=0,last='';
 const enabled=()=> document.body.classList.contains('bc-ledger-mobile')&&document.body.classList.contains('redline-chat-immersive')&&
  document.body.classList.contains('redline-sender-messenger')&&
  !app.hidden&&!home.hidden&&!pane.hidden;
 function measure(){
  frame=0;
  if(!enabled()){
   if(last){root.style.removeProperty(KEY);last=''}
   return;
  }
  const rect=app.getBoundingClientRect();
  // visualViewport.offsetTop accounts for Android Chrome's virtual keyboard
  // panning. The bottom is in layout-viewport CSS pixels.
  const bottom=visual?
   Number(visual.offsetTop||0)+Number(visual.height||0):
   Number(window.innerHeight||0);
  if(!Number.isFinite(bottom)||!Number.isFinite(rect.top)||bottom<=0)return;
  const visible=Math.max(0,Math.floor(bottom-rect.top));
  const next=visible+'px';
  if(next!==last){root.style.setProperty(KEY,next);last=next}
 }
 function schedule(){
  if(frame)return;
  frame=requestAnimationFrame(measure);
 }
 visual?.addEventListener('resize',schedule,{passive:true});
 visual?.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('orientationchange',schedule);
 window.addEventListener('pageshow',schedule);
 window.addEventListener('focus',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
 const observe=new MutationObserver(schedule);
 observe.observe(document.body,{attributes:true,attributeFilter:['class']});
 for(const el of [app,home,pane])
  observe.observe(el,{attributes:true,attributeFilter:['hidden']});
 for(const event of ['blackcell:redline:bridge','blackcell:redline:state',
   'blackcell:redline:session-mode','blackcell:redline:reset','blackcell:redline:device-mode'])
  window.addEventListener(event,schedule);
 schedule();
})();