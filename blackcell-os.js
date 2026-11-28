import {mountBlackcellConnect} from './blackcell-connect.js?v=2';
import {createChatUnreadMonitor} from './blackcell-chat-unread.js?v=1';
import {mountPhoneNavigation} from './blackcell-os-phone-navigation.js?v=1';
import {mountWorldMonitor} from './blackcell-os-world-monitor.js?v=1';
import {createWorkspaceLock,verifyWorkspacePassword} from './blackcell-os-session.js?v=1';
import {mountStorageWidget} from './blackcell-os-storage-widget.js?v=1';
import {createWallpaperController} from './blackcell-os-wallpaper.js?v=1';
let stopStorageWidget=()=>{},securityNotifications=null,osNoticeHistory=[];
let browserModule,filesModule,personalPhotosModule;
const BASE_OS_PREFS={reduceMotion:false,dockLabels:true,dockAutoHide:true,dockPosition:'bottom',autoLockMinutes:5,wallpaper:'midnight',
 wallpaperSchemaVersion:2,wallpaperMode:'all',wallpaperFit:'cover',wallpaperPosition:'center',
 wallpaperDim:12,wallpaperBlur:0,wallpaperImages:{all:'',phone:'',tablet:'',desktop:''},wallpaperHistory:[],desktopClean:true};
let settingsModule,desktopPrefs={...BASE_OS_PREFS},wallpaperManager=null;
function prefKey(){return 'bc.os.preferences.v1:'+String(storeProfile||'preview')}
let dockHideTimer=null,dockIdleTimer=null;
function dockReveal(show){
 const shell=$('desktop');if(!shell)return;
 clearTimeout(dockHideTimer);clearTimeout(dockIdleTimer);
 const revealed=!!show&&desktopPrefs.dockAutoHide;
 shell.classList.toggle('os-dock-revealed',revealed);
 const edge=shell.querySelector('.os-dock-edge');
 edge?.setAttribute('aria-expanded',String(revealed));
 // Touch devices do not generate a reliable mouseleave after tapping the reveal handle.
 // Collapse after a short idle interval, unless a pointer or keyboard focus is within the dock.
 if(revealed)dockIdleTimer=setTimeout(()=>{
  const dock=shell.querySelector('.dockwrap .dock');
  if(dock?.matches(':hover')||dock?.contains(document.activeElement)){dockReveal(true);return}
  dockReveal(false);
 },4800);
}
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
function applyDesktopPrefs(){
 const shell=$('desktop');if(!shell)return;setupAutoHideDock();
 shell.dataset.bcWallpaper=['midnight','obsidian','skyline','custom'].includes(desktopPrefs.wallpaper)?desktopPrefs.wallpaper:'midnight';
 shell.classList.toggle('os-reduce-motion',desktopPrefs.reduceMotion);
 shell.classList.toggle('os-hide-dock-labels',!desktopPrefs.dockLabels);
 shell.classList.toggle('os-dock-auto-hide',desktopPrefs.dockAutoHide);shell.dataset.bcDockPosition=desktopPrefs.dockPosition||'bottom';
 shell.classList.toggle('bc-macos-desktop',desktopPrefs.desktopClean!==false);
 dockReveal(false);void wallpaperManager?.sync();
}
const cloudDesktopCache=new Map();let cloudDesktopAccount=null;let cloudDesktopWrites=Promise.resolve();let cloudDesktopRevision=0;let cloudDesktopReading=false;
const cloudDesktopStore={getItem:key=>cloudDesktopCache.get(key)??null,setItem:(key,value)=>cloudDesktopCache.set(key,String(value)),removeItem:key=>cloudDesktopCache.delete(key)};
function preferenceStores(){const stores=cloudDesktopAccount===storeProfile&&storeProfile?[{name:'cloud',store:cloudDesktopStore}]:[];for(const name of ['localStorage','sessionStorage']){try{stores.push({name,store:window[name]})}catch(_){}}return stores}
function readDesktopPrefs(){
 const defaults={...BASE_OS_PREFS,wallpaperImages:{...BASE_OS_PREFS.wallpaperImages},wallpaperHistory:[]};
 const options=[];
 for(const {name,store} of preferenceStores()){try{const raw=JSON.parse(store.getItem(prefKey())||'null');if(raw&&typeof raw==='object')options.push({raw,name})}catch(_){}}
 options.sort((a,b)=>a.name==='cloud'?-1:b.name==='cloud'?1:(Number(b.raw.savedAt)||0)-(Number(a.raw.savedAt)||0));
 const p=options[0]?.raw;
 if(p){
  for(const key of Object.keys(defaults)){
   const v=p[key];
   if(key==='autoLockMinutes'){if([0,1,5,10,15,30,60].includes(v))defaults[key]=v}
   else if(key==='wallpaper'){if(['midnight','obsidian','skyline','custom'].includes(v))defaults[key]=v}
   else if(key==='wallpaperSchemaVersion'){defaults[key]=Number(v)===2?2:1}
   else if(key==='dockPosition'){if(['bottom','left','right'].includes(v))defaults[key]=v}
   else if(key==='wallpaperMode'){if(['all','separate'].includes(v))defaults[key]=v}
   else if(key==='wallpaperFit'){if(['cover','contain','center'].includes(v))defaults[key]=v}
   else if(key==='wallpaperPosition'){if(['center','top','bottom'].includes(v))defaults[key]=v}
   else if(key==='wallpaperDim'){if(Number.isInteger(v)&&v>=0&&v<=75)defaults[key]=v}
   else if(key==='wallpaperBlur'){if(Number.isInteger(v)&&v>=0&&v<=14)defaults[key]=v}
   else if(key==='wallpaperImages'){if(v&&typeof v==='object'&&!Array.isArray(v))for(const t of ['all','phone','tablet','desktop'])if(typeof v[t]==='string'&&v[t].length<=220)defaults.wallpaperImages[t]=v[t]}
   else if(key==='wallpaperHistory'){if(Array.isArray(v))defaults.wallpaperHistory=v.filter(e=>e&&typeof e.path==='string'&&e.path.length<=220).slice(0,8)}
   else if(typeof v==='boolean')defaults[key]=v;
  }
  if(!p.wallpaperSchemaVersion&&defaults.wallpaper==='obsidian')defaults.wallpaper='midnight';
 }
 defaults.wallpaperSchemaVersion=2;
 return {prefs:defaults,savedAt:Number(p?.savedAt)||0,source:options[0]?.name||null};
}
let desktopPrefsSavedAt=0;
function initDesktopPrefs(){const saved=readDesktopPrefs();desktopPrefs=saved.prefs;desktopPrefsSavedAt=saved.savedAt;applyDesktopPrefs()}
function setDesktopPref(key,value){
 const choices={dockPosition:['bottom','left','right'],autoLockMinutes:[0,1,5,10,15,30,60],wallpaper:['midnight','obsidian','skyline','custom'],wallpaperMode:['all','separate'],wallpaperFit:['cover','contain','center'],wallpaperPosition:['center','top','bottom']};
 const flags=['reduceMotion','dockLabels','dockAutoHide','desktopClean'],ranges={wallpaperDim:75,wallpaperBlur:14};
 if(![...Object.keys(choices),...flags,...Object.keys(ranges),'wallpaperImages','wallpaperHistory'].includes(key))return {ok:false,message:'Unknown preference.'};
 if(Object.hasOwn(choices,key)&&!choices[key].includes(value))return {ok:false,message:'Invalid selection.'};
 if(Object.hasOwn(ranges,key)&&(!Number.isInteger(value)||value<0||value>ranges[key]))return {ok:false,message:'Invalid intensity.'};
 if(key==='wallpaperImages'&&(!value||typeof value!=='object'||Array.isArray(value)||['all','phone','tablet','desktop'].some(t=>typeof value[t]!=='string'||value[t].length>220)))return {ok:false,message:'Invalid wallpaper file.'};
 if(key==='wallpaperHistory'&&(!Array.isArray(value)||value.length>8))return {ok:false,message:'Invalid wallpaper history.'};
 desktopPrefs[key]=flags.includes(key)?!!value:value;
 desktopPrefs.wallpaperSchemaVersion=2;applyDesktopPrefs();
 desktopPrefsSavedAt=Math.max(Date.now(),desktopPrefsSavedAt+1);
 const record=JSON.stringify({...desktopPrefs,savedAt:desktopPrefsSavedAt});void cloudWorkspaceSave('settings',record);
 const saved=[];
 for(const {name,store} of preferenceStores()){try{store.setItem(prefKey(),record);if(store.getItem(prefKey())===record)saved.push(name)}catch(_){}}
 if(saved.includes('localStorage'))return {ok:true,message:'Saved to this browser. Your setting will be restored after refresh.'};
 if(saved.includes('sessionStorage'))return {ok:true,message:'Saved for this tab. Survives refresh; browser storage is unavailable for future sessions.'};
 return {ok:false,message:'Browser storage is blocked. This change is active but cannot be saved after refresh.'};
}
function openStoreSection(category='discover'){showApp('store',{category});windows.get('store')?.selectCategory?.(category)}
window.addEventListener('blackcell:open-wallpaper-settings',()=>{if(active||preview)openAppOrStore('settings','appearance')});
function openAppOrStore(id,section=null){if(preview||installedApp(id)){showApp(id,section?{section}:null);if(section)windows.get(id)?.selectSettings?.(section)}else{openStoreSection('discover');if(!preview)osNotice('Reinstall this application from the App Store.')}}

let corporateClient,corporateAuthorize;
const $=id=>document.getElementById(id),preview=document.body.dataset.preview==='true';
wallpaperManager=createWallpaperController({getClient:()=>client,getAccount:()=>storeProfile,getPrefs:()=>desktopPrefs,setPreference:setDesktopPref,isPreview:()=>preview,getCloudReady:()=>workspaceCloudReady,awaitSync:()=>cloudDesktopWrites});
/* Responsive presentation only; authentication and application permissions are independent. */
function osDeviceMode({ua='',touches=0,screenWidth=0,screenHeight=0,width=0}){
 const short=Math.min(screenWidth||Infinity,screenHeight||Infinity),phone=/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(ua)||(touches>0&&short<650),tablet=/iPad/i.test(ua)||(/Macintosh|MacIntel/i.test(ua)&&touches>1)||(/Android/i.test(ua)&&!phone);
 return phone||width<=620?'phone':tablet?'tablet':'desktop';
}
function syncOSDeviceLayout(){
 const root=document.documentElement,mode=osDeviceMode({ua:navigator.userAgent||'',touches:navigator.maxTouchPoints||0,screenWidth:screen.width,screenHeight:screen.height,width:innerWidth});
 root.classList.toggle('bc-os-phone',mode==='phone');root.classList.toggle('bc-os-tablet',mode==='tablet');
 const viewport=window.visualViewport,scaled=viewport&&Math.abs(viewport.scale-1)<.02;
 if(mode!=='desktop'&&scaled&&viewport.height>0){root.style.setProperty('--bc-touch-height',Math.round(viewport.height)+'px');root.classList.toggle('bc-os-keyboard',innerHeight-viewport.height>120)}
 else{root.style.removeProperty('--bc-touch-height');root.classList.remove('bc-os-keyboard')}
}
const touchOS=()=>document.documentElement.classList.contains('bc-os-phone')||document.documentElement.classList.contains('bc-os-tablet');
syncOSDeviceLayout();window.addEventListener('resize',syncOSDeviceLayout,{passive:true});window.addEventListener('resize',()=>void wallpaperManager?.sync(),{passive:true});window.addEventListener('orientationchange',syncOSDeviceLayout,{passive:true});window.visualViewport?.addEventListener('resize',syncOSDeviceLayout,{passive:true});
let client,embeddedAdmin=false,owner=false,active=false,leaving=false,last=Date.now(),touched=Date.now(),touching=false,checking=false;
const IDLE=60*60*1000;
let workspaceLock=null,bootComplete=false;
const BOOT_MIN_MS=1100,BOOT_COMPLETE_HOLD_MS=250;
const VERIFY_DEADLINE_MS=25000,CATALOG_DEADLINE_MS=10000;
let recoveryTimer=null,recoveryAttempts=0,recoveryAccount=null,recoveryLast=null,bootInProgress=false,runtimeWired=false;
function stopRecovery(){if(recoveryTimer!==null){clearTimeout(recoveryTimer);recoveryTimer=null}}
function scheduleRecovery(delay){stopRecovery();if(leaving||$('gate').dataset.state!=='paused')return;recoveryTimer=setTimeout(()=>{recoveryTimer=null;void retryVerification()},delay)}
function recoveryDelay(attempt){return Math.min(30000,2000*2**Math.min(Math.max(0,attempt-1),4))}
async function retryVerification(){if(leaving||$('gate').dataset.state!=='paused')return;if(bootInProgress||checking||touching){scheduleRecovery(1000);return}if(navigator.onLine===false){$('gateMessage').textContent='Connection interrupted. BLACKCELL will reconnect automatically when you are online. Your sign-in is retained.';scheduleRecovery(15000);return}stopRecovery();await bootOS()}

async function osDeadline(promise,label,ms=VERIFY_DEADLINE_MS){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(label+' timed out'),{osStep:label})),ms)})])}finally{clearTimeout(timer)}}
function checkedIdentity(){return osDeadline(corporateAuthorize(client,{allowLedgerOnly:true,classifyTransport:true}),'Identity verification')}
function checkedSecurity(){return osDeadline(client.rpc(owner?'corp_code_status':'corp_employee_code_status'),'Security verification')}
let bootStarted=null,bootTarget=0,bootTimer=null;
function stopBootProgress(){if(bootTimer!==null){clearInterval(bootTimer);bootTimer=null}}
function drawBootProgress(){const gate=$('gate');if(!gate||gate.dataset.state!=='boot'||bootStarted===null){stopBootProgress();return}const elapsed=Math.max(0,performance.now()-bootStarted);const value=Math.min(bootTarget,100,elapsed/BOOT_MIN_MS*100);const progress=$('osBootProgress');if(progress)progress.style.width=value.toFixed(2)+'%';}
function bootStage(value,message){const gate=$('gate');if(!gate)return;gate.dataset.state='boot';if(bootStarted===null){bootStarted=performance.now();bootTimer=setInterval(drawBootProgress,45)}bootTarget=Math.max(bootTarget,value);$('gateMessage').textContent=value===100?'Starting your desktop…':message;drawBootProgress();}
async function finishBoot(){
 // A fresh approval triggers the cinematic only after the real OS is ready.
 if(!preview&&active&&!leaving&&!workspaceLock?.isLocked()&&$('gate').dataset.state==='boot'&&window.bcVerifiedOsLaunch){
  let fresh=false;try{fresh=window.bcVerifiedOsLaunch.consume()}catch(_){}
  if(fresh||(!bootComplete&&recoveryAttempts===0&&window.bcVerifiedOsLaunch.isMobile())){
   stopBootProgress();
   const ready=()=>active&&!leaving&&!workspaceLock?.isLocked()&&$('gate').dataset.state==='boot';
   const reveal=()=>{if(!ready())return false;bootComplete=true;$('gate').hidden=true;$('desktop').hidden=false;applyAppLayout();window.dispatchEvent(new Event('blackcell:desktop-ready'));return true};
   try{return await window.bcVerifiedOsLaunch.run({gate:$('gate'),desktop:$('desktop'),ready,reveal,reduceMotion:desktopPrefs.reduceMotion})}catch(_){if(bootComplete)return true;if(!ready())return false;return reveal()}
  }
 }
 if(!preview&&recoveryAttempts===0&&!workspaceLock?.isLocked()&&!desktopPrefs.reduceMotion&&bootStarted!==null){
  const remaining=Math.max(0,BOOT_MIN_MS-(performance.now()-bootStarted));if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
  if(!active||leaving||$('gate').dataset.state!=='boot'){stopBootProgress();return false}
  drawBootProgress();$('gateMessage').textContent='Workspace ready';await new Promise(resolve=>setTimeout(resolve,BOOT_COMPLETE_HOLD_MS));
 }
 stopBootProgress();
 if(!preview&&(!active||leaving||$('gate').dataset.state!=='boot'))return false;
 bootComplete=true;$('gate').hidden=true;if(!workspaceLock?.isLocked())$('desktop').hidden=false;applyAppLayout();window.dispatchEvent(new Event('blackcell:desktop-ready'));return true;
}
function setupWorkspaceLock(){if(workspaceLock)return;workspaceLock=createWorkspaceLock({host:$('desktop'),preview,account:()=>({id:storeProfile,name:$('memberName').textContent,initials:$('initials').textContent}),usable:()=>!leaving&&(active||preview),verify:async secret=>{const verified=await verifyWorkspacePassword(client,storeProfile,secret);if(!verified.ok)return verified;const result=await corporateAuthorize(client,{allowLedgerOnly:true});if(!result.ok||result.user.id!==storeProfile||!memberAllowed(result.member)||(!owner&&result.member.access_scope==='ledger_only'))return {ok:false,message:'Corporate session has expired. Sign Out and authenticate again.'};const {data,error}=await client.rpc(owner?'corp_code_status':'corp_employee_code_status');if(error||data?.ok!==true||data?.verified!==true)return {ok:false,message:'Corporate security verification expired. Sign Out and authenticate again.'};return {ok:true}},onLock:()=>{phoneNavigation.dismiss();if(!preview)window.BLACKCELL_SYSTEM_SOUNDS?.play('lock');closeAppPasswordPrompt();hideProtectedWindows();const parked=$('osParkedChatRail');if(parked){parked.hidden=true;parked.replaceChildren();}securityNotifications?.pause();chatUnreadMonitor?.reset();connectController?.stop();closeRecycleBin();finishAppRearrange();cancelAppHold();closeAppContext();closeMenu();dockReveal(false);saveWorkspace();for(const r of windows.values()){if(r.frame)pauseFrameMedia(r.frame);for(const media of r.el.querySelectorAll('video,audio'))try{media.pause()}catch(_){}}},onUnlock:()=>{if(!preview)window.BLACKCELL_SYSTEM_SOUNDS?.play('unlock');syncParkedChatBubbles();last=Date.now();if(bootComplete)$('desktop').hidden=false;applyAppLayout();void activity();void recheck();void securityNotifications?.refresh();void chatUnreadMonitor?.refresh()},onSignOut:()=>void signOut()});}
function lockWorkspace(mode='lock'){if(!workspaceLock||workspaceLock.isLocked())return;workspaceLock.lock(mode);}

