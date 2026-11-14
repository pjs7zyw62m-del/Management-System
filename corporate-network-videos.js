/* BLACKCELL Video Channel — private Plex-style cinema + YouTube-style discovery.
   Uses existing approved corporate-network media and signed Storage URLs only.
   Watch Later / Continue Watching are device-local preferences, not cloud sync. */
export function createBlackcellVideoChannel({state,mediaUrl,sharedMedia,profile,personName,stamp,switchView,openProfile,uploadVideo,toast}){
 const $=id=>document.getElementById(id);
 const node=(tag,cls='',text=null)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==null)n.textContent=String(text);return n};
 const button=(label,cls,action)=>{const b=node('button',cls,label);b.type='button';b.addEventListener('click',action);return b};
 let initialized=false,search='',filter='all',sort='newest',current=null,queue=[],observer=null,lastWrite=0;
 let watchLater={},resume={},loadedUser=null;
 const prefix=()=>String(state.user?.id||'signed-out');
 function readStore(key){
  try{const o=JSON.parse(localStorage.getItem(key)||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}catch{return {}}
 }
 function writeStore(key,data){try{localStorage.setItem(key,JSON.stringify(data))}catch{ /* optional device-only preferences */ }}
 function ensureStore(){
  const id=prefix();if(loadedUser===id)return;loadedUser=id;
  watchLater=readStore('bc-video-watchlater-v1-'+id);
  resume=readStore('bc-video-resume-v1-'+id);
 }
 const saveLater=()=>writeStore('bc-video-watchlater-v1-'+prefix(),watchLater);
 const saveProgress=()=>writeStore('bc-video-resume-v1-'+prefix(),resume);
 const byNewest=(a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0);
 function title(a){
  const post=state.posts.find(p=>p.id===a.post_id);
  return String(post?.body||a.filename||'Untitled video').trim().slice(0,155)||'Untitled video';
 }
 function creator(a){return personName(profile(a.owner_id))}
 function items(){
  return state.assets.filter(a=>sharedMedia(a)&&a.kind==='video'&&['post','library'].includes(a.purpose) &&
   (a.owner_id===state.user?.id||Boolean(profile(a.owner_id)))).slice().sort(byNewest);
 }
 function isSaved(id){return watchLater[id]===true}
 function validProgress(a){
  const p=resume[a.id];const t=Number(p?.time),d=Number(p?.duration);
  return Number.isFinite(t)&&Number.isFinite(d)&&d>15&&t>=5&&t<d-10;
 }
 function percentage(a){
  if(!validProgress(a))return 0;
  const p=resume[a.id];return Math.max(0,Math.min(99,100*p.time/p.duration));
 }
 function toggleLater(a){
  ensureStore();
  if(isSaved(a.id))delete watchLater[a.id];else watchLater[a.id]=true;
  saveLater();render();
  if(current?.id===a.id)syncCinemaLater();
  toast(isSaved(a.id)?'Added to Watch Later on this device.':'Removed from Watch Later.');
 }
 function filteredItems(all){
  let out=all.filter(a=>{
   if(filter==='following'){
    if(a.owner_id===state.user?.id)return true;
    return state.follows.some(f=>f.follower_id===state.user?.id&&f.following_id===a.owner_id);
   }
   if(filter==='mine')return a.owner_id===state.user?.id;
   if(filter==='watchlater')return isSaved(a.id);
   return true;
  });
  const q=search.trim().toLowerCase();
  if(q)out=out.filter(a=>(title(a)+' '+creator(a)+' '+(a.filename||'')).toLowerCase().includes(q));
  if(sort==='oldest')out.sort((a,b)=>-byNewest(a,b));
  if(sort==='title')out.sort((a,b)=>title(a).localeCompare(title(b)));
  return out;
 }
 const media=(a)=>String(mediaUrl(a)||'');
 function deferThumbnail(video,src){
  if(!src)return;
  if(!('IntersectionObserver' in window)){video.src=src;return}
  if(!observer){
   observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
     if(!entry.isIntersecting)continue;
     const v=entry.target;
     if(v._bcVideoUrl&&!v.src)v.src=v._bcVideoUrl;
     observer.unobserve(v);
    }
   },{rootMargin:'160px'});
  }
  video._bcVideoUrl=src;observer.observe(video);
 }
 function tile(a,options={}){
  const article=node('article','bc-video-tile');
  const main=button('', 'bc-video-tile-main',()=>open(a,options.queue||items()));
  main.setAttribute('aria-label','Play '+title(a));
  const thumb=node('div','bc-video-thumb');
  const src=media(a);
  if(src){
   const preview=node('video');preview.muted=true;preview.playsInline=true;
   preview.preload='metadata';preview.setAttribute('aria-hidden','true');
   preview.setAttribute('tabindex','-1');
   deferThumbnail(preview,src);thumb.append(preview);
  }else thumb.append(node('span','bc-video-tile-placeholder','PREVIEW UNAVAILABLE'));
  const play=node('span','bc-video-play','▶');play.setAttribute('aria-hidden','true');thumb.append(play);
  thumb.append(node('span','bc-video-thumb-badge','BLACKCELL'));
  const progress=percentage(a);
  if(progress){const p=node('div','bc-video-progress');p.style.width=progress+'%';thumb.append(p)}
  main.append(thumb);
  const details=node('div','bc-video-tile-details'),info=node('div','bc-video-info');
  info.append(node('strong','',title(a)),node('small','',creator(a)+' · '+stamp(a.created_at)));
  const later=button(isSaved(a.id)?'✓':'＋','bc-video-save'+(isSaved(a.id)?' is-saved':''),(e)=>toggleLater(a));
  later.title=isSaved(a.id)?'Remove from Watch Later':'Save to Watch Later';
  later.setAttribute('aria-label',later.title+' (on this device)');
  details.append(info,later);
  article.append(main,details);
  return article;
 }
 function spotlight(all){
  const container=$('bcVideoSpotlight');container.replaceChildren();
  const a=all[0];const copy=node('div','bc-spotlight-copy');
  if(!a){
   container.append(node('div','bc-spotlight-art'));
   copy.append(node('span','bc-spotlight-tag','YOUR PRIVATE CINEMA'),
    node('h2','','Every great channel starts with its first video.'),
    node('p','','Approved videos from BLACKCELL members will appear here. Upload a video through the Network Feed to get started.'));
   const actions=node('div','bc-spotlight-actions');
   actions.append(button('＋ UPLOAD A VIDEO','bc-spotlight-watch',()=>uploadVideo()));
   copy.append(actions);container.append(copy);return;
  }
  const source=media(a);
  if(source){
   const v=node('video','bc-spotlight-film');v.muted=true;v.playsInline=true;v.preload='metadata';
   v.setAttribute('aria-hidden','true');deferThumbnail(v,source);container.append(v);
  }else container.append(node('div','bc-spotlight-art'));
  copy.append(node('span','bc-spotlight-tag','✦ FEATURED ON BLACKCELL'),
   node('h2','',title(a)),node('div','bc-spotlight-meta',creator(a)+' · '+stamp(a.created_at)),
   node('p','','The latest approved feature from the BLACKCELL Network. Watch in the dedicated cinema player.'));
  const actions=node('div','bc-spotlight-actions');
  actions.append(button('▶ PLAY FEATURED','bc-spotlight-watch',()=>open(a,all)));
  actions.append(button(isSaved(a.id)?'✓ SAVED TO WATCH LATER':'＋ WATCH LATER','bc-spotlight-save',()=>toggleLater(a)));
  copy.append(actions);container.append(copy);
 }
 function renderShelf(container,all,emptyText){
  container.replaceChildren();
  for(const a of all)container.append(tile(a,{queue:all}));
  if(!all.length&&emptyText)container.append(node('p','bc-video-empty',emptyText));
 }
 function render(){
  if(!initialized)return;
  ensureStore();
  if(observer){observer.disconnect();observer=null}
  const all=items();
  $('bcVideoTotal').textContent=all.length+' VIDEO'+(all.length===1?'':'S');
  const results=filteredItems(all),focused=filter!=='all'||Boolean(search.trim());
  $('bcVideoSpotlight').hidden=focused;
  const latest=$('bcVideoLatestSection');latest.hidden=focused||all.length===0;
  if(!focused){spotlight(all);renderShelf($('bcVideoLatest'),all.slice(0,12));}
  const continuation=all.filter(validProgress).sort((a,b)=>{
   return Number(resume[b.id]?.updated||0)-Number(resume[a.id]?.updated||0);
  }).slice(0,12);
  const cont=$('bcVideoContinueSection');cont.hidden=focused||!continuation.length;
  if(!cont.hidden)renderShelf($('bcVideoContinue'),continuation);
  const names={all:'Explore all videos',following:'From people you follow',mine:'My video uploads',watchlater:'Watch later'};
  $('bcVideoCollectionTitle').textContent=search.trim()?'Search results':names[filter]||names.all;
  $('bcVideoResults').textContent=results.length+' result'+(results.length===1?'':'s');
  const grid=$('videoGrid');grid.replaceChildren();
  if(!results.length){
   const noVideos=all.length===0;const pane=node('div','bc-video-empty');
   pane.append(node('strong','',noVideos?'The channel is ready for videos.':'Nothing matches this view.'));
   pane.append(node('div','',noVideos?'There are no approved network video posts yet.':'Try another search or filter. Watch Later is saved on this device.'));
   if(noVideos)pane.append(button('UPLOAD A VIDEO', '',()=>uploadVideo()));
   grid.append(pane);
  }else for(const a of results)grid.append(tile(a,{queue:results}));
 }
 function syncCinemaLater(){
  if(!current)return;
  $('bcCinemaWatchLater').textContent=isSaved(current.id)?'✓ SAVED TO WATCH LATER':'＋ WATCH LATER';
 }
 function syncNav(){
  const index=queue.findIndex(x=>x.id===current?.id);
  $('bcCinemaPrev').disabled=index<=0;
  $('bcCinemaNext').disabled=index<0||index>=queue.length-1;
 }
 function open(a,nextQueue){
  if(!initialized)return;
  const src=media(a);
  if(!src){toast('This video is temporarily unavailable. Please refresh the channel.');return}
  ensureStore();
  const dialog=$('bcVideoCinema'),player=$('bcCinemaPlayer');
  if(!dialog.hidden)player.pause();
  current=a;queue=(nextQueue?.length?nextQueue:items()).slice();
  if(!queue.some(x=>x.id===a.id))queue.unshift(a);
  $('bcCinemaTitle').textContent=title(a);
  $('bcCinemaVideoTitle').textContent=title(a);
  $('bcCinemaVideoMeta').textContent=creator(a)+' · '+stamp(a.created_at);
  $('bcCinemaDescription').textContent='Shared by a verified BLACKCELL Network member. Only approved videos are available in this player.';
  syncCinemaLater();syncNav();
  dialog.hidden=false;document.body.classList.add('bc-cinema-open');
  player.src=src;player.load();
  const t=Number(resume[a.id]?.time||0);
  player.onloadedmetadata=()=>{
   if(t>=5&&Number.isFinite(t)&&t<player.duration-10){
    try{player.currentTime=t}catch{}
   }
  };
  player.play().catch(()=>{});
  $('bcCinemaClose').focus({preventScroll:true});
 }
 function close(){
  const dialog=$('bcVideoCinema');
  if(!dialog||dialog.hidden)return;
  const v=$('bcCinemaPlayer');
  capture();
  v.pause();v.removeAttribute('src');v.load();v.onloadedmetadata=null;
  dialog.hidden=true;document.body.classList.remove('bc-cinema-open');
  current=null;queue=[];lastWrite=0;
  if(state.view==='videos')render();
 }
 function move(delta){
  if(!current)return;
  const index=queue.findIndex(x=>x.id===current.id);
  const next=queue[index+delta];if(next)open(next,queue);
 }
 function capture(force=false){
  if(!current)return;
  const player=$('bcCinemaPlayer');
  if(!player||!Number.isFinite(player.duration)||player.duration<=15)return;
  if(!Number.isFinite(player.currentTime))return;
  const now=Date.now();
  if(!force&&now-lastWrite<2800)return;
  lastWrite=now;
  if(player.ended||player.currentTime>=player.duration-7)delete resume[current.id];
  else if(player.currentTime>=5)resume[current.id]={
   time:Math.floor(player.currentTime),duration:Math.floor(player.duration),updated:now
  };
  saveProgress();
 }
 function init(){
  if(initialized)return;initialized=true;
  ensureStore();
  $('bcVideoSearch').addEventListener('input',e=>{search=e.target.value||'';render()});
  $('bcVideoSort').addEventListener('change',e=>{sort=e.target.value||'newest';render()});
  for(const b of $('bcVideoFilters').querySelectorAll('[data-video-filter]')){
   b.addEventListener('click',()=>{
    filter=b.dataset.videoFilter||'all';
    for(const c of $('bcVideoFilters').querySelectorAll('button')){
     const yes=c===b;c.classList.toggle('is-active',yes);c.setAttribute('aria-pressed',String(yes));
    }
    render();
   });
  }
  $('bcVideoUpload').addEventListener('click',()=>uploadVideo());
  $('bcCinemaClose').addEventListener('click',close);
  $('bcVideoCinema').addEventListener('click',e=>{if(e.target===$('bcVideoCinema'))close()});
  $('bcCinemaPrev').addEventListener('click',()=>move(-1));
  $('bcCinemaNext').addEventListener('click',()=>move(1));
  $('bcCinemaCreator').addEventListener('click',()=>{
   if(!current)return;const id=current.owner_id;close();openProfile(id,'videos');
  });
  $('bcCinemaWatchLater').addEventListener('click',()=>{if(current)toggleLater(current)});
  $('bcCinemaFullscreen').addEventListener('click',()=>{
   const v=$('bcCinemaPlayer');
   if(v.requestFullscreen)void v.requestFullscreen().catch(()=>{});
   else if(v.webkitEnterFullscreen)v.webkitEnterFullscreen();
  });
  const player=$('bcCinemaPlayer');
  player.addEventListener('timeupdate',()=>capture());
  player.addEventListener('pause',()=>{capture(true);if(state.view==='videos')render()});
  player.addEventListener('ended',()=>{capture(true);if(state.view==='videos')render()});
  window.addEventListener('keydown',e=>{
   if($('bcVideoCinema').hidden)return;
   if(e.key==='Escape'){e.preventDefault();close()}
   if(e.target instanceof HTMLInputElement)return;
   if(e.key==='ArrowRight'&&e.altKey){e.preventDefault();move(1)}
   if(e.key==='ArrowLeft'&&e.altKey){e.preventDefault();move(-1)}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)capture(true)});
 }
 return {init,render,close};
}
