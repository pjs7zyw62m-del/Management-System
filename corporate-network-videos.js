/* BLACKCELL Video Channel: content-first, YouTube-like navigation,
   Shorts and private Plex-style library. All videos come from already
   approved Network assets; personal likes/history are device-local. */
export function createBlackcellVideoChannel({state,mediaUrl,sharedMedia,profile,personName,stamp,switchView,openProfile,uploadVideo,toast}){
 const $=id=>document.getElementById(id);
 const make=(tag,cls='',value=null)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==null)el.textContent=String(value);return el};
 const button=(label,cls,callback)=>{const b=make('button',cls,label);b.type='button';b.addEventListener('click',callback);return b};
 const regexShort=/(^|[^a-z])(shorts?|reels?|vertical)([^a-z]|$)/i;
 const categoryWords={
  military:/military|marine|army|navy|sailor|soldier|troop|infantry|air force|coast guard|corps|barracks|boot camp|armed forces|recon|seal\b|uniformed service/i,
  police:/police|sheriff|law enforcement|officer|patrol|state trooper|cop\b|deputy|swat|corrections|prison/i,
  fire:/firefighter|fire engine|fire department|firehouse|fire rescue|paramedic|ems\b|emergency response/i,
  training:/training|workout|fitness|boot camp|drill|exercise|recruit|academy|pushup/i,
  uniform:/uniform|dress blues|insignia|equipment|gear|tactical vest|dress uniform/i,
  aviation:/aircraft|aviation|pilot|airplane|helicopter|flight|air force|aircrew/i,
  history:/history|historic|vintage|archive|war ii|1980|1990|1970|old school/i
 };
 let initialized=false,selected='home',topic='all',query='',sort='newest',sidebarCollapsed=false,channelId=null,movieFilter='all',seriesFocus=null;
 let videosCache=[],watchLater={},likes={},watchHistory={},resume={},shortInfo={},loadedFor='',activeCinema=null,cinemaQueue=[],shortIndex=0,shortQueue=[],displayedShortId=null,observer=null,mostRecentWrite=0,pendingId=null;
 const accountKey=()=>String(state.user?.id||'anonymous');
 function read(key){try{const x=JSON.parse(localStorage.getItem(key)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return {}}}
 function write(key,x){try{localStorage.setItem(key,JSON.stringify(x))}catch{}}
 function ensureSaved(){
  const id=accountKey();if(loadedFor===id)return;loadedFor=id;
  watchLater=read('bc-video-watchlater-v1-'+id);
  resume=read('bc-video-resume-v1-'+id);
  likes=read('bc-video-liked-v1-'+id);
  watchHistory=read('bc-video-history-v1-'+id);
  shortInfo=read('bc-video-orientation-v1-'+id);
 }
 const storeLater=()=>write('bc-video-watchlater-v1-'+accountKey(),watchLater);
 const storeResume=()=>write('bc-video-resume-v1-'+accountKey(),resume);
 const storeLikes=()=>write('bc-video-liked-v1-'+accountKey(),likes);
 const storeHistory=()=>write('bc-video-history-v1-'+accountKey(),watchHistory);
 const storeInfo=()=>write('bc-video-orientation-v1-'+accountKey(),shortInfo);
 const postOf=a=>state.posts.find(p=>p.id===a.post_id);
 const title=a=>String(postOf(a)?.body||a.filename||'Untitled video').replace(/\s+/g,' ').trim().slice(0,135)||'Untitled video';
 const creator=a=>personName(profile(a.owner_id));
 const source=a=>String(mediaUrl(a)||'');
 const when=a=>stamp(a.created_at);
 const newest=(a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0);
 function allVideos(){
  return state.assets.filter(a=>sharedMedia(a)&&a.kind==='video'&&['post','library'].includes(a.purpose)&&
   (a.owner_id===state.user?.id||Boolean(profile(a.owner_id)))).slice().sort(newest);
 }
 function shortVideo(a){
  const info=shortInfo[a.id];
  if(info&&info.duration>0&&info.duration<=180&&info.height>info.width*1.15)return true;
  return regexShort.test(title(a)+' '+String(a.filename||''));
 }
 const shorts=all=>all.filter(shortVideo);
 const saved=a=>Boolean(watchLater[a.id]);
 const liked=a=>Boolean(likes[a.id]);
 function progressValid(a){
  const v=resume[a.id];
  return v&&Number.isFinite(+v.time)&&Number.isFinite(+v.duration)&&+v.duration>10&&+v.time>=5&&+v.time<+v.duration-8;
 }
 const progPercent=a=>progressValid(a)?Math.min(99,Math.max(0,100*resume[a.id].time/resume[a.id].duration)):0;
 function remember(a){
  watchHistory[a.id]=Date.now();storeHistory();
 }
 function toggleLater(a){
  ensureSaved();if(saved(a))delete watchLater[a.id];else watchLater[a.id]=true;
  storeLater();if(selected!=='shorts')renderVisible();syncCinemaActions();syncShortActions();
  toast(saved(a)?'Saved to Watch Later on this device.':'Removed from Watch Later.');
 }
 function toggleLike(a){
  ensureSaved();if(liked(a))delete likes[a.id];else likes[a.id]=true;
  storeLikes();if(selected!=='shorts')renderVisible();syncCinemaActions();syncShortActions();
  toast(liked(a)?'Liked on this device.':'Removed from liked videos.');
 }
 function track(a,v,force=false){
  if(!a||!v||!Number.isFinite(v.duration)||v.duration<5||!Number.isFinite(v.currentTime))return;
  const now=Date.now();if(!force&&now-mostRecentWrite<2600)return;mostRecentWrite=now;
  if(v.ended||v.currentTime>=v.duration-6)delete resume[a.id];
  else if(v.currentTime>=5)resume[a.id]={time:Math.floor(v.currentTime),duration:Math.floor(v.duration),updated:now};
  storeResume();
 }
 function copyLink(a){
  const u=new URL('corporate-network.html',location.href);u.searchParams.set('view','videos');u.searchParams.set('video',a.id);
  const text=u.href;
  if(navigator.share){
   navigator.share({title:title(a),url:text}).catch(()=>{});
  }else if(navigator.clipboard?.writeText){
   navigator.clipboard.writeText(text).then(()=>toast('Private video link copied.')).catch(()=>window.prompt('Copy the video link:',text));
  }else window.prompt('Copy the private video link:',text);
 }
 function filterTopic(all){
  let x=all;
  if(topic==='today'){const midnight=new Date();midnight.setHours(0,0,0,0);x=x.filter(a=>Date.parse(a.created_at||0)>=midnight.getTime())}
  else if(topic==='unwatched')x=x.filter(a=>!watchHistory[a.id]);
  else if(categoryWords[topic])x=x.filter(a=>categoryWords[topic].test(title(a)+' '+(a.filename||'')));
  return x;
 }
 function searchVideo(all){
  const q=query.trim().toLowerCase();return q?all.filter(a=>(title(a)+' '+creator(a)+' '+(a.filename||'')+' '+(a.video_series_title||'')).toLowerCase().includes(q)):all;
 }
 function sortVideos(all){
  const result=all.slice();
  if(sort==='oldest')result.reverse();
  if(sort==='title')result.sort((a,b)=>title(a).localeCompare(title(b)));
  return result;
 }
 function lazyThumb(v,url,a){
  if(!url)return;
  v.preload='metadata';v.playsInline=true;v.muted=true;v.setAttribute('aria-hidden','true');v.tabIndex=-1;
  v.addEventListener('loadedmetadata',()=>{
   if(!a||!v.videoWidth||!v.videoHeight||!Number.isFinite(v.duration))return;
   const was=shortVideo(a);
   const newInfo={width:v.videoWidth,height:v.videoHeight,duration:v.duration};
   const old=shortInfo[a.id];
   if(!old||old.width!==newInfo.width||old.height!==newInfo.height||Math.round(old.duration)!==Math.round(newInfo.duration)){
    shortInfo[a.id]=newInfo;storeInfo();
    if(!was&&shortVideo(a)&&selected==='home')requestAnimationFrame(()=>renderShortsShelf());
   }
  },{once:true});
  if(!('IntersectionObserver' in window)){v.src=url;return}
  if(!observer){
   observer=new IntersectionObserver(entries=>{
    for(const e of entries){
     if(!e.isIntersecting)continue;
     const el=e.target;if(el._bcSource&&!el.src)el.src=el._bcSource;
     observer.unobserve(el);
    }
   },{rootMargin:'130px'});
  }
  v._bcSource=url;observer.observe(v);
 }
 function tile(a,queue=videosCache){
  const card=make('article','bc-yt-video-card');
  const thumbnail=button('', 'bc-yt-thumb',()=>openCinema(a,queue));
  thumbnail.setAttribute('aria-label','Watch '+title(a));
  const url=source(a);
  if(url){
   const v=make('video');lazyThumb(v,url,a);thumbnail.append(v);
  }else thumbnail.append(make('span','bc-yt-preview-unavailable','PREVIEW UNAVAILABLE'));
  thumbnail.append(make('span','bc-yt-play','▶'));
  if(shortInfo[a.id]?.duration){const d=shortInfo[a.id].duration;const t=Math.floor(d/60)+':'+String(Math.floor(d%60)).padStart(2,'0');thumbnail.append(make('span','bc-yt-duration',t))}
  if(progPercent(a)){
   const p=make('span','bc-video-progress');p.style.width=progPercent(a)+'%';thumbnail.append(p);
  }
  const body=make('div','bc-yt-cardbody');
  const image=make('div','bc-yt-creator-avatar',creator(a).slice(0,1).toUpperCase()||'B');
  const info=make('div','bc-yt-video-details');
  info.append(make('strong','',title(a)),make('small','',creator(a)),make('small','',when(a)));
  const save=button(saved(a)?'✓':'＋','bc-yt-card-save',()=>toggleLater(a));
  save.title=saved(a)?'Remove from Watch Later':'Save to Watch Later';
  save.setAttribute('aria-label',save.title);body.append(image,info,save);
  card.append(thumbnail,body);return card;
 }
 function putGrid(id,videos,emptyMessage='No approved videos match this view.'){
  const root=$(id);root.replaceChildren();
  if(!videos.length){
   const empty=make('div','bc-yt-empty',emptyMessage);
   if(!allVideos().length)empty.append(button('Upload a video','bc-yt-empty-action',uploadVideo));
   root.append(empty);return;
  }
  for(const a of videos)root.append(tile(a,videos));
 }
 function putShelf(id,videos,kind='normal'){
  const root=$(id);root.replaceChildren();
  for(const a of videos){
   if(kind==='shorts'){
    const card=make('article','bc-yt-short-tile');
    const tap=button('','bc-yt-short-thumb',()=>goShorts(a.id));
    const url=source(a);
    if(url){const v=make('video');lazyThumb(v,url,a);tap.append(v)}
    tap.append(make('span','bc-yt-short-play','▶'));
    card.append(tap,make('strong','',title(a)),make('small','',creator(a)));root.append(card);
   }else root.append(tile(a,videos));
  }
 }
 function updateHead(){
  $('bcVideoTotal').textContent=videosCache.length+' VIDEO'+(videosCache.length===1?'':'S');
  const me=profile(state.user?.id);
  $('bcVideoAccount').textContent=String(me?.display_name||'B').slice(0,1).toUpperCase();
 }
 function renderSubscriptions(){
  const container=$('bcVideoSubscribedChannels');container.replaceChildren();
  const owners=new Set(videosCache.map(a=>a.owner_id));
  const followingIds=new Set(state.follows.filter(f=>f.follower_id===state.user?.id).map(f=>f.following_id));
  const users=Array.from(owners).filter(id=>followingIds.has(id)).sort((a,b)=>personName(profile(a)).localeCompare(personName(profile(b))));
  if(!users.length){container.append(make('p','bc-yt-nav-caption','Channels you follow appear here.'));return}
  for(const id of users.slice(0,22)){
   const b=button('','bc-yt-subitem',()=>goChannels(id));
   b.append(make('span','bc-yt-subavatar',personName(profile(id)).slice(0,1).toUpperCase()),
    make('span','',personName(profile(id))));container.append(b);
  }
 }
 function renderShortsShelf(){
  if(selected!=='home')return;
  const v=shorts(videosCache).slice(0,12);
  $('bcVideoShortsSection').hidden=!v.length||topic!=='all'||Boolean(query);
  if(v.length)putShelf('bcVideoShortsShelf',v,'shorts');
 }
 function renderHome(){
  const all=searchVideo(filterTopic(videosCache));
  const sorted=sortVideos(all);
  $('bcVideoHomeTitle').textContent=query?'Search results':topic==='all'?'Recommended for you':document.querySelector('#bcVideoTopics [data-video-topic="'+topic+'"]')?.textContent||'Videos';
  $('bcVideoResults').textContent=sorted.length+' video'+(sorted.length===1?'':'s');
  if(topic==='all'&&!query&&!videosCache.length){
   $('bcVideoHomeNotice').hidden=false;
   $('bcVideoHomeNotice').textContent='Videos will appear here when approved members upload to BLACKCELL.';
  }else $('bcVideoHomeNotice').hidden=true;
  putGrid('videoGrid',sorted.slice(0,24),query?'No videos match your search.':topic!=='all'?'Nothing matches this category yet.':'No approved videos on the Network yet.');
  renderShortsShelf();
  const watching=videosCache.filter(progressValid).sort((a,b)=>(resume[b.id]?.updated||0)-(resume[a.id]?.updated||0)).slice(0,12);
  $('bcVideoContinueSection').hidden=!watching.length||topic!=='all'||Boolean(query);
  if(!$('bcVideoContinueSection').hidden)putShelf('bcVideoContinue',watching);
  $('bcVideoLatestSection').hidden=!videosCache.length||topic!=='all'||Boolean(query);
  if(!$('bcVideoLatestSection').hidden)putShelf('bcVideoLatest',videosCache.slice(0,12));
 }
 function renderChannels(){
  const followerIds=new Set(state.follows.filter(f=>f.follower_id===state.user?.id).map(f=>f.following_id));
  // RLS already limits state.profiles to verified, active BLACKCELL members.
  // Show signed-up members even when they have not uploaded videos yet.
  const allIds=state.profiles.map(p=>p.user_id).filter(Boolean)
   .sort((a,b)=>personName(profile(a)).localeCompare(personName(profile(b))));
  const q=query.trim().toLowerCase();
  const options=allIds.filter(id=>{
   if(selected==='following'&&!followerIds.has(id))return false;
   return !q||personName(profile(id)).toLowerCase().includes(q)
    ||videosCache.some(a=>a.owner_id===id&&title(a).toLowerCase().includes(q));
  });
  const list=$('bcVideoChannelList');list.replaceChildren();
  $('bcVideoChannelsTitle').textContent=selected==='following'?'Subscriptions · People you follow':'Browse Member Channels';
  $('bcVideoChannelProfile').hidden=!options.length;
  if(!options.length){
   list.append(make('div','bc-yt-empty',selected==='following'?'No followed members match this view yet.':'No registered BLACKCELL member channels match the search.'));
   $('bcVideoChannelVideosTitle').textContent='Latest videos';
   putGrid('bcVideoChannelGrid',[],'No approved videos from these channels yet.');
   return;
  }
  if(!channelId||!options.includes(channelId))channelId=options[0];
  for(const id of options){
   const count=videosCache.filter(a=>a.owner_id===id).length;
   const b=button('','bc-yt-channel-card'+(id===channelId?' is-selected':''),()=>{channelId=id;renderChannels()});
   b.append(make('span','bc-yt-channel-avatar',personName(profile(id)).slice(0,1).toUpperCase()));
   const t=make('span','bc-yt-channel-text');
   t.append(make('strong','',personName(profile(id))),make('small','',count+' video'+(count===1?'':'s')+(followerIds.has(id)?' · Following':'')));
   b.append(t);list.append(b);
  }
  $('bcVideoChannelVideosTitle').textContent=personName(profile(channelId))+' · Videos';
  const vids=searchVideo(videosCache.filter(a=>a.owner_id===channelId));
  putGrid('bcVideoChannelGrid',sortVideos(vids),'This member has not published any approved videos yet.');
 }
 function moviePoster(a,queue){
  const c=make('article','bc-movies-poster-card');
  const tap=button('','bc-movies-poster-thumb',()=>openCinema(a,queue));
  const url=source(a);
  if(url){const v=make('video');lazyThumb(v,url,a);tap.append(v)}
  else tap.append(make('span','bc-yt-preview-unavailable','PREVIEW UNAVAILABLE'));
  tap.append(make('span','bc-movies-play','▶'));
  tap.append(make('span','bc-movies-format-tag',a.video_category==='documentary'?'DOCUMENTARY':'MOVIE'));
  const info=make('div','bc-movies-poster-info');
  info.append(make('strong','',title(a)),make('small','',creator(a)));
  if(a.video_synopsis)info.append(make('p','',String(a.video_synopsis).slice(0,140)));
  c.append(tap,info);return c;
 }
 function renderMovies(){
  const filmV=videosCache.filter(a=>['movie','series','documentary'].includes(a.video_category));
  const films=searchVideo(filmV.filter(a=>a.video_category==='movie'));
  const docs=searchVideo(filmV.filter(a=>a.video_category==='documentary'));
  const episodes=searchVideo(filmV.filter(a=>a.video_category==='series'));
  const continuing=filmV.filter(progressValid).sort((a,b)=>(resume[b.id]?.updated||0)-(resume[a.id]?.updated||0));
  $('bcMoviesContinueSection').hidden=movieFilter!=='all'||!continuing.length||Boolean(seriesFocus);
  if(!$('bcMoviesContinueSection').hidden)putShelf('bcMoviesContinue',continuing.slice(0,12));
  for(const b of $('bcMoviesTabs').querySelectorAll('[data-movies-filter]')){
   const active=b.dataset.moviesFilter===movieFilter;
   b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));
  }
  const filmSection=$('bcMoviesFilmsSection'),seriesSection=$('bcMoviesSeriesSection'),docSection=$('bcMoviesDocumentariesSection');
  const episodeSection=$('bcMoviesEpisodesSection');
  filmSection.hidden=Boolean(seriesFocus)||(movieFilter==='series'||movieFilter==='documentary');
  seriesSection.hidden=Boolean(seriesFocus)||(movieFilter==='movie'||movieFilter==='documentary');
  docSection.hidden=Boolean(seriesFocus)||(movieFilter==='movie'||movieFilter==='series');
  episodeSection.hidden=!seriesFocus;
  const filmGrid=$('bcMoviesFilms');filmGrid.replaceChildren();
  $('bcMoviesFilmsHeading').textContent='Movies';
  $('bcMoviesFilmsCount').textContent=films.length+' film'+(films.length===1?'':'s');
  if(!films.length)filmGrid.append(make('div','bc-movies-empty','No approved movies yet. Use Add a Movie to submit one for review.'));
  else for(const a of films)filmGrid.append(moviePoster(a,films));
  const docGrid=$('bcMoviesDocumentaries');docGrid.replaceChildren();
  if(!docs.length)docGrid.append(make('div','bc-movies-empty','No approved documentaries yet.'));
  else for(const a of docs)docGrid.append(moviePoster(a,docs));
  const groups=new Map();
  for(const a of episodes){
   const titleText=String(a.video_series_title||title(a)).trim()||'Untitled series';
   const key=titleText.toLowerCase();
   if(!groups.has(key))groups.set(key,{name:titleText,items:[]});
   groups.get(key).items.push(a);
  }
  const seriesGrid=$('bcMoviesSeries');seriesGrid.replaceChildren();
  if(!groups.size)seriesGrid.append(make('div','bc-movies-empty','No TV shows have been approved yet. Use Add an Episode to start a series.'));
  else for(const [key,group] of groups){
   const c=make('article','bc-movies-show-card');
   const art=button('','bc-movies-show-thumb',()=>{seriesFocus=key;renderMovies()});
   const a=group.items[0],url=source(a);
   if(url){const v=make('video');lazyThumb(v,url,a);art.append(v)}
   art.append(make('span','bc-movies-show-play','▶ EPISODES'));
   const info=make('div','bc-movies-show-info');
   info.append(make('strong','',group.name),make('small','',group.items.length+' episode'+(group.items.length===1?'':'s')));
   c.append(art,info);seriesGrid.append(c);
  }
  if(seriesFocus){
   const group=groups.get(seriesFocus);
   if(!group){seriesFocus=null;episodeSection.hidden=true;return}
   $('bcMoviesEpisodesTitle').textContent=group.name+' · Episodes';
   const sorted=group.items.slice().sort((a,b)=>(a.video_season||1)-(b.video_season||1)||(a.video_episode||1)-(b.video_episode||1));
   putGrid('bcMoviesEpisodes',sorted,'There are no approved episodes.');
  }
 }
 function identity(){
  const p=profile(state.user?.id);
  const root=$('bcVideoLibraryIdentity');root.replaceChildren();
  const icon=make('div','bc-yt-library-avatar',personName(p).slice(0,1).toUpperCase());
  const detail=make('div','bc-yt-library-name');detail.append(make('h2','',personName(p)),make('p','','Your private video library · '+videosCache.filter(a=>a.owner_id===state.user?.id).length+' uploads'));
  root.append(icon,detail,button('View My Network Profile','bc-yt-library-profile',()=>openProfile(state.user.id,'videos')));
 }
 function libraryShelf(label,all,collection,max=12){
  if(!all.length)return null;
  const section=make('section','bc-yt-section bc-yt-library-shelf');
  const heading=make('div','bc-yt-section-head');heading.append(make('h2','',label));
  heading.append(button('See all →','',()=>go(collection)));section.append(heading);
  const row=make('div','bc-video-scroller');for(const a of all.slice(0,max))row.append(tile(a,all));
  section.append(row);return section;
 }
 function renderLibrary(){
  identity();
  const root=$('bcVideoLibraryShelves');root.replaceChildren();
  const recents=videosCache.filter(a=>watchHistory[a.id]).sort((a,b)=>watchHistory[b.id]-watchHistory[a.id]);
  const continueV=videosCache.filter(progressValid).sort((a,b)=>(resume[b.id]?.updated||0)-(resume[a.id]?.updated||0));
  const rows=[
   libraryShelf('Continue watching',continueV,'history'),
   libraryShelf('History',recents,'history'),
   libraryShelf('Shorts you watched',recents.filter(shortVideo),'history'),
   libraryShelf('Liked videos',videosCache.filter(a=>liked(a)),'liked'),
   libraryShelf('Watch later',videosCache.filter(saved),'watchlater'),
   libraryShelf('My uploads',videosCache.filter(a=>a.owner_id===state.user?.id),'uploads')
  ];
  let inserted=0;for(const r of rows){if(r){root.append(r);inserted++}}
  if(!inserted)root.append(make('div','bc-yt-empty','Your library is ready. Watch, like, or save approved videos to build your collection.'));
 }
 function renderCollection(){
  const labels={history:'History',watchlater:'Watch later',uploads:'My uploads',liked:'Liked videos'};
  $('bcVideoCollectionTitle').textContent=labels[selected]||'Videos';
  let all=videosCache;
  if(selected==='history')all=all.filter(a=>watchHistory[a.id]).sort((a,b)=>watchHistory[b.id]-watchHistory[a.id]);
  if(selected==='watchlater')all=all.filter(saved);
  if(selected==='liked')all=all.filter(liked);
  if(selected==='uploads')all=all.filter(a=>a.owner_id===state.user?.id);
  putGrid('bcVideoCollectionGrid',sortVideos(searchVideo(all)),'No videos in this collection yet.');
 }
 function renderVisible(){
  if(!initialized||state.view!=='videos')return;
  ensureSaved();videosCache=allVideos();updateHead();renderSubscriptions();
  if(observer){observer.disconnect();observer=null}
  const displays=['home','shorts','channels','movies','library','collection'];
  const currentScreen=selected==='following'?'channels':['history','watchlater','uploads','liked'].includes(selected)?'collection':selected;
  for(const d of displays)document.querySelector('[data-video-screen="'+d+'"]').hidden=currentScreen!==d;
  $('bcVideoTopics').hidden=selected!=='home';
  for(const n of $('bcVideoShell').querySelectorAll('[data-vnav]')){
   const active=n.dataset.vnav===selected||(selected==='liked'&&n.dataset.vnav==='library');
   n.classList.toggle('is-active',active);n.setAttribute('aria-current',active?'page':'false');
  }
  if(currentScreen==='home')renderHome();
  if(currentScreen==='channels')renderChannels();
  if(currentScreen==='movies')renderMovies();
  if(currentScreen==='library')renderLibrary();
  if(currentScreen==='collection')renderCollection();
  if(currentScreen==='shorts')renderShorts();
 }
 function go(name){
  if(!initialized)return;
  if(selected==='shorts'&&name!=='shorts')stopShort();
  if(name!=='movies')seriesFocus=null;
  selected=name;renderVisible();
  window.scrollTo({top:0,behavior:'auto'});
 }
 function goChannels(id){channelId=id;go('channels')}
 function openCreate(){
  $('bcVideoCreateMenu').hidden=false;
  $('bcVideoCreateVideo').focus();
 }
 function closeCreate(){$('bcVideoCreateMenu').hidden=true}
 function stopShort(){
  const p=$('bcVideoShortPlayer');
  if(p){const a=shortQueue[shortIndex];track(a,p,true);p.pause();p.removeAttribute('src');p.load();displayedShortId=null}
 }
 function goShorts(id=null){
  shortQueue=shorts(allVideos());shortIndex=Math.max(0,shortQueue.findIndex(a=>a.id===id));
  go('shorts');
 }
 function renderShorts(){
  shortQueue=shorts(videosCache);
  $('bcVideoShortsPlayerArea').hidden=!shortQueue.length;
  $('bcVideoShortsEmpty').hidden=Boolean(shortQueue.length);
  if(!shortQueue.length)return;
  if(shortIndex>=shortQueue.length||shortIndex<0)shortIndex=0;
  if(displayedShortId===shortQueue[shortIndex]?.id&&$('bcVideoShortPlayer').src){syncShortActions();return}
  loadShort();
 }
 function syncShortActions(){
  if(selected!=='shorts'||!shortQueue.length)return;
  const a=shortQueue[shortIndex];
  $('bcVideoShortLike').firstChild.textContent=liked(a)?'♥':'♡';
  $('bcVideoShortSave').firstChild.textContent=saved(a)?'▣':'▢';
  $('bcVideoShortPrev').disabled=shortIndex<=0;
  $('bcVideoShortNext').disabled=shortIndex>=shortQueue.length-1;
 }
 function loadShort(){
  const a=shortQueue[shortIndex],v=$('bcVideoShortPlayer');if(!a)return;
  const src=source(a);
  v.pause();v.removeAttribute('src');v.load();v.onloadedmetadata=null;
  $('bcVideoShortCreator').textContent=creator(a);
  $('bcVideoShortTitle').textContent=title(a);
  if(!src){displayedShortId=null;toast('This short is temporarily unavailable.');return}
  displayedShortId=a.id;remember(a);mostRecentWrite=0;
  v.src=src;v.load();
  const last=Number(resume[a.id]?.time||0);
  v.onloadedmetadata=()=>{if(last>=5&&last<v.duration-7)try{v.currentTime=last}catch{}};
  v.play().catch(()=>{});
  syncShortActions();
 }
 function nextShort(delta){
  if(selected!=='shorts'||!shortQueue.length)return;
  const v=$('bcVideoShortPlayer');track(shortQueue[shortIndex],v,true);
  const next=shortIndex+delta;if(next<0||next>=shortQueue.length)return;
  shortIndex=next;loadShort();
 }
 function syncCinemaActions(){
  if(!activeCinema)return;
  $('bcCinemaWatchLater').textContent=saved(activeCinema)?'✓ SAVED TO WATCH LATER':'＋ WATCH LATER';
  $('bcCinemaLike').textContent=liked(activeCinema)?'♥ LIKED':'♡ LIKE';
 }
 function syncCinemaNav(){
  const i=cinemaQueue.findIndex(x=>x.id===activeCinema?.id);
  $('bcCinemaPrev').disabled=i<1;
  $('bcCinemaNext').disabled=i<0||i>=cinemaQueue.length-1;
 }
 function openCinema(a,list){
  if(!initialized)return;
  const url=source(a);if(!url){toast('Video temporarily unavailable. Refresh the channel.');return}
  const player=$('bcCinemaPlayer');
  if(activeCinema){track(activeCinema,player,true);player.pause()}
  activeCinema=a;cinemaQueue=list?.length?list.slice():allVideos();
  if(!cinemaQueue.some(x=>x.id===a.id))cinemaQueue.unshift(a);
  remember(a);mostRecentWrite=0;
  $('bcCinemaTitle').textContent=title(a);
  $('bcCinemaVideoTitle').textContent=title(a);
  $('bcCinemaVideoMeta').textContent=creator(a)+' · '+when(a);
  $('bcCinemaDescription').textContent='Approved private BLACKCELL Network video.';
  syncCinemaNav();syncCinemaActions();
  $('bcVideoCinema').hidden=false;document.body.classList.add('bc-cinema-open');
  player.src=url;player.load();
  const last=Number(resume[a.id]?.time||0);
  player.onloadedmetadata=()=>{if(last>=5&&last<player.duration-8)try{player.currentTime=last}catch{}};
  player.play().catch(()=>{});
  $('bcCinemaClose').focus({preventScroll:true});
 }
 function closeCinema(){
  if(!activeCinema||$('bcVideoCinema').hidden)return;
  const p=$('bcCinemaPlayer');track(activeCinema,p,true);
  p.pause();p.removeAttribute('src');p.load();p.onloadedmetadata=null;
  activeCinema=null;cinemaQueue=[];mostRecentWrite=0;
  $('bcVideoCinema').hidden=true;document.body.classList.remove('bc-cinema-open');
  if(state.view==='videos')renderVisible();
 }
 function moveCinema(n){
  if(!activeCinema)return;
  const i=cinemaQueue.findIndex(x=>x.id===activeCinema.id);
  const next=cinemaQueue[i+n];if(next)openCinema(next,cinemaQueue);
 }
 function leave(){
  closeCinema();if(selected==='shorts')stopShort();closeCreate();
 }
 function init(){
  if(initialized)return;initialized=true;ensureSaved();
  const url=new URLSearchParams(location.search);
  const initialSection=url.get('section');
  if(['home','movies','channels','library','shorts','following','history','watchlater','uploads'].includes(initialSection))selected=initialSection;
  const id=url.get('video');if(id&&/^[a-f0-9-]{36}$/i.test(id))pendingId=id;
  $('bcVideoMenu').addEventListener('click',()=>{
   sidebarCollapsed=!sidebarCollapsed;
   $('bcVideoShell').classList.toggle('is-collapsed',sidebarCollapsed);
   $('bcVideoMenu').setAttribute('aria-expanded',String(!sidebarCollapsed));
  });
  $('bcVideoHomeLogo').addEventListener('click',()=>go('home'));
  $('bcVideoBackNetwork').addEventListener('click',()=>switchView('feed'));
  $('bcVideoExitSidebar').addEventListener('click',()=>switchView('feed'));
  $('bcVideoAccount').addEventListener('click',()=>go('library'));
  for(const b of $('bcVideoShell').querySelectorAll('[data-vnav]'))b.addEventListener('click',()=>go(b.dataset.vnav));
  $('bcVideoBrowseChannels').addEventListener('click',()=>go('channels'));
  $('bcVideoChannelProfile').addEventListener('click',()=>{if(channelId)openProfile(channelId,'videos')});
  $('bcMoviesUploadFilm').addEventListener('click',()=>uploadVideo('movie'));
  $('bcMoviesUploadEpisode').addEventListener('click',()=>uploadVideo('series'));
  $('bcMoviesBackToSeries').addEventListener('click',()=>{seriesFocus=null;renderMovies()});
  for(const b of $('bcMoviesTabs').querySelectorAll('[data-movies-filter]'))b.addEventListener('click',()=>{
   movieFilter=b.dataset.moviesFilter||'all';seriesFocus=null;renderMovies();
  });
  $('bcVideoSearch').addEventListener('input',e=>{query=e.target.value||'';renderVisible()});
  $('bcVideoSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go('home')}});
  for(const b of $('bcVideoTopics').querySelectorAll('[data-video-topic]'))b.addEventListener('click',()=>{
   topic=b.dataset.videoTopic;
   for(const t of $('bcVideoTopics').querySelectorAll('button')){
    t.classList.toggle('is-active',t===b);t.setAttribute('aria-pressed',String(t===b));
   }
   go('home');
  });
  $('bcVideoSort').addEventListener('change',e=>{sort=e.target.value||'newest';renderVisible()});
  $('bcVideoOpenShorts').addEventListener('click',()=>goShorts());
  $('bcVideoContinueAll').addEventListener('click',()=>go('library'));
  $('bcVideoUpload').addEventListener('click',()=>uploadVideo('standard'));
  $('bcVideoMobileCreate').addEventListener('click',openCreate);
  $('bcVideoCreateDismiss').addEventListener('click',closeCreate);
  $('bcVideoCreateCancel').addEventListener('click',closeCreate);
  $('bcVideoCreateVideo').addEventListener('click',()=>{closeCreate();uploadVideo('standard')});
  $('bcVideoCreatePost').addEventListener('click',()=>{closeCreate();switchView('feed');$('postBody')?.focus()});
  $('bcCinemaClose').addEventListener('click',closeCinema);
  $('bcVideoCinema').addEventListener('click',e=>{if(e.target===$('bcVideoCinema'))closeCinema()});
  $('bcCinemaPrev').addEventListener('click',()=>moveCinema(-1));
  $('bcCinemaNext').addEventListener('click',()=>moveCinema(1));
  $('bcCinemaCreator').addEventListener('click',()=>{if(!activeCinema)return;const owner=activeCinema.owner_id;closeCinema();openProfile(owner,'videos')});
  $('bcCinemaWatchLater').addEventListener('click',()=>{if(activeCinema)toggleLater(activeCinema)});
  $('bcCinemaLike').addEventListener('click',()=>{if(activeCinema)toggleLike(activeCinema)});
  $('bcCinemaShare').addEventListener('click',()=>{if(activeCinema)copyLink(activeCinema)});
  $('bcCinemaFullscreen').addEventListener('click',()=>{
   const v=$('bcCinemaPlayer');if(v.requestFullscreen)void v.requestFullscreen().catch(()=>{});
   else if(v.webkitEnterFullscreen)v.webkitEnterFullscreen();
  });
  const cinemaPlayer=$('bcCinemaPlayer');
  cinemaPlayer.addEventListener('timeupdate',()=>track(activeCinema,cinemaPlayer));
  cinemaPlayer.addEventListener('pause',()=>track(activeCinema,cinemaPlayer,true));
  cinemaPlayer.addEventListener('ended',()=>{track(activeCinema,cinemaPlayer,true)});
  $('bcVideoShortLike').addEventListener('click',()=>{if(shortQueue[shortIndex])toggleLike(shortQueue[shortIndex])});
  $('bcVideoShortSave').addEventListener('click',()=>{if(shortQueue[shortIndex])toggleLater(shortQueue[shortIndex])});
  $('bcVideoShortShare').addEventListener('click',()=>{if(shortQueue[shortIndex])copyLink(shortQueue[shortIndex])});
  $('bcVideoShortNext').addEventListener('click',()=>nextShort(1));
  $('bcVideoShortPrev').addEventListener('click',()=>nextShort(-1));
  const shortsPlayer=$('bcVideoShortPlayer');
  shortsPlayer.addEventListener('timeupdate',()=>track(shortQueue[shortIndex],shortsPlayer));
  shortsPlayer.addEventListener('pause',()=>track(shortQueue[shortIndex],shortsPlayer,true));
  shortsPlayer.addEventListener('ended',()=>{track(shortQueue[shortIndex],shortsPlayer,true);nextShort(1)});
  let touchY=null;
  $('bcVideoShortsPlayerArea').addEventListener('touchstart',e=>{touchY=e.touches[0]?.clientY||0},{passive:true});
  $('bcVideoShortsPlayerArea').addEventListener('touchend',e=>{
   if(touchY===null)return;
   const dy=(e.changedTouches[0]?.clientY||0)-touchY;touchY=null;
   if(Math.abs(dy)>55)nextShort(dy<0?1:-1);
  },{passive:true});
  let wheelAt=0;
  $('bcVideoShortsPlayerArea').addEventListener('wheel',e=>{
   if(Math.abs(e.deltaY)<18||Date.now()-wheelAt<650)return;
   wheelAt=Date.now();e.preventDefault();nextShort(e.deltaY>0?1:-1);
  },{passive:false});
  window.addEventListener('keydown',e=>{
   if(!$('bcVideoCinema').hidden){
    if(e.key==='Escape'){e.preventDefault();closeCinema()}
    else if(e.altKey&&e.key==='ArrowRight')moveCinema(1);
    else if(e.altKey&&e.key==='ArrowLeft')moveCinema(-1);
    return;
   }
   if(!$('bcVideoCreateMenu').hidden&&e.key==='Escape'){closeCreate();return}
   if(selected!=='shorts'||state.view!=='videos'||e.target instanceof HTMLInputElement)return;
   if(e.key==='ArrowDown'){e.preventDefault();nextShort(1)}
   if(e.key==='ArrowUp'){e.preventDefault();nextShort(-1)}
  });
  document.addEventListener('visibilitychange',()=>{
   if(!document.hidden)return;
   track(activeCinema,cinemaPlayer,true);
   if(selected==='shorts')track(shortQueue[shortIndex],shortsPlayer,true);
  });
 }
 function render(){
  if(!initialized)return;renderVisible();
  if(pendingId){
   const a=videosCache.find(x=>x.id===pendingId);pendingId=null;
   if(a)queueMicrotask(()=>{if(state.view==='videos')openCinema(a,videosCache)});
  }
 }
 return {init,render,close:leave};
}
