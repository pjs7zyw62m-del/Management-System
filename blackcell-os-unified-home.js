/* BLACKCELL OS Unified Home — one account-synced app/widget layout on computer, tablet and phone.
   Interactive positions are normalized to the current display; edits are persisted
   through the existing authenticated OS workspace preference API. */
(()=>{
 'use strict';
 const shell=document.getElementById('desktop');
 if(!shell)return;
 const service=()=>window.BLACKCELL_OS_UNIFIED_LAYOUT;
 const widgets={
  clock:{title:'Clock',description:'Your current local time',symbol:'◷'},
  calendar:{title:'Calendar',description:'Today and the current date',symbol:'▦'},
  applications:{title:'Applications',description:'Installed apps at a glance',symbol:'▤'},
  session:{title:'Session',description:'Your BLACKCELL session status',symbol:'◆'}
 };
 let layer=null,menu=null,gallery=null,phoneButton=null,clockTimer=0,lastAccount=null,renderQueued=false;
 let drag=null,suppressClickUntil=0;
 const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
 const create=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 const makeButton=(text,callback,cls)=>{
  const b=create('button',cls||'',text);b.type='button';b.addEventListener('click',callback);return b;
 };
 const accountReady=()=>!!service()?.ready()&&!shell.hidden;
 const snap=()=>service()?.read()||{pins:[],widgets:[],changedAt:0};
 const available=()=>service()?.available()||[];
 const readApp=id=>document.querySelector('#desktop .workspace .apps .app[data-app="'+id+'"]');
 function titleFor(id){return available().find(x=>x.id===id)?.title||id}
 function iconFor(id){
  const original=readApp(id)?.querySelector('.app-icon');
  const icon=create('span','bc-home-app-icon');
  if(original)for(const child of original.childNodes)icon.append(child.cloneNode(true));
  else icon.textContent='◈';
  return icon;
 }
 function write(state,message){
  const response=service()?.save?.(state)||{ok:false,message:'Desktop layout could not be saved.'};
  if(message)showNotice(response.ok&&response.message?.includes('Saved on this device')?response.message:(response.ok?message:response.message));
  return response;
 }
 function showNotice(text){
  let node=shell.querySelector('.bc-home-layout-notice');
  if(!node){node=create('div','bc-home-layout-notice');node.setAttribute('role','status');shell.append(node)}
  node.textContent=text;node.hidden=false;
  clearTimeout(showNotice.timeout);
  showNotice.timeout=setTimeout(()=>{node.hidden=true},4200);
 }
 function positionInitial(type,existing){
  const n=existing.length;
  if(type==='pin')return {x:clamp(.11+(n%6)*.115),y:clamp(.18+Math.floor(n/6)*.14)};
  return {x:clamp(.05+(n%3)*.21),y:clamp(.14+Math.floor(n/3)*.23)};
 }
 function addApp(id){
  if(!accountReady()||!available().some(x=>x.id===id))return;
  const data=snap();if(data.pins.some(x=>x.id===id))return showNotice('That app is already on your desktop.');
  const pos=positionInitial('pin',data.pins);
  data.pins.push({id,...pos});
  const result=write(data,titleFor(id)+' added to Desktop. Synchronizing…');
  if(result.ok)closeGallery();
 }
 function removeApp(id){
  const data=snap();data.pins=data.pins.filter(x=>x.id!==id);
  write(data,titleFor(id)+' removed from Desktop. App data remains safe. Synchronizing…');
 }
 function addWidget(id){
  if(!accountReady()||!Object.hasOwn(widgets,id))return;
  const data=snap();if(data.widgets.some(x=>x.id===id))return showNotice('This widget is already on your desktop.');
  const pos=positionInitial('widget',data.widgets);
  data.widgets.push({id,...pos,size:'medium'});
  const result=write(data,widgets[id].title+' widget added. Synchronizing…');
  if(result.ok)closeGallery();
 }
 function removeWidget(id){
  const data=snap();data.widgets=data.widgets.filter(x=>x.id!==id);
  write(data,widgets[id].title+' widget removed. Synchronizing…');
 }
 function resizeWidget(id){
  const data=snap(),item=data.widgets.find(x=>x.id===id);if(!item)return;
  const sizes=['small','medium','large'];
  item.size=sizes[(sizes.indexOf(item.size)+1)%sizes.length];
  write(data,widgets[id].title+' resized.');
 }
 function reorderPhone(id,target,isWidget=false){
  const data=snap(),key=isWidget?'widgets':'pins',arr=data[key],i=arr.findIndex(x=>x.id===id),j=arr.findIndex(x=>x.id===target);
  if(i<0||j<0||i===j)return;
  const originalSlots=arr.map(v=>({x:v.x,y:v.y}));
  const [moved]=arr.splice(i,1);arr.splice(j,0,moved);
  arr.forEach((v,n)=>{v.x=originalSlots[n].x;v.y=originalSlots[n].y});
  write(data);
 }
 function closeMenu(){menu?.remove();menu=null}
 function popupAt(x,y,choices){
  closeMenu();
  menu=create('div','bc-home-context-menu');
  menu.setAttribute('role','menu');
  for(const [name,fn] of choices){
   const b=makeButton(name,()=>{closeMenu();fn()},'bc-home-menu-choice');
   b.setAttribute('role','menuitem');menu.append(b);
  }
  shell.append(menu);
  const r=menu.getBoundingClientRect();
  menu.style.left=Math.min(Math.max(8,x),window.innerWidth-r.width-8)+'px';
  menu.style.top=Math.min(Math.max(34,y),window.innerHeight-r.height-8)+'px';
  menu.querySelector('button')?.focus({preventScroll:true});
 }
 function closeGallery(){gallery?.remove();gallery=null}
 function showGallery(type){
  if(!accountReady())return;
  closeMenu();closeGallery();
  gallery=create('div','bc-home-gallery-shell');
  gallery.setAttribute('role','dialog');gallery.setAttribute('aria-modal','true');
  gallery.setAttribute('aria-label',type==='apps'?'Add desktop apps':'Add desktop widgets');
  const shade=makeButton('',closeGallery,'bc-home-gallery-shade');shade.setAttribute('aria-label','Close gallery');
  const panel=create('div','bc-home-gallery');
  const header=create('header','bc-home-gallery-header');
  const name=create('h2','',type==='apps'?'Add Applications':'Widget Gallery');
  const close=makeButton('×',closeGallery,'bc-home-gallery-close');close.setAttribute('aria-label','Close gallery');
  header.append(name,close);
  const intro=create('p','',type==='apps'
   ?'Choose the apps to keep on your desktop. They appear on your computer, tablet and phone.'
   :'Add widgets to your desktop, then drag or resize them. Your selections sync to all devices.');
  const grid=create('div','bc-home-gallery-grid');
  const state=snap();
  if(type==='apps'){
   for(const app of available()){
    const added=state.pins.some(p=>p.id===app.id);
    const row=create('div','bc-home-gallery-option');
    row.append(iconFor(app.id),create('span','bc-home-gallery-name',app.title),
     makeButton(added?'Remove':'Add',()=>{added?removeApp(app.id):addApp(app.id);showGallery('apps')},'bc-home-gallery-toggle'));
    grid.append(row);
   }
  }else for(const [id,w] of Object.entries(widgets)){
   const added=state.widgets.some(item=>item.id===id);
   const row=create('div','bc-home-gallery-option');
   row.append(create('span','bc-home-gallery-symbol',w.symbol));
   const info=create('div','bc-home-gallery-info');
   info.append(create('strong','',w.title),create('small','',w.description));
   row.append(info,makeButton(added?'Remove':'Add',()=>{added?removeWidget(id):addWidget(id);showGallery('widgets')},'bc-home-gallery-toggle'));
   grid.append(row);
  }
  const hint=create('p','bc-home-gallery-hint','Changes are saved to your BLACKCELL account. Positions adapt to each screen.');
  panel.append(header,intro,grid,hint);gallery.append(shade,panel);shell.append(gallery);
  gallery.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeGallery()}});
  close.focus({preventScroll:true});
 }
 function updateLiveValues(root){
  const now=new Date();
  for(const el of root.querySelectorAll('[data-home-widget-value]')){
   const kind=el.dataset.homeWidgetValue;
   if(kind==='clock')el.textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(now);
   else if(kind==='calendar')el.textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(now);
   else if(kind==='applications')el.textContent=String(available().length)+' installed apps';
   else if(kind==='session')el.textContent=document.querySelector('#topStatus')?.textContent?.trim()||'Verified workspace';
  }
 }
 function widgetCard(info,compact=false){
  const w=widgets[info.id];
  const card=create('section','bc-home-widget bc-home-widget-'+info.id+(compact?' bc-home-phone-widget':''));
  card.dataset.widget=info.id;card.dataset.size=info.size||'medium';
  const title=create('span','bc-home-widget-name',w.title);
  const display=create('strong','bc-home-widget-value');
  display.dataset.homeWidgetValue=info.id;
  const actions=create('div','bc-home-widget-actions');
  const edit=makeButton('⋯',()=>showGallery('widgets'),'bc-home-widget-manage');
  edit.setAttribute('aria-label','Manage widgets');
  if(!compact){
   const resize=makeButton('⤢',()=>resizeWidget(info.id),'bc-home-widget-resize');
   resize.title='Resize widget';resize.setAttribute('aria-label','Resize '+w.title+' widget');
   const remove=makeButton('×',()=>removeWidget(info.id),'bc-home-widget-remove');
   remove.title='Remove widget';remove.setAttribute('aria-label','Remove '+w.title+' widget');
   actions.append(resize,remove);
  }else{
   const menuOpen=makeButton('⋯',()=>{
    const all=snap().widgets,index=all.findIndex(x=>x.id===info.id),r=menuOpen.getBoundingClientRect();
    popupAt(r.left,r.bottom+5,[
     ['Move Earlier',()=>{if(index>0)reorderPhone(info.id,all[index-1].id,true)}],
     ['Move Later',()=>{if(index>=0&&index<all.length-1)reorderPhone(info.id,all[index+1].id,true)}],
     ['Resize Widget',()=>resizeWidget(info.id)],
     ['Remove Widget',()=>removeWidget(info.id)],
     ['Widget Gallery…',()=>showGallery('widgets')]
    ]);
   },'bc-home-widget-manage');
   menuOpen.setAttribute('aria-label','Arrange '+w.title+' widget');
   actions.append(menuOpen);
  }
  const header=create('header','bc-home-widget-header');header.append(title,actions);
  card.append(header,display);
  updateLiveValues(card);return card;
 }
 function attachDrag(element,id,type){
  const handle=type==='widget'?element.querySelector('.bc-home-widget-header'):element;
  if(!handle)return;
  let origin=null;
  handle.addEventListener('pointerdown',e=>{
   // Desktop app shortcuts ARE buttons; only ignore nested widget controls.
   // The previous unconditional closest('button') rejected every app drag.
   if(e.button!==0||(type==='widget'&&e.target.closest('button'))||!accountReady()||!!gallery)return;
   const item=snap()[type==='widget'?'widgets':'pins'].find(p=>p.id===id);
   if(!item)return;
   const rect=element.getBoundingClientRect(),host=layer.getBoundingClientRect();
   origin={pointer:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left-host.left,top:rect.top-host.top,moved:false,host};
   try{handle.setPointerCapture(e.pointerId)}catch(_){}
  });
  handle.addEventListener('pointermove',e=>{
   if(!origin||e.pointerId!==origin.pointer)return;
   const dx=e.clientX-origin.x,dy=e.clientY-origin.y;
   if(!origin.moved&&Math.hypot(dx,dy)<7)return;
   origin.moved=true;
   element.classList.add('bc-home-dragging');
   const maxX=Math.max(0,origin.host.width-element.offsetWidth);
   const maxY=Math.max(0,origin.host.height-element.offsetHeight);
   element.style.left=Math.max(0,Math.min(maxX,origin.left+dx))+'px';
   element.style.top=Math.max(0,Math.min(maxY,origin.top+dy))+'px';
   e.preventDefault();
  });
  function end(e){
   if(!origin||e.pointerId!==origin.pointer)return;
   const moved=origin.moved;origin=null;
   try{handle.releasePointerCapture(e.pointerId)}catch(_){}
   element.classList.remove('bc-home-dragging');
   if(!moved)return;
   suppressClickUntil=Date.now()+300;
   const data=snap(),item=data[type==='widget'?'widgets':'pins'].find(p=>p.id===id);
   if(!item)return;
   item.x=clamp((parseFloat(element.style.left)||0)/Math.max(1,layer.clientWidth-element.offsetWidth));
   item.y=clamp((parseFloat(element.style.top)||0)/Math.max(1,layer.clientHeight-element.offsetHeight));
   write(data,'Desktop position saved for all your devices.');
  }
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  handle.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||!e.altKey)return;
   e.preventDefault();const data=snap(),item=data[type==='widget'?'widgets':'pins'].find(p=>p.id===id);
   if(!item)return;
   const step=e.shiftKey?.08:.02;
   item.x=clamp(item.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0));
   item.y=clamp(item.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0));write(data);
  });
 }
 function ensureLayer(){
  if(layer?.isConnected)return layer;
  const work=shell.querySelector('.workspace');if(!work)return null;
  layer=create('section','bc-unified-home-layer');layer.setAttribute('aria-label','Movable desktop shortcuts and widgets');
  work.append(layer);
  return layer;
 }
 function desktopItemPosition(element,p){
  const w=Math.max(1,layer.clientWidth-element.offsetWidth),h=Math.max(1,layer.clientHeight-element.offsetHeight);
  element.style.left=Math.round(clamp(p.x)*w)+'px';
  element.style.top=Math.round(clamp(p.y)*h)+'px';
 }
 function renderDesktop(){
  if(!ensureLayer())return;
  layer.replaceChildren();
  const data=snap();const seen=new Set();let visiblePinCount=0;
  for(const p of data.pins){
   if(seen.has(p.id)||!available().some(x=>x.id===p.id))continue;seen.add(p.id);
   const b=makeButton('',()=>{
    if(Date.now()<suppressClickUntil)return;
    service()?.launch?.(p.id);
   },'bc-home-desktop-app');b.dataset.id=p.id;b.title=titleFor(p.id);
   b.append(iconFor(p.id),create('span','bc-home-desktop-label',titleFor(p.id)));
   b.addEventListener('contextmenu',e=>{
    e.preventDefault();popupAt(e.clientX,e.clientY,[
     ['Open '+titleFor(p.id),()=>service()?.launch?.(p.id)],
     ['Remove from Desktop',()=>removeApp(p.id)],
     ['Add Applications…',()=>showGallery('apps')]]);});
   layer.append(b);visiblePinCount++;desktopItemPosition(b,p);attachDrag(b,p.id,'pin');
  }
  for(const w of data.widgets){
   if(!widgets[w.id])continue;
   const card=widgetCard(w);layer.append(card);
   desktopItemPosition(card,w);attachDrag(card,w.id,'widget');
  }
  const empty=visiblePinCount===0;
  if(empty){
   const begin=makeButton('+ Add Apps and Widgets',()=>showGallery('apps'),'bc-home-empty-cta');
   layer.append(begin);
  }
 }
 function renderPhone(){
  const root=shell.querySelector('.bc-sb'),target=root?.querySelector('.bc-sb-widgets');
  if(!target)return;
  let wrap=target.querySelector('.bc-home-phone-widget-strip');
  if(!wrap){wrap=create('div','bc-home-phone-widget-strip');target.append(wrap)}
  wrap.replaceChildren(...snap().widgets.filter(w=>widgets[w.id]).map(w=>widgetCard(w,true)));
  for(const card of wrap.querySelectorAll('.bc-home-phone-widget')){
   const handle=card.querySelector('.bc-home-widget-header'),id=card.dataset.widget;
   let pointer=null;
   handle?.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('button'))return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0};
    handle.setPointerCapture(e.pointerId);
   });
   handle?.addEventListener('pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    pointer.dx=e.clientX-pointer.x;
    if(Math.abs(pointer.dx)>8){
     card.classList.add('bc-home-phone-widget-moving');
     card.style.transform='translateX('+pointer.dx+'px)';
    }
   });
   function end(e){
    if(!pointer||pointer.id!==e.pointerId)return;
    const dx=pointer.dx;pointer=null;card.style.removeProperty('transform');
    card.classList.remove('bc-home-phone-widget-moving');
    try{handle.releasePointerCapture(e.pointerId)}catch(_){}
    if(Math.abs(dx)<38)return;
    const current=snap().widgets,i=current.findIndex(w=>w.id===id);
    const j=Math.max(0,Math.min(current.length-1,i+(dx<0?1:-1)));
    if(i>=0&&j!==i)reorderPhone(id,current[j].id,true);
   }
   handle?.addEventListener('pointerup',end);
   handle?.addEventListener('pointercancel',end);
  }
  target.classList.toggle('bc-home-custom-phone-widgets',!!snap().widgets.length);
  if(!phoneButton||!phoneButton.isConnected){
   const actions=root.querySelector('.bc-sb-status-actions');
   if(actions){
    phoneButton=makeButton('Widgets',()=>showGallery('widgets'),'bc-home-phone-widget-picker');
    phoneButton.setAttribute('aria-label','Add or edit home screen widgets');
    phoneButton.title='Widget Gallery';actions.prepend(phoneButton);
   }
  }
  const apps=root.querySelector('.bc-sb-page-controls');
  if(apps&&!apps.querySelector('.bc-home-phone-app-picker')){
   const button=makeButton('+ Apps',()=>showGallery('apps'),'bc-home-phone-app-picker');
   button.setAttribute('aria-label','Choose desktop apps to sync to all devices');apps.append(button);
  }
 }
 function draw(){
  renderQueued=false;
  if(!accountReady())return;
  const account=service()?.account();
  if(account!==lastAccount){lastAccount=account;closeGallery();closeMenu()}
  const phone=document.documentElement.classList.contains('bc-os-phone');
  if(layer)layer.hidden=phone||!shell.classList.contains('bc-macos-desktop');
  if(phone)renderPhone();
  else if(shell.classList.contains('bc-macos-desktop'))renderDesktop();
  if(layer)layer.hidden=phone||!shell.classList.contains('bc-macos-desktop');
 }
 function schedule(){
  if(renderQueued)return;renderQueued=true;
  requestAnimationFrame(draw);
 }
 shell.querySelector('#bcWidgetsToggle')?.addEventListener('click',e=>{
  if(!accountReady())return;
  e.preventDefault();e.stopImmediatePropagation();showGallery('widgets');
 },true);
 // Apply edits immediately: deferred frames in installed mobile web apps can be
 // delayed when the shell is waking or the browser throttles rendering.
 window.addEventListener('blackcell:desktop-layout-updated',()=>{renderQueued=false;draw()});
 window.addEventListener('blackcell:home-sync-status',e=>{
  if(!accountReady())return;
  showNotice(e.detail?.ok?'Home layout synced to your BLACKCELL account.':'Account sync failed. Your local layout is kept; reconnect to retry.');
 });
 window.addEventListener('blackcell:desktop-ready',schedule);
 window.addEventListener('blackcell:springboard-ready',schedule);
 // Auth and mobile shell activation can follow DOMContentLoaded.
 const shellReadyObserver=new MutationObserver(schedule);
 shellReadyObserver.observe(shell,{attributes:true,attributeFilter:['hidden','class']});
 window.addEventListener('blackcell:home-apps-open',()=>showGallery('apps'));
 window.addEventListener('blackcell:home-widgets-open',()=>showGallery('widgets'));
 window.addEventListener('blackcell:desktop-add-app',e=>addApp(e.detail?.id));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
 window.addEventListener('resize',schedule,{passive:true});
 document.addEventListener('pointerdown',e=>{
  if(menu&&!menu.contains(e.target))closeMenu();
 },{passive:true});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeMenu();closeGallery()}
 });
 // Desktop context-menu entries are visible even when the classic wallpaper canvas is quiet.
 shell.querySelector('.workspace')?.addEventListener('contextmenu',e=>{
  if(!accountReady()||document.documentElement.classList.contains('bc-os-phone')||e.target.closest('.bc-unified-home-layer,.bc-mac-desktop-canvas,.os-window,.app,.dock,.bc-system-panel'))return;
  e.preventDefault();popupAt(e.clientX,e.clientY,[
   ['Add Applications…',()=>showGallery('apps')],
   ['Add Widgets…',()=>showGallery('widgets')]
  ]);
 });
 clockTimer=setInterval(()=>{
  if(!shell.hidden&&document.visibilityState==='visible')updateLiveValues(shell);
 },30000);
 window.addEventListener('pagehide',()=>clearInterval(clockTimer),{once:true});
 schedule();
})();