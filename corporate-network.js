import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261112-access2';
import {setupBlackcellPhotos} from './corporate-network-photos.js?v=20261112-speed2';
import {setupBlackcellStorageStatus} from './corporate-storage-status.js?v=20261111-storage1';
import {mountMilitaryGunner} from './military-gunner.js?v=20261110-fast4';
import {createNetworkPersonalization} from './corporate-network-personalization.js?v=20261112-themes5';
import {createPhotoRediscovery} from './corporate-photo-rediscovery.js?v=20261111-mediareset1';
import {createVisualDiscovery} from './corporate-visual-discovery.js?v=20261111-mediareset1';
import {createPhotoDedupe} from './corporate-photo-dedupe.js?v=20261111-phonecheck2';
import {createBlackcellVideoChannel} from './corporate-network-videos.js?v=20261113-10gbposter7';
const client=corporateClient(),bucket=client.storage.from('corp-social-media');
const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedTypes=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','video/mp4','video/webm','video/quicktime','video/x-m4v']);
const state={
 user:null,member:null,profiles:[],posts:[],assets:[],streamVideos:[],likes:[],comments:[],follows:[],
 assetUrls:new Map(),posterUrls:new Map(),view:'feed',feedFilter:'latest',profileUserId:null,profileTab:'posts',
 attached:[],openComments:new Set(),busy:false,sort:'newest',deepPost:null,
 chatPeers:[],signedAt:0,profilePreview:false,profilePostFilter:'all',profilePostGrid:false,profileFriendsMode:'following',profileFriendsQuery:''
};
const fields=['feedView','profileView','discoverView','videosView','photosView'];
let gunnerDock=null;
function el(tag,cls='',content=null){
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(content!==null)n.textContent=String(content);
 return n;
}
function btn(title,fn,cls=''){
 const b=el('button',cls,title);b.type='button';b.addEventListener('click',fn);return b;
}
function date(t){try{return new Date(t).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}catch(_){return ''}}
function stamp(t){try{return new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}catch(_){return ''}}
function prettyBytes(n){return n>=1073741824?(n/1073741824).toFixed(2)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB'}
function fail(e){return String(e?.message||e||'Unknown error').slice(0,220)}
let toastTimeout=0;
function toast(s){
 clearTimeout(toastTimeout);$('toast').textContent=s;$('toast').hidden=false;
 toastTimeout=setTimeout(()=>$('toast').hidden=true,6000);
}
function profile(id){return state.profiles.find(p=>p.user_id===id)||null}
function personName(p){return p?.display_name||'Blackcell Member'}
function personHandle(p){return '@'+(p?.username||'network')}
function asset(id){return state.assets.find(a=>a.id===id)}
function mediaUrl(a){return state.assetUrls.get(typeof a==='string'?a:a?.id)||''}
function posterUrl(a){return state.posterUrls.get(typeof a==='string'?a:a?.id)||''}
function avatar(p,size='med'){
 const v=el('div','avatar '+size,(personName(p).trim()[0]||'B').toUpperCase());
 const a=asset(p?.avatar_asset_id),src=mediaUrl(a);
 if(src){const i=el('img');i.src=src;i.alt=personName(p)+' profile photo';i.loading='lazy';v.replaceChildren(i)}
 return v;
}
function cover(node,p){
 node.style.removeProperty('background-image');
 const src=mediaUrl(asset(p?.cover_asset_id));
 if(node.id==='profileCover')node.classList.toggle('bc-custom-member-cover',Boolean(src));
 if(src){
  const image='linear-gradient(to top,rgba(8,9,14,.75),rgba(9,10,15,.08) 65%),url("'+src.replace(/["\\]/g,'')+'")';
  // The new premium profile stylesheet has a strong fallback image.
  // An explicitly uploaded member cover must always override the fallback.
  node.style.setProperty('background-image',image,node.id==='profileCover'?'important':'');
 }
}
function myProfile(){return profile(state.user?.id)}
function following(id){return state.follows.some(f=>f.follower_id===state.user.id&&f.following_id===id)}
function liking(id){return state.likes.some(l=>l.post_id===id&&l.user_id===state.user.id)}
const sharedMedia=a=>a?.review_status==='approved'&&a?.adult_restricted!==true;
function postedAssets(id){return state.assets.filter(a=>a.post_id===id&&a.purpose==='post'&&sharedMedia(a))}
function countPosts(id){return state.posts.filter(p=>p.author_id===id).length}
function countVideos(id){return state.assets.filter(a=>a.owner_id===id&&a.kind==='video'&&a.purpose==='post'&&sharedMedia(a)).length}
/* An expandable, keyboard-accessible section menu avoids scrolling through
   the long Military Library. It never alters member uploads or permissions. */
function setLibraryMenuExpanded(expanded){
 const submenu=$('librarySubmenu'),toggle=$('libraryDisclosure');
 if(!submenu||!toggle)return;
 submenu.hidden=!expanded;
 toggle.setAttribute('aria-expanded',String(expanded));
 toggle.setAttribute('aria-label',(expanded?'Collapse':'Expand')+' Military Library menu');
}
function syncLibraryMenu(view){
 const isLibrary=view==='photos';
 document.body.classList.toggle('bc-in-library',isLibrary);
 if(isLibrary)setLibraryMenuExpanded(true);
 else setLibraryMenuExpanded(false);
}
function jumpToMilitarySection(button){
 const targetId=button.dataset.libraryJump;
 if(!targetId)return;
 if(state.view!=='photos')switchView('photos');
 const filter=button.dataset.libraryFilter;
 if(filter){
  document.querySelector('#photosFilters [data-photo-filter="'+filter+'"]')?.click();
 }
 if(targetId==='militaryUploadSettings')$('militaryUploadSettings').open=true;
 document.querySelectorAll('#librarySubmenu button[data-library-jump]').forEach(x=>{
  x.classList.toggle('is-current',x===button);
  if(x===button)x.setAttribute('aria-current','location');
  else x.removeAttribute('aria-current');
 });
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const target=$(targetId);
  if(target){target.scrollIntoView({behavior:'smooth',block:'start'});}
  const focus=button.dataset.libraryFocus;
  if(focus){
   const input=$(focus);
   if(input)input.focus({preventScroll:true});
  }
 }));
}
function setupLibraryMenu(){
 const toggle=$('libraryDisclosure'),open=$('librarySubmenu');
 if(!toggle||!open)return;
 toggle.addEventListener('click',()=>setLibraryMenuExpanded(open.hidden));
 open.querySelectorAll('button[data-library-jump]').forEach(button=>
  button.addEventListener('click',()=>jumpToMilitarySection(button)));
 const nav=document.querySelector('.bc-library-open');
 nav?.addEventListener('click',()=>setLibraryMenuExpanded(true));
 syncLibraryMenu(state.view);
}

