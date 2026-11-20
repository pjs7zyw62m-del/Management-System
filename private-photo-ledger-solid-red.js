/* BLACKCELL REDLINE sender-only color surface.
 * Pure presentation: no user data, authentication, uploading, billing or storage.
 * The verified owner always retains the original administration theme.
 */
(()=>{
  'use strict';
  const app=document.getElementById('ledgerApp');
  const owner=document.getElementById('ownerSetup');
  if(!app||!owner)return;
  function sync(){
    // The original REDLINE security script alone controls whether the verified
    // app is shown and whether ownerSetup is exposed for the approved owner.
    const senderView=!app.hidden&&owner.hidden;
    document.body.classList.toggle('bc-redline-solid-sender',senderView);
  }
  const observer=new MutationObserver(sync);
  observer.observe(app,{attributes:true,attributeFilter:['hidden']});
  observer.observe(owner,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('pageshow',sync);
  sync();
})();