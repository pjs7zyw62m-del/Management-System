/* BLACKCELL CORPORATION / Secure private chat photo + video sharing */
const BUCKET='corp-chat-media';
const MAX_BYTES=50*1024*1024;
const ALLOWED=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/heic-sequence','image/heif-sequence','image/avif','video/mp4','video/webm','video/quicktime','video/x-m4v']);
function el(tag,cls='',content=null){
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(content!==null)n.textContent=content;return n;
}
function button(label,handler,cls=''){
 const b=el('button',cls,label);b.type='button';b.addEventListener('click',handler);return b;
}
function fmtBytes(n){
 if(n>=1024*1024)return (n/(1024*1024)).toFixed(1)+' MB';
 if(n>=1024)return Math.round(n/1024)+' KB';return n+' B';
}
function caption(items){
 const photos=items.filter(x=>x.kind==='photo').length;
 const videos=items.length-photos;
 return [photos?photos+' photo'+(photos===1?'':'s'):'',videos?videos+' video'+(videos===1?'':'s'):''].filter(Boolean).join(' and ')||'Shared Media';
}
function mediaType(file){
 const raw=String(file?.type||'').toLowerCase();
 if(ALLOWED.has(raw))return raw;
 // iOS Safari sometimes supplies a blank MIME type for photos/videos from Files.
 const ext=String(file?.name||'').toLowerCase().split('.').at(-1);
 const map={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',
  webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',
  avif:'image/avif',mov:'video/quicktime',mp4:'video/mp4',
  m4v:'video/x-m4v',webm:'video/webm'};
 return !raw&&map[ext]||raw;
}
function kindOf(file){return mediaType(file).startsWith('image/')?'photo':'video'}
function safeErr(e){return String(e?.message||e||'Unknown error').slice(0,180)}
export function setupCorporateMedia({client,context,reloadMessages,status}){
 const chat=document.querySelector('.chat');
 const main=document.querySelector('.chat-main');
 const messageForm=document.getElementById('sendForm');
 const bucket=client.storage.from(BUCKET);
 const mediaPanel=new URLSearchParams(location.search).get('mediaPanel');
 const standalonePanel=mediaPanel==='share'||mediaPanel==='library';
 const useLargePanels=()=>window.BlackcellChatMedia?.enabled()===true;
 const compactMedia=()=>!useLargePanels();
 function closeMediaTray(){
  const menu=document.querySelector('.media-actions'),toggle=document.getElementById('mediaToggleButton');
  menu?.classList.add('is-collapsed');
  if(toggle){toggle.classList.remove('open');toggle.setAttribute('aria-expanded','false')}
 }
 function routeBubble(panel,{batchId=null,pick=null}={}){
  if(!useLargePanels())return false;
  const c=context();
  if(!c?.ready||!c?.peer?.user_id||!c?.self)return false;
  if(standalonePanel&&mediaPanel===panel)return false;
  const message={type:'blackcell-media-bubble-open',panel,peerId:c.peer.user_id,
   batchId:batchId||null,pick:pick||null};
  if(window.parent!==window){
   window.parent.postMessage(message,location.origin);
   return true;
  }
  if(!standalonePanel&&window.BlackcellMediaBubbleHostController){
   window.BlackcellMediaBubbleHostController.open(panel,c.peer.user_id,{batchId,pick});
   return true;
  }
  return false;
 }
 function requestFlip(panel='library'){
  const c=context();
  if(!c?.ready||!c.peer?.user_id||busy)return false;
  if(panel==='library'&&selection.length>0&&
      !window.confirm('Switch to Shared Media? Your unshared file selections will be cleared.'))return false;
  if(compactMedia()){
   overlay.hidden=true;
   void openLibrary();
   return true;
  }
  const message={type:'blackcell-media-bubble-flip',panel,peerId:c.peer.user_id};
  if(window.parent!==window){window.parent.postMessage(message,location.origin);return true}
  const api=window.BlackcellMediaBubbleHostController;
  if(api?.flip){api.flip(panel,c.peer.user_id);return true}
  return false;
 }
 function notifyUploadState(uploading){
  if(window.parent!==window && standalonePanel && mediaPanel==='share')
   window.parent.postMessage({type:'blackcell-media-upload-state',
    peerId:context()?.peer?.user_id,uploading:!!uploading},location.origin);
 }
 function requestPanelClose(panel){
  if(!standalonePanel)return false;
  if(window.parent!==window){
   window.parent.postMessage({type:'blackcell-media-bubble-close',panel},location.origin);
   return true;
  }
  return false;
 }
 let peerId=null,library=[],visible=[],active=0,batchFocus=null,viewMode='standard',focused=false;
 let selection=[],busy=false,filter='all',search='',sort='newest',autoNext=false,mediaReady=false;
 let signed=new Map(),urlsTime=0,drawToken=0;
 let libraryOffset=0,hasMoreMedia=false,loadingMoreMedia=false;
 const MEDIA_PAGE_SIZE=160;
 const controls=el('div','media-actions');
 const choosePhotos=button('PHOTOS',()=>chooseFiles('image/*'));
 const chooseVideos=button('VIDEOS',()=>chooseFiles('video/*'));
 const mediaShare=button('MEDIA SHARE',()=>openShare());
 const mediaLibrary=button('SHARED MEDIA',()=>void openLibrary());
 controls.append(choosePhotos,chooseVideos,mediaShare,mediaLibrary);
 const fileInput=el('input');fileInput.type='file';fileInput.multiple=true;
 fileInput.accept='image/*,video/*';
 fileInput.setAttribute('aria-label','Select photos or videos for this chat');
 // Visually hidden, not display:none: improves iOS Safari's native media picker.
 fileInput.tabIndex=-1;
 Object.assign(fileInput.style,{position:'fixed',left:'-9999px',top:'0',width:'1px',height:'1px',opacity:'0',pointerEvents:'none'});
 document.body.append(fileInput);
 const progress=el('div','media-progress-wrap');
 const progressHead=el('div','media-progress-head');
 const progressLabel=el('span','','BLACKCELL / SECURE MEDIA TRANSFER');
 const progressNumber=el('span','','0%');
 progressHead.append(progressLabel,progressNumber);
 const progressTrack=el('div','media-progress-track');
 const progressFill=el('div','media-progress-fill');
 progressTrack.append(progressFill);progress.append(progressHead,progressTrack);
 messageForm.before(controls,progress);
 const inlineUpload=el('div','message mine bc-inline-upload');
 const inlineBubble=el('div','bubble bc-inline-upload-bubble');
 const inlineTitle=el('div','bc-inline-upload-title','PREPARING MEDIA…');
 const inlineTrack=el('div','bc-inline-upload-track');
 const inlineFill=el('div','bc-inline-upload-fill');
 const inlinePercent=el('span','bc-inline-upload-percent','0%');
 const inlineActions=el('div','bc-inline-upload-actions');
 const inlineRetry=button('TRY AGAIN',()=>void sendSelection());
 const inlineDismiss=button('DISMISS',()=>hideInlineUpload());
 inlineActions.append(inlineRetry,inlineDismiss);inlineActions.hidden=true;
 inlineTrack.append(inlineFill);
 inlineBubble.append(inlineTitle,inlineTrack,inlinePercent,inlineActions);
 inlineUpload.append(inlineBubble);
 let inlineUploadVisible=false,uploadingForPeer=null;
 function syncInlineUpload(){
  if(!compactMedia()||!inlineUploadVisible||context()?.peer?.user_id!==uploadingForPeer)return;
  const list=document.getElementById('messages');
  if(list&&inlineUpload.parentElement!==list){
   list.append(inlineUpload);
   list.scrollTop=list.scrollHeight;
  }
 }
 function hideInlineUpload(){
  if(busy)return;
  inlineUploadVisible=false;inlineUpload.remove();
 }
 function updateInlineUpload(percent,label,failed=false){
  if(!compactMedia())return;
  inlineUploadVisible=true;
  inlineTitle.textContent=label||'SENDING PHOTOS AND VIDEOS';
  inlineFill.style.width=Math.max(0,Math.min(100,percent))+'%';
  inlinePercent.textContent=failed?'UPLOAD FAILED':percent+'%';
  inlineActions.hidden=!failed;
  syncInlineUpload();
  const list=document.getElementById('messages');
  if(list)list.scrollTop=list.scrollHeight;
 }
 const wing=el('aside','media-viewer');
 wing.id='blackcellMediaViewer';wing.setAttribute('aria-label','Shared Media viewer');
 wing.setAttribute('aria-hidden','true');
 const head=el('header','media-viewer-head');
 const brand=el('div','media-viewer-brand');
 brand.append(el('strong','','BLACKCELL / SHARED MEDIA'),el('small','','PRIVATE CORPORATE COLLECTION'));
 const actions=el('div','media-viewer-actions');
 const standard=button('Standard',()=>setSize('standard'));
 const expanded=button('Expanded',()=>setSize('expanded'));
 const custom=button('Custom',()=>setSize('custom'));
 const add=button('＋ Add Media',()=>openShare());
 const focus=button('FOCUS VIEW ↗',()=>setFocus(!focused),'media-focus-toggle');
 focus.setAttribute('aria-pressed','false');
 focus.title='Collapse the media library and enlarge the photo or video';
 const close=button('✕ Close',()=>closeWing());
 actions.append(standard,expanded,custom,focus,add,close);
 head.append(brand,actions);
 const sizing=el('div','media-custom-range');sizing.hidden=true;
 const sizeLabel=el('span','','Viewer size');
 const sizeRange=el('input');sizeRange.type='range';sizeRange.min='35';sizeRange.max='85';sizeRange.value='55';
 const sizeValue=el('span','','55%');
 sizeRange.addEventListener('input',()=>{wing.style.setProperty('--media-custom-height',sizeRange.value+'%');sizeValue.textContent=sizeRange.value+'%'});
 sizing.append(sizeLabel,sizeRange,sizeValue);
 const tools=el('div','media-viewer-tools');
 const searchBox=el('input');searchBox.type='search';searchBox.placeholder='Search media…';
 searchBox.setAttribute('aria-label','Search media by file name');
 searchBox.addEventListener('input',()=>{search=searchBox.value.trim().toLowerCase();renderLibrary()});
 const kinds=el('div','media-kind-filters');
 const kindButtons={};
 for(const [key,label] of [['all','All'],['photo','Photos'],['video','Videos']]){
  const b=button(label,()=>{filter=key;for(const [k,c] of Object.entries(kindButtons))c.classList.toggle('active',k===key);renderLibrary()});
  kindButtons[key]=b;kinds.append(b);
 }
 kindButtons.all.classList.add('active');
 const sortSelect=el('select');sortSelect.setAttribute('aria-label','Sort shared media');
 for(const [v,t] of [['newest','Newest'],['oldest','Oldest']])sortSelect.add(new Option(t,v));
 sortSelect.addEventListener('change',()=>{sort=sortSelect.value;renderLibrary()});
 const autoLabel=el('label','media-autoplay-label');
 const auto=el('input');auto.type='checkbox';
 auto.addEventListener('change',()=>autoNext=auto.checked);
 autoLabel.append(auto,el('span','','Autoplay next'));
 tools.append(searchBox,kinds,sortSelect,autoLabel);
 const wingStatus=el('div','media-viewer-status','','');
 const stage=el('div','media-viewer-stage standard');
 const stageInner=el('div','media-stage-inner');
 const prev=button('‹',()=>showIndex(active-1),'media-nav prev');
 const next=button('›',()=>showIndex(active+1),'media-nav next');
 stage.append(stageInner,prev,next);
 const currentMeta=el('div','media-viewer-meta');
 const currentName=el('span','media-current-name','','');
 const currentIndex=el('span','media-current-index','','');
 const full=el('a','media-full-link','VIEW FULL MEDIA ↗');
 full.target='_blank';full.rel='noopener';full.href='#';
 currentMeta.append(currentName,currentIndex,full);
 const libraryBox=el('section','media-library');
 const libraryHead=el('div','media-library-head');
 libraryHead.append(el('strong','','MEDIA LIBRARY'));
 const resultCount=el('span','','0 ITEMS');
 libraryHead.append(resultCount);
 const history=el('select','media-history');
 history.setAttribute('aria-label','Media collection history');
 history.addEventListener('change',()=>{batchFocus=history.value==='all'?null:history.value;void loadLibrary()});
 const libraryList=el('div','media-library-list');
 const loadMoreButton=button('LOAD MORE MEDIA',()=>void loadOlderMedia(),'bc-media-load-more');
 loadMoreButton.hidden=true;
 libraryBox.append(libraryHead,history,libraryList,loadMoreButton);
 wing.append(head,sizing,tools,wingStatus,stage,currentMeta,libraryBox);
 main.after(wing);
 function setSize(value){
  viewMode=value;
  stage.className='media-viewer-stage '+value;
  sizing.hidden=value!=='custom';
  for(const [k,b] of [['standard',standard],['expanded',expanded],['custom',custom]])
   b.classList.toggle('active',value===k);
 }
 setSize('standard');
 function setFocus(value){
  focused=!!value;
  document.documentElement.classList.toggle('bc-media-focus',focused);
  wing.classList.toggle('media-focused',focused);
  focus.textContent=focused?'SHOW LIBRARY ▧':'FOCUS VIEW ↗';
  focus.title=focused?'Show thumbnails, search and album history':'Hide thumbnails to enlarge the photo or video';
  focus.setAttribute('aria-pressed',String(focused));
  focus.setAttribute('aria-label',focused?'Expand library controls':'Collapse library to focus on photo or video');
  if(standalonePanel&&mediaPanel==='library'&&window.parent!==window){
   window.parent.postMessage({type:'blackcell-media-focus-state',
     peerId:context()?.peer?.user_id,focused},location.origin);
  }
 }
 function toggleBusy(v){
  busy=v;for(const b of [choosePhotos,chooseVideos,mediaShare,add])b.disabled=v;
 }
 function requirePeer(){
  const c=context();
  if(!c?.ready||!c?.self||!c?.peer){status('Select an authorized contact first.');return null}
  return c;
 }
 function chooseFiles(accept){
  if(!requirePeer()||busy)return;
  if(compactMedia()){
   closeMediaTray();
   fileInput.value='';
   fileInput.accept='image/*,video/*';
   fileInput.click();
   return;
  }
  if(routeBubble('share',{pick:accept}))return;
  fileInput.value='';fileInput.accept=accept;fileInput.click();
 }
 function pickMobileFiles(){
  if(!compactMedia())return;
  chooseFiles('image/*,video/*');
 }
 fileInput.addEventListener('change',()=>{
  if(!fileInput.files?.length)return;
  const incoming=Array.from(fileInput.files);
  selectFiles(incoming);
 });
 function selectFiles(files){
  if(!requirePeer()||busy)return;
  const accepted=files.filter(f=>ALLOWED.has(mediaType(f))&&f.size>0&&f.size<=MAX_BYTES);
  if(accepted.length!==files.length){
   status('Some files were skipped. Use JPG, PNG, WEBP, GIF, HEIC, MP4, MOV, or WEBM, maximum 50 MB each.');
  }
  if(!accepted.length)return;
  if(compactMedia()){
   selection=accepted;
   void sendSelection(); // One tap -> native picker -> direct in-chat upload
   return;
  }
  const seen=new Set(selection.map(f=>[f.name,f.size,f.lastModified,f.type].join('|')));
  for(const f of accepted){
   const key=[f.name,f.size,f.lastModified,f.type].join('|');
   if(!seen.has(key)){seen.add(key);selection.push(f)}
  }
  openShare();
 }
 const overlay=el('div','media-dialog-backdrop');overlay.hidden=true;
 const dialog=el('section','media-dialog');dialog.setAttribute('role','dialog');
 dialog.setAttribute('aria-label','Blackcell Media Share');
 const dialogHead=el('div','media-dialog-head');
 const dialogTitle=el('div');
 dialogTitle.append(el('strong','','BLACKCELL / MEDIA SHARE'),el('small','','Review files before sharing to this conversation'));
 const shareHeadActions=el('div','bc-media-share-head-actions');
 const flipButton=button('↻ SHARED MEDIA',()=>requestFlip('library'),'bc-media-flip-button');
 flipButton.title='Flip the card over to browse Shared Media';
 shareHeadActions.append(flipButton,button('✕',()=>closeShare()));
 dialogHead.append(dialogTitle,shareHeadActions);
 const body=el('div','media-dialog-body');
 const pickInfo=el('div','media-dialog-selection','Select photos or videos to share securely with this contact.');
 const itemsBox=el('div','media-selected-items');
 body.append(pickInfo,itemsBox);
 if((standalonePanel&&mediaPanel==='share')||compactMedia()){
  body.append(progress);
  progress.setAttribute('aria-live','polite');
  progress.setAttribute('role','status');
 }
 const footer=el('footer','media-dialog-footer');
 const selectButton=button('CHOOSE PHOTOS & VIDEOS',()=>chooseFiles('image/*,video/*'));
 const sendButton=button('SHARE SELECTED MEDIA',()=>void sendSelection(),'media-primary');
 footer.append(selectButton,sendButton);
 dialog.append(dialogHead,body,footer);overlay.append(dialog);
 document.body.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay&&!busy)closeShare()});
 function openShare(){
  if(!requirePeer()||busy)return;
  if(routeBubble('share'))return;
  closeMediaTray();
  overlay.hidden=false;renderSelection();
 }
 function closeShare(){
  if(busy)return;
  overlay.hidden=true;
  requestPanelClose('share');
 }
 function renderSelection(){
  itemsBox.replaceChildren();
  pickInfo.textContent=selection.length
   ?caption(selection.map(f=>({kind:kindOf(f)})))+' selected for this conversation.'
   :'Select photos or videos to share securely with this contact.';
  sendButton.disabled=selection.length===0||busy;
  for(const [i,f] of selection.entries()){
   const row=el('div','media-selected-row');
   const detail=el('div');
   detail.append(el('strong','',f.name),el('small','',kindOf(f).toUpperCase()+' · '+fmtBytes(f.size)));
   const rm=button('REMOVE',()=>{
    if(busy)return;selection.splice(i,1);renderSelection();
   });
   row.append(detail,rm);itemsBox.append(row);
  }
 }
 function updateProgress(n,label){
  updateInlineUpload(n,label);
  progress.classList.add('active');
  progressLabel.textContent=label||'BLACKCELL / SECURE MEDIA TRANSFER';
  progressNumber.textContent=Math.max(0,Math.min(100,n))+'%';
  progressFill.style.width=Math.max(0,Math.min(100,n))+'%';
 }
 async function xhrUpload(file,path,onProgress){
  const {data:{session},error}=await client.auth.getSession();
  if(error||!session)throw Error('Employee session expired. Sign in again.');
  const base=String(client.supabaseUrl||'').replace(/\/$/,'');
  const key=String(client.supabaseKey||'');
  if(!base||!key)throw Error('Media storage configuration unavailable.');
  return await new Promise((resolve,reject)=>{
   const xhr=new XMLHttpRequest();
   xhr.open('POST',base+'/storage/v1/object/'+BUCKET+'/'+path,true);
   xhr.setRequestHeader('Authorization','Bearer '+session.access_token);
   xhr.setRequestHeader('apikey',key);
   xhr.setRequestHeader('Content-Type',mediaType(file));
   xhr.setRequestHeader('x-upsert','false');
   xhr.setRequestHeader('cache-control','3600');
   xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.min(file.size,e.loaded))};
   xhr.onerror=()=>reject(Error('Upload network error.'));
   xhr.onabort=()=>reject(Error('Media upload was interrupted.'));
   xhr.onload=()=>{
    if(xhr.status>=200&&xhr.status<300)resolve();
    else{
     let problem='Media upload rejected (HTTP '+xhr.status+').';
     try{problem=JSON.parse(xhr.responseText)?.message||problem}catch(_){}
     reject(Error(problem));
    }
   };
   xhr.send(file);
  });
 }
 async function sendSelection(){
  const c=requirePeer();if(!c||!selection.length||busy)return;
  const files=selection.slice();
  if(files.some(f=>f.size>MAX_BYTES||!ALLOWED.has(mediaType(f))))return;
  uploadingForPeer=c.peer.user_id;
  toggleBusy(true);sendButton.disabled=true;flipButton.disabled=true;
  notifyUploadState(true);
  const total=files.reduce((n,f)=>n+f.size,0);
  const batchId=crypto.randomUUID();
  let transferred=0;
  updateProgress(0,'UPLOADING '+files.length+' MEDIA FILE'+(files.length===1?'':'S'));
  if(standalonePanel&&mediaPanel==='share'){
   overlay.hidden=false;
   pickInfo.textContent='Uploading '+files.length+' items securely. Keep this window open until 100%.';
   footer.hidden=true;
  }else overlay.hidden=true;
  const receiver=c.peer.user_id;
  try{
   const {error:batchError}=await client.from('corp_chat_media_batches').insert({
     id:batchId,sender_id:c.self,recipient_id:receiver
   });
   if(batchError)throw Error('Could not create the private media collection: '+batchError.message);
   const records=[];
   for(let i=0;i<files.length;i++){
    const f=files[i],id=crypto.randomUUID();
    const extension=(f.name.split('.').at(-1)||f.type.split('/')[1]||'bin')
      .toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,9)||'bin';
    const path=[c.self,receiver,batchId,id+'.'+extension].join('/');
    const offset=transferred;
    updateProgress(Math.min(98,Math.floor(98*transferred/total)),
      'UPLOADING '+(i+1)+' OF '+files.length+' · '+f.name.slice(0,30));
    await xhrUpload(f,path,loaded=>{
     updateProgress(Math.min(98,Math.floor(98*(offset+loaded)/total)),
       'UPLOADING '+(i+1)+' OF '+files.length);
    });
    transferred+=f.size;
    records.push({
      id,batch_id:batchId,sender_id:c.self,recipient_id:receiver,
      kind:kindOf(f),filename:f.name.slice(0,180),mime_type:mediaType(f),
      bytes:f.size,storage_path:path,item_order:i
    });
   }
   updateProgress(98,'SAVING PRIVATE SHARED MEDIA');
   for(let i=0;i<records.length;i+=100){
    const {error:itemError}=await client.from('corp_chat_media_items').insert(records.slice(i,i+100));
    if(itemError)throw Error('Media uploaded but could not be indexed: '+itemError.message);
   }
   const summary=caption(records)+' available to view';
   const {error:messageError}=await client.from('corp_chat_messages').insert({
     sender_id:c.self,recipient_id:receiver,body:summary,media_batch_id:batchId
   });
   if(messageError)throw Error('Media saved, but the chat notification could not be posted: '+messageError.message);
   updateProgress(100,'TRANSFER COMPLETE · MEDIA READY');
   selection=[];renderSelection();
   await reloadMessages();
   if(compactMedia()){
    inlineUploadVisible=false;
    inlineUpload.remove();
   }
   await new Promise(r=>setTimeout(r,350));
   progress.classList.remove('active');
   if(context()?.peer?.user_id===receiver){
    if(standalonePanel&&mediaPanel==='share'&&window.parent!==window){
     window.parent.postMessage({type:'blackcell-media-upload-finished',
      peerId:receiver,batchId},location.origin);
    }else if(!compactMedia()){
     await openBatch(batchId);
    }
   }
  }catch(e){
   progress.classList.remove('active');
   if(standalonePanel&&mediaPanel==='share'){
    overlay.hidden=false;
    pickInfo.textContent='Upload failed: '+safeErr(e)+'. You can try sharing these files again.';
   }
   if(compactMedia()){
    updateInlineUpload(0,'UPLOAD FAILED · '+safeErr(e),true);
   }
   status('Media upload failed: '+safeErr(e)+'. Check your connection and retry.');
  }finally{
   footer.hidden=false;
   toggleBusy(false);
   flipButton.disabled=false;
   notifyUploadState(false);
   sendButton.disabled=selection.length===0;
  }
 }
 function closeWing(){
  if(standalonePanel&&mediaPanel==='library'&&requestPanelClose('library'))return;
  chat.classList.remove('media-open');
  wing.setAttribute('aria-hidden','true');
  stageInner.querySelector('video')?.pause();
 }
 async function openLibrary(){
  if(!requirePeer())return;
  if(routeBubble('library'))return;
  batchFocus=null;
  await loadLibrary();
  openWing();
 }
 function openWing(){
  closeMediaTray();
  chat.classList.add('media-open');
  wing.setAttribute('aria-hidden','false');
 }
 async function openBatch(id){
  if(!requirePeer())return;
  if(compactMedia()){await openMobileGallery(id,0);return}
  if(routeBubble('library',{batchId:id}))return;
  batchFocus=id;
  await loadLibrary();
  openWing();
 }
 async function loadLibrary(){
  const c=requirePeer();if(!c)return;
  const chosenPeer=c.peer.user_id,chosenBatch=batchFocus;
  libraryOffset=0;hasMoreMedia=false;mediaReady=false;loadMoreButton.hidden=true;
  wingStatus.textContent='Loading private media collection…';
  const filterPeers='and(sender_id.eq.'+c.self+',recipient_id.eq.'+chosenPeer+'),and(sender_id.eq.'+chosenPeer+',recipient_id.eq.'+c.self+')';
  let items=client.from('corp_chat_media_items')
   .select('id,batch_id,sender_id,recipient_id,kind,filename,mime_type,bytes,storage_path,item_order,created_at')
   .or(filterPeers).order('created_at',{ascending:false});
  if(chosenBatch)items=items.eq('batch_id',chosenBatch);
  const [page,batches]=await Promise.all([
   items.range(0,MEDIA_PAGE_SIZE-1),
   client.from('corp_chat_media_batches').select('id,sender_id,recipient_id,created_at')
    .or(filterPeers).order('created_at',{ascending:false}).limit(100)
  ]);
  if(context()?.peer?.user_id!==chosenPeer||batchFocus!==chosenBatch)return;
  if(page.error||batches.error){
   wingStatus.textContent='Private media archive could not be loaded. Check access permissions.';return;
  }
  library=page.data||[];libraryOffset=library.length;
  hasMoreMedia=library.length===MEDIA_PAGE_SIZE;mediaReady=true;
  history.replaceChildren(new Option('ALL SHARED MEDIA','all'));
  const seen=new Set();
  for(const b of batches.data||[]){
   const count=library.filter(m=>m.batch_id===b.id).length;
   const label=new Date(b.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
    +(count?' · '+count+'+ items':' · Collection');
   history.add(new Option(label,b.id));seen.add(b.id);
  }
  if(chosenBatch&&!seen.has(chosenBatch))history.add(new Option('SELECTED COLLECTION',chosenBatch));
  history.value=chosenBatch||'all';
  wingStatus.textContent=library.length
   ?'PRIVATE · Only authorized conversation participants can view this collection.'
   :'No shared photos or videos yet.';
  await ensureSigned(library);
  if(context()?.peer?.user_id!==chosenPeer||batchFocus!==chosenBatch)return;
  renderLibrary();loadMoreButton.hidden=!hasMoreMedia;
 }
 async function loadOlderMedia(){
  if(loadingMoreMedia||!hasMoreMedia)return;
  const c=context(),chosenPeer=c?.peer?.user_id,chosenBatch=batchFocus;
  if(!c?.ready||!c.self||!chosenPeer)return;
  loadingMoreMedia=true;loadMoreButton.disabled=true;
  loadMoreButton.textContent='LOADING MORE MEDIA…';
  try{
   const peers='and(sender_id.eq.'+c.self+',recipient_id.eq.'+chosenPeer+'),and(sender_id.eq.'+chosenPeer+',recipient_id.eq.'+c.self+')';
   let query=client.from('corp_chat_media_items')
    .select('id,batch_id,sender_id,recipient_id,kind,filename,mime_type,bytes,storage_path,item_order,created_at')
    .or(peers).order('created_at',{ascending:false});
   if(chosenBatch)query=query.eq('batch_id',chosenBatch);
   const {data,error}=await query.range(libraryOffset,libraryOffset+MEDIA_PAGE_SIZE-1);
   if(error)throw error;
   if(context()?.peer?.user_id!==chosenPeer||batchFocus!==chosenBatch)return;
   const more=data||[];
   library.push(...more);libraryOffset+=more.length;hasMoreMedia=more.length===MEDIA_PAGE_SIZE;
   for(const item of more){
    if(!Array.from(history.options).some(o=>o.value===item.batch_id))
     history.add(new Option('COLLECTION · '+new Date(item.created_at).toLocaleDateString(),item.batch_id));
   }
   await ensureSigned(more);
   if(context()?.peer?.user_id!==chosenPeer||batchFocus!==chosenBatch)return;
   renderLibrary();loadMoreButton.hidden=!hasMoreMedia;
  }catch(e){wingStatus.textContent='Older media could not load. Tap Load More to retry.'}
  finally{loadingMoreMedia=false;loadMoreButton.disabled=false;loadMoreButton.textContent='LOAD MORE MEDIA'}
 }
 async function ensureSigned(items){
  const now=Date.now();
  if(now>urlsTime+4*60*1000){signed=new Map();urlsTime=now}
  const missing=items.filter(it=>!signed.has(it.id));
  if(!missing.length)return;
  const {data,error}=await bucket.createSignedUrls(missing.map(it=>it.storage_path),300);
  if(error){wingStatus.textContent='Media previews are temporarily unavailable.';return}
  for(let i=0;i<missing.length;i++){
   if(data?.[i]?.signedUrl)signed.set(missing[i].id,data[i].signedUrl);
  }
 }
 function renderLibrary(){
  if(!mediaReady)return;
  const old=visible[active]?.id;
  visible=library.filter(it=>
   (!batchFocus||it.batch_id===batchFocus)&&
   (filter==='all'||it.kind===filter)&&
   it.filename.toLowerCase().includes(search))
   .sort((a,b)=>sort==='oldest'
     ?new Date(a.created_at)-new Date(b.created_at)||a.item_order-b.item_order
     :new Date(b.created_at)-new Date(a.created_at)||a.item_order-b.item_order);
  resultCount.textContent=visible.length+' ITEMS';
  libraryList.replaceChildren();
  if(!visible.length){
   libraryList.append(el('p','empty','No matching media yet.'));showIndex(0);
   return;
  }
  active=Math.max(0,visible.findIndex(it=>it.id===old));
  visible.forEach((item,i)=>{
    const tile=button('',()=>showIndex(i),'media-library-item'+(i===active?' selected':''));
    tile.title=item.filename;
    if(item.kind==='photo'&&signed.has(item.id)){
      const img=el('img');img.alt=item.filename;img.loading='lazy';img.src=signed.get(item.id);tile.append(img);
    }else{
      tile.append(el('span','media-video-thumb',item.kind==='video'?'▶':'▧'));
    }
    tile.append(el('small','',item.filename));
    libraryList.append(tile);
  });
  showIndex(active);
 }
 function showIndex(index){
  const count=visible.length;
  stageInner.replaceChildren();
  if(!count){
   stageInner.append(el('p','media-stage-empty','No photos or videos in this collection.'));
   currentName.textContent='';currentIndex.textContent='0 / 0';
   full.hidden=true;prev.disabled=true;next.disabled=true;return;
  }
  active=(index+count)%count;
  const item=visible[active];
  prev.disabled=count<=1;next.disabled=count<=1;full.hidden=false;
  currentName.textContent=item.filename+' · '+fmtBytes(item.bytes);
  currentIndex.textContent=(active+1)+' / '+count;
  full.href='corporate-media.html?id='+encodeURIComponent(item.id);
  const link=signed.get(item.id);
  if(!link){
   stageInner.append(el('p','media-stage-empty','This preview could not be loaded. Reopen Shared Media to refresh the secure link.'));
  }else if(item.kind==='video'){
   const video=el('video');
   video.src=link;video.controls=true;video.playsInline=true;
   video.preload='metadata';video.setAttribute('controlsList','nodownload');
   video.addEventListener('ended',()=>{if(autoNext&&visible.length>1)showIndex(active+1)});
   stageInner.append(video);
  }else{
   const img=el('img');img.src=link;img.alt=item.filename;
   img.addEventListener('click',()=>window.open(full.href,'_blank','noopener'));
   img.title='Open original-resolution media in a new tab';
   stageInner.append(img);
  }
  for(const [i,tile] of Array.from(libraryList.querySelectorAll('button.media-library-item')).entries())
   tile.classList.toggle('selected',i===active);
 }
 // Mobile: minimal photo/video lightbox with arrows; no desktop media player.
 const mobileBox=el('section','bc-mobile-lightbox');mobileBox.hidden=true;
 mobileBox.setAttribute('role','dialog');mobileBox.setAttribute('aria-modal','true');
 mobileBox.setAttribute('aria-label','Full-size shared photos and videos');
 const mobileHeader=el('header','bc-mobile-lightbox-bar');
 const mobileLabel=el('strong','','PHOTOS & VIDEOS');
 const mobileCounter=el('span','bc-mobile-lightbox-count','');
 const mobileClose=button('✕',closeMobileGallery,'bc-mobile-lightbox-close');
 mobileClose.setAttribute('aria-label','Close photo');
 mobileHeader.append(mobileLabel,mobileCounter,mobileClose);
 const mobileStage=el('div','bc-mobile-lightbox-stage');
 const mobileCanvas=el('div','bc-mobile-lightbox-canvas');
 const mobilePrev=button('‹',()=>void moveMobile(-1),'bc-mobile-lightbox-prev');
 const mobileNext=button('›',()=>void moveMobile(1),'bc-mobile-lightbox-next');
 mobilePrev.setAttribute('aria-label','Previous photo or video');
 mobileNext.setAttribute('aria-label','Next photo or video');
 mobileStage.append(mobilePrev,mobileCanvas,mobileNext);
 const mobileCaption=el('div','bc-mobile-lightbox-caption');
 mobileBox.append(mobileHeader,mobileStage,mobileCaption);
 document.body.append(mobileBox);
 let mobileSession=0,mobileBatch=null,mobilePeer=null,mobileItems=[],
  mobileOffset=0,mobileIndex=0,mobileTotal=0,mobileFetching=false;
 const mobileSigned=new Map();
 const mobileActive=session=>!mobileBox.hidden&&mobileSession===session
  &&context()?.peer?.user_id===mobilePeer;
 function closeMobileGallery(){
  mobileSession++;mobileBox.hidden=true;
  mobileCanvas.querySelector('video')?.pause();
  mobileCanvas.replaceChildren();mobileItems=[];mobileOffset=0;
  mobileBatch=null;mobilePeer=null;mobileTotal=0;mobileIndex=0;
  mobileSigned.clear();mobileFetching=false;
 }
 async function mobileFetch(session){
  if(!mobileActive(session)||mobileFetching)return;
  mobileFetching=true;
  try{
   const {data,error,count}=await client.from('corp_chat_media_items')
    .select('id,kind,filename,storage_path,item_order',{count:'exact'})
    .eq('batch_id',mobileBatch).order('item_order',{ascending:true})
    .range(mobileOffset,mobileOffset+99);
   if(error)throw error;
   if(!mobileActive(session))return;
   mobileItems.push(...(data||[]));mobileOffset+=data?.length||0;
   mobileTotal=typeof count==='number'?count:mobileItems.length;
  }finally{mobileFetching=false}
 }
 async function mobileShow(index,session){
  if(!mobileActive(session))return;
  mobileIndex=index;
  mobileCanvas.querySelector('video')?.pause();
  mobileCanvas.replaceChildren(el('span','bc-mobile-lightbox-loading','Opening…'));
  while(mobileActive(session)&&mobileIndex>=mobileItems.length&&mobileItems.length<mobileTotal){
   const n=mobileItems.length;
   try{await mobileFetch(session)}catch(_){break}
   if(mobileItems.length===n)break;
  }
  if(!mobileActive(session)||mobileIndex!==index)return;
  mobileCounter.textContent=mobileTotal?(index+1)+' / '+mobileTotal:'0 / 0';
  mobilePrev.disabled=index<=0;mobileNext.disabled=index>=mobileTotal-1;
  const item=mobileItems[index];
  if(!item){
   mobileCanvas.replaceChildren(el('span','bc-mobile-lightbox-loading','Unable to open this media.'));
   return;
  }
  mobileCaption.textContent=item.filename||'Shared media';
  let url=mobileSigned.get(item.id);
  if(!url||url.expires<Date.now()){
   try{
    const {data,error}=await bucket.createSignedUrl(item.storage_path,300);
    if(error||!data?.signedUrl)throw error||Error('Unavailable');
    url={src:data.signedUrl,expires:Date.now()+240000};
    mobileSigned.set(item.id,url);
   }catch(_){
    if(mobileActive(session))mobileCanvas.replaceChildren(
     el('span','bc-mobile-lightbox-loading','Unable to load this photo or video.'));
    return;
   }
  }
  if(!mobileActive(session)||mobileIndex!==index)return;
  const media=el(item.kind==='video'?'video':'img');
  media.src=url.src;
  if(item.kind==='video'){
   media.controls=true;media.playsInline=true;media.preload='metadata';
   media.setAttribute('aria-label',item.filename||'Shared video');
  }else{media.alt=item.filename||'Shared photo';media.decoding='async'}
  mobileCanvas.replaceChildren(media);
 }
 async function openMobileGallery(batchId,startIndex=0){
  const c=context();
  if(!compactMedia()||!c?.ready||!c.peer?.user_id||!batchId)return;
  closeMobileGallery();
  const session=mobileSession;
  mobilePeer=c.peer.user_id;mobileBatch=batchId;
  mobileIndex=Number.isFinite(startIndex)?Math.max(0,Math.floor(startIndex)):0;
  mobileBox.hidden=false;mobileCounter.textContent='Loading…';
  mobileCaption.textContent='';mobilePrev.disabled=true;mobileNext.disabled=true;
  mobileCanvas.replaceChildren(el('span','bc-mobile-lightbox-loading','Loading photos and videos…'));
  mobileClose.focus({preventScroll:true});
  try{
   await mobileFetch(session);
   if(!mobileActive(session))return;
   if(!mobileTotal){
    mobileCounter.textContent='0 / 0';
    mobileCanvas.replaceChildren(el('span','bc-mobile-lightbox-loading','No attachments in this message.'));
    return;
   }
   await mobileShow(Math.min(mobileIndex,mobileTotal-1),session);
  }catch(_){
   if(mobileActive(session))mobileCanvas.replaceChildren(
    el('span','bc-mobile-lightbox-loading','Could not load media. Close and try again.'));
  }
 }
 async function moveMobile(step){
  const next=mobileIndex+step;
  if(mobileBox.hidden||next<0||next>=mobileTotal)return;
  await mobileShow(next,mobileSession);
 }
 document.addEventListener('keydown',e=>{
  if(mobileBox.hidden)return;
  if(e.key==='Escape'){e.preventDefault();closeMobileGallery()}
  else if(e.key==='ArrowLeft'){e.preventDefault();void moveMobile(-1)}
  else if(e.key==='ArrowRight'){e.preventDefault();void moveMobile(1)}
 });
 let touchX=null,touchY=null;
 mobileStage.addEventListener('touchstart',e=>{
  if(e.touches.length===1){
   touchX=e.touches[0].clientX;touchY=e.touches[0].clientY
  }
 },{passive:true});
 mobileStage.addEventListener('touchend',e=>{
  if(touchX===null||!e.changedTouches.length)return;
  const dx=e.changedTouches[0].clientX-touchX,dy=e.changedTouches[0].clientY-touchY;
  touchX=null;touchY=null;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.25)
   void moveMobile(dx<0?1:-1);
 },{passive:true});
 const previewCache=new Map(),previewPending=new Map();
 async function loadInlineItems(message){
  const batchId=message.media_batch_id;
  const existing=previewCache.get(batchId);
  if(existing&&existing.expires>Date.now())return existing.items;
  if(previewPending.has(batchId))return previewPending.get(batchId);
  const work=(async()=>{
   // Authorized pair and media batch are checked by existing Supabase RLS.
   const {data,error}=await client.from('corp_chat_media_items')
    .select('id,kind,filename,storage_path,item_order')
    .eq('batch_id',batchId)
    .order('item_order',{ascending:true}).limit(4);
   if(error)throw error;
   if(!data?.length)return [];
   const {data:links,error:linkError}=await bucket.createSignedUrls(data.map(i=>i.storage_path),300);
   if(linkError)throw linkError;
   const items=data.map((item,i)=>({
    kind:item.kind,
    filename:item.filename,
    order:item.item_order,
    url:links?.[i]?.signedUrl||null
   }));
   previewCache.set(batchId,{items,expires:Date.now()+240000});
   return items;
  })();
  previewPending.set(batchId,work);
  try{return await work}finally{previewPending.delete(batchId)}
 }
 function renderMediaBubble(message,own){
  const cell=el('div','bubble');
  const heading=el('strong','',own?'SHARED PHOTOS & VIDEOS':'PHOTOS & VIDEOS');
  const content=el('span','',String(message.body||'Photos and videos available to view'));
  cell.append(heading);
  if(compactMedia()){
   const gallery=el('div','bc-chat-inline-media-grid');
   gallery.setAttribute('aria-label','Photos and videos in this message');
   gallery.append(el('span','bc-chat-inline-loading','Loading shared media…'));
   cell.append(gallery);
   const originalPeer=context()?.peer?.user_id;
   void loadInlineItems(message).then(items=>{
    if(!cell.isConnected||context()?.peer?.user_id!==originalPeer)return;
    gallery.replaceChildren();
    if(!items.length){gallery.append(el('span','bc-chat-inline-loading','Tap to open shared media'));return}
    gallery.classList.toggle('single',items.length===1);
    for(const item of items){
     const tile=el('div','bc-chat-inline-media-tile');
     tile.setAttribute('role','button');tile.tabIndex=0;
     tile.setAttribute('aria-label','Open attachment '+(item.order+1));
     const openTile=()=>void openMobileGallery(message.media_batch_id,item.order);
     tile.addEventListener('click',e=>{e.stopPropagation();openTile()});
     tile.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openTile()}
     });
     if(!item.url){
      tile.append(el('span','bc-chat-inline-loading','Preview unavailable'));
     }else if(item.kind==='video'){
      const v=el('video');v.src=item.url;v.preload='metadata';v.playsInline=true;v.muted=true;
      v.setAttribute('aria-label',item.filename||'Shared video');
      tile.append(v,el('span','bc-chat-inline-play','▶'));
     }else{
      const img=el('img');img.src=item.url;img.alt=item.filename||'Shared photograph';
      img.loading='lazy';img.decoding='async';tile.append(img);
     }
     gallery.append(tile);
    }
   }).catch(()=>{
    if(cell.isConnected)gallery.replaceChildren(el('span','bc-chat-inline-loading','Tap to open shared media'));
   });
  }
  cell.append(content);
  const open=()=>compactMedia()?void openMobileGallery(message.media_batch_id,0)
   :void openBatch(message.media_batch_id);
  cell.addEventListener('click',event=>{
   if(event.target.closest('.bc-chat-inline-media-tile'))return;
   open();
  });
  cell.setAttribute('role','button');cell.tabIndex=0;
  cell.setAttribute('aria-label',content.textContent+'. Open Shared Media.');
  cell.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('video')){e.preventDefault();open()}});
  return cell;
 }
 function onPeerChange(newPeerId){
  if(!standalonePanel&&peerId&&peerId!==newPeerId){
   if(window.parent!==window)
    window.parent.postMessage({type:'blackcell-media-bubble-peer-changed',peerId:newPeerId},location.origin);
   else window.BlackcellMediaBubbleHostController?.closeAll();
  }
  peerId=newPeerId;
  library=[];visible=[];active=0;batchFocus=null;mediaReady=false;
  libraryOffset=0;hasMoreMedia=false;loadMoreButton.hidden=true;
  signed.clear();
  closeMobileGallery();
  previewCache.clear();previewPending.clear();
  setFocus(false);
  // Reset the previous conversation without sending a close request to the bubble host.
  chat.classList.remove('media-open');
  wing.setAttribute('aria-hidden','true');
  stageInner.querySelector('video')?.pause();
  overlay.hidden=true;
  if(!busy){selection=[];renderSelection();hideInlineUpload()}
 }
 return {renderMediaBubble,onPeerChange,openShare,openLibrary,openBatch,closeWing,pickMobileFiles,syncInlineUpload};
}
