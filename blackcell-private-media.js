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
export function createPrivateViewer(host,storage,alive=()=>true,onDelete=null){
 let generation=0,url=null,overlay=null;
 function close(){generation++;if(overlay){for(const v of overlay.querySelectorAll('video')){v.pause();v.removeAttribute('src');v.load()}overlay.remove();overlay=null}if(url){URL.revokeObjectURL(url);url=null}}
 async function open(row){
  close();const seq=generation;overlay=make('div','bc-pm-viewer');const head=make('header','bc-pm-view-head'),label=make('strong','',row.name),body=make('div','bc-pm-view-body','Loading private media…');const actions=make('div','bc-pm-view-actions');if(onDelete){const remove=button('Delete',()=>{if(alive())onDelete(row)});remove.classList.add('bc-pm-danger');actions.append(remove)}actions.append(button('Close ×',close));head.append(label,actions);overlay.append(head,body);host.append(overlay);
  try{const file=await getPrivateMedia(storage,row);if(seq!==generation||!alive())return;url=URL.createObjectURL(file);const video=file.type.startsWith('video/');const media=make(video?'video':'img');media.src=url;if(video){media.controls=true;media.playsInline=true;media.preload='metadata'}else media.alt=row.name;media.onerror=()=>{if(seq===generation)body.replaceChildren(make('p','','Preview unavailable for this format on your device. Use Download in Files.'))};body.replaceChildren(media)}
  catch(e){if(seq===generation&&alive())body.textContent='Unable to preview this file.'}
 }
 return {open,close};
}
export function mountPrivatePhotos(host,{client,userId,preview,alive,onBusy}){
 host.classList.add('bc-pm-gallery');const storage=createPrivateDrive(client,userId);let rows=[],mode='all',page=0,closed=false,busy=false,loading=false,refreshSeq=0,version=0,urls=[],selecting=false,selected=new Set(),deleteDialog=null;const usable=()=>!closed&&alive();
 const head=make('header','bc-pm-header'),heading=make('div');heading.append(make('h2','','Photos'),make('p','','Your private photo and video library'));const input=make('input');input.type='file';input.accept='image/*,video/*';input.multiple=true;input.hidden=true;const add=button('＋ Import',()=>input.click()),refreshBtn=button('↻ Refresh',()=>void refresh());const selectBtn=button('Select',()=>{if(busy||loading||preview)return;selecting=!selecting;selected.clear();render()});head.append(heading,add,selectBtn,refreshBtn);const nav=make('div','bc-pm-tabs'),search=make('input','bc-pm-search');search.type='search';search.placeholder='Search photos';search.setAttribute('aria-label','Search private photos');
 const tabs=['all','photos','videos'].map(m=>{const x=button(m[0].toUpperCase()+m.slice(1),()=>{mode=m;page=0;render()});nav.append(x);return [m,x]});nav.append(search);const selectionBar=make('div','bc-pm-selectionbar'),selectionCount=make('span','','0 selected'),selectPage=button('Select page',()=>{if(busy||loading)return;const visible=visibleRows();const all=visible.length&&visible.every(r=>selected.has(r.path));for(const row of visible){if(all)selected.delete(row.path);else selected.add(row.path)}render()}),deleteSelected=button('Delete selected',()=>confirmDelete(rows.filter(r=>selected.has(r.path))));deleteSelected.classList.add('bc-pm-danger');selectionBar.append(selectionCount,selectPage,deleteSelected);selectionBar.hidden=true;const grid=make('div','bc-pm-grid'),foot=make('footer','bc-pm-foot'),status=make('span','','Private library · Never posted automatically'),pager=make('div');foot.append(status,pager);host.append(head,nav,selectionBar,grid,foot,input);status.setAttribute('role','status');const viewer=createPrivateViewer(host,storage,usable,preview?null:row=>confirmDelete([row]));
 function clearThumbs(){for(const u of urls)URL.revokeObjectURL(u);urls=[]}
 function filteredRows(){return rows.filter(r=>(mode==='all'||(mode==='photos'?r.type.startsWith('image/'):r.type.startsWith('video/')))&&r.name.toLowerCase().includes(search.value.toLowerCase()))}
 function visibleRows(){return filteredRows().slice(page*36,page*36+36)}
 function syncControls(){add.disabled=busy||loading;refreshBtn.disabled=busy||loading;selectBtn.disabled=preview||busy||loading||!rows.length;selectBtn.textContent=selecting?'Done':'Select';selectionBar.hidden=!selecting;selectionCount.textContent=selected.size+' selected';const visible=visibleRows();selectPage.disabled=busy||loading||!visible.length;selectPage.textContent=visible.length&&visible.every(r=>selected.has(r.path))?'Deselect page':'Select page';deleteSelected.disabled=busy||loading||!selected.size;}
 async function refresh(keepPage=false){
  storage?.invalidate?.();if(!usable())return;if(preview){status.textContent='Design preview · Sign in to access your private photos.';render();return}
  const seq=++refreshSeq;loading=true;syncControls();status.textContent='Loading private library…';
  try{const r=await privateFiles(storage,userId,()=>usable()&&seq===refreshSeq);if(!usable()||seq!==refreshSeq)return;rows=r.rows;selected=new Set([...selected].filter(p=>rows.some(r=>r.path===p)));if(!keepPage)page=0;status.textContent=rows.length+' media items'+(r.limited?' · Scan limit reached':'')+' · Private'}
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
   try{const result=await storage.remove([row.path]);if(result.error)throw result.error;removed.push(row.path);selected.delete(row.path)}catch(e){failed.push(row.name+': '+privateUploadError(e))}
  }
  if(!usable())return;
  rows=rows.filter(r=>!removed.includes(r.path));if(!selected.size)selecting=false;await refresh(true);
  status.textContent=removed.length+' deleted'+(failed.length?' · '+failed.length+' failed · '+failed.slice(0,2).join(' | '):' · Storage updated');
  if(removed.length)window.dispatchEvent(new CustomEvent('bc-private-files-changed',{detail:{source:'photos'}}))
  }finally{busy=false;onBusy(false);if(usable())syncControls()}
 }
 function render(){
  const seq=++version;clearThumbs();grid.replaceChildren();pager.replaceChildren();for(const [key,tab] of tabs)tab.classList.toggle('selected',mode===key);
  const filtered=filteredRows();page=Math.min(page,Math.max(0,Math.ceil(filtered.length/36)-1));const visible=visibleRows();syncControls();
  if(!visible.length){grid.append(make('div','bc-pm-empty',preview?'Private Photos · Design preview':'No media here yet. Import photos or videos, or upload them to Files.'));return}
  for(const row of visible){
   const card=button('',()=>{if(busy||loading)return;if(selecting){if(selected.has(row.path))selected.delete(row.path);else selected.add(row.path);render()}else void viewer.open(row)});
   card.className='bc-pm-photo';card.setAttribute('aria-label',(selecting?'Select ':'Open ')+row.name);
   const thumb=make('div','bc-pm-thumb',row.type.startsWith('video/')?'▶':'▧');card.append(thumb,make('span','',row.name));grid.append(card);
   if(selecting){const check=make('span','bc-pm-selection-check',selected.has(row.path)?'✓':'');card.append(check);card.setAttribute('aria-pressed',String(selected.has(row.path)));card.classList.toggle('is-selected',selected.has(row.path))}
   if(row.type.startsWith('image/')&&!/heic|heif/.test(row.type)){void(async()=>{try{const f=await getPrivateMedia(storage,row);if(seq!==version||!usable())return;const src=URL.createObjectURL(f);urls.push(src);const img=make('img');img.loading='lazy';img.alt=row.name;img.src=src;thumb.replaceChildren(img)}catch{}})()}
  }
  if(filtered.length>36){const prev=button('‹',()=>{if(busy||loading)return;page--;render()}),next=button('›',()=>{if(busy||loading)return;page++;render()});prev.disabled=busy||loading||page===0;next.disabled=busy||loading||(page+1)*36>=filtered.length;pager.append(prev,make('span','',String(page+1)+' / '+Math.ceil(filtered.length/36)),next)}
 }
 input.onchange=async()=>{const list=Array.from(input.files||[]);input.value='';if(preview){status.textContent='Sign in to import private media.';return}if(busy||loading||!usable()||!list.length||deleteDialog)return;busy=true;syncControls();onBusy(true);let n=0,failed=[];try{for(const [i,file] of list.entries()){if(!usable())break;const type=mediaType(file.name),name=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9_. -]/g,'_').replace(/^\.+/,'').slice(0,100);if(!type||!name){failed.push(file.name+': Unsupported format or file name.');continue}if(!file.size||file.size>PRIVATE_FILE_LIMIT){failed.push(name+': '+(!file.size?'Empty file.':'Exceeds 256 MB ('+(file.size/1048576).toFixed(1)+' MB).'));continue}status.textContent='Importing '+(i+1)+' of '+list.length+' · '+name+' ('+(file.size/1048576).toFixed(1)+' MB)…';try{await uploadPrivateFile(storage,userId+'/Photos/'+name,file,(sent,total)=>{status.textContent='Importing '+name+' · '+Math.round(sent/total*100)+'%'});n++}catch(e){failed.push(name+': '+privateUploadError(e))}}await refresh();if(n)window.dispatchEvent(new CustomEvent('bc-private-files-changed',{detail:{source:'photos'}}));status.textContent=n+' imported privately'+(failed.length?' · '+failed.length+' failed · '+failed.slice(0,3).join(' | '):'')}catch(e){status.textContent=privateUploadError(e)}finally{busy=false;onBusy(false);if(usable())syncControls()}};
 const moved=event=>{if(event.detail?.source==='photos'||busy)return;viewer.close();closeDelete();void refresh(true)};window.addEventListener('bc-private-files-changed',moved);search.oninput=()=>{page=0;render()};void refresh();return {dispose(){closed=true;version++;refreshSeq++;closeDelete();window.removeEventListener('bc-private-files-changed',moved);viewer.close();clearThumbs()},refresh,closeViewer:viewer.close};
}
export async function choosePrivateMedia({client,userId,onSelect,actionLabel='Attach selected',max=6}){
 if(!userId)return;const storage=createPrivateDrive(client,userId);const overlay=make('div','bc-pm-picker'),panel=make('section','bc-pm-picker-panel'),head=make('header','bc-pm-header'),title=make('div');title.append(make('h2','','BLACKCELL Files & Photos'),make('p','','Choose private media. Nothing is shared until you explicitly attach or upload.'));let disposed=false;const remove=()=>{disposed=true;overlay.remove()};head.append(title,button('Close ×',remove));const search=make('input','bc-pm-search');search.placeholder='Search private media';search.type='search';search.setAttribute('aria-label','Search private media');const list=make('div','bc-pm-pick-list','Loading private library…'),status=make('p','bc-pm-pick-status',''),selected=new Map();let rows=[];const submit=button(actionLabel,async()=>{if(!selected.size||disposed)return;submit.disabled=true;status.textContent='Preparing selected files…';try{const files=[];for(const row of selected.values()){if(disposed)return;files.push(await getPrivateMedia(storage,row))}if(disposed)return;remove();await onSelect(files)}catch{if(!disposed){status.textContent='Could not prepare the selected files.';submit.disabled=false}}});submit.disabled=true;panel.append(head,search,list,status,submit);overlay.append(panel);document.body.append(overlay);search.focus();
 function render(){if(disposed)return;list.replaceChildren();const filtered=rows.filter(r=>r.name.toLowerCase().includes(search.value.toLowerCase()));if(!filtered.length)list.append(make('p','','No private media found.'));for(const r of filtered){const label=make('label','bc-pm-pick-row'),check=make('input');check.type='checkbox';check.checked=selected.has(r.path);check.onchange=()=>{if(check.checked){if(selected.size>=max){check.checked=false;status.textContent='Select up to '+max+' files.';return}selected.set(r.path,r)}else selected.delete(r.path);submit.disabled=!selected.size;status.textContent=selected.size+' selected'};label.append(check,make('span','',r.type.startsWith('video/')?'▶':'▧'),make('span','',r.name),make('small','',r.path.slice(userId.length+1)));list.append(label)}}
 search.oninput=render;try{const result=await privateFiles(storage,userId,()=>!disposed);if(disposed)return;rows=result.rows;render();if(result.limited)status.textContent='Library scan limit reached. Only the first 1,000 items are listed.'}catch{if(!disposed)list.textContent='Unable to load private media.'}
}