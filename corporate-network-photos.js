/* BLACKCELL NETWORK / Apple Photos × Flickr private corporate library */
import {createWorldForces} from './corporate-world-forces.js?v=20261110-countries1';
import {createMilitaryPhotoAI} from './corporate-military-ai.js?v=20261110-learn1';
import {createPhotoTaste} from './corporate-photo-taste.js?v=20261110-trigger2';
import {createPhotoPredict} from './corporate-photo-predict.js?v=20261110-pred1';
import {createPhotoVoting} from './corporate-photo-votes.js?v=20261111-votes2';
export function setupBlackcellPhotos({client,bucket,state,toast,mediaUrl,uploadAsset,refresh,profile,openProfile,ensureSigned,switchView,personalization}){
 const $=id=>document.getElementById(id);
 const meta={albums:[],albumItems:[],favorites:[],activeAlbum:null,filter:'all',sort:'newest',query:'',
   scope:'mine',branch:'',category:'',era:'',editingAsset:null,
   viewerItems:[],viewerIndex:0,editingAlbum:null,uploading:false,renderCount:0,tastes:[],countryPages:[],countryPageId:null};
 const votes=createPhotoVoting({client,userId:()=>state.user.id,toast});
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
 const predict=createPhotoPredict({client,state,mediaUrl,toast,onCorrect:a=>taste.open(a)});
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
  await votes.load();
  await world.load();
  await taste.load();
  await loadCountryPages();
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
  if(meta.filter==='global')return [...archiveAssets()].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  if(meta.filter==='countries'){
   const codes=new Set(world.selectedCountryCodes());
   return codes.size?archiveAssets().filter(a=>a.kind==='photo'&&codes.has(String(a.military_country_code||'').toUpperCase()))
    .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)):[];
  }
  if(meta.filter==='for-you'){
   const available=sortAssets(archiveAssets());
   return personalization?.enabled()?personalization.rankAssets(taste.rank(world.rank(available))):available;
  }
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
  if(meta.filter==='countries'&&a.military_country_code)
   tile.append(make('span','country-photo-label',world.countryName(String(a.military_country_code).toUpperCase())));
  if(a.kind==='video')tile.append(make('span','apple-photo-kind','VIDEO'));
  // Votes belong to the open photo viewer, never over the gallery thumbnail.
  // Favorite and voting controls are available only after opening the full-size viewer.
  // Do not place icons or action buttons over photo thumbnails.
  // Photo preferences are edited only after opening the full-size viewer.
  // Keep thumbnails completely unobstructed (including on mouse hover).
  return tile;
 }

 async function loadCountryPages(){
  const {data,error}=await client.from('corp_social_country_collections')
   .select('id,user_id,title,country_codes,created_at,updated_at').eq('user_id',ownId())
   .order('created_at',{ascending:false}).limit(100);
  if(error){console.warn('Saved country pages unavailable',error.message);meta.countryPages=[];return}
  meta.countryPages=data||[];
  if(meta.countryPageId&&!meta.countryPages.some(x=>x.id===meta.countryPageId))meta.countryPageId=null;
  const desired=new URLSearchParams(location.search).get('collection');
  if(desired==='global'){meta.filter='global';meta.countryPageId=null;meta.scope='network'}
  else if(desired){
   const match=meta.countryPages.find(x=>x.id===desired);
   if(match){
    meta.filter='countries';meta.countryPageId=match.id;
    meta.scope='network';world.updateCountryCollection(match.country_codes);
    if($('myCountryPageName'))$('myCountryPageName').value=match.title;
   }
  }
 }
 const normalizedCountrySet=codes=>[...new Set((codes||[]).filter(x=>/^[A-Z]{2}$/.test(x)))].sort();
 const identicalSets=(a,b)=>normalizedCountrySet(a).join(',')===normalizedCountrySet(b).join(',');
 const displayCountryCodes=codes=>[...(codes||[])].sort((a,b)=>a==='US'?-1:b==='US'?1:
  world.countryName(a).localeCompare(world.countryName(b)));
 const countryShort=c=>c==='US'?'USA':world.countryName(c);
 const defaultCountryName=codes=>{
  const list=displayCountryCodes(codes);
  return list.length===1?(list[0]==='US'?'USA Military':'Military · '+world.countryName(list[0])):
   list.map(countryShort).join(' + ')+' · Hybrid';
 };
 function countryPageUrl(id){
  const url=new URL(location.href);
  url.searchParams.set('view','photos');
  url.searchParams.set('collection',id||'global');
  return url.pathname+url.search+url.hash;
 }
 function setCountryPageUrl(id){
  if(location.pathname.includes('corporate-network')){
   history.replaceState(history.state,'',countryPageUrl(id));
  }
 }
 function goToCountryPage(page){
  if(!page){location.assign('corporate-network.html?view=photos');return}
  const list=[...new Set((page.country_codes||[]).filter(x=>/^[A-Z]{2}$/.test(x)))];
  if(!list.length){toast('Select at least one country to open a separate page.');return}
  location.assign('military-country.html?countries='+encodeURIComponent(list.join(',')));
 }
 async function saveCountryPage(){
  const btn=$('myCountriesSave'),codes=normalizedCountrySet(world.selectedCountryCodes());
  if(!codes.length){toast('Select at least one country to save a separate military page.');return}
  const match=meta.countryPages.find(p=>identicalSets(p.country_codes,codes));
  if(match){goToCountryPage(match);toast('That exact country combination is already saved as a page.');return}
  const raw=$('myCountryPageName').value.trim();
  const title=(raw||defaultCountryName(codes)).slice(0,80);
  btn.disabled=true;btn.textContent='SAVING NEW PAGE…';
  try{
   const {data,error}=await client.from('corp_social_country_collections')
    .insert({user_id:ownId(),title,country_codes:codes})
    .select('id,user_id,title,country_codes,created_at,updated_at').single();
   if(error)throw error;
   meta.countryPages=[data,...meta.countryPages];
   meta.countryPageId=data.id;meta.filter='countries';
   $('myCountryPageName').value=title;
   goToCountryPage({country_codes:codes});
   toast('✓ '+title+' saved as a separate military page.');
   $('myCountriesSummary').textContent='✓ SAVED PAGE · '+title+
    '. You can create a new hybrid without replacing this page.';
  }catch(error){
   const msg=String(error?.message||error);
   toast('Could not save country page: '+msg);
   $('myCountriesSummary').textContent='Unable to save page: '+msg;
  }finally{btn.disabled=false;btn.textContent='＋ SAVE AS A NEW PAGE'}
 }
 async function deleteCountryPage(id){
  const page=meta.countryPages.find(x=>x.id===id);if(!page)return;
  if(!confirm('Delete your saved '+page.title+' page? Original photos and the Global gallery stay unchanged.'))return;
  const {error}=await client.from('corp_social_country_collections')
   .delete().eq('user_id',ownId()).eq('id',id);
  if(error){toast('Could not delete saved page: '+error.message);return}
  meta.countryPages=meta.countryPages.filter(x=>x.id!==id);
  if(meta.countryPageId===id){
   meta.countryPageId=null;$('myCountryPageName').value='';
   world.updateCountryCollection([]);setCountryPageUrl('');
  }
  renderGallery();toast('Saved country page removed. All original photographs remain.');
 }
 function setupMyCountries(){
  const chooser=$('myCountriesSelect');chooser.replaceChildren(new Option('Choose a country…',''));
  for(const item of world.browseCountries())chooser.add(new Option(item.flag+' '+item.label,item.code));
  $('myCountriesGlobal').addEventListener('click',()=>goToCountryPage(null));
  $('myCountriesUS').addEventListener('click',()=>{
   const saved=meta.countryPages.find(x=>identicalSets(x.country_codes,['US']));
   goToCountryPage(saved||{country_codes:['US']});
  });
  $('myCountriesAdd').addEventListener('click',()=>{
   const code=chooser.value;if(!code)return;
   const existing=world.selectedCountryCodes();
   if(!existing.includes(code)&&existing.length>=12){
    toast('Choose up to twelve countries per hybrid page.');return;
   }
   goToCountryPage({country_codes:[...existing,code]});chooser.value='';
  });
  $('myCountriesClear').addEventListener('click',()=>{
   world.updateCountryCollection([]);meta.countryPageId=null;
   meta.filter='countries';$('myCountryPageName').value='';setCountryPageUrl('');renderGallery();
  });
  $('myCountriesSave').addEventListener('click',()=>void saveCountryPage());
 }
 function renderSavedCountryCards(){
  const host=$('myCountryPages');host.replaceChildren();
  const items=[
   {id:null,title:'GLOBAL MILITARY LIBRARY',codes:[],kind:'global'},
   ...meta.countryPages.map(page=>({
    id:page.id,title:page.title,codes:page.country_codes||[],
    kind:page.country_codes.length>1?'hybrid':page.country_codes[0]==='US'?'usa':'nation'
   }))
  ];
  for(const entry of items){
   const card=document.createElement('article');card.className='country-page-card';card.dataset.theme=entry.kind;
   if((entry.kind==='global'&&meta.filter==='global')||(entry.id&&entry.id===meta.countryPageId))
    card.classList.add('active');
   const open=document.createElement('button');open.type='button';open.className='country-page-open';
   const flags=document.createElement('div');flags.className='country-page-card-flags';
   flags.textContent=entry.codes.length?displayCountryCodes(entry.codes).map(c=>{
    const hit=world.browseCountries().find(x=>x.code===c);return hit?.flag||'🌐'
   }).join(' '):'🌍';
   const kind=document.createElement('span');kind.className='country-page-card-type';
   kind.textContent=entry.kind==='global'?'WORLDWIDE':entry.kind==='hybrid'?'HYBRID / '+entry.codes.length+' COUNTRIES':'SINGLE NATION';
   const title=document.createElement('strong');title.textContent=entry.title;
   const count=document.createElement('small');
   const visible=archiveAssets().filter(a=>entry.kind==='global'||(a.kind==='photo'&&entry.codes.includes(String(a.military_country_code||'').toUpperCase())));
   count.textContent=visible.length+' MEDIA ITEM'+(visible.length===1?'':'S')+' · OPEN';
   open.append(flags,kind,title,count);
   open.addEventListener('click',()=>{
    goToCountryPage(entry.kind==='global'?null:meta.countryPages.find(x=>x.id===entry.id));
   });
   card.append(open);
   if(entry.id){
    const remove=document.createElement('button');remove.type='button';remove.className='country-page-delete';
    remove.textContent='×';remove.title='Delete saved page without deleting photos';
    remove.setAttribute('aria-label','Delete '+entry.title+' saved page');
    remove.addEventListener('click',()=>void deleteCountryPage(entry.id));
    card.append(remove);
   }
   host.append(card);
  }
 }
 function renderCountryPageTheme(codes){
  const panel=$('myCountriesPanel');
  const global=meta.filter==='global',single=!global&&codes.length===1;
  const usa=single&&codes[0]==='US';
  const mode=global?'global':usa?'usa':codes.length>1?'hybrid':'nation';
  panel.dataset.pageTheme=mode;
  $('photosView').dataset.countryPageTheme=mode;
  const flagFor=c=>world.browseCountries().find(x=>x.code===c)?.flag||'🌐';
  const sorted=displayCountryCodes(codes);
  const flags=global?'🌍':sorted.map(flagFor).join('  ');
  const title=global?'GLOBAL MILITARY ARCHIVE':usa?'UNITED STATES MILITARY':codes.length>1?
   'HYBRID MILITARY COLLECTION':codes.length===1?world.countryName(codes[0]).toUpperCase()+' MILITARY':'CREATE YOUR COUNTRY PAGE';
  const intro=global?'ALL NATIONS / ALL FORCES':usa?'USA / ARMED FORCES':mode==='hybrid'?
   sorted.map(countryShort).join(' × ').toUpperCase():'YOUR CUSTOM COUNTRY COLLECTION';
  const desc=global?'The worldwide Blackcell archive — authorized military photos across every classified country.':
   usa?'A dedicated American military photo collection with its own navy, silver and crimson presentation.':
   codes.length>1?'A distinct hybrid page bringing together '+sorted.map(world.countryName).join(', ')+' in one collection.':
   codes.length?'Your dedicated '+world.countryName(codes[0])+' military collection.':'Choose nations below to build a military page.';
  $('countryPageIdentity').textContent='BLACKCELL / '+intro;
  $('countryPageFlags').textContent=flags;
  $('countryPageHeadline').textContent=title+'.';
  $('countryPageSubtitle').textContent=desc;
  $('countryPageArtCaption').textContent=mode==='global'?'WORLDWIDE':usa?'USA / MILITARY':mode==='hybrid'?'HYBRID / '+codes.length+' COUNTRIES':'MILITARY';
  const visible=archiveAssets().filter(a=>global||codes.includes(String(a.military_country_code||'').toUpperCase()));
  const named=global?new Set(visible.map(a=>a.military_country_code).filter(Boolean)).size:codes.length;
  $('countryPageMetrics').textContent=visible.length+' MEDIA ITEMS  /  '+named+' '+(named===1?'COUNTRY':'COUNTRIES');
 }
 function renderMyCountries(){
  const panel=$('myCountriesPanel');if(!panel)return;
  panel.hidden=!['countries','global'].includes(meta.filter);
  if(panel.hidden){$('photosView').removeAttribute('data-country-page-theme');return}
  const codes=meta.filter==='global'?[]:world.selectedCountryCodes();
  renderCountryPageTheme(codes);renderSavedCountryCards();
  const chips=$('myCountriesChips');chips.replaceChildren();
  if(!codes.length){
   const e=document.createElement('span');e.className='country-personal-empty';
   e.textContent=meta.filter==='global'?'Global shows every authorized country. Choose a saved page or build a new one.':'Select countries to create a new independent page.';
   chips.append(e);
  }
  for(const code of codes){
   const b=document.createElement('button');b.type='button';b.textContent='🌐 '+world.countryName(code)+' ×';
   b.setAttribute('aria-label','Remove '+world.countryName(code));
   b.addEventListener('click',()=>{
    goToCountryPage({country_codes:world.selectedCountryCodes().filter(x=>x!==code)});
   });
   chips.append(b);
  }
  const existing=meta.countryPages.find(x=>identicalSets(x.country_codes,codes));
  const visible=archiveAssets().filter(a=>a.kind==='photo'&&codes.includes(String(a.military_country_code||'').toUpperCase()));
  const title=meta.filter==='global'?'GLOBAL MILITARY ARCHIVE':existing?.title||(codes.length?defaultCountryName(codes):'MY COUNTRY PAGES');
  $('myCountriesTitle').textContent=title.toUpperCase()+'.';
  $('myCountriesSummary').textContent=meta.filter==='global'?'Global page / all authorized media / select a saved page above':
   (existing?'SAVED PAGE · ':'UNSAVED COMBINATION · ')+codes.length+' countr'+(codes.length===1?'y':'ies')+
    ' · '+visible.length+' matching photo'+(visible.length===1?'':'s')+
    '. Your other saved country pages are preserved.';
 }
 /* Reuse the USA archive's optimal row-break justified layout. Tiles retain
    their original image links, ownership controls, favorites and annotations. */
 let justifiedGalleryPending=false,justifiedGalleryObserver=null;
 function scheduleJustifiedGallery(){
  if(justifiedGalleryPending)return;
  justifiedGalleryPending=true;
  requestAnimationFrame(()=>{justifiedGalleryPending=false;layoutJustifiedMedia()});
 }
 function layoutJustifiedMedia(){
  const galleries=[...document.querySelectorAll('#applePhotosGallery .apple-justified-wall')];
  if(!galleries.length)return;
  for(const holder of galleries){
   const tiles=[...holder.querySelectorAll('.apple-photo-grid-item')];
   const width=Math.floor(holder.getBoundingClientRect().width);
   if(width<90||!tiles.length)continue;
   // Force a stable vertical flex column even if browser cache serves an older
   // stylesheet. Using inline styles also prevents legacy grid/masonry rules
   // from leaking into the justified wall.
   holder.style.setProperty('display','flex','important');
   holder.style.setProperty('flex-direction','column','important');
   holder.style.setProperty('gap','0px','important');
   holder.style.setProperty('align-items','stretch','important');
   holder.style.setProperty('width','100%','important');
   holder.style.setProperty('min-width','0','important');
   const target=width<480?195:width<800?235:width<1150?275:335;
   const ratios=tiles.map(tile=>{
    const img=tile.querySelector('img.apple-photo-thumb');
    return img?.naturalWidth>0&&img?.naturalHeight>0?
     Math.max(.4,Math.min(4.5,img.naturalWidth/img.naturalHeight)):
     (tile.dataset.kind==='video'?16/9:1.35);
   });
   const n=tiles.length,prefix=[0],dp=Array(n+1).fill(Infinity),next=Array(n+1).fill(n);
   for(const ratio of ratios)prefix.push(prefix[prefix.length-1]+ratio);
   dp[n]=0;
   for(let i=n-1;i>=0;i--){
    for(let count=1;count<=Math.min(8,n-i);count++){
     const j=i+count,sum=prefix[j]-prefix[i],h=width/sum,deviation=Math.log(h/target);
     let cost=deviation*deviation;
     if(h>target*1.55)cost+=14*Math.pow(h/target-1.55,2);
     if(h<target*.65)cost+=12*Math.pow(.65-h/target,2);
     if(count===1&&n>1)cost+=50;
     const total=cost+dp[j];
     if(total<dp[i]){dp[i]=total;next[i]=j}
    }
   }
   const fragment=document.createDocumentFragment();
   for(let i=0;i<n;){
    const j=next[i]>i?next[i]:i+1,ratioSum=prefix[j]-prefix[i];
    const row=make('div','apple-justified-row');
    const full=n>1,available=width,calc=available/ratioSum;
    const h=Math.max(1,full?calc:Math.min(target,calc));
    row.style.setProperty('display','flex','important');
    row.style.setProperty('flex-direction','row','important');
    row.style.setProperty('flex-wrap','nowrap','important');
    row.style.setProperty('align-items','stretch','important');
    row.style.setProperty('position','relative','important');
    row.style.setProperty('width','100%','important');
    row.style.setProperty('min-width','0','important');
    row.style.setProperty('height',h.toFixed(2)+'px','important');
    row.style.setProperty('min-height',h.toFixed(2)+'px','important');
    row.style.setProperty('max-height',h.toFixed(2)+'px','important');
    row.style.setProperty('overflow','hidden','important');
    row.style.setProperty('margin','0','important');
    row.style.setProperty('padding','0','important');
    row.style.setProperty('gap','0','important');
    let used=0;
    for(let k=i;k<j;k++){
     const last=k===j-1;
     const cw=Math.max(1,full&&last?available-used:h*ratios[k]);
     const tile=tiles[k];
     tile.style.setProperty('position','relative','important');
     tile.style.setProperty('display','block','important');
     tile.style.setProperty('box-sizing','border-box','important');
     tile.style.setProperty('flex','0 0 '+cw.toFixed(2)+'px','important');
     tile.style.setProperty('width',cw.toFixed(2)+'px','important');
     tile.style.setProperty('min-width','0','important');
     tile.style.setProperty('max-width','none','important');
     tile.style.setProperty('height',h.toFixed(2)+'px','important');
     tile.style.setProperty('min-height','0','important');
     tile.style.setProperty('max-height',h.toFixed(2)+'px','important');
     tile.style.setProperty('aspect-ratio','auto','important');
     tile.style.setProperty('overflow','hidden','important');
     tile.style.setProperty('border','0','important');
     tile.style.setProperty('border-radius','0','important');
     tile.style.setProperty('margin','0','important');
     tile.style.setProperty('padding','0','important');
     const open=tile.querySelector('.apple-tile-open');
     if(open){
      open.style.setProperty('position','absolute','important');
      open.style.setProperty('inset','0','important');
      open.style.setProperty('display','block','important');
      open.style.setProperty('width','100%','important');
      open.style.setProperty('height','100%','important');
      open.style.setProperty('margin','0','important');
      open.style.setProperty('padding','0','important');
      open.style.setProperty('overflow','hidden','important');
      const img=open.querySelector('img.apple-photo-thumb');
      if(img){
       img.style.setProperty('position','absolute','important');
       img.style.setProperty('inset','0','important');
       img.style.setProperty('width','100%','important');
       img.style.setProperty('height','100%','important');
       img.style.setProperty('max-height','100%','important');
       img.style.setProperty('object-fit','contain','important');
       img.style.setProperty('object-position','center','important');
       img.style.setProperty('transform','none','important');
      }
     }
     row.append(tile);
     used+=cw;
    }
    fragment.append(row);
    i=j;
   }
   holder.replaceChildren(fragment);
  }
 }
 function observeJustifiedGallery(){
  const container=$('applePhotosGallery');
  if(justifiedGalleryObserver)justifiedGalleryObserver.disconnect();
  if(typeof ResizeObserver==='function'){
   justifiedGalleryObserver=new ResizeObserver(()=>scheduleJustifiedGallery());
   justifiedGalleryObserver.observe(container);
  }else window.addEventListener('resize',scheduleJustifiedGallery,{passive:true});
 }

 function renderGallery(){
  const node=$('applePhotosGallery');node.replaceChildren();
  const list=selectedAssets(),album=albumFor(meta.activeAlbum);
  taste.renderInsights(list[0],meta.filter==='for-you'&&personalization?.enabled());
  renderMyCountries();
  $('photosGalleryTitle').textContent=meta.filter==='global'?'Global Military Library · All Countries':meta.filter==='countries'
   ?'My Countries · '+(world.selectedCountryCodes().map(c=>world.countryName(c)).join(' + ')||'Select Countries')
   :meta.filter==='for-you'?'For You · Personalized Military Media'
   :world.title()||(album?album.title:(meta.scope==='mine'?'My Military Media':'Network Military Media'));
  $('photosClearAlbum').hidden=!meta.activeAlbum;
  for(const b of document.querySelectorAll('#photosFilters [data-photo-filter]'))
   b.classList.toggle('selected',b.dataset.photoFilter===meta.filter);
  if(!list.length){node.append(empty(
   meta.filter==='global'?'No global military media yet':meta.filter==='countries'?'No photographs for these countries yet':meta.filter==='favorites'?'No favorites yet':'Your gallery is ready',
   meta.filter==='global'?'All authorized photographs and videos across the Blackcell Network appear here.':meta.filter==='countries'?'Select countries above. Photographs appear once they have that country saved in their approved classification; unknown-country photos are not guessed.':meta.filter==='favorites'?'Tap a heart on a photo to add it to Favorites.':
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
   const grid=make('div','apple-photo-grid apple-justified-wall');
   for(const a of items){
    const index=list.indexOf(a);
    const tile=drawTile(a,list,index);
    tile.dataset.kind=a.kind;
    const img=tile.querySelector('img.apple-photo-thumb');
    if(img){
      if(img.complete&&img.naturalWidth)queueMicrotask(scheduleJustifiedGallery);
      else img.addEventListener('load',scheduleJustifiedGallery,{once:true});
    }
    if(meta.filter==='for-you'&&index<6&&meta.tastes.length){
     tile.append(make('div','taste-match-reason',taste.reason(a)));
    }
    grid.append(tile);
   }
   section.append(grid);node.append(section);
  }
  scheduleJustifiedGallery();
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
  const note=$('personalizationGalleryNote');
  if(note)note.hidden=!(meta.filter==='for-you'&&!personalization?.enabled());
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
  const voteSlot=$('appleViewerVoteSlot');
  if(voteSlot){voteSlot.replaceChildren();if(a.kind==='photo')voteSlot.append(votes.button(a,'bc-viewer-photo-vote'));}
  $('appleViewerPrevious').disabled=meta.viewerItems.length<=1;
  $('appleViewerNext').disabled=meta.viewerItems.length<=1;
  ai.toggleForAsset(a);
  taste.forViewer(a);
  predict.selectViewer(a);
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
  $('appleViewerDelete').hidden=!(isAdmin()&&a.purpose==='library');
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
  const a=viewerCurrent();if(!a||!isAdmin()||a.purpose!=='library')return;
  if(!confirm('Permanently delete "'+a.filename+'" from the corporate library and albums?'))return;
  try{
   // Remove from storage before deleting the metadata RLS authorization.
   const {error:removeError}=await bucket.remove([a.storage_path]);
   if(removeError)throw removeError;
   const {data:deleted,error}=await client.from('corp_social_assets').delete().eq('id',a.id).eq('purpose','library').select('id');
   if(!error&&(!deleted||deleted.length!==1))throw Error('The deletion was not authorized or the asset no longer exists.');
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
  $('wfOpenCountryGallery').addEventListener('click',()=>{
   const selection=world.selectedCountryCodes();
   goToCountryPage({country_codes:selection.length?selection:['US']});
  });
  $('mxHeroUSA')?.addEventListener('click',()=>goToCountryPage({country_codes:['US']}));
  ai.setup();
  taste.setup();
  predict.setup();
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
   if(b.dataset.photoFilter==='countries'){goToCountryPage({country_codes:world.selectedCountryCodes().length?world.selectedCountryCodes():['US']});return}
   meta.filter=b.dataset.photoFilter;
   if(meta.filter==='countries'||meta.filter==='global'){
    world.deactivate();meta.scope='network';meta.activeAlbum=null;
    if(meta.filter==='countries'&&!world.selectedCountryCodes().length)world.updateCountryCollection(['US']);
    if(meta.filter==='countries')meta.countryPageId=null;
   }
   renderGallery();
  });
  setupMyCountries();
  observeJustifiedGallery();
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
 },selectAlbum,getCurrentPhoto:()=>viewerCurrent(),getCountryCodes:()=>world.selectedCountryCodes()};
}