function restartWorkspace(){
 if(!active&&!preview)return;
 if([...windows.values()].some(appBusy)){osNotice('Finish active operations before restarting.');return}
 let d=document.getElementById('bcRestartDialog');
 if(!d){
  d=document.createElement('dialog');d.id='bcRestartDialog';d.className='bc-restart-dialog';
  d.innerHTML='<div class="bc-restart-card"><div class="bc-restart-symbol" aria-hidden="true">↻</div><h2 id="bcRestartTitle">Restart BLACKCELL OS?</h2><p id="bcRestartDesc">Your open windows and desktop layout will be restored after restarting. Save unfinished work in your applications before continuing.</p><div class="bc-restart-actions"><button type="button" class="bc-restart-cancel">Cancel</button><button type="button" class="bc-restart-confirm">Restart</button></div></div>';
  d.setAttribute('aria-labelledby','bcRestartTitle');d.setAttribute('aria-describedby','bcRestartDesc');document.body.append(d);
  d.querySelector('.bc-restart-cancel').onclick=()=>d.close('cancel');
  d.querySelector('.bc-restart-confirm').onclick=()=>{
   if([...windows.values()].some(appBusy)){d.close('cancel');osNotice('Finish active operations before restarting.');return}
   saveWorkspace();d.close('restart');location.reload();
  };
 }
 if(!d.open){d.showModal();d.querySelector('.bc-restart-cancel').focus()}
}
const dockDefaults=new Set([...document.querySelectorAll('.dock [data-open]')].map(b=>b.dataset.open));
dockDefaults.add('uploadqueue');
let dockOverrides=new Map();
let storeModule,storeProfile=null,widgetState=null,storeInstalled=new Set(),storeRules=new Map(),storeAdmin=false,storeLevel=null,storeError='',storeSequence=0,storeMutating=false,catalogPending=null;
// Catalog metadata for recently released apps. Permissions always come from corp_app_store.
const releasedApps={
 omega:{title:'OMEGA // THE HUNT',sub:'Explore · Worlds · Dossiers · Operations',url:'blackcell-omega.html?v=20261117-unified-r1',
  desc:'One combined discovery app for photos and videos, connected catalog clues, visual dossiers, seven worlds and verified collection missions. Original media and research are preserved; vision-model identification remains pending.',
  path:'M12 2l8 4v12l-8 4-8-4V6z M12 6l5 2.8v6.4L12 18l-5-2.8V8.8z M8 12h8 M12 8v8'},
 uploadqueue:{title:'Uniform Intelligence',sub:'Global uniform recognition & AI Training',url:'blackcell-uniform-intelligence.html?v=20261117-review-r12',desc:'Site-wide media inventory, private AI teaching and corrections, international camouflage references, lookalike-country comparison, and original Upload Queue. Verified examples remain private; public publishing requires separate approval.',path:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M19 14h2v7h-7v-2'},
 community:{title:'Community',sub:'Community management & Concierge · Preview',url:'blackcell-community.html?v=8-resident-details',desc:'Optional administrator preview: Explore concierge authorizations, access control, demo guest logs and invitation scanning, plus announcements, maintenance requests and resident workspaces with fictional sample data. No live residents, payments, cloud saving or messaging. Changes reset when reloaded.',path:'M3 21V8l9-5 9 5v13H3z M8 21v-6h8v6 M8 9h2 M14 9h2 M8 12h2 M14 12h2'},
 notes:{"title":"Notes","sub":"Notes & notebooks · Beta","url":"blackcell-os-app-suite.html?app=notes","desc":"Optional beta: Notes, notebooks, search, text/JSON export. Still pending: Account storage, import. Export before restarting or uninstalling; no automatic cloud saving.","path":"M4 3h16v18H4z M8 3v18 M11 7h6 M11 11h6 M11 15h6"},
 calendar:{"title":"Calendar","sub":"Event planner · Beta","url":"blackcell-os-app-suite.html?app=calendar","desc":"Optional beta: Month navigation, dated events, JSON export. Still pending: Recurrence, external calendar, account storage. Export before restarting or uninstalling; no automatic cloud saving.","path":"M3 5h18v16H3z M3 10h18 M7 2v6 M17 2v6 M7 14h2 M15 14h2"},
 reminders:{"title":"Reminders","sub":"Tasks & due dates · Beta","url":"blackcell-os-app-suite.html?app=reminders","desc":"Optional beta: Task lists, deadlines, completion and overdue status. Still pending: Account storage, background reminders. Export before restarting or uninstalling; no automatic cloud saving.","path":"M8 5h13 M8 12h13 M8 19h13 M3 5h1 M3 12h1 M3 19h1"},
 contacts:{"title":"Contacts","sub":"Address book · Beta","url":"blackcell-os-app-suite.html?app=contacts","desc":"Optional beta: Create/edit/delete/search, CSV export. Still pending: Import and account storage. Export before restarting or uninstalling; no automatic cloud saving.","path":"M4 3h16v18H4z M12 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M7 18c0-5 10-5 10 0"},
 mail:{"title":"BLACKCELL Mail","sub":"Private corporate email","url":"blackcell-mail.html?v=20261128-icon1","desc":"Send internal mail to authorized BLACKCELL members. Account-synced inbox, sent, drafts, starred, archive and trash. External email and attachments are not included.","path":"M2 5h20v14H2z M2 5l10 8L22 5","artwork":"blackcell-mail-icon.svg?v=20261128-1"},
 gunner:{"title":"Gunner AI","sub":"AI request workspace · Connection pending · Beta","url":"blackcell-os-app-suite.html?app=gunner","desc":"Optional beta: Conversation request editor and export. Still pending: Authorized AI integration and actual replies. Export before restarting or uninstalling; no automatic cloud saving.","path":"M12 2l2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z"},
 music:{"title":"Music","sub":"Local music player · Beta","url":"blackcell-os-app-suite.html?app=music","desc":"Optional beta: Local audio file selection and playback, auto-next. Still pending: Account media library, playlists. Export before restarting or uninstalling; no automatic cloud saving.","path":"M9 18V5l12-2v13 M9 18c0 4-7 4-7 0s7-4 7 0 M21 16c0 4-7 4-7 0s7-4 7 0"},
 cinema:{"title":"Cinema","sub":"Personal video player · Beta","url":"blackcell-os-app-suite.html?app=cinema","desc":"Optional beta: Local video file selection and playback. Still pending: Account media library. Export before restarting or uninstalling; no automatic cloud saving.","path":"M3 5h18v14H3z M10 9l5 3-5 3z"},
 wallet:{"title":"Wallet","sub":"Manual finances & ledger · Beta","url":"blackcell-os-app-suite.html?app=wallet","desc":"Optional beta: Manual USD ledger, totals and CSV export. Still pending: Account storage, budget targets, optional banking. Export before restarting or uninstalling; no automatic cloud saving.","path":"M3 5h18v14H3z M15 9h7v6h-7z M17 12h1"},
 journal:{"title":"Journal","sub":"Daily writing · Beta","url":"blackcell-os-app-suite.html?app=journal","desc":"Optional beta: Dated writing, search and export. Still pending: Account storage and privacy tests. Export before restarting or uninstalling; no automatic cloud saving.","path":"M4 3h16v18H4z M7 3v18 M10 8h7 M10 12h7 M10 16h5"},
 vault:{"title":"Vault","sub":"Local file encryption · Beta","url":"blackcell-os-app-suite.html?app=vault","desc":"Optional beta: Local AES-GCM password-based file encryption/decryption. Still pending: Cryptographic round-trip and browser tests, cloud vault. Export before restarting or uninstalling; no automatic cloud saving.","path":"M4 9h16v12H4z M8 9V6a4 4 0 0 1 8 0v3 M12 14v3"},
 terminal:{"title":"Terminal","sub":"Restricted local utilities · Beta","url":"blackcell-os-app-suite.html?app=terminal","desc":"Optional beta: Allowlisted local utility commands. Still pending: Authorized administrative tools, if approved. Export before restarting or uninstalling; no automatic cloud saving.","path":"M3 3h18v18H3z M7 8l4 4-4 4 M13 16h4"},
 voicememos:{"title":"Voice Memos","sub":"Audio recording · Beta","url":"blackcell-os-app-suite.html?app=voicememos","desc":"Optional beta: Microphone recording, playback and download. Still pending: Browser microphone tests and account storage. Export before restarting or uninstalling; no automatic cloud saving.","path":"M9 3h6v10a3 3 0 0 1-6 0z M5 11v2a7 7 0 0 0 14 0v-2 M12 20v2 M8 22h8"},
 documents:{"title":"Documents","sub":"Text documents · Beta","url":"blackcell-os-app-suite.html?app=documents","desc":"Optional beta: Plain-text editor, word count, export. Still pending: Rich formatting, account storage, DOCX import/export. Export before restarting or uninstalling; no automatic cloud saving.","path":"M5 2h10l5 5v15H5z M15 2v5h5 M8 11h9 M8 15h9 M8 19h6"},
 spreadsheets:{"title":"Spreadsheets","sub":"Grid & formulas · Beta","url":"blackcell-os-app-suite.html?app=spreadsheets","desc":"Optional beta: 25x8 formula grid, CSV and JSON export. Still pending: Browser and larger formula tests, XLSX and account storage. Export before restarting or uninstalling; no automatic cloud saving.","path":"M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18"},
 creativestudio:{"title":"Creative Studio","sub":"Local editor · AI connection pending · Beta","url":"blackcell-os-app-suite.html?app=creativestudio","desc":"Optional beta: Local image editing, export and AI brief. Still pending: Approved AI image/video providers, job billing. Export before restarting or uninstalling; no automatic cloud saving.","path":"M4 4h16v16H4z M4 17l5-6 4 4 3-3 4 5 M16 7h1"},
 presentations:{"title":"Presentations","sub":"Slides & themes · Beta","url":"blackcell-os-app-suite.html?app=presentations","desc":"Optional beta: Slide editor, themes, preview, JSON export. Still pending: Account storage, import, PPTX export. Export before restarting or uninstalling; no automatic cloud saving.","path":"M3 3h18v15H3z M7 22l5-4 5 4 M7 8h10 M7 12h6"},
 calculator:{title:'Calculator',sub:'Standard & scientific · Beta',url:'blackcell-os-utilities.html?app=calculator',desc:'Optional beta: keyboard and touch arithmetic, scientific functions, degrees and radians. No personal data or cloud service required.',path:'M5 2h14v20H5z M8 5h8v4H8z M8 13h1 M15 13h1 M8 17h1 M15 17h1'},
 worldclock:{title:'World Clock',sub:'Time zones & foreground alarms · Beta',url:'blackcell-os-utilities.html?app=worldclock',desc:'Optional beta: live time zones, add or remove cities and set one-time local alarms while this app is running. Preferences are session-only; background alarms are not supported.',path:'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M2 12h20 M12 2c-6 5-6 15 0 20 M12 2c6 5 6 15 0 20'},
 developerpreview:{title:'Developer Preview',sub:'REDLINE · Owner-only test lab',url:'blackcell-developer-preview.html?v=20261127-sender-menu4',desc:'Isolated REDLINE receiver and sender testing with desktop, tablet and mobile modes. No live chat, pricing or payment writes.',path:'M3 4h18v13H3z M8 21h8 M12 17v4 M9 8l-3 3 3 3 M15 8l3 3-3 3'},
 photoledger:{title:'BLACKCELL REDLINE',sub:'Private photo accounts',url:'private-photo-ledger.html?osApp=photoledger&redlineBuild=receiver-photo-history-visible1-20261121&senderPreview=imessage-payday-v2&redlineRelease=20261123-photo-credit-counter-inline1&redlineGallery=20261124-fullscreen7&receiverRestore=20261124-v1&independentReview=20261124-mobile-parity7&desktopReceiver=20261125-parity1&roomDirectory=20261125-redline-review-separation1&senderRelease=20261127-sender-menu4&uploadMode=20261127-volatile-upload-rollback1&negotiate=20261127-chat-negotiate1&focus=20261127-receiver-stationary-focus1&stability=20261127-sender-stability1&sessionLock=20261127-manual-session-lock2',desc:'Open existing private photo rooms, submissions, balances and settlement records. Existing room permissions apply.',path:'M3 3h18v18H3z M8 3v18 M12 8h5 M12 12h5 M12 16h3'},
};
function releaseIcon(app){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('stroke-linecap','round');svg.setAttribute('aria-hidden','true');if(app.artwork){const image=document.createElementNS(ns,'image');image.setAttribute('href',app.artwork);image.setAttribute('width','24');image.setAttribute('height','24');svg.setAttribute('class','bc-mail-approved-art');svg.style.setProperty('width','100%','important');svg.style.setProperty('height','100%','important');svg.style.setProperty('filter','none','important');svg.append(image)}else{path.setAttribute('d',app.path);svg.append(path)}return svg}
function ensureReleaseTiles(){
 const grid=document.querySelector('.apps'),dock=document.querySelector('.dock');
 for(const [id,app] of Object.entries(releasedApps)){
  // A catalog registration is not an authorization grant; the server controls both listing and installation.
  if(id==='developerpreview'||!storeRules.has(id))continue;
  if(grid&&!grid.querySelector('[data-app="'+id+'"]')){
   const tile=document.createElement('button');tile.type='button';tile.className='app';tile.hidden=true;Object.assign(tile.dataset,{app:id,title:app.title,sub:app.sub,url:app.url,desc:app.desc,optional:id==='developerpreview'?'false':'true'});
   for(const [cls,label] of [['app-icon',null],['app-name',app.title],['app-sub',app.sub]]){const n=document.createElement('span');n.className=cls;if(label===null)n.append(releaseIcon(app));else n.textContent=label;tile.append(n)}
   tile.addEventListener('click',()=>showApp(id));bindAppContext(tile);grid.append(tile);
  }
  if(dock&&!dock.querySelector('[data-open="'+id+'"]')){
   const button=document.createElement('button');button.type='button';button.hidden=true;button.dataset.open=id;button.title=app.title;button.setAttribute('aria-label',app.title);const label=document.createElement('span');label.textContent=app.title;button.append(releaseIcon(app),label);button.addEventListener('click',()=>showApp(id));dock.append(button);
  }
 }
}
function applyStore(data){storeAdmin=data.owner===true;storeLevel=data.level;storeRules=new Map((data.apps||[]).map(a=>[a.id,a]));storeInstalled=new Set((data.apps||[]).filter(a=>a.allowed&&a.installed).map(a=>a.id));storeError='';ensureReleaseTiles();syncStore();syncParkedChatBubbles()}
function clearStore(error){storeRules.clear();storeInstalled.clear();storeAdmin=false;storeLevel=null;storeError=error;syncStore()}
async function storeRequest(p_action,p_app=null,p_level=null,p_enabled=null){
 if(preview||!active||!storeProfile)return {ok:false,error:'Corporate access required.'};
 const mutation=p_action!=='catalog';
 if(storeMutating)return {ok:false,error:'An App Store change is already in progress.'};
 if(!mutation&&catalogPending)return catalogPending;
 if(mutation)storeMutating=true;
 const task=async()=>{
  if(mutation&&catalogPending)await catalogPending;
  if(!active||leaving)return {ok:false,error:'Your corporate session ended. Sign in again.'};
  const seq=++storeSequence;
  try{
   const request=client.rpc('corp_app_store',{p_action,p_app,p_level,p_enabled});
   const {data,error}=mutation?await request:await osDeadline(request,'Application catalog',CATALOG_DEADLINE_MS);
   if(seq!==storeSequence||!active)return {ok:false,error:'Your corporate session has changed. Refresh catalog.'};
   if(error||data?.ok!==true){
    const message=String(data?.error||error?.message||'App Store catalog unavailable.').slice(0,220);
    if(!mutation)clearStore(message);
    return {ok:false,error:message};
   }
   if(!Array.isArray(data.apps)){if(!mutation)clearStore('Invalid catalog response. Refresh to retry.');return {ok:false,error:'Invalid catalog response.'}}
   applyStore(data);
   if(p_action==='install'&&!storeInstalled.has(p_app))return {ok:false,error:'The server did not confirm installation. Refresh catalog to retry.'};
   return {ok:true};
  }catch(e){const message='App Store connection failed. '+String(e?.message||'Refresh to retry.').slice(0,160);if(seq===storeSequence&&!mutation)clearStore(message);return {ok:false,error:message}}
 };
 if(mutation){try{return await task()}finally{storeMutating=false}}
 const pending=task();catalogPending=pending;
 try{return await pending}finally{if(catalogPending===pending)catalogPending=null}
}
/* The six optional worlds are local BLACKCELL desktop installations, deliberately outside the App Store.
   They inherit the server-authorized Man's Armed Forces permission; saving a tile never grants media access. */
const worldApps=Object.freeze({uniform:'worlduniform',military:'worldmilitary',police:'worldpolice',fire:'worldfire',security:'worldsecurity',medical:'worldmedical',professional:'worldprofessional'});
const worldAppIds=new Set(Object.values(worldApps));
const worldLaunchPages=Object.freeze({worlduniform:'uniform-world.html',worldmilitary:'military-world.html',worldpolice:'law-enforcement-world.html',worldfire:'fire-rescue-world.html',worldsecurity:'corrections-world.html',worldmedical:'ems-world.html',worldprofessional:'aviation-world.html'});
function restoreWorldInstance(record){
 const page=record.id==='forces'?'mans-armed-forces.html':worldLaunchPages[record.id];if(!page||!record.frame)return;
 try{const target=new URL(page,location.href),current=new URL(record.frame.contentWindow.location.href);const otherWorld=Object.values(worldLaunchPages).some(p=>new URL(p,location.href).pathname===current.pathname);const gateway=current.pathname===new URL('mans-armed-forces.html',location.href).pathname;const retired=/\/(usa-page|military-country|corporate-network)\.html$/.test(current.pathname);if(current.origin===target.origin&&(gateway||otherWorld||retired)&&current.pathname!==target.pathname){if(appBusy(record)){osNotice('Finish the active operation before returning to this world.');return}record.frameLoading?.begin();target.searchParams.set('v','20261115-world-cleanup');record.frame.contentWindow.location.replace(target.href)}}catch(_){}
}

let worldInstalled=new Set();

// Account-scoped workspace preferences; never grants application permissions.
let workspaceCloudReady=false;
async function cloudWorkspaceSave(kind,record){
 if(preview||!storeProfile||!workspaceCloudReady)return false;
 const uid=storeProfile;cloudDesktopRevision++;const keys={worlds:worldInstallKey(),dock:dockPreferenceKey(),layout:layoutKey(),settings:prefKey()};cloudDesktopCache.set(keys[kind],record);
 const write=cloudDesktopWrites.catch(()=>{}).then(async()=>{if(uid!==storeProfile)return false;try{const {error}=await client.from('corp_os_workspace_preferences').upsert({user_id:uid,kind,value:JSON.parse(record)},{onConflict:'user_id,kind'});if(error)throw error;return true}catch(_){osNotice('Cloud workspace sync unavailable. Local changes may not appear on other devices.');return false}});cloudDesktopWrites=write;return write;
}
async function cloudWorkspaceLoad(){
 workspaceCloudReady=false;if(preview||!storeProfile)return;
 const uid=storeProfile,keys={worlds:worldInstallKey(),dock:dockPreferenceKey(),layout:layoutKey(),settings:prefKey()};if(cloudDesktopAccount!==uid){cloudDesktopCache.clear();cloudDesktopAccount=uid}
 try{
  const {data,error}=await client.from('corp_os_workspace_preferences').select('kind,value').eq('user_id',uid);
  if(error||uid!==storeProfile)return;
  workspaceCloudReady=true;
  const seen=new Set();
  for(const row of data||[]){
   if(!Object.hasOwn(keys,row.kind))continue;
   seen.add(row.kind);
   if(row.kind==='layout'){
    // Offline edits must not be discarded by an older server snapshot.
    // Keep the newest member-scoped home layout and upload it on reconnect.
    let local=null,localTime=0;
    for(const {store} of preferenceStores())try{
     const value=store.getItem(keys.layout);if(!value)continue;
     const parsed=JSON.parse(value),time=Number(parsed?.unifiedHome?.changedAt)||0;
     if(time>localTime&&Number.isFinite(time)){local=value;localTime=time}
    }catch(_){}
    const serverTime=Number(row.value?.unifiedHome?.changedAt)||0;
    if(local&&localTime>serverTime){
     for(const {store} of preferenceStores())try{store.setItem(keys.layout,local)}catch(_){}
     await cloudWorkspaceSave('layout',local);
     continue;
    }
   }
   const value=JSON.stringify(row.value);
   cloudDesktopCache.set(keys[row.kind],value);
   for(const {store} of preferenceStores())try{store.setItem(keys[row.kind],value)}catch(_){}
  }
  for(const [kind,key] of Object.entries(keys))if(!seen.has(kind)){for(const {store} of preferenceStores()){try{const record=store.getItem(key);if(record){await cloudWorkspaceSave(kind,record);break}}catch(_){}}}
  readWorldInstalls();readDockPreferences();readAppLayout();initDesktopPrefs();
 }catch(_){}
}

const worldInstallKey=()=> 'bc.os.world-installs.v1:'+String(storeProfile||'');
function readWorldInstalls(){
 worldInstalled=new Set();if(preview||!storeProfile)return;
 try{const saved=JSON.parse(cloudDesktopCache.get(worldInstallKey())??localStorage.getItem(worldInstallKey())??'[]');if(Array.isArray(saved))worldInstalled=new Set(saved.filter(id=>worldAppIds.has(id)))}catch(_){}
}
function saveWorldInstalls(next){
 if(!storeProfile||preview||!active||leaving)return false;
 try{const serialized=JSON.stringify([...next].filter(id=>worldAppIds.has(id)));cloudDesktopCache.set(worldInstallKey(),serialized);try{localStorage.setItem(worldInstallKey(),serialized)}catch(_){}worldInstalled=new Set(JSON.parse(serialized));return true}catch(_){return false}
}
function authorizedApp(id){if(id==='developerpreview')return !preview&&active&&owner&&!leaving;return id==='store'||(worldAppIds.has(id)?!!storeRules.get('forces')?.allowed:!!storeRules.get(id)?.allowed)}
function installedApp(id){if(id==='developerpreview')return authorizedApp(id);return id==='store'||authorizedApp(id)&&(worldAppIds.has(id)?worldInstalled.has(id):storeInstalled.has(id))}
function worldStatus(){return Object.fromEntries(Object.entries(worldApps).map(([category,id])=>[category,installedApp(id)]))}
function worldGatewayFrame(record){
 if(!record?.frame||!(record.id==='forces'||worldAppIds.has(record.id))||!installedApp(record.id))return false;
 try{return record.frame.contentWindow.location.origin===location.origin&&record.frame.contentWindow.location.pathname===new URL('mans-armed-forces.html',location.href).pathname}catch(_){return false}
}
function sendWorldStatus(record,extra={}){
 if(!worldGatewayFrame(record))return;
 try{record.frame.contentWindow.postMessage({type:'blackcell-world-os-state',installed:worldStatus(),...extra},location.origin)}catch(_){}
}
function broadcastWorldStatus(){for(const record of windows.values())sendWorldStatus(record)}
async function installWorldApp(id,install){
 if(!contextAllowed()||!worldAppIds.has(id)||!authorizedApp(id))return {ok:false,error:'Verified BLACKCELL OS access is required.'};
 const account=storeProfile;
 if(!install){
  const result=await closeForUninstall(id);if(!result.ok)return result;
  if(!contextAllowed()||storeProfile!==account||!authorizedApp(id))return {ok:false,error:'Corporate session changed; try again.'};
 }
 const next=new Set(worldInstalled);if(install)next.add(id);else next.delete(id);
 if(workspaceCloudReady&&!await cloudWorkspaceSave('worlds',JSON.stringify([...next])))return {ok:false,error:'Could not save application to your cloud workspace. Retry.'};
 if(!saveWorldInstalls(next))return {ok:false,error:'Desktop storage is unavailable. The world was not '+(install?'installed.':'uninstalled.')};
 if(install&&recycledApps.has(id)){recycledApps.delete(id);saveAppLayout()}
 syncStore();saveWorkspace();
 return {ok:true};
}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||!contextAllowed())return;
 const data=event.data;if(!data||typeof data!=='object'||!['blackcell-world-os-query','blackcell-world-os-install'].includes(data.type))return;
 const record=[...windows.values()].find(r=>r.frame?.contentWindow===event.source&&worldGatewayFrame(r));
 if(!record||record.el.hidden||record.suspended)return;
 if(data.type==='blackcell-world-os-query'){sendWorldStatus(record);return}
 const category=data.category;if(typeof category!=='string'||!Object.hasOwn(worldApps,category))return;
 const id=worldApps[category],request=typeof data.request==='string'?data.request.slice(0,80):'';
 if(!authorizedApp(id)){sendWorldStatus(record,{request,category,ok:false,error:'Your corporate access does not permit this world.'});return}
 if(installedApp(id)){showApp(id);sendWorldStatus(record,{request,category,ok:true,opened:true});return}
 void installWorldApp(id,true).then(result=>{
  if(!contextAllowed()||!worldGatewayFrame(record))return;
  if(result.ok)osNotice((document.querySelector('.app[data-app="'+id+'"]')?.dataset.title||'World')+' installed on BLACKCELL OS.');
  sendWorldStatus(record,{request,category,...result});
 });
});
window.addEventListener('storage',event=>{if(!contextAllowed()||event.key!==worldInstallKey())return;readWorldInstalls();syncStore()});
function dockPreferenceKey(){return 'bc.os.dock.v1:'+String(storeProfile)}
function readDockPreferences(){dockOverrides=new Map();if(!storeProfile)return;for(const {store} of preferenceStores()){try{const data=JSON.parse(store.getItem(dockPreferenceKey())||'null');if(!data||typeof data!=='object'||Array.isArray(data))continue;dockOverrides=new Map(Object.entries(data).filter(([id,value])=>/^[a-z][a-z0-9_-]{0,63}$/.test(id)&&typeof value==='boolean'));break}catch(_){}}}
function dockPinned(id){return dockOverrides.has(id)?dockOverrides.get(id):dockDefaults.has(id)}
function ensureDockShortcut(tile){
 const id=tile.dataset.app,dock=document.querySelector('.dock');if(!dock)return null;
 let b=dock.querySelector('[data-open="'+id+'"]');if(b)return b;
 if(!installedApp(id)||tile.hidden||!dockPinned(id))return null;
 const icon=tile.querySelector('.app-icon svg');if(!icon)return null;
 b=document.createElement('button');b.type='button';b.dataset.open=id;b.title=tile.dataset.title;b.setAttribute('aria-label',tile.dataset.title);
 const label=document.createElement('span');label.textContent=tile.querySelector('.app-name')?.textContent||tile.dataset.title;
 b.append(icon.cloneNode(true),label);b.addEventListener('click',()=>showApp(id));dock.append(b);b.classList.toggle('is-running',windows.has(id)&&!windows.get(id)?.suspended);return b;
}
function syncDockTile(tile){
 const id=tile.dataset.app;if(!tile.hidden&&dockPinned(id))ensureDockShortcut(tile);
 for(const b of document.querySelectorAll('.dock [data-open="'+id+'"]'))b.hidden=tile.hidden||!dockPinned(id);
}
function setDockPin(id,pinned){
 if(!contextAllowed()||!installedApp(id))return;
 const tile=document.querySelector('.app[data-app="'+id+'"]');if(!tile||tile.hidden||tile.disabled)return;
 dockOverrides.set(id,!!pinned);
 let saved=false;const record=JSON.stringify(Object.fromEntries(dockOverrides));void cloudWorkspaceSave('dock',record);for(const {name,store} of preferenceStores()){try{store.setItem(dockPreferenceKey(),record);if(name==='localStorage'&&store.getItem(dockPreferenceKey())===record)saved=true}catch(_){}}
 syncDockTile(tile);osNotice((tile.dataset.title||'App')+(pinned?' added to Dock.':' removed from Dock.')+(saved?'':' Preference could not be saved permanently on this device.'));if(pinned&&desktopPrefs.dockAutoHide)dockReveal(true)
}
function initStore(uid){chatUnreadMonitor?.reset();connectController?.stop();wallpaperManager?.dispose();osNoticeHistory=[];storeProfile=uid;spaceLoad();readWorldInstalls();readAppLocks();readDockPreferences();readAppLayout();clearStore('Checking app permissions…');window.dispatchEvent(new Event('blackcell:widget-sync'))}
function syncStore(){
 if(preview)return;
 void chatUnreadMonitor?.refresh();if(!installedApp('chat'))connectController?.stop();
 for(const tile of document.querySelectorAll('.app[data-app]')){
  const id=tile.dataset.app;tile.hidden=!installedApp(id);
  syncDockTile(tile);
  if(tile.hidden&&windows.has(id)){const r=windows.get(id);if(!authorizedApp(id)&&!storeError)dispose(r,true);else if(!r.suspended)suspend(r)}
 }
 if(appDrag&&(appDrag.tile.hidden||appDrag.target?.hidden))cancelAppDrag();
 applyAppLayout();
 window.dispatchEvent(new Event('blackcell:desktop-layout-updated'));
 if(recyclePanel)renderRecycleBin();
 $('adminReturn').hidden=!installedApp('administration');
 renderFolderPins();refreshAppLockBadges();windows.get('settings')?.refreshSettings?.();broadcastWorldStatus();
}
function storeCatalog(){if(preview)return [];return [...document.querySelectorAll('.app[data-app]')].filter(t=>t.dataset.app!=='store'&&!worldAppIds.has(t.dataset.app)&&!t.disabled&&storeRules.has(t.dataset.app)).map(t=>{const r=storeRules.get(t.dataset.app),optional=t.dataset.optional==='true';return {id:t.dataset.app,title:t.dataset.title,sub:t.dataset.sub,desc:t.dataset.desc,url:t.dataset.url,icon:t.querySelector('svg'),optional,removable:true,installed:storeInstalled.has(t.dataset.app),allowed:r.allowed,minLevel:r.minLevel,enabled:r.enabled}})}
function storeInfo(){return {owner:storeAdmin,level:storeLevel,error:preview?'Design preview only. Sign in to see your approved app catalog.':storeError,missingLedger:owner&&!preview&&!storeRules.has('photoledger'),release:'2026.11.17 · Application maintenance',registered:storeRules.size,ledger:storeRules.has('photoledger')?(storeInstalled.has('photoledger')?'Installed':storeRules.get('photoledger').allowed?'Available':'Restricted'):'Not returned',sessionRequired:!preview&&/session|verify corporate access|sign in|clearance required/i.test(storeError)}}
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

