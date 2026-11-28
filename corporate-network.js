import {attachPhotoTransfer} from './blackcell-photo-transfer.js?v=20261117-parallel-read1';
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261117-os-perf1';
import {setupBlackcellPhotos} from './corporate-network-photos.js?v=20261118-branded-media1';
import {setupBlackcellStorageStatus} from './corporate-storage-status.js?v=20261111-storage1';
import {mountMilitaryGunner} from './military-gunner.js?v=20261110-fast4';
import {createNetworkPersonalization} from './corporate-network-personalization.js?v=20261117-adaptive-r1';
import {createPhotoRediscovery} from './corporate-photo-rediscovery.js?v=20261117-adaptive-r1';
import {createVisualDiscovery} from './corporate-visual-discovery.js?v=20261117-adaptive-r1';
import {createPhotoDedupe} from './corporate-photo-dedupe.js?v=20261111-phonecheck2';
import {attachRenderedWorld} from './blackcell-render-player.js?v=4';
import {createBlackcellVideoChannel} from './corporate-network-videos.js?v=20261117-watch-comments-r1';
import {tubeCommentTarget} from './blackcell-tube-comments.js?v=20261117-r1';
import {isWorldVideo,worldVideoTitle,readWorldVideo,createWorldVideoPreviews} from './blackcell-world-video-catalog.js?v=20261117-watch-posters-r2';
import {createProfileWorlds} from './corporate-profile-worlds.js?v=20261117-parallel-read1';
// Pilot only: the private manifest must exist and authorization must pass; otherwise use original playback.
window.BLACKCELL_ENABLE_RENDER_PLAYBACK=true;
const client=corporateClient(),bucket=client.storage.from('corp-social-media');
const worldVideoPreviews=createWorldVideoPreviews(client);
const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedTypes=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','video/mp4','video/webm','video/quicktime','video/x-m4v']);
const state={
 user:null,member:null,profiles:[],posts:[],assets:[],streamVideos:[],likes:[],comments:[],follows:[],
 assetUrls:new Map(),posterUrls:new Map(),view:'profile',profileUserId:null,profileTab:'posts',
 attached:[],openComments:new Set(),busy:false,sort:'newest',deepPost:null,
 chatPeers:[],signedAt:0,profilePreview:false,profileFeedMode:'for-you',profileFeedLimit:12,profileFeedRefreshing:false,profilePostFilter:'all',profilePostGrid:false,profileFriendsMode:'following',profileFriendsQuery:''
};
const profileWorlds=createProfileWorlds({client,state,previews:worldVideoPreviews,title:worldVideoTitle,render:()=>renderProfile(),toast,readVideo:a=>readWorldVideo(client,a)});
const fields=['profileView','discoverView','videosView','photosView','pulseView'];
let pulseAuthor=null,pulseMode='for-you',pulseLimit=12,pulseObserver=null,pulseVideos=null,pulseScroll=null,pulseAutoplay=true,pulseVisible=new Map(),pulseOlderBusy=false,pulseEnd=false,pulseRevision=0,pulseAutoPages=0;
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
// Only sign saved variants when the uploader opens the enlarged poster.
// The selected public-facing image remains unchanged; storage RLS remains enforced.
async function posterVersions(a){
 if(!a||a.owner_id!==state.user?.id)return [];
 const selected=a.video_poster_path||a.poster_path;
 const original=a.video_poster_original_path||a.poster_original_path;
 const ai=a.video_poster_ai_path||a.poster_ai_path;
 if(!original||!ai||original===ai)return [];
 const out=await bucket.createSignedUrls([original,ai],1800);
 if(out.error)return [];
 return [{label:'ORIGINAL POSTER',path:original},{label:'AI POSTER',path:ai}]
  .map((v,i)=>({...v,url:v.path===selected?posterUrl(a):out.data?.[i]?.signedUrl,selected:v.path===selected}))
  .filter(v=>Boolean(v.url));
}

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
function profileVideos(id,includePending=false){const list=[...state.assets,...(state.streamVideos||[])].filter(a=>!['movie','series','documentary'].includes(String(a.video_category||'').trim().toLowerCase())&&a.owner_id===id&&a.kind==='video'&&['post','library'].includes(a.purpose)&&(sharedMedia(a)||(includePending&&id===state.user?.id&&isWorldVideo(a)&&a.review_status==='pending')));return [...new Map(list.map(a=>[a.id,a])).values()].sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0))}
function countVideos(id){return profileVideos(id,id===state.user?.id&&!state.profilePreview).length}
function renderFusionVideos(p,isMine){const list=profileVideos(p.user_id,isMine);if(!list.length)return empty('No videos yet','Personal and World videos from this member will appear here and in BLACKCELL Tube. Movies and TV shows remain in the cinema library.');const grid=el('div','bc-fusion-tube-grid');for(const a of list){const name=isWorldVideo(a)?worldVideoTitle(a):String(a.title||a.caption||state.posts.find(x=>x.id===a.post_id)?.body||'Untitled video').slice(0,135);const card=btn('',()=>{const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('view','videos');u.searchParams.set('video',a.id);location.assign(u.href)},'bc-fusion-tube-card');const frame=el('div','bc-fusion-tube-frame');const src=posterUrl(a);if(src||isWorldVideo(a)){const img=el('img');img.alt='';img.loading='lazy';frame.append(img);if(src)img.src=src;else{img.hidden=true;worldVideoPreviews.mount(a,img)}}frame.append(el('span','','▶'));card.append(frame,el('strong','',name),el('small','',a.review_status==='pending'?'PRIVATE · PENDING REVIEW':'BLACKCELL TUBE'));grid.append(card)}return grid}
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