function switchView(view,{who=null,tab=null,keepPost=false}={}){
 if(!fields.includes(view+'View'))view='feed';
 if(!keepPost)state.deepPost=null;
 if(Date.now()-state.signedAt>25*60*1000){
  state.assetUrls.clear();void loadSigned().then(renderAll).catch(()=>{});
 }
 state.view=view;
 if(view!=='videos')videoChannel.close();
 document.body.classList.toggle('bc-video-mode',view==='videos');
 state.profilePreview=false;
 document.body.classList.toggle('bc-profile-mode',view==='profile');
 document.body.classList.remove('bc-profile-view-as');
 syncLibraryMenu(view);
 gunnerDock?.setVisible(view==='photos');
 if(view==='profile'){
  state.profileUserId=who||state.user.id;
  if(tab)state.profileTab=tab;
 }
 for(const f of fields)$(f).hidden=f!==view+'View';
 // Keep the original, fully wired Network composer on the active page.
 syncProfileComposer();
 document.querySelectorAll('[data-view]').forEach(n=>{
  n.classList.toggle('nav-active',n.dataset.view===view&&n.closest('.mainnav')!==null);
  n.classList.toggle('selected',n.dataset.view===view&&n.closest('.nav-panel')!==null);
 });
 if(view==='feed')renderFeed();
 if(view==='profile')renderProfile();
 if(view==='discover')renderDirectory();
 if(view==='videos')renderVideos();
 if(view==='photos'){photos.render();void storageStatus.refresh()}
 const params=new URLSearchParams();
 if(view==='profile'){
  params.set('view','profile');
  if(state.profileUserId!==state.user.id)params.set('user',state.profileUserId);
 }
 if(view==='videos'||view==='discover'||view==='photos')params.set('view',view);
 history.replaceState(null,'',location.pathname+(params.toString()?'?'+params.toString():''));
 window.scrollTo({top:0,behavior:'smooth'});
}
function openProfile(uid,tab='posts'){
 switchView('profile',{who:uid,tab});
}
async function loadAll({show=true}={}){
 const [pr,po,as,fo,stream]=await Promise.all([
  client.from('corp_social_profiles').select('*').order('display_name',{ascending:true}).limit(500),
  client.from('corp_social_posts').select('*').order('created_at',{ascending:false}).limit(120),
  client.from('corp_social_assets').select('*').order('created_at',{ascending:false}).limit(1000),
  client.from('corp_social_follows').select('follower_id,following_id').limit(2000),
  client.from('corp_stream_videos').select('*').order('created_at',{ascending:false}).limit(600)
 ]);
 for(const r of [pr,po,as,fo,stream])if(r.error)throw Error('Network data could not be read: '+r.error.message);
 state.profiles=pr.data||[];state.posts=po.data||[];
 state.assets=as.data||[];state.follows=fo.data||[];
 state.streamVideos=(stream.data||[]).map(a=>({...a,
  kind:'video',purpose:'post',filename:a.filename,video_poster_path:a.poster_path,
  bunny_stream:true
 }));
 if(!profile(state.user.id)){
  const {error}=await client.from('corp_social_profiles').insert({user_id:state.user.id,display_name:state.member.display_name,username:state.member.username||'network'});
  if(error)throw Error('Could not create your verified network profile: '+error.message);
  const {data,error:rerun}=await client.from('corp_social_profiles').select('*').order('display_name');
  if(rerun)throw Error(rerun.message);
  state.profiles=data||[];
 }
 const postIds=state.posts.map(p=>p.id);
 if(postIds.length){
  const [lr,cr]=await Promise.all([
   client.from('corp_social_likes').select('post_id,user_id').in('post_id',postIds).limit(1500),
   client.from('corp_social_comments').select('id,post_id,user_id,body,created_at').in('post_id',postIds).order('created_at',{ascending:true}).limit(1500)
  ]);
  if(lr.error||cr.error)throw Error('Could not load network interactions.');
  state.likes=lr.data||[];state.comments=cr.data||[];
 }else{state.likes=[];state.comments=[]}
 // Media signing and library metadata do not depend on each other.
 // Start both together so the photo wall opens sooner on mobile.
 await Promise.all([loadSigned(),photos.loadData()]);
 if(show)renderAll();
}
async function loadSigned(){
 if(Date.now()-state.signedAt>25*60*1000){state.assetUrls.clear();state.posterUrls.clear();state.signedAt=Date.now()}
 const all=state.assets.filter(a=>!state.assetUrls.has(a.id));
 // Avoid a serial waterfall of 30-file signing batches while keeping the
 // number of concurrent private Storage requests bounded.
 let offset=0;
 const signNext=async()=>{
  while(offset<all.length){
   const start=offset;offset+=30;
   const group=all.slice(start,start+30);
   const {data,error}=await bucket.createSignedUrls(group.map(a=>a.storage_path),1800);
   if(error)continue;
   for(let j=0;j<group.length;j++)if(data?.[j]?.signedUrl)state.assetUrls.set(group[j].id,data[j].signedUrl);
  }
 };
 await Promise.all(Array.from({length:Math.min(4,Math.ceil(all.length/30))},signNext));
 // Poster images stay in the existing private Supabase bucket, not Bunny public URLs.
 const covers=[...state.assets,...state.streamVideos].filter(a=>a.video_poster_path&&!state.posterUrls.has(a.id));
 let coverOffset=0;
 const signCovers=async()=>{
  while(coverOffset<covers.length){
   const from=coverOffset;coverOffset+=25;const group=covers.slice(from,from+25);
   const {data,error}=await bucket.createSignedUrls(group.map(a=>a.video_poster_path),1800);
   if(error)continue;
   for(let j=0;j<group.length;j++)if(data?.[j]?.signedUrl)state.posterUrls.set(group[j].id,data[j].signedUrl);
  }
 };
 await Promise.all(Array.from({length:Math.min(3,Math.ceil(covers.length/25))},signCovers));
}
function renderAll(){
 renderMini();renderSuggestions();
 if(state.view==='profile')renderProfile();
 if(state.view==='feed')renderFeed();
 if(state.view==='discover')renderDirectory();
 if(state.view==='videos')renderVideos();
 if(state.view==='photos')photos.render();
}
function renderMini(){
 const p=myProfile(),node=$('myMini');
 node.replaceChildren();
 node.append(avatar(p,'med'));
 const d=el('div');
 d.append(el('strong','',personName(p)),el('small','',personHandle(p)));
 d.append(btn('OPEN MY PROFILE ↗',()=>openProfile(state.user.id)));
 node.append(d);
 $('composerName').textContent=personName(p);
 $('composerAvatar').replaceWith(avatar(p,'med'));
 $('composerAvatar')?.removeAttribute('id');
 const a=document.querySelector('.composer-top .avatar');if(a)a.id='composerAvatar';
}
function renderSuggestions(){
 const node=$('suggestedPeople');node.replaceChildren();
 const suggestions=state.profiles.filter(p=>p.user_id!==state.user.id)
  .sort((a,b)=>Number(following(a.user_id))-Number(following(b.user_id))).slice(0,5);
 if(!suggestions.length){node.append(el('p','empty-state','No other network profiles yet.'));return}
 for(const p of suggestions){
  const row=el('div','suggested-person');
  const small=avatar(p,'small');small.style.cursor='pointer';
  small.addEventListener('click',()=>openProfile(p.user_id));
  const info=el('div');info.append(el('strong','',personName(p)),el('small','',personHandle(p)));
  const f=btn(following(p.user_id)?'✓':'＋',()=>void toggleFollow(p.user_id));
  f.setAttribute('aria-label',following(p.user_id)?'Unfollow '+personName(p):'Follow '+personName(p));
  row.append(small,info,f);node.append(row);
 }
}
function renderDirectory(){
 const box=$('peopleDirectory');
 const query=$('peopleSearch').value.trim().toLowerCase();
 const people=state.profiles.filter(p=>(personName(p)+' '+p.username+' '+p.headline).toLowerCase().includes(query));
 box.replaceChildren();
 if(!people.length){box.append(empty('No matching members','Try searching by another name or username.'));return}
 for(const p of people){
  const card=el('article','panel person');
  const banner=el('div','person-banner');cover(banner,p);
  const body=el('div','person-body');
  body.append(avatar(p,'med'),el('h3','',personName(p)),el('small','',personHandle(p)),
    el('p','',p.headline||'Verified Blackcell Network member.'));
  const actions=el('div','person-actions');
  actions.append(btn('VIEW PROFILE',()=>openProfile(p.user_id),'person-open'));
  if(p.user_id!==state.user.id)actions.append(btn(following(p.user_id)?'FOLLOWING':'＋ FOLLOW',()=>void toggleFollow(p.user_id)));
  body.append(actions);card.append(banner,body);box.append(card);
 }
}
function empty(title,detail){
 const n=el('div','panel empty-state');
 n.append(el('strong','',title),el('span','',detail));return n;
}
/* Move—not duplicate—the existing post composer. This preserves file inputs,
   upload progress, validation, duplicate checks, and Supabase publishing. */