async function installApp(id,install){if(worldAppIds.has(id))return installWorldApp(id,install);if(!active||preview||id==='store'||id==='developerpreview'||!authorizedApp(id))return {ok:false,error:id==='store'?'The App Store must remain installed.':'Your access level does not permit this application.'};if(!install&&appBusy(windows.get(id)))return {ok:false,error:'Finish the active operation before uninstalling.'};const title=document.querySelector('.app[data-app="'+id+'"]')?.dataset.title||'Application';return timedAppOperation(title,install,async()=>{if(!authorizedApp(id))return {ok:false,error:'Your access level no longer permits this application.'};if(!install){const result=await closeForUninstall(id);if(!result.ok)return result}return storeRequest(install?'install':'remove',id)})}
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
function blocked(message){closeAppPasswordPrompt();stopRecovery();recoveryAttempts=0;recoveryAccount=null;recoveryLast=null;$('gateRetry').hidden=true;closeRecycleBin();finishAppRearrange();cancelAppHold();closeAppContext();stopBootProgress();workspaceLock?.dismiss();$('gate').dataset.state='blocked';stopStorageWidget();securityNotifications?.dispose();securityNotifications=null;chatUnreadMonitor?.reset();connectController?.stop();clearWorkspace();active=false;closeAll(true);$('desktop').hidden=true;$('gate').hidden=false;$('gateMessage').textContent=message;$('gateLink').hidden=false;hostMessage('blackcell-os-blocked');}
/* Fail closed on uncertain connectivity without revoking credentials or
   deleting the saved workspace. Explicit expiry still uses blocked/signOut. */
function pauseVerification(message){
 if(leaving)return;
 if($('gate').dataset.state==='paused'){if(recoveryTimer===null)scheduleRecovery(recoveryDelay(recoveryAttempts));return}
 if(active&&storeProfile){recoveryAccount=storeProfile;recoveryLast=last;saveWorkspace()}
 closeAppPasswordPrompt();active=false;bootComplete=false;workspaceReady=false;stopBootProgress();closeRecycleBin();finishAppRearrange();cancelAppHold();closeAppContext();closeMenu();dockReveal(false);workspaceLock?.dismiss();
 stopStorageWidget();securityNotifications?.dispose();securityNotifications=null;chatUnreadMonitor?.reset();connectController?.stop();closeAll(true);
 const delay=recoveryDelay(++recoveryAttempts);
 $('desktop').hidden=true;$('gate').dataset.state='paused';$('gate').hidden=false;$('gateMessage').textContent=message+' Reconnecting automatically. Your sign-in has not been ended.';$('gateRetry').hidden=false;$('gateRetry').disabled=false;$('gateRetry').textContent='RETRY NOW';$('gateLink').hidden=true;
 scheduleRecovery(delay);
}
const windows=new Map();let layer=25,selectedWindow=null;
const MAX_BC_SPACES=6;let bcSpaces=[{id:'1',name:'Desktop 1'}],bcSpace='1';
const spaceKey=()=> 'bc.os.spaces.v1:'+String(storeProfile||'preview');
const spaceValid=id=>bcSpaces.some(x=>x.id===String(id));
function spaceNotify(){window.dispatchEvent(new CustomEvent('blackcell:spaces-updated',{detail:{active:bcSpace}}))}
function spaceSave(){try{localStorage.setItem(spaceKey(),JSON.stringify({spaces:bcSpaces,active:bcSpace}))}catch(_){}spaceNotify()}
function spaceLoad(){
 bcSpaces=[{id:'1',name:'Desktop 1'}];bcSpace='1';
 try{
  const data=JSON.parse(localStorage.getItem(spaceKey())||'null');
  if(Array.isArray(data?.spaces)){
   const filtered=new Map();
   for(const item of data.spaces)if(item&&/^[1-6]$/.test(String(item.id))&&typeof item.name==='string'&&item.name.trim().length<=36)filtered.set(String(item.id),{id:String(item.id),name:item.name.trim()});
   filtered.set('1',{id:'1',name:filtered.get('1')?.name||'Desktop 1'});
   bcSpaces=[...filtered.values()].sort((a,b)=>Number(a.id)-Number(b.id)).slice(0,MAX_BC_SPACES);
  }
  if(spaceValid(data?.active))bcSpace=String(data.active);
 }catch(_){}
 spaceNotify();
}
function spaceVisibility(){
 for(const r of windows.values())if(!r.chatPopout){
  r.el.hidden=r.spaceId!==bcSpace||r.spaceShown===false||!!r.suspended||!!r.chatParked;
 }
 selectedWindow=[...windows.values()].filter(r=>!r.el.hidden&&!r.suspended).sort((a,b)=>(Number(b.el.style.zIndex)||0)-(Number(a.el.style.zIndex)||0))[0]||null;
 updateActiveAppMenu();syncStoreUpdateHold();syncChatVisibility();syncFullscreenShell();spaceNotify();
}
function spaceSwitch(id){
 id=String(id);if(!spaceValid(id)||id===bcSpace)return false;
 for(const r of windows.values())if(!r.chatPopout&&r.spaceId===bcSpace)r.spaceShown=!r.el.hidden&&!r.suspended;
 bcSpace=id;spaceVisibility();spaceSave();saveWorkspace();return true;
}
function spaceAdd(){
 if(bcSpaces.length>=MAX_BC_SPACES)return null;
 const id=String(Array.from({length:MAX_BC_SPACES},(_,i)=>i+1).find(n=>!spaceValid(n)));
 bcSpaces.push({id,name:'Desktop '+id});bcSpaces.sort((a,b)=>Number(a.id)-Number(b.id));spaceSave();return id;
}
function spaceRemove(id){
 id=String(id);if(id==='1'||!spaceValid(id))return false;
 for(const r of windows.values())if(r.spaceId===id){r.spaceId='1';r.spaceShown=true}
 bcSpaces=bcSpaces.filter(x=>x.id!==id);if(bcSpace===id)bcSpace='1';
 spaceVisibility();spaceSave();saveWorkspace();return true;
}
function spaceRename(id,name){
 if(!spaceValid(id)||typeof name!=='string'||!name.trim()||name.trim().length>36)return false;
 bcSpaces.find(x=>x.id===String(id)).name=name.trim();spaceSave();return true;
}
function spaceMove(id,dest){
 const r=windows.get(id);dest=String(dest);
 if(!r||r.chatPopout||!spaceValid(dest))return false;
 r.spaceId=dest;r.spaceShown=true;spaceVisibility();saveWorkspace();return true;
}
function syncFullscreenShell(){const activeFull=[...windows.values()].some(r=>r.el.classList.contains('bc-os-fullscreen')&&!r.el.hidden&&!r.suspended);$('desktop').classList.toggle('bc-os-fullscreen-active',activeFull);if(!activeFull)$('desktop').classList.remove('bc-os-menu-edge-open','bc-os-dock-edge-open')}
function fullscreenWindow(id){
 const r=windows.get(id);if(!r||touchOS())return false;
 const expand=!r.el.classList.contains('bc-os-fullscreen');
 for(const other of windows.values())if(other!==r&&other.el.classList.contains('bc-os-fullscreen')){other.el.classList.remove('bc-os-fullscreen','is-max')}
 r.el.classList.toggle('bc-os-fullscreen',expand);r.el.classList.toggle('is-max',expand);
 $('desktop').classList.remove('bc-os-menu-edge-open','bc-os-dock-edge-open');
 raise(r);syncFullscreenShell();saveWorkspace();return true;
}
window.BLACKCELL_MAC_BRIDGE=Object.freeze({
 ready:()=> (active||preview)&&!leaving&&!$('desktop').hidden&&!workspaceLock?.isLocked(),
 spaces:()=>({items:bcSpaces.map(x=>({...x})),active:bcSpace}),
 windows:()=>[...windows.values()].filter(r=>!r.chatPopout).map(r=>({id:r.id,title:r.title,spaceId:r.spaceId||'1',minimized:!!r.suspended||r.spaceShown===false,active:!r.el.hidden&&selectedWindow===r})),
 switchSpace:spaceSwitch,addSpace:spaceAdd,removeSpace:spaceRemove,renameSpace:spaceRename,moveWindow:spaceMove,
 focusWindow:id=>{if(!windows.has(id))return false;showApp(id);return true},
 fullscreen:fullscreenWindow,
 preferences:()=>({dockPosition:desktopPrefs.dockPosition||'bottom',dockAutoHide:desktopPrefs.dockAutoHide,desktopClean:desktopPrefs.desktopClean}),
 setPreference:setDesktopPref,
 openSettings:section=>openAppOrStore('settings',section),
 lock:()=>lockWorkspace(),notifications:()=>osNoticeHistory.map(x=>({...x})),clearNotifications:()=>{osNoticeHistory=[];window.dispatchEvent(new Event('blackcell:notification'))},
 toggleWidgets:()=>$('bcWidgetsToggle')?.click(),isPhone:touchOS,
 listDesktopFiles:async()=>{
  if(!storeProfile||preview)return [];
  if(!window.BLACKCELL_MAC_BRIDGE.ready()||!installedApp('files')||!client?.storage)return [];
  const {data,error}=await client.storage.from('blackcell-os-files').list(storeProfile+'/Desktop',{limit:100});
  if(error)throw error;
  return (Array.isArray(data)?data:[]).filter(x=>x&&typeof x.name==='string'&&x.name!=='.blackcell-folder'&&x.name.length<=255)
   .map(x=>({name:x.name,folder:!x.id,size:x.metadata?.size||0})).slice(0,100);
 },
 openDesktopFiles:()=>showApp('files',{path:['Desktop'],layout:'grid'})
});
let workspaceReady=false,workspaceRestoring=false,pendingRestore=[];
/* Account-scoped device privacy preference; the corporate backend still enforces access. */
const protectedApps=new Set(),customAppLocks=new Map(),deferredParkedChats=new Map(),appPasswordPermit=Symbol('app-password-verified');
const APP_KDF_ROUNDS=600000;
let appPasswordPrompt=null,appPasswordFailures=0,appPasswordRetryAt=0;
const appBase=id=>String(id).startsWith('chatpop-')?'chat':id;
const appLockKey=()=> 'bc.os.app-locks.v1:'+String(storeProfile||'');
function readAppLocks(){
 protectedApps.clear();customAppLocks.clear();deferredParkedChats.clear();
 if(preview||!storeProfile)return;
 try{
  const saved=JSON.parse(localStorage.getItem(appLockKey())||'[]'),ids=Array.isArray(saved)?saved:saved?.apps;
  if(Array.isArray(ids))for(const id of ids)if(typeof id==='string'&&/^[a-z]{1,40}$/.test(id))protectedApps.add(id);
  if(!Array.isArray(saved)&&saved?.custom&&typeof saved.custom==='object')for(const id of protectedApps){
   const entry=saved.custom[id];if(entry?.mode==='custom'&&entry.rounds===APP_KDF_ROUNDS&&/^[a-f0-9]{32}$/.test(entry.salt)&&/^[a-f0-9]{64}$/.test(entry.hash))customAppLocks.set(id,entry);
  }
 }catch(_){}
}
function appProtected(id){return !preview&&protectedApps.has(appBase(id))}
function customAppLock(id){return customAppLocks.get(appBase(id))||null}
const appHex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
async function appPasswordHash(secret,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveBits']);
 const bytes=Uint8Array.from(salt.match(/../g),v=>parseInt(v,16));
 return appHex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes,iterations:APP_KDF_ROUNDS},key,256)));
}
async function createCustomAppLock(secret){
 const salt=appHex(crypto.getRandomValues(new Uint8Array(16)));
 return {mode:'custom',rounds:APP_KDF_ROUNDS,salt,hash:await appPasswordHash(secret,salt)};
}
async function verifyCustomAppLock(secret,record){
 const hash=await appPasswordHash(secret,record.salt);let diff=0;
 for(let i=0;i<record.hash.length;i++)diff|=hash.charCodeAt(i)^record.hash.charCodeAt(i);
 return diff===0;
}
function saveAppProtection(id,title,mode,record=null){
 if(!contextAllowed()||!installedApp(id))return;
 const next=new Set(protectedApps),custom=new Map(customAppLocks);
 if(mode==='remove'){next.delete(id);custom.delete(id);}
 else{next.add(id);if(mode==='custom')custom.set(id,record);else custom.delete(id);}
 try{localStorage.setItem(appLockKey(),JSON.stringify({version:2,apps:[...next],custom:Object.fromEntries(custom)}));}
 catch(_){osNotice('App lock could not be saved on this device.');return}
 protectedApps.clear();customAppLocks.clear();for(const value of next)protectedApps.add(value);for(const [key,value] of custom)customAppLocks.set(key,value);
 if(mode!=='remove')hideProtectedWindows(id);
 refreshAppLockBadges();syncParkedChatBubbles();osNotice(mode==='remove'?title+' password lock removed.':title+' is password protected on this device.');
}
function chooseAppPassword(id,title){
 if(!contextAllowed()||appPasswordPrompt||!installedApp(id))return;
 const uid=storeProfile,dialog=document.createElement('dialog');dialog.className='bc-app-lock-dialog';dialog.setAttribute('aria-label','Protect '+title);
 const make=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e};
 const card=make('form','bc-app-lock-card'),heading=make('h2','','Protect '+title),desc=make('p','','Choose how you want to unlock this app.');
 const choices=make('div','bc-app-lock-choices'),corporate=make('button','bc-app-lock-choice','Use Corporate Password'),custom=make('button','bc-app-lock-choice','Create Custom Password');
 corporate.type=custom.type='button';choices.append(corporate,custom);
 const fields=make('div','bc-app-lock-custom-fields');fields.hidden=true;
 const input=make('input','bc-app-lock-input'),confirmInput=make('input','bc-app-lock-input');
 for(const [el,label] of [[input,'New app password'],[confirmInput,'Confirm app password']]){el.type='password';el.autocomplete='new-password';el.placeholder=label;el.setAttribute('aria-label',label);el.minLength=8;el.maxLength=128;el.disabled=true;}
 fields.append(input,confirmInput,make('p','','Use at least 8 characters. This password is specific to this app on this device.'));
 const note=make('p','bc-app-lock-status');note.setAttribute('role','status');
 const buttons=make('div','bc-app-lock-actions'),cancel=make('button','','Cancel'),submit=make('button','bc-app-lock-submit','Save Password');cancel.type='button';submit.type='submit';submit.disabled=true;buttons.append(cancel,submit);
 card.append(heading,desc,choices,fields,note,buttons);dialog.append(card);document.body.append(dialog);
 const prompt={dialog,input,extraInputs:[confirmInput]};appPasswordPrompt=prompt;
 cancel.onclick=closeAppPasswordPrompt;dialog.addEventListener('cancel',e=>{e.preventDefault();closeAppPasswordPrompt()});
 corporate.onclick=()=>{if(appPasswordPrompt!==prompt||storeProfile!==uid)return;closeAppPasswordPrompt();saveAppProtection(id,title,'corporate')};
 custom.onclick=()=>{fields.hidden=false;input.disabled=confirmInput.disabled=false;input.required=confirmInput.required=true;submit.disabled=false;custom.classList.add('selected');custom.setAttribute('aria-pressed','true');input.focus()};
 card.onsubmit=async e=>{e.preventDefault();if(appPasswordPrompt!==prompt||submit.disabled||fields.hidden)return;
  if(input.value.length<8||input.value.length>128){note.textContent='Use 8 to 128 characters.';return}
  if(input.value!==confirmInput.value){note.textContent='Passwords do not match.';return}
  const secret=input.value;input.value=confirmInput.value='';input.disabled=confirmInput.disabled=submit.disabled=corporate.disabled=custom.disabled=true;note.textContent='Protecting app…';
  try{const record=await createCustomAppLock(secret);if(appPasswordPrompt!==prompt||storeProfile!==uid||!contextAllowed())return;closeAppPasswordPrompt();saveAppProtection(id,title,'custom',record)}
  catch(_){if(appPasswordPrompt===prompt){note.textContent='Unable to create a secure password. Try again.';input.disabled=confirmInput.disabled=submit.disabled=corporate.disabled=custom.disabled=false;input.focus()}}
 };
 try{dialog.showModal();corporate.focus()}catch(_){closeAppPasswordPrompt();osNotice('Unable to open password settings.')}
}
function refreshAppLockBadges(){
 for(const tile of document.querySelectorAll('.app[data-app]'))tile.classList.toggle('bc-app-protected',appProtected(tile.dataset.app));
 for(const button of document.querySelectorAll('.dock button[data-open]'))button.classList.toggle('bc-app-protected',appProtected(button.dataset.open));
}
function hideProtectedWindows(id=null){
 for(const r of windows.values())if(appProtected(r.id)&&(!id||appBase(r.id)===id)){
  r.el.hidden=true;pauseFrameMedia(r.frame);if(selectedWindow===r)selectedWindow=null;
 }
 syncStoreUpdateHold();syncChatVisibility();saveWorkspace();
}
function closeAppPasswordPrompt(){
 if(!appPasswordPrompt)return;
 const p=appPasswordPrompt;appPasswordPrompt=null;p.input.value='';for(const el of p.extraInputs||[])el.value='';p.dialog.close();p.dialog.remove();
}
function askAppPassword(title,verb,verified,options={}){
 if(!active||preview||leaving||workspaceLock?.isLocked()||appPasswordPrompt)return;
 const uid=storeProfile,record=options.custom||null,dialog=document.createElement('dialog');dialog.className='bc-app-lock-dialog';dialog.setAttribute('aria-label',verb+' '+title);
 const make=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e};
 const card=make('form','bc-app-lock-card'),icon=make('div','bc-app-lock-symbol');
 icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
 const heading=make('h2','',verb+' '+title),description=make('p','',record?'Enter the custom password for this app.':'Verify your corporate password to continue.');
 const input=make('input','bc-app-lock-input');input.type='password';input.autocomplete=record?'off':'current-password';input.placeholder=record?'App password':'Corporate password';input.required=true;input.maxLength=record?128:1024;input.setAttribute('aria-label',input.placeholder);
 const note=make('p','bc-app-lock-status');note.setAttribute('role','status');
 const buttons=make('div','bc-app-lock-actions'),cancel=make('button','','Cancel'),submit=make('button','bc-app-lock-submit',verb);cancel.type='button';submit.type='submit';
 buttons.append(cancel,submit);card.append(icon,heading,description,input,note,buttons);
 if(record&&options.recover){const reset=make('button','bc-app-lock-recovery','Forgot app password?');reset.type='button';reset.onclick=()=>{closeAppPasswordPrompt();options.recover()};card.append(reset);}
 dialog.append(card);document.body.append(dialog);
 const prompt={dialog,input};appPasswordPrompt=prompt;
 cancel.onclick=closeAppPasswordPrompt;dialog.addEventListener('cancel',e=>{e.preventDefault();closeAppPasswordPrompt()});
 card.onsubmit=async e=>{
  e.preventDefault();if(appPasswordPrompt!==prompt||submit.disabled)return;
  if(Date.now()<appPasswordRetryAt){note.textContent='Try again in '+Math.ceil((appPasswordRetryAt-Date.now())/1000)+' seconds.';return}
  const secret=input.value;input.value='';input.disabled=true;submit.disabled=true;note.textContent='Verifying…';
  try{
   const result=record?{ok:await verifyCustomAppLock(secret,record),message:'App password was not accepted.'}:await verifyWorkspacePassword(client,uid,secret);
   if(appPasswordPrompt!==prompt||!active||leaving||storeProfile!==uid||workspaceLock?.isLocked())return;
   if(!result?.ok){appPasswordFailures++;appPasswordRetryAt=Date.now()+Math.min(30000,1000*2**Math.min(appPasswordFailures,5));note.textContent=result?.message||'Password not accepted.';return}
   const auth=await corporateAuthorize(client,{allowLedgerOnly:true});
   if(appPasswordPrompt!==prompt||!active||leaving||storeProfile!==uid||workspaceLock?.isLocked())return;
   if(!auth.ok||auth.user.id!==uid||!memberAllowed(auth.member)||(!owner&&auth.member.access_scope==='ledger_only')){note.textContent='Your corporate session needs verification. Sign in again.';return}
   const {data,error}=await client.rpc(owner?'corp_code_status':'corp_employee_code_status');
   if(appPasswordPrompt!==prompt||!active||leaving||storeProfile!==uid||workspaceLock?.isLocked())return;
   if(error||data?.ok!==true||data?.verified!==true){note.textContent='Corporate security verification expired.';return}
   appPasswordFailures=0;appPasswordRetryAt=0;closeAppPasswordPrompt();verified();
  }catch(_){if(appPasswordPrompt===prompt)note.textContent='Unable to verify. Try again.'}
  finally{if(appPasswordPrompt===prompt){input.disabled=false;submit.disabled=false;input.focus()}}
 };
 try{dialog.showModal();input.focus()}catch(_){closeAppPasswordPrompt();osNotice('Unable to open password verification.')}
}
function toggleAppProtection(id,title){
 if(!contextAllowed()||!installedApp(id))return;
 if(!appProtected(id)){chooseAppPassword(id,title);return}
 askAppPassword(title,'Remove lock from',()=>saveAppProtection(id,title,'remove'));
}
function changeAppPassword(id,title){
 if(!contextAllowed()||!installedApp(id)||!appProtected(id))return;
 askAppPassword(title,'Reset password for',()=>chooseAppPassword(id,title));
}
function workspaceKey(){return 'bc.os.workspace.v1:'+String(storeProfile||'preview')+':'+(embeddedAdmin?'executive':'desktop')}
function saveWorkspace(){
 if(!workspaceReady||workspaceRestoring||(!active&&!preview)||leaving)return;
 try{
  const records=[...windows.values()].filter(r=>!r.suspended&&!r.chatPopout).map(r=>({id:r.id,minimized:r.spaceShown===false||r.suspended===true,maximized:r.el.classList.contains('is-max'),spaceId:r.spaceId||'1',left:r.el.style.left,top:r.el.style.top,width:r.el.style.width,height:r.el.style.height,order:Number(r.el.style.zIndex)||0,...(r.id==='files'?{files:r.fileState||{path:[],layout:'grid'}}:r.id==='store'?{store:r.storeState||null}:r.id==='settings'?{settings:{section:r.settingsSection||'general'}}:{})}));
  for(const pending of pendingRestore)if(!records.some(r=>r.id===pending.id))records.push(pending);
  // Store only parked conversation shortcuts and window geometry, never message data or drafts.
  const parkedChats=[...windows.values()].filter(r=>r.chatPopout&&r.chatParked&&r.el.hidden).slice(0,8).map(r=>{
   const geometry=r.parkedGeometry||captureParkedGeometry(r);
   return {id:r.id,name:r.title,...geometry,keepOnTop:r.chatKeepOnTop===true};
  });
  for(const saved of deferredParkedChats.values())if(!parkedChats.some(r=>r.id===saved.id))parkedChats.push(saved);
  sessionStorage.setItem(workspaceKey(),JSON.stringify({version:1,at:Date.now(),windows:records.slice(0,24),parkedChats:parkedChats.slice(0,8)}));
 }catch(_){}
 window.dispatchEvent(new Event('blackcell:windows-updated'));
}
/* Save real OS workspace state before a verified software-update reload.
   Window positions, open app IDs and existing account layout are retained.
   No password, message draft, uploaded file or media content is copied. */
