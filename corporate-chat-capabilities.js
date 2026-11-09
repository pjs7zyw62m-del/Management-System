/* Blackcell: large floating companion media panels only on desktop or iPad 12.9-inch and larger.
   Core photo and video sharing/viewing remains available on ALL devices.
   Browser APIs do not expose display inches; supported 12.9/13-inch iPads
   have physical CSS screen dimensions of at least 1000 x 1300.
*/
(function(){
 'use strict';
 if(window.BlackcellChatMedia)return;
 function enabled(){
  const ua=navigator.userAgent||'';
  const w=Number(screen?.width)||innerWidth,h=Number(screen?.height)||innerHeight;
  const short=Math.min(w,h),long=Math.max(w,h),touch=(navigator.maxTouchPoints||0)>0;
  const phone=/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(ua);
  const appleTablet=/iPad/i.test(ua)||(/Macintosh|MacIntel/i.test(ua)&&navigator.maxTouchPoints>1);
  const otherTablet=/Android/i.test(ua)&&!phone;
  if(phone||(touch&&short<680))return false;
  if(appleTablet||otherTablet)return short>=1000&&long>=1300;
  return true;
 }
 let previous=null;
 function refresh(){
  const current=enabled();
  document.documentElement.classList.toggle('bc-chat-lite',!current);
  document.documentElement.classList.toggle('bc-chat-full-media',current);
  if(previous!==null&&previous!==current)
   window.dispatchEvent(new CustomEvent('blackcell-chat-media-capability-change',{detail:{enabled:current}}));
  previous=current;
 }
 window.BlackcellChatMedia={enabled,refresh};
 refresh();
 window.addEventListener('resize',refresh,{passive:true});
 window.addEventListener('orientationchange',refresh,{passive:true});
})();