function switchView(view,{who=null,tab=null,keepPost=false,pulseWho=null}={}){
 if(view==='feed'||!fields.includes(view+'View'))view='profile';
 if(!keepPost)state.deepPost=null;
 if(Date.now()-state.signedAt>25*60*1000){
  state.assetUrls.clear();void loadSigned().then(renderAll).catch(()=>{});
 }
 stopFeedPlayback();
 if(state.view==='pulse'&&view!=='pulse')clearPulse();
 if(view==='pulse'){pulseMemberTab='posts';pulseArchiveState=null;pulseScroll=null;pulseAuthor=pulseWho&&profile(pulseWho)?pulseWho:null;pulseMode=pulseAuthor?'author':'for-you';pulseLimit=12;pulseEnd=false;pulseAutoPages=0;}
 state.view=view;
 document.body.classList.toggle('bc-pulse-mode',view==='pulse');
 if(view!=='videos')videoChannel.close();
 document.body.classList.toggle('bc-video-mode',view==='videos');
 state.profilePreview=false;
 document.body.classList.toggle('bc-profile-mode',view==='profile');
 if(view!=='profile')profileWorlds.clear();
 document.body.classList.remove('bc-profile-view-as');
 syncLibraryMenu(view);
 gunnerDock?.setVisible(view==='photos');
 if(view==='profile'){
  state.profileUserId=who||state.user.id;
  state.profileTab=tab||(state.profileUserId===state.user.id?'worldfeed':'posts');
  if(state.profileTab==='worldfeed'&&state.profileUserId===state.user.id){profileWorlds.reset();state.profileFeedMode='for-you';state.profileFeedLimit=12}
 }
 for(const f of fields)$(f).hidden=f!==view+'View';
 // Keep the original, fully wired Network composer on the active page.
 syncProfileComposer();
 document.querySelectorAll('[data-view]').forEach(n=>{
  n.classList.toggle('nav-active',n.dataset.view===view&&n.closest('.mainnav')!==null);
  n.classList.toggle('selected',n.dataset.view===view&&n.closest('.nav-panel')!==null);
 });

 if(view==='profile')renderProfile();
 if(view==='discover')renderDirectory();
 if(view==='pulse')renderPulse();
 if(view==='videos')renderVideos();
 if(view==='photos'){photos.render();void storageStatus.refresh()}
 const params=new URLSearchParams();
 if(view==='profile'){
  params.set('view','profile');
  if(state.profileUserId!==state.user.id)params.set('user',state.profileUserId);
 }
 if(view==='videos'||view==='discover'||view==='photos'||view==='pulse')params.set('view',view);
 if(view==='pulse'&&pulseAuthor)params.set('user',pulseAuthor);
 if(keepPost&&state.deepPost)params.set('post',state.deepPost);
 history.replaceState(null,'',location.pathname+(params.toString()?'?'+params.toString():''));
 window.scrollTo({top:0,behavior:'smooth'});
}
function openProfile(uid,tab=uid===state.user?.id?'worldfeed':'posts'){
 switchView('profile',{who:uid,tab});
}
async function loadAll({show=true}={}){
 const [pr,po,as,fo,stream]=await Promise.all([
  client.from('corp_social_profiles').select('*').order('display_name',{ascending:true}).limit(500),
  client.from('corp_social_posts').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(120),
  client.from('corp_social_assets').select('*').order('created_at',{ascending:false}).limit(1000),
  client.from('corp_social_follows').select('follower_id,following_id').limit(2000),
  client.from('corp_stream_videos').select('*').order('created_at',{ascending:false}).limit(600)
 ]);
 for(const r of [pr,po,as,fo,stream])if(r.error)throw Error('Network data could not be read: '+r.error.message);
 state.profiles=pr.data||[];state.posts=po.data||[];
 state.assets=as.data||[];state.follows=fo.data||[];
 // The general feed has a 1000-row cap; enumerate the separate World video catalog without it.
 const worldVideos=[];
 // Fetch the separate World-video catalog only when the main catalog reaches
 // its row cap; below that cap, all visible records are already present.
 if((as.data||[]).length>=1000){
  for(let offset=0;;offset+=500){const out=await client.from('corp_social_assets').select('*').eq('source_provider','world-bunny-v1').eq('purpose','library').eq('kind','video').or('and(review_status.eq.approved,adult_restricted.eq.false),and(review_status.eq.pending,owner_id.eq.'+state.user.id+')').order('id').range(offset,offset+499);if(out.error){console.warn('World video catalog unavailable',out.error.message);break}worldVideos.push(...(out.data||[]));if((out.data||[]).length<500)break}
 }
 const catalog=new Map(state.assets.map(a=>[a.id,a]));for(const a of worldVideos)catalog.set(a.id,a);state.assets=[...catalog.values()];
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
 const all=state.assets.filter(a=>!isWorldVideo(a)&&!state.assetUrls.has(a.id));
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
 if(state.view==='pulse')renderPulse();

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

 const mount=$('profileTimelineComposer');
 const composer=$('postBody')?.closest('.composer');
 if(!mount||!composer)return;
 const onOwnPosts=state.view==='profile'
  &&state.profileUserId===state.user?.id
  &&['posts','worldfeed'].includes(state.profileTab)&&!state.profilePreview;
 if(onOwnPosts){
  mount.hidden=false;
  if(composer.parentElement!==mount)mount.append(composer);
  composer.classList.add('bc-fb-live-composer');
 }else{
  mount.hidden=true;

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
 if(!['posts','worldfeed'].includes(state.profileTab)){state.profileTab='posts';renderProfile();}
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
  
  ['MILITARY WORLD','Approved shared media and collections','military-world.html#collection']
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
 stopFeedPlayback();
 const p=profile(state.profileUserId)||myProfile();
 if(!p)return;
 state.profileUserId=p.user_id;
 cover($('profileCover'),p);
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
 const worldTab=document.querySelector('#profileTabs [data-tab="worldfeed"]');worldTab.hidden=!isMine;
 if(!isMine&&state.profileTab==='worldfeed')state.profileTab='posts';
 profileWorlds.header(isMine,isPreview);
 $('profileCoverAction').hidden=true;
 document.body.classList.toggle('bc-profile-view-as',isPreview);
 $('profileViewAs').hidden=!isOwnProfile||isPreview;
 $('profileThemeQuick').hidden=!isMine;
 $('profileViewAsNotice').hidden=!isPreview;
 $('profileServiceFocusPanel').hidden=!isMine;
 $('profileSocialNavigation').hidden=!isMine;
 $('profileSuggestedPeople').hidden=!isMine||state.profileTab!=='worldfeed';
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
  worldfeed:['My Feed','Discover posts, conversations and media from the BLACKCELL community.'],
  posts:[isMine?'My Posts':'Timeline','Your story, updates and conversations.'],
  reblogs:['Reblogs','Posts this member has shared from the Network.'],
  photos:['Photo Archive','Approved photographs shared by this member.'],
  videos:['Videos','Videos shared by this member across BLACKCELL.'],
  albums:['Albums','Organized photo collections.'],
  about:['About','Personal introduction and verified account details.'],
  friends:['Friends & Following','Real network connections and verified members.'],
  groups:['Groups & Communities','Existing BLACKCELL collections and community information.']
 };
 const sectionInfo=tabCopy[state.profileTab]||tabCopy.posts;
 $('profileSectionTitle').textContent=sectionInfo[0];
 const pulseEntry=$('profilePulseEntry');pulseEntry.hidden=false;pulseEntry.textContent=(isMine?'Open My Feed':'Open member feed')+' · PULSE ↗';pulseEntry.onclick=()=>switchView('pulse',{pulseWho:p.user_id});
 $('profileSectionIntro').textContent=sectionInfo[1];
 const actions=$('profileActions');actions.replaceChildren();
 if(isMine){
  actions.append(btn('＋ Create post',focusProfileComposer,'bc-security-create-post'));
  actions.append(btn('✎ Edit profile',openEdit,'bc-security-edit-profile'));
 }
 else if(!isOwnProfile){
  actions.append(btn(following(p.user_id)?'✓ FOLLOWING':'+ FOLLOW',()=>void toggleFollow(p.user_id)));
  if(state.chatPeers.some(x=>x.user_id===p.user_id)){
   const directChat=btn('Message',()=>window.dispatchEvent(new CustomEvent('blackcell-open-imessage',{detail:{peerId:p.user_id,source:'profile'}})),'secondary bc-fusion-message');directChat.setAttribute('aria-label','Message '+personName(p)+' in BLACKCELL iMessage');
   actions.append(directChat);
  }
 }
 const postsTab=document.querySelector('#profileTabs [data-tab="posts"]');if(postsTab)postsTab.textContent=isMine?'My Posts':'Timeline';
 document.querySelectorAll('#profileTabs [data-tab]').forEach(b=>{
  b.classList.toggle('selected',b.dataset.tab===state.profileTab);
  b.setAttribute('aria-current',b.dataset.tab===state.profileTab?'page':'false');
 });
 const more=$('profileMoreDropdown');
 if(more)more.classList.toggle('selected',['albums','groups','friends'].includes(state.profileTab));
 $('profilePostControls').hidden=state.profileTab!=='posts';
 $('profilePostLayout').textContent=state.profilePostGrid?'☷ LIST VIEW':'▦ GRID VIEW';
 $('profilePostLayout').setAttribute('aria-pressed',String(state.profilePostGrid));
 syncProfileComposer();
 const box=$('profileContent');box.replaceChildren();
 box.classList.toggle('bc-security-post-grid',state.profileTab==='posts'&&state.profilePostGrid);
 if(state.profileTab==='worldfeed'&&isMine){renderProfileSocialFeed(box);return}profileWorlds.clear();
 if(state.profileTab==='about'){
  box.append(renderProfileAbout(p,isMine));return;
 }
 if(state.profileTab==='friends'){
  box.append(renderProfileFriends(p));return;
 }
 if(state.profileTab==='groups'){
  box.append(renderProfileGroups());return;
 }
 if(state.profileTab==='reblogs'){
  const items=state.posts.filter(x=>x.author_id===p.user_id&&reblogReference(x.body));
  if(!items.length)box.append(empty('No reblogs yet','Share a Network post using Reblog to start this collection.'));
  else for(const post of items)box.append(renderPost(post));
  return;
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
 if(state.profileTab==='videos'){box.append(renderFusionVideos(p,isMine));return;}
 if(state.profileTab==='photos'){box.append(photos.renderProfilePhotos(p.user_id,'photo'));return;}
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
function reblogReference(body){const match=String(body||'').match(/(?:^|\n)BLACKCELL REBLOG: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i);return match?{id:match[1],comment:String(body).slice(0,match.index).trim()}:null}
function prepareReblog(p){
 if(!state.user||state.busy)return;
 const field=$('postBody'),line='BLACKCELL REBLOG: '+p.id;
 if(field.value.includes(line)){switchView('profile',{who:state.user.id,tab:'posts'});focusProfileComposer();return}
 if(reblogReference(field.value)||pulseMediaReference(field.value)||videoShareReference(field.value)){toast('Finish or remove the existing reblog reference first.');return}
 const body=(field.value.trim()?field.value.trim()+'\n\n':'')+line;
 if(body.length>1000){toast('Shorten your draft before adding a reblog.');return}
 switchView('profile',{who:state.user.id,tab:'posts'});field.value=body;updateCounter();focusProfileComposer();toast('Reblog added to your draft. Publish when ready.');
}
function videoShareReference(body){const match=String(body||'').match(/(?:^|\n)BLACKCELL VIDEO: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i);return match?{id:match[1],comment:String(body).slice(0,match.index).trim()}:null}
function prepareVideoShare(a){
 if(!state.user||state.busy||!sharedMedia(a)||a.kind!=='video'||!UUID.test(a.id)){toast('This video cannot be shared.');return}
 const field=$('postBody'),line='BLACKCELL VIDEO: '+a.id;
 if(field.value.includes(line)){switchView('profile',{who:state.user.id,tab:'posts'});focusProfileComposer();return}
 if(videoShareReference(field.value)||reblogReference(field.value)||pulseMediaReference(field.value)){toast('Finish or remove the existing share in your draft first.');return}
 const body=(field.value.trim()?field.value.trim()+'\n\n':'')+line;
 if(body.length>1000){toast('Shorten your draft before sharing.');return}
 switchView('profile',{who:state.user.id,tab:'posts'});field.value=body;updateCounter();focusProfileComposer();toast('Video added to your private Network draft. Publish when ready.');
}

/* PULSE actions: use the authenticated catalog and RLS. No media bytes are copied. */
const pulsePending=new Map();
let pulseMutes=new Set(),pulseSaved=new Set(),pulsePersonalReady=false,pulseViewObserver=null,pulseSeen=new Set(),pulseViewPending=new Map(),pulseViewTimer=null;
const pulseKey=t=>t.kind+':'+t.id;
function pulseTargetFor(entry){return entry.type==='post'?{kind:'post',id:entry.item.id}:pulseTarget(entry.item)}
async function loadPulsePersonal(){
 const uid=state.user.id;const [m,b]=await Promise.all([client.from('corp_pulse_mutes').select('muted_user_id').eq('user_id',uid),client.from('corp_pulse_interactions').select('target_kind,target_id').eq('user_id',uid).eq('action','bookmark').limit(1000)]);
 if(state.user?.id!==uid)return;if(m.error||b.error){pulsePersonalReady=false;console.warn('PULSE preferences unavailable');return}
 pulseMutes=new Set((m.data||[]).map(x=>x.muted_user_id));pulseSaved=new Set((b.data||[]).map(x=>x.target_kind+':'+x.target_id));pulsePersonalReady=true;
}
async function pulseMute(owner){if(owner===state.user.id)return;if(!pulsePersonalReady){toast('Mute settings unavailable. Refresh and try again.');return}const old=pulseMutes.has(owner);const q=client.from('corp_pulse_mutes');const {error}=old?await q.delete().eq('user_id',state.user.id).eq('muted_user_id',owner):await q.insert({user_id:state.user.id,muted_user_id:owner});if(error){toast('Unable to update mute: '+fail(error));return}if(old)pulseMutes.delete(owner);else pulseMutes.add(owner);renderAll();toast(old?'Member unmuted.':'Member muted in PULSE.');}
async function loadSavedTargets(){
 const missing={post:[],asset:[],stream:[]};for(const key of pulseSaved){const [kind,id]=key.split(':');if(!missing[kind]||!UUID.test(id))continue;if(kind==='post'?!state.posts.some(p=>p.id===id):!pulseFindMedia({kind,id}))missing[kind].push(id)}
 for(const [kind,ids] of Object.entries(missing)){const table=kind==='post'?'corp_social_posts':kind==='asset'?'corp_social_assets':'corp_stream_videos';for(let i=0;i<ids.length;i+=100){const {data,error}=await client.from(table).select('*').in('id',ids.slice(i,i+100));if(error)continue;for(const a of data||[]){if(kind==='post'){if(!state.posts.some(p=>p.id===a.id))state.posts.push(a)}else if(kind==='asset'){if(!state.assets.some(x=>x.id===a.id))state.assets.push(a)}else if(!state.streamVideos.some(x=>x.id===a.id))state.streamVideos.push({...a,kind:'video',purpose:'post',bunny_stream:true,video_poster_path:a.poster_path})}}}
 for(let i=0;i<missing.post.length;i+=100){const ids=missing.post.slice(i,i+100);const [assets,likes,comments]=await Promise.all([client.from('corp_social_assets').select('*').in('post_id',ids),client.from('corp_social_likes').select('post_id,user_id').in('post_id',ids),client.from('corp_social_comments').select('id,post_id,user_id,body,created_at').in('post_id',ids).order('created_at')]);for(const a of assets.data||[])if(!state.assets.some(x=>x.id===a.id))state.assets.push(a);for(const l of likes.data||[])if(!state.likes.some(x=>x.post_id===l.post_id&&x.user_id===l.user_id))state.likes.push(l);for(const c of comments.data||[])if(!state.comments.some(x=>x.id===c.id))state.comments.push(c)}
 await loadSigned();
}
function pulseViewAnchor(node,t,update){
 node.dataset.pulseTarget=pulseKey(t);node._pulseRefresh=()=>pulseQueue(t,update);
 if(state.view==='pulse'&&pulseViewObserver)pulseViewObserver.observe(node.querySelector('.post-head')||node);
}
function pulseViewSetup(scroll){
 if(typeof IntersectionObserver!=='function')return;
 pulseViewObserver=new IntersectionObserver(entries=>{
  for(const e of entries){if(!e.isIntersecting||document.hidden||state.view!=='pulse')continue;const node=e.target.closest('[data-pulse-target]');if(!node)continue;const key=node.dataset.pulseTarget,seen=state.user.id+':'+key;if(pulseSeen.has(seen)){pulseViewObserver?.unobserve(e.target);continue}pulseSeen.add(seen);pulseViewObserver?.unobserve(e.target);pulseViewPending.set(key,{node,seen});}
  if(pulseViewPending.size&&!pulseViewTimer)pulseViewTimer=setTimeout(async()=>{pulseViewTimer=null;const entries=[...pulseViewPending];pulseViewPending.clear();for(const kind of ['post','asset','stream']){const group=entries.filter(([key])=>key.startsWith(kind+':'));for(let i=0;i<group.length;i+=100){const chunk=group.slice(i,i+100);const {error}=await client.rpc('corp_pulse_record_views',{p_kind:kind,p_ids:chunk.map(([key])=>key.split(':')[1])});for(const [key,value] of chunk){if(error)pulseSeen.delete(value.seen);else if(value.node.isConnected)value.node._pulseRefresh?.()}}}},450);
 },{root:scroll,threshold:.5});
}

let pulseSummaryScheduled=false;
function pulseTarget(a){return {kind:a.bunny_stream?'stream':'asset',id:a.id}}
function pulseMediaReference(body){const m=String(body||'').match(/(?:^|\n)BLACKCELL MEDIA: (asset|stream):([0-9a-f-]{36})\s*$/i);return m&&UUID.test(m[2])?{kind:m[1],id:m[2],comment:String(body).slice(0,m.index).trim()}:null}
function pulseReference(t){return t.kind==='post'?'BLACKCELL REBLOG: '+t.id:'BLACKCELL MEDIA: '+t.kind+':'+t.id}
function pulseFindMedia(t){return (t.kind==='stream'?state.streamVideos:state.assets).find(a=>a.id===t.id&&sharedMedia(a)&&!pulseCinema(a)&&['photo','video'].includes(a.kind)&&(a.purpose==='library'||a.purpose==='post'))}
function pulseButton(label,icon,fn){const b=btn(icon,fn,'bc-pulse-action');b.title=label;b.setAttribute('aria-label',label);return b}
function pulseQueue(t,render){
 const key=t.kind+':'+t.id;if(!pulsePending.has(key))pulsePending.set(key,{t,callbacks:[]});pulsePending.get(key).callbacks.push(render);
 if(pulseSummaryScheduled)return;pulseSummaryScheduled=true;queueMicrotask(async()=>{
  pulseSummaryScheduled=false;const batch=[...pulsePending.values()];pulsePending.clear();
  for(const kind of ['post','asset','stream']){
   const items=batch.filter(x=>x.t.kind===kind);
   for(let i=0;i<items.length;i+=100){const group=items.slice(i,i+100);const {data,error}=await client.rpc('corp_pulse_summary',{p_kind:kind,p_ids:group.map(x=>x.t.id)});
    for(const x of group){const row=data?.find(d=>d.target_id===x.t.id)||{};for(const cb of x.callbacks)cb(error?null:row)}
   }
  }
 });
}
async function pulseToggle(t,action,selected){const q=client.from('corp_pulse_interactions');const result=selected?await q.delete().eq('target_kind',t.kind).eq('target_id',t.id).eq('user_id',state.user.id).eq('action',action):await q.insert({target_kind:t.kind,target_id:t.id,user_id:state.user.id,action});if(result.error)throw result.error;if(action==='bookmark'){if(selected)pulseSaved.delete(pulseKey(t));else pulseSaved.add(pulseKey(t));}}
function pulseQuote(t){
 const field=$('postBody'),line=pulseReference(t);
 if(reblogReference(field.value)||videoShareReference(field.value)||pulseMediaReference(field.value)){toast('Finish the existing share draft first.');return}
 const body=(field.value.trim()?field.value.trim()+'\n\n':'')+line;
 if(body.length>1000){toast('Shorten your draft before sharing.');return}
 switchView('profile',{who:state.user.id,tab:'posts'});field.value=body;updateCounter();focusProfileComposer();toast('Quote added to your draft. Publish when ready.');
}
async function pulseRepost(t){
 const line=pulseReference(t);
 if(state.posts.some(p=>p.author_id===state.user.id&&p.body===line)){toast('You already reposted this item.');return}
 const {data:existing,error:checkError}=await client.from('corp_social_posts').select('id').eq('author_id',state.user.id).eq('body',line).limit(1);
 if(checkError)throw checkError;if(existing?.length){toast('You already reposted this item.');return}
 const {data,error}=await client.from('corp_social_posts').insert({author_id:state.user.id,body:line,kind:'update'}).select('*').single();
 if(error)throw error;state.posts.unshift(data);renderAll();toast('Reposted to your timeline.');
}
function pulseLink(t){const u=new URL(location.href);u.search='';u.hash='';if(t.kind==='post')u.searchParams.set('post',t.id);else{u.searchParams.set('view','pulse');u.searchParams.set('media',pulseKey(t))}return u.href}

/* Resolve only BLACKCELL share IDs using the viewer's own database permissions. */
function pulseParseSharedLinks(body,base=location.href){
 const seen=new Set(),links=[];
 for(const match of String(body||'').matchAll(/https:\/\/[^\s<>"']+/gi)){
  const raw=match[0].replace(/[.,!?;)\]}]+$/g,'');let u;
  try{u=new URL(raw)}catch{continue}
  if(![new URL(base).origin,'https://blackcellcorp.com','https://www.blackcellcorp.com'].includes(u.origin)||u.username||u.password||!/(?:^|\/)corporate-network\.html$/.test(u.pathname))continue;
  const post=u.searchParams.get('post'),media=(u.searchParams.get('media')||'').split(':');
  const target=UUID.test(post||'')?{kind:'post',id:post}:media.length===2&&['asset','stream'].includes(media[0])&&UUID.test(media[1])?{kind:media[0],id:media[1]}:null;
  if(!target)continue;target.id=target.id.toLowerCase();const key=target.kind+':'+target.id;
  if(seen.has(key))continue;seen.add(key);links.push({...target,raw});if(links.length===3)break;
 }
 return links;
}
function pulseSharedText(body,links){let text=String(body||'');for(const link of links)text=text.split(link.raw).join('');return text.trim()}
async function pulsePreviewTarget(t){
 if(t.kind==='post'){
  const {data,error}=await client.from('corp_social_posts').select('id,author_id,body,kind,created_at').eq('id',t.id).maybeSingle();
  if(error||!data)return null;
  const {data:assets,error:assetError}=await client.from('corp_social_assets').select('*').eq('post_id',t.id).eq('purpose','post').eq('review_status','approved').eq('adult_restricted',false).in('kind',['photo','video']).order('created_at').limit(6);
  if(assetError)return null;
  return {owner:data.author_id,caption:data.body||'',media:(assets||[]).filter(a=>!pulseCinema(a)&&sharedMedia(a))};
 }
 const stream=t.kind==='stream';
 const {data,error}=await client.from(stream?'corp_stream_videos':'corp_social_assets').select('*').eq('id',t.id).eq('review_status','approved').eq('adult_restricted',false).maybeSingle();
 if(error||!data)return null;
 if(stream&&!['uploaded','processing','ready'].includes(data.upload_status))return null;
 const a=stream?{...data,kind:'video',purpose:'post',bunny_stream:true,video_poster_path:data.poster_path}:data;
 if(!pulseArchiveMedia(a))return null;return {owner:a.owner_id,caption:a.caption||a.title||'',media:[a]};
}
function pulsePreviewPicture(a,valid){
 const frame=el('div','bc-pulse-share-frame'),placeholder=el('span','bc-pw-placeholder',a.kind==='photo'?'Loading photograph…':'▶ Video'),img=el('img');
 img.hidden=true;img.alt=a.caption||a.title||'Shared media';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';frame.append(placeholder,img);
 const open=btn('',()=>{if(a.kind==='photo'){if(!img.hidden&&img.src)profileWorlds.openFeedPhoto(img,a);else toast('Photo preview is not available.')}else location.assign(pulseLink(pulseTarget(a)))},'bc-pulse-share-picture');open.append(frame);open.setAttribute('aria-label',a.kind==='photo'?'Open shared photo':'Open shared video');
 if(a.kind==='photo'&&a.source_provider==='world-bunny-v1'){profileWorlds.mountFeedPhoto(a,img)}
 else if(a.kind==='photo'||a.video_poster_path||a.poster_path){
  const path=a.kind==='photo'?a.storage_path:a.video_poster_path||a.poster_path;
  if(path)void(async()=>{try{const {data,error}=await bucket.createSignedUrl(path,1800);if(!valid()||!open.isConnected)return;if(error||!data?.signedUrl)throw Error('Preview unavailable');img.src=data.signedUrl;img.hidden=false;placeholder.hidden=true}catch{if(valid()&&open.isConnected)placeholder.textContent='Preview unavailable'}})()
 }else if(isWorldVideo(a)){worldVideoPreviews.mount(a,img);img.addEventListener('load',()=>{if(valid())placeholder.hidden=true},{once:true})}
 if(a.kind==='video')open.append(el('span','bc-pulse-archive-play','▶'));
 return open;
}
function pulseInlineShare(t){
 const card=el('section','bc-pulse-share-preview'),status=el('p','bc-pulse-share-status','Loading shared content…');card.append(status);
 const uid=state.user?.id,valid=()=>card.isConnected&&state.user?.id===uid,original=()=>location.assign(pulseLink(t));
 const load=async()=>{if(!valid())return;try{
  let data=await pulsePreviewTarget(t);if(!valid())return;
  if(data&&!data.media.length&&t.kind==='post'){
   const native=pulseMediaReference(data.caption)||reblogReference(data.caption)||videoShareReference(data.caption);
   const nested=native?{kind:native.kind||(reblogReference(data.caption)?'post':'asset'),id:native.id}:pulseParseSharedLinks(data.caption)[0];
   if(nested&&!(nested.kind===t.kind&&nested.id===t.id)){const source=await pulsePreviewTarget(nested);if(!valid())return;if(source?.media.length)data={...data,caption:native?.comment||pulseSharedText(data.caption,pulseParseSharedLinks(data.caption)),media:source.media}}
  }
  card.replaceChildren();
  if(!data){card.append(el('p','bc-pulse-share-status','Shared content is unavailable to your account.'));return}
  const author=profile(data.owner),header=el('div','bc-pulse-share-header'),who=el('div','bc-pulse-share-author');
  who.append(el('small','','SHARED FROM BLACKCELL PULSE'),btn(personName(author),()=>pulseMemberOpen(data.owner),'bc-pulse-member-secondary'));header.append(avatar(author,'small'),who,btn('Open original ↗',original,'bc-pulse-member-secondary'));card.append(header);
  const caption=pulseSharedText(data.caption,pulseParseSharedLinks(data.caption));if(caption&&!/BLACKCELL (?:MEDIA|REBLOG|VIDEO):/.test(caption))card.append(el('p','post-body',caption));
  if(data.media.length){const grid=el('div','bc-pulse-share-grid'+(data.media.length===1?' single':''));card.append(grid);for(const a of data.media)grid.append(pulsePreviewPicture(a,valid))}
  else card.append(el('p','bc-pulse-share-status','Shared post · no available media'));
 }catch(e){if(valid()){card.replaceChildren(el('p','bc-pulse-share-status','Preview unavailable.'),btn('Open original ↗',original,'bc-pulse-member-secondary'))}}};
 if(typeof IntersectionObserver==='function'){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void load()}},{rootMargin:'240px'});observer.observe(card);setTimeout(()=>observer.disconnect(),90000)}else queueMicrotask(load);
 return card;
}
function pulseDraftLinkPreview(){
 const input=$('postBody');if(!input)return;let box=$('pulseDraftPreview');
 if(!box){box=el('div','bc-pulse-draft-preview');box.id='pulseDraftPreview';input.after(box)}
 const links=pulseParseSharedLinks(input.value),media=pulseMediaReference(input.value),post=reblogReference(input.value);if(media)links.unshift({kind:media.kind,id:media.id});else if(post)links.unshift({kind:'post',id:post.id});const key=links.map(x=>x.kind+':'+x.id).join('|');if(box.dataset.key===key)return;box.dataset.key=key;box.replaceChildren();box.hidden=!links.length;
 for(const link of links)box.append(pulseInlineShare(link));
}

