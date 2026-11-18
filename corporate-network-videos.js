/* BLACKCELL Video Channel: content-first, YouTube-like navigation,
   Shorts and private Plex-style library. All videos come from already
   approved Network assets; personal likes/history are device-local. */
import {isWorldVideo,worldVideoTitle} from './blackcell-world-video-catalog.js?v=20261117-watch-posters-r2';
export function createBlackcellVideoChannel({worldVideoPreviews,readWorldVideo,attachRenderedWorld,bindTransfer,loadVideoComments,addVideoComment,shareVideoInside,followChannel,channelAvatar,state,mediaUrl,posterUrl,posterVersions,sharedMedia,profile,personName,stamp,switchView,openProfile,uploadVideo,playStream,reviewStream,refreshStream,toast}){
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
 let channelTab='videos',channelSort='latest',channelQuery='',channelBusy=false;
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
 const title=a=>isWorldVideo(a)?worldVideoTitle(a):String(a.title||postOf(a)?.body||a.caption||a.filename||'Untitled video').replace(/\s+/g,' ').trim().slice(0,135)||'Untitled video';
 const creator=a=>personName(profile(a.owner_id));
 const source=a=>String(mediaUrl(a)||'');
 let cinemaObject='',shortObject='',shortRequest=0,cinemaRequest=0;
 function releaseObject(which){if(which==='cinema'){if(cinemaObject)URL.revokeObjectURL(cinemaObject);cinemaObject=''}else{if(shortObject)URL.revokeObjectURL(shortObject);shortObject=''}}
 window.addEventListener('pagehide',()=>{releaseObject('cinema');releaseObject('short')});
 function mountWorldPoster(a,frame){const img=make('img','bc-video-custom-poster');img.alt='';img.hidden=true;img.style.cssText='width:100%;height:100%;object-fit:cover;position:absolute;inset:0';frame.style.position='relative';frame.append(img);worldVideoPreviews.mount(a,img)}
 const when=a=>stamp(a.created_at);
 const newest=(a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0);
 function allVideos(){
  const visible=[...state.assets,...(state.streamVideos||[])].filter(a=>a.kind==='video'&&['post','library'].includes(a.purpose)&&(sharedMedia(a)||(isWorldVideo(a)&&a.owner_id===state.user?.id&&a.review_status==='pending'))&&(isWorldVideo(a)||a.owner_id===state.user?.id||Boolean(profile(a.owner_id))));
  return [...new Map(visible.map(a=>[a.id,a])).values()].sort(newest);
 }
 function shortVideo(a){
  if(['movie','series','documentary'].includes(a.video_category))return false;
  const tags=Array.isArray(a.military_tags)?a.military_tags:[];
  if(tags.includes('bc-video-orientation:short'))return true;
  if(tags.includes('bc-video-orientation:standard'))return false;
  const info=shortInfo[a.id];
  if(info&&info.width>0&&info.height>0)return info.height>info.width;
  return regexShort.test(title(a)+' '+String(a.filename||''));
 }
 const shorts=all=>all.filter(a=>!a.bunny_stream&&shortVideo(a));
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
  if(!a||a.bunny_stream||!v||!Number.isFinite(v.duration)||v.duration<5||!Number.isFinite(v.currentTime))return;
  const now=Date.now();if(!force&&now-mostRecentWrite<2600)return;mostRecentWrite=now;
  if(v.ended||v.currentTime>=v.duration-6)delete resume[a.id];
  else if(v.currentTime>=5)resume[a.id]={time:Math.floor(v.currentTime),duration:Math.floor(v.duration),updated:now};
  storeResume();
 }
 function shareInside(a){
  if(!a||!sharedMedia(a)){toast('Only approved, shareable videos can be shared.');return}
  if(typeof shareVideoInside!=='function'){toast('Internal sharing is unavailable.');return}
  const paid=['movie','movies','series','tv','tv show','tv shows','tv series','documentary','documentaries','film','films','episode','episodes','television','television series'].includes(String(a.video_category||'').toLowerCase().trim())||a.paid_content===true||a.is_paid===true||a.bunny_stream;
  const dialog=make('dialog','bc-tube-share-dialog'),heading=make('h3','','Share within BLACKCELL'),hint=make('p','','Only authorized Network members can open shared videos.');
  const close=()=>{dialog.close();dialog.remove()};
  const feed=button('Share to Network','',()=>{close();shareVideoInside(a)});
  dialog.append(heading,hint,feed);
  if(!paid&&/^[0-9a-f-]{36}$/i.test(a.id)){
   const copy=button('Copy internal iMessage reference','',async()=>{
    const reference='blackcell:video/'+a.id;
    try{await navigator.clipboard.writeText(reference);close();toast('Internal reference copied. Paste into BLACKCELL iMessage.')}catch{const field=make('input');field.readOnly=true;field.value=reference;field.setAttribute('aria-label','Internal reference');dialog.append(field);field.select();hint.textContent='Copy this reference and paste it into BLACKCELL iMessage.'}
   });dialog.append(copy);
  }
  dialog.append(button('Cancel','',close));dialog.addEventListener('cancel',e=>{e.preventDefault();close()});document.body.append(dialog);dialog.showModal();
 }
 function openById(id){
  const a=allVideos().find(v=>v.id===id);
  if(!a){toast('Video is unavailable to your account.');return false}
  void openCinema(a,allVideos());return true;
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
 function suspendBrowsePreviews(){if(observer){observer.disconnect();observer=null}for(const v of $('bcVideoShell').querySelectorAll('.bc-yt-body video')){if(v.id==='bcVideoShortPlayer')continue;v.pause();if(v.hasAttribute('src')){v.removeAttribute('src');v.load()}}worldVideoPreviews.setPaused?.(true)}
 function lazyThumb(v,url,a){
  if(!url||activeCinema)return;
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
     if(!e.isIntersecting||activeCinema)continue;
     const el=e.target;if(el._bcSource&&!el.src)el.src=el._bcSource;
     observer.unobserve(el);
    }
   },{rootMargin:'130px'});
  }
  v._bcSource=url;observer.observe(v);
 }
 let fullThumbnailLayer=null;
 function closeFullThumbnail(){
  if(!fullThumbnailLayer)return;
  fullThumbnailLayer.remove();
  fullThumbnailLayer=null;
  document.body.classList.remove('bc-full-thumbnail-open');
  document.removeEventListener('keydown',thumbnailEscape);
 }
 function thumbnailEscape(event){
  if(event.key==='Escape'&&fullThumbnailLayer){event.preventDefault();closeFullThumbnail()}
 }
 async function viewFullThumbnail(a,cover,videoUrl){
  if(!cover&&!videoUrl)return;
  closeFullThumbnail();
  const overlay=make('div','bc-full-thumb-overlay');
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','Full thumbnail for '+title(a));
  const pane=make('div','bc-full-thumb-panel');
  const bar=make('div','bc-full-thumb-toolbar');
  const label=make('strong','',title(a));
  const close=button('✕ CLOSE','bc-full-thumb-close',closeFullThumbnail);
  close.setAttribute('aria-label','Close full thumbnail');
  bar.append(label,close);
  const stage=make('div','bc-full-thumb-stage');
  let artworkImage=null;
  if(cover){
   const img=make('img','bc-full-original-artwork');
   artworkImage=img;
   img.src=cover;
   img.alt='Complete original thumbnail for '+title(a);
   img.decoding='async';
   stage.append(img);
  }else{
   const video=make('video');
   video.src=videoUrl;video.preload='metadata';video.muted=true;video.playsInline=true;
   video.controls=true;video.setAttribute('aria-label','Video preview for '+title(a));
   stage.append(video);
  }
  const choices=make('div','bc-full-poster-choices');choices.hidden=true;
  pane.append(bar,choices,stage,make('div','bc-full-thumb-caption','FULL IMAGE · ORIGINAL PROPORTIONS · NOTHING CROPPED'));
  overlay.append(pane);
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeFullThumbnail()});
  document.body.append(overlay);document.body.classList.add('bc-full-thumbnail-open');
  fullThumbnailLayer=overlay;
  document.addEventListener('keydown',thumbnailEscape);
  close.focus({preventScroll:true});
  if(artworkImage&&typeof posterVersions==='function'){
   try{
    const variants=await posterVersions(a);
    if(fullThumbnailLayer!==overlay||variants.length<2)return;
    choices.hidden=false;
    for(const variant of variants){
     const control=button(variant.label,'bc-full-poster-version',()=>{
      artworkImage.src=variant.url;
      for(const item of choices.querySelectorAll('button')){
       item.classList.toggle('is-active',item===control);
       item.setAttribute('aria-pressed',String(item===control));
      }
     });
     control.classList.toggle('is-active',variant.selected);
     control.setAttribute('aria-pressed',String(variant.selected));
     choices.append(control);
    }
   }catch(_){}
  }
 }
 function addFullThumbnailControl(card,a,cover,url){
  if(!cover&&!url)return;
  const buttonView=button(isFilmArtwork(a)?'⛶ VIEW FULL POSTER':'⛶ VIEW FULL','bc-view-full-thumb',()=>viewFullThumbnail(a,cover,url));
  buttonView.setAttribute('aria-label','View complete thumbnail for '+title(a));
  card.append(buttonView);
 }
 function isFilmArtwork(a){return ['movie','series','documentary'].includes(a.video_category)}
 function appendNativeArtwork(frame,src,alt,cls,film=false){
  const img=make('img',cls+' bc-native-artwork');
  img.alt=alt;img.loading='lazy';img.decoding='async';
  // Use actual image dimensions, not a forced 16:9 thumbnail.
  frame.classList.add('bc-native-artwork-frame');
  for(const [key,value] of [['aspect-ratio','auto'],['height','auto'],['min-height','0'],['max-height','none'],['display','block']])
   frame.style.setProperty(key,value,'important');
  for(const [key,value] of [['width','100%'],['height','auto'],['max-height','none'],['min-height','0'],['object-fit','contain'],['aspect-ratio','auto'],['position','static'],['display','block']])
   img.style.setProperty(key,value,'important');
  const fit=()=>{
   if(!img.naturalWidth||!img.naturalHeight)return;
   img.width=img.naturalWidth;img.height=img.naturalHeight;
   frame.dataset.artworkRatio=img.naturalWidth+'/'+img.naturalHeight;
  };
  img.addEventListener('load',fit,{once:true});
  frame.append(img);img.src=src;
  if(img.complete)fit();
  if(film){frame.classList.add('bc-complete-film-poster');frame.style.setProperty('aspect-ratio','2 / 3','important');frame.style.setProperty('height','auto','important');img.style.setProperty('height','100%','important');img.style.setProperty('position','absolute','important');img.style.setProperty('inset','0','important');}
  return img;
 }
 function tile(a,queue=videosCache){
  const card=make('article','bc-yt-video-card');
  const film=isFilmArtwork(a);
  if(film)card.classList.add('bc-film-video-card');
  const thumbnail=button('', 'bc-yt-thumb',()=>openCinema(a,queue));
  thumbnail.setAttribute('aria-label','Watch '+title(a));
  bindTransfer?.(thumbnail,a);
  const url=source(a),cover=posterUrl(a);
  if(cover){
   appendNativeArtwork(thumbnail,cover,'Cover for '+title(a),'bc-video-custom-poster',film);
  }else if(isWorldVideo(a)){
   mountWorldPoster(a,thumbnail);
  }else if(url){
   const v=make('video');lazyThumb(v,url,a);thumbnail.append(v);
  }else thumbnail.append(make('span','bc-yt-preview-unavailable',a.bunny_stream?'VIDEO POSTER NOT ADDED':'PREVIEW UNAVAILABLE'));
  if(!film)thumbnail.append(make('span','bc-yt-play','▶'));
  if(!film&&shortInfo[a.id]?.duration){const d=shortInfo[a.id].duration;const t=Math.floor(d/60)+':'+String(Math.floor(d%60)).padStart(2,'0');thumbnail.append(make('span','bc-yt-duration',t))}
  if(!film&&progPercent(a)){
   const p=make('span','bc-video-progress');p.style.width=progPercent(a)+'%';thumbnail.append(p);
  }
  const body=make('div','bc-yt-cardbody');
  const image=button(creator(a).slice(0,1).toUpperCase()||'B','bc-yt-creator-avatar',()=>goChannels(a.owner_id));image.setAttribute('aria-label','Open '+creator(a)+' channel');
  const info=make('div','bc-yt-video-details');
  info.append(make('strong','',title(a)),button(creator(a),'bc-channel-creator-link',()=>goChannels(a.owner_id)),make('small','',when(a)));if(isWorldVideo(a)&&a.review_status==='pending')info.append(make('small','','Private · pending review'));
  const save=button(saved(a)?'✓':'＋','bc-yt-card-save',()=>toggleLater(a));
  save.title=saved(a)?'Remove from Watch Later':'Save to Watch Later';
  save.setAttribute('aria-label',save.title);body.append(image,info,save);
  card.append(thumbnail,body);addFullThumbnailControl(card,a,cover,url);return card;
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
    const url=source(a),cover=posterUrl(a);
    if(cover){appendNativeArtwork(tap,cover,'Short thumbnail for '+title(a),'bc-video-custom-poster')}
    else if(isWorldVideo(a)){mountWorldPoster(a,tap)}
    else if(url){const v=make('video');lazyThumb(v,url,a);tap.append(v)}
    tap.append(make('span','bc-yt-short-play','▶'));
    card.append(tap,make('strong','',title(a)),make('small','',creator(a)));
    addFullThumbnailControl(card,a,cover,url);root.append(card);
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
  const follows=new Set(state.follows.filter(f=>f.follower_id===state.user?.id).map(f=>f.following_id));
  const allIds=state.profiles.map(p=>p.user_id).filter(Boolean).sort((a,b)=>personName(profile(a)).localeCompare(personName(profile(b))));
  const q=query.trim().toLowerCase(),options=allIds.filter(id=>(selected!=='following'||follows.has(id))&&(!q||personName(profile(id)).toLowerCase().includes(q)||videosCache.some(a=>a.owner_id===id&&title(a).toLowerCase().includes(q))));
  const list=$('bcVideoChannelList'),head=$('bcVideoCreatorHeader'),grid=$('bcVideoChannelGrid'),tabs=$('bcVideoCreatorFilters');list.replaceChildren();head.replaceChildren();
  $('bcVideoChannelsTitle').textContent=selected==='following'?'Subscriptions':'Member channels';
  const direct=channelId&&allIds.includes(channelId);
  list.hidden=!!direct;head.hidden=!direct;tabs.hidden=!direct;grid.hidden=!direct;
  $('bcVideoChannelProfile').hidden=true;$('bcVideoChannelVideosTitle').hidden=true;
  if(!direct){for(const id of options){const count=videosCache.filter(a=>a.owner_id===id).length,b=button('','bc-yt-channel-card',()=>goChannels(id));const avatar=make('span','bc-yt-channel-avatar',personName(profile(id)).slice(0,1).toUpperCase()),src=channelAvatar?.(profile(id));if(src){const img=make('img');img.src=src;img.alt='';avatar.replaceChildren(img)}const t=make('span','bc-yt-channel-text');t.append(make('strong','',personName(profile(id))),make('small','',count+' videos'+(follows.has(id)?' · Following':'')));b.append(avatar,t);list.append(b)}if(!options.length)list.append(make('p','bc-yt-empty','No channels match this view.'));return}
  const p=profile(channelId),mine=channelId===state.user?.id;
  const videos=videosCache.filter(a=>a.owner_id===channelId&&!a.bunny_stream&&!['movie','series','documentary'].includes(String(a.video_category||'').toLowerCase()));
  const extra=mine?state.assets.filter(a=>a.owner_id===channelId&&a.kind==='video'&&['post','library'].includes(a.purpose)&&a.review_status==='pending'&&!videos.some(v=>v.id===a.id)):[];
  const all=[...videos,...extra],avatar=make('div','bc-creator-portrait',personName(p).slice(0,1).toUpperCase()),src=channelAvatar?.(p);
  if(src){const img=make('img');img.src=src;img.alt='';avatar.replaceChildren(img)}
  const identity=make('div','bc-creator-identity');identity.append(make('h1','',personName(p)),make('p','',(p?.username?'@'+p.username+' · ':'')+videos.length+' videos'+(mine&&extra.length?' · '+extra.length+' pending':'')));
  if(p?.bio||p?.headline)identity.append(make('p','bc-creator-bio',String(p.bio||p.headline).slice(0,600)));
  const actions=make('div','bc-creator-actions');
  if(mine)actions.append(button('＋ Upload video','',()=>uploadVideo('standard')));
  else{const id=channelId,b=button(follows.has(id)?'✓ Subscribed':'Subscribe','',async()=>{if(channelBusy||!followChannel)return;channelBusy=true;b.disabled=true;try{await followChannel(id)}finally{channelBusy=false;if(channelId===id&&state.view==='videos'&&!activeCinema)renderChannels()}});b.disabled=channelBusy;actions.append(b)}
  actions.append(button('Network profile','',()=>openProfile(channelId,'videos')));identity.append(actions);head.append(avatar,identity);
  for(const n of tabs.querySelectorAll('[data-channel-tab]'))n.setAttribute('aria-pressed',String(n.dataset.channelTab===channelTab));
  for(const n of tabs.querySelectorAll('[data-channel-sort]'))n.setAttribute('aria-pressed',String(n.dataset.channelSort===channelSort));
  let shown=all.filter(a=>channelTab==='shorts'?shortVideo(a):!shortVideo(a));const cq=channelQuery.trim().toLowerCase();if(cq)shown=shown.filter(a=>title(a).toLowerCase().includes(cq));shown.sort(channelSort==='oldest'?(a,b)=>newest(b,a):newest);
  grid.replaceChildren();for(const a of shown){if(!videos.some(v=>v.id===a.id)){const c=make('article','bc-yt-video-card'),frame=make('div','bc-yt-thumb bc-creator-pending','PENDING REVIEW');c.append(frame,make('strong','',title(a)),make('small','','Private upload · awaiting approval'));grid.append(c)}else grid.append(tile(a,shown.filter(v=>videos.some(x=>x.id===v.id))))}
  if(!shown.length)grid.append(make('p','bc-yt-empty',channelTab==='shorts'?'No Shorts here yet.':'No videos here yet.'));
 }
 function moviePoster(a,queue){
  const c=make('article','bc-movies-poster-card');
  const tap=button('','bc-movies-poster-thumb',()=>openCinema(a,queue));
  const url=source(a),cover=posterUrl(a);
  if(cover){appendNativeArtwork(tap,cover,'Poster for '+title(a),'bc-movies-cover-image',true)}
  else if(url){const v=make('video');lazyThumb(v,url,a);tap.append(v)}
  else tap.append(make('span','bc-yt-preview-unavailable','POSTER NOT ADDED'));
  // Do not overlay playback symbols or labels on movie-poster artwork.
  if(!cover)tap.append(make('span','bc-movies-play','▶'));
  const info=make('div','bc-movies-poster-info');
  info.append(make('strong','',title(a)),make('small','',creator(a)));
  if(a.video_synopsis)info.append(make('p','',String(a.video_synopsis).slice(0,140)));
  c.append(tap,info);addFullThumbnailControl(c,a,cover,url);return c;
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
   const a=group.items[0],url=source(a),cover=posterUrl(a);
   if(cover){appendNativeArtwork(art,cover,'Series cover for '+group.name,'bc-movies-cover-image',true)}
   else if(url){const v=make('video');lazyThumb(v,url,a);art.append(v)}
   art.append(make('span','bc-movies-show-play','▶ EPISODES'));
   const info=make('div','bc-movies-show-info');
   info.append(make('strong','',group.name),make('small','',group.items.length+' episode'+(group.items.length===1?'':'s')));
   c.append(art,info);addFullThumbnailControl(c,a,cover,url);seriesGrid.append(c);
  }
  const owner=state.member?.role==='owner'&&state.member?.clearance_level===7;
  const pending=owner?(state.streamVideos||[]).filter(a=>a.review_status==='pending'):[];
  const queue=$('bcStreamOwnerReview'),list=$('bcStreamReviewList');
  queue.hidden=!pending.length;
  list.replaceChildren();
  for(const a of pending){
   const row=make('div','bc-stream-review-row');
   const detail=make('div','');
   detail.append(make('strong','',title(a)),make('small','',a.upload_status+' · '+a.filename));
   const actions=make('div','bc-stream-review-actions');
   actions.append(button('CHECK ENCODING','',()=>refreshStream(a)));
   actions.append(button('APPROVE','',()=>reviewStream(a,'approved')));
   actions.append(button('REJECT','',()=>reviewStream(a,'rejected')));
   row.append(detail,actions);list.append(row);
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
  ensureSaved();videosCache=allVideos();updateHead();if(activeCinema)return;renderSubscriptions();
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
  if(activeCinema)closeCinema(false);
  if(selected==='shorts'&&name!=='shorts')stopShort();
  if(name!=='movies')seriesFocus=null;
  selected=name;renderVisible();
  window.scrollTo({top:0,behavior:'auto'});
 }
 function goChannels(id){if(!id)return;channelId=id;channelTab='videos';channelSort='latest';channelQuery='';$('bcVideoCreatorSearch').value='';go('channels')}
 function openCreate(){
  $('bcVideoCreateMenu').hidden=false;
  $('bcVideoCreateVideo').focus();
 }
 function closeCreate(){$('bcVideoCreateMenu').hidden=true}
 function stopShort(){
  shortRequest++;releaseObject('short');
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
 async function loadShort(){
  const a=shortQueue[shortIndex],v=$('bcVideoShortPlayer');if(!a)return;
  const request=++shortRequest;let src=source(a);releaseObject('short');
  v.pause();v.removeAttribute('src');v.load();v.onloadedmetadata=null;
  $('bcVideoShortCreator').textContent=creator(a);
  $('bcVideoShortTitle').textContent=title(a);
  if(isWorldVideo(a)){try{const blob=await readWorldVideo(a);if(request!==shortRequest||selected!=='shorts')return;shortObject=URL.createObjectURL(blob);src=shortObject}catch(e){if(request===shortRequest)toast('Private short unavailable: '+String(e.message||e));return}}
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
 let activeRender=null,bcCinemaUpdateRelease=null,watchMode='default',commentEpoch=0,watchComments=[],commentBusy=false;
 function setWatchMode(mode){watchMode=mode==='theater'?'theater':'default';$('bcVideoCinema').classList.toggle('is-theater',watchMode==='theater');for(const [id,yes] of [['bcCinemaDefault',watchMode==='default'],['bcCinemaTheater',watchMode==='theater'],['bcWatchMode',watchMode==='theater']])$(id).setAttribute('aria-pressed',String(yes));$('bcWatchMode').setAttribute('aria-label',watchMode==='theater'?'Switch to default mode':'Switch to theater mode')}
 let watchPosterObserver=null;
 function renderWatchRecommendations(a){
  watchPosterObserver?.disconnect();watchPosterObserver=null;
  const root=$('bcCinemaRecommended');root.replaceChildren();
  const all=allVideos().filter(v=>v.id!==a.id);
  const suggestions=[...all.filter(v=>v.owner_id===a.owner_id),...all.filter(v=>v.owner_id!==a.owner_id)].slice(0,20);
  const lazy=[];
  suggestions.forEach((item,index)=>{
   const row=button('','bc-watch-item',()=>openCinema(item,allVideos()));
   row.setAttribute('aria-label','Watch '+title(item));
   const art=make('span','bc-watch-art','▶'),cover=posterUrl(item);
   let hydrate=null;
   if(cover){
    const img=make('img');img.loading=index<8?'eager':'lazy';img.decoding='async';img.alt='';
    img.src=cover;art.append(img);
   }else if(isWorldVideo(item)){
    // Start only after row is attached; top cards load directly without an observer.
    const img=make('img');img.loading='eager';img.decoding='async';img.alt='';img.hidden=true;
    const status=make('span','bc-watch-poster-status','LOADING THUMBNAIL');
    art.append(img,status);
    hydrate=()=>{
     if(!row.isConnected)return;
     const valid=()=>row.isConnected&&root.contains(row);
     img.onload=()=>{if(valid()){img.hidden=false;status.remove()}};
     img.onerror=()=>{if(valid()){img.hidden=true;status.textContent='PREVIEW UNAVAILABLE'}};
     // If the original uploader has not yet generated a saved private JPEG,
     // make one thumbnail in a serialized owner-only repair queue.
     worldVideoPreviews.get(item,{posterOnly:true,repairMissing:true}).then(url=>{
      if(valid())img.src=url;
     }).catch(error=>{
      if(!valid())return;
      status.textContent=/owner generation|not generated/i.test(String(error?.message||error))
       ?'THUMBNAIL PENDING UPLOADER':'THUMBNAIL UNAVAILABLE';
     });
    };
   }else art.title='Thumbnail not available for this video';
   const info=make('span');
   info.append(make('strong','',title(item)),make('small','',creator(item)),make('small','',when(item)));
   row.append(art,info);root.append(row);
   if(hydrate){if(index<8||!('IntersectionObserver' in window))hydrate();else lazy.push({row,hydrate})}
  });
  if(lazy.length){
   watchPosterObserver=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
     watchPosterObserver?.unobserve(entry.target);
     lazy.find(v=>v.row===entry.target)?.hydrate();
    }
   },{rootMargin:'220px'});
   for(const item of lazy)watchPosterObserver.observe(item.row);
  }
  if(!root.childElementCount)root.append(make('p','','No other authorized videos yet.'));
 }
 function paintWatchComments(){const root=$('bcWatchCommentList');root.replaceChildren();$('bcWatchCommentCount').textContent=watchComments.length+' Comments';const sorted=watchComments.slice().sort((a,b)=>($('bcWatchCommentSort').value==='oldest'?1:-1)*(Date.parse(a.created_at)-Date.parse(b.created_at)));for(const c of sorted){const row=make('div','bc-watch-comment'),name=personName(profile(c.user_id)),avatar=make('span','bc-yt-creator-avatar',String(name||'B').slice(0,1).toUpperCase()),main=make('div');main.append(make('strong','',name),make('small','',stamp(c.created_at)),make('p','',c.body));row.append(avatar,main);root.append(row)}}
 async function refreshWatchComments(a){
  const epoch=++commentEpoch;watchComments=[];commentBusy=false;paintWatchComments();
  const field=$('bcWatchCommentInput'),submit=$('bcWatchCommentSubmit'),status=$('bcWatchCommentStatus');
  field.value='';
  const available=Boolean(a?.id&&loadVideoComments&&addVideoComment);
  // Let visitors type immediately while the authorized comments query loads.
  // Server-side RLS still checks visibility and posting permissions.
  field.disabled=!available;submit.disabled=!available;
  if(!available){status.textContent='Comments are unavailable for this video.';return}
  status.textContent='Loading comments…';
  try{
   const rows=await loadVideoComments(a);
   if(epoch!==commentEpoch||activeCinema?.id!==a.id)return;
   watchComments=rows;paintWatchComments();
   status.textContent=rows.length?'':'Be the first to comment.';
  }catch(error){
   if(epoch===commentEpoch)status.textContent='Comments could not load. Please try again.';
  }
 }
 let lastWatchTick=-1;
 function syncWatchTime(force=false){const v=$('bcCinemaPlayer');if(!activeCinema||activeCinema.bunny_stream)return;const t=Math.floor(v.currentTime||0);if(!force&&t===lastWatchTick)return;lastWatchTick=t;const duration=Number.isFinite(v.duration)&&v.duration>0?v.duration:0,fmt=n=>{n=Math.max(0,Math.floor(Number(n)||0));return (n>=3600?Math.floor(n/3600)+':':'')+String(Math.floor(n/60)%60).padStart(n>=3600?2:1,'0')+':'+String(n%60).padStart(2,'0')};$('bcWatchTime').textContent=fmt(v.currentTime)+' / '+fmt(duration);const seek=$('bcWatchSeek');seek.disabled=!duration;if(document.activeElement!==seek)seek.value=String(duration?Math.round(v.currentTime/duration*1000):0)}
 function syncWatchControls(){const v=$('bcCinemaPlayer'),stage=v.parentElement,native=activeCinema&&!activeCinema.bunny_stream;$('bcWatchControls').hidden=!native;if(!native){v.controls=true;return}v.controls=false;stage.classList.toggle('is-playing',!v.paused&&!v.ended);const p=$('bcWatchPlay');p.textContent=v.paused?'▶':'⏸';p.setAttribute('aria-label',v.paused?'Play':'Pause');const m=$('bcWatchMute');m.textContent=v.muted||v.volume===0?'🔇':'🔊';m.setAttribute('aria-label',v.muted?'Unmute':'Mute');$('bcWatchVolume').value=String(v.muted?0:v.volume);$('bcWatchSpeed').value=String(v.playbackRate);syncWatchTime(true);$('bcWatchNext').disabled=$('bcCinemaNext').disabled;const tracks=Array.from(v.textTracks||[]).filter(t=>['captions','subtitles'].includes(t.kind));$('bcWatchCaptions').disabled=!tracks.length;$('bcWatchCaptions').setAttribute('aria-pressed',String(tracks.some(t=>t.mode==='showing')));$('bcWatchPip').hidden=!(document.pictureInPictureEnabled&&v.requestPictureInPicture)}
 function watchFullscreen(){const v=$('bcCinemaPlayer'),stage=v.parentElement;if(document.fullscreenElement){void document.exitFullscreen().catch(()=>{});return}if(stage.requestFullscreen)void stage.requestFullscreen().catch(()=>{if(v.webkitEnterFullscreen)v.webkitEnterFullscreen()});else if(v.webkitEnterFullscreen)v.webkitEnterFullscreen()}

 async function openCinema(a,list){
  if(!initialized)return;
  let src=source(a);const request=++cinemaRequest;
  if(!a.bunny_stream&&!isWorldVideo(a)&&!src){toast('Video temporarily unavailable. Refresh the channel.');return}
  if(!bcCinemaUpdateRelease){try{bcCinemaUpdateRelease=window.top.BLACKCELL_LIVE_UPDATE?.hold('cinema',window)}catch(_){}}
  const player=$('bcCinemaPlayer'),streamPlayer=$('bcCinemaStreamPlayer');
  if(activeRender){activeRender.destroy();activeRender=null}
  if(activeCinema){track(activeCinema,player,true);player.pause();player.removeAttribute('src');player.load()}
  releaseObject('cinema');
  streamPlayer.src='about:blank';streamPlayer.hidden=true;
  activeCinema=a;cinemaQueue=list?.length?list.slice():allVideos();
  if(!cinemaQueue.some(x=>x.id===a.id))cinemaQueue.unshift(a);
  remember(a);mostRecentWrite=0;
  $('bcCinemaTitle').textContent=title(a);
  $('bcCinemaVideoTitle').textContent=title(a);
  $('bcCinemaVideoMeta').textContent=creator(a)+' · '+when(a);
  $('bcCinemaDescription').textContent=String(a.video_synopsis||'Approved private BLACKCELL Network video.').slice(0,1000);
  syncCinemaNav();syncCinemaActions();suspendBrowsePreviews();
  $('bcVideoCinema').hidden=false;$('bcVideoShell').classList.add('is-watching');if(selected==='shorts')stopShort();setWatchMode(watchMode);renderWatchRecommendations(a);void refreshWatchComments(a);syncWatchControls();window.scrollTo({top:0,behavior:'auto'});
  if(a.bunny_stream){
   player.pause();player.removeAttribute('src');player.load();player.hidden=true;
   streamPlayer.hidden=false;
   $('bcCinemaDescription').textContent='Authenticating secure Stream playback…';
   try{
    const uri=await playStream(a);
    if(request!==cinemaRequest||activeCinema?.id!==a.id)return;
    if(typeof uri!=='string'||!uri.startsWith('https://player.mediadelivery.net/embed/'))throw Error('Invalid secure player');
    streamPlayer.src=uri;
    $('bcCinemaDescription').textContent=String(a.video_synopsis||'Approved private BLACKCELL movie.').slice(0,1000);
   }catch(e){
    if(activeCinema?.id!==a.id)return;
    toast('Secure video not ready: '+String(e?.message||e).slice(0,100));
    closeCinema();
   }
  }else{
   player.hidden=false;
   const qualityMenu=$('bcWatchQuality');qualityMenu.replaceChildren(new Option('Original','original'));qualityMenu.disabled=true;qualityMenu.title='Checking available rendered qualities';let adaptiveReason='';
   if(isWorldVideo(a)){
    const description=$('bcCinemaDescription'),alive=()=>request===cinemaRequest&&activeCinema?.id===a.id;
    let generation=0;
    const eligible=typeof attachRenderedWorld==='function'&&window.BLACKCELL_ENABLE_RENDER_PLAYBACK===true&&a.review_status==='approved'&&a.rights_confirmed===true&&a.adult_restricted===false;
    const original=async(position)=>{if(!alive())return;const seq=++generation;activeRender?.destroy();activeRender=null;description.textContent='Loading original video…';qualityMenu.disabled=true;try{const blob=await readWorldVideo(a);if(!alive()||seq!==generation)return;releaseObject('cinema');cinemaObject=URL.createObjectURL(blob);player.onloadedmetadata=()=>{if(position>=0&&position<player.duration)try{player.currentTime=position}catch{}};player.src=cinemaObject;player.load();description.textContent=a.review_status==='pending'?'Private upload · pending review':'Original private World video.'+(adaptiveReason?' · Adaptive playback: '+adaptiveReason:'');qualityMenu.title=adaptiveReason||'Original quality';if(eligible){qualityMenu.replaceChildren(new Option('Original','original'),new Option('Retry Auto','retry-auto'));qualityMenu.disabled=false;const retry=()=>{if(qualityMenu.value==='retry-auto'&&alive()){const time=player.currentTime||0;activeRender?.destroy();activeRender=null;void adaptive(time)}};qualityMenu.addEventListener('change',retry);activeRender={destroy:()=>{qualityMenu.removeEventListener('change',retry);qualityMenu.disabled=true}}}void player.play().catch(()=>{});syncWatchControls()}catch(e){if(alive()&&seq===generation){description.textContent='Video could not start. Please reopen it.';toast('Private video unavailable: '+String(e.message||e))}}};
    const adaptive=async(position)=>{if(!alive())return;const seq=++generation;activeRender?.destroy();activeRender=null;adaptiveReason='';qualityMenu.replaceChildren(new Option('Connecting…','connecting'));qualityMenu.disabled=true;description.textContent='Checking available video qualities…';player.pause();player.onloadedmetadata=null;player.removeAttribute('src');player.load();releaseObject('cinema');
     const valid=()=>alive()&&seq===generation;
     const rendered=await attachRenderedWorld({asset:a,video:player,qualityMenu,alive:valid,startPosition:position,onReady:()=>{if(valid()){description.textContent='Adaptive quality · BLACKCELL private stream';qualityMenu.title='Select Auto or a rendered resolution'}},onUnavailable:reason=>{if(valid())adaptiveReason=reason},onFatal:(time,reason)=>{if(valid()){adaptiveReason=reason;void original(time)}},onOriginal:time=>{if(valid()){adaptiveReason='';void original(time)}}});
     if(!valid()){rendered?.destroy();return}if(rendered){activeRender=rendered;syncWatchControls();return}await original(position);
    };
    if(eligible){await adaptive(Number(resume[a.id]?.time||0));return}
    await original(Number(resume[a.id]?.time||0));return;
   }
   player.src=src;player.load();
   const last=Number(resume[a.id]?.time||0);
   player.onloadedmetadata=()=>{if(last>=5&&last<player.duration-8)try{player.currentTime=last}catch{}};
   player.play().catch(()=>{});
  }
  syncWatchControls();$('bcCinemaClose').focus({preventScroll:true});
 }
 function closeCinema(restore=true){
  watchPosterObserver?.disconnect();watchPosterObserver=null;
  cinemaRequest++;
  if(activeRender){activeRender.destroy();activeRender=null}
  bcCinemaUpdateRelease?.();bcCinemaUpdateRelease=null;
  if(!activeCinema||$('bcVideoCinema').hidden)return;
  const p=$('bcCinemaPlayer'),iframe=$('bcCinemaStreamPlayer');
  track(activeCinema,p,true);
  p.pause();p.removeAttribute('src');p.load();releaseObject('cinema');p.onloadedmetadata=null;p.hidden=false;
  iframe.src='about:blank';iframe.hidden=true;
  activeCinema=null;cinemaQueue=[];mostRecentWrite=0;worldVideoPreviews.setPaused?.(false);
  $('bcVideoCinema').hidden=true;$('bcVideoShell').classList.remove('is-watching');commentEpoch++;watchComments=[];commentBusy=false;$('bcWatchControls').hidden=true;p.controls=true;
  if(restore&&state.view==='videos')renderVisible();
 }
 function moveCinema(n){
  if(!activeCinema)return;
  const i=cinemaQueue.findIndex(x=>x.id===activeCinema.id);
  const next=cinemaQueue[i+n];if(next)openCinema(next,cinemaQueue);
 }
 function leave(){
  closeFullThumbnail();
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
  $('bcVideoAccount').addEventListener('click',()=>goChannels(state.user?.id));
  for(const b of $('bcVideoShell').querySelectorAll('[data-vnav]'))b.addEventListener('click',()=>{if(['channels','following'].includes(b.dataset.vnav))channelId=null;go(b.dataset.vnav)});
  $('bcVideoBrowseChannels').addEventListener('click',()=>{channelId=null;go('channels')});
  $('bcVideoCreatorBack').addEventListener('click',()=>{channelId=null;renderChannels()});
  for(const n of $('bcVideoCreatorFilters').querySelectorAll('[data-channel-tab]'))n.addEventListener('click',()=>{channelTab=n.dataset.channelTab;renderChannels()});
  for(const n of $('bcVideoCreatorFilters').querySelectorAll('[data-channel-sort]'))n.addEventListener('click',()=>{channelSort=n.dataset.channelSort;renderChannels()});
  $('bcVideoCreatorSearch').addEventListener('input',e=>{channelQuery=e.target.value;renderChannels()});
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
  $('bcCinemaDefault').addEventListener('click',()=>setWatchMode('default'));$('bcCinemaTheater').addEventListener('click',()=>setWatchMode('theater'));$('bcWatchMode').addEventListener('click',()=>setWatchMode(watchMode==='theater'?'default':'theater'));
  const wv=$('bcCinemaPlayer');
  $('bcWatchPlay').addEventListener('click',()=>{if(wv.paused)void wv.play().catch(()=>{});else wv.pause()});$('bcWatchNext').addEventListener('click',()=>moveCinema(1));$('bcWatchMute').addEventListener('click',()=>{wv.muted=!wv.muted;if(!wv.muted&&wv.volume===0)wv.volume=1});$('bcWatchVolume').addEventListener('input',e=>{wv.volume=Number(e.target.value);wv.muted=wv.volume===0});$('bcWatchSeek').addEventListener('input',e=>{if(Number.isFinite(wv.duration)&&wv.duration>0)wv.currentTime=Number(e.target.value)/1000*wv.duration});$('bcWatchSpeed').addEventListener('change',e=>{wv.playbackRate=Number(e.target.value)});$('bcWatchCaptions').addEventListener('click',()=>{const tracks=Array.from(wv.textTracks||[]).filter(t=>['captions','subtitles'].includes(t.kind)),on=tracks.some(t=>t.mode==='showing');tracks.forEach((t,i)=>{t.mode=!on&&i===0?'showing':'disabled'});syncWatchControls()});$('bcWatchPip').addEventListener('click',()=>{if(document.pictureInPictureElement)void document.exitPictureInPicture().catch(()=>{});else if(wv.requestPictureInPicture)void wv.requestPictureInPicture().catch(()=>{})});$('bcWatchFull').addEventListener('click',watchFullscreen);
  for(const event of ['play','pause','loadedmetadata','durationchange','volumechange','ratechange','ended','emptied'])wv.addEventListener(event,syncWatchControls);wv.addEventListener('timeupdate',()=>syncWatchTime());
  wv.addEventListener('click',()=>{if(!activeCinema||activeCinema.bunny_stream)return;if(wv.paused)void wv.play().catch(()=>{});else wv.pause()});wv.textTracks?.addEventListener?.('addtrack',syncWatchControls);
  $('bcWatchCommentSort').addEventListener('change',paintWatchComments);$('bcWatchCommentForm').addEventListener('submit',async e=>{e.preventDefault();const a=activeCinema,field=$('bcWatchCommentInput'),submit=$('bcWatchCommentSubmit'),status=$('bcWatchCommentStatus'),body=field.value.trim(),epoch=commentEpoch;if(!a?.id||!body||commentBusy||!addVideoComment)return;commentBusy=true;submit.disabled=true;try{await addVideoComment(a,body);if(epoch!==commentEpoch)return;await refreshWatchComments(a)}catch{if(epoch===commentEpoch){status.textContent='Comment could not be published. Try again.';submit.disabled=false}}finally{if(epoch===commentEpoch)commentBusy=false}});
  $('bcCinemaPrev').addEventListener('click',()=>moveCinema(-1));
  $('bcCinemaNext').addEventListener('click',()=>moveCinema(1));
  $('bcCinemaCreator').addEventListener('click',()=>{if(!activeCinema)return;const owner=activeCinema.owner_id;closeCinema(false);goChannels(owner)});
  $('bcCinemaWatchLater').addEventListener('click',()=>{if(activeCinema)toggleLater(activeCinema)});
  $('bcCinemaLike').addEventListener('click',()=>{if(activeCinema)toggleLike(activeCinema)});
  $('bcCinemaShare').addEventListener('click',()=>{if(activeCinema)shareInside(activeCinema)});
  $('bcCinemaFullscreen').addEventListener('click',()=>{
   if(activeCinema?.bunny_stream){const v=$('bcCinemaStreamPlayer');if(v.requestFullscreen)void v.requestFullscreen().catch(()=>{})}else watchFullscreen();
  });
  const cinemaPlayer=$('bcCinemaPlayer');
  cinemaPlayer.addEventListener('timeupdate',()=>track(activeCinema,cinemaPlayer));
  cinemaPlayer.addEventListener('pause',()=>track(activeCinema,cinemaPlayer,true));
  cinemaPlayer.addEventListener('ended',()=>{track(activeCinema,cinemaPlayer,true)});
  $('bcVideoShortLike').addEventListener('click',()=>{if(shortQueue[shortIndex])toggleLike(shortQueue[shortIndex])});
  $('bcVideoShortSave').addEventListener('click',()=>{if(shortQueue[shortIndex])toggleLater(shortQueue[shortIndex])});
  $('bcVideoShortShare').addEventListener('click',()=>{if(shortQueue[shortIndex])shareInside(shortQueue[shortIndex])});
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
    if(e.key==='Escape'&&!document.fullscreenElement){e.preventDefault();closeCinema()}
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
 return {init,render,close:leave,openById};
}
