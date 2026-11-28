/* BLACKCELL SpringBoard — Version A: iOS-inspired phone home.
   Uses real installed BLACKCELL app tiles and their existing secure handlers.
   Desktop and iPad are not modified by this module.
 */
(()=>{'use strict';
const $=(q,r=document)=>r.querySelector(q),$$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const E=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
const S=(paths)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
const GLYPHS={
 search:'<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.7 4.7"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 close:'<path d="M5 5 19 19M19 5 5 19"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 edit:'<path d="m4 16 12-12 4 4L8 20H4z"/><path d="M14 6l4 4"/>'
};
function start(){
 const shell=$('#desktop'),src=$('#desktop .workspace .apps');
 if(!shell||!src||shell.querySelector('.bc-sb'))return;
 const root=E('section','bc-sb');root.setAttribute('aria-label','BLACKCELL Mobile Home Screen');
 const status=E('header','bc-sb-status');
 const time=E('time','bc-sb-time');
 const brand=E('span','bc-sb-status-brand','BLACKCELL OS');
 const actions=E('div','bc-sb-status-actions');
 const searchTop=E('button','bc-sb-status-button');searchTop.type='button';searchTop.setAttribute('aria-label','Search apps');searchTop.innerHTML=S(GLYPHS.search);
 const lock=E('button','bc-sb-status-button');lock.type='button';lock.setAttribute('aria-label','Lock BLACKCELL');lock.innerHTML=S(GLYPHS.lock);
 actions.append(searchTop,lock);status.append(time,brand,actions);
 const home=E('main','bc-sb-home');
 const widgets=E('section','bc-sb-widgets');widgets.setAttribute('aria-label','BLACKCELL widgets');
 const dateWidget=E('div','bc-sb-widget bc-sb-date');
 const weekday=E('span','bc-sb-weekday'),dateNum=E('strong','bc-sb-day'),month=E('span','bc-sb-month');
 dateWidget.append(weekday,dateNum,month);
 const systemWidget=E('div','bc-sb-widget bc-sb-system');
 const sysTiny=E('span','bc-sb-widget-label','YOUR PRIVATE OS');
 const sysBig=E('strong','bc-sb-widget-big','OS');
 const sysRow=E('div','bc-sb-widget-row'),sysDot=E('span','bc-sb-green-dot'),sysText=E('span','bc-sb-widget-meta','VERIFIED WORKSPACE');
 sysRow.append(sysDot,sysText);
 const sysCount=E('span','bc-sb-widget-bottom','Applications');
 systemWidget.append(sysTiny,sysBig,sysRow,sysCount);
 widgets.append(dateWidget,systemWidget);
 const identity=E('div','bc-sb-identity');
 const jewel=E('span','bc-sb-diamond');
 jewel.innerHTML='<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M32 3 61 32 32 61 3 32Z" fill="#350915" stroke="#F47A90" stroke-width="1.6"/><path d="M23 16h13c7.8 0 12 3.5 12 9 0 3.5-2.1 6-4.8 7.2 4.2 1.4 6.1 4.5 6.1 8.5 0 6.7-5.6 10.3-13.7 10.3H23V16Zm8 6v8h5c2.8 0 4.4-1.5 4.4-4s-1.6-4-4.4-4h-5Zm0 13.7v9h5.9c3 0 4.7-1.7 4.7-4.5s-1.7-4.5-4.7-4.5H31Z" fill="#F9F6F7"/></svg>';
 const name=E('span','bc-sb-identity-text','BLACKCELL');
 const headline=E('strong','bc-sb-identity-headline','Mobile');
 const subtitle=E('span','bc-sb-identity-subtitle','SECURE WORKSPACE');
 const identityCopy=E('div','bc-sb-identity-copy');
 identityCopy.append(name,headline,subtitle);
 identity.append(jewel,identityCopy);
 const page=E('section','bc-sb-page');page.setAttribute('aria-label','Home Screen applications');
 const grid=E('div','bc-sb-grid');
 const pageControls=E('div','bc-sb-page-controls');
 const dots=E('div','bc-sb-dots');dots.setAttribute('aria-label','Home Screen pages');
 const library=E('button','bc-sb-library-link');library.type='button';
 library.innerHTML=S(GLYPHS.grid)+'<span>App Library</span>';
 pageControls.append(dots,library);
 const searchPill=E('button','bc-sb-search-pill');searchPill.type='button';searchPill.innerHTML=S(GLYPHS.search)+'<span>Search</span>';
 const dock=E('nav','bc-sb-dock');dock.setAttribute('aria-label','Favorite apps');
 const dockItems=E('div','bc-sb-dock-icons');dock.append(dockItems);
 const dockHandle=E('button','bc-sb-dock-handle','Show Dock');
 dockHandle.type='button';
 dockHandle.setAttribute('aria-label','Show Favorite Apps Dock');
 dockHandle.setAttribute('aria-controls','bcSpringboardDock');
 dockHandle.setAttribute('aria-expanded','false');
 dock.id='bcSpringboardDock';
 const editButton=E('button','bc-sb-edit-done','Done');editButton.type='button';editButton.hidden=true;
 const indicator=E('div','bc-sb-home-indicator');indicator.setAttribute('aria-hidden','true');
 const heading=E('div','bc-sb-apps-heading');heading.append(E('strong','','Applications'),E('small','bc-sb-touch-edition','OBSIDIAN TOUCH'));page.append(heading,grid);home.append(identity,widgets,page,pageControls,searchPill,dock,dockHandle,indicator);
 const modal=E('div','bc-sb-overlay');modal.hidden=true;
 const sheet=E('section','bc-sb-sheet');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','BLACKCELL App Library');
 const modalBar=E('div','bc-sb-modal-head');
 const modalTitle=E('h2','','App Library');
 const modalClose=E('button','bc-sb-close');modalClose.type='button';modalClose.setAttribute('aria-label','Close');modalClose.innerHTML=S(GLYPHS.close);
 modalBar.append(modalTitle,modalClose);
 const search=E('input','bc-sb-input');search.type='search';search.autocomplete='off';search.spellcheck=false;search.placeholder='Search apps';search.setAttribute('aria-label','Search installed BLACKCELL applications');
 const resultList=E('div','bc-sb-results');
 sheet.append(modalBar,search,resultList);modal.append(sheet);
 root.append(status,editButton,home,modal);shell.append(root);
 shell.classList.add('bc-springboard-ready');
 let pageIndex=0,edit=false,picked=null,pressed=null,longTimer=0,suppressUntil=0,modalOpen=false,returnFocus=null,knownAccount=null,order=[];
 let renderedIds=[],dockIdleTimer=0;
 const dockAuto=()=>shell.classList.contains('os-dock-auto-hide');
 function stopDockIdle(){clearTimeout(dockIdleTimer);dockIdleTimer=0}
 function hideDock(){
  stopDockIdle();root.classList.remove('bc-sb-dock-shown');
  dockHandle.setAttribute('aria-expanded','false');
  dock.setAttribute('aria-hidden',dockAuto()?'true':'false');
  dock.toggleAttribute('inert',dockAuto());
 }
 function scheduleDockIdle(){
  stopDockIdle();
  if(!dockAuto()||!root.classList.contains('bc-sb-dock-shown'))return;
  dockIdleTimer=setTimeout(()=>{
   if(dock.matches(':hover')||dock.contains(document.activeElement)){scheduleDockIdle();return}
   hideDock();
  },4500);
 }
 function showDock(){
  if(!dockAuto())return;
  root.classList.add('bc-sb-dock-shown');
  dockHandle.setAttribute('aria-expanded','true');
  dock.setAttribute('aria-hidden','false');dock.removeAttribute('inert');
  scheduleDockIdle();
 }
 function syncDockPreference(){
  const auto=dockAuto();root.classList.toggle('bc-sb-dock-auto-hide',auto);
  dockHandle.hidden=!auto;
  if(!auto){stopDockIdle();root.classList.remove('bc-sb-dock-shown');dock.removeAttribute('inert');dock.setAttribute('aria-hidden','false')}
  else if(!root.classList.contains('bc-sb-dock-shown'))hideDock();
  else scheduleDockIdle();
 }
 dockHandle.addEventListener('click',showDock);
 dock.addEventListener('pointerdown',()=>scheduleDockIdle(),{passive:true});
 dock.addEventListener('pointerenter',stopDockIdle);
 dock.addEventListener('pointerleave',scheduleDockIdle);
 dock.addEventListener('focusin',stopDockIdle);
 dock.addEventListener('focusout',scheduleDockIdle);
 root.addEventListener('pointerdown',e=>{
  if(dockAuto()&&root.classList.contains('bc-sb-dock-shown')&&!dock.contains(e.target)&&!dockHandle.contains(e.target))hideDock();
 },{capture:true,passive:true});
 let dockSwipeStart=null;
 home.addEventListener('touchstart',e=>{
  if(e.touches.length!==1)return;const p=e.touches[0],bounds=home.getBoundingClientRect();
  dockSwipeStart=dockAuto()&&p.clientY>bounds.bottom-105?{x:p.clientX,y:p.clientY}:null;
 },{passive:true});
 home.addEventListener('touchend',e=>{
  if(!dockSwipeStart||e.changedTouches.length!==1)return;const p=e.changedTouches[0],dy=p.clientY-dockSwipeStart.y;
  if(dy< -32&&Math.abs(p.clientX-dockSwipeStart.x)<105)showDock();
  dockSwipeStart=null;
 },{passive:true});
 window.addEventListener('pagehide',stopDockIdle,{once:true});
 const priority=['network','forces','photos','film','shorts','person','omega','settings','store','photoledger','photobattle','usa','awards','care','innovations'];
 const account=()=>{try{return window.BLACKCELL_OS_WIDGET_LAYOUT?.account?.()||null}catch(_){return null}};
  const unified=()=>window.BLACKCELL_OS_UNIFIED_LAYOUT;
  const pins=()=>unified()?.read?.().pins||[];
  const homePinned=()=>pins().filter(p=>available().some(x=>x.id===p.id));
 const storageKey=()=>{const id=account();return id&&id!=='preview'?'bc.os.iphone-springboard.v1:'+id:null};
 function readOrder(){
  const id=account();if(id===knownAccount)return;
  knownAccount=id;order=[];
  const key=storageKey();if(!key)return;
  try{const x=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(x))order=x.filter(v=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,60}$/.test(v)).slice(0,160)}catch(_){}
 }
 function saveOrder(){const key=storageKey();if(!key||shell.hidden)return;try{localStorage.setItem(key,JSON.stringify(order))}catch(_){}}
 function available(){
  return $$('.app[data-app]',src).filter(t=>!t.hidden&&!t.disabled&&!t.classList.contains('bc-recycled-shortcut')).map(t=>({
   id:t.dataset.app,label:$('.app-name',t)?.textContent?.trim()||t.dataset.title||t.dataset.app,tile:t
  }));
 }
 function ordered(){
  readOrder();const found=available(),map=new Map(found.map(x=>[x.id,x]));
  const synced=homePinned().map(p=>p.id);
   return [...synced,...order,...priority,...found.map(x=>x.id)].filter((id,i,all)=>all.indexOf(id)===i&&map.has(id)).map(id=>map.get(id));
 }
 function safeLaunch(id){
  if(shell.hidden)return;
  const tile=$('.app[data-app="'+id+'"]',src);
  if(!tile||tile.hidden||tile.disabled||tile.classList.contains('bc-recycled-shortcut'))return;
  closeModal();tile.click();
 }
 function clock(){
  const now=new Date();
  time.textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(now);
  weekday.textContent=new Intl.DateTimeFormat(undefined,{weekday:'long'}).format(now).toUpperCase();
  dateNum.textContent=String(now.getDate());
  month.textContent=new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(now).toUpperCase();
 }
 function pageSize(){return window.innerWidth>window.innerHeight&&window.innerHeight<600?8:12}
 function enterEdit(){if(edit)return;edit=true;picked=null;root.classList.add('bc-sb-editing');editButton.hidden=false;render()}
 function leaveEdit(){edit=false;picked=null;root.classList.remove('bc-sb-editing');editButton.hidden=true;render()}
 function moveIcon(from,to){
  const synced=pins();
   if(synced.length){
    const a=synced.findIndex(p=>p.id===from),b=synced.findIndex(p=>p.id===to);
    if(a>=0&&b>=0&&a!==b){
     const data=unified()?.read?.();if(!data)return;
     const slots=data.pins.map(p=>({x:p.x,y:p.y}));
     const [moved]=data.pins.splice(a,1);data.pins.splice(b,0,moved);
     data.pins.forEach((p,i)=>{p.x=slots[i].x;p.y=slots[i].y});
     unified()?.save?.(data);render();return;
    }
   }
   const all=ordered().map(x=>x.id),a=all.indexOf(from),b=all.indexOf(to);
  if(a<0||b<0||a===b)return;
  all.splice(b,0,all.splice(a,1)[0]);order=all;saveOrder();render();
 }
 function iconFor(x,location){
  const b=E('button',location==='dock'?'bc-sb-icon bc-sb-dock-icon':'bc-sb-icon');
  b.type='button';b.dataset.id=x.id;b.setAttribute('aria-label',x.label);b.title=x.label;
  const icon=E('span','bc-sb-app-art');
  const original=$('.app-icon',x.tile);
  if(original)for(const child of original.childNodes)icon.append(child.cloneNode(true));
  else icon.textContent=x.label.slice(0,1).toUpperCase();
  const label=E('span','bc-sb-app-label',x.label);
  b.append(icon,label);
  if(location==='dock')label.setAttribute('aria-hidden','true');
  if(location!=='dock'){
   b.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    pressed={id:x.id,x:e.clientX,y:e.clientY,moved:false,at:Date.now()};
    clearTimeout(longTimer);
    longTimer=setTimeout(()=>{if(pressed?.id===x.id&&!pressed.moved){suppressUntil=Date.now()+900;enterEdit()}},550);
   });
   b.addEventListener('pointermove',e=>{
    if(!pressed||pressed.id!==x.id)return;
    if(Math.hypot(e.clientX-pressed.x,e.clientY-pressed.y)>10){pressed.moved=true;clearTimeout(longTimer)}
   });
   b.addEventListener('pointercancel',()=>{pressed=null;clearTimeout(longTimer)});
   b.addEventListener('pointerup',()=>{pressed=null;clearTimeout(longTimer)});
  }
  b.addEventListener('click',()=>{
   if(Date.now()<suppressUntil)return;
   if(edit&&location!=='dock'){
    if(picked&&picked!==x.id){moveIcon(picked,x.id);picked=null}
    else{picked=picked===x.id?null:x.id;render()}
   }else if(!edit)safeLaunch(x.id);
  });
  if(edit&&location!=='dock'){b.classList.add('bc-sb-wiggle');if(picked===x.id)b.dataset.picked='true'}
  return b;
 }
 // A pinned App Store belongs on the actual home screen, never only in the Dock.
 function phoneHomePlacement(all,savedPins){
  const preferred=['chat','browser','personalphotos','files'];
  const storeOnHome=savedPins.includes('store')||(all.length===1&&all[0].id==='store');
  const dockAll=preferred.map(id=>all.find(x=>x.id===id)).filter(Boolean);
  for(const x of all){if(dockAll.length>=4)break;if(storeOnHome&&x.id==='store')continue;if(!dockAll.some(y=>y.id===x.id))dockAll.push(x)}
  const exclude=new Set(dockAll.map(x=>x.id));
  const allowedHomes=savedPins.length?new Set(savedPins):null;
  const homes=all.filter(x=>!exclude.has(x.id)&&(!allowedHomes||allowedHomes.has(x.id)));
  return {dockAll,homes};
 }
 function render(){
  if(shell.hidden)return;
  syncDockPreference();
  const all=ordered(), ids=all.map(x=>x.id);
  renderedIds=ids;
  sysCount.textContent=all.length+' available app'+(all.length===1?'':'s');
  const {dockAll,homes}=phoneHomePlacement(all,homePinned().map(x=>x.id));
  dockItems.replaceChildren(...dockAll.map(x=>iconFor(x,'dock')));
  const size=pageSize();
  const pages=Math.max(1,Math.ceil(homes.length/size));pageIndex=Math.min(pageIndex,pages-1);
  const chunk=homes.slice(pageIndex*size,(pageIndex+1)*size);
  grid.replaceChildren(...chunk.map(x=>iconFor(x,'home')));
  dots.replaceChildren();
  for(let i=0;i<pages;i++){
   const b=E('button','bc-sb-dot');b.type='button';b.setAttribute('aria-label','Home Screen page '+(i+1));
   b.setAttribute('aria-pressed',String(i===pageIndex));if(i===pageIndex)b.classList.add('selected');
   b.addEventListener('click',()=>{if(edit)leaveEdit();pageIndex=i;render()});dots.append(b);
  }
  page.setAttribute('aria-label','Home Screen page '+(pageIndex+1)+' of '+pages);
  if(modalOpen)drawResults();
 }
 function setPage(next){
  const {homes}=phoneHomePlacement(ordered(),homePinned().map(x=>x.id));
  const pages=Math.max(1,Math.ceil(homes.length/pageSize()));
  if(next>=pages){openModal('library');return}
  if(next<0)return;pageIndex=next;render();
 }
 function drawResults(){
  const all=ordered().slice().sort((a,b)=>a.label.localeCompare(b.label));
  const q=search.value.trim().toLocaleLowerCase();
  resultList.replaceChildren();
  const matches=all.filter(x=>!q||x.label.toLocaleLowerCase().includes(q));
  if(!matches.length){resultList.append(E('p','bc-sb-no-results','No installed applications match that search.'));return}
  for(const x of matches){
   const b=E('button','bc-sb-result');b.type='button';b.dataset.id=x.id;
   const art=E('span','bc-sb-result-icon'),copy=E('span','bc-sb-result-title',x.label),chev=E('span','bc-sb-result-chevron');
   const source=$('.app-icon',x.tile);if(source)for(const node of source.childNodes)art.append(node.cloneNode(true));
   chev.innerHTML=S(GLYPHS.chevron);b.append(art,copy,chev);
   b.addEventListener('click',()=>safeLaunch(x.id));
    const resultRow=E('div','bc-sb-result-row');resultRow.append(b);
    const added=pins().some(p=>p.id===x.id);
    const place=E('button','bc-sb-result-add',added?'On Home':'+ Home');
    place.type='button';place.disabled=added;
    place.setAttribute('aria-label',added?x.label+' is on your desktop':'Add '+x.label+' to your desktop on all devices');
    place.addEventListener('click',e=>{
     e.stopPropagation();
     if(added)return;
     window.dispatchEvent(new CustomEvent('blackcell:desktop-add-app',{detail:{id:x.id}}));
     drawResults();
    });
    resultRow.append(place);resultList.append(resultRow);
  }
 }
 function openModal(kind){
  if(shell.hidden)return;
  if(edit)leaveEdit();
  modalOpen=true;modal.hidden=false;root.classList.add('bc-sb-modal-open');
  returnFocus=document.activeElement;
  modalTitle.textContent=kind==='search'?'Search':'App Library';
  search.value='';drawResults();search.focus({preventScroll:true});
 }
 function closeModal(){
  if(!modalOpen)return;modalOpen=false;modal.hidden=true;root.classList.remove('bc-sb-modal-open');
  if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;
 }
 let touch=null;
 function swipeStart(e){if(edit||modalOpen||e.touches.length!==1)return;const p=e.touches[0];touch={x:p.clientX,y:p.clientY}}
 function swipeEnd(e){
  if(!touch||edit||modalOpen)return;
  const p=e.changedTouches[0],dx=p.clientX-touch.x,dy=p.clientY-touch.y;touch=null;
  if(dy>80&&Math.abs(dx)<Math.abs(dy)*.55){openModal('search');return}
  if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.25)setPage(pageIndex+(dx<0?1:-1));
 }
 home.addEventListener('touchstart',swipeStart,{passive:true});
 home.addEventListener('touchend',swipeEnd,{passive:true});
 searchTop.addEventListener('click',()=>openModal('search'));
 searchPill.addEventListener('click',()=>openModal('search'));
 library.addEventListener('click',()=>openModal('library'));
 lock.addEventListener('click',()=>$('#osLockButton',shell)?.click());
 editButton.addEventListener('click',leaveEdit);
 modalClose.addEventListener('click',closeModal);
 modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
 search.addEventListener('input',drawResults);
 root.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(modalOpen)closeModal();else if(edit)leaveEdit()}
  if(e.key==='Tab'&&modalOpen){
   const choices=$$('button:not(:disabled),input',modal).filter(x=>x.getClientRects().length);
   const first=choices[0],last=choices.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)clock()});
 window.addEventListener('focus',clock);
 window.addEventListener('resize',()=>{if(document.documentElement.classList.contains('bc-os-phone'))render()},{passive:true});
 window.addEventListener('blackcell:desktop-layout-updated',()=>{if(!shell.hidden)requestAnimationFrame(render)});
   const obs=new MutationObserver(()=>{if(!shell.hidden)requestAnimationFrame(render)});
 obs.observe(src,{childList:true,attributes:true,subtree:true,attributeFilter:['hidden','disabled','class']});
 obs.observe(shell,{attributes:true,attributeFilter:['hidden','class']});
 const member=$('#memberName',shell);if(member)obs.observe(member,{childList:true,characterData:true,subtree:true});
 clock();render();
 window.dispatchEvent(new Event('blackcell:springboard-ready'));
 const timer=setInterval(()=>{if(!shell.hidden)clock()},30000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();