/* REDLINE keyboard-safe viewport. Presentation only: no focus, selection,
   chat DOM, scrolling, billing or network changes. */
(()=>{
 'use strict';
 const root=document.documentElement, vv=window.visualViewport;
 const touch=/iPhone|iPad|iPod|Android|Windows Phone/i.test(navigator.userAgent||'') ||
  ((navigator.maxTouchPoints||0)>1 && /Mac/i.test(navigator.platform||'')) ||
  ((navigator.maxTouchPoints||0)>0 && matchMedia('(pointer:coarse)').matches);
 if(!touch)return;
 function intersect(top,bottom,frameTop,parentTop,parentBottom){
  return {top:Math.max(top,parentTop-frameTop),bottom:Math.min(bottom,parentBottom-frameTop)};
 }
 function bounds(){
  const scaled=vv&&Math.abs(vv.scale-1)<.025;
  let top=scaled?vv.offsetTop:0,bottom=scaled?vv.offsetTop+vv.height:innerHeight;
  try{
   const frame=window.frameElement,host=window.parent;
   if(frame&&host!==window&&host.location.origin===location.origin){
    const p=host.visualViewport,rect=frame.getBoundingClientRect();
    if(p&&Math.abs(p.scale-1)<.025){
     const clipped=intersect(top,bottom,rect.top+frame.clientTop,p.offsetTop,p.offsetTop+p.height);
     if(clipped.bottom>clipped.top){top=clipped.top;bottom=clipped.bottom}
    }
   }
  }catch(_){}
  return {top,bottom,height:Math.max(0,bottom-top)};
 }
 window.BLACKCELL_REDLINE_VISIBLE_VIEWPORT=bounds;
 const normal=new Map();
 let raf=0,last='',chatCard=null,chatRect=null;
 function editable(el){
  return !!el&&!el.disabled&&!el.readOnly&&
   (el.isContentEditable||el.matches('textarea,input:not([type]),input[type=text],input[type=search],input[type=number],input[type=email],input[type=password],input[type=tel],input[type=url]'));
 }
 function orientation(){return screen.orientation?.type?.split('-')[0]|| (screen.width>screen.height?'landscape':'portrait')}
 function clearCard(){
  if(chatCard){chatCard.classList.remove('rd-keyboard-tablet-card');chatCard=null;chatRect=null}
 }
 function measure(){
  raf=0;
  const b=bounds(),el=document.activeElement,editing=editable(el),key=orientation()+'|'+Math.round(innerWidth/50);
  let baseline=normal.get(key)||0;
  if(!editing){baseline=Math.max(baseline,b.height);normal.set(key,baseline)}
  const inset=Math.max(0,innerHeight-b.height,baseline-b.height);
  const open=editing&&inset>=80&&(!vv||Math.abs(vv.scale-1)<.025);
  const chat=open&&el.closest('.redline-message-composer');
  const pricing=open&&el.closest('#rdIndependentReview');
  const body=document.body;
  root.classList.toggle('rd-keyboard-open',!!open);
  root.classList.toggle('rd-keyboard-chat',!!chat);
  root.classList.toggle('rd-keyboard-price',!!pricing);
  root.classList.toggle('rd-keyboard-short',!!open&&b.height<320);
  if(open){
   root.style.setProperty('--rd-keyboard-top',Math.round(b.top)+'px');
   root.style.setProperty('--rd-keyboard-height',Math.floor(b.height)+'px');
  }else{
   root.style.removeProperty('--rd-keyboard-top');
   root.style.removeProperty('--rd-keyboard-height');
  }
  // The sender tablet layout is normally a scrolling page. Temporarily
  // pin its existing conversation to the available viewport, without moving
  // the textarea or recreating the message feed.
  const target=chat&&!body.classList.contains('bc-ledger-mobile')&&body.classList.contains('redline-sender-messenger')?el.closest('.redline-message-card'):null;
  if(target!==chatCard){
   clearCard();
   if(target){chatCard=target;chatRect=target.getBoundingClientRect();target.classList.add('rd-keyboard-tablet-card')}
  }
  if(chatCard&&chatRect){
   const left=Math.max(4,Math.min(chatRect.left,innerWidth-100)),width=Math.max(96,Math.min(chatRect.width,innerWidth-left-4));
   const top=Math.max(b.top,Math.min(chatRect.top,b.bottom-Math.min(300,b.height)));
   chatCard.style.setProperty('--rd-kb-card-left',Math.round(left)+'px');
   chatCard.style.setProperty('--rd-kb-card-width',Math.floor(width)+'px');
   chatCard.style.setProperty('--rd-kb-card-top',Math.round(top)+'px');
   chatCard.style.setProperty('--rd-kb-card-height',Math.max(1,Math.floor(b.bottom-top))+'px');
  }
  const signature=[b.top,b.bottom,open,!!chat,!!pricing].join('|');
  if(signature!==last){last=signature;window.dispatchEvent(new Event('blackcell:redline:keyboard-viewport'))}
 }
 function schedule(){if(!raf)raf=requestAnimationFrame(measure)}
 document.addEventListener('focusin',schedule);
 document.addEventListener('focusout',()=>{schedule();setTimeout(schedule,300)});
 for(const event of ['resize','orientationchange','pageshow','blackcell:redline:device-mode','blackcell:redline:state'])window.addEventListener(event,schedule,{passive:true});
 vv?.addEventListener('resize',schedule,{passive:true});vv?.addEventListener('scroll',schedule,{passive:true});
 try{if(window.frameElement&&parent.location.origin===location.origin){parent.visualViewport?.addEventListener('resize',schedule,{passive:true});parent.visualViewport?.addEventListener('scroll',schedule,{passive:true});parent.addEventListener('resize',schedule,{passive:true})}}catch(_){}
 schedule();
})();
