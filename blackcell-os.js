import {mountStorageWidget} from './blackcell-os-storage-widget.js?v=1';
let stopStorageWidget=()=>{};
let browserModule,filesModule,personalPhotosModule;
let settingsModule,desktopPrefs={reduceMotion:false,dockLabels:true,dockAutoHide:true};
function prefKey(){return 'bc.os.preferences.v1:'+String(storeProfile||'preview')}
let dockHideTimer=null;
function dockReveal(show){const shell=$('desktop');if(!shell)return;clearTimeout(dockHideTimer);shell.classList.toggle('os-dock-revealed',!!show&&desktopPrefs.dockAutoHide);const edge=shell.querySelector('.os-dock-edge');edge?.setAttribute('aria-expanded',String(!!show&&desktopPrefs.dockAutoHide))}
function setupAutoHideDock(){
 const shell=$('desktop'),wrap=shell?.querySelector('.dockwrap'),dock=wrap?.querySelector('.dock');if(!dock||shell.querySelector('.os-dock-edge'))return;
 const edge=document.createElement('button');edge.type='button';edge.className='os-dock-edge';edge.setAttribute('aria-label','Show application dock');edge.setAttribute('aria-expanded','false');dock.id='osApplicationDock';edge.setAttribute('aria-controls',dock.id);wrap.before(edge);
 const hideSoon=()=>{clearTimeout(dockHideTimer);dockHideTimer=setTimeout(()=>{if(!edge.matches(':hover')&&!dock.matches(':hover')&&!dock.querySelector(':focus-visible')&&!edge.matches(':focus-visible'))dockReveal(false)},260)};
 edge.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&desktopPrefs.dockAutoHide)dockReveal(true)});
 edge.addEventListener('pointerleave',hideSoon);
 edge.addEventListener('click',()=>{if(desktopPrefs.dockAutoHide)dockReveal(true)});
 edge.addEventListener('focus',()=>{if(edge.matches(':focus-visible'))dockReveal(true)});
 edge.addEventListener('focusout',hideSoon);
 dock.addEventListener('pointerenter',()=>{if(desktopPrefs.dockAutoHide)dockReveal(true)});
 dock.addEventListener('pointerleave',hideSoon);
 dock.addEventListener('focusin',()=>{if(desktopPrefs.dockAutoHide)dockReveal(true)});
 dock.addEventListener('focusout',hideSoon);
 dock.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!desktopPrefs.dockAutoHide)return;if(e.detail>0)b.blur();dockReveal(false)});
 document.addEventListener('pointerdown',e=>{if(desktopPrefs.dockAutoHide&&!wrap.contains(e.target)&&e.target!==edge)dockReveal(false)},{capture:true,passive:true});
 window.addEventListener('blur',()=>{if(desktopPrefs.dockAutoHide)dockReveal(false)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&shell.classList.contains('os-dock-revealed')){dockReveal(false);if(dock.contains(document.activeElement)||document.activeElement===edge)shell.querySelector('.menubar button')?.focus({preventScroll:true})}});
}
function applyDesktopPrefs(){const shell=$('desktop');setupAutoHideDock();shell.classList.toggle('os-reduce-motion',desktopPrefs.reduceMotion);shell.classList.toggle('os-hide-dock-labels',!desktopPrefs.dockLabels);shell.classList.toggle('os-dock-auto-hide',desktopPrefs.dockAutoHide);dockReveal(false)}
function preferenceStores(){const stores=[];for(const name of ['localStorage','sessionStorage']){try{stores.push({name,store:window[name]})}catch(_){}}return stores}
function readDesktopPrefs(){
 const defaults={reduceMotion:false,dockLabels:true,dockAutoHide:true};
 const options=[];
 for(const {name,store} of preferenceStores()){try{const raw=JSON.parse(store.getItem(prefKey())||'null');if(raw&&typeof raw==='object')options.push({raw,name})}catch(_){}}
 options.sort((a,b)=>(Number(b.raw.savedAt)||0)-(Number(a.raw.savedAt)||0));
 const p=options[0]?.raw;if(p){for(const key of Object.keys(defaults))if(typeof p[key]==='boolean')defaults[key]=p[key]}
 return {prefs:defaults,savedAt:Number(p?.savedAt)||0,source:options[0]?.name||null};
}
let desktopPrefsSavedAt=0;
function initDesktopPrefs(){const saved=readDesktopPrefs();desktopPrefs=saved.prefs;desktopPrefsSavedAt=saved.savedAt;applyDesktopPrefs()}
function setDesktopPref(key,value){
 if(!['reduceMotion','dockLabels','dockAutoHide'].includes(key))return {ok:false,message:'Unknown preference.'};
 desktopPrefs[key]=!!value;applyDesktopPrefs();
 desktopPrefsSavedAt=Math.max(Date.now(),desktopPrefsSavedAt+1);
 const record=JSON.stringify({...desktopPrefs,savedAt:desktopPrefsSavedAt});
 const saved=[];
 for(const {name,store} of preferenceStores()){try{store.setItem(prefKey(),record);if(store.getItem(prefKey())===record)saved.push(name)}catch(_){}}
 if(saved.includes('localStorage'))return {ok:true,message:'Saved to this browser. Your setting will be restored after refresh.'};
 if(saved.includes('sessionStorage'))return {ok:true,message:'Saved for this tab. Survives refresh; browser storage is unavailable for future sessions.'};
 return {ok:false,message:'Browser storage is blocked. This change is active but cannot be saved after refresh.'};
}
function openStoreSection(category='discover'){showApp('store',{category});windows.get('store')?.selectCategory?.(category)}
function openAppOrStore(id,section=null){if(preview||installedApp(id)){showApp(id,section?{section}:null);if(section)windows.get(id)?.selectSettings?.(section)}else{openStoreSection('discover');if(!preview)osNotice('Reinstall this application from the App Store.')}}

