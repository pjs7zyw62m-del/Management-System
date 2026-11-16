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
  try{const file=await getPrivateMedia(storage,row);if(seq!==generation||!alive())return;url=URL.createObjectURL(file);const video=file.type.startsWith('video/');const media=make(video?'video':'img');media.src=url;if(video){media.controls=true;media.playsInline=true;media.preload='metadata'}else media.alt=row.name;media.onerror=()=>{if(seq===generation)body.replaceChildren(make('p','','Preview unavailable for this format on your device. For photographs use BLACKCELL Photos; other files can be downloaded in Files.'))};body.replaceChildren(media)}
  catch(e){if(seq===generation&&alive())body.textContent='Unable to preview this file.'}
 }
 return {open,close};
}
// Natural-aspect rows: fill completed rows exactly, leave the final row
// at a readable height rather than stretching one portrait across the window.
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
 const favorites=new Set(prefs.favorites),memberLabels=new Map();
 const memberIdFor=row=>row.path.slice((userId||'').length+1).match(/^Photos\/From Members\/([0-9a-f-]{36})\//i)?.[1]||null;
 const memberAlbums=()=>[...new Set(rows.map(memberIdFor).filter(Boolean))];
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
 let currentRow=null,viewerGeneration=0,viewerURL=null,viewerOverlay=null,viewerPhoto=null,infoShown=false;
 function closeViewer(){viewerGeneration++;if(viewerPhoto?.tagName==='VIDEO'){viewerPhoto.pause();viewerPhoto.removeAttribute('src');viewerPhoto.load()}viewerOverlay?.remove();viewerOverlay=null;viewerPhoto=null;currentRow=null;if(viewerURL){URL.revokeObjectURL(viewerURL);viewerURL=null}}
 async function openViewer(row){
  closeViewer();if(!usable())return;currentRow=row;const seq=viewerGeneration,visible=filteredRows(),index=visible.findIndex(x=>x.path===row.path);viewerOverlay=make('section','bc-pm-viewer ap-viewer');const top=make('header','bc-pm-view-head ap-view-toolbar'),label=make('strong','',row.name),actions=make('div','bc-pm-view-actions');const back=button('‹ Library',closeViewer),prev=button('‹',()=>{if(index>0)void openViewer(visible[index-1])}),next=button('›',()=>{if(index+1<visible.length)void openViewer(visible[index+1])});prev.disabled=index<=0;next.disabled=index<0||index>=visible.length-1;prev.setAttribute('aria-label','Previous photo');next.setAttribute('aria-label','Next photo');const fav=button(favorites.has(row.path)?'♥':'♡',()=>{if(preview)return;if(favorites.has(row.path))favorites.delete(row.path);else favorites.add(row.path);savePrefs();fav.textContent=favorites.has(row.path)?'♥':'♡';render()});fav.disabled=preview;fav.setAttribute('aria-label','Favorite photo');const details=make('aside','ap-info');details.hidden=!infoShown;const toggle=button('ⓘ',()=>{infoShown=!infoShown;details.hidden=!infoShown});toggle.setAttribute('aria-label','Photo information');details.append(make('h3','','Info'),make('strong','',row.name),make('p','',row.type),make('p','',row.date?new Date(row.date).toLocaleString():'Date unavailable'),make('p','',row.size?((row.size/1048576).toFixed(2)+' MB'):'Size unavailable'));const download=button('↓',()=>{if(!viewerURL)return;const link=make('a');link.href=viewerURL;link.download=row.name;link.click()});download.disabled=true;download.setAttribute('aria-label','Download original');actions.append(prev,next,fav,toggle,download);if(!preview){const del=button('Delete',()=>confirmDelete([row]));del.classList.add('bc-pm-danger');actions.append(del)}top.append(back,label,actions);const area=make('div','ap-view-area'),content=make('div','bc-pm-view-body','Loading original…');area.append(content,details);viewerOverlay.append(top,area);host.append(viewerOverlay);viewerOverlay.tabIndex=-1;viewerOverlay.focus();
  viewerOverlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeViewer()}else if(e.key==='ArrowLeft'&&index>0&&e.target?.tagName!=='VIDEO'){e.preventDefault();void openViewer(visible[index-1])}else if(e.key==='ArrowRight'&&index>=0&&index+1<visible.length&&e.target?.tagName!=='VIDEO'){e.preventDefault();void openViewer(visible[index+1])}});
  try{const f=await getPrivateMedia(storage,row);if(seq!==viewerGeneration||!usable())return;viewerURL=URL.createObjectURL(f);const video=f.type.startsWith('video/'),m=make(video?'video':'img');viewerPhoto=m;m.src=viewerURL;if(video){m.controls=true;m.playsInline=true;m.preload='metadata'}else{
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
   }download.disabled=false;m.onerror=()=>{if(seq===viewerGeneration)content.replaceChildren(make('p','','Preview unavailable for this format. Download the original.'))};content.replaceChildren(m)}catch(_){if(seq===viewerGeneration&&usable())content.textContent='Unable to open original. Try again.'}
 }
 const viewer={open:openViewer,close:closeViewer};
 function switchMode(m){if(busy||loading)return;mode=m;view='all';dateScope='';page=0;search.value='';selected.clear();selecting=false;if(mobileLayout){sidebarClosed=true;applySidebar()}render()}
 function newAlbum(paths=[]){if(preview||busy||loading)return;const name=prompt('Name the new album:');if(!name?.trim())return;const album={id:'album-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:name.trim().slice(0,80),paths:[...new Set(paths)]};prefs.albums.push(album);savePrefs();switchMode(album.id)}
 function addToAlbum(paths){if(preview||busy||loading||!paths.length)return;if(!prefs.albums.length){newAlbum(paths);return}const choice=prompt('Choose an album number, or enter a new album name:\n'+prefs.albums.map((a,i)=>(i+1)+'. '+a.name).join('\n'));if(!choice?.trim())return;const a=prefs.albums[Number(choice)-1];if(a){a.paths=[...new Set([...a.paths,...paths])];savePrefs();status.textContent=paths.length+' added to '+a.name;render()}else{const album={id:'album-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:choice.trim().slice(0,80),paths:[...new Set(paths)]};prefs.albums.push(album);savePrefs();render()}}
 function renderSidebar(){sidemenu.replaceChildren();const group=(label,entries)=>{sidemenu.append(make('div','ap-section-label',label));for(const [m,icon,name] of entries){const b=button('',()=>switchMode(m));b.className='ap-nav-item'+(mode===m?' selected':'');b.append(make('span','ap-nav-icon',icon),make('span','',name));b.setAttribute('aria-current',mode===m?'page':'false');sidemenu.append(b)}};group('Photos',[['all','▧','Library'],['recent','◷','Recently Added'],['favorites','♡','Favorites']]);group('Media Types',[['photos','▨','Photos'],['videos','▷','Videos']]);group('Albums',prefs.albums.map(a=>[a.id,'▱',a.name]));const members=memberAlbums();if(members.length)group('Saved from Members',members.map(id=>['member:'+id,'▱',memberName(id)]));const create=button('+ New Album',()=>newAlbum());create.className='ap-nav-item ap-create';create.disabled=preview||busy||loading;sidemenu.append(create);const folders=[...new Set(rows.map(r=>r.path.slice((userId||'').length+1).split('/').slice(0,-1).join('/')).filter(folder=>folder&&!folder.startsWith('Photos/From Members')))].sort();if(folders.length)group('Files Folders',folders.slice(0,60).map(f=>['folder:'+f,'▰',f.split('/').at(-1)]));sidemenu.append(make('p','ap-org-note','Member albums sync through your private drive. Manual albums and favorites are saved in this browser.'))}
 const ratios=new Map();let layoutFrame=0;
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
 function clearThumbs(){for(const u of urls)URL.revokeObjectURL(u);urls=[]}
 function filteredRows(){const q=search.value.trim().toLowerCase(),album=prefs.albums.find(a=>a.id===mode);return rows.filter(r=>{const folder=r.path.slice((userId||'').length+1).split('/').slice(0,-1).join('/');return (mode==='all'||mode==='recent'||mode==='favorites'&&favorites.has(r.path)||mode==='photos'&&r.type.startsWith('image/')||mode==='videos'&&r.type.startsWith('video/')||album?.paths.includes(r.path)||mode.startsWith('member:')&&memberIdFor(r)===mode.slice(7)||mode.startsWith('folder:')&&folder===mode.slice(7))&&(!dateScope||(dateScope==='Unknown date'?!r.date:String(r.date).startsWith(dateScope)))&&(!q||r.name.toLowerCase().includes(q)||String(r.date).toLowerCase().includes(q)||folder.toLowerCase().includes(q))})}
 function visibleRows(){return filteredRows().slice(page*36,page*36+36)}
 function syncControls(){add.disabled=busy||loading;refreshBtn.disabled=busy||loading;selectBtn.disabled=preview||busy||loading||!rows.length;selectBtn.textContent=selecting?'Done':'Select';selectionBar.hidden=!selecting;selectionCount.textContent=selected.size+' selected';const visible=visibleRows();selectPage.disabled=busy||loading||!visible.length;selectPage.textContent=visible.length&&visible.every(r=>selected.has(r.path))?'Deselect page':'Select page';deleteSelected.disabled=favoriteSelected.disabled=albumSelected.disabled=busy||loading||!selected.size;}
 async function refresh(keepPage=false){
  storage?.invalidate?.();if(!usable())return;if(preview){status.textContent='Design preview · Sign in to access your private photos.';render();return}
  const seq=++refreshSeq;loading=true;syncControls();status.textContent='Loading private library…';
  try{const r=await privateFiles(storage,userId,()=>usable()&&seq===refreshSeq);if(!usable()||seq!==refreshSeq)return;rows=r.rows;const missing=memberAlbums().filter(id=>!memberLabels.has(id));if(missing.length){try{const {data}=await client.from('corp_social_profiles').select('user_id,display_name').in('user_id',missing.slice(0,100));if(!usable()||seq!==refreshSeq)return;for(const p of data||[])if(p.display_name)memberLabels.set(p.user_id,p.display_name)}catch(_){} }if(!usable()||seq!==refreshSeq)return;selected=new Set([...selected].filter(p=>rows.some(r=>r.path===p)));if(!keepPage)page=0;status.textContent=rows.length+' media items'+(r.limited?' · Scan limit reached':'')+' · Private'}
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
  const filtered=filteredRows(),album=prefs.albums.find(a=>a.id===mode);title.textContent=mode.startsWith('member:')?memberName(mode.slice(7)):album?.name||({all:'Library',recent:'Recently Added',favorites:'Favorites',photos:'Photos',videos:'Videos'}[mode])||mode.slice(7);subtitle.textContent=(dateScope?dateScope+' · ':'')+filtered.length+' items'+(preview?' · Design preview':'');
  if(dateScope){const reset=button('‹ All dates',()=>{dateScope='';page=0;render()});heading.replaceChildren(title,subtitle,reset)}else heading.replaceChildren(title,subtitle);if(mode.startsWith('member:')){const id=mode.slice(7),visit=button('Visit Profile ↗',()=>{const u=new URL('corporate-network.html',location.href);u.searchParams.set('view','profile');u.searchParams.set('user',id);window.open(u.href,'_blank','noopener,noreferrer')});heading.append(visit)}
  page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(filtered.length/36)-1)));syncControls();
  if(!filtered.length){const empty=make('div','ap-empty');empty.append(make('span','ap-empty-icon','▧'),make('h3','',preview?'Your Photos library':mode==='favorites'?'No favorites yet':album?'This album is empty':'No photos or videos'),make('p','',preview?'Sign in to view private media.':mode==='favorites'?'Choose the heart while viewing a photo.':album?'Select photos in your library and add them to this album.':'Import media to your private library. Nothing is shared automatically.'));if(mode==='all'||mode==='recent')empty.append(button('Import Photos',()=>input.click()));grid.append(empty);return}
  const jobs=[];
  function thumbnail(row,thumb){if(row.type.startsWith('image/')&&!/heic|heif/.test(row.type))jobs.push(async()=>{try{const f=await getPrivateMedia(storage,row);if(seq!==version||!usable())return;let thumbnailFile=f;if(typeof createImageBitmap==='function'){let bitmap;try{bitmap=await createImageBitmap(f,{resizeWidth:420,resizeQuality:'medium'});if(seq!==version||!usable())return;const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');if(context){context.drawImage(bitmap,0,0);const small=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));if(small)thumbnailFile=small}}catch(_){}finally{bitmap?.close()}}if(seq!==version||!usable())return;const u=URL.createObjectURL(thumbnailFile);urls.push(u);const img=make('img');img.loading='lazy';img.alt=row.name;img.src=u;const card=thumb.parentElement;const decoded=()=>{if(seq!==version||!usable()||!img.naturalHeight)return;const ratio=img.naturalWidth/img.naturalHeight;ratios.set(row.path,ratio);if(card?.classList.contains('ap-photo')){card.dataset.ratio=String(ratio);queuePhotoLayout()}};img.addEventListener('load',decoded,{once:true});thumb.replaceChildren(img);if(img.complete)decoded();if(favorites.has(row.path))thumb.append(make('span','ap-favmark','♥'))}catch(_){}})}
  function tile(row,parent){const card=button('',()=>{if(busy||loading)return;if(selecting){if(selected.has(row.path))selected.delete(row.path);else selected.add(row.path);card.classList.toggle('is-selected',selected.has(row.path));card.setAttribute('aria-pressed',String(selected.has(row.path)));check.textContent=selected.has(row.path)?'✓':'';syncControls()}else void viewer.open(row)});card.className='bc-pm-photo ap-photo';card.dataset.ratio=String(ratios.get(row.path)||(row.type.startsWith('video/')?16/9:1));card.setAttribute('aria-label',(selecting?'Select ':'Open ')+row.name);const thumb=make('div','bc-pm-thumb',row.type.startsWith('video/')?'▶':'▧');card.title=row.name;card.append(thumb);if(row.type.startsWith('video/'))thumb.append(make('span','ap-video-label','VIDEO'));const check=make('span','bc-pm-selection-check',selected.has(row.path)?'✓':'');if(selecting){card.append(check);card.classList.toggle('is-selected',selected.has(row.path));card.setAttribute('aria-pressed',String(selected.has(row.path)))}parent.append(card);thumbnail(row,thumb)}
  if(view!=='all'&&!selecting){const groups=new Map();for(const row of filtered){const k=String(row.date||'').slice(0,view==='years'?4:7)||'Unknown date';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row)}const entries=[...groups.entries()];page=Math.min(page,Math.max(0,Math.ceil(entries.length/36)-1));const collection=make('div','ap-collection-grid');for(const [k,items] of entries.slice(page*36,page*36+36)){const row=items[0],card=button('',()=>{dateScope=k;view='all';page=0;render()});card.className='ap-period';const thumb=make('div','bc-pm-thumb',row.type.startsWith('video/')?'▶':'▧');card.append(thumb,make('strong','',k),make('small','',items.length+' items'));collection.append(card);thumbnail(row,thumb)}grid.append(collection);if(entries.length>36)renderPager(entries.length)}
  else{const visible=visibleRows(),collection=make('div','ap-photo-grid ap-justified-grid');grid.append(collection);for(const row of visible)tile(row,collection);queuePhotoLayout();if(filtered.length>36)renderPager(filtered.length)}
  function renderPager(count){const prev=button('‹',()=>{if(busy||loading)return;page--;grid.scrollTop=0;render()}),next=button('›',()=>{if(busy||loading)return;page++;grid.scrollTop=0;render()});prev.disabled=busy||loading||page===0;next.disabled=busy||loading||(page+1)*36>=count;pager.append(prev,make('span','',String(page+1)+' / '+Math.ceil(count/36)),next)}
  let jobIndex=0;async function worker(){while(seq===version&&usable()&&jobIndex<jobs.length){const fn=jobs[jobIndex++];await fn()}}for(let i=0;i<Math.min(4,jobs.length);i++)void worker();
 }
 input.onchange=async()=>{const list=Array.from(input.files||[]);input.value='';if(preview){status.textContent='Sign in to import private media.';return}if(busy||loading||!usable()||!list.length||deleteDialog)return;busy=true;syncControls();onBusy(true);let n=0,failed=[];try{for(const [i,file] of list.entries()){if(!usable())break;const type=mediaType(file.name),name=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9_. -]/g,'_').replace(/^\.+/,'').slice(0,100);if(!type||!name){failed.push(file.name+': Unsupported format or file name.');continue}if(!file.size||file.size>PRIVATE_FILE_LIMIT){failed.push(name+': '+(!file.size?'Empty file.':'Exceeds 256 MB ('+(file.size/1048576).toFixed(1)+' MB).'));continue}status.textContent='Importing '+(i+1)+' of '+list.length+' · '+name+' ('+(file.size/1048576).toFixed(1)+' MB)…';try{await uploadPrivateFile(storage,userId+'/Photos/'+name,file,(sent,total)=>{status.textContent='Importing '+name+' · '+Math.round(sent/total*100)+'%'});n++}catch(e){failed.push(name+': '+privateUploadError(e))}}await refresh();if(n)window.dispatchEvent(new CustomEvent('bc-private-files-changed',{detail:{source:'photos'}}));status.textContent=n+' imported privately'+(failed.length?' · '+failed.length+' failed · '+failed.slice(0,3).join(' | '):'')}catch(e){status.textContent=privateUploadError(e)}finally{busy=false;onBusy(false);if(usable())syncControls()}};
 const moved=event=>{if(event.detail?.source==='photos'||(event.detail?.uid&&event.detail.uid!==userId)||busy)return;viewer.close();closeDelete();void refresh(true)};window.addEventListener('bc-private-files-changed',moved);let transferChannel=null;try{transferChannel=new BroadcastChannel('bc-private-photos-transfer');transferChannel.onmessage=e=>{if(e.data?.type==='photos-changed'&&e.data.uid===userId&&!busy)void refresh(true)}}catch(_){}search.oninput=()=>{page=0;dateScope='';view='all';render()};void refresh();return {dispose(){closed=true;version++;refreshSeq++;photoResize?.disconnect();if(layoutFrame)cancelAnimationFrame(layoutFrame);ratios.clear();closeDelete();window.removeEventListener('bc-private-files-changed',moved);transferChannel?.close();viewer.close();clearThumbs()},refresh,closeViewer:viewer.close};
}
export async function choosePrivateMedia({client,userId,onSelect,actionLabel='Attach selected',max=6}){
 if(!userId)return;
 const storage=createPrivateDrive(client,userId),overlay=make('div','bc-pm-picker'),panel=make('section','bc-pm-picker-panel'),head=make('header','bc-pm-header'),title=make('div');
 title.append(make('h2','','BLACKCELL Photos'),make('p','','Select photos or videos to attach.'));
 let disposed=false,preparing=false,page=0,generation=0,running=0,queue=[],rows=[],limited=false;
 const selected=new Map(),urls=new Map(),pageSize=12;
 const release=()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear()};
 const remove=()=>{disposed=true;generation++;queue=[];release();overlay.remove()};
 const style=make('style');style.textContent='.bc-pm-picker .bc-pm-photo-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(116px,100%),1fr));gap:9px;align-content:start;max-height:min(49vh,420px);overflow:auto;padding:3px;min-height:100px}.bc-pm-picker .bc-pm-picker-tile{position:relative;display:block;width:100%;aspect-ratio:1;overflow:hidden;min-width:0;border:1px solid #ffffff18;border-radius:10px;padding:0;background:#121216;color:#b7b7c0;cursor:pointer;isolation:isolate}.bc-pm-picker .bc-pm-picker-tile img{width:100%;height:100%;object-fit:cover;display:block}.bc-pm-picker .bc-pm-picker-tile.is-selected{border:2px solid #e04d67;box-shadow:0 0 0 1px #e04d67}.bc-pm-picker .bc-pm-picker-check{position:absolute;right:7px;bottom:7px;display:grid;place-items:center;border:1px solid #ffffffaa;border-radius:50%;width:23px;height:23px;background:#0008;color:white;font-size:15px;font-weight:700}.bc-pm-picker .is-selected .bc-pm-picker-check{background:#ad2744;border-color:#ff7990}.bc-pm-picker .bc-pm-picker-placeholder{height:100%;display:grid;place-items:center;font-size:12px;text-align:center;padding:8px}.bc-pm-picker .bc-pm-picker-pager{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;color:#aaa;font-size:12px}.bc-pm-picker .bc-pm-picker-pager[hidden]{display:none}.bc-pm-picker .bc-pm-picker-tile:focus-visible{outline:2px solid white;outline-offset:-4px}';
 head.append(title,button('Close ×',remove));const search=make('input','bc-pm-search');search.placeholder='Search photos';search.type='search';search.setAttribute('aria-label','Search private photos');
 const list=make('div','bc-pm-pick-list bc-pm-photo-picker-grid','Loading private library…'),status=make('p','bc-pm-pick-status',''),pager=make('div','bc-pm-picker-pager'),pageLabel=make('span');
 const prev=button('‹',()=>{if(page>0&&!preparing){page--;render()}}),next=button('›',()=>{if(!preparing){page++;render()}});prev.setAttribute('aria-label','Previous photos');next.setAttribute('aria-label','Next photos');pager.append(prev,pageLabel,next);pager.hidden=true;
 const submit=button(actionLabel,async()=>{if(!selected.size||disposed||preparing)return;preparing=true;submit.disabled=true;search.disabled=true;prev.disabled=true;next.disabled=true;for(const b of list.querySelectorAll('button'))b.disabled=true;queue=[];status.textContent='Preparing selected files…';try{const files=[];for(const row of selected.values()){if(disposed)return;files.push(await getPrivateMedia(storage,row))}if(disposed)return;remove();await onSelect(files)}catch{if(!disposed){preparing=false;search.disabled=false;render();status.textContent='Could not prepare the selected files.'}}});submit.disabled=true;
 panel.append(head,search,list,pager,status,submit);overlay.append(style,panel);document.body.append(overlay);
 function sync(){submit.disabled=preparing||!selected.size;status.textContent=selected.size+' selected'+(limited?' · Showing up to 1,000 library items':'')}
 function paint(tile,url,label){const img=make('img');img.alt='';img.decoding='async';img.src=url;img.onerror=()=>{if(!disposed&&tile.isConnected)tile.replaceChildren(make('span','bc-pm-picker-placeholder','Preview unavailable'),tile.querySelector('.bc-pm-picker-check')||make('span','bc-pm-picker-check'))};tile.replaceChildren(img,label)}
 async function thumbnail(row,tile,check,seq){
  try{
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
 function render(){if(disposed)return;const seq=++generation;queue=[];const filtered=rows.filter(r=>r.name.toLowerCase().includes(search.value.trim().toLowerCase()));page=Math.max(0,Math.min(page,Math.ceil(filtered.length/pageSize)-1));const shown=filtered.slice(page*pageSize,(page+1)*pageSize),keep=new Set(shown.map(r=>r.path));for(const [key,url] of urls)if(!keep.has(key)){URL.revokeObjectURL(url);urls.delete(key)}list.replaceChildren();if(!shown.length)list.append(make('p','','No private media found.'));
  for(const row of shown){
   const tile=make('button','bc-pm-picker-tile'),video=row.type.startsWith('video/'),placeholder=make('span','bc-pm-picker-placeholder',video?'▶ Video':'Loading…'),check=make('span','bc-pm-picker-check');tile.type='button';tile.setAttribute('aria-label',(video?'Select video: ':'Select photo: ')+row.name);check.setAttribute('aria-hidden','true');const mark=()=>{const yes=selected.has(row.path);tile.classList.toggle('is-selected',yes);tile.setAttribute('aria-pressed',String(yes));check.textContent=yes?'✓':''};mark();tile.onclick=()=>{if(preparing||disposed)return;if(selected.has(row.path))selected.delete(row.path);else{if(selected.size>=max){status.textContent='Select up to '+max+' files.';return}selected.set(row.path,row)}mark();sync()};tile.append(placeholder,check);list.append(tile);if(!video){const url=urls.get(row.path);if(url)paint(tile,url,check);else queue.push({row,tile,check,seq})}
  }
  pager.hidden=filtered.length<=pageSize;pageLabel.textContent=(page+1)+' / '+Math.max(1,Math.ceil(filtered.length/pageSize));prev.disabled=preparing||page===0;next.disabled=preparing||(page+1)*pageSize>=filtered.length;sync();pump()
 }
 search.oninput=()=>{page=0;render()};try{const result=await privateFiles(storage,userId,()=>!disposed);if(disposed)return;rows=result.rows;limited=result.limited;render()}catch{if(!disposed)list.textContent='Unable to load private media.'}
}
