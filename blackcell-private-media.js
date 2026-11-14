/* Personal media only. Never writes to public/social storage. */
export const PRIVATE_BUCKET='blackcell-os-files';
import {createPrivateDrive,PRIVATE_FILE_LIMIT} from './blackcell-private-drive.js?v=1';
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
 if(result.error)throw result.error;return result.data
}

const formats={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',m4v:'video/x-m4v',mov:'video/quicktime',webm:'video/webm'};
export const mediaType=name=>formats[String(name).split('.').pop().toLowerCase()]||'';
const make=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
const button=(label,fn)=>{const n=make('button','bc-pm-button',label);n.type='button';n.onclick=fn;return n};
function checked(r){if(r.error)throw Error(r.error.message);return r.data}
export async function privateFiles(storage,uid,alive=()=>true){
 const queue=[uid],rows=[];let scanned=0,limited=false;
 while(queue.length&&alive()){
  if(scanned++>=150||rows.length>=1000){limited=true;break}
  const prefix=queue.shift();
  for(let offset=0;alive();offset+=100){
   const page=checked(await storage.list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}}))||[];
   for(const r of page){if(r.name==='.blackcell-folder')continue;const path=prefix+'/'+r.name;if(!r.id){queue.push(path);continue}const type=mediaType(r.name);if(type)rows.push({path,name:r.name,type,date:r.created_at||r.updated_at||'',size:r.metadata?.size||0});if(rows.length>=1000){limited=true;break}}
   if(page.length<100||limited||offset>=4900)break;
  }
  if(limited)break;
 }
 return {rows:rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))),limited};
}
export async function getPrivateMedia(storage,row){const blob=checked(await storage.download(row.path));return new File([blob],row.name,{type:row.type||mediaType(row.name)});}
export function createPrivateViewer(host,storage,alive=()=>true){
 let generation=0,url=null,overlay=null;
 function close(){generation++;if(overlay){for(const v of overlay.querySelectorAll('video')){v.pause();v.removeAttribute('src');v.load()}overlay.remove();overlay=null}if(url){URL.revokeObjectURL(url);url=null}}
 async function open(row){
  close();const seq=generation;overlay=make('div','bc-pm-viewer');const head=make('header','bc-pm-view-head'),label=make('strong','',row.name),body=make('div','bc-pm-view-body','Loading private media…');head.append(label,button('Close ×',close));overlay.append(head,body);host.append(overlay);
  try{const file=await getPrivateMedia(storage,row);if(seq!==generation||!alive())return;url=URL.createObjectURL(file);const video=file.type.startsWith('video/');const media=make(video?'video':'img');media.src=url;if(video){media.controls=true;media.playsInline=true;media.preload='metadata'}else media.alt=row.name;media.onerror=()=>{if(seq===generation)body.replaceChildren(make('p','','Preview unavailable for this format on your device. Use Download in Files.'))};body.replaceChildren(media)}
  catch(e){if(seq===generation&&alive())body.textContent='Unable to preview this file.'}
 }
 return {open,close};
}
export function mountPrivatePhotos(host,{client,userId,preview,alive,onBusy}){
 host.classList.add('bc-pm-gallery');const storage=createPrivateDrive(client,userId);let rows=[],mode='all',page=0,closed=false,busy=false,version=0,urls=[];const usable=()=>!closed&&alive();
 const head=make('header','bc-pm-header'),heading=make('div');heading.append(make('h2','','Photos'),make('p','','Your private photo and video library'));const input=make('input');input.type='file';input.accept='image/*,video/*';input.multiple=true;input.hidden=true;const add=button('＋ Import',()=>input.click()),refreshBtn=button('↻ Refresh',()=>void refresh());head.append(heading,add,refreshBtn);const nav=make('div','bc-pm-tabs'),search=make('input','bc-pm-search');search.type='search';search.placeholder='Search photos';search.setAttribute('aria-label','Search private photos');
 const tabs=['all','photos','videos'].map(m=>{const x=button(m[0].toUpperCase()+m.slice(1),()=>{mode=m;page=0;render()});nav.append(x);return [m,x]});nav.append(search);const grid=make('div','bc-pm-grid'),foot=make('footer','bc-pm-foot'),status=make('span','','Private library · Never posted automatically'),pager=make('div');foot.append(status,pager);host.append(head,nav,grid,foot,input);const viewer=createPrivateViewer(host,storage,usable);
 function clearThumbs(){for(const u of urls)URL.revokeObjectURL(u);urls=[]}
 async function refresh(){storage?.invalidate?.();if(!usable())return;if(preview){status.textContent='Design preview · Sign in to access your private photos.';render();return}status.textContent='Loading private library…';try{const r=await privateFiles(storage,userId,usable);if(!usable())return;rows=r.rows;page=0;render();status.textContent=rows.length+' media items'+(r.limited?' · Scan limit reached':'')+' · Private';}catch{status.textContent='Could not load private photos.'}}
 function render(){const seq=++version;clearThumbs();grid.replaceChildren();pager.replaceChildren();for(const [key,tab] of tabs)tab.classList.toggle('selected',mode===key);const filtered=rows.filter(r=>(mode==='all'||(mode==='photos'?r.type.startsWith('image/'):r.type.startsWith('video/')))&&r.name.toLowerCase().includes(search.value.toLowerCase()));page=Math.min(page,Math.max(0,Math.ceil(filtered.length/36)-1));const visible=filtered.slice(page*36,page*36+36);if(!visible.length){grid.append(make('div','bc-pm-empty',preview?'Private Photos · Design preview':'No media here yet. Import photos or videos, or upload them to Files.'));return}
  for(const row of visible){const card=button('' ,()=>void viewer.open(row));card.className='bc-pm-photo';const thumb=make('div','bc-pm-thumb',row.type.startsWith('video/')?'▶':'▧');card.append(thumb,make('span','',row.name));grid.append(card);if(row.type.startsWith('image/')&&!/heic|heif/.test(row.type)){void (async()=>{try{const f=await getPrivateMedia(storage,row);if(seq!==version||!usable())return;const src=URL.createObjectURL(f);urls.push(src);const img=make('img');img.loading='lazy';img.alt=row.name;img.src=src;thumb.replaceChildren(img)}catch{}})()}}
  if(filtered.length>36){const prev=button('‹',()=>{page--;render()}),next=button('›',()=>{page++;render()});prev.disabled=page===0;next.disabled=(page+1)*36>=filtered.length;pager.append(prev,make('span','',String(page+1)+' / '+Math.ceil(filtered.length/36)),next)}
 }
 input.onchange=async()=>{const list=Array.from(input.files||[]);input.value='';if(preview){status.textContent='Sign in to import private media.';return}if(busy||!usable()||!list.length)return;busy=true;add.disabled=true;refreshBtn.disabled=true;onBusy(true);let n=0,failed=[];try{for(const [i,file] of list.entries()){if(!usable())break;const type=mediaType(file.name),name=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9_. -]/g,'_').replace(/^\.+/,'').slice(0,100);if(!type||!name){failed.push(file.name+': Unsupported format or file name.');continue}if(!file.size||file.size>PRIVATE_FILE_LIMIT){failed.push(name+': '+(!file.size?'Empty file.':'Exceeds 256 MB ('+(file.size/1048576).toFixed(1)+' MB).'));continue}status.textContent='Importing '+(i+1)+' of '+list.length+' · '+name+' ('+(file.size/1048576).toFixed(1)+' MB)…';try{await uploadPrivateFile(storage,userId+'/Photos/'+name,file,(sent,total)=>{status.textContent='Importing '+name+' · '+Math.round(sent/total*100)+'%'});n++}catch(e){failed.push(name+': '+privateUploadError(e))}}await refresh();status.textContent=n+' imported privately'+(failed.length?' · '+failed.length+' failed · '+failed.slice(0,3).join(' | '):'')}catch(e){status.textContent=privateUploadError(e)}finally{busy=false;add.disabled=false;refreshBtn.disabled=false;onBusy(false)}};
 const moved=()=>{viewer.close();void refresh()};window.addEventListener('bc-private-files-changed',moved);search.oninput=()=>{page=0;render()};void refresh();return {dispose(){closed=true;version++;window.removeEventListener('bc-private-files-changed',moved);viewer.close();clearThumbs()},refresh,closeViewer:viewer.close};
}
export async function choosePrivateMedia({client,userId,onSelect,actionLabel='Attach selected',max=6}){
 if(!userId)return;const storage=createPrivateDrive(client,userId);const overlay=make('div','bc-pm-picker'),panel=make('section','bc-pm-picker-panel'),head=make('header','bc-pm-header'),title=make('div');title.append(make('h2','','BLACKCELL Files & Photos'),make('p','','Choose private media. Nothing is shared until you explicitly attach or upload.'));let disposed=false;const remove=()=>{disposed=true;overlay.remove()};head.append(title,button('Close ×',remove));const search=make('input','bc-pm-search');search.placeholder='Search private media';search.type='search';search.setAttribute('aria-label','Search private media');const list=make('div','bc-pm-pick-list','Loading private library…'),status=make('p','bc-pm-pick-status',''),selected=new Map();let rows=[];const submit=button(actionLabel,async()=>{if(!selected.size||disposed)return;submit.disabled=true;status.textContent='Preparing selected files…';try{const files=[];for(const row of selected.values()){if(disposed)return;files.push(await getPrivateMedia(storage,row))}if(disposed)return;remove();await onSelect(files)}catch{if(!disposed){status.textContent='Could not prepare the selected files.';submit.disabled=false}}});submit.disabled=true;panel.append(head,search,list,status,submit);overlay.append(panel);document.body.append(overlay);search.focus();
 function render(){if(disposed)return;list.replaceChildren();const filtered=rows.filter(r=>r.name.toLowerCase().includes(search.value.toLowerCase()));if(!filtered.length)list.append(make('p','','No private media found.'));for(const r of filtered){const label=make('label','bc-pm-pick-row'),check=make('input');check.type='checkbox';check.checked=selected.has(r.path);check.onchange=()=>{if(check.checked){if(selected.size>=max){check.checked=false;status.textContent='Select up to '+max+' files.';return}selected.set(r.path,r)}else selected.delete(r.path);submit.disabled=!selected.size;status.textContent=selected.size+' selected'};label.append(check,make('span','',r.type.startsWith('video/')?'▶':'▧'),make('span','',r.name),make('small','',r.path.slice(userId.length+1)));list.append(label)}}
 search.oninput=render;try{const result=await privateFiles(storage,userId,()=>!disposed);if(disposed)return;rows=result.rows;render();if(result.limited)status.textContent='Library scan limit reached. Only the first 1,000 items are listed.'}catch{if(!disposed)list.textContent='Unable to load private media.'}
}