window.BLACKCELL_OS_AUTOSAVE_WORKSPACE=async()=>{
 if(leaving||workspaceRestoring||(!active&&!preview)||!workspaceReady)return false;
 saveWorkspace();
 try{
  if(!sessionStorage.getItem(workspaceKey()))return false;
 }catch(_){return false}
 // Wait for an already-started preference write, without initiating new
 // storage mutations or silently dropping a pending cloud save.
 if(!preview&&workspaceCloudReady){
  let timeout;
  const settled=await Promise.race([
   cloudDesktopWrites.then(()=>true,()=>false),
   new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),5000)})
  ]);
  clearTimeout(timeout);
  if(!settled)return false;
 }
 return true;
};
function clearWorkspace(){pendingRestore=[];deferredParkedChats.clear();workspaceReady=false;try{sessionStorage.removeItem(workspaceKey());if(embeddedAdmin)sessionStorage.removeItem('bc.os.host.v1')}catch(_){}}
function safePixels(value,signed=false){return typeof value==='string'&&(signed?/^-?\d{1,5}(?:\.\d+)?px$/:/^\d{1,5}(?:\.\d+)?px$/).test(value)?Number.parseFloat(value):null}
function desktopWindowLeft(left,width,available){const grip=Math.min(width,Math.max(160,Math.min(260,width*.65)));return Math.max(grip-width,Math.min(Math.max(grip-width,available-grip),left))}
function captureParkedGeometry(r){
 const w=r.el,maximized=w.classList.contains('is-max');
 const useActual=!w.hidden&&!maximized&&innerWidth>620&&!touchOS();
 const geometry={maximized,viewportWidth:innerWidth,viewportHeight:innerHeight};
 for(const [key,metric] of [['left','offsetLeft'],['top','offsetTop'],['width','offsetWidth'],['height','offsetHeight']]){
  const actual=w[metric];
  geometry[key]=useActual&&Number.isFinite(actual)&&(key==='left'||key==='top'||actual>0)?(key==='left'?actual:Math.max(0,actual))+'px':w.style[key];
 }
 return geometry;
}
function applyParkedGeometry(r,saved){
 if(!saved)return;
 const w=r.el;
 if(innerWidth>620&&!touchOS()){
  const sameViewport=saved.viewportWidth===innerWidth&&saved.viewportHeight===innerHeight;
  const width=safePixels(saved.width),height=safePixels(saved.height),left=safePixels(saved.left,true),top=safePixels(saved.top);
  if(width!==null)w.style.width=(sameViewport?width:Math.min(Math.max(300,width),Math.max(300,innerWidth-12)))+'px';
  if(height!==null)w.style.height=(sameViewport?height:Math.min(Math.max(260,height),Math.max(260,innerHeight-100)))+'px';
  if(left!==null)w.style.left=(sameViewport?left:desktopWindowLeft(left,safePixels(w.style.width)||300,$('desktop').clientWidth||innerWidth))+'px';
  if(top!==null)w.style.top=(sameViewport?top:Math.max(34,Math.min(top,innerHeight-100)))+'px';
 }
 w.classList.toggle('is-max',saved.maximized===true);
}
function shouldSkipAndroidRestoredRedline(saved,parked=false){
 // Level 1+ Android employees should return to BLACKCELL OS home after a
 // reload, not have the previous REDLINE app silently opened over the OS.
 // This only affects automatic workspace restore; manual launch is unchanged.
 return !parked&&!preview&&!owner&&/Android/i.test(navigator.userAgent||'')
  &&saved?.id==='photoledger';
}
function restoreRecord(saved,parked=false){
 if(!saved||typeof saved.id!=='string'||windows.has(saved.id))return;
 if(shouldSkipAndroidRestoredRedline(saved,parked))return;
 if(parked){
  if(!/^chatpop-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.id)||typeof saved.name!=='string'||(!preview&&!installedApp('chat')))return;
 }else if(!/^[a-z]+$/.test(saved.id)||saved.id.length>40)return;
 const tile=document.querySelector('.app[data-app="'+(parked?'chat':saved.id)+'"]');if(!tile||tile.hidden||tile.disabled)return;
 if(appProtected(saved.id)){if(parked)deferredParkedChats.set(saved.id,saved);return;}
 const previous=selectedWindow;
 showApp(saved.id,parked?{peerId:saved.id.slice(8),name:saved.name.slice(0,70)||'Conversation'}:saved.id==='store'?saved.store:saved.id==='settings'?saved.settings:saved.files);
 const r=windows.get(saved.id);if(!r)return;
 if(!parked){r.spaceId=spaceValid(saved.spaceId)?String(saved.spaceId):'1';r.spaceShown=saved.minimized!==true}
 if(parked){applyParkedGeometry(r,saved);r.chatKeepOnTop=saved.keepOnTop===true;}
 else if(innerWidth>620&&!touchOS()){
  const width=safePixels(saved.width),height=safePixels(saved.height),left=safePixels(saved.left,true),top=safePixels(saved.top);
  if(width!==null)r.el.style.width=Math.min(Math.max(280,width),Math.max(280,innerWidth-12))+'px';
  if(height!==null)r.el.style.height=Math.min(Math.max(220,height),Math.max(220,innerHeight-100))+'px';
  if(left!==null)r.el.style.left=desktopWindowLeft(left,r.el.offsetWidth,$('desktop').clientWidth||innerWidth)+'px';
  if(top!==null)r.el.style.top=Math.max(34,Math.min(top,($('desktop').clientHeight||innerHeight)-44))+'px';
 }
 r.el.classList.toggle('is-max',saved.maximized===true);
 if(parked){parkChat(r);if(previous&&!previous.el.hidden&&windows.get(previous.id)===previous)selectedWindow=previous;syncChatVisibility()}
 else if(saved.minimized===true){r.el.hidden=true;if(selectedWindow===r)selectedWindow=null;syncStoreUpdateHold()}
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
   if(Array.isArray(saved.parkedChats))for(const entry of saved.parkedChats.slice(0,8))restoreRecord(entry,true);
  }
 }finally{workspaceRestoring=false;workspaceReady=true;spaceVisibility();syncParkedChatBubbles();saveWorkspace()}
}
function restoreOptionalWorkspace(){
 if(!active||!pendingRestore.length)return;
 const records=pendingRestore;pendingRestore=[];workspaceRestoring=true;
 try{for(const item of records)if(installedApp(item.id))restoreRecord(item)}
 finally{workspaceRestoring=false;saveWorkspace()}
}
window.addEventListener('pagehide',saveWorkspace);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveWorkspace()});

