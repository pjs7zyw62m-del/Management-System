/* BLACKCELL site-wide presence for signed-in members; no app-level tracking. */
(() => {
 'use strict';
 if (window.top !== window.self || window.BLACKCELL_SITE_PRESENCE) return;
 if (location.pathname.endsWith('/login.html')) return;
 window.BLACKCELL_SITE_PRESENCE = true;

 const randomId=()=>globalThis.crypto?.randomUUID?.() || null;
 const storedId=(store,key)=>{
   try{
     const old=store.getItem(key);
     if(old&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(old))return old;
     const value=randomId();if(value)store.setItem(key,value);return value;
   }catch(_){return randomId()}
 };
 const sessionId=storedId(sessionStorage,'bc.site-presence.tab.v1');
 const deviceId=storedId(localStorage,'bc.site-presence.device.v1');
 if(!sessionId||!deviceId)return;
 const ua=navigator.userAgent||'';
 const device=()=>/iPad/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1)?'iPad':
   /iPhone|iPod/i.test(ua)?'iPhone':
   /Android/i.test(ua)?(/Mobile/i.test(ua)?'Android phone':'Android tablet'):
   /Windows/i.test(ua)?'Windows desktop':
   /Macintosh|Mac OS X/i.test(ua)?'Mac desktop':
   /Linux/i.test(ua)?'Linux desktop':'Other device';
 let client=null, authorized=false, lastVisible=null, lastSent=0, activeRequest=Promise.resolve();
 let booting=false;

 async function send(visible,force=false){
   if(!client||!authorized||(!force&&lastVisible===visible&&Date.now()-lastSent<30000))return;
   lastVisible=visible;lastSent=Date.now();
   const task=()=>client.rpc('corp_site_presence_touch',{
     p_session_id:sessionId,p_device_id:deviceId,p_visible:visible,p_device_label:device()
   }).then(({data,error})=>{
     if(error||data?.ok!==true){ /* A failed request is never shown as confirmed presence. */ }
   });
   activeRequest=activeRequest.catch(()=>{}).then(task);
   try{await activeRequest}catch(_){}
 }
 const visible=()=>!document.hidden;
 async function boot(){
   if(booting||authorized)return;
   booting=true;
   try{
     const {corporateClient,corporateAuthorize}=await import('./corp-auth.js?v=20261109-clearance5');
     client=corporateClient();
     const result=await corporateAuthorize(client,{allowLedgerOnly:true});
     if(!result.ok)return;
     authorized=true;
     await send(visible(),true);
     client.auth.onAuthStateChange((event)=>{
       if(event==='SIGNED_OUT'){authorized=false;return}
       if(event==='SIGNED_IN'&&!authorized){authorized=true;void send(visible(),true)}
     });
   }catch(_){/* Not a verified corporate session; do not record. */}
   finally{booting=false}
 }
 document.addEventListener('visibilitychange',()=>{if(authorized)void send(visible(),true)});
 window.addEventListener('pageshow',()=>{if(authorized)void send(visible(),true);else void boot()});
 window.addEventListener('focus',()=>{if(authorized&&!document.hidden)void send(true)});
 window.addEventListener('online',()=>{if(authorized&&!document.hidden)void send(true,true)});
 setInterval(()=>{if(!document.hidden&&authorized)void send(true,true)},35000);
 void boot();
})();
