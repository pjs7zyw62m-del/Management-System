/* BLACKCELL / MAN'S ARMED FORCES
 * Independent authenticated landing page preceding the existing Military Library.
 * Private Bunny originals with authenticated delivery; pending uploads visible to their uploader.
 * Shared visibility remains subject to existing review policy.
 */
import {authorizeUniformHub,corporate} from './uniform-hub-auth.js?v=20261112-access2';
import {createPrivateDrive,PRIVATE_FILE_LIMIT} from './blackcell-private-drive.js?v=20261117-parallel-read1';
import {uploadPrivateFile,mediaType,privateUploadError} from './blackcell-private-media.js?v=8-transfer';

import {installWorldPlayer} from './blackcell-world-player.js?v=2';
import {isWorldVideo,worldVideoTitle,createWorldVideoPreviews,createWorldVideoPoster,saveWorldVideoPoster} from './blackcell-world-video-catalog.js?v=20261117-persisted-posters1';
import {createWorldAlgorithm} from './blackcell-world-algorithm.js?v=20261117-sevenworlds-r1';
const $=id=>document.getElementById(id);
let approved=[],shown=[],filterBranch='all',filterStyle='all',filterCategory='all',lastSigned=0,authorized=null;
let authBusy=false;
const sizeLimit=12;
const MAX_BATCH=1000;
const allowedPhotos=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic']);
let page=0,renderToken=0,uploading=false,queuePaused=false,viewerAsset=null,searchQuery='',searchTimer=null;
let pendingOwn=[],sortingQueue=false,queueBusy=false,queueIndex=0,mediaFilter='all',viewerRequest=0;
const canSort=a=>Boolean(authorized&&a&&(owner()||a.owner_id===authorized.user.id));
const unsortedQueue=()=>approved.filter(a=>a.kind==='photo'&&canSort(a)&&inferCategory(a)==='unsorted');
const uploadState={user:null,assets:[]};
const bucket=corporate.storage.from('corp-social-media');
const worldProvider='world-bunny-v1';
const worldVideoPreviews=createWorldVideoPreviews(corporate);
const worldAlgorithm=createWorldAlgorithm({
 client:corporate,getUser:()=>authorized?.user,getCurrent:()=>viewerAsset,
 dialog:document.getElementById('mfLightbox'),
 image:document.getElementById('mfViewerImage'),
 video:document.getElementById('mfViewerVideo'),
 onUpdated:()=>{if(authorized)void render()}
});
const mediaTitle=a=>a.kind==='video'?worldVideoTitle(a):(safe(a.caption)||safe(a.filename)||'Uniform photograph');
const worldObjects=new Map();
let worldPhotoObserver=null,worldPhotoJobs=[],worldPhotoActive=0;
function pumpWorldPhotos(){while(authorized&&worldPhotoActive<3&&worldPhotoJobs.length){const job=worldPhotoJobs.shift();worldPhotoActive++;void Promise.resolve().then(job).catch(()=>{}).finally(()=>{worldPhotoActive--;pumpWorldPhotos()})}}
function releaseWorldUrls(keep=new Set()){for(const [id,url] of worldObjects)if(!keep.has(id)){URL.revokeObjectURL(url);worldObjects.delete(id)}}
async function worldRequest(action,body,headers={}){
 const session=(await corporate.auth.getSession()).data?.session;
 const config=window.BLACKCELL_CORP_CONFIG||{};
 if(!session?.access_token||!config.url||!config.publishableKey)throw Error('Sign in again to access private World media.');
 const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/blackcell-world-media?action='+action,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:config.publishableKey,...headers},body});
 if(!response.ok){const reply=await response.json().catch(()=>({}));throw Error(reply.detail||reply.code||'World storage request failed (HTTP '+response.status+')')}
 return response;
}
async function worldBlob(a){return (await worldRequest('read',JSON.stringify({id:a.id}),{'Content-Type':'application/json'})).blob()}
async function worldPreview(a,valid=()=>true){
 if(a.source_provider!==worldProvider){const out=await bucket.createSignedUrl(a.storage_path,1800);if(out.error||!out.data?.signedUrl)throw Error(out.error?.message||'Preview unavailable');return out.data.signedUrl}
 if(worldObjects.has(a.id))return worldObjects.get(a.id);
 const uid=authorized?.user.id,blob=await worldBlob(a);
 if(!authorized||authorized.user.id!==uid||!valid())throw Error('Session or view changed');
 if(worldObjects.has(a.id))return worldObjects.get(a.id);
 const url=URL.createObjectURL(blob);worldObjects.set(a.id,url);return url;
}
window.addEventListener('pagehide',()=>{renderToken++;worldPhotoObserver?.disconnect();worldPhotoJobs=[];releaseWorldUrls()});
const owner=()=>authorized?.member?.role==='owner'&&Number(authorized.member.clearance_level)===7;
const signedMs=25*60*1000;
const words={
 dress:['dress','service','formal','blues','suit','coat','tailored','insignia','ribbon','tie','ceremonial'],
 field:['field','combat','training','camouflage','fatigue','tactical','exercise','patrol','acu','bdus','battle'],
 naval:['navy','naval','sailor','maritime','sea','coast','ship','whites','seaman'],
 ceremonial:['ceremony','ceremonial','honor','parade','guard','dress','formation','color','march','tribute']
};

const categories={
 military:{label:'Military',pattern:/\b(army|military|marine corps|marines|navy|naval|air force|airman|soldier|sailor|coast guard|national guard|special ops|special operations|armed forces)\b/i},
 police:{label:'Law Enforcement',pattern:/\b(police|sheriff|deputy|state trooper|highway patrol|law enforcement|swat|constable|policeman)\b/i},
 fire:{label:'Fire & Rescue',pattern:/\b(firefighter|firefighters|fireman|firehouse|fire department|fire brigade|wildland fire|turnout gear|fire rescue)\b/i},
 medical:{label:'Emergency Medical',pattern:/\b(paramedic|emt|emergency medical|ambulance|first responder|rescue medic)\b/i},
 security:{label:'Corrections & Security',pattern:/\b(correctional|corrections|prison guard|security guard|security officer|protective service|detention officer|custody officer)\b/i},
 professional:{label:'Professional Uniforms',pattern:/\b(pilot|airline|flight crew|merchant marine|maritime|ship crew|train conductor|transit|transportation|aviation|seafarer)\b/i}
};
function inferCategory(a){
 const tags=Array.isArray(a.military_tags)?a.military_tags:[];
 const explicit=tags.filter(t=>/^maf:(military|police|fire|medical|security|professional|unsorted)$/.test(t));
 if(explicit.length)return explicit[0].slice(4);
 const t=searchable(a).replace(/[_-]+/g,' ');
 const hits=Object.entries(categories).filter(([key,v])=>v.pattern.test(t)).map(([key])=>key);
 if(['Army','Marine Corps','Navy','Air Force','Coast Guard','Space Force','National Guard','Special Operations','Naval Infantry'].includes(branchOf(a))&&!hits.includes('military'))hits.push('military');
 // Conflicting evidence must not be silently filed into the wrong service.
 return hits.length===1?hits[0]:'unsorted';
}
const worldPages=Object.freeze({uniform:'uniform-world.html',military:'military-world.html',police:'law-enforcement-world.html',fire:'fire-rescue-world.html',security:'corrections-world.html',medical:'ems-world.html',professional:'aviation-world.html'});
const worldId=Object.hasOwn(worldPages,document.body.dataset.mfWorld)?document.body.dataset.mfWorld:null;
const worldScope=worldId&&worldId!=='uniform'?worldId:null;
if(worldScope)filterCategory=worldScope;
function matchesCategory(a,category){return category==='all'||inferCategory(a)===category}
function displayCategory(category){return category==='unsorted'?'Unsorted':categories[category]?.label||'All Uniforms'}

