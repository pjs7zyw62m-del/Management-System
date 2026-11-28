/* Personal media only. Never writes to public/social storage. */
export const PRIVATE_BUCKET='blackcell-os-files';
import {createPrivateDrive,PRIVATE_FILE_LIMIT} from './blackcell-private-drive.js?v=20261128-folder-storage1';
export {PRIVATE_FILE_LIMIT};
export function privateUploadError(error){
 const raw=String(error?.message||error||'Upload failed.');
 if(/duplicate|already exists|409|resource already exists/i.test(raw))return 'A file with this name already exists.';
 if(/size|too large|payload|413/i.test(raw))return 'Storage rejected the file size. Check the 256 MB project limit.';
 if(/403|401|policy|permission|unauthorized|jwt/i.test(raw))return 'Access denied. Verify your corporate session.';
 if(/network|fetch|load failed|timeout/i.test(raw))return 'Connection interrupted. Try uploading again.';
 return raw.replace(/https?:\/\/\S+/g,'[storage endpoint]').slice(0,130)
}
export async function uploadPrivateFile(storage,path,file,onProgress){
 if(!file.size)throw Error('The file is empty.');
 if(file.size>PRIVATE_FILE_LIMIT)throw Error('File exceeds the 256 MB private upload limit.');
 const result=await storage.upload(path,file,{upsert:false,contentType:'application/octet-stream',cacheControl:'0',onProgress});
 if(result.error)throw result.error;
 // Generate one private cloud thumbnail while the new photo is already available.
 if(result.data?.id&&storage.writePreview&&mediaType(path).startsWith('image/')&&!/heic|heif/i.test(mediaType(path))){try{const frame=await imageFrame(file);if(frame.small)await storage.writePreview(result.data.id,frame)}catch(_){} }
 return result.data
}

const formats={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',m4v:'video/x-m4v',mov:'video/quicktime',webm:'video/webm'};
export const mediaType=name=>formats[String(name).split('.').pop().toLowerCase()]||'';
const make=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
const button=(label,fn)=>{const n=make('button','bc-pm-button',label);n.type='button';n.onclick=fn;return n};
function checked(r){if(r.error)throw Error(r.error.message);return r.data}
export async function privateFiles(storage,uid,alive=()=>true){
 const queue=[uid+'/Photos'],rows=[];let scanned=0,limited=false;
 while(queue.length&&alive()){
  if(scanned++>=150||rows.length>=1000){limited=true;break}
  const prefix=queue.shift();
  for(let offset=0;alive();offset+=100){
   const page=checked(await storage.list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}}))||[];
   for(const r of page){if(r.name==='.blackcell-folder')continue;const path=prefix+'/'+r.name;if(!r.id){queue.push(path);continue}const type=mediaType(r.name);if(type)rows.push({path,name:r.name,type,date:r.created_at||r.updated_at||'',size:r.metadata?.size||0,provider:r.provider||'legacy',objectId:r.provider==='bunny'?r.id:null});if(rows.length>=1000){limited=true;break}}
   if(page.length<100||limited||offset>=4900)break;
  }
  if(limited)break;
 }
 return {rows:rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))),limited};
}
export async function getPrivateMedia(storage,row){const blob=checked(await storage.download(row.path));return new File([blob],row.name,{type:row.type||mediaType(row.name)});}
export function createPrivateViewer(host,storage,alive=()=>true,onDelete=null){
 let generation=0,url=null,overlay=null;
 function close(){generation++;if(overlay){for(const v of overlay.querySelectorAll('video')){v.pause();v.removeAttribute('src');v.load()}overlay.remove();overlay=null}if(url){URL.revokeObjectURL(url);url=null}}
 async function open(row){
  close();const seq=generation;overlay=make('div','bc-pm-viewer');const head=make('header','bc-pm-view-head'),label=make('strong','',row.name),body=make('div','bc-pm-view-body','Loading private media…');const actions=make('div','bc-pm-view-actions');if(onDelete){const remove=button('Delete',()=>{if(alive())onDelete(row)});remove.classList.add('bc-pm-danger');actions.append(remove)}actions.append(button('Close ×',close));head.append(label,actions);overlay.append(head,body);host.append(overlay);
  try{const file=await getPrivateMedia(storage,row);if(seq!==generation||!alive())return;url=URL.createObjectURL(file);const video=file.type.startsWith('video/');const media=make(video?'video':'img');media.src=url;if(video){media.controls=true;media.playsInline=true;media.preload='metadata'}else media.alt=row.name;media.onerror=()=>{if(seq===generation)body.replaceChildren(make('p','','Preview unavailable for this format on your device. Download the original from Files to open it in a compatible application.'))};body.replaceChildren(media)}
  catch(e){if(seq===generation&&alive())body.textContent='Unable to preview this file.'}
 }
 return {open,close};
}
// Natural-aspect rows: fill completed rows exactly, leave the final row
// at a readable height rather than stretching one portrait across the window.
export function videoDurationLabel(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return 'VIDEO';
 const n=Math.floor(seconds),h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=String(n%60).padStart(2,'0');
 return h?h+':'+String(m).padStart(2,'0')+':'+sec:m+':'+sec;
}
// Decode a frame locally from the authorized original. No video or frame
// leaves the private Photos app; the temporary object URL is always freed.
async function privateVideoFrame(file){
 const video=document.createElement('video'),url=URL.createObjectURL(file);
 video.muted=true;video.playsInline=true;video.preload='auto';
 async function wait(event,ready,begin,timeout=15000){
  if(ready?.())return;
  await new Promise((resolve,reject)=>{
   let timer;const finish=e=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',fail);e?reject(e):resolve()};
   const done=()=>finish(),fail=()=>finish(Error('Video preview unavailable'));
   video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});
   timer=setTimeout(()=>finish(Error('Video preview timed out')),timeout);
   try{begin?.();if(ready?.())finish()}catch(e){finish(e)}
  });
 }
 try{
  await wait('loadeddata',()=>video.readyState>=2,()=>{video.src=url;video.load()});
  if(!video.videoWidth||!video.videoHeight)throw Error('No video frame');
  if(Number.isFinite(video.duration)&&video.duration>.8){
   const point=Math.min(4,video.duration*.18,video.duration-.1);
   try{await wait('seeked',null,()=>{video.currentTime=point},3500)}catch(_){}
  }
  const canvas=document.createElement('canvas'),scale=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Preview unavailable');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));
  if(!blob)throw Error('No preview generated');
  return {blob,ratio:video.videoWidth/video.videoHeight,duration:video.duration};
 }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
