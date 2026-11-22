/* BLACKCELL iMessage - contact startup recovery for older Android browsers.
 * This small classic script does not depend on the ESM import graph or the
 * Supabase CDN. If those fail before iMessage initializes, users still get
 * a visible Retry Contacts button without clearing auth tokens or messages.
 */
(()=>{
 'use strict';
 function init(){
  const panel=document.getElementById('chatStartupRecovery');
  const message=document.getElementById('chatStartupRecoveryMessage');
  const button=document.getElementById('retryContacts');
  const list=document.getElementById('peers');
  if(!panel||!button||!list)return;
  button.addEventListener('click',()=>{
   button.disabled=true;
   button.textContent='CONNECTING…';
   try{
    if(typeof window.BLACKCELL_CHAT_RETRY==='function'){
     window.BLACKCELL_CHAT_RETRY();
     window.setTimeout(()=>{
      button.disabled=false;
      button.textContent='RETRY CONTACTS';
     },1200);
    }else{
     // The ES module never loaded: refresh this page/frame, not the OS or
     // the whole corporate session. Do not clear storage or sign the user out.
     location.reload();
    }
   }catch(_){
    button.disabled=false;button.textContent='RETRY CONTACTS';
   }
  });
  window.setTimeout(()=>{
   if(!panel.hidden)return; // the main chat has already shown a useful error
   if(list.querySelector('.peer,.inbox-peer-row'))return;
   if(!/checking (?:authorized )?contacts/i.test(list.textContent||''))return;
   message.textContent='BLACKCELL iMessage is taking too long to start on this browser. Tap Retry Contacts. Your saved messages have not been deleted.';
   panel.hidden=false;
   button.hidden=false;
   const status=document.getElementById('systemStatus');
   if(status&&status.hidden){
    status.textContent='Chat startup delayed. Your saved messages remain on the server.';
    status.hidden=false;
   }
  },14000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