function text(el,value){if(el)el.textContent=String(value??'')}
function safe(x){return String(x||'').trim().slice(0,180)}
function branchOf(a){return safe(a.military_branch)||'Unspecified'}
function searchable(a){
 return [a.filename,a.caption,a.kind==='video'?worldVideoTitle(a):'',a.military_branch,a.military_category,a.military_era,...(Array.isArray(a.military_tags)?a.military_tags:[])]
 .filter(Boolean).join(' ').toLowerCase();
}
function matches(a){
 if(mediaFilter!=='all'&&a.kind!==mediaFilter)return false;
 if(searchQuery&&!searchable(a).includes(searchQuery))return false;
 if(!matchesCategory(a,worldScope||filterCategory))return false;
 if(filterBranch!=='all'&&branchOf(a)!==filterBranch)return false;
 if(filterStyle==='all')return true;
 const str=searchable(a);
 return (words[filterStyle]||[]).some(word=>str.includes(word));
}
function placeholder(title,body){
 const div=document.createElement('div');div.className='mf-photo-empty';
 const heading=document.createElement('strong');heading.textContent=title;
 const desc=document.createElement('p');desc.textContent=body;
 div.append(heading,desc);return div;
}
const workspaceViews=new Set(['discover','explore','branches','collection','studio']);
let workspaceView='discover';
function showWorkspaceView(view,{updateHash=true}={}){
 if(!workspaceViews.has(view)||(worldScope&&(view==='explore'||(view==='branches'&&worldScope!=='military'))))view='discover';
 workspaceView=view;
 const root=$('uMain');if(root)root.dataset.mfActive=view;
 document.querySelectorAll('[data-mf-panel]').forEach(panel=>{panel.hidden=panel.id!==view});
 document.querySelectorAll('.mf-workspace-nav [data-mf-view]').forEach(btn=>{const selected=btn.dataset.mfView===view;btn.classList.toggle('selected',selected);if(selected)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current')});
 if($('mfContent'))$('mfContent').scrollTop=0;
 if(worldId&&view==='collection'&&authorized)void render();
 if(updateHash)try{const url=new URL(location.href);url.hash=view;if(worldId)url.searchParams.delete('uniform');else if(view!=='collection')url.searchParams.delete('uniform');else if(Object.hasOwn(categories,filterCategory))url.searchParams.set('uniform',filterCategory);else url.searchParams.delete('uniform');if(url.href!==location.href)history.replaceState(null,'',url.href)}catch(_){}
}
function setFilter({branch='all',style='all',category='all'}={}){
 if(worldScope){category=worldScope;if(worldScope!=='military')branch='all'}
 filterBranch=branch;filterStyle=style;filterCategory=category;page=0;searchQuery='';if($('mfSearch'))$('mfSearch').value='';
 document.querySelectorAll('[data-category-filter]').forEach(btn=>{
  const selected=btn.dataset.categoryFilter===category;
  btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-filter]').forEach(btn=>{
  const selected=category==='military'&&btn.dataset.filter===branch;
  btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-branch]').forEach(btn=>btn.classList.toggle('active',category==='military'&&btn.dataset.branch===branch));
 document.querySelectorAll('[data-category]').forEach(btn=>btn.classList.toggle('active',btn.dataset.category===category));
 showWorkspaceView('collection');
 if(!worldId&&authorized)void render();
}
function formatMetadata(a){
 return [displayCategory(inferCategory(a)),inferCategory(a)==='military'&&branchOf(a)!=='Unspecified'?branchOf(a):'',safe(a.military_era)]
 .filter(Boolean).join(' · ')||'MILITARY LIBRARY';
}

let transferringPhoto=false;
const transferUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function transferName(asset){
 const raw=String(asset.filename||'').normalize('NFKD').replace(/[^a-zA-Z0-9_. -]/g,'_').replace(/^\.+/,'');
 const ext=raw.split('.').pop().toLowerCase();
 if(!['jpg','jpeg','png','webp','gif','heic','heif'].includes(ext)||!mediaType(raw))throw Error('Unsupported original photo format.');
 const base=raw.slice(0,-ext.length-1).slice(0,48).trim()||'photo';
 return 'MAF-'+asset.id+'-'+base+'.'+ext;
}
async function freshTransferSession(uid){
 if(!authorized||authorized.user.id!==uid)throw Error('Your corporate session changed.');
 const auth=await corporate.auth.getUser();
 if(auth.error||auth.data.user?.id!==uid)throw Error('Sign in again before transferring.');
 const check=await corporate.rpc(authorized.member.role==='owner'?'corp_code_status':'corp_employee_code_status');
 if(check.error||check.data?.verified!==true||authorized?.user.id!==uid)throw Error('Corporate verification required.');
}
async function transferToPhotos(){
 if(viewerAsset?.kind==='video')return;
 const a=viewerAsset,uid=authorized?.user?.id,b=$('mfTransferPhotos'),st=$('mfTransferStatus');
 if(transferringPhoto)return;
 if(!a||!transferUUID.test(a.id)||!transferUUID.test(uid||'')){text(st,'Select an authorized photograph first.');return;}
 if(a.owner_id!==uid&&!confirm('Save a private copy to BLACKCELL Photos? Confirm that you have permission to retain this photograph.'))return;
 transferringPhoto=true;b.disabled=true;b.dataset.busy='true';b.textContent='TRANSFERRING…';text(st,'Verifying permission…');
 let release;try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('Transfer to private Photos',window)}catch(_){}
 const report=msg=>{if(viewerAsset?.id===a.id)text(st,msg)};
 try{
  await freshTransferSession(uid);
  const source=await corporate.from('corp_social_assets').select('id,owner_id,filename,storage_path,review_status,adult_restricted,purpose,kind,bytes,source_provider').eq('id',a.id).eq('review_status','approved').eq('adult_restricted',false).eq('purpose','library').eq('kind','photo').maybeSingle();
  if(source.error||!source.data?.storage_path)throw Error('This original photo is no longer available to your account.');
  const record=source.data,name=transferName(record),storage=createPrivateDrive(corporate,uid),folder=uid+'/Photos',path=folder+'/'+name;
  const exists=async()=>{const result=await storage.list(folder,{search:'MAF-'+record.id+'-',limit:100});if(result.error)throw result.error;return (result.data||[]).some(row=>row.id&&(!row.state||row.state==='ready')&&row.name.startsWith('MAF-'+record.id+'-'))};
  if(await exists()){report('Already in your Photos library.');return}
  if(Number(record.bytes)>PRIVATE_FILE_LIMIT)throw Error('Original exceeds the private Photos file limit.');
  report('Copying original photograph…');
  const original=record.source_provider===worldProvider?{data:await worldBlob(record)}:await bucket.download(record.storage_path);
  if(original.error||!original.data?.size)throw Error('Original photo could not be retrieved.');
  if(original.data.size>PRIVATE_FILE_LIMIT)throw Error('Original exceeds the private Photos file limit.');
  await freshTransferSession(uid);
  const file=new File([original.data],name,{type:mediaType(name)});
  try{await uploadPrivateFile(storage,path,file,(sent,total)=>{if(total>0)report('Saving to Photos · '+Math.min(99,Math.round(sent/total*100))+'%')})}
  catch(error){if(await exists()){report('Already in your Photos library.');return}throw error}
  report('✓ Transferred to your private Photos library.');
  try{const channel=new BroadcastChannel('bc-private-photos-transfer');channel.postMessage({type:'photos-changed',uid});channel.close()}catch(_){try{window.parent.dispatchEvent(new CustomEvent('bc-private-files-changed',{detail:{source:'uniform-transfer',uid}}))}catch(__){}}
 }catch(e){report('Transfer unavailable: '+privateUploadError(e))}
 finally{release?.();transferringPhoto=false;delete b.dataset.busy;b.disabled=false;b.textContent='TRANSFER TO PHOTOS'}
}

async function openViewer(a,{queue=false}={}){
 if(!authorized||!a)return;
 const request=++viewerRequest,uid=authorized.user.id,isVideo=a.kind==='video';
 const dialog=$('mfLightbox');
 if(!dialog?.showModal)return;
 const image=$('mfViewerImage'),video=$('mfViewerVideo');
 video.pause();video.removeAttribute('src');video.load();video._blackcellPlayer?.show(isVideo);video.hidden=!isVideo;image.hidden=isVideo;image.removeAttribute('src');
 const label=dialog.querySelector('.mf-lightbox-top small');if(label)label.textContent=isVideo?'BLACKCELL / PRIVATE VIDEO':(a.review_status==='pending'?'BLACKCELL / PRIVATE COLLECTION':'BLACKCELL / APPROVED COLLECTION');
 if(!isVideo&&a.signedUrl)image.src=a.signedUrl;
 image.alt=safe(a.caption)||safe(a.filename)||'Uniform photograph';
 text($('mfViewerTitle'),mediaTitle(a));
 const rename=$('mfRenameVideo');if(rename)rename.hidden=!(isVideo&&a.owner_id===uid);
 text($('mfViewerMeta'),formatMetadata(a));
 viewerAsset=a;sortingQueue=queue;
 $('mfTransferPhotos').hidden=isVideo;$('mfTransferPhotos').disabled=transferringPhoto||isVideo;$('mfTransferPhotos').textContent=transferringPhoto?'TRANSFERRING…':'TRANSFER TO PHOTOS';text($('mfTransferStatus'),'');
 $('mfQueueControls').hidden=!queue;
 $('mfMoveWrap').hidden=queue||!canSort(a);
 if(queue)text($('mfQueuePosition'),(queueIndex+1)+' / '+unsortedQueue().length+' · POSTED · NEEDS CATEGORY');
 $('mfMoveCategory').value=inferCategory(a);
 if(!dialog.open)dialog.showModal();
 worldAlgorithm.open(a);
 if(isVideo){
  video._blackcellPlayer?.message('Loading private video…');
  try{
   const url=await worldPreview(a);
   if(request!==viewerRequest||!dialog.open||authorized?.user.id!==uid)return;
   video.src=url;video.load();video._blackcellPlayer?.message('');
  }catch(e){if(request===viewerRequest)video._blackcellPlayer?.message('Video unavailable: '+String(e?.message||'Retry by opening the video again.'))}
 }else if(!a.signedUrl||Date.now()-(a.signedAt||0)>signedMs){
  try{const url=await worldPreview(a,()=>request===viewerRequest&&dialog.open&&authorized?.user.id===uid);if(request!==viewerRequest||!dialog.open||authorized?.user.id!==uid)return;a.signedUrl=url;a.signedAt=Date.now();image.src=url}
  catch(e){if(request===viewerRequest&&dialog.open)text($('mfTransferStatus'),'Original unavailable. Reopen to retry.')}
 }
}
async function render(){
 const token=++renderToken,grid=$('mfPhotoGrid');if(!grid)return;
 worldPhotoObserver?.disconnect();worldPhotoObserver=null;worldPhotoJobs=[];
 shown=worldAlgorithm.rank(approved.filter(matches),approved);
 const pages=Math.max(1,Math.ceil(shown.length/sizeLimit));
 page=Math.max(0,Math.min(page,pages-1));
 const visible=shown.slice(page*sizeLimit,(page+1)*sizeLimit);
 const keep=new Set(visible.map(a=>a.id));if(viewerAsset&&$('mfLightbox')?.open)keep.add(viewerAsset.id);releaseWorldUrls(keep);
 for(const a of approved)if(a.source_provider===worldProvider&&!worldObjects.has(a.id)){a.signedUrl=null;a.signedAt=0}
 text($('mfImageCount'),worldScope?approved.filter(a=>matchesCategory(a,worldScope)).length:approved.length);
 const totals=new Map();for(const asset of approved){const category=inferCategory(asset);totals.set(category,(totals.get(category)||0)+1)}
 for(const label of document.querySelectorAll('[data-mf-count]')){const count=totals.get(label.dataset.mfCount)||0;text(label,count+' '+(count===1?'item':'items'))}
 updateQueueStatus();
 for(const b of document.querySelectorAll('[data-category-filter]')){
  if(!b.dataset.originalLabel)b.dataset.originalLabel=b.textContent.trim();
  const count=b.dataset.categoryFilter==='all'?approved.length:approved.filter(a=>inferCategory(a)===b.dataset.categoryFilter).length;
  b.textContent=b.dataset.originalLabel+' ('+count+')';
 }
 $('mfPagination').hidden=pages<=1;
 $('mfPreviousPage').disabled=page===0;
 $('mfNextPage').disabled=page>=pages-1;
 text($('mfPageLabel'),'PAGE '+(page+1)+' / '+pages);
 if(worldId&&workspaceView!=='collection'){grid.replaceChildren();return}
 grid.replaceChildren();
 if(!visible.length){
  grid.append(placeholder(approved.length?'NO MATCHES FOR THIS SELECTION':'YOUR COLLECTION IS READY','Upload photographs or choose another uniform collection. Pending and restricted uploads stay private.'));
  text($('mfCollectionStatus'),searchQuery?'No media match your search.':'No '+displayCategory(filterCategory).toLowerCase()+' media.');
  return;
 }
 const account=authorized?.user.id;
 const valid=()=>token===renderToken&&authorized?.user.id===account;
 function mountPhotograph(a,img){
  const ready=()=>valid()&&img.isConnected;
  if(a.signedUrl&&Date.now()-(a.signedAt||0)<signedMs){img.src=a.signedUrl;return}
  img.classList.add('mf-preview-loading');
  const task=async()=>{
   if(!ready())return;
   try{
    const url=await worldPreview(a,ready);
    if(!ready())return;
    a.signedUrl=url;a.signedAt=Date.now();img.src=url;img.classList.remove('mf-preview-loading');
   }catch(e){if(ready()){img.classList.remove('mf-preview-loading');img.alt='Preview unavailable — open to retry'}}
  };
  const enqueue=()=>{if(ready()){worldPhotoJobs.push(task);pumpWorldPhotos()}};
  if(typeof IntersectionObserver==='undefined'){queueMicrotask(enqueue);return}
  if(!worldPhotoObserver)worldPhotoObserver=new IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting){worldPhotoObserver?.unobserve(entry.target);const run=entry.target._bcWorldPreview;delete entry.target._bcWorldPreview;run?.()}
  },{rootMargin:'200px'});
  img._bcWorldPreview=enqueue;worldPhotoObserver.observe(img);
 }
 for(const a of visible){
  const card=document.createElement('button');card.type='button';card.className='mf-photo-card';card.setAttribute('aria-label',mediaTitle(a)+' — '+formatMetadata(a));
  const isVideo=a.kind==='video';
  const img=document.createElement(isVideo?'div':'img');
  if(isVideo){card.classList.add('mf-video-card');card.setAttribute('aria-label','Play '+mediaTitle(a));img.className='mf-video-tile';img.style.position='relative';img.style.overflow='hidden';const poster=document.createElement('img');poster.hidden=true;poster.alt='';poster.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;max-height:none';const play=document.createElement('span');play.textContent='▶';play.style.cssText='position:relative;z-index:1;background:#0009';const label=document.createElement('small');label.textContent='VIDEO';label.style.cssText='position:relative;z-index:1;padding:3px 5px;border-radius:4px;background:#0009';img.append(poster,play,label);if(isWorldVideo(a))worldVideoPreviews.mount(a,poster);}
  else{img.loading='lazy';img.decoding='async';img.alt=safe(a.caption)||safe(a.filename)||'Uniform photograph'}
  const details=document.createElement('div');details.className='mf-photo-info';
  const title=document.createElement('strong');title.textContent=mediaTitle(a).slice(0,120);title.title=mediaTitle(a);
  const subtitle=document.createElement('small');subtitle.textContent=(a.review_status==='pending'?'PRIVATE · PENDING REVIEW · ':'')+formatMetadata(a).slice(0,100);
  details.append(title,subtitle);card.append(img,details);card.addEventListener('click',()=>void openViewer(a));grid.append(card);if(!isVideo)mountPhotograph(a,img);
 }
 text($('mfCollectionStatus'),shown.length+' media items · '+displayCategory(filterCategory)+(filterBranch!=='all'?' · '+filterBranch:'')+'. Tap a photo or video to open.');
}
function categoryTags(a,category){
 const old=Array.isArray(a?.military_tags)?a.military_tags.filter(t=>!String(t).startsWith('maf:')):[];
 return ['maf:'+category,...old].slice(0,15);
}
async function movePhoto(a,category){
 if(!authorized||!a||!(owner()||a.owner_id===authorized.user.id))return;
 const tags=categoryTags(a,category);
 const updates={military_tags:tags,military_category:category==='unsorted'?'Unsorted':'Uniforms'};
 if(category!=='military')updates.military_branch='Unspecified';
 const {data,error}=await corporate.from('corp_social_assets').update(updates).eq('id',a.id).eq('owner_id',a.owner_id).select('id').maybeSingle();
 if(error||!data)throw Error(error?.message||'Category update was not authorized');
 Object.assign(a,updates);
 text($('mfViewerMeta'),formatMetadata(a));
 void render();
}
function updateQueueStatus(){
 const n=unsortedQueue().length;
 text($('mfQueueCount'),n);
 $('mfReviewQueue').disabled=!n||queueOpening;
 $('mfPendingPanel').hidden=!owner()||!pendingOwn.length;
 text($('mfPendingCount'),pendingOwn.length);
}
let queueOpening=false;
async function openQueue(index=0){
 if(queueOpening)return;
 const list=unsortedQueue(),button=$('mfReviewQueue'),dialog=$('mfLightbox');
 if(!list.length){if(dialog?.open)dialog.close();text($('mfQueueMessage'),'All posted photos are sorted.');return}
 queueOpening=true;button.disabled=true;button.setAttribute('aria-busy','true');
 text($('mfQueueMessage'),'Opening unsorted photograph…');
 try{
  queueIndex=((index%list.length)+list.length)%list.length;
  const a=list[queueIndex];
  if(!a.signedUrl||Date.now()-(a.signedAt||0)>signedMs){
   a.signedUrl=await worldPreview(a);a.signedAt=Date.now();
  }
  if(!authorized)throw Error('Your session has expired. Sign in again.');
  if(!dialog?.showModal)throw Error('Photo viewer is unavailable in this browser.');
  openViewer(a,{queue:true});
  if(!dialog.open)throw Error('Photo viewer could not open.');
  text($('mfQueueMessage'),'');text($('mfQueueError'),'');
 }catch(e){
  const message='Unable to open unsorted photo: '+String(e?.message||'Try again.');
  text($('mfQueueMessage'),message);text($('mfQueueError'),message);
 }finally{queueOpening=false;button.removeAttribute('aria-busy');updateQueueStatus()}
}
async function assignQueued(category){
 if(queueBusy||!sortingQueue||!viewerAsset)return;
 queueBusy=true;
 const btns=[...$('mfQueueControls').querySelectorAll('button')];btns.forEach(b=>b.disabled=true);
 try{
  await movePhoto(viewerAsset,category);
  const remaining=unsortedQueue().length;
  text($('mfQueueMessage'),remaining?'Category saved. '+remaining+' posted photos still need sorting.':'All posted photos are sorted.');
  if(remaining)await openQueue(Math.min(queueIndex,remaining-1));
  else $('mfLightbox').close();
 }catch(e){text($('mfQueueError'),e?.message||'Could not save category.')}
 finally{queueBusy=false;btns.forEach(b=>b.disabled=false)}
}
async function publishPending(){
 if(!owner()||!pendingOwn.length||uploading)return;
 if(!confirm('Post '+pendingOwn.length+' previously uploaded photographs to the private BLACKCELL Network? Confirm these photos are non-explicit and you have the rights and consent to share them. Unsorted photos will appear in the sorting queue.'))return;
 const ids=pendingOwn.map(a=>a.id),uid=authorized.user.id;
 $('mfPublishPending').disabled=true;
 let count=0;
 try{
  for(let i=0;i<ids.length;i+=50){
   const out=await corporate.from('corp_social_assets').update({review_status:'approved',rights_confirmed:true,adult_restricted:false})
    .eq('owner_id',uid).eq('review_status','pending').eq('adult_restricted',false).eq('purpose','library').eq('kind','photo').in('id',ids.slice(i,i+50)).select('id');
   if(out.error)throw Error(out.error.message);
   count+=out.data?.length||0;
  }
  text($('mfQueueMessage'),count+' existing photos posted. Only unsorted ones remain in the sorting queue.');
 }catch(e){text($('mfQueueMessage'),'Published '+count+' before stopping: '+e.message)}
 finally{$('mfPublishPending').disabled=false;await loadApproved()}
}
function filenameBranch(name){
 const n=String(name||'').replace(/[_-]/g,' ');
 for(const [rx,branch] of [[/\b(USMC|marine corps|marines)\b/i,'Marine Corps'],[/\barmy\b/i,'Army'],[/\bnavy\b/i,'Navy'],[/\bair force\b/i,'Air Force'],[/\bcoast guard\b/i,'Coast Guard'],[/\bspace force\b/i,'Space Force'],[/\bnational guard\b/i,'National Guard']])if(rx.test(n))return branch;
 return 'Unspecified';
}
async function aiPreview(file){
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Image cannot be previewed on this device'));image.src=url});
  const scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.78);
 }finally{URL.revokeObjectURL(url)}
}
async function worldVideoOrientation(file){
 const url=URL.createObjectURL(file),v=document.createElement('video');
 try{return await new Promise(resolve=>{
  const done=()=>{clearTimeout(timer);resolve(v.videoWidth&&v.videoHeight?(v.videoHeight>v.videoWidth?'short':'standard'):'unknown')};
  const timer=setTimeout(done,5000);v.preload='metadata';v.onloadedmetadata=done;v.onerror=done;v.src=url;
 })}finally{v.removeAttribute('src');v.load();URL.revokeObjectURL(url)}
}