let corporateClient,corporateAuthorize;
const $=id=>document.getElementById(id),preview=document.body.dataset.preview==='true';
let client,embeddedAdmin=false,owner=false,active=false,leaving=false,last=Date.now(),touched=Date.now(),touching=false,checking=false;
const IDLE=60*60*1000;
let storeModule,storeProfile=null,storeInstalled=new Set(),storeRules=new Map(),storeAdmin=false,storeLevel=null,storeError='',storeSequence=0,storeMutating=false;
function applyStore(data){storeAdmin=data.owner===true;storeLevel=data.level;storeRules=new Map((data.apps||[]).map(a=>[a.id,a]));storeInstalled=new Set((data.apps||[]).filter(a=>a.allowed&&a.installed).map(a=>a.id));storeError='';syncStore()}
function clearStore(error){storeRules.clear();storeInstalled.clear();storeAdmin=false;storeLevel=null;storeError=error;syncStore()}
async function storeRequest(p_action,p_app=null,p_level=null,p_enabled=null){
 if(preview)return {ok:false,error:'The public preview cannot install apps or change clearance.'};
 if(!active||!storeProfile)return {ok:false,error:'Corporate access required.'};
 if(storeMutating)return {ok:false,error:'An App Store change is already in progress.'};const mutation=p_action!=='catalog';if(mutation)storeMutating=true;const seq=++storeSequence;try{const {data,error}=await client.rpc('corp_app_store',{p_action,p_app,p_level,p_enabled});if(seq!==storeSequence||!active)return {ok:false,error:'App Store request superseded.'};if(error||!data?.ok){const message=data?.error||'App Store permissions unavailable.';if(p_action==='catalog')clearStore(message);return {ok:false,error:message}}applyStore(data);return {ok:true}}catch(_){if(seq===storeSequence&&p_action==='catalog')clearStore('App Store permissions unavailable.');return {ok:false,error:'Unable to contact App Store.'}}finally{if(mutation)storeMutating=false}
}
function authorizedApp(id){return id==='store'||!!storeRules.get(id)?.allowed}
function installedApp(id){return id==='store'||authorizedApp(id)&&storeInstalled.has(id)}
function initStore(uid){storeProfile=uid;clearStore('Checking app permissions…')}
function syncStore(){
 if(preview)return;
 for(const tile of document.querySelectorAll('.app[data-app]')){
  const id=tile.dataset.app;tile.hidden=!installedApp(id);
  for(const dock of document.querySelectorAll('[data-open="'+id+'"]'))dock.hidden=tile.hidden;
  if(tile.hidden&&windows.has(id)){const r=windows.get(id);if(!authorizedApp(id)&&!storeError)dispose(r,true);else if(!r.suspended)suspend(r)}
 }
 $('adminReturn').hidden=!installedApp('administration');
 renderFolderPins();windows.get('settings')?.refreshSettings?.();
}
function storeCatalog(){if(preview)return [];return [...document.querySelectorAll('.app[data-app]')].filter(t=>t.dataset.app!=='store'&&!t.disabled&&storeRules.has(t.dataset.app)).map(t=>{const r=storeRules.get(t.dataset.app),optional=t.dataset.optional==='true';return {id:t.dataset.app,title:t.dataset.title,sub:t.dataset.sub,desc:t.dataset.desc,icon:t.querySelector('svg'),optional,removable:true,installed:storeInstalled.has(t.dataset.app),allowed:r.allowed,minLevel:r.minLevel,enabled:r.enabled}})}
function storeInfo(){return {owner:storeAdmin,level:storeLevel,error:preview?'Design preview only. Sign in to see your approved app catalog.':storeError}}
function appBusy(r){if(!r)return false;if(r.closing||r.filesBusy||r.storeBusy)return true;try{return !!r.frame?.contentDocument?.querySelector('[aria-busy=true],.is-uploading,[data-busy=true],progress:not([value])')}catch{return true}}
async function closeForUninstall(id){const r=windows.get(id);if(!r)return {ok:true};if(appBusy(r))return {ok:false,error:r.title+' is busy. Finish your current operation before removing it.'};await requestClose(r);if(r.closing||windows.get(id)===r&&!r.suspended)return {ok:false,error:'The application is still saving. Try again when it finishes.'};return {ok:true}}
/* Timed installation experience. Completion depends on the authoritative catalog RPC. */
let appOperation=false;
async function timedAppOperation(label,install,operation){
 if(appOperation||storeMutating)return {ok:false,error:'Another App Store operation is in progress.'};
 if(!active||preview)return {ok:false,error:'Corporate access required.'};
 appOperation=true;const uid=storeProfile,duration=install?10000:5000;
 let release;try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL App installation',window)}catch(_){}
 const create=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n};
 const overlay=create('div','os-install-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',install?'Installing application':'Uninstalling application');overlay.tabIndex=-1;
 const panel=create('section','os-install-panel'),brand=create('div','os-install-brand','BLACKCELL OS / APP STORE'),icon=create('div','os-install-icon',install?'↓':'×'),heading=create('h2','',install?'Installing':'Uninstalling'),name=create('p','os-install-name',label),track=create('div','os-install-track'),fill=create('div','os-install-fill'),row=create('div','os-install-meta'),status=create('span','', 'Preparing…'),percent=create('span','','0%');
 track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow','0');track.append(fill);row.append(status,percent);panel.append(brand,icon,heading,name,track,row,create('small','','Your account data remains intact.'));overlay.append(panel);$('desktop').append(overlay);overlay.focus();
 const started=performance.now();let timer=null;
 const update=()=>{const elapsed=performance.now()-started;const value=Math.min(95,Math.floor(elapsed/duration*95));fill.style.width=value+'%';percent.textContent=value+'%';track.setAttribute('aria-valuenow',String(value));status.textContent=elapsed<duration*.2?'Preparing…':elapsed<duration*.8?(install?'Installing application…':'Removing application…'):'Finalizing…'};
 overlay.addEventListener('keydown',e=>{if(e.key==='Tab'||e.key==='Escape'){e.preventDefault();e.stopPropagation()}});
 try{
  update();timer=setInterval(update,80);
  await new Promise(resolve=>setTimeout(resolve,duration));
  clearInterval(timer);timer=null;fill.style.width='95%';percent.textContent='95%';track.setAttribute('aria-valuenow','95');status.textContent='Confirming with server…';
  if(!active||leaving||storeProfile!==uid)return {ok:false,error:'Corporate session ended.'};
  const result=await operation();
  if(result?.ok){fill.style.width='100%';percent.textContent='100%';track.setAttribute('aria-valuenow','100');heading.textContent=install?'Installed':'Uninstalled';status.textContent='Complete';panel.classList.add('complete');await new Promise(resolve=>setTimeout(resolve,260))}
  return result||{ok:false,error:'Operation not confirmed.'};
 }catch(_){return {ok:false,error:'App operation could not be completed.'}}
 finally{clearInterval(timer);overlay.remove();release?.();appOperation=false}
}