function syncProfileComposer(){
 const feedAnchor=$('networkFeedComposerAnchor');
 const mount=$('profileTimelineComposer');
 const composer=$('postBody')?.closest('.composer');
 if(!feedAnchor||!mount||!composer)return;
 const onOwnPosts=state.view==='profile'
  &&state.profileUserId===state.user?.id
  &&state.profileTab==='posts'&&!state.profilePreview;
 if(onOwnPosts){
  mount.hidden=false;
  if(composer.parentElement!==mount)mount.append(composer);
  composer.classList.add('bc-fb-live-composer');
 }else{
  mount.hidden=true;
  if(composer.previousElementSibling!==feedAnchor)feedAnchor.after(composer);
  composer.classList.remove('bc-fb-live-composer');
 }
}
function renderProfileSidePreviews(p){
 const pictures=$('profilePhotoPreview');
 if(pictures){
  pictures.replaceChildren();
  const media=state.assets.filter(a=>a.owner_id===p.user_id
    &&a.kind==='photo'&&sharedMedia(a)
    &&a.purpose!=='avatar'&&a.purpose!=='cover')
    .filter(a=>Boolean(mediaUrl(a))).slice(0,6);
  if(!media.length){
   pictures.append(el('p','bc-fb-no-preview','No shared photos yet.'));
  }else{
   for(const asset of media){
    const img=el('img');img.src=mediaUrl(asset);
    img.alt=asset.filename||'Shared photo';img.loading='lazy';
    const open=btn('',()=>{void photos.openAsset(asset)});
    open.className='bc-fb-photo-thumb';
    open.setAttribute('aria-label','Open '+(asset.filename||'photo'));
    open.append(img);pictures.append(open);
   }
  }
 }
 const following=$('profileFollowingPreview');
 if(following){
  following.replaceChildren();
  const ids=state.follows.filter(f=>f.follower_id===p.user_id)
   .map(f=>f.following_id).slice(0,5);
  const matches=ids.map(id=>profile(id)).filter(Boolean);
  if(!matches.length){
   following.append(el('p','bc-fb-no-preview','No followed members yet.'));
  }else{
   for(const person of matches){
    const row=btn('',()=>openProfile(person.user_id));
    row.className='bc-fb-follow-item';
    row.append(avatar(person,'small'));
    const label=el('span','bc-fb-follow-label');
    label.append(el('strong','',personName(person)),
      el('small','',personHandle(person)));
    row.append(label);following.append(row);
   }
  }
 }
}
function focusProfileComposer(){
 if(state.profileUserId!==state.user?.id)return;
 if(state.profileTab!=='posts'){state.profileTab='posts';renderProfile();}
 const input=$('postBody');
 if(input){input.scrollIntoView({behavior:'smooth',block:'center'});input.focus({preventScroll:true})}
}
function renderSecurityHighlights(p){
 const container=$('profileHighlightsPreview');
 if(!container)return;
 container.replaceChildren();
 const items=state.assets.filter(a=>a.owner_id===p.user_id&&a.kind==='photo'
  &&sharedMedia(a)&&Boolean(mediaUrl(a))).slice(0,4);
 if(!items.length){
  container.append(el('p','bc-security-empty-preview','Highlights appear after approved photos are shared.'));
  return;
 }
 for(const a of items){
  const item=btn('',()=>{void photos.openAsset(a)});
  item.className='bc-security-highlight';
  item.setAttribute('aria-label','View '+(a.filename||'highlight'));
  const img=el('img');img.src=mediaUrl(a);img.alt=a.filename||'Member highlight';img.loading='lazy';
  item.append(img);container.append(item);
 }
}
function renderProfileFriends(p){
 const box=el('section','bc-security-directory');
 const heading=el('div','bc-security-directory-head');
 heading.append(el('h3','','Network Connections'));
 const input=el('input','bc-security-friend-search');
 input.type='search';input.maxLength=80;
 input.placeholder='Search members you follow…';
 input.value=state.profileFriendsQuery;
 input.setAttribute('aria-label','Search connections');
 heading.append(input);box.append(heading);
 const tabs=el('div','bc-security-directory-tabs');
 const list=el('div','bc-security-friend-grid');
 function paint(){
  list.replaceChildren();
  const ids=state.follows
   .filter(f=>state.profileFriendsMode==='following'?f.follower_id===p.user_id:f.following_id===p.user_id)
   .map(f=>state.profileFriendsMode==='following'?f.following_id:f.follower_id);
  const people=ids.map(id=>profile(id)).filter(Boolean)
   .filter(member=>(personName(member)+' '+personHandle(member)).toLowerCase()
       .includes(state.profileFriendsQuery.toLowerCase()));
  if(!people.length){
   list.append(el('div','bc-security-empty-preview',
      ids.length?'No members match this search.':'No '+state.profileFriendsMode+' connections to show yet.'));
  }else for(const person of people){
   const row=btn('',()=>openProfile(person.user_id));
   row.className='bc-security-friend-card';
   row.append(avatar(person,'med'));
   const label=el('span');
   label.append(el('strong','',personName(person)),el('small','',personHandle(person)));
   row.append(label);
   list.append(row);
  }
 }
 for(const [value,label] of [['following','Following'],['followers','Followers']]){
  const button=btn(label,()=>{
   state.profileFriendsMode=value;
   for(const item of tabs.querySelectorAll('button'))
    item.setAttribute('aria-selected',String(item.dataset.mode===value));
   paint();
  });
  button.dataset.mode=value;button.setAttribute('aria-selected',String(value===state.profileFriendsMode));
  tabs.append(button);
 }
 input.addEventListener('input',()=>{
  state.profileFriendsQuery=input.value.trim().slice(0,80);
  paint();
 });
 box.append(tabs,list);
 const discover=btn('＋ DISCOVER VERIFIED MEMBERS',()=>switchView('discover'),'bc-security-button');
 box.append(discover);paint();return box;
}
function renderProfileAbout(p,isMine){
 const wrap=el('section','bc-security-about');
 const nav=el('nav','bc-security-about-nav');
 nav.setAttribute('aria-label','About categories');
 const detail=el('div','bc-security-about-detail');
 const sections=[
  {id:'intro',title:'Introduction',sub:'Information provided by this member',
   rows:[['Biography',p.bio?.trim()||'Not provided'],
         ['Headline',p.headline?.trim()||'Not provided']]},
  {id:'network',title:'Network Identity',sub:'Verified BLACKCELL member information',
   rows:[['Name',personName(p)],['Username',personHandle(p)],
         ['Joined',date(p.created_at)],['Account access',
          isMine?'Level '+state.member.clearance_level:'Verified member']]},
  {id:'activity',title:'Activity Summary',sub:'Actual member activity recorded in the Network',
   rows:[['Posts',String(countPosts(p.user_id))],
         ['Followers',String(state.follows.filter(f=>f.following_id===p.user_id).length)],
         ['Following',String(state.follows.filter(f=>f.follower_id===p.user_id).length)],
         ['Videos',String(countVideos(p.user_id))]]}
 ];
 function display(section){
  detail.replaceChildren();
  detail.append(el('div','bc-security-section-kicker','PERSONNEL / '+section.id.toUpperCase()));
  detail.append(el('h3','',section.title),el('p','bc-security-about-sub',section.sub));
  for(const [label,value] of section.rows){
   const row=el('div','bc-security-about-row');
   row.append(el('span','',label),el('strong','',value));
   detail.append(row);
  }
  if(isMine&&section.id==='intro')
   detail.append(btn('✎ EDIT BIO & HEADLINE',openEdit,'bc-security-button'));
 }
 for(const section of sections){
  const b=btn(section.title,()=>{
   for(const other of nav.querySelectorAll('button'))
    other.setAttribute('aria-selected',String(other===b));
   display(section);
  });
  b.setAttribute('aria-selected',String(section===sections[0]));
  nav.append(b);
 }
 display(sections[0]);wrap.append(nav,detail);return wrap;
}
function renderProfileGroups(){
 const wrap=el('section','bc-security-group-panel');
 wrap.append(el('div','bc-security-section-kicker','BLACKCELL / COMMUNITY ACCESS'));
 wrap.append(el('h3','','Groups & Uniform Communities'));
 wrap.append(el('p','',
  'Group membership features are not yet connected. Explore the existing BLACKCELL collections below; no group memberships or member counts are invented.'));
 const links=[
  ['MAN’S ARMED FORCES','All uniformed professions','mans-armed-forces.html'],
  ['USA UNIFORMS','United States division','usa-page.html'],
  ['MILITARY LIBRARY','Approved shared media and collections','corporate-network.html?view=photos']
 ];
 const grid=el('div','bc-security-community-grid');
 for(const [name,description,href] of links){
  const a=el('a','bc-security-community');
  a.href=href;a.append(el('strong','',name),el('small','',description),el('span','','VIEW COLLECTION ↗'));
  grid.append(a);
 }
 wrap.append(grid);return wrap;
}
function renderProfile(){
 const p=profile(state.profileUserId)||myProfile();
 if(!p)return;
 state.profileUserId=p.user_id;
 const av=avatar(p,'gigantic');av.id='profileAvatar';
 $('profileAvatar').replaceWith(av);
 $('profileName').textContent=personName(p);
 $('profileHandle').textContent=personHandle(p);
 $('profileHeadline').textContent=p.headline||'Verified Blackcell Network member';
 $('profileLevel').textContent=p.user_id===state.user.id&&!state.profilePreview
   ?'MY ACCOUNT · LEVEL '+state.member.clearance_level
   :'VERIFIED NETWORK MEMBER';
 $('profileJoined').textContent='JOINED '+date(p.created_at).toUpperCase();
 $('profilePostCount').textContent=countPosts(p.user_id);
 $('profileFollowerCount').textContent=state.follows.filter(f=>f.following_id===p.user_id).length;
 $('profileFollowingCount').textContent=state.follows.filter(f=>f.follower_id===p.user_id).length;
 $('profileVideoCount').textContent=countVideos(p.user_id);
 const isMine=p.user_id===state.user.id&&!state.profilePreview;
 const isOwnProfile=p.user_id===state.user.id;
 const isPreview=isOwnProfile&&state.profilePreview;
 document.body.classList.toggle('bc-profile-view-as',isPreview);
 $('profileViewAs').hidden=!isOwnProfile||isPreview;
 $('profileThemeQuick').hidden=!isMine;
 $('profileViewAsNotice').hidden=!isPreview;
 $('profileServiceFocusPanel').hidden=!isMine;
 $('profileServiceFocusLabel').textContent=personalization.enabled()?personalization.focusLabel(personalization.serviceFocus()):'All uniforms';
 $('profilePageTitle').textContent=isPreview?personName(p)+' · Member View':isMine?'My Profile.':personName(p)+' · Profile';
 $('profileAboutSummary').textContent=p.bio?.trim()||(
   isMine?'Introduce yourself with a short biography, interests, and what you share with the Network.'
         :'This member has not added an introduction yet.');
 $('profileAsideJoined').textContent=date(p.created_at);
 $('profileAsideRole').textContent=isMine?'LEVEL '+state.member.clearance_level:'VERIFIED MEMBER';
 $('profilePersonalIdentity').textContent=personName(p);
 $('profilePersonalJoined').textContent=date(p.created_at);
 $('profilePersonalClearance').textContent=isMine?'LEVEL '+state.member.clearance_level:'VERIFIED MEMBER';
 $('profileEditDetails').hidden=!isMine;
 $('profileGettingStarted').hidden=!isMine;
 if(isMine){
   const completed=[!!p.avatar_asset_id,!!p.headline?.trim(),!!p.bio?.trim()];
   const steps=completed.filter(Boolean).length;
   $('profileSetupProgress').style.width=(steps/3*100)+'%';
   $('profileSetupNote').textContent=steps===3?'All three profile details are complete.':steps+' of 3 details complete · Photo, headline and bio';
   $('profileGettingStarted').querySelector('h3').textContent=steps===3?'Your profile is complete':'Make it yours';
   $('profileGettingStarted').hidden=steps===3;
 }
 renderProfileSidePreviews(p);
 renderSecurityHighlights(p);
 const tabCopy={
  posts:['Network Timeline','Updates shared with verified BLACKCELL members.'],
  photos:['Photo Archive','Approved photographs shared by this member.'],
  videos:['Reels & Videos','Videos shared in the BLACKCELL Network.'],
  albums:['Albums','Organized photo collections.'],
  about:['About','Personal introduction and verified account details.'],
  friends:['Friends & Following','Real network connections and verified members.'],
  groups:['Groups & Communities','Existing BLACKCELL collections and community information.']
 };
 const sectionInfo=tabCopy[state.profileTab]||tabCopy.posts;
 $('profileSectionTitle').textContent=sectionInfo[0];
 $('profileSectionIntro').textContent=sectionInfo[1];
 const actions=$('profileActions');actions.replaceChildren();
 if(isMine){
  actions.append(btn('＋ CREATE POST',focusProfileComposer,'bc-security-create-post'));
  actions.append(btn('✎ EDIT PROFILE',openEdit,'bc-security-edit-profile'));
 }
 else if(!isOwnProfile){
  actions.append(btn(following(p.user_id)?'✓ FOLLOWING':'+ FOLLOW',()=>void toggleFollow(p.user_id)));
  if(state.chatPeers.some(x=>x.user_id===p.user_id)){
   const directChat=btn('OPEN CHAT ↗',()=>window.dispatchEvent(new CustomEvent('blackcell-open-imessage',{detail:{peerId:p.user_id}})),'secondary');
   actions.append(directChat);
  }
 }
 document.querySelectorAll('#profileTabs [data-tab]').forEach(b=>{
  b.classList.toggle('selected',b.dataset.tab===state.profileTab);
  b.setAttribute('aria-current',b.dataset.tab===state.profileTab?'page':'false');
 });
 const more=$('profileMoreDropdown');
 if(more)more.classList.toggle('selected',['albums','groups'].includes(state.profileTab));
 $('profilePostControls').hidden=state.profileTab!=='posts';
 $('profilePostLayout').textContent=state.profilePostGrid?'☷ LIST VIEW':'▦ GRID VIEW';
 $('profilePostLayout').setAttribute('aria-pressed',String(state.profilePostGrid));
 syncProfileComposer();
 const box=$('profileContent');box.replaceChildren();
 box.classList.toggle('bc-security-post-grid',state.profileTab==='posts'&&state.profilePostGrid);
 if(state.profileTab==='about'){
  box.append(renderProfileAbout(p,isMine));return;
 }
 if(state.profileTab==='friends'){
  box.append(renderProfileFriends(p));return;
 }
 if(state.profileTab==='groups'){
  box.append(renderProfileGroups());return;
 }
 if(state.profileTab==='posts'){
  const posts=state.posts.filter(x=>{
   if(x.author_id!==p.user_id)return false;
   const filter=state.profilePostFilter;
   if(filter==='all')return true;
   const posted=postedAssets(x.id);
   if(filter==='photos')return posted.some(a=>a.kind==='photo');
   if(filter==='videos')return posted.some(a=>a.kind==='video');
   if(filter==='text')return !posted.length;
   return true;
  });
  if(!posts.length){
   const emptyState=el('section','bc-profile-empty-state');
   const symbol=el('div','bc-profile-empty-symbol','▤');
   const title=el('h3','',state.profilePostFilter!=='all'?'No matching posts':isMine?'Your story starts here':'No posts shared yet');
   const body=el('p','',isMine
     ?'Share an introduction, a photograph, or an update with your Network. You control what you post.'
     :'Updates shared by this member will appear here.');
   emptyState.append(symbol,title,body);
   if(isMine){
    const actions=el('div','bc-profile-empty-actions');
    actions.append(btn('＋ CREATE YOUR FIRST POST',()=>{
      const composer=$('postBody');
      if(composer){
       composer.scrollIntoView({behavior:'smooth',block:'center'});
       composer.focus({preventScroll:true});
      }
    },'bc-profile-primary'));
    actions.append(btn('✎ COMPLETE YOUR PROFILE',openEdit,'bc-profile-secondary'));
    emptyState.append(actions);
   }
   box.append(emptyState);
  }else for(const post of posts)box.append(renderPost(post));
  return;
 }
 if(state.profileTab==='albums'){
  box.append(photos.renderProfileAlbums(p.user_id));return;
 }
 if(state.profileTab==='photos'||state.profileTab==='videos'){
  box.append(photos.renderProfilePhotos(p.user_id,state.profileTab==='videos'?'video':'photo'));return;
 }
 const media=state.assets.filter(a=>sharedMedia(a)&&a.owner_id===p.user_id&&a.purpose==='post'&&
    a.kind===(state.profileTab==='videos'?'video':'photo'));
 const grid=el('div',state.profileTab==='videos'?'video-grid':'directory-grid');
 if(!media.length){box.append(empty('Nothing here yet',state.profileTab==='videos'?'This member has not shared any videos.':'This member has not shared photos.'));return}
 for(const a of media){
  if(a.kind==='video')grid.append(videoTile(a));
  else{
   const card=el('div','panel person');const url=mediaUrl(a);
   if(url){
    const b=btn('',()=>window.open(url,'_blank','noopener'));
    b.style.cssText='display:block;width:100%;height:180px;border:0;background:#09080b;padding:0;overflow:hidden';
    const img=el('img');img.src=url;img.alt=a.filename;img.style.cssText='width:100%;height:100%;object-fit:cover';
    b.append(img);card.append(b);
   }
   const cap=el('div','video-card-footer');
   cap.append(el('strong','',a.filename),btn('VIEW ORIGINAL ↗',()=>openMedia(a)));
   card.append(cap);grid.append(card);
  }
 }
 box.append(grid);
}
function postType(p){
 if(p.kind==='video')return 'VIDEO';
 if(p.kind==='photo')return 'PHOTO';
 return 'UPDATE';
}
function renderPost(p){
 const node=el('article','panel post');node.id='post-'+p.id;
 const person=profile(p.author_id);
 const head=el('div','post-head');
 const pic=avatar(person,'small');
 pic.style.cursor='pointer';pic.addEventListener('click',()=>openProfile(p.author_id));
 const title=el('div','post-author');
 const name=btn(personName(person),()=>openProfile(p.author_id));
 title.append(name,el('small','',personHandle(person)+' · '+stamp(p.created_at)));
 head.append(pic,title,el('span','post-label',postType(p)));
 node.append(head);
 if(p.body)node.append(el('div','post-body',p.body));
 const files=postedAssets(p.id);
 if(files.length){
  const wrap=el('div','post-media post-media-original'+(files.length===2?' two':files.length>=3?' three':''));
  for(const f of files.slice(0,6)){
   const src=mediaUrl(f);if(!src)continue;
   if(f.kind==='video'){
    const v=el('video');v.src=src;v.controls=true;v.preload='metadata';v.playsInline=true;
    v.classList.add('post-media-original-video');
    v.setAttribute('aria-label',f.filename);
    // No fixed-height poster: render the entire original video frame.
    v.style.setProperty('width','100%','important');
    v.style.setProperty('height','auto','important');
    v.style.setProperty('max-height','none','important');
    v.style.setProperty('object-fit','contain','important');
    wrap.append(v);
   }else{
    const link=btn('',()=>void photos.openAsset(f));
    link.classList.add('post-media-original-open');
    // The old feed set a fixed 150–220px button height and cropped images.
    // Force natural image proportions at the element level on all devices.
    link.style.setProperty('height','auto','important');
    link.style.setProperty('min-height','0','important');
    link.style.setProperty('aspect-ratio','auto','important');
    const img=el('img');img.src=src;img.alt=f.filename;img.loading='lazy';
    img.classList.add('post-media-original-photo');
    img.style.setProperty('display','block','important');
    img.style.setProperty('width','100%','important');
    img.style.setProperty('height','auto','important');
    img.style.setProperty('max-height','none','important');
    img.style.setProperty('object-fit','contain','important');
    img.style.setProperty('object-position','center','important');
    img.style.setProperty('transform','none','important');
    link.title='Open the full original photo';
    link.append(img);wrap.append(link);
   }
  }
  node.append(wrap);
 }
 const actions=el('div','post-actions');
 const likeCount=state.likes.filter(l=>l.post_id===p.id).length;
 const like=btn((liking(p.id)?'♥':'♡')+' '+likeCount,()=>void toggleLike(p.id));
 like.classList.toggle('liked',liking(p.id));
 like.setAttribute('aria-label',liking(p.id)?'Unlike post':'Like post');
 const replies=btn('◌  '+state.comments.filter(c=>c.post_id===p.id).length+' COMMENTS',()=>{
  if(state.openComments.has(p.id))state.openComments.delete(p.id);
  else state.openComments.add(p.id);
  renderAll();
 });
 const share=btn('↗  COPY LINK',()=>void copyPostLink(p.id));
 actions.append(like,replies,share);
 if(p.author_id===state.user.id&&!(state.view==='profile'&&state.profilePreview))actions.append(btn('DELETE',()=>void deletePost(p),'post-delete'));
 node.append(actions);
 if(state.openComments.has(p.id)){
  const zone=el('div','comment-zone');
  for(const c of state.comments.filter(c=>c.post_id===p.id).slice(-25)){
   const user=profile(c.user_id);
   const row=el('div','comment');row.append(avatar(user,'small'));
   const main=el('div','comment-main');
   main.append(el('strong','',personName(user)),el('small','',stamp(c.created_at)),el('p','',c.body));
   row.append(main);zone.append(row);
  }
  const form=el('form','comment-compose');
  const field=el('input');field.type='text';field.maxLength=1000;field.required=true;field.placeholder='Write a reply…';
  const submit=el('button','','REPLY');submit.type='submit';
  form.append(field,submit);
  form.addEventListener('submit',async event=>{
   event.preventDefault();const content=field.value.trim();
   if(!content)return;submit.disabled=true;
   const {error}=await client.from('corp_social_comments').insert({
    post_id:p.id,user_id:state.user.id,body:content
   });
   if(error){toast('Could not publish reply: '+error.message);submit.disabled=false;return}
   const {data}=await client.from('corp_social_comments').select('id,post_id,user_id,body,created_at').eq('post_id',p.id).order('created_at');
   state.comments=state.comments.filter(c=>c.post_id!==p.id).concat(data||[]);
   renderAll();toast('Reply published.');
  });
  zone.append(form);node.append(zone);
 }
 return node;
}

