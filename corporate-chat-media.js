/* BLACKCELL CORPORATION / Secure private chat photo + video sharing */
const BUCKET='corp-chat-media';
const MAX_BYTES=50*1024*1024;
const ALLOWED=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','video/mp4','video/webm','video/quicktime','video/x-m4v']);
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
function kindOf(file){return file.type.startsWith('image/')?'photo':'video'}
function safeErr(e){return String(e?.message||e||'Unknown error').slice(0,180)}
export function setupCorporateMedia({client,context,reloadMessages,status}){
 const chat=document.querySelector('.chat');
 const main=document.querySelector('.chat-main');
 const messageForm=document.getElementById('sendForm');
 const bucket=client.storage.from(BUCKET);
 const mediaPanel=new URLSearchParams(location.search).get('mediaPanel');
 const standalonePanel=mediaPanel==='share'||mediaPanel==='library';
 function routeBubble(panel,{batchId=null,pick=null}={}){
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
 function requestPanelClose(panel){
  if(!standalonePanel)return false;
  if(window.parent!==window){
   window.parent.postMessage({type:'blackcell-media-bubble-close',panel},location.origin);
   return true;
  }
  return false;
 }
 let peerId=null,library=[],visible=[],active=0,batchFocus=null,viewMode='standard';
 let selection=[],busy=false,filter='all',search='',sort='newest',autoNext=false,mediaReady=false;
 let signed=new Map(),urlsTime=0,drawToken=0;
 const controls=el('div','media-actions');
 const choosePhotos=button('PHOTOS',()=>chooseFiles('image/*'));
 const chooseVideos=button('VIDEOS',()=>chooseFiles('video/*'));
 const mediaShare=button('MEDIA SHARE',()=>openShare());
 const mediaLibrary=button('SHARED MEDIA',()=>void openLibrary());
 controls.append(choosePhotos,chooseVideos,mediaShare,mediaLibrary);
 const fileInput=el('input');fileInput.type='file';fileInput.multiple=true;
 fileInput.accept='image/*,video/*';fileInput.hidden=true;
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
 const close=button('✕ Close',()=>closeWing());
 actions.append(standard,expanded,custom,add,close);
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
 history.addEventListener('change',()=>{batchFocus=history.value==='all'?null:history.value;renderLibrary()});
 const libraryList=el('div','media-library-list');
 libraryBox.append(libraryHead,history,libraryList);
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
  if(routeBubble('share',{pick:accept}))return;
  fileInput.value='';fileInput.accept=accept;fileInput.click();
 }
 fileInput.addEventListener('change',()=>{
  if(!fileInput.files?.length)return;
  const incoming=Array.from(fileInput.files);
  selectFiles(incoming);
 });
 function selectFiles(files){
  if(!requirePeer()||busy)return;
  const accepted=files.filter(f=>ALLOWED.has(f.type)&&f.size>0&&f.size<=MAX_BYTES);
  if(accepted.length!==files.length){
   status('Some files were skipped. Use JPG, PNG, WEBP, GIF, HEIC, MP4, MOV, or WEBM, maximum 50 MB each.');
  }
  if(!accepted.length)return;
  selection=accepted.slice(0,30);
  if(accepted.length>30)status('Maximum 30 files in one media share. Choose another batch for more.');
  openShare();
 }
 const overlay=el('div','media-dialog-backdrop');overlay.hidden=true;
 const dialog=el('section','media-dialog');dialog.setAttribute('role','dialog');
 dialog.setAttribute('aria-label','Blackcell Media Share');
 const dialogHead=el('div','media-dialog-head');
 const dialogTitle=el('div');
 dialogTitle.append(el('strong','','BLACKCELL / MEDIA SHARE'),el('small','','Review files before sharing to this conversation'));
 dialogHead.append(dialogTitle,button('✕',()=>closeShare()));
 const body=el('div','media-dialog-body');
 const pickInfo=el('div','media-dialog-selection','Select photos or videos to share securely with this contact.');
 const itemsBox=el('div','media-selected-items');
 body.append(pickInfo,itemsBox);
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
   xhr.setRequestHeader('Content-Type',file.type);
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
  if(files.some(f=>f.size>MAX_BYTES||!ALLOWED.has(f.type)))return;
  toggleBusy(true);sendButton.disabled=true;
  const total=files.reduce((n,f)=>n+f.size,0);
  const batchId=crypto.randomUUID();
  let transferred=0;
  updateProgress(0,'UPLOADING '+files.length+' MEDIA FILE'+(files.length===1?'':'S'));
  overlay.hidden=true;
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
      kind:kindOf(f),filename:f.name.slice(0,180),mime_type:f.type,
      bytes:f.size,storage_path:path,item_order:i
    });
   }
   updateProgress(98,'SAVING PRIVATE SHARED MEDIA');
   const {error:itemError}=await client.from('corp_chat_media_items').insert(records);
   if(itemError)throw Error('Media uploaded but could not be indexed: '+itemError.message);
   const summary=caption(records)+' available to view';
   const {error:messageError}=await client.from('corp_chat_messages').insert({
     sender_id:c.self,recipient_id:receiver,body:summary,media_batch_id:batchId
   });
   if(messageError)throw Error('Media saved, but the chat notification could not be posted: '+messageError.message);
   updateProgress(100,'TRANSFER COMPLETE · MEDIA READY');
   selection=[];renderSelection();
   await reloadMessages();
   await new Promise(r=>setTimeout(r,350));
   progress.classList.remove('active');
   if(context()?.peer?.user_id===receiver){
    if(standalonePanel&&mediaPanel==='share'&&window.parent!==window){
     window.parent.postMessage({type:'blackcell-media-upload-finished',
      peerId:receiver,batchId},location.origin);
    }else{
     await openBatch(batchId);
    }
   }
  }catch(e){
   progress.classList.remove('active');
   status('Media share failed: '+safeErr(e)+'. Please check your connection and try again.');
  }finally{toggleBusy(false);sendButton.disabled=selection.length===0}
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
  chat.classList.add('media-open');
  wing.setAttribute('aria-hidden','false');
 }
 async function openBatch(id){
  if(!requirePeer())return;
  if(routeBubble('library',{batchId:id}))return;
  batchFocus=id;
  await loadLibrary();
  openWing();
 }
 async function loadLibrary(){
  const c=requirePeer();if(!c)return;
  const selectedPeer=c.peer.user_id;
  wingStatus.textContent='Loading private media collection…';
  const filterPeers='and(sender_id.eq.'+c.self+',recipient_id.eq.'+selectedPeer+'),and(sender_id.eq.'+selectedPeer+',recipient_id.eq.'+c.self+')';
  const [itemsResult,batchesResult]=await Promise.all([
    client.from('corp_chat_media_items')
     .select('id,batch_id,sender_id,recipient_id,kind,filename,mime_type,bytes,storage_path,item_order,created_at')
     .or(filterPeers).order('created_at',{ascending:false}).limit(300),
    client.from('corp_chat_media_batches')
     .select('id,sender_id,recipient_id,created_at').or(filterPeers)
     .order('created_at',{ascending:false}).limit(100)
  ]);
  if(context()?.peer?.user_id!==selectedPeer)return;
  if(itemsResult.error||batchesResult.error){
    wingStatus.textContent='Private media archive could not be loaded. Verify employee permissions.';
    return;
  }
  library=itemsResult.data||[];
  mediaReady=true;
  const previous=history.value;
  history.replaceChildren(new Option('ALL SHARED MEDIA','all'));
  for(const b of batchesResult.data||[]){
    const count=library.filter(m=>m.batch_id===b.id).length;
    if(!count)continue;
    const title=new Date(b.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
     +' · '+count+' item'+(count===1?'':'s');
    history.add(new Option(title,b.id));
  }
  history.value=batchFocus&&Array.from(history.options).some(x=>x.value===batchFocus)
    ?batchFocus:'all';
  if(!batchFocus&&Array.from(history.options).some(x=>x.value===previous))history.value=previous;
  if(!batchFocus&&history.value!=='all')batchFocus=history.value;
  wingStatus.textContent=library.length
    ?'PRIVATE · Only authorized conversation participants can view this collection.'
    :'No shared photos or videos yet.';
  await ensureSigned(library);
  renderLibrary();
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
 function renderMediaBubble(message,own){
  const cell=el('div','bubble');
  const heading=el('strong','','BLACKCELL / SHARED MEDIA');
  const content=el('span','',String(message.body||'Photos and videos available to view'));
  cell.append(heading,content);
  const open=()=>void openBatch(message.media_batch_id);
  cell.addEventListener('click',open);
  cell.setAttribute('role','button');cell.tabIndex=0;
  cell.setAttribute('aria-label',content.textContent+'. Open Shared Media.');
  cell.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
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
  signed.clear();
  // Reset the previous conversation without sending a close request to the bubble host.
  chat.classList.remove('media-open');
  wing.setAttribute('aria-hidden','true');
  stageInner.querySelector('video')?.pause();
  overlay.hidden=true;selection=[];renderSelection();
 }
 return {renderMediaBubble,onPeerChange,openShare,openLibrary,openBatch,closeWing};
}
