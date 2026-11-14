let corporateClient,corporateAuthorize;
const $=id=>document.getElementById(id),preview=document.body.dataset.preview==='true';
let client,active=false,leaving=false,last=Date.now(),touched=Date.now(),touching=false,checking=false;
const IDLE=60*60*1000;
function clock(){ $('clock').textContent=new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }clock();setInterval(clock,15000);
function blocked(message){active=false;closeAll(true);$('desktop').hidden=true;$('gate').hidden=false;$('gateMessage').textContent=message;$('gateLink').hidden=false;}
const windows=new Map();let layer=25,selectedWindow=null;
const menus=$('osMenu'),menuButtons=[...document.querySelectorAll('[data-menu]')];
function closeMenu(){menus.hidden=true;for(const btn of menuButtons)btn.setAttribute('aria-expanded','false')}
function menuAction(label,fn){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{closeMenu();fn()};menus.append(button)}
function menu(name,trigger){const was=trigger.getAttribute('aria-expanded')==='true';closeMenu();if(was)return;menus.replaceChildren();trigger.setAttribute('aria-expanded','true');
 if(name==='apps'){for(const tile of document.querySelectorAll('[data-app]'))if(!tile.hidden&&!tile.disabled)menuAction(tile.dataset.title,()=>showApp(tile.dataset.app))}
 else if(name==='window'){menuAction('Show Desktop',showDesktop);for(const record of windows.values())menuAction(record.title,()=>raise(record))}
 else{menuAction('Show Desktop',showDesktop);menuAction('My Profile',()=>showApp('person'));menuAction(preview?'Exit Preview':'Sign Out',()=>void signOut())}
 menus.style.left=trigger.offsetLeft+'px';menus.hidden=false;
}
for(const btn of menuButtons)btn.addEventListener('click',()=>menu(btn.dataset.menu,btn));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menubar'))closeMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
function markDock(id,on){document.querySelector('[data-open="'+id+'"]')?.classList.toggle('is-running',on)}
function raise(r){r.el.hidden=false;r.el.style.zIndex=String(++layer);selectedWindow=r;markDock(r.id,true)}
function showDesktop(){for(const r of windows.values())r.el.hidden=true;selectedWindow=null}
function dispose(r,force=false){if(!preview&&!force&&!confirm('Close '+r.title+'? Finish any uploads, playback or unsaved work in this application before closing.'))return;r.frame?.remove();r.el.remove();r.release?.();windows.delete(r.id);markDock(r.id,false);if(selectedWindow===r)selectedWindow=null}
function closeAll(force){for(const r of [...windows.values()])dispose(r,force)}
function showApp(id){
 if(!active&&!preview)return;
 const tile=document.querySelector('.app[data-app="'+id+'"]');if(!tile||tile.hidden||tile.disabled)return;
 if(windows.has(id)){raise(windows.get(id));return}
 const url=new URL(tile.dataset.url,location.href);if(url.origin!==location.origin)return;
 const w=document.createElement('section');w.className='os-window';w.setAttribute('aria-label',tile.dataset.title+' window');
 const bar=document.createElement('div');bar.className='os-window-head';const controls=document.createElement('div');controls.className='traffic';
 const title=document.createElement('span');title.textContent=tile.dataset.title;
 const external=document.createElement('a');external.href=url.href;external.target='_blank';external.rel='noopener';external.textContent='Open full page ↗';bar.append(controls,title,external);
 const content=document.createElement('div');content.className='os-window-body';w.append(bar,content);
 const r={id,title:tile.dataset.title,el:w,frame:null,release:null};windows.set(id,r);
 for(const [label,symbol,fn] of [['Close','×',()=>dispose(r)],['Minimize','−',()=>{w.hidden=true;selectedWindow=null}],['Maximize or restore','+',()=>w.classList.toggle('is-max')]]){const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-label',label+' '+r.title);btn.title=label;btn.textContent=symbol;btn.addEventListener('click',fn);controls.append(btn)}
 if(preview){const demo=document.createElement('div');demo.className='os-demo';const box=document.createElement('div');box.append(tile.querySelector('.app-icon').cloneNode(true));const h=document.createElement('h2');h.textContent=r.title;const p=document.createElement('p');p.textContent=tile.dataset.desc;const status=document.createElement('p');status.textContent='DESIGN PREVIEW · No private account data loaded.';status.className='os-window-status';box.append(h,p,status);demo.append(box);content.append(demo)}
 else{r.release=window.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL OS application window');const frame=document.createElement('iframe');frame.title=r.title;frame.src=url.href;frame.allow='fullscreen';frame.setAttribute('allowfullscreen','');r.frame=frame;content.append(frame);
 frame.addEventListener('load',()=>{try{const child=frame.contentDocument;if(!child)return;const childURL=new URL(frame.contentWindow.location.href);if(childURL.origin!==location.origin)return;if(childURL.pathname.endsWith('/blackcell-os.html')||childURL.pathname.endsWith('/blackcell-os-preview.html')){dispose(r,true);return}for(const event of ['pointerdown','keydown','touchstart','wheel'])child.addEventListener(event,()=>void activity(),{passive:true});}catch(_){}});
 }
 $('desktop').append(w);raise(r);w.addEventListener('pointerdown',()=>raise(r),true);bar.addEventListener('dblclick',e=>{if(!e.target.closest('button,a'))w.classList.toggle('is-max')});
 let drag=null;
 bar.addEventListener('pointerdown',e=>{if(e.target.closest('button,a')||w.classList.contains('is-max')||innerWidth<=620)return;const rect=w.getBoundingClientRect();drag={x:e.clientX-rect.left,y:e.clientY-rect.top};bar.setPointerCapture(e.pointerId)});
 bar.addEventListener('pointermove',e=>{if(!drag)return;w.style.left=Math.max(0,Math.min(innerWidth-w.offsetWidth,e.clientX-drag.x))+'px';w.style.top=Math.max(34,Math.min(innerHeight-100,e.clientY-drag.y))+'px'});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])bar.addEventListener(event,()=>{drag=null});
}
for(const button of document.querySelectorAll('[data-app]'))button.addEventListener('click',()=>showApp(button.dataset.app));
for(const button of document.querySelectorAll('[data-open]'))button.addEventListener('click',()=>showApp(button.dataset.open));
$('showDesktop').addEventListener('click',showDesktop);
async function signOut(force=false){if(preview){location.assign('login.html');return}if(leaving)return;if(!force&&windows.size&&!confirm('Sign out and close your open applications? Finish uploads, playback and unsaved work first.'))return;leaving=true;active=false;blocked('Ending your corporate session…');try{await client.rpc('corp_employee_end_session')}catch(_){}try{await client.auth.signOut({scope:'local'})}catch(_){}location.replace('login.html')}
$('signOut').addEventListener('click',()=>void signOut());
async function recheck(){if(!active||checking||leaving)return;checking=true;try{if(Date.now()-last>=IDLE){await signOut(true);return}const result=await corporateAuthorize(client,{allowLedgerOnly:true});if(!result.ok||result.member.role!=='employee'||!result.member.password_activated_at){blocked('Your corporate session is no longer authorized.');return}if(result.member.access_scope==='ledger_only'){location.replace('private-photo-ledger.html');return}const {data,error}=await client.rpc('corp_employee_code_status');if(error||data?.ok!==true||data?.verified!==true){blocked('Your employee authorization must be verified again.');return}for(const el of document.querySelectorAll('[data-chat=true]'))el.hidden=result.member.can_chat!==true;if(result.member.can_chat!==true&&windows.has('chat'))dispose(windows.get('chat'),true);}catch(_){blocked('Unable to verify your corporate session.')}finally{checking=false}}
async function activity(){if(!active||leaving)return;if(Date.now()-last>=IDLE){await signOut(true);return}last=Date.now();if(touching||Date.now()-touched<60000)return;touching=true;try{const {data,error}=await client.rpc('corp_employee_touch_session');if(error||data?.ok!==true){blocked('Your corporate session has expired.');return}touched=Date.now()}catch(_){blocked('Unable to verify your active session.')}finally{touching=false}}
if(!preview){try{({corporateClient,corporateAuthorize}=await import('./corp-auth.js?v=20261112-ledger-access1'));client=corporateClient();const result=await corporateAuthorize(client,{allowLedgerOnly:true});if(!result.ok){blocked('Sign in to access your personal BLACKCELL workspace.');}else if(result.member.role==='owner'){location.replace('login.html')}else if(result.member.role!=='employee'||!result.member.password_activated_at){blocked('Complete employee activation before entering BLACKCELL OS.')}else{const member=result.member;const {data,error}=await client.rpc('corp_employee_code_status');if(error||data?.ok!==true||data?.verified!==true){blocked('Your employee access must be verified.')}else if(member.access_scope==='ledger_only'){location.replace('private-photo-ledger.html')}else{const name=member.display_name||member.username||'BLACKCELL Member';$('memberName').textContent=name;$('memberUser').textContent=member.username?'@'+member.username:'Employee network';$('initials').textContent=name.trim().split(/\s+/).slice(0,2).map(p=>Array.from(p)[0]||'').join('').toUpperCase()||'BC';$('welcome').textContent='Welcome back, '+name.trim().split(/\s+/)[0]+'.';$('clearance').textContent='VERIFIED / LEVEL '+String(member.clearance_level??'—').padStart(2,'0');for(const el of document.querySelectorAll('[data-chat=true]'))el.hidden=member.can_chat!==true;active=true;last=Date.now();touched=Date.now();$('gate').hidden=true;$('desktop').hidden=false;for(const event of ['pointerdown','keydown','touchstart','wheel','pointermove'])window.addEventListener(event,()=>void activity(),{passive:true});window.addEventListener('focus',()=>void recheck());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void recheck()});setInterval(()=>{if(active&&Date.now()-last>=IDLE)void signOut(true)},15000);setInterval(()=>{if(!document.hidden)void recheck()},60000);}}}catch(_){blocked('BLACKCELL OS cannot verify your access. Please sign in again.')}}