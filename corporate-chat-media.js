import {mountChatCamera} from './blackcell-chat-camera.js?v=1';
import {mountChatFilmstrip,makeChatThumbnail} from './corporate-chat-filmstrip.js?v=1';
import {attachPhotoTransfer} from './blackcell-photo-transfer.js?v=3-bunny';
/* BLACKCELL CORPORATION / Secure private chat photo + video sharing */
import {createChatBunnyTransport} from './blackcell-chat-bunny.js?v=1';
const MAX_BYTES=50*1024*1024;
const ALLOWED=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/heic-sequence','image/heif-sequence','image/avif','video/mp4','video/webm','video/quicktime','video/x-m4v']);
function el(tag,cls='',content=null){
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(content!==null)n.textContent=content;return n;
}
function button(label,handler,cls=''){
 const b=el('button',cls,label);b.type='button';b.addEventListener('click',handler);return b;
}
function decorateButton(b,kind,subtitle=''){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 const p=document.createElementNS(ns,'path');p.setAttribute('d',({photo:'M3 3h18v18H3z M4 18l5-5 4 4 4-6 4 7 M8 8h.1',video:'M3 5h13v14H3z M16 10l5-4v12l-5-4',upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',library:'M5 3h16v16H5z M3 7v14h14 M6 15l5-5 4 4 3-4 3 5'})[kind]);svg.append(p);
 const label=el('span','bc-media-button-label',b.textContent);b.replaceChildren(svg,label);if(subtitle)b.append(el('small','',subtitle));
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
 const transport=createChatBunnyTransport(client);
 const mediaPanel=new URLSearchParams(location.search).get('mediaPanel');
 const standalonePanel=mediaPanel==='share'||mediaPanel==='library';
 const useLargePanels=()=>window.BlackcellChatMedia?.enabled()===true;
 const compactMedia=()=>!useLargePanels();
 function notifyChatMedia(open){if(standalonePanel||window.parent===window)return;window.parent.postMessage({type:'blackcell-chat-popout-media',open:open===true},location.origin)}
 function closeMediaTray(restoreFocus=false){
  controls.hidden=true;
  for(const button of [attachmentToggle,document.getElementById('bcAndroidAttachmentShortcut')]){
   button?.classList.remove('open');
   button?.setAttribute('aria-expanded','false');
  }
  if(restoreFocus)activeAttachmentAnchor?.focus({preventScroll:true});
 }
 function positionMediaTray(){
  if(controls.hidden)return;
  const anchor=activeAttachmentAnchor?.isConnected?activeAttachmentAnchor:attachmentToggle;
  if(!anchor)return;
  const rect=anchor.getBoundingClientRect(),viewport=window.visualViewport;
  const viewTop=viewport?.offsetTop||0;
  const viewHeight=viewport?.height||window.innerHeight;
  const viewBottom=viewTop+viewHeight;
  const viewLeft=viewport?.offsetLeft||0,viewWidth=viewport?.width||document.documentElement.clientWidth;
  const touch=window.matchMedia('(pointer:coarse)').matches;
  const width=Math.min(touch?244:225,Math.max(150,viewWidth-20));
  const left=Math.max(viewLeft+8,Math.min(rect.left,viewLeft+viewWidth-width-8));
  controls.style.width=width+'px';
  controls.style.left=left+'px';
  controls.style.bottom='auto';
  controls.style.maxHeight=Math.max(80,viewHeight-16)+'px';
  const menuHeight=Math.min(controls.scrollHeight,Math.max(80,viewHeight-16));
  const above=rect.top-menuHeight-8;
  const below=rect.bottom+8;
  const candidate=above>=viewTop+8?above:below;
  controls.style.top=Math.max(viewTop+8,Math.min(candidate,viewBottom-menuHeight-8))+'px';
 }
 function toggleMediaTray(anchor=attachmentToggle){
  if(!controls.hidden){closeMediaTray(true);return}
  if(!requirePeer())return;
  activeAttachmentAnchor=anchor?.getBoundingClientRect?anchor:attachmentToggle;
  for(const button of [choosePhotos,chooseBlackcellPhotos,uploadDevice,cameraOption])button.disabled=busy||context()?.blocked===true;
  controls.hidden=false;
  activeAttachmentAnchor?.classList.add('open');
  activeAttachmentAnchor?.setAttribute('aria-expanded','true');
  positionMediaTray();
 }
 function routeBubble(panel,{batchId=null,pick=null}={}){
  if(!standalonePanel||!useLargePanels())return false;
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
  if(!standalonePanel||compactMedia()){
   selection=[];renderSelection();overlay.hidden=true;
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
 let peerId=null,visible=[],active=0,batchFocus=null;
 let selection=[],busy=false,mediaReady=false,pickPeer=null,libraryGeneration=0,selectionPeer=null,uploadPanelGeneration=0;
 const signed=new Map();
 let libraryOffset=0,hasMoreMedia=false,loadingMoreMedia=false;
 const MEDIA_PAGE_SIZE=160;
 const controls=el('div','bc-attachment-menu');controls.id='bcAttachmentMenu';controls.hidden=true;
 controls.setAttribute('role','group');controls.setAttribute('aria-label','Attachment options');
 const attachmentToggle=document.getElementById('mediaToggleButton');
 let activeAttachmentAnchor=attachmentToggle;
 attachmentToggle?.setAttribute('aria-controls',controls.id);
 attachmentToggle?.setAttribute('aria-expanded','false');
 const choosePhotos=button('Photos',()=>openShare(),'bc-attachment-item bc-attachment-desktop-action');choosePhotos.title='Open photo and video uploader';
 const chooseBlackcellPhotos=button('BLACKCELL Photos',()=>{
  if(!compactMedia())return openShare();
  openShare();
  if(!overlay.hidden&&!privateButton.disabled)privateButton.click();
 },'bc-attachment-item bc-attachment-mobile-action');
 chooseBlackcellPhotos.title='Choose from BLACKCELL Photos';
 const uploadDevice=button('Upload Photo or Video',()=>{
  // Stay inside BLACKCELL iMessage. The Android system picker must only
  // launch if the user explicitly taps "Choose files" in the uploader.
  openShare();
 },'bc-attachment-item bc-attachment-mobile-action');
 uploadDevice.title='Upload from this device';
 const cameraOption=button('Camera',()=>{closeMediaTray();camera.open()},'bc-attachment-item');cameraOption.title='Take a photo or record a video';decorateButton(cameraOption,'photo');
 const mediaLibrary=button('Shared Media',()=>void openLibrary(),'bc-attachment-item');mediaLibrary.setAttribute('aria-expanded','false');
 decorateButton(choosePhotos,'photo');decorateButton(chooseBlackcellPhotos,'library');decorateButton(uploadDevice,'upload');decorateButton(mediaLibrary,'library');
 for(const [item,kind] of [[choosePhotos,'photos'],[chooseBlackcellPhotos,'blackcell'],[uploadDevice,'share'],[mediaLibrary,'library']]){
  const glyph=item.querySelector('svg'),badge=el('span','bc-attachment-app-icon bc-attachment-app-'+kind);
  badge.setAttribute('aria-hidden','true');
  if(glyph)badge.append(glyph);
  item.prepend(badge);
 }
 const photosBadge=choosePhotos.querySelector('.bc-attachment-app-icon');
 if(photosBadge){
  const ns='http://www.w3.org/2000/svg',flower=document.createElementNS(ns,'svg');
  flower.setAttribute('viewBox','0 0 40 40');flower.setAttribute('aria-hidden','true');
  const colors=['#f8cc43','#f59935','#ec635a','#d96bb6','#826ae3','#55ace9','#54c7bb','#82c94e'];
  for(let i=0;i<8;i++){const petal=document.createElementNS(ns,'ellipse');petal.setAttribute('cx','20');petal.setAttribute('cy','12');petal.setAttribute('rx','5.2');petal.setAttribute('ry','9');petal.setAttribute('fill',colors[i]);petal.setAttribute('fill-opacity','.88');petal.setAttribute('transform','rotate('+(i*45)+' 20 20)');flower.append(petal)}
  photosBadge.replaceChildren(flower);
 }

 controls.append(choosePhotos,chooseBlackcellPhotos,uploadDevice,cameraOption,mediaLibrary);
 document.body.append(controls);
 controls.addEventListener('click',e=>{if(e.target.closest('button:not(:disabled)'))closeMediaTray()},true);
 document.addEventListener('pointerdown',e=>{if(!controls.hidden&&!controls.contains(e.target)&&!attachmentToggle?.contains(e.target)&&!document.getElementById('bcAndroidAttachmentShortcut')?.contains(e.target))closeMediaTray()},true);
 document.addEventListener('keydown',e=>{if(!controls.hidden&&e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMediaTray(true)}},true);
 window.addEventListener('resize',positionMediaTray,{passive:true});
 window.visualViewport?.addEventListener('resize',positionMediaTray,{passive:true});
 window.visualViewport?.addEventListener('scroll',positionMediaTray,{passive:true});
 const headerLibrary=button('Shared Media',()=>void openLibrary(),'bc-chat-header-media');headerLibrary.title='Open this conversation’s shared media';document.querySelector('.imessage-title-actions')?.prepend(headerLibrary);
 // Redundant accessible attachment entry for Android devices where the IME
 // obscures the bottom composer. Never navigate outside the conversation.
 const headerAttachment=button('＋',()=>toggleMediaTray(headerAttachment),'bc-android-attachment-shortcut');
 headerAttachment.id='bcAndroidAttachmentShortcut';
 headerAttachment.title='BLACKCELL Photos or upload';
 headerAttachment.setAttribute('aria-label','Add BLACKCELL Photos or upload photo or video');
 headerAttachment.setAttribute('aria-controls',controls.id);
 headerAttachment.setAttribute('aria-expanded','false');
 document.querySelector('.imessage-title-actions')?.prepend(headerAttachment);
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
 messageForm.before(progress);
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
 brand.append(el('strong','','Shared Media'),el('small','','PRIVATE CONVERSATION LIBRARY'));
 const actions=el('div','media-viewer-actions');
 const popoutViewer=new URLSearchParams(location.search).get('popout')==='1'&&!mediaPanel;
 const close=button(popoutViewer?'×':'✕ Close',()=>closeWing(),popoutViewer?'bc-pop-media-close':'');close.setAttribute('aria-label','Close Shared Media');
 const refreshLibrary=button('Retry',()=>void loadLibrary());refreshLibrary.hidden=true;
 actions.append(refreshLibrary,close);
 head.append(brand,actions);
 const wingStatus=el('div','media-viewer-status','','');
 const stage=el('div','media-viewer-stage standard');
 const stageInner=el('div','media-stage-inner');
 // Original-size focus viewer, kept inside the authenticated chat window.
 const photoFocus=el('dialog','bc-chat-photo-enlarge');
 photoFocus.setAttribute('aria-label','Enlarged shared photo');
 const photoFocusHead=el('header','bc-chat-photo-enlarge-head');
 const photoFocusLabel=el('strong','','Shared Photo');
 const photoFocusClose=button('Close ×',()=>closePhotoFocus(),'bc-chat-photo-enlarge-close');
 photoFocusClose.setAttribute('aria-label','Close enlarged photo');
 const photoFocusStage=el('div','bc-chat-photo-enlarge-stage');
 photoFocusHead.append(photoFocusLabel,photoFocusClose);
 photoFocus.append(photoFocusHead,photoFocusStage);document.body.append(photoFocus);
 let photoFocusTrigger=null;
 function clearPhotoFocus(){photoFocusStage.replaceChildren();const trigger=photoFocusTrigger;photoFocusTrigger=null;if(trigger?.isConnected&&context()?.ready)trigger.focus({preventScroll:true})}
 function closePhotoFocus(){if(photoFocus.open)photoFocus.close();clearPhotoFocus()}
 photoFocus.addEventListener('close',()=>{if(!photoFocus.open)clearPhotoFocus()});
 photoFocus.addEventListener('cancel',e=>{e.preventDefault();closePhotoFocus()});
 photoFocusStage.addEventListener('click',e=>{if(e.target===photoFocusStage)closePhotoFocus()});
 function openPhotoFocus(image,item,still){
  if(!still()||!context()?.ready||!image.complete||!image.naturalWidth||photoFocus.open)return;
  const full=el('img');full.alt=item.filename||'Shared photo';full.referrerPolicy='no-referrer';full.decoding='async';
  full.tabIndex=0;full.setAttribute('role','button');full.setAttribute('aria-label','Return to conversation and Shared Media');full.title='Click to return';
  full.addEventListener('click',closePhotoFocus);
  full.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();closePhotoFocus()}});
  full.addEventListener('error',()=>{if(photoFocus.open&&full.isConnected)photoFocusStage.replaceChildren(el('p','media-stage-empty','Unable to enlarge this photo. Close and reopen Shared Media.'))},{once:true});
  full.src=image.currentSrc||image.src;photoFocusTrigger=image;photoFocusStage.replaceChildren(full);
  try{photoFocus.showModal();photoFocusClose.focus({preventScroll:true})}catch(_){clearPhotoFocus()}
 }
 function enablePhotoFocus(image,item,still){image.classList.add('bc-chat-enlargeable');image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label','Enlarge shared photo');image.title='Click to enlarge';image.addEventListener('click',()=>openPhotoFocus(image,item,still));image.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPhotoFocus(image,item,still)}})}

 const prev=button('‹',()=>void moveFocus(-1),'media-nav prev');prev.setAttribute('aria-label','Previous media');
 const next=button('›',()=>void moveFocus(1),'media-nav next');next.setAttribute('aria-label','Next media');
 stage.append(stageInner,prev,next);
 const currentMeta=el('div','media-viewer-meta');
 const currentIndex=el('span','media-current-index bc-media-header-count','');
 currentIndex.setAttribute('aria-label','Photo and video position');
 currentIndex.setAttribute('aria-live','polite');
 actions.prepend(currentIndex);
 const transfer=button('Transfer to Photos',()=>{},'bc-chat-transfer');
 const syncTransfer=attachPhotoTransfer(transfer,{client,source:'chat',getPhoto:()=>context()?.ready&&chat.classList.contains('media-open')?visible[active]:null,getPeer:()=>context()?.peer?.user_id,notify:msg=>{wingStatus.textContent=msg}});
 currentMeta.append(transfer);
 const focusBody=el('div','bc-media-focus-body');
 const filmstrip=mountChatFilmstrip({getItems:()=>context()?.ready&&chat.classList.contains('media-open')?visible:[],getActive:()=>active,canLoadMore:()=>mediaReady&&hasMoreMedia&&!loadingMoreMedia&&context()?.ready&&chat.classList.contains('media-open'),loadMore:()=>loadFocusPage(),select:i=>{if(mediaReady)void showIndex(i)},thumbnail:focusThumbnail});
 focusBody.append(stage,filmstrip.root);
 // Direct manipulation of the two panes. Only layout preferences are stored, never media or contact data.
 const widthDivider=el('div','bc-media-resize bc-media-resize-width');
 const resizeGuide=el('div','bc-media-drag-guide');resizeGuide.hidden=true;resizeGuide.setAttribute('aria-hidden','true');document.body.append(resizeGuide);

 let cancelActiveResize=()=>{};
 const layoutKey='bc.imessage.media.layout.v1';
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
 let preferredWidth=42;
 try{const v=JSON.parse(localStorage.getItem(layoutKey)||'null');if(Number.isFinite(v?.width))preferredWidth=clamp(v.width,15,85);}catch(_){}
 function announceLayout(){widthDivider.setAttribute('aria-valuenow',String(Math.round(preferredWidth)))}
 function applyLayout(){chat.style.setProperty('--bc-shared-width',preferredWidth+'%');announceLayout()}
 function saveMediaLayout(){try{localStorage.setItem(layoutKey,JSON.stringify({width:preferredWidth}))}catch(_){}}
 function widthBounds(){
  const total=chat.getBoundingClientRect().width;
  const sidebarRect=chat.querySelector('.sidebar')?.getBoundingClientRect();
  const sidebar=chat.classList.contains('os-sidebar-closed')?0:(sidebarRect?.width||0);
  const min=Math.min(300,total),max=Math.max(min,total-sidebar-260);return {total,min,max};
 }
 function setDimension(axis,pixels,bounds=widthBounds(),announce=true){
  const {total,min,max}=bounds;if(total<=0)return;
  const percent=clamp(pixels,min,max)/total*100;
  if(percent!==preferredWidth){preferredWidth=percent;chat.style.setProperty('--bc-shared-width',percent+'%')}
  if(announce)announceLayout();
 }
 function bindDivider(node,axis){
  const horizontal=axis==='width',label=horizontal?'Resize Shared Media width':'Resize media library height';
  node.tabIndex=0;node.setAttribute('role','separator');node.setAttribute('aria-label',label);node.setAttribute('aria-orientation',horizontal?'vertical':'horizontal');node.setAttribute('aria-valuemin','0');node.setAttribute('aria-valuemax','100');
  node.title=horizontal?'Drag left or right to resize Shared Media. Double-click to reset.':'Drag up or down to resize the viewer. Double-click to reset.';
  let drag=null,frame=0;
  const position=e=>horizontal?e.clientX:e.clientY;
  const current=()=>wing.getBoundingClientRect().width;
  const reset=()=>{preferredWidth=42;applyLayout();saveMediaLayout()};
  // Move only a compositor-friendly guide while dragging; resize the live panes once on release.
  const targetSize=()=>clamp(drag.size+drag.start-drag.latest,drag.bounds.min,drag.bounds.max);
  const paint=()=>{frame=0;if(!drag)return;const delta=drag.size-targetSize();resizeGuide.style.transform=horizontal?'translate3d('+delta+'px,0,0)':'translate3d(0,'+delta+'px,0)'};
  const end=e=>{
   if(!drag||e?.pointerId!==undefined&&e.pointerId!==drag.id)return;
   if(e?.type==='pointerup')drag.latest=position(e);
   if(frame){cancelAnimationFrame(frame);frame=0}
   const id=drag.id,commit=e?.type==='pointerup',size=targetSize(),bounds=drag.bounds;drag=null;
   cancelActiveResize=()=>{};
   if(node.hasPointerCapture?.(id))node.releasePointerCapture(id);
   resizeGuide.hidden=true;resizeGuide.style.transform='';
   if(commit){setDimension(axis,size,bounds,false);announceLayout();saveMediaLayout()}
   chat.classList.remove('bc-media-resizing');document.documentElement.classList.remove('bc-media-resizing');filmstrip.resume();
  };
  node.addEventListener('pointerdown',e=>{
   if(drag||e.button!==0||!chat.classList.contains('media-open')||chat.classList.contains('bc-media-resizing')||node.getClientRects().length===0)return;
   e.preventDefault();
   const bounds=widthBounds(),size=current(),start=position(e);
   const rect=node.getBoundingClientRect();
   if(bounds.total<=0)return;
   drag={id:e.pointerId,start,size,latest:start,bounds};filmstrip.pause();
   cancelActiveResize=()=>end();
   node.setPointerCapture(e.pointerId);
   resizeGuide.className='bc-media-drag-guide '+(horizontal?'is-width':'is-height');
   Object.assign(resizeGuide.style,{left:(horizontal?rect.left+rect.width/2:rect.left)+'px',top:(horizontal?rect.top:rect.top+rect.height/2)+'px',width:(horizontal?2:rect.width)+'px',height:(horizontal?rect.height:2)+'px',transform:'translate3d(0,0,0)'});
   resizeGuide.hidden=false;
   chat.classList.add('bc-media-resizing');document.documentElement.classList.add('bc-media-resizing');
  });
  node.addEventListener('pointermove',e=>{
   if(!drag||drag.id!==e.pointerId)return;e.preventDefault();drag.latest=position(e);
   if(!frame)frame=requestAnimationFrame(paint);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])node.addEventListener(type,end);
  window.addEventListener('blur',()=>end());
  window.addEventListener('resize',()=>end(),{passive:true});
  window.addEventListener('keydown',e=>{if(drag&&e.key==='Escape'){e.preventDefault();end()}});
  node.addEventListener('dblclick',e=>{e.preventDefault();reset()});
  node.addEventListener('keydown',e=>{
   if(drag||chat.classList.contains('bc-media-resizing'))return;
   if(e.key==='Home'){e.preventDefault();reset();return}
   const increase=horizontal?'ArrowLeft':'ArrowUp',decrease=horizontal?'ArrowRight':'ArrowDown';if(e.key!==increase&&e.key!==decrease)return;
   e.preventDefault();setDimension(axis,current()+(e.key===increase?1:-1)*(e.shiftKey?64:16));saveMediaLayout();
  });
 }
 wing.append(widthDivider,head,wingStatus,focusBody,currentMeta);
 main.after(wing);
 bindDivider(widthDivider,'width');applyLayout();
 wing.classList.add('media-focused','bc-focus-only');
 function setFocus(){
  document.documentElement.classList.add('bc-media-focus');
  if(standalonePanel&&mediaPanel==='library'&&window.parent!==window){
   window.parent.postMessage({type:'blackcell-media-focus-state',peerId:context()?.peer?.user_id,focused:true},location.origin);
  }
 }
 function toggleBusy(v){
  busy=v;for(const b of [choosePhotos,selectButton,privateButton])b.disabled=v||context()?.blocked===true;
 }
 function requirePeer(){
  const c=context();
  if(!c?.ready||!c?.self||!c?.peer){status('Select an authorized contact first.');return null}
  return c;
 }
 function chooseFiles(accept){
  const c=requirePeer();if(!c||busy||c.blocked)return;
  pickPeer=c.peer.user_id;fileInput.value='';fileInput.accept=accept;
  if(compactMedia())closeMediaTray();
  // Keep native pickers inside the original trusted click; no iframe handoff.
  try{fileInput.click()}catch(e){status('Could not open file picker. Try Photos from the + button.');}
 }
 function pickMobileFiles(){
  if(!compactMedia())return;
  openShare();chooseFiles('image/*,video/*');
 }
 fileInput.addEventListener('change',()=>{
  if(!fileInput.files?.length)return;
  const incoming=Array.from(fileInput.files);fileInput.value='';
  if(context()?.peer?.user_id!==pickPeer||overlay.hidden){status('Photo selection closed or conversation changed. Select the media again.');return}
  selectFiles(incoming);
 });
 function selectFiles(files){
  if(!requirePeer()||busy||overlay.hidden||context()?.blocked)return;
  const accepted=files.filter(f=>ALLOWED.has(mediaType(f))&&f.size>0&&f.size<=MAX_BYTES);
  if(accepted.length!==files.length){
   uploadNotice.textContent='Some files were skipped. Use supported photos or videos, maximum 50 MB each.';uploadNotice.hidden=false;
  }
  if(!accepted.length)return;
  const chosen=context()?.peer?.user_id;if(!chosen)return;if(selectionPeer&&selectionPeer!==chosen)selection=[];selectionPeer=chosen;
  const seen=new Set(selection.map(f=>[f.name,f.size,f.lastModified,f.type].join('|')));
  for(const f of accepted){
   const key=[f.name,f.size,f.lastModified,f.type].join('|');
   if(!seen.has(key)){seen.add(key);selection.push(f)}
  }
  renderSelection();
 }
 const overlay=el('div','media-dialog-backdrop bc-photo-upload-overlay');overlay.hidden=true;
 const dialog=el('section','media-dialog bc-photo-upload-dialog');dialog.setAttribute('role','dialog');
 dialog.setAttribute('aria-label','Photos uploader');dialog.setAttribute('aria-modal','true');
 const dialogHead=el('div','media-dialog-head');
 const dialogTitle=el('div');
 dialogTitle.append(el('strong','','Photos'),el('small','','Upload or choose from your BLACKCELL library'));
 const shareHeadActions=el('div','bc-media-share-head-actions');
 const flipButton=button('↻ SHARED MEDIA',()=>requestFlip('library'),'bc-media-flip-button');
 flipButton.title='Flip the card over to browse Shared Media';
 flipButton.hidden=!standalonePanel;const closeUpload=button('✕',()=>closeShare());closeUpload.setAttribute('aria-label','Close uploader');shareHeadActions.append(flipButton,closeUpload);
 dialogHead.append(dialogTitle,shareHeadActions);
 const body=el('div','media-dialog-body');
 const pickInfo=el('div','media-dialog-selection','Select photos or videos to share securely with this contact.');
 const itemsBox=el('div','media-selected-items');let selectionURLs=[];
 const uploadNotice=el('p','bc-photo-upload-notice');uploadNotice.hidden=true;uploadNotice.setAttribute('role','status');
 body.append(uploadNotice,pickInfo,itemsBox);
 if((standalonePanel&&mediaPanel==='share')||compactMedia()){
  body.append(progress);
  progress.setAttribute('aria-live','polite');
  progress.setAttribute('role','status');
 }
 const footer=el('footer','media-dialog-footer');
 const selectButton=button('Choose files',()=>chooseFiles('image/*,video/*'));
 const privateButton=button('BLACKCELL Photos',async()=>{
  const c=requirePeer();if(!c||busy||overlay.hidden||c.blocked)return;
  const startedPeer=c.peer.user_id,generation=uploadPanelGeneration;
  const valid=()=>context()?.ready&&context()?.peer?.user_id===startedPeer&&generation===uploadPanelGeneration&&!overlay.hidden&&!busy&&!context()?.blocked;
  privateButton.disabled=true;
  try{
   const {choosePrivateMedia}=await import('./blackcell-private-media.js?v=10-photo-picker');
   if(!valid())return;
   await choosePrivateMedia({client,userId:c.self,actionLabel:'Add to selection',max:30,onSelect:files=>{
    if(!valid()){status('Photo selection closed or conversation changed. Select files again.');return}
    selectFiles(files);
   }});
  }catch(e){uploadNotice.textContent='Could not open BLACKCELL Photos. '+safeErr(e);uploadNotice.hidden=false}
  finally{privateButton.disabled=busy||context()?.blocked===true}
 });
 const sendButton=button('Send selected media',()=>void sendSelection(),'media-primary');
 const sources=el('div','bc-photo-upload-sources');
 const dropZone=el('div','bc-photo-drop-zone');
 const dropTitle=el('strong','','Drag and drop photos or videos');
 const dropHint=el('small','','or browse your device · up to 50 MB each');
 selectButton.classList.add('bc-photo-device-button');decorateButton(selectButton,'upload');
 dropZone.append(dropTitle,dropHint,selectButton);
 privateButton.classList.add('bc-photo-library-button');decorateButton(privateButton,'library','Choose from your private library');
 sources.append(dropZone,privateButton);body.prepend(sources);footer.append(button('Cancel',closeShare),sendButton);
 const hasFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
 overlay.addEventListener('dragover',e=>{
  if(!hasFiles(e)||overlay.hidden)return;e.preventDefault();
  if(e.dataTransfer)e.dataTransfer.dropEffect=busy?'none':'copy';
  dropZone.classList.toggle('is-dragover',!busy);
 });
 overlay.addEventListener('dragleave',e=>{if(!overlay.contains(e.relatedTarget))dropZone.classList.remove('is-dragover')});
 overlay.addEventListener('drop',e=>{
  if(!hasFiles(e)||overlay.hidden)return;e.preventDefault();dropZone.classList.remove('is-dragover');
  if(busy)return;
  const files=Array.from(e.dataTransfer?.files||[]);if(files.length)selectFiles(files);
 });
 dialog.append(dialogHead,body,footer);overlay.append(dialog);
 document.body.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay&&!busy)closeShare()});
 function openShare(){
  if(!requirePeer()||busy)return;
  if(context()?.blocked){status('Unblock this conversation before sending attachments.');return;}
  selectButton.disabled=false;privateButton.disabled=false;
  if(routeBubble('share'))return;
  closeMediaTray();
  if(overlay.hidden){uploadPanelGeneration++;uploadNotice.hidden=true;uploadNotice.textContent='';}
  overlay.hidden=false;renderSelection();
 }
 function closeShare(){
  if(busy)return;
  uploadPanelGeneration++;pickPeer=null;overlay.hidden=true;dropZone.classList.remove('is-dragover');
  selection=[];selectionPeer=null;renderSelection();requestPanelClose('share');
 }
 function renderSelection(){
  for(const u of selectionURLs)URL.revokeObjectURL(u);selectionURLs=[];itemsBox.replaceChildren();
  pickInfo.textContent=selection.length
   ?caption(selection.map(f=>({kind:kindOf(f)})))+' selected for this conversation.'
   :'No files selected. Add photos or videos above.';
  sendButton.disabled=selection.length===0||busy;
  sendButton.textContent=selection.length?'Send '+selection.length+' item'+(selection.length===1?'':'s'):'Send selected media';
  for(const [i,f] of selection.entries()){
   const row=el('div','media-selected-row');
   const icon=el('span','bc-media-selection-icon',kindOf(f)==='photo'?'▧':'▶');icon.setAttribute('aria-hidden','true');
   const detail=el('div','bc-media-selection-detail');
   detail.append(el('strong','',f.name),el('small','',kindOf(f).toUpperCase()+' · '+fmtBytes(f.size)));
   const rm=button('REMOVE',()=>{
    if(busy)return;selection.splice(i,1);renderSelection();
   });
   if(kindOf(f)==='photo'&&['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(mediaType(f))){const img=el('img','bc-media-selected-thumb');img.alt='';const u=URL.createObjectURL(f);selectionURLs.push(u);img.src=u;img.onerror=()=>img.replaceWith(icon);row.append(img,detail,rm)}else row.append(icon,detail,rm);itemsBox.append(row);
  }
 }
 function updateProgress(n,label){
  updateInlineUpload(n,label);
  progress.classList.add('active');
  progressLabel.textContent=label||'BLACKCELL / SECURE MEDIA TRANSFER';
  progressNumber.textContent=Math.max(0,Math.min(100,n))+'%';
  progressFill.style.width=Math.max(0,Math.min(100,n))+'%';
 }
 async function sendSelection(...args){
  let release;
  try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('sendSelection',window)}catch(_){}
  try{return await bcLiveOriginal_sendSelection.apply(this,args)}finally{release?.()}
 }
 async function bcLiveOriginal_sendSelection(){
  const c=requirePeer();if(!c||!selection.length||busy)return;if(c.blocked){status('Unblock this conversation before sending attachments.');return;}if(selectionPeer!==c.peer.user_id){selection=[];renderSelection();status('Conversation changed. Select media again.');return}
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
    const f=files[i];
     const offset=transferred;
    updateProgress(Math.min(98,Math.floor(98*transferred/total)),
      'UPLOADING '+(i+1)+' OF '+files.length+' · '+f.name.slice(0,30));
    const record=await transport.upload(f,batchId,i,mediaType(f),loaded=>{
     updateProgress(Math.min(98,Math.floor(98*(offset+loaded)/total)),
       'UPLOADING '+(i+1)+' OF '+files.length);
    });
    transferred+=f.size;
    records.push(record);
   }
   updateProgress(98,'SAVING PRIVATE SHARED MEDIA');
   const summary=caption(records)+' available to view';
   const {error:messageError}=await client.from('corp_chat_messages').insert({
     sender_id:c.self,recipient_id:receiver,body:summary,media_batch_id:batchId
   });
   if(messageError)throw Error('Media saved, but the chat notification could not be posted: '+messageError.message);
   updateProgress(100,'TRANSFER COMPLETE · MEDIA READY');
   selection=[];renderSelection();
   try{await reloadMessages()}catch(_){status('Media sent. Refresh the conversation if the message is not visible yet.')}
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
     try{await openBatch(batchId)}catch(_){status('Media sent. Open Shared Media to view it.')}
    }
   }
  }catch(e){
   progress.classList.remove('active');
   if(!compactMedia()&&context()?.peer?.user_id===receiver){
    overlay.hidden=false;
    pickInfo.textContent='Upload failed: '+safeErr(e)+'. Review the conversation before retrying to avoid duplicates.';
   }
   if(compactMedia()){
    updateInlineUpload(0,'UPLOAD FAILED · '+safeErr(e),true);
   }
   status('Media upload failed: '+safeErr(e)+'. Check your connection and retry.');
  }finally{
   footer.hidden=false;
   if(context()?.peer?.user_id!==receiver){selection=[];selectionPeer=null;renderSelection();inlineUploadVisible=false;inlineUpload.remove()}
   toggleBusy(false);
   flipButton.disabled=false;
   notifyUploadState(false);
   sendButton.disabled=selection.length===0;
  }
 }
 function closeWing(){
  closePhotoFocus();cancelActiveResize();libraryGeneration++;focusRequest++;visible=[];active=0;mediaReady=false;hasMoreMedia=false;loadingMoreMedia=false;
  stageInner.querySelector('video')?.pause();stageInner.replaceChildren();syncTransfer();signed.clear();filmstrip.clear();
  if(standalonePanel&&mediaPanel==='library'&&requestPanelClose('library'))return;
  mediaLibrary.setAttribute('aria-expanded','false');chat.classList.remove('media-open');wing.setAttribute('aria-hidden','true');notifyChatMedia(false);
 }
 async function openLibrary(){
  if(!requirePeer())return;
  if(compactMedia()){await openMobileGallery(null,0);return}
  if(routeBubble('library'))return;
  batchFocus=null;openWing();await loadLibrary();
 }
 function openWing(){
  closeMediaTray();setFocus();chat.classList.add('media-open');
  mediaLibrary.setAttribute('aria-expanded','true');wing.setAttribute('aria-hidden','false');notifyChatMedia(true);
 }
 async function openBatch(id){
  if(!requirePeer())return;
  if(compactMedia()){await openMobileGallery(id,0);return}
  if(routeBubble('library',{batchId:id}))return;
  batchFocus=id;openWing();await loadLibrary();
 }
 let focusRequest=0,focusTotal=null;
 function focusQuery(c,batch){
  const p=c.peer.user_id,pair='and(sender_id.eq.'+c.self+',recipient_id.eq.'+p+'),and(sender_id.eq.'+p+',recipient_id.eq.'+c.self+')';
  let q=client.from('corp_chat_media_items').select('id,batch_id,sender_id,recipient_id,kind,filename,mime_type,bytes,storage_path,item_order,created_at',{count:'exact'}).or(pair).neq('kind','audio');
  if(batch)q=q.eq('batch_id',batch).order('item_order',{ascending:true});else q=q.order('created_at',{ascending:false}).order('item_order',{ascending:true});
  return q.order('id',{ascending:true});
 }
 function focusCurrent(g,p,b){return g===libraryGeneration&&context()?.ready&&context()?.peer?.user_id===p&&batchFocus===b&&chat.classList.contains('media-open')}
 function syncFocusArrows(){prev.disabled=!mediaReady||active<=0;next.disabled=!mediaReady||loadingMoreMedia||(active>=visible.length-1&&!hasMoreMedia)}
 function focusError(message){wingStatus.textContent=message;refreshLibrary.hidden=false}
 async function focusThumbnail(item,signal){
  const g=libraryGeneration,p=context()?.peer?.user_id,b=batchFocus;
  const still=()=>!signal.aborted&&focusCurrent(g,p,b);
  if(!still()||item.kind!=='photo')return null;
  let link=signed.get(item.id);
   try{if(!link||link.expires<=Date.now()){const src=await transport.link(item.id);if(!still())return null;link={src,expires:Date.now()+240000};signed.set(item.id,link);if(signed.size>24)signed.delete(signed.keys().next().value)}
   return still()?await makeChatThumbnail(link.src,signal):null}catch(_){return null}
  }
  async function loadLibrary(){
  closePhotoFocus();const c=requirePeer();if(!c)return;
  const g=++libraryGeneration,p=c.peer.user_id,b=batchFocus;focusRequest++;visible=[];active=0;mediaReady=false;loadingMoreMedia=false;hasMoreMedia=false;libraryOffset=0;focusTotal=null;signed.clear();filmstrip.clear();
  refreshLibrary.hidden=true;wingStatus.textContent='';syncTransfer();syncFocusArrows();currentIndex.textContent='';stageInner.querySelector('video')?.pause();stageInner.replaceChildren(el('p','media-stage-empty','Loading shared media…'));
  try{
   const {data,error,count}=await focusQuery(c,b).range(0,MEDIA_PAGE_SIZE-1);
   if(!focusCurrent(g,p,b))return;if(error)throw error;
   visible=data||[];libraryOffset=visible.length;focusTotal=typeof count==='number'?count:null;hasMoreMedia=focusTotal!==null?libraryOffset<focusTotal:visible.length===MEDIA_PAGE_SIZE;mediaReady=true;
   await showIndex(0);
  }catch(e){if(focusCurrent(g,p,b)){focusError('Could not load shared media. Select Retry.');stageInner.replaceChildren(el('p','media-stage-empty','Media unavailable.'))}}
 }
 async function moveFocus(step){
  if(!mediaReady||loadingMoreMedia)return;
  const index=active+step;if(index<0)return;
  if(index<visible.length){await showIndex(index);return}
  if(!hasMoreMedia)return;
  const before=active,g=libraryGeneration;
  if(await loadFocusPage()&&g===libraryGeneration&&active===before&&index<visible.length)await showIndex(index);
 }
 async function loadFocusPage(){
  if(!mediaReady||loadingMoreMedia||!hasMoreMedia)return false;
  const c=requirePeer();if(!c)return;const g=libraryGeneration,p=c.peer.user_id,b=batchFocus;
  loadingMoreMedia=true;syncFocusArrows();
  try{
   const {data,error,count}=await focusQuery(c,b).range(libraryOffset,libraryOffset+MEDIA_PAGE_SIZE-1);
   if(!focusCurrent(g,p,b))return;if(error)throw error;
   const more=data||[];libraryOffset+=more.length;if(typeof count==='number')focusTotal=count;
   const ids=new Set(visible.map(x=>x.id));visible.push(...more.filter(x=>!ids.has(x.id)));hasMoreMedia=more.length>0&&(focusTotal!==null?libraryOffset<focusTotal:more.length===MEDIA_PAGE_SIZE);
   return more.length>0;
  }catch(e){if(focusCurrent(g,p,b))wingStatus.textContent='More media could not load. Try again.';return false}
  finally{if(focusCurrent(g,p,b)){loadingMoreMedia=false;syncFocusArrows();filmstrip.refresh()}}
 }
 async function showIndex(index){
  const c=context(),g=libraryGeneration,p=c?.peer?.user_id,b=batchFocus,request=++focusRequest;
  if(!focusCurrent(g,p,b))return;
  closePhotoFocus();stageInner.querySelector('video')?.pause();stageInner.replaceChildren();
  if(!visible.length){filmstrip.refresh();currentIndex.textContent='0 / 0';syncTransfer();syncFocusArrows();stageInner.append(el('p','media-stage-empty','No shared photos or videos yet.'));return}
  active=Math.max(0,Math.min(index,visible.length-1));const item=visible[active];filmstrip.follow();
  syncTransfer();syncFocusArrows();currentIndex.textContent=(active+1)+' / '+(focusTotal??(visible.length+(hasMoreMedia?'+':'')));wingStatus.textContent='';refreshLibrary.hidden=true;
  stageInner.append(el('p','media-stage-empty','Opening…'));
  const still=()=>request===focusRequest&&focusCurrent(g,p,b);
  try{
   let link=signed.get(item.id);
   if(!link||link.expires<=Date.now()){
    const src=await transport.link(item.id);if(!still())return;link={src,expires:Date.now()+240000};signed.set(item.id,link);
    if(signed.size>24)signed.delete(signed.keys().next().value);
   }
   if(!still())return;
   const media=el(item.kind==='video'?'video':'img');media.referrerPolicy='no-referrer';media.src=link.src;
   if(item.kind==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';media.setAttribute('controlsList','nodownload')}
   else{media.alt=item.filename;media.decoding='async';enablePhotoFocus(media,item,still);}
   media.addEventListener('error',()=>{if(still()){signed.delete(item.id);focusError('Preview unavailable. Select Retry.');stageInner.replaceChildren(el('p','media-stage-empty','Unable to display media.'))}},{once:true});
   stageInner.replaceChildren(media);
  }catch(e){if(still()){focusError('Unable to load media. Select Retry.');stageInner.replaceChildren(el('p','media-stage-empty','Media unavailable.'))}}
 }
 document.addEventListener('keydown',e=>{if(e.defaultPrevented||photoFocus.open||!chat.classList.contains('media-open')||!mobileBox.hidden||!overlay.hidden||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||'')||e.target?.isContentEditable)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();void moveFocus(e.key==='ArrowLeft'?-1:1)}});
 // Mobile: minimal photo/video lightbox with arrows; no desktop media player.
 const mobileBox=el('section','bc-mobile-lightbox');mobileBox.hidden=true;
 mobileBox.setAttribute('role','dialog');mobileBox.setAttribute('aria-modal','true');
 mobileBox.setAttribute('aria-label','Full-size shared photos and videos');
 const mobileHeader=el('header','bc-mobile-lightbox-bar');
 const mobileLabel=el('strong','','PHOTOS & VIDEOS');
 const mobileCounter=el('span','bc-mobile-lightbox-count','');
 const mobileClose=button('✕',closeMobileGallery,'bc-mobile-lightbox-close');
 mobileClose.setAttribute('aria-label','Close photo');
 const mobileTransfer=button('Transfer to Photos',()=>{},'bc-chat-transfer');
 const syncMobileTransfer=attachPhotoTransfer(mobileTransfer,{client,source:'chat',getPhoto:()=>!mobileBox.hidden&&context()?.ready?mobileItems[mobileIndex]:null,getPeer:()=>context()?.peer?.user_id,notify:msg=>{mobileCaption.textContent=msg}});
 mobileHeader.append(mobileLabel,mobileCounter,mobileTransfer,mobileClose);
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
  &&context()?.ready&&context()?.peer?.user_id===mobilePeer;
 function closeMobileGallery(){
  mobileSession++;mobileBox.hidden=true;
  mobileCanvas.querySelector('video')?.pause();
  mobileCanvas.replaceChildren();mobileItems=[];mobileOffset=0;
  mobileBatch=null;mobilePeer=null;mobileTotal=0;mobileIndex=0;
  mobileSigned.clear();mobileFetching=false;syncMobileTransfer();
 }
 async function mobileFetch(session){
  if(!mobileActive(session)||mobileFetching)return;
  mobileFetching=true;
  try{
   const c=context();if(!c?.ready||!c.self||!mobilePeer)return;
   const pair='and(sender_id.eq.'+c.self+',recipient_id.eq.'+mobilePeer+'),and(sender_id.eq.'+mobilePeer+',recipient_id.eq.'+c.self+')';
   let q=client.from('corp_chat_media_items').select('id,kind,filename,storage_path,item_order',{count:'exact'}).or(pair).neq('kind','audio');
   if(mobileBatch)q=q.eq('batch_id',mobileBatch).order('item_order',{ascending:true});else q=q.order('created_at',{ascending:false}).order('id',{ascending:false});
   const {data,error,count}=await q.range(mobileOffset,mobileOffset+99);
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
  const item=mobileItems[index];syncMobileTransfer();
  if(!item){
   mobileCanvas.replaceChildren(el('span','bc-mobile-lightbox-loading','Unable to open this media.'));
   return;
  }
  mobileCaption.textContent=item.filename||'Shared media';
  let url=mobileSigned.get(item.id);
  if(!url||url.expires<Date.now()){
   try{
    const src=await transport.link(item.id);url={src,expires:Date.now()+240000};
    mobileSigned.set(item.id,url);
   }catch(_){
    if(mobileActive(session))mobileCanvas.replaceChildren(
     el('span','bc-mobile-lightbox-loading','Unable to load this photo or video.'));
    return;
   }
  }
  if(!mobileActive(session)||mobileIndex!==index)return;
  const media=el(item.kind==='video'?'video':'img');
  media.referrerPolicy='no-referrer';media.src=url.src;
  if(item.kind==='video'){
   media.controls=true;media.playsInline=true;media.preload='metadata';
   media.setAttribute('aria-label',item.filename||'Shared video');
  }else{media.alt=item.filename||'Shared photo';media.decoding='async'}
  mobileCanvas.replaceChildren(media);
 }
 async function openMobileGallery(batchId,startIndex=0){
  const c=context();
  if(!compactMedia()||!c?.ready||!c.peer?.user_id)return;
  closeMobileGallery();
  const session=mobileSession;
  mobilePeer=c.peer.user_id;mobileBatch=batchId||null;
  mobileIndex=Number.isFinite(startIndex)?Math.max(0,Math.floor(startIndex)):0;
  mobileBox.hidden=false;syncMobileTransfer();mobileCounter.textContent='Loading…';
  mobileCaption.textContent='';mobilePrev.disabled=true;mobileNext.disabled=true;
  mobileCanvas.replaceChildren(el('span','bc-mobile-lightbox-loading','Loading photos and videos…'));
  mobileClose.focus({preventScroll:true});
  try{
   await mobileFetch(session);
   if(!mobileActive(session))return;
   if(!mobileTotal){
    mobileCounter.textContent='0 / 0';
    mobileCanvas.replaceChildren(el('span','bc-mobile-lightbox-loading','No shared photos or videos yet.'));
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
   const links=await transport.links(data.map(i=>i.id));
   const items=data.map((item,i)=>({
    kind:item.kind,
    filename:item.filename,
    order:item.item_order,
    url:links.get(item.id)||null
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
  camera.close();closeMediaTray();closePhotoFocus();cancelActiveResize();focusRequest++;
  libraryGeneration++;mediaLibrary.setAttribute('aria-expanded','false');pickPeer=null;uploadPanelGeneration++;dropZone.classList.remove('is-dragover');
  if(!standalonePanel&&peerId&&peerId!==newPeerId){
   if(window.parent!==window)
    window.parent.postMessage({type:'blackcell-media-bubble-peer-changed',peerId:newPeerId},location.origin);
   else window.BlackcellMediaBubbleHostController?.closeAll();
  }
  peerId=newPeerId;
  visible=[];active=0;batchFocus=null;mediaReady=false;syncTransfer();
  libraryOffset=0;hasMoreMedia=false;loadingMoreMedia=false;
  signed.clear();filmstrip.clear();
  closeMobileGallery();
  previewCache.clear();previewPending.clear();
  stageInner.querySelector('video')?.pause();stageInner.replaceChildren();
  // Reset the previous conversation without sending a close request to the bubble host.
  if(chat.classList.contains('media-open'))notifyChatMedia(false);
  chat.classList.remove('media-open');
  wing.setAttribute('aria-hidden','true');
  stageInner.querySelector('video')?.pause();
  overlay.hidden=true;
  if(!busy){selection=[];selectionPeer=null;renderSelection();hideInlineUpload()}
 }
 const camera=mountChatCamera({context,status,addFiles:files=>{if(busy||context()?.blocked)return;openShare();if(!overlay.hidden)selectFiles(files)}});
 return {renderMediaBubble,onPeerChange,openShare,openLibrary,openBatch,closeWing,pickMobileFiles,toggleMediaTray,closeMediaTray,syncInlineUpload,pause:()=>{camera.close();closeMediaTray();closePhotoFocus();cancelActiveResize();stageInner.querySelector('video')?.pause();mobileCanvas.querySelector('video')?.pause()}};
}