async function chooseCloudPhotos(){
 if(uploading||!authorized)return;
 const uid=authorized.user.id,drive=createPrivateDrive(corporate,uid),folder=uid+'/Photos',panel=$('mfCloudPicker');
 if(!panel)return;panel.hidden=false;panel.replaceChildren();panel.textContent='Loading your Photos…';
 const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
 try{
  const items=[];for(let offset=0;;offset+=100){const result=await drive.list(folder,{limit:100,offset});if(result.error)throw result.error;const rows=result.data||[];items.push(...rows.filter(x=>x.id&&types[x.name.split('.').pop().toLowerCase()]));if(rows.length<100)break;}
  if(authorized?.user?.id!==uid)return;
  panel.replaceChildren();const selected=new Set(),list=document.createElement('div');list.style.cssText='display:grid;gap:6px;max-height:40vh;overflow:auto';
  const upload=document.createElement('button');upload.type='button';upload.className='mf-primary';upload.disabled=true;upload.textContent='Upload selected (0)';
  for(const item of items){const button=document.createElement('button');button.type='button';button.className='mf-secondary';button.textContent=item.name;button.setAttribute('aria-pressed','false');button.onclick=()=>{if(selected.has(item))selected.delete(item);else selected.add(item);button.setAttribute('aria-pressed',String(selected.has(item)));button.style.outline=selected.has(item)?'2px solid #e84545':'';upload.disabled=!selected.size;upload.textContent='Upload selected ('+selected.size+')'};list.append(button);}
  panel.append(list,upload);if(!items.length)list.textContent='No supported media in your Photos library.';
  upload.onclick=async()=>{if(uploading||authorized?.user?.id!==uid)return;upload.disabled=true;const files=[];let failed=0;for(const item of selected){if(authorized?.user?.id!==uid)return;try{const result=await drive.download(folder+'/'+item.name);if(result.error)throw result.error;files.push(new File([result.data],item.name,{type:types[item.name.split('.').pop().toLowerCase()]}))}catch(_){failed++}}if(authorized?.user?.id!==uid)return;panel.hidden=true;await uploadUniforms(files);if(failed)$('mfUploadStatus').textContent+=' '+failed+' Photos items could not be read.';};
 }catch(e){panel.textContent='Could not load Photos. Try again.';}
}

