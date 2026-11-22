/* BLACKCELL REDLINE — owner-only sender preview
 * Read-only visualization: never touches the real #employeeUpload element,
 * file upload handler, account roles, storage or settlements. The launcher
 * exists only inside already owner-restricted sections.
 */
(()=>{
  'use strict';
  const $=(q,root=document)=>root.querySelector(q);
  const app=$('#ledgerApp');
  const setup=$('#ownerSetup'),ownerInfo=$('#ownerUploadInfo');
  if(!app||!setup||!ownerInfo)return;
  const make=(tag,cls,content)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(content!==undefined)el.textContent=content;
    return el;
  };
  const visible=el=>!!el&&!el.hidden;
  // No role mutation and no access to the employee-only upload handler.
  const ownerVisible=()=>visible(app)&&(visible(setup)||visible(ownerInfo));
  const dialog=make('dialog','bc-redline-sender-preview');
  dialog.id='redlineSenderPreviewDialog';
  dialog.setAttribute('aria-labelledby','redlinePreviewHeading');
  const top=make('header','bc-redline-preview-top');
  const topText=make('div','bc-redline-preview-top-text');
  topText.append(make('span','bc-redline-preview-kicker','BLACKCELL REDLINE · OWNER VIEW'),make('h2','', 'Sender Messenger Preview'));
  topText.querySelector('h2').id='redlinePreviewHeading';
  const close=make('button','bc-redline-preview-close','✕ Close');
  close.type='button';close.setAttribute('aria-label','Close sender preview');
  close.addEventListener('click',()=>dialog.close());
  top.append(topText,close);
  const controls=make('div','bc-redline-preview-controls');
  const note=make('p','bc-redline-preview-notice','READ-ONLY OS PREVIEW · No photos, messages, payments or requests will be submitted.');
  const views=make('div','bc-redline-preview-devices');
  const phone=make('button','is-active','Phone');
  const tablet=make('button','','Tablet');
  for(const button of [phone,tablet])button.type='button';
  views.append(phone,tablet);
  controls.append(note,views);
  const stage=make('div','bc-redline-preview-stage');
  const device=make('div','bc-redline-preview-phone');
  device.dataset.device='phone';
  const chrome=make('div','bc-redline-preview-chrome');
  chrome.append(make('strong','','BLACKCELL REDLINE'),make('span','','SENDER · PRIVATE CHAT'));
  const main=make('div','bc-redline-preview-body');
  const identity=make('div','bc-redline-preview-identity');
  identity.append(make('span','','BLACKCELL / PRIVATE CHANNEL'));
  const facts=make('div','bc-redline-preview-facts');
  const pending=make('div','',''),owed=make('div','','');
  const pendingValue=make('strong','','0'),owedValue=make('strong','','$0.00');
  pending.append(make('span','','AWAITING REVIEW'),pendingValue);
  owed.append(make('span','','BALANCE'),owedValue);
  facts.append(pending,owed);
  const section=make('div','bc-redline-preview-section');
  const actions=make('div','bc-redline-preview-actions');
  const choose=make('button','bc-redline-preview-choose','+ ADD PHOTO');
  const history=make('button','bc-redline-preview-history','VIEW HISTORY');
  for(const el of [choose,history])el.type='button';
  actions.append(history);
  const room=make('div','bc-redline-preview-room');
  const roomName=make('span','','PRIVATE ROOM');
  room.append(make('span','','●'),roomName,make('span','','TWO-PERSON ACCESS'));
  identity.append(facts,actions,room);
  const upload=make('section','bc-redline-preview-upload');
  const title=make('h4','','Post a Private Photo');
  const fileArea=make('label','bc-redline-preview-file-area');
  const fileInput=make('input','bc-redline-preview-file-input');
  fileInput.type='file';fileInput.accept='image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
  fileInput.setAttribute('aria-label','Try choosing a photo in this read-only demo; no upload occurs');
  const camera=make('span','bc-redline-preview-camera');
  camera.innerHTML='<svg width="37" height="37" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6h3l1.5-2h6l1.5 2h3A2.5 2.5 0 0 1 22 8.5v10A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5v-10A2.5 2.5 0 0 1 4.5 6Z"/><circle cx="12" cy="13" r="4"/></svg>';
  const selectLabel=make('strong','','CHOOSE PHOTO · AUTO SEND');
  const fileHelp=make('small','','Live senders upload immediately · this preview never uploads');
  const fileName=make('small','','No file sent in this preview');
  fileArea.append(fileInput,camera,selectLabel,fileHelp,fileName);
  const thread=make('div','bc-redline-preview-thread');
  thread.append(make('h4','','Chadwick · Private Chat'),make('small','','● SECURE SESSION · TWO-WAY MESSAGES · PREVIEW ONLY'));
  thread.append(make('div','bc-redline-preview-bubble is-sender','I just posted a new photo.'));
  thread.append(make('div','bc-redline-preview-bubble is-owner','Got it. I’ll review it now.'));
  thread.append(make('div','bc-redline-preview-bubble is-sender','Thanks! Let me know what you think.'));
  thread.append(make('div','bc-redline-preview-receipt','✓✓ Read · Example only'),
   make('div','bc-redline-preview-typing','Sender is typing… · Example only'));
  const composerSample=make('div','bc-redline-preview-chat-input');
  composerSample.append(make('span','','＋  iMessage (REDLINE)…'),make('span','','➤'));
  thread.append(composerSample);
  
  // The OS preview mirrors the real sender conversation-first messenger.
  // All controls in this owner-only preview are non-transactional.
  const liveStrip=make('details','bc-redline-preview-live-strip');
  const liveSummary=make('summary','bc-redline-preview-live-summary');
  const stripStats={};
  for(const [key,label] of [['approved','APPROVED'],['owed','OUTSTANDING'],['paid','RECORDED PAID']]){
   const cell=make('div','bc-redline-preview-live-cell');
   cell.append(make('small','',label));
   const value=make('strong','','—');
   stripStats[key]=value;cell.append(value);liveSummary.append(cell);
  }
  const liveDetail=make('div','bc-redline-preview-live-detail');
  const pendingHint=make('span','','0 photos awaiting review');
  liveDetail.append(make('span','','Live room summary · tap to expand'),pendingHint);
  liveStrip.append(liveSummary,liveDetail);
  const timerDemo=make('div','bc-redline-preview-timer-demo');
  timerDemo.append(make('span','','◷ DEMO TIMER · $0.50/min'),
   make('strong','','00:03:27'),
   make('small','','Sample only · actual timer comes from the room'));
  const firstBubble=thread.querySelector('.bc-redline-preview-bubble');
  thread.insertBefore(timerDemo,firstBubble);
  const photoDrawer=make('details','bc-redline-preview-photo-drawer');
  photoDrawer.append(make('summary','bc-redline-preview-drawer-heading','＋ SEND PHOTOS ANYTIME'),title,fileArea);
  const reviewQueue=make('section','bc-redline-preview-review-queue');
  reviewQueue.append(make('h4','','Photo Submission Status'),
   make('p','','EXAMPLE ONLY · New photos can be submitted while others await review.'));
  for(const [number,status,style,description] of [
    ['001','AWAITING REVIEW','pending','Sent 9:13 PM · Pending'],
    ['002','APPROVED','approved','$15.00 approved · awaiting payment'],
    ['003','PAID','paid','$25.00 · see recorded payment date']
  ]){
   const row=make('div','bc-redline-preview-queue-row '+style);
   const icon=make('span','bc-redline-preview-queue-icon',style==='pending'?'◷':style==='approved'?'★':'✓');
   const info=make('div','bc-redline-preview-queue-info');
   info.append(make('strong','','PHOTO '+number+' · '+status),make('small','',description));
   row.append(icon,info);reviewQueue.append(row);
  }
  upload.replaceChildren(liveStrip,thread,photoDrawer,reviewQueue);

  // Preview matches the approved three-section sender screen. All values
  // are read-only and the sample conversation never accesses real messages.
  const earningsPanel=make('section','bc-redline-preview-message bc-redline-preview-earnings');earningsPanel.hidden=true;
  earningsPanel.append(make('h4','','What You Earn'));
  const lines=make('div','bc-redline-preview-moneyrows');
  const earnedValues={};
  for(const [key,label] of [['pending','Pending review'],['owed','Approved / owed'],
                            ['paid','Recorded paid'],['total','Total approved']]){
    const row=make('div','bc-redline-preview-moneyrow');
    row.append(make('span','',label));
    const amount=make('strong','','—');
    earnedValues[key]=amount;row.append(amount);lines.append(row);
  }
  earningsPanel.append(lines,make('p','','Amounts are taken from this selected private room when available. No transfers happen in REDLINE.'));
  const viewingPanel=make('section','bc-redline-preview-message bc-redline-preview-current-viewing');viewingPanel.hidden=true;
  viewingPanel.append(make('h4','','Currently Viewing'),
   make('p','','The receiver-selected private photo is visible here on the real sender device.'));
  const viewingPreview=make('div','bc-redline-preview-current-photo');
  viewingPanel.append(viewingPreview);
  const historyPanel=make('section','bc-redline-preview-message bc-redline-preview-history');historyPanel.hidden=true;
  historyPanel.append(make('h4','','Photo History'),
   make('p','','Every sent photo with ratings and prices. Resend needs 5 stars AND at least $0.01.'));
  const historyPreviewList=make('div','bc-redline-preview-photo-list');
  historyPanel.append(historyPreviewList);
  const topPicksPanel=make('section','bc-redline-preview-message bc-redline-preview-history');topPicksPanel.hidden=true;
  topPicksPanel.append(make('h4','','5-Star Photos'),
   make('p','','Receiver-rated top picks. Approved originals priced $0.01 or more are eligible to resend.'));
  const picksPreviewList=make('div','bc-redline-preview-photo-list');
  topPicksPanel.append(picksPreviewList);
  const messagesPanel=make('section','bc-redline-preview-message bc-redline-preview-messages');messagesPanel.hidden=true;
  messagesPanel.append(make('h4','','REDLINE Messages'));
  messagesPanel.append(make('p','','EXAMPLE ONLY — private sender and owner chat appears here after the room is assigned.'));
  const sampleIncoming=make('div','bc-redline-preview-bubble is-owner','Received. Reviewing now.');
  const sampleOutgoing=make('div','bc-redline-preview-bubble is-sender','Just sent two photos.');
  const sampleCard=make('div','bc-redline-preview-system-card','Photo approved — amount appears here');
  messagesPanel.append(sampleOutgoing,sampleIncoming,sampleCard);
  const sampleComposer=make('div','bc-redline-preview-sample-composer','Message REDLINE…    ·    Preview only');
  messagesPanel.append(sampleComposer);

  const paydayPanel=make('section','bc-redline-preview-message bc-redline-preview-payday');
  paydayPanel.hidden=true;
  paydayPanel.append(make('h4','','Payday & Withdrawals'),
    make('p','','PREVIEW ONLY - payday and withdrawal rules are not yet configured.'));
  const paydayGrid=make('div','bc-redline-preview-payday-grid');
  for(const [label,value] of [['Example payday','Every Friday'],['Next payday','Not configured'],['Example minimum','$25.00'],['Example maximum','$200.00']]){
    const item=make('div','bc-redline-preview-payday-fact');
    item.append(make('small','',label),make('strong','',value));
    paydayGrid.append(item);
  }
  const paymentDates=make('div','bc-redline-preview-payment-dates');
  paydayPanel.append(paydayGrid,make('h5','','RECORDED PAYMENT DATES'),paymentDates);
  const request=make('button','bc-redline-preview-request','REQUEST WITHDRAWAL - PREVIEW ONLY');
  request.type='button';request.disabled=true;
  paydayPanel.append(request,make('small','','REDLINE does not transfer funds or enforce withdrawal limits.'));
  section.append(upload,viewingPanel,earningsPanel,historyPanel,topPicksPanel,paydayPanel);
  const nav=make('nav','bc-redline-preview-nav');nav.setAttribute('aria-label','Preview sender navigation');
  const tabs=[
    ['upload','Messages',upload],['viewing','Viewing',viewingPanel],
    ['earnings','Earnings',earningsPanel],['history','History',historyPanel],
    ['five-star','5 Stars',topPicksPanel],['payday','Payday',paydayPanel]
  ];
  function selectTab(key){
    for(const [id,label,panel] of tabs){
      const active=id===key;
      panel.hidden=!active;
      const tab=nav.querySelector('[data-tab="'+id+'"]');
      tab.classList.toggle('is-active',active);
      if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
    }
    device.scrollTop=0;
  }
  for(const [key,label] of tabs){
    const tab=make('button','',label);tab.type='button';tab.dataset.tab=key;
    tab.addEventListener('click',()=>selectTab(key));nav.append(tab);
  }
  main.append(identity,section);
  device.append(chrome,main,nav);stage.append(device);
  dialog.append(top,controls,stage);document.body.append(dialog);
  function setDevice(next){
    device.dataset.device=next;
    for(const [button,name]of [[phone,'phone'],[tablet,'tablet']]){
      const yes=next===name;
      button.classList.toggle('is-active',yes);
      button.setAttribute('aria-pressed',String(yes));
    }
  }
  phone.addEventListener('click',()=>setDevice('phone'));
  tablet.addEventListener('click',()=>setDevice('tablet'));

  history.textContent='VIEW PHOTO HISTORY';
  history.addEventListener('click',()=>selectTab('history'));
  // A sender can also reach Earnings through the dedicated preview tab.
  // Read-only design example: never upload or display a local photo.
  fileInput.addEventListener('change',()=>{
    fileName.textContent=fileInput.files?.length
      ?'PREVIEW ONLY — live REDLINE would send immediately. Nothing was uploaded here.'
      :'No file sent in this preview';
    fileInput.value='';
  });
  dialog.addEventListener('close',()=>{
    fileInput.value='';fileName.textContent='No file sent in this preview';
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  function renderPreviewCurrentlyViewing(){
   viewingPreview.replaceChildren();
   const snap=window.BLACKCELL_REDLINE_API?.snapshot?.();
   const id=$('#reviewQueueCurrent .photo-entry[data-redline-photo-id]')?.dataset.redlinePhotoId;
   const photo=Array.isArray(snap?.photoHistory)?snap.photoHistory.find(p=>p.id===id):null;
   if(!id||!photo){
    viewingPreview.append(make('p','','PREVIEW ONLY · No live photo selected for this room.'));
    return;
   }
   viewingPreview.append(make('strong','','RECEIVER VIEWING · PHOTO '+id.slice(0,8).toUpperCase()));
   if(typeof photo.image_url==='string'&&(photo.image_url.startsWith('https://')||photo.image_url.startsWith('blob:'))){
    const img=make('img','bc-redline-preview-current-image');img.src=photo.image_url;
    img.alt='Receiver-selected private photograph';
    img.loading='lazy';img.addEventListener('error',()=>{img.hidden=true});
    viewingPreview.append(img);
   }else viewingPreview.append(make('p','','Private photo preview loading…'));
  }
  function renderPreviewPhotoHistory(){
   const snap=window.BLACKCELL_REDLINE_API?.snapshot?.();
   const real=Array.isArray(snap?.photoHistory)?snap.photoHistory:[];
   const samples=visible($('#activeRoom'))?real:[
    {id:'SAMPLE001',stars:5,amount_cents:75,decision_status:'accepted',resubmissionAllowed:true,caption:'Sample top pick'},
    {id:'SAMPLE002',stars:3,amount_cents:25,decision_status:'accepted',resubmissionAllowed:false,caption:'Sample photo'},
    {id:'SAMPLE003',stars:5,amount_cents:0,decision_status:'accepted',resubmissionAllowed:false,caption:'Below minimum'}
   ];
   for(const [target,items] of [[historyPreviewList,samples],[picksPreviewList,samples.filter(p=>p.stars===5)]]){
    target.replaceChildren();
    if(!items.length){target.append(make('p','bc-redline-preview-history-empty','No photos have been sent in this room yet.'));continue}
    for(const p of items.slice(0,60)){
     const row=make('div','bc-redline-preview-history-row');
     if(typeof p.image_url==='string'&&(p.image_url.startsWith('https://')||p.image_url.startsWith('blob:'))){
      const img=make('img','bc-redline-preview-history-photo');
      img.src=p.image_url;img.alt='Private photo '+String(p.id).slice(0,8);
      img.loading='lazy';img.addEventListener('error',()=>{img.hidden=true});row.append(img);
     }else row.append(make('div','bc-redline-preview-history-placeholder','PRIVATE PHOTO'));
     const info=make('div','bc-redline-preview-history-details');
     const amount=Number(p.amount_cents||0);
     const price=p.decision_status==='accepted'?'$'+(amount/100).toFixed(2):String(p.decision_status||'pending').toUpperCase();
     info.append(make('strong','','PHOTO '+String(p.id||'').slice(0,8).toUpperCase()),
      make('span','bc-redline-preview-history-stars',p.stars?'★'.repeat(p.stars)+'☆'.repeat(5-p.stars):'NOT RATED'),
      make('small','',price+(p.caption?' · '+String(p.caption).slice(0,60):'')));
     const allowed=p.resubmissionAllowed===true&&p.stars===5&&amount>=1;
     const btn=make('button','bc-redline-preview-resend',
      allowed?'↻ RESEND · SENDER ONLY':p.stars!==5?'NEEDS 5 STARS':
       amount<1?'NEEDS $0.01 MINIMUM':'RESEND UNAVAILABLE');
     btn.type='button';btn.disabled=true;info.append(btn);row.append(info);target.append(row);
    }
    if(items.length>60)target.append(make('small','','Preview shows 60; sender can browse full history.'));
   }
  }
function open(){
    if(!ownerVisible())return; // Never a bypass to the real sender role.
    roomName.textContent=visible($('#activeRoom'))?$('#activeRoomTitle')?.textContent?.trim()||'PRIVATE ROOM':'Example private room';
    const activeRoom=visible($('#activeRoom'));
    pendingValue.textContent=activeRoom?$('#pendingCount')?.textContent?.trim()||'0':'0';
    owedValue.textContent=activeRoom?$('#totalOwed')?.textContent?.trim()||'$0.00':'$0.00';
    earnedValues.pending.textContent=pendingValue.textContent;
    earnedValues.owed.textContent=owedValue.textContent;
    earnedValues.paid.textContent=activeRoom?$('#totalPaid')?.textContent?.trim()||'$0.00':'$0.00';
    earnedValues.total.textContent=activeRoom?$('#totalAssigned')?.textContent?.trim()||'$0.00':'$0.00';
    stripStats.approved.textContent=earnedValues.total.textContent;
    stripStats.owed.textContent=earnedValues.owed.textContent;
    stripStats.paid.textContent=earnedValues.paid.textContent;
    pendingHint.textContent=pendingValue.textContent+' photos awaiting review';
    paymentDates.replaceChildren();
    const payments=activeRoom?window.BLACKCELL_REDLINE_API?.snapshot?.()?.paymentHistory:[];
    if(Array.isArray(payments)&&payments.length){
      for(const payment of payments.slice(0,12)){
        const stamp=new Date(payment.created_at);
        const label=Number.isNaN(stamp.valueOf())?'Date unavailable':stamp.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
        const amount=Number(payment.amount_cents||0)/100;
        const row=make('div','bc-redline-preview-payment-date');
        row.append(make('span','',label),make('strong','','$'+amount.toFixed(2)));
        paymentDates.append(row);
      }
    }else paymentDates.append(make('p','','No recorded payments for this room yet.'));
    renderPreviewPhotoHistory();renderPreviewCurrentlyViewing();
    setDevice('phone');selectTab('upload');dialog.showModal();
  }
  for(const [host,name] of [[setup,'redlineSetupPreviewButton'],[ownerInfo,'redlineOwnerPreviewButton']]){
    const button=make('button','bc-redline-open-sender-preview','👁  PREVIEW SENDER VIEW');
    button.id=name;button.type='button';
    button.addEventListener('click',open);
    host.append(button);
  }
})();