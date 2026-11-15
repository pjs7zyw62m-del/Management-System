// Authenticated, per-account cloud storage widget.
export function mountStorageWidget(client,{preview=false,alive=()=>true}={}){
 const $=id=>document.getElementById(id),button=$('bcStorageRefresh'),connection=$('bcStorageConnection'),bar=$('bcStorageBar'),reservedBar=$('bcStorageReservedBar'),track=$('bcStorageTrack');
 if(!button||!connection)return ()=>{};
 let busy=false,disposed=false,lastCheck=0,queued=false;
 const number=x=>Math.max(0,Number(x)||0);
 function format(bytes){const n=number(bytes);return n>=1073741824?(n/1073741824).toFixed(2).replace(/\.?0+$/,'')+' GB':n>=1048576?(n/1048576).toFixed(1).replace(/\.0$/,'')+' MB':n>=1024?(n/1024).toFixed(1).replace(/\.0$/,'')+' KB':n+' B'}
 function render(data){
  const used=number(data.usedBytes),reserved=number(data.reservedBytes),quota=number(data.quotaBytes),available=Math.max(0,quota-used-reserved),percent=quota?Math.min(100,used/quota*100):0,remainingPercent=quota?Math.min(100-percent,reserved/quota*100):0;
  $('bcStorageUsed').textContent=format(used);$('bcStorageQuota').textContent=' / '+format(quota);
  bar.style.width=percent+'%';reservedBar.style.width=remainingPercent+'%';track.setAttribute('aria-valuenow',String(Math.round(percent+remainingPercent)));track.setAttribute('aria-valuetext',format(used)+' stored; '+format(reserved)+' reserved');
  $('bcStorageAvailable').textContent=format(available)+' available · '+Math.round(percent+remainingPercent)+'% allocated';
  $('bcStorageMax').textContent=format(data.maxBytes);$('bcStorageCount').textContent=String(number(data.fileCount));
  $('bcStorageReservedRow').hidden=!reserved;$('bcStorageReserved').textContent=format(reserved);
  $('bcStorageLegacyRow').hidden=!number(data.legacyBytes);$('bcStorageLegacy').textContent=format(data.legacyBytes);
 }
 function state(label,value){connection.textContent=label;connection.dataset.state=value}
 function clearUsage(){for(const id of ['bcStorageUsed','bcStorageCount'])$(id).textContent='—';$('bcStorageAvailable').textContent='Usage unavailable';$('bcStorageReservedRow').hidden=true;$('bcStorageLegacyRow').hidden=true;bar.style.width='0%';reservedBar.style.width='0%';track.removeAttribute('aria-valuenow');track.removeAttribute('aria-valuetext')}
 if(preview){render({usedBytes:0,reservedBytes:0,quotaBytes:2147483648,maxBytes:268435456,fileCount:0});state('Design preview','preview');$('bcStorageUpdated').textContent='Example';button.disabled=true;return ()=>{}}
 async function refresh(force=false){
  if(disposed||!alive())return;
  if(document.hidden&&!force)return;
  if(busy){queued=true;return}busy=true;button.disabled=true;
  const check=force||Date.now()-lastCheck>300000;
  if(check)state('Checking connection…','checking');
  try{
   const cfg=window.BLACKCELL_CORP_CONFIG,{data,error}=await client.auth.getSession();
   if(error||!data?.session?.access_token||!cfg?.url||!cfg?.publishableKey)throw Error('Session unavailable');
   const res=await fetch(cfg.url+'/functions/v1/blackcell-os-private-drive?action='+(check?'status':'usage'),{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:cfg.publishableKey,'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(40000)});
   const data2=await res.json();if(disposed||!alive())return;if(!res.ok||!data2.ok)throw Error('Storage unavailable');
   render(data2);if(check){lastCheck=Date.now();state(data2.connected?'Connected':'Not verified',data2.connected?'online':'offline')}
   $('bcStorageUpdated').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }catch(_){if(!disposed&&alive()){clearUsage();state('Unavailable','offline');lastCheck=0;$('bcStorageUpdated').textContent='Retry'}}
  finally{busy=false;button.disabled=false;if(queued&&!disposed&&alive()){queued=false;void refresh()}}
 }
 const click=()=>void refresh(true),change=()=>void refresh(),visible=()=>{if(!document.hidden)void refresh()};button.addEventListener('click',click);window.addEventListener('bc-private-files-changed',change);document.addEventListener('visibilitychange',visible);const timer=setInterval(()=>void refresh(),30000);void refresh(true);
 return ()=>{disposed=true;clearInterval(timer);button.removeEventListener('click',click);window.removeEventListener('bc-private-files-changed',change);document.removeEventListener('visibilitychange',visible);clearUsage();state('Session ended','offline')}
}