/* Library uploads are separate from social posts. Display authorized, original
   library files as first-class feed activity, without duplicating or moving them. */
function renderLibraryActivity(a){
 const node=el('article','panel post library-feed-post');
 node.id='library-media-'+a.id;
 const person=profile(a.owner_id);
 const head=el('div','post-head');
 const pic=avatar(person,'small');
 pic.style.cursor='pointer';
 pic.addEventListener('click',()=>openProfile(a.owner_id));
 const title=el('div','post-author');
 title.append(btn(personName(person),()=>openProfile(a.owner_id)),
   el('small','',personHandle(person)+' · '+stamp(a.created_at)));
 head.append(pic,title,el('span','post-label',a.kind==='video'?'VIDEO UPLOADED':'PHOTO UPLOADED'));
 node.append(head);
 const caption=String(a.caption||'').trim();
 node.append(el('div','library-feed-context','MILITARY LIBRARY  /  NEW TO THE ARCHIVE'));
 if(caption)node.append(el('div','post-body',caption));
 const tags=[a.military_branch,a.military_category,a.military_era].filter(v=>v&&v!=='Unspecified'&&v!=='Unsorted');
 if(tags.length)node.append(el('div','library-feed-tags',tags.join('  ·  ')));
 const src=mediaUrl(a);
 if(src){
  const wrap=el('div','post-media post-media-original library-feed-media');
  if(a.kind==='video'){
   const v=el('video','post-media-original-video');
   v.src=src;v.controls=true;v.playsInline=true;v.preload='metadata';
   v.style.width='100%';v.style.height='auto';v.style.objectFit='contain';
   wrap.append(v);
  }else{
   const link=btn('',()=>void photos.openAsset(a),'post-media-original-open');
   link.style.setProperty('height','auto','important');
   link.style.setProperty('min-height','0','important');
   link.style.setProperty('aspect-ratio','auto','important');
   const img=el('img','post-media-original-photo');
   img.src=src;img.alt=caption||a.filename||'Military library photograph';img.loading='lazy';
   img.style.setProperty('width','100%','important');
   img.style.setProperty('height','auto','important');
   img.style.setProperty('object-fit','contain','important');
   link.append(img);wrap.append(link);
  }
  node.append(wrap);
 }
 const actions=el('div','post-actions');
 actions.append(btn('▧  VIEW IN MILITARY LIBRARY',()=>void photos.openAsset(a)));
 actions.append(btn('◌  VIEW PROFILE',()=>openProfile(a.owner_id)));
 node.append(actions);
 return node;
}

