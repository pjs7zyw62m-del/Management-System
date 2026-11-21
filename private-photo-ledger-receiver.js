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
 const review=button('Open Photos',()=>openMedia(),'rr-nav-button is-primary');
 const history=button('Photo History',()=>openMedia(true),'rr-nav-button');
 const message=button('Private Chat',()=>{
  closeMedia();
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
 const headerActions=make('div','rr-chat-head-actions');
 const showMedia=button('▣ Photos',()=>openMedia(),'rr-chat-open-media');
 showMedia.setAttribute('aria-label','Open REDLINE photo review beside chat');
 showMedia.setAttribute('aria-expanded','true');
 showMedia.setAttribute('aria-controls','redlineReceiverIncomingPhotos');
 headerActions.append(chatRoom,showMedia);
 chatHeader.append(chatTitle,headerActions);
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
  make('small','','Price each incoming photo without leaving the conversation.'));
 photos.append(incomingHeader);
 workspace.append(chatPanel,photos);
 // Match BLACKCELL iMessage: chat is permanent, while the real photo-review
 // panel slides in from the right. Its left edge resizes by dragging.
 const photoClose=button('✕',()=>closeMedia(),'rr-photo-close');
 photoClose.setAttribute('aria-label','Close photo review and return to full-width chat');
 photoClose.title='Close Photos';
 const expandPhoto=button('⤢ EXPAND PHOTO',()=>{
  const expanded=photos.classList.toggle('rr-photo-expanded');
  expandPhoto.textContent=expanded?'↙ SHOW PRICED LIST':'⤢ EXPAND PHOTO';
  expandPhoto.setAttribute('aria-pressed',String(expanded));
  if(!expanded)applyHeight(heightRatio);
 },'rr-photo-expand');
 expandPhoto.setAttribute('aria-pressed','false');
 expandPhoto.setAttribute('aria-label','Expand incoming photo to use all available photo viewer height');
 const fullPhoto=button('⛶ VIEW FULL PHOTO',()=>{
  const pricedMode=document.body.classList.contains('rr-timing-priced-photo');
  const target=pricedMode
   ? $('#redlineReceiverReviewStage .rr-timer-selected-preview .rr-timer-full')
   : $('#reviewQueueCurrent .photo-image-btn');
  if(target)target.click();
 },'rr-photo-fullscreen');
 fullPhoto.setAttribute('aria-label','Open the entire original photo with pricing controls');
 incomingHeader.append(fullPhoto,expandPhoto,photoClose);
 // BLACKCELL iMessage-style two-level media viewer: live submission above,
 // reviewed/priced library below. Reparent the SAME ledger elements.
 const reviewStage=make('div','rr-review-stage');reviewStage.id='redlineReceiverReviewStage';
 reviewStage.setAttribute('aria-label','Incoming photo and price decisions');
 const heightDivider=make('div','rr-media-height-edge');heightDivider.id='redlineReceiverHeightEdge';
 heightDivider.setAttribute('role','separator');
 heightDivider.setAttribute('aria-label','Resize incoming photo viewer and priced photo list');
 heightDivider.setAttribute('aria-orientation','horizontal');
 heightDivider.setAttribute('aria-controls','redlineReceiverReviewStage redlineReceiverPricedStage');
 heightDivider.title='Drag up or down to resize the incoming photo and priced photo list. Double-click to reset.';
 heightDivider.tabIndex=0;
 const pricedStage=make('section','rr-priced-stage');pricedStage.id='redlineReceiverPricedStage';
 pricedStage.setAttribute('aria-label','Priced photos in a separately scrolling list');
 photos.append(reviewStage,heightDivider,pricedStage);
 const originalReview=$('#ownerReviewQueue');
 const historyToolbar=timeline?.querySelector('.timeline-toolbar');
 const photoEntries=$('#photoEntries');
 const entriesFeedback=$('#entriesFeedback');
 const divider=make('div','rr-media-edge');
 divider.id='redlineReceiverMediaEdge';
 divider.setAttribute('role','separator');
 divider.setAttribute('aria-orientation','vertical');
 divider.setAttribute('aria-label','Resize chat and photo review by dragging the edge');
 divider.setAttribute('aria-controls','redlineReceiverChat redlineReceiverIncomingPhotos');
 divider.tabIndex=0;
 divider.title='Drag to resize Photos. Double-click to reset.';
 workspace.insertBefore(divider,photos);
 roomBody?.before(workspace);
 const MEDIA_KEY='blackcell:redline:receiver:photo-first-width-v3';
 const DEFAULT_MEDIA=.78;
 const readWidth=()=>{
  try{const n=Number(window.localStorage.getItem(MEDIA_KEY));return n>=.28&&n<=.85?n:DEFAULT_MEDIA}
  catch{return DEFAULT_MEDIA}
 };
 let mediaRatio=readWidth(),dragPointer=null;
 // On a narrow OS window, the photo pane behaves like iMessage's overlay;
 // on desktop/tablet it sits beside chat. No horizontal size slider.
 let mediaOpen=true,mediaInitialised=false;
 const HEIGHT_KEY='blackcell:redline:receiver:photo-first-height-v2';
 const DEFAULT_HEIGHT=.80;
 const readHeight=()=>{try{const n=Number(window.localStorage.getItem(HEIGHT_KEY));return n>=.32&&n<=.90?n:DEFAULT_HEIGHT}catch{return DEFAULT_HEIGHT}};
 let heightRatio=readHeight(),heightPointer=null;
 const usableWidth=()=>workspace.getBoundingClientRect().width||window.innerWidth;
 function range(){
  const width=Math.max(1,usableWidth());
  const left=Math.min(260,Math.max(205,width*.27));
  const right=Math.min(380,Math.max(270,width*.36));
  const min=Math.max(.28,right/width);
  const max=Math.max(min,Math.min(.85,1-(left+12)/width));
  return {min,max};
 }
 function applyWidth(ratio,persist=false){
  const {min,max}=range();
  mediaRatio=Math.min(max,Math.max(min,ratio));
  workspace.style.setProperty('--rr-media-width',(mediaRatio*100).toFixed(2)+'%');
  divider.setAttribute('aria-valuemin',String(Math.round(min*100)));
  divider.setAttribute('aria-valuemax',String(Math.round(max*100)));
  divider.setAttribute('aria-valuenow',String(Math.round(mediaRatio*100)));
  divider.setAttribute('aria-valuetext','Photos '+Math.round(mediaRatio*100)+' percent');
  if(persist)try{window.localStorage.setItem(MEDIA_KEY,String(mediaRatio))}catch{}
 }
 function showPane(){
  workspace.classList.toggle('rr-media-open',mediaOpen);
  workspace.classList.toggle('rr-media-closed',!mediaOpen);
  showMedia.setAttribute('aria-expanded',String(mediaOpen));
  review.setAttribute('aria-expanded',String(mediaOpen));
 }
 function openMedia(history=false){
  // Original small-phone navigation remains in charge of its own panels.
  if(workspace.hidden){
   const key=history?'photos':'review';
   const tab=app.querySelector('.bc-ledger-phone-tab[data-ledger-navigate="'+key+'"]:not([hidden])');
   if(tab)tab.click();
   else goTo(history?'#photoEntries':'#ownerReviewQueue');
   return;
  }
  mediaOpen=true;showPane();applyWidth(mediaRatio);applyHeight(heightRatio);
  if(history){
   const priced=pricedStage.querySelector('#photoEntries');
   if(priced){priced.scrollTop=0;priced.focus?.({preventScroll:true})}
  }
 }
 function closeMedia(){mediaOpen=false;showPane()}
 // Resize the upper incoming-photo stage independently from the lower
 // priced-photo library, just like iMessage's media stage and filmstrip.
 function verticalBounds(){
  const area=Math.max(220,photos.getBoundingClientRect().height
   -(incomingHeader.getBoundingClientRect().height||49)-10);
  const min=Math.max(.32,Math.min(180,area*.36)/area);
  const max=Math.min(.90,1-Math.min(90,area*.20)/area);
  return {area,min,max:Math.max(min,max)};
 }
 function applyHeight(ratio,persist=false){
  const {area,min,max}=verticalBounds();
  heightRatio=Math.min(max,Math.max(min,ratio));
  photos.style.setProperty('--rr-review-height',Math.round(heightRatio*area)+'px');
  heightDivider.setAttribute('aria-valuemin',String(Math.round(min*100)));
  heightDivider.setAttribute('aria-valuemax',String(Math.round(max*100)));
  heightDivider.setAttribute('aria-valuenow',String(Math.round(heightRatio*100)));
  heightDivider.setAttribute('aria-valuetext','Incoming photos '+Math.round(heightRatio*100)+' percent, priced photos '+Math.round((1-heightRatio)*100)+' percent');
  if(persist)try{window.localStorage.setItem(HEIGHT_KEY,String(heightRatio))}catch{}
 }
 function moveHeight(event){
  const bounds=verticalBounds();
  const start=reviewStage.getBoundingClientRect().top;
  applyHeight((event.clientY-start)/bounds.area);
 }
 heightDivider.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0||workspace.hidden||!mediaOpen)return;
  heightPointer=event.pointerId;
  try{heightDivider.setPointerCapture(heightPointer)}catch{}
  document.body.classList.add('rr-height-resizing');
  moveHeight(event);event.preventDefault();
 });
 heightDivider.addEventListener('pointermove',event=>{
  if(heightPointer===event.pointerId)moveHeight(event);
 });
 function stopHeight(event){
  if(heightPointer===null||event?.pointerId!==undefined&&event.pointerId!==heightPointer)return;
  const id=heightPointer;heightPointer=null;
  try{if(heightDivider.hasPointerCapture(id))heightDivider.releasePointerCapture(id)}catch{}
  document.body.classList.remove('rr-height-resizing');
  applyHeight(heightRatio,true);
 }
 for(const evt of ['pointerup','pointercancel','lostpointercapture'])heightDivider.addEventListener(evt,stopHeight);
 heightDivider.addEventListener('dblclick',()=>applyHeight(DEFAULT_HEIGHT,true));
 heightDivider.addEventListener('keydown',event=>{
  let ratio=heightRatio;
  if(event.key==='ArrowUp')ratio-=event.shiftKey?.10:.03;
  else if(event.key==='ArrowDown')ratio+=event.shiftKey?.10:.03;
  else if(event.key==='Home')ratio=verticalBounds().min;
  else if(event.key==='End')ratio=verticalBounds().max;
  else return;
  event.preventDefault();applyHeight(ratio,true);
 });
 const position=event=>{
  const rect=workspace.getBoundingClientRect();
  if(rect.width<=0)return;
  applyWidth((rect.right-event.clientX)/rect.width);
 };
 divider.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0||!mediaOpen)return;
  dragPointer=event.pointerId;
  try{divider.setPointerCapture(dragPointer)}catch{}
  document.body.classList.add('rr-media-resizing');
  position(event);
  event.preventDefault();
 });
 divider.addEventListener('pointermove',event=>{
  if(dragPointer===event.pointerId)position(event);
 });
 function endDrag(event){
  if(dragPointer===null||event?.pointerId!==undefined&&event.pointerId!==dragPointer)return;
  const captured=dragPointer;dragPointer=null;
  try{if(divider.hasPointerCapture(captured))divider.releasePointerCapture(captured)}catch{}
  document.body.classList.remove('rr-media-resizing');
  applyWidth(mediaRatio,true);
 }
 divider.addEventListener('pointerup',endDrag);
 divider.addEventListener('pointercancel',endDrag);
 divider.addEventListener('lostpointercapture',endDrag);
 window.addEventListener('blur',()=>{if(dragPointer!==null)endDrag()});
 divider.addEventListener('dblclick',()=>applyWidth(DEFAULT_MEDIA,true));
 divider.addEventListener('keydown',event=>{
  let ratio=mediaRatio;
  if(event.key==='ArrowLeft')ratio+=event.shiftKey?.10:.03;
  else if(event.key==='ArrowRight')ratio-=event.shiftKey?.10:.03;
  else if(event.key==='Home')ratio=range().max;
  else if(event.key==='End')ratio=range().min;
  else return;
  event.preventDefault();applyWidth(ratio,true);
 });
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{
  if(!workspace.hidden&&mediaOpen){applyWidth(mediaRatio);applyHeight(heightRatio)}
 }).observe(workspace);
 function placeWorkspace(hasRoom){
  // Keep the original telephone-sized REDLINE view stacked. A narrower
  // BLACKCELL OS window uses the sliding photo panel without losing chat.
  const handheld=/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent||'');
  const combined=window.innerWidth>=420&&(!handheld||window.innerWidth>=720)
   &&Boolean(hasRoom&&timeline&&roomBody);
  workspace.hidden=!combined;
  document.body.classList.toggle('rr-imessage-mode',combined);
  document.body.classList.remove('rr-split-active','rr-is-split-resizing');
  if(combined){
   if(chatPanel.parentNode!==workspace)workspace.insertBefore(chatPanel,divider);
   if(originalReview&&originalReview.parentNode!==reviewStage)reviewStage.append(originalReview);
   for(const element of [historyToolbar,photoEntries,entriesFeedback]){
    if(element&&element.parentNode!==pricedStage)pricedStage.append(element);
   }
   if(timeline.parentNode!==photos)photos.append(timeline);
   timeline.classList.add('rr-source-timeline');
   if(!mediaInitialised){
    mediaInitialised=true;
    // Like iMessage Shared Media: show side-by-side on wide screens.
    // On smaller OS windows keep chat visible until Photos is opened.
    mediaOpen=true;
   }
   showPane();applyWidth(mediaRatio);applyHeight(heightRatio);
  }else{
   if(dragPointer!==null)endDrag();
   if(heightPointer!==null)stopHeight();
   if(chatPanel.previousElementSibling!==nav)nav.after(chatPanel);
   for(const element of [originalReview,historyToolbar,photoEntries,entriesFeedback]){
    if(element&&element.parentNode!==timeline)timeline.append(element);
   }
   timeline?.classList.remove('rr-source-timeline');
   if(timeline&&roomBody&&timeline.parentNode!==roomBody)roomBody.append(timeline);
   mediaInitialised=false;
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