/* REDLINE desktop viewport fit.
   Never resize the message feed by polling the chat or by changing its DOM.
   Measure the actual top of the paired photo/chat workspace, then give that
   existing grid exactly the remaining viewport height. */
(()=>{
 'use strict';
 const workspace=document.getElementById('redlineReceiverLiveWorkspace');
 if(!workspace)return;
 const STYLE_KEY='--redline-viewport-fit-height';
 let pending=false;
 let lastHeight='';
 const eligible=()=>window.matchMedia('(min-width:1000px)').matches &&
  document.body.classList.contains('bc-redline-receiver') &&
  document.body.classList.contains('rr-imessage-mode') &&
  document.body.classList.contains('bc-redline-apple-mode') &&
  !document.body.classList.contains('bc-ledger-mobile') &&
  !workspace.hidden;
 function fit(){
  pending=false;
  if(!eligible()){
   if(lastHeight){workspace.style.removeProperty(STYLE_KEY);lastHeight=''}
   return;
  }
  const top=workspace.getBoundingClientRect().top;
  if(!Number.isFinite(top))return;
  // The viewport is the REDLINE frame itself, including inside BLACKCELL OS.
  // Reserve a little breathing room so the composer never gets clipped.
  const height=Math.max(260,Math.floor(window.innerHeight-Math.max(0,top)-12));
  const value=height+'px';
  if(value!==lastHeight){
   workspace.style.setProperty(STYLE_KEY,value);
   lastHeight=value;
  }
 }
 function schedule(){
  if(pending)return;
  pending=true;
  requestAnimationFrame(fit);
 }
 const observer=new MutationObserver(schedule);
 observer.observe(workspace,{attributes:true,attributeFilter:['hidden','class']});
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 window.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('pageshow',schedule);
 window.addEventListener('blackcell:redline:receiver-ready',schedule);
 window.addEventListener('blackcell:redline:state',schedule);
 window.addEventListener('blackcell:redline:session-mode',schedule);
 if(window.visualViewport)
  window.visualViewport.addEventListener('resize',schedule,{passive:true});
 schedule();
})();