const menus=$('osMenu'),menuButtons=[...document.querySelectorAll('[data-menu]')];
let lastMenuTrigger=null;
function currentMenuWindow(){
 if(selectedWindow&&windows.get(selectedWindow.id)===selectedWindow&&!selectedWindow.el.hidden&&!selectedWindow.suspended)return selectedWindow;
 return [...windows.values()].filter(r=>!r.el.hidden&&!r.suspended&&!r.chatParked).sort((a,b)=>(Number(b.el.style.zIndex)||0)-(Number(a.el.style.zIndex)||0))[0]||null;
}
function updateActiveAppMenu(){
 const button=$('activeAppMenu');if(!button)return;
 const r=currentMenuWindow();button.textContent=r?(r.title||'Application'):'Desktop';
 button.title=r?'Active application: '+(r.title||'Application'):'BLACKCELL desktop';
}
function closeMenu(){menus.hidden=true;for(const btn of menuButtons)btn.setAttribute('aria-expanded','false')}
function menuAction(label,fn,{disabled=false}={}){
 const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','menuitem');button.disabled=!!disabled;
 button.onclick=()=>{closeMenu();try{const result=fn();if(result&&typeof result.catch==='function')void result.catch(()=>osNotice('This action is unavailable. Please try within the application.'))}catch(_){osNotice('This action is unavailable. Please try within the application.')}};
 menus.append(button);return button;
}
function menuDivider(){const el=document.createElement('div');el.className='bc-os-menu-divider';el.setAttribute('role','separator');menus.append(el)}
function menuOpenApp(id,section=null){openAppOrStore(id,section)}
function editDocument(){try{const doc=currentMenuWindow()?.frame?.contentDocument;if(doc)return doc}catch(_){}return document}
function editTarget(doc){const node=doc.activeElement;return node&&(node.matches?.('input:not([type=hidden]),textarea')||node.isContentEditable)?node:null}
function editTextSelection(){
 const d=editDocument(),el=editTarget(d);
 if(el&&typeof el.selectionStart==='number'&&typeof el.value==='string')return el.value.slice(el.selectionStart,el.selectionEnd);
 try{return d.getSelection()?.toString()||''}catch(_){return ''}
}
async function copyMenuSelection(){
 const text=editTextSelection();if(!text){osNotice('Select text in an application first.');return}
 if(!navigator.clipboard?.writeText){osNotice('Clipboard access is unavailable. Use Ctrl/Command + C inside the app.');return}
 try{await navigator.clipboard.writeText(text);osNotice('Selected text copied.')}catch(_){osNotice('Use Ctrl/Command + C inside the app to copy text.')}
}
async function pasteMenuClipboard(){
 const d=editDocument(),el=editTarget(d);
 if(!el){osNotice('Select an editable field inside the application before pasting.');return}
 if(!navigator.clipboard?.readText){osNotice('Use Ctrl/Command + V inside the app to paste.');return}
 try{
  const text=await navigator.clipboard.readText();
  el.focus();
  if(typeof el.setRangeText==='function'&&typeof el.selectionStart==='number'){
   const start=el.selectionStart,end=el.selectionEnd;el.setRangeText(text,start,end,'end');
   el.dispatchEvent(new Event('input',{bubbles:true}));
  }else if(el.isContentEditable){
   if(!d.execCommand?.('insertText',false,text))osNotice('Use Ctrl/Command + V inside the application.');
  }
 }catch(_){osNotice('Browser permissions require using Ctrl/Command + V inside the app.')}
}
function selectAllMenuText(){
 const d=editDocument(),el=editTarget(d);
 if(!el){osNotice('Select a text field in the application first.');return}
 el.focus();
 if(typeof el.select==='function')el.select();
 else{const sel=d.getSelection(),range=d.createRange();range.selectNodeContents(el);sel.removeAllRanges();sel.addRange(range)}
}
function openShortcutsGuide(){
 let d=$('bcOSMenuHelpDialog');
 if(!d){
  d=document.createElement('dialog');d.id='bcOSMenuHelpDialog';d.className='bc-os-help-dialog';
  const content=document.createElement('div');content.className='bc-os-help-content';
  const title=document.createElement('h2');title.textContent='BLACKCELL OS · Desktop Help';
  const description=document.createElement('p');description.textContent='Use the top menu bar to navigate your desktop. App-specific editing tools remain inside each application.';
  const list=document.createElement('ul');
  for(const item of ['File — open BLACKCELL Files and Photos','Edit — copy, paste, and select text where permitted','View — show desktop, widgets, or appearance settings','Go — open installed BLACKCELL applications','Window — switch, minimize, or close application windows','System — settings, lock, restart, and sign out','Escape — close an open menu']){
   const li=document.createElement('li');li.textContent=item;list.append(li);
  }
  const done=document.createElement('button');done.type='button';done.textContent='Done';done.onclick=()=>d.close();
  content.append(title,description,list,done);d.append(content);d.setAttribute('aria-label','BLACKCELL OS desktop help');document.body.append(d);
 }
 if(!d.open)d.showModal();
}
function menu(name,trigger){
 const was=trigger.getAttribute('aria-expanded')==='true';closeMenu();if(was)return;
 menus.replaceChildren();trigger.setAttribute('aria-expanded','true');lastMenuTrigger=trigger;
 const activeWindow=currentMenuWindow();
 if(name==='system'){
  if(owner&&installedApp('administration'))menuAction('Administration',returnAdmin);
  if(preview||installedApp('settings'))menuAction('System Settings…',()=>showApp('settings'));
  menuDivider();menuAction('Show Desktop',showDesktop);
  if(preview||installedApp('person'))menuAction('My Profile',()=>showApp('person'));
  menuDivider();menuAction('Lock Screen',()=>lockWorkspace());menuAction('Window Manager…',()=>window.dispatchEvent(new Event('blackcell:mission-open')));menuAction('Log Off',()=>lockWorkspace('logoff'));menuAction('Restart…',restartWorkspace);
  menuDivider();menuAction(preview?'Exit Preview':'Sign Out',()=>void signOut());
 }else if(name==='application'){
  if(activeWindow){
   menuAction(activeWindow.title||'Application',()=>raise(activeWindow));menuDivider();
   menuAction('Minimize '+(activeWindow.title||'Window'),()=>suspend(activeWindow));
   menuAction('Close '+(activeWindow.title||'Window'),()=>void requestClose(activeWindow));
  }else{
   menuAction('About BLACKCELL OS',()=>menuOpenApp('settings','about'));
   menuAction('Desktop Appearance…',()=>menuOpenApp('settings','appearance'));
  }
 }else if(name==='file'){
  menuAction('Open BLACKCELL Files',()=>menuOpenApp('files'));
  menuAction('Open BLACKCELL Photos',()=>menuOpenApp('personalphotos'));
  menuAction('Manage Storage…',()=>menuOpenApp('settings','storage'));
  if(activeWindow){menuDivider();menuAction('Close Active Window',()=>void requestClose(activeWindow))}
 }else if(name==='edit'){
  menuAction('Copy Selected Text',copyMenuSelection);
  menuAction('Paste into Selected Field',pasteMenuClipboard);
  menuAction('Select All Text',selectAllMenuText);
  menuDivider();menuAction('Desktop Preferences…',()=>menuOpenApp('settings','appearance'));
 }else if(name==='view'){
  menuAction('Show Desktop',showDesktop);
  menuAction('Applications / Launchpad…',()=>window.dispatchEvent(new Event('blackcell:launchpad-open')));
  menuAction('Mission Control…',()=>window.dispatchEvent(new Event('blackcell:mission-open')));
  menuAction($('desktop').classList.contains('bc-widgets-hidden')?'Show Widgets':'Hide Widgets',()=>$('bcWidgetsToggle')?.click());
  menuDivider();menuAction('Appearance Settings…',()=>menuOpenApp('settings','appearance'));
  menuAction('Full Screen',async()=>{
   if(!document.fullscreenElement){
    if(!document.documentElement.requestFullscreen){osNotice('Full-screen mode is unavailable on this device.');return}
    try{await document.documentElement.requestFullscreen()}catch(_){osNotice('Full-screen mode was blocked by the browser.')}
   }else if(document.exitFullscreen)await document.exitFullscreen();
  });
 }else if(name==='go'||name==='apps'){
  menuAction('Desktop',showDesktop);
  menuAction('Applications / Launchpad…',()=>window.dispatchEvent(new Event('blackcell:launchpad-open')));
  menuAction('BLACKCELL Files',()=>menuOpenApp('files'));
  menuAction('Photos',()=>menuOpenApp('personalphotos'));
  menuAction('My Profile',()=>menuOpenApp('person'));
  menuAction('App Store',()=>showApp('store'));
  menuDivider();
  for(const tile of document.querySelectorAll('.app[data-app]'))if(!tile.hidden&&!tile.disabled&&!['files','personalphotos','person','store'].includes(tile.dataset.app))menuAction(tile.dataset.title||tile.dataset.app,()=>showApp(tile.dataset.app));
 }else if(name==='window'){
  if(activeWindow){menuAction('Minimize '+(activeWindow.title||'Window'),()=>suspend(activeWindow));menuAction('Close Active Window',()=>void requestClose(activeWindow));menuDivider()}
  menuAction('Show Desktop',showDesktop);
  for(const sp of bcSpaces)menuAction((sp.id===bcSpace?'✓ ':'')+sp.name,()=>spaceSwitch(sp.id));
  menuDivider();
  for(const record of windows.values())if(!document.querySelector('.app[data-app="'+(record.chatPopout?'chat':record.id)+'"]')?.hidden)menuAction((record===activeWindow?'✓ ':'')+(record.title||'Window')+(record.suspended?' · Resume':''),()=>showApp(record.id));
  menuDivider();menuAction('Mission Control…',()=>window.dispatchEvent(new Event('blackcell:mission-open')));
  menuAction('New Desktop',()=>{const id=spaceAdd();if(id)spaceSwitch(id)});
  menuAction('Next Desktop',()=>{const n=bcSpaces.findIndex(x=>x.id===bcSpace);spaceSwitch(bcSpaces[(n+1)%bcSpaces.length].id)});
 }else if(name==='help'){
  menuAction('BLACKCELL OS Desktop Help…',openShortcutsGuide);
  menuAction('System Information…',()=>menuOpenApp('settings','about'));
 }else if(name==='more'){
  menuAction('File · Open Files',()=>menuOpenApp('files'));
  menuAction('Edit · Desktop Preferences',()=>menuOpenApp('settings','appearance'));
  menuAction('View · Show/Hide Widgets',()=>$('bcWidgetsToggle')?.click());
  menuAction('Go · Applications',()=>showApp('store'));
  menuAction('Window · Show Desktop',showDesktop);
  menuAction('Help · Desktop Guide',openShortcutsGuide);
 }
 menus.style.left=trigger.offsetLeft+'px';menus.hidden=false;
 menus.style.left=Math.max(0,Math.min(trigger.offsetLeft,Math.max(0,innerWidth-menus.getBoundingClientRect().width-document.querySelector('.menubar').getBoundingClientRect().left-10)))+'px';
}
for(const btn of menuButtons)btn.addEventListener('click',()=>menu(btn.dataset.menu,btn));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menubar'))closeMenu()});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!menus.hidden){e.preventDefault();closeMenu();lastMenuTrigger?.focus();return}
 if(menus.hidden||!menus.contains(document.activeElement))return;
 const options=[...menus.querySelectorAll('button:not(:disabled)')];const idx=options.indexOf(document.activeElement);
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();options[(idx+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus()}
});
function markDock(id,on){document.querySelector('[data-open="'+id+'"]')?.classList.toggle('is-running',on)}
function chatFrameMessage(r,type,data={}){if(!r?.frame)return;try{r.frame.contentWindow.postMessage({type,...data},location.origin)}catch(_){}}
function resizeChatForMedia(r,open){
 if(!r||(r.id!=='chat'&&!r.chatPopout))return;
 const w=r.el;
 if(r.chatPopout)w.classList.toggle('is-chat-media-open',open===true);
 // The parked window has no measurable layout. Never let a hidden media event move it.
 if(r.chatPopout&&r.chatParked){if(!open)r.mediaOriginalGeometry=null;return;}
 if(!open){const saved=r.mediaOriginalGeometry;if(saved){Object.assign(w.style,saved);r.mediaOriginalGeometry=null}return;}
 if(r.mediaOriginalGeometry||w.classList.contains('is-max')||touchOS()||innerWidth<680)return;
 const rect=w.getBoundingClientRect(),available=Math.max(0,innerWidth-24),target=Math.min(available,Math.max(rect.width,r.chatPopout?840:1060));
 if(target<=rect.width+2)return;
 r.mediaOriginalGeometry={left:w.style.left,top:w.style.top,width:w.style.width,height:w.style.height};
 w.style.width=target+'px';
 w.style.left=Math.max(12,Math.min(rect.right-target,innerWidth-target-12))+'px';
}
function syncChatVisibility(){for(const r of windows.values())if(r.id==='chat'||r.chatPopout)chatFrameMessage(r,'blackcell-chat-visibility',{visible:active&&!workspaceLock?.isLocked()&&!r.el.hidden&&selectedWindow===r})}
window.addEventListener('message',event=>{if(event.origin!==location.origin||!active||leaving||workspaceLock?.isLocked())return;const data=event.data;if(!data||typeof data!=='object')return;const source=[...windows.values()].find(r=>(r.id==='chat'||r.chatPopout)&&r.frame?.contentWindow===event.source);if(!source)return;if(data.type==='blackcell-connect-request'){if(contextAllowed()&&installedApp('chat')&&!source.el.hidden&&!source.suspended&&(selectedWindow===source||document.activeElement===source.frame)&&(!source.chatPopout||source.id==='chatpop-'+data.peerId)){if(selectedWindow!==source)raise(source);ensureConnect();connectController?.request(data.peerId,data.mode,data.name)}else chatFrameMessage(source,'blackcell-connect-unavailable');return}if(data.type==='blackcell-chat-read'){void chatUnreadMonitor?.refresh();return}if(data.type==='blackcell-chat-popout-close'&&source.chatPopout){void requestClose(source);return}if(data.type==='blackcell-chat-popout'&&source.id==='chat'&&installedApp('chat')&&typeof data.peerId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.peerId)){showApp('chatpop-'+data.peerId,{peerId:data.peerId,name:typeof data.name==='string'?data.name:'Conversation'});return}if(data.type==='blackcell-chat-popout-media'&&typeof data.open==='boolean'){resizeChatForMedia(source,data.open);return}if(data.type==='blackcell-chat-activity'&&!source.el.hidden){for(const r of windows.values())if(r!==source&&(r.id==='chat'||r.chatPopout))chatFrameMessage(r,'blackcell-chat-shared-activity');void activity()}});
function syncStoreUpdateHold(){const r=windows.get('store');if(!r)return;const needed=!r.el.hidden||r.storeBusy;if(needed&&!r.updateHold&&!preview){try{r.updateHold=window.top.BLACKCELL_LIVE_UPDATE?.hold('App Store workspace',window)}catch(_){}}else if(!needed&&r.updateHold){r.updateHold();r.updateHold=null}}
/* Parked bubbles sit at desktop level unless explicitly kept above windows. */
function bubbleKeepsOnTop(id){return windows.get(id)?.chatKeepOnTop===true||deferredParkedChats.get(id)?.keepOnTop===true}
function setBubbleKeepOnTop(id,enabled){
 const r=windows.get(id),saved=deferredParkedChats.get(id);
 if(r?.chatPopout&&r.chatParked)r.chatKeepOnTop=enabled===true;
 else if(saved)saved.keepOnTop=enabled===true;
 else return;
 syncParkedChatBubbles();saveWorkspace();
}
function openBubbleContext(id,bubble,x,y){
 if(!contextAllowed()||!installedApp('chat')||(!windows.get(id)?.chatParked&&!deferredParkedChats.has(id)))return false;
 closeMenu();closeAppContext();
 const onTop=bubbleKeepsOnTop(id),panel=document.createElement('div');panel.className='os-app-context';panel.setAttribute('role','group');panel.setAttribute('aria-label','Chat bubble options');contextTrigger=bubble;
 const label=document.createElement('strong');label.textContent='Chat bubble';
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent=onTop?'Keep on Top ✓':'Keep on Top';toggle.setAttribute('aria-pressed',String(onTop));toggle.onclick=()=>{closeAppContext();if(contextAllowed())setBubbleKeepOnTop(id,!onTop)};
 const reopen=document.createElement('button');reopen.type='button';reopen.textContent='Open Conversation';reopen.onclick=()=>{closeAppContext();if(contextAllowed())showApp(id)};
 panel.append(label,toggle,reopen);$('desktop').append(panel);appContext=panel;
 const rect=panel.getBoundingClientRect(),top=$('desktop').querySelector('.topbar').getBoundingClientRect().bottom,limit=window.visualViewport?.height||innerHeight;
 panel.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';panel.style.top=Math.max(top+4,Math.min(y,limit-rect.height-8))+'px';
 toggle.focus({preventScroll:true});return true;
}
function bindBubbleContext(bubble,id){
 let hold=null,startX=0,startY=0,suppressUntil=0;
 const cancel=()=>{if(hold!==null)clearTimeout(hold);hold=null};
 const open=(x,y)=>openBubbleContext(id,bubble,x,y);
 bubble.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();cancel();if(open(e.clientX,e.clientY))suppressUntil=Date.now()+800});
 bubble.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const rect=bubble.getBoundingClientRect();open(rect.left,rect.bottom)}});
 bubble.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;cancel();startX=e.clientX;startY=e.clientY;hold=setTimeout(()=>{hold=null;if(open(startX,startY))suppressUntil=Date.now()+1500},550)});
 bubble.addEventListener('pointermove',e=>{if(hold!==null&&Math.hypot(e.clientX-startX,e.clientY-startY)>10)cancel()});
 for(const type of ['pointerup','pointercancel','pointerleave'])bubble.addEventListener(type,cancel);
 bubble.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation()}},true);
}
/* Park a live conversation without closing its iframe or losing its draft. */
function syncParkedChatBubbles(){
 let rail=$('osParkedChatRail');
 const records=[...windows.values()].filter(r=>r.chatPopout&&r.chatParked&&r.el.hidden);
 for(const saved of deferredParkedChats.values())if(!records.some(r=>r.id===saved.id))records.push({id:saved.id,title:saved.name||'Conversation'});
 const permitted=(active||preview)&&!leaving&&!workspaceLock?.isLocked()&&(preview||installedApp('chat'));
 if(!rail&&!records.length)return;
 if(!rail){rail=document.createElement('aside');rail.id='osParkedChatRail';rail.className='os-parked-chat-rail';rail.setAttribute('aria-label','Parked conversations');$('desktop').append(rail)}
 rail.hidden=!permitted||!records.length;
 if(!permitted){rail.replaceChildren();return}
 const wanted=new Set(records.map(r=>r.id));
 for(const child of [...rail.children])if(!wanted.has(child.dataset.chatId))child.remove();
 for(const r of records){
  const existing=[...rail.children].find(child=>child.dataset.chatId===r.id);
  if(existing){existing.classList.toggle('is-kept-on-top',bubbleKeepsOnTop(r.id));continue;}
  const bubble=document.createElement('button');bubble.type='button';bubble.className='os-parked-chat-bubble';bubble.dataset.chatId=r.id;bubble.classList.toggle('is-kept-on-top',bubbleKeepsOnTop(r.id));
  bubble.title='Reopen '+r.title;bubble.setAttribute('aria-label','Reopen conversation with '+r.title);
  const avatar=document.createElement('span');avatar.className='os-parked-chat-avatar';avatar.textContent=Array.from(r.title.trim())[0]?.toUpperCase()||'•';
  const glyph=document.createElement('span');glyph.className='os-parked-chat-glyph';glyph.setAttribute('aria-hidden','true');
  glyph.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.6 1.5 4.9 3.9 6.4L5 21l4-2.1c1 .2 2 .3 3 .3 5.5 0 10-3.6 10-8.1S17.5 3 12 3Z"/></svg>';
  const label=document.createElement('span');label.className='os-parked-chat-label';label.textContent=r.title;
  bubble.append(avatar,glyph,label);
  bindBubbleContext(bubble,r.id);
  bubble.addEventListener('click',()=>{if(windows.has(r.id)||deferredParkedChats.has(r.id))showApp(r.id)});
  rail.append(bubble);
 }
}
function parkChat(r){
 if(!r?.chatPopout||windows.get(r.id)!==r||(!active&&!preview)||workspaceLock?.isLocked())return;
 if(!r.chatParked)r.parkedGeometry=captureParkedGeometry(r);
 r.chatParked=true;r.el.hidden=true;if(selectedWindow===r)selectedWindow=null;
 pauseFrameMedia(r.frame);syncParkedChatBubbles();syncChatVisibility();saveWorkspace();
}
function raise(r){if(!r.chatPopout&&r.spaceId&&r.spaceId!==bcSpace)spaceSwitch(r.spaceId);r.spaceShown=true;if(r.chatParked){applyParkedGeometry(r,r.parkedGeometry);r.parkedGeometry=null;}r.chatParked=false;syncParkedChatBubbles();if(r.closing)r.reopened=true;r.suspended=false;r.el.hidden=false;r.el.style.zIndex=String(++layer);r.el.style.setProperty('--bc-phone-window-layer',r.el.style.zIndex);selectedWindow=r;markDock(r.id,true);updateActiveAppMenu();syncFullscreenShell();syncStoreUpdateHold();syncChatVisibility();saveWorkspace()}
function showDesktop(){closeRecycleBin();for(const r of windows.values()){if(r.spaceId===bcSpace)r.spaceShown=false;r.el.hidden=true}selectedWindow=null;updateActiveAppMenu();syncFullscreenShell();syncStoreUpdateHold();syncChatVisibility();saveWorkspace()}
function dispose(r,force=false){if(r?.el?.classList?.contains('bc-os-fullscreen'))$('desktop').classList.remove('bc-os-fullscreen-active','bc-os-menu-edge-open');if(!force){void requestClose(r);return;}r.updateHold?.();r.updateHold=null;r.cleanup?.();r.frame?.remove();r.el.remove();r.release?.();windows.delete(r.id);syncParkedChatBubbles();markDock(r.id,false);if(selectedWindow===r)selectedWindow=null;updateActiveAppMenu();syncFullscreenShell();syncChatVisibility();saveWorkspace()}
// Server unread counts are independent of open, minimized, or parked chat windows.
let connectController=null;
let chatUnreadMonitor=null,chatUnreadSnapshot={total:0,byPeer:new Map()};
function paintChatUnread(){
 const total=contextAllowed()&&installedApp('chat')?chatUnreadSnapshot.total:0;
 for(const node of document.querySelectorAll('.app[data-app="chat"],.dock [data-open="chat"],.bc-home-desktop-app[data-id="chat"],.bc-sb-icon[data-id="chat"],.os-parked-chat-bubble')){
  const n=node.dataset.chatId?total?(chatUnreadSnapshot.byPeer.get(node.dataset.chatId.slice(8))||0):0:total;
  if(n)node.dataset.bcUnread=n>99?'99+':String(n);else delete node.dataset.bcUnread;
 }
}
function ensureConnect(){if(preview||connectController)return;connectController=mountBlackcellConnect({client:()=>client,account:()=>storeProfile,allowed:()=>contextAllowed()&&installedApp('chat'),host:$('desktop'),notify:message=>osNotice(message,message.startsWith('Incoming ')?null:'notice'),ring:()=>window.BLACKCELL_SYSTEM_SOUNDS?.play('callring'),ringback:()=>window.BLACKCELL_SYSTEM_SOUNDS?.play('ringback')});void connectController.poll()}
function ensureChatUnreadMonitor(){
 if(preview||chatUnreadMonitor)return;
 chatUnreadMonitor=createChatUnreadMonitor({client:()=>client,account:()=>storeProfile,allowed:()=>contextAllowed()&&installedApp('chat'),onChange:snapshot=>{chatUnreadSnapshot=snapshot;paintChatUnread()},onNew:(count,initial)=>{
  if(contextAllowed()&&installedApp('chat'))osNotice('iMessage · '+count+(initial?' unread':' new')+' message'+(count===1?'':'s'),'message');
 }});
 const observer=new MutationObserver(paintChatUnread);observer.observe($('desktop'),{childList:true,subtree:true});
 window.addEventListener('pagehide',()=>{observer.disconnect();chatUnreadMonitor?.dispose();chatUnreadMonitor=null},{once:true});
}
window.addEventListener('blackcell:desktop-ready',()=>{ensureChatUnreadMonitor();ensureConnect();void chatUnreadMonitor?.refresh()});
function osNotice(message,sound='notice'){
 if(!preview&&!workspaceRestoring&&!workspaceLock?.isLocked())window.BLACKCELL_SYSTEM_SOUNDS?.play(sound);
 osNoticeHistory=[{message:String(message||'').slice(0,250),at:Date.now()},...osNoticeHistory].slice(0,35);
 window.dispatchEvent(new Event('blackcell:notification'));
 let n=$('osCloseNotice');if(!n){n=document.createElement('div');n.id='osCloseNotice';n.className='os-close-notice';n.setAttribute('role','status');$('desktop').append(n)}n.textContent=message;n.hidden=false;clearTimeout(osNotice.timer);osNotice.timer=setTimeout(()=>{n.hidden=true},6000)}
function suspend(r){r.el.hidden=true;r.spaceShown=false;r.suspended=true;markDock(r.id,false);if(selectedWindow===r)selectedWindow=null;updateActiveAppMenu();syncFullscreenShell();syncStoreUpdateHold();syncChatVisibility();saveWorkspace()}
window.addEventListener('message',event=>{if(event.origin!==location.origin)return;const r=windows.get('administration');if(!r?.frame||event.source!==r.frame.contentWindow)return;if(event.data?.type==='blackcell-admin-app-return'){void requestClose(r)}else if(event.data?.type==='blackcell-admin-app-activity'){void activity()}else if(event.data?.type==='blackcell-admin-app-signed-out'){blocked('Your corporate session has ended.');window.top.location.replace('login.html')}});
function pauseFrameMedia(frame){try{frame.contentWindow?.BLACKCELL_OS_PAUSE_MEDIA?.();for(const m of frame.contentDocument?.querySelectorAll('video,audio')||[])if(!m.paused)m.pause()}catch(_){}}
async function requestClose(r){
 if(!r||windows.get(r.id)!==r)return;
 if(r.chatPopout&&appBusy(r)){suspend(r);return;}
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
   if(result?.ok===true&&!r.reopened){let cleanNetwork=false;try{const child=r.frame.contentWindow;cleanNetwork=child.location.pathname.endsWith('/corporate-network.html')&&child.BLACKCELL_OS_CAN_RELOAD?.()===true}catch(_){}if(!result?.retain||cleanNetwork){dispose(r,true);return}}
   if(result?.ok===false)osNotice(result.message||'Changes could not be saved. Reopen the app to retry; your work is retained.');
   else if(result?.retain)osNotice(result.message||'Your work is retained. Reopen the app to continue.');
  }
  // Apps without a verified save hook stay suspended, preserving forms, drafts
  // and transfers without submitting any action on the user's behalf.
 }catch(_){if(windows.get(r.id)===r)osNotice('Save could not be confirmed. Reopen the app to continue.')}
 finally{r.closing=false;r.reopened=false}
}

const phoneNavigation=mountPhoneNavigation({
 host:$('desktop'),
 allowed:()=>document.documentElement.classList.contains('bc-os-phone')&&(active||preview)&&!leaving&&!$('desktop').hidden&&!workspaceLock?.isLocked(),
 apps:()=>[...windows.values()].sort((a,b)=>(Number(b.el.style.zIndex)||0)-(Number(a.el.style.zIndex)||0)).map(r=>({id:r.id,title:appProtected(r.id)?'Protected application':r.title,retained:!!r.suspended})),
 activeId:()=>currentMenuWindow()?.id,
 home:()=>{closeMenu();showDesktop()},
 open:id=>showApp(id),
 close:id=>requestClose(windows.get(id))
});
function closeAll(force){if(force)phoneNavigation.dismiss();for(const r of [...windows.values()])dispose(r,force)}
/* Desktop folder aliases — never move the underlying private files. */
let folderPins=[],folderDrag=null,pinDrop=null;
const pinKey=()=> 'bc.os.folder-pins.v1:'+String(storeProfile||'preview');
const validPin=p=>Array.isArray(p)&&p.length>0&&p.length<=50&&p.every(x=>typeof x==='string'&&x.length>0&&x.length<=255&&x!=='.'&&x!=='..'&&!x.includes('/')&&!x.includes('\\')&&!x.includes('\u0000'));
const pinAllowed=()=> (active||preview)&&!!storeProfile;
function initFolderPins(){folderPins=[];try{const raw=JSON.parse(localStorage.getItem(pinKey())||'[]');if(Array.isArray(raw))folderPins=raw.filter(validPin).slice(0,40)}catch(_){}renderFolderPins()}
function saveFolderPins(next){try{localStorage.setItem(pinKey(),JSON.stringify(next));folderPins=next;renderFolderPins();return true}catch(_){osNotice('Browser storage is unavailable. Shortcut not saved.');return false}}
function pinFolder(p){if(!pinAllowed()||!validPin(p))return;if(folderPins.some(x=>JSON.stringify(x)===JSON.stringify(p))){osNotice('That folder is already on your desktop.');return}if(folderPins.length>=40){osNotice('Remove an existing shortcut first.');return}if(saveFolderPins([...folderPins,[...p]]))osNotice(p.at(-1)+' added to your desktop.')}
function openPinnedFolder(p){if(!pinAllowed()||!validPin(p))return;if(!preview&&!installedApp('files')){osNotice('Reinstall BLACKCELL Files from the App Store to open this folder.');showApp('store');return}const r=windows.get('files');if(r?.filesBusy){osNotice('Files is still processing an operation.');return}showApp('files',{path:[...p],layout:r?.fileState?.layout||'grid'})}
function renderFolderPins(){const grid=$('desktopFolders'),section=$('desktopFolderSection');if(!grid||!section)return;grid.replaceChildren();section.hidden=!folderPins.length||(!preview&&!installedApp('files'));for(const p of folderPins){const card=document.createElement('div');card.className='os-folder-alias';const btn=document.createElement('button');btn.type='button';btn.className='os-folder-open';btn.title=p.join(' / ');btn.setAttribute('aria-label','Open '+p.at(-1));const glyph=document.createElement('span');glyph.className='os-folder-glyph';const arrow=document.createElement('span');arrow.className='os-folder-arrow';arrow.textContent='↗';glyph.append(arrow);const label=document.createElement('span');label.className='os-folder-name';label.textContent=p.at(-1);btn.append(glyph,label);btn.onclick=()=>openPinnedFolder(p);const rm=document.createElement('button');rm.type='button';rm.className='os-folder-remove';rm.textContent='×';rm.title='Remove shortcut (keep original folder)';rm.setAttribute('aria-label','Remove shortcut for '+p.at(-1));rm.onclick=()=>{if(pinAllowed()&&saveFolderPins(folderPins.filter(x=>JSON.stringify(x)!==JSON.stringify(p))))osNotice('Shortcut removed. Original folder kept.')};card.append(btn,rm);grid.append(card)}}
function endFolderDrag(){folderDrag=null;if(pinDrop)pinDrop.hidden=true;document.querySelector('.workspace')?.classList.remove('os-folder-dragging')}
function beginFolderDrag(p,e){if(!pinAllowed()||!validPin(p)||!e.dataTransfer){e.preventDefault();return}folderDrag=[...p];e.dataTransfer.effectAllowed='link';e.dataTransfer.setData('application/x-blackcell-folder-alias','folder');if(!pinDrop){pinDrop=document.createElement('div');pinDrop.className='os-folder-dropzone';pinDrop.hidden=true;pinDrop.textContent='＋ Drop folder on desktop';$('desktop').append(pinDrop)}pinDrop.hidden=false;document.querySelector('.workspace')?.classList.add('os-folder-dragging')}
function isDesktopDrop(e){return !!folderDrag&&pinAllowed()&&(e.target.closest('.os-folder-dropzone')||!e.target.closest('.os-window,.topbar,.dockwrap'))}
$('desktop').addEventListener('dragover',e=>{if(isDesktopDrop(e)){e.preventDefault();e.dataTransfer.dropEffect='link'}});
$('desktop').addEventListener('drop',e=>{if(isDesktopDrop(e)){e.preventDefault();e.stopPropagation();const p=folderDrag;endFolderDrag();pinFolder(p)}});
window.addEventListener('dragend',endFolderDrag);

/* Keep embedded documents out of view until their first non-blank load. */
function appFrameLoading(frame,content,title,url,alive){
 const pane=document.createElement('div');pane.className='bc-app-loading';pane.setAttribute('role','status');
 const spinner=document.createElement('span');spinner.className='bc-app-loading-spinner';spinner.setAttribute('aria-hidden','true');
 const label=document.createElement('strong');label.textContent='BLACKCELL OS';
 const message=document.createElement('span');message.className='bc-app-loading-message';message.textContent='Opening '+title+'…';
 const retry=document.createElement('button');retry.type='button';retry.textContent='Retry loading';retry.hidden=true;
 pane.append(spinner,label,message,retry);frame.classList.add('bc-app-frame-pending');content.append(pane);
 let timer=null,done=false,attempt=0;
 const stop=()=>{if(timer!==null){clearTimeout(timer);timer=null}};
 function wait(){stop();timer=setTimeout(()=>{if(done||!alive())return;message.textContent=title+' is taking longer than expected.';retry.hidden=false},18000)}
 function begin(){done=false;attempt++;pane.hidden=false;retry.hidden=true;message.textContent='Opening '+title+'…';frame.classList.add('bc-app-frame-pending');wait()}
 function finish(){if(done||!alive())return;const current=attempt;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(done||current!==attempt||!alive())return;done=true;stop();frame.classList.remove('bc-app-frame-pending');pane.hidden=true}))}
 function error(){if(done||!alive())return;stop();message.textContent='Could not load '+title+'.';retry.hidden=false}
 retry.onclick=()=>{if(!alive())return;begin();frame.src=url.href};
 frame.addEventListener('error',error);
 begin();
 return {begin,finish,dispose:()=>{done=true;stop();frame.removeEventListener('error',error);pane.remove()}};
}
function warmAppComponents(){
 if(navigator.connection?.saveData||/^(slow-2g|2g)$/.test(navigator.connection?.effectiveType||''))return;
 const run=()=>{if(!active||leaving||document.hidden||workspaceLock?.isLocked())return;for(const href of ['./blackcell-app-store.js?v=20261128-uniform-category2','./blackcell-os-settings.js?v=20261128-imessage-sound1','./blackcell-private-media.js?v=20261128-separate-library1','./blackcell-files.js?v=20261128-general-drive1']){const link=document.createElement('link');link.rel='modulepreload';link.href=href;document.head.append(link)}};
 if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:5000});else setTimeout(run,2500);
}

