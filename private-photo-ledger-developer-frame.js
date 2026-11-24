/* Runs ONLY inside an opaque-origin, script-only developer iframe. */
(()=>{
 'use strict';
 const cfg=window.REDLINE_DEV_CONFIG;if(!cfg||window.parent===window||location.href!=='about:srcdoc')return;
 const owner=cfg.role==='receiver',$=id=>document.getElementById(id),make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const button=(text,fn,cls='rd-dev-local-control')=>{const b=make('button',cls,text);b.type='button';b.addEventListener('click',fn);return b};
 const money=n=>'$'+(Number(n||0)/100).toFixed(2);
 let model={photos:[],messages:[],active:true,viewing:null,session:'initial'},requests=new Map(),last='',lastRoom='';
 function action(type,payload={}){
  const id=String(++sequence);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(Error('Test workspace did not respond'))},5000);requests.set(id,{resolve,reject,timer});parent.postMessage({type:'rd-dev-action',token:cfg.token,id,action:type,payload},cfg.origin)});
 }
 let sequence=0;
 document.body.dataset.rdDevPreset=cfg.preset==='neon-smarta-2'?'neon-smarta-2':'';
 function reportLayout(){requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const menu=document.querySelector(owner?'.topbar .rr-menu-toggle':'.topbar .rs-mobile-menu-toggle'),pay=document.querySelector('.rr-pay-choice');
  const visible=e=>!!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;
  parent.postMessage({type:'rd-dev-action',token:cfg.token,action:'layout',payload:{mode:document.body.dataset.ledgerDevice,width:innerWidth,height:innerHeight,menu:visible(menu),pay:visible(pay)}},cfg.origin);
 }))}
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==cfg.origin||event.data?.token!==cfg.token||event.data?.type!=='rd-dev-device'||!['desktop','tablet','mobile'].includes(event.data.device))return;
  cfg.device=event.data.device;
  cfg.preset=event.data.preset==='neon-smarta-2'?'neon-smarta-2':'';
  document.body.dataset.rdDevPreset=cfg.preset;
  window.dispatchEvent(new Event('blackcell:redline:preview-device'));
  reportLayout();
 });
 window.addEventListener('blackcell:redline:device-mode',reportLayout);
 window.addEventListener('resize',reportLayout,{passive:true});
 function sum(){return model.photos.filter(p=>p.decision_status==='accepted').reduce((n,p)=>n+p.amount_cents,0)}
 function snapshot(){const assigned=sum(),photos=model.photos.map(p=>({...p,resubmissionAllowed:false}));return {
  roomId:model.session,userId:owner?'00000000-0000-4000-8000-000000000004':'00000000-0000-4000-8000-000000000005',
  peerName:owner?'Test Sender':'Test Receiver',isOwner:owner,roomActive:model.active,archiveMode:false,photoSendingPaused:false,resetAt:null,
  pending:photos.filter(p=>p.decision_status==='pending').length,owed:money(assigned),paid:'$0.00',assigned:money(assigned),entries:photos,
  photoHistory:photos,paymentHistory:[],ratingEvents:[],fiveStarPhotos:photos.filter(p=>p.stars===5),topPicks:photos.filter(p=>p.stars===5),paymentSummary:{remaining_cents:assigned,paid_cents:0}
 }}
 window.BLACKCELL_REDLINE_API={snapshot,loadMessages:async()=>model.messages.slice(),sendMessage:body=>action('chat',{body}),chatStatus:async()=>({peerTyping:false,peerReadAt:null}),chatSignal:async()=>true,ownerAccessMembers:async()=>[],currentlyViewingStatus:async()=>({active:!!model.viewing,photoId:model.viewing}),timerStatus:async()=>({ok:true,server_now:new Date().toISOString(),active:null,recent:[],assigned_cents:0,owed_cents:0,paid_cents:0}),roomPaymentStatus:async()=>({remaining_cents:sum(),paid_cents:0}),recordPaidInFull:async()=>{throw Error('Payments are not connected in developer preview')},recordPartialPayment:async()=>{throw Error('Payments are not connected in developer preview')}};
 const testQueue=[];let testRunning=false,testProgress=null;
 function emitProgress(){window.dispatchEvent(new Event('blackcell:redline:upload-progress'))}
 function enqueueTest(items){
  if(!model.active||!items.length)return;
  if(!testRunning||testProgress?.roomId!==model.session){
   testQueue.length=0;testProgress={roomId:model.session,active:true,total:0,done:0,failed:0,message:''};
  }
  for(const item of items)testQueue.push({...item,roomId:model.session});
  testProgress.total+=items.length;testProgress.active=true;testProgress.message='Preparing test photos…';emitProgress();
  if(!testRunning)void drainTest();
 }
 async function drainTest(){
  if(testRunning)return;testRunning=true;
  try{
   while(testQueue.length){
    const item=testQueue.shift(),p=testProgress;
    if(!model.active||item.roomId!==model.session||p.roomId!==item.roomId)continue;
    p.message='Uploading test photo '+(p.done+p.failed+1)+' of '+p.total;emitProgress();
    try{
     let image=item.image;
     if(item.file){
      const f=item.file;
      if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>1400000)throw Error('Test image must be JPG, PNG or WebP under 1.4 MB.');
      image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f)});
     }
     await new Promise(resolve=>setTimeout(resolve,450));
     if(item.roomId!==model.session||!model.active)continue;
     await action('upload',{image,session:item.roomId});p.done++;
    }catch(e){p.failed++}
    if(testProgress===p)emitProgress();
   }
  }finally{
   testRunning=false;
   if(testProgress){testProgress.active=false;testProgress.message='Test upload complete';emitProgress()}
  }
 }
 const file=$('uploadPhoto');if(file){
  file.accept='image/jpeg,image/png,image/webp';file.multiple=true;
  file.addEventListener('change',()=>{const files=[...file.files];file.value='';enqueueTest(files.map(file=>({file})))});
 }
 // Test-only source chooser: the verified parent supplies previously shared
 // REDLINE photo copies, never the sender's unrelated private library.
 if(!owner){
  const source=make('div','redline-photo-source-overlay');source.id='redlinePhotoSourceOverlay';source.hidden=true;
  const panel=make('section','redline-photo-source-dialog');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Add test photos to REDLINE');
  const sourceHead=make('div','redline-photo-source-head');
  const closeSource=()=>{source.hidden=true};
  sourceHead.append(make('strong','','ADD PHOTOS TO REDLINE'),button('✕',closeSource,'redline-source-close'));
  const options=make('div','redline-source-actions');
  const camera=button('＋  Camera Roll',()=>{closeSource();if(model.active)file?.click()},'redline-source-device');
  camera.id='redlineSourceDevice';
  const libraryBtn=button('▣  BLACKCELL Photos',()=>{closeSource();openLibrary()},'redline-source-library');libraryBtn.id='redlineSourceLibrary';
  options.append(camera,libraryBtn);
  panel.append(sourceHead,make('p','redline-source-intro','Select a photo source.'),options,make('small','redline-source-footnote','TEST MODE · No live uploads.'));
  source.append(panel);document.body.append(source);
  source.addEventListener('click',e=>{if(e.target===source)closeSource()});
  const picker=make('div','bc-pm-picker');picker.id='rdDevSampleLibrary';picker.hidden=true;picker.style.setProperty('display','none','important');
  const pickerPanel=make('section','bc-pm-picker-panel');pickerPanel.setAttribute('role','dialog');pickerPanel.setAttribute('aria-modal','true');pickerPanel.setAttribute('aria-label','BLACKCELL Photos test library');
  const pickerHead=make('div','bc-pm-header');
  const pickerTitle=make('div');pickerTitle.append(make('h2','','BLACKCELL Photos'),make('p','','Previous REDLINE session'));
  const closeLibrary=()=>{if(sending)return;picker.hidden=true;picker.style.setProperty('display','none','important');selected.clear();updateSelection()};
  const closeGallery=button('✕',closeLibrary,'rd-dev-gallery-close');closeGallery.setAttribute('aria-label','Close photo gallery');pickerHead.append(pickerTitle,closeGallery);
  const grid=make('div','rd-dev-sample-grid');
  const status=make('p','rd-dev-sample-status','0 selected');status.setAttribute('role','status');
  const send=button('Select photos',()=>void sendSelected(),'rd-dev-gallery-send');
  const selected=new Set(),samples=[],tiles=[];
  let sending=false;
  let libraryState='idle',libraryMessage='';
  function addLibraryTile(image,n){
   samples.push(image);
   const tile=button('',()=>{if(sending)return;if(selected.has(n))selected.delete(n);else selected.add(n);updateSelection()},'rd-dev-sample-tile');
   tile.setAttribute('aria-label','Previous REDLINE photo '+(n+1));tile.setAttribute('aria-pressed','false');
   const img=make('img');img.src=image;img.alt='Previously shared photo '+(n+1);
   tile.append(img,make('span','rd-dev-sample-check','✓'));tiles.push(tile);grid.append(tile);
  }
  window.addEventListener('message',e=>{
   if(e.source!==parent||e.origin!==cfg.origin||e.data?.token!==cfg.token||e.data?.type!=='rd-dev-library'||!Array.isArray(e.data.images))return;
   const images=e.data.images.slice(0,24).filter(x=>typeof x==='string'&&x.length<=2000000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x));
   if(!['idle','loading','ready','empty','error'].includes(e.data.status))return;
   libraryState=e.data.status;libraryMessage=String(e.data.message||'');
   selected.clear();samples.length=0;tiles.length=0;grid.replaceChildren();
   if(libraryState==='ready')images.forEach((img,n)=>addLibraryTile(img,n));
   updateSelection();
  });
  function updateSelection(){tiles.forEach((tile,n)=>tile.setAttribute('aria-pressed',String(selected.has(n))));status.textContent=libraryState==='ready'?selected.size+' selected':libraryMessage||'Open the library to load previous REDLINE photos.';send.textContent=selected.size?'Send '+selected.size+' photo'+(selected.size===1?'':'s'):'Select photos';send.disabled=sending||libraryState!=='ready'||!selected.size||!model.active}
  function openLibrary(){if(!model.active)return;selected.clear();picker.hidden=false;picker.style.removeProperty('display');if(libraryState!=='ready'){libraryState='loading';libraryMessage='Loading previously shared REDLINE photos…'}updateSelection();parent.postMessage({type:'rd-dev-action',token:cfg.token,action:'open-library'},cfg.origin)}
  function sendSelected(){
   if(!model.active||!selected.size)return;
   const batch=[...selected].map(n=>({image:samples[n]}));
   closeLibrary();enqueueTest(batch);
  }
  pickerPanel.append(pickerHead,grid,status,send);picker.append(pickerPanel);document.body.append(picker);
  picker.addEventListener('click',e=>{if(e.target===picker)closeLibrary()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!picker.hidden)closeLibrary();else closeSource()}});
  window.BLACKCELL_REDLINE_UPLOAD_UI={open:()=>{if(model.active){source.hidden=false;camera.focus({preventScroll:true})}},get progress(){return testProgress?.roomId===model.session?testProgress:null}};
 }
 document.addEventListener('submit',e=>{if(!e.target.matches('.redline-message-composer'))e.preventDefault()});
 const banner=make('div','rd-dev-local-banner','DEVELOPER PREVIEW · '+cfg.role.toUpperCase()+' · TEST DATA ONLY');
 document.body.prepend(banner);
 for(const id of ['accessGate'])if($(id))$(id).hidden=true;
 for(const id of ['ledgerApp','activeRoom'])if($(id))$(id).hidden=false;
 for(const id of ['ownerSetup','ownerUploadInfo','ownerReviewQueue'])if($(id))$(id).hidden=!owner;
 if($('employeeUpload'))$('employeeUpload').hidden=owner;
 const set=(id,text)=>{if($(id)&&$(id).textContent!==String(text))$(id).textContent=String(text)};
 set('activeRoomTitle','Developer Test Room');set('roomPeople','Test Sender / Test Receiver');set('ledgerLiveStatus','LOCAL TEST SESSION');
 $('refreshLedger')?.addEventListener('click',()=>{render();parent.postMessage({type:'rd-dev-action',token:cfg.token,action:'ready'},cfg.origin)});
 $('closeRoomBtn')?.addEventListener('click',()=>{if(confirm('End only the test session?'))void action('close')});
 $('closeLightbox')?.addEventListener('click',()=>{$('photoLightbox').hidden=true;document.body.style.overflow=''});
 window.addEventListener('blackcell:redline:open-trigger-owner',()=>alert('Trigger-word rules are not connected in this local preview.'));
 function photoCard(p,review){
  const card=make('article','photo-entry');card.dataset.redlinePhotoId=p.id;
  const b=button('',()=>{const img=$('lightboxImage');img.src=p.image_url;$('photoLightbox').hidden=false;void action('view',{id:p.id})},'photo-image-btn'+(review?' review-image-button':''));
  const img=make('img');img.src=p.image_url;img.alt='Local test photograph';b.append(img);
  if(review)b.append(make('span','review-photo-enlarge','⤢ VIEW FULL PHOTO'));
  const body=make('div','photo-entry-content');body.append(make('span','entry-badge '+p.decision_status,p.decision_status.toUpperCase()),make('h3','','PHOTO '+p.id.slice(0,8).toUpperCase()));
  if(p.stars)body.append(make('div','rr-photo-star-summary','★'.repeat(p.stars)+'☆'.repeat(5-p.stars)));
  if(p.decision_status==='accepted')body.append(make('div','entry-amount',money(p.amount_cents)));
  card.append(b,body);return card;
 }
 function render(){
  const s=snapshot();set('pendingCount',s.pending);set('totalAssigned',s.assigned);set('totalOwed',s.owed);set('totalPaid',s.paid);set('reviewQueueCount',s.pending+' WAITING');set('roomStateLabel',model.active?'ACTIVE':'CLOSED');
  const sig=JSON.stringify([model.session,model.active,model.photos.map(p=>[p.id,p.stars,p.decision_status,p.amount_cents])]);
  if(owner&&sig!==last){
   last=sig;const current=model.photos.find(p=>p.decision_status==='pending'),queue=$('reviewQueueCurrent'),panel=$('redlineLightboxReview'),history=$('photoEntries');
   queue.replaceChildren();history.replaceChildren();panel.replaceChildren();panel.hidden=false;
   if(!current){const empty=make('div','queue-empty');empty.append(make('strong','','WAITING FOR FIRST PHOTO'),make('p','','Incoming photos will appear here one at a time.'));queue.append(empty);panel.append(make('p','','Waiting for a test photo.'))}
   else{
    queue.append(make('div','queue-progress','NEXT PHOTO TO REVIEW'),photoCard(current,true));
    panel.append(make('span','redline-review-kicker','TEST RECEIVER · PRIVATE REVIEW'));
    const rating=make('section','rr-photo-rating-panel'),stars=make('div','rr-photo-rating-buttons');
    rating.append(make('strong','rr-photo-rating-title','RATE THIS PHOTOGRAPH'));
    for(let i=1;i<=5;i++){const b=button('★',()=>void action('rate',{id:current.id,stars:i}),'rr-photo-rating-star'+(i<=current.stars?' is-filled':''));b.disabled=!model.active;stars.append(b)}
    rating.append(stars);panel.append(rating);
    const label=make('label','redline-review-label','PHOTO PRICE · USD'),input=make('input','redline-review-amount');input.inputMode='decimal';input.placeholder='0.00';label.append(input);panel.append(label);
    const controls=make('div','redline-review-actions');
    const accept=button('SUBMIT PRICE & NEXT PHOTO',()=>{if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(input.value.trim())){alert('Enter a test amount, such as 0.25');return}void action('price',{id:current.id,cents:Math.round(Number(input.value)*100)})},'button-main');
    const zero=button('ACCEPT $0.00',()=>void action('price',{id:current.id,cents:0}),'button-outline');
    const reject=button('REJECT PHOTO',()=>void action('reject',{id:current.id}),'button-outline reject-photo');
    for(const b of [accept,zero,reject]){b.disabled=!model.active;controls.append(b)}panel.append(controls);
    if(model.viewing!==current.id&&model.active)void action('view',{id:current.id});
   }
   for(const p of model.photos.filter(p=>p.decision_status!=='pending').slice().reverse())history.append(photoCard(p,false));
  }
  window.dispatchEvent(new Event('blackcell:redline:state'));
 }
 window.addEventListener('message',e=>{
  if(e.source!==parent||e.origin!==cfg.origin||e.data?.token!==cfg.token)return;
  if(e.data.type==='rd-dev-state'){
   const next=e.data.model;if(!next||!Array.isArray(next.photos)||!Array.isArray(next.messages))return;
   model=next;render();
  }else if(e.data.type==='rd-dev-ack'){
   const r=requests.get(e.data.id);if(!r)return;requests.delete(e.data.id);clearTimeout(r.timer);e.data.ok?r.resolve(true):r.reject(Error('Test action not available'));
  }
 });
 window.addEventListener('DOMContentLoaded',()=>{window.dispatchEvent(new Event('blackcell:redline:bridge'));render();parent.postMessage({type:'rd-dev-action',token:cfg.token,action:'ready'},cfg.origin)});
})();