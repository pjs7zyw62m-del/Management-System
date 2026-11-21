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
 let notificationsPanel=null;
 function closeNotifications(){notificationsPanel?.remove();notificationsPanel=null}
 function showNotifications(){
  if(!allowed())return;
  if(notificationsPanel){closeNotifications();return}
  closeControl();
  notificationsPanel=el('aside','bc-mac-notifications');
  notificationsPanel.setAttribute('role','dialog');
  notificationsPanel.setAttribute('aria-label','BLACKCELL Notification Center');
  const header=el('div','bc-mac-notifications-head');
  header.append(el('h3','','Notification Center'),
    action('Close',closeNotifications,'bc-mac-notifications-close'));
  notificationsPanel.append(header);
  const items=bridge()?.notifications?.()||[];
  if(!items.length)notificationsPanel.append(el('p','bc-mac-notifications-empty','No recent BLACKCELL OS notifications.'));
  else{
   const list=el('div','bc-mac-notifications-list');
   for(const note of items.slice(0,35)){
    const card=el('article','bc-mac-notification');
    const stamp=el('small','',new Date(note.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
    card.append(el('p','',note.message),stamp);list.append(card);
   }
   notificationsPanel.append(list,action('Clear Notifications',()=>{
    bridge()?.clearNotifications?.();closeNotifications();
   },'bc-mac-notifications-clear'));
  }
  shell.append(notificationsPanel);
 }

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
   button.append(art,el('span','bc-mac-app-name',app.title));
   const cell=el('div','bc-mac-launch-app-cell');
   const isSaved=window.BLACKCELL_OS_UNIFIED_LAYOUT?.read?.().pins?.some(x=>x.id===app.id);
   const pin=action(isSaved?'✓':'+',()=>{
    if(!isSaved)window.dispatchEvent(new CustomEvent('blackcell:desktop-add-app',{detail:{id:app.id}}));
    pin.textContent='✓';pin.setAttribute('aria-label',app.title+' saved to Desktop');
    pin.disabled=true;
   },'bc-mac-pin-shortcut');
   pin.title=isSaved?'Already on your Desktop':'Add '+app.title+' to Desktop on all devices';
   pin.setAttribute('aria-label',isSaved?app.title+' already on Desktop':'Add '+app.title+' to Desktop');
   pin.disabled=!!isSaved;cell.append(button,pin);grid.append(cell);
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
  const stage=action('Stage Manager',()=>{toggleStage();closeControl();showControl()},'bc-mac-switch');stage.setAttribute('aria-pressed',String(stageEnabled));control.append(stage);
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
  const clock=shell.querySelector('#clock');
  if(clock){
   clock.setAttribute('role','button');clock.tabIndex=0;
   clock.setAttribute('aria-label','Open Notification Center');
   clock.title='Notification Center';
   clock.addEventListener('click',showNotifications);
   clock.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();showNotifications()}
   });
  }
   const searchButton=action('⌕',openSpotlight,'bc-mac-spotlight-button');
  searchButton.title='BLACKCELL Spotlight';searchButton.setAttribute('aria-label','Open Spotlight Search');
  right.insertBefore(searchButton,controlButton);
  const dock=shell.querySelector('.dock');
  if(dock&&!dock.querySelector('.bc-mac-dock-launchpad')){
   const launch=action('▦',()=>begin('launchpad'),'bc-mac-dock-launchpad');
   launch.setAttribute('aria-label','Open BLACKCELL Applications');
   launch.title='Applications · Launchpad';launch.setAttribute('aria-haspopup','dialog');
   const home=dock.querySelector('#showDesktop');
   if(home?.nextSibling)dock.insertBefore(launch,home.nextSibling);else dock.prepend(launch);
  }
    document.addEventListener('pointerdown',e=>{
   if(control&&!control.contains(e.target)&&!controlButton.contains(e.target))closeControl();
   if(notificationsPanel&&!notificationsPanel.contains(e.target)&&!shell.querySelector('#clock')?.contains(e.target))closeNotifications();
  },{passive:true});
 }

 let spotlight=null,spotlightInput=null,spotlightList=null,spotlightFiles=[];
 function evalArithmetic(raw){
  if(!/^[0-9.\s()+*\/-]{1,64}$/.test(raw)||!/[+*/()-]/.test(raw))return null;
  const values=[],ops=[];let pending='',unary=true;
  const precedence=op=>op==='+'||op==='-'?1:2;
  const reduce=()=>{
   const op=ops.pop(),b=values.pop(),a=values.pop();
   if(!Number.isFinite(a)||!Number.isFinite(b))return false;
   const x=op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:b===0?NaN:a/b;
   if(!Number.isFinite(x))return false;values.push(x);return true;
  };
  const commit=()=>{
   if(!pending)return true;
   if(!/^-?(?:\d+\.?\d*|\.\d+)$/.test(pending))return false;
   values.push(Number(pending));pending='';unary=false;return true;
  };
  for(const ch of raw.replace(/\s+/g,'')){
   if(/[\d.]/.test(ch)){pending+=ch;unary=false;continue}
   if(ch==='-'&&unary){pending='-';continue}
   if(!commit())return null;
   if(ch==='('){ops.push(ch);unary=true;continue}
   if(ch===')'){while(ops.length&&ops.at(-1)!=='(')if(!reduce())return null;if(ops.pop()!=='(')return null;continue}
   if(!'+-*/'.includes(ch))return null;
   while(ops.length&&ops.at(-1)!=='('&&precedence(ops.at(-1))>=precedence(ch))if(!reduce())return null;
   ops.push(ch);unary=true;
  }
  if(!commit())return null;
  while(ops.length){if(ops.at(-1)==='('||!reduce())return null}
  return values.length===1?Number(values[0].toPrecision(10)):null;
 }
 function closeSpotlight(){spotlight?.remove();spotlight=null;spotlightInput=null;spotlightList=null;spotlightFiles=[]}
 function renderSpotlight(){
  if(!spotlight||!spotlightInput)return;
  const q=spotlightInput.value.trim().toLowerCase();spotlightList.replaceChildren();
  if(!q){spotlightList.append(el('p','bc-mac-empty','Find apps or calculate an expression.'));return}
  const value=evalArithmetic(q);
  if(value!==null){
   const item=action(q+' = '+String(value),()=>{navigator.clipboard?.writeText(String(value));closeSpotlight()},'bc-mac-spotlight-result');
   item.title='Copy calculated result';spotlightList.append(item);
  }
  for(const app of getApps().filter(a=>a.title.toLowerCase().includes(q)||a.id.toLowerCase().includes(q)).slice(0,8)){
   const item=action(app.title,()=>{closeSpotlight();if(!app.tile.hidden&&!app.tile.disabled)app.tile.click()},'bc-mac-spotlight-result');
   spotlightList.append(item);
  }
  for(const file of spotlightFiles.filter(f=>f.name.toLowerCase().includes(q)).slice(0,6)){
   const item=action('Desktop · '+file.name,()=>{closeSpotlight();bridge()?.openDesktopFiles()},'bc-mac-spotlight-result');
   item.title='Open the Desktop folder in BLACKCELL Files';spotlightList.append(item);
  }
  if(!spotlightList.children.length)spotlightList.append(el('p','bc-mac-empty','No matching applications or Desktop files.'));
 }
 function openSpotlight(){
  if(!allowed()||bridge()?.isPhone())return;
  if(spotlight){spotlightInput?.focus();return}
  dismiss();closeControl();spotlight=el('section','bc-mac-spotlight');
  spotlight.setAttribute('role','dialog');spotlight.setAttribute('aria-modal','true');
  spotlight.setAttribute('aria-label','BLACKCELL Spotlight Search');
  const inner=el('div','bc-mac-spotlight-panel');
  spotlightInput=el('input');spotlightInput.type='search';spotlightInput.autocomplete='off';
  spotlightInput.setAttribute('aria-label','Search installed applications or calculate');
  spotlightInput.placeholder='Search BLACKCELL…';
  spotlightList=el('div','bc-mac-spotlight-results');
  spotlightInput.addEventListener('input',renderSpotlight);
  spotlightInput.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();closeSpotlight()}
   if(e.key==='Enter'&&spotlightList.querySelector('button')){e.preventDefault();spotlightList.querySelector('button').click()}
  });
  inner.append(spotlightInput,spotlightList);spotlight.append(inner);shell.append(spotlight);
  spotlight.addEventListener('pointerdown',e=>{if(e.target===spotlight)closeSpotlight()});
  spotlightFiles=[];renderSpotlight();spotlightInput.focus();
  const ref=spotlight;
  if(bridge()?.listDesktopFiles)void bridge().listDesktopFiles().then(items=>{
   if(ref===spotlight){spotlightFiles=Array.isArray(items)?items:[];renderSpotlight()}
  }).catch(()=>{});

 }
 let stageEnabled=false,stageRail=null;
 function stageSync(){
  if(!stageEnabled||!allowed()){shell.classList.remove('bc-stage-manager');shell.querySelectorAll('.os-window.bc-stage-background').forEach(n=>n.classList.remove('bc-stage-background'));stageRail?.remove();stageRail=null;return}
  const state=bridge()?.windows()||[];
  shell.classList.add('bc-stage-manager');
  if(!stageRail){stageRail=el('nav','bc-mac-stage-rail');stageRail.setAttribute('aria-label','Stage Manager windows');shell.append(stageRail)}
  stageRail.replaceChildren();
  for(const item of state){
   const element=[...shell.querySelectorAll('.os-window')].find(n=>n.dataset.osApp===item.id);
   if(!element||element.hidden||item.minimized||element.classList.contains('bc-os-fullscreen')){element?.classList.remove('bc-stage-background');continue}
   element.classList.toggle('bc-stage-background',!item.active);
   if(item.active)continue;
   const button=action(item.title,()=>bridge().focusWindow(item.id),'bc-mac-stage-thumb');
   button.title='Switch to '+item.title;stageRail.append(button);
  }
 }
 function toggleStage(){
  stageEnabled=!stageEnabled;stageSync();
  return stageEnabled;
 }
 function renderDesktopCanvas(){
  if(!allowed()||bridge()?.isPhone())return;
  let desktop=shell.querySelector('.bc-mac-desktop-canvas');
  if(!desktop){
   desktop=el('section','bc-mac-desktop-canvas');
   desktop.setAttribute('aria-label','BLACKCELL Desktop folder');
   const heading=el('div','bc-mac-desktop-caption','DESKTOP');
   const contents=el('div','bc-mac-desktop-items');
   desktop.append(heading,contents);shell.querySelector('.workspace')?.append(desktop);
   desktop.addEventListener('contextmenu',e=>{
    if(e.target.closest('.bc-mac-desktop-item'))return;
    e.preventDefault();
    const stacks=!desktop.classList.contains('bc-mac-desktop-stacks');
    desktop.classList.toggle('bc-mac-desktop-stacks',stacks);
    desktop.setAttribute('aria-label',stacks?'BLACKCELL Desktop folder (Stacks)':'BLACKCELL Desktop folder');
    desktop.dataset.expandedStack='';renderDesktopCanvas();
   });
  }
  const list=desktop.querySelector('.bc-mac-desktop-items');
  const view=items=>{
   if(!list.isConnected)return;
   list.replaceChildren();
   const folder=action('Desktop',()=>bridge()?.openDesktopFiles(),'bc-mac-desktop-item bc-mac-desktop-folder');
   folder.prepend(el('span','bc-mac-desktop-file-icon','▣'));
   folder.setAttribute('aria-label','Open Desktop folder in BLACKCELL Files');
   list.append(folder);
   const fileIcon=file=>file.folder?'▣':/\\.(jpe?g|png|webp|gif|heic|avif)$/i.test(file.name)?'▧':/\\.pdf$/i.test(file.name)?'▤':'▤';
   const groupOf=file=>file.folder?'Folders':/\\.(jpe?g|png|webp|gif|heic|avif)$/i.test(file.name)?'Images':/\\.pdf$/i.test(file.name)?'PDFs':'Documents';
   const addFile=file=>{
    const item=action(file.name,()=>bridge()?.openDesktopFiles(),'bc-mac-desktop-item');
    item.setAttribute('aria-label','Open '+file.name+' in BLACKCELL Files');
    item.prepend(el('span','bc-mac-desktop-file-icon',fileIcon(file)));
    item.dataset.group=groupOf(file);
    list.append(item);
   };
   if(desktop.classList.contains('bc-mac-desktop-stacks')){
    const groups=new Map();
    for(const file of items){const group=groupOf(file);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(file)}
    for(const [name,files] of groups){
     const button=action(name+' ('+files.length+')',()=>{
      desktop.dataset.expandedStack=desktop.dataset.expandedStack===name?'':name;
      view(items);
     },'bc-mac-desktop-item bc-mac-stack');
     button.setAttribute('aria-expanded',String(desktop.dataset.expandedStack===name));
     button.prepend(el('span','bc-mac-desktop-file-icon','▦'));list.append(button);
     if(desktop.dataset.expandedStack===name)for(const file of files)addFile(file);
    }
   }else for(const file of items)addFile(file);
  };
  view([]);
  if(!bridge()?.listDesktopFiles)return;
  void bridge().listDesktopFiles().then(view).catch(()=>{});
 }
 function keybind(e){
  if(!allowed()||e.target.closest?.('input,textarea,[contenteditable]'))return;
  const ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&e.key===' '){e.preventDefault();openSpotlight();return}
  if(ctrl&&e.key==='Tab'&&!e.altKey){const visible=bridge()?.windows().filter(w=>!w.minimized)||[];if(visible.length>1){e.preventDefault();const i=visible.findIndex(w=>w.active);bridge().focusWindow(visible[(i+1)%visible.length].id)}return}
  if(ctrl&&(e.key==='\`'||e.key==='~')){const list=bridge()?.windows().filter(w=>!w.minimized)||[];if(list.length>1){e.preventDefault();const i=list.findIndex(w=>w.active);bridge().focusWindow(list[(i+1)%list.length].id)}return}
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
 window.addEventListener('blackcell:notification',()=>{
  if(notificationsPanel){closeNotifications();showNotifications()}
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&notificationsPanel){e.preventDefault();closeNotifications()}
 });
  window.addEventListener('blackcell:spotlight-open',openSpotlight);
 window.addEventListener('blackcell:stage-toggle',()=>{toggleStage();stageSync()});
 window.addEventListener('blackcell:desktop-files-refresh',renderDesktopCanvas);
 window.addEventListener('bc-private-files-changed',renderDesktopCanvas);
 window.addEventListener('blackcell:spaces-updated',stageSync);
 window.addEventListener('blackcell:windows-updated',()=>{stageSync();if(kind==='mission')renderMission()});
 window.addEventListener('blackcell:mac-shell-ready',renderDesktopCanvas);
 const stageObserver=new MutationObserver(stageSync);
 stageObserver.observe(shell,{childList:true,subtree:false});
  window.addEventListener('blackcell:launchpad-open',()=>begin('launchpad'));
 window.addEventListener('blackcell:mission-open',()=>begin('mission'));
 window.addEventListener('blackcell:spaces-updated',()=>{if(kind==='mission')renderMission()});
 window.addEventListener('resize',()=>{if(kind==='launchpad')renderLaunchpad()},{passive:true});
 document.addEventListener('keydown',keybind);
 document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)shell.classList.remove('bc-os-menu-edge-open')});
 shell.addEventListener('pointermove',e=>{
  if(shell.classList.contains('bc-os-fullscreen-active')){
   shell.classList.toggle('bc-os-menu-edge-open',e.clientY<9);
   shell.classList.toggle('bc-os-dock-edge-open',e.clientY>window.innerHeight-12);
  }
 },{passive:true});
 controls();
 const renderWhenReady=()=>{if(allowed())renderDesktopCanvas()};
 window.addEventListener('blackcell:desktop-ready',renderWhenReady);
 setTimeout(renderWhenReady,1200);
})();