// RED / YELLOW / GREEN must work as actual OS window controls.
// REDLINE opens maximized. Touch devices need a visibly compact restore mode.
function toggleOSWindowSize(r){
 if(!r||windows.get(r.id)!==r||r.el.hidden)return false;
 const w=r.el;
 if(touchOS()||innerWidth<=620){
  const compact=!w.classList.contains('bc-os-window-compact');
  w.classList.toggle('bc-os-window-compact',compact);
  w.classList.toggle('is-max',!compact);
  w.classList.remove('bc-os-fullscreen');
 }else{
  w.classList.remove('bc-os-window-compact','bc-os-fullscreen');
  w.classList.toggle('is-max');
 }
 $('desktop').classList.remove('bc-os-menu-edge-open','bc-os-dock-edge-open');
 raise(r);syncFullscreenShell();saveWorkspace();
 return true;
}

function showApp(id,initialState=null,passwordVerified=null){
 closeRecycleBin();finishAppRearrange();closeAppContext();if((!active&&!preview)||workspaceLock?.isLocked())return;if(id==='administration'&&!owner&&!preview)return;
 const chatPopout=/^chatpop-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),baseId=chatPopout?'chat':id;
 if(!preview&&!installedApp(baseId))return;
 const tile=document.querySelector('.app[data-app="'+baseId+'"]');if(!tile||tile.hidden||tile.disabled)return;
 const deferred=chatPopout?deferredParkedChats.get(id):null;
 if(deferred)initialState={peerId:id.slice(8),name:deferred.name};
 if(appProtected(baseId)&&passwordVerified!==appPasswordPermit&&(!windows.has(id)||windows.get(id).el.hidden)){askAppPassword(tile.dataset.title||'App','Unlock',()=>showApp(id,initialState,appPasswordPermit),{custom:customAppLock(baseId),recover:()=>changeAppPassword(baseId,tile.dataset.title||'App')});return;}
 if(chatPopout&&!windows.has(id)&&(!initialState||initialState.peerId!==id.slice(8)||[...windows.values()].filter(r=>r.chatPopout).length>=8)){osNotice('Close a chat pop-out before opening another.');return;}
 if(windows.has(id)){const existing=windows.get(id);if(id==='chat'&&existing.el.hidden&&!touchOS()&&!preview&&!workspaceRestoring)chatFrameMessage(existing,'blackcell-chat-open-inbox');if(existing.el.hidden&&!preview&&!workspaceRestoring)window.BLACKCELL_SYSTEM_SOUNDS?.play('open');restoreWorldInstance(existing);raise(existing);if(id==='files'&&initialState?.path){if(existing.openFolder)existing.openFolder(initialState.path);else{existing.fileState={path:[...initialState.path],layout:initialState.layout||'grid'};saveWorkspace()}}if(id==='settings'&&initialState?.section)existing.selectSettings?.(initialState.section);if(id==='store'){if(initialState?.category)existing.selectCategory?.(initialState.category);if(!preview&&!storeMutating)void storeRequest('catalog').then(()=>existing.refreshStore?.())}return}
 const url=new URL(worldLaunchPages[id]||tile.dataset.url,location.href);if(worldLaunchPages[id]||id==='forces')url.searchParams.set('v','20261115-world-theater');if(url.origin!==location.origin)return;
 if(!preview&&!workspaceRestoring)window.BLACKCELL_SYSTEM_SOUNDS?.play('open');
 const networkWindow=url.pathname.endsWith('/corporate-network.html');
 if(networkWindow||id==='administration'||id==='photoledger'||id==='developerpreview')url.searchParams.set('_bc_release',String(Date.now()));
 const windowTitle=chatPopout?String(initialState.name||'Conversation').slice(0,70):tile.dataset.title;
 if(chatPopout){url.searchParams.set('popout','1');url.searchParams.set('peer',initialState.peerId);url.searchParams.set('osApp','chat');url.searchParams.set('embed','1')}
 const w=document.createElement('section');w.className='os-window'+(chatPopout?' os-chat-popout':'');w.dataset.osApp=id;w.setAttribute('aria-label',windowTitle+' window');
  if(id==='store'&&!touchOS()){const width=Math.min(1180,Math.max(300,innerWidth-48)),height=Math.min(780,Math.max(260,innerHeight-130));w.style.width=width+'px';w.style.height=height+'px';w.style.left=Math.max(0,(innerWidth-width)/2)+'px';w.style.top=Math.max(35,(innerHeight-height)/2-12)+'px';}
 if(chatPopout&&!touchOS()&&innerWidth>620){const n=[...windows.values()].filter(r=>r.chatPopout).length,height=Math.min(760,innerHeight-100),width=Math.min(390,innerWidth-24,Math.max(320,Math.round(height*.54)));w.style.width=width+'px';w.style.height=height+'px';w.style.left=Math.max(12,innerWidth-width-28-(n%4)*30)+'px';w.style.top=Math.max(40,Math.min(70+(n%4)*28,innerHeight-height-50))+'px';}
 const bar=document.createElement('div');bar.className='os-window-head';const controls=document.createElement('div');controls.className='traffic';
 const title=document.createElement('span');title.textContent=windowTitle;
 const external=document.createElement('a');external.href=url.href;external.target='_blank';external.rel='noopener';external.textContent='Open full page ↗';bar.append(controls,title);if(!chatPopout)bar.append(external);
 if((networkWindow||id==='administration'||id==='photoledger')&&!chatPopout){const refresh=document.createElement('button');refresh.type='button';refresh.className='os-network-refresh';refresh.textContent='↻ Refresh app';refresh.title='Load the current deployed application release';refresh.style.cssText='background:transparent;border:0;color:inherit;font:inherit;font-size:11px;cursor:pointer;padding:4px 8px';refresh.addEventListener('click',()=>{
  const record=windows.get(id);if(!record?.frame)return;
  if(appBusy(record)){osNotice('Finish the current operation before refreshing.');return}
  try{const child=record.frame.contentWindow;const doc=record.frame.contentDocument;const safe=child.BLACKCELL_OS_CAN_RELOAD;
   if(typeof safe==='function'&&!safe()){osNotice('Finish or save your draft, profile edits or active chat before refreshing.');return}
   if(typeof safe!=='function'&&(doc?.querySelector('#postBody')?.value?.trim()||Array.from(doc?.querySelectorAll('input[type=file]')||[]).some(x=>x.files?.length)||doc?.querySelector('#editOverlay:not([hidden])')||id==='photoledger'&&(doc?.querySelector('.redline-message-entry')?.value?.trim()||doc?.querySelector('#redlinePriceNegotiation[open] input.redline-consent-amount')?.value?.trim()||doc?.querySelector('#redlinePriceNegotiation[open] .redline-negotiation-custom input')?.value?.trim()))){osNotice('Save or clear your current draft before refreshing.');return}
   if(!confirm('Refresh this app from the website? Finish and save any work first. Your sign-in and stored account data are not changed.'))return;
   const next=new URL(child.location.href);if(next.origin!==location.origin||!(networkWindow&&next.pathname.endsWith('/corporate-network.html')||id==='administration'&&/\/(?:blackcell-administration-app|blackcell-media-oversight|blackcell-user-presence|corporate-media-admin|corporate-(?:backups|diagnostics|security-checks|activity-logs|costs-revenue|content-intelligence|systems))\.html$/.test(next.pathname)||id==='photoledger'&&next.pathname.endsWith('/private-photo-ledger.html'))){osNotice('Return to the application before refreshing.');return}next.searchParams.set('_bc_release',String(Date.now()));record.frameLoading?.begin();record.frame.src=next.href;external.href=next.href;
  }catch(e){osNotice('Refresh unavailable. Open the full page to check the release.');}
 });bar.insertBefore(refresh,external);}
 const content=document.createElement('div');content.className='os-window-body';w.append(bar,content);
 const r={id,title:windowTitle,chatPopout,el:w,frame:null,release:null,fileState:id==='files'?initialState:null,storeState:id==='store'?initialState:null,storeBusy:false,settingsSection:initialState?.section||'general',spaceId:bcSpace,spaceShown:true};windows.set(id,r);
 // Same lifecycle as the OS Window menu; native buttons support Enter/Space.
 // Prevent pointerdown titlebar capture from swallowing touch and mouse clicks.
 const commands=[
  ['Close','×',()=>void requestClose(r)],
  ['Minimize','−',()=>suspend(r)],
  ['Maximize or restore','+',()=>toggleOSWindowSize(r)]
 ];
 for(const [index,[label,symbol,fn]] of commands.entries()){
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='os-traffic-control os-traffic-'+['close','minimize','maximize'][index];
  btn.setAttribute('aria-label',label+' '+r.title);
  btn.title=label+' '+r.title;
  btn.textContent=symbol;
  btn.addEventListener('pointerdown',event=>event.stopPropagation());
  btn.addEventListener('click',event=>{
   event.stopPropagation();
   if(windows.get(r.id)!==r||w.hidden)return;
   if(!preview)window.BLACKCELL_SYSTEM_SOUNDS?.play(['close','minimize','expand'][index]);
   fn();
  });
  controls.append(btn);
 }
 if(chatPopout){const blue=document.createElement('button');blue.type='button';blue.className='os-chat-park-button';blue.title='Park as chat bubble';blue.setAttribute('aria-label','Park '+r.title+' as a desktop chat bubble');blue.textContent='•';blue.addEventListener('click',()=>parkChat(r));controls.append(blue)}
 if(id==='personalphotos'){external.hidden=true;const msg=document.createElement('p');msg.textContent='Loading private Photos…';content.append(msg);(personalPhotosModule??=import('./blackcell-private-media.js?v=20261128-separate-library1')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();const app=module.mountPrivatePhotos(content,{client,userId:storeProfile,preview,alive:()=>windows.get(id)===r&&(active||preview),onBusy:busy=>{r.filesBusy=busy;if(busy&&!r.release){try{r.release=window.top.BLACKCELL_LIVE_UPDATE?.hold('Private Photos operation',window)}catch(_){}}else if(!busy){r.release?.();r.release=null}}});r.cleanup=()=>app.dispose();}).catch(()=>{personalPhotosModule=null;if(windows.get(id)===r){content.replaceChildren(msg);msg.textContent='Photos could not load. Reopen to try again.'}});}
 else if(id==='files'){external.hidden=true;const msg=document.createElement('p');msg.textContent='Opening private drive…';msg.style.padding='20px';content.append(msg);(filesModule??=import('./blackcell-files.js?v=20261128-general-drive1')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();const app=module.mountFiles(content,{client,userId:storeProfile,preview,initialState:r.fileState,onState:state=>{r.fileState=state;saveWorkspace()},onPin:pinFolder,onFolderDrag:beginFolderDrag,onFolderDragEnd:endFolderDrag,onOpenPhotos:()=>showApp('personalphotos'),alive:()=>windows.get(id)===r&&(active||preview),onBusy:busy=>{r.filesBusy=busy;if(busy&&!r.release){try{r.release=window.top.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL Files transfer',window)}catch(_){}}else if(!busy){r.release?.();r.release=null}}});r.openFolder=app.openFolder;r.cleanup=()=>app.dispose();}).catch(()=>{filesModule=null;if(windows.get(id)===r){content.replaceChildren(msg);msg.textContent='Files could not load. Reopen to try again.'}});}
 else if(id==='settings'){external.hidden=true;const msg=document.createElement('p');msg.textContent='Opening Settings…';msg.style.padding='20px';content.append(msg);(settingsModule??=import('./blackcell-os-settings.js?v=20261128-imessage-sound1')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();const app=module.mountSettings(content,{client,preview,alive:()=>windows.get(id)===r&&(active||preview),initialSection:r.settingsSection,onSection:section=>{r.settingsSection=section;saveWorkspace()},account:()=>({name:$('memberName').textContent,username:$('memberUser').textContent,access:$('accessLabel').textContent,clearance:$('clearance').textContent}),catalog:()=>preview?[...document.querySelectorAll('.app[data-app]')].filter(t=>t.dataset.app!=='store'&&!t.hidden).map(t=>({id:t.dataset.app,title:t.dataset.title,installed:true})):storeCatalog(),preferences:()=>({...desktopPrefs}),setPreference:setDesktopPref,wallpaper:wallpaperManager,lock:()=>lockWorkspace(),logOff:()=>lockWorkspace('logoff'),restart:restartWorkspace,openOrStore:openAppOrStore,openStore:openStoreSection,signOut:()=>void signOut()});r.selectSettings=app.select;r.refreshSettings=app.refresh;r.cleanup=app.dispose;}).catch(()=>{settingsModule=null;if(windows.get(id)===r){content.replaceChildren(msg);msg.textContent='Settings could not load. Reopen to retry.'}});}
 else if(id==='store'){external.hidden=true;const message=document.createElement('p');message.textContent='Opening App Store…';message.style.padding='20px';content.append(message);(storeModule??=import('./blackcell-app-store.js?v=20261128-uniform-category2')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();const store=module.mountStore(content,{catalog:storeCatalog,worldCatalog:()=>Object.values(worldApps).filter(id=>installedApp(id)).map(id=>{const tile=document.querySelector('.app[data-app="'+id+'"]');return {id,title:tile?.dataset.title||id,url:tile?.dataset.url,installed:true}}),reauthorize:()=>{window.open(new URL('login.html',location.href).href,'_blank','noopener')},refreshCatalog:async()=>{if(preview)return {ok:false,error:'Sign in to refresh approved applications.'};const result=await storeRequest('catalog');return result},checkRelease:()=>{if(r.storeBusy)return;if(!confirm('Reload BLACKCELL OS to check for the newest release? Finish and save any work in open applications before continuing.'))return;saveWorkspace();const u=new URL(window.location.href);u.searchParams.set('releaseCheck',String(Date.now()));window.location.replace(u.href)},install:installApp,removeAll:removeAllApps,open:showApp,info:storeInfo,setRule:setStoreRule,initialState:r.storeState,onState:state=>{r.storeState=state;saveWorkspace()},onBusy:busy=>{r.storeBusy=busy;syncStoreUpdateHold();if(!busy&&r.suspended)dispose(r,true)}});r.refreshStore=store.render;r.selectCategory=store.selectCategory;r.cleanup=store.dispose;if(!preview)void storeRequest('catalog').then(()=>{if(windows.get(id)===r)store.render()});}).catch(()=>{storeModule=null;if(windows.get(id)===r){content.replaceChildren(message);message.textContent='App Store could not start. Close this window and try again.'}});}
 else if(id==='browser'){if(!preview)r.release=window.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL Browser window');const message=document.createElement('p');message.className='os-window-status';message.textContent='Opening BLACKCELL Browser…';message.style.padding='20px';content.append(message);(browserModule??=import('./blackcell-browser.js?v=3')).then(module=>{if(windows.get(id)!==r)return;content.replaceChildren();module.mountBrowser(content,r,external,activity)}).catch(()=>{browserModule=null;if(windows.get(id)===r)message.textContent='Browser could not load. Close this window and try again.'});}
 else if(preview){const demo=document.createElement('div');demo.className='os-demo';const box=document.createElement('div');box.append(tile.querySelector('.app-icon').cloneNode(true));const h=document.createElement('h2');h.textContent=r.title;const p=document.createElement('p');p.textContent=tile.dataset.desc;const status=document.createElement('p');status.textContent='DESIGN PREVIEW · No private account data loaded.';status.className='os-window-status';box.append(h,p,status);demo.append(box);content.append(demo)}
 else{r.release=window.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL OS application window');const frame=document.createElement('iframe');frame.title=r.title;if(id==='photoledger'){w.classList.add('is-max');frame.id='bcOsPhotoLedgerFrame'}if(id==='administration'){frame.id='bcOsAdministrationFrame';external.hidden=true;external.href='blackcell-administration-app.html';w.classList.add('is-max');const home=document.createElement('button');home.type='button';home.className='os-admin-home';home.textContent='‹ Administration';home.hidden=true;home.onclick=()=>{r.frameLoading?.begin();frame.src=url.href};r.adminHome=home;bar.insertBefore(home,title)}frame.allow=baseId==='chat'?'fullscreen; microphone; camera':id==='voicememos'?'fullscreen; microphone':id==='community'?'fullscreen; camera':'fullscreen';frame.setAttribute('allowfullscreen','');r.frame=frame;const loader=appFrameLoading(frame,content,r.title,url,()=>windows.get(id)===r);r.frameLoading=loader;r.cleanup=loader.dispose;
 frame.addEventListener('load',()=>{try{const child=frame.contentDocument;if(!child)return;const childURL=new URL(frame.contentWindow.location.href);if(childURL.protocol==='about:')return;if(childURL.origin!==location.origin){loader.finish();return;}if(id==='photoledger'&&childURL.pathname.endsWith('/private-photo-ledger.html')){child.documentElement.classList.add('bc-admin-workspace-embedded');if(!child.querySelector('link[data-os-ledger-style]')){const sheet=child.createElement('link');sheet.rel='stylesheet';sheet.href='blackcell-admin-workspace-embedded.css?v=3-redline-mobile-parity';sheet.dataset.osLedgerStyle='true';child.head.append(sheet)}}if(id==='administration'){if(childURL.pathname.endsWith('/dashboard.html')){loader.begin();frame.contentWindow.location.replace(url.href);return}if(r.adminHome)r.adminHome.hidden=childURL.pathname.endsWith('/blackcell-administration-app.html')}if(childURL.pathname.endsWith('/blackcell-os.html')||childURL.pathname.endsWith('/blackcell-os-preview.html')){dispose(r,true);return}if(id==='administration'&&childURL.pathname.endsWith('/login.html')){if(active)void recheck();loader.finish();return}for(const event of ['pointerdown','keydown','touchstart','wheel'])child.addEventListener(event,()=>void activity(),{passive:true});loader.finish();}catch(_){loader.finish();}});if(chatPopout||id==='chat')frame.addEventListener('load',syncChatVisibility);frame.src=url.href;content.prepend(frame);
 }
 $('desktop').append(w);if(deferred){applyParkedGeometry(r,deferred);r.chatKeepOnTop=deferred.keepOnTop===true;deferredParkedChats.delete(id);}raise(r);w.addEventListener('pointerdown',event=>{
  if(event.target.closest('.traffic button'))return;
  // Do not rewrite window state and rebuild shell surfaces on every tap.
  // Focus another window once, then leave its controls and gesture intact.
  if(selectedWindow!==r||r.suspended||r.el.hidden)raise(r);
 },true);bar.addEventListener('dblclick',e=>{
  if(!document.documentElement.classList.contains('bc-os-phone')&&!e.target.closest('button,a'))toggleOSWindowSize(r);
 });
 // Desktop titlebar drag: shell-local geometry, no reserved side column.
 // Preserve a reachable titlebar even when most of the window is offscreen.
 let drag=null;
 bar.title='Drag to move · Double-click to maximize or restore';
 const bounded=(value,min,max)=>Math.max(min,Math.min(Math.max(min,max),value));
 const shell=$('desktop');
 function moveDesktopWindow(x,y){
  const rect=shell.getBoundingClientRect(),width=w.offsetWidth,height=w.offsetHeight;
  const menu=shell.querySelector('.topbar'),menuHeight=menu?.getBoundingClientRect().height||34;
  const top=Math.max(0,Math.min(menuHeight,rect.height-44));
  w.style.left=desktopWindowLeft(x-rect.left-drag.x,width,rect.width)+'px';
  w.style.top=bounded(y-rect.top-drag.y,top,Math.max(top,rect.height-44))+'px';
 }
 bar.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('button,a,input,select,textarea')||touchOS()||innerWidth<=620||w.hidden||workspaceLock?.isLocked())return;
  const current=w.getBoundingClientRect();
  drag={id:e.pointerId,x:e.clientX-current.left,y:e.clientY-current.top,startX:e.clientX,startY:e.clientY,started:false};
  try{bar.setPointerCapture(e.pointerId)}catch(_){/* global listeners also cover capture failure */}
  e.preventDefault();
 });
 const moveDrag=e=>{
  if(!drag||e.pointerId!==drag.id)return;
  if(w.hidden||!w.isConnected||touchOS()||workspaceLock?.isLocked()||e.buttons===0){finishDrag();return}
  if(!drag.started){
   if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5)return;
   const current=w.getBoundingClientRect(),bounds=shell.getBoundingClientRect();
   if(w.classList.contains('is-max')||w.classList.contains('bc-os-fullscreen')){
    const fraction=bounded(drag.x/Math.max(current.width,1),.06,.94);
    w.classList.remove('is-max','bc-os-fullscreen','bc-os-window-compact');
    const width=Math.min(bounds.width,Math.max(300,Math.min(1040,Math.round(current.width*.8))));
    const height=Math.min(bounds.height,Math.max(260,Math.min(740,Math.round(current.height*.82))));
    w.style.width=width+'px';w.style.height=height+'px';
    drag.x=Math.round(width*fraction);drag.y=bounded(drag.y,8,40);
    syncFullscreenShell();
   }
   drag.started=true;w.classList.add('bc-window-dragging');dockReveal(false);
  }
  moveDesktopWindow(e.clientX,e.clientY);
 };
 function finishDrag(e){
  if(!drag||(e?.pointerId!==undefined&&e.pointerId!==drag.id))return;
  const id=drag.id;drag=null;w.classList.remove('bc-window-dragging');
  window.removeEventListener('pointermove',moveDrag,true);window.removeEventListener('pointerup',finishDrag,true);window.removeEventListener('pointercancel',finishDrag,true);window.removeEventListener('blur',finishDrag);
  try{if(bar.hasPointerCapture(id))bar.releasePointerCapture(id)}catch(_){}
  if(w.isConnected)saveWorkspace();
 }
 bar.addEventListener('pointerdown',()=>{if(!drag)return;window.addEventListener('pointermove',moveDrag,true);window.addEventListener('pointerup',finishDrag,true);window.addEventListener('pointercancel',finishDrag,true);window.addEventListener('blur',finishDrag)});
 bar.addEventListener('lostpointercapture',finishDrag);
}
let appContext=null,contextTrigger=null,appHold=null,suppressedAppClick=null;
function contextAllowed(){return active&&!preview&&!leaving&&!workspaceLock?.isLocked()&&!$('desktop').hidden}
function closeAppContext(restore=false){if(appContext){appContext.remove();appContext=null}if(restore&&contextAllowed())contextTrigger?.focus({preventScroll:true});contextTrigger=null}
function openAppContext(tile,x,y,trigger=tile){
 if(appRearranging||!contextAllowed()||!tile||tile.hidden||tile.disabled||(tile!==recycleButton&&!installedApp(tile.dataset.app)))return false;
 closeMenu();closeAppContext();
 const isBin=tile===recycleButton,id=tile.dataset.app,removable=!isBin&&id!=='store'&&id!=='developerpreview'&&installedApp(id),pinned=!isBin&&dockPinned(id),title=isBin?'Recycle Bin':tile.dataset.title;
 const panel=document.createElement('div');panel.className='os-app-context';panel.setAttribute('role','group');panel.setAttribute('aria-label',title+' options');contextTrigger=trigger;
 const name=document.createElement('strong');name.textContent=title;panel.append(name);
 const item=(label,fn,cls='')=>{const btn=document.createElement('button');btn.type='button';btn.className=cls;btn.textContent=label;btn.onclick=()=>{closeAppContext();if(contextAllowed())fn()};panel.append(btn);return btn};
 if(isBin){item('Rearrange Apps',()=>startAppRearrange(tile));}
 else{
 item(pinned?'Remove from Dock':'Add to Dock',()=>setDockPin(id,!pinned));
 item(appProtected(id)?'Remove Password Protection':'Require Password',()=>toggleAppProtection(id,title));
 if(appProtected(id))item('Change App Password',()=>changeAppPassword(id,title));
 if(recycledApps.has(id))item('Restore Desktop Shortcut',()=>restoreRecycled(id));
 else{item('Rearrange Apps',()=>startAppRearrange(tile));item('Move to Recycle Bin',()=>recycleApp(tile));}
 if(removable)item('Uninstall',()=>{if(confirm('Uninstall '+tile.dataset.title+'? Your app data will be kept.'))void uninstallFromDesktop(id,tile.dataset.title)},'danger');
 else{const note=document.createElement('small');note.textContent=id==='developerpreview'?'Owner system tool cannot be uninstalled':'App Store cannot be uninstalled';panel.append(note)}
 }
 $('desktop').append(panel);appContext=panel;
 const rect=panel.getBoundingClientRect(),top=$('desktop').querySelector('.topbar').getBoundingClientRect().bottom,limit=window.visualViewport?.height||innerHeight;
 panel.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-8))+'px';panel.style.top=Math.max(top+4,Math.min(y,limit-rect.height-8))+'px';
 panel.querySelector('button')?.focus({preventScroll:true});return true;
}
async function uninstallFromDesktop(id,title){
 if(!contextAllowed()||!installedApp(id)||id==='store')return;
 const result=await installApp(id,false);
 if(contextAllowed())osNotice(result.ok?title+' uninstalled. Your app data is unchanged.':result.error||'Unable to uninstall application.');
 windows.get('store')?.refreshStore?.();
}
function contextSource(target){
 const trigger=target?.closest?.('.app[data-app],.dock button[data-open],.bc-recycle-shortcut');if(!trigger||trigger.hidden||trigger.disabled)return null;
 if(trigger===recycleButton)return {trigger,tile:trigger};
 const id=trigger.dataset.app||trigger.dataset.open,tile=document.querySelector('.app[data-app="'+id+'"]');
 if(!tile||tile.hidden||tile.disabled||!installedApp(id))return null;return {trigger,tile}
}
/* Desktop placement and Recycle Bin are local shortcut preferences only.
   Neither operation uninstalls apps, grants access, nor deletes user data. */
