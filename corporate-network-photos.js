/* BLACKCELL NETWORK / Apple Photos × Flickr private corporate library */
export function setupBlackcellPhotos({client,bucket,state,toast,mediaUrl,uploadAsset,refresh,profile,openProfile,ensureSigned}){
 const $=id=>document.getElementById(id);
 const meta={albums:[],albumItems:[],favorites:[],activeAlbum:null,filter:'all',sort:'newest',query:'',
   viewerItems:[],viewerIndex:0,editingAlbum:null,uploading:false,renderCount:0};
 const fileMax=45*1024*1024;
 const photoFormats=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic']);
 const videoFormats=new Set(['video/mp4','video/webm','video/quicktime','video/x-m4v']);
 const archiveAssets=()=>state.assets.filter(a=>['post','library'].includes(a.purpose));
 const ownId=()=>state.user.id;
 const own=a=>a.owner_id===ownId();
 const favorited=id=>meta.favorites.some(x=>x.asset_id===id&&x.user_id===ownId());
 const byId=id=>state.assets.find(a=>a.id===id);
 const allAlbums=()=>meta.albums;
 const albumMedia=album=>meta.albumItems.filter(x=>x.album_id===album.id).map(x=>byId(x.asset_id))
   .filter(a=>a&&['post','library'].includes(a.purpose));
 const make=(tag,cls='',text=null)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(text!==null)n.textContent=String(text);return n;
 };
 const press=(label,fn,cls='')=>{
  const n=make('button',cls,label);n.type='button';n.addEventListener('click',fn);return n;
 };
 const dateStr=s=>{
  try{return new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(new Date(s))}
  catch(_){return 'Other dates'}
 };
 const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';
 const nameOf=a=>profile(a.owner_id)?.display_name||'Network Member';
 const empty=(heading,detail)=>{
  const box=make('div','panel empty-state');
  box.append(make('strong','',heading),make('span','',detail));return box;
 };
 async function loadData(){
  const [a,b,c]=await Promise.all([
   client.from('corp_social_albums').select('*').order('created_at',{ascending:false}).limit(400),
   client.from('corp_social_album_items').select('*').limit(3000),
   client.from('corp_social_photo_favorites').select('asset_id,user_id').limit(3000)
  ]);
  const err=a.error||b.error||c.error;
  if(err)throw Error('Photo library could not be loaded: '+err.message);
  meta.albums=a.data||[];
  meta.albumItems=b.data||[];
  meta.favorites=c.data||[];
  if(meta.activeAlbum&&!meta.albums.some(x=>x.id===meta.activeAlbum))meta.activeAlbum=null;
 }
 function albumFor(id){return meta.albums.find(x=>x.id===id)}
 function sortAssets(list){
  const arr=[...list];
  if(meta.sort==='name')arr.sort((a,b)=>a.filename.localeCompare(b.filename));
  else arr.sort((a,b)=>meta.sort==='oldest'
     ?new Date(a.created_at)-new Date(b.created_at)
     :new Date(b.created_at)-new Date(a.created_at));
  return arr;
 }
 function selectedAssets(){
  let assets=meta.activeAlbum?albumMedia(albumFor(meta.activeAlbum)||{id:''}):archiveAssets();
  if(meta.filter==='photo')assets=assets.filter(x=>x.kind==='photo');
  if(meta.filter==='video')assets=assets.filter(x=>x.kind==='video');
  if(meta.filter==='mine')assets=assets.filter(x=>own(x));
  if(meta.filter==='favorites')assets=assets.filter(x=>favorited(x.id));
  if(meta.query)assets=assets.filter(x=>(x.filename+' '+(x.caption||'')+' '+nameOf(x)).toLowerCase().includes(meta.query));
  return sortAssets(assets);
 }
 function selectAlbum(albumId){
  meta.activeAlbum=albumId||null;
  meta.filter='all';render();
  const gallery=$('applePhotosGallery');
  gallery?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function renderAlbums(){
  const root=$('appleAlbumStrip');root.replaceChildren();
  const albums=allAlbums();
  if(!albums.length){
   root.append(empty('Your album gallery is ready','Create an album to collect your best photographs and videos.'));
   return;
  }
  for(const album of albums){
   const node=make('div','apple-album-shell');
   const card=press('',()=>selectAlbum(album.id),'apple-album-card');
   const cover=make('div','apple-album-cover');
   const list=albumMedia(album).slice(0,4);
   if(!list.length)cover.append(make('span','album-placeholder','▧'));
   for(const a of list){
    if(a.kind==='video')cover.append(make('span','album-video-icon','▶'));
    else{
     const link=mediaUrl(a);
     if(link){const image=make('img');image.src=link;image.alt=a.filename;image.loading='lazy';cover.append(image)}
     else cover.append(make('span','album-video-icon','▧'));
    }
   }
   card.append(cover,make('strong','',album.title),
     make('small','',listCount(album)+' items · '+(profile(album.owner_id)?.display_name||'Network member')));
   node.append(card);
   if(album.owner_id===ownId()){
    const actions=make('div','apple-album-tools');
    actions.append(
     press('EDIT',()=>openAlbumDialog(album)),
     press('DELETE',()=>void deleteAlbum(album))
    );
    node.append(actions);
   }
   root.append(node);
  }
 }
 function listCount(album){return meta.albumItems.filter(x=>x.album_id===album.id).length}
 function drawTile(a,list,index){
  const tile=make('div','apple-photo-grid-item');
  const open=press('',()=>void openViewer(list,index),'apple-tile-open');
  const link=mediaUrl(a);
  if(a.kind==='video'){
   open.append(make('span','apple-photo-video','▶'));
  }else if(link){
   const img=make('img','apple-photo-thumb');img.src=link;
   img.alt=a.caption||a.filename;img.loading='lazy';open.append(img);
  }else open.append(make('span','apple-photo-video','▧'));
  open.append(make('span','apple-photo-label',a.caption||a.filename));
  open.title=(a.caption||a.filename)+' · '+nameOf(a);
  tile.append(open);
  if(a.kind==='video')tile.append(make('span','apple-photo-kind','VIDEO'));
  const heart=press(favorited(a.id)?'♥':'♡',event=>{
   event.stopPropagation();void toggleFavorite(a.id);
  },'apple-photo-heart'+(favorited(a.id)?' liked':''));
  heart.setAttribute('aria-label',(favorited(a.id)?'Remove favorite':'Add favorite')+' '+a.filename);
  tile.append(heart);
  return tile;
 }
 function renderGallery(){
  const node=$('applePhotosGallery');node.replaceChildren();
  const list=selectedAssets(),album=albumFor(meta.activeAlbum);
  $('photosGalleryTitle').textContent=album?album.title:'All Media';
  $('photosClearAlbum').hidden=!meta.activeAlbum;
  for(const b of document.querySelectorAll('#photosFilters [data-photo-filter]'))
   b.classList.toggle('selected',b.dataset.photoFilter===meta.filter);
  if(!list.length){node.append(empty(
   meta.filter==='favorites'?'No favorites yet':'Your gallery is ready',
   meta.filter==='favorites'?'Tap a heart on a photo to add it to Favorites.':
   meta.activeAlbum?'Add your own photos and videos to this album, or select another collection.':
   'Upload photographs or videos to start your Apple-style Blackcell photo library.'
  ));return}
  // Apple Photos-style date sections, with a compact responsive thumbnail grid.
  const groups=new Map();
  for(const a of list){
   const key=dateStr(a.created_at);
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(a);
  }
  for(const [month,items] of groups.entries()){
   const section=make('section','apple-photo-month');
   section.append(make('h3','',month));
   const grid=make('div','apple-photo-grid');
   for(const a of items)grid.append(drawTile(a,list,list.indexOf(a)));
   section.append(grid);node.append(section);
  }
 }
 function render(){
  const all=archiveAssets();
  $('photoCountMetric').textContent=all.filter(a=>a.kind==='photo').length;
  $('videoCountMetric').textContent=all.filter(a=>a.kind==='video').length;
  $('albumCountMetric').textContent=allAlbums().length;
  $('favoriteCountMetric').textContent=meta.favorites.length;
  renderAlbums();renderGallery();
 }
 async function toggleFavorite(id){
  const was=favorited(id);
  const query=was
   ?client.from('corp_social_photo_favorites').delete().eq('user_id',ownId()).eq('asset_id',id)
   :client.from('corp_social_photo_favorites').insert({user_id:ownId(),asset_id:id});
  const {error}=await query;
  if(error){toast('Could not update favorites: '+error.message);return}
  if(was)meta.favorites=meta.favorites.filter(x=>x.asset_id!==id||x.user_id!==ownId());
  else meta.favorites.push({asset_id:id,user_id:ownId()});
  render();
  if(!$('applePhotoViewer').hidden){
   const b=$('appleViewerFavorite'),liked=favorited(id);
   b.textContent=liked?'♥':'♡';b.classList.toggle('liked',liked);
  }
 }
 function openAlbumDialog(a=null){
  meta.editingAlbum=a?.id||null;
  $('appleAlbumTitle').textContent=a?'Edit Album':'Create Album';
  $('appleAlbumName').value=a?.title||'';
  $('appleAlbumDescription').value=a?.description||'';
  $('appleAlbumOverlay').hidden=false;
  $('appleAlbumName').focus();
 }
 function closeAlbumDialog(){$('appleAlbumOverlay').hidden=true;meta.editingAlbum=null}
 async function saveAlbum(){
  const title=$('appleAlbumName').value.trim();
  const description=$('appleAlbumDescription').value.trim();
  if(!title||title.length>100){toast('Enter an album name between 1 and 100 characters.');return}
  const btn=$('albumModalSave');btn.disabled=true;btn.textContent='SAVING…';
  try{
   const editing=albumFor(meta.editingAlbum);
   const query=editing
    ?client.from('corp_social_albums').update({title,description}).eq('id',editing.id).eq('owner_id',ownId())
    :client.from('corp_social_albums').insert({owner_id:ownId(),title,description});
   const {error}=await query;
   if(error)throw error;
   closeAlbumDialog();await refresh();render();toast(editing?'Album updated.':'Album created. Add media from the photo viewer.');
  }catch(e){toast('Album could not be saved: '+(e.message||'Connection error'))}
  finally{btn.disabled=false;btn.textContent='SAVE ALBUM ↗'}
 }
 async function deleteAlbum(a){
  if(!confirm('Delete the album "'+a.title+'"? The photos will stay in the Network library.'))return;
  const {error}=await client.from('corp_social_albums').delete().eq('id',a.id).eq('owner_id',ownId());
  if(error){toast('Album could not be deleted: '+error.message);return}
  if(meta.activeAlbum===a.id)meta.activeAlbum=null;
  await refresh();render();toast('Album deleted. Your photos remain in the library.');
 }
 async function addToAlbum(asset){
  const id=$('appleViewerAlbumSelect').value;
  const album=albumFor(id);
  if(!album||album.owner_id!==ownId()||asset.owner_id!==ownId()){
   toast('You can only organize your own photos into your own albums.');return;
  }
  const {error}=await client.from('corp_social_album_items').upsert({
   album_id:id,asset_id:asset.id,added_by:ownId()
  },{onConflict:'album_id,asset_id',ignoreDuplicates:true});
  if(error){toast('Could not add media to album: '+error.message);return}
  await loadData();render();toast('Added to '+album.title+'.');
 }
 async function uploadFiles(files){
  if(meta.uploading)return;
  const picked=Array.from(files).slice(0,20);
  if(!picked.length)return;
  if(files.length>20)toast('Only the first 20 files will upload in one batch.');
  const supported=picked.filter(f=>(photoFormats.has(f.type)||videoFormats.has(f.type))&&f.size<=fileMax&&f.size>0);
  if(supported.length!==picked.length){
   toast('Unsupported file types or files over 45 MB were skipped. Use JPG, PNG, HEIC, GIF, MOV, or MP4.');
  }
  if(!supported.length)return;
  meta.uploading=true;
  const bar=$('applePhotoProgress'),fill=$('applePhotoMeterFill'),label=$('appleProgressLabel');
  $('photosUploadButton').disabled=true;
  bar.hidden=false;fill.style.width='0%';
  let completed=0,failures=0;
  const album=albumFor(meta.activeAlbum);
  try{
   for(const f of supported){
    label.textContent='Uploading '+(completed+1)+' of '+supported.length+' · '+f.name.slice(0,36);
    try{
     const asset=await uploadAsset(f,'library');
     if(album&&album.owner_id===ownId()){
      const {error}=await client.from('corp_social_album_items').insert({
       album_id:album.id,asset_id:asset.id,added_by:ownId()
      });
      if(error)toast('Photo uploaded, but adding to album failed: '+error.message);
     }
    }catch(e){failures++;toast('Media upload failed for '+f.name+': '+(e?.message||'Unknown error'))}
    completed++;fill.style.width=Math.round(completed*100/supported.length)+'%';
    label.textContent=completed+' of '+supported.length+' files processed';
   }
   await refresh();
   render();
   toast(failures?supported.length-failures+' saved, '+failures+' unsuccessful.':'Media uploaded to Blackcell Network Photos.');
  }finally{
   meta.uploading=false;$('photosUploadButton').disabled=false;
   setTimeout(()=>bar.hidden=true,800);
  }
 }
 function viewerCurrent(){return meta.viewerItems[meta.viewerIndex]||null}
 async function openViewer(list,index=0){
  if(!list.length)return;
  await ensureSigned();
  meta.viewerItems=[...list];meta.viewerIndex=Math.max(0,Math.min(index,list.length-1));
  $('applePhotoViewer').hidden=false;
  document.body.style.overflow='hidden';
  renderViewer();
 }
 function closeViewer(){
  $('applePhotoViewer').hidden=true;document.body.style.overflow='';
  $('appleViewerStage').replaceChildren();
 }
 function changeViewer(step){
  const length=meta.viewerItems.length;if(!length)return;
  meta.viewerIndex=(meta.viewerIndex+step+length)%length;renderViewer();
 }
 function renderViewer(){
  const a=viewerCurrent();if(!a)return;
  const frame=$('appleViewerStage');frame.replaceChildren();
  const u=mediaUrl(a);
  $('appleViewerFilename').textContent=a.filename;
  $('appleViewerMeta').textContent=nameOf(a)+' · '+size(a.bytes)+' · '+new Date(a.created_at).toLocaleDateString();
  $('appleViewerCaption').textContent=a.caption||'';
  $('appleViewerPosition').textContent=(meta.viewerIndex+1)+' / '+meta.viewerItems.length;
  const star=$('appleViewerFavorite');
  star.textContent=favorited(a.id)?'♥':'♡';star.classList.toggle('liked',favorited(a.id));
  $('appleViewerPrevious').disabled=meta.viewerItems.length<=1;
  $('appleViewerNext').disabled=meta.viewerItems.length<=1;
  if(u){
   if(a.kind==='video'){
    const vid=make('video');vid.src=u;vid.controls=true;vid.playsInline=true;vid.preload='metadata';
    vid.addEventListener('loadedmetadata',()=>{
     $('appleViewerMeta').textContent=nameOf(a)+' · '+vid.videoWidth+' × '+vid.videoHeight+' · '+size(a.bytes)
    });
    frame.append(vid);
   }else{
    const img=make('img');img.src=u;img.alt=a.caption||a.filename;
    img.addEventListener('load',()=>{
     $('appleViewerMeta').textContent=nameOf(a)+' · '+img.naturalWidth+' × '+img.naturalHeight+' · '+size(a.bytes)
    });
    frame.append(img);
   }
  }else frame.append(make('p','empty-state','Original media is not available. Refresh the library to renew the secure link.'));
  $('appleViewerOwnerControls').hidden=!own(a);
  const select=$('appleViewerAlbumSelect');select.replaceChildren();
  const owned=allAlbums().filter(x=>x.owner_id===ownId());
  select.add(new Option(owned.length?'CHOOSE ALBUM…':'CREATE AN ALBUM FIRST',''));
  for(const album of owned)select.add(new Option(album.title,album.id));
  $('appleViewerAddAlbum').disabled=!owned.length;
  $('appleViewerEditCaption').hidden=!own(a);
  $('appleViewerDelete').hidden=!(own(a)&&a.purpose==='library');
  const film=$('appleViewerFilmstrip');film.replaceChildren();
  for(const [i,item] of meta.viewerItems.slice(0,70).entries()){
   const thumb=press('',()=>{meta.viewerIndex=i;renderViewer()});
   thumb.classList.toggle('selected',meta.viewerIndex===i);
   const url=mediaUrl(item);
   if(item.kind==='photo'&&url){
    const img=make('img');img.src=url;img.alt=item.filename;thumb.append(img);
   }else thumb.append(make('span','',item.kind==='video'?'▶':'▧'));
   film.append(thumb);
  }
  film.querySelector('.selected')?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
 }
 async function downloadAsset(){
  const a=viewerCurrent();if(!a)return;
  const b=$('appleViewerDownload');b.disabled=true;b.textContent='PREPARING…';
  try{
   const {data,error}=await bucket.download(a.storage_path);
   if(error||!data)throw error||Error('File unavailable');
   const url=URL.createObjectURL(data);
   const link=document.createElement('a');link.href=url;link.download=a.filename||'blackcell-original';
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),40000);
  }catch(e){toast('Could not download original: '+(e?.message||'Try again'))}
  finally{b.disabled=false;b.textContent='↓ DOWNLOAD'}
 }
 function openOriginal(){
  const a=viewerCurrent();if(!a)return;
  // This is a separate authenticated page, not a public link.
  const anchor=document.createElement('a');
  anchor.href='corporate-photos-original.html?id='+encodeURIComponent(a.id);
  anchor.target='_blank';anchor.rel='noopener';
  document.body.append(anchor);anchor.click();anchor.remove();
 }
 async function editCaption(){
  const a=viewerCurrent();if(!a||!own(a))return;
  const proposed=prompt('Edit the caption for '+a.filename+' (up to 300 characters)',a.caption||'');
  if(proposed===null)return;
  if(proposed.length>300){toast('Captions can contain up to 300 characters.');return}
  const {error}=await client.from('corp_social_assets').update({caption:proposed.trim()})
   .eq('id',a.id).eq('owner_id',ownId());
  if(error){toast('Caption could not be saved: '+error.message);return}
  a.caption=proposed.trim();renderViewer();render();toast('Caption saved.');
 }
 async function deleteLibraryMedia(){
  const a=viewerCurrent();if(!a||!own(a)||a.purpose!=='library')return;
  if(!confirm('Permanently delete "'+a.filename+'" from the corporate library and albums?'))return;
  try{
   // Remove from storage before deleting the metadata RLS authorization.
   const {error:removeError}=await bucket.remove([a.storage_path]);
   if(removeError)throw removeError;
   const {error}=await client.from('corp_social_assets').delete().eq('id',a.id).eq('owner_id',ownId());
   if(error)throw error;
   closeViewer();await refresh();render();toast('Media deleted from the library.');
  }catch(e){toast('Could not delete original: '+(e?.message||'Unknown error'))}
 }
 function renderProfilePhotos(userId,kind='photo'){
  const list=sortAssets(archiveAssets().filter(a=>a.owner_id===userId&&a.kind===kind));
  const node=make('div','apple-photo-grid apple-profile-gallery');
  if(!list.length)return empty('No '+(kind==='video'?'videos':'photos')+' yet','Shared media will appear here.');
  for(const [i,a] of list.entries())node.append(drawTile(a,list,i));
  return node;
 }
 function renderProfileAlbums(userId){
  const grid=make('div','apple-album-strip');
  const list=allAlbums().filter(a=>a.owner_id===userId);
  if(!list.length)return empty('No albums yet','Albums created by this member will appear here.');
  for(const a of list){
   const node=press('',()=>{state.view='photos';selectAlbum(a.id);
    document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='photosView');
    document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('nav-active',n.dataset.view==='photos'));
   },'apple-album-card');
   const cover=make('div','apple-album-cover'),files=albumMedia(a).slice(0,4);
   if(!files.length)cover.append(make('span','album-placeholder','▧'));
   for(const f of files){
    if(f.kind==='photo'&&mediaUrl(f)){
     const img=make('img');img.src=mediaUrl(f);img.alt=f.filename;cover.append(img);
    }else cover.append(make('span','album-video-icon','▶'));
   }
   node.append(cover,make('strong','',a.title),make('small','',listCount(a)+' media items'));
   grid.append(node);
  }
  return grid;
 }
 function setup(){
  $('newAlbumButton').addEventListener('click',()=>openAlbumDialog());
  $('photosUploadButton').addEventListener('click',()=>{
   $('applePhotoFiles').value='';$('applePhotoFiles').click()
  });
  $('applePhotoFiles').addEventListener('change',()=>void uploadFiles($('applePhotoFiles').files));
  $('photosClearAlbum').addEventListener('click',()=>selectAlbum(null));
  $('photosSearch').addEventListener('input',e=>{meta.query=e.target.value.trim().toLowerCase();renderGallery()});
  $('photosSort').addEventListener('change',e=>{meta.sort=e.target.value;renderGallery()});
  for(const b of document.querySelectorAll('#photosFilters [data-photo-filter]'))b.addEventListener('click',()=>{
   meta.filter=b.dataset.photoFilter;renderGallery()
  });
  $('albumModalClose').addEventListener('click',closeAlbumDialog);
  $('albumModalCancel').addEventListener('click',closeAlbumDialog);
  $('albumModalSave').addEventListener('click',()=>void saveAlbum());
  $('appleAlbumOverlay').addEventListener('click',e=>{if(e.target===$('appleAlbumOverlay'))closeAlbumDialog()});
  $('appleViewerClose').addEventListener('click',closeViewer);
  $('appleViewerPrevious').addEventListener('click',()=>changeViewer(-1));
  $('appleViewerNext').addEventListener('click',()=>changeViewer(1));
  $('appleViewerFavorite').addEventListener('click',()=>{const a=viewerCurrent();if(a)void toggleFavorite(a.id)});
  $('appleViewerDownload').addEventListener('click',()=>void downloadAsset());
  $('appleViewerOriginal').addEventListener('click',openOriginal);
  $('appleViewerAddAlbum').addEventListener('click',()=>{const a=viewerCurrent();if(a)void addToAlbum(a)});
  $('appleViewerEditCaption').addEventListener('click',()=>void editCaption());
  $('appleViewerDelete').addEventListener('click',()=>void deleteLibraryMedia());
  document.addEventListener('keydown',e=>{
   if(!$('applePhotoViewer').hidden){
    if(e.key==='Escape')closeViewer();
    if(e.key==='ArrowLeft')changeViewer(-1);
    if(e.key==='ArrowRight')changeViewer(1);
   }else if(e.key==='Escape'&&!$('appleAlbumOverlay').hidden)closeAlbumDialog();
  });
  let touchStart=0;
  $('appleViewerStage').addEventListener('touchstart',e=>{touchStart=e.touches[0]?.clientX||0},{passive:true});
  $('appleViewerStage').addEventListener('touchend',e=>{
   const end=e.changedTouches[0]?.clientX||touchStart,delta=end-touchStart;
   if(Math.abs(delta)>65)changeViewer(delta<0?1:-1);
  },{passive:true});
 }
 setup();
 return {loadData,render,renderProfilePhotos,renderProfileAlbums,openViewer,openAsset:(a)=>{
   const group=sortAssets(archiveAssets().filter(x=>x.owner_id===a.owner_id&&x.kind===a.kind));
   const pos=group.findIndex(x=>x.id===a.id);
   return openViewer(group,pos<0?0:pos)
 },selectAlbum};
}
