/* BLACKCELL OS Mac workspace UI: Launchpad, Mission Control, and Control Center.
   Runs entirely within the existing authenticated shell and reuses the original
   app tiles/window controller. No permissions are granted by this presentation. */
(()=>{
 'use strict';
 const shell=document.getElementById('desktop');
 if(!shell)return;
 const bridge=()=>window.BLACKCELL_MAC_BRIDGE;
 const allowed=()=>!shell.hidden&&!!bridge()?.ready();
 const el=(tag,cls,text)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(text!==undefined)n.textContent=text;return n;
 };
 const action=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b};
 let overlay=null,lastFocus=null,page=0,query='',kind='',grid=null,head=null,subtitle=null,back=null,next=null;
 let control=null,controlButton=null;
 const getApps=()=>{
  const apps=new Map();
  for(const tile of shell.querySelectorAll('.workspace .apps .app[data-app]')){
   if(tile.hidden||tile.disabled||tile.dataset.app==='')continue;
   if(!apps.has(tile.dataset.app))apps.set(tile.dataset.app,{
    id:tile.dataset.app,title:tile.dataset.title||tile.dataset.app,tile
   });
  }
  return [...apps.values()].sort((a,b)=>a.title.localeCompare(b.title));
 };
 const size=()=>window.innerWidth>=1250?30:window.innerWidth>=860?24:window.innerWidth>=621?16:12;
 function dismiss(){
  overlay?.remove();overlay=null;kind='';page=0;query='';
  document.removeEventListener('keydown',modalKeys,true);
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});lastFocus=null;
 }
 function modalKeys(e){
  if(!overlay)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();return}
  if(e.key==='Tab'){
   const buttons=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')]
    .filter(b=>b.offsetParent!==null);
   if(!buttons.length)return;
   const first=buttons[0],last=buttons.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 }
 function begin(type){
  if(!allowed()||bridge()?.isPhone())return;
  if(overlay&&kind===type){dismiss();return}
  dismiss();kind=type;page=0;query='';lastFocus=document.activeElement;
  overlay=el('section','bc-mac-overlay bc-mac-'+type);
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label',type==='launchpad'?'BLACKCELL Applications':'BLACKCELL Mission Control');
  const shade=el('button','bc-mac-shade');shade.type='button';shade.setAttribute('aria-label','Close '+type);
  shade.addEventListener('click',dismiss);
  const panel=el('div','bc-mac-panel'),heading=el('header','bc-mac-overlay-heading');
  const close=action('×',dismiss,'bc-mac-close');close.setAttribute('aria-label','Close '+type);
  head=el('h2','',type==='launchpad'?'Applications':'Mission Control');
  subtitle=el('p','bc-mac-subtitle',type==='launchpad'?'Your BLACKCELL applications':'Your open windows, organized');
  heading.append(head,subtitle,close);panel.append(heading);
  const body=el('div','bc-mac-panel-body');
  if(type==='launchpad'){
   const field=el('input','bc-mac-search');field.type='search';field.autocomplete='off';
   field.placeholder='Search your applications';field.setAttribute('aria-label','Search installed applications');
   field.addEventListener('input',()=>{query=field.value.toLowerCase().trim();page=0;renderLaunchpad()});
   panel.append(field);
   grid=el('div','bc-mac-launch-grid');body.append(grid);
   const paging=el('div','bc-mac-paging');
   back=action('‹ Previous',()=>{page--;renderLaunchpad()},'bc-mac-page-button');
   next=action('Next ›',()=>{page++;renderLaunchpad()},'bc-mac-page-button');
   paging.append(back,el('span','bc-mac-page-status'),next);panel.append(body,paging);
  }else{grid=el('div','bc-mac-mission-body');body.append(grid);panel.append(body)}
  overlay.append(shade,panel);shell.append(overlay);
  document.addEventListener('keydown',modalKeys,true);
  if(type==='launchpad'){renderLaunchpad();panel.querySelector('.bc-mac-search').focus()}
  else{renderMission();close.focus()}
 }
 function renderLaunchpad(){
  if(!overlay||kind!=='launchpad')return;
  const apps=getApps().filter(a=>a.title.toLowerCase().includes(query)||a.id.toLowerCase().includes(query));
  const per=size(),total=Math.max(1,Math.ceil(apps.length/per));page=Math.min(Math.max(0,page),total-1);
  grid.replaceChildren();
  for(const app of apps.slice(page*per,(page+1)*per)){
   const button=action('',()=>{dismiss();if(!app.tile.hidden&&!app.tile.disabled)app.tile.click()},'bc-mac-app');
   button.setAttribute('aria-label','Open '+app.title);
   const icon=app.tile.querySelector('.app-icon'),art=el('span','bc-mac-app-art');
   if(icon)art.append(icon.cloneNode(true));else art.textContent='◈';
   button.append(art,el('span','bc-mac-app-name',app.title));grid.append(button);
  }
  if(!apps.length)grid.append(el('p','bc-mac-empty','No installed applications match your search.'));
  const status=overlay.querySelector('.bc-mac-page-status');
  if(status)status.textContent=total===1?'':('Page '+(page+1)+' of '+total);
  back.disabled=page===0;next.disabled=page>=total-1;
 }
 function renderMission(){
  if(!overlay||kind!=='mission')return;
  const controller=bridge();if(!controller)return;
  const state=controller.spaces(),all=controller.windows();
  grid.replaceChildren();
  const toolbar=el('div','bc-mac-spaces');
  for(const sp of state.items){
   const selected=sp.id===state.active;
   const b=action(sp.name,()=>{controller.switchSpace(sp.id);renderMission()},'bc-mac-space'+(selected?' active':''));
   b.setAttribute('aria-current',String(selected));
   toolbar.append(b);
  }
  const create=action('+ Desktop',()=>{const id=controller.addSpace();if(id){controller.switchSpace(id);renderMission()}},'bc-mac-newspace');
  create.disabled=state.items.length>=6;toolbar.append(create);
  grid.append(toolbar);
  const group=el('div','bc-mac-window-grid');
  for(const w of all){
   const card=el('article','bc-mac-window');
   const icon=el('div','bc-mac-window-icon','▣');
   const title=el('strong','',w.title||w.id);
   const info=el('small','',state.items.find(x=>x.id===w.spaceId)?.name||'Desktop 1');
   const focus=action('Open',()=>{controller.focusWindow(w.id);dismiss()},'bc-mac-window-open');
   const move=el('select','bc-mac-window-move');move.setAttribute('aria-label','Move '+w.title+' to desktop');
   for(const sp of state.items){const option=el('option','',sp.name);option.value=sp.id;move.append(option)}
   move.value=w.spaceId;
   move.addEventListener('change',()=>{controller.moveWindow(w.id,move.value);renderMission()});
   card.append(icon,title,info,focus,move);group.append(card);
  }
  if(!all.length)group.append(el('p','bc-mac-empty','No open windows. Open an application from Launchpad or the Dock.'));
  grid.append(group);
  const footer=el('div','bc-mac-mission-footer');
  footer.append(action('Rename Desktop',()=>{
   const current=controller.spaces().active,initial=controller.spaces().items.find(s=>s.id===current)?.name||'Desktop';
   const value=prompt('Rename desktop (36 characters maximum)',initial);
   if(value!==null&&controller.renameSpace(current,value))renderMission();
  }));
  footer.append(action('Remove Current Desktop',()=>{
   const current=controller.spaces().active;
   if(current==='1')return;
   if(confirm('Remove this desktop? Its windows will move to Desktop 1.')){controller.removeSpace(current);renderMission()}
  }));
  footer.lastElementChild.disabled=state.active==='1';
  grid.append(footer);
 }
 function closeControl(){control?.remove();control=null;controlButton?.setAttribute('aria-expanded','false')}
 function showControl(){
  if(!allowed())return;
  if(control){closeControl();return}
  control=el('aside','bc-mac-control');
  control.setAttribute('role','dialog');control.setAttribute('aria-label','BLACKCELL Control Center');
  const title=el('h3','','Control Center');
  const status=el('small','',navigator.onLine?'Connected':'Offline');
  const prefs=bridge()?.preferences()||{};
  const toggle=(name,key,val)=>{
   const row=action('',()=>{const next=bridge()?.setPreference(key,!val);if(next?.ok!==false){closeControl();showControl()}},'bc-mac-switch');
   row.textContent=name;row.setAttribute('aria-pressed',String(val));
   control.append(row);
  };
  control.append(title,status);
  toggle('Automatically hide Dock','dockAutoHide',prefs.dockAutoHide);
  toggle('Clean Desktop','desktopClean',prefs.desktopClean);
  control.append(action('Wallpaper & Appearance',()=>{closeControl();bridge()?.openSettings('appearance')},'bc-mac-control-link'));
  control.append(action('Lock Workspace',()=>{closeControl();bridge()?.lock()},'bc-mac-control-link'));
  shell.append(control);controlButton?.setAttribute('aria-expanded','true');
 }
 function controls(){
  const right=shell.querySelector('.topright');if(!right||right.querySelector('.bc-mac-control-button'))return;
  controlButton=action('◫',()=>{},'bc-mac-control-button');
  controlButton.title='BLACKCELL Control Center';controlButton.setAttribute('aria-label','Open Control Center');
  controlButton.setAttribute('aria-haspopup','dialog');controlButton.setAttribute('aria-expanded','false');
  controlButton.addEventListener('click',showControl);right.insertBefore(controlButton,right.firstChild);
  document.addEventListener('pointerdown',e=>{
   if(control&&!control.contains(e.target)&&!controlButton.contains(e.target))closeControl();
  },{passive:true});
 }
 function keybind(e){
  if(!allowed()||e.target.closest?.('input,textarea,[contenteditable]'))return;
  const ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&e.altKey&&e.key==='Tab'){e.preventDefault();begin('mission');return}
  if(ctrl&&e.key==='ArrowUp'){e.preventDefault();begin('mission');return}
  if(ctrl&&(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!overlay){
   e.preventDefault();
   const state=bridge()?.spaces();if(!state)return;
   const i=state.items.findIndex(s=>s.id===state.active);
   const dest=state.items[i+(e.key==='ArrowLeft'?-1:1)];if(dest)bridge().switchSpace(dest.id);
  }
  if(e.key==='F3'){e.preventDefault();begin('mission')}
 }
 window.addEventListener('blackcell:launchpad-open',()=>begin('launchpad'));
 window.addEventListener('blackcell:mission-open',()=>begin('mission'));
 window.addEventListener('blackcell:spaces-updated',()=>{if(kind==='mission')renderMission()});
 window.addEventListener('resize',()=>{if(kind==='launchpad')renderLaunchpad()},{passive:true});
 document.addEventListener('keydown',keybind);
 document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)shell.classList.remove('bc-os-menu-edge-open')});
 shell.addEventListener('pointermove',e=>{
  if(shell.classList.contains('bc-os-fullscreen-active'))shell.classList.toggle('bc-os-menu-edge-open',e.clientY<7);
 },{passive:true});
 controls();
})();
