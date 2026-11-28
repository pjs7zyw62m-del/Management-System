/* Curated BLACKCELL desktop app catalog. Installation adds a shortcut, not a native executable. */
export function mountStore(host,api){
 host.classList.add('bc-store');
 const make=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e};
 const button=(text,cls,fn)=>{const e=make('button',cls,text);e.type='button';e.onclick=fn;return e};
 const plannedApps=[["notes","Notes","Private notes & notebooks","Write and organize private notes. Planned account-specific saving and synchronization.","#a97d2b","▤"],["calendar","Calendar","Events & schedules","Manage appointments, schedules and calendar events.","#b63b47","▦"],["reminders","Reminders","Tasks & alerts","Organize tasks, due dates, reminders and recurring schedules.","#346bb4","☷"],["contacts","Contacts","Personal address book","Manage private contacts and an authorized corporate directory.","#91764f","♙"],["calculator","Calculator","Standard & scientific","Calculate everyday arithmetic and scientific functions.","#5d6069","±"],["gunner","Gunner AI","Personal AI assistant","A website-aware personal AI assistant with approved tools and permissions. Model integration and security controls are required.","#8e2838","✦"],["music","Music","Personal music library","Organize and play your own authorized audio files and playlists.","#bd365d","♫"],["cinema","Cinema","Personal video library","Organize and play privately stored authorized movies and videos.","#444651","▶"],["wallet","Wallet","Private finances & budgets","Track balances, personal and corporate expenses, savings and reports. Bank connections and real payments would require a separately approved provider; this is not a bank account or stored-value service.","#256f49","▰"],["journal","Journal","Private daily entries","Write personal entries and organize memories by date.","#6a509e","✎"],["vault","Vault","Confidential files","A planned protected file workspace; encryption and access rules must be implemented and verified before release.","#595d68","▣"],["terminal","Terminal","Authorized developer tools","Run approved administrative or developer operations with restricted permissions. No unrestricted server shell.","#25272b","›_"],["voicememos","Voice Memos","Audio recording","Record, play and organize audio with microphone permission.","#a02b40","≋"],["documents","Documents","Word processing","Create and edit documents with private saving and export.","#3573b9","▤"],["spreadsheets","Spreadsheets","Tables & calculations","Create spreadsheets, formulas, budgets and charts.","#328451","▦"],["creativestudio","Creative Studio","AI image & video tools","Create and edit media using supported generation services, subject to provider rules and costs.","#8250b1","✧"],["worldclock","World Clock","Time zones & alarms","See local and international times and configure supported alarms.","#4a4e57","◷"],["presentations","Presentations","Slides & decks","Create presentations, organize slides and export decks.","#4169aa","▱"]].map(([id,title,sub,desc,color,glyph])=>({id,title,sub,desc,color,glyph,planned:true,optional:true,installed:false,allowed:false,removable:false}));
 const uniformIds=['usa','care','innovations','awards','omega','uploadqueue','photos'];
 const isUniform=app=>uniformIds.includes(app.id);
 const categoryIds=['discover','uniform','installed','beta','optional','unavailable','upcoming'];
 // Client labels never authorize access; corp_app_store remains authoritative.
 const isBeta=app=>!app.planned&&/\b(beta|preview|connection pending)\b/i.test(app.sub||'');
 const statusOf=app=>app.catalogUnavailable?'VERIFY CATALOG':app.planned?'COMING SOON':app.enabled===false?'UNAVAILABLE':isBeta(app)?'BETA':app.installed?'INSTALLED':'AVAILABLE';
 const rail=make('nav','bc-store-rail');rail.setAttribute('aria-label','App Store sections');
 const brand=make('div','bc-store-brand');brand.append(make('span','bc-store-brand-mark','✧'),make('strong','','BLACKCELL OS'),make('small','','App Store'));rail.append(brand);
 const body=make('div','bc-store-body'),header=make('header','bc-store-header'),headline=make('h1','','Discover'),search=make('input','bc-store-search');
 search.type='search';search.placeholder='Search apps';search.setAttribute('aria-label','Search apps');search.autocomplete='off';
 const results=make('div','bc-store-results'),banner=make('div','bc-store-feedback');banner.setAttribute('role','status');const controls=make('div','bc-store-release-controls');const refresh=button('Refresh catalog','bc-store-get',async()=>{if(busy||disposed)return;refresh.disabled=true;try{const r=await api.refreshCatalog?.();banner.textContent=r?.ok?'Catalog refreshed.':r?.error||'Catalog refresh unavailable.';render()}catch(_){banner.textContent='Unable to refresh catalog.'}finally{refresh.disabled=false}});const release=button('Check OS update','bc-store-get',()=>{if(!busy)api.checkRelease?.()});const audit=button('Audit installed apps','bc-store-get',()=>{if(!busy)void auditInstalled()});const auditReport=make('section','bc-store-audit');auditReport.hidden=true;auditReport.setAttribute('aria-live','polite');controls.append(search,refresh,audit,release);header.append(headline,controls);body.append(header,banner,auditReport,results);host.append(rail,body);
 // The phone storefront is an alternate presentation of the same authorized
 // catalog. No independent install, open or distribution implementation.
 const mobileTitle=make('h1','bc-store-mobile-title','Today');
 const account=button('B','bc-store-mobile-account',()=>{if(busy||disposed)return;toolsOpen=!toolsOpen;syncMobileNav()});
 account.setAttribute('aria-label','Store account and catalog tools');account.setAttribute('aria-expanded','false');
 header.prepend(mobileTitle,account);
 const mobileNav=make('nav','bc-store-mobile-nav');mobileNav.setAttribute('aria-label','Mobile App Store sections');
 const mobileTools=make('div','bc-store-mobile-tools');mobileTools.hidden=true;
 header.append(mobileTools);host.append(mobileNav);
 let toolsOpen=false,searchMode=false;
 const initial=api.initialState||{};let category=categoryIds.includes(initial.category)?initial.category:'discover',detail=typeof initial.detail==='string'&&/^[a-z]{1,40}$/.test(initial.detail)?initial.detail:null,scrollTarget=Number.isFinite(initial.scroll)?Math.max(0,Math.min(100000,initial.scroll)):0,restoring=true,busy=false,disposed=false,scrollTimer=0,draft=null;search.value=typeof initial.search==='string'?initial.search.slice(0,160):'';
 function persist(){if(!disposed)api.onState?.({category,detail,search:search.value.slice(0,160),scroll:restoring?scrollTarget:body.scrollTop})}
 function navigate(fn){if(busy||disposed)return;draft=null;bulkConfirm=false;restoring=false;if(!desktopMode())desktopFilter='';fn();body.scrollTop=0;render();persist()}
 async function perform(fn,success){if(busy||disposed)return;busy=true;api.onBusy?.(true);host.setAttribute('aria-busy','true');try{const result=await fn();if(!disposed){banner.textContent=result.ok?success:result.error||'Operation failed.';if(result.ok)draft=null}}catch(_){if(!disposed)banner.textContent='Operation failed. Try again.'}finally{busy=false;host.removeAttribute('aria-busy');if(!disposed){render();api.onBusy?.(false)}}}
 /* Check availability of currently installed same-origin app launch pages.
  * A successful probe does not verify application features or cloud access.
  * Never automatically uninstall, delete, or publish content. */
 async function auditInstalled(){
  if(busy||disposed)return;
  audit.disabled=true;auditReport.hidden=false;
  const installed=[...api.catalog().filter(a=>a.installed),...(api.worldCatalog?.()||[])];
  auditReport.replaceChildren(make('strong','','CHECKING INSTALLED APP LAUNCH PAGES…'),
   make('p','','This checks whether the deployed launch pages respond. Internal apps need manual functional tests.'));
  const probe=new Map();
  const statuses=installed.map(app=>{
   if(!app.url)return Promise.resolve({app,status:'internal'});
   let url;try{url=new URL(app.url,location.href)}catch{return Promise.resolve({app,status:'invalid route'})}
   if(url.origin!==location.origin)return Promise.resolve({app,status:'external route'});
   if(url.pathname.endsWith('/blackcell-os.html'))return Promise.resolve({app,status:'internal'});
   if(!probe.has(url.pathname)){
    probe.set(url.pathname,(async()=>{
     const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
     try{
      const response=await fetch(url.pathname+'?_bc_app_audit='+Date.now(),{method:'HEAD',cache:'no-store',credentials:'same-origin',redirect:'follow',signal:controller.signal});
      if(new URL(response.url,location.href).origin!==location.origin)return 'unexpected redirect';
      return response.ok?'reachable':'HTTP '+response.status;
     }catch{return 'unreachable'}
     finally{clearTimeout(timer)}
    })());
   }
   return probe.get(url.pathname).then(status=>({app,status}));
  });
  try{
   const checked=await Promise.all(statuses);
   if(disposed)return;
   const ok=checked.filter(x=>x.status==='reachable').length,internal=checked.filter(x=>x.status==='internal').length;
   const bad=checked.filter(x=>!['reachable','internal'].includes(x.status));
   auditReport.replaceChildren(make('strong','',checked.length+' INSTALLED · '+ok+' ROUTES REACHABLE · '+internal+' INTERNAL · '+bad.length+' TO REVIEW'),
    make('p','','Launch-page availability only. A reachable page may still have broken features. No apps, account records or media were changed.'));
   if(bad.length)for(const item of bad)auditReport.append(make('p','','CHECK '+item.app.title+' · '+item.status));
   else auditReport.append(make('p','','No missing launch pages detected. Open each app to verify its features.'));
  }finally{audit.disabled=false}
 }
 const categories=[['discover','Discover','✦'],['uniform','Uniform & Military','⚑'],['installed','Installed','▦'],['beta','Beta Lab','⚗'],['optional','All add-ons','⊕'],['unavailable','Unavailable','×'],['upcoming','Coming Soon','◷']];
 const navButtons=categories.map(([id,name,icon])=>{const b=button(icon+'  '+name,'bc-store-nav',()=>{searchMode=false;toolsOpen=false;navigate(()=>{category=id;detail=null;search.value=''})});rail.append(b);return [id,b]});
 rail.append(make('p','bc-store-railnote','BLACKCELL CORPORATION\nRestricted distribution'));
 // Desktop-only sidebar; routes reuse the authorized catalog and original actions.
 const desktopMode=()=>!document.documentElement.matches('.bc-os-phone,.bc-os-tablet');
 let desktopFilter='';
 const desktopRail=make('div','bc-store-desktop-rail');
 const desktopSearch=make('input','bc-store-desktop-search');desktopSearch.type='search';desktopSearch.placeholder='Search App Store';desktopSearch.setAttribute('aria-label','Search App Store');desktopSearch.autocomplete='off';
 desktopRail.append(desktopSearch);
 const desktopSections=[
  ['discover','Discover','M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z'],
  ['optional','Apps','M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  ['uniform','Uniform & Military','M12 3l8 3v6c0 5-5 8-8 9-3-1-8-4-8-9V6z M7 11h10 M9 15h6'],
  ['creative','Creative','M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h4a2 2 0 0 0 2-2 9 9 0 0 0-9-8z M7 10h.1 M11 7h.1 M16 8h.1'],
  ['productivity','Productivity','M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v2h4v-2'],
  ['security','Security','M12 3l8 3v6c0 5-5 8-8 9-3-1-8-4-8-9V6z M8 12l3 3 5-6'],
  ['utilities','Utilities','M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h4'],
  ['developer','Developer','M8 6l-6 6 6 6 M16 6l6 6-6 6 M14 4l-4 16'],
  ['categories','Categories','M3 5h18 M3 12h18 M3 19h18 M7 3v4 M16 10v4 M10 17v4'],
  ['installed','Installed','M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5'],
  ['updates','Updates','M20 8a8 8 0 1 0 0 8 M20 3v5h-5'],
  ['beta','Beta Lab','M9 3h6 M10 3v6L4 19h16L14 9V3 M7 15h10'],
  ['upcoming','Coming Soon','M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l4 2'],
  ['unavailable','Unavailable','M5 5l14 14 M19 5L5 19']
 ];
 const desktopTags={
  uniform:uniformIds,
  creative:['personalphotos','film','shorts','music','cinema','creativestudio','voicememos'],
  productivity:['files','notes','calendar','reminders','mail','contacts','documents','spreadsheets','presentations','journal','wallet'],
  security:['photoledger','administration','vault','settings'],
  utilities:['browser','settings','calculator','worldclock','network','files'],
  developer:['developerpreview','terminal','gunner','creativestudio']
 };
 function desktopNavigate(id){
  if(busy||disposed)return;
  searchMode=false;toolsOpen=false;
  navigate(()=>{desktopFilter=id!=='uniform'&&(desktopTags[id]||['categories','updates'].includes(id))?id:'';category=desktopFilter?'discover':id;detail=null;search.value=''});
 }
 const desktopButtons=desktopSections.map(([id,name,path])=>{
  const b=button('','bc-store-nav bc-store-desktop-nav',()=>desktopNavigate(id));b.append(tabIcon(path),make('span','',name));desktopRail.append(b);return [id,b];
 });
 const desktopAccount=make('div','bc-store-desktop-account');desktopAccount.append(make('span','bc-store-desktop-avatar','B'),make('div','bc-store-desktop-account-copy'));
 desktopAccount.lastChild.append(make('strong','','Corporate Account'),make('small','','Secure workspace'));desktopRail.append(desktopAccount);rail.prepend(desktopRail);
 desktopSearch.addEventListener('input',()=>{navigate(()=>{desktopFilter='';category='discover';detail=null;search.value=desktopSearch.value})});
 const mobileItems=[['discover','Today','M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5'],['optional','Apps','M12 3 3 8l9 5 9-5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5'],['installed','Installed','M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5'],['beta','Beta','M9 3h6 M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3 M7 15h10'],['search','Search','M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0']];
 function tabIcon(path){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),shape=document.createElementNS(ns,'path');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','bc-store-tab-icon');
  shape.setAttribute('d',path);shape.setAttribute('fill','none');shape.setAttribute('stroke','currentColor');shape.setAttribute('stroke-width','1.9');shape.setAttribute('stroke-linecap','round');shape.setAttribute('stroke-linejoin','round');
  svg.append(shape);return svg;
 }
 const mobileButtons=mobileItems.map(([id,label,glyph])=>{
  const b=button('','bc-store-mobile-tab',()=>{
   if(busy||disposed)return;
   toolsOpen=false;searchMode=id==='search';
   navigate(()=>{category=searchMode?'discover':id;detail=null;search.value=''});
   if(searchMode)search.focus();
  });
  const icon=tabIcon(glyph);
  b.append(icon,make('span','',label));mobileNav.append(b);return [id,b];
 });
 const extraButtons=['uniform','upcoming','unavailable'].map(id=>{
  const b=button(categories.find(c=>c[0]===id)[1],'bc-store-mobile-tool',()=>{if(busy||disposed)return;toolsOpen=false;searchMode=false;navigate(()=>{category=id;detail=null;search.value=''})});
  mobileTools.append(b);return [id,b];
 });
 function syncMobileNav(){
  const info=api.info(),searching=searchMode||!!search.value.trim();
  const selected=searching?'search':category;
  mobileTitle.textContent=detail?'App Details':searching?'Search':({discover:'Today',uniform:'Uniform & Military',optional:'Apps',installed:'Installed',beta:'Beta Lab',upcoming:'Coming Soon',unavailable:'Unavailable'}[category]||'Today');
  host.classList.toggle('bc-store-searching',searching&&!detail);
  host.classList.toggle('bc-store-tools-open',toolsOpen);
  account.setAttribute('aria-expanded',String(toolsOpen));mobileTools.hidden=!toolsOpen;
  for(const [id,b] of mobileButtons){b.classList.toggle('selected',selected===id);if(selected===id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
  for(const [id,b] of extraButtons)b.hidden=id==='unavailable'&&!info.owner;
 }
 function drawIcon(icon,app){if(app.id==='photoledger'){icon.dataset.appId=app.id;return}if(app.icon){icon.append(app.icon.cloneNode(true));return}icon.style.background='linear-gradient(145deg,'+app.color+',#17171d)';const g=make('span','bc-store-planned-glyph',app.glyph);g.style.fontSize=icon.classList.contains('large')?'38px':'25px';g.style.fontWeight='650';g.setAttribute('aria-hidden','true');icon.append(g)}
 function card(app){const c=make('article','bc-store-app'),icon=make('div','bc-store-icon');drawIcon(icon,app);c.dataset.appId=app.id;c.dataset.appState=app.catalogUnavailable?'verify':app.planned?'planned':!app.allowed?'locked':app.installed?'installed':'available';icon.dataset.appId=app.id;const copy=make('div','bc-store-copy'),name=button(app.title,'bc-store-link',()=>navigate(()=>{detail=app.id}));copy.append(name,make('p','',app.sub),make('span','bc-store-status',statusOf(app)));
 const action=button(app.catalogUnavailable?'RETRY':app.planned?'COMING SOON':!app.allowed?'LOCKED':app.installed?'OPEN':'GET','bc-store-get',async()=>{if(app.catalogUnavailable){await refresh.onclick();return}if(app.installed){api.open(app.id);return}action.disabled=true;await perform(()=>api.install(app.id,true),'Added '+app.title+' to your desktop.')});action.disabled=!app.catalogUnavailable&&(app.planned||!app.allowed);
 const actions=make('div','bc-store-app-actions');actions.append(action);if(app.removable&&app.installed){const uninstall=button('Uninstall','bc-store-card-uninstall',async()=>{uninstall.disabled=true;await perform(()=>api.install(app.id,false),app.title+' uninstalled. Your app data is unchanged.')});actions.append(uninstall)}c.append(icon,copy,actions);return c}
 function uniformEntry(apps){
  const available=apps.filter(a=>isUniform(a)&&a.enabled!==false&&a.allowed&&!a.planned);
  if(!available.length)return;
  const section=make('section','bc-store-group');
  section.append(make('h2','','Collections'));
  const entry=button('','bc-store-uniform-entry',()=>{searchMode=false;toolsOpen=false;navigate(()=>{desktopFilter='';category='uniform';detail=null;search.value=''})});
  entry.append(make('span','bc-store-uniform-mark','⚑'));
  const copy=make('div','bc-store-uniform-copy');copy.append(make('strong','','Uniform & Military'),make('small','',available.length+' available applications · Archives, intelligence & uniform resources'));
  entry.append(copy,make('span','bc-store-uniform-chevron','›'));section.append(entry);results.append(section);
 }
 function group(title,apps){if(!apps.length)return;const section=make('section','bc-store-group');section.append(make('h2','',title));const grid=make('div','bc-store-grid');for(const app of apps)grid.append(card(app));section.append(grid);results.append(section)}
 function desktopEditorial(apps){
  const eligible=apps.filter(a=>a.allowed&&a.enabled!==false&&!a.planned&&!a.catalogUnavailable&&!isBeta(a)&&a.id!=='store');
  const preferred=['photoledger','mail','personalphotos','files','chat','browser','film','network'];
  const ranked=[...eligible].sort((a,b)=>(preferred.includes(a.id)?preferred.indexOf(a.id):100)-(preferred.includes(b.id)?preferred.indexOf(b.id):100));
  if(!ranked.length)return;
  const feed=make('section','bc-store-desktop-editorial');feed.setAttribute('aria-label','Desktop featured applications');
  function promo(app,primary){
   const item=make('article',primary?'bc-store-desktop-hero':'bc-store-desktop-promo');item.dataset.appId=app.id;
   const art=make('div','bc-store-desktop-art');art.setAttribute('aria-hidden','true');
   // Original vector artwork: layered orbital panels, signal lines, and existing app emblem.
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 400 230');svg.setAttribute('preserveAspectRatio','xMidYMid slice');
   const shape=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);svg.append(e)};
   for(let i=0;i<7;i++)shape('ellipse',{cx:240,cy:115,rx:56+i*23,ry:26+i*12,transform:'rotate(-28 240 115)',fill:'none',stroke:'currentColor','stroke-width':i%3===0?2:1,opacity:.13+i*.035});
   for(let i=0;i<8;i++)shape('path',{d:'M'+(i*63-100)+' 230L'+(i*63+65)+' 0',stroke:'currentColor',fill:'none','stroke-width':i%3===0?13:1,opacity:.08});
   for(let i=0;i<5;i++)shape('circle',{cx:105+i*58,cy:40+(i%3)*63,r:i%2?3:5,fill:'currentColor',opacity:.6});
   shape('path',{d:'M0 168H80L120 128H170 M285 92H330L380 42H400',stroke:'currentColor',fill:'none','stroke-width':2,opacity:.55});
   art.append(svg);const emblem=make('div','bc-store-icon bc-store-desktop-emblem');emblem.dataset.appId=app.id;drawIcon(emblem,app);art.append(emblem);
   const copy=make('div','bc-store-desktop-promo-copy');copy.append(make('span','bc-store-desktop-kicker',primary?'FEATURED APPLICATION':'EXPLORE BLACKCELL'),make(primary?'h2':'h3','',app.title),make('p','',app.sub||'BLACKCELL application'));
   const more=button(primary?'View application':'Learn more','bc-store-desktop-more',()=>navigate(()=>{detail=app.id}));copy.append(more);
   if(primary){const action=card(app).querySelector('.bc-store-get');action.classList.add('bc-store-desktop-hero-action');copy.append(action)}
   item.append(art,copy);return item;
  }
  feed.append(promo(ranked[0],true));
  if(ranked.length>1){const row=make('div','bc-store-desktop-promos');for(const app of ranked.slice(1,4))row.append(promo(app,false));feed.append(row)}
  results.append(feed);
 }
 function editorial(apps){
  const eligible=apps.filter(a=>a.allowed&&a.enabled!==false&&!a.planned&&!a.catalogUnavailable&&!isBeta(a)&&a.id!=='store');
  const preferred=['photoledger','mail','personalphotos','chat','film','files','network'];
  const sorted=[...eligible].sort((a,b)=>(preferred.includes(a.id)?preferred.indexOf(a.id):100)-(preferred.includes(b.id)?preferred.indexOf(b.id):100));
  const featured=sorted.slice(0,2);if(!featured.length)return;
  const feed=make('section','bc-store-editorial');feed.setAttribute('aria-label','Featured BLACKCELL applications');
  for(const app of featured){
   const story=make('article','bc-store-story');story.dataset.appId=app.id;
   const art=button('','bc-store-story-art',()=>navigate(()=>{detail=app.id}));art.setAttribute('aria-label','View '+app.title);
   const badge=make('span','bc-store-story-kicker',app.installed?'EXPLORE YOUR WORKSPACE':'AVAILABLE TO INSTALL');
   const icon=make('div','bc-store-icon bc-store-story-icon');icon.dataset.appId=app.id;drawIcon(icon,app);
   const copy=make('div','bc-store-story-copy');copy.append(make('h2','',app.title),make('p','',app.sub||'BLACKCELL application'));
   art.append(badge,icon,copy);
   // Reuse the original catalog card with its original guarded action and
   // uninstall controls, rather than creating a second install path.
   story.append(art,card(app));feed.append(story);
  }
  results.append(feed);
 }
 let bulkConfirm=false;
 function render(){
  if(disposed||busy)return;const before=restoring?scrollTarget:body.scrollTop;const live=api.catalog(),info=api.info();const missing=info.missingLedger&&!live.some(a=>a.id==='photoledger')?[{id:'photoledger',title:'BLACKCELL REDLINE',sub:'Awaiting authorized catalog',desc:'The app is registered. Refresh the authorized catalog or verify your corporate session before installation.',color:'#656772',glyph:'▣',catalogUnavailable:true,optional:true,installed:false,allowed:false,removable:false}]:[];const all=[...live,...missing,...plannedApps.filter(a=>!live.some(b=>b.id===a.id))];for(const [id,b] of navButtons){b.hidden=id==='unavailable'&&!info.owner;b.classList.toggle('selected',category===id)}if(category==='unavailable'&&!info.owner)category='discover';
  if(!desktopMode())desktopFilter='';desktopSearch.value=search.value;for(const [id,b] of desktopButtons){b.hidden=id==='unavailable'&&!info.owner;b.classList.toggle('selected',id===(desktopFilter||category)&&!search.value.trim());}headline.textContent=detail?'App Details':desktopMode()&&desktopFilter?desktopSections.find(c=>c[0]===desktopFilter)[1]:desktopMode()&&search.value.trim()?'Search results':categories.find(c=>c[0]===category)[1];syncMobileNav();results.replaceChildren();if(info.error)results.append(make('p','bc-store-empty',info.error));if(info.release){const report=make('p','bc-store-muted','OS '+info.release+' · '+info.registered+' registered apps · REDLINE: '+info.ledger);report.style.cssText='font-size:11px;color:#a9a9b5;margin:0 0 12px';results.append(report)}if(info.missingLedger)results.append(make('p','bc-store-empty','The server has not returned BLACKCELL REDLINE for this session. Refresh the catalog. If verification has expired, sign in again.'));if(info.sessionRequired)results.append(button('Verify corporate access ↗','bc-store-get',()=>api.reauthorize?.()));
  if(detail){const a=all.find(x=>x.id===detail);if(!a){if(info.error){results.append(make('p','bc-store-empty','Waiting for the authorized catalog…'));return}detail=null;draft=null;render();return}results.append(button('‹ Back','bc-store-back',()=>navigate(()=>{detail=null})));const hero=make('article','bc-store-detail'),ico=make('div','bc-store-icon large');drawIcon(ico,a);const copy=make('div');copy.append(make('h2','',a.title),make('span','bc-store-status',statusOf(a)),make('p','',a.desc),make('p','bc-store-muted',a.catalogUnavailable?'Registered · Authorization not yet confirmed':a.planned?'In development · Not yet installable':a.optional?'Free · BLACKCELL desktop shortcut':'BLACKCELL system application · Reinstall anytime'));const action=button(a.catalogUnavailable?'RETRY':a.planned?'COMING SOON':!a.allowed?'LOCKED':a.installed?'OPEN':'GET','bc-store-get',async()=>{if(a.catalogUnavailable){await refresh.onclick();return}if(a.installed){api.open(a.id);return}action.disabled=true;await perform(()=>api.install(a.id,true),'Added '+a.title+' to your desktop.')});action.disabled=!a.catalogUnavailable&&(a.planned||!a.allowed);copy.append(action);if(a.optional&&!a.planned&&!a.catalogUnavailable)copy.append(make('p','bc-store-muted','Distribution: '+(a.minLevel===7?'Level 7 administrator only':'Level '+a.minLevel+' and above')));
   if(a.removable&&a.installed)copy.append(button('Uninstall app','bc-store-remove',async()=>{await perform(()=>api.install(a.id,false),'App uninstalled. Your saved data is unchanged.')}));if(info.owner&&a.optional&&!a.planned&&!a.catalogUnavailable){const settings=make('div','bc-store-rule');settings.append(make('h3','','Distribution controls'));const level=make('select','bc-store-level');level.setAttribute('aria-label','Minimum clearance');for(let n=1;n<=7;n++){const opt=make('option','',n===7?'Level 7 · Administrator only':'Level '+n+' and above');opt.value=String(n);level.append(opt)}level.value=String(draft?.id===a.id?draft.level:a.minLevel);const enabled=make('input');enabled.type='checkbox';enabled.checked=draft?.id===a.id?draft.enabled:a.enabled;const remember=()=>{draft={id:a.id,level:Number(level.value),enabled:enabled.checked}};level.onchange=remember;enabled.onchange=remember;const check=make('label','bc-store-enabled',' Available for distribution');check.prepend(enabled);const caution=make('p','bc-store-muted','Disabling distribution hides the app after catalog refresh. Saved files and account data are not removed.');
    const save=button('SAVE DISTRIBUTION','bc-store-get',async()=>{
      if(a.enabled&&!enabled.checked&&!confirm('Disable '+a.title+' for members? The app shortcut will disappear after catalog refresh; stored data is preserved.'))return;
      save.disabled=true;await perform(()=>api.setRule(a.id,Number(level.value),enabled.checked),'Distribution policy saved.');
    });settings.append(level,check,caution,save);copy.append(settings)}hero.append(ico,copy);results.append(hero);restoreScroll(before,info);return}
  if(category==='installed'&&all.some(a=>a.installed&&a.removable)){const strip=make('div','bc-store-bulk');if(!bulkConfirm){strip.append(make('p','','Customize your desktop. Your files and account data stay intact.'),button('Remove all apps','bc-store-remove',()=>{bulkConfirm=true;render()}))}else{strip.append(make('p','','Remove every installed app except the App Store? You can reinstall approved apps anytime.'),button('Cancel','bc-store-back',()=>{bulkConfirm=false;render()}),button('Remove all','bc-store-remove',async()=>{bulkConfirm=false;await perform(()=>api.removeAll(),'All apps removed except the App Store. Your data is unchanged.')}))}results.append(strip)}
  const q=search.value.trim().toLowerCase();let filtered=all.filter(a=>(info.owner||a.enabled!==false)&&(!q||q.split(/\s+/).every(word=>[a.title,a.sub,a.desc,a.id].join(' ').toLowerCase().includes(word))));if(!q&&!searchMode){if(category==='installed')filtered=filtered.filter(a=>a.installed);if(category==='optional')filtered=filtered.filter(a=>a.optional&&!a.planned&&!isBeta(a)&&a.enabled!==false&&!isUniform(a));if(category==='uniform')filtered=filtered.filter(a=>isUniform(a)&&a.enabled!==false&&a.allowed&&!a.planned).sort((a,b)=>uniformIds.indexOf(a.id)-uniformIds.indexOf(b.id));if(category==='beta')filtered=filtered.filter(a=>isBeta(a)&&a.enabled!==false);if(category==='unavailable')filtered=filtered.filter(a=>info.owner&&!a.planned&&a.enabled===false);if(category==='discover')filtered=filtered.filter(a=>!a.planned&&!isBeta(a)&&a.enabled!==false&&!isUniform(a));if(category==='upcoming')filtered=filtered.filter(a=>a.planned)}
  if(desktopMode()&&!q&&desktopFilter){if(desktopFilter==='updates'){const panel=make('section','bc-store-desktop-update');panel.append(make('h2','','Software updates'),make('p','','Check the current BLACKCELL OS release and refresh the authorized application catalog.'),button('Check OS update','bc-store-get',()=>release.click()),button('Refresh catalog','bc-store-get',()=>refresh.click()));results.append(panel);restoreScroll(before,info);return}if(desktopFilter==='categories'){for(const [id,name] of desktopSections.filter(([id])=>desktopTags[id]))group(name,all.filter(a=>(info.owner||a.enabled!==false)&&desktopTags[id].includes(a.id)));restoreScroll(before,info);return}filtered=all.filter(a=>(info.owner||a.enabled!==false)&&desktopTags[desktopFilter]?.includes(a.id));group(desktopSections.find(c=>c[0]===desktopFilter)[1],filtered);if(!filtered.length)results.append(make('p','bc-store-empty','No applications in this category.'));restoreScroll(before,info);return}
  if(!q&&!searchMode&&category==='uniform'){const heading=make('section','bc-store-feature');const copy=make('div','bc-store-feature-copy');copy.append(make('div','bc-store-kicker','BLACKCELL / COLLECTIONS'),make('h2','','Uniform & Military'),make('p','','Explore military archives, uniform resources, intelligence and authorized specialist applications.'));heading.append(copy,make('div','bc-store-feature-symbol','⚑'));results.append(heading);group('Uniform & Military applications',filtered);if(!filtered.length)results.append(make('p','bc-store-empty','No approved applications in this collection.'));restoreScroll(before,info);return}
  if(!q&&!searchMode&&['discover','optional'].includes(category))uniformEntry(live);
  if(!q&&category==='discover'&&!searchMode){editorial(filtered);if(desktopMode())desktopEditorial(filtered);const hero=make('div','bc-store-feature'),copy=make('div','bc-store-feature-copy');const heroTitle=make('h2','','Ready for ');heroTitle.append(make('em','','work.'));copy.append(make('div','bc-store-kicker','BLACKCELL OS  /  DISCOVER'),heroTitle,make('p','','Discover operational BLACKCELL apps. Unfinished previews are in Beta Lab. Removing shortcuts does not erase account data.'));const symbol=make('div','bc-store-feature-symbol','✧');hero.append(copy,symbol);results.append(hero)}
  if(!filtered.length){results.append(make('p','bc-store-empty','No approved applications match your selection.'));restoreScroll(before,info);return}
  if(category==='discover'&&!q&&!searchMode){const released=filtered.filter(a=>['photoledger','mail'].includes(a.id));group(desktopMode()?'Essential BLACKCELL Apps':'Discover applications',[...released.sort((a,b)=>['photoledger','mail'].indexOf(a.id)-['photoledger','mail'].indexOf(b.id)),...filtered.filter(a=>a.optional&&!released.includes(a)),...filtered.filter(a=>!a.optional&&!released.includes(a))])}else group(q||searchMode?'Search results':category==='installed'?'Your applications':category==='beta'?'Beta applications':category==='unavailable'?'Disabled applications':category==='upcoming'?'In development':'Applications',filtered);restoreScroll(before,info);
 }
 function restoreScroll(top,info){if(restoring&&info.error)return;restoring=false;body.scrollTop=top;persist()}
 search.addEventListener('input',()=>navigate(()=>{detail=null}));body.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(persist,100)},{passive:true});render();return {render,selectCategory(next){if(!busy&&categoryIds.includes(next)){searchMode=false;toolsOpen=false;navigate(()=>{desktopFilter='';category=next;detail=null;search.value=''})}},dispose(){disposed=true;clearTimeout(scrollTimer)}};
}