const HOMES_WIDGET_IDS=['clock','calendar','applications','session'];
const homeClamp=n=>Math.max(0,Math.min(1,n));
const emptyUnifiedHome=()=>({version:1,pins:[],widgets:[{id:'clock',x:.04,y:.12,size:'medium'},{id:'calendar',x:.04,y:.37,size:'medium'}],changedAt:0});
function normalizeUnifiedHome(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return emptyUnifiedHome();
 const raw=input;
 const pins=[];const pinned=new Set();
 for(const p of Array.isArray(raw.pins)?raw.pins.slice(0,80):[]){
  if(!p||!validAppId(p.id)||pinned.has(p.id))continue;
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
  pinned.add(p.id);pins.push({id:p.id,x:homeClamp(p.x),y:homeClamp(p.y)});
 }
 const widgets=[];const added=new Set();
 for(const w of Array.isArray(raw.widgets)?raw.widgets.slice(0,12):[]){
  if(!w||!HOMES_WIDGET_IDS.includes(w.id)||added.has(w.id))continue;
  if(!Number.isFinite(w.x)||!Number.isFinite(w.y))continue;
  added.add(w.id);widgets.push({id:w.id,x:homeClamp(w.x),y:homeClamp(w.y),size:['small','medium','large'].includes(w.size)?w.size:'medium'});
 }
 return {version:1,pins,widgets,changedAt:Number.isSafeInteger(raw.changedAt)&&raw.changedAt>0?raw.changedAt:0};
}
let unifiedHome=emptyUnifiedHome(),unifiedHomeSaving=false;
let appLayout=[],appPositions=new Map(),recycledApps=new Set(),recyclePosition=null,appRearranging=false,appDrag=null,appEditBar=null,appLayoutRelease=null,recycleButton=null,recyclePanel=null,layoutFrame=0,layoutObserver=null,layoutObserved=false,canvasGeometry=null;
const appGrid=()=>document.querySelector('#desktop .workspace .apps');
const validAppId=id=>typeof id==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(id);
const clampUnit=x=>Math.max(0,Math.min(1,x));
function layoutKey(){return 'bc.os.app-layout.v2:'+String(storeProfile)}
function readAppLayout(){
 appLayout=[];appPositions=new Map();recycledApps=new Set();recyclePosition=null;widgetState=null;unifiedHome=emptyUnifiedHome();if(!storeProfile)return;
 for(const {store} of preferenceStores())try{
  const data=JSON.parse(store.getItem(layoutKey())||'null');
  if(data&&typeof data==='object'&&!Array.isArray(data)){
   appLayout=Array.isArray(data.order)?[...new Set(data.order.filter(validAppId))].slice(0,250):[];
   if(Array.isArray(data.positions))appPositions=new Map(data.positions.slice(0,250).filter(p=>Array.isArray(p)&&validAppId(p[0])&&p[1]&&Number.isFinite(p[1].x)&&Number.isFinite(p[1].y)).map(([id,p])=>[id,{x:clampUnit(p.x),y:clampUnit(p.y)}]));
   if(data.bin&&Number.isFinite(data.bin.x)&&Number.isFinite(data.bin.y))recyclePosition={x:clampUnit(data.bin.x),y:clampUnit(data.bin.y)};
   if(Array.isArray(data.recycled))recycledApps=new Set(data.recycled.filter(validAppId).slice(0,250));widgetState=data.widgets&&typeof data.widgets==='object'?data.widgets:null;
    unifiedHome=normalizeUnifiedHome(data.unifiedHome);
    window.dispatchEvent(new Event('blackcell:widget-sync'));
    window.dispatchEvent(new Event('blackcell:desktop-layout-updated'));return;
  }
  const old=JSON.parse(store.getItem('bc.os.app-layout.v1:'+String(storeProfile))||'null');if(Array.isArray(old))appLayout=[...new Set(old.filter(validAppId))].slice(0,250);
 }catch(_){}
}
function orderedAppIds(current,preferred){const available=new Set(current);return [...new Set([...preferred.filter(id=>available.has(id)),...current])]}
function overlaps(a,b,gap=0){return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y}
/* Snap to a fixed desktop lattice. Nearest unoccupied cell wins; empty
   rows and columns are preserved rather than packing shortcuts. */
function findAppSpot(w,h,iw,ih,desired,blocked){
 const maxX=Math.max(0,w-iw),maxY=Math.max(0,h-ih),dx=iw+8;
 // Distribute the spare vertical pixels between rows instead of leaving
 // an inaccessible strip underneath the last row.
 const rows=Math.floor(maxY/(ih+8));
 const candidates=[];
 for(let row=0;row<=rows;row++)for(let x=0;x<=maxX+.01;x+=dx){
  const y=rows?Math.round(row*maxY/rows):0;
  const slot={x,y,w:iw,h:ih};if(!blocked.some(b=>overlaps(slot,b,3)))candidates.push(slot);
 }
 if(desired)candidates.sort((a,b)=>(a.x-desired.x)**2+(a.y-desired.y)**2-((b.x-desired.x)**2+(b.y-desired.y)**2)||a.y-b.y||a.x-b.x);
 return candidates[0]||null;
}
function ensureRecycleButton(grid){
 if(recycleButton?.isConnected)return recycleButton;
 const btn=document.createElement('button');btn.type='button';btn.className='bc-recycle-shortcut';btn.setAttribute('aria-label','Open Recycle Bin');
 const icon=document.createElement('span');icon.className='bc-recycle-icon';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 48 48');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS(ns,'path');path.setAttribute('d','M13 14H35L32 40H16Z M10 11H38 M19 11V7H29V11 M21 20V33 M27 20V33');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2.2');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);icon.append(svg);
 const name=document.createElement('span');name.textContent='Recycle Bin';name.className='bc-recycle-name';const count=document.createElement('small');count.className='bc-recycle-count';count.hidden=true;
 btn.append(icon,name,count);btn.onclick=()=>{if(contextAllowed()&&!appRearranging)openRecycleBin()};bindAppContext(btn);grid.append(btn);recycleButton=btn;return btn;
}
function visibleLayoutTiles(){return [...(appGrid()?.querySelectorAll(':scope > .app[data-app]')||[])].filter(t=>!t.hidden&&!t.disabled&&!recycledApps.has(t.dataset.app)&&installedApp(t.dataset.app))}
function refreshRecycleCount(){
 if(!recycleButton)return;const count=[...recycledApps].filter(installedApp).length;const label=recycleButton.querySelector('.bc-recycle-count');label.textContent=String(count);label.hidden=count===0;recycleButton.dataset.full=String(count>0);
}
function applyAppLayout(){
 if(preview||!storeProfile||appDrag)return;
 const grid=appGrid();if(!grid)return;for(const tile of grid.querySelectorAll(':scope > .app[data-app]'))tile.classList.toggle('bc-recycled-shortcut',recycledApps.has(tile.dataset.app));
 if(!layoutFrame)layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;renderFreeLayout()});
}
function renderFreeLayout(){
 if(preview||!active||leaving||workspaceLock?.isLocked()||$('desktop').hidden||appDrag)return;
 const grid=appGrid(),workspace=$('desktop').querySelector('.workspace');if(!grid||!workspace||!grid.getClientRects().length)return;
 const all=[...grid.querySelectorAll(':scope > .app[data-app]')],ids=all.map(t=>t.dataset.app),order=orderedAppIds(ids,appLayout);
 const byId=new Map(all.map(t=>[t.dataset.app,t]));const focused=document.activeElement;
 if(!ids.every((id,i)=>id===order[i])){for(const id of order)grid.append(byId.get(id));if(all.includes(focused))focused.focus({preventScroll:true})}
 const bin=ensureRecycleButton(grid);refreshRecycleCount();grid.classList.add('bc-free-app-canvas');
 const wr=workspace.getBoundingClientRect(),gr=grid.getBoundingClientRect(),pad=parseFloat(getComputedStyle(workspace).paddingRight)||12;
 const width=Math.max(80,Math.floor(wr.right-gr.left-pad));const iw=touchOS()?88:100,ih=touchOS()?96:100;
 grid.style.width=width+'px';grid.style.setProperty('--bc-free-icon-width',iw+'px');
 const visible=visibleLayoutTiles(),side=workspace.querySelector('.bc-system-panel'),sr=side?.getBoundingClientRect();
 let height=Math.max(ih+8,Math.floor(wr.bottom-gr.top-workspace.scrollTop-(parseFloat(getComputedStyle(workspace).paddingBottom)||12)));
 const obstacles=[];const widgetRects=workspace.classList.contains('bc-widget-free-mode')?[...side.querySelectorAll('.bc-draggable-widget')].filter(el=>!el.hidden&&getComputedStyle(el).display!=='none').map(el=>el.getBoundingClientRect()):sr?[sr]:[];
 for(const r of widgetRects)if(r.width&&r.height&&r.bottom>gr.top&&r.right>gr.left&&r.left<gr.left+width)obstacles.push({x:Math.max(0,r.left-gr.left-8),y:Math.max(0,r.top-gr.top-8),w:r.right-Math.max(gr.left,r.left-8)+8,h:r.bottom-Math.max(gr.top,r.top-8)+8});
 const minCols=Math.max(1,Math.floor((width+8)/(iw+8)));height=Math.max(height,Math.ceil((visible.length+1)/minCols)*(ih+8));
 let placed=null,binRect=null;for(let pass=0;pass<25;pass++){
  const binDesired=recyclePosition?{x:recyclePosition.x*Math.max(0,width-iw),y:recyclePosition.y*Math.max(0,height-ih)}:{x:Math.max(0,width-iw),y:Math.max(0,height-ih)};
  binRect=findAppSpot(width,height,iw,ih,binDesired,obstacles);
  if(!binRect||obstacles.some(o=>overlaps(binRect,o,3))){height+=ih+8;continue}
  const taken=[...obstacles,binRect],positions=new Map();
  const custom=visible.filter(t=>appPositions.has(t.dataset.app)),defaults=visible.filter(t=>!appPositions.has(t.dataset.app));let failed=false;
  for(const tile of [...custom,...defaults]){
   const p=appPositions.get(tile.dataset.app),desired=p?{x:p.x*Math.max(0,width-iw),y:p.y*Math.max(0,height-ih)}:null;
   const spot=findAppSpot(width,height,iw,ih,desired,taken);if(!spot){failed=true;break}taken.push(spot);positions.set(tile,spot);
  }
  if(!failed){placed=positions;break}height+=ih+8;
 }
 if(!placed){grid.classList.remove('bc-free-app-canvas');grid.style.removeProperty('width');grid.style.removeProperty('height');for(const tile of all){tile.style.removeProperty('left');tile.style.removeProperty('top')}canvasGeometry=null;return}
 grid.style.height=height+'px';for(const [tile,p] of placed){tile.style.left=p.x+'px';tile.style.top=p.y+'px'}
 bin.style.left=binRect.x+'px';bin.style.top=binRect.y+'px';canvasGeometry={width,height,iw,ih,obstacles,binRect,placed};
 if(!layoutObserved&&typeof ResizeObserver==='function'){layoutObserved=true;layoutObserver=new ResizeObserver(()=>applyAppLayout());layoutObserver.observe(workspace);if(side)layoutObserver.observe(side)}
}
function saveAppLayout(){
 if(!contextAllowed()||!storeProfile)return false;
 const record=JSON.stringify({order:appLayout,positions:[...appPositions],recycled:[...recycledApps],bin:recyclePosition,widgets:widgetState,unifiedHome});
 const cloud=cloudWorkspaceSave('layout',record);
 void cloud.then(ok=>{if(!preview)window.dispatchEvent(new CustomEvent('blackcell:home-sync-status',{detail:{ok:!!ok}}));});
 let saved=false;
 for(const {name,store} of preferenceStores())try{store.setItem(layoutKey(),record);if(name==='localStorage'&&store.getItem(layoutKey())===record)saved=true}catch(_){}
 if(!saved)osNotice('Layout changed for this session. Persistent device storage is unavailable.');window.dispatchEvent(new Event('blackcell:desktop-layout-updated'));return saved;
}

// Default shortcut only: never overwrite a saved layout or grant app access.
function defaultMemberHomePins(home,{eligible}){
 if(eligible&&home.changedAt===0&&home.pins.length===0)return [{id:'store',x:.72,y:.08}];
 return home.pins;
}
window.BLACKCELL_OS_UNIFIED_LAYOUT=Object.freeze({
 account:()=>storeProfile,
 ready:()=>((preview&&!$('desktop').hidden)||contextAllowed())&&!!storeProfile,
 available:()=>[...document.querySelectorAll('#desktop .workspace .apps .app[data-app]')]
  .filter(t=>!t.hidden&&!t.disabled&&installedApp(t.dataset.app)&&!recycledApps.has(t.dataset.app))
  .map(t=>({id:t.dataset.app,title:t.dataset.title||t.dataset.app})),
 read:()=>({version:1,pins:defaultMemberHomePins(unifiedHome,{eligible:active&&!preview&&!owner&&storeLevel!==null&&Number(storeLevel)>0&&!storeError&&installedApp('store')&&!recycledApps.has('store')}).map(p=>({...p})),widgets:unifiedHome.widgets.map(w=>({...w})),changedAt:unifiedHome.changedAt}),
 save:value=>{
  if((!preview&&!contextAllowed())||!storeProfile)return {ok:false,message:'Sign in and unlock your workspace to edit the desktop.'};
  const next=normalizeUnifiedHome(value);
  next.pins=next.pins.filter(p=>installedApp(p.id)&&!recycledApps.has(p.id));
  next.changedAt=Math.max(Date.now(),unifiedHome.changedAt+1);
  unifiedHome=next;
  if(preview){window.dispatchEvent(new Event('blackcell:desktop-layout-updated'));return {ok:true,message:'Preview desktop updated. Sign in to synchronize.'}}
  const hasCloud=workspaceCloudReady;
  const ok=saveAppLayout();
  return {ok,message:!ok?'Desktop changed locally; saving is unavailable.':hasCloud?'Desktop layout saved locally. Synchronizing with your BLACKCELL account…':'Saved on this device. Cloud synchronization will resume when connected.'};
 },
 launch:id=>{
  if(typeof id!=='string'||!validAppId(id)||!installedApp(id)||recycledApps.has(id))return false;
  showApp(id);return true;
 },
 refresh:()=>refreshCloudHome()
});
async function refreshCloudHome(){
 if(!active||leaving||!storeProfile||!workspaceCloudReady||!document.visibilityState||document.visibilityState!=='visible'||workspaceLock?.isLocked())return false;
 const uid=storeProfile,starting=unifiedHome.changedAt,revision=cloudDesktopRevision;
 try{
  await cloudDesktopWrites.catch(()=>{});
  if(uid!==storeProfile||revision!==cloudDesktopRevision)return false;
  const {data,error}=await client.from('corp_os_workspace_preferences').select('value').eq('user_id',uid).eq('kind','layout').maybeSingle();
  if(error||uid!==storeProfile||!data?.value||revision!==cloudDesktopRevision)return false;
  const saved=data.value;
  if(!saved.unifiedHome)return false;
  const incoming=normalizeUnifiedHome(saved.unifiedHome);
  if(incoming.changedAt<unifiedHome.changedAt){
   // Local edits made during an outage are retried when the connection returns.
   // Only push the full account layout when this device has the newer change.
   const localValue=cloudDesktopCache.get(layoutKey())||localStorage.getItem(layoutKey());
   if(localValue){
    const parsed=JSON.parse(localValue);
    if(Number(parsed?.unifiedHome?.changedAt)===unifiedHome.changedAt){
     const ok=await cloudWorkspaceSave('layout',localValue);
     window.dispatchEvent(new CustomEvent('blackcell:home-sync-status',{detail:{ok:!!ok}}));
     return !!ok;
    }
   }
   return false;
  }
  if(incoming.changedAt<=starting||incoming.changedAt<=unifiedHome.changedAt)return false;
  const merged=JSON.stringify(saved);
  cloudDesktopCache.set(layoutKey(),merged);
  for(const {store} of preferenceStores())try{store.setItem(layoutKey(),merged)}catch(_){}
  readAppLayout();applyAppLayout();
  return true;
 }catch(_){return false}
}
window.addEventListener('focus',()=>{void refreshCloudHome()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloudHome()});
setInterval(()=>{if(!document.hidden)void refreshCloudHome()},30000);