async function installApp(id,install){if(!active||preview||id==='store'||!authorizedApp(id))return {ok:false,error:id==='store'?'The App Store must remain installed.':'Your access level does not permit this application.'};if(!install&&appBusy(windows.get(id)))return {ok:false,error:'Finish the active operation before uninstalling.'};const title=document.querySelector('.app[data-app="'+id+'"]')?.dataset.title||'Application';return timedAppOperation(title,install,async()=>{if(!authorizedApp(id))return {ok:false,error:'Your access level no longer permits this application.'};if(!install){const result=await closeForUninstall(id);if(!result.ok)return result}return storeRequest(install?'install':'remove',id)})}
async function removeAllApps(){
 if(!active||preview)return {ok:false,error:'Corporate access required.'};
 const ids=[...storeInstalled].filter(id=>id!=='store'&&authorizedApp(id));
 if(!ids.length)return {ok:true};
 const busy=ids.map(id=>windows.get(id)).find(appBusy);if(busy)return {ok:false,error:busy.title+' is busy. Finish your current operation first.'};
 return timedAppOperation('All installed apps',false,async()=>{const current=[...storeInstalled].filter(id=>id!=='store'&&authorizedApp(id));for(const id of current){const result=await closeForUninstall(id);if(!result.ok)return result}return storeRequest('remove_all')})
}
async function setStoreRule(id,level,enabled){if(!storeAdmin||preview)return {ok:false,error:'Level 7 administrator required.'};return storeRequest('set_rule',id,level,enabled)}

function hostMessage(type){if(embeddedAdmin)window.parent.postMessage({type},location.origin)}
function returnAdmin(){if(owner||preview)showApp('administration')}
function clock(){ $('clock').textContent=new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }clock();setInterval(clock,15000);
function blocked(message){stopStorageWidget();clearWorkspace();active=false;closeAll(true);$('desktop').hidden=true;$('gate').hidden=false;$('gateMessage').textContent=message;$('gateLink').hidden=false;hostMessage('blackcell-os-blocked');}
const windows=new Map();let layer=25,selectedWindow=null;
let workspaceReady=false,workspaceRestoring=false,pendingRestore=[];
function workspaceKey(){return 'bc.os.workspace.v1:'+String(storeProfile||'preview')+':'+(embeddedAdmin?'executive':'desktop')}
function saveWorkspace(){
 if(!workspaceReady||workspaceRestoring||(!active&&!preview)||leaving)return;
 try{
  const records=[...windows.values()].filter(r=>!r.suspended).map(r=>({id:r.id,minimized:r.el.hidden,maximized:r.el.classList.contains('is-max'),left:r.el.style.left,top:r.el.style.top,width:r.el.style.width,height:r.el.style.height,order:Number(r.el.style.zIndex)||0,...(r.id==='files'?{files:r.fileState||{path:[],layout:'grid'}}:r.id==='store'?{store:r.storeState||null}:r.id==='settings'?{settings:{section:r.settingsSection||'general'}}:{})}));
  for(const pending of pendingRestore)if(!records.some(r=>r.id===pending.id))records.push(pending);
  sessionStorage.setItem(workspaceKey(),JSON.stringify({version:1,at:Date.now(),windows:records.slice(0,24)}));
 }catch(_){}
}
function clearWorkspace(){pendingRestore=[];workspaceReady=false;try{sessionStorage.removeItem(workspaceKey());if(embeddedAdmin)sessionStorage.removeItem('bc.os.host.v1')}catch(_){}}
function safePixels(value){return typeof value==='string'&&/^\d{1,5}(?:\.\d+)?px$/.test(value)?Number.parseFloat(value):null}
function restoreRecord(saved){
 if(!saved||typeof saved.id!=='string'||!/^[a-z]+$/.test(saved.id)||saved.id.length>40||windows.has(saved.id))return;
 const tile=document.querySelector('.app[data-app="'+saved.id+'"]');if(!tile||tile.hidden||tile.disabled)return;
 showApp(saved.id,saved.id==='store'?saved.store:saved.id==='settings'?saved.settings:saved.files);const r=windows.get(saved.id);if(!r)return;
 if(innerWidth>620){
  const width=safePixels(saved.width),height=safePixels(saved.height),left=safePixels(saved.left),top=safePixels(saved.top);
  if(width!==null)r.el.style.width=Math.min(Math.max(280,width),Math.max(280,innerWidth-12))+'px';
  if(height!==null)r.el.style.height=Math.min(Math.max(220,height),Math.max(220,innerHeight-100))+'px';
  if(left!==null)r.el.style.left=Math.max(0,Math.min(left,innerWidth-r.el.offsetWidth))+'px';
  if(top!==null)r.el.style.top=Math.max(34,Math.min(top,innerHeight-110))+'px';
 }
 r.el.classList.toggle('is-max',saved.maximized===true);if(saved.minimized===true){r.el.hidden=true;if(selectedWindow===r)selectedWindow=null;syncStoreUpdateHold()}
}
function restoreWorkspace(){
 let saved=null;try{saved=JSON.parse(sessionStorage.getItem(workspaceKey())||'null')}catch(_){}
 workspaceRestoring=true;pendingRestore=[];
 try{
  if(saved?.version===1&&Array.isArray(saved.windows)&&Date.now()-Number(saved.at)<IDLE&&Date.now()>=Number(saved.at)){
   for(const entry of saved.windows.slice(0,24).sort((a,b)=>(Number(a?.order)||0)-(Number(b?.order)||0))){
    if(typeof entry?.id!=='string'||!/^[a-z]+$/.test(entry.id))continue;
    const tile=document.querySelector('.app[data-app="'+entry.id+'"]');if(!tile)continue;
    if(tile.dataset.optional==='true')pendingRestore.push(entry);else restoreRecord(entry)
   }
  }
 }finally{workspaceRestoring=false;workspaceReady=true;saveWorkspace()}
}
function restoreOptionalWorkspace(){
 if(!active||!pendingRestore.length)return;
 const records=pendingRestore;pendingRestore=[];workspaceRestoring=true;
 try{for(const item of records)if(storeRules.get(item.id)?.allowed&&storeInstalled.has(item.id))restoreRecord(item)}
 finally{workspaceRestoring=false;saveWorkspace()}
}
window.addEventListener('pagehide',saveWorkspace);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveWorkspace()});

