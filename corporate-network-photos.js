/* BLACKCELL NETWORK / Apple Photos × Flickr private corporate library */
import {createWorldForces} from './corporate-world-forces.js?v=20261110-world6';
import {createMilitaryPhotoAI} from './corporate-military-ai.js?v=20261110-learn1';
import {createPhotoTaste} from './corporate-photo-taste.js?v=20261110-trigger2';
export function setupBlackcellPhotos({client,bucket,state,toast,mediaUrl,uploadAsset,refresh,profile,openProfile,ensureSigned,switchView}){
 const $=id=>document.getElementById(id);
 const meta={albums:[],albumItems:[],favorites:[],activeAlbum:null,filter:'all',sort:'newest',query:'',
   scope:'mine',branch:'',category:'',era:'',editingAsset:null,
   viewerItems:[],viewerIndex:0,editingAlbum:null,uploading:false,renderCount:0,tastes:[]};
 const fileMax=45*1024*1024;
 const photoFormats=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic']);
 const videoFormats=new Set(['video/mp4','video/webm','video/quicktime','video/x-m4v']);
 const archiveAssets=()=>state.assets.filter(a=>['post','library'].includes(a.purpose));
 const ownId=()=>state.user.id;
 const own=a=>a.owner_id===ownId();
 const favorited=id=>meta.favorites.some(x=>x.asset_id===id&&x.user_id===ownId());
 const byId=id=>state.assets.find(a=>a.id===id);
 const allAlbums=()=>meta.albums;
 const militaryCategories=['Unsorted','Personnel','Uniforms','Insignia','Equipment','Ground Vehicles','Aircraft','Naval Vessels','Facilities','Training','Fitness / Exercise','Operations','Ceremonies','Historical','Other'];
 const categoryIcons={'Unsorted':'▧','Personnel':'♟','Uniforms':'◈','Insignia':'✦','Equipment':'◩',
   'Ground Vehicles':'▰','Aircraft':'✈','Naval Vessels':'⚓','Facilities':'▦',
   'Training':'◎','Fitness / Exercise':'◉','Operations':'◇','Ceremonies':'✧','Historical':'◷','Other':'◌'};
 const cat=a=>a?.military_category||'Unsorted';
 const branch=a=>a?.military_branch||'Unspecified';
 const isAdmin=()=>state.member?.role==='owner';
 function parseTags(value){return Array.from(new Set(String(value||'').split(',')
  .map(t=>t.trim().slice(0,40)).filter(Boolean))).slice(0,15)}
 function albumClassification(album){
  return {military_category:cat(album),military_branch:branch(album),
   military_country_code:album?.military_country_code||'',
   military_era:album?.military_era||'',military_unit:album?.military_unit||'',
   military_tags:Array.isArray(album?.military_tags)?album.military_tags:[]};
 }
 function uploadClassification(){
  const album=albumFor(meta.activeAlbum);
  const classification=album&&album.owner_id===ownId()?albumClassification(album):{
   military_category:$('militaryUploadCategory').value,
   military_branch:$('militaryUploadBranch').value,
   military_country_code:$('militaryUploadCountry').value,
   military_era:$('militaryUploadEra').value,
   military_unit:$('militaryUploadUnit').value.trim(),
   military_tags:parseTags($('militaryUploadTags').value)
  };
  return classification;
 }
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
 const world=createWorldForces({client,state,meta,toast,archiveAssets,mediaUrl,openViewer,render});
 const taste=createPhotoTaste({client,state,meta,toast,viewerCurrent,mediaUrl,render,archiveAssets,
  onSaved:({reaction,areas,cues,regions})=>{
   meta.filter='for-you';meta.activeAlbum=null;
   meta.query='';const search=$('photosSearch');if(search)search.value='';
   if(!$('applePhotoViewer').hidden)closeViewer();
   const note=$('tasteSavedNotice');
   if(note){
    const labeled=(regions||[]).filter(r=>r.cue||(r.features||[]).length).length;
    note.textContent='✓ FEEDBACK SAVED · '+areas+' highlighted area'+(areas===1?'':'s')+
     ' · '+labeled+' labeled · '+cues.length+' overall details. Below are updated For You suggestions based on matching approved photo tags. Selecting areas does not run a separate AI scan.';
    note.hidden=false;
   }
   requestAnimationFrame(()=>{const panel=$('tasteInsights');if(panel&&!panel.hidden)panel.scrollIntoView({behavior:'smooth',block:'center'})});
  }
 });
 const ai=createMilitaryPhotoAI({client,state,toast,getCurrent:viewerCurrent,mediaUrl,
  onApproved:(item,review)=>{
   Object.assign(item,{military_country_code:review.country_code,military_branch:review.military_branch,
    military_category:review.military_category,
    military_tags:[...new Set([...(review.tags||[]).filter(t=>!String(t).startsWith("visual:")),
     ...(!["unknown","other"].includes(review.visual_focus)?["visual:"+review.visual_focus]:[])])].slice(0,15)});
   renderViewer();render();toast('AI tags approved and saved to your Military Library.');
  }});
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
  await world.load();
  await taste.load();
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
  if(meta.filter==='countries'){
   const codes=new Set(world.selectedCountryCodes());
   return codes.size?archiveAssets().filter(a=>a.kind==='photo'&&codes.has(String(a.military_country_code||'').toUpperCase()))
    .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)):[];
  }
  if(meta.filter==='for-you')return taste.rank(world.rank(archiveAssets()));
  let assets=meta.activeAlbum?albumMedia(albumFor(meta.activeAlbum)||{id:''})
   :archiveAssets().filter(x=>meta.scope==='network'||own(x));
  if(meta.filter==='photo')assets=assets.filter(x=>x.kind==='photo');
  if(meta.filter==='video')assets=assets.filter(x=>x.kind==='video');
  if(meta.filter==='mine')assets=assets.filter(x=>own(x));
  if(meta.filter==='favorites')assets=assets.filter(x=>favorited(x.id));
  if(meta.branch)assets=assets.filter(x=>branch(x)===meta.branch);
  if(meta.category)assets=assets.filter(x=>cat(x)===meta.category);
  if(meta.era)assets=assets.filter(x=>(x.military_era||'')===meta.era);
  if(meta.query)assets=assets.filter(x=>(
   x.filename+' '+(x.caption||'')+' '+nameOf(x)+' '+cat(x)+' '+branch(x)+
   ' '+(x.military_era||'')+' '+(x.military_unit||'')+' '+
   (x.military_location||'')+' '+(x.military_year||'')+' '+
   (Array.isArray(x.military_tags)?x.military_tags.join(' '):'')
  ).toLowerCase().includes(meta.query));
  return sortAssets(world.applyFilter(assets));
 }
 function selectAlbum(albumId){
  world.deactivate();
  meta.activeAlbum=albumId||null;
  if(meta.activeAlbum){
   const album=albumFor(meta.activeAlbum);
   if(album&&album.owner_id!==ownId())meta.scope='network';
   meta.category='';meta.branch='';meta.era='';
   $('militaryFilterCategory').value='';$('militaryFilterBranch').value='';$('militaryFilterEra').value='';
  }
  meta.filter='all';render();
  const gallery=$('applePhotosGallery');
  gallery?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function renderAlbums(){
  const root=$('appleAlbumStrip');root.replaceChildren();
  const albums=allAlbums().filter(a=>meta.scope==='network'||a.owner_id===ownId());
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
   const tags=make('div','military-album-meta');
   tags.append(make('span','',cat(album)),make('span','',branch(album)));
   if(album.military_era)tags.append(make('span','',album.military_era));
   node.append(card,tags);
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
  open.title=(a.caption||a.filename)+' · '+cat(a)+' · '+branch(a)+' · '+nameOf(a);
  tile.append(open);
  if(cat(a)!=='Unsorted')tile.append(make('span','military-photo-tag',cat(a)));
  if(a.kind==='video')tile.append(make('span','apple-photo-kind','VIDEO'));
  const heart=press(favorited(a.id)?'♥':'♡',event=>{
   event.stopPropagation();void toggleFavorite(a.id);
  },'apple-photo-heart'+(favorited(a.id)?' liked':''));
  heart.setAttribute('aria-label',(favorited(a.id)?'Remove favorite':'Add favorite')+' '+a.filename);
  tile.append(heart);
  if(a.kind==='photo'){
   const marked=meta.tastes.find(t=>t.asset_id===a.id);
   const action=press(marked?'✦ EDIT DETAILS':'✦ MARK WHAT I LIKE',event=>{
    event.stopPropagation();taste.open(a)
   },'apple-photo-taste-entry');
   action.title='Highlight areas, label details, and tell Blackcell what catches your eye';
   tile.append(action);
  }
  return tile;
 }
 function setupMyCountries(){
  const chooser=$('myCountriesSelect');chooser.replaceChildren(new Option('Choose a country…',''));
  for(const item of world.browseCountries())chooser.add(new Option(item.flag+' '+item.label,item.code));
  $('myCountriesUS').addEventListener('click',()=>{
   world.updateCountryCollection(['US']);meta.filter='countries';renderGallery();
  });
  $('myCountriesAdd').addEventListener('click',()=>{
   const code=chooser.value;if(!code)return;
   const existing=world.selectedCountryCodes();
   if(!existing.includes(code)&&existing.length>=12){
    toast('Select up to twelve countries in one collection.');return;
   }
   world.updateCountryCollection([...existing,code]);
   meta.filter='countries';renderGallery();chooser.value='';
  });
  $('myCountriesClear').addEventListener('click',()=>{
   world.updateCountryCollection([]);renderGallery();
  });
  $('myCountriesSave').addEventListener('click',async()=>{
   const btn=$('myCountriesSave');
   btn.disabled=true;btn.textContent='SAVING…';
   try{
    await world.saveCountryCollection();
    $('myCountriesSummary').textContent='✓ Saved your '+world.selectedCountryCodes().length+' selected countries to this account. The combined gallery updates automatically.';
   }finally{btn.disabled=false;btn.textContent='♡ SAVE MY COLLECTION'}
  });
 }
 function renderMyCountries(){
  const root=$('myCountriesPanel');
  if(!root)return;
  root.hidden=meta.filter!=='countries';
  if(root.hidden)return;
  const countries=world.selectedCountryCodes(),chips=$('myCountriesChips');
  chips.replaceChildren();
  for(const code of countries){
   const b=document.createElement('button');b.type='button';
   b.textContent='🌐 '+world.countryName(code)+' ×';
   b.setAttribute('aria-label','Remove '+world.countryName(code)+' from My Countries');
   b.addEventListener('click',()=>{
    world.updateCountryCollection(world.selectedCountryCodes().filter(x=>x!==code));
    renderGallery();
   });chips.append(b);
  }
  if(!countries.length){
   const hint=document.createElement('span');hint.className='country-personal-empty';
   hint.textContent='Choose United States or add a country to build your collection.';chips.append(hint);
  }
  const matches=archiveAssets().filter(a=>a.kind==='photo'&&countries.includes(String(a.military_country_code||'').toUpperCase()));
  $('myCountriesTitle').textContent=countries.length===1?world.countryName(countries[0]).toUpperCase()+'.':
   countries.length?countries.map(x=>world.countryName(x)).join(' + ').toUpperCase()+'.':'MY COUNTRIES.';
  $('myCountriesSummary').textContent=countries.length+
   ' selected · '+matches.length+' matching photo'+(matches.length===1?'':'s')+
   ' from your authorized library. Select any number of countries up to twelve. Photos without a country label are excluded.';
 }
 function renderGallery(){
  const node=$('applePhotosGallery');node.replaceChildren();
  const list=selectedAssets(),album=albumFor(meta.activeAlbum);
  taste.renderInsights(list[0],meta.filter==='for-you');
  renderMyCountries();
  $('photosGalleryTitle').textContent=meta.filter==='countries'
   ?'My Countries · '+(world.selectedCountryCodes().map(c=>world.countryName(c)).join(' + ')||'Select Countries')
   :meta.filter==='for-you'?'For You · Personalized Military Media'
   :world.title()||(album?album.title:(meta.scope==='mine'?'My Military Media':'Network Military Media'));
  $('photosClearAlbum').hidden=!meta.activeAlbum;
  for(const b of document.querySelectorAll('#photosFilters [data-photo-filter]'))
   b.classList.toggle('selected',b.dataset.photoFilter===meta.filter);
  if(!list.length){node.append(empty(
   meta.filter==='countries'?'No photographs for these countries yet':meta.filter==='favorites'?'No favorites yet':'Your gallery is ready',
   meta.filter==='countries'?'Select countries above. Photographs appear once they have that country saved in their approved classification; unknown-country photos are not guessed.':meta.filter==='favorites'?'Tap a heart on a photo to add it to Favorites.':
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
   for(const a of items){
    const index=list.indexOf(a);
    const tile=drawTile(a,list,index);
    if(meta.filter==='for-you'&&index<6&&meta.tastes.length){
     tile.append(make('div','taste-match-reason',taste.reason(a)));
    }
    grid.append(tile);
   }
   section.append(grid);node.append(section);
  }
 }
 function renderCategoryTiles(){
  const root=$('militaryCategoryTiles');root.replaceChildren();
  const assets=archiveAssets().filter(a=>meta.scope==='network'||own(a));
  const features=['Unsorted','Uniforms','Equipment','Ground Vehicles','Aircraft','Naval Vessels','Training','Fitness / Exercise','Historical'];
  const extras=militaryCategories.filter(x=>!features.includes(x)&&assets.some(a=>cat(a)===x));
  for(const category of [...features,...extras]){
   const count=assets.filter(a=>cat(a)===category).length;
   const card=press('',()=>{
    meta.category=meta.category===category?'':category;
    meta.activeAlbum=null;
    world.deactivate();
    $('militaryFilterCategory').value=meta.category;
    render();
    $('applePhotosGallery')?.scrollIntoView({behavior:'smooth',block:'start'})
   },'military-category-card'+(meta.category===category?' selected':''));
   card.setAttribute('aria-label',category+' · '+count+' media items');
   const description=make('div');
   description.append(make('strong','',category),make('small','',count+' media item'+(count===1?'':'s')));
   card.append(make('span','military-category-icon',categoryIcons[category]||'▧'),description);
   root.append(card);
  }
 }
 function render(){
  const all=archiveAssets().filter(a=>meta.scope==='network'||own(a));
  $('photoCountMetric').textContent=all.filter(a=>a.kind==='photo').length;
  $('videoCountMetric').textContent=all.filter(a=>a.kind==='video').length;
  $('albumCountMetric').textContent=allAlbums().filter(a=>meta.scope==='network'||a.owner_id===ownId()).length;
  $('favoriteCountMetric').textContent=all.filter(a=>favorited(a.id)).length;
  for(const b of document.querySelectorAll('#militaryScope [data-military-scope]'))
   b.classList.toggle('selected',b.dataset.militaryScope===meta.scope);
  renderCategoryTiles();renderAlbums();renderGallery();world.renderWorld();
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
  $('appleAlbumCategory').value=cat(a);
  $('appleAlbumBranch').value=branch(a);
  $('appleAlbumCountry').value=a?.military_country_code||'';
  $('appleAlbumEra').value=a?.military_era||'';
  $('appleAlbumUnit').value=a?.military_unit||'';
  $('appleAlbumTags').value=(a?.military_tags||[]).join(', ');
  $('appleAlbumOverlay').hidden=false;
  $('appleAlbumName').focus();
 }
 function closeAlbumDialog(){$('appleAlbumOverlay').hidden=true;meta.editingAlbum=null}
 async function saveAlbum(){
  const title=$('appleAlbumName').value.trim();
  const description=$('appleAlbumDescription').value.trim();
  const classification={
   military_category:$('appleAlbumCategory').value,
   military_branch:$('appleAlbumBranch').value,
   military_country_code:$('appleAlbumCountry').value,
   military_era:$('appleAlbumEra').value,
   military_unit:$('appleAlbumUnit').value.trim(),
   military_tags:parseTags($('appleAlbumTags').value)
  };
  if(!title||title.length>100){toast('Enter an album name between 1 and 100 characters.');return}
  const btn=$('albumModalSave');btn.disabled=true;btn.textContent='SAVING…';
  try{
   const editing=albumFor(meta.editingAlbum);
   const query=editing
    ?client.from('corp_social_albums').update({title,description,...classification}).eq('id',editing.id).eq('owner_id',ownId())
    :client.from('corp_social_albums').insert({owner_id:ownId(),title,description,...classification});
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
  if(!album||album.owner_id!==ownId()||(asset.owner_id!==ownId()&&!isAdmin())){
   toast('You can only add to your own albums; employee collections cannot be edited by other members.');return;
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
  const scanAfterUpload=$('aiAnalyzeOnUpload')?.checked===true;
  const uploadedPhotoIds=[];
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
     if(asset.kind==='photo')uploadedPhotoIds.push({id:asset.id,file:f});
     const classification=uploadClassification();
     const {error:tagError}=await client.from('corp_social_assets')
      .update(classification).eq('id',asset.id).eq('owner_id',ownId());
     if(tagError)toast('Upload saved; classification could not be applied: '+tagError.message);
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
   if(scanAfterUpload&&uploadedPhotoIds.length){
    const newest=uploadedPhotoIds.map(item=>({asset:byId(item.id),file:item.file})).filter(item=>item.asset);
    if(newest.length){
     label.textContent='AI reviewing '+newest.length+' newly uploaded photographs…';
     await ai.afterUpload(newest,(i,total,filename)=>{
      label.textContent='AI scan '+(i+1)+' of '+total+' · '+String(filename||'Photo').slice(0,36);
     });
    }else toast('Photos uploaded. Open them to request AI suggestions after refreshing the library.');
   }
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
  $('appleViewerMeta').textContent=nameOf(a)+' · '+size(a.bytes)+' · '+cat(a)+' · '+branch(a)+(a.military_country_code?' · '+world.countryName(a.military_country_code):'');
  $('appleViewerCaption').textContent=a.caption||'';
  $('appleViewerPosition').textContent=(meta.viewerIndex+1)+' / '+meta.viewerItems.length;
  const star=$('appleViewerFavorite');
  star.textContent=favorited(a.id)?'♥':'♡';star.classList.toggle('liked',favorited(a.id));
  $('appleViewerPrevious').disabled=meta.viewerItems.length<=1;
  $('appleViewerNext').disabled=meta.viewerItems.length<=1;
  ai.toggleForAsset(a);
  taste.forViewer(a);
  if(u){
   if(a.kind==='video'){
    const vid=make('video');vid.src=u;vid.controls=true;vid.playsInline=true;vid.preload='metadata';
    vid.addEventListener('loadedmetadata',()=>{
     $('appleViewerMeta').textContent=nameOf(a)+' · '+vid.videoWidth+' × '+vid.videoHeight+' · '+cat(a)+' · '+branch(a)+(a.military_country_code?' · '+world.countryName(a.military_country_code):'')
    });
    frame.append(vid);
   }else{
    const img=make('img');img.src=u;img.alt=a.caption||a.filename;
    img.addEventListener('load',()=>{
     $('appleViewerMeta').textContent=nameOf(a)+' · '+img.naturalWidth+' × '+img.naturalHeight+' · '+cat(a)+' · '+branch(a)+(a.military_country_code?' · '+world.countryName(a.military_country_code):'')
    });
    frame.append(img);
   }
  }else frame.append(make('p','empty-state','Original media is not available. Refresh the library to renew the secure link.'));
  // The Level 7 owner may curate network-shared assets into the owner's
  // own albums, without being able to edit, classify, or delete the source.
  $('appleViewerOwnerControls').hidden=!(own(a)||isAdmin());
  const select=$('appleViewerAlbumSelect');select.replaceChildren();
  const owned=allAlbums().filter(x=>x.owner_id===ownId());
  select.add(new Option(owned.length?'CHOOSE ALBUM…':'CREATE AN ALBUM FIRST',''));
  for(const album of owned)select.add(new Option(album.title,album.id));
  $('appleViewerAddAlbum').disabled=!owned.length;
  $('appleViewerAddAlbum').textContent=own(a)?'＋ ADD TO ALBUM':'＋ CURATE TO MY ALBUM';
  $('appleViewerEditCaption').hidden=!own(a);
  $('appleViewerEditMilitary').hidden=!own(a);
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
   const node=press('',()=>{switchView('photos');selectAlbum(a.id)},'apple-album-card');
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

 function openMilitaryAssetDialog(){
  const a=viewerCurrent();if(!a||!own(a))return;
  meta.editingAsset=a.id;
  $('militaryAssetTitle').textContent='Classify · '+a.filename.slice(0,45);
  $('militaryAssetCategory').value=cat(a);
  $('militaryAssetBranch').value=branch(a);
  $('militaryAssetCountry').value=a.military_country_code||'';
  $('militaryAssetEra').value=a.military_era||'';
  $('militaryAssetUnit').value=a.military_unit||'';
  $('militaryAssetLocation').value=a.military_location||'';
  $('militaryAssetYear').value=a.military_year||'';
  $('militaryAssetTags').value=(a.military_tags||[]).join(', ');
  $('militaryAssetOverlay').hidden=false;
 }
 function closeMilitaryAssetDialog(){
  $('militaryAssetOverlay').hidden=true;meta.editingAsset=null;
 }
 async function saveMilitaryAsset(){
  const id=meta.editingAsset,a=byId(id);
  if(!id||!a||!own(a))return;
  const rawYear=$('militaryAssetYear').value.trim();
  const year=rawYear?Number(rawYear):null;
  if(rawYear&&(!Number.isInteger(year)||year<1800||year>2100)){
   toast('Enter a year from 1800 to 2100 or leave it blank.');return;
  }
  const values={
   military_category:$('militaryAssetCategory').value,
   military_branch:$('militaryAssetBranch').value,
   military_country_code:$('militaryAssetCountry').value,
   military_era:$('militaryAssetEra').value,
   military_unit:$('militaryAssetUnit').value.trim(),
   military_location:$('militaryAssetLocation').value.trim(),
   military_year:year,
   military_tags:parseTags($('militaryAssetTags').value)
  };
  const button=$('militaryAssetSave');button.disabled=true;button.textContent='SAVING…';
  try{
   const {error}=await client.from('corp_social_assets').update(values)
    .eq('id',id).eq('owner_id',ownId());
   if(error)throw error;
   Object.assign(a,values);
   closeMilitaryAssetDialog();renderViewer();render();
   toast('Military classification saved to your media.');
  }catch(e){toast('Could not save classification: '+(e.message||'Connection error'))}
  finally{button.disabled=false;button.textContent='SAVE CLASSIFICATION ↗'}
 }
 function setup(){
  world.setup();
  ai.setup();
  taste.setup();
  for(const b of document.querySelectorAll('#militaryScope [data-military-scope]')){
   b.addEventListener('click',()=>{
    meta.scope=b.dataset.militaryScope;meta.activeAlbum=null;meta.filter='all';world.deactivate();render()
   });
  }
  for(const [id,key] of [['militaryFilterBranch','branch'],['militaryFilterCategory','category'],['militaryFilterEra','era']]){
   $(id).addEventListener('change',e=>{meta[key]=e.target.value;meta.activeAlbum=null;world.deactivate();render()});
  }
  $('militaryFiltersReset').addEventListener('click',()=>{
   meta.branch='';meta.category='';meta.era='';meta.query='';meta.filter='all';meta.activeAlbum=null;world.deactivate();
   $('militaryFilterBranch').value='';$('militaryFilterCategory').value='';
   $('militaryFilterEra').value='';$('photosSearch').value='';render()
  });
  $('militaryAssetClose').addEventListener('click',closeMilitaryAssetDialog);
  $('militaryAssetCancel').addEventListener('click',closeMilitaryAssetDialog);
  $('militaryAssetSave').addEventListener('click',()=>void saveMilitaryAsset());
  $('appleViewerEditMilitary').addEventListener('click',openMilitaryAssetDialog);
  $('militaryAssetOverlay').addEventListener('click',e=>{
   if(e.target===$('militaryAssetOverlay'))closeMilitaryAssetDialog()
  });
  $('newAlbumButton').addEventListener('click',()=>openAlbumDialog());
  $('photosUploadButton').addEventListener('click',()=>{
   $('applePhotoFiles').value='';$('applePhotoFiles').click()
  });
  $('applePhotoFiles').addEventListener('change',()=>void uploadFiles($('applePhotoFiles').files));
  $('photosClearAlbum').addEventListener('click',()=>selectAlbum(null));
  $('photosSearch').addEventListener('input',e=>{meta.query=e.target.value.trim().toLowerCase();renderGallery()});
  $('photosSort').addEventListener('change',e=>{meta.sort=e.target.value;renderGallery()});
  for(const b of document.querySelectorAll('#photosFilters [data-photo-filter]'))b.addEventListener('click',()=>{
   meta.filter=b.dataset.photoFilter;
   if(meta.filter==='countries'){
    world.deactivate();meta.scope='network';meta.activeAlbum=null;
    if(!world.selectedCountryCodes().length)world.updateCountryCollection(['US']);
   }
   renderGallery();
  });
  setupMyCountries();
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
   // Classification is above the photo viewer; close that dialog first.
   if(!$('militaryAssetOverlay').hidden){
    if(e.key==='Escape'){e.preventDefault();closeMilitaryAssetDialog()}
    return;
   }
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
