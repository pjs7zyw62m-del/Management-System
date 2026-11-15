/* BLACKCELL / Apple device layout detection
   Presentation only; no account or identity information leaves the browser.
   Adds a fallback for Safari's "Request Desktop Website" layout viewport.
 */
(function(){
 'use strict';
 function sync(){
  const ua=navigator.userAgent||'';
  const touches=navigator.maxTouchPoints||0;
  const small=Math.min(window.screen?.width||Infinity,window.screen?.height||Infinity);
  const iphone=/iPhone|iPod/i.test(ua)||(touches>0&&small<=650);
  const ipad=!iphone&&(/iPad/i.test(ua)
    ||(touches>1&&/Macintosh|MacIntel/i.test(ua))
    ||(touches>0&&small>650&&small<=1180));
  const root=document.documentElement;
  root.classList.toggle('bc-device-phone',iphone);
  root.classList.toggle('bc-device-tablet',ipad);
  root.classList.toggle('bc-device-desktop',!iphone&&!ipad);
  const portrait=(window.screen?.height||innerHeight)>=(window.screen?.width||innerWidth);
  root.classList.toggle('bc-device-portrait',portrait);
  root.classList.toggle('bc-device-landscape',!portrait);
 }
 sync();
 window.addEventListener('orientationchange',sync,{passive:true});
 window.addEventListener('resize',sync,{passive:true});
})();