let worldFailedFiles=[];
function showWorldUploadFailures(failures){
 const status=$('mfUploadStatus');if(!status||!failures.length)return;const list=document.createElement('ul');for(const f of failures){const item=document.createElement('li');item.textContent=f.file.name+': '+f.reason;list.append(item)}status.append(list);const retry=document.createElement('button');retry.type='button';retry.className='mf-secondary';retry.textContent='Retry failed files';retry.onclick=()=>{if(!uploading)void uploadUniforms(failures.map(f=>f.file))};status.append(retry);
}
async function uploadUniforms(files){
 if(uploading||!authorized)return;
 const selected=Array.from(files||[]),picked=selected;
 worldFailedFiles=[];
 const good=picked.filter(f=>(allowedPhotos.has(f.type)||['video/mp4','video/quicktime','video/webm'].includes(f.type))&&f.size>0&&f.size<=45*1048576);
 const rejected=picked.filter(f=>!good.includes(f));
 if(!good.length){text($('mfUploadStatus'),'No supported files.');showWorldUploadFailures(rejected.map(file=>({file,reason:'Unsupported format, empty file or exceeds current 45 MB limit.'})));return}
 const category=worldScope||$('mfUploadCategory').value;
 const suppliedTitle=good.length===1&&good[0].type.startsWith('video/')?window.prompt('Optional video title — leave blank to use an automatic category title',''):null;
 const direct=false;
 if(direct&&!$('mfUploadDirect').checked){text($('mfUploadStatus'),'Confirm the batch is non-explicit and you have permission to share it, then select photos again. Sorting is not an approval requirement.');return}
 let useAI=direct&&category==='auto'&&$('mfUploadAi').checked;
 if(useAI&&!confirm('Use the paid visual AI service for up to 60 photos in this batch, subject to your remaining daily allowance? The rest will use filenames or remain Unsorted. Original files are preserved.'))useAI=false;
 let aiRemaining=useAI?60:0,aiSkipped=0,aiFailures=0,done=0,saved=0,duplicates=0,failed=0,posted=0,unsorted=0;
 const aiJobs=[];
 const uid=authorized.user.id;
 uploading=true;queuePaused=false;$('mfUploadPause').textContent='Ⅱ PAUSE UPLOADS / AI';
 const progress=$('mfUploadProgress');progress.hidden=false;progress.max=good.length;progress.value=0;
 $('mfUploadChoose').disabled=true;$('mfUploadClose').disabled=true;$('mfUploadCategory').disabled=true;$('mfUploadAi').disabled=true;$('mfUploadDirect').disabled=true;$('mfUploadPause').hidden=false;
 try{
  for(const file of good){
   while(queuePaused&&authorized?.user?.id===uid){await new Promise(res=>setTimeout(res,300))}
   if(authorized?.user?.id!==uid)break;
   text($('mfUploadStatus'),'Uploading '+(done+1)+' / '+good.length+' · '+file.name.slice(0,65));
   try{
    const isVideo=file.type.startsWith('video/');
    // Server verifies exact bytes in the uploader's own namespace; no speculative browser skip.
    
    let target=category==='auto'?inferCategory({filename:file.name}):category;
    if(!['military','police','fire','medical','security','professional','unsorted'].includes(target))target='unsorted';
    const id=crypto.randomUUID(),ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'jpg';
    const path=uid+'/'+id+'.'+ext;
    const asset={id,owner_id:uid,purpose:'library',kind:isVideo?'video':'photo',mime_type:file.type,filename:file.name.slice(0,180),storage_path:path,bytes:file.size,
      military_category:target==='unsorted'?'Unsorted':'Uniforms',military_branch:target==='military'?filenameBranch(file.name):'Unspecified',military_tags:['maf:'+target]};
    if(isVideo){asset.video_category='standard';asset.military_tags.push('bc-video-orientation:'+await worldVideoOrientation(file));}
    if(direct&&!isVideo)Object.assign(asset,{review_status:'approved',rights_confirmed:true,adult_restricted:false});
    const response=await worldRequest('upload',file,{'Content-Type':file.type,'x-bc-name':encodeURIComponent(file.name),'x-bc-category':target,'x-bc-branch':encodeURIComponent(asset.military_branch),'x-bc-orientation':isVideo?(asset.military_tags[1]||'').split(':').pop():'unknown'});
    const result=await response.json();
    if(!result.ok)throw Error(result.code||'Cloud upload was not confirmed');
    if(result.duplicate){duplicates++;continue}
    Object.assign(asset,result.record);
    if(isVideo&&suppliedTitle?.trim()){const caption=suppliedTitle.trim().slice(0,180);const update=await corporate.from('corp_social_assets').update({caption}).eq('id',asset.id).eq('owner_id',uid).select('id,caption').maybeSingle();if(update.data)asset.caption=update.data.caption;else console.warn('Video title not saved',update.error?.message)}
    const added={data:result.record};
    saved++;
    asset.review_status=added.data?.review_status;asset.created_at=new Date().toISOString();
    uploadState.assets.push(asset);
    if(['approved','pending'].includes(asset.review_status)){
     if(asset.review_status==='approved')posted++;approved.unshift(asset);updateQueueStatus();
     text($('mfImageCount'),approved.length);
     if(posted===1||posted%10===0)void render();
    }
    if(isVideo){
     try{
      text($('mfUploadStatus'),'Generating private video thumbnail…');
      const jpeg=await createWorldVideoPoster(file);
      await saveWorldVideoPoster(corporate,asset.id,jpeg);
     }catch(e){console.warn('Video stored; thumbnail can be generated during owner preview:',String(e?.message||e).slice(0,90))}
     continue;
    }
    // Exact duplicate verification is performed by the storage backend.
    if(useAI&&added.data?.review_status==='approved'&&target==='unsorted'&&aiJobs.length<60)aiJobs.push({file,asset});
    else if(useAI&&target==='unsorted')aiSkipped++;
    if(target==='unsorted')unsorted++;
   }catch(e){failed++;worldFailedFiles.push({file,reason:String(e?.message||'Upload failed').slice(0,220)});console.warn('Uniform upload failed:',e?.message)}
   finally{done++;progress.value=done}
  }
  await render();
  // Uploads are already posted. Optional visual sorting runs separately afterward.
  for(let index=0;index<aiJobs.length;index++){
   if(!aiRemaining||authorized?.user?.id!==uid){aiSkipped+=aiJobs.length-index;break}
   while(queuePaused&&authorized?.user?.id===uid)await new Promise(res=>setTimeout(res,300));
   if(authorized?.user?.id!==uid)break;
   const {file,asset}=aiJobs[index],id=asset.id;
   if(inferCategory(asset)!=='unsorted')continue;
   aiRemaining--;
     try{
      text($('mfUploadStatus'),'Posted '+posted+' photos · sorting '+(index+1)+' / '+aiJobs.length+' with AI');
      const preview=await aiPreview(file);
      const result=await corporate.functions.invoke('blackcell-military-ai',{body:{action:'analyze_uniform',asset_id:id,preview_image:preview}});
      let data=result.data;if(result.error?.context?.json)try{data=await result.error.context.json()}catch(_){}
      if(result.error||!data?.ok) {
       if(['AI_DAILY_CAP','AI_CREDITS_EXHAUSTED','AI_SPEND_LIMIT','AI_NOT_CONFIGURED'].includes(data?.code))aiRemaining=0;
       throw Error(data?.error||result.error?.message||'AI classification unavailable');
      }
      const a=data.analysis;
      const tag=(a?.tags||[]).find(t=>/^maf:(military|police|fire|medical|security|professional|unsorted)$/.test(t));
      const suggested=tag&&['high','medium'].includes(a.confidence)&&a.nudity_level==='none'?tag.slice(4):'unsorted';
      if(suggested!=='unsorted'){
       const updates={military_tags:categoryTags(asset,suggested),military_category:'Uniforms',military_branch:suggested==='military'?(a.military_branch||'Unspecified'):'Unspecified'};
       if(suggested==='military'&&/^[A-Z]{2}$/.test(a.country_code||''))updates.military_country_code=a.country_code;
       const update=await corporate.from('corp_social_assets').update(updates).eq('id',id).eq('owner_id',uid).contains('military_tags',['maf:unsorted']).select('id').maybeSingle();
       if(update.error)throw Error(update.error.message);
       if(update.data){Object.assign(asset,updates);unsorted=Math.max(0,unsorted-1);updateQueueStatus();}
      }
     }catch(e){aiFailures++;console.warn('Uniform AI unavailable:',e?.message)}

  }
  try{await loadApproved()}catch(e){console.warn('Library refresh failed',e?.message)}
  text($('mfUploadStatus'),posted+' posted · '+saved+' saved · '+duplicates+' duplicates skipped · '+failed+' failed · '+unsorted+' unsorted'+(useAI?' · '+aiFailures+' AI errors · '+aiSkipped+' not visually analyzed':'')+(selected.length>picked.length?' · '+(selected.length-picked.length)+' over batch limit':'')+(picked.length>good.length?' · '+(picked.length-good.length)+' unsupported':'')+(direct?' · sorting is separate from posting':' · private uploads saved; sharing pending review')+'.');
 }finally{
  showWorldUploadFailures(worldFailedFiles.concat(rejected.map(file=>({file,reason:'Unsupported format, empty file or exceeds current 45 MB limit.'}))));
  uploading=false;queuePaused=false;$('mfUploadChoose').disabled=false;$('mfUploadClose').disabled=false;$('mfUploadCategory').disabled=false;$('mfUploadAi').disabled=false;$('mfUploadDirect').disabled=false;$('mfUploadPause').hidden=true;
 }
}

