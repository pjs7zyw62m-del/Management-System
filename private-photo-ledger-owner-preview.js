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
  topText.append(make('span','bc-redline-preview-kicker','BLACKCELL REDLINE · OWNER VIEW'),make('h2','', 'Sender interface preview'));
  topText.querySelector('h2').id='redlinePreviewHeading';
  const close=make('button','bc-redline-preview-close','✕ Close');
  close.type='button';close.setAttribute('aria-label','Close sender preview');
  close.addEventListener('click',()=>dialog.close());
  top.append(topText,close);
  const controls=make('div','bc-redline-preview-controls');
  const note=make('p','bc-redline-preview-notice','PREVIEW ONLY — No photos will be sent. This does not change which account may upload.');
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
  chrome.append(make('strong','','REDLINE'),make('span','','SECURE · 2 PERSONS'));
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
  fileInput.setAttribute('aria-label','Select a local photo for preview only');
  const camera=make('span','bc-redline-preview-camera');
  camera.innerHTML='<svg width="37" height="37" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6h3l1.5-2h6l1.5 2h3A2.5 2.5 0 0 1 22 8.5v10A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5v-10A2.5 2.5 0 0 1 4.5 6Z"/><circle cx="12" cy="13" r="4"/></svg>';
  const previewImg=make('img','bc-redline-preview-photo');
  previewImg.hidden=true;previewImg.alt='Locally selected photo — preview only';
  const selectLabel=make('strong','','CHOOSE A PHOTO');
  const fileHelp=make('small','','JPEG, PNG, WebP or HEIC · up to 12 MB');
  const fileName=make('small','','No photo selected');
  fileArea.append(fileInput,camera,previewImg,selectLabel,fileHelp,fileName);
  const submit=make('button','bc-redline-preview-submit','POST PHOTO — PREVIEW ONLY');
  submit.type='button';submit.disabled=true;
  const thread=make('div','bc-redline-preview-thread');
  thread.append(make('h4','','Private Chat'),make('small','','OWNER + SENDER · TWO-WAY MESSAGES'));
  thread.append(make('div','bc-redline-preview-bubble is-sender','I just posted a new photo.'));
  thread.append(make('div','bc-redline-preview-bubble is-owner','Got it. I’ll review it now.'));
  thread.append(make('div','bc-redline-preview-bubble is-sender','Thanks! Let me know what you think.'));
  const composerSample=make('div','bc-redline-preview-chat-input');
  composerSample.append(make('span','','Write a reply…'),make('span','','SEND'));
  thread.append(composerSample);
  upload.append(title,fileArea,submit,thread);
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
  const messagesPanel=make('section','bc-redline-preview-message bc-redline-preview-messages');messagesPanel.hidden=true;
  messagesPanel.append(make('h4','','REDLINE Messages'));
  messagesPanel.append(make('p','','EXAMPLE ONLY — private sender and owner chat appears here after the room is assigned.'));
  const sampleIncoming=make('div','bc-redline-preview-bubble is-owner','Received. Reviewing now.');
  const sampleOutgoing=make('div','bc-redline-preview-bubble is-sender','Just sent two photos.');
  const sampleCard=make('div','bc-redline-preview-system-card','Photo approved — amount appears here');
  messagesPanel.append(sampleOutgoing,sampleIncoming,sampleCard);
  const sampleComposer=make('div','bc-redline-preview-sample-composer','Message REDLINE…    ·    Preview only');
  messagesPanel.append(sampleComposer);
  section.append(upload,earningsPanel,messagesPanel);
  const nav=make('nav','bc-redline-preview-nav');nav.setAttribute('aria-label','Preview sender navigation');
  const tabs=[
    ['upload','Photos & Chat',upload],['earnings','Earnings',earningsPanel]
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

  history.textContent='VIEW EARNINGS';
  history.addEventListener('click',()=>selectTab('earnings'));
  let url=null;
  function resetLocalPhoto(){
    if(url){URL.revokeObjectURL(url);url=null}
    previewImg.removeAttribute('src');previewImg.hidden=true;
  }
  fileInput.addEventListener('change',()=>{
    resetLocalPhoto();
    const f=fileInput.files?.[0];
    fileName.textContent=f?f.name:'No photo selected';
    if(!f)return;
    url=URL.createObjectURL(f);
    previewImg.src=url;previewImg.hidden=false;
    previewImg.onerror=()=>{previewImg.hidden=true};
  });
  dialog.addEventListener('close',()=>{resetLocalPhoto();fileInput.value='';fileName.textContent='No photo selected'});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
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
    setDevice('phone');selectTab('upload');dialog.showModal();
  }
  for(const [host,name] of [[setup,'redlineSetupPreviewButton'],[ownerInfo,'redlineOwnerPreviewButton']]){
    const button=make('button','bc-redline-open-sender-preview','👁  PREVIEW SENDER VIEW');
    button.id=name;button.type='button';
    button.addEventListener('click',open);
    host.append(button);
  }
})();