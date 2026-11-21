/* BLACKCELL site update system. Saves OS workspace state, not credentials or arbitrary form drafts. */
(function(){
'use strict';
if(window.top!==window.self||window.BLACKCELL_LIVE_UPDATE)return;
const testMode=document.currentScript?.dataset.test==='true'&&/\/site-update-test(?:-v2)?\.html$/.test(location.pathname), KEY='bc.live-update.v1';
const osMode=/\/blackcell-os(?:\.html)?\/?$/.test(location.pathname)||Boolean(document.getElementById('desktop')?.classList.contains('shell'));
const OS_APPLIED='bc.os.applied-release.v1', OS_TARGET='bc.os.update-target.v1', OS_EXPECTED_BUILD='bc.os.expected-build.v1', OS_AUTO='bc.os.auto-updates.v1';
function autoEnabled(){try{return localStorage.getItem(OS_AUTO)!=='off'}catch(_){return true}}
function setAutoEnabled(on){
 try{localStorage.setItem(OS_AUTO,on?'on':'off')}catch(_){}
 if(on&&pending)maybeRefresh();
 return autoEnabled();
}
let osDeferred='',osRequested=false,osNotice=null;
let testing=false,baseline='',pending='',checking=false,refreshing=false,last=Date.now(),interrupted=false,screen=null;
const dirty=new Map(),original=new WeakMap(),holds=new Map(),$=id=>document.getElementById(id);
for(const e of ['pointerdown','keydown','wheel','touchstart'])addEventListener(e,()=>{last=Date.now();interrupted=true},{capture:true,passive:true});
function editable(t){return t instanceof Element&&t.matches('input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]),textarea,select,[contenteditable=true]')}
function value(t){if(t.type==='file')return t.files?.length||0;if(t.type==='checkbox'||t.type==='radio')return t.checked;if(t.isContentEditable)return t.textContent;return t.value}
function defaultValue(t){if(t.type==='file')return 0;if(t.type==='checkbox'||t.type==='radio')return t.defaultChecked;if(t.tagName==='SELECT')return Array.from(t.options).find(o=>o.defaultSelected)?.value??t.options[0]?.value??'';if(t.isContentEditable)return '';return t.defaultValue??''}
document.addEventListener('focusin',e=>{const t=e.target;if(editable(t)&&!dirty.has(t))original.set(t,value(t))},true);
function track(e){const t=e.target;if(editable(t)){if(!dirty.has(t))dirty.set(t,original.has(t)?original.get(t):defaultValue(t));if(value(t)===dirty.get(t))dirty.delete(t)}}
document.addEventListener('input',track,true);document.addEventListener('change',track,true);
window.BLACKCELL_LIVE_UPDATE=Object.freeze({
 hold(reason='operation',owner=window){const t=Symbol(reason);holds.set(t,owner);return()=>holds.delete(t)},
 clean(element){if(element&&typeof element.contains==='function')for(const t of dirty.keys())if(t===element||element.contains(t)){dirty.delete(t);original.set(t,value(t))}},
 check:()=>void check(),autoEnabled,setAutoEnabled,
 status:()=>({available:!!pending,automatic:osMode&&autoEnabled(),blockedBy:pending?blockingReason():''}),
 show:async()=>{
  await check();
  if(!osMode)return {available:false};
  if(pending){
   osDeferred='';
   if(autoEnabled()){maybeRefresh();return {available:true,automatic:true,blockedBy:blockingReason()}}
   showOSNotice();return {available:true,automatic:false};
  }
  return {available:false,automatic:autoEnabled()};
 }
});
/* Hidden/minimized apps, cached input controls and decorative players must not
   block an idle update. Explicit active-operation holds still block every update. */
function visible(el){
 if(!el||!el.isConnected||el.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
 try{
  if(!el.getClientRects().length)return false;
  const style=el.ownerDocument.defaultView.getComputedStyle(el);
  return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0;
 }catch(_){return false}
}
function activityDoc(doc,depth=0){
 if(!doc||depth>3)return false;
 if(visible(doc.querySelector('.os-window[data-os-app="store"]:not([hidden])')))return true;
 if([...doc.querySelectorAll('[aria-busy="true"],.is-uploading,[data-busy="true"],progress:not([value])')].some(visible))return true;
 for(const el of doc.querySelectorAll('video,audio')){
  if(!visible(el)||el.paused||el.ended||(!el.currentSrc&&!el.getAttribute('src')))continue;
  return true;
 }
 for(const frame of doc.querySelectorAll('iframe')){
  if(!visible(frame))continue;
  const src=frame.getAttribute('src')||'';
  // Visible streaming apps remain protected even if the player is cross-origin.
  // Hidden/minimized media iframes do not block an otherwise idle desktop.
  if(src&&src!=='about:blank'&&/stream|player|youtube|vimeo|video|bunny/i.test(src)
    &&(frame.closest('.os-window')||frame.id==='bcCinemaStreamPlayer'||frame.dataset.bcActiveStream==='true'))return true;
  try{if(frame.contentDocument&&activityDoc(frame.contentDocument,depth+1))return true}catch(_){}
 }
 return false;
}
function busy(){
 for(const [token,owner] of holds){
  try{if(owner.closed||(owner!==window&&owner.top!==window)||owner instanceof Element&&!owner.isConnected)holds.delete(token)}
  catch(_){holds.delete(token)}
 }
 return holds.size>0||activityDoc(document);
}
function modified(){
 for(const [t,initial] of dirty){
  if(!t.isConnected||value(t)===initial){dirty.delete(t);original.delete(t)}
 }
 return [...dirty].some(([t])=>visible(t)&&!t.closest('.bc-settings'))||
  [...document.querySelectorAll('input[type=file]')].some(t=>visible(t)&&t.files?.length);
}
function openModal(){
 return [...document.querySelectorAll('dialog[open],[aria-modal="true"]:not([hidden]):not([aria-hidden="true"])')]
  .some(t=>visible(t)&&!t.closest('#bc-os-update-notice,#bc-update-overlay'));
}
function blockingReason(){
 if(document.hidden)return 'Device is inactive.';
 if(!navigator.onLine)return 'Waiting for internet connection.';
 if(busy())return 'An active upload, media session or operation is running.';
 if(modified())return 'An unsaved form or selected file still needs attention.';
 if(openModal())return 'A dialog is open.';
 return '';
}
function safe(explicit=false){return !blockingReason()&&(explicit||Date.now()-last>=12000)}
function maybeRefresh(){
 if(!pending||refreshing)return;
 if(osMode){
  if(autoEnabled()){
   if(osNotice)osNotice.hidden=true;
   if(safe())void refresh();
   return;
  }
  if(osRequested){
   if(safe(true))void refresh();
   else setOSNoticeStatus(blockingReason()||'Finish the current action to continue.');
  }else showOSNotice();
  return;
 }
 if(safe())void refresh();
}
function setOSNoticeStatus(message){const p=osNotice?.querySelector('[data-bc-update-status]');if(p)p.textContent=message}
function showOSNotice(){
 if(!osMode||!pending||refreshing||osDeferred===pending)return;
 if(!osNotice){
  const panel=document.createElement('section');panel.id='bc-os-update-notice';panel.setAttribute('role','region');panel.setAttribute('aria-label','BLACKCELL OS software update');
  const kicker=document.createElement('small');kicker.textContent='BLACKCELL OS / SOFTWARE UPDATE';
  const heading=document.createElement('h2');heading.textContent='An update is available';
  const description=document.createElement('p');description.textContent='Apply the newest BLACKCELL OS interface and app catalog. Obsolete app shortcuts are reconciled; your account, photos, videos and files are not deleted.';
  const status=document.createElement('p');status.dataset.bcUpdateStatus='';status.setAttribute('role','status');status.textContent='Ready when you are.';
  const actions=document.createElement('div');actions.className='bc-os-update-actions';
  const now=document.createElement('button');now.type='button';now.className='bc-os-update-now';now.textContent='Update Now';
  const later=document.createElement('button');later.type='button';later.className='bc-os-update-later';later.textContent='Later';
  now.onclick=()=>{osRequested=true;setOSNoticeStatus('Checking that your work can be safely preserved…');maybeRefresh()};
  later.onclick=()=>{osDeferred=pending;osRequested=false;panel.hidden=true};
  actions.append(now,later);panel.append(kicker,heading,description,status,actions);
  document.body.append(panel);osNotice=panel;
 }
 osNotice.hidden=false;
}

function styles(){const s=document.createElement('style');s.textContent=
'#bc-update-overlay{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#f5f5f5;z-index:2147483000;line-height:1.5}#bc-update-overlay *{box-sizing:border-box}'+
'#bc-update-overlay[hidden]{display:none!important}#bc-update-overlay{position:fixed;inset:0;background:#000;display:grid;place-items:center;padding:24px;text-align:center}#bc-update-overlay .bc-up-body{width:min(460px,100%);display:grid;justify-items:center;gap:15px}'+
'#bc-update-overlay .bc-up-brand{font-size:clamp(19px,5vw,29px);letter-spacing:.34em;font-weight:800;color:#eee}#bc-update-overlay .bc-up-corp{font-size:10px;letter-spacing:.47em;color:#aaa;margin-top:-12px}'+
'#bc-update-overlay .bc-up-ring{width:112px;height:112px;border-radius:50%;border:2px solid #292929;border-top-color:#ff2038;border-right-color:#ac0b1c;box-shadow:0 0 32px #ae0a262c;animation:bcupdspin 1.35s linear infinite;margin:22px 0 7px}'+
'#bc-update-overlay h2{font-size:24px;letter-spacing:.14em;color:#fff;margin:0}#bc-update-overlay p{font-size:12px;color:#aaa;margin:0}#bc-update-overlay .bc-up-track{width:80%;height:4px;background:#222;overflow:hidden;border-radius:8px;margin-top:8px}#bc-update-overlay .bc-up-track i{display:block;width:36%;height:4px;background:#ed1230;animation:bcupdscan 1.45s ease-in-out infinite}#bc-update-overlay .bc-up-foot{border-top:1px solid #272727;padding-top:21px;margin-top:18px;width:100%;font-size:9px;letter-spacing:.25em;color:#777}'+
'#bc-os-update-notice{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));width:min(390px,calc(100vw - 32px));padding:23px;color:#f4f4f7;background:linear-gradient(155deg,#191920,#09090e);border:1px solid #c8233d88;border-radius:20px;box-shadow:0 20px 65px #000b,0 0 30px #a310201f;z-index:2147482000;font:14px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-sizing:border-box}'+
'#bc-os-update-notice[hidden]{display:none!important}#bc-os-update-notice small{color:#e87386;letter-spacing:.18em;font-size:10px;font-weight:750}#bc-os-update-notice h2{font-size:22px;line-height:1.15;margin:12px 0 10px}#bc-os-update-notice p{font-size:13px;line-height:1.55;color:#c5c5cd;margin:0 0 12px}#bc-os-update-notice [data-bc-update-status]{font-size:12px;color:#e4adba;min-height:20px}#bc-os-update-notice .bc-os-update-actions{display:flex;gap:10px;margin-top:16px}#bc-os-update-notice button{flex:1;min-height:46px;border-radius:10px;color:white;border:1px solid #555;font:650 13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer}#bc-os-update-notice .bc-os-update-now{background:#a90f27;border-color:#e5324b}#bc-os-update-notice .bc-os-update-later{background:#22232c}#bc-os-update-notice button:focus-visible{outline:2px solid white;outline-offset:2px}'+
'@keyframes bcupdspin{to{transform:rotate(360deg)}}@keyframes bcupdscan{0%{transform:translateX(-100%)}100%{transform:translateX(380%)}}@media(prefers-reduced-motion:reduce){#bc-update-overlay .bc-up-ring,#bc-update-overlay .bc-up-track i{animation:none}}';document.head.append(s)}
styles();
function overlay(message,prepareOnly=false){if(!screen){screen=document.createElement('div');screen.id='bc-update-overlay';screen.setAttribute('role','status');screen.innerHTML='<div class="bc-up-body"><div class="bc-up-brand">BLACKCELL</div><div class="bc-up-corp">CORPORATION</div><div class="bc-up-ring" aria-hidden="true"></div><h2>SITE UPDATING</h2><p id="bc-up-message"></p><div class="bc-up-track" aria-hidden="true"><i></i></div><p>Preserving your current location</p><div class="bc-up-foot">CONTROL IS EVERYTHING.</div></div>';screen.hidden=prepareOnly;document.body.append(screen)}screen.hidden=prepareOnly;$('bc-up-message').textContent=message}
async function latestOSBuild(){
 if(!osMode)return '';
 try{
  const uri=new URL(location.pathname,location.href);
  uri.searchParams.set('_bc_os_html',String(Date.now()));
  const response=await fetch(uri,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)return '';
  const markup=await response.text();
  return markup.match(/<meta\s+name=["']blackcell-os-client-build["']\s+content=["']([a-zA-Z0-9._-]{4,100})["']/i)?.[1]||'';
 }catch(_){return ''}
}
function save(){try{const scroll=Array.from(document.querySelectorAll('[id]')).filter(t=>t.clientHeight>0&&t.scrollHeight>t.clientHeight+4&&t.scrollTop>0).slice(0,30).map(t=>({id:t.id,top:t.scrollTop,left:t.scrollLeft}));sessionStorage.setItem(KEY,JSON.stringify({path:location.pathname,at:Date.now(),x:scrollX,y:scrollY,scroll}))}catch(_){}}
function restore(){let r;try{r=JSON.parse(sessionStorage.getItem(KEY)||'null');sessionStorage.removeItem(KEY)}catch(_){return}if(!r||r.path!==location.pathname||Date.now()-r.at>60000||performance.getEntriesByType('navigation')[0]?.type!=='reload')return;
interrupted=false;overlay('Restoring your corporate workspace…');const move=()=>{if(interrupted||location.pathname!==r.path)return;scrollTo(r.x||0,r.y||0);for(const item of r.scroll||[]){const el=$(item.id);if(el){el.scrollTop=item.top;el.scrollLeft=item.left}}};
move();setTimeout(move,300);setTimeout(move,1100);setTimeout(()=>{screen?.remove();screen=null;move()},400);setTimeout(move,2600)}
async function refresh(){
 if(refreshing||!pending||(testing?busy():!safe(osMode&&osRequested&&!autoEnabled())))return;
 refreshing=true;if(osNotice)osNotice.hidden=true;
 overlay(osMode?'Saving your BLACKCELL workspace and installing the update…':'Applying the latest corporate system update…');
 await new Promise(r=>setTimeout(r,850));
 if(testing?busy():!safe(osMode&&osRequested&&!autoEnabled())){
  screen?.remove();screen=null;refreshing=false;
  if(osMode&&!autoEnabled())showOSNotice();
  return;
 }
 if(osMode&&typeof window.BLACKCELL_OS_AUTOSAVE_WORKSPACE==='function'){
  let preserved=false;
  try{preserved=(await window.BLACKCELL_OS_AUTOSAVE_WORKSPACE())===true}catch(_){}
  if(!preserved){
   screen?.remove();screen=null;refreshing=false;
   if(osMode&&!autoEnabled())showOSNotice();
   return;
  }
 }
 save();
 if(testing){try{sessionStorage.setItem('bc.live-update.test-complete',location.pathname+location.search+location.hash)}catch(_){}}
 if(osMode){
  const expectedBuild=await latestOSBuild();
  try{
   sessionStorage.setItem(OS_TARGET,pending);
   if(expectedBuild)sessionStorage.setItem(OS_EXPECTED_BUILD,expectedBuild);
  }catch(_){}
  const url=new URL(location.href);url.searchParams.set('bc_os_release',pending.replace(/[^a-z0-9_-]/gi,'').slice(0,48));
  location.replace(url.href);return;
 }
 location.reload();
}
async function version(){const url=new URL('blackcell-site-version.json',location.href);url.searchParams.set('_bc',String(Date.now()));const r=await fetch(url,{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error('Version unavailable');const text=await r.text(),json=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));const rev=String(json.revision||'');if(/^[a-f0-9]{7,64}$/i.test(rev))return rev;const build=String(json.built||'');if(/^\d{14}$/.test(build))return build;return String(json.fallback||'')}
async function check(){
 if(checking||refreshing||document.hidden||!navigator.onLine)return;
 checking=true;
 try{
  const v=await version();if(!v)return;
  if(osMode){
   try{
    const target=sessionStorage.getItem(OS_TARGET);
    const expected=sessionStorage.getItem(OS_EXPECTED_BUILD);
    const current=document.querySelector('meta[name="blackcell-os-client-build"]')?.content||'';
    if(target===v&&(!expected||expected===current)){
     localStorage.setItem(OS_APPLIED,v);
     sessionStorage.removeItem(OS_TARGET);sessionStorage.removeItem(OS_EXPECTED_BUILD);
    }
   }catch(_){}
  }
  if(!baseline){
   baseline=v;
   if(osMode){
    try{const applied=localStorage.getItem(OS_APPLIED);if(!applied)localStorage.setItem(OS_APPLIED,v);else if(applied!==v)pending=v}catch(_){}
    if(sessionStorage.getItem(OS_TARGET)===v&&sessionStorage.getItem(OS_EXPECTED_BUILD)&&sessionStorage.getItem(OS_EXPECTED_BUILD)!==(document.querySelector('meta[name="blackcell-os-client-build"]')?.content||''))pending=v;
    if(pending)maybeRefresh();
   }
   return;
  }
  let storedDifferent=false;
  if(osMode)try{storedDifferent=!!localStorage.getItem(OS_APPLIED)&&localStorage.getItem(OS_APPLIED)!==v}catch(_){}
  const target=sessionStorage.getItem(OS_TARGET),expected=sessionStorage.getItem(OS_EXPECTED_BUILD),current=document.querySelector('meta[name="blackcell-os-client-build"]')?.content||'';
  const buildMismatch=target===v&&!!expected&&expected!==current;
  const next=v!==baseline||storedDifferent||buildMismatch?v:'';
  if(next!==pending){osRequested=false;osDeferred='';if(!next&&osNotice)osNotice.hidden=true}
  pending=next;if(pending)maybeRefresh();
 }catch(_){/* Do not interrupt the user's session when release checks fail */}finally{checking=false}
}
if(testMode){
 const button=$('bcRunUpdateTest');
 const output=$('bcTestResult');
 overlay('Applying the latest corporate system update…',true);
 if(output)output.textContent='UPDATE ENGINE READY — click TEST SITE UPDATE.';
 if(button)button.disabled=false;
 if($('bcManifestResult'))void version().then(v=>{$('bcManifestResult').textContent='Deployed release: '+(v||'unavailable')}).catch(()=>{$('bcManifestResult').textContent='Release manifest unavailable; local animation test is still available.'});
 button?.addEventListener('click',()=>{
  if(refreshing)return;
  if(busy()){if(output)output.textContent='Test paused: an active operation is blocking refresh.';return;}
  testing=true;pending='local-test';button.disabled=true;if(output)output.textContent='Running the real update engine…';void refresh().then(()=>{if(!refreshing){button.disabled=false;if(output)output.textContent='Test paused. Try again when the page is idle.';}}).catch(()=>{button.disabled=false;if(output)output.textContent='Update test failed during refresh.'});
 });
 try{if(sessionStorage.getItem('bc.live-update.test-complete')===location.pathname+location.search+location.hash&&performance.getEntriesByType('navigation')[0]?.type==='reload'){
  sessionStorage.removeItem('bc.live-update.test-complete');
  $('bcTestResult').textContent='TEST COMPLETE — returned to the same page after refresh.';
 }}catch(_){}
}
restore();if(!testMode){void check();setInterval(()=>void check(),30000);setInterval(maybeRefresh,2000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check()});addEventListener('online',()=>void check());}
})();