const menus=$('osMenu'),menuButtons=[...document.querySelectorAll('[data-menu]')];
function closeMenu(){menus.hidden=true;for(const btn of menuButtons)btn.setAttribute('aria-expanded','false')}
function menuAction(label,fn){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{closeMenu();fn()};menus.append(button)}
function menu(name,trigger){const was=trigger.getAttribute('aria-expanded')==='true';closeMenu();if(was)return;menus.replaceChildren();trigger.setAttribute('aria-expanded','true');
 if(name==='apps'){for(const tile of document.querySelectorAll('[data-app]'))if(!tile.hidden&&!tile.disabled)menuAction(tile.dataset.title,()=>showApp(tile.dataset.app))}
 else if(name==='window'){menuAction('Show Desktop',showDesktop);for(const record of windows.values())if(!document.querySelector('.app[data-app="'+record.id+'"]')?.hidden)menuAction(record.title+(record.suspended?' · Resume':''),()=>showApp(record.id))}
 else{if(owner&&installedApp('administration'))menuAction('Administration',returnAdmin);if(preview||installedApp('settings'))menuAction('Settings',()=>showApp('settings'));menuAction('Show Desktop',showDesktop);if(preview||installedApp('person'))menuAction('My Profile',()=>showApp('person'));menuAction(preview?'Exit Preview':'Sign Out',()=>void signOut())}
 menus.style.left=trigger.offsetLeft+'px';menus.hidden=false;
}
for(const btn of menuButtons)btn.addEventListener('click',()=>menu(btn.dataset.menu,btn));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menubar'))closeMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
function markDock(id,on){document.querySelector('[data-open="'+id+'"]')?.classList.toggle('is-running',on)}
function syncStoreUpdateHold(){const r=windows.get('store');if(!r)return;const needed=!r.el.hidden||r.storeBusy;if(needed&&!r.updateHold&&!preview){try{r.updateHold=window.top.BLACKCELL_LIVE_UPDATE?.hold('App Store workspace',window)}catch(_){}}else if(!needed&&r.updateHold){r.updateHold();r.updateHold=null}}
function raise(r){if(r.closing)r.reopened=true;r.suspended=false;r.el.hidden=false;r.el.style.zIndex=String(++layer);selectedWindow=r;markDock(r.id,true);syncStoreUpdateHold();saveWorkspace()}
function showDesktop(){for(const r of windows.values())r.el.hidden=true;selectedWindow=null;syncStoreUpdateHold();saveWorkspace()}
function dispose(r,force=false){if(!force){void requestClose(r);return;}r.updateHold?.();r.updateHold=null;r.cleanup?.();r.frame?.remove();r.el.remove();r.release?.();windows.delete(r.id);markDock(r.id,false);if(selectedWindow===r)selectedWindow=null;saveWorkspace()}
function osNotice(message){let n=$('osCloseNotice');if(!n){n=document.createElement('div');n.id='osCloseNotice';n.className='os-close-notice';n.setAttribute('role','status');$('desktop').append(n)}n.textContent=message;n.hidden=false;clearTimeout(osNotice.timer);osNotice.timer=setTimeout(()=>{n.hidden=true},6000)}
function suspend(r){r.el.hidden=true;r.suspended=true;markDock(r.id,false);if(selectedWindow===r)selectedWindow=null;syncStoreUpdateHold();saveWorkspace()}
window.addEventListener('message',event=>{if(event.origin!==location.origin)return;const r=windows.get('administration');if(!r?.frame||event.source!==r.frame.contentWindow)return;if(event.data?.type==='blackcell-admin-app-return'){void requestClose(r)}else if(event.data?.type==='blackcell-admin-app-activity'){void activity()}else if(event.data?.type==='blackcell-admin-app-signed-out'){blocked('Your corporate session has ended.');window.top.location.replace('login.html')}});
function pauseFrameMedia(frame){try{for(const m of frame.contentDocument?.querySelectorAll('video,audio')||[])if(!m.paused)m.pause()}catch(_){}}
async function requestClose(r){
 if(!r||windows.get(r.id)!==r)return;
 if(r.closing){suspend(r);return}
 if((['files','personalphotos'].includes(r.id)&&r.filesBusy)||(r.id==='store'&&r.storeBusy)){suspend(r);return}
 if(!r.frame||preview){dispose(r,true);return}
 // Hide immediately. Keep the original iframe alive until explicit app save completes;
 // unknown applications are retained in memory rather than risking unsaved data.
 suspend(r);r.closing=true;pauseFrameMedia(r.frame);
 try{
  let save;try{save=r.frame.contentWindow.BLACKCELL_OS_BEFORE_CLOSE}catch(_){}
  if(typeof save==='function'){
   const result=await save();
   if(windows.get(r.id)!==r)return;
   if(result?.ok===true&&!result?.retain&&!r.reopened){dispose(r,true);return}
   if(result?.ok===false)osNotice(result.message||'Changes could not be saved. Reopen the app to retry; your work is retained.');
   else if(result?.retain)osNotice(result.message||'Your work is retained. Reopen the app to continue.');
  }
  // Apps without a verified save hook stay suspended, preserving forms, drafts
  // and transfers without submitting any action on the user's behalf.
 }catch(_){if(windows.get(r.id)===r)osNotice('Save could not be confirmed. Reopen the app to continue.')}
 finally{r.closing=false;r.reopened=false}
}