function pulseShareMenu(t){const menu=el('details','bc-pulse-menu'),trigger=el('summary','','↗'),options=el('div','bc-pulse-menu-options');trigger.title='Share';trigger.setAttribute('aria-label','Share');options.append(btn('Share to PULSE',()=>{menu.open=false;pulseQuote(t)}));options.append(btn('Copy private link',async()=>{menu.open=false;try{await navigator.clipboard.writeText(pulseLink(t));toast('Private link copied. Verified members only.')}catch(e){toast('Unable to copy private link.')}}));if(navigator.share)options.append(btn('Share link…',async()=>{menu.open=false;try{await navigator.share({title:'BLACKCELL PULSE',url:pulseLink(t)})}catch(e){if(e.name!=='AbortError')toast('Unable to share link.')}}));if(state.member?.role==='owner'||state.member?.can_chat===true)options.append(btn('Copy link & open iMessage',async()=>{menu.open=false;try{await navigator.clipboard.writeText(pulseLink(t));window.dispatchEvent(new CustomEvent('blackcell-open-imessage'));toast('Link copied. Paste it into your chosen conversation.')}catch(e){toast('Unable to copy private link.')}}));menu.append(trigger,options);return menu}
function pulseMediaActions(node,a){
 const t=pulseTarget(a),bar=el('div','post-actions bc-pulse-interactions'),zone=el('div','comment-zone');zone.hidden=true;const repost=pulseRepostMenu(t),views=el('span','bc-pulse-view-count','▥');views.title='Unique verified member views';
 let current=null;
 const update=row=>{if(!bar.isConnected)return;current=row;like.disabled=!row;bookmark.disabled=!row;like.textContent=row?(row.liked?'♥':'♡')+' '+(row.hearts||0):'♡';like.classList.toggle('liked',!!row?.liked);like.setAttribute('aria-pressed',String(!!row?.liked));reply.textContent=row?'◯ '+(row.replies||0):'◯';bookmark.textContent=row?.bookmarked?'▣':'▱';bookmark.setAttribute('aria-pressed',String(!!row?.bookmarked));pulseRepostPaint(repost,row);views.textContent=row?'▥ '+(row.views||0):'▥';};
 const change=async(action,b)=>{if(!current)return;b.disabled=true;try{await pulseToggle(t,action,action==='like'?current.liked:current.bookmarked);pulseQueue(t,update)}catch(e){toast('Unable to save: '+fail(e));b.disabled=false}};
 const like=pulseButton('Like or unlike','♡',()=>void change('like',like)),bookmark=pulseButton('Save or remove bookmark','▱',()=>void change('bookmark',bookmark));like.disabled=bookmark.disabled=true;
 const loadReplies=async()=>{zone.replaceChildren(el('p','','Loading replies…'));const {data,error}=await client.from('corp_pulse_interactions').select('id,user_id,body,created_at').eq('target_kind',t.kind).eq('target_id',t.id).eq('action','comment').order('created_at',{ascending:false}).limit(100);if(zone.hidden)return;zone.replaceChildren();if(error){zone.append(el('p','','Replies unavailable. Try again.'));return}
  for(const c of [...(data||[])].reverse()){const row=el('div','comment'),main=el('div','comment-main');row.append(avatar(profile(c.user_id),'small'));main.append(el('strong','',personName(profile(c.user_id))),el('small','',stamp(c.created_at)),el('p','',c.body));row.append(main);zone.append(row)}
  const form=el('form','comment-compose'),input=el('input'),send=el('button','','Reply');input.required=true;input.maxLength=1000;input.placeholder='Write a reply…';send.type='submit';form.append(input,send);form.addEventListener('submit',async e=>{e.preventDefault();if(!input.value.trim())return;send.disabled=true;const {error}=await client.from('corp_pulse_interactions').insert({target_kind:t.kind,target_id:t.id,action:'comment',user_id:state.user.id,body:input.value.trim()});if(error){toast('Reply not saved: '+fail(error));send.disabled=false;return}pulseQueue(t,update);void loadReplies()});zone.append(form)
 };
 const reply=pulseButton('Comments','◯',()=>{zone.hidden=!zone.hidden;if(!zone.hidden)void loadReplies()});
 bar.append(reply,repost,like,views,bookmark,pulseShareMenu(t),pulseMore(t,a.owner_id,a));
 node.append(bar,zone);pulseQueue(t,update);pulseViewAnchor(node,t,update);
}
function pulseRepostMenu(t){const menu=el('details','bc-pulse-menu'),trigger=el('summary','','↻');trigger.title='Repost or quote';trigger.setAttribute('aria-label','Repost or quote');const options=el('div','bc-pulse-menu-options');options.append(btn('Repost',async()=>{menu.open=false;try{await pulseRepost(t)}catch(e){toast('Repost failed: '+fail(e))}}),btn('Quote post',()=>{menu.open=false;pulseQuote(t)}));menu.append(trigger,options);return menu}
function pulseRepostPaint(menu,row){const trigger=menu?.querySelector('summary');if(!trigger)return;trigger.textContent=row?'↻ '+(row.reposts||0):'↻';trigger.classList.toggle('bc-pulse-reposted',!!row?.reposted);}
function pulseMore(t,owner,media=null){const menu=el('details','bc-pulse-menu'),trigger=el('summary','','⋯'),options=el('div','bc-pulse-menu-options');trigger.setAttribute('aria-label','More options');if(owner!==state.user.id)options.append(btn(following(owner)?'Unfollow':'Follow',()=>{menu.open=false;void toggleFollow(owner)}),btn(pulseMutes.has(owner)?'Unmute':'Mute',()=>{menu.open=false;void pulseMute(owner)}));if(media?.kind==='photo'&&media.source_provider!=='world-bunny-v1'){const transfer=btn('Transfer to Photos',()=>{});attachPhotoTransfer(transfer,{client,getPhoto:()=>media,notify:toast});options.append(transfer)}options.append(btn('Report',async()=>{menu.open=false;const reason=prompt('Why are you reporting this item?');if(!reason?.trim())return;const {error}=await client.from('corp_pulse_interactions').insert({target_kind:t.kind,target_id:t.id,user_id:state.user.id,action:'report',body:reason.trim().slice(0,1000)});toast(error?'Report not saved: '+fail(error):'Report recorded privately.')}));menu.append(trigger,options);return menu}
function pulsePostExtras(actions,p,node,repost){const t={kind:'post',id:p.id};let saved=false;const views=el('span','bc-pulse-view-count','▥');views.title='Unique verified member views';const bookmark=pulseButton('Save or remove bookmark','▱',async()=>{bookmark.disabled=true;try{await pulseToggle(t,'bookmark',saved);pulseQueue(t,update)}catch(e){toast('Bookmark not saved: '+fail(e));bookmark.disabled=false}});const update=row=>{if(!bookmark.isConnected)return;bookmark.disabled=!row;saved=!!row?.bookmarked;bookmark.textContent=saved?'▣':'▱';bookmark.setAttribute('aria-pressed',String(saved));pulseRepostPaint(repost,row);views.textContent=row?'▥ '+(row.views||0):'▥';};bookmark.disabled=true;actions.append(views,bookmark,pulseMore(t,p.author_id));pulseQueue(t,update);pulseViewAnchor(node,t,update)}

