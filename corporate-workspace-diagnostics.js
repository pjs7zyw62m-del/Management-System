export function setup(client,u){
 const {root,E,add,button,metrics,download,status,timeout,toolbar,section}=u;
 // CORE maintenance uses manual requests only; it never refreshes the page.
 const maintenance=E('section','panel');maintenance.id='core-maintenance';
 maintenance.append(E('h2','','CORE · System Maintenance'),E('p','','Inspect retained REDLINE records, clear closed-room activity and retry verified original-file cleanup. Private photo libraries and active conversations are not deleted here.'));
 const maintenanceGrid=E('div','metrics'),counts={};
 for(const [key,title,desc] of [
  ['active_rooms','ACTIVE ROOMS','Live sessions'],['closed_rooms','CLOSED ROOMS','Awaiting finalization'],
  ['photo_records','PHOTO RECORDS','REDLINE session entries'],['chat_records','CHAT RECORDS','REDLINE messages'],
  ['running_timers','RUNNING TIMERS','Active billing timers'],['pending_exports','INCOMPLETE EXPORTS','Reserved library copies not ready'],
  ['queued_source_files','STORAGE CLEANUP','Finalized source files queued'],['closed_room_presence','OLD PRESENCE','Closed-room device records'],
  ['closed_room_signals','OLD CHAT SIGNALS','Closed-room typing/read records'],['closed_room_viewing','OLD VIEWING STATE','Closed-room viewing records']
 ]){
  const card=E('div','metric'),value=E('strong','','—');
  add(card,E('small','',title),value,E('span','',desc));maintenanceGrid.append(card);counts[key]=value;
 }
 maintenance.append(maintenanceGrid);
 const maintenanceStatus=E('p','notice','Not checked. Run an inventory to get current database counts.');
 maintenanceStatus.setAttribute('role','status');maintenanceStatus.setAttribute('aria-live','polite');
 const actionBar=E('div','toolbar'),actionLeft=E('div','toolbar-left');
 let maintenanceBusy=false;
 async function readMaintenance(){
  const {data,error}=await client.rpc('corp_owner_core_maintenance_status');
  if(error||data?.ok!==true)throw Error('Maintenance inventory unavailable. Verify your Level 7 session.');
  for(const key of Object.keys(counts))counts[key].textContent=Number.isSafeInteger(Number(data[key]))&&data[key]!=null?String(data[key]):'—';
  return data;
 }
 async function maintain(action){
  if(maintenanceBusy)return;
  if(action==='ephemera'&&!confirm('Clear only closed-room presence, typing/read and viewing records? Photos, chat, financial records and active rooms are preserved.'))return;
  if(action==='storage'&&!confirm('Retry removal of finalized REDLINE source files already verified and queued by End Session? Private library copies are not targeted.'))return;
  maintenanceBusy=true;for(const b of controls)b.disabled=true;
  maintenanceStatus.textContent='Checking secure maintenance status…';
  try{
   const initial=await readMaintenance();
   let message='Inventory refreshed.';
   if(action==='ephemera'){
    const {data,error}=await client.rpc('corp_owner_core_clear_closed_ephemera');
    if(error||data?.ok!==true)throw Error('Closed-room cleanup was not confirmed.');
    message=String(data.removed)+' closed-room transient records removed.';
   }
   if(action==='storage'){
    let removed=0;
    if(Number(initial.queued_source_files)>0){
     for(let i=0;i<5;i++){
      maintenanceStatus.textContent='Retrying queued original-file cleanup…';
      const {data,error}=await client.functions.invoke('blackcell-redline-session-export',{body:{action:'cleanup',room_id:null}});
      if(error||data?.ok!==true)throw Error('Storage cleanup paused. Remaining files stay queued for retry.');
      removed+=Number(data.removed)||0;
      if(data.more!==true)break;
     }
    }
    message=removed+' queued original files processed.';
   }
   const current=action==='scan'?initial:await readMaintenance();
   maintenanceStatus.textContent=message+' · '+current.queued_source_files+' source files still queued · '+new Date(current.checked_at).toLocaleString();
  }catch(e){for(const v of Object.values(counts))v.textContent='—';maintenanceStatus.textContent=String(e?.message||'Maintenance request failed.').slice(0,220)}
  finally{maintenanceBusy=false;for(const b of controls)b.disabled=false}
 }
 const controls=[button('SCAN SYSTEM',()=>void maintain('scan'),'primary'),button('CLEAR CLOSED-ROOM ACTIVITY',()=>void maintain('ephemera')),button('RETRY STORAGE CLEANUP',()=>void maintain('storage'))];
 actionLeft.append(...controls);actionBar.append(actionLeft);maintenance.append(actionBar,maintenanceStatus);
 const redlineLink=E('a','btn','OPEN REDLINE ROOM DIRECTORY');redlineLink.href='private-photo-ledger.html?rdHome=1';maintenance.append(redlineLink);
 maintenance.append(E('p','notice','Closed rooms with incomplete transfers must be finalized in REDLINE. This panel does not force-delete rooms, unexported photos, account data or financial records. Counts are point-in-time, not a background monitor.'));
 root.append(maintenance);
 if(location.hash==='#core-maintenance')requestAnimationFrame(()=>maintenance.scrollIntoView({block:'start'}));
 const staticFile=async(path,signature)=>{
   const url=new URL(path,location.href);url.searchParams.set('health_check',String(Date.now()));
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
     const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
     if(!response.ok)throw Error('HTTP '+response.status);
     if(!(await response.text()).includes(signature))throw Error('Unexpected file response.');
   }finally{clearTimeout(timer)}
 };
 const registry=[
   ['web','◇','Corporate Website','GitHub Pages / HTTPS','Confirm the published Administration HTML is available.',
     ()=>staticFile('dashboard.html','BLACKCELL CORPORATION')],
   ['assets','▧','Administration Application','Static JS delivery','Retrieve and verify the Administration JavaScript.',
     ()=>staticFile('admin.js','BLACKCELL_ADMIN_READY')],
   ['auth','♙','Corporate Identity','Supabase Authentication','Confirm your authenticated owner identity.',
     async()=>{const {data,error}=await client.auth.getUser();if(error||!data?.user?.id)throw Error('Identity verification failed.')}],
   ['database','▥','Corporate Database','Supabase PostgreSQL','Confirm an authorized response from the owner-verification RPC.',
     async()=>{const {data,error}=await client.rpc('corp_code_status');if(error||data?.ok!==true||data?.verified!==true)throw Error('Owner verification failed.')}],
   ['employees','♟','Personnel Directory','Supabase secure procedure','Confirm the owner-protected employee directory returns successfully.',
     async()=>{const {data,error}=await client.rpc('corp_admin_members');if(error||data?.ok!==true||!Array.isArray(data.members))throw Error('Directory request did not pass.')}],
   ['edge','⛶','Invitation Service','Supabase Edge Functions','Run a secure readiness check without sending an invitation.',
     async()=>{const {data,error}=await client.functions.invoke('blackcell-invite-employee',{body:{action:'check'}});if(error||data?.ok!==true||data?.status!=='backend_ready')throw Error('Invitation readiness failed.')}],
   ['storage','▤','Private Media Storage','Supabase Storage','List accessible storage metadata without downloading private media.',
     async()=>{const {data,error}=await client.storage.from('corp-social-media').list('',{limit:1,offset:0});if(error||!Array.isArray(data))throw Error('Storage listing failed.')}],
   ['bunny','◈','Bunny Media Vault','External private storage','Secure external health check not configured.',null],
   ['ai','✳','AI Inference Runtime','External model server','Secure server health check not configured.',null]
 ];
 const live=registry.filter(r=>r[5]);
 const state=Object.fromEntries(registry.map(([id])=>[id,{state:'unknown',ms:null,checked_at:null,detail:'Not checked'}]));
 const values=metrics([
   ['online','ONLINE RESPONSES','Checks passed'],
   ['alerts','ATTENTION','Failed / restricted'],
   ['unchecked','NOT VERIFIED','Unrun / unmonitored'],
   ['last','LAST COMPLETED','Local time']
 ]);
 const bar=toolbar(),left=E('div','toolbar-left'),right=E('div','toolbar-right');
 const all=button('⟳ RUN ALL SEVEN CHECKS',()=>{void runAll()},'primary');
 const exportBtn=button('EXPORT REPORT',()=>{
   download('blackcell-system-checks-'+new Date().toISOString().slice(0,10)+'.json',
     {type:'browser-service-checks',created_at:new Date().toISOString(),
      scope:'Point-in-time connectivity checks, not 24/7 monitoring.',
      services:registry.map(([id,,name,provider])=>({id,name,provider,...state[id]}))});
   status('A JSON report was exported.','success');
 });
 add(left,all,exportBtn);
 const auto=E('input');auto.type='checkbox';
 const label=E('label','header-tag');label.style.cursor='pointer';
 add(label,auto,E('span','','Auto-refresh (2.5 min), while open'));right.append(label);
 add(bar,left,right);
 section('CONNECTED CORPORATE SERVICES');
 const grid=E('div','check-grid');root.append(grid);
 const cards={};
 function refresh(id){
   const v=state[id],node=cards[id];if(!node)return;
   node.el.dataset.state=v.state;node.dot.dataset.state=v.state;
   node.heading.textContent={
     unknown:'NOT CHECKED',checking:'CHECKING…',online:'ONLINE / VERIFIED',
     attention:'NEEDS REVIEW',offline:'UNREACHABLE'
   }[v.state];
   node.details.textContent=v.detail;
   node.meta.textContent=v.checked_at?
     new Date(v.checked_at).toLocaleTimeString()+(v.ms===null?'':' · '+v.ms+' ms'):'No completed check';
 }
 function totals(){
   const successful=live.filter(x=>state[x[0]].state==='online').length;
   const alerts=live.filter(x=>['attention','offline'].includes(state[x[0]].state)).length;
   values.online.textContent=String(successful);
   values.alerts.textContent=String(alerts);
   values.unchecked.textContent=String(registry.length-successful-alerts);
   const times=live.map(x=>state[x[0]].checked_at).filter(Boolean).sort();
   values.last.textContent=times.length?new Date(times.at(-1)).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'—';
   values.last.style.fontSize='21px';
 }
 const pending=new Set();
 async function runOne(entry){
   const id=entry[0],fn=entry[5];
   if(!fn||pending.has(id))return;
   const v=state[id],node=cards[id];
   pending.add(id);v.state='checking';v.detail='Request in progress…';v.ms=null;v.checked_at=null;
   node.action.disabled=true;refresh(id);
   const t=performance.now();
   try{
     await timeout(Promise.resolve().then(fn),18000);
     v.state='online';v.detail='A live service response was verified.';
   }catch(e){
     const msg=String(e?.message||'Unknown service error');
     v.state=/fetch|network|timeout|abort|load failed/i.test(msg)||e?.name==='AbortError'?'offline':'attention';
     v.detail='Check did not pass: '+msg;
   }finally{
     v.ms=Math.round(performance.now()-t);v.checked_at=new Date().toISOString();
     node.action.disabled=false;pending.delete(id);refresh(id);totals();
   }
 }
 async function runAll(){
   if(all.disabled)return;
   all.disabled=true;status('Checking all configured services…');
   try{
     await Promise.all(live.map(runOne));
     const failed=live.filter(x=>state[x[0]].state!=='online').length;
     status(failed?failed+' service check(s) need review.':'All seven checks returned a successful response.',failed?'error':'success');
   }finally{all.disabled=false}
 }
 for(const entry of live){
   const [id,icon,name,provider,desc]=entry;
   const card=E('article','check');card.dataset.state='unknown';
   const top=E('div','check-top'),face=E('span','check-icon',icon),
     nameWrap=E('div','check-label'),dot=E('span','dot');dot.dataset.state='unknown';
   add(nameWrap,E('b','',name),E('small','',provider));add(top,face,nameWrap,dot);
   const heading=E('div','check-state','NOT CHECKED');
   const description=E('p','',desc),details=E('span','check-result','No check performed');
   const footer=E('div','check-footer'),meta=E('small','','No completed check'),
     action=button('RUN CHECK',()=>{void runOne(entry)});
   add(footer,meta,action);add(card,top,heading,description,details,footer);
   grid.append(card);cards[id]={el:card,dot,heading,details,meta,action};
 }
 section('EXTERNAL INFRASTRUCTURE / STATUS NOT CONFIGURED');
 const external=E('div','check-grid');root.append(external);
 for(const [,icon,name,provider,desc] of registry.slice(7)){
   const card=E('article','check'),top=E('div','check-top'),
     label=E('div','check-label');
   add(label,E('b','',name),E('small','',provider));
   add(top,E('span','check-icon',icon),label,E('span','dot'));
   add(card,top,E('div','check-state','NOT MONITORED'),E('p','',desc),
     E('span','check-result','A secure, service-specific endpoint must be configured first.'));
   external.append(card);
 }
 root.append(E('div','notice',
   'Green means that specific test succeeded at the time shown. These results do not certify database integrity, file integrity, actual server CPU load, full application functionality, or 24/7 uptime.'));
 let tick=null;
 auto.addEventListener('change',()=>{
   if(tick){clearInterval(tick);tick=null}
   if(auto.checked)tick=setInterval(()=>{if(!document.hidden&&!all.disabled)void runAll()},150000);
 });
 document.addEventListener('visibilitychange',()=>{
   if(!document.hidden&&auto.checked&&!all.disabled)void runAll();
 });
 totals();
}