function closeAll(force){for(const r of [...windows.values()])dispose(r,force)}
/* Desktop folder aliases — never move the underlying private files. */
let folderPins=[],folderDrag=null,pinDrop=null;
const pinKey=()=> 'bc.os.folder-pins.v1:'+String(storeProfile||'preview');
const validPin=p=>Array.isArray(p)&&p.length>0&&p.length<=50&&p.every(x=>typeof x==='string'&&x.length>0&&x.length<=255&&x!=='.'&&x!=='..'&&!x.includes('/')&&!x.includes('\\')&&!x.includes('\u0000'));
const pinAllowed=()=> (active||preview)&&!!storeProfile;
function initFolderPins(){folderPins=[];try{const raw=JSON.parse(localStorage.getItem(pinKey())||'[]');if(Array.isArray(raw))folderPins=raw.filter(validPin).slice(0,40)}catch(_){}renderFolderPins()}
function saveFolderPins(next){try{localStorage.setItem(pinKey(),JSON.stringify(next));folderPins=next;renderFolderPins();return true}catch(_){osNotice('Browser storage is unavailable. Shortcut not saved.');return false}}
function pinFolder(p){if(!pinAllowed()||!validPin(p))return;if(folderPins.some(x=>JSON.stringify(x)===JSON.stringify(p))){osNotice('That folder is already on your desktop.');return}if(folderPins.length>=40){osNotice('Remove an existing shortcut first.');return}if(saveFolderPins([...folderPins,[...p]]))osNotice(p.at(-1)+' added to your desktop.')}
function openPinnedFolder(p){if(!pinAllowed()||!validPin(p))return;if(!preview&&!installedApp('files')){osNotice('Reinstall BLACKCELL Files from the App Store to open this folder.');showApp('store');return}const r=windows.get('files');if(r?.filesBusy){osNotice('Files is still processing an operation.');return}if(r){raise(r);if(r.openFolder)r.openFolder(p);else{r.fileState={path:[...p],layout:r.fileState?.layout||'grid'};saveWorkspace()}}else showApp('files',{path:[...p],layout:'grid'})}
function renderFolderPins(){const grid=$('desktopFolders'),section=$('desktopFolderSection');if(!grid||!section)return;grid.replaceChildren();section.hidden=!folderPins.length||(!preview&&!installedApp('files'));for(const p of folderPins){const card=document.createElement('div');card.className='os-folder-alias';const btn=document.createElement('button');btn.type='button';btn.className='os-folder-open';btn.title=p.join(' / ');btn.setAttribute('aria-label','Open '+p.at(-1));const glyph=document.createElement('span');glyph.className='os-folder-glyph';const arrow=document.createElement('span');arrow.className='os-folder-arrow';arrow.textContent='↗';glyph.append(arrow);const label=document.createElement('span');label.className='os-folder-name';label.textContent=p.at(-1);btn.append(glyph,label);btn.onclick=()=>openPinnedFolder(p);const rm=document.createElement('button');rm.type='button';rm.className='os-folder-remove';rm.textContent='×';rm.title='Remove shortcut (keep original folder)';rm.setAttribute('aria-label','Remove shortcut for '+p.at(-1));rm.onclick=()=>{if(pinAllowed()&&saveFolderPins(folderPins.filter(x=>JSON.stringify(x)!==JSON.stringify(p))))osNotice('Shortcut removed. Original folder kept.')};card.append(btn,rm);grid.append(card)}}
function endFolderDrag(){folderDrag=null;if(pinDrop)pinDrop.hidden=true;document.querySelector('.workspace')?.classList.remove('os-folder-dragging')}
function beginFolderDrag(p,e){if(!pinAllowed()||!validPin(p)||!e.dataTransfer){e.preventDefault();return}folderDrag=[...p];e.dataTransfer.effectAllowed='link';e.dataTransfer.setData('application/x-blackcell-folder-alias','folder');if(!pinDrop){pinDrop=document.createElement('div');pinDrop.className='os-folder-dropzone';pinDrop.hidden=true;pinDrop.textContent='＋ Drop folder on desktop';$('desktop').append(pinDrop)}pinDrop.hidden=false;document.querySelector('.workspace')?.classList.add('os-folder-dragging')}
function isDesktopDrop(e){return !!folderDrag&&pinAllowed()&&(e.target.closest('.os-folder-dropzone')||!e.target.closest('.os-window,.topbar,.dockwrap'))}
$('desktop').addEventListener('dragover',e=>{if(isDesktopDrop(e)){e.preventDefault();e.dataTransfer.dropEffect='link'}});
$('desktop').addEventListener('drop',e=>{if(isDesktopDrop(e)){e.preventDefault();e.stopPropagation();const p=folderDrag;endFolderDrag();pinFolder(p)}});
window.addEventListener('dragend',endFolderDrag);

