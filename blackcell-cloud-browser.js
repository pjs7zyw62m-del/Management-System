/* Cloud Chromium pilot. Provider session URL remains in memory only. */
export function mountCloudPilot(host,record,embedded){
 const root=document.createElement('section');root.className='bc-cloud-pilot';
 const top=document.createElement('div');top.className='bc-cloud-bar';
 const label=document.createElement('strong');label.textContent='BLACKCELL CLOUD BROWSER';
 const state=document.createElement('span');state.className='bc-cloud-state';state.textContent='Pilot · Level 7';
 const start=document.createElement('button');start.type='button';start.textContent='START CLOUD BROWSER';
 const end=document.createElement('button');end.type='button';end.textContent='END SESSION';end.hidden=true;
 top.append(label,state,start,end);const message=document.createElement('p');message.className='bc-cloud-message';message.textContent='Remote Chromium · 10-minute test · administrator only. No provider recording or logging requested. Do not enter sensitive credentials during the pilot.';
 const view=document.createElement('div');view.className='bc-cloud-view';view.hidden=true;root.append(top,message,view,embedded);host.append(root);
 let current=null,closed=false,timer=null,auth=null,generation=0,starting=false;
 async function request(action,id){if(!auth){const m=await import('./corp-auth.js?v=20261112-ledger-access1');auth=m.corporateClient()}const {data}=await auth.auth.getSession();if(!data?.session?.access_token)throw Error('Sign in through Corporate Access as Level 7, then return to this preview.');const config=window.BLACKCELL_CORP_CONFIG;if(!config?.url||!config?.publishableKey)throw Error('Corporate configuration unavailable.');
 const res=await fetch(config.url+'/functions/v1/blackcell-cloud-browser',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({action,...(id?{id}:{})}),cache:'no-store',keepalive:action==='end'});const result=await res.json();if(!res.ok)throw Error(result.error||'Cloud browser service unavailable');return result}
 function reset(note){clearInterval(timer);timer=null;view.replaceChildren();view.hidden=true;embedded.hidden=false;start.hidden=false;start.disabled=false;end.hidden=true;end.disabled=false;state.textContent='Pilot · Level 7';message.textContent=note;current=null;starting=false}
 async function stop(note='Cloud session ended.'){generation++;const id=current?.id;reset(note);if(id)try{await request('end',id)}catch(e){if(!closed)message.textContent='Local view closed. Provider closure unconfirmed; the session will expire automatically.'}}
 start.onclick=async()=>{if(starting||current)return;starting=true;const g=++generation;start.disabled=true;state.textContent='Connecting…';message.textContent='Checking secure session and cloud provider…';try{const status=await request('status');if(!status.configured)throw Error('Cloud engine is ready. Provider connection is required: add BLACKCELL_BROWSERBASE_API_KEY in Supabase Edge Function Secrets.');if(closed||g!==generation)return;
 const result=await request('start');if(closed||g!==generation){await request('end',result.id).catch(()=>{});return}const u=new URL(result.liveUrl);if(u.protocol!=='https:'||!(u.hostname==='browserbase.com'||u.hostname.endsWith('.browserbase.com')))throw Error('Invalid live browser endpoint.');
 current=result;starting=false;const iframe=document.createElement('iframe');iframe.title='Live cloud Chromium browser';iframe.referrerPolicy='no-referrer';iframe.setAttribute('sandbox','allow-scripts allow-same-origin');iframe.src=u.href;view.replaceChildren(iframe);view.hidden=false;embedded.hidden=true;start.hidden=true;end.hidden=false;message.textContent='Live cloud session. Use the remote browser’s navigation controls. No sensitive sign-ins during testing.';
 const tick=()=>{const seconds=Math.max(0,Math.floor((Date.parse(result.expiresAt)-Date.now())/1000));state.textContent='LIVE · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');if(seconds<=0)void stop('Pilot session expired.')};timer=setInterval(tick,1000);tick();
 }catch(e){if(!closed&&g===generation)reset(e.message||'Unable to start cloud browser.')}};
 end.onclick=()=>{end.disabled=true;void stop()};
 const disconnected=e=>{const iframe=view.querySelector('iframe');if(iframe&&e.source===iframe.contentWindow&&e.origin===new URL(iframe.src).origin&&e.data==='browserbase-disconnected')void stop('Remote browser disconnected.')};
 window.addEventListener('message',disconnected);
 record.cleanup=()=>{closed=true;window.removeEventListener('message',disconnected);void stop()};
}