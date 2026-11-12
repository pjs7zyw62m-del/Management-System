/* BLACKCELL Media Administration Workspace
 * App-style owner-only section navigation; existing DOM controls are MOVED,
 * never cloned or rewritten. Each section loads its own integrations only
 * after the verified owner opens it. */
export function createCorporateMediaWorkspace({onEnter,onRefresh,member}){
 const $=id=>document.getElementById(id);
 const main=document.querySelector('.bc-media-admin-shell');
 if(!main)throw Error('ADMIN_SHELL_MISSING');
 const definitions=[
  {id:'overview',icon:'⌂',name:'Command Center',label:'OVERVIEW',
   title:'Media operations.',subtitle:'Your private media system at a glance. Start with the task you need.'},
  {id:'review',icon:'▣',name:'Review & Approval',label:'INTAKE',
   title:'Review & approve.',subtitle:'Prepare private Bunny originals, classify content, and authorize library publication.'},
  {id:'bunny',icon:'◈',name:'Bunny Storage',label:'PRIMARY CLOUD',
   title:'Your private cloud.',subtitle:'Upload batches, check connection health and keep the Military Library safely archived.'},
  {id:'diagnostics',icon:'⌁',name:'Diagnostics',label:'SYSTEM HEALTH',
   title:'System diagnostics.',subtitle:'Test your device, private photo delivery, database and connected storage.'},
  {id:'legacy',icon:'⚙',name:'Legacy & Settings',label:'ADVANCED',
   title:'Legacy tools & settings.',subtitle:'Optional Backblaze controls and other advanced administration tools.'}
 ];
 const el=(tag,cls='',txt)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(txt!==undefined)node.textContent=txt;
  return node;
 };
 const originalChildren=[...main.children];
 const lookup=new Map(originalChildren.filter(e=>e.id).map(e=>[e.id,e]));
 const required=id=>{
  const node=lookup.get(id);
  if(!node)throw Error('ADMIN_SECTION_MISSING_'+id);
  return node;
 };
 const shell=el('div','bc-workspace');
 const sidebar=el('aside','bc-workspace-sidebar');
 sidebar.setAttribute('aria-label','Media administration sections');
 const brand=el('div','bc-workspace-brand');
 brand.append(el('span','bc-workspace-brand-mark','B'));
 const titleBlock=el('div');
 titleBlock.append(el('strong','','BLACKCELL'),el('small','','MEDIA COMMAND'));
 brand.append(titleBlock);
 sidebar.append(brand);
 const hint=el('div','bc-workspace-nav-hint','WORKSPACES');
 sidebar.append(hint);
 const nav=el('nav','bc-workspace-nav');
 nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Administration workspaces');
 sidebar.append(nav);

 const sideFooter=el('div','bc-workspace-footer');
 const secured=el('div','bc-workspace-secure');
 secured.append(el('span','bc-workspace-secure-dot'),el('span','','LEVEL 7 · VERIFIED'));
 sideFooter.append(secured,el('small','','PRIVATE MEDIA · OWNER ACCESS'));
 sidebar.append(sideFooter);

 const region=el('div','bc-workspace-region');
 const header=el('div','bc-workspace-context');
 const description=el('div','bc-workspace-context-text');
 const crumb=el('div','bc-workspace-overline','BLACKCELL / MEDIA ADMINISTRATION');
 const headline=el('h2','bc-workspace-headline','Media operations.');
 const subtitle=el('p','bc-workspace-subtitle','');
 description.append(crumb,headline,subtitle);header.append(description);
 const tools=el('div','bc-workspace-header-tools');
 const updateBtn=el('button','bc-workspace-refresh','↻ REFRESH COUNTS');
 updateBtn.type='button';
 const live=el('span','bc-workspace-live','PRIVATE · OWNER SESSION');
 tools.append(updateBtn,live);
 header.append(tools);region.append(header);
 const panels=el('div','bc-workspace-panels');region.append(panels);
 shell.append(sidebar,region);
 const paneMap=new Map(),tabMap=new Map(),loading=new Map(),loaded=new Set();
 const overview=el('div','bc-overview');
 const chips=el('div','bc-overview-kicker','RESTRICTED / EXECUTIVE MEDIA CONTROL');
 const hero=el('div','bc-overview-hero');
 const heroText=el('div','bc-overview-hero-text');
 heroText.append(chips,el('h2','','Your media. One control center.'),
  el('p','','Upload to Bunny, review incoming media, maintain the Military Library, and monitor your system—without navigating a long settings page.'));
 const heroLogo=el('div','bc-overview-hero-logo','B');heroLogo.setAttribute('aria-hidden','true');
 hero.append(heroText,heroLogo);
 overview.append(hero);
 const actionHeading=el('div','bc-overview-section-title');
 actionHeading.append(el('strong','','QUICK OPERATIONS'),el('small','','Select a task to open its workspace'));
 overview.append(actionHeading);
 const actionGrid=el('div','bc-overview-actions');
 const actions=[
  ['review','▣','REVIEW INCOMING','Prepare, classify and approve', 'bcOverviewReview'],
  ['bunny','↑','UPLOAD TO BUNNY','Send photo and video batches','bcOverviewUpload'],
  ['diagnostics','⌁','RUN DIAGNOSTICS','Check photo and server performance','bcOverviewHealth'],
  ['bunny','◈','CLOUD & ARCHIVE','Storage health and verified copies','bcOverviewCloud']
 ];
 const shortcutButtons=[];
 for(const [id,icon,label,desc,btnId] of actions){
  const button=el('button','bc-overview-action');button.type='button';button.id=btnId;
  button.append(el('span','bc-overview-action-icon',icon));
  const body=el('div');
  body.append(el('strong','',label),el('small','',desc));
  button.append(body,el('span','bc-overview-action-chevron','›'));
  button.addEventListener('click',()=>void open(id,{action:id==='diagnostics'?'run':null}));
  shortcutButtons.push(button);actionGrid.append(button);
 }
 overview.append(actionGrid);
 const workflow=el('div','bc-overview-workflow');
 workflow.append(el('strong','','PRIVATE MEDIA WORKFLOW'));
 const stages=el('div','bc-workflow-steps');
 for(const [step,label] of [
  ['01','BUNNY UPLOAD'],['02','PRIVATE REVIEW'],['03','OWNER APPROVAL'],['04','LIBRARY & ARCHIVE']
 ]){
  const card=el('div','bc-workflow-stage');
  card.append(el('span','',step),el('strong','',label));stages.append(card);
 }
 workflow.append(stages,el('p','','Original photos stay private. Approvals and adult restrictions are enforced by the existing BLACKCELL security system. Bunny is the verified archive; the gallery currently uses protected Supabase image delivery.'));
 overview.append(workflow);
 const bottom=el('div','bc-overview-bottom');
 const libraryLink=el('a','bc-overview-library-link','OPEN LIVE MILITARY LIBRARY ↗');
 libraryLink.href='corporate-network.html?view=photos';
 bottom.append(libraryLink);
 const updated=el('span','bc-overview-updated','COUNTS NOT CHECKED');
 bottom.append(updated);overview.append(bottom);
 // Pane construction: move original elements by reference to preserve IDs,
 // input values, file input gestures, and each existing module's event handlers.
 for(const d of definitions){
  const button=el('button','bc-workspace-tab');
  button.type='button';button.dataset.adminTab=d.id;button.setAttribute('role','tab');
  button.id='bcTab-'+d.id;button.setAttribute('aria-controls','bcPane-'+d.id);
  button.setAttribute('aria-selected','false');
  const mark=el('span','bc-workspace-tab-icon',d.icon);
  const words=el('span','bc-workspace-tab-words');
  words.append(el('strong','',d.name),el('small','',d.label));
  const suffix=el('span','bc-workspace-tab-suffix',d.id==='review'?'—':'');
  button.append(mark,words,suffix);
  button.addEventListener('click',()=>void open(d.id));
  nav.append(button);tabMap.set(d.id,{button,suffix});
  const pane=el('section','bc-workspace-pane');
  pane.id='bcPane-'+d.id;pane.dataset.adminPane=d.id;
  pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',button.id);
  pane.hidden=true;panels.append(pane);paneMap.set(d.id,pane);
 }
 // Move old sections into the right workspace. No duplicate DOM IDs.
 const move=(id,to)=>paneMap.get(to).append(required(id));
 move('bcMediaDiagnostics','diagnostics');
 move('bcBunnyConnection','bunny');
 move('bcLibraryBunnySync','bunny');
 move('bcBunnyBulkPanel','bunny');
 move('bcProcessorPanel','review');
 move('bcB2Connection','legacy');
 move('bcBulkIntake','legacy');

 // The remaining unnamed sections are directly under the original main.
 const introduction=main.querySelector(':scope > .bc-media-admin-intro');
 const stats=main.querySelector(':scope > .bc-media-admin-summary');
 const icloud=main.querySelector(':scope > .bc-icloud-test');
 const explainer=main.querySelector(':scope > .bc-media-admin-explainer');
 if(!introduction||!stats||!icloud||!explainer)throw Error('ADMIN_LAYOUT_SOURCE_MISSING');
 // Preserve metric IDs used by existing controllers.
 paneMap.get('overview').append(overview,stats);
 paneMap.get('legacy').append(icloud,explainer);
 // Keep the originally approved intro and summary content available, but
 // show its data in the new hero and metric strip, not two huge hero blocks.
 introduction.hidden=true;
 paneMap.get('overview').append(introduction);

 const legacyNotice=el('div','bc-workspace-legacy-note');
 legacyNotice.append(el('strong','','OPTIONAL / LEGACY SERVICES'),
  el('p','','Bunny Storage is your primary connected vault. Backblaze and iCloud-to-Backblaze tools are retained for compatibility, but no legacy connection test starts automatically.'));
 paneMap.get('legacy').prepend(legacyNotice);

 const reviewNotice=el('div','bc-workspace-review-note');
 reviewNotice.append(el('span','','PRIVATE INTAKE'),
  el('strong','','Owner approval is required for publication.'),
  el('p','','Prepare originals from Bunny, verify country and subject labels, confirm rights and age restrictions when relevant, and then approve. Unsure? Keep media pending.'));
 paneMap.get('review').prepend(reviewNotice);

 const btnToDanger=$('bcMediaReset');
 if(btnToDanger){
  const danger=el('details','bc-workspace-danger');
  const summaryDanger=el('summary','','Danger Zone · Reset Media Library');
  const explanation=el('p','','This destructive action is separate from routine review. It permanently removes original Supabase files and associated records after multiple confirmations. Do not use it for performance troubleshooting or Bunny sync.');
  danger.append(summaryDanger,explanation,btnToDanger);
  paneMap.get('legacy').append(danger);
 }

 main.replaceChildren(shell);

 let current=null;
 let busyTabs=new Set();
 async function open(id,{action=null}={}){
  if(!paneMap.has(id))id='overview';
  const currentDef=definitions.find(x=>x.id===id);
  current=id;
  for(const [key,pane] of paneMap){
   pane.hidden=key!==id;
   paneMap.get(key).classList.toggle('bc-pane-active',key===id);
   const tab=tabMap.get(key).button;
   tab.classList.toggle('selected',key===id);
   tab.setAttribute('aria-selected',String(key===id));
   tab.tabIndex=key===id?0:-1;
  }
  headline.textContent=currentDef.title;
  subtitle.textContent=currentDef.subtitle;
  crumb.textContent='BLACKCELL / MEDIA ADMINISTRATION / '+currentDef.label;
  const url=new URL(window.location.href);url.searchParams.set('tab',id);
  history.replaceState(null,'',url.pathname+url.search+url.hash);
  window.scrollTo({top:0,behavior:'auto'});
  if(id!=='overview'){
   let statusBox=paneMap.get(id).querySelector(':scope > .bc-workspace-status');
   if(!statusBox){statusBox=el('div','bc-workspace-status');paneMap.get(id).prepend(statusBox)}
   if(!loaded.has(id)){
    statusBox.hidden=false;
    statusBox.textContent='CONNECTING '+currentDef.name.toUpperCase()+'…';
    if(!loading.has(id)){
     const promise=Promise.resolve().then(()=>onEnter?.(id))
       .then(()=>{loaded.add(id);statusBox.hidden=true})
       .catch(e=>{
        const reason=String(e?.message||e||'Service failed');
        statusBox.replaceChildren(el('strong','','Could not open '+currentDef.name+'. '),
          el('span','',reason.slice(0,160)+' '));
        const retry=el('button','','RETRY');retry.type='button';retry.addEventListener('click',()=>void open(id));
        statusBox.append(retry);
       }).finally(()=>loading.delete(id));
     loading.set(id,promise);
    }
    await loading.get(id);
   }
  }
  if(action==='run'&&id==='diagnostics'&&loaded.has(id))$('bcDiagRun')?.click();
  if(action==='upload'&&id==='bunny'&&loaded.has(id))$('bcBunnyChoose')?.click();
  // The pane scroll position never drops the user into a different section.
  document.dispatchEvent(new CustomEvent('bc:admin-pane-open',{detail:{tab:id}}));
 }
 function setCounts(){
  const pending=$('bcAdminPendingCount')?.textContent?.trim()||'—';
  tabMap.get('review').suffix.textContent=pending;
  const count=$('bcAdminAssetsCount')?.textContent?.trim()||'—';
  updated.textContent=count+' MEDIA RECORDS · '+pending+' WAITING REVIEW';
  const counts=tabMap.get('bunny');
  if(counts)counts.suffix.textContent='●';
 }
 const observer=new MutationObserver(setCounts);
 for(const id of ['bcAdminPendingCount','bcAdminAssetsCount'])if($(id))observer.observe($(id),{childList:true,subtree:true,characterData:true});
 setCounts();
 updateBtn.addEventListener('click',async()=>{
  if(updateBtn.disabled)return;
  updateBtn.disabled=true;updateBtn.textContent='REFRESHING…';
  try{await onRefresh?.();updated.textContent='STATUS REFRESHED · '+new Date().toLocaleTimeString()}
  catch(e){updated.textContent='STATUS NOT AVAILABLE · '+String(e?.message||e||'network error').slice(0,100)}
  finally{updateBtn.disabled=false;updateBtn.textContent='↻ REFRESH COUNTS';}
 });
 nav.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
  e.preventDefault();const i=definitions.findIndex(x=>x.id===current);
  const next=e.key==='Home'?0:e.key==='End'?definitions.length-1:
   (i+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1)+definitions.length)%definitions.length;
  tabMap.get(definitions[next].id).button.focus();
  void open(definitions[next].id);
 });
 const urlTab=new URLSearchParams(location.search).get('tab');
 void open(definitions.some(x=>x.id===urlTab)?urlTab:'overview');
 return {open,getActive:()=>current,setCounts,ready:id=>loaded.has(id)};
}