function renderFeed(){
 const box=$('feedPosts');box.replaceChildren();
 const followingIds=new Set(state.follows.filter(f=>f.follower_id===state.user.id).map(f=>f.following_id));
 const members=new Set(state.profiles.map(p=>p.user_id));
 const allowedOwner=id=>members.has(id)||id===state.user.id;
 const allowedFollow=id=>state.feedFilter!=='following'||followingIds.has(id)||id===state.user.id;
 let posts=state.posts.filter(p=>allowedFollow(p.author_id));
 let library=state.assets.filter(a=>
   sharedMedia(a)&&a.purpose==='library'&&(a.kind==='photo'||a.kind==='video')&&
   allowedOwner(a.owner_id)&&allowedFollow(a.owner_id));
 if(state.feedFilter==='videos'){
  posts=posts.filter(p=>p.kind==='video');
  library=library.filter(a=>a.kind==='video');
 }
 if(state.deepPost){posts=posts.filter(p=>p.id===state.deepPost);library=[];}
 // Keep one activity per original upload. Library media are not social-post attachments.
 const recent=[
  ...posts.map(p=>({type:'post',item:p})),
  ...library.map(a=>({type:'library',item:a}))
 ].sort((a,b)=>Date.parse(b.item.created_at||0)-Date.parse(a.item.created_at||0)).slice(0,160);
 const entries=state.feedFilter==='for-you'?personalization.rankFeed(recent):recent;
 if(!entries.length){
  box.append(empty(state.feedFilter==='following'?'No following updates yet':'No network activity yet',
   'Military Library photo uploads and network posts will appear here automatically.'));
  return;
 }
 for(const entry of entries)box.append(entry.type==='post'?renderPost(entry.item):renderLibraryActivity(entry.item));
}
function videoTile(a){
 const p=state.posts.find(p=>p.id===a.post_id),person=profile(a.owner_id);
 const card=el('article','panel video-card');
 const url=mediaUrl(a);
 if(url){
  const vid=el('video');vid.src=url;vid.controls=true;vid.playsInline=true;vid.preload='metadata';vid.setAttribute('aria-label',a.filename);
  card.append(vid);
 }else card.append(el('div','empty-state','Preview temporarily unavailable.'));
 const footer=el('div','video-card-footer');
 footer.append(el('strong','',p?.body||a.filename),el('small','',personName(person)+' · '+stamp(a.created_at)),
  btn('OPEN AUTHOR PROFILE ↗',()=>openProfile(a.owner_id,'videos')));
 card.append(footer);return card;
}
// Dedicated Video Studio: uploads happen inside Video Channel, never in Network Feed.
const MAX_VIDEO_BYTES=10*1024*1024*1024;
const SMALL_VIDEO_BYTES=45*1048576;
const MAX_POSTER_BYTES=8*1048576;
let directVideoBusy=false,videoPosterPreviewUrl=null;
const VIDEO_MIMES=new Set(['video/mp4','video/webm','video/quicktime','video/x-m4v','video/x-msvideo']);
// AVI MIME values vary by browser; only normalize files that actually end in .avi.
// AVI must use Bunny Stream transcoding, never the browser-only small-video player.
function isAviVideo(file){return Boolean(file&&/\.avi$/i.test(file.name||''))}
function videoUploadMime(file){
 if(!file)return '';
 if(isAviVideo(file)){
  return ['video/x-msvideo','video/avi','video/msvideo','application/x-troff-msvideo','application/octet-stream',''].includes(file.type||'')?'video/x-msvideo':'';
 }
 return VIDEO_MIMES.has(file.type)?file.type:'';
}
function requiresBunnyStream(file){
 return Boolean(file&&(isAviVideo(file)||file.size>SMALL_VIDEO_BYTES));
}
const POSTER_MIMES=new Set(['image/jpeg','image/png','image/webp']);
async function videoStreamApi(action,payload={}){
 const {data,error}=await client.functions.invoke('blackcell-video-stream-api',{body:{action,...payload}});
 if(error||data?.ok!==true){
  // Supabase returns FunctionsHttpError on non-2xx responses. The useful
  // JSON error code is in error.context (the Response), not error.message.
  let responseData=data;
  if(error?.context&&typeof error.context.json==='function'){
   try{responseData=await error.context.json()}catch(_){}
  }
  const reason=String(responseData?.error||error?.message||'video_stream_unavailable');
  const messages={
   network_access_denied:'BLACKCELL Network authorization was rejected. Sign out and sign back in with an active Network account.',
   security_session_required:'Your BLACKCELL security verification is missing or has expired. Complete Corporate Access verification, then retry.',
   security_session_unavailable:'BLACKCELL could not validate your security session. Refresh and sign in again.',
   sign_in_required:'Your BLACKCELL sign-in has expired. Sign in again to upload.',
   bunny_stream_library_not_configured:'Large video storage is not configured yet: add your Bunny Stream Library ID and API Key in Supabase Edge Function Secrets.',
   bunny_stream_embed_security_not_configured:'Bunny Stream embed token security is not configured yet. Add BUNNY_STREAM_EMBED_TOKEN_KEY in Supabase Edge Function Secrets.',
   server_database_not_configured:'BLACKCELL video service configuration is incomplete. The administrator needs to check its server connection.',
   bunny_create_failed:'Bunny Stream rejected creation of the video. Check the Bunny Stream Library ID, API key, and account access.',
   invalid_video_upload:'The video details or format were rejected. Choose a supported file up to 10 GB.',
   catalog_registration_failed:'The video was accepted by storage but its private catalog entry could not be created.',
   video_stream_service_error:'BLACKCELL video service could not complete the request. Check the Video Studio connection and try again.'
  };
  throw Error(messages[reason]||('BLACKCELL video service: '+reason.replace(/[^a-zA-Z0-9_ -]/g,'').slice(0,110)));
 }
 return data;
}
function videoPosterClear(){
 if(videoPosterPreviewUrl)URL.revokeObjectURL(videoPosterPreviewUrl);
 videoPosterPreviewUrl=null;
 $('bcVideoPosterPreview').removeAttribute('src');
 $('bcVideoPosterPreviewFrame').hidden=true;
}
function videoPosterSelect(){
 videoPosterClear();
 const f=$('bcVideoPoster').files?.[0];
 if(!f)return;
 if(!POSTER_MIMES.has(f.type)||f.size<=0||f.size>MAX_POSTER_BYTES){
  $('bcVideoPoster').value='';
  toast('Poster must be JPG, PNG or WEBP and 8 MB or smaller.');
  return;
 }
 videoPosterPreviewUrl=URL.createObjectURL(f);
 $('bcVideoPosterPreview').src=videoPosterPreviewUrl;
 $('bcVideoPosterPreviewFrame').hidden=false;
}
function syncDirectVideoCategory(){
 const kind=$('bcVideoCategory').value;
 const episode=kind==='series';
 $('bcVideoEpisodeFields').hidden=!episode;
 $('bcVideoSeriesTitle').required=episode;
 $('bcVideoSeason').required=episode;
 $('bcVideoEpisode').required=episode;
 $('bcVideoUploadHeading').textContent=kind==='movie'?'Upload Movie':kind==='series'?'Upload TV Episode':kind==='documentary'?'Upload Documentary':kind==='short'?'Upload Short':'Upload Video';
}
function videoFileSizeLabel(file){
 if(!file)return 'Choose MP4, MOV, WEBM or AVI · up to 10 GB (AVI uses Bunny Stream)';
 return file.name+' · '+prettyBytes(file.size)+(requiresBunnyStream(file)?' · Bunny Stream resumable upload':' · private upload');
}
async function refreshVideoStorageStatus(file){
 const note=$('bcVideoLargeUploadStatus');
 if(!note)return;
 if(file&&!requiresBunnyStream(file)){
  note.textContent='Standard private upload · administrator review required';
  note.classList.add('is-ready');return;
 }
 note.textContent='Checking 10 GB resumable storage…';note.classList.remove('is-ready');
 try{
  const status=await videoStreamApi('status');
  if(status.resumableReady){
   note.textContent='10 GB resumable Bunny Stream uploads ready · interrupted uploads can be resumed on this device';
   note.classList.add('is-ready');
  }else{
   note.textContent='10 GB uploads need a Bunny Stream library ID, API key and embed token key configured in Supabase. Small videos up to 45 MB still work.';
  }
 }catch(e){
  note.textContent=String(e?.message||'10 GB storage connection unavailable. Small videos up to 45 MB are still supported.');
 }
}
function openDirectVideoUpload(category='standard'){
 if(directVideoBusy||state.busy)return;
 const modal=$('bcVideoUploadDialog');
 $('bcVideoUploadForm').reset();
 videoPosterClear();
 $('bcVideoCategory').value=['standard','short','movie','series','documentary'].includes(category)?category:'standard';
 $('bcVideoFileName').textContent=videoFileSizeLabel(null);
 $('bcVideoUploadMessage').textContent='';
 $('bcVideoUploadProgress').hidden=true;
 $('bcVideoUploadFill').classList.remove('is-uploading');
 $('bcVideoUploadFill').style.width='0%';
 $('bcVideoUploadSubmit').disabled=false;
 syncDirectVideoCategory();
 modal.hidden=false;
 document.body.classList.add('bc-video-upload-open');
 void refreshVideoStorageStatus();
 $('bcVideoTitle').focus({preventScroll:true});
}
function closeDirectVideoUpload(){
 if(directVideoBusy)return;
 $('bcVideoUploadDialog').hidden=true;
 $('bcVideoUploadForm').reset();
 videoPosterClear();
 document.body.classList.remove('bc-video-upload-open');
}
async function uploadMoviePoster(file){
 if(!file)return null;
 if(!POSTER_MIMES.has(file.type)||file.size<=0||file.size>MAX_POSTER_BYTES)throw Error('Poster must be JPG, PNG or WEBP under 8 MB');
 const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
 const path=state.user.id+'/video-posters/'+crypto.randomUUID()+'.'+extension;
 const {error}=await bucket.upload(path,file,{contentType:file.type,cacheControl:'1800',upsert:false});
 if(error)throw Error('Poster upload failed: '+error.message);
 return path;
}
async function sendViaStream(file,metadata,posterFile){
 const status=await videoStreamApi('status');
 if(!status.resumableReady){
  throw Error('10 GB uploads require Bunny Stream library ID, API key and embed security key. Configure these three Supabase Edge Function secrets before trying a large video.');
 }
 const tus=window.tus;
 if(!tus?.Upload)throw Error('Resumable uploader did not load. Refresh BLACKCELL with an internet connection and try again.');
 const key='bc-large-video:'+state.user.id+':'+file.name+':'+file.size+':'+file.lastModified;
 const resumeId=localStorage.getItem(key)||undefined;
 const start=await videoStreamApi('start',{
  title:metadata.title,fileName:file.name,bytes:file.size,mimeType:videoUploadMime(file),category:metadata.category,
  synopsis:metadata.synopsis,seriesTitle:metadata.seriesTitle,season:metadata.season,episode:metadata.episode,
  rightsConfirmed:true,...(resumeId?{resumeId}:{})
 });
 localStorage.setItem(key,start.catalogId);
 const fill=$('bcVideoUploadFill'),message=$('bcVideoUploadMessage');
 fill.classList.remove('is-uploading');fill.style.width='0%';
 message.textContent='Uploading 0% · resumable chunks';
 await new Promise((resolve,reject)=>{
  const uploader=new tus.Upload(file,{
   endpoint:start.endpoint,
   retryDelays:[0,2000,5000,10000,20000,45000,60000],
   chunkSize:32*1024*1024,
   removeFingerprintOnSuccess:true,
   headers:{
    AuthorizationSignature:start.signature,
    AuthorizationExpire:String(start.expirationTime),
    VideoId:start.videoId,
    LibraryId:String(start.libraryId)
   },
   metadata:{filetype:videoUploadMime(file),title:metadata.title},
   onProgress(sent,total){
    const percent=total?Math.round(sent*100/total):0;
    fill.style.width=Math.min(100,percent)+'%';
    message.textContent='Uploading '+percent+'% · '+prettyBytes(sent)+' of '+prettyBytes(total);
   },
   onSuccess:resolve,
   onError:reject
  });
  uploader.findPreviousUploads().then(previous=>{
   // Resume only the same catalog/video; TUS fingerprints are tied to browser-local storage.
   if(previous.length&&resumeId===start.catalogId)uploader.resumeFromPreviousUpload(previous[0]);
   uploader.start();
  }).catch(reject);
 });
 localStorage.removeItem(key);
 message.textContent='Video uploaded · verifying with Bunny Stream…';
 const remote=await videoStreamApi('finish',{catalogId:start.catalogId});
 if(posterFile){
  try{
   const path=await uploadMoviePoster(posterFile);
   await videoStreamApi('poster',{catalogId:start.catalogId,posterPath:path});
  }catch(e){toast('Video saved; the poster could not be attached: '+fail(e))}
 }
 return {status:remote.status,catalogId:start.catalogId};
}
async function publishDirectVideo(event){
 event.preventDefault();
 if(directVideoBusy||state.busy)return;
 const file=$('bcVideoFile').files?.[0],posterFile=$('bcVideoPoster').files?.[0];
 const title=$('bcVideoTitle').value.trim(),category=$('bcVideoCategory').value;
 const synopsis=$('bcVideoDescription').value.trim();
 const seriesTitle=$('bcVideoSeriesTitle').value.trim();
 const season=Number($('bcVideoSeason').value),episode=Number($('bcVideoEpisode').value);
 if(!file){toast('Choose a video file first.');return}
 if(!videoUploadMime(file)||file.size<=0||file.size>MAX_VIDEO_BYTES){
  toast('Choose an MP4, MOV, WEBM or AVI video up to 10 GB.');return;
 }
 if(!title){toast('Enter a video title.');return}
 if(posterFile&&(!POSTER_MIMES.has(posterFile.type)||posterFile.size>MAX_POSTER_BYTES||posterFile.size<=0)){
  toast('Poster must be JPG, PNG or WEBP, 8 MB or less.');return;
 }
 if(!$('bcVideoRights').checked){toast('Confirm your rights to share the video.');return}
 if(category==='series'&&(!seriesTitle||!Number.isInteger(season)||season<1||season>100||!Number.isInteger(episode)||episode<1||episode>999)){
  toast('Enter a series title, season and episode number.');return;
 }
 const metadata={title,category,seriesTitle:category==='series'?seriesTitle:null,
  season:category==='series'?season:null,episode:category==='series'?episode:null,synopsis};
 const submit=$('bcVideoUploadSubmit'),progress=$('bcVideoUploadProgress');
 directVideoBusy=true;state.busy=true;submit.disabled=true;
 $('bcVideoUploadClose').disabled=true;$('bcVideoUploadCancel').disabled=true;
 progress.hidden=false;
 $('bcVideoUploadFill').classList.add('is-uploading');
 $('bcVideoUploadMessage').textContent='Preparing secure upload…';
 let postId=null,posterPath=null;
 try{
  if(requiresBunnyStream(file)){
   await sendViaStream(file,metadata,posterFile);
   $('bcVideoUploadMessage').textContent='Upload received. Video encoding and administrator review are pending.';
  }else{
   // Preserve the existing small-file Supabase workflow.
   // The shared Free bucket cannot accept files larger than 45 MB.
   posterPath=await uploadMoviePoster(posterFile);
   const {data,error}=await client.from('corp_social_posts').insert({author_id:state.user.id,body:title,kind:'video'}).select('id').single();
   if(error||!data?.id)throw Error(error?.message||'Could not create video post.');
   postId=data.id;
   $('bcVideoUploadMessage').textContent='Uploading private video…';
   await uploadAsset(file,'post',postId,{...metadata,posterPath});
   $('bcVideoUploadFill').classList.remove('is-uploading');
   $('bcVideoUploadFill').style.width='100%';
   $('bcVideoUploadMessage').textContent='Upload complete. Awaiting administrator review.';
  }
  try{await loadAll({show:true})}catch(err){console.warn('Video catalog refresh:',fail(err))}
  $('bcVideoUploadDialog').hidden=true;
  document.body.classList.remove('bc-video-upload-open');
  videoPosterClear();
  document.dispatchEvent(new CustomEvent('bc:media-updated'));
  toast('Video received. It will appear in the Channel after encoding (if needed) and administrator approval.');
 }catch(e){
  if(postId)await client.from('corp_social_posts').delete().eq('id',postId).eq('author_id',state.user.id);
  if(postId&&posterPath)await bucket.remove([posterPath]).catch(()=>{});
  $('bcVideoUploadMessage').textContent='Upload incomplete: '+fail(e);
  $('bcVideoUploadFill').classList.remove('is-uploading');
  $('bcVideoUploadFill').style.width='0%';
  toast('Video upload incomplete: '+fail(e));
 }finally{
  directVideoBusy=false;state.busy=false;submit.disabled=false;
  $('bcVideoUploadClose').disabled=false;$('bcVideoUploadCancel').disabled=false;
 }
}
const videoChannel=createBlackcellVideoChannel({
 state,mediaUrl,posterUrl,sharedMedia,profile,personName,stamp,switchView,openProfile,toast,
 uploadVideo:openDirectVideoUpload,
 playStream:async a=>{
  const data=await videoStreamApi('play',{catalogId:a.id});
  return data.url;
 },
 reviewStream:async(a,decision)=>{
  try{
   await videoStreamApi('review',{catalogId:a.id,decision});
   await loadAll({show:true});
   toast('Video review updated.');
  }catch(e){toast('Review failed: '+fail(e))}
 },
 refreshStream:async a=>{
  try{
   const result=await videoStreamApi('refresh',{catalogId:a.id});
   await loadAll({show:true});
   toast(result.ready?'Movie encoding complete. Ready for review.':'Video processing: '+result.status);
  }catch(e){toast('Could not check encoding: '+fail(e))}
 }
});

