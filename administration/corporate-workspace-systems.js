/* BLACKCELL Corporate Systems / real on-entry verification only.
   Each green indicator is tied to an actual successful point-in-time probe.
   No credentials saved, no paid AI runtime awakened, no false application-uptime promises. */
export function setup(client,ui){
 const {root,E,add,button,metrics,status,toolbar,date,section,timeout,download}=ui;
 root.classList.add('bc-systems-panel');
 const records=[
  {id:'corporate',name:'BLACKCELL Corporate Portal',group:'applications',provider:'Website / Supabase',
   icon:'▤',scope:'Administration website + authenticated owner gateway',
   desc:'Checks dashboard HTML, the Administration JavaScript and a verified corporate database RPC.',
   url:'dashboard.html',check:async()=>{
    await staticPage('dashboard.html','BLACKCELL CORPORATION');
    await staticPage('admin.js','BLACKCELL_ADMIN_READY');
    const {data,error}=await client.rpc('corp_code_status');
    if(error||data?.ok!==true||data?.verified!==true)throw Error('Owner gateway database verification failed.');
    return {label:'SITE + OWNER GATEWAY VERIFIED',detail:'Corporate dashboard HTML and Administration code loaded; owner gateway RPC passed. This does not test every feature.'};
   }},
  {id:'uniform',name:"Man's Armed Forces",group:'applications',provider:'Uniform collections / Supabase',
   icon:'◇',scope:'Landing page, collection code and catalog API',
   desc:'Checks the Uniforms page, JavaScript and access to the approved-media catalog.',
   url:'mans-armed-forces.html',check:async()=>{
    await staticPage('mans-armed-forces.html',"Man's Armed Forces");
    await staticPage('mans-armed-forces.js',"MAN'S ARMED FORCES");
    const {error}=await client.from('corp_social_assets').select('id',{count:'exact',head:true});
    if(error)throw Error('Uniform catalog query did not pass: '+(error.message||'Access denied'));
    return {label:'SITE + CATALOG API VERIFIED',detail:'Uniforms page and application code loaded; Supabase catalog API responded. This does not verify every Bunny image or gallery feature.'};
   }},
  {id:'nexus',name:'NEXUS Management',group:'applications',provider:'NEXUS / Supabase PostgreSQL',
   icon:'▥',scope:'NEXUS database availability only',
   desc:'Checks the NEXUS profiles database through the authenticated session. NEXUS frontend availability is not verified by this check.',
   url:null,check:async()=>{
    const {error}=await client.from('nexus_profiles').select('id',{count:'exact',head:true});
    if(error)throw Error('NEXUS database query did not pass: '+(error.message||'Access denied'));
    return {label:'DATABASE CONNECTION VERIFIED',detail:'The NEXUS profiles table responded to an authorized database request. The separate NEXUS app frontend, save flows and independent sign-in were not checked.'};
   }},
  {id:'network',name:'BLACKCELL Network',group:'applications',provider:'Corporate social platform',
   icon:'◎',scope:'Public application asset delivery',desc:'Checks the Network page and its JavaScript assets; does not verify messaging or media.',url:'corporate-network.html',check:async()=>{
    await staticPage('corporate-network.html','BLACKCELL');
    await staticPage('corporate-network.js','corporate');
    return {label:'APPLICATION ASSETS VERIFIED',detail:'The Network page and JavaScript responded. User features were not exercised.'};
   }},
  {id:'hosting',name:'Website Delivery',group:'infrastructure',provider:'BLACKCELL domain / HTTPS',
   icon:'▣',scope:'Same-origin website delivery',desc:'Checks delivery of the site release manifest. Does not inspect hosting provider availability.',url:null,check:async()=>{
    await staticPage('blackcell-site-version.json','revision');
    return {label:'SITE DELIVERY VERIFIED',detail:'The current website returned its release manifest. CDN and origin health are not independently verified.'};
   }},
  {id:'supabase',name:'Supabase',group:'infrastructure',provider:'Database / Authentication',
   icon:'▥',scope:'Verified owner database connection',desc:'Runs a read-only owner-session RPC using the authenticated connection.',url:null,check:async()=>{
    const {data,error}=await client.rpc('corp_code_status');
    if(error||data?.ok!==true||data?.verified!==true)throw Error('Owner session verification did not pass.');
    return {label:'DATABASE + SESSION VERIFIED',detail:'The authenticated database RPC succeeded. Storage, Edge Functions and service-wide uptime were not checked.'};
   }},
  {id:'cloudflare',name:'Cloudflare',group:'infrastructure',provider:'DNS / delivery infrastructure',icon:'◇',scope:'Provider-level status not configured',desc:'Provider-level health and account metrics require a separately authorized integration.',url:null,check:null,detail:'No Cloudflare account health probe is configured.'},
  {id:'telegram',name:'Telegram',group:'communications',provider:'Messaging integration',icon:'↗',scope:'Integration status not configured',desc:'A safe authenticated connection check is required before reporting Telegram connectivity.',url:null,check:null,detail:'No Telegram health probe is configured in this panel.'},
  {id:'bunny',name:'Bunny Storage Vault',group:'infrastructure',provider:'External media storage',
   icon:'◈',scope:'External storage readiness not configured',
   desc:'A secure Bunny Storage health endpoint is needed before access can be independently verified.',
   url:null,check:null,
   detail:'No authenticated Bunny health-check endpoint is configured. Existing media records or earlier uploads cannot prove current availability.'},
  {id:'gunner',name:'Gunner Thompson AI',group:'ai',provider:'External AI inference',
   icon:'✳',scope:'AI runtime readiness not configured',
   desc:'A safe status-only API is needed. The dashboard will not start a stopped paid runtime just to display a green dot.',
   url:null,check:null,
   detail:'No non-awakening, authenticated readiness check is configured. Not monitored is not the same as offline.'}
 ];
 const live=records.filter(x=>x.check);
 const state=Object.fromEntries(records.map(x=>[x.id,{status:'unknown',checked_at:null,latency_ms:null,scope:x.scope,reason:x.detail||'No completed check'}]));
 const mast=E('div','sys-mast');const mastCopy=E('div','sys-mast-copy');
 add(mastCopy,E('span','sys-kicker','BLACKCELL / INFRASTRUCTURE COMMAND'),E('h2','','Systems overview'),E('p','','Applications, infrastructure, AI, and communications. Real checks only.'));
 const seal=E('div','sys-seal','B');seal.setAttribute('aria-hidden','true');add(mast,mastCopy,seal);root.append(mast);
 const tiles=metrics([
  ['verified','VERIFIED NOW','Real successful responses'],
  ['attention','NEEDS REVIEW','Failed or rejected checks'],
  ['unconfigured','NOT MONITORED','No safe endpoint configured'],
  ['last','LAST CHECKED','Your local time']
 ]);
 const toolbarNode=toolbar(),left=E('div','toolbar-left'),right=E('div','toolbar-right'),
  runAll=button('⟳ VERIFY CONNECTED SYSTEMS',()=>{void checkAll()},'primary'),
  exportBtn=button('EXPORT STATUS REPORT',()=>{
   download('blackcell-corporate-systems-'+new Date().toISOString().slice(0,10)+'.json',{
    generated_at:new Date().toISOString(),scope:'Point-in-time browser probes; not a continuous uptime audit.',
    systems:records.map(x=>({id:x.id,name:x.name,provider:x.provider,...state[x.id]}))
   });
   status('The current system results were exported.','success');
  });
 add(left,runAll,exportBtn);
 const diag=document.createElement('a');
 diag.className='btn';diag.href='corporate-diagnostics.html';diag.textContent='ALL DIAGNOSTICS ↗';
 right.append(diag);add(toolbarNode,left,right);
 const filter=E('div','sys-filters');filter.setAttribute('aria-label','Filter systems');
 const groups=[['all','All systems'],['applications','Applications'],['infrastructure','Infrastructure'],['ai','AI services'],['communications','Communications']];
 let activeGroup='all';
 const groupButtons=new Map();
 for(const [id,label] of groups){const toggle=button(label,()=>{activeGroup=id;applyFilter()});toggle.setAttribute('aria-pressed',String(id==='all'));groupButtons.set(id,toggle);filter.append(toggle)}
 root.append(filter);
 const groupsRoot=E('div','sys-groups');root.append(groupsRoot);
 const groupNodes=new Map();
 for(const [id,label] of groups.slice(1)){
  const group=E('section','sys-group');group.dataset.group=id;const heading=E('h3','section-heading',label.toUpperCase());const grid=E('div','check-grid');add(group,heading,grid);groupsRoot.append(group);groupNodes.set(id,{group,grid});
 }
 function applyFilter(){for(const [id,node] of groupNodes)node.group.hidden=activeGroup!=='all'&&activeGroup!==id;for(const [id,toggle] of groupButtons)toggle.setAttribute('aria-pressed',String(activeGroup===id))}
 const cards={};
 let inProgress=false;
 const timeoutError=(error)=>/network|fetch|abort|timeout|load failed/i.test(String(error?.message||''))||error?.name==='AbortError';
 const statusText={unknown:'NOT VERIFIED',checking:'VERIFYING…',online:'VERIFIED',attention:'NEEDS REVIEW',offline:'UNREACHABLE'};
 const staticPage=async(file,signature)=>{
  const url=new URL(file,location.href);url.searchParams.set('corporate_check',String(Date.now()));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
   const res=await fetch(url.toString(),{method:'GET',cache:'no-store',credentials:'same-origin',signal:controller.signal});
   if(!res.ok)throw Error('HTTP '+res.status+' from '+file);
   const body=await res.text();
   if(!body.toLowerCase().includes(signature.toLowerCase()))throw Error('Unexpected content returned by '+file);
  }finally{clearTimeout(timer)}
 };
 function counters(){
  const success=live.filter(x=>state[x.id].status==='online').length,
   failed=live.filter(x=>['attention','offline'].includes(state[x.id].status)).length;
  tiles.verified.textContent=String(success)+' / '+live.length;
  tiles.attention.textContent=String(failed);
  tiles.unconfigured.textContent=String(records.length-live.length);
  const times=live.map(x=>state[x.id].checked_at).filter(Boolean).sort();
  tiles.last.textContent=times.length?new Date(times.at(-1)).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'—';
  tiles.last.style.fontSize='19px';
 }
 function draw(id){
  const s=state[id],c=cards[id];if(!c)return;
  c.card.dataset.state=s.status;c.dot.dataset.state=s.status;
  c.header.textContent=!records.find(x=>x.id===id)?.check?'NOT MONITORED':(s.status==='online'&&s.success_label)?s.success_label:statusText[s.status];
  c.reason.textContent=s.reason;
  c.meta.textContent=s.checked_at?date(s.checked_at)+(s.latency_ms!==null?' · '+s.latency_ms+' ms':''):'No verified check yet';
 }
 async function checkOne(entry){
  if(!entry.check||state[entry.id].status==='checking')return;
  const s=state[entry.id],c=cards[entry.id],start=performance.now();
  c.button.disabled=true;s.status='checking';s.reason='Running real read-only checks…';s.checked_at=null;s.latency_ms=null;s.success_label=null;
  draw(entry.id);
  try{
   const result=await timeout(Promise.resolve().then(entry.check),22000);
   s.status='online';s.reason=result.detail;s.success_label=result.label;
  }catch(error){
   s.status=timeoutError(error)?'offline':'attention';
   s.reason=String(error?.message||'Verification failed. Check permissions and try again.');
  }finally{
   s.checked_at=new Date().toISOString();
   s.latency_ms=Math.round(performance.now()-start);
   c.button.disabled=false;draw(entry.id);counters();
  }
 }
 async function checkAll(){
  if(inProgress)return;
  inProgress=true;runAll.disabled=true;status('Running configured read-only system checks…');
  try{
   await Promise.all(live.map(checkOne));
   const successful=live.filter(x=>state[x.id].status==='online').length;
   const failed=live.length-successful;
   status(successful+' of '+live.length+' configured checks passed.'+
    (failed?' '+failed+' need review.':'')+' External services without safe probes remain gray.',
    failed?'error':'success');
  }finally{runAll.disabled=false;inProgress=false}
 }
 for(const entry of records){
  const card=E('article','check');card.dataset.state='unknown';
  const head=E('div','check-top'),ico=E('span','check-icon',entry.icon),
   label=E('div','check-label'),dot=E('span','dot');dot.dataset.state='unknown';
  add(label,E('b','',entry.name),E('small','',entry.provider));add(head,ico,label,dot);
  const header=E('div','check-state',entry.check?'NOT VERIFIED':'NOT MONITORED'),
   description=E('p','',entry.desc),
   reason=E('span','check-result',entry.detail||'No completed check'),
   foot=E('div','check-footer'),meta=E('small','','No verified check yet');
  const controls=E('div','item-controls');
  let action;
  if(entry.check){
   action=button('RUN CHECK',()=>{void checkOne(entry)});
   controls.append(action);
  }else{
   action=button('NOT CONFIGURED',null);action.disabled=true;controls.append(action);
  }
  if(entry.url){const a=E('a','btn','OPEN PAGE ↗');a.href=entry.url;a.target='_blank';a.rel='noopener noreferrer';controls.append(a)}
  foot.append(meta,controls);add(card,head,header,description,reason,foot);groupNodes.get(entry.group).grid.append(card);
  cards[entry.id]={card,dot,header,reason,meta,button:action};
  if(!entry.check){state[entry.id].reason=entry.detail;draw(entry.id)}
 }
 root.append(E('div','notice',
  'A green check verifies only the specific test described on the card. Gray means not monitored, not offline. Provider account metrics, continuous uptime, and unconfigured external integrations are not inferred.'));
 counters();
 // Safe verification occurs once when owner opens the page; no background polling or AI wake-up.
 void checkAll();
}
