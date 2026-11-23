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
 // Keep navigation actions together while the payment action stays visible.
 const menuShell=make('div','rr-nav-dropdown');
 const menuToggle=button('MENU',()=>setMenuOpen(menuItems.hidden),'rr-nav-button rr-menu-toggle');
 menuToggle.setAttribute('aria-expanded','false');
 menuToggle.setAttribute('aria-controls','redlineReceiverMenuItems');
 menuToggle.setAttribute('aria-haspopup','true');
 const menuItems=make('div','rr-nav-menu-items');menuItems.id='redlineReceiverMenuItems';
 menuItems.hidden=true;
 const setMenuOpen=open=>{
  menuItems.hidden=!open;
  menuToggle.setAttribute('aria-expanded',String(open));
 };
 menuItems.append(review,history,message,manage,tools);
 for(const option of [review,history,message,manage,tools]){
  option.addEventListener('click',()=>setMenuOpen(false));
 }
 menuShell.append(menuToggle,menuItems);
 const payColumn=make('div','rr-pay-column');
 const payFull=button('PAY IN FULL',()=>void recordPaidInFull(),'rr-nav-button rr-pay-full');
 payFull.setAttribute('aria-label','Record REDLINE room balance paid in full');
 payFull.title='Record an external payment in the room ledger. REDLINE does not transfer money.';
 const partialPay=button('PARTIAL PAYMENT',()=>void openPartialPayment(),'rr-nav-button rr-pay-partial');
 partialPay.setAttribute('aria-label','Record partial payment of the private room balance');
 partialPay.title='Record a smaller external payment; no actual money is transferred.';
 const payFeedback=make('span','rr-pay-feedback','');
 payFeedback.setAttribute('role','status');payFeedback.hidden=true;
 payColumn.append(payFull,partialPay,payFeedback);
 nav.append(menuShell,payColumn);
 let payBusy=false;
 function setPayFeedback(message){
  payFeedback.textContent=message;payFeedback.hidden=!message;
 }
 const moneyCents=value=>{
  const amount=BigInt(String(value??0));
  return '$'+(amount/100n).toLocaleString('en-US')+'.'+(amount%100n).toString().padStart(2,'0');
 };

 // A receiver-only payment tab. The authenticated backend owns all balances.
 // This dialog only records verified external payments; never moves funds.
 const partialDialog=make('dialog','rr-partial-payment-dialog');
 partialDialog.id='redlinePartialPaymentDialog';
 partialDialog.setAttribute('aria-labelledby','rrPartialPaymentTitle');
 const partialForm=make('form','rr-partial-payment-form');
 const partialHeading=make('header','rr-partial-payment-heading');
 const partialTitle=make('h3','','Record Partial Payment');
 partialTitle.id='rrPartialPaymentTitle';
 const partialClose=button('✕ CLOSE',()=>partialDialog.close(),'rr-partial-close');
 partialHeading.append(partialTitle,partialClose);
 const partialIntro=make('p','rr-partial-intro',
  'Record an external payment already made. REDLINE does not send or charge funds.');
 const partialBalance=make('div','rr-partial-balance');
 const partialOwed=make('strong','','$0.00');
 const partialPaid=make('strong','','$0.00');
 const partialRemaining=make('strong','','$0.00');
 for(const [label,value] of [['OUTSTANDING NOW',partialOwed],['ALREADY RECORDED PAID',partialPaid],
  ['REMAINING AFTER PAYMENT',partialRemaining]]){
  const line=make('div','rr-partial-balance-line');
  line.append(make('span','',label),value);partialBalance.append(line);
 }
 const amountLabel=make('label','rr-partial-field','PARTIAL PAYMENT AMOUNT · USD');
 const partialAmount=make('input','rr-partial-amount');
 partialAmount.type='text';partialAmount.inputMode='decimal';partialAmount.maxLength=22;
 partialAmount.placeholder='0.00';partialAmount.autocomplete='off';partialAmount.required=true;
 partialAmount.setAttribute('aria-label','Partial payment amount in US dollars');
 amountLabel.append(partialAmount);
 const noteLabel=make('label','rr-partial-field','NOTE (OPTIONAL)');
 const partialNote=make('input','rr-partial-note');
 partialNote.type='text';partialNote.maxLength=180;
 partialNote.placeholder='Example: First installment';
 noteLabel.append(partialNote);
 const partialFeedback=make('p','rr-partial-feedback');partialFeedback.setAttribute('role','status');
 const partialActions=make('div','rr-partial-actions');
 const cancel=button('CANCEL',()=>partialDialog.close(),'rr-partial-cancel');
 const savePartial=make('button','rr-partial-confirm','RECORD PAYMENT');savePartial.type='submit';
 partialActions.append(cancel,savePartial);
 const paymentHistoryTitle=make('h4','rr-partial-history-heading','RECORDED ROOM PAYMENTS');
 const paymentHistoryList=make('div','rr-partial-history');
 partialForm.append(partialHeading,partialIntro,partialBalance,amountLabel,noteLabel,
  partialFeedback,partialActions,paymentHistoryTitle,paymentHistoryList);
 partialDialog.append(partialForm);document.body.append(partialDialog);
 let partialRoom=null,partialOutstanding=0n;
 function parsePaymentCents(value){
  const text=String(value||'').trim().replace(/[$,]/g,'');
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))
   throw Error('Enter a USD amount such as 0.50 or 10.25.');
  const [whole,decimals='']=text.split('.');
  const result=BigInt(whole)*100n+BigInt(decimals.padEnd(2,'0'));
  if(result<1n||result>BigInt(Number.MAX_SAFE_INTEGER))
   throw Error('Enter at least $0.01 without exceeding the supported limit.');
  return result;
 }
 partialAmount.addEventListener('input',()=>{
  if(partialAmount.value.startsWith('.'))partialAmount.value='0'+partialAmount.value;
  try{
   const amount=parsePaymentCents(partialAmount.value);
   partialRemaining.textContent=moneyCents(partialOutstanding>amount?partialOutstanding-amount:0n);
   partialFeedback.textContent=amount>partialOutstanding?'Amount exceeds the outstanding balance.':'';
  }catch(_){partialRemaining.textContent=moneyCents(partialOutstanding)}
 });
 function renderPaymentHistory(summary){
  paymentHistoryList.replaceChildren();
  const records=Array.isArray(summary?.payment_history)?summary.payment_history:[];
  if(!records.length){
   paymentHistoryList.append(make('p','rr-partial-empty','No room payments recorded in this session yet.'));
   return;
  }
  for(const payment of records.slice(0,50)){
   const row=make('article','rr-partial-history-item');
   const info=make('div','');
   info.append(make('strong','',payment.kind==='full'?'FINAL BALANCE':'PARTIAL PAYMENT'),
    make('small','',new Date(payment.created_at).toLocaleString()));
   if(payment.note)info.append(make('small','',payment.note));
   row.append(info,make('strong','',moneyCents(payment.amount_cents)));
   paymentHistoryList.append(row);
  }
 }
 function renderPartialBalance(summary){
  partialOutstanding=BigInt(String(summary?.remaining_cents??0));
  partialOwed.textContent=moneyCents(partialOutstanding);
  partialPaid.textContent=moneyCents(summary?.paid_cents||0);
  partialRemaining.textContent=moneyCents(partialOutstanding);
  savePartial.disabled=partialOutstanding<=0n;
  renderPaymentHistory(summary);
 }
 async function openPartialPayment(){
  const api=window.BLACKCELL_REDLINE_API,current=api?.snapshot?.();
  if(payBusy||!current?.isOwner||!current.roomActive||current.archiveMode)return;
  partialRoom=current.roomId;partialAmount.value='';partialNote.value='';
  partialFeedback.textContent='Loading verified room balance…';
  partialDialog.showModal();
  try{
   const status=await api.roomPaymentStatus(current.roomId,false);
   if(api.snapshot()?.roomId!==current.roomId)throw Error('Room changed. Reopen Payments.');
   renderPartialBalance(status);
   partialFeedback.textContent=partialOutstanding>0n?'':'Nothing is outstanding in this room.';
   if(partialOutstanding>0n)partialAmount.focus({preventScroll:true});
  }catch(e){savePartial.disabled=true;partialFeedback.textContent='Cannot load payment balance: '+String(e?.message||e)}
 }
 partialForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const api=window.BLACKCELL_REDLINE_API,current=api?.snapshot?.();
  if(payBusy||!partialDialog.open||!current?.isOwner||!current.roomActive||
     current.roomId!==partialRoom||current.archiveMode)return;
  let amount;
  try{amount=parsePaymentCents(partialAmount.value)}
  catch(e){partialFeedback.textContent=String(e?.message||e);return}
  if(amount>partialOutstanding){partialFeedback.textContent='Cannot exceed the outstanding balance.';return}
  if(!window.confirm('Record '+moneyCents(amount)+' as a PARTIAL PAYMENT?\n\n'+
   'This is an external payment record only. REDLINE will not transfer funds.'))return;
  payBusy=true;savePartial.disabled=true;partialPay.disabled=true;payFull.disabled=true;
  partialFeedback.textContent='Recording external payment…';
  try{
   const result=await api.recordPartialPayment(partialRoom,Number(amount),partialNote.value);
   if(api.snapshot()?.roomId!==partialRoom)throw Error('Room changed after recording. Reopen to verify.');
   const status=await api.roomPaymentStatus(partialRoom,false);
   renderPartialBalance(status);
   partialAmount.value='';partialNote.value='';
   partialFeedback.textContent='Recorded '+moneyCents(amount)+' · Remaining '+
    moneyCents(result.remaining_cents)+(result.refreshUnavailable?' · Refresh to verify.':'');
   setPayFeedback('Partial payment '+moneyCents(amount)+' recorded · Remaining '+moneyCents(result.remaining_cents));
  }catch(e){partialFeedback.textContent='Payment not recorded: '+String(e?.message||e)}
  finally{
   payBusy=false;savePartial.disabled=partialOutstanding<=0n;
   partialPay.disabled=false;payFull.disabled=false;sync();
  }
 });
 partialDialog.addEventListener('click',event=>{
  if(event.target===partialDialog)partialDialog.close();
 });
 async function recordPaidInFull(){
  const api=window.BLACKCELL_REDLINE_API,current=api?.snapshot?.();
  if(payBusy||!current?.isOwner||!current.roomActive||!current.roomId||current.archiveMode)return;
  payBusy=true;payFull.disabled=true;partialPay.disabled=true;setPayFeedback('');
  try{
   const timed=await api.timerStatus(current.roomId);
   if(api.snapshot()?.roomId!==current.roomId)throw Error('Room changed. Select the room again.');
   if(timed.active)throw Error('Stop the active photo timer before recording payment in full.');
   const financial=await api.roomPaymentStatus(current.roomId,false);
   if(api.snapshot()?.roomId!==current.roomId)throw Error('Room changed. Select the room again.');
   const due=BigInt(String(financial.remaining_cents??0));
   if(due<=0n){
    setPayFeedback('This room already has a $0.00 outstanding balance.');return;
   }
   const confirmed=window.confirm(
    'Record the FULL REMAINING balance as PAID for this private room?\n\n'+
    'Outstanding: '+moneyCents(due)+'\n'+
    'Already recorded paid: '+moneyCents(financial.paid_cents)+'\n\n'+
    'This records an external payment ONLY. REDLINE will NOT send or charge any money. '+
    'Your earlier partial payments and photo history will be preserved.');
   if(!confirmed)return;
   const result=await api.recordPaidInFull(current.roomId);
   if(api.snapshot()?.roomId!==current.roomId)
    throw Error('Payment recorded for prior room; reopen that room to verify.');
   if(result.refreshUnavailable){
    setPayFeedback('Payment recorded. Refresh REDLINE to verify the updated balance.');
   }else{
    const latest=api.snapshot()?.paymentSummary;
    const remaining=BigInt(String(latest?.remaining_cents??result.total_owed_cents??0));
    setPayFeedback('Recorded remaining '+moneyCents(result.recorded_total_cents)+
     ' · Outstanding '+moneyCents(remaining)+
     (result.payment_ledger?' · Previous installments preserved.':' · Photo and timer records updated.'));
   }
  }catch(error){setPayFeedback('Payment record not changed: '+String(error?.message||error))}
  finally{payBusy=false;sync()}
 }
 document.addEventListener('pointerdown',event=>{
  if(!menuItems.hidden&&!menuShell.contains(event.target))setMenuOpen(false);
 });
 nav.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!menuItems.hidden){
   setMenuOpen(false);menuToggle.focus();event.preventDefault();
  }
 });
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
 fullPhoto.setAttribute('aria-label','View the entire original photograph without controls');
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
 pricedStage.setAttribute('aria-label','Photo history in a separately scrolling list');
 const historyToggle=button('▤ PHOTO HISTORY',()=>togglePhotoHistory(),'rr-history-toggle');
 historyToggle.id='redlinePhotoHistoryToggle';
 historyToggle.setAttribute('aria-controls','redlineReceiverPricedStage');
 historyToggle.setAttribute('aria-expanded','false');
 historyToggle.setAttribute('aria-label','Open the scrollable REDLINE photo history');
 photos.append(reviewStage,heightDivider,pricedStage,historyToggle);
 const originalReview=$('#ownerReviewQueue');
 // The verified bid/timer panel stays beside the normal photo viewer.
 // Full-screen inspection is always the photograph alone.
 const bidTimerPanel=$('#redlineLightboxReview');
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
 // Native BLACKCELL Apple-dark control workspace: reparent ONLY the existing
 // verified widgets. Nothing here duplicates bids, timers, ratings or chat.
 const appleSidebar=make('aside','rr-apple-sidebar');
 appleSidebar.id='rrAppleSidebar';
 appleSidebar.setAttribute('aria-label','REDLINE workstation navigation');
 const appleMark=make('div','rr-apple-mark');
 appleMark.append(make('strong','','◢ BLACKCELL'),make('small','','REDLINE · LEVEL 04'));
 const appleMenu=make('nav','rr-apple-menu');
 appleMenu.setAttribute('aria-label','REDLINE sections');
 const appleLink=(label,handler,cls='')=>{
  const item=button(label,handler,'rr-apple-link '+cls);
  appleMenu.append(item);
  return item;
 };
 appleLink('▧  Photo Review',()=>openMedia(),'is-selected');
 appleLink('◌  Private Chat',()=>{
  mediaOpen=true;showPane();
  $('#redlineReceiverChat .redline-message-entry')?.focus({preventScroll:true});
 });
 appleLink('▤  Earnings',()=>{
  const target=appleRight.querySelector('.rr-stats');
  if(target){target.tabIndex=-1;target.focus({preventScroll:true})}
 });
 appleLink('▥  Photo History',()=>openMedia(true));
 appleLink('◷  Sessions',()=>goTo('#redlineSessionTools'));
 const appleDivider=make('div','rr-apple-sidebar-divider');
 const appleRights=make('small','rr-apple-sidebar-foot','BLACKCELL · VERIFIED ROOM');
 appleSidebar.append(appleMark,appleMenu,appleDivider,appleRights);
 // Persisted Apple-web/tablet navigation preference. The toggle stays outside
 // the sidebar so the owner can always reopen it without losing the workspace.
 const sidebarStorageKey='blackcell:redline:sidebar-hidden-v1';
 let sidebarHidden=false;
 try{sidebarHidden=window.localStorage.getItem(sidebarStorageKey)==='true'}catch{}
 const sidebarToggle=button('‹',()=>setSidebarHidden(!sidebarHidden),'rr-apple-sidebar-toggle');
 sidebarToggle.id='rrAppleSidebarToggle';
 sidebarToggle.setAttribute('aria-controls','rrAppleSidebar');
 function setSidebarHidden(hidden,persist=true){
  sidebarHidden=Boolean(hidden);
  workspace.classList.toggle('rr-sidebar-hidden',sidebarHidden);
  sidebarToggle.setAttribute('aria-expanded',String(!sidebarHidden));
  sidebarToggle.setAttribute('aria-label',sidebarHidden?'Show REDLINE sidebar':'Hide REDLINE sidebar');
  sidebarToggle.title=sidebarHidden?'Show sidebar':'Hide sidebar';
  sidebarToggle.textContent=sidebarHidden?'☰':'‹';
  if(persist)try{window.localStorage.setItem(sidebarStorageKey,String(sidebarHidden))}catch{}
 }
 setSidebarHidden(sidebarHidden,false);
 workspace.prepend(sidebarToggle);
 const appleRight=make('section','rr-apple-right');
 appleRight.id='rrAppleRight';
 appleRight.setAttribute('aria-label','Live session, timer and private messages');
 const appleTimer=make('section','rr-apple-timer');
 appleTimer.id='rrAppleTimerMount';
 appleTimer.setAttribute('aria-label','Verified photo timer');
 const appleFinance=make('div','rr-apple-finance');
 appleFinance.id='rrAppleFinance';
 const appleChatTitle=make('div','rr-apple-chat-title');
 appleChatTitle.append(make('strong','','PRIVATE CHAT'),make('small','','Verified two-person conversation'));
 const appleStatus=make('div','rr-apple-negotiation');
 appleStatus.append(make('strong','','NEGOTIATIONS'),make('small','','New offers open through the verified price negotiation window.'));
 appleRight.append(appleTimer,appleFinance,appleStatus,appleChatTitle);
 roomBody?.before(workspace);
 // When the receiver opens the original photograph, clicking it again returns
 // to the unchanged chat + one-photo workspace via the existing close handler.
 const fullSizeImage=$('#lightboxImage');
 const leaveFullPhoto=()=>{
  if(document.body.classList.contains('bc-redline-receiver')&&!$('#photoLightbox')?.hidden){
   $('#closeLightbox')?.click();
  }
 };
 fullSizeImage?.addEventListener('click',leaveFullPhoto);
 // Keep the image-only popup keyboard accessible without adding controls.
 if(fullSizeImage){
  fullSizeImage.tabIndex=0;
  fullSizeImage.setAttribute('aria-label','Full-size photograph. Press Enter to return.');
  fullSizeImage.addEventListener('keydown',event=>{
   if(event.key!=='Enter'&&event.key!==' ')return;
   event.preventDefault();leaveFullPhoto();
  });
 }
 // A timed/previously priced photo uses the same original-photo viewer.
 workspace.addEventListener('click',event=>{
  const image=event.target?.closest?.('.rr-timer-selected-preview > img');
  if(!image||!document.body.classList.contains('rr-imessage-mode'))return;
  // Open only the exact selected image through the existing verified lightbox.
  const matched=[...document.querySelectorAll('#redlineReceiverPricedStage .photo-entry .photo-image-btn')].find(b=>b.querySelector('img')?.src===image.src);
  matched?.click();
 });
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
 let historyOpen=false;
 function setHistoryOpen(open){
  historyOpen=Boolean(open);
  photos.classList.toggle('rr-history-open',historyOpen);
  historyToggle.textContent=historyOpen?'✕ CLOSE HISTORY':'▤ PHOTO HISTORY';
  historyToggle.setAttribute('aria-expanded',String(historyOpen));
  historyToggle.setAttribute('aria-label',historyOpen?'Close REDLINE photo history':'Open the scrollable REDLINE photo history');
  history.setAttribute('aria-expanded',String(historyOpen));
  const count=pricedStage.querySelectorAll('#photoEntries>.photo-entry').length;
  historyToggle.title=historyOpen?'Close photo history':count+' photo records in this room';
 }
 function togglePhotoHistory(){setHistoryOpen(!historyOpen)}
 function showPane(){
  workspace.classList.toggle('rr-media-open',mediaOpen);
  workspace.classList.toggle('rr-media-closed',!mediaOpen);
  showMedia.setAttribute('aria-expanded',String(mediaOpen));
  review.setAttribute('aria-expanded',String(mediaOpen));
  historyToggle.hidden=!mediaOpen;
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
  setHistoryOpen(history);
  if(history){
   const priced=pricedStage.querySelector('#photoEntries');
   if(priced){priced.scrollTop=0;priced.focus?.({preventScroll:true})}
  }
 }
 function closeMedia(){setHistoryOpen(false);mediaOpen=false;showPane()}
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
   // The verified timer + rating + price share ONE upper-right control deck.
   // Reparent the real actions instead of cloning any financial controls.
   const appleMode=window.innerWidth>=720&&!document.body.classList.contains('bc-ledger-mobile');
   if(chatPanel.parentNode!==workspace)workspace.insertBefore(chatPanel,divider);
   if(originalReview&&originalReview.parentNode!==reviewStage)reviewStage.append(originalReview);
   if(historyToggle.parentNode!==photos)photos.append(historyToggle);
   const reviewControlsHost=appleMode?appleTimer:reviewStage;
   if(bidTimerPanel&&bidTimerPanel.parentNode!==reviewControlsHost)
    reviewControlsHost.append(bidTimerPanel);
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
   // The same live chat and room counters are displayed in the right column.
   // Keep the authentic photo/price nodes in the center column.
   document.body.classList.toggle('bc-redline-apple-mode',appleMode);
   if(appleMode){
    if(appleSidebar.parentNode!==workspace)workspace.prepend(appleSidebar);
    if(photos.parentNode!==workspace)workspace.append(photos);
    if(divider.parentNode!==workspace)workspace.append(divider);
    if(appleRight.parentNode!==workspace)workspace.append(appleRight);
    if(nav.parentNode!==appleSidebar)appleSidebar.append(nav);
    if(stats.parentNode!==appleFinance)appleFinance.append(stats);
    if(chatPanel.parentNode!==appleRight)appleRight.append(chatPanel);
    if(appleTimer.parentNode!==appleRight)appleRight.prepend(appleTimer);
    // Header-only Pause Sending, immediately next to REDLINE Settings.
    // The button keeps its original authenticated handler and room state.
    const pause=document.querySelector('#redlineReceiverSendingPause')?.closest('.rr-receiver-photo-pause');
    if(pause){
     pause.id='redlineReceiverPauseHeader';
     const settings=document.getElementById('redlineConsentSettingsOpen');
     if(settings?.parentNode===header){
      if(pause.previousElementSibling!==settings)settings.after(pause);
     }else if(pause.parentNode!==header)header.append(pause);
    }
   }else{
    // Narrow OS windows keep the prior iMessage sliding photo/chat workspace.
    if(nav.parentNode!==dashboard)dashboard.append(nav);
    if(stats.parentNode!==dashboard)dashboard.insertBefore(stats,nav);
    if(chatPanel.parentNode!==workspace)workspace.insertBefore(chatPanel,divider);
    appleSidebar.remove();appleRight.remove();
   }
  }else{
   document.body.classList.remove('bc-redline-apple-mode');
   if(dragPointer!==null)endDrag();
   if(heightPointer!==null)stopHeight();
   // Restore the original phone/handheld markup and event handlers.
   if(nav.parentNode!==dashboard)dashboard.append(nav);
   if(stats.parentNode!==dashboard)dashboard.insertBefore(stats,nav);
   if(chatPanel.parentNode!==dashboard)dashboard.append(chatPanel);
   for(const element of [originalReview,historyToolbar,photoEntries,entriesFeedback]){
    if(element&&element.parentNode!==timeline)timeline.append(element);
   }
   if(bidTimerPanel&&originalReview&&bidTimerPanel.parentNode!==originalReview)originalReview.append(bidTimerPanel);
   appleSidebar.remove();appleRight.remove();
   timeline?.classList.remove('rr-source-timeline');
   if(timeline&&roomBody&&timeline.parentNode!==roomBody)roomBody.append(timeline);
   mediaInitialised=false;
   setHistoryOpen(false);
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
  payFull.disabled=partialPay.disabled=!hasRoom||mode||payBusy;
  const count=$('#reviewQueueCount')?.textContent||'';
  review.title=count?'Review queue: '+count:'Open review queue';
  historyToggle.hidden=!hasRoom||!mediaOpen;
  if(historyOpen&&hasRoom){
   historyToggle.title=pricedStage.querySelectorAll('#photoEntries>.photo-entry').length+' photo records in this room';
  }
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