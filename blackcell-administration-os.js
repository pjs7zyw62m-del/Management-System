/* Administration: compact Settings-style navigation, using existing guarded controls. */
(()=> {
 let embedded=false;try{embedded=parent!==window&&new URLSearchParams(location.search).get('osApp')==='administration'&&parent.location.origin===location.origin&&parent.location.pathname.endsWith('/blackcell-os.html')&&parent.document.getElementById('bcOsAdministrationFrame')?.contentWindow===window}catch(_){}
 const dedicated=document.body.classList.contains('bc-admin-os-dedicated');
 if(!embedded&&!dedicated)return;
 const retry=document.getElementById('bcAdminOsRetry');if(retry)retry.onclick=()=>location.reload();
 const sections=[
 {id:'users',label:'User Management',glyph:'♙',direct:['modal','users']},
 {id:'processor',label:'Media Import Processor',glyph:'▧',direct:['link','corporate-media-admin.html']},
 {id:'systems',label:'Systems',glyph:'▣',direct:['link','corporate-systems.html']},
 {id:'diagnostics',label:'System Diagnostics',glyph:'◉',direct:['link','corporate-diagnostics.html']},
 {id:'costs',label:'Costs & Revenue',glyph:'◈',direct:['link','corporate-costs-revenue.html']},
 {id:'overview',label:'Executive Workspace',glyph:'▦',desc:'Live corporate monitoring and operational overview.',items:[['User Management','Manage employee accounts, roles, invitations and access.','modal','users'],['Media Import Processor','Review, classify and approve shared-library content.','link','corporate-media-admin.html'],['System Diagnostics','Run real service and server checks.','link','corporate-diagnostics.html'],['Costs & Revenue','Review financial plans and service costs.','link','corporate-costs-revenue.html']]},
 {id:'personnel',label:'Personnel',glyph:'♙',desc:'Corporate identity, employees and account permissions.',items:[['User Management','Accounts, profiles, roles and clearance.','modal','users'],['Employee Chat','Open your existing secure communications interface.','modal','chat'],['Private Photo Ledger','Review authorized private submissions and the shared balance.','link','private-photo-ledger.html']]},
 {id:'divisions',label:'Divisions',glyph:'◇',desc:'Independent corporate applications and division controls.',items:[['NEXUS Management','Records, communications and financial management.','modal','nexus'],["Man’s Armed Forces",'Uniform collections and media operations.','modal','mans']]},
 {id:'media',label:'Media',glyph:'▧',desc:'Shared media administration and the network.',items:[['Media Import Processor','Review, classify and approve photographs and videos.','link','corporate-media-admin.html'],['BLACKCELL Network','Social profiles, updates and video channels.','link','corporate-network.html'],['Private Photo Ledger','Access the existing restricted ledger.','link','private-photo-ledger.html']]},
 {id:'finance',label:'Finance',glyph:'◈',desc:'Corporate expense planning and revenue modeling.',items:[['Costs & Revenue','Service expenses, budgets and future forecasts.','link','corporate-costs-revenue.html'],['Private Photo Ledger','Manage the existing shared balance.','link','private-photo-ledger.html']]},
 {id:'security',label:'Security',glyph:'♢',desc:'Verified identities, security sessions and recorded activity.',items:[['Security Checks','Review owner authorization and session checks.','link','corporate-security-checks.html'],['Activity Logs','Review and export recorded activity.','link','corporate-activity-logs.html'],['My Account','Review the current administrator account.','modal','account']]},
 {id:'infrastructure',label:'Infrastructure',glyph:'◉',desc:'Service checks, applications and configuration recovery.',items:[['System Diagnostics','Run on-demand infrastructure checks.','link','corporate-diagnostics.html'],['Corporate Systems','Application directory and division links.','link','corporate-systems.html'],['Backup & Recovery','Review and restore configuration snapshots, not full data backups.','link','corporate-backups.html']]},
 {id:'intelligence',label:'Intelligence',glyph:'✧',desc:'Analyze content and plan improvements.',items:[['Content Intelligence','Review content gaps, AI suggestions and the roadmap.','link','corporate-content-intelligence.html']]},
 {id:'settings',label:'Administration Settings',glyph:'⚙',desc:'Owner preferences and corporate configuration.',items:[['System Settings','Existing owner settings, appearance, divisions and preferences.','modal','settings'],['Corporate Notifications','Review your notifications.','modal','notifications']]},
 {id:'account',label:'Account',glyph:'◉',desc:'Current executive identity and session.',items:[['My Account','Administrator account information.','modal','account'],['Sign Out','End the current corporate session using the existing secure control.','modal','signout']]}
 ];
 const directIds={'users':'users','corporate-media-admin.html':'processor','corporate-systems.html':'systems','corporate-diagnostics.html':'diagnostics','corporate-costs-revenue.html':'costs'};
 const allowed=new Set(sections.flatMap(s=>(s.items||[]).filter(i=>i[2]==='link').map(i=>i[3])).concat(sections.filter(s=>s.direct?.[0]==='link').map(s=>s.direct[1])));
 const make=(tag,cls,t)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(t!==undefined)n.textContent=t;return n};
 const btn=(label,fn,cls='bc-admin-os-button')=>{const n=make('button',cls,label);n.type='button';n.onclick=fn;return n};
 function start(){
  if(!document.documentElement.classList.contains('corp-ok')||window.BLACKCELL_ADMIN_READY!==true||document.querySelector('.bc-admin-os'))return false;
  const old=document.querySelector('main.admin-dashboard');if(!old)return false;
  const modal=document.getElementById('modalBackdrop'),shell=make('section','bc-admin-os'),rail=make('nav','bc-admin-os-rail'),body=make('main','bc-admin-os-body');rail.setAttribute('aria-label','Administration sections');
  const label=make('div','bc-admin-os-brand');label.append(make('div','bc-admin-os-emblem','B'),make('strong','','Administration'),make('small','','EXECUTIVE / LEVEL 7'));rail.append(label);
  const nav=new Map(),frames=new Map();let selected='overview',inlineUsers=false;const originalParent=modal.parentElement,originalNext=modal.nextSibling;const right=make('section','bc-admin-os-right'),pages=make('div','bc-admin-os-pages'),usersPane=make('div','bc-admin-os-users');pages.hidden=true;usersPane.hidden=true;right.append(body,pages,usersPane);try{const saved=sessionStorage.getItem('bc.admin.os.section');if(sections.some(s=>s.id===saved))selected=saved}catch(_){}
  const save=()=>{try{sessionStorage.setItem('bc.admin.os.section',selected)}catch(_){}};
  const updateNav=()=>{for(const [id,button] of nav){button.classList.toggle('selected',id===selected);button.setAttribute('aria-current',id===selected?'page':'false')}};
  const activity=()=>{if(embedded)parent.postMessage({type:'blackcell-admin-app-activity'},location.origin)};
  function showBody(){pages.hidden=true;for(const record of frames.values())record.panel.hidden=true;usersPane.hidden=true;body.hidden=false}
  function detachUsers(){if(!inlineUsers)return;inlineUsers=false;document.getElementById('closeModal')?.click();modal.classList.remove('bc-admin-inline-modal');modal.querySelector('.admin-modal')?.setAttribute('aria-modal','true');originalParent.insertBefore(modal,originalNext);usersPane.hidden=true}
  function workspace(target,label){
   if(!allowed.has(target))return;
   usersPane.hidden=true;body.hidden=true;pages.hidden=false;for(const item of frames.values())item.panel.hidden=true;
   let rec=frames.get(target);
   if(!rec){
    const panel=make('section','bc-admin-os-workspace'),head=make('header','bc-admin-os-workspace-head'),frame=make('iframe','bc-admin-os-workspace-frame');head.append(make('strong','',label),btn('‹ Executive Workspace',()=>select('overview')));frame.title=label;frame.dataset.bcAdminWorkspace=target;frame.id='bcAdminWorkspace-'+target.replace(/[^a-z]/g,'');frame.allow='fullscreen';panel.append(head,frame);rec={panel,frame};frames.set(target,rec);pages.append(panel);
    frame.addEventListener('load',()=>{try{
     const doc=frame.contentDocument,u=new URL(frame.contentWindow.location.href);if(!doc||u.origin!==location.origin)return;
     if(u.pathname.endsWith('/login.html')){if(embedded)parent.postMessage({type:'blackcell-admin-app-signed-out'},location.origin);else location.replace('login.html');return}
     if(u.pathname.endsWith('/dashboard.html')||u.pathname.endsWith('/blackcell-administration-app.html')){select('overview');frame.contentWindow.location.replace(target+'?adminPane=1&rev='+(target==='corporate-media-admin.html'?'native-media-app-20261114':'3'));return}
     if(!allowed.has(u.pathname.split('/').at(-1)))return;
     doc.documentElement.classList.add('bc-admin-workspace-embedded');const sheet=doc.createElement('link');sheet.rel='stylesheet';sheet.href='blackcell-admin-workspace-embedded.css?v=1';doc.head.append(sheet);
     for(const event of ['pointerdown','keydown','touchstart','wheel'])doc.addEventListener(event,activity,{passive:true});
     doc.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const href=new URL(a.href,location.href);if(href.origin!==location.origin)return;const file=href.pathname.split('/').at(-1);if(file==='dashboard.html'||file==='blackcell-administration-app.html'){e.preventDefault();select('overview');return}if(allowed.has(file)){e.preventDefault();openTarget(file,a.textContent.trim()||file);return}},true)
    }catch(_){}});
    frame.src=target+'?adminPane=1&rev='+(target==='corporate-media-admin.html'?'native-media-app-20261114':'3');
   }
   rec.panel.hidden=false
  }
  function showUsers(){
   body.hidden=true;pages.hidden=true;for(const item of frames.values())item.panel.hidden=true;usersPane.hidden=false;
   if(inlineUsers&&!modal.hidden)return;
   modal.classList.add('bc-admin-inline-modal');modal.querySelector('.admin-modal')?.setAttribute('aria-modal','false');usersPane.append(modal);inlineUsers=true;
   const trigger=document.querySelector('main.admin-dashboard [data-open="users"]');if(trigger)trigger.click();else{detachUsers();showBody();body.append(make('p','bc-admin-os-muted','User Management controls unavailable.'))}
  }
  function openTarget(target,label){if(directIds[target]){select(directIds[target]);return}
   selected=sections.find(s=>s.items?.some(i=>i[3]===target))?.id||'overview';save();updateNav();workspace(target,label)
  }
  function select(id){if(!sections.some(s=>s.id===id))return;selected=id;save();updateNav();const s=sections.find(x=>x.id===id);if(s.direct){if(s.direct[0]==='modal')showUsers();else workspace(s.direct[1],s.label);return}showBody();render();body.scrollTop=0}
  window.addEventListener('message',event=>{if(event.origin!==location.origin||!Array.from(frames.values()).some(r=>event.source===r.frame.contentWindow))return;if(event.data?.type==='blackcell-admin-workspace-activity')activity();if(event.data?.type==='blackcell-admin-workspace-signed-out'){if(embedded)parent.postMessage({type:'blackcell-admin-app-signed-out'},location.origin);else location.replace('login.html')}});

  for(const s of [...sections.filter(s=>s.id==='overview'),...sections.filter(s=>s.id!=='overview')]){const button=btn('',()=>select(s.id),'bc-admin-os-nav');button.append(make('span','bc-admin-os-glyph',s.glyph),make('span','',s.label));rail.append(button);nav.set(s.id,button)}
  rail.append(make('div','bc-admin-os-note','CONTROL IS EVERYTHING.'));
  let monitorRun=0;
  function executiveMonitor(){
   const seq=++monitorRun,summary=make('section','bc-executive-metrics'),cells=new Map();
   const set=(key,value,note,state='')=>{const item=cells.get(key);if(!item)return;item.value.textContent=value;item.note.textContent=note;item.card.dataset.state=state};
   for(const [key,title] of [['members','Registered accounts'],['sessions','Verified sessions'],['pending','Pending media imports'],['media','Registered photo & video'],['database','Database response'],['security','Security attention'],['storage','Corporate storage'],['costs','Monthly operating expenses']]){
    const card=make('article','bc-executive-metric'),value=make('strong','','—'),note=make('small','','Checking…');card.append(make('span','',title),value,note);summary.append(card);cells.set(key,{card,value,note})
   }
   body.append(summary);
   const bar=make('div','bc-executive-status'),stamp=make('span','','Waiting for data…'),refresh=btn('↻ Refresh',()=>void load());bar.append(stamp,refresh);body.append(bar);
   const events=make('section','bc-admin-os-panel bc-executive-activity');events.append(make('h2','','Recent corporate activity'));const list=make('div','bc-executive-events','Loading recorded events…');events.append(list);body.append(events);
   const note=make('p','bc-admin-os-muted','Live readings use verified corporate records. Session totals are verification grants, not online-presence counts. Provider billing, full storage totals and continuous uptime are not connected.');body.append(note);
   const valid=()=>seq===monitorRun&&selected==='overview'&&summary.isConnected&&document.documentElement.classList.contains('corp-ok');
   let loading=false;
   const number=v=>Number.isFinite(Number(v))&&v!==null&&v!==undefined?Number(v):null;
   const count=v=>number(v)===null?'—':Number(v).toLocaleString();
   async function load(){
    if(!valid()||loading||document.hidden)return;loading=true;refresh.disabled=true;stamp.textContent='Refreshing corporate records…';
    const client=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
    set('storage','—','Provider total not connected');set('costs','—','Actual billing not connected');
    if(!client){stamp.textContent='Verified session unavailable';loading=false;refresh.disabled=false;return}
    async function rpc(name,params){const {data,error}=await client.rpc(name,params||{});if(error||data?.ok!==true)throw Error('Unavailable');return data}
    const clock=performance.now();
    const tasks=[
     rpc('corp_admin_members').then(d=>{if(!valid())return;const members=Array.isArray(d.members)?d.members:null;set('members',members?count(members.length):'—',members?'Personnel directory':'Directory unavailable')}).catch(()=>{if(valid())set('members','—','Directory unavailable','warn')}),
     rpc('corp_admin_security_overview').then(d=>{if(!valid())return;set('database',Math.round(performance.now()-clock)+' ms','Verified database RPC','good');const owner=Array.isArray(d.owner_sessions)?d.owner_sessions.length:null,employee=number(d.active_employee_verifications);set('sessions',owner===null||employee===null?'—':count(owner+employee),owner===null||employee===null?'Verification counts unavailable':owner+' owner · '+employee+' employee');const locked=!!d.owner_master_code_locked_until&&new Date(d.owner_master_code_locked_until)>new Date();const fails=number(d.master_code_failed_attempts);set('security',locked?'Locked':fails===null?'—':fails>0?count(fails):'No lock',locked?'Master-code lock active':fails===null?'Security count unavailable':fails>0?'Recorded master-code failures (cumulative)':'No recorded master-code failures',locked||fails>0?'warn':'good')}).catch(()=>{if(valid()){set('database','—','Database check unavailable','warn');set('sessions','—','Verification data unavailable','warn');set('security','—','Security data unavailable','warn')}}),
     Promise.resolve(client.from('corp_social_assets').select('id',{head:true,count:'exact'}).eq('review_status','pending')).then(r=>{if(!valid())return;if(r.error||r.count===null)throw Error('Unavailable');set('pending',count(r.count),r.count?'Awaiting review':'No pending records',r.count?'warn':'good')}).catch(()=>{if(valid())set('pending','—','Media count unavailable','warn')}),
     Promise.resolve(client.from('corp_social_assets').select('id',{head:true,count:'exact'}).in('kind',['photo','video'])).then(r=>{if(!valid())return;if(r.error||r.count===null)throw Error('Unavailable');set('media',count(r.count),'Shared media catalog')}).catch(()=>{if(valid())set('media','—','Media count unavailable','warn')}),
     rpc('corp_admin_console_activity',{p_limit:8}).then(d=>{if(!valid())return;list.replaceChildren();const records=Array.isArray(d.items)?d.items:[];if(!records.length){list.textContent='No recorded events returned.';return}for(const item of records){const r=make('div','bc-admin-os-row'),copy=make('div','bc-admin-os-copy'),date=new Date(item.at);copy.append(make('strong','',String(item.description||item.name||'Recorded event')),make('small','',String(item.source||'Corporate record')));r.append(copy,make('small','bc-executive-date',Number.isFinite(date.getTime())?date.toLocaleString():'Time unavailable'));list.append(r)}}).catch(()=>{if(valid())list.textContent='Recorded activity unavailable.'})
    ];
    try{await Promise.allSettled(tasks);if(valid())stamp.textContent='Last checked '+new Date().toLocaleTimeString()}finally{loading=false;refresh.disabled=false}
   }
   void load();
   const timer=setInterval(()=>{if(!valid()){clearInterval(timer);return}void load()},30000)
  }

  function render(){
   const current=sections.find(x=>x.id===selected)||sections[0];for(const [id,button] of nav){button.classList.toggle('selected',id===current.id);button.setAttribute('aria-current',id===current.id?'page':'false')}
   body.replaceChildren();const header=make('header','bc-admin-os-heading');header.append(make('div','bc-admin-os-kicker','BLACKCELL CORPORATION / ADMINISTRATION'),make('h1','',current.label),make('p','',current.desc));body.append(header);
   if(current.id==='overview'){executiveMonitor();return}
   const panel=make('section','bc-admin-os-panel');panel.append(make('h2','',current.id==='overview'?'Quick access':current.label+' controls'));
   for(const [name,desc,kind,target] of current.items||[]){
    const r=make('div','bc-admin-os-row'),icon=make('span','bc-admin-os-row-icon',current.glyph),copy=make('div','bc-admin-os-copy');copy.append(make('strong','',name),make('small','',desc));r.append(icon,copy);
    if(kind==='modal'){const trigger=document.querySelector('[data-open="'+target+'"]');const action=btn('Open ›',()=>{if(window.BLACKCELL_ADMIN_READY!==true||!document.documentElement.classList.contains('corp-ok'))return;if(target==='users'){select('users');return}if(inlineUsers)detachUsers();trigger?.click()});action.disabled=!trigger;r.append(action)}
    else{const link=btn('Open ›',()=>openTarget(target,name));r.append(link)}
    panel.append(r)
   }
   body.append(panel);

  }
  shell.append(rail,right);old.insertAdjacentElement('afterend',shell);select(selected);document.body.classList.add('bc-admin-os-mode');document.getElementById('bcAdminOsLoading')?.remove();
  // Preserve all original admin controls and their handlers, including the existing modals.
  // Refocus the current sidebar after a modal closes rather than a hidden legacy tile.
  if(modal)new MutationObserver(()=>{if(modal.hidden&&inlineUsers){inlineUsers=false;modal.classList.remove('bc-admin-inline-modal');modal.querySelector('.admin-modal')?.setAttribute('aria-modal','true');originalParent.insertBefore(modal,originalNext);usersPane.hidden=true;if(selected==='users')select('overview')}if(modal.hidden&&document.activeElement?.closest('main.admin-dashboard,#drawer'))nav.get(selected)?.focus()}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  return true
 }
 function attempt(){if(start())return true;return !!document.querySelector('.bc-admin-os')}
 if(!attempt()){const observer=new MutationObserver(()=>{if(attempt())observer.disconnect()});observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-admin-controls']});window.addEventListener('blackcell-corporate-authorized',attempt);let tries=0;const timer=setInterval(()=>{if(attempt()){clearInterval(timer);observer.disconnect()}else if(++tries===120){const label=document.getElementById('bcAdminOsLoadingText');if(label)label.textContent='Administration controls have not finished loading. Reload to retry.';if(retry)retry.hidden=false}else if(tries>=600){clearInterval(timer);observer.disconnect()}},250)}
})();