/* Static editorial art only: no private gallery or storage API requests for rotation. */
const portraitStates=[];
const portraitPeriod=30000;
let portraitsPaused=matchMedia('(prefers-reduced-motion: reduce)').matches;
let portraitTimer=null;
function mixPortraits(paths,previous){
 const deck=paths.slice();for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
 if(deck.length>1&&deck[0]===previous)[deck[0],deck[1]]=[deck[1],deck[0]];
 return deck;
}
function portraitLink(state,path){
 state.current=path;state.download.href=path;state.download.download=path.split('/').pop();
 try{sessionStorage.setItem('bc.maf.last.'+state.tile.dataset.mfUniform,path)}catch(_){}
}
function rotationVisible(){
 return Boolean(authorized&&workspaceView==='discover'&&!$('uMain').hidden&&!document.hidden);
}
function nextPortrait(state,initial=false){
 if(!rotationVisible()||state.busy||!state.paths.length||(!initial&&portraitsPaused))return;
 if(!initial&&(state.tile.contains(document.activeElement)||(matchMedia('(hover: hover)').matches&&state.tile.matches(':hover'))))return;
 if(!initial){const rect=state.tile.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)return}
 if(!state.deck.length)state.deck=mixPortraits(state.paths.filter(p=>!state.failed.has(p)),state.current);
 const path=state.deck.shift();if(!path||path===state.current){state.due=Date.now()+portraitPeriod;return}
 state.busy=true;const incoming=new Image();incoming.alt=state.img.alt;incoming.decoding='async';
 incoming.onload=()=>{
  if(!rotationVisible()||(!initial&&portraitsPaused)){state.busy=false;state.deck.unshift(path);return}
  const old=state.img,art=old.parentElement;
  if(!art){state.busy=false;return}
  const apply=()=>{old.remove();incoming.classList.remove('mf-portrait-incoming','mf-portrait-visible');state.img=incoming;portraitLink(state,path);state.busy=false;state.due=Date.now()+portraitPeriod};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden){art.append(incoming);apply();return}
  incoming.classList.add('mf-portrait-incoming');art.append(incoming);
  requestAnimationFrame(()=>requestAnimationFrame(()=>incoming.classList.add('mf-portrait-visible')));
  setTimeout(apply,470);
 };
 incoming.onerror=()=>{state.failed.add(path);state.busy=false;state.due=Date.now()+1000};
 incoming.src=path;
}
function paintPortraitPause(){
 const b=$('mfPortraitPause');if(!b)return;b.setAttribute('aria-pressed',String(portraitsPaused));b.setAttribute('aria-label',portraitsPaused?'Resume portrait rotation':'Pause portrait rotation');b.title=portraitsPaused?'Resume portrait rotation':'Pause portrait rotation';text($('mfRotationLabel'),portraitsPaused?'Portraits paused':'Live portraits');
}
function startPortraitRotation(){
 if(portraitTimer!==null)return;
 portraitStates.forEach((state,i)=>{state.due=Date.now()+portraitPeriod+i*900;setTimeout(()=>nextPortrait(state,true),i*180)});
 portraitTimer=setInterval(()=>{if(!rotationVisible()||portraitsPaused)return;const now=Date.now();for(const state of portraitStates){if(state.due<=now)nextPortrait(state)}},1000);
}
function categoryEntry(id){
 return new URL(worldPages[id]||'mans-armed-forces.html',location.href);
}
/* Installation is an OS-host operation, never a file download to the user's device. */
const worldInstallLabels={uniform:'Uniform World',military:'Military World',police:'Law Enforcement World',fire:'Fire & Rescue World',security:'Corrections World',medical:'EMS World',professional:'Aviation World'};
let worldInstallState={},worldInstallPending=null,worldInstallTimeout=null;
function paintWorldInstallButtons(){
 document.querySelectorAll('[data-mf-shortcut]').forEach(btn=>{
  const id=btn.dataset.mfShortcut,installed=worldInstallState[id]===true,label=worldInstallLabels[id]||'World';
  btn.dataset.installed=String(installed);btn.disabled=!!worldInstallPending;
  btn.title=installed?'Open '+label+' in BLACKCELL OS':'Install '+label+' on BLACKCELL OS';
  btn.setAttribute('aria-label',btn.title);
  btn.setAttribute('aria-busy',String(worldInstallPending?.category===id));
 });
}
function queryWorldOS(){
 if(window.parent===window)return;
 try{window.parent.postMessage({type:'blackcell-world-os-query'},location.origin)}catch(_){}
}
function installWorldFromGateway(id){
 if(!authorized||!Object.hasOwn(worldPages,id)||worldInstallPending)return;
 if(window.parent===window){text($('mfShortcutStatus'),'Open Man’s Armed Forces inside BLACKCELL OS to install this world. No browser file will be downloaded.');return}
 const request=String(Date.now())+'-'+Math.random().toString(36).slice(2);
 worldInstallPending={category:id,request};paintWorldInstallButtons();
 text($('mfShortcutStatus'),worldInstallState[id]?'Opening '+worldInstallLabels[id]+'…':'Installing '+worldInstallLabels[id]+' on BLACKCELL OS…');
 worldInstallTimeout=setTimeout(()=>{
  worldInstallPending=null;paintWorldInstallButtons();text($('mfShortcutStatus'),'BLACKCELL OS did not respond. Open Man’s Armed Forces inside the verified OS and try again.');queryWorldOS();
 },8000);
 try{window.parent.postMessage({type:'blackcell-world-os-install',category:id,request},location.origin)}catch(_){clearTimeout(worldInstallTimeout);worldInstallPending=null;paintWorldInstallButtons();text($('mfShortcutStatus'),'Open this gateway inside BLACKCELL OS to install the world.')}
}
window.addEventListener('message',event=>{
 if(window.parent===window||event.source!==window.parent||event.origin!==location.origin)return;
 const data=event.data;if(data?.type!=='blackcell-world-os-state'||!data.installed||typeof data.installed!=='object')return;
 worldInstallState=Object.fromEntries(Object.keys(worldInstallLabels).map(id=>[id,data.installed[id]===true]));
 if(worldInstallPending&&data.request===worldInstallPending.request&&data.category===worldInstallPending.category){
  const label=worldInstallLabels[worldInstallPending.category];clearTimeout(worldInstallTimeout);worldInstallPending=null;
  text($('mfShortcutStatus'),data.ok===true?(data.opened?'Opening '+label+' inside BLACKCELL OS.':label+' installed on your BLACKCELL OS desktop.'):(typeof data.error==='string'?data.error:'World installation was not confirmed.'));
 }
 paintWorldInstallButtons();
});
function ensureMediaUI(){
 const image=$('mfViewerImage'),grid=$('mfPhotoGrid');
 if(image&&!$('mfViewerVideo')){
  const v=document.createElement('video');v.id='mfViewerVideo';v.controls=true;v.playsInline=true;v.preload='none';v.hidden=true;v.setAttribute('aria-label','Private video player');image.after(v);
 }
 if(grid&&!$('mfMediaFilter')){
  const label=document.createElement('label');label.className='mf-media-filter';label.append('Media type ');
  const select=document.createElement('select');select.id='mfMediaFilter';select.setAttribute('aria-label','Filter media');
  for(const [value,title] of [['all','All media'],['photo','Photos'],['video','Videos']]){const o=document.createElement('option');o.value=value;o.textContent=title;select.append(o)}
  label.append(select);grid.before(label);
 }
 const heading=$('mfCollectionHeading');if(heading)heading.textContent=heading.textContent.replace(/Photo Library/g,'Media Library');
 const count=$('mfImageCount')?.nextElementSibling;if(count)count.textContent='MEDIA ITEMS';
 const desc=heading?.parentElement?.querySelector('p');if(desc)desc.textContent='Browse photos and videos in your collection. Your pending uploads stay private.';
 if(!document.getElementById('mfRuntimeMediaStyle')){
  const style=document.createElement('style');style.id='mfRuntimeMediaStyle';style.textContent='#uMain .mf-photo-card.mf-video-card{display:block;width:100%;min-width:0;min-height:132px;overflow:hidden;text-align:left;border:1px solid #35373e;background:#101116;border-radius:12px;padding:0}#uMain .mf-video-tile{width:100%;aspect-ratio:16/10;min-height:112px;display:grid;place-content:center;justify-items:center;gap:9px;background:linear-gradient(145deg,#252831,#090a0d);color:#f3f5f8}#uMain .mf-video-tile span{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#ffffff15;font-size:20px}#uMain .mf-video-tile small{font-size:10px;letter-spacing:.16em}#uMain .mf-video-card .mf-photo-info{display:block;padding:10px;overflow:hidden}#uMain .mf-video-card .mf-photo-info strong,#uMain .mf-video-card .mf-photo-info small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#mfViewerVideo{width:100%;min-height:100px;max-height:65vh;object-fit:contain;background:#000;flex:1 1 auto}#mfViewerVideo[hidden],#mfViewerImage[hidden],#mfTransferPhotos[hidden]{display:none!important}.mf-media-filter{display:flex;gap:10px;align-items:center;margin:12px 0;color:#aaa;font-size:13px}.mf-media-filter select{background:#18191c;color:#fff;border:1px solid #41434a;border-radius:8px;padding:8px}';document.head.append(style);
 }
}
function wire(){
 ensureMediaUI();
 worldAlgorithm.mount();
 installWorldPlayer($('mfViewerVideo'),$('mfLightbox'));
 const rename=document.createElement('button');rename.type='button';rename.id='mfRenameVideo';rename.className='mf-secondary';rename.textContent='Edit title';rename.hidden=true;
 $('mfViewerTitle')?.parentElement?.append(rename);
 rename.addEventListener('click',async()=>{const a=viewerAsset,uid=authorized?.user.id;if(!a||a.kind!=='video'||a.owner_id!==uid)return;const input=window.prompt('Video title',a.caption||worldVideoTitle(a));if(input===null||!input.trim())return;const caption=input.trim().slice(0,180);rename.disabled=true;try{const out=await corporate.from('corp_social_assets').update({caption}).eq('id',a.id).eq('owner_id',uid).select('id,caption').maybeSingle();if(out.error||!out.data)throw Error(out.error?.message||'Title save not confirmed');a.caption=out.data.caption;if(viewerAsset?.id===a.id)text($('mfViewerTitle'),mediaTitle(a));await render()}catch(e){alert('Title not saved: '+e.message)}finally{rename.disabled=false}});
 $('mfMediaFilter')?.addEventListener('change',e=>{mediaFilter=e.target.value;page=0;if(authorized)void render()});
 document.querySelectorAll('.mf-portrait-tile[data-mf-uniform]').forEach(tile=>{
  const img=tile.querySelector('.mf-album-art img'),download=tile.querySelector('.mf-portrait-download');if(!img||!download)return;
  const original=tile.dataset.portraitOriginal,prefix=tile.dataset.portraitPrefix,fallback=tile.dataset.portraitFallback;
  const paths=prefix?Array.from({length:11},(_,i)=>prefix+String(i).padStart(2,'0')+'.png'):[];
  let previous='';try{previous=sessionStorage.getItem('bc.maf.last.'+tile.dataset.mfUniform)||''}catch(_){}
  const state={tile,img,download,paths,deck:mixPortraits(paths,previous),failed:new Set(),current:img.getAttribute('src'),busy:false,due:Infinity};
  portraitStates.push(state);download.download=state.current.split('/').pop();
  const onOriginalError=()=>{if(state.img!==img||img.getAttribute('src')===fallback)return;img.src=fallback;portraitLink(state,fallback)};
  img.addEventListener('error',onOriginalError);if(img.complete&&!img.naturalWidth)onOriginalError();
 });
 document.querySelectorAll('[data-mf-shortcut]').forEach(btn=>btn.addEventListener('click',()=>installWorldFromGateway(btn.dataset.mfShortcut)));
 paintWorldInstallButtons();
 if(!worldId){window.addEventListener('focus',queryWorldOS);document.addEventListener('visibilitychange',()=>{if(!document.hidden)queryWorldOS()})}
 paintPortraitPause();$('mfPortraitPause')?.addEventListener('click',()=>{portraitsPaused=!portraitsPaused;paintPortraitPause()});
 document.querySelectorAll('[data-mf-view]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();showWorkspaceView(btn.dataset.mfView)}));
 const entry=new URLSearchParams(location.search).get('uniform');
 if(worldId){filterCategory=worldScope||'all';showWorkspaceView(location.hash.slice(1)||'discover',{updateHash:false});}
 else if(entry&&Object.hasOwn(categories,entry)&&(!location.hash||location.hash==='#collection'))setFilter({category:entry});
 else showWorkspaceView(location.hash.slice(1)||'discover',{updateHash:false});
 window.addEventListener('hashchange',()=>showWorkspaceView(location.hash.slice(1),{updateHash:false}));
 $('mfSearch')?.addEventListener('input',e=>{clearTimeout(searchTimer);const value=e.target.value.trim().toLowerCase();searchTimer=setTimeout(()=>{if(value===searchQuery)return;searchQuery=value;page=0;if(authorized)void render()},180)});
 $('mfTransferPhotos')?.addEventListener('click',()=>void transferToPhotos());
 $('mfUploadOpen').addEventListener('click',()=>{if(uploading)return;$('mfUploadForm').hidden=false;});
 $('mfCloudChoose')?.addEventListener('click',()=>void chooseCloudPhotos());
 $('mfUploadClose').addEventListener('click',()=>{if(!uploading)$('mfUploadForm').hidden=true});
 $('mfUploadChoose').addEventListener('click',()=>{$('mfUploadFiles').value='';$('mfUploadFiles').click()});
 $('mfUploadFiles').addEventListener('change',()=>{const input=$('mfUploadFiles'),files=Array.from(input.files||[]);input.value='';void uploadUniforms(files)});
 $('mfUploadPause').addEventListener('click',()=>{queuePaused=!queuePaused;$('mfUploadPause').textContent=queuePaused?'▶ RESUME UPLOADS / AI':'Ⅱ PAUSE UPLOADS / AI';if(queuePaused)text($('mfUploadStatus'),'Paused after the current item finishes.');});
 $('mfReviewQueue').addEventListener('click',()=>{text($('mfQueueError'),'');void openQueue(0)});
 $('mfQueueSkip').addEventListener('click',()=>{if(!queueBusy){text($('mfQueueError'),'');void openQueue(queueIndex+1)}});
 $('mfQueueControls').querySelectorAll('[data-assign-uniform]').forEach(b=>b.addEventListener('click',()=>void assignQueued(b.dataset.assignUniform)));
 $('mfPublishPending').addEventListener('click',()=>void publishPending());
 $('mfPreviousPage').addEventListener('click',()=>{page--;void render()});
 $('mfNextPage').addEventListener('click',()=>{page++;void render()});
 $('mfMoveCategory').addEventListener('change',async()=>{try{await movePhoto(viewerAsset,$('mfMoveCategory').value)}catch(e){alert('Category update failed: '+e.message);$('mfMoveCategory').value=inferCategory(viewerAsset)}});
 document.querySelectorAll('[data-category-filter]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({category:btn.dataset.categoryFilter})));
 document.querySelectorAll('[data-category]').forEach(btn=>
  btn.addEventListener('click',()=>{const id=btn.dataset.category;if(!worldScope&&Object.hasOwn(worldPages,id))location.assign(categoryEntry(id).href);else setFilter({category:id})}));
 document.querySelectorAll('[data-filter]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({branch:btn.dataset.filter,category:'military'})));
 document.querySelectorAll('[data-branch]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({branch:btn.dataset.branch,category:'military'})));
 const dialog=$('mfLightbox');
 $('mfCloseViewer')?.addEventListener('click',()=>dialog?.close());
 dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 $('mfViewerVideo')?.addEventListener('error',()=>{if(viewerAsset?.kind==='video'&&$('mfViewerVideo').getAttribute('src'))text($('mfTransferStatus'),'This video could not be played on this device. Try an MP4 encoded in H.264.')});
 dialog?.addEventListener('close',()=>{worldAlgorithm.close();viewerRequest++;const v=$('mfViewerVideo');v.pause();v.removeAttribute('src');v.load();v._blackcellPlayer?.show(false);v.hidden=true;$('mfViewerImage').hidden=false;$('mfViewerImage').removeAttribute('src');sortingQueue=false;viewerAsset=null;$('mfQueueControls').hidden=true;$('mfTransferPhotos').hidden=false;});
 document.querySelectorAll('.mf-portrait img').forEach(image=>{
  image.addEventListener('error',()=>{
   image.style.opacity='0';
   image.closest('figure')?.classList.add('mf-image-fallback');
  });
 });
}
async function loadApproved(){
 text($('mfCollectionStatus'),'Loading the private uniform collection…');
 try{
  const candidates=[];
  for(let offset=0;authorized;offset+=500){
   const {data,error}=await corporate.from('corp_social_assets')
    .select('id,owner_id,filename,caption,storage_path,military_branch,military_category,military_era,military_tags,review_status,adult_restricted,purpose,kind,created_at,source_provider,mime_type')
    .or('and(review_status.eq.approved,adult_restricted.eq.false),and(review_status.eq.pending,owner_id.eq.'+authorized.user.id+')').eq('purpose','library').in('kind',['photo','video'])
    .order('created_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+499);
   if(error)throw Error(error.message);
   candidates.push(...(data||[]).filter(a=>a.storage_path&&a.id));
   if(!data||data.length<500)break;
  }
  approved=candidates;uploadState.assets=approved.slice();lastSigned=Date.now();
  pendingOwn=[];
  if(owner()){
   // Do not publish previously pending files without a fresh rights declaration.
   for(let offset=0;offset<10000;offset+=500){
    const out=await corporate.from('corp_social_assets').select('id,military_tags').eq('owner_id',authorized.user.id).eq('review_status','pending').eq('adult_restricted',false).eq('purpose','library').eq('kind','photo').order('id').range(offset,offset+499);
    if(out.error)break;
    pendingOwn.push(...(out.data||[]).filter(a=>(a.military_tags||[]).some(t=>/^maf:(military|police|fire|medical|security|professional|unsorted)$/.test(t))));
    if(!out.data||out.data.length<500)break;
   }
  }
  await render();
 }catch(e){text($('mfCollectionStatus'),'Uniform collection unavailable: '+safe(e?.message||'Connection error'))}
}
async function securityCheck(){
 if(!authorized||authBusy||document.hidden)return;
 authBusy=true;
 try{
  const result=await corporate.auth.getUser();
  if(result.error||result.data.user?.id!==authorized.user.id)throw Error('Session ended.');
  const fn=authorized.member.role==='owner'?'corp_code_status':'corp_employee_code_status';
  const check=await corporate.rpc(fn);
  if(check.error||check.data?.verified!==true)throw Error('Corporate verification expired.');
  if(Date.now()-lastSigned>signedMs)await loadApproved();
 }catch(_){
  releaseWorldUrls();authorized=null;
  $('uMain').hidden=true;$('uGate').hidden=false;
  text($('uGateText'),'Your corporate session has expired. Sign in and verify your access again.');
  $('mfLightbox')?.close();
 }finally{authBusy=false}
}
async function boot(){
 wire();
 authorized=await authorizeUniformHub();
 if(!authorized)return;
 if(!worldId){startPortraitRotation();queryWorldOS();}
 $('mfPortal').href=authorized.member.role==='owner'?'dashboard.html':'employee.html';
 uploadState.user=authorized.user;
 $('mfAiOption').hidden=!!worldScope||!owner();$('mfDirectOption').hidden=!owner();
 await Promise.all([loadApproved(),worldAlgorithm.load()]);
 if(worldAlgorithm.enabled())await render();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void securityCheck()});
 window.addEventListener('focus',()=>void securityCheck());
 corporate.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'&&authorized){
   releaseWorldUrls();authorized=null;$('mfLightbox')?.close();$('uMain').hidden=true;$('uGate').hidden=false;
   text($('uGateText'),'Signed out. Return to the corporate portal to sign in.');
  }
 });
 window.setInterval(()=>{if(!document.hidden)void securityCheck()},60000);
}
void boot();
