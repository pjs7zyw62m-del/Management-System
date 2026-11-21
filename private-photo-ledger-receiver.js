/* BLACKCELL REDLINE / Receiver Command Center
 * Presentation and navigation only. The original authenticated REDLINE
 * module remains the sole authority for photos, amounts, payments and roles.
 */
(()=>{
 'use strict';
 const $=(s,root=document)=>root.querySelector(s);
 const app=$('#ledgerApp'),owner=$('#ownerSetup'),room=$('#activeRoom');
 if(!app||!owner||!room)return;
 const make=(tag,cls,text)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(text!==undefined)element.textContent=text;
  return element;
 };
 const button=(label,click,cls='')=>{
  const el=make('button',cls,label);el.type='button';
  el.addEventListener('click',click);return el;
 };
 const dashboard=make('section','redline-receiver-command');
 dashboard.id='redlineReceiverCommand';dashboard.hidden=true;
 dashboard.setAttribute('aria-label','BLACKCELL REDLINE receiver command center');
 const header=make('header','rr-command-header');
 const intro=make('div','rr-command-intro');
 const title=make('h2','rr-title');title.append(document.createTextNode('REDLINE '),make('span','','CONTROL'));
 const roomSummary=make('span','rr-room-summary','No private room selected');
 roomSummary.id='redlineReceiverRoomSummary';
 intro.append(title,roomSummary);
 const status=make('span','rr-status','RECEIVER VERIFIED');status.id='redlineReceiverStatus';
 header.append(intro,status);
 const stats=make('div','rr-stats');
 const fields=[
  ['pending','AWAITING YOUR REVIEW','pendingCount','0'],
  ['owed','OUTSTANDING AMOUNTS','totalOwed','$0.00'],
  ['paid','RECORDED PAID','totalPaid','$0.00'],
  ['assigned','TOTAL ASSIGNED','totalAssigned','$0.00']
 ];
 const outputs=new Map();
 for(const [key,name,source,fallback] of fields){
  const card=make('article','rr-stat rr-stat-'+key);
  card.append(make('span','rr-stat-name',name));
  const value=make('strong','rr-stat-value',fallback);value.dataset.source=source;
  card.append(value);
  outputs.set(source,value);stats.append(card);
 }
 const nav=make('nav','rr-nav');nav.setAttribute('aria-label','Receiver quick actions');
 const goTo=(selector)=>{
  const target=$(selector);
  if(!target||target.hidden)return;
  target.scrollIntoView({behavior:'smooth',block:'start'});
  if(target.matches('section[tabindex]'))target.focus({preventScroll:true});
 };
 const review=button('Review Photos',()=>goTo('#ownerReviewQueue'),'rr-nav-button is-primary');
 const history=button('Photo History',()=>{
  $('#photoEntries')?.scrollIntoView({behavior:'smooth',block:'start'});
 },'rr-nav-button');
 const message=button('Private Chat',()=>{
  goTo('#redlineReceiverChat');
  $('#redlineReceiverChat .redline-message-entry')?.focus({preventScroll:true});
 },'rr-nav-button');
 const manage=button('Rooms & Access',()=>goTo('#ownerSetup'),'rr-nav-button');
 const tools=button('Room Tools',()=>{
  const expanded=!document.body.classList.contains('rr-room-tools-open');
  document.body.classList.toggle('rr-room-tools-open',expanded);
  tools.setAttribute('aria-expanded',String(expanded));
  tools.textContent=expanded?'Hide Room Tools':'Room Tools';
  if(expanded)goTo('#activeRoom .room-toolbar');
 },'rr-nav-button rr-nav-tools');
 tools.setAttribute('aria-expanded','false');
 tools.setAttribute('aria-controls','redlineSessionTools');
 nav.append(review,history,message,manage,tools);
 // Reuse the authenticated, room-scoped thread from the sender's chat module.
 const chatPanel=make('section','rr-chat-panel');chatPanel.id='redlineReceiverChat';
 chatPanel.hidden=true;chatPanel.setAttribute('aria-label','Private chat with sender');
 const chatHeader=make('div','rr-chat-heading'),chatTitle=make('div');
 chatTitle.append(make('span','rr-chat-kicker','PRIVATE TWO-WAY CONVERSATION'),
  make('h3','','Chat with your sender'));
 const chatRoom=make('span','rr-chat-room','Selected private room');
 chatHeader.append(chatTitle,chatRoom);
 const chatMount=make('div','rr-chat-mount');chatMount.id='redlineReceiverChatMount';
 chatPanel.append(chatHeader,chatMount);
 const access=make('section','rr-access-panel');
 access.id='redlineReceiverAccessPanel';
 access.append(make('span','rr-kicker','OWNER SECURITY · EMPLOYEE RESTRICTIONS'),make('h3','','REDLINE ONLY ACCESS'));
 access.append(make('p','','Choose an employee and assign Level 0. Level 0 grants access to REDLINE only; returning to standard access restores Level 1.'));
 const accessRow=make('div','rr-access-row');
 const selector=make('select','rr-access-select');
 selector.setAttribute('aria-label','Employee to manage');selector.id='rrAccessEmployee';
 selector.append(new Option('Loading employee accounts…',''));
 const action=button('LOADING ACCESS…',()=>void changeAccess(),'rr-access-action');
 action.disabled=true;
 accessRow.append(selector,action);
 const accessState=make('p','rr-access-state','Verifying owner permissions…');
 accessState.setAttribute('role','status');
 access.append(accessRow,accessState);
 let accounts=[],accessBusy=false,accessLoaded=false,accessRefreshAt=0;
 const currentAccount=()=>accounts.find(x=>x.userId===selector.value);
 function renderAccess(){
  const selected=currentAccount();
  action.disabled=accessBusy||!selected;
  if(!selected){action.textContent='SELECT AN EMPLOYEE';if(accessLoaded)accessState.textContent='Select an employee to view their access.';return}
  const restricted=selected.accessScope==='ledger_only';
  action.textContent=restricted?'RESTORE LEVEL 1 ACCESS':'SET LEVEL 0 · REDLINE ONLY';
  accessState.textContent=(selected.name||'Employee')+' · Level '+(selected.clearance??'—')+
   ' · '+(restricted?'REDLINE ONLY':'STANDARD APP ACCESS')+
   (selected.active?'':' · INACTIVE');
 }
 selector.addEventListener('change',renderAccess);
 async function loadAccess(force=false){
  if(accessBusy||app.hidden||owner.hidden)return;
  if(!force&&accessLoaded&&Date.now()-accessRefreshAt<30000)return;
  accessBusy=true;action.disabled=true;
  const previous=selector.value;
  try{
   const api=window.BLACKCELL_REDLINE_API;
   if(!api?.ownerAccessMembers)throw Error('REDLINE security controls are still loading.');
   accounts=await api.ownerAccessMembers();
   selector.replaceChildren(new Option('Select an employee…',''));
   for(const account of accounts){
    selector.append(new Option(account.name+' · Level '+(account.clearance??'—'),account.userId));
   }
   if(accounts.some(x=>x.userId===previous))selector.value=previous;
   accessLoaded=true;accessRefreshAt=Date.now();renderAccess();
  }catch(error){accessLoaded=false;accessState.textContent='Could not load security access: '+String(error?.message||error)}
  finally{accessBusy=false;renderAccess()}
 }
 async function changeAccess(){
  const account=currentAccount();
  if(!account||accessBusy)return;
  const restrict=account.accessScope!=='ledger_only';
  const ask=restrict
   ?'Set '+account.name+' (Level '+account.clearance+') to REDLINE ONLY? Their clearance changes to Level 0 and all other apps will be blocked.'
   :'Restore normal application access for '+account.name+'? Their clearance returns to Level 1.';
  if(!window.confirm(ask))return;
  accessBusy=true;action.disabled=true;accessState.textContent='Saving verified security access…';
  try{
   const response=await window.BLACKCELL_REDLINE_API.ownerSetRedlineOnly(account.userId,restrict);
   account.accessScope=response.accessScope;account.clearance=response.clearanceLevel;
   accessState.textContent='Access updated successfully.';
   await loadAccessAfterChange();
  }catch(error){accessState.textContent='Change failed: '+String(error?.message||error)}
  finally{accessBusy=false;renderAccess()}
 }
 async function loadAccessAfterChange(){
  // Refresh from the server to display authoritative access state.
  const fresh=await window.BLACKCELL_REDLINE_API.ownerAccessMembers();
  accounts=fresh;accessRefreshAt=Date.now();
 }
 const line=make('div','rr-security-line');
 line.append(make('span','rr-security-dot',''),make('strong','','RECEIVER ONLY'),
  make('span','','Owner-verification required for decisions, resets and payment records'));
 dashboard.append(header,stats,nav,chatPanel);
 const pageHeading=app.querySelector('.page-heading');
 pageHeading?.after(dashboard);
 const workspaceActions=pageHeading?.querySelector('.workspace-actions');
 // The same Refresh and Live Updates controls move into the compact
 // desktop header. They are never copied or disabled.
 function placeHeaderActions(){
  if(!workspaceActions||!pageHeading)return;
  if(window.matchMedia('(min-width:960px)').matches){
   if(workspaceActions.parentNode!==header)header.append(workspaceActions);
  }else if(workspaceActions.parentNode!==pageHeading){
   pageHeading.append(workspaceActions);
  }
 }
 // Desktop: chat on the LEFT, the actual live photo review and history
 // on the RIGHT. Never clone review entries or create a second data source.
 const roomBody=$('#activeRoom .room-body');
 const timeline=$('#activeRoom .timeline-column');
 const workspace=make('section','rr-live-workspace');workspace.id='redlineReceiverLiveWorkspace';
 workspace.setAttribute('aria-label','REDLINE private chat and incoming photo workspace');
 workspace.hidden=true;
 const photos=make('section','rr-incoming-photos');photos.id='redlineReceiverIncomingPhotos';
 photos.setAttribute('aria-label','Incoming photos from selected sender');
 const incomingHeader=make('div','rr-incoming-header');
 incomingHeader.append(make('h3','','Incoming Photos'),
  make('small','','New submissions appear automatically in the review queue.'));
 photos.append(incomingHeader);
 workspace.append(chatPanel,photos);
 // One live chat and one real review timeline share an adjustable split pane.
 // The separator works with mouse, touch, pen and keyboard.
 const divider=make('div','rr-split-divider');
 divider.id='redlineReceiverSplitDivider';
 divider.setAttribute('role','separator');
 divider.setAttribute('aria-label','Resize REDLINE chat and incoming photos');
 divider.setAttribute('aria-orientation','vertical');
 divider.setAttribute('aria-controls','redlineReceiverChat redlineReceiverIncomingPhotos');
 divider.title='Drag to resize chat and photos. Double-click to reset. Arrow keys also resize.';
 divider.tabIndex=0;
 divider.append(make('span','rr-split-grip','⋮⋮'));
 workspace.insertBefore(divider,photos);
 const splitControls=make('div','rr-split-controls');
 splitControls.id='redlineReceiverSplitControls';
 const splitLabel=make('strong','rr-split-title','CHAT + PHOTOS · ONE WORKSPACE');
 const splitReadout=make('span','rr-split-readout','CHAT 36% · PHOTOS 64%');
 const splitRange=make('input','rr-split-range');
 splitRange.type='range';splitRange.min='20';splitRange.max='78';splitRange.step='1';
 splitRange.setAttribute('aria-label','Adjust the width of chat and photo viewer');
 splitRange.setAttribute('aria-controls','redlineReceiverChat redlineReceiverIncomingPhotos');
 const smallerChat=button('More Photo',()=>applySplit(splitRatio-.10,true),'rr-split-adjust');
 const largerChat=button('More Chat',()=>applySplit(splitRatio+.10,true),'rr-split-adjust');
 const defaultSplit=button('Reset',()=>applySplit(DEFAULT_SPLIT,true),'rr-split-reset');
 splitControls.append(splitLabel,smallerChat,splitRange,largerChat,splitReadout,defaultSplit);
 workspace.insertBefore(splitControls,chatPanel);
 roomBody?.before(workspace);
 const splitWorkspace=window.matchMedia('(min-width:480px)');
 const SPLIT_KEY='blackcell:redline:receiver:split-v1';
 const DEFAULT_SPLIT=.36;
 function readSplit(){
  try{
   const saved=Number(window.localStorage.getItem(SPLIT_KEY));
   return Number.isFinite(saved)&&saved>=.2&&saved<=.76?saved:DEFAULT_SPLIT;
  }catch{return DEFAULT_SPLIT}
 }
 let splitRatio=readSplit(),activePointer=null;
 function bounds(){
  const width=Math.max(300,workspace.getBoundingClientRect().width||window.innerWidth);
  const minChat=Math.max(140,Math.min(260,width*.30));
  const minPhotos=Math.max(170,Math.min(330,width*.34));
  const min=Math.max(.18,minChat/width);
  const max=Math.max(min,Math.min(.78,1-(minPhotos+20)/width));
  return {width,min,max};
 }
 function applySplit(ratio,persist=false){
  const {min,max}=bounds();
  splitRatio=Math.max(min,Math.min(max,ratio));
  workspace.style.setProperty('--rr-chat-width',(splitRatio*100).toFixed(2)+'%');
  divider.setAttribute('aria-valuemin',String(Math.round(min*100)));
  divider.setAttribute('aria-valuemax',String(Math.round(max*100)));
  divider.setAttribute('aria-valuenow',String(Math.round(splitRatio*100)));
  divider.setAttribute('aria-valuetext','Chat '+Math.round(splitRatio*100)+' percent, photos '+Math.round((1-splitRatio)*100)+' percent');
  splitRange.min=String(Math.round(min*100));
  splitRange.max=String(Math.round(max*100));
  splitRange.value=String(Math.round(splitRatio*100));
  splitReadout.textContent='CHAT '+Math.round(splitRatio*100)+'% · PHOTOS '+Math.round((1-splitRatio)*100)+'%';
  if(persist){
   try{window.localStorage.setItem(SPLIT_KEY,String(splitRatio))}catch{}
  }
 }
 splitRange.addEventListener('input',()=>applySplit(Number(splitRange.value)/100));
 splitRange.addEventListener('change',()=>applySplit(Number(splitRange.value)/100,true));
 const moveFromPointer=event=>{
  const rect=workspace.getBoundingClientRect();
  if(!rect.width)return;
  applySplit((event.clientX-rect.left)/rect.width);
 };
 divider.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  if(workspace.hidden)return;
  activePointer=event.pointerId;
  try{divider.setPointerCapture(activePointer)}catch{}
  document.body.classList.add('rr-is-split-resizing');
  moveFromPointer(event);
  event.preventDefault();
 });
 divider.addEventListener('pointermove',event=>{
  if(activePointer===event.pointerId)moveFromPointer(event);
 });
 const stopResize=event=>{
  if(activePointer===null||event?.pointerId!==undefined&&event.pointerId!==activePointer)return;
  try{if(divider.hasPointerCapture(activePointer))divider.releasePointerCapture(activePointer)}catch{}
  activePointer=null;
  document.body.classList.remove('rr-is-split-resizing');
  applySplit(splitRatio,true);
 };
 divider.addEventListener('pointerup',stopResize);
 divider.addEventListener('pointercancel',stopResize);
 divider.addEventListener('lostpointercapture',stopResize);
 window.addEventListener('blur',()=>{if(activePointer!==null)stopResize()});
 divider.addEventListener('dblclick',()=>applySplit(DEFAULT_SPLIT,true));
 divider.addEventListener('keydown',event=>{
  let value=splitRatio;
  if(event.key==='ArrowLeft'||event.key==='ArrowDown')value-=event.shiftKey?.10:.03;
  else if(event.key==='ArrowRight'||event.key==='ArrowUp')value+=event.shiftKey?.10:.03;
  else if(event.key==='Home')value=bounds().min;
  else if(event.key==='End')value=bounds().max;
  else return;
  event.preventDefault();
  applySplit(value,true);
 });
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{
  if(!workspace.hidden)applySplit(splitRatio);
 }).observe(workspace);
 function placeWorkspace(hasRoom){
  // BLACKCELL OS may host REDLINE in a narrow iframe that the legacy
  // responsive code labels "mobile"; that must not disable this workspace.
  const combined=splitWorkspace.matches&&Boolean(hasRoom&&timeline&&roomBody);
  document.body.classList.toggle('rr-split-active',combined);
  workspace.hidden=!combined;
  if(combined){
   if(chatPanel.parentNode!==workspace)workspace.insertBefore(chatPanel,divider);
   if(timeline.parentNode!==photos)photos.append(timeline);
   applySplit(splitRatio);
  }else{
   if(activePointer!==null)stopResize();
   if(chatPanel.previousElementSibling!==nav)nav.after(chatPanel);
   if(timeline&&roomBody&&timeline.parentNode!==roomBody)roomBody.append(timeline);
  }
 }
 // Security and room controls remain available beneath active conversations.
 access.append(line);
 owner.append(access);
 if(owner.parentNode===app)app.append(owner);
 function sync(){
  const visible=!app.hidden&&!owner.hidden;
  dashboard.hidden=!visible;
  document.body.classList.toggle('bc-redline-receiver',visible);
  if(!visible){
   document.body.classList.remove('rr-room-tools-open');
   if(workspaceActions&&pageHeading&&workspaceActions.parentNode!==pageHeading)pageHeading.append(workspaceActions);
   return;
  }
  placeHeaderActions();
  void loadAccess();
  const hasRoom=!room.hidden;
  roomSummary.textContent=hasRoom
   ?($('#activeRoomTitle')?.textContent?.trim()||'Private room')+' · '+($('#roomPeople')?.textContent?.trim()||'Two-person access')+' · '+($('#roomStateLabel')?.textContent?.trim()||'ACTIVE')
   :'No private room selected';
  roomSummary.title=roomSummary.textContent;
  tools.disabled=!hasRoom;
  if(!hasRoom){
   document.body.classList.remove('rr-room-tools-open');
   tools.textContent='Room Tools';tools.setAttribute('aria-expanded','false');
  }
  placeWorkspace(hasRoom);
  const wasChatHidden=chatPanel.hidden;
  chatPanel.hidden=!hasRoom;
  if(hasRoom&&wasChatHidden)window.dispatchEvent(new Event('blackcell:redline:receiver-ready'));
  chatRoom.textContent=hasRoom?($('#activeRoomTitle')?.textContent?.trim()||'Current private room'):'Select a private room';
  status.textContent=hasRoom?'RECEIVER VERIFIED · PRIVATE ROOM':'RECEIVER VERIFIED · NO ROOM';
  status.classList.toggle('is-waiting',!hasRoom);
  for(const [source,output] of outputs){
   const value=document.getElementById(source);
   if(value)output.textContent=value.textContent||'—';
  }
  review.disabled=history.disabled=message.disabled=!hasRoom;
  const mode=document.body.classList.contains('bc-redline-archive-view');
  dashboard.classList.toggle('rr-is-archive',mode);
  const count=$('#reviewQueueCount')?.textContent||'';
  review.title=count?'Review queue: '+count:'Open review queue';
 }
 const observe=new MutationObserver(sync);
 for(const item of [app,owner,room]){
  observe.observe(item,{attributes:true,attributeFilter:['hidden']});
 }
 for(const id of ['totalOwed','totalPaid','totalAssigned','pendingCount','reviewQueueCount','activeRoomTitle','roomPeople','roomStateLabel']){
  const element=document.getElementById(id);
  if(element)observe.observe(element,{childList:true,characterData:true,subtree:true});
 }
 window.addEventListener('blackcell:redline:state',sync);
 window.addEventListener('blackcell:redline:session-mode',sync);
 window.addEventListener('pageshow',sync);
 window.addEventListener('resize',sync,{passive:true});
 sync();
})();