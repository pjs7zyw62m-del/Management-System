import {authorizeUniformHub} from './uniform-hub-auth.js?v=20261111-i1';
const $=id=>document.getElementById(id);
let session=null,items=[],visible=[],followed=new Set(),likes=new Set(),counts=new Map(),activeIndex=-1,mode='discover',search='',muted=true,observer=null;
function say(msg){
 const toast=$('mtToast');toast.textContent=msg;toast.hidden=false;
 clearTimeout(say.timeout);say.timeout=setTimeout(()=>toast.hidden=true,3200);
}
function e(tag,cls='',txt){
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(txt!==undefined)el.textContent=txt;return el;
}
function openProfile(id){
 location.href='corporate-network.html?user='+encodeURIComponent(id);
}
function pauseAll(){
 $('mtFeed').querySelectorAll('video').forEach(v=>{v.pause();v.currentTime=0});
}
function videoState(){
 const cards=[...$('mtFeed').querySelectorAll('.mt-clip')];
 if(!cards.length)return;
 let best=-1,distance=Infinity;
 const rect=$('mtFeed').getBoundingClientRect(),center=rect.top+rect.height/2;
 cards.forEach((c,i)=>{const r=c.getBoundingClientRect(),d=Math.abs(r.top+r.height/2-center);if(d<distance){distance=d;best=i}});
 if(best<0)return;
 const old=activeIndex;activeIndex=best;
 cards.forEach((card,i)=>{
  const vid=card.querySelector('video');
  if(!vid)return;
  const on=i===best;
  if(!on){vid.pause();vid.removeAttribute('src');vid.load();return}
  const url=card.dataset.videoUrl;
  if(url && vid.getAttribute('src')!==url){vid.src=url;vid.load()}
  vid.muted=muted;vid.loop=true;vid.playsInline=true;
  if(old!==i||vid.paused)vid.play().catch(()=>{});
  const sound=card.querySelector('[data-sound]');
  if(sound)sound.querySelector('span').textContent=muted?'MUTED':'SOUND ON';
 });
 $('mtPrev').disabled=best===0;$('mtNext').disabled=best===cards.length-1;
}
function setMute(val){
 muted=val;
 for(const v of $('mtFeed').querySelectorAll('video'))v.muted=muted;
 for(const button of $('mtFeed').querySelectorAll('[data-sound]')){
  button.querySelector('span').textContent=muted?'MUTED':'SOUND ON';
  button.setAttribute('aria-label',muted?'Unmute video':'Mute video');
 }
}
async function like(assetId){
 if(!session)return;
 const had=likes.has(assetId);
 const query=had
  ?session.client.from('corp_social_miltok_likes').delete().eq('asset_id',assetId).eq('user_id',session.user.id).select('asset_id')
  :session.client.from('corp_social_miltok_likes').insert({asset_id:assetId,user_id:session.user.id}).select('asset_id');
 const {data,error}=await query;
 if(error||!data?.length){say('Unable to save Like. Please try again.');return}
 if(had)likes.delete(assetId);else likes.add(assetId);
 counts.set(assetId,Math.max(0,(counts.get(assetId)||0)+(had?-1:1)));
 updateLikeButtons(assetId);
}
function updateLikeButtons(assetId){
 const card=[...$('mtFeed').querySelectorAll('.mt-clip')].find(c=>c.dataset.assetId===assetId);
 if(!card)return;
 const button=card.querySelector('[data-like]'),n=counts.get(assetId)||0,was=likes.has(assetId);
 button.classList.toggle('liked',was);
 button.setAttribute('aria-pressed',String(was));
 button.setAttribute('aria-label',(was?'Unlike':'Like')+' video, '+n+' likes');
 button.querySelector('span').textContent=String(n);
}
function clip(item){
 const card=e('article','mt-clip');
 card.dataset.assetId=item.id;card.dataset.videoUrl=item.signedUrl||'';
 const video=e('video');
 video.controls=false;video.muted=true;video.playsInline=true;video.preload='none';
 video.setAttribute('aria-label',item.caption||item.filename||'Military short video');
 video.addEventListener('click',()=>video.paused?video.play().catch(()=>{}):video.pause());
 card.append(video,e('div','mt-shade'));
 const details=e('div','mt-clip-details');
 const owner=e('h2','');
 const profileLink=e('a','',item.ownerName||'BLACKCELL MEMBER');
 profileLink.href='corporate-network.html?user='+encodeURIComponent(item.owner_id);
 owner.append(profileLink);
 details.append(owner,e('p','',item.caption||item.filename||'Military video'));
 const tags=[item.military_branch,item.military_category,item.military_era].filter(Boolean);
 details.append(e('span','',tags.join(' · ')||'MILITARY ARCHIVE'));
 card.append(details);
 const controls=e('div','mt-clip-controls');
 const heart=e('button','', '♥');heart.type='button';heart.dataset.like='true';
 heart.append(e('span','','0'));heart.addEventListener('click',()=>void like(item.id));controls.append(heart);
 const sound=e('button','','♪');sound.type='button';sound.dataset.sound='true';sound.append(e('span','','MUTED'));
 sound.addEventListener('click',()=>setMute(!muted));controls.append(sound);
 const share=e('button','','↗');share.type='button';share.append(e('span','','SHARE'));
 share.addEventListener('click',async()=>{
  const url=location.origin+location.pathname+'?clip='+encodeURIComponent(item.id);
  try{await navigator.clipboard.writeText(url);say('MilTok link copied.')}catch(_){say('Share link: '+url)}
 });
 controls.append(share);
 card.append(controls);
 queueMicrotask(()=>updateLikeButtons(item.id));
 return card;
}
function showEmpty(message,second=''){
 $('mtFeed').replaceChildren();
 const box=e('div','mt-empty');
 box.append(e('h2','','MIL'+'TOK.'),e('p','',message));
 if(second)box.append(e('p','',second));
 const a=e('a','','＋ UPLOAD YOUR FIRST VIDEO');a.href='corporate-network.html?view=photos';box.append(a);
 $('mtFeed').append(box);$('mtCount').textContent='NO VIDEOS';
}
function applyFilter(){
 visible=items.filter(a=>mode==='discover'||followed.has(a.owner_id)||a.owner_id===session.user.id);
 if(search){
  visible=visible.filter(a=>[a.caption,a.filename,a.military_branch,a.military_category,a.military_era,a.ownerName]
    .filter(Boolean).join(' ').toLowerCase().includes(search));
 }
 $('mtDiscover').classList.toggle('selected',mode==='discover');
 $('mtFollowing').classList.toggle('selected',mode==='following');
 $('mtDiscover').setAttribute('aria-pressed',String(mode==='discover'));
 $('mtFollowing').setAttribute('aria-pressed',String(mode==='following'));
 pauseAll();
 activeIndex=-1;
 $('mtFeed').replaceChildren();
 if(!visible.length){
  showEmpty(items.length?(mode==='following'?'No videos from the accounts you follow yet.':'No videos match this search.'): 'No military videos have been uploaded yet.','Upload once through Military Library; MilTok will use the same original file.');
  return;
 }
 for(const item of visible)$('mtFeed').append(clip(item));
 $('mtCount').textContent=visible.length+' '+(visible.length===1?'VIDEO':'VIDEOS');
 $('mtFeed').scrollTop=0;
 requestAnimationFrame(videoState);
 const requested=new URLSearchParams(location.search).get('clip');
 if(requested){const index=visible.findIndex(a=>a.id===requested);if(index>=0)jump(index);}
}
function jump(index){
 const cards=[...$('mtFeed').querySelectorAll('.mt-clip')];
 const selected=cards[index];if(!selected)return;
 selected.scrollIntoView({block:'nearest',behavior:'smooth'});
 setTimeout(videoState,380);
}
async function load(){
 const client=session.client;
 const [media,people,follows,votes]=await Promise.all([
  client.from('corp_social_assets').select('id,owner_id,filename,caption,kind,purpose,storage_path,created_at,military_branch,military_category,military_era').eq('kind','video').in('purpose',['library','post']).order('created_at',{ascending:false}).limit(500),
  client.from('corp_social_profiles').select('user_id,display_name,username').limit(500),
  client.from('corp_social_follows').select('following_id').eq('follower_id',session.user.id).limit(1000),
  client.from('corp_social_miltok_likes').select('asset_id,user_id').limit(10000)
 ]);
 for(const q of [media,people,follows,votes])if(q.error)throw Error(q.error.message);
 followed=new Set((follows.data||[]).map(f=>f.following_id));
 likes=new Set();counts=new Map();
 for(const v of votes.data||[]){
  counts.set(v.asset_id,(counts.get(v.asset_id)||0)+1);
  if(v.user_id===session.user.id)likes.add(v.asset_id);
 }
 const profiles=new Map((people.data||[]).map(p=>[p.user_id,p]));
 const rows=media.data||[],paths=rows.map(v=>v.storage_path);
 const signed=paths.length?await client.storage.from('corp-social-media').createSignedUrls(paths,3600):{data:[]};
 if(signed.error)throw Error('Could not load private MilTok videos: '+signed.error.message);
 items=rows.map((a,i)=>({...a,ownerName:profiles.get(a.owner_id)?.display_name||'Network Member',signedUrl:signed.data?.[i]?.signedUrl||''}))
 .filter(a=>a.signedUrl);
 applyFilter();
}
async function start(){
 session=await authorizeUniformHub();
 if(!session)return;
 $('mtDiscover').addEventListener('click',()=>{mode='discover';applyFilter()});
 $('mtFollowing').addEventListener('click',()=>{mode='following';applyFilter()});
 $('mtSearch').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();applyFilter()});
 $('mtPrev').addEventListener('click',()=>jump(activeIndex-1));
 $('mtNext').addEventListener('click',()=>jump(activeIndex+1));
 let debounce;
 $('mtFeed').addEventListener('scroll',()=>{clearTimeout(debounce);debounce=setTimeout(videoState,95)},{passive:true});
 $('mtFeed').addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();jump(activeIndex+(e.key==='ArrowDown'?1:-1))}
  if(e.key===' '&&document.activeElement===$('mtFeed')){e.preventDefault();const v=$('mtFeed').querySelectorAll('video')[activeIndex];if(v)v.paused?v.play().catch(()=>{}):v.pause()}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAll();else videoState()});
 try{await load()}catch(error){showEmpty('Unable to load your private military videos.');say(error.message)}
}
void start();