function renderVideos(){videoChannel.render()}
async function toggleFollow(id){
 if(id===state.user.id)return;
 try{
  const follows=following(id);
  const op=follows
   ?client.from('corp_social_follows').delete().eq('follower_id',state.user.id).eq('following_id',id)
   :client.from('corp_social_follows').insert({follower_id:state.user.id,following_id:id});
  const {error}=await op;if(error)throw error;
  if(follows)state.follows=state.follows.filter(f=>!(f.follower_id===state.user.id&&f.following_id===id));
  else state.follows.push({follower_id:state.user.id,following_id:id});
  renderAll();toast(follows?'Unfollowed.':'Now following '+personName(profile(id))+'.');
 }catch(e){toast('Follow could not be updated: '+fail(e))}
}
async function toggleLike(id){
 const liked=liking(id);
 try{
  const {error}=await(liked
   ?client.from('corp_social_likes').delete().eq('post_id',id).eq('user_id',state.user.id)
   :client.from('corp_social_likes').insert({post_id:id,user_id:state.user.id}));
  if(error)throw error;
  if(liked)state.likes=state.likes.filter(l=>!(l.post_id===id&&l.user_id===state.user.id));
  else state.likes.push({post_id:id,user_id:state.user.id});
  renderAll();
 }catch(e){toast('Reaction could not be saved: '+fail(e))}
}
async function copyPostLink(id){
 const url=location.origin+location.pathname+'?post='+id;
 try{await navigator.clipboard.writeText(url);toast('Private post link copied. It only opens for verified Blackcell members.')}
 catch(_){toast('Copy the URL from this page to share internally.')}
}
async function deletePost(p){
 if(!confirm('Delete this post from Blackcell Network? This cannot be undone.'))return;
 try{
  const files=postedAssets(p.id);
  if(files.length){
   // Remove while the owner's asset records still authorize private object deletion.
   await bucket.remove(files.map(a=>a.storage_path));
  }
  const {error}=await client.from('corp_social_posts').delete().eq('id',p.id).eq('author_id',state.user.id);
  if(error)throw error;
  await refresh();toast('Post deleted.');
 }catch(e){toast('Could not delete post: '+fail(e))}
}
async function uploadAsset(file,purpose,postId=null,videoMetadata=null){
 if(!allowedTypes.has(file.type))throw Error('Unsupported format. Use JPG, PNG, WEBP, GIF, HEIC, MP4, MOV, or WEBM.');
 if(file.size<=0||file.size>45*1048576)throw Error('File must be smaller than 45 MB.');
 if(purpose!=='post' && (!file.type.startsWith('image/')||file.size>12*1048576))
  throw Error('Profile and cover images must be smaller than 12 MB.');
 const id=crypto.randomUUID();
 const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'bin';
 const path=state.user.id+'/'+id+'.'+ext;
 const {error:upError}=await bucket.upload(path,file,{
  contentType:file.type,cacheControl:'1800',upsert:false
 });
 if(upError)throw Error('Media upload rejected: '+upError.message);
 const record={id,owner_id:state.user.id,post_id:postId,purpose,
  kind:file.type.startsWith('image/')?'photo':'video',
  mime_type:file.type,filename:file.name.slice(0,180),storage_path:path,bytes:file.size};
 // Video Studio uses structured metadata and requires explicit administrator review.
 // Normal profile images and Network composer uploads retain their existing behavior.
 if(videoMetadata && purpose==='post' && record.kind==='video'){
  record.caption=String(videoMetadata.title||'').slice(0,300);
  record.video_category=String(videoMetadata.category||'standard');
  record.video_series_title=videoMetadata.seriesTitle||null;
  record.video_season=videoMetadata.season||null;
  record.video_episode=videoMetadata.episode||null;
  record.video_synopsis=videoMetadata.synopsis||null;
  record.video_poster_path=videoMetadata.posterPath||null;
  record.rights_confirmed=true;
  record.review_status='pending';
 }
 const {error}=await client.from('corp_social_assets').insert(record);
 if(error){
  // Do not strand the uploaded bytes if the metadata insert fails.
  await bucket.remove([path]).catch(()=>{});
  throw Error('Media storage saved, but registration failed: '+error.message);
 }
 return record;
}
let formFiles=[];
function renderAttachments(){
 const box=$('attachmentPreview');box.replaceChildren();
 box.hidden=!formFiles.length;
 formFiles.forEach((f,i)=>{
  const chip=el('div','attachment-chip');
  chip.append(el('span','',f.name+' · '+prettyBytes(f.size)),btn('✕',()=>{
   formFiles.splice(i,1);renderAttachments()
  }));
  box.append(chip);
 });
}
function selectFiles(input){
 const files=Array.from(input.files||[]);
 input.value='';
 if(!files.length)return;
 if(files.some(f=>!allowedTypes.has(f.type)||f.size>45*1048576)){
  toast('Unsupported media. Choose images or videos up to 45 MB each.');return;
 }
 const all=formFiles.concat(files);
 if(all.some(f=>f.type.startsWith('video/')) && all.length>1){
  toast('Post one video at a time, or create a separate photo post.');return;
 }
 if(all.length>6){toast('Maximum 6 photos in one post.');return}
 formFiles=all;renderAttachments();
}
async function publish(){
 if(state.busy)return;
 const publishedFromProfile=state.view==='profile'
  &&state.profileUserId===state.user?.id&&state.profileTab==='posts';
 const body=$('postBody').value.trim();
 if(!body&&!formFiles.length){toast('Write an update or attach media before publishing.');return}
 state.busy=true;const publishBtn=$('publishPost');
 publishBtn.disabled=true;publishBtn.textContent='CHECKING PHOTOS…';
 let selected=[],fingerprints=new Map(),skipped=0;
 try{
  for(const f of formFiles){
   if(f.type.startsWith('image/')){
    const check=await dedupe.preflight(f);
    const hit=check.matches[0];
    if(hit?.type==='exact'){
     skipped++;toast('Exact duplicate skipped: '+f.name);continue;
    }
    if(hit?.type==='possible'&&!confirm(
     'POSSIBLE DUPLICATE\n\n'+f.name+' may match '+dedupe.nameOf(hit.asset_id)+
     '.\n\nInclude it in your post anyway?')){
     skipped++;continue;
    }
    fingerprints.set(f,check.fingerprint);
   }
   selected.push(f);
  }
 }catch(e){
  toast('Could not check photo duplicates: '+(e?.message||'Try again'));
  state.busy=false;publishBtn.disabled=false;publishBtn.textContent='PUBLISH POST ↗';
  return;
 }
 if(!body&&!selected.length){
  toast('Nothing new to publish. '+skipped+' duplicate photo'+(skipped===1?' was':'s were')+' skipped.');
  state.busy=false;publishBtn.disabled=false;publishBtn.textContent='PUBLISH POST ↗';
  return;
 }
 const hasVideo=selected.some(f=>f.type.startsWith('video/'));
 const kind=hasVideo?'video':selected.length?'photo':'update';
 publishBtn.textContent='PUBLISHING…';
 const progress=$('uploadProgress');
 if(selected.length){progress.hidden=false;$('uploadFill').style.width='0%'}
 let postId=null;
 try{
  const {data,error}=await client.from('corp_social_posts').insert({
   author_id:state.user.id,body,kind
  }).select('id').single();
  if(error||!data?.id)throw Error(error?.message||'Could not create post.');
  postId=data.id;
  for(const [i,f] of selected.entries()){
   $('uploadFill').style.width=Math.round(i*100/selected.length)+'%';
   $('uploadText').textContent='Uploading '+(i+1)+' of '+selected.length+': '+f.name;
   const asset=await uploadAsset(f,'post',postId);
   if(asset.kind==='photo'&&fingerprints.has(f))await dedupe.record(asset,fingerprints.get(f));
   $('uploadFill').style.width=Math.round((i+1)*100/selected.length)+'%';
  }
  $('uploadText').textContent='Upload complete.';
  $('postBody').value='';formFiles=[];renderAttachments();updateCounter();
  await refresh();
  document.dispatchEvent(new CustomEvent('bc:media-updated'));
  if(publishedFromProfile) switchView('profile',{who:state.user.id,tab:'posts'});
  else switchView('feed');
  toast(selected.length?'Post created. Attached photos/videos are PRIVATE until administrator review.':'Text post published.');
 }catch(e){
  // Remove incomplete post (metadata cascades), keeping the feed consistent.
  if(postId)await client.from('corp_social_posts').delete().eq('id',postId).eq('author_id',state.user.id);
  toast('Could not publish: '+fail(e));
 }finally{
  state.busy=false;publishBtn.disabled=false;publishBtn.textContent='PUBLISH POST ↗';
  progress.hidden=true;
 }
}
function updateCounter(){$('charCount').textContent=$('postBody').value.length+' / 1,000'}
function openMedia(a){
 const url=mediaUrl(a);
 if(!url){toast('Original file is unavailable. Refresh and try again.');return}
 const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';
 document.body.append(link);link.click();link.remove();
}
function openEdit(){
 const p=myProfile();if(!p)return;
 $('editHeadline').value=p.headline||'';
 $('editBio').value=p.bio||'';
 $('editAvatar').value='';
 $('editFeedback').hidden=true;$('editOverlay').hidden=false;
}
function closeEdit(){$('editOverlay').hidden=true}
async function saveProfile(){
 const p=myProfile();if(!p||state.busy)return;
 state.busy=true;
 const b=$('saveProfile');b.disabled=true;b.textContent='SAVING…';
 $('editFeedback').hidden=false;$('editFeedback').textContent='Saving profile to Blackcell Network…';
 try{
  const changes={headline:$('editHeadline').value.trim().slice(0,140),
   bio:$('editBio').value.trim().slice(0,1000)};
  const ava=$('editAvatar').files?.[0];
  if(ava){const img=await uploadAsset(ava,'avatar');changes.avatar_asset_id=img.id}
  const {error}=await client.from('corp_social_profiles').update(changes).eq('user_id',state.user.id);
  if(error)throw error;
  closeEdit();await refresh();openProfile(state.user.id);toast('Your corporate social profile was updated.');
 }catch(e){$('editFeedback').textContent='Could not save profile: '+fail(e)}
 finally{state.busy=false;b.disabled=false;b.textContent='SAVE PROFILE ↗'}
}
async function refresh(){
 await loadAll({show:true});
}
let libraryFeedRefreshing=false;
async function refreshVisibleNetworkFeed(){
 if(libraryFeedRefreshing||document.hidden||state.view!=='feed'||$('app').hidden||state.busy)return;
 libraryFeedRefreshing=true;
 try{await loadAll({show:true})}catch(e){console.warn('Network feed refresh failed:',fail(e))}
 finally{libraryFeedRefreshing=false}
}
function setupEvents(){
 videoChannel.init();
 $('bcVideoUploadForm').addEventListener('submit',e=>void publishDirectVideo(e));
 $('bcVideoCategory').addEventListener('change',syncDirectVideoCategory);
 $('bcVideoPoster').addEventListener('change',videoPosterSelect);
 $('bcVideoPosterRemove').addEventListener('click',()=>{
  $('bcVideoPoster').value='';videoPosterClear();
 });
 $('bcVideoUploadClose').addEventListener('click',closeDirectVideoUpload);
 $('bcVideoUploadCancel').addEventListener('click',closeDirectVideoUpload);
 $('bcVideoFile').addEventListener('change',()=>{
  const f=$('bcVideoFile').files?.[0];
  $('bcVideoFileName').textContent=videoFileSizeLabel(f);
  void refreshVideoStorageStatus(f);
 });
 $('bcVideoUploadDialog').addEventListener('click',e=>{
  if(e.target===$('bcVideoUploadDialog'))closeDirectVideoUpload()
 });
 document.querySelectorAll('[data-view]').forEach(n=>n.addEventListener('click',()=>switchView(n.dataset.view)));
 $('viewAllPeople').addEventListener('click',()=>switchView('discover'));
 $('peopleSearch').addEventListener('input',renderDirectory);
 document.querySelectorAll('#feedFilter [data-filter]').forEach(n=>n.addEventListener('click',()=>{
  state.feedFilter=n.dataset.filter;state.deepPost=null;
  document.querySelectorAll('#feedFilter [data-filter]').forEach(x=>x.classList.toggle('selected',x===n));
  renderFeed();
 }));
 document.querySelectorAll('#profileTabs [data-tab]').forEach(n=>n.addEventListener('click',()=>{
  state.profileTab=n.dataset.tab;
  $('profileMoreDropdown')?.removeAttribute('open');
  renderProfile();
 }));
 $('postBody').addEventListener('input',updateCounter);
 $('attachPhotos').addEventListener('click',()=>{$('postFiles').accept='image/*';$('postFiles').multiple=true;$('postFiles').click()});
 $('attachVideo').addEventListener('click',()=>{$('postFiles').accept='video/*';$('postFiles').multiple=false;$('postFiles').click()});
 $('postFiles').addEventListener('change',()=>selectFiles($('postFiles')));
 $('publishPost').addEventListener('click',()=>void publish());
 $('closeEdit').addEventListener('click',closeEdit);
 $('cancelEdit').addEventListener('click',closeEdit);
 $('editOverlay').addEventListener('click',e=>{if(e.target===$('editOverlay'))closeEdit()});
 $('saveProfile').addEventListener('click',()=>void saveProfile());
 $('profileReturnFeed').addEventListener('click',()=>switchView('feed'));
 $('profileEditDetails').addEventListener('click',openEdit);
 $('profileSetupAction').addEventListener('click',openEdit);
 $('profileHighlightsSeeAll').addEventListener('click',()=>{
  state.profileTab='photos';renderProfile();
  $('profileTabs').scrollIntoView({behavior:'smooth',block:'center'});
 });
 $('profilePostFilter').addEventListener('change',()=>{
  state.profilePostFilter=$('profilePostFilter').value;
  if(state.view==='profile'&&state.profileTab==='posts')renderProfile();
 });
 $('profilePostLayout').addEventListener('click',()=>{
  state.profilePostGrid=!state.profilePostGrid;
  if(state.view==='profile'&&state.profileTab==='posts')renderProfile();
 });
 $('profilePhotosSeeAll').addEventListener('click',()=>{
  state.profileTab='photos';renderProfile();
  $('profileTabs').scrollIntoView({behavior:'smooth',block:'center'});
 });
 $('profileFollowingSeeAll').addEventListener('click',()=>switchView('discover'));
 $('profileServiceFocusEdit').addEventListener('click',()=>personalization.open());
 $('profileThemeQuick').addEventListener('click',()=>personalization.open());
 $('profileViewAs').addEventListener('click',()=>{
  if(state.profileUserId!==state.user.id)return;
  state.profilePreview=true;
  renderProfile();
  window.scrollTo({top:0,behavior:'smooth'});
 });
 $('profileEndPreview').addEventListener('click',()=>{
  state.profilePreview=false;
  renderProfile();
  window.scrollTo({top:0,behavior:'smooth'});
 });
 $('profileShareLink').addEventListener('click',async()=>{
   const p=profile(state.profileUserId)||myProfile();
   if(!p)return;
   const link=new URL('corporate-network.html',location.href);
   link.searchParams.set('view','profile');
   link.searchParams.set('user',p.user_id);
   try{
     if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
     await navigator.clipboard.writeText(link.href);
     toast('Profile link copied. It can only be viewed by authorized Network members.');
   }catch(_){window.prompt('Copy this private Network profile link:',link.href)}
 });
}

