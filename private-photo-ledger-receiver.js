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
 roomBody?.before(workspace);
 const desktopWorkspace=window.matchMedia('(min-width:960px)');
 function placeWorkspace(hasRoom){
  const desktop=desktopWorkspace.matches&&Boolean(hasRoom&&timeline&&roomBody);
  workspace.hidden=!desktop;
  if(desktop){
   if(chatPanel.parentNode!==workspace)workspace.prepend(chatPanel);
   if(timeline.parentNode!==photos)photos.append(timeline);
  }else{
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
   ?($('#activeRoomTitle')?.textContent?.trim()||'Private room')+' · '+($('#roomPeople')?.textContent?.trim()||'Two-person access')
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
 for(const id of ['totalOwed','totalPaid','totalAssigned','pendingCount','reviewQueueCount','activeRoomTitle','roomPeople']){
  const element=document.getElementById(id);
  if(element)observe.observe(element,{childList:true,characterData:true,subtree:true});
 }
 window.addEventListener('blackcell:redline:state',sync);
 window.addEventListener('blackcell:redline:session-mode',sync);
 window.addEventListener('pageshow',sync);
 window.addEventListener('resize',sync,{passive:true});
 sync();
})();