function renderPost(p,{reblogSource=false}={}){
 const node=el('article',reblogSource?'bc-pulse-reblog-source':'panel post');if(!reblogSource)node.id='post-'+p.id;
 const person=profile(p.author_id);
 const head=el('div','post-head');
 const pic=avatar(person,'small');
 pic.style.cursor='pointer';pic.addEventListener('click',()=>pulseMemberOpen(p.author_id));
 const title=el('div','post-author');
 const name=btn(personName(person),()=>pulseMemberOpen(p.author_id));
 title.append(name,el('small','',personHandle(person)+' · '+stamp(p.created_at)));
 head.append(pic,title,el('span','post-label',postType(p)));if(reblogSource&&p.author_id!==state.user.id)head.append(btn(following(p.author_id)?'Following':'Follow',()=>void toggleFollow(p.author_id),'bc-pulse-member-secondary'));
 node.append(head);
 const videoRef=videoShareReference(p.body),reference=reblogReference(p.body),mediaRef=pulseMediaReference(p.body);
 if(mediaRef){
  if(mediaRef.comment)node.append(el('div','post-body',mediaRef.comment));
  const original=pulseFindMedia(mediaRef);node.append(el('small','library-feed-context','↻ REPOSTED MEDIA'));
  if(original){const nested=renderLibraryActivity(original);nested.removeAttribute('id');node.append(nested)}else node.append(pulseInlineShare(mediaRef));
 }else if(videoRef){
  if(videoRef.comment)node.append(el('div','post-body',videoRef.comment));
  const card=el('div','bc-fusion-reblog');card.append(el('small','','▶ SHARED WITHIN BLACKCELL TUBE'));
  const a=[...state.assets,...(state.streamVideos||[])].find(x=>x.id===videoRef.id&&x.kind==='video'&&sharedMedia(x)&&(state.view!=='pulse'||!pulseCinema(x)));
  if(a){card.append(el('strong','',isWorldVideo(a)?worldVideoTitle(a):String(a.title||a.caption||a.filename||'Video').slice(0,180)),el('p','','Shared video · BLACKCELL members only'));card.append(btn('Watch in BLACKCELL Tube ▶',()=>{switchView('videos');videoChannel.openById(a.id)}))}
  else card.append(el('p','','This video is not available to your account or is no longer shared.'));
  node.append(card);
 }else if(reference){
  if(reference.comment)node.append(el('div','post-body',reference.comment));
  const original=state.posts.find(x=>x.id===reference.id&&x.id!==p.id);
  const card=el('div','bc-fusion-reblog');card.append(el('small','','↻ REBLOGGED FROM BLACKCELL NETWORK'));
  // Only display an original already visible to this session; never copy its media or bypass RLS.
  if(original&&!reblogSource&&!reblogReference(original.body)&&!pulseMediaReference(original.body)){card.append(renderPost(original,{reblogSource:true}));}else if(original){const sourcePerson=profile(original.author_id);card.append(el('strong','',personName(sourcePerson)),el('p','',String(reblogReference(original.body)?.comment||pulseMediaReference(original.body)?.comment||'Shared post').slice(0,300)));}else card.append(pulseInlineShare({kind:'post',id:reference.id}));
  const open=btn('View original post ↗',()=>{const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('post',reference.id);location.assign(u.href)});card.append(open);node.append(card);
 }else if(p.body){const links=pulseParseSharedLinks(p.body),body=pulseSharedText(p.body,links);if(body)node.append(el('div','post-body',body));for(const link of links)if(link.kind!=='post'||link.id!==p.id)node.append(pulseInlineShare(link));}
 const files=postedAssets(p.id).filter(a=>state.view!=='pulse'||!pulseCinema(a));
 if(files.length){
  const wrap=el('div','post-media post-media-original'+(files.length===2?' two':files.length>=3?' three':''));
  for(const f of files.slice(0,6)){
   const src=mediaUrl(f);if(!src)continue;
   if(f.kind==='video'){
    const v=el('video');v.src=src;v.controls=true;v.preload='none';v.playsInline=true;
    v.classList.add('post-media-original-video');
    v.setAttribute('aria-label',f.filename);
    // No fixed-height poster: render the entire original video frame.
    v.style.setProperty('width','100%','important');
    v.style.setProperty('height','auto','important');
    v.style.setProperty('max-height','none','important');
    v.style.setProperty('object-fit','contain','important');
    profileWorlds.bindFeedPhoto(v,f);wrap.append(v);
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
    profileWorlds.bindFeedPhoto(link,f);link.append(img);wrap.append(link);
   }
  }
  node.append(wrap);
 }
 if(reblogSource)return node;
 const actions=el('div','post-actions bc-pulse-interactions');
 const likeCount=state.likes.filter(l=>l.post_id===p.id).length;
 const like=pulseButton(liking(p.id)?'Unlike post':'Like post',(liking(p.id)?'♥':'♡')+' '+likeCount,()=>void toggleLike(p.id));
 like.classList.toggle('liked',liking(p.id));
 like.setAttribute('aria-label',liking(p.id)?'Unlike post':'Like post');
 const replies=pulseButton('Comments','◯ '+state.comments.filter(c=>c.post_id===p.id).length,()=>{
  if(state.openComments.has(p.id))state.openComments.delete(p.id);
  else state.openComments.add(p.id);
  renderAll();
 });
 const share=pulseShareMenu({kind:'post',id:p.id});
 actions.append(replies);
 const repost=pulseRepostMenu({kind:'post',id:p.id});if(!(state.view==='profile'&&state.profilePreview))actions.append(repost);
 actions.append(like);
 if(!(state.view==='profile'&&state.profilePreview))pulsePostExtras(actions,p,node,repost);
 actions.append(share);
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
// Inline World playback: keep a single private stream/download active.
let feedPlayback=null;
function stopFeedPlayback(){const player=feedPlayback;feedPlayback=null;player?.dispose()}
function inlineWorldVideo(a){
 const frame=el('div','bc-feed-video-frame'),poster=el('img','bc-feed-video-poster');poster.alt='Video thumbnail';poster.hidden=true;poster.loading='lazy';poster.decoding='async';
 const title=worldVideoTitle(a),play=btn('▶ Play video',()=>void start(),'bc-feed-video-play'),status=el('p','bc-feed-video-status',title);
 const v=el('video','bc-feed-inline-video');v.controls=true;v.playsInline=true;v.preload='none';v.hidden=true;v.setAttribute('aria-label',title);
 const quality=el('select','bc-feed-video-quality');quality.hidden=true;quality.setAttribute('aria-label','Video quality');
 frame.append(poster,play,v,quality,status);
 const saved=posterUrl(a);if(saved){poster.src=saved;poster.hidden=false;v.poster=saved}else worldVideoPreviews.mount(a,poster);
 async function start(){
  if(!frame.isConnected||!sharedMedia(a)||pulseCinema(a)||feedPlayback?.frame===frame)return;
  stopFeedPlayback();const uid=state.user?.id,controller=new AbortController();let rendered=null,url=null,seq=0,disposed=false,visibility=null;
  const valid=()=>!disposed&&feedPlayback?.frame===frame&&frame.isConnected&&state.user?.id===uid;
  const dispose=()=>{disposed=true;seq++;frame.classList.remove('is-playing');controller.abort();visibility?.disconnect();rendered?.destroy();v.pause();v.removeAttribute('src');v.load();if(url)URL.revokeObjectURL(url);v.hidden=true;quality.hidden=true;play.hidden=false;poster.hidden=!poster.getAttribute('src');status.textContent=title;worldVideoPreviews.setPaused(false)};
  feedPlayback={frame,dispose};frame.classList.add('is-playing');
  play.hidden=true;poster.hidden=true;v.hidden=false;v.muted=state.view==='pulse'&&pulseAutoplay;status.textContent='Connecting private video…';
  worldVideoPreviews.setPaused(true);
  if(typeof IntersectionObserver==='function'){visibility=new IntersectionObserver(entries=>{if(entries.some(e=>!e.isIntersecting)&&valid())stopFeedPlayback()},{threshold:0});visibility.observe(frame)}
  const original=async(position=0)=>{const n=++seq;rendered?.destroy();rendered=null;quality.hidden=true;status.textContent='Loading full-quality video…';try{const blob=await readWorldVideo(client,a,{signal:controller.signal});if(!valid()||n!==seq)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);v.src=url;v.onloadedmetadata=()=>{if(position>0&&position<v.duration)v.currentTime=position};v.load();status.textContent=title;void v.play().catch(()=>{})}catch(e){if(!valid())return;stopFeedPlayback();status.textContent='Unable to play video. Tap Play video to retry.'}};
  const n=++seq;const adaptive=await attachRenderedWorld({client,asset:a,video:v,qualityMenu:quality,alive:()=>valid()&&seq===n,onReady:()=>{if(valid()){quality.hidden=false;status.textContent=title}},onFatal:position=>{if(valid())void original(position)},onOriginal:position=>{if(valid())void original(position)}});
  if(!valid()||n!==seq){adaptive?.destroy();return}if(adaptive){rendered=adaptive;return}await original();
 }
 return frame;
}
function renderLibraryActivity(a){
 const node=el('article','panel post library-feed-post');
 node.id='library-media-'+a.id;
 const person=profile(a.owner_id);
 const head=el('div','post-head');
 const pic=avatar(person,'small');
 pic.style.cursor='pointer';
 pic.addEventListener('click',()=>pulseMemberOpen(a.owner_id));
 const title=el('div','post-author');
 title.append(btn(personName(person),()=>pulseMemberOpen(a.owner_id)),
   el('small','',personHandle(person)+' · '+stamp(a.created_at)));
 head.append(pic,title,el('span','post-label',a.kind==='video'?'VIDEO UPLOADED':'PHOTO UPLOADED'));
 node.append(head);
 const caption=String(a.caption||'').trim();
 node.append(el('div','library-feed-context',a.bunny_stream?'BLACKCELL TUBE':a.source_provider==='world-bunny-v1'?'WORLD UPLOAD':'LIBRARY UPLOAD'));
 if(caption)node.append(el('div','post-body',caption));
 const tags=[a.military_branch,a.military_category,a.military_era].filter(v=>v&&v!=='Unspecified'&&v!=='Unsorted');
 if(tags.length)node.append(el('div','library-feed-tags',tags.join('  ·  ')));
 const src=mediaUrl(a);
 if(src){
  const wrap=el('div','post-media post-media-original library-feed-media');
  if(a.kind==='video'){
   const v=el('video','post-media-original-video');
   v.src=src;v.controls=true;v.playsInline=true;v.preload='none';
   v.style.width='100%';v.style.height='auto';v.style.objectFit='contain';
   profileWorlds.bindFeedPhoto(v,a);wrap.append(v);
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
   profileWorlds.bindFeedPhoto(link,a);link.append(img);wrap.append(link);
  }
  node.append(wrap);
 }
 if(!src&&a.source_provider==='world-bunny-v1'&&a.kind==='photo'){const frame=el('div','bc-pw-frame');const img=el('img');img.hidden=true;img.alt=caption||'World photo';img.loading='lazy';frame.append(el('span','bc-pw-placeholder','Loading photograph…'),img);const open=btn('',()=>profileWorlds.openFeedPhoto(img,a),'bc-pw-media');open.append(frame);node.append(open);profileWorlds.bindFeedPhoto(open,a);profileWorlds.mountFeedPhoto(a,img)}
 if(!src&&isWorldVideo(a)&&sharedMedia(a)&&!pulseCinema(a)){const player=inlineWorldVideo(a);node.append(player);profileWorlds.bindFeedPhoto(player,a)}
 else if(!src&&a.kind==='video'){const frame=el('div','bc-pw-frame');const img=el('img');img.hidden=true;img.alt='';const poster=posterUrl(a);frame.append(el('span','bc-pw-placeholder','▶'),img);if(poster){img.src=poster;img.hidden=false}const open=btn('',()=>{const u=new URL(location.href);u.search='';u.searchParams.set('view','videos');u.searchParams.set('video',a.id);location.assign(u.href)},'bc-pw-media');open.append(frame);node.append(open);profileWorlds.bindFeedPhoto(open,a)}
 const actions=el('div','post-actions');
 if(a.kind==='video')actions.append(btn('▶ WATCH IN BLACKCELL TUBE',()=>{const u=new URL(location.href);u.search='';u.searchParams.set('view','videos');u.searchParams.set('video',a.id);location.assign(u.href)}));else if(a.source_provider!=='world-bunny-v1')actions.append(btn('▧ VIEW ORIGINAL',()=>void photos.openAsset(a)));
 actions.append(btn('◌  VIEW PROFILE',()=>openProfile(a.owner_id)));
 node.append(actions);
 if(!(state.view==='profile'&&state.profilePreview)&&sharedMedia(a)&&!pulseCinema(a))pulseMediaActions(node,a);
 return node;
}

/* The personal timeline consumes only posts already returned by the
   authenticated Network query. Cinema uploads are not social posts. */
function selectProfileFeedPosts(posts,assets,follows,userId,mode,worlds=[]){
 const followingIds=new Set(follows.filter(f=>f.follower_id===userId).map(f=>f.following_id));
 const cinema=a=>['movie','series','documentary'].includes(String(a.video_category||'').trim().toLowerCase());
 const visibleByPost=new Map();
 for(const a of assets){if(!a.post_id||a.purpose!=='post'||a.review_status!=='approved'||a.adult_restricted===true)continue;const group=visibleByPost.get(a.post_id)||[];group.push(a);visibleByPost.set(a.post_id,group)}
 const tags=new Set(worlds.map(w=>'maf:'+w));
 return posts.filter(p=>{
  const files=visibleByPost.get(p.id)||[];
  if(files.length&&files.every(cinema))return false;
  if(mode==='following'&&!followingIds.has(p.author_id))return false;
  if(mode==='worlds')return tags.size>0&&files.some(a=>!cinema(a)&&(a.military_tags||[]).some(t=>tags.has(t)||(tags.has('maf:uniform')&&String(t).startsWith('maf:'))));
  return true;
 }).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
}
// BLACKCELL PULSE uses only the signed-in Network catalog and existing RLS-backed actions.
const pulseCinema=a=>['movie','series','documentary','tv','tv show','tv_show'].includes(String(a?.video_category||'').trim().toLowerCase());
function clearPulse(){pulseActivityToken++;profileWorlds.clear();pulseViewObserver?.disconnect();pulseViewObserver=null;stopFeedPlayback();pulseRevision++;pulseObserver?.disconnect();pulseObserver=null;pulseVideos?.disconnect();pulseVideos=null;pulseVisible.clear();for(const v of $('pulseView')?.querySelectorAll('video')||[])v.pause();}
function pulseEntries(){
 const mode=pulseMode==='following'?'following':'latest';
 const posts=selectProfileFeedPosts(state.posts,state.assets,state.follows,state.user.id,mode).filter(p=>pulseMode!=='author'||p.author_id===pulseAuthor);
 const ids=new Set(state.follows.filter(f=>f.follower_id===state.user.id).map(f=>f.following_id));
 const uploads=[...state.assets,...(state.streamVideos||[])].filter(a=>sharedMedia(a)&&!pulseCinema(a)&&['photo','video'].includes(a.kind)&&(a.purpose==='library'||(a.bunny_stream&&!a.post_id))&&(pulseMode!=='author'||a.owner_id===pulseAuthor)&&(pulseMode!=='following'||ids.has(a.owner_id)));
 let entries=[...posts.map(item=>({type:'post',item})),...[...new Map(uploads.map(a=>[a.id,a])).values()].map(item=>({type:'library',item}))].sort((a,b)=>Date.parse(b.item.created_at||0)-Date.parse(a.item.created_at||0));
 if(pulseMode==='for-you')entries=personalization.rankFeed(entries);
 if(pulseMode==='saved')return entries.filter(e=>pulseSaved.has(pulseKey(pulseTargetFor(e))));
 return entries.filter(e=>!pulseMutes.has(e.type==='post'?e.item.author_id:e.item.owner_id));
}
function pulsePlay(){
 const candidates=[...pulseVisible].filter(([v,x])=>v.isConnected&&x>=.65).sort((a,b)=>b[1]-a[1]);
 const allowed=pulseAutoplay&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const next=allowed?candidates[0]?.[0]:null;
 for(const v of $('pulseView')?.querySelectorAll('video')||[]){if(v===next){if(!v.dataset.pulseStarted){v.muted=true;v.dataset.pulseStarted='1';void v.play().catch(()=>{})}}else{if(v.dataset.pulseStarted){v.pause();delete v.dataset.pulseStarted}}}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopFeedPlayback();if(state.view==='pulse')pulsePlay()});
