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
  identity.append(make('span','','BLACKCELL / PRIVATE CHANNEL'),make('h3','','Your next submission.'));
  const description=make('p','','Choose one photo, add a note if you wish, and send it privately to your assigned owner.');
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
  actions.append(choose,history);
  const room=make('div','bc-redline-preview-room');
  const roomName=make('span','','PRIVATE ROOM');
  room.append(make('span','','●'),roomName,make('span','','TWO-PERSON ACCESS'));
  identity.append(description,facts,actions,room);
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
  const caption=make('label','bc-redline-preview-caption','CAPTION / NOTE');
  const textarea=make('textarea','','');textarea.rows=3;textarea.maxLength=500;
  textarea.placeholder='Describe this photo, or add a short note…';
  caption.append(textarea);
  const submit=make('button','bc-redline-preview-submit','PREVIEW ONLY — SENDING DISABLED');
  submit.type='button';submit.disabled=true;
  upload.append(title,fileArea,caption,submit);
  const historyPanel=make('section','bc-redline-preview-message');historyPanel.hidden=true;
  historyPanel.append(make('h4','','Photo History'),make('p','','The sender sees photographs submitted to this private room, along with their review and payment status. The actual records stay in the authorized REDLINE page.'));
  const summaryPanel=make('section','bc-redline-preview-message');summaryPanel.hidden=true;
  summaryPanel.append(make('h4','','Private Summary'),make('p','','The sender can see the amount owed to them, assigned amounts, paid amounts, and pending decisions. This preview does not expose or duplicate records.'));
  const roomPanel=make('section','bc-redline-preview-message');roomPanel.hidden=true;
  roomPanel.append(make('h4','','Private Room'),make('p','','Only the owner and the assigned sender can access this arrangement. The owner can close the room; the sender cannot change its permissions.'));
  section.append(upload,historyPanel,summaryPanel,roomPanel);
  const nav=make('nav','bc-redline-preview-nav');nav.setAttribute('aria-label','Preview sender navigation');
  const tabs=[
    ['upload','Upload',upload],['summary','Summary',summaryPanel],
    ['photos','Photos',historyPanel],['room','Room',roomPanel]
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
  choose.addEventListener('click',()=>{selectTab('upload');fileInput.click()});
  history.addEventListener('click',()=>selectTab('photos'));
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
    setDevice('phone');selectTab('upload');dialog.showModal();
  }
  for(const [host,name] of [[setup,'redlineSetupPreviewButton'],[ownerInfo,'redlineOwnerPreviewButton']]){
    const button=make('button','bc-redline-open-sender-preview','👁  PREVIEW SENDER VIEW');
    button.id=name;button.type='button';
    button.addEventListener('click',open);
    host.append(button);
  }
})();