window.BLACKCELL_OS_WIDGET_LAYOUT={
 account:()=>storeProfile,read:()=>widgetState,
 save:value=>{
  if(!contextAllowed()||!storeProfile||!value||typeof value!=='object')return false;
  const ids=['identity','storage','worlds'],clamp=n=>Math.max(0,Math.min(1,n)),positions={};
  for(const id of ids){const p=value.positions?.[id];if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))positions[id]={x:clamp(p.x),y:clamp(p.y)}}
  const order=Array.isArray(value.order)?[...new Set([...value.order.filter(id=>ids.includes(id)),...ids])]:ids;
  widgetState={version:1,visible:value.visible!==false,positions,order};
  return saveAppLayout();
 }
};
function rememberVisiblePositions(){
 const g=canvasGeometry;if(!g)return;
 for(const [tile,p] of g.placed)if(!tile.hidden&&installedApp(tile.dataset.app))appPositions.set(tile.dataset.app,{x:p.x/Math.max(1,g.width-g.iw),y:p.y/Math.max(1,g.height-g.ih)});
}
function recycleApp(tile){
 if(!contextAllowed()||!tile||tile.hidden||!installedApp(tile.dataset.app)||recycledApps.has(tile.dataset.app))return;
 rememberVisiblePositions();recycledApps.add(tile.dataset.app);saveAppLayout();applyAppLayout();osNotice(tile.dataset.title+' shortcut moved to Recycle Bin. App and data kept.');
}
function restoreRecycled(id){
 if(!contextAllowed()||!installedApp(id)||!recycledApps.has(id))return;
 recycledApps.delete(id);saveAppLayout();applyAppLayout();if(recyclePanel)renderRecycleBin();osNotice('Desktop shortcut restored.');
}
function closeRecycleBin(){if(recyclePanel){recyclePanel.remove();recyclePanel=null}}
function renderRecycleBin(){
 if(!recyclePanel)return;const list=recyclePanel.querySelector('.bc-recycle-list');list.replaceChildren();
 const ids=[...recycledApps].filter(installedApp);if(!ids.length){const p=document.createElement('p');p.textContent='Recycle Bin is empty.';list.append(p);return}
 for(const id of ids){const tile=document.querySelector('.app[data-app="'+id+'"]');if(!tile||tile.hidden)continue;const row=document.createElement('div');row.className='bc-recycle-row';const label=document.createElement('strong');label.textContent=tile.dataset.title;const restore=document.createElement('button');restore.type='button';restore.textContent='Restore';restore.onclick=()=>restoreRecycled(id);row.append(label,restore);list.append(row)}
}
function openRecycleBin(){
 if(!contextAllowed())return;finishAppRearrange();closeAppContext();closeRecycleBin();
 const panel=document.createElement('section');panel.className='bc-recycle-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Recycle Bin');
 const head=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');title.textContent='Recycle Bin';close.type='button';close.textContent='Close';close.onclick=closeRecycleBin;head.append(title,close);
 const note=document.createElement('p');note.textContent='Removed desktop shortcuts appear here. Your apps and files are not deleted.';
 const list=document.createElement('div');list.className='bc-recycle-list';panel.append(head,note,list);$('desktop').append(panel);recyclePanel=panel;renderRecycleBin();close.focus({preventScroll:true})
}
function startAppRearrange(tile){
 if(!contextAllowed()||appRearranging||!canvasGeometry)return;
 closeAppContext();cancelAppHold();showDesktop();dockReveal(false);const grid=appGrid();if(!grid)return;
 appRearranging=true;grid.classList.add('bc-app-rearranging');
 const bar=document.createElement('div');bar.className='bc-app-rearrange-bar';const label=document.createElement('div');label.className='bc-rearrange-status';label.setAttribute('role','status');label.textContent='Drag apps or Recycle Bin to any open position. Icons snap into alignment.';
 const done=document.createElement('button');done.type='button';done.textContent='Done';done.onclick=()=>finishAppRearrange(true);bar.append(label,done);grid.parentElement.insertBefore(bar,grid);appEditBar=bar;
 try{appLayoutRelease=window.BLACKCELL_LIVE_UPDATE?.hold('Rearranging applications')}catch(_){}
 renderFreeLayout();if(tile&&!tile.hidden&&!recycledApps.has(tile.dataset.app))tile.focus({preventScroll:true});
}
function cancelAppDrag(){
 if(!appDrag)return;const drag=appDrag;appDrag=null;drag.ghost?.remove();drag.tile.classList.remove('bc-app-dragging');recycleButton?.classList.remove('bc-recycle-drop');try{if(drag.grid.hasPointerCapture(drag.id))drag.grid.releasePointerCapture(drag.id)}catch(_){}
}
function finishAppRearrange(notify=false){
 if(!appRearranging)return;cancelAppDrag();appRearranging=false;appGrid()?.classList.remove('bc-app-rearranging');appEditBar?.remove();appEditBar=null;appLayoutRelease?.();appLayoutRelease=null;applyAppLayout();if(notify&&contextAllowed())osNotice('Desktop layout updated.');
}
function beginAppDrag(e){
 if(!appRearranging||!contextAllowed()||!e.isPrimary||e.button!==0)return;const tile=e.target.closest?.('.bc-app-rearranging > .app[data-app],.bc-app-rearranging > .bc-recycle-shortcut');if(!tile||(tile!==recycleButton&&!visibleLayoutTiles().includes(tile))||!canvasGeometry)return;
 e.preventDefault();cancelAppDrag();const grid=appGrid();appDrag={grid,tile,id:e.pointerId,x:e.clientX,y:e.clientY,ghost:null,bin:false};try{grid.setPointerCapture(e.pointerId)}catch(_){}
}
function updateAppDrag(e){
 const d=appDrag;if(!d||d.id!==e.pointerId)return;if(!contextAllowed()||d.tile.hidden||recycledApps.has(d.tile.dataset.app)){cancelAppDrag();return}
 if(!d.ghost&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<7)return;if(e.cancelable)e.preventDefault();
 if(!d.ghost){const ghost=document.createElement('div');ghost.className='bc-app-drag-ghost';ghost.setAttribute('aria-hidden','true');const icon=d.tile.querySelector('.app-icon,.bc-recycle-icon'),name=d.tile.querySelector('.app-name,.bc-recycle-name');if(icon)ghost.append(icon.cloneNode(true));if(name)ghost.append(name.cloneNode(true));document.body.append(ghost);d.ghost=ghost;d.tile.classList.add('bc-app-dragging')}
 d.ghost.style.left=e.clientX+'px';d.ghost.style.top=e.clientY+'px';const r=recycleButton?.getBoundingClientRect();d.bin=d.tile!==recycleButton&&!!r&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;recycleButton?.classList.toggle('bc-recycle-drop',d.bin);
 const ws=$('desktop').querySelector('.workspace'),wr=ws.getBoundingClientRect();if(e.clientY>wr.bottom-38)ws.scrollTop+=18;else if(e.clientY<wr.top+38)ws.scrollTop-=18;
}
function placeApp(tile,x,y){
 const g=canvasGeometry,isBin=tile===recycleButton;if(!g||!contextAllowed()||!appRearranging||(!isBin&&!visibleLayoutTiles().includes(tile)))return;
 const blocks=[...g.obstacles,...(isBin?[]:[g.binRect]),...[...g.placed].filter(([t])=>t!==tile).map(([,p])=>p)],spot=findAppSpot(g.width,g.height,g.iw,g.ih,{x,y},blocks);if(!spot){osNotice('Choose an open desktop area.');return}
 if(isBin){rememberVisiblePositions();recyclePosition={x:spot.x/Math.max(1,g.width-g.iw),y:spot.y/Math.max(1,g.height-g.ih)};saveAppLayout();renderFreeLayout();if(appEditBar)appEditBar.querySelector('.bc-rearrange-status').textContent='Recycle Bin moved.';return}
 rememberVisiblePositions();appPositions.set(tile.dataset.app,{x:spot.x/Math.max(1,g.width-g.iw),y:spot.y/Math.max(1,g.height-g.ih)});appLayout=orderedAppIds([...appGrid().querySelectorAll(':scope > .app[data-app]')].map(t=>t.dataset.app),appLayout);saveAppLayout();renderFreeLayout();if(appEditBar)appEditBar.querySelector('.bc-rearrange-status').textContent=tile.dataset.title+' moved.';
}
function endAppDrag(e,commit){
 const d=appDrag;if(!d||d.id!==e.pointerId)return;const tile=d.tile,dragged=!!d.ghost,r=d.grid.getBoundingClientRect(),br=recycleButton?.getBoundingClientRect(),bin=tile!==recycleButton&&!!br&&e.clientX>=br.left&&e.clientX<=br.right&&e.clientY>=br.top&&e.clientY<=br.bottom;
 cancelAppDrag();if(commit&&dragged&&contextAllowed()){if(bin)recycleApp(tile);else if(canvasGeometry&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=Math.min($('desktop').querySelector('.workspace').getBoundingClientRect().bottom,r.bottom+24))placeApp(tile,e.clientX-r.left-canvasGeometry.iw/2,e.clientY-r.top-canvasGeometry.ih/2)}if(dragged)suppressAppClick(tile);applyAppLayout()
}
document.addEventListener('pointerdown',beginAppDrag,true);
document.addEventListener('pointermove',updateAppDrag,{capture:true,passive:false});
document.addEventListener('pointerup',e=>endAppDrag(e,true),true);
document.addEventListener('pointercancel',e=>endAppDrag(e,false),true);
document.addEventListener('lostpointercapture',e=>{if(appDrag?.id===e.pointerId)cancelAppDrag()},true);
document.addEventListener('click',e=>{if(appRearranging&&e.target.closest?.('.bc-app-rearranging > .app[data-app],.bc-app-rearranging > .bc-recycle-shortcut')){e.preventDefault();e.stopImmediatePropagation()}},true);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&recyclePanel){e.preventDefault();closeRecycleBin();return}if(!appRearranging)return;if(e.key==='Escape'){e.preventDefault();finishAppRearrange(true);return}
 const tile=e.target.closest?.('.bc-app-rearranging > .app[data-app],.bc-app-rearranging > .bc-recycle-shortcut'),p=tile===recycleButton?canvasGeometry?.binRect:canvasGeometry?.placed.get(tile);if(!tile||!p)return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const dx=canvasGeometry.iw+8,maxY=Math.max(0,canvasGeometry.height-canvasGeometry.ih),rows=Math.floor(maxY/(canvasGeometry.ih+8)),dy=rows?maxY/rows:canvasGeometry.ih+8;placeApp(tile,p.x+(e.key==='ArrowRight'?dx:e.key==='ArrowLeft'?-dx:0),p.y+(e.key==='ArrowDown'?dy:e.key==='ArrowUp'?-dy:0));tile.focus({preventScroll:true})}
},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden){closeRecycleBin();finishAppRearrange()}else applyAppLayout()});
window.addEventListener('resize',()=>{cancelAppDrag();applyAppLayout()},{passive:true});
function cancelAppHold(){if(appHold){clearTimeout(appHold.timer);appHold=null}}
function suppressAppClick(trigger){suppressedAppClick={trigger,until:performance.now()+1200}}
function bindAppContext(tile){
 tile.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){if(!contextAllowed())return;e.preventDefault();const r=tile.getBoundingClientRect();openAppContext(tile,r.left,r.bottom)}});
}
document.addEventListener('pointerdown',e=>{
 cancelAppHold();suppressedAppClick=null;
 if(appContext&&!appContext.contains(e.target))closeAppContext();
 if(appRearranging||!contextAllowed()||!touchOS()||e.pointerType!=='touch'||!e.isPrimary)return;
 const source=contextSource(e.target);if(!source)return;
 const hold={...source,id:e.pointerId,x:e.clientX,y:e.clientY,timer:null,opened:false};appHold=hold;
 hold.timer=setTimeout(()=>{if(appHold!==hold||!contextAllowed()||!hold.trigger.isConnected)return;hold.opened=openAppContext(hold.tile,hold.x+6,hold.y+10,hold.trigger);if(hold.opened)suppressAppClick(hold.trigger)},500);
},{capture:true,passive:true});
document.addEventListener('pointermove',e=>{if(appHold?.id===e.pointerId&&!appHold.opened&&Math.hypot(e.clientX-appHold.x,e.clientY-appHold.y)>12)cancelAppHold()},{capture:true,passive:true});
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>{if(appHold?.id!==e.pointerId)return;if(appHold.opened)suppressAppClick(appHold.trigger);cancelAppHold()},{capture:true,passive:true});
document.addEventListener('contextmenu',e=>{const source=contextSource(e.target);if(!source||!contextAllowed())return;e.preventDefault();if(appContext&&contextTrigger===source.trigger)return;cancelAppHold();if(openAppContext(source.tile,e.clientX||source.trigger.getBoundingClientRect().left,e.clientY||source.trigger.getBoundingClientRect().bottom,source.trigger)&&touchOS())suppressAppClick(source.trigger)});
document.addEventListener('click',e=>{const pending=suppressedAppClick;if(!pending)return;if(performance.now()>pending.until){suppressedAppClick=null;return}if(pending.trigger.contains(e.target)){suppressedAppClick=null;e.preventDefault();e.stopImmediatePropagation()}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){cancelAppHold();closeAppContext(true)}else if((e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')&&e.target.closest?.('.dock button[data-open]')){const source=contextSource(e.target);if(source&&contextAllowed()){e.preventDefault();const r=source.trigger.getBoundingClientRect();openAppContext(source.tile,r.left,r.top,source.trigger)}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAppHold();closeAppContext()}});
window.addEventListener('resize',()=>{cancelAppHold();closeAppContext()},{passive:true});
for(const button of document.querySelectorAll('[data-app]')){button.addEventListener('click',()=>showApp(button.dataset.app));bindAppContext(button)}
for(const button of document.querySelectorAll('[data-open]'))button.addEventListener('click',()=>showApp(button.dataset.open));
$('showDesktop').addEventListener('click',showDesktop);$('osTouchHome')?.addEventListener('click',()=>{closeMenu();showDesktop();if(desktopPrefs.dockAutoHide)dockReveal(true)});$('bcStorageManage')?.addEventListener('click',()=>openAppOrStore('settings','storage'));
async function signOut(force=false){if(preview){clearWorkspace();location.assign('login.html');return}if(leaving)return;if(!force&&windows.size&&!confirm('Sign out and close your open applications? Finish uploads, playback and unsaved work first.'))return;leaving=true;active=false;osNoticeHistory=[];wallpaperManager?.dispose();blocked('Ending your corporate session…');try{await client.rpc(owner?'corp_end_session':'corp_employee_end_session')}catch(_){}try{const result=await client.auth.signOut({scope:'local'});if(!result?.error)workspaceLock?.clear()}catch(_){}if(embeddedAdmin)window.top.location.replace('login.html');else location.replace('login.html')}
$('signOut').addEventListener('click',()=>void signOut());$('osLockButton')?.addEventListener('click',()=>lockWorkspace());document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='l'&&(active||preview)){e.preventDefault();lockWorkspace()}});
$('adminReturn').addEventListener('click',e=>{e.preventDefault();returnAdmin()});
function memberAllowed(m){return !!m&&(m.role==='owner'&&Number(m.clearance_level)===7||m.role==='employee'&&!!m.password_activated_at)}
function chatAllowed(m){return m.role==='owner'||m.can_chat===true}
async function recheck(){
 if(!active||checking||leaving)return;checking=true;
 try{
  if(Date.now()-last>=IDLE){await signOut(true);return}
  const result=await checkedIdentity();if(!active||leaving)return;
  if(result.reason==='verification-error'){pauseVerification('Corporate identity verification temporarily unavailable.');return}
  if(!result.ok||!memberAllowed(result.member)||(result.member.role==='owner')!==owner){window.BLACKCELL_LIVE_UPDATE?.setVerifiedRole(null);blocked('Your corporate session is no longer authorized.');return}
  window.BLACKCELL_LIVE_UPDATE?.setVerifiedRole(owner?'owner':'employee');
  if(!owner&&result.member.access_scope==='ledger_only'){location.replace('private-photo-ledger.html');return}
  const {data,error}=await checkedSecurity();if(!active||leaving)return;
  if(error){pauseVerification('Security verification service temporarily unavailable.');return}
  if(data?.ok!==true||data?.verified!==true){blocked('Your corporate authorization must be verified again.');return}
  if(!chatAllowed(result.member)&&windows.has('chat'))dispose(windows.get('chat'),true);if(!chatAllowed(result.member)){for(const el of document.querySelectorAll('[data-chat=true]'))el.hidden=true;storeRules.delete('chat');storeInstalled.delete('chat')}
  const catalog=await storeRequest('catalog');if(!active||leaving)return;
  if(catalog.ok&&bootComplete&&!workspaceReady&&!workspaceLock?.isLocked()){try{restoreWorkspace();restoreOptionalWorkspace()}catch(_){osNotice('Saved applications could not all be restored. Open them manually.')}}
  windows.get('store')?.refreshStore?.();
 }catch(error){if(active&&!leaving)pauseVerification((error?.osStep||'Corporate verification')+' temporarily unavailable.')}finally{checking=false}
}
async function activity(){
 if(!active||leaving||workspaceLock?.isLocked())return;if(Date.now()-last>=IDLE){await signOut(true);return}last=Date.now();
 if(embeddedAdmin){try{window.parent.dispatchEvent(new Event('pointerdown'))}catch(_){}}
 if(touching||Date.now()-touched<60000)return;touching=true;
 try{const {data,error}=await osDeadline(client.rpc(owner?'corp_touch_session':'corp_employee_touch_session'),'Session status');if(!active||leaving)return;
  if(error){pauseVerification('Session service temporarily unavailable.');return}
  if(data?.ok!==true){blocked('Your corporate session has expired.');return}touched=Date.now()
 }catch(_){if(active&&!leaving)pauseVerification('Session status check timed out.')}finally{touching=false}
}
if(preview){initStore('preview');initDesktopPrefs();setupWorkspaceLock();initFolderPins();restoreWorkspace();finishBoot();stopStorageWidget=mountStorageWidget(null,{preview:true})}
async function bootOS(){if(preview||leaving||bootInProgress)return;bootInProgress=true;stopRecovery();stopBootProgress();bootStarted=null;bootTarget=0;$('gateRetry').hidden=true;$('gateLink').hidden=true;$('gate').hidden=false;try{bootStage(18,recoveryAttempts?'Reconnecting securely…':'Initializing secure session…');if(!corporateClient||!corporateAuthorize)({corporateClient,corporateAuthorize}=await osDeadline(import('./corp-auth.js?v=20261114-transport-classification'),'Corporate login service'));let parentClient;try{if(window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.location.pathname.endsWith('/dashboard.html')&&window.parent.document.documentElement.classList.contains('corp-ok')&&window.parent.document.getElementById('bcExecutiveOsFrame')?.contentWindow===window){parentClient=window.parent.BLACKCELL_CORPORATE_ADMIN_API?.client;embeddedAdmin=!!parentClient}}catch(_){}client=parentClient||client||corporateClient();bootStage(34,'Verifying corporate identity…');const result=await checkedIdentity();if(result.reason==='verification-error'){pauseVerification('Corporate identity service temporarily unavailable.');}else if(result.ok&&recoveryAccount&&result.user.id!==recoveryAccount){blocked('The active corporate account changed. Verify access again.');}else if(embeddedAdmin&&(!result.ok||result.member?.role!=='owner'||Number(result.member?.clearance_level)!==7)){blocked('Executive workspace requires a verified Level 7 administrator. Return to Administration.');}else if(!result.ok){blocked(result.reason==='signed-out'?'No active BLACKCELL sign-in was found. Return to Corporate Access.':result.reason==='not-approved'?'Your account is not approved for BLACKCELL OS.':'Corporate account verification is unavailable. Return to Corporate Access.');}else if(!memberAllowed(result.member)){blocked('Complete corporate activation before entering BLACKCELL OS.')}else if(recoveryLast!==null&&Date.now()-recoveryLast>=IDLE){blocked('Your corporate session has reached its inactivity limit. Verify access again.')}else{const member=result.member;owner=member.role==='owner';bootStage(50,'Verifying corporate security session…');const {data,error}=await checkedSecurity();if(error){pauseVerification('Security verification service temporarily unavailable.')}else if(data?.ok!==true||data?.verified!==true){blocked(owner?'Level 7 security session is not verified. Return to Corporate Access.':'Your employee access must be verified.')}else if(!owner&&member.access_scope==='ledger_only'){location.replace('private-photo-ledger.html')}else{window.BLACKCELL_LIVE_UPDATE?.setVerifiedRole(owner?'owner':'employee');const name=member.display_name||member.username||'BLACKCELL Member';$('memberName').textContent=name;$('memberUser').textContent=member.username?'@'+member.username:'Employee network';$('initials').textContent=name.trim().split(/\s+/).slice(0,2).map(p=>Array.from(p)[0]||'').join('').toUpperCase()||'BC';$('welcome').textContent='Welcome back, '+name.trim().split(/\s+/)[0]+'.';$('clearance').textContent='VERIFIED / LEVEL '+String(member.clearance_level??'—').padStart(2,'0');for(const el of document.querySelectorAll('[data-chat=true]'))el.hidden=!chatAllowed(member);if(owner){for(const item of document.querySelectorAll('[data-admin-only=true]'))item.hidden=false;$('adminReturn').hidden=false;$('accessLabel').textContent='Administrator';$('workspaceLabel').textContent='EXECUTIVE WORKSPACE / BLACKCELL CORPORATION';$('memberUser').textContent='Level 7 · Executive network';for(const el of document.querySelectorAll('[data-app=card],[data-open=card]'))el.hidden=true;}initStore(String(result.user.id));await cloudWorkspaceLoad();initDesktopPrefs();active=true;syncStore();last=recoveryLast??Date.now();touched=Date.now();bootStage(65,'Loading your workspace…');setupWorkspaceLock();const savedLock=workspaceLock.read();if(savedLock)workspaceLock.lock(savedLock,false);{const stopStorage=mountStorageWidget(client,{alive:()=>active&&!leaving});const stopWorld=mountWorldMonitor(client,{allowed:owner&&Number(member.clearance_level)===7,alive:()=>active&&!leaving&&owner,open:id=>showApp(id)});stopStorageWidget=()=>{stopStorage();stopWorld()}}initFolderPins();bootStage(76,'Checking available applications…');const catalog=await storeRequest('catalog');bootStage(88,'Preparing your desktop…');bootStage(100,'Workspace ready');if(await finishBoot()){stopRecovery();recoveryAttempts=0;recoveryAccount=null;recoveryLast=null;$('gateRetry').hidden=true;if(catalog.ok&&!workspaceLock?.isLocked()){try{restoreWorkspace();restoreOptionalWorkspace()}catch(_){osNotice('Some saved applications could not be restored. Open them manually.')}}else if(!catalog.ok&&!workspaceLock?.isLocked())osNotice('Application catalog unavailable. Your sign-in is intact; retry from App Store.');hostMessage('blackcell-os-ready');if(owner&&!preview)void import('./blackcell-soc-client.js?v=1').then(m=>{if(!active||leaving||!owner)return;securityNotifications=m.mountSecurityNotifications(client,{host:$('desktop').querySelector('.topright'),accountId:storeProfile,usable:()=>active&&owner&&!leaving&&bootComplete&&!workspaceLock?.isLocked()&&!$('desktop').hidden,openAdmin:()=>openAppOrStore('administration'),notice:osNotice})}).catch(()=>{});}windows.get('store')?.refreshStore?.();if(!runtimeWired){runtimeWired=true;warmAppComponents();for(const event of ['pointerdown','keydown','touchstart','wheel','pointermove'])window.addEventListener(event,()=>void activity(),{passive:true});window.addEventListener('focus',()=>void recheck());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void recheck()});setInterval(()=>{if(!active||leaving)return;const idle=Date.now()-last;if(idle>=IDLE){void signOut(true);return}if(bootComplete&&!workspaceLock?.isLocked()&&desktopPrefs.autoLockMinutes>0&&idle>=desktopPrefs.autoLockMinutes*60000)lockWorkspace()},5000);setInterval(()=>{if(!document.hidden)void recheck()},60000);}}}}catch(error){console.error('BLACKCELL OS startup interrupted',error?.osStep||error?.name||'startup');pauseVerification(error?.osStep?error.osStep+' is taking too long.':'BLACKCELL OS startup could not complete.')}finally{bootInProgress=false}}
if(!preview){$('gateRetry').addEventListener('click',()=>void retryVerification());window.addEventListener('online',()=>{if($('gate').dataset.state==='paused')void retryVerification()});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('gate').dataset.state==='paused')void retryVerification()});await bootOS()}

async function refreshCloudDesktop(){if(preview||!active||leaving||!storeProfile||cloudDesktopReading||document.hidden||appDrag)return;cloudDesktopReading=true;const uid=storeProfile,rev=cloudDesktopRevision;try{await cloudDesktopWrites;if(uid!==storeProfile||rev!==cloudDesktopRevision)return;const {data,error}=await client.from('corp_os_workspace_preferences').select('kind,value').eq('user_id',uid);if(error||uid!==storeProfile||rev!==cloudDesktopRevision||!active||leaving||appDrag)return;const keys={worlds:worldInstallKey(),dock:dockPreferenceKey(),layout:layoutKey(),settings:prefKey()};cloudDesktopAccount=uid;workspaceCloudReady=true;let changed=false;for(const row of data||[]){if(!Object.hasOwn(keys,row.kind))continue;const value=JSON.stringify(row.value);if(cloudDesktopCache.get(keys[row.kind])!==value){changed=true;for(const {store} of preferenceStores())try{store.setItem(keys[row.kind],value)}catch(_){}}}if(changed){readWorldInstalls();readDockPreferences();readAppLayout();initDesktopPrefs();syncStore();window.dispatchEvent(new Event('blackcell:widget-sync'))}}finally{cloudDesktopReading=false}}
window.addEventListener('focus',()=>void refreshCloudDesktop().catch(()=>{}));document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloudDesktop().catch(()=>{})});
