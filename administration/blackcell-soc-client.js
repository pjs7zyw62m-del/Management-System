/* Server-collected, privacy-preserving indicators. No raw device or file metadata. */
export const securityLabels=Object.freeze({
 new_browser_signature:['New browser signature','A corporate account has a newly observed browser signature. Device identity is not proven.'],
 repeated_network_sessions:['Repeated network sessions','Several observed session issuances share a network address. Shared networks and normal retries can explain this.'],
 code_failure_increase:['Security code failures increased','The sampled corporate gateway failure counter increased.'],
 gateway_lock:['Corporate gateway lock','An active corporate master-code lock was recorded. Verify whether it was expected.'],
 permission_change:['Permission change recorded','An administrator permission change was recorded. Review whether it was expected.'],
 private_catalog_write_burst:['Private file catalog activity','Elevated catalog metadata writes; not a record of individual file access.'],
 media_catalog_write_burst:['Media catalog activity','Elevated media metadata writes; bulk uploads may be normal.']
});
export function parseSecuritySnapshot(value,now=Date.now()){
 if(value?.ok!==true||!Array.isArray(value.alerts)||!value.last_run||!Number.isFinite(Date.parse(value.last_run)))return null;
 const last=Date.parse(value.last_run),age=now-last;
 const alerts=value.alerts.filter(a=>Number.isSafeInteger(a?.id)&&a.id>0&&Object.hasOwn(securityLabels,a.kind)&&['review','high'].includes(a.severity)&&Number.isSafeInteger(a.event_count)&&a.event_count>=0&&Number.isFinite(Date.parse(a.event_at))).sort((a,b)=>b.id-a.id).slice(0,100);
 return {lastRun:value.last_run,healthy:age>=-120000&&age<=180000,alerts};
}
export async function getSecuritySnapshot(client){
 const {data,error}=await client.rpc('bc_soc_snapshot');if(error)return null;return parseSecuritySnapshot(data)
}
export function mountSecurityNotifications(client,{host,accountId,usable,openAdmin,notice}){
 if(!host||!accountId)return null;
 const bell=document.createElement('button');bell.type='button';bell.className='bc-soc-bell';bell.title='Security notifications';bell.setAttribute('aria-label','Security notifications');bell.setAttribute('aria-expanded','false');bell.hidden=true;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.65');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M18 8a6 6 0 0 0-12 0c0 6-3 8-3 8h18s-3-2-3-8M10 21h4');svg.append(path);
 const badge=document.createElement('span');badge.className='bc-soc-badge';badge.hidden=true;bell.append(svg,badge);host.append(bell);
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const pane=make('section','bc-soc-notifications');pane.setAttribute('aria-label','Security notifications');pane.hidden=true;pane.id='bcSecurityNotifications';bell.setAttribute('aria-controls',pane.id);
 const title=make('header','bc-soc-n-head'),name=make('strong','','Security notifications'),close=make('button','','×');close.type='button';close.setAttribute('aria-label','Close notifications');title.append(name,close);
 const state=make('p','bc-soc-n-state','Checking security collector…'),list=make('div','bc-soc-n-list'),footer=make('button','bc-soc-n-open','Open Administration → Security');footer.type='button';
 pane.append(title,state,list,footer);document.getElementById('desktop').append(pane);
 const key='bc.os.soc.read.v1:'+accountId;
 let read=0;try{const n=Number(localStorage.getItem(key));if(Number.isSafeInteger(n)&&n>=0)read=n}catch(_){}
 let current=null,announced=read,generation=0,inflight=false,disposed=false,first=true;
 const available=()=>!disposed&&usable()&&!document.hidden;
 const clear=()=>{pane.hidden=true;bell.setAttribute('aria-expanded','false')};
 const reset=()=>{generation++;current=null;clear();list.replaceChildren();badge.hidden=true;bell.hidden=true;bell.removeAttribute('data-state');state.textContent='Checking security collector…'};
 const acknowledge=()=>{if(!available()||!current?.alerts.length)return;read=Math.max(read,current.alerts[0].id);try{localStorage.setItem(key,String(read))}catch(_){}badge.hidden=true;bell.setAttribute('aria-label','Security notifications')};
 function render(){
   if(!available())return;
   bell.hidden=false;bell.dataset.state=current?.healthy?'healthy':'unavailable';list.replaceChildren();
   state.textContent=current?(current.healthy?'Background collector active · Last scan ':'Collector may be delayed · Last scan ')+new Date(current.lastRun).toLocaleString():'Security monitoring unavailable. No conclusion can be made.';
   const unread=current?.alerts.filter(a=>a.id>read).length||0;
   badge.hidden=!unread;badge.textContent=unread?(unread>=100?'99+':String(unread)):'';
   badge.dataset.high=String(!!current?.alerts.some(a=>a.id>read&&a.severity==='high'));
   bell.setAttribute('aria-label',unread?'Security notifications, '+unread+' unread':'Security notifications');
   if(current===null)list.append(make('p','','Unable to load security alerts.'));
   else if(!current.alerts.length)list.append(make('p','','No recorded alerts in the connected collector. Coverage is partial.'));
   else for(const a of current.alerts.slice(0,15)){
     const row=make('article','bc-soc-n-event');row.dataset.severity=a.severity;
     const desc=securityLabels[a.kind];
     row.append(make('strong','',desc[0]),make('p','',desc[1]),make('small','',new Date(a.event_at).toLocaleString()+' · '+a.event_count+' recorded'));list.append(row);
   }
   if(!pane.hidden)acknowledge();
 }
 async function refresh(){
   if(!available()){reset();return}if(inflight)return;
   inflight=true;const id=generation;let timer;
   try{
     const result=await Promise.race([getSecuritySnapshot(client),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),20000)})]);
     if(id!==generation||!available())return;
     current=result;render();
     if(result?.alerts?.length){
       const newAlerts=result.alerts.filter(a=>a.id>announced);
       if(newAlerts.length&&available()){
         // One compact notification per refresh, even when several events arrive together.
         notice(newAlerts.some(a=>a.severity==='high')?'BLACKCELL SECURITY · High-priority indicator recorded. Open the security bell.':'BLACKCELL SECURITY · '+newAlerts.length+' security indicator(s) to review.');
         announced=Math.max(announced,result.alerts[0].id)
       }
     }
     first=false;
   }catch(_){if(id===generation&&available()){current=null;render()}}
   finally{clearTimeout(timer);inflight=false}
 }
 bell.onclick=()=>{if(!available())return;if(!pane.hidden){clear();return}pane.hidden=false;bell.setAttribute('aria-expanded','true');render();acknowledge();void refresh()};
 close.onclick=clear;footer.onclick=()=>{if(!available())return;clear();openAdmin()};
 const outside=e=>{if(!pane.hidden&&!pane.contains(e.target)&&!bell.contains(e.target))clear()};
 const keydown=e=>{if(e.key==='Escape')clear()};
 const focus=()=>void refresh();
 document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',focus);window.addEventListener('focus',focus);
 const interval=setInterval(focus,30000);
 void refresh();
 return {pause:reset,refresh,dispose(){disposed=true;clearInterval(interval);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',focus);window.removeEventListener('focus',focus);reset();bell.remove();pane.remove()}}
}