window.addEventListener('pagehide',stopFeedPlayback);
async function loadPulseOlder(){
 if(pulseOlderBusy||pulseEnd||state.view!=='pulse')return;
 pulseOlderBusy=true;const rev=pulseRevision,uid=state.user.id;
 try{
  const sorted=state.posts.filter(p=>UUID.test(p.id)&&Number.isFinite(Date.parse(p.created_at))).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));
  const cursor=sorted[0];
  let query=client.from('corp_social_posts').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30);
  if(cursor){const stamp=new Date(cursor.created_at).toISOString();query=query.or('created_at.lt.'+stamp+',and(created_at.eq.'+stamp+',id.lt.'+cursor.id+')')}
  const response=await query;if(response.error)throw Error(response.error.message);
  const older=(response.data||[]).filter(p=>!state.posts.some(x=>x.id===p.id));
  if(state.user?.id!==uid||state.view!=='pulse'||rev!==pulseRevision)return;
  if(!older.length){pulseEnd=true;return}
  const ids=older.map(p=>p.id);
  const [assets,likes,comments]=await Promise.all([client.from('corp_social_assets').select('*').in('post_id',ids),client.from('corp_social_likes').select('post_id,user_id').in('post_id',ids),client.from('corp_social_comments').select('id,post_id,user_id,body,created_at').in('post_id',ids).order('created_at')]);
  if([assets,likes,comments].some(x=>x.error))throw Error('Unable to retrieve older feed entries.');
  if(state.user?.id!==uid||state.view!=='pulse'||rev!==pulseRevision)return;
  const seen=new Set(state.assets.map(a=>a.id));for(const a of assets.data||[])if(!seen.has(a.id)){state.assets.push(a);seen.add(a.id)}
  state.posts.push(...older);state.likes.push(...(likes.data||[]));state.comments.push(...(comments.data||[]));
  if(response.data.length<30)pulseEnd=true;
  await loadSigned();
 }catch(e){if(state.view==='pulse')toast('Older posts unavailable: '+fail(e));pulseEnd=true}
 finally{pulseOlderBusy=false;if(state.view==='pulse'&&rev===pulseRevision)renderPulse()}
}

/* Tumblr-style member blog and date-organized archive. Metadata pages first;
   private photo/thumbnail delivery is deferred until a tile is near the viewport. */