function showApp(id,initialState=null){
 closeAppContext();if(!active&&!preview)return;if(id==='administration'&&!owner&&!preview)return;
 if(!preview&&!installedApp(id))return;
 const tile=document.querySelector('.app[data-app="'+id+'"]');if(!tile||tile.hidden||tile.disabled)return;
 if(windows.has(id)){const existing=windows.get(id);raise(existing);if(id==='settings'&&initialState?.section)existing.selectSettings?.(initialState.section);if(id==='store'&&initialState?.category)existing.selectCategory?.(initialState.category);return}
 const url=new URL(tile.dataset.url,location.href);if(url.origin!==location.origin)return;
 const w=document.createElement('section');w.className='os-window';w.dataset.osApp=id;w.setAttribute('aria-label',tile.dataset.title+' window');
 const bar=document.createElement('div');bar.className='os-window-head';const controls=document.createElement('div');controls.className='traffic';
 const title=document.createElement('span');title.textContent=tile.dataset.title;
 const external=document.createElement('a');external.href=url.href;external.target='_blank';external.rel='noopener';external.textContent='Open full page ↗';bar.append(controls,title,external);
 const content=document.createElement('div');content.className='os-window-body';w.append(bar,content);
 const r={id,title:tile.dataset.title,el:w,frame:null,release:null,fileState:id==='files'?initialState:null,storeState:id==='store'?initialState:null,storeBusy:false,settingsSection:initialState?.section||'general'};windows.set(id,r);
 for(const [label,symbol,fn] of [['Close','×',()=>void requestClose(r)],['Minimize','−',()=>{w.hidden=true;selectedWindow=null;syncStoreUpdateHold();saveWorkspace()}],['Maximize or restore','+',()=>{w.classList.toggle('is-max');saveWorkspace()}]]){const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-label',label+' '+r.title);btn.title=label;btn.textContent=symbol;btn.addEventListener('click',fn);controls.append(btn)}
 if(id==='personalphotos'){external.hidden=true;const msg=document.createElement('p');msg.textContent='Loading private Photos…';content.append(msg);(personalPhotosModule??=import('./blackcell-private-media.js?v=5')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();const app=module.mountPrivatePhotos(content,{client,userId:storeProfile,preview,alive:()=>windows.get(id)===r&&(active||preview),onBusy:busy=>{r.filesBusy=busy;if(busy&&!r.release){try{r.release=window.top.BLACKCELL_LIVE_UPDATE?.hold('Private Photos operation',window)}catch(_){}}else if(!busy){r.release?.();r.release=null}}});r.cleanup=()=>app.dispose();}).catch(()=>{personalPhotosModule=null;if(windows.get(id)===r){content.replaceChildren(msg);msg.textContent='Photos could not load. Reopen to try again.'}});}
 else if(id==='files'){external.hidden=true;const msg=document.createElement('p');msg.textContent='Opening private drive…';msg.style.padding='20px';content.append(msg);(filesModule??=import('./blackcell-files.js?v=8')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();const app=module.mountFiles(content,{client,userId:storeProfile,preview,initialState:r.fileState,onState:state=>{r.fileState=state;saveWorkspace()},onPin:pinFolder,onFolderDrag:beginFolderDrag,onFolderDragEnd:endFolderDrag,alive:()=>windows.get(id)===r&&(active||preview),onBusy:busy=>{r.filesBusy=busy;if(busy&&!r.release){try{r.release=window.top.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL Files transfer',window)}catch(_){}}else if(!busy){r.release?.();r.release=null}}});r.openFolder=app.openFolder;r.cleanup=()=>app.dispose();}).catch(()=>{filesModule=null;if(windows.get(id)===r){content.replaceChildren(msg);msg.textContent='Files could not load. Reopen to try again.'}});}
 else if(id==='settings'){external.hidden=true;const msg=document.createElement('p');msg.textContent='Opening Settings…';msg.style.padding='20px';content.append(msg);(settingsModule??=import('./blackcell-os-settings.js?v=3-persist-prefs')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();const app=module.mountSettings(content,{client,preview,alive:()=>windows.get(id)===r&&(active||preview),initialSection:r.settingsSection,onSection:section=>{r.settingsSection=section;saveWorkspace()},account:()=>({name:$('memberName').textContent,username:$('memberUser').textContent,access:$('accessLabel').textContent,clearance:$('clearance').textContent}),catalog:()=>preview?[...document.querySelectorAll('.app[data-app]')].filter(t=>t.dataset.app!=='store'&&!t.hidden).map(t=>({id:t.dataset.app,title:t.dataset.title,installed:true})):storeCatalog(),preferences:()=>({...desktopPrefs}),setPreference:setDesktopPref,openOrStore:openAppOrStore,openStore:openStoreSection,signOut:()=>void signOut()});r.selectSettings=app.select;r.refreshSettings=app.refresh;r.cleanup=app.dispose;}).catch(()=>{settingsModule=null;if(windows.get(id)===r){content.replaceChildren(msg);msg.textContent='Settings could not load. Reopen to retry.'}});}
 else if(id==='store'){external.hidden=true;const message=document.createElement('p');message.textContent='Opening App Store…';message.style.padding='20px';content.append(message);(storeModule??=import('./blackcell-app-store.js?v=7-upcoming-apps')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();const store=module.mountStore(content,{catalog:storeCatalog,install:installApp,removeAll:removeAllApps,open:showApp,info:storeInfo,setRule:setStoreRule,initialState:r.storeState,onState:state=>{r.storeState=state;saveWorkspace()},onBusy:busy=>{r.storeBusy=busy;syncStoreUpdateHold();if(!busy&&r.suspended)dispose(r,true)}});r.refreshStore=store.render;r.selectCategory=store.selectCategory;r.cleanup=store.dispose;}).catch(()=>{storeModule=null;if(windows.get(id)===r){content.replaceChildren(message);message.textContent='App Store could not start. Close this window and try again.'}});}
 else if(id==='browser'){if(!preview)r.release=window.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL Browser window');const message=document.createElement('p');message.className='os-window-status';message.textContent='Opening BLACKCELL Browser…';message.style.padding='20px';content.append(message);(browserModule??=import('./blackcell-browser.js?v=3')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();module.mountBrowser(content,r,external,activity)}).catch(()=>{browserModule=null;if(windows.get(id)===r)message.textContent='Browser could not load. Close this window and try again.'});}
 else if(preview){const demo=document.createElement('div');demo.className='os-demo';const box=document.createElement('div');box.append(tile.querySelector('.app-icon').cloneNode(true));const h=document.createElement('h2');h.textContent=r.title;const p=document.createElement('p');p.textContent=tile.dataset.desc;const status=document.createElement('p');status.textContent='DESIGN PREVIEW · No private account data loaded.';status.className='os-window-status';box.append(h,p,status);demo.append(box);content.append(demo)}
 else{r.release=window.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL OS application window');const frame=document.createElement('iframe');frame.title=r.title;if(id==='administration'){frame.id='bcOsAdministrationFrame';external.hidden=true;external.href='blackcell-administration-app.html';w.classList.add('is-max');const home=document.createElement('button');home.type='button';home.className='os-admin-home';home.textContent='‹ Administration';home.hidden=true;home.onclick=()=>{frame.src=url.href};r.adminHome=home;bar.insertBefore(home,title)}frame.src=url.href;frame.allow='fullscreen';frame.setAttribute('allowfullscreen','');r.frame=frame;content.append(frame);
 frame.addEventListener('load',()=>{try{const child=frame.contentDocument;if(!child)return;const childURL=new URL(frame.contentWindow.location.href);if(childURL.origin!==location.origin)return;if(id==='administration'){if(childURL.pathname.endsWith('/dashboard.html')){frame.contentWindow.location.replace(url.href);return}if(r.adminHome)r.adminHome.hidden=childURL.pathname.endsWith('/blackcell-administration-app.html')}if(childURL.pathname.endsWith('/blackcell-os.html')||childURL.pathname.endsWith('/blackcell-os-preview.html')){dispose(r,true);return}if(id==='administration'&&childURL.pathname.endsWith('/login.html')){if(active)void recheck();return}for(const event of ['pointerdown','keydown','touchstart','wheel'])child.addEventListener(event,()=>void activity(),{passive:true});}catch(_){}});
 }
 $('desktop').append(w);raise(r);w.addEventListener('pointerdown',()=>raise(r),true);bar.addEventListener('dblclick',e=>{if(!e.target.closest('button,a')){w.classList.toggle('is-max');saveWorkspace()}});
 let drag=null;
 bar.addEventListener('pointerdown',e=>{if(e.target.closest('button,a')||w.classList.contains('is-max')||innerWidth<=620)return;const rect=w.getBoundingClientRect();drag={x:e.clientX-rect.left,y:e.clientY-rect.top};bar.setPointerCapture(e.pointerId)});
 bar.addEventListener('pointermove',e=>{if(!drag)return;w.style.left=Math.max(0,Math.min(innerWidth-w.offsetWidth,e.clientX-drag.x))+'px';w.style.top=Math.max(34,Math.min(innerHeight-100,e.clientY-drag.y))+'px'});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])bar.addEventListener(event,()=>{drag=null;saveWorkspace()});
}
let appContext=null,contextTrigger=null;
function closeAppContext(restore=false){if(appContext){appContext.remove();appContext=null}if(restore)contextTrigger?.focus();contextTrigger=null}
function openAppContext(tile,x,y){
 closeMenu();closeAppContext();
 if(!active||preview||tile.hidden)return;
 const id=tile.dataset.app,removable=id!=='store'&&installedApp(id);
 const panel=document.createElement('div');panel.className='os-app-context';panel.setAttribute('role','group');panel.setAttribute('aria-label',tile.dataset.title+' options');contextTrigger=tile;
 const name=document.createElement('strong');name.textContent=tile.dataset.title;panel.append(name);
 const item=(label,fn,cls='')=>{const btn=document.createElement('button');btn.type='button';btn.className=cls;btn.textContent=label;btn.onclick=()=>{closeAppContext();fn()};panel.append(btn);return btn};
 item('Open',()=>showApp(id));
 if(removable)item('Uninstall app',()=>void uninstallFromDesktop(id,tile.dataset.title),'danger');
 else{const note=document.createElement('small');note.textContent='App Store cannot be uninstalled';panel.append(note)}
 $('desktop').append(panel);appContext=panel;
 const rect=panel.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';panel.style.top=Math.max(38,Math.min(y,innerHeight-rect.height-8))+'px';
 panel.querySelector('button')?.focus();
}
async function uninstallFromDesktop(id,title){
 const result=await installApp(id,false);
 osNotice(result.ok?title+' uninstalled. Your app data is unchanged.':result.error||'Unable to uninstall application.');
 windows.get('store')?.refreshStore?.();
}
function bindAppContext(tile){
 tile.addEventListener('contextmenu',e=>{if(!active||preview)return;e.preventDefault();openAppContext(tile,e.clientX,e.clientY)});
 tile.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const r=tile.getBoundingClientRect();openAppContext(tile,r.left,r.bottom)}});
}
document.addEventListener('pointerdown',e=>{if(appContext&&!appContext.contains(e.target))closeAppContext()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAppContext(true)});

for(const button of document.querySelectorAll('[data-app]')){button.addEventListener('click',()=>showApp(button.dataset.app));bindAppContext(button)}
for(const button of document.querySelectorAll('[data-open]')){button.addEventListener('click',()=>showApp(button.dataset.open));button.addEventListener('contextmenu',e=>{const tile=document.querySelector('.app[data-app="'+button.dataset.open+'"]');if(active&&tile&&!tile.hidden){e.preventDefault();openAppContext(tile,e.clientX,e.clientY)}})}
$('showDesktop').addEventListener('click',showDesktop);$('bcStorageManage')?.addEventListener('click',()=>openAppOrStore('settings','storage'));
async function signOut(force=false){if(preview){clearWorkspace();location.assign('login.html');return}if(leaving)return;if(!force&&windows.size&&!confirm('Sign out and close your open applications? Finish uploads, playback and unsaved work first.'))return;leaving=true;active=false;blocked('Ending your corporate session…');try{await client.rpc(owner?'corp_end_session':'corp_employee_end_session')}catch(_){}try{await client.auth.signOut({scope:'local'})}catch(_){}if(embeddedAdmin)window.top.location.replace('login.html');else location.replace('login.html')}
$('signOut').addEventListener('click',()=>void signOut());
$('adminReturn').addEventListener('click',e=>{e.preventDefault();returnAdmin()});
function memberAllowed(m){return !!m&&(m.role==='owner'&&Number(m.clearance_level)===7||m.role==='employee'&&!!m.password_activated_at)}
function chatAllowed(m){return m.role==='owner'||m.can_chat===true}
async function recheck(){if(!active||checking||leaving)return;checking=true;try{if(Date.now()-last>=IDLE){await signOut(true);return}const result=await corporateAuthorize(client,{allowLedgerOnly:true});if(!result.ok||!memberAllowed(result.member)||(result.member.role==='owner')!==owner){blocked('Your corporate session is no longer authorized.');return}if(!owner&&result.member.access_scope==='ledger_only'){location.replace('private-photo-ledger.html');return}const {data,error}=await client.rpc(owner?'corp_code_status':'corp_employee_code_status');if(error||data?.ok!==true||data?.verified!==true){blocked('Your corporate authorization must be verified again.');return}if(!chatAllowed(result.member)&&windows.has('chat'))dispose(windows.get('chat'),true);if(!chatAllowed(result.member)){for(const el of document.querySelectorAll('[data-chat=true]'))el.hidden=true;storeRules.delete('chat');storeInstalled.delete('chat')}await storeRequest('catalog');windows.get('store')?.refreshStore?.();}catch(_){blocked('Unable to verify your corporate session.')}finally{checking=false}}
async function activity(){if(!active||leaving)return;if(Date.now()-last>=IDLE){await signOut(true);return}last=Date.now();if(embeddedAdmin){try{window.parent.dispatchEvent(new Event('pointerdown'))}catch(_){}}if(touching||Date.now()-touched<60000)return;touching=true;try{const {data,error}=await client.rpc(owner?'corp_touch_session':'corp_employee_touch_session');if(error||data?.ok!==true){blocked('Your corporate session has expired.');return}touched=Date.now()}catch(_){blocked('Unable to verify your active session.')}finally{touching=false}}
if(preview){initStore('preview');initDesktopPrefs();initFolderPins();restoreWorkspace();stopStorageWidget=mountStorageWidget(null,{preview:true})}
if(!preview){try{({corporateClient,corporateAuthorize}=await import('./corp-auth.js?v=20261109-clearance5'));let parentClient;try{if(window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.location.pathname.endsWith('/dashboard.html')&&window.parent.document.documentElement.classList.contains('corp-ok')&&window.parent.document.getElementById('bcExecutiveOsFrame')?.contentWindow===window){parentClient=window.parent.BLACKCELL_CORPORATE_ADMIN_API?.client;embeddedAdmin=!!parentClient}}catch(_){}client=parentClient||corporateClient();const result=await corporateAuthorize(client,{allowLedgerOnly:true});if(embeddedAdmin&&(!result.ok||result.member?.role!=='owner'||Number(result.member?.clearance_level)!==7)){blocked('Executive workspace requires a verified Level 7 administrator. Return to Administration.');}else if(!result.ok){blocked(result.reason==='signed-out'?'No active BLACKCELL sign-in was found. Return to Corporate Access.':result.reason==='not-approved'?'Your account is not approved for BLACKCELL OS.':'Corporate account verification is unavailable. Return to Corporate Access.');}else if(!memberAllowed(result.member)){blocked('Complete corporate activation before entering BLACKCELL OS.')}else{const member=result.member;owner=member.role==='owner';const {data,error}=await client.rpc(owner?'corp_code_status':'corp_employee_code_status');if(error||data?.ok!==true||data?.verified!==true){blocked(error?'Security verification could not be completed. Return to Corporate Access.':owner?'Level 7 security session is not verified. Return to Corporate Access.':'Your employee access must be verified.')}else if(!owner&&member.access_scope==='ledger_only'){location.replace('private-photo-ledger.html')}else{const name=member.display_name||member.username||'BLACKCELL Member';$('memberName').textContent=name;$('memberUser').textContent=member.username?'@'+member.username:'Employee network';$('initials').textContent=name.trim().split(/\s+/).slice(0,2).map(p=>Array.from(p)[0]||'').join('').toUpperCase()||'BC';$('welcome').textContent='Welcome back, '+name.trim().split(/\s+/)[0]+'.';$('clearance').textContent='VERIFIED / LEVEL '+String(member.clearance_level??'—').padStart(2,'0');for(const el of document.querySelectorAll('[data-chat=true]'))el.hidden=!chatAllowed(member);if(owner){for(const item of document.querySelectorAll('[data-admin-only=true]'))item.hidden=false;$('adminReturn').hidden=false;$('accessLabel').textContent='Administrator';$('workspaceLabel').textContent='EXECUTIVE WORKSPACE / BLACKCELL CORPORATION';$('memberUser').textContent='Level 7 · Executive network';for(const el of document.querySelectorAll('[data-app=card],[data-open=card]'))el.hidden=true;}initStore(String(result.user.id));initDesktopPrefs();active=true;last=Date.now();touched=Date.now();$('gate').hidden=true;$('desktop').hidden=false;stopStorageWidget=mountStorageWidget(client,{alive:()=>active&&!leaving});initFolderPins();await storeRequest('catalog');restoreWorkspace();restoreOptionalWorkspace();hostMessage('blackcell-os-ready');windows.get('store')?.refreshStore?.();for(const event of ['pointerdown','keydown','touchstart','wheel','pointermove'])window.addEventListener(event,()=>void activity(),{passive:true});window.addEventListener('focus',()=>void recheck());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void recheck()});setInterval(()=>{if(active&&Date.now()-last>=IDLE)void signOut(true)},15000);setInterval(()=>{if(!document.hidden)void recheck()},60000);}}}catch(error){console.error('BLACKCELL OS authorization failed',error);blocked('BLACKCELL OS cannot verify your access. Reload or return to Corporate Access.')}}