let networkSecurityChecksInstalled=false,networkSecurityChecking=false;
function closeNetworkForSecurity(reason){
 videoChannel.close();
 $('bcVideoUploadDialog').hidden=true;
 document.body.classList.remove('bc-video-upload-open');
 $('app').hidden=true;
 $('gate').hidden=false;
 $('gateText').textContent=reason;
 $('gateBack').hidden=false;
 $('applePhotoViewer').hidden=true;
 $('appleAlbumOverlay').hidden=true;
 $('editOverlay').hidden=true;
 document.body.style.overflow='';
 for(const x of document.querySelectorAll('.bc-chat-dock,.bc-chat-orb,.bc-chat-pane,.bc-chat-toast'))
  x.hidden=true;
}
async function verifyNetworkSession(){
 if(networkSecurityChecking||!state.user||$('app').hidden||document.hidden)return;
 networkSecurityChecking=true;
 try{
  const {data,error}=await client.auth.getUser();
  if(error||data?.user?.id!==state.user.id)
   return closeNetworkForSecurity('Your Blackcell session ended. Sign in again to view the private network.');
  if(state.member?.role==='employee'){
   const {data:access,error:accessError}=await client.from('corp_access_members')
    .select('access_scope').eq('user_id',state.user.id).single();
   if(accessError||access?.access_scope==='ledger_only'){
    location.replace('private-photo-ledger.html');return;
   }
  }
  const rpc=state.member?.role==='owner'?'corp_code_status':'corp_employee_code_status';
  const status=await client.rpc(rpc);
  if(status.error||status.data?.verified!==true)
   closeNetworkForSecurity('Your corporate account authorization has expired. Sign in again.');
 }catch(_){
  closeNetworkForSecurity('Network access could not be verified. Return to the corporate portal to reconnect.');
 }finally{networkSecurityChecking=false}
}
function installNetworkSecurityChecks(){
 if(networkSecurityChecksInstalled)return;networkSecurityChecksInstalled=true;
 window.setInterval(()=>void verifyNetworkSession(),20000);
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)void verifyNetworkSession()
 });
 client.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'&&state.user)
   closeNetworkForSecurity('You have signed out. Sign in to re-enter the private network.');
 });
}