// Preview metadata is part of the authenticated encrypted thumbnail payload.
async function cloudFrame(storage,row){
 if(!row.objectId||!storage.readPreview)return null;
 try{
  const packed=await storage.readPreview(row.objectId);
  if(!packed||packed.size<20||packed.size>524288)return null;
  const header=new DataView(await packed.slice(0,16).arrayBuffer()),ratio=header.getFloat64(0),duration=header.getFloat64(8);
  if(!Number.isFinite(ratio)||ratio<.01||ratio>100)return null;
  return {blob:packed.slice(16,packed.size,'image/jpeg'),ratio,duration,small:true};
 }catch(_){return null}
}
async function imageFrame(file){
 let bitmap=null,image=null,url=null;
 try{
  if(typeof createImageBitmap==='function'){try{bitmap=await createImageBitmap(file)}catch(_){}}
  if(!bitmap){url=URL.createObjectURL(file);image=new Image();image.src=url;await image.decode()}
  const src=bitmap||image,width=bitmap?.width||image?.naturalWidth,height=bitmap?.height||image?.naturalHeight;
  if(!width||!height)throw Error('Image preview unavailable');
  const scale=Math.min(1,960/Math.max(width,height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  ctx.drawImage(src,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
  if(!blob)throw Error('Preview unavailable');
  if(blob.size>524272){const smaller=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.78));if(smaller&&smaller.size<=524272)return {blob:smaller,ratio:width/height,small:true}}
  return {blob,ratio:width/height,small:true};
 }finally{bitmap?.close();if(url)URL.revokeObjectURL(url)}
}
export function justifiedPhotoRows(ratios,width,target,gap=3){
 const result=[];let batch=[],sum=0;
 if(width<=0)return result;
 const goal=Math.max(70,target);
 function finish(full){
  if(!batch.length)return;
  const available=Math.max(1,width-gap*(batch.length-1));
  const h=full?available/sum:Math.min(goal,available/sum);
  let used=0;for(let i=0;i<batch.length;i++){
   const item=batch[i],w=full&&i===batch.length-1?available-used:Math.max(1,Math.floor(item.ratio*h));
   result.push({index:item.index,width:w,height:Math.max(1,Math.floor(h))});used+=w;
  }batch=[];sum=0;
 }
 ratios.forEach((n,index)=>{const ratio=Number.isFinite(n)&&n>0?n:1;batch.push({index,ratio});sum+=ratio;if(sum*goal+gap*(batch.length-1)>=width)finish(true)});
 finish(false);return result;
}
export function mountPrivatePhotos(host,{client,userId,preview,alive,onBusy}){
 host.classList.add('bc-pm-gallery','bc-apple-photos');const storage=createPrivateDrive(client,userId);let rows=[],mode='all',page=0,closed=false,busy=false,loading=false,refreshSeq=0,version=0,urls=[],selecting=false,selected=new Set(),deleteDialog=null,view='all',dateScope='',zoom=144,sidebarClosed=false;
 const usable=()=>!closed&&alive(),key='bc.photos.layout.v2:'+String(userId||'preview');
 let prefs={favorites:[],albums:[],zoom:144,sidebarClosed:false};
 if(!preview)try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved==='object'){prefs.favorites=Array.isArray(saved.favorites)?saved.favorites.filter(x=>typeof x==='string'&&x.startsWith(userId+'/')).slice(0,3000):[];prefs.albums=Array.isArray(saved.albums)?saved.albums.filter(a=>typeof a?.id==='string'&&typeof a?.name==='string'&&Array.isArray(a.paths)).slice(0,100).map(a=>({id:a.id,name:a.name.slice(0,80),paths:a.paths.filter(x=>typeof x==='string'&&x.startsWith(userId+'/')).slice(0,3000)})):[];prefs.zoom=Math.min(230,Math.max(80,Number(saved.zoom)||144));prefs.sidebarClosed=saved.sidebarClosed===true}}catch(_){}
 zoom=prefs.zoom;const mobileLayout=document.documentElement.classList.contains('bc-os-phone');sidebarClosed=mobileLayout?true:prefs.sidebarClosed;
 const favorites=new Set(prefs.favorites),memberLabels=new Map(),legacyOwners=new Map();
 const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 const oldAssetId=row=>row.path.slice((userId||'').length+1).match(/^Photos\/BLACKCELL-([0-9a-f-]{36})\.(?:jpg|jpeg|png|webp|gif|heic|heif)$/i)?.[1]||null;
 const memberIdFor=row=>row.path.slice((userId||'').length+1).match(/^Photos\/From Members\/([0-9a-f-]{36})\//i)?.[1]||legacyOwners.get(oldAssetId(row))||null;
 async function resolveMemberAlbums(seq){
  const ids=[...new Set(rows.map(oldAssetId).filter(id=>id&&uuid.test(id)))];
  // An older saved original can be associated without moving, downloading or
  // duplicating it. Only source metadata visible to this member is queried.
  for(let i=0;i<ids.length;i+=100){
   try{const {data,error}=await client.from('corp_social_assets').select('id,owner_id').in('id',ids.slice(i,i+100));
    if(!usable()||seq!==refreshSeq)return;
    if(!error)for(const a of data||[])if(uuid.test(String(a.owner_id||'')))legacyOwners.set(a.id,a.owner_id);
   }catch(_){}
  }
  const members=memberAlbums();
  for(let i=0;i<members.length;i+=100){
   try{const {data,error}=await client.from('corp_social_profiles').select('user_id,display_name').in('user_id',members.slice(i,i+100));
    if(!usable()||seq!==refreshSeq)return;
    if(!error)for(const p of data||[])if(p.display_name)memberLabels.set(p.user_id,p.display_name);
   }catch(_){}
  }
 }
 const memberAlbums=()=>[...new Set(rows.map(memberIdFor).filter(Boolean))];
 const memberMode=()=>mode.startsWith('member:')?mode.split(':').slice(1):[];
 const memberKind=row=>/^Photos\/From Members\/[0-9a-f-]{36}\/AI Creations\//i.test(row.path.slice((userId||'').length+1))?'ai':'originals';
 const memberRows=(id,kind)=>rows.filter(row=>memberIdFor(row)===id&&(!kind||memberKind(row)===kind));
 const memberName=id=>memberLabels.get(id)||'BLACKCELL Member · '+id.slice(0,8);
 function savePrefs(){prefs.favorites=[...favorites];prefs.zoom=zoom;if(!mobileLayout)prefs.sidebarClosed=sidebarClosed;if(preview)return;try{localStorage.setItem(key,JSON.stringify(prefs))}catch(_){status.textContent='Library organization is available for this session only.'}}
 const side=make('aside','ap-side'),main=make('main','ap-main'),head=make('header','ap-toolbar'),body=make('div','ap-content'),heading=make('div','ap-heading'),title=make('h2','','Library'),subtitle=make('p','','Your private library');heading.append(title,subtitle);
 const sideTitle=make('div','ap-side-title');sideTitle.append(make('span','ap-flower','✿'),make('strong','','Photos'));side.append(sideTitle);
 const sidemenu=make('nav','ap-sidemenu');side.append(sidemenu);
 const input=make('input');input.type='file';input.accept='image/*,video/*';input.multiple=true;input.hidden=true;
 const add=button('Import',()=>input.click()),refreshBtn=button('↻',()=>void refresh());refreshBtn.title='Refresh library';refreshBtn.setAttribute('aria-label','Refresh library');
 const selectBtn=button('Select',()=>{if(busy||loading||preview)return;selecting=!selecting;selected.clear();if(selecting)view='all';render()});
 const sideBtn=button('▥',()=>{sidebarClosed=!sidebarClosed;savePrefs();applySidebar()});sideBtn.title='Show or hide sidebar';sideBtn.setAttribute('aria-label','Show or hide sidebar');
 function applySidebar(){host.classList.toggle('ap-side-closed',sidebarClosed);side.inert=sidebarClosed;sideBtn.setAttribute('aria-expanded',String(!sidebarClosed))}
 const nav=make('div','ap-segments'),search=make('input','bc-pm-search ap-search');search.type='search';search.placeholder='Search';search.setAttribute('aria-label','Search private photos');
 const tabs=[['years','Years'],['months','Months'],['all','All Photos']].map(([m,name])=>{const x=button(name,()=>{view=m;dateScope='';page=0;render()});nav.append(x);return [m,x]});
 const zoomWrap=make('div','ap-zoom');const zoomInput=make('input');zoomInput.type='range';zoomInput.min='80';zoomInput.max='230';zoomInput.step='10';zoomInput.value=String(zoom);zoomInput.setAttribute('aria-label','Thumbnail size');zoomInput.oninput=()=>{zoom=Number(zoomInput.value);grid.style.setProperty('--ap-thumb-size',zoom+'px');queuePhotoLayout()};zoomInput.onchange=()=>savePrefs();zoomWrap.append(make('span','','−'),zoomInput,make('span','','+'));
 const tools=make('div','ap-tools');tools.append(search,selectBtn,add,refreshBtn);head.append(sideBtn,zoomWrap,nav,tools);
 const selectionBar=make('div','bc-pm-selectionbar'),selectionCount=make('span','','0 selected'),selectPage=button('Select page',()=>{if(busy||loading)return;const visible=visibleRows();const all=visible.length&&visible.every(r=>selected.has(r.path));for(const row of visible){if(all)selected.delete(row.path);else selected.add(row.path)}render()}),favoriteSelected=button('♥ Favorite',()=>{if(!selected.size||busy||loading)return;for(const path of selected)favorites.add(path);savePrefs();render()}),albumSelected=button('Add to album',()=>addToAlbum([...selected])),deleteSelected=button('Delete selected',()=>confirmDelete(rows.filter(r=>selected.has(r.path))));deleteSelected.classList.add('bc-pm-danger');selectionBar.append(selectionCount,selectPage,favoriteSelected,albumSelected,deleteSelected);selectionBar.hidden=true;
 const grid=make('div','bc-pm-grid ap-grid'),foot=make('footer','bc-pm-foot'),status=make('span','','Private library · Never posted automatically'),pager=make('div');foot.append(status,pager);body.append(heading,selectionBar,grid,foot);main.append(head,body);host.append(side,main,input);status.setAttribute('role','status');grid.style.setProperty('--ap-thumb-size',zoom+'px');applySidebar();
 let currentRow=null,viewerGeneration=0,viewerURL=null,viewerOverlay=null,viewerPhoto=null,infoShown=false,viewerStudioCleanup=null;
 function closeViewer(){viewerGeneration++;viewerStudioCleanup?.();viewerStudioCleanup=null;if(viewerPhoto?.tagName==='VIDEO'){viewerPhoto.pause();viewerPhoto.removeAttribute('src');viewerPhoto.load()}viewerOverlay?.remove();viewerOverlay=null;viewerPhoto=null;currentRow=null;if(viewerURL){URL.revokeObjectURL(viewerURL);viewerURL=null}}
 async function openViewer(row){
  closeViewer();if(!usable())return;currentRow=row;const seq=viewerGeneration,visible=filteredRows(),index=visible.findIndex(x=>x.path===row.path);viewerOverlay=make('section','bc-pm-viewer ap-viewer');const top=make('header','bc-pm-view-head ap-view-toolbar'),label=make('strong','',row.name),actions=make('div','bc-pm-view-actions');const back=button('‹ Library',closeViewer),prev=button('‹',()=>{if(index>0)void openViewer(visible[index-1])}),next=button('›',()=>{if(index+1<visible.length)void openViewer(visible[index+1])});prev.disabled=index<=0;next.disabled=index<0||index>=visible.length-1;prev.setAttribute('aria-label','Previous photo');next.setAttribute('aria-label','Next photo');const fav=button(favorites.has(row.path)?'♥':'♡',()=>{if(preview)return;if(favorites.has(row.path))favorites.delete(row.path);else favorites.add(row.path);savePrefs();fav.textContent=favorites.has(row.path)?'♥':'♡';render()});fav.disabled=preview;fav.setAttribute('aria-label','Favorite photo');const details=make('aside','ap-info');details.hidden=!infoShown;const toggle=button('ⓘ',()=>{infoShown=!infoShown;details.hidden=!infoShown});toggle.setAttribute('aria-label','Photo information');details.append(make('h3','','Info'),make('strong','',row.name),make('p','',row.type),make('p','',row.date?new Date(row.date).toLocaleString():'Date unavailable'),make('p','',row.size?((row.size/1048576).toFixed(2)+' MB'):'Size unavailable'));const download=button('↓',()=>{if(!viewerURL)return;const link=make('a');link.href=viewerURL;link.download=row.name;link.click()});download.disabled=true;download.setAttribute('aria-label','Download original');actions.append(prev,next,fav,toggle,download);if(!preview){const del=button('Delete',()=>confirmDelete([row]));del.classList.add('bc-pm-danger');actions.append(del)}top.append(back,label,actions);const area=make('div','ap-view-area'),content=make('div','bc-pm-view-body','Loading original…');area.append(content,details);
  let studioOpen=false,studio=null,aiButton=null;
  if(row.type.startsWith('image/')){
   const showStudio=()=>{
    if(!usable()||seq!==viewerGeneration||!viewerPhoto?.naturalWidth)return;
    studioOpen=!studioOpen;aiButton.setAttribute('aria-pressed',String(studioOpen));aiButton.textContent=studioOpen?'Close AI Video':'✧ AI Video';
    if(!studioOpen){viewerStudioCleanup?.();viewerStudioCleanup=null;studio?.remove();studio=null;area.classList.remove('ap-ai-split');return}
    details.hidden=true;infoShown=false;
    if(content.classList.contains('ap-photo-zoomed'))viewerPhoto.click();
    studio=make('section','ap-ai-studio');studio.setAttribute('aria-label','AI Video Studio');
    const top=make('div','ap-ai-head');top.append(make('span','ap-ai-kicker','BLACKCELL INTELLIGENCE'),make('h2','','AI Video Studio'),make('p','','Create a video from this photograph.'));
    const stage=make('div','ap-ai-stage'),providerStatus=make('p','','BLACKCELL · Rendering connection not verified');providerStatus.setAttribute('role','status');stage.append(make('span','ap-ai-symbol','▷'),make('strong','','Video preview'),providerStatus);
    const check=button('Check BLACKCELL connection',async()=>{if(preview||!studioOpen||!usable())return;check.disabled=true;providerStatus.textContent='Checking BLACKCELL rendering connection…';try{const {data,error}=await client.functions.invoke('blackcell-kling-status',{body:{}});if(!studioOpen||!usable()||seq!==viewerGeneration)return;providerStatus.textContent=!error&&data?.ok?'BLACKCELL connected · '+data.activePackages+' active resource package(s)':data?.code==='SECRET_MISSING'?'Rendering connection not configured':data?.code==='KEY_REJECTED'?'Rendering provider rejected the connection credentials':error?'Connection check unavailable · owner session required':'BLACKCELL rendering connection not verified · '+String(data?.code||'Unknown status');}catch{if(studioOpen&&usable()&&seq===viewerGeneration)providerStatus.textContent='Connection check failed. Try again.'}finally{check.disabled=preview}});check.disabled=preview;stage.append(check);
    const panel=studio,active=()=>studioOpen&&studio===panel&&seq===viewerGeneration&&usable();
    const relative=row.path.slice((userId||'').length+1),source=memberIdFor(row);
    const w=viewerPhoto.naturalWidth,h=viewerPhoto.naturalHeight,ratio=w/h;
    const ownedPath=/^Photos\/[^/]+\.(?:jpe?g|png)$/i.test(relative)&&!/^Photos\/BLACKCELL-[0-9a-f-]{36}\./i.test(relative)||source===userId&&relative.startsWith('Photos/From Members/'+userId+'/')&&relative.split('/').length===4&&/^BLACKCELL-[0-9a-f-]{36}\.(?:jpe?g|png)$/i.test(row.name);
    const reasons=[];
    if(preview)reasons.push('Sign in as the BLACKCELL owner.');
    if(!/\.(?:jpe?g|png)$/i.test(row.name))reasons.push('Unsupported format: choose a JPEG or PNG.');
    if(Number(row.size)>8*1024*1024)reasons.push('File is '+(Number(row.size)/1048576).toFixed(1)+' MB; the pilot limit is 8 MB.');
    if(w<300||h<300)reasons.push('Image is '+w+' × '+h+' px; each side must be at least 300 px.');
    if(ratio<.4||ratio>2.5)reasons.push('Image is too tall or wide for this pilot ('+w+' × '+h+' px).');
    if(source&&source!==userId)reasons.push('Transferred from another creator; the pilot requires your own original.');
    else if(!ownedPath&&/\.(?:jpe?g|png)$/i.test(row.name))reasons.push('This file is not in the supported original Photos location. Import your own new test photo directly into Photos.');
    const pilotEligible=reasons.length===0;
    const choice=(label,choices)=>{const field=make('label','ap-ai-field',label),select=make('select');for(const [value,name] of choices){const item=make('option','',name);item.value=value;select.append(item)}field.append(select);return {field,select}};
    const modelChoice=choice('AI model',[['kling-4.0-flash','BLACKCELL Flash · Fast'],['kling-4.0','BLACKCELL Pro · High quality']]),model=modelChoice.select;
    const qualityChoice=choice('Quality',[['720p','720p HD'],['1080p','1080p Full HD']]),resolution=qualityChoice.select;
    const timeChoice=choice('Duration',[]),duration=timeChoice.select;
    const motionChoice=choice('Motion',[['gentle','Natural subtle movement'],['camera','Gentle cinematic camera'],['ambient','Environment movement'],['still','Steady camera'],['push','Slow zoom in'],['pull','Slow zoom out'],['pan','Camera pan'],['orbit','Cinematic orbit'],['custom','Custom instructions']]),motion=motionChoice.select;
    const promptField=make('label','ap-ai-field','Custom motion instructions (optional)'),custom=make('textarea');custom.rows=3;custom.maxLength=1000;custom.placeholder='Describe movement, camera angles or atmosphere…';promptField.append(custom);
    const options=make('div','ap-ai-options');options.append(modelChoice.field,qualityChoice.field,timeChoice.field,motionChoice.field);
    const rightsLabel=make('label','ap-ai-rights'),rights=make('input');rights.type='checkbox';rightsLabel.append(rights,make('span','','I have the necessary rights and consent to animate this nonsexual image and authorize external AI processing.'));
    const quote=make('div','ap-ai-quote'),estimate=make('strong');quote.setAttribute('aria-live','polite');quote.append(make('span','','Estimated generation cost'),estimate);
    const note=make('p','ap-ai-note',pilotEligible?'One active render at a time. Confirm estimated credits before generating.':'Choose your own authorized JPEG/PNG original, up to 8 MB, at least 300 px on each side, with supported proportions.');
    const processingDetails=make('details','ap-ai-note');processingDetails.append(make('summary','','Processing & billing details'),make('p','','BLACKCELL CORP AI uses an external video processing service. Your authorized photo and prompt are sent to that service for rendering. Actual credit deductions are determined by the provider.'));
    const jobStatus=make('p','ap-ai-job-status',pilotEligible?'Loading render history…':reasons.join(' '));jobStatus.setAttribute('role','status');
    const album=make('p','ap-ai-destination','Destination: '+memberName(userId||'preview')+' / AI Creations');
    const historyChoice=choice('Render history',[]),history=historyChoice.select;historyChoice.field.hidden=true;
    let state='checking',pollCount=0,timer=null,outputBlob=null,outputURL=null,outputVideo=null,jobId=null,destination=null,working=false,saved=false,attemptedOutput=false,otherActive=null,historyJobs=[];
    const pendingStates=['reserved','submitted','processing','uncertain'];
    const cost=()=>Math.round(Number(duration.value)*(model.value==='kling-4.0-flash'?.6:resolution.value==='1080p'?1.5:1)*10)/10;
    const money=()=>cost().toFixed(1).replace(/\.0$/,'');
    const clearOutput=()=>{if(outputVideo){outputVideo.pause();outputVideo.removeAttribute('src');outputVideo.load();outputVideo.remove()}if(outputURL)URL.revokeObjectURL(outputURL);outputURL=null;outputBlob=null;outputVideo=null;attemptedOutput=false;saved=false;destination=null;stage.classList.remove('has-result')};
    const controls=()=>{const editable=pilotEligible&&!working&&state==='ready'&&!otherActive;generate.disabled=!editable||!rights.checked||(motion.value==='custom'&&!custom.value.trim());generate.textContent='Generate · '+money()+' units est.';estimate.textContent=money()+' units';transfer.disabled=!active()||working||!outputBlob||!destination||saved;refreshJob.disabled=!pilotEligible||working;newVideo.disabled=!pilotEligible||working||!!otherActive||pendingStates.includes(state)||state==='ready'||state==='checking';history.disabled=working||pendingStates.includes(state);for(const control of [model,resolution,duration,motion,custom,rights])control.disabled=!editable;resolution.options[1].disabled=model.value==='kling-4.0-flash';openActive.hidden=!otherActive||!rows.some(r=>r.path===userId+'/'+otherActive.path)};
    function updateSettings(){const flash=model.value==='kling-4.0-flash',prior=Number(duration.value)||5;if(flash)resolution.value='720p';duration.replaceChildren();for(let i=3;i<=(flash?20:30);i++){const opt=make('option','',i+' seconds');opt.value=String(i);duration.append(opt)}duration.value=String(Math.min(prior,flash?20:30));controls()}
    viewerStudioCleanup=()=>{clearTimeout(timer);clearOutput()};
    const invoke=async(action,extra={})=>{const {data,error}=await client.functions.invoke('blackcell-kling-studio',{body:{action,path:relative,...extra}});if(error)throw Error('Owner session or service unavailable');return data};
    const messages={CONFIRMATION_REQUIRED:'Generation confirmation was not received.',PRICE_CONFIRMATION_REQUIRED:'The cost changed. Confirm the new estimate.',INVALID_SETTINGS:'This model does not support the selected settings.',INVALID_PROMPT:'Enter a valid motion prompt (up to 1,000 characters).',ACTIVE_JOB_EXISTS:'Another render is active. Finish or recover it before starting a new one.',RECENT_CREDIT_LIMIT:'Recent usage may not yet appear in the provider balance. The conservative credit check cannot cover this clip.',PACKAGE_NOT_READY:'Insufficient eligible video generation credits. No job submitted.',LEDGER_UNAVAILABLE:'Job ledger unavailable.',PILOT_REQUEST_FAILED:'Secure request failed. Check render history.',SOURCE_SIZE_LIMIT:'Photo exceeds the source size limit.',SOURCE_FORMAT_UNSUPPORTED:'Use a JPEG or PNG original.',SUBMISSION_UNCONFIRMED:'Submission unconfirmed. Check status; no automatic retry.',OUTPUT_VARIANT_UNAVAILABLE:'Standard output is unavailable from the rendering provider.',OUTPUT_HOST_UNVERIFIED:'Result host requires verification.',OUTPUT_UNAVAILABLE:'Video result unavailable.',OUTPUT_TOO_LARGE:'Video exceeds the 96 MB preview limit.',JOB_NOT_FOUND:'Job not found.'};
    function drawHistory(){history.replaceChildren();for(const j of historyJobs){const opt=make('option','',new Date(j.createdAt).toLocaleString()+' · '+(j.model==='kling-4.0-flash'?'BLACKCELL Flash':'BLACKCELL Pro')+' · '+j.duration+'s · '+j.resolution+' · '+j.state);opt.value=j.id;history.append(opt)}historyChoice.field.hidden=!historyJobs.length;if(jobId)history.value=jobId;else history.selectedIndex=-1}
    async function loadOutput(){if(!active()||outputBlob||attemptedOutput||!jobId)return;attemptedOutput=true;jobStatus.textContent='Video completed. Retrieving secure preview…';const requested=jobId;
     try{const result=await invoke('output',{id:requested});if(!active()||requested!==jobId)return;if(!(result instanceof Blob)||result.size<16||result.size>96*1024*1024)throw Error(messages[result?.code]||'Secure result unavailable. Check status to retry.');const data=new Uint8Array(await result.slice(0,12).arrayBuffer());if(String.fromCharCode(...data.slice(4,8))!=='ftyp')throw Error('Result is not a recognized MP4.');if(!active()||requested!==jobId)return;outputBlob=new Blob([result],{type:'video/mp4'});outputURL=URL.createObjectURL(outputBlob);outputVideo=make('video','ap-ai-preview');outputVideo.controls=true;outputVideo.playsInline=true;outputVideo.src=outputURL;stage.prepend(outputVideo);stage.classList.add('has-result');jobStatus.textContent='AI video ready. Play or transfer to private Photos.'}catch(e){if(active())jobStatus.textContent=String(e.message||'Preview unavailable')}finally{if(active())controls()}}
    function schedule(){clearTimeout(timer);if(active()&&jobId&&pollCount<40&&pendingStates.includes(state))timer=setTimeout(()=>{if(active()&&!document.hidden)void poll();else if(active())schedule()},15000)}
    async function poll(){if(!active()||working||!pilotEligible||!jobId)return;working=true;pollCount++;controls();const requested=jobId;
     try{const data=await invoke('status',{id:requested});if(!active()||requested!==jobId)return;if(!data?.ok){jobStatus.textContent=messages[data?.code]||'Status unavailable · '+String(data?.code||'Unknown error');return}
      state=data.state;destination=data.destination||destination;const j=historyJobs.find(x=>x.id===requested);if(j){j.state=state;drawHistory()}
      jobStatus.textContent=data.code==='PROVIDER_REJECTED'?'Rendering provider declined · HTTP '+String(data.diagnostic?.http||'unknown')+' · code '+String(data.diagnostic?.providerCode||'unknown')+'. No automatic retry.':data.code==='QUERY_UNCONFIRMED'?'Render not yet verified. Check status before creating another.':state==='succeeded'?'Video completed.':state==='failed'?'Rendering provider reported failure. No automatic retry.':state==='uncertain'||state==='reserved'?'Submission being reconciled. No additional credits spent by checking.':'Rendering · '+state;
      if(state==='succeeded'&&data.outputReady&&!outputBlob)await loadOutput();else if(state==='succeeded'&&!data.outputReady)jobStatus.textContent='Standard video is unavailable from the rendering provider.';
     }catch(e){if(active())jobStatus.textContent=String(e.message||'Status check failed.')}finally{working=false;if(active()){controls();schedule()}}}
    async function loadHistory(fresh=false){if(!active()||working||!pilotEligible)return;working=true;controls();
     try{const data=await invoke('list');if(!active())return;if(!data?.ok){state='blocked';jobStatus.textContent=messages[data?.code]||String(data?.code||'Job history unavailable');return}
      historyJobs=data.jobs||[];otherActive=data.active&&data.active.path!==relative?data.active:null;
      const preferred=data.active?.path===relative?data.active.id:!fresh?(jobId&&historyJobs.some(j=>j.id===jobId)?jobId:historyJobs[0]?.id):null;
      if(preferred){if(jobId!==preferred)clearOutput();jobId=preferred;state=historyJobs.find(j=>j.id===preferred)?.state||data.active?.state||'checking'}else{clearOutput();jobId=null;state=otherActive?'blocked':'ready'}
      drawHistory();jobStatus.textContent=otherActive?'A render is active on another photograph. Open that photo to check it.':jobId?'Checking saved render…':'Ready to generate a new video.';
     }catch(e){if(active()){state='blocked';jobStatus.textContent=String(e.message||'Job history unavailable')}}finally{working=false;if(active()){controls();if(jobId)void poll()}}}
    const generate=button('Generate',async()=>{if(!active()||!pilotEligible||working||state!=='ready'||!rights.checked||otherActive)return;const units=cost(),selectedModel=model.value,seconds=Number(duration.value),quality=resolution.value,prompt=custom.value.trim();if(motion.value==='custom'&&!prompt)return;
     if(!confirm('Generate '+seconds+' seconds at '+quality+' using '+(selectedModel==='kling-4.0-flash'?'BLACKCELL Flash':'BLACKCELL Pro')+'? Estimated '+units+' units. Your authorized photo and prompt will be sent to the external rendering provider. Proceed?'))return;
     clearOutput();jobId=crypto.randomUUID();const requested=jobId;working=true;state='reserved';controls();jobStatus.textContent='Submitting securely…';onBusy(true);pollCount=0;
     try{const data=await invoke('create',{id:requested,approve:true,rights:true,model:selectedModel,resolution:quality,duration:seconds,estimatedUnits:units,motion:motion.value,prompt});if(!active())return;if(!data?.id){jobId=null;state='blocked';jobStatus.textContent='Not submitted · '+(messages[data?.code]||String(data?.code||'Unconfirmed response'))+'. Check status to refresh.';return}state=data.state||'uncertain';historyJobs.unshift({id:requested,state,model:selectedModel,resolution:quality,duration:seconds,createdAt:new Date().toISOString()});drawHistory();jobStatus.textContent=messages[data.code]||'Submission received. Checking status…'}
     catch{if(active()){state='uncertain';jobStatus.textContent='Submission unconfirmed. Check saved job history before retrying.'}}finally{working=false;onBusy(false);if(active()){controls();if(jobId)void poll()}}});
    const refreshJob=button('Check render status',()=>{attemptedOutput=false;pollCount=0;if(jobId&&state!=='uncertain')void poll();else void loadHistory()});
    const newVideo=button('New video',()=>{if(working||pendingStates.includes(state)||otherActive)return;rights.checked=false;void loadHistory(true)});
    const openActive=button('Open active render',()=>{const r=rows.find(r=>r.path===userId+'/'+otherActive?.path);if(r)void openViewer(r)});openActive.hidden=true;
    history.onchange=()=>{if(working||pendingStates.includes(state)||!history.value)return;clearTimeout(timer);clearOutput();jobId=history.value;state=historyJobs.find(j=>j.id===jobId)?.state||'checking';pollCount=0;void poll()};
    const transfer=button('Transfer to Photos',async()=>{if(!active()||working||!outputBlob||!destination||!jobId||saved)return;const expected='Photos/From Members/'+userId+'/AI Creations/AI-'+jobId+'-standard.mp4';if(destination!==expected)return;const blob=outputBlob;working=true;busy=true;onBusy(true);controls();jobStatus.textContent='Saving privately…';
     try{const name=destination.split('/').at(-1),full=userId+'/'+destination,folder=full.slice(0,full.lastIndexOf('/'));const found=await storage.list(folder,{search:name,limit:100});if(!found.error&&found.data?.some(x=>x.name===name)){saved=true;jobStatus.textContent='Already saved in AI Creations.'}else{await uploadPrivateFile(storage,full,new File([blob],name,{type:'video/mp4'}));saved=true;jobStatus.textContent='Saved privately in AI Creations.'}storage.invalidate?.();window.dispatchEvent(new CustomEvent('bc-private-files-changed',{detail:{source:'photos',uid:userId}}));try{const ch=new BroadcastChannel('bc-private-photos-transfer');ch.postMessage({type:'photos-changed',uid:userId});ch.close()}catch{}}
     catch(e){if(active())jobStatus.textContent=privateUploadError(e)}finally{busy=false;working=false;onBusy(false);if(active()){controls();if(saved){closeViewer();mode='member:'+userId+':ai';page=0;view='all';dateScope='';search.value='';void refresh(true)}}}});
    const tools=make('div','ap-ai-actions');tools.append(generate,newVideo,refreshJob,openActive,transfer);if(!pilotEligible&&!preview)tools.append(button('Import a photo',()=>{closeViewer();input.click()}));
    model.onchange=updateSettings;resolution.onchange=duration.onchange=motion.onchange=rights.onchange=custom.oninput=controls;studio.append(top,stage,historyChoice.field,options,promptField,quote,rightsLabel,note,processingDetails,jobStatus,album,tools);area.append(studio);area.classList.add('ap-ai-split');updateSettings();if(pilotEligible)void loadHistory();

   };
   aiButton=button('✧ AI Video',showStudio);aiButton.classList.add('ap-ai-toggle');aiButton.disabled=true;aiButton.setAttribute('aria-pressed','false');actions.insertBefore(aiButton,download);
  }
  viewerOverlay.append(top,area);host.append(viewerOverlay);viewerOverlay.tabIndex=-1;viewerOverlay.focus();
  viewerOverlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeViewer()}else if(e.key==='ArrowLeft'&&index>0&&e.target?.tagName!=='VIDEO'){e.preventDefault();void openViewer(visible[index-1])}else if(e.key==='ArrowRight'&&index>=0&&index+1<visible.length&&e.target?.tagName!=='VIDEO'){e.preventDefault();void openViewer(visible[index+1])}});
  try{
   if(row.type.startsWith('image/')){const cached=photoFrames.get(previewKey(row));if(cached?.small){const temp=make('img');const u=URL.createObjectURL(cached.blob);urls.push(u);temp.src=u;temp.alt='Loading full-resolution photograph';content.replaceChildren(temp)}}
   const f=await getPrivateMedia(storage,row);if(seq!==viewerGeneration||!usable())return;viewerURL=URL.createObjectURL(f);const video=f.type.startsWith('video/'),m=make(video?'video':'img');viewerPhoto=m;m.src=viewerURL;if(video){m.controls=true;m.playsInline=true;m.preload='metadata'}else{
    m.alt=row.name;m.draggable=false;m.tabIndex=0;m.setAttribute('role','button');m.setAttribute('aria-label','Enlarge photograph');m.setAttribute('aria-pressed','false');
    m.classList.add('ap-zoomable-photo');
    let zoomed=false,down=null;
    function toggleZoom(e){
     if(!m.naturalWidth||!m.naturalHeight)return;
     if(zoomed){zoomed=false;content.classList.remove('ap-photo-zoomed');m.style.removeProperty('width');m.style.removeProperty('height');content.scrollLeft=content.scrollTop=0}
     else{
      const bounds=m.getBoundingClientRect(),fit=Math.min(bounds.width/m.naturalWidth,bounds.height/m.naturalHeight);
      if(!Number.isFinite(fit)||fit<=0)return;
      const w=m.naturalWidth*fit,h=m.naturalHeight*fit,scale=Math.max(2,Math.min(4,1/fit));
      const x=e?.detail>0?Math.max(0,Math.min(1,(e.clientX-bounds.left-(bounds.width-w)/2)/w)):.5;
      const y=e?.detail>0?Math.max(0,Math.min(1,(e.clientY-bounds.top-(bounds.height-h)/2)/h)):.5;
      zoomed=true;content.classList.add('ap-photo-zoomed');m.style.width=Math.round(w*scale)+'px';m.style.height=Math.round(h*scale)+'px';
      content.scrollLeft=x*m.offsetWidth-content.clientWidth/2;content.scrollTop=y*m.offsetHeight-content.clientHeight/2;
     }
     m.setAttribute('aria-label',zoomed?'Return to fit view':'Enlarge photograph');m.setAttribute('aria-pressed',String(zoomed));
    }
    m.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY}});
    m.addEventListener('pointercancel',()=>{down=null});
    m.addEventListener('click',e=>{if(e.detail===0||(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<10))toggleZoom(e);down=null});
    m.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();toggleZoom(null)}});
   }download.disabled=false;if(aiButton&&!video){const enable=()=>{if(seq===viewerGeneration&&m.naturalWidth)aiButton.disabled=false};m.addEventListener('load',enable,{once:true});enable()}m.onerror=()=>{if(seq===viewerGeneration){if(aiButton)aiButton.disabled=true;content.replaceChildren(make('p','','Preview unavailable for this format. Download the original.'))}};content.replaceChildren(m)}catch(_){if(seq===viewerGeneration&&usable())content.textContent='Unable to open original. Try again.'}
 }
 const viewer={open:openViewer,close:closeViewer};
 function switchMode(m){if(busy||loading)return;mode=m;view='all';dateScope='';page=0;search.value='';selected.clear();selecting=false;if(mobileLayout){sidebarClosed=true;applySidebar()}render()}
 function newAlbum(paths=[]){if(preview||busy||loading)return;const name=prompt('Name the new album:');if(!name?.trim())return;const album={id:'album-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:name.trim().slice(0,80),paths:[...new Set(paths)]};prefs.albums.push(album);savePrefs();switchMode(album.id)}
 function addToAlbum(paths){if(preview||busy||loading||!paths.length)return;if(!prefs.albums.length){newAlbum(paths);return}const choice=prompt('Choose an album number, or enter a new album name:\n'+prefs.albums.map((a,i)=>(i+1)+'. '+a.name).join('\n'));if(!choice?.trim())return;const a=prefs.albums[Number(choice)-1];if(a){a.paths=[...new Set([...a.paths,...paths])];savePrefs();status.textContent=paths.length+' added to '+a.name;render()}else{const album={id:'album-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:choice.trim().slice(0,80),paths:[...new Set(paths)]};prefs.albums.push(album);savePrefs();render()}}
 function renderSidebar(){sidemenu.replaceChildren();const group=(label,entries)=>{sidemenu.append(make('div','ap-section-label',label));for(const [m,icon,name] of entries){const b=button('',()=>switchMode(m));b.className='ap-nav-item'+(mode===m?' selected':'');b.append(make('span','ap-nav-icon',icon),make('span','',name));b.setAttribute('aria-current',mode===m?'page':'false');sidemenu.append(b)}};group('Photos',[['all','▧','Library'],['recent','◷','Recently Added'],['favorites','♡','Favorites']]);group('Media Types',[['photos','▨','Photos'],['videos','▷','Videos']]);const members=memberAlbums().sort((a,b)=>memberName(a).localeCompare(memberName(b)));group('My Albums',[...prefs.albums.map(a=>[a.id,'▱',a.name]),...members.map(id=>['member:'+id,'▰',memberName(id)+' · '+memberRows(id).length])]);const [activeMember]=memberMode();if(activeMember&&members.includes(activeMember))group(memberName(activeMember),[['member:'+activeMember+':originals','▱','Originals · '+memberRows(activeMember,'originals').length],['member:'+activeMember+':ai','✧','AI Creations · '+memberRows(activeMember,'ai').length]]);const create=button('+ New Album',()=>newAlbum());create.className='ap-nav-item ap-create';create.disabled=preview||busy||loading;sidemenu.append(create);const folders=[...new Set(rows.map(r=>r.path.slice((userId||'').length+1).split('/').slice(0,-1).join('/')).filter(folder=>folder&&!folder.startsWith('Photos/From Members')))].sort();if(folders.length)group('Files Folders',folders.slice(0,60).map(f=>['folder:'+f,'▰',f.split('/').at(-1)]));sidemenu.append(make('p','ap-org-note','Member albums sync through your private drive. Manual albums and favorites are saved in this browser.'))}
 const ratios=new Map(),videoFrames=new Map(),photoFrames=new Map(),photoPending=new Map();let layoutFrame=0,videoObserver=null,videoQueue=[],videoWorkerRunning=false,photoObserver=null,photoQueue=[],photoActive=0,photoFrameBytes=0;
 function queuePhotoLayout(){
  if(layoutFrame||closed)return;
  layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;if(!usable())return;
   for(const g of grid.querySelectorAll('.ap-justified-grid')){
    const width=Math.floor(g.clientWidth);if(width<1)continue;
    const cards=[...g.children],goal=Math.max(80,Math.min(zoom,width*.55));
    for(const p of justifiedPhotoRows(cards.map(c=>Number(c.dataset.ratio)||1),width,goal,3)){
     const card=cards[p.index];card.style.width=p.width+'px';card.style.height=p.height+'px';
    }
   }
  });
 }
 const photoResize=typeof ResizeObserver!=='undefined'?new ResizeObserver(queuePhotoLayout):null;
 photoResize?.observe(grid);
 async function drainVideoQueue(){
  if(videoWorkerRunning)return;videoWorkerRunning=true;
  try{while(usable()&&videoQueue.length)await videoQueue.shift()()}finally{videoWorkerRunning=false}
 }
 function previewKey(row){return row.path+'|'+String(row.date||'')+'|'+String(row.size||'')}
 function cachePhoto(key,frame){
  // An in-memory preview only, bounded to 12 MiB. Never store originals
  // or private thumbnails in localStorage, IndexedDB, or a service worker.
  if(!frame?.small||frame.blob.size>1024*1024||!usable())return;
  if(photoFrames.has(key)){photoFrameBytes-=photoFrames.get(key).blob.size;photoFrames.delete(key)}
  photoFrames.set(key,frame);photoFrameBytes+=frame.blob.size;
  while(photoFrameBytes>12*1024*1024||photoFrames.size>120){
   const oldest=photoFrames.keys().next().value;photoFrameBytes-=photoFrames.get(oldest).blob.size;photoFrames.delete(oldest);
  }
 }
 async function photoPreview(row){
  const key=previewKey(row);
  if(photoFrames.has(key)){const frame=photoFrames.get(key);photoFrames.delete(key);photoFrames.set(key,frame);return frame}
  if(photoPending.has(key))return photoPending.get(key);
  const job=(async()=>{
   const cloud=await cloudFrame(storage,row);
   if(!usable())throw Error('Photos closed');
   if(cloud){cachePhoto(key,cloud);return cloud}
   const file=await getPrivateMedia(storage,row);if(!usable())throw Error('Photos closed');
   try{
    const frame=await imageFrame(file);cachePhoto(key,frame);
    // Visible legacy assets are backfilled once, with the original left intact.
    if(row.objectId&&usable())void storage.writePreview?.(row.objectId,frame).catch(()=>{});
    return frame;
   }catch(_){return {blob:file,ratio:null,small:false}}
  })();
  photoPending.set(key,job);
  try{return await job}finally{if(photoPending.get(key)===job)photoPending.delete(key)}
 }
 function pumpPhotoQueue(){
  while(usable()&&photoActive<3&&photoQueue.length){
   const run=photoQueue.shift();photoActive++;
   void Promise.resolve().then(run).catch(()=>{}).finally(()=>{photoActive--;pumpPhotoQueue()});
  }
 }
 function clearThumbs(){photoObserver?.disconnect();photoObserver=null;photoQueue=[];videoObserver?.disconnect();videoObserver=null;videoQueue=[];for(const u of urls)URL.revokeObjectURL(u);urls=[]}
 function filteredRows(){const q=search.value.trim().toLowerCase(),album=prefs.albums.find(a=>a.id===mode);return rows.filter(r=>{const folder=r.path.slice((userId||'').length+1).split('/').slice(0,-1).join('/');return (mode==='all'||mode==='recent'||mode==='favorites'&&favorites.has(r.path)||mode==='photos'&&r.type.startsWith('image/')||mode==='videos'&&r.type.startsWith('video/')||album?.paths.includes(r.path)||mode.startsWith('member:')&&memberIdFor(r)===memberMode()[0]&&(!memberMode()[1]||memberKind(r)===memberMode()[1])||mode.startsWith('folder:')&&folder===mode.slice(7))&&(!dateScope||(dateScope==='Unknown date'?!r.date:String(r.date).startsWith(dateScope)))&&(!q||r.name.toLowerCase().includes(q)||String(r.date).toLowerCase().includes(q)||folder.toLowerCase().includes(q))})}
 function visibleRows(){return filteredRows().slice(page*36,page*36+36)}
 function syncControls(){add.disabled=busy||loading;refreshBtn.disabled=busy||loading;selectBtn.disabled=preview||busy||loading||!rows.length;selectBtn.textContent=selecting?'Done':'Select';selectionBar.hidden=!selecting;selectionCount.textContent=selected.size+' selected';const visible=visibleRows();selectPage.disabled=busy||loading||!visible.length;selectPage.textContent=visible.length&&visible.every(r=>selected.has(r.path))?'Deselect page':'Select page';deleteSelected.disabled=favoriteSelected.disabled=albumSelected.disabled=busy||loading||!selected.size;}
 async function refresh(keepPage=false){
  storage?.invalidate?.();if(!usable())return;if(preview){status.textContent='Design preview · Sign in to access your private photos.';render();return}
  const seq=++refreshSeq;loading=true;syncControls();status.textContent='Loading private library…';
  try{const r=await privateFiles(storage,userId,()=>usable()&&seq===refreshSeq);if(!usable()||seq!==refreshSeq)return;rows=r.rows;await resolveMemberAlbums(seq);if(!usable()||seq!==refreshSeq)return;selected=new Set([...selected].filter(p=>rows.some(r=>r.path===p)));if(!keepPage)page=0;status.textContent=rows.length+' media items'+(r.limited?' · Scan limit reached':'')+' · Private'}
  catch{if(seq===refreshSeq&&usable())status.textContent='Could not load private photos.'}
  finally{if(seq===refreshSeq&&usable()){loading=false;render()}}
 }
 function closeDelete(){deleteDialog?.remove();deleteDialog=null}
 function confirmDelete(items){
  if(preview||busy||loading||!usable()||deleteDialog||!items.length)return;
  const targets=[...new Map(items.filter(r=>rows.some(item=>item.path===r.path)&&r.path.startsWith(userId+'/')&&mediaType(r.name)).map(r=>[r.path,r])).values()];
  if(!targets.length)return;
  const overlay=make('div','bc-pm-delete-overlay'),panel=make('section','bc-pm-delete-panel');deleteDialog=overlay;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Confirm private media deletion');
  panel.append(make('h2','',targets.length===1?'Delete this item?':'Delete '+targets.length+' items?'),make('p','',targets.length===1?targets[0].name:'Selected photos and videos'),make('p','bc-pm-delete-note','Permanently removes the originals from your private drive and Files. Copies you previously shared are not deleted. This cannot be undone.'));
  const controls=make('div','bc-pm-delete-controls'),cancel=button('Cancel',closeDelete),remove=button(targets.length===1?'Delete item':'Delete '+targets.length+' items',()=>{closeDelete();void deleteItems(targets)});remove.classList.add('bc-pm-danger');controls.append(cancel,remove);panel.append(controls);overlay.append(panel);host.append(overlay);cancel.focus();
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeDelete()}if(e.key==='Tab'){e.preventDefault();(document.activeElement===cancel?remove:cancel).focus()}});
 }
 async function deleteItems(targets){
  if(preview||busy||loading||!usable())return;busy=true;onBusy(true);viewer.close();syncControls();const removed=[],failed=[];
  try{for(const [i,row] of targets.entries()){
   if(!usable())break;status.textContent='Deleting '+(i+1)+' of '+targets.length+'…';
   try{const result=await storage.remove([row.path]);if(result.error)throw result.error;removed.push(row.path);selected.delete(row.path);favorites.delete(row.path);for(const album of prefs.albums)album.paths=album.paths.filter(p=>p!==row.path)}catch(e){failed.push(row.name+': '+privateUploadError(e))}
  }
  if(!usable())return;
  rows=rows.filter(r=>!removed.includes(r.path));if(!selected.size)selecting=false;await refresh(true);
  status.textContent=removed.length+' deleted'+(failed.length?' · '+failed.length+' failed · '+failed.slice(0,2).join(' | '):' · Storage updated');
  if(removed.length)savePrefs();if(removed.length)window.dispatchEvent(new CustomEvent('bc-private-files-changed',{detail:{source:'photos'}}))
  }finally{busy=false;onBusy(false);if(usable())syncControls()}
 }
 function render(){
  if(!usable())return;const seq=++version;clearThumbs();grid.replaceChildren();pager.replaceChildren();renderSidebar();for(const [key,tab] of tabs){tab.classList.toggle('selected',view===key);tab.setAttribute('aria-pressed',String(view===key))}
  const filtered=filteredRows(),album=prefs.albums.find(a=>a.id===mode);const [member,kind]=memberMode();title.textContent=member?memberName(member)+(kind==='ai'?' / AI Creations':kind==='originals'?' / Originals':''):album?.name||({all:'Library',recent:'Recently Added',favorites:'Favorites',photos:'Photos',videos:'Videos'}[mode])||mode.slice(7);subtitle.textContent=(dateScope?dateScope+' · ':'')+filtered.length+' items'+(preview?' · Design preview':'');
  if(dateScope){const reset=button('‹ All dates',()=>{dateScope='';page=0;render()});heading.replaceChildren(title,subtitle,reset)}else heading.replaceChildren(title,subtitle);if(member){const id=member,visit=button('Visit Profile ↗',()=>{const u=new URL('corporate-network.html',location.href);u.searchParams.set('view','profile');u.searchParams.set('user',id);window.open(u.href,'_blank','noopener,noreferrer')});heading.append(visit);const albums=make('div','ap-segments');albums.setAttribute('aria-label','Creator albums');for(const [value,label] of [['originals','Originals'],['ai','AI Creations']]){const tab=button(label+' · '+memberRows(id,value).length,()=>switchMode('member:'+id+':'+value));tab.classList.toggle('selected',kind===value);tab.setAttribute('aria-pressed',String(kind===value));albums.append(tab)}if(kind){const all=button('‹ Creator folder',()=>switchMode('member:'+id));albums.prepend(all)}heading.append(albums)}
  page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(filtered.length/36)-1)));syncControls();
  if(!filtered.length){const empty=make('div','ap-empty');empty.append(make('span','ap-empty-icon','▧'),make('h3','',preview?'Your Photos library':mode==='favorites'?'No favorites yet':album||kind?'This album is empty':'No photos or videos'),make('p','',preview?'Sign in to view private media.':mode==='favorites'?'Choose the heart while viewing a photo.':kind==='ai'?'AI-generated photos and videos will appear here after you transfer them.':kind==='originals'?'Transferred original photos and videos will appear here.':album?'Select photos in your library and add them to this album.':'Import media to your private library. Nothing is shared automatically.'));if(mode==='all'||mode==='recent')empty.append(button('Import Photos',()=>input.click()));grid.append(empty);return}
  function videoThumbnail(row,thumb){
   const key=row.path+'|'+String(row.date||'')+'|'+String(row.size||'');
   const valid=()=>seq===version&&usable()&&thumb.isConnected;
   function paint(frame){
    if(!valid())return;
    const url=URL.createObjectURL(frame.blob);urls.push(url);
    const img=make('img');img.alt='Video preview';img.src=url;
    const play=make('span','ap-video-play','▶');play.setAttribute('aria-hidden','true');
    const label=make('span','ap-video-label',videoDurationLabel(frame.duration));
    thumb.replaceChildren(img,play,label);
    if(favorites.has(row.path))thumb.append(make('span','ap-favmark','♥'));
    ratios.set(row.path,frame.ratio);
    const card=thumb.parentElement;if(card?.classList.contains('ap-photo')){card.dataset.ratio=String(frame.ratio);queuePhotoLayout()}
   }
   if(videoFrames.has(key)){const frame=videoFrames.get(key);videoFrames.delete(key);videoFrames.set(key,frame);paint(frame);return}
   const run=async()=>{
    if(!valid())return;
    try{
     let frame=await cloudFrame(storage,row);if(!valid())return;
     if(!frame){const file=await getPrivateMedia(storage,row);if(!valid())return;frame=await privateVideoFrame(file);if(!valid())return;if(row.objectId)void storage.writePreview?.(row.objectId,frame).catch(()=>{})}
     videoFrames.set(key,frame);
     while(videoFrames.size>48)videoFrames.delete(videoFrames.keys().next().value);
     paint(frame);
    }catch(_){/* Keep the playable video tile if its codec cannot be decoded. */}
   };
   const enqueue=()=>{if(!valid())return;videoQueue.push(run);void drainVideoQueue()};
   if(typeof IntersectionObserver==='undefined'){enqueue();return}
   if(!videoObserver)videoObserver=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){videoObserver?.unobserve(entry.target);const task=entry.target._bcPreviewTask;delete entry.target._bcPreviewTask;task?.()}
   },{root:grid,rootMargin:'150px'});
   thumb._bcPreviewTask=enqueue;videoObserver.observe(thumb);
  }
  function thumbnail(row,thumb){
   if(row.type.startsWith('video/')){videoThumbnail(row,thumb);return}
   if(!row.type.startsWith('image/')||/heic|heif/.test(row.type))return;
   const valid=()=>seq===version&&usable()&&thumb.isConnected,key=previewKey(row);
   function paint(frame){
    if(!valid())return;
    const url=URL.createObjectURL(frame.blob);urls.push(url);
    const img=make('img');img.alt=row.name;img.decoding='async';
    const card=thumb.parentElement;
    const apply=ratio=>{if(!valid()||!ratio)return;ratios.set(row.path,ratio);if(card?.classList.contains('ap-photo')){card.dataset.ratio=String(ratio);queuePhotoLayout()}};
    img.addEventListener('load',()=>apply(frame.ratio||(img.naturalHeight?img.naturalWidth/img.naturalHeight:0)),{once:true});
    img.src=url;thumb.replaceChildren(img);if(frame.ratio)apply(frame.ratio);
    if(favorites.has(row.path))thumb.append(make('span','ap-favmark','♥'));
   }
   if(photoFrames.has(key)){const frame=photoFrames.get(key);photoFrames.delete(key);photoFrames.set(key,frame);queueMicrotask(()=>paint(frame));return}
   const run=async()=>{if(!valid())return;try{paint(await photoPreview(row))}catch(_){}};
   const enqueue=()=>{if(!valid())return;photoQueue.push(run);pumpPhotoQueue()};
   if(typeof IntersectionObserver==='undefined'){queueMicrotask(enqueue);return}
   if(!photoObserver)photoObserver=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){photoObserver?.unobserve(entry.target);const task=entry.target._bcPhotoTask;delete entry.target._bcPhotoTask;task?.()}
   },{root:grid,rootMargin:'200px'});
   thumb._bcPhotoTask=enqueue;photoObserver.observe(thumb);
  }
  function tile(row,parent){const card=button('',()=>{if(busy||loading)return;if(selecting){if(selected.has(row.path))selected.delete(row.path);else selected.add(row.path);card.classList.toggle('is-selected',selected.has(row.path));card.setAttribute('aria-pressed',String(selected.has(row.path)));check.textContent=selected.has(row.path)?'✓':'';syncControls()}else void viewer.open(row)});card.className='bc-pm-photo ap-photo';card.dataset.ratio=String(ratios.get(row.path)||(row.type.startsWith('video/')?16/9:1));card.setAttribute('aria-label',(selecting?'Select ':'Open ')+row.name);const thumb=make('div','bc-pm-thumb',row.type.startsWith('video/')?'▶':'▧');card.title=row.name;card.append(thumb);if(row.type.startsWith('video/'))thumb.append(make('span','ap-video-label','VIDEO'));const check=make('span','bc-pm-selection-check',selected.has(row.path)?'✓':'');if(selecting){card.append(check);card.classList.toggle('is-selected',selected.has(row.path));card.setAttribute('aria-pressed',String(selected.has(row.path)))}parent.append(card);thumbnail(row,thumb)}
  if(view!=='all'&&!selecting){const groups=new Map();for(const row of filtered){const k=String(row.date||'').slice(0,view==='years'?4:7)||'Unknown date';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row)}const entries=[...groups.entries()];page=Math.min(page,Math.max(0,Math.ceil(entries.length/36)-1));const collection=make('div','ap-collection-grid');for(const [k,items] of entries.slice(page*36,page*36+36)){const row=items[0],card=button('',()=>{dateScope=k;view='all';page=0;render()});card.className='ap-period';const thumb=make('div','bc-pm-thumb',row.type.startsWith('video/')?'▶':'▧');card.append(thumb,make('strong','',k),make('small','',items.length+' items'));collection.append(card);thumbnail(row,thumb)}grid.append(collection);if(entries.length>36)renderPager(entries.length)}
  else{const visible=visibleRows(),collection=make('div','ap-photo-grid ap-justified-grid');grid.append(collection);for(const row of visible)tile(row,collection);queuePhotoLayout();if(filtered.length>36)renderPager(filtered.length)}
  function renderPager(count){const prev=button('‹',()=>{if(busy||loading)return;page--;grid.scrollTop=0;render()}),next=button('›',()=>{if(busy||loading)return;page++;grid.scrollTop=0;render()});prev.disabled=busy||loading||page===0;next.disabled=busy||loading||(page+1)*36>=count;pager.append(prev,make('span','',String(page+1)+' / '+Math.ceil(count/36)),next)}
  // Preview tasks are queued only when their tiles approach the viewport.
 }
 input.onchange=async()=>{const list=Array.from(input.files||[]);input.value='';if(preview){status.textContent='Sign in to import private media.';return}if(busy||loading||!usable()||!list.length||deleteDialog)return;busy=true;syncControls();onBusy(true);let n=0,failed=[];try{for(const [i,file] of list.entries()){if(!usable())break;const type=mediaType(file.name),name=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9_. -]/g,'_').replace(/^\.+/,'').slice(0,100);if(!type||!name){failed.push(file.name+': Unsupported format or file name.');continue}if(!file.size||file.size>PRIVATE_FILE_LIMIT){failed.push(name+': '+(!file.size?'Empty file.':'Exceeds 256 MB ('+(file.size/1048576).toFixed(1)+' MB).'));continue}status.textContent='Importing '+(i+1)+' of '+list.length+' · '+name+' ('+(file.size/1048576).toFixed(1)+' MB)…';try{await uploadPrivateFile(storage,userId+'/Photos/'+name,file,(sent,total)=>{status.textContent='Importing '+name+' · '+Math.round(sent/total*100)+'%'});n++}catch(e){failed.push(name+': '+privateUploadError(e))}}await refresh();if(n)window.dispatchEvent(new CustomEvent('bc-private-files-changed',{detail:{source:'photos'}}));status.textContent=n+' imported privately'+(failed.length?' · '+failed.length+' failed · '+failed.slice(0,3).join(' | '):'')}catch(e){status.textContent=privateUploadError(e)}finally{busy=false;onBusy(false);if(usable())syncControls()}};
 const moved=event=>{if(event.detail?.source==='photos'||(event.detail?.uid&&event.detail.uid!==userId)||busy)return;viewer.close();closeDelete();void refresh(true)};window.addEventListener('bc-private-files-changed',moved);let transferChannel=null;try{transferChannel=new BroadcastChannel('bc-private-photos-transfer');transferChannel.onmessage=e=>{if(e.data?.type==='photos-changed'&&e.data.uid===userId&&!busy)void refresh(true)}}catch(_){}search.oninput=()=>{page=0;dateScope='';view='all';render()};void refresh();return {dispose(){closed=true;version++;refreshSeq++;photoResize?.disconnect();if(layoutFrame)cancelAnimationFrame(layoutFrame);ratios.clear();videoFrames.clear();photoFrames.clear();photoPending.clear();photoFrameBytes=0;closeDelete();window.removeEventListener('bc-private-files-changed',moved);transferChannel?.close();legacyOwners.clear();memberLabels.clear();viewer.close();clearThumbs()},refresh,closeViewer:viewer.close};
}
export async function choosePrivateMedia({client,userId,onSelect,onSelectRows=null,onDeviceUpload=null,actionLabel='Attach selected',max=6,photoOnly=false}){
 if(!userId)return;
 const storage=createPrivateDrive(client,userId),overlay=make('div','bc-pm-picker'),panel=make('section','bc-pm-picker-panel'),head=make('header','bc-pm-header'),title=make('div');
 title.append(make('h2','','BLACKCELL Photos'),make('p','',photoOnly?'Select photos from your private library to send to REDLINE.':'Select photos or videos to attach.'));
 let disposed=false,preparing=false,page=0,generation=0,running=0,queue=[],rows=[],limited=false;
 const selected=new Map(),urls=new Map(),pageSize=12;
 const release=()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear()};
 const remove=()=>{disposed=true;generation++;queue=[];release();overlay.remove()};
 const style=make('style');style.textContent='.bc-pm-picker .bc-pm-photo-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(116px,100%),1fr));gap:9px;align-content:start;max-height:min(49vh,420px);overflow:auto;padding:3px;min-height:100px}.bc-pm-picker .bc-pm-picker-tile{position:relative;display:block;width:100%;aspect-ratio:1;overflow:hidden;min-width:0;border:1px solid #ffffff18;border-radius:10px;padding:0;background:#121216;color:#b7b7c0;cursor:pointer;isolation:isolate}.bc-pm-picker .bc-pm-picker-tile img{width:100%;height:100%;object-fit:cover;display:block}.bc-pm-picker .bc-pm-picker-tile.is-selected{border:2px solid #e04d67;box-shadow:0 0 0 1px #e04d67}.bc-pm-picker .bc-pm-picker-check{position:absolute;right:7px;bottom:7px;display:grid;place-items:center;border:1px solid #ffffffaa;border-radius:50%;width:23px;height:23px;background:#0008;color:white;font-size:15px;font-weight:700}.bc-pm-picker .is-selected .bc-pm-picker-check{background:#ad2744;border-color:#ff7990}.bc-pm-picker .bc-pm-picker-placeholder{height:100%;display:grid;place-items:center;font-size:12px;text-align:center;padding:8px}.bc-pm-picker .bc-pm-picker-pager{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;color:#aaa;font-size:12px}.bc-pm-picker .bc-pm-picker-pager[hidden]{display:none}.bc-pm-picker .bc-pm-picker-tile:focus-visible{outline:2px solid white;outline-offset:-4px}';
 head.append(title,button('Close ×',remove));const search=make('input','bc-pm-search');search.placeholder='Search photos';search.type='search';search.setAttribute('aria-label','Search private photos');
 const list=make('div','bc-pm-pick-list bc-pm-photo-picker-grid','Loading private library…'),status=make('p','bc-pm-pick-status',''),pager=make('div','bc-pm-picker-pager'),pageLabel=make('span');
 const prev=button('‹',()=>{if(page>0&&!preparing){page--;render()}}),next=button('›',()=>{if(!preparing){page++;render()}});prev.setAttribute('aria-label','Previous photos');next.setAttribute('aria-label','Next photos');pager.append(prev,pageLabel,next);pager.hidden=true;
 const submit=button(actionLabel,async()=>{if(!selected.size||disposed||preparing)return;preparing=true;submit.disabled=true;search.disabled=true;prev.disabled=true;next.disabled=true;for(const b of list.querySelectorAll('button'))b.disabled=true;queue=[];status.textContent='Preparing selected files…';try{if(typeof onSelectRows==='function'){const chosen=[...selected.values()];remove();await onSelectRows(chosen,row=>getPrivateMedia(storage,row));return}const files=[];for(const row of selected.values()){if(disposed)return;files.push(await getPrivateMedia(storage,row))}if(disposed)return;remove();await onSelect(files)}catch{if(!disposed){preparing=false;search.disabled=false;render();status.textContent='Could not prepare the selected files.'}}});submit.disabled=true;
 const deviceButton=typeof onDeviceUpload==='function'?button('＋  Upload from Phone',()=>{
  if(preparing||disposed)return;
  // The caller must use the original tap to invoke Android's native gallery.
  remove();onDeviceUpload();
 }):null;
 if(deviceButton){
  deviceButton.className='bc-pm-redline-device-source';
  deviceButton.setAttribute('aria-label','Upload photos from this device to the REDLINE room');
  style.textContent+=' .bc-pm-picker .bc-pm-redline-empty{display:flex;flex-direction:column;align-items:center;gap:13px;justify-content:center;text-align:center;min-height:148px;padding:17px;color:#ddd0d8;font:13px/1.5 system-ui}.bc-pm-picker .bc-pm-redline-device-source{width:100%;min-height:49px;background:#b32245;color:white;font-weight:750;border:1px solid #ec657d;border-radius:11px;touch-action:manipulation}';
 }
 panel.append(head,search,list,pager,status,submit);overlay.append(style,panel);document.body.append(overlay);
 function sync(){submit.disabled=preparing||!selected.size;status.textContent=rows.length+' photo'+(rows.length===1?'':'s')+' available · '+selected.size+' selected'+(limited?' · Showing up to 1,000 library items':'')}
 function paint(tile,url,label){const img=make('img');img.alt='';img.decoding='async';img.src=url;img.onerror=()=>{if(!disposed&&tile.isConnected)tile.replaceChildren(make('span','bc-pm-picker-placeholder','Preview unavailable'),tile.querySelector('.bc-pm-picker-check')||make('span','bc-pm-picker-check'))};tile.replaceChildren(img,label)}
 async function thumbnail(row,tile,check,seq){
  try{
   // The encrypted Bunny preview is tiny; do not download full originals
   // just to paint the Android REDLINE chooser.
   const frame=await cloudFrame(storage,row);
   if(frame?.blob){
    if(disposed||seq!==generation||preparing)return;
    const url=URL.createObjectURL(frame.blob);urls.set(row.path,url);
    paint(tile,url,check);
    return;
   }
   const file=await getPrivateMedia(storage,row);if(disposed||seq!==generation||preparing)return;
   let bitmap,temp,source;
   try{
    if(typeof createImageBitmap==='function'){try{bitmap=await createImageBitmap(file);source=bitmap}catch(_){}}
    if(!source){temp=URL.createObjectURL(file);const image=make('img');image.src=temp;await image.decode();source=image}
    if(disposed||seq!==generation||preparing)return;
    const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height;
    if(!width||!height)throw Error('Image unavailable');
    const scale=Math.min(1,360/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Preview unavailable');ctx.drawImage(source,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.83));if(!blob)throw Error('Preview unavailable');if(disposed||seq!==generation||preparing)return;
    const url=URL.createObjectURL(blob);urls.set(row.path,url);paint(tile,url,check);
   }finally{bitmap?.close();if(temp)URL.revokeObjectURL(temp)}
  }catch{if(!disposed&&seq===generation&&tile.isConnected)tile.querySelector('.bc-pm-picker-placeholder').textContent='Preview unavailable'}
 }
 function pump(){if(disposed||preparing)return;while(running<2&&queue.length){const job=queue.shift();if(job.seq!==generation)continue;running++;void thumbnail(job.row,job.tile,job.check,job.seq).finally(()=>{running--;pump()})}}
 function render(){if(disposed)return;const seq=++generation;queue=[];const filtered=rows.filter(r=>r.name.toLowerCase().includes(search.value.trim().toLowerCase()));page=Math.max(0,Math.min(page,Math.ceil(filtered.length/pageSize)-1));const shown=filtered.slice(page*pageSize,(page+1)*pageSize),keep=new Set(shown.map(r=>r.path));for(const [key,url] of urls)if(!keep.has(key)){URL.revokeObjectURL(url);urls.delete(key)}list.replaceChildren();if(!shown.length){
    if(deviceButton){
     const empty=make('div','bc-pm-redline-empty');
     empty.append(make('strong','',rows.length?'No matching BLACKCELL Photos':'No BLACKCELL Photos found for this account'),
      make('p','',rows.length?'Try another search or upload from your phone.':'You can still send photos from your phone directly into this private REDLINE conversation.'),
      deviceButton);
     list.append(empty);
    }else list.append(make('p','','No private media found.'));
   }
  for(const row of shown){
   const tile=make('button','bc-pm-picker-tile'),video=row.type.startsWith('video/'),placeholder=make('span','bc-pm-picker-placeholder',video?'▶ Video':'Loading…'),check=make('span','bc-pm-picker-check');tile.type='button';tile.setAttribute('aria-label',(video?'Select video: ':'Select photo: ')+row.name);check.setAttribute('aria-hidden','true');const mark=()=>{const yes=selected.has(row.path);tile.classList.toggle('is-selected',yes);tile.setAttribute('aria-pressed',String(yes));check.textContent=yes?'✓':''};mark();tile.onclick=()=>{if(preparing||disposed)return;if(selected.has(row.path))selected.delete(row.path);else{if(selected.size>=max){status.textContent='Select up to '+max+' files.';return}selected.set(row.path,row)}mark();sync()};tile.append(placeholder,check);list.append(tile);if(!video){const url=urls.get(row.path);if(url)paint(tile,url,check);else queue.push({row,tile,check,seq})}
  }
  pager.hidden=filtered.length<=pageSize;pageLabel.textContent=(page+1)+' / '+Math.max(1,Math.ceil(filtered.length/pageSize));prev.disabled=preparing||page===0;next.disabled=preparing||(page+1)*pageSize>=filtered.length;sync();pump()
 }
 search.oninput=()=>{page=0;render()};try{const result=await privateFiles(storage,userId,()=>!disposed);if(disposed)return;rows=photoOnly?result.rows.filter(row=>['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(row.type)):result.rows;limited=result.limited;render()}catch(error){if(!disposed){
   list.replaceChildren(make('p','','Unable to load BLACKCELL Photos. '+privateUploadError(error)));
   if(deviceButton)list.append(deviceButton);
  }}
}