let pulseMemberTab='posts',pulseArchiveState=null,pulseActivityToken=0;
const pulseProfileMode=()=>pulseMode==='author'&&!!pulseAuthor;
function pulseMemberOpen(uid){if(state.view==='pulse'&&profile(uid)){switchView('pulse',{pulseWho:uid});return}openProfile(uid)}
function pulseMonthKey(a){const d=new Date(a.created_at);return Number.isFinite(d.getTime())?d.toISOString().slice(0,7):''}
function pulseMonthLabel(key){return new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key+'-01T00:00:00Z'))}
function pulseArchiveMedia(a){return a&&sharedMedia(a)&&!pulseCinema(a)&&['photo','video'].includes(a.kind)&&['library','post'].includes(a.purpose)}
function pulseArchiveTile(a){
 const tile=btn('',()=>{if(a.kind==='photo'){if(!img.hidden&&img.src)profileWorlds.openFeedPhoto(img,a);else toast('Photo preview is still loading.')}else location.assign(pulseLink(pulseTarget(a)))},'bc-pulse-archive-tile');
 const frame=el('div','bc-pulse-archive-frame'),placeholder=el('span','bc-pw-placeholder',a.kind==='video'?'▶':'Loading…'),img=el('img');
 img.alt=a.caption||a.title||(a.kind==='video'?'Video thumbnail':'Shared photograph');img.loading='lazy';img.decoding='async';img.hidden=true;
 frame.append(placeholder,img);tile.append(frame);
 if(a.kind==='video'){
  tile.append(el('span','bc-pulse-archive-play','▶'));
  const known=posterUrl(a);
  if(known){img.src=known;img.hidden=false;placeholder.hidden=true}
  else if(a.video_poster_path||a.poster_path){const path=a.video_poster_path||a.poster_path;const load=async()=>{if(!img.isConnected)return;const {data,error}=await bucket.createSignedUrl(path,1800);if(!error&&data?.signedUrl&&img.isConnected){img.src=data.signedUrl;img.hidden=false;placeholder.hidden=true}};if(typeof IntersectionObserver==='function'){const ob=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){ob.disconnect();void load()}},{rootMargin:'100px'});ob.observe(tile);setTimeout(()=>ob.disconnect(),60000)}else queueMicrotask(load)}
  else if(isWorldVideo(a)){worldVideoPreviews.mount(a,img);img.addEventListener('load',()=>{placeholder.hidden=true},{once:true})}
 }else{const known=mediaUrl(a);if(known){img.src=known;img.hidden=false;placeholder.hidden=true}else profileWorlds.mountFeedPhoto(a,img)}
 tile.setAttribute('aria-label',(a.kind==='photo'?'Open photograph: ':'Open video: ')+(a.caption||a.title||'Shared media')+' · '+stamp(a.created_at));
 profileWorlds.bindFeedPhoto(tile,a);return tile;
}
function pulseArchiveData(owner,month='',kind='all'){return {owner,month,kind,rows:[],cursor:null,done:false,busy:false,error:'',uid:state.user.id}}
function pulseArchiveQuery(table,a){
 const stream=table==='corp_stream_videos';
 let q=client.from(table).select(stream?'id,owner_id,title,filename,created_at,poster_path,video_category,review_status,adult_restricted,upload_status':'id,owner_id,post_id,purpose,kind,filename,caption,created_at,storage_path,bytes,source_provider,bunny_storage_path,video_category,video_poster_path,review_status,adult_restricted').eq('owner_id',a.owner).eq('review_status','approved').eq('adult_restricted',false);
 if(stream)q=q.in('upload_status',['uploaded','processing','ready']);else{q=q.in('purpose',['library','post']).in('kind',a.kind==='all'?['photo','video']:[a.kind])}
 if(a.month){const start=new Date(a.month+'-01T00:00:00Z');const next=new Date(start);next.setUTCMonth(next.getUTCMonth()+1);q=q.gte('created_at',start.toISOString()).lt('created_at',next.toISOString())}
 if(a.cursor)q=q.or('created_at.lt.'+a.cursor.created_at+',and(created_at.eq.'+a.cursor.created_at+',id.lt.'+a.cursor.id+')');
 return q.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(48);
}
async function pulseArchiveNext(a){
 if(a.busy||a.done||a.uid!==state.user?.id)return;a.busy=true;a.error='';
 try{
  const [photosResult,streamResult]=await Promise.all([pulseArchiveQuery('corp_social_assets',a),a.kind==='photo'?Promise.resolve({data:[]}):pulseArchiveQuery('corp_stream_videos',a)]);
  if(photosResult.error||streamResult.error)throw photosResult.error||streamResult.error;
  if(a!==pulseArchiveState||a.uid!==state.user?.id)return;
  const raw=[...(photosResult.data||[]),...(streamResult.data||[]).map(v=>({...v,kind:'video',purpose:'post',bunny_stream:true,video_poster_path:v.poster_path}))].sort((x,y)=>Date.parse(y.created_at)-Date.parse(x.created_at)||y.id.localeCompare(x.id));
  const page=raw.slice(0,48);a.done=raw.length<48;if(page.length)a.cursor=page[page.length-1];
  const known=new Set(a.rows.map(x=>pulseKey(pulseTarget(x))));
  for(const item of page){const key=pulseKey(pulseTarget(item));if(pulseArchiveMedia(item)&&!known.has(key)){a.rows.push(item);known.add(key)}}
 }catch(e){a.error=fail(e)}finally{a.busy=false;if(state.view==='pulse'&&pulseProfileMode()&&pulseMemberTab==='archive'&&a===pulseArchiveState)renderPulse()}
}
function pulseArchivePanel(box){
 const owner=pulseAuthor;
 let a=pulseArchiveState;if(!a||a.owner!==owner||a.uid!==state.user.id){a=pulseArchiveData(owner);pulseArchiveState=a}
 const top=el('div','bc-pulse-archive-controls'),label=el('div','bc-pulse-archive-title');
 label.append(el('h2','','Archive'),el('p','','All shared uploads · newest first'));
 const month=el('input');month.type='month';month.value=a.month;month.setAttribute('aria-label','Filter archive by month and year');
 const change=(m,k)=>{if(m&&!/^\d{4}-\d{2}$/.test(m))return;pulseArchiveState=pulseArchiveData(owner,m,k);renderPulse()};
 month.addEventListener('change',()=>change(month.value,a.kind));
 const filters=el('div','bc-pulse-archive-filters');for(const [key,name] of [['all','All media'],['photo','Photos'],['video','Videos']]){const b=btn(name,()=>change(a.month,key),'bc-pulse-member-tab');b.setAttribute('aria-pressed',String(a.kind===key));filters.append(b)}
 const dateTools=el('div','bc-pulse-archive-date');dateTools.append(month,btn('All months',()=>change('',a.kind),'bc-pulse-member-tab'));
 top.append(label,dateTools,filters);box.append(top);
 const groups=new Map();for(const item of a.rows){const key=pulseMonthKey(item);if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
 for(const [key,items] of groups){const section=el('section','bc-pulse-archive-month'),head=el('div','bc-pulse-archive-month-head'),grid=el('div','bc-pulse-archive-grid');head.append(el('h3','',pulseMonthLabel(key)),el('span','',items.length+' loaded'));for(const item of items)grid.append(pulseArchiveTile(item));section.append(head,grid);box.append(section)}
 if(a.error)box.append(el('p','bc-pulse-end','Archive could not be loaded: '+a.error));
 if(!groups.size&&a.done&&!a.error)box.append(empty('No shared media','No approved photographs or personal videos in this period.'));
 if(a.busy||(!a.cursor&&!a.done&&!a.error)){box.append(el('p','bc-pulse-end','Loading archive…'));if(!a.busy)queueMicrotask(()=>{if(a===pulseArchiveState&&!a.busy)void pulseArchiveNext(a)})}
 else if(!a.done||a.error)box.append(btn(a.error?'Retry':'Load earlier uploads',()=>void pulseArchiveNext(a),'bc-pulse-more'));
 else if(groups.size)box.append(el('p','bc-pulse-end','Beginning of archive.'));
}
function pulseMemberHeader(scroll){
 const p=profile(pulseAuthor);if(!p)return;
 const section=el('section','bc-pulse-member'),hero=el('div','bc-pulse-member-cover');cover(hero,p);
 const overlay=el('div','bc-pulse-cover-top');overlay.append(el('span','bc-pulse-handle',personHandle(p)),btn('⋯',()=>openProfile(p.user_id),'bc-pulse-member-icon'));hero.append(overlay);
 const identity=el('div','bc-pulse-member-identity'),pic=avatar(p,'gigantic');identity.append(pic,el('h1','',personName(p)),el('p','bc-pulse-member-bio',p.bio?.trim()||p.headline?.trim()||'Verified BLACKCELL member'));
 const buttons=el('div','bc-pulse-member-buttons');
 if(p.user_id===state.user.id)buttons.append(btn('Edit profile',()=>openProfile(p.user_id),'bc-pulse-member-primary'));
 else{buttons.append(btn(following(p.user_id)?'Following':'Follow',()=>void toggleFollow(p.user_id),'bc-pulse-member-primary'));if(state.member?.role==='owner'||state.member?.can_chat===true)buttons.append(btn('Message',()=>window.dispatchEvent(new CustomEvent('blackcell-open-imessage',{detail:{peerId:p.user_id,source:'pulse'}})),'bc-pulse-member-secondary'))}
 buttons.append(btn('Archive',()=>pulseSetMemberTab('archive'),'bc-pulse-member-secondary'));identity.append(buttons);
 const navigation=el('nav','bc-pulse-member-nav');navigation.setAttribute('aria-label','Member blog sections');
 for(const [key,name] of [['posts','Posts'],['likes','Likes'],['following','Following'],['comments','Comments'],['archive','Archive']]){const tab=btn(name,()=>pulseSetMemberTab(key),'bc-pulse-member-tab');tab.setAttribute('aria-pressed',String(pulseMemberTab===key));navigation.append(tab)}
 section.append(hero,identity,navigation);
 if(pulseMemberTab==='posts'){const recent=[...state.assets,...state.streamVideos].filter(a=>a.owner_id===p.user_id&&pulseArchiveMedia(a)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,3);if(recent.length){const strip=el('div','bc-pulse-member-preview');for(const a of recent)strip.append(pulseArchiveTile(a));section.append(strip)}}
 scroll.append(section);
}
function pulseSetMemberTab(tab){if(!pulseProfileMode())return;if(pulseMemberTab===tab)return;pulseMemberTab=tab;pulseLimit=12;pulseEnd=false;pulseAutoPages=0;if(pulseScroll)pulseScroll.scrollTop=0;renderPulse()}
async function pulseMemberActivity(box){
 const token=++pulseActivityToken,owner=pulseAuthor,tab=pulseMemberTab,uid=state.user.id;
 const valid=()=>box.isConnected&&token===pulseActivityToken&&state.view==='pulse'&&pulseProfileMode()&&pulseAuthor===owner&&pulseMemberTab===tab&&state.user?.id===uid;
 let offset=0;const list=el('div','bc-pulse-member-activity'),status=el('p','bc-pulse-end','Loading…');box.append(list,status);
 const more=async()=>{status.textContent='Loading…';status.hidden=false;try{
  if(tab==='following'){const {data,error}=await client.from('corp_social_follows').select('following_id').eq('follower_id',owner).order('following_id').range(offset,offset+49);if(error)throw error;if(!valid())return;for(const f of data||[]){const p=profile(f.following_id);if(!p)continue;const card=el('div','bc-pulse-activity-person');card.append(avatar(p,'small'),btn(personName(p),()=>pulseMemberOpen(p.user_id),'bc-pulse-member-secondary'));list.append(card)}offset+=50;finish((data||[]).length===50);return}
  const likes=tab==='likes',table=likes?'corp_social_likes':'corp_social_comments',fields=likes?'post_id,created_at':'post_id,body,created_at',action=likes?'like':'comment';
  const [posts,media]=await Promise.all([client.from(table).select(fields).eq('user_id',owner).order('created_at',{ascending:false}).range(0,offset+49),client.from('corp_pulse_interactions').select('target_kind,target_id,body,created_at').eq('user_id',owner).eq('action',action).order('created_at',{ascending:false}).range(0,offset+49)]);
  if(posts.error||media.error)throw posts.error||media.error;if(!valid())return;
  const records=[...(posts.data||[]).map(x=>({...x,target_kind:'post',target_id:x.post_id})),...(media.data||[])].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  const page=records.slice(offset,offset+50);for(const x of page){if(!UUID.test(x.target_id)||!['post','asset','stream'].includes(x.target_kind))continue;const item=el('div','bc-pulse-activity-item');item.append(el('strong','',likes?'Liked shared '+(x.target_kind==='post'?'post':'media'):'Commented on a shared item'),el('small','',stamp(x.created_at)));if(!likes)item.append(el('p','',x.body));item.append(btn('Open original ↗',()=>location.assign(pulseLink({kind:x.target_kind,id:x.target_id})),'bc-pulse-member-secondary'));list.append(item)}offset+=50;finish(records.length>offset||(posts.data||[]).length===offset||(media.data||[]).length===offset);
 }catch(e){if(valid())status.textContent='Activity unavailable: '+fail(e)}};
 const finish=hasMore=>{status.replaceChildren();if(!list.children.length){status.textContent='No visible activity yet.';return}if(hasMore)status.append(btn('Load more',()=>void more(),'bc-pulse-more'));else status.hidden=true};
 await more();
}

function renderPulse(){
 if(state.view!=='pulse')return;
 const root=$('pulseView'),savedScroll=pulseScroll?.scrollTop||0;clearPulse();root.replaceChildren();
 const head=el('header','bc-pulse-header'),brand=el('div','bc-pulse-brand');
 brand.append(el('span','bc-pulse-glyph','⌁'),el('strong','','BLACKCELL PULSE'),el('small','','DISCOVER · CONNECT · EXPRESS'));
 head.append(btn('‹ Profile',()=>openProfile(pulseAuthor||state.user.id),'bc-pulse-back'),brand,btn('＋ Post',()=>{openProfile(state.user.id,'posts');focusProfileComposer()},'bc-pulse-create'));
 const tabs=el('nav','bc-pulse-tabs');tabs.setAttribute('aria-label','PULSE feeds');
 for(const [key,label] of [['for-you','For You'],['following','Following'],['latest','Explore'],['saved','Saved'],['muted','Muted'],['author',pulseAuthor&&pulseAuthor!==state.user.id?personName(profile(pulseAuthor)):'My Feed']]){
  const tab=btn(label,async()=>{pulseMode=key;if(key==='author'&&!pulseAuthor){pulseAuthor=state.user.id;pulseMemberTab='posts';}pulseLimit=12;pulseEnd=key==='saved'||key==='muted';pulseAutoPages=0;if(pulseScroll)pulseScroll.scrollTop=0;if(key==='saved'){tab.disabled=true;tab.textContent='Loading saved…';try{await loadPulsePersonal();await loadSavedTargets()}catch(e){toast('Saved items unavailable: '+fail(e))}finally{tab.disabled=false;tab.textContent=label}}if(state.view==='pulse'&&pulseMode===key)renderPulse()},'bc-pulse-tab');tab.setAttribute('aria-pressed',String(pulseMode===key));tabs.append(tab)
 }
 const auto=btn(pulseAutoplay?'Autoplay on':'Autoplay off',()=>{pulseAutoplay=!pulseAutoplay;auto.textContent=pulseAutoplay?'Autoplay on':'Autoplay off';pulsePlay()},'bc-pulse-auto');tabs.append(auto);
 const scroll=el('div','bc-pulse-scroll');pulseScroll=scroll;const timeline=el('div','bc-pulse-timeline');if(pulseProfileMode())pulseMemberHeader(scroll);scroll.append(timeline);pulseViewSetup(scroll);
 root.append(head,tabs,scroll);scroll.scrollTop=savedScroll;
 if(pulseProfileMode()&&pulseMemberTab==='archive'){pulseArchivePanel(timeline);return}
 if(pulseProfileMode()&&pulseMemberTab!=='posts'){void pulseMemberActivity(timeline);return}
 if(pulseMode==='muted'){for(const id of pulseMutes){const row=el('div','panel post');row.append(el('strong','',personName(profile(id))),btn('Unmute',()=>void pulseMute(id)));timeline.append(row)}if(!pulseMutes.size)timeline.append(empty('No muted members','Members you mute will appear here.'));return}
 if(pulseMode==='saved'&&!pulsePersonalReady){timeline.append(empty('Saved items unavailable','Refresh to load your private bookmarks.'));return}
 const entries=pulseEntries();let rendered=0;
 const footer=el('div','bc-pulse-footer');scroll.append(footer);
 if(typeof IntersectionObserver==='function'){pulseVideos=new IntersectionObserver(items=>{for(const e of items)pulseVisible.set(e.target,e.intersectionRatio);pulsePlay()},{root:scroll,threshold:[0,.65,1]})}
 function add(count){
  const limit=Math.min(entries.length,count);
  for(;rendered<limit;rendered++){const x=entries[rendered],node=x.type==='post'?renderPost(x.item):renderLibraryActivity(x.item);timeline.append(node);for(const image of node.querySelectorAll('img')){image.decoding='async';image.loading='lazy'}for(const v of node.querySelectorAll('video')){v.preload='none';v.playsInline=true;if(!v.classList.contains('bc-feed-inline-video'))pulseVideos?.observe(v)}}
  footer.replaceChildren();
  if(rendered<entries.length){const more=btn('Load more',()=>{pulseLimit+=12;add(pulseLimit)},'bc-pulse-more');footer.append(more)}
  else if(!pulseEnd){footer.append(btn(pulseOlderBusy?'Loading older posts…':'Load older posts',()=>{pulseAutoPages=0;void loadPulseOlder()},'bc-pulse-more'))}
  else footer.append(el('p','bc-pulse-end','You are caught up.'));
  if(!entries.length&&!timeline.children.length)timeline.append(empty('No posts yet','Shared posts and personal media will appear here.'));
 }
 add(pulseLimit);scroll.scrollTop=savedScroll;
 if(typeof IntersectionObserver==='function')pulseObserver=new IntersectionObserver(items=>{if(!items.some(x=>x.isIntersecting)||state.view!=='pulse')return;if(rendered<entries.length){pulseLimit+=12;add(pulseLimit)}else if(!pulseOlderBusy&&!pulseEnd&&entries.length&&pulseAutoPages<3){pulseAutoPages++;void loadPulseOlder()}},{root:scroll,rootMargin:'450px 0px'}),pulseObserver.observe(footer);
}

function renderProfileSocialFeed(box){
 profileWorlds.clear();
 const mode=state.profileFeedMode;
 const tabs=el('nav','bc-profile-feed-modes');tabs.setAttribute('aria-label','Choose your social feed');
 for(const [key,label] of [['for-you','For You'],['following','Following'],['latest','Latest'],['worlds','My Worlds']]){
  const b=btn(label,()=>{if(state.profileFeedMode===key&&!state.deepPost)return;state.deepPost=null;state.profileFeedMode=key;state.profileFeedLimit=12;if(key==='worlds')profileWorlds.reset();renderProfile()},'bc-profile-feed-mode');b.setAttribute('aria-pressed',String(mode===key));tabs.append(b);
 }
 const refresh=btn(state.profileFeedRefreshing?'Refreshing…':'↻ Refresh',async()=>{
  if(state.profileFeedRefreshing||state.busy)return;
  state.profileFeedRefreshing=true;refresh.disabled=true;refresh.textContent='Refreshing…';
  try{await loadAll({show:false});toast('Network feed refreshed.')}catch(e){toast('Unable to refresh feed: '+fail(e))}
  finally{state.profileFeedRefreshing=false;if(state.view==='profile'&&state.profileUserId===state.user?.id&&!state.profilePreview&&state.profileTab==='worldfeed')renderProfile()}
 },'bc-profile-feed-refresh');refresh.disabled=state.profileFeedRefreshing;tabs.append(refresh);box.append(tabs);
 if(state.deepPost){const direct=state.posts.find(p=>p.id===state.deepPost);box.append(btn('← Back to My Feed',()=>switchView('profile',{who:state.user.id,tab:'worldfeed'}),'bc-pw-quiet'));box.append(direct?renderPost(direct):empty('Post unavailable','This post may have been removed or is not shared with your account.'));return}
 const posts=selectProfileFeedPosts(state.posts,state.assets,state.follows,state.user.id,mode,profileWorlds.currentScope());
 let entries=posts.map(item=>({type:'post',item}));
 if(mode!=='worlds'){
  const followed=new Set(state.follows.filter(f=>f.follower_id===state.user.id).map(f=>f.following_id));
  const members=new Set(state.profiles.map(p=>p.user_id));
  const uploads=[...state.assets,...(state.streamVideos||[])].filter(a=>sharedMedia(a)&&['photo','video'].includes(a.kind)&&!['movie','series','documentary'].includes(String(a.video_category||'').toLowerCase())&&(a.purpose==='library'||(a.bunny_stream&&!a.post_id))&&(members.has(a.owner_id)||a.owner_id===state.user.id)&&(mode!=='following'||followed.has(a.owner_id)));
  entries.push(...[...new Map(uploads.map(a=>[a.id,a])).values()].map(item=>({type:'library',item})));
  entries.sort((a,b)=>Date.parse(b.item.created_at||0)-Date.parse(a.item.created_at||0));
 }
 if(mode==='for-you')entries=personalization.rankFeed(entries);
 const timeline=el('div','bc-profile-social-timeline');box.append(timeline);
 const shown=entries.slice(0,state.profileFeedLimit);
 for(const entry of shown)timeline.append(entry.type==='post'?renderPost(entry.item):renderLibraryActivity(entry.item));
 if(entries.length>shown.length)timeline.append(btn('Load more posts',()=>{state.profileFeedLimit+=12;renderProfile()},'bc-pw-quiet bc-profile-feed-more'));
 if(mode==='worlds'){
  if(!shown.length)timeline.append(el('p','bc-pw-caption','No matching social posts yet. Explore your World photographs and videos below.'));
  const gallery=el('section','bc-profile-world-gallery');box.append(gallery);profileWorlds.feed(gallery);return
 }
 if(!shown.length)timeline.append(empty(mode==='following'?'No posts from followed members yet':'No community posts yet',mode==='following'?'Follow other members to see their posts here.':'Member updates and shared media will appear here.'));
 if(mode==='following'&&!shown.length)timeline.append(btn('Discover members',()=>switchView('discover'),'bc-pw-quiet bc-profile-feed-more'));
}
function videoTile(a){
 const p=state.posts.find(p=>p.id===a.post_id),person=profile(a.owner_id);
 const card=el('article','panel video-card');
 const url=mediaUrl(a);
 if(url){
  const vid=el('video');vid.src=url;vid.controls=true;vid.playsInline=true;vid.preload='metadata';vid.setAttribute('aria-label',a.filename);
  profileWorlds.bindFeedPhoto(vid,a);card.append(vid);
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
let directVideoBusy=false,videoPosterPreviewUrl=null,posterAiPath=null,posterAiPreviewUrl=null,posterSelected='original',posterVideoFrameFile=null,posterAiBusy=false;
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
   network_access_denied:'Your current account is not authorized for BLACKCELL Network video uploads. Check Network access permissions in Administration.',
   member_lookup_unavailable:'Video Studio could not verify your Network membership because the membership service is unavailable. Your account has not been rejected.',
   profile_lookup_unavailable:'Video Studio could not verify your Network profile because the profile service is unavailable. Your account has not been rejected.',
   network_profile_missing:'Your account has no active BLACKCELL Network profile. Open the Network and complete profile setup.',
   server_auth_unavailable:'The video service is missing its Supabase authentication configuration. The administrator must check the server setup.',
   security_session_required:'Your BLACKCELL security verification is missing or has expired. Complete Corporate Access verification, then retry.',
   security_session_unavailable:'BLACKCELL could not validate your security session. Refresh and sign in again.',
   sign_in_required:'Your BLACKCELL sign-in has expired. Sign in again to upload.',
   bunny_stream_library_not_configured:'Large video storage is not configured: add Bunny Stream Library ID and library API Key in Supabase Edge Function Secrets.',
   bunny_stream_embed_security_not_configured:'Bunny Stream playback signing is unavailable. Verify the library API key or an explicitly configured embed token key.',
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
function studioOriginalPoster(){
 return $('bcVideoPoster')?.files?.[0]||posterVideoFrameFile||null;
}
function clearUnusedAiPoster(){
 const unused=posterAiPath;
 posterAiPath=null;posterAiPreviewUrl=null;posterSelected='original';
 if(unused)void bucket.remove([unused]).catch(()=>{});
}
function renderPosterOptions(){
 const original=studioOriginalPoster();
 const root=$('bcPosterArtworkChoices');
 root.hidden=!original&&!posterAiPreviewUrl;
 const originalButton=$('bcPosterChooseOriginal'),aiButton=$('bcPosterChooseAi');
 originalButton.disabled=!original;
 aiButton.disabled=!posterAiPreviewUrl;
 if(original&&!videoPosterPreviewUrl){
  videoPosterPreviewUrl=URL.createObjectURL(original);
 }
 const oldImage=$('bcPosterOriginalVariant'),newImage=$('bcPosterAiVariant');
 if(original&&videoPosterPreviewUrl)oldImage.src=videoPosterPreviewUrl;
 else oldImage.removeAttribute('src');
 if(posterAiPreviewUrl)newImage.src=posterAiPreviewUrl;
 else newImage.removeAttribute('src');
 if(!posterAiPreviewUrl&&posterSelected==='ai')posterSelected='original';
 for(const [button,kind] of [[originalButton,'original'],[aiButton,'ai']]){
  const active=posterSelected===kind;
  button.classList.toggle('is-selected',active);
  button.setAttribute('aria-pressed',String(active));
  button.querySelector('span').textContent=active?'✓ DISPLAY THIS':kind==='ai'&&!posterAiPreviewUrl?'GENERATE TO PREVIEW':'SELECT COVER';
 }
}
function videoPosterClear(){
 if(videoPosterPreviewUrl)URL.revokeObjectURL(videoPosterPreviewUrl);
 videoPosterPreviewUrl=null;
 clearUnusedAiPoster();
 posterVideoFrameFile=null;
 $('bcVideoPosterPreview').removeAttribute('src');
 $('bcVideoPosterPreviewFrame').hidden=true;
 $('bcPosterAiStatus').textContent='';
 renderPosterOptions();
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
 if(!videoPosterPreviewUrl)videoPosterPreviewUrl=URL.createObjectURL(f);
 $('bcVideoPosterPreview').src=videoPosterPreviewUrl;
 $('bcVideoPosterPreviewFrame').hidden=false;
 renderPosterOptions();
}
function canvasReference(sourceCanvas){
 return new Promise((resolve,reject)=>{
  const scale=Math.min(1,1100/Math.max(sourceCanvas.width,sourceCanvas.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(sourceCanvas.width*scale));
  canvas.height=Math.max(1,Math.round(sourceCanvas.height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx){reject(Error('Cannot process this image on this device.'));return}
  ctx.drawImage(sourceCanvas,0,0,canvas.width,canvas.height);
  canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Cannot prepare poster reference.')),'image/jpeg',.83);
 });
}
function fileImageReference(file){
 return new Promise(async(resolve,reject)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=async()=>{
   try{
    const w=img.naturalWidth,h=img.naturalHeight;
    if(!w||!h)throw Error('Poster image could not be opened.');
    // Allocate a small canvas first; never allocate the giant original on iPad.
    const scale=Math.min(1,1100/Math.max(w,h));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(w*scale));
    canvas.height=Math.max(1,Math.round(h*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Poster image could not be opened.');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    resolve(await canvasReference(canvas));
   }catch(err){reject(err)}finally{URL.revokeObjectURL(url)}
  };
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('The original poster could not be read.'))};
  img.src=url;
 });
}
function videoFrameReference(file){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),video=document.createElement('video');
  video.preload='metadata';video.muted=true;video.playsInline=true;
  let done=false;
  const cleanup=()=>{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)};
  const fail=e=>{if(done)return;done=true;cleanup();reject(e instanceof Error?e:Error('This device cannot preview that video. Choose a poster image as the AI reference instead.'))};
  const timer=setTimeout(()=>fail(Error('Video preview timed out. Choose a poster image as the reference.')),13000);
  const finish=async()=>{
   if(done)return;done=true;clearTimeout(timer);
   try{
    const w=video.videoWidth,h=video.videoHeight;
    if(!w||!h)throw Error('No readable frames in this video.');
    const scale=Math.min(1,1100/Math.max(w,h)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    resolve(await canvasReference(canvas));
   }catch(e){reject(e)}finally{cleanup()}
  };
  video.onerror=()=>{clearTimeout(timer);fail(Error('This video format cannot be previewed on iPad. Choose an original poster first.'))};
  video.onloadedmetadata=()=>{
   if(!Number.isFinite(video.duration)||video.duration<=0){void video.play().then(()=>video.pause()).catch(()=>{});return}
   const seek=Math.max(0,Math.min(8,video.duration*.1));
   if(seek<.1)video.onloadeddata=()=>void finish();
   else {video.onseeked=()=>void finish();video.currentTime=seek}
  };
  video.onloadeddata=()=>{if(video.currentTime===0)void finish()};
  video.src=url;
 });
}
async function aiPosterReference(){
 const poster=$('bcVideoPoster').files?.[0];
 if(poster)return await fileImageReference(poster);
 const movie=$('bcVideoFile').files?.[0];
 if(!movie)throw Error('Select a movie poster or video file before generating artwork.');
 const blob=await videoFrameReference(movie);
 posterVideoFrameFile=new File([blob],'original-video-frame.jpg',{type:'image/jpeg'});
 renderPosterOptions();
 return blob;
}
async function makeAiPoster(){
 if(posterAiBusy||directVideoBusy||state.busy)return;
 posterAiBusy=true;
 const button=$('bcPosterGenerate'),note=$('bcPosterAiStatus');
 button.disabled=true;note.textContent='Preparing reference image…';
 try{
  const reference=await aiPosterReference();
  if(reference.size>2*1048576)throw Error('Reference frame is too large. Choose a smaller picture.');
  const bytes=new Uint8Array(await reference.arrayBuffer());
  const chunks=[];for(let i=0;i<bytes.length;i+=16384)chunks.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
  note.textContent='Creating your AI artwork… The original will be preserved.';
  const title=$('bcVideoTitle').value.trim()||'BLACKCELL VIDEO';
  const format=$('bcVideoCategory').value==='movie'||$('bcVideoCategory').value==='series'||$('bcVideoCategory').value==='documentary'?'poster':'thumbnail';
  const {data,error}=await client.functions.invoke('blackcell-ai-poster',{
   body:{action:'generate',imageBase64:btoa(chunks.join('')),mimeType:'image/jpeg',
    title,mode:$('bcPosterAiStyle').value,format}
  });
  if(error||data?.ok!==true){
   let response=data;
   if(error?.context?.json)try{response=await error.context.json()}catch(_){}
   const reason=String(response?.error||error?.message||'ai_generation_unavailable');
   const map={
    ai_poster_not_configured:'AI poster generation needs an OPENAI_API_KEY saved in Supabase Edge Function Secrets.',
    ai_key_invalid:'The AI poster API key was rejected. Check OPENAI_API_KEY in Supabase.',
    ai_rate_limited:'The AI image service is temporarily rate-limited or out of credits.',
    ai_image_request_rejected:'The image-generation service declined this reference. Try a different image or keep the original.',
    ai_generation_unavailable:'AI image generation is temporarily unavailable.',
    security_session_required:'BLACKCELL authorization has expired. Reverify your Corporate Access session.'
   };
   throw Error(map[reason]||('AI poster service: '+reason.replace(/[^a-z0-9_ -]/gi,'')));
  }
  if(typeof data.posterPath!=='string'||!data.posterPath.startsWith(state.user.id+'/video-posters/')||!data.previewUrl?.startsWith('https://'))throw Error('Generated artwork could not be verified.');
  const previous=posterAiPath;
  posterAiPath=data.posterPath;posterAiPreviewUrl=data.previewUrl;
  if(previous&&previous!==posterAiPath)void bucket.remove([previous]).catch(()=>{});
  // Do not auto-select AI. The user chooses which cover BLACKCELL displays.
  renderPosterOptions();
  note.textContent='AI poster ready. Both versions are retained. Choose which one to display.';
 }catch(e){
  note.textContent=fail(e);
 }finally{
  posterAiBusy=false;
  button.disabled=false;
 }
}
function syncDirectVideoCategory(){
 const kind=$('bcVideoCategory').value;
 const episode=kind==='series';
 $('bcVideoFileLabel').textContent=kind==='movie'?'SELECT MOVIE FILE':episode?'SELECT EPISODE FILE':kind==='documentary'?'SELECT DOCUMENTARY FILE':kind==='short'?'SELECT SHORT VIDEO FILE':'SELECT VIDEO FILE';
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
function videoStreamConnectionMessage(result){
 if(result?.resumableReady&&result.connectionStatus==='connected')return 'CONNECTED — Bunny Stream verified. 10 GB resumable uploads are ready.';
 switch(result?.connectionStatus){
  case 'missing_credentials':return 'Bunny Stream is not configured. Verify BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY in Supabase Secrets.';
  case 'invalid_library_api_key':return 'Bunny Stream rejected the library API key. Use the API key from this exact Stream Video Library, not Bunny Storage.';
  case 'library_not_found':return 'Bunny Stream could not find that Video Library ID. Check the numeric Library ID in Supabase Secrets.';
  case 'bunny_stream_unreachable':return 'Bunny Stream could not be reached. Try checking again when the connection is stable.';
  case 'bunny_stream_api_error':return 'Bunny Stream returned an unexpected service error. Check again before uploading.';
  default:return result?.resumableReady?'Bunny Stream is configured.':'Video Stream setup is incomplete. Verify the Library ID and API key in Supabase.';
 }
}
async function checkVideoStreamConnection(){
 const button=$('bcStreamConnectionCheck'),note=$('bcVideoLargeUploadStatus');
 if(!button||!note||button.disabled)return;
 button.disabled=true;note.hidden=false;note.classList.remove('is-ready');
 note.textContent='Testing your Bunny Stream Video Library securely…';
 try{
  const status=await videoStreamApi('status');
  note.textContent=videoStreamConnectionMessage(status);
  note.classList.toggle('is-ready',status.resumableReady===true&&status.connectionStatus==='connected');
 }catch(e){note.textContent=String(e?.message||'Could not check Bunny Stream.');note.classList.remove('is-ready')}
 finally{button.disabled=false}
}
async function refreshVideoStorageStatus(file){
 const note=$('bcVideoLargeUploadStatus');
 if(!note)return;
 // Keep the pitch-black upload form uncluttered until a movie is selected or
 // the owner deliberately presses Check Stream Connection.
 if(!file){note.hidden=true;return}
 note.hidden=false;
 if(!requiresBunnyStream(file)){
  note.textContent='Standard private upload · administrator review required';
  note.classList.add('is-ready');return;
 }
 note.textContent='Verifying 10 GB resumable storage…';note.classList.remove('is-ready');
 try{
  const status=await videoStreamApi('status');
  note.textContent=videoStreamConnectionMessage(status);
  note.classList.toggle('is-ready',status.resumableReady===true&&status.connectionStatus==='connected');
 }catch(e){
  note.textContent=String(e?.message||'Bunny Stream connection could not be checked.');
  note.classList.remove('is-ready');
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
 // Avoid raising the iPad software keyboard before the user chooses artwork or a movie.
 $('bcVideoUploadClose').focus({preventScroll:true});
}
function closeDirectVideoUpload(){
 if(directVideoBusy||posterAiBusy)return;
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
async function sendViaStream(file,metadata,posterFile,aiPath=null,choice='original'){
 const status=await videoStreamApi('status');
 if(!status.resumableReady){
  throw Error('10 GB uploads require a Bunny Stream Video Library ID and library API key. Add BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY in Supabase Edge Function Secrets.');
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
 if(posterFile||aiPath){
  try{
   const originalPath=await uploadMoviePoster(posterFile);
   const selectedPath=choice==='ai'&&aiPath?aiPath:originalPath;
   if(!selectedPath)throw Error('No selected poster available');
   await videoStreamApi('poster',{
    catalogId:start.catalogId,posterPath:selectedPath,
    posterOriginalPath:originalPath,posterAiPath:aiPath
   });
  }catch(e){toast('Video saved; the poster could not be attached: '+fail(e))}
 }
 return {status:remote.status,catalogId:start.catalogId};
}
async function publishDirectVideo(...args){
 let release;
 try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('publishDirectVideo',window)}catch(_){}
 try{return await bcLiveOriginal_publishDirectVideo.apply(this,args)}finally{release?.()}
}
async function bcLiveOriginal_publishDirectVideo(event){
 event.preventDefault();
 if(directVideoBusy||posterAiBusy||state.busy)return;
 const file=$('bcVideoFile').files?.[0],posterFile=studioOriginalPoster();
 const aiPath=posterAiPath,posterChoice=posterSelected;
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
 let postId=null,posterPath=null,originalPosterPath=null;
 try{
  if(requiresBunnyStream(file)){
   await sendViaStream(file,metadata,posterFile,aiPath,posterChoice);
   $('bcVideoUploadMessage').textContent='Upload received. Video encoding and administrator review are pending.';
  }else{
   // Preserve the existing small-file Supabase workflow.
   // The shared Free bucket cannot accept files larger than 45 MB.
   originalPosterPath=await uploadMoviePoster(posterFile);
   posterPath=posterChoice==='ai'&&aiPath?aiPath:originalPosterPath;
   const {data,error}=await client.from('corp_social_posts').insert({author_id:state.user.id,body:title,kind:'video'}).select('id').single();
   if(error||!data?.id)throw Error(error?.message||'Could not create video post.');
   postId=data.id;
   $('bcVideoUploadMessage').textContent='Uploading private video…';
   await uploadAsset(file,'post',postId,{...metadata,posterPath,posterOriginalPath:originalPosterPath,posterAiPath:aiPath});
   $('bcVideoUploadFill').classList.remove('is-uploading');
   $('bcVideoUploadFill').style.width='100%';
   $('bcVideoUploadMessage').textContent='Upload complete. Awaiting administrator review.';
  }
  try{await loadAll({show:true})}catch(err){console.warn('Video catalog refresh:',fail(err))}
  $('bcVideoUploadDialog').hidden=true;
  document.body.classList.remove('bc-video-upload-open');
  // The AI image belongs to the saved movie now; reset without deleting it.
  posterAiPath=null;
  $('bcVideoUploadForm').reset();
  videoPosterClear();
  document.dispatchEvent(new CustomEvent('bc:media-updated'));
  toast('Video received. It will appear in the Channel after encoding (if needed) and administrator approval.');
 }catch(e){
  if(postId)await client.from('corp_social_posts').delete().eq('id',postId).eq('author_id',state.user.id);
  if(originalPosterPath)await bucket.remove([originalPosterPath]).catch(()=>{});
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
 state,mediaUrl,posterUrl,posterVersions,sharedMedia,profile,personName,stamp,switchView,openProfile,toast,
 worldVideoPreviews,readWorldVideo:a=>readWorldVideo(client,a),bindTransfer:profileWorlds.bindFeedPhoto,
 attachRenderedWorld:opts=>attachRenderedWorld({client,...opts}),
 shareVideoInside:prepareVideoShare,followChannel:toggleFollow,channelAvatar:p=>mediaUrl(asset(p?.avatar_asset_id)),
 loadVideoComments:async a=>{
  const target=tubeCommentTarget(a);
  if(!target)throw Error('No valid video comment target');
  const {data,error}=await client.from(target.table)
   .select('id,user_id,body,created_at').eq(target.field,target.id)
   .order('created_at',{ascending:false}).limit(250);
  if(error)throw error;
  return data||[];
 },
 addVideoComment:async(a,body)=>{
  const target=tubeCommentTarget(a);
  if(!state.user?.id||!target||typeof body!=='string'||!body.trim()||body.length>1000)throw Error('Invalid comment');
  const {error}=await client.from(target.table)
   .insert({[target.field]:target.id,user_id:state.user.id,body:body.trim()});
  if(error)throw error;
 },
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
 if(['avatar','cover'].includes(purpose) && (!file.type.startsWith('image/')||file.size>12*1048576))
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
 // Direct intake is self-declared only, with the server independently checking owner access.
 if(purpose==='library'&&record.kind==='photo'&&videoMetadata?.directLibrary===true){
  record.review_status='approved';record.rights_confirmed=true;record.adult_restricted=false;
 }
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
  record.video_poster_original_path=videoMetadata.posterOriginalPath||null;
  record.video_poster_ai_path=videoMetadata.posterAiPath||null;
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
 input.value='';appendSelectedFiles(files);
}
function appendSelectedFiles(files){
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
async function publish(...args){
 let release;
 try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('publish',window)}catch(_){}
 try{return await bcLiveOriginal_publish.apply(this,args)}finally{release?.()}
}
async function bcLiveOriginal_publish(){
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
  else switchView('profile',{who:state.user.id,tab:'worldfeed'});
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
function updateCounter(){$('charCount').textContent=$('postBody').value.length+' / 1,000';pulseDraftLinkPreview()}
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
 $('editAvatar').value='';$('editCover').value='';
 $('editFeedback').hidden=true;$('editOverlay').hidden=false;
}
function closeEdit(){$('editOverlay').hidden=true}
let profileSavePromise=null;
async function saveProfile(...args){
 if(profileSavePromise)return profileSavePromise;
 let release;
 try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('saveProfile',window)}catch(_){}
 profileSavePromise=bcLiveOriginal_saveProfile.apply(this,args);
 try{return await profileSavePromise}finally{profileSavePromise=null;release?.()}
}
async function bcLiveOriginal_saveProfile(){
 const p=myProfile();if(!p||state.busy)return false;
 state.busy=true;
 const b=$('saveProfile');b.disabled=true;b.textContent='SAVING…';
 $('editFeedback').hidden=false;$('editFeedback').textContent='Saving profile to Blackcell Network…';
 try{
  const changes={headline:$('editHeadline').value.trim().slice(0,140),
   bio:$('editBio').value.trim().slice(0,1000)};
  const ava=$('editAvatar').files?.[0];
  if(ava){const img=await uploadAsset(ava,'avatar');changes.avatar_asset_id=img.id}
  const coverFile=$('editCover').files?.[0];if(coverFile){const img=await uploadAsset(coverFile,'cover');changes.cover_asset_id=img.id}
  const {error}=await client.from('corp_social_profiles').update(changes).eq('user_id',state.user.id);
  if(error)throw error;
  $('editAvatar').value='';$('editCover').value='';closeEdit();try{await refresh();openProfile(state.user.id)}catch(_){}toast('Your corporate social profile was updated.');return true;
 }catch(e){$('editFeedback').textContent='Could not save profile: '+fail(e);return false}
 finally{state.busy=false;b.disabled=false;b.textContent='SAVE PROFILE ↗'}
}
/* BLACKCELL OS close integration: only submit explicit profile edits,
 never publish posts, send messages, or submit unrelated forms on close. */
window.BLACKCELL_OS_CAN_RELOAD=()=>{
 if(state.busy||profileSavePromise||profileWorlds.busy()||formFiles.length||$('postBody')?.value.trim())return false;
 const visible=n=>!!(n.getClientRects().length&&!n.closest('[hidden],[aria-hidden=true]')&&getComputedStyle(n).visibility!=='hidden');
 if(Array.from(document.querySelectorAll('dialog[open],[aria-modal=true],#editOverlay,.bc-chat-pane')).some(visible))return false;
 if(Array.from(document.querySelectorAll('input[type=file]')).some(n=>n.files?.length))return false;
 if(Array.from(document.querySelectorAll('video:not(.bc-pw-live-cover),audio')).some(n=>!n.paused&&!n.ended))return false;
 if(Array.from(document.querySelectorAll('textarea')).some(n=>visible(n)&&n.value.trim()&&n.value!==n.defaultValue))return false;
 return true;
};
window.BLACKCELL_OS_BEFORE_CLOSE=async()=>{
 if(!state.user||$('app').hidden)return {ok:true,retain:true};
 if(profileSavePromise){const ok=await profileSavePromise;if(!ok)return {ok:false,retain:true,message:'Profile save failed. Reopen My Profile to retry.'}}
 if(state.busy)return {ok:true,retain:true,message:'An operation is still running. Your window has been retained.'};
 if(!$('editOverlay').hidden){
  const p=myProfile();if(!p)return {ok:false,retain:true,message:'Profile changes are retained. Reopen My Profile to retry.'};
  const changed=$('editHeadline').value.trim()!==(p.headline||'')||$('editBio').value.trim()!==(p.bio||'')||!!$('editAvatar').files?.length||!!$('editCover').files?.length;
  if(changed){const saved=await saveProfile();if(!saved)return {ok:false,retain:true,message:'Profile save failed. Reopen My Profile to retry.'};return {ok:true,retain:true,message:'Profile changes saved.'}}
  closeEdit();
 }
 // Preserve all remaining drafts, selected files, and other network features.
 return {ok:true,retain:true};
};
let refreshPending=null,refreshAgain=false;
async function refresh(){
 // Coalesce concurrent reload triggers; one final refresh catches updates
 // arriving during an in-flight request without a burst of parallel fetches.
 if(refreshPending){refreshAgain=true;return refreshPending}
 refreshPending=(async()=>{
  do{refreshAgain=false;await loadAll({show:true})}while(refreshAgain);
 })();
 try{return await refreshPending}finally{refreshPending=null}
}
function setupEvents(){
 videoChannel.init();
 $('bcVideoUploadForm').addEventListener('submit',e=>void publishDirectVideo(e));
 $('bcStreamConnectionCheck').addEventListener('click',()=>void checkVideoStreamConnection());
 $('bcVideoCategory').addEventListener('change',syncDirectVideoCategory);
 $('bcVideoPoster').addEventListener('change',videoPosterSelect);
 $('bcPosterGenerate').addEventListener('click',()=>void makeAiPoster());
 $('bcPosterChooseOriginal').addEventListener('click',()=>{
  if(studioOriginalPoster()){posterSelected='original';renderPosterOptions()}
 });
 $('bcPosterChooseAi').addEventListener('click',()=>{
  if(posterAiPath){posterSelected='ai';renderPosterOptions()}
 });
 $('bcVideoPosterRemove').addEventListener('click',()=>{
  if(posterAiBusy)return;
  $('bcVideoPoster').value='';videoPosterClear();
 });
 $('bcVideoUploadClose').addEventListener('click',closeDirectVideoUpload);
 $('bcVideoUploadCancel').addEventListener('click',closeDirectVideoUpload);
 $('bcVideoFile').addEventListener('change',()=>{
  const f=$('bcVideoFile').files?.[0];
  if(posterVideoFrameFile){
   posterVideoFrameFile=null;
   if(videoPosterPreviewUrl&&!$('bcVideoPoster').files?.[0]){
    URL.revokeObjectURL(videoPosterPreviewUrl);videoPosterPreviewUrl=null;
   }
  }
  if(posterAiPath)clearUnusedAiPoster();
  renderPosterOptions();
  $('bcVideoFileName').textContent=videoFileSizeLabel(f);
  void refreshVideoStorageStatus(f);
 });
 $('bcVideoUploadDialog').addEventListener('click',e=>{
  if(e.target===$('bcVideoUploadDialog'))closeDirectVideoUpload()
 });
 document.querySelectorAll('[data-view]').forEach(n=>n.addEventListener('click',()=>switchView(n.dataset.view)));
 $('viewAllPeople').addEventListener('click',()=>switchView('discover'));
 $('peopleSearch').addEventListener('input',renderDirectory);
 $('profileCoverAction').addEventListener('click',()=>{openEdit();$('editCover').focus()});
 document.querySelectorAll('[data-profile-stat]').forEach(n=>n.addEventListener('click',()=>{const value=n.dataset.profileStat;if(value==='followers'||value==='following'){state.profileFriendsMode=value;state.profileFriendsQuery='';state.profileTab='friends'}else state.profileTab=value;renderProfile()}));
 document.querySelectorAll('#profileTabs [data-tab]').forEach(n=>n.addEventListener('click',()=>{
  if(n.dataset.tab==='worldfeed'){switchView('pulse',{pulseWho:state.profileUserId||state.user.id});return}
  state.deepPost=null;state.profileTab=n.dataset.tab;
  if(state.profileTab==='worldfeed'){profileWorlds.reset();state.profileFeedMode='for-you';state.profileFeedLimit=12}
  $('profileMoreDropdown')?.removeAttribute('open');
  renderProfile();
 }));
 $('postBody').addEventListener('input',updateCounter);
 $('attachPhotos').addEventListener('click',()=>{$('postFiles').accept='image/*';$('postFiles').multiple=true;$('postFiles').click()});
 $('attachVideo').addEventListener('click',()=>{$('postFiles').accept='video/*';$('postFiles').multiple=false;$('postFiles').click()});
 $('postFiles').addEventListener('change',()=>selectFiles($('postFiles')));
 $('attachPrivateFiles').addEventListener('click',async()=>{if(state.busy||!state.user)return;try{const m=await import('./blackcell-private-media.js?v=4');await m.choosePrivateMedia({client,userId:state.user.id,max:6,onSelect:files=>appendSelectedFiles(files),actionLabel:'Attach selected (not published)'})}catch(e){toast('Private file picker unavailable.')}});
 $('libraryPrivateFiles').addEventListener('click',async()=>{if(!state.user||state.busy)return;try{const m=await import('./blackcell-private-media.js?v=4');await m.choosePrivateMedia({client,userId:state.user.id,max:20,onSelect:files=>photos.uploadFiles(files),actionLabel:'Upload selected to shared library'})}catch(e){toast('Private file picker unavailable.')}});
 $('publishPost').addEventListener('click',()=>void publish());
 $('closeEdit').addEventListener('click',closeEdit);
 $('cancelEdit').addEventListener('click',closeEdit);
 $('editOverlay').addEventListener('click',e=>{if(e.target===$('editOverlay'))closeEdit()});
 $('saveProfile').addEventListener('click',()=>void saveProfile());
 $('profileReturnFeed').addEventListener('click',()=>switchView('profile',{who:state.user.id,tab:'worldfeed'}));
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

let networkSecurityChecksInstalled=false,networkSecurityChecking=false,networkLastCheckAt=0;
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
 // Focus, visibility and interval events can fire together; avoid duplicate
 // authorization requests while retaining server-side RLS for data access.
 if(Date.now()-networkLastCheckAt<15000)return;
 networkLastCheckAt=Date.now();
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
 window.setInterval(()=>void verifyNetworkSession(),45000);
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)void verifyNetworkSession()
 });
 window.addEventListener('focus',()=>void verifyNetworkSession());
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
  for(const id of ['blackcellOsLink','blackcellOsRail']){
   const link=$(id);if(!link)continue;
   const owner=auth.member.role==='owner';
   link.href='blackcell-os.html';
   if(owner)link.title='Launch the executive BLACKCELL OS desktop';
   link.hidden=false;
  }
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
  await Promise.all([loadPulsePersonal(),dedupe.load()]);
  await personalization.load();
  await profileWorlds.load().catch(()=>{});
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
   chatScript.src='corporate-chat-dock.js?v=20261128-msgsound1';
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
  if(params.get('view')==='pulse'){
   const ref=String(params.get('media')||'').split(':');let target=null;
   if(['asset','stream'].includes(ref[0])&&UUID.test(ref[1]||'')){
    const t={kind:ref[0],id:ref[1]};target=pulseFindMedia(t);
    if(!target){const {data}=await client.from(t.kind==='stream'?'corp_stream_videos':'corp_social_assets').select('*').eq('id',t.id).maybeSingle();if(data){if(t.kind==='stream')state.streamVideos.push({...data,kind:'video',purpose:'post',bunny_stream:true,video_poster_path:data.poster_path});else state.assets.push(data);target=pulseFindMedia(t);if(target)await loadSigned()}}
   }
   switchView('pulse',{pulseWho:target?.owner_id||(uid&&UUID.test(uid)&&profile(uid)?uid:null)});
   if(target){const u=new URL(location.href);u.searchParams.set('media',ref.join(':'));history.replaceState(null,'',u);const timeline=$('pulseView').querySelector('.bc-pulse-timeline');if(timeline){const prev=timeline.querySelector('#library-media-'+target.id);if(prev)prev.remove();timeline.prepend(renderLibraryActivity(target));}}
  }
  else if(state.deepPost)switchView('profile',{who:state.user.id,tab:'worldfeed',keepPost:true});
  else if(uid&&UUID.test(uid)&&profile(uid))switchView('profile',{who:uid});
  else if(params.get('view')==='profile')switchView('profile',{who:state.user.id});
  else if(['discover','videos','photos'].includes(params.get('view')))switchView(params.get('view'));
  else switchView('profile',{who:state.user.id,tab:'worldfeed',keepPost:!!state.deepPost});
  renderMini();renderSuggestions();
 }catch(e){
  $('gateText').textContent=fail(e);
  $('gateBack').hidden=false;
 }
}
const personalization=createNetworkPersonalization({client,state,toast,
 onChanged:()=>{
  if(state.view==='photos'&&$('applePhotoViewer')?.hidden!==false)photos.render();
  rediscovery.refresh();
  if(state.view==='profile')renderProfile();
  if(state.view==='pulse')renderPulse();
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
