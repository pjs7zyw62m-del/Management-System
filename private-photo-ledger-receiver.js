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
 // Keep Trigger Words visible even when legacy settings are hidden by OS.
 const triggerQuick=button('⚡ TRIGGER WORDS',()=>{
  window.dispatchEvent(new Event('blackcell:redline:open-trigger-owner'));
 },'rr-trigger-quick');
 triggerQuick.id='redlineReceiverTriggerQuick';
 triggerQuick.setAttribute('aria-label','Open receiver Trigger Words approval and earnings');
 // Direct access to the existing verified room-close action; never resets records.
 const endSession=button('■ END SESSION',()=>{
  const s=window.BLACKCELL_REDLINE_API?.snapshot?.();
  if(!s?.isOwner||!s.roomActive||s.archiveMode)return;
  $('#closeRoomBtn')?.click();
 },'rr-end-session');
 endSession.id='redlineReceiverEndSession';
 endSession.setAttribute('aria-label','End the current REDLINE session');
 endSession.style.cssText='box-sizing:border-box;min-height:40px;padding:9px 13px;border:1px solid #f34b4b;border-radius:10px;color:#fff;background:#761b1b;font:800 11px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;white-space:normal;cursor:pointer;max-width:100%;flex-shrink:0;';
 const headerMenuGroup=make('div','rr-header-menu-group');
 headerMenuGroup.append(triggerQuick);
 const endSessionAnchor=document.createComment('REDLINE end session position');
 header.append(headerMenuGroup,endSession,endSessionAnchor);
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
 const popupMode=location.href!=='about:srcdoc'||window.REDLINE_DEV_CONFIG?.role==='receiver';
 const goTo=(selector)=>{
  if(popupMode){openReceiverPanel(selector.includes('photoEntries')?'history':selector.includes('ownerReviewQueue')?'review':selector.includes('ownerSetup')?'access':'tools');return}
  const target=$(selector);
  if(!target||target.hidden)return;
  target.scrollIntoView({behavior:'smooth',block:'start'});
  if(target.matches('section[tabindex]'))target.focus({preventScroll:true});
 };
 // Keep the existing phone section routing even though the receiver's
 // duplicate bottom bar is visually removed. Sender navigation is unchanged.
 function mobileSection(key){
  if(!document.body.classList.contains('bc-ledger-mobile'))return;
  app.querySelector('.bc-ledger-phone-tab[data-ledger-navigate="'+key+'"]:not([hidden])')?.click();
 }
 const review=button('Open Photos',()=>openMedia(),'rr-nav-button is-primary');
 const history=button('Photo History',()=>openMedia(true),'rr-nav-button');
 const message=button('Private Chat',()=>{
  if(popupMode)closeReceiverPanel();
  closeMedia();
  document.body.classList.remove('rr-room-tools-open');
  tools.setAttribute('aria-expanded','false');tools.textContent='Room Tools';
  if(!popupMode)mobileSection('summary');
  $('#redlineReceiverChat .redline-message-entry')?.focus({preventScroll:true});
 },'rr-nav-button');
 const manage=button('Rooms & Access',()=>{if(popupMode){openReceiverPanel('access');return}mobileSection('room');requestAnimationFrame(()=>goTo('#ownerSetup'))},'rr-nav-button');
 const tools=button('Room Tools',()=>{
  if(popupMode){openReceiverPanel('tools');return}
  const expanded=!document.body.classList.contains('rr-room-tools-open');
  document.body.classList.toggle('rr-room-tools-open',expanded);
  tools.setAttribute('aria-expanded',String(expanded));
  tools.textContent=expanded?'Hide Room Tools':'Room Tools';
  if(expanded){mobileSection('room');requestAnimationFrame(()=>goTo('#activeRoom .room-toolbar'))}
 },'rr-nav-button rr-nav-tools');
 tools.setAttribute('aria-expanded','false');
 tools.setAttribute('aria-controls','redlineSessionTools');
 // Keep navigation actions together while the payment action stays visible.
 const menuShell=make('div','rr-nav-dropdown');
 const menuToggle=button('MENU',()=>setMenuOpen(menuItems.hidden),'rr-nav-button rr-menu-toggle');
 menuToggle.setAttribute('aria-label','Open receiver menu');
 menuToggle.setAttribute('aria-expanded','false');
 menuToggle.setAttribute('aria-controls','redlineReceiverMenuItems');
 menuToggle.setAttribute('aria-haspopup','true');
 const menuItems=make('div','rr-nav-menu-items');menuItems.id='redlineReceiverMenuItems';
 menuItems.hidden=true;
 const setMenuOpen=open=>{
  menuItems.hidden=!open;
  menuToggle.setAttribute('aria-expanded',String(open));
 };
 const triggerMenu=button('⚡ Trigger Words',()=>{
  window.dispatchEvent(new Event('blackcell:redline:open-trigger-owner'));
 },'rr-nav-button rr-trigger-menu');
 const refreshMenu=button('Refresh',()=>{
  setMenuOpen(false);
  const refresh=$('#refreshLedger');if(refresh&&!refresh.disabled)refresh.click();
 },'rr-nav-button rr-menu-refresh');
 menuItems.append(review,history,triggerMenu,manage,tools);
 const allRooms=button('← All Rooms',()=>{setMenuOpen(false);window.BLACKCELL_REDLINE_API?.returnToRooms?.()},'rr-nav-button');
 allRooms.id='redlineReceiverAllRooms';allRooms.dataset.rrMenuIcon='access';allRooms.hidden=true;
 menuItems.prepend(allRooms,refreshMenu);
 const roomsHome=button('← All Rooms',()=>window.BLACKCELL_REDLINE_API?.returnToRooms?.(),'rd-home-shortcut');roomsHome.hidden=true;roomsHome.setAttribute('aria-label','Return to REDLINE main room directory');headerMenuGroup.prepend(roomsHome);
 for(const [control,icon] of [[refreshMenu,'refresh'],[review,'photos'],[history,'history'],[message,'chat'],[triggerMenu,'trigger'],[manage,'access'],[tools,'tools'],[endSession,'end']])control.dataset.rrMenuIcon=icon;
 endSession.addEventListener('click',()=>setMenuOpen(false));
 for(const option of [review,history,message,triggerMenu,manage,tools]){
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
 const payChoice=button('PAY',()=>void openPaymentChoice(),'rr-nav-button rr-pay-full rr-pay-choice');
 payChoice.setAttribute('aria-label','Choose full or partial payment');
 const desktopRoomHeading=make('div','rr-desktop-room-heading');
 const desktopRoomName=make('span','rr-desktop-room-name','Private room');
 const desktopRoomState=make('span','rr-desktop-room-state','');
 desktopRoomHeading.append(make('strong','','REDLINE ROOM'),desktopRoomName,desktopRoomState);
 payColumn.append(desktopRoomHeading,payChoice,payFull,partialPay,payFeedback);
 headerMenuGroup.prepend(menuShell);
 nav.append(payColumn);
 let payBusy=false;
 function setPayFeedback(message){
  payFeedback.textContent=message;payFeedback.hidden=!message;
 }
 const moneyCents=value=>{
  const amount=BigInt(String(value??0));
  return '$'+(amount/100n).toLocaleString('en-US')+'.'+(amount%100n).toString().padStart(2,'0');
 };

 // Mobile payment chooser: fetch the current verified balance, then use
 // the original full or partial confirmation and recording paths.
 const choiceDialog=make('dialog','rr-partial-payment-dialog rr-payment-choice-dialog');
 choiceDialog.id='redlinePaymentChoiceDialog';
 choiceDialog.setAttribute('aria-labelledby','redlinePaymentChoiceTitle');
 const choiceBody=make('div','rr-partial-payment-form');
 const choiceHeader=make('header','rr-partial-payment-heading');
 const choiceTitle=make('h3','','Payment');choiceTitle.id='redlinePaymentChoiceTitle';
 choiceHeader.append(choiceTitle,button('✕ CLOSE',()=>choiceDialog.close(),'rr-partial-close'));
 const choiceBalance=make('div','rr-partial-balance');
 const choiceLine=make('div','rr-partial-balance-line'),choiceAmount=make('strong','','—');
 choiceLine.append(make('span','','TOTAL OUTSTANDING'),choiceAmount);choiceBalance.append(choiceLine);
 const choiceFeedback=make('p','rr-partial-feedback','');choiceFeedback.setAttribute('role','status');
 let choiceRoom=null,choiceSequence=0;
 function choosePayment(full){
  const current=window.BLACKCELL_REDLINE_API?.snapshot?.();
  if(!choiceDialog.open||!current?.isOwner||!current.roomActive||current.archiveMode||current.roomId!==choiceRoom||payBusy)return;
  choiceDialog.close();
  if(full)void recordPaidInFull();else void openPartialPayment();
 }
 const chooseFull=button('PAY IN FULL',()=>choosePayment(true),'rr-partial-confirm');
 const choosePartial=button('PARTIAL PAYMENT',()=>choosePayment(false),'rr-partial-cancel');
 const choiceActions=make('div','rr-partial-actions rr-payment-choice-actions');
 choiceActions.append(chooseFull,choosePartial);
 choiceBody.append(choiceHeader,choiceBalance,choiceActions,choiceFeedback,
  make('p','rr-partial-intro','Record an external payment already made. No money is transferred by REDLINE.'));
 choiceDialog.append(choiceBody);document.body.append(choiceDialog);
 choiceDialog.addEventListener('close',()=>{choiceSequence++;choiceRoom=null});
 async function openPaymentChoice(){
  const api=window.BLACKCELL_REDLINE_API,current=api?.snapshot?.();
  if(payBusy||choiceDialog.open||!current?.isOwner||!current.roomId||!current.roomActive||current.archiveMode)return;
  const seq=++choiceSequence;choiceRoom=current.roomId;
  chooseFull.disabled=choosePartial.disabled=true;
  choiceAmount.textContent='—';chooseFull.textContent='PAY IN FULL';
  choiceFeedback.textContent='Loading verified room balance…';choiceDialog.showModal();
  try{
   const financial=await api.roomPaymentStatus(current.roomId,false);
   if(seq!==choiceSequence||!choiceDialog.open)return;
   if(api.snapshot()?.roomId!==current.roomId)throw Error('Room changed. Reopen Payments.');
   const due=BigInt(String(financial.remaining_cents??0));
   choiceAmount.textContent=moneyCents(due);chooseFull.textContent='PAY IN FULL · '+moneyCents(due);
   chooseFull.disabled=choosePartial.disabled=due<=0n;
   choiceFeedback.textContent=due>0n?'':'Nothing is outstanding in this room.';
  }catch(e){if(seq===choiceSequence&&choiceDialog.open)choiceFeedback.textContent='Cannot load payment balance: '+String(e?.message||e)}
 }
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
 menuShell.addEventListener('keydown',event=>{
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
  const mobile=document.body.classList.contains('bc-ledger-mobile');
  const triggerLabel=mobile?'Trigger Words':'⚡ Trigger Words';
  if(triggerMenu.textContent!==triggerLabel)triggerMenu.textContent=triggerLabel;
  if(mobile){
   if(workspaceActions.parentNode!==pageHeading)pageHeading.append(workspaceActions);
   const topbar=$('.topbar'),menuHost=topbar||workspaceActions;
   if(headerMenuGroup.parentNode!==menuHost){
    setMenuOpen(false);
    menuHost.append(headerMenuGroup);
   }
   if(endSession.parentNode!==menuItems)menuItems.append(endSession);
  }else{
   if(endSession.parentNode!==header)header.insertBefore(endSession,endSessionAnchor);
   if(headerMenuGroup.parentNode!==header){setMenuOpen(false);header.insertBefore(headerMenuGroup,endSession)}
  }
  if(mobile)return;
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
 // Clicking the original photo now zooms it. CLOSE and Escape return to
 // REDLINE; the zoom module owns click, wheel, pinch and keyboard zoom.
 const fullSizeImage=$('#lightboxImage');
 if(fullSizeImage){
  fullSizeImage.tabIndex=0;
  fullSizeImage.setAttribute('aria-label','Full-size photograph. Click or press Enter to zoom. Use Close or Escape to return.');
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
  if(popupMode){openReceiverPanel(history?'history':'review');return}
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
 // Move the original live metrics, never duplicate financial values.
 function placeStats(defaultHost){
  const phone=document.body.classList.contains('bc-ledger-mobile');
  const chatHead=phone&&!room.hidden?chatMount.querySelector('.redline-message-header'):null;
  const host=chatHead||defaultHost;
  if(stats.parentNode!==host){
   if(host===dashboard&&nav.parentNode===dashboard)dashboard.insertBefore(stats,nav);
   else host.append(stats);
  }
  // Reuse the original payment controls and feedback directly below the
  // chat header's red divider; restore the original navigation on larger devices.
  if(chatHead){
   if(payColumn.parentNode!==chatHead.parentNode||payColumn.previousElementSibling!==chatHead)chatHead.after(payColumn);
  }else if(payColumn.parentNode!==nav)nav.append(payColumn);
 }
 const chatStatsObserver=new MutationObserver(()=>{
  if(!app.hidden&&!owner.hidden&&document.body.classList.contains('bc-ledger-mobile'))placeStats(dashboard);
 });
 chatStatsObserver.observe(chatMount,{childList:true});
 function placeWorkspace(hasRoom){
  // Keep the original telephone-sized REDLINE view stacked. A narrower
  // BLACKCELL OS window uses the sliding photo panel without losing chat.
  const handheld=/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent||'');
  const combined=!popupMode&&!document.body.classList.contains('bc-ledger-mobile')&&window.innerWidth>=420&&(!handheld||window.innerWidth>=720)
   &&Boolean(hasRoom&&timeline&&roomBody);
  workspace.hidden=!combined;
  document.body.classList.toggle('rr-imessage-mode',combined);
  document.body.classList.remove('rr-split-active','rr-is-split-resizing');
  if(combined){
   // The verified timer + rating + price share ONE upper-right control deck.
   // Reparent the real actions instead of cloning any financial controls.
   const appleMode=window.innerWidth>=720&&!document.body.classList.contains('bc-ledger-mobile');
   // Important: DO NOT move chatPanel to workspace first on every live
   // refresh. In Apple desktop mode its permanent parent is appleRight.
   // The old two-step workspace -> appleRight reparenting detached the
   // entire conversation every time room totals or live presence changed,
   // repeatedly resetting scrollTop from history to newest messages.
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
    placeStats(appleFinance);
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
    // Move the conversation ONLY when the responsive mode actually changes.
    if(chatPanel.parentNode!==workspace)workspace.insertBefore(chatPanel,divider);
    if(nav.parentNode!==dashboard)dashboard.append(nav);
    placeStats(dashboard);
    if(chatPanel.parentNode!==workspace)workspace.insertBefore(chatPanel,divider);
    appleSidebar.remove();appleRight.remove();
   }
  }else{
   document.body.classList.remove('bc-redline-apple-mode');
   if(dragPointer!==null)endDrag();
   if(heightPointer!==null)stopHeight();
   // Restore the original phone/handheld markup and event handlers.
   if(nav.parentNode!==dashboard)dashboard.append(nav);
   placeStats(dashboard);
   if(chatPanel.parentNode!==dashboard)dashboard.append(chatPanel);
   for(const element of [originalReview,historyToolbar,photoEntries,entriesFeedback]){
    if(element&&element.parentNode!==timeline)timeline.append(element);
   }
   if(bidTimerPanel&&originalReview&&bidTimerPanel.parentNode!==originalReview)originalReview.append(bidTimerPanel);
   appleSidebar.remove();appleRight.remove();
   timeline?.classList.remove('rr-source-timeline');
   if(timeline&&roomBody&&timeline.parentNode!==roomBody&&!receiverPanel.contains(timeline))roomBody.append(timeline);
   mediaInitialised=false;
   setHistoryOpen(false);
  }
 }
 // Security and room controls remain available beneath active conversations.
 access.append(line);
 owner.append(access);
 if(owner.parentNode===app)app.append(owner);
 // Popup shell uses the original authenticated controls, never clones
 // photos, room permissions, resets, or financial actions.
 const receiverPanel=make('div','rr-menu-overlay');receiverPanel.id='redlineReceiverMenuOverlay';receiverPanel.hidden=true;
 const panelCard=make('section','rr-menu-panel');panelCard.setAttribute('role','dialog');panelCard.setAttribute('aria-modal','true');panelCard.setAttribute('aria-labelledby','rrMenuPanelTitle');
 const panelHeader=make('header','rr-menu-panel-header');
 const panelHeading=make('h2','','Room tools');panelHeading.id='rrMenuPanelTitle';
 const panelClose=button('×',()=>closeReceiverPanel(),'rr-menu-panel-close');panelClose.setAttribute('aria-label','Close pop-up and return to chat');
 const panelContent=make('div','rr-menu-panel-content');panelContent.tabIndex=-1;
 panelHeader.append(panelHeading,panelClose);panelCard.append(panelHeader,panelContent);receiverPanel.append(panelCard);document.body.append(receiverPanel);
 const roomToolbar=room.querySelector('.room-toolbar'),sessionTools=$('#redlineSessionTools'),scopePanel=$('#ownerLedgerScope'),uploadInfo=$('#ownerUploadInfo'),uploadStatus=$('#uploadAccessStatus'),linkCard=room.querySelector('.link-card'),helpCard=room.querySelector('.info-card'),legacyMetrics=room.querySelector('.metrics');
 const moved=new Map();let panelKind='',panelRoomId=null,panelReturnFocus=null;
 let senderGallery=null,gallerySignature='',galleryFilter='all';
 let historyDesktop=null,historySignature='',historySelected='',historySort='newest',historyStatus='all',historyPage=0,historyScope='';
 function moveIntoPanel(el){if(!el||moved.has(el)||!el.parentNode)return;const marker=document.createComment('REDLINE popup original position');el.before(marker);moved.set(el,marker);panelContent.append(el)}
 function restorePanelNodes(){for(const [el,marker] of moved){if(marker.parentNode)marker.replaceWith(el)}moved.clear()}
 function closeReceiverPanel(restoreFocus=true){
  if(receiverPanel.hidden)return;
  receiverPanel.hidden=true;restorePanelNodes();panelContent.replaceChildren();panelKind='';panelRoomId=null;
  senderGallery=null;gallerySignature='';galleryFilter='all';
  historyDesktop=null;historySignature='';historySelected='';historySort='newest';historyStatus='all';historyPage=0;historyScope='';
  for(const el of document.querySelectorAll('.rr-history-inspected'))el.classList.remove('rr-history-inspected');
  document.body.classList.remove('rr-menu-overlay-open');delete receiverPanel.dataset.panel;delete receiverPanel.dataset.stars;delete receiverPanel.dataset.historySelection;delete receiverPanel.dataset.historyBonus;
  tools.setAttribute('aria-expanded','false');
  if(restoreFocus){const target=panelReturnFocus?.isConnected&&!panelReturnFocus.closest('[hidden]')?panelReturnFocus:menuToggle;target?.focus({preventScroll:true})}
  panelReturnFocus=null;
 }
 function renderSenderGallery(s){
  if(!senderGallery||panelKind!=='review'||!s?.isOwner||s.roomId!==panelRoomId)return;
  const photos=(Array.isArray(s.photoHistory)?s.photoHistory:[]).filter(p=>p&&!p.removal_status&&!p.removed);
  const pending=photos.filter(p=>p.decision_status==='pending');
  const signature=JSON.stringify([s.roomId,s.peerName,s.archiveMode,galleryFilter,photos.map(p=>[p.id,p.image_url,p.stars,p.decision_status])]);
  if(signature===gallerySignature)return;
  gallerySignature=signature;
  const head=make('div','rr-sender-gallery-head');
  const names=make('div','rr-sender-gallery-names');
  names.append(make('h3','','Photos from '+(s.peerName||'this sender')),make('p','',photos.length+' received · '+pending.length+' awaiting review'+(s.archiveMode?' · Archive':'')));
  const filters=make('div','rr-sender-gallery-filters');filters.setAttribute('aria-label','Filter received photos');
  for(const [value,label] of [['all','All photos'],['pending','Awaiting review'],['reviewed','Reviewed']]){
   const b=button(label,()=>{galleryFilter=value;renderSenderGallery(window.BLACKCELL_REDLINE_API?.snapshot?.());senderGallery?.querySelector('[data-gallery-filter="'+value+'"]')?.focus({preventScroll:true})},'rr-history-star-button');b.dataset.galleryFilter=value;b.setAttribute('aria-pressed',String(galleryFilter===value));filters.append(b);
  }
  head.append(names,filters);
  const grid=make('div','rr-sender-gallery-grid');
  const shown=photos.filter(p=>galleryFilter==='all'||(galleryFilter==='pending'?p.decision_status==='pending':p.decision_status!=='pending'));
  if(!shown.length)grid.append(make('p','rr-gallery-empty',photos.length?'No photos match this filter.':'No photos have been received in this room yet. If the sender just uploaded, use Refresh.'));
  for(const p of shown){
   const card=make('article','rr-sender-gallery-card');
   const src=typeof p.image_url==='string'&&/^(https:\/\/|blob:|data:image\/)/i.test(p.image_url)?p.image_url:'';
   const open=button('',()=>{
    const existing=[...document.querySelectorAll('#photoEntries .photo-entry[data-redline-photo-id],#reviewQueueCurrent .photo-entry[data-redline-photo-id]')].find(el=>el.dataset.redlinePhotoId===p.id)?.querySelector('.photo-image-btn');
    if(existing&&src){existing.click();return}
    if(!src)return;
    const lightbox=$('#photoLightbox'),image=$('#lightboxImage');if(!lightbox||!image)return;
    image.src=src;image.alt='Private photograph';lightbox.hidden=false;
   },'rr-gallery-image-button');
   open.setAttribute('aria-label','Open received photograph');open.disabled=!src;
   if(src){const img=make('img');img.src=src;img.alt='Received private photograph';img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{img.hidden=true;open.disabled=true;if(!open.querySelector('.rr-gallery-unavailable'))open.append(make('span','rr-gallery-unavailable','Preview unavailable · Refresh'))});open.append(img)}
   else open.append(make('span','rr-gallery-unavailable','Preview unavailable · Refresh'));
   const meta=make('div','rr-gallery-meta'),stars=Math.max(0,Math.min(5,Number(p.stars)||0));
   meta.append(make('span','rr-gallery-rating','★'.repeat(stars)+'☆'.repeat(5-stars)),make('small','',p.decision_status==='pending'?'Awaiting review':p.decision_status==='rejected'?'Rejected':'Reviewed'));
   card.append(open,meta);grid.append(card);
  }
  senderGallery.replaceChildren(head,grid);
 }
 function buildDesktopHistory(s){
  historyDesktop=make('section','rr-history-desktop');
  historyDesktop.setAttribute('aria-label','Desktop photo history gallery');
  panelContent.insertBefore(historyDesktop,timeline);
  renderDesktopHistory(s);
 }
 function renderDesktopHistory(s){
  if(!historyDesktop||panelKind!=='history'||!s?.isOwner||s.roomId!==panelRoomId)return;
  const scope=s.roomId+'|'+String(s.archiveMode)+'|'+String(s.resetAt||'');
  if(historyScope!==scope){historyScope=scope;historySelected='';historyPage=0;historySignature=''}
  const photos=(Array.isArray(s.photoHistory)?s.photoHistory:[]).filter(p=>p&&p.decision_status!=='pending');
  const star=receiverPanel.dataset.stars||'all';
  const filtered=photos.filter(p=>(star==='all'||String(p.stars||0)===star)&&
   (historyStatus==='all'||(historyStatus==='removed'?Boolean(p.removal_status||p.removed):!p.removal_status&&!p.removed&&p.decision_status===historyStatus)));
  const date=p=>Date.parse(p.created_at)||0;
  filtered.sort((a,b)=>historySort==='rating'?(Number(b.stars||0)-Number(a.stars||0)||date(b)-date(a)):historySort==='oldest'?date(a)-date(b):date(b)-date(a));
  const pageSize=48,pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  historyPage=Math.min(Math.max(0,historyPage),pages-1);
  const current=filtered.slice(historyPage*pageSize,(historyPage+1)*pageSize);
  if(!current.some(p=>p.id===historySelected))historySelected=current[0]?.id||'';
  // The inspection pane always displays the original authenticated record.
  // No duplicated payment, like, deletion or photo decision handlers.
  for(const el of document.querySelectorAll('#photoEntries .photo-entry[data-redline-photo-id]'))
   el.classList.toggle('rr-history-inspected',el.dataset.redlinePhotoId===historySelected);
  receiverPanel.dataset.historySelection=historySelected?'yes':'no';
  const sig=JSON.stringify([scope,s.peerName,star,historyStatus,historySort,historyPage,historySelected,filtered.length,photos.length,current.map(p=>[p.id,p.image_url,p.stars,p.decision_status,p.amount_cents,p.settled_at,p.removal_status])]);
  if(sig===historySignature)return;
  historySignature=sig;
  const focusKey=document.activeElement?.dataset?.historyFocus;
  const scrollTop=historyDesktop.scrollTop;
  const top=make('div','rr-history-desktop-head');
  const identity=make('div','rr-history-desktop-identity');
  identity.append(make('h3','','Photos from '+(s.peerName||'this sender')),make('p','',filtered.length+' matching · '+photos.length+' reviewed'+(s.archiveMode?' · Archive':'')));
  const settings=make('div','rr-history-desktop-controls');
  function dropdown(label,key,items,value,onChange){
   const l=make('label','rr-history-dropdown'),sel=make('select');sel.dataset.historyFocus=key;
   l.append(make('span','',label));
   for(const [v,name] of items){const opt=make('option','',name);opt.value=v;sel.append(opt)}
   sel.value=value;sel.addEventListener('change',()=>{onChange(sel.value);historyPage=0;renderDesktopHistory(window.BLACKCELL_REDLINE_API?.snapshot?.())});l.append(sel);return l;
  }
  settings.append(dropdown('Status','status',[['all','All reviewed'],['accepted','Accepted'],['rejected','Rejected'],['removed','Removed records']],historyStatus,v=>historyStatus=v),
   dropdown('Sort','sort',[['newest','Newest first'],['oldest','Oldest first'],['rating','Highest rated']],historySort,v=>historySort=v));
  top.append(identity,settings);
  const grid=make('div','rr-history-desktop-grid');
  for(const p of current){
   const selected=p.id===historySelected,removed=Boolean(p.removal_status||p.removed);
   const tile=button('',()=>{historySelected=p.id;receiverPanel.dataset.historyBonus='false';receiverPanel.querySelector('.rr-history-bonus-toggle')?.setAttribute('aria-pressed','false');renderDesktopHistory(window.BLACKCELL_REDLINE_API?.snapshot?.())},'rr-history-tile');
   tile.dataset.historyFocus='photo:'+p.id;tile.setAttribute('aria-pressed',String(selected));tile.setAttribute('aria-label','Inspect photo '+p.id.slice(0,8));
   const visual=make('div','rr-history-tile-image');
   const src=!removed&&typeof p.image_url==='string'&&/^(https:\/\/|blob:|data:image\/)/i.test(p.image_url)?p.image_url:'';
   if(src){const img=make('img');img.src=src;img.alt='Reviewed private photo';img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{img.hidden=true;visual.append(make('span','','Preview unavailable'))},{once:true});visual.append(img)}
   else visual.append(make('span','',removed?'Photo removed':'Preview loading'));
   const info=make('div','rr-history-tile-info'),stars=Math.max(0,Math.min(5,Math.trunc(Number(p.stars)||0)));
   const rating=make('span','rr-history-tile-stars','★'.repeat(stars)+'☆'.repeat(5-stars));
   rating.setAttribute('aria-label',stars+' out of 5 stars');
   const tag=make('small','rr-history-tile-state',removed?'Removed':p.decision_status==='rejected'?'Rejected':'Accepted');tag.dataset.state=removed?'removed':p.decision_status;
   const dateText=make('small','rr-history-tile-date',date(p)?new Date(date(p)).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'');
   info.append(rating,tag,dateText);tile.append(visual,info);grid.append(tile);
  }
  if(!current.length)grid.append(make('p','rr-gallery-empty','No reviewed photographs match these filters.'));
  const pager=make('div','rr-history-pager');
  const prev=button('← Previous',()=>{historyPage--;renderDesktopHistory(window.BLACKCELL_REDLINE_API?.snapshot?.())},'rr-history-star-button');prev.disabled=historyPage===0;prev.dataset.historyFocus='previous';
  const next=button('Next →',()=>{historyPage++;renderDesktopHistory(window.BLACKCELL_REDLINE_API?.snapshot?.())},'rr-history-star-button');next.disabled=historyPage+1>=pages;next.dataset.historyFocus='next';
  pager.append(prev,make('span','','Page '+(historyPage+1)+' of '+pages),next);
  historyDesktop.replaceChildren(top,grid,pager);
  historyDesktop.scrollTop=scrollTop;
  if(focusKey){[...historyDesktop.querySelectorAll('[data-history-focus]')].find(el=>el.dataset.historyFocus===focusKey)?.focus({preventScroll:true})}
 }
 function openReceiverPanel(kind){
  const s=window.BLACKCELL_REDLINE_API?.snapshot?.();
  if(!popupMode||app.hidden||room.hidden||!s?.isOwner||!s.roomId)return;
  if(!['review','history','access','tools','earnings','duplicates'].includes(kind))return;
  if(!receiverPanel.hidden&&panelKind===kind)return;
  const priorFocus=receiverPanel.hidden?document.activeElement:panelReturnFocus;
  closeReceiverPanel(false);panelReturnFocus=priorFocus;
  panelKind=kind;panelRoomId=s.roomId;receiverPanel.dataset.panel=kind;
  panelHeading.textContent={review:'Incoming Photos',history:'Photo History',access:'Rooms & Access',tools:'Room Tools',earnings:'Earnings & Records',duplicates:'Duplicate Protection'}[kind];
  if(kind==='review'||kind==='history'){
   // Reset the legacy financial filter on every menu entry. The star filter
   // is scoped only to this popup and never edits the photo rating.
   moveIntoPanel(timeline);
   const targetFilter='all';
   timeline?.querySelector('[data-photo-filter="'+targetFilter+'"]')?.click();
   if(kind==='history'){
    const filter=make('div','rr-history-star-filter');filter.setAttribute('aria-label','Filter photo history by star rating');
    filter.append(make('span','','RATING'));
    for(const value of ['all','0','1','2','3','4','5']){
     const b=button(value==='all'?'All':value==='0'?'0 ★ · Unrated':value+' ★',()=>{
      receiverPanel.dataset.stars=value;
      for(const option of filter.querySelectorAll('button'))option.setAttribute('aria-pressed',String(option===b));
      historyPage=0;renderDesktopHistory(window.BLACKCELL_REDLINE_API?.snapshot?.());
     },'rr-history-star-button');
     b.setAttribute('aria-pressed',String(value==='all'));filter.append(b);
    }
    receiverPanel.dataset.stars='all';panelContent.prepend(filter);
    const bonusButton=button('Bonus progress',()=>{
     const open=receiverPanel.dataset.historyBonus!=='true';
     receiverPanel.dataset.historyBonus=String(open);
     bonusButton.setAttribute('aria-pressed',String(open));
    },'rr-history-star-button rr-history-bonus-toggle');
    bonusButton.setAttribute('aria-pressed','false');
    receiverPanel.dataset.historyBonus='false';filter.append(bonusButton);
    buildDesktopHistory(s);
   }else{
    senderGallery=make('section','rr-sender-gallery');senderGallery.setAttribute('aria-label','Photos received from the selected sender');
    panelContent.prepend(senderGallery);renderSenderGallery(s);
    const queueHeading=make('h3','rr-gallery-review-heading','Next photo awaiting review');
    if(!s.archiveMode&&timeline)timeline.before(queueHeading);
   }
   if(kind==='review'&&s.archiveMode)panelContent.prepend(make('p','rr-menu-panel-note','Archived records are read-only. Return to the current session in Room Tools to review incoming photos.'));
   if(kind==='review'&&!timeline)panelContent.append(make('p','rr-menu-panel-note','Photo review is unavailable.'));
  }else if(kind==='duplicates'){
   buildDuplicatePanel(s);
  }else if(kind==='access'){
   for(const el of [access,scopePanel,uploadInfo,linkCard])moveIntoPanel(el);
   void loadAccess(true);
  }else if(kind==='tools'){
   for(const el of [roomToolbar,sessionTools,uploadStatus,helpCard])moveIntoPanel(el);
   tools.setAttribute('aria-expanded','true');
  }else moveIntoPanel(legacyMetrics);
  setMenuOpen(false);receiverPanel.hidden=false;document.body.classList.add('rr-menu-overlay-open');panelContent.scrollTop=0;panelClose.focus({preventScroll:true});
 }
 receiverPanel.addEventListener('click',e=>{if(e.target===receiverPanel)closeReceiverPanel()});
 document.addEventListener('keydown',e=>{
  if(receiverPanel.hidden||document.querySelector('dialog[open]')||!$('#photoLightbox')?.hidden)return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeReceiverPanel();return}
  if(e.key==='Tab'){const items=[...panelCard.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));if(!items.length){e.preventDefault();panelClose.focus({preventScroll:true});return}const first=items[0],last=items[items.length-1];if(e.shiftKey&&(document.activeElement===first||!panelCard.contains(document.activeElement))){e.preventDefault();last.focus({preventScroll:true})}else if(!e.shiftKey&&(document.activeElement===last||!panelCard.contains(document.activeElement))){e.preventDefault();first.focus({preventScroll:true})}}
 },true);
 window.addEventListener('blackcell:redline:popup-section',e=>{if(popupMode){const key=e.detail?.key;openReceiverPanel(key==='review'?'review':key==='photos'?'history':'tools')}});
 // The canonical queue can request history without activating the old
 // below-chat navigation or changing the page scroll position.
 originalReview?.addEventListener('click',e=>{const b=e.target.closest?.('button');if(popupMode&&b?.textContent?.trim().toUpperCase().includes('VIEW REVIEWED PHOTOS')){e.preventDefault();e.stopImmediatePropagation();openReceiverPanel('history')}},true);
 function buildDuplicatePanel(initial){
  const section=make('section','rr-duplicate-tools');
  const summary=make('p','rr-menu-panel-note','Scan the selected sender’s currently loaded photos for exact byte-for-byte duplicates. This does not download additional Bunny files, delete photos, change prices or alter payment history.');
  const status=make('p','rr-duplicate-status','Ready to scan.');status.setAttribute('role','status');
  const results=make('div','rr-duplicate-results');
  const scope=make('label','rr-duplicate-scope','Show ');
  const select=make('select','rr-duplicate-select');
  for(const [value,label] of [['duplicates','Duplicate groups'],['all','All scanned groups']]){const option=make('option','',label);option.value=value;select.append(option)}
  scope.append(select);
  let groups=[],missing=0,scanned=0;
  const bytes=n=>n>=1048576?(n/1048576).toFixed(2)+' MiB':(n/1024).toFixed(1)+' KiB';
  const render=()=>{
   results.replaceChildren();
   const dup=groups.filter(g=>g.photos.length>1);
   const savings=dup.reduce((n,g)=>n+g.bytes*(g.photos.length-1),0);
   status.textContent=scanned+' scanned · '+dup.length+' duplicate groups · '+missing+' unavailable or not cached · '+bytes(savings)+' estimated redundant photo bytes (not verified storage savings).';
   const visible=select.value==='all'?groups:dup;
   if(!visible.length)results.append(make('p','rr-menu-panel-note','No matching groups in the scanned photos.'));
   for(const g of visible){
    const card=make('article','rr-duplicate-group');
    card.append(make('strong','',g.photos.length+' matching submission'+(g.photos.length===1?'':'s')),make('small','',bytes(g.bytes)+' per image · '+bytes(g.bytes*(g.photos.length-1))+' possible duplicate bytes'));
    const thumbs=make('div','rr-duplicate-thumbs');
    for(const p of g.photos){const item=make('div','rr-duplicate-thumb');const img=make('img');img.src=p.image_url;img.alt='Matching private photo';img.loading='lazy';item.append(img,make('small','',p.id.slice(0,8).toUpperCase()+' · '+(p.stars||0)+'/5 ★ · '+p.decision_status));thumbs.append(item)}
    card.append(thumbs);results.append(card);
   }
  };
  const scan=button('Scan loaded photos',async()=>{
   const s=window.BLACKCELL_REDLINE_API?.snapshot?.();
   if(!s?.isOwner||s.roomId!==initial.roomId||s.archiveMode!==initial.archiveMode)return;
   const current=()=>section.isConnected&&panelKind==='duplicates'&&window.BLACKCELL_REDLINE_API?.snapshot?.()?.roomId===s.roomId&&window.BLACKCELL_REDLINE_API?.snapshot?.()?.archiveMode===s.archiveMode;
   if(!crypto.subtle){status.textContent='Secure fingerprinting is not supported in this browser.';return}
   scan.disabled=true;results.replaceChildren();groups=[];missing=0;scanned=0;
   const map=new Map(),photos=(s.photoHistory||[]).filter(p=>!p.removal_status&&!p.removed);
   try{
    for(let i=0;i<photos.length;i++){
     if(!current())return;
     const p=photos[i];status.textContent='Scanning '+(i+1)+' of '+photos.length+' loaded photos…';
     if(typeof p.image_url!=='string'||!(p.image_url.startsWith('blob:')||p.image_url.startsWith('data:image/'))){missing++;continue}
     try{
      const response=await fetch(p.image_url);if(!response.ok)throw Error('Image unavailable');const blob=await response.blob();
      if(!blob.size||blob.size>12*1024*1024)throw Error('Unsupported image size');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
      if(!current())return;
      const group=map.get(hash)||{bytes:blob.size,photos:[]};group.photos.push(p);map.set(hash,group);scanned++;
     }catch(_){missing++}
    }
    if(!current())return;groups=Array.from(map.values()).sort((a,b)=>b.photos.length-a.photos.length);render();
   }finally{scan.disabled=false}
  },'rr-history-star-button');
  select.addEventListener('change',()=>{if(scanned||missing)render()});
  const actions=make('div','rr-duplicate-actions');actions.append(scan,scope);
  section.append(make('h3','','Exact duplicate scan'),summary,actions,status,results,
   make('p','rr-menu-panel-note','Identical repeat selections in a new sender upload batch are skipped after the first successful upload. Intentional resubmissions remain separate. Cross-batch reuse, visual-similarity matching and physical storage cleanup are not enabled.'));
  panelContent.append(section);
 }
 const layoutMenu=button('Photo Layout',()=>{setMenuOpen(false);window.dispatchEvent(new Event('blackcell:redline:open-photo-layout'))},'rr-nav-button');layoutMenu.dataset.rrMenuIcon='photos';if(popupMode)menuItems.insertBefore(layoutMenu,tools);
 const duplicateMenu=button('Duplicate Protection',()=>openReceiverPanel('duplicates'),'rr-nav-button');
 duplicateMenu.dataset.rrMenuIcon='photos';
 if(popupMode)menuItems.insertBefore(duplicateMenu,tools);
 const earningsMenu=button('Earnings & Records',()=>openReceiverPanel('earnings'),'rr-nav-button');earningsMenu.dataset.rrMenuIcon='money';
 if(popupMode)menuItems.insertBefore(earningsMenu,tools);
 function sync(){
  const visible=!app.hidden&&!owner.hidden;
  dashboard.hidden=!visible;
  document.body.classList.toggle('bc-redline-receiver',visible);
  const verifiedDot=$('.rr-brand-verified-dot');
  const session=window.BLACKCELL_REDLINE_API?.snapshot?.();
  const popupActive=popupMode&&visible&&!room.hidden&&session?.isOwner===true&&Boolean(session.roomId);
  document.body.classList.toggle('rr-popup-menu-mode',popupActive);
  if(!receiverPanel.hidden&&(!popupActive||panelRoomId!==session?.roomId))closeReceiverPanel(false);
  allRooms.hidden=!(session?.isOwner&&session.roomId&&typeof window.BLACKCELL_REDLINE_API?.returnToRooms==='function');roomsHome.hidden=allRooms.hidden;
  if(verifiedDot){
   const verified=visible&&session?.isOwner===true;
   verifiedDot.hidden=!verified;
   const state=!verified||room.hidden||!session?.roomId?'idle':session.roomActive===true&&!session.archiveMode?'active':session.roomActive===false?'ended':'idle';
   const description=state==='active'?'Verified · Active private room':state==='ended'?'Verified · Session ended':'Verified · No active room';
   if(verifiedDot.dataset.state!==state)verifiedDot.dataset.state=state;
   if(verifiedDot.getAttribute('aria-label')!==description){verifiedDot.setAttribute('aria-label',description);verifiedDot.title=description}
  }
  if(!visible){
   document.body.classList.remove('rr-room-tools-open');
   if(endSession.parentNode!==header)header.insertBefore(endSession,endSessionAnchor);
   if(headerMenuGroup.parentNode!==header){setMenuOpen(false);header.insertBefore(headerMenuGroup,endSession)}
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
  endSession.disabled=!hasRoom||session?.roomActive!==true||session?.archiveMode===true;
  const endLabel=hasRoom&&session?.roomActive===false?'SESSION ENDED':document.body.classList.contains('bc-ledger-mobile')?'END SESSION':'■ END SESSION';
  if(endSession.textContent!==endLabel)endSession.textContent=endLabel;
  endSession.style.opacity=endSession.disabled?'.55':'1';
  if(!hasRoom){
   document.body.classList.remove('rr-room-tools-open');
   tools.textContent='Room Tools';tools.setAttribute('aria-expanded','false');
  }
  placeWorkspace(hasRoom);
  if(senderGallery&&panelKind==='review')renderSenderGallery(session);
  if(historyDesktop&&panelKind==='history')renderDesktopHistory(session);
  const wasChatHidden=chatPanel.hidden;
  chatPanel.hidden=!hasRoom;
  if(hasRoom&&wasChatHidden)window.dispatchEvent(new Event('blackcell:redline:receiver-ready'));
  chatRoom.textContent=hasRoom?($('#activeRoomTitle')?.textContent?.trim()||'Current private room'):'Select a private room';
  if(desktopRoomName.textContent!==chatRoom.textContent)desktopRoomName.textContent=chatRoom.textContent;
  const roomState=session?.archiveMode?'ARCHIVE · READ ONLY':session?.roomActive===true?'ACTIVE':session?.roomActive===false?'CLOSED':'';
  if(desktopRoomState.textContent!==roomState)desktopRoomState.textContent=roomState;
  desktopRoomState.dataset.active=String(session?.roomActive===true&&!session?.archiveMode);
  status.textContent=hasRoom?'RECEIVER VERIFIED · PRIVATE ROOM':'RECEIVER VERIFIED · NO ROOM';
  status.classList.toggle('is-waiting',!hasRoom);
  for(const [source,output] of outputs){
   const value=document.getElementById(source);
   if(value&&output.textContent!==(value.textContent||'—'))output.textContent=value.textContent||'—';
  }
  review.disabled=history.disabled=message.disabled=!hasRoom;
  const mode=document.body.classList.contains('bc-redline-archive-view');
  dashboard.classList.toggle('rr-is-archive',mode);
  payFull.disabled=partialPay.disabled=payChoice.disabled=!hasRoom||mode||payBusy||session?.roomActive!==true;
  if(choiceDialog.open&&(!session?.isOwner||session.roomId!==choiceRoom||!session.roomActive||session.archiveMode))choiceDialog.close();
  const count=$('#reviewQueueCount')?.textContent||'';
  review.title=count?'Review queue: '+count:'Open review queue';
  historyToggle.hidden=!hasRoom||!mediaOpen;
  if(historyOpen&&hasRoom){
   historyToggle.title=pricedStage.querySelectorAll('#photoEntries>.photo-entry').length+' photo records in this room';
  }
 }
 // Fit the mobile chat to the visible viewport, not the previous 880px
 // minimum. Only measure the existing panel; never remount the chat.
 let fitFrame=0;
 function fitMobileChat(){
  fitFrame=0;
  if(!document.body.classList.contains('bc-ledger-mobile')||document.body.dataset.ledgerView!=='summary'||dashboard.hidden||chatPanel.hidden||room.hidden){
   dashboard.style.removeProperty('--rr-mobile-chat-height');return;
  }
  const top=dashboard.getBoundingClientRect().top;
  const viewport=window.visualViewport;
  const bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
  const next=Math.max(0,Math.floor(bottom-top))+'px';
  if(dashboard.style.getPropertyValue('--rr-mobile-chat-height')!==next)dashboard.style.setProperty('--rr-mobile-chat-height',next);
 }
 function scheduleMobileFit(){if(!fitFrame)fitFrame=requestAnimationFrame(fitMobileChat)}
 const mobileFitObserver=new MutationObserver(scheduleMobileFit);
 mobileFitObserver.observe(document.body,{attributes:true,attributeFilter:['class','data-ledger-view']});
 for(const el of [dashboard,chatPanel,room])mobileFitObserver.observe(el,{attributes:true,attributeFilter:['hidden']});
 if(window.ResizeObserver){const topbar=$('.topbar');if(topbar)new ResizeObserver(scheduleMobileFit).observe(topbar)}
 window.addEventListener('resize',scheduleMobileFit,{passive:true});
 window.visualViewport?.addEventListener('resize',scheduleMobileFit,{passive:true});
 window.visualViewport?.addEventListener('scroll',scheduleMobileFit,{passive:true});
 window.addEventListener('blackcell:redline:device-mode',scheduleMobileFit);
 scheduleMobileFit();
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
 window.addEventListener('blackcell:redline:device-mode',sync);
 window.addEventListener('resize',sync,{passive:true});
 sync();
})();