async function setupPrivateLedgerDoor(){
 const link=$('privateLedgerNav');if(!link||!state.user)return;
 link.hidden=true;
 if(state.member?.role==='owner'){link.hidden=false;return}
 const {data,error}=await client.from('corp_private_photo_rooms')
   .select('id').limit(1);
 if(!error&&Array.isArray(data)&&data.length>0)link.hidden=false;
}
async function boot(){
 try{
  const {data:{session}}=await client.auth.getSession();
  if(!session)throw Error('Sign in to your employee account to open Blackcell Network.');
  const auth=await corporateAuthorize(client);
  if(!auth.ok&&auth.reason==='ledger-only'){
   location.replace('private-photo-ledger.html');return;
  }
  if(!auth.ok)throw Error('Your corporate session is no longer authorized. Sign in again.');
  state.user=auth.user;state.member=auth.member;
  $('portalLink').href=auth.member.role==='owner'?'dashboard.html':'employee.html?card=1';
  $('portalLink').textContent=auth.member.role==='owner'?'PORTAL ↗':'MY CARD ↗';
  $('portalLink').title=auth.member.role==='owner'?'Return to Administration':'View my Employee Access Card';
  $('gateBack').href=$('portalLink').href;
  let verified=false;
  if(auth.member.role==='owner'){
   const {data,error}=await client.rpc('corp_code_status');
   verified=!error&&data?.ok===true&&data.verified===true;
  }else if(auth.member.role==='employee'){
   const {data,error}=await client.rpc('corp_employee_code_status');
   verified=!error&&data?.ok===true&&data.verified===true;
  }
  if(!verified)throw Error('Your corporate account must be active and authorized to enter the network.');
  await loadAll({show:false});
  await dedupe.load();
  await personalization.load();
  await setupPrivateLedgerDoor();
  if(auth.member.role==='owner'||auth.member.can_chat===true){
   const {data}=await client.rpc('corp_chat_peers');
   if(data?.ok===true&&Array.isArray(data.peers))state.chatPeers=data.peers;
  }
  $('gate').hidden=true;$('app').hidden=false;
  setupEvents();
  setupLibraryMenu();
  visualDiscovery.setup();
  personalization.setup();
  rediscovery.start();
  installNetworkSecurityChecks();
  document.addEventListener('bc:media-updated',()=>void storageStatus.refresh({force:true}));
  // Periodic read-only refresh works even when Realtime publication is disabled.
  window.setInterval(()=>void refreshVisibleNetworkFeed(),90000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshVisibleNetworkFeed()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void setupPrivateLedgerDoor()});
  gunnerDock=mountMilitaryGunner({
   client,mount:document.body,visible:false,
   getContext:()=>({
    page_title:'Global Military Library',
    countries:photos.getCountryCodes(),
    photo_id:photos.getCurrentPhoto()?.id||null
   })
  });
  if(auth.member.role==='owner'||auth.member.can_chat===true){
   window.BLACKCELL_CORPORATE_NETWORK_CLIENT=client;
   const chatScript=document.createElement('script');
   chatScript.src='corporate-chat-dock.js?v=20261113-imessage6';
   chatScript.defer=true;
   document.body.append(chatScript);
  }
  const params=new URLSearchParams(location.search);
  const uid=params.get('user');
  const post=params.get('post');
  if(post&&UUID.test(post)){
   state.deepPost=post;
   if(!state.posts.some(p=>p.id===post)){
    const {data}=await client.from('corp_social_posts').select('*').eq('id',post).maybeSingle();
    if(data){
     state.posts.unshift(data);
     const {data:more}=await client.from('corp_social_assets').select('*').eq('post_id',post);
     for(const a of more||[])if(!state.assets.some(x=>x.id===a.id))state.assets.unshift(a);
     await loadSigned();
    }
   }
  }
  if(uid&&UUID.test(uid)&&profile(uid))switchView('profile',{who:uid});
  else if(params.get('view')==='profile')switchView('profile',{who:state.user.id});
  else if(['discover','videos','photos'].includes(params.get('view')))switchView(params.get('view'));
  else switchView('feed',{keepPost:!!state.deepPost});
  renderMini();renderSuggestions();
 }catch(e){
  $('gateText').textContent=fail(e);
  $('gateBack').hidden=false;
 }
}
const personalization=createNetworkPersonalization({client,state,toast,
 onChanged:()=>{
  state.feedFilter=personalization.enabled()?'for-you':'latest';
  document.querySelectorAll('#feedFilter [data-filter]').forEach(n=>n.classList.toggle('selected',n.dataset.filter===state.feedFilter));
  photos.render();renderFeed();rediscovery.refresh();
  if(state.view==='profile')renderProfile();
 }});
const rediscovery=createPhotoRediscovery({client,state,personalization,mediaUrl,toast,
 openPhoto:a=>photos.openAsset(a)});
const dedupe=createPhotoDedupe({client,state,mediaUrl,toast});
const visualDiscovery=createVisualDiscovery({
 client,state,mediaUrl,toast,personalization,dedupe,
 closeViewer:()=>photos.closeViewer(),
 openPhoto:a=>photos.openAsset(a),
 getCurrentPhoto:()=>photos.getCurrentPhoto()
});
const photos=setupBlackcellPhotos({client,bucket,state,toast,mediaUrl,uploadAsset,refresh,profile,openProfile,
 ensureSigned:loadSigned,switchView,personalization,rediscovery,dedupe});
const storageStatus=setupBlackcellStorageStatus({client,bucket,state});
void boot();
