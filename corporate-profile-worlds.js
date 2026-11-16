/* Profile-only World discovery. Preferences are self-editable presentation
   metadata, never authorization claims. All media reads use existing RLS. */
export const WORLDS=[
 ['military','Military','⬡','assets/maf/portrait-military.png','#91a47a'],
 ['police','Law Enforcement','★','assets/maf/portrait-law-enforcement.png','#7ba8ec'],
 ['fire','Fire & Rescue','♨','assets/maf/portrait-fire-rescue.png','#ed7861'],
 ['security','Corrections','▣','assets/maf/portrait-corrections.png','#bcb19e'],
 ['medical','EMS','✚','assets/maf/portrait-ems.png','#7ec1da'],
 ['professional','Aviation','✈','assets/maf/portrait-airline-captain.png','#d8ba83'],
 ['uniform','Uniform','◈','e8860999-4f93-4af3-97e4-4fe7ed1a9bcc.png','#b0b0bd']
];
export function normalizeWorlds(raw){return WORLDS.map(w=>w[0]).filter(id=>Array.isArray(raw)&&raw.includes(id))}
const labels=new Map(WORLDS.map(w=>[w[0],w]));
export function worldBubbles(raw){return normalizeWorlds(raw)}
// Approved five-second preview. The external render URL is deliberately
// isolated so the source can be replaced with first-party CDN hosting later.
const LIVE_COVERS=Object.freeze({
 'military':'https://resource2.heygen.ai/videos/d6924ed15d034cdbaa4de030f7a18969/d6924ed15d034cdbaa4de030f7a18969/01a1e348-d528-762e-8bb8-360dc00e243c.mp4',
 'military|police':'https://resource2.heygen.ai/videos/d6924ed15d034cdbaa4de030f7a18969/d6924ed15d034cdbaa4de030f7a18969/01a1e308-dc3a-7164-8861-b3f11404f39e.mp4'
});
export function liveCoverSource(raw){return LIVE_COVERS[normalizeWorlds(raw).join('|')]||null}
export function initialWorld(raw){const ids=normalizeWorlds(raw);return ids.length>1?'hybrid':ids[0]||''}
export function worldScope(active,raw){const ids=normalizeWorlds(raw);return active==='hybrid'&&ids.length>1?ids:ids.includes(active)?[active]:[]}
const worldLabel=id=>labels.get(id)?.[1]||'Uniform';
const mediaWorld=a=>{const tag=(Array.isArray(a.military_tags)?a.military_tags:[]).find(t=>typeof t==='string'&&labels.has(t.slice(4))&&t.startsWith('maf:'));return tag?worldLabel(tag.slice(4)):'Uniform'};
const uniformTerms='source_provider.eq.world-bunny-v1,military_tags.cs.{maf:military},military_tags.cs.{maf:police},military_tags.cs.{maf:fire},military_tags.cs.{maf:security},military_tags.cs.{maf:medical},military_tags.cs.{maf:professional},military_tags.cs.{maf:unsorted}';
export function createProfileWorlds({client,state,previews,title,render,toast}){
 const root=()=>document.getElementById('profileWorlds');
 let selected=[],active='',filter='all',open=false,draft=[],saving=false,ready=false,uid='',generation=0,urls=new Set(),disposeLiveCover=null;
 const make=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el};
 const button=(txt,fn,cls)=>{const b=make('button',cls,txt);b.type='button';b.onclick=fn;return b};
 function clear(){generation++;for(const url of urls)URL.revokeObjectURL(url);urls.clear()}
 window.addEventListener('pagehide',()=>{clear();disposeLiveCover?.();disposeLiveCover=null});
 client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){clear();disposeLiveCover?.();disposeLiveCover=null;selected=[];active='';uid='';ready=false;open=false}});
 async function load(){
  const resp=await client.auth.getUser();
  if(resp.error||!resp.data?.user||resp.data.user.id!==state.user?.id){ready=false;return}
  uid=resp.data.user.id;selected=normalizeWorlds(resp.data.user.user_metadata?.blackcell_profile_worlds_v1);active=initialWorld(selected);ready=true;
 }
 function choose(){draft=[...selected];open=true;render()}
 async function save(){
  if(saving||!ready||uid!==state.user?.id)return;
  saving=true;render();const next=normalizeWorlds(draft);
  try{const out=await client.auth.updateUser({data:{blackcell_profile_worlds_v1:next}});
   if(out.error||out.data?.user?.id!==uid||uid!==state.user?.id)throw Error(out.error?.message||'Account save not confirmed');
   selected=normalizeWorlds(out.data.user.user_metadata?.blackcell_profile_worlds_v1);
   active=initialWorld(selected);filter='all';
   open=false;state.profileTab='worldfeed';toast('My Worlds saved to your account.');
  }catch(e){toast('World selection not saved: '+e.message)}finally{saving=false;render()}
 }
 function mountLiveCover(cover,art,source){
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const video=make('video','bc-pw-live-cover');video.muted=true;video.defaultMuted=true;video.autoplay=true;video.loop=true;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('muted','');video.preload='none';video.disablePictureInPicture=true;video.setAttribute('aria-hidden','true');
  const toggle=button('Pause motion',()=>{},'bc-pw-panel-motion');toggle.setAttribute('aria-label','Pause World video motion');toggle.title='Pause or resume World video motion';
  let allowed=!motion.matches,visible=false,failed=false,disposed=false;
  function syncToggle(){const paused=!allowed||video.paused;toggle.textContent=paused?'Resume motion':'Pause motion';toggle.setAttribute('aria-label',paused?'Resume World video motion':'Pause World video motion')}
  function sync(){
   if(disposed||failed)return;
   if(!allowed||!visible||document.hidden){video.pause();syncToggle();return}
   if(!video.getAttribute('src'))video.src=source;
   video.play().catch(()=>{if(disposed||failed)return;syncToggle()});
  }
  function fallback(){failed=true;video.pause();art.classList.remove('bc-pw-live-playing');video.removeAttribute('src');video.remove();toggle.remove()}
  video.addEventListener('playing',()=>{if(disposed)return;art.classList.add('bc-pw-live-playing');syncToggle()});
  video.addEventListener('pause',syncToggle);video.addEventListener('error',fallback,{once:true});
  toggle.onclick=()=>{allowed=video.paused;if(!allowed){video.pause();syncToggle();return}sync()};
  const onMotion=()=>{if(motion.matches){allowed=false;art.classList.remove('bc-pw-live-playing')}sync()};
  if(motion.addEventListener)motion.addEventListener('change',onMotion);else motion.addListener?.(onMotion);
  document.addEventListener('visibilitychange',sync);
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{visible=entries.some(x=>x.isIntersecting);sync()},{threshold:0.05}):null;
  art.append(video);document.getElementById('profileWorldVideoMotion')?.replaceChildren(toggle);if(observer)observer.observe(cover);else{visible=true;sync()}syncToggle();
  return ()=>{if(disposed)return;disposed=true;observer?.disconnect();document.removeEventListener('visibilitychange',sync);if(motion.removeEventListener)motion.removeEventListener('change',onMotion);else motion.removeListener?.(onMotion);video.pause();video.removeAttribute('src');video.load();video.remove();toggle.remove();art.classList.remove('bc-pw-live-playing')};
 }
 function renderCover(id){
  const cover=document.getElementById('profileCover');if(!cover)return;
  const scope=worldScope(id,selected),existing=cover.querySelector('.bc-pw-cover-art');
  const label=document.getElementById('profileWorldVideoLabel');if(label)label.textContent=scope.length>1?scope.length+' WORLDS':scope.length===1?worldLabel(scope[0]).toUpperCase():'BLACKCELL';
  if(!scope.length){disposeLiveCover?.();disposeLiveCover=null;existing?.remove();delete cover.dataset.worldCover;return}
  const key=scope.join('|')+'|'+id;
  cover.dataset.worldCover=id;cover.classList.add('bc-custom-member-cover');
  cover.style.setProperty('background-image','none','important');
  if(existing?.dataset.signature===key)return;
  disposeLiveCover?.();disposeLiveCover=null;existing?.remove();
  const art=make('div','bc-pw-cover-art');art.dataset.signature=key;art.style.setProperty('--world-count',String(scope.length));art.setAttribute('role','img');art.setAttribute('aria-label',scope.map(worldLabel).join(' and ')+' World video artwork');art.dataset.count=String(scope.length);
  const panels=make('div','bc-pw-cover-panels');
  for(const item of scope){const [_,name,icon,src,color]=labels.get(item);const panel=make('div','bc-pw-cover-panel');
   panel.style.setProperty('--world-art','url("'+src+'")');panel.style.setProperty('--world-color',color);
   const img=make('img','bc-pw-cover-portrait');img.src=src;img.alt='';img.decoding='async';
   panel.append(img,make('span','bc-pw-cover-panel-label',name));panels.append(panel)
  }
  const tag=make('div','bc-pw-cover-caption');tag.append(make('strong','',id==='hybrid'?'HYBRID WORLDS':worldLabel(id).toUpperCase()+' WORLD'));if(scope.length===1){tag.prepend(make('small','bc-pw-spotlight-kicker','BLACKCELL / WORLD SPOTLIGHT'));tag.append(make('small','bc-pw-spotlight-sub','MAN’S ARMED FORCES'))}
  art.append(panels,tag);cover.prepend(art);
  const source=liveCoverSource(scope);if(source)disposeLiveCover=mountLiveCover(cover,art,source)
 }
 function header(isMine){
  const box=root();if(!box)return;box.hidden=!isMine;box.replaceChildren();
  if(!isMine){open=false;renderCover('');return}
  const row=make('div','bc-pw-heading');row.append(make('h2','','My Worlds'));
  if(selected.length)row.append(button('Edit Worlds',choose,'bc-pw-quiet'));
  box.append(row);
  renderCover(initialWorld(selected));
  if(open){
   const panel=make('div','bc-pw-picker');panel.append(make('h3','','Select Your Worlds'),make('p','','Choose one or more.'));
   for(const [id,name,icon,art,color] of WORLDS){
    const label=make('label','bc-pw-choice');const symbol=make('span','bc-pw-symbol',icon);symbol.style.color=color;const input=make('input');input.type='checkbox';input.checked=draft.includes(id);input.disabled=saving;
    input.onchange=()=>{draft=input.checked?[...draft,id]:draft.filter(x=>x!==id);count.textContent=draft.length+' of 7 Worlds selected'};
    label.append(symbol,make('span','',name+' World'),input);panel.append(label)
   }
   const count=make('p','bc-pw-caption',draft.length+' of 7 Worlds selected');panel.append(count);
   const actions=make('div','bc-pw-buttons');const b=button(saving?'Saving…':'Save My Worlds',()=>void save(),'bc-pw-primary');b.disabled=saving;const cancel=button('Cancel',()=>{open=false;render()},'bc-pw-quiet');cancel.disabled=saving;actions.append(b,cancel);panel.append(actions);box.append(panel);
  }else if(!selected.length){
   const empty=make('div','bc-pw-empty');empty.append(make('strong','','Build your own experience'),make('p','','Choose the Worlds you want to follow.'));const b=button('＋ Select Your Worlds',choose,'bc-pw-primary');b.disabled=!ready;empty.append(b);
   if(!ready)empty.append(button('Retry account connection',async()=>{await load();render()},'bc-pw-quiet'));box.append(empty);
  }
  if(selected.length){const bubbles=make('div','bc-pw-bubbles');for(const id of worldBubbles(selected)){
   const [_,name,icon,art,color]=labels.get(id);
   const b=button('',()=>{active=active===id&&selected.length>1?initialWorld(selected):id;filter='all';state.profileTab='worldfeed';render()},'bc-pw-bubble');
   b.setAttribute('aria-pressed',String(active===id||active==='hybrid'));b.title=name+' World · filter feed';
   b.style.setProperty('--world-color',color);
   const image=make('span','bc-pw-circle'),portrait=make('img');portrait.src=art;portrait.alt='';portrait.decoding='async';image.append(portrait);
   b.append(image,make('span','',name));bubbles.append(b)
  }box.append(bubbles)}

 }
 async function photoUrl(a){
  if(a.source_provider!=='world-bunny-v1'){const x=await client.storage.from('corp-social-media').createSignedUrl(a.storage_path,1800);if(x.error||!x.data?.signedUrl)throw Error('Private image unavailable');return {url:x.data.signedUrl,object:false}}
  const session=(await client.auth.getSession()).data?.session,config=window.BLACKCELL_CORP_CONFIG||{};
  if(!session?.access_token||session.user.id!==uid||!config.url||!config.publishableKey)throw Error('Sign in again');
  const res=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/blackcell-world-media?action=read',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({id:a.id})});
  if(!res.ok)throw Error('Private image unavailable');const blob=await res.blob();if(blob.size>45*1048576||!blob.type.startsWith('image/'))throw Error('Unsupported preview');return {url:URL.createObjectURL(blob),object:true};
 }
 function mountPhoto(a,img,gen){const run=async()=>{if(!img.isConnected||gen!==generation)return;try{const entry=await photoUrl(a);if(!img.isConnected||gen!==generation){if(entry.object)URL.revokeObjectURL(entry.url);return}if(entry.object)urls.add(entry.url);img.src=entry.url;img.hidden=false;img.parentElement.querySelector('.bc-pw-placeholder').hidden=true}catch{if(img.isConnected)img.parentElement.querySelector('.bc-pw-placeholder').textContent='Preview unavailable'}};
  if(!window.IntersectionObserver){void run();return}const ob=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){ob.disconnect();void run()}},{rootMargin:'80px'});ob.observe(img.parentElement);setTimeout(()=>ob.disconnect(),60000);
 }
 function showPhoto(img){if(!img.src||img.hidden)return;const d=make('dialog','bc-pw-viewer');const close=button('Close ×',()=>d.close(),'bc-pw-quiet');const full=make('img');full.src=img.src;full.alt=img.alt;d.append(close,full);d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal()}
 function feed(box){
  clear();const gen=generation,id=active,scope=worldScope(id,selected);
  if(!scope.length){box.append(make('p','bc-pw-empty','Select your Worlds above to start your personalized feed.'));return}
  const top=make('div','bc-pw-heading');const heading=make('div','bc-pw-feed-heading');heading.append(make('h3','',id==='hybrid'?'My Worlds Feed':worldLabel(id)+' World'));if(id==='hybrid')heading.append(make('p','bc-pw-caption',scope.map(worldLabel).join(' · ')));if(selected.length>1&&id!=='hybrid')heading.append(button('View all selected Worlds',()=>{active=initialWorld(selected);filter='all';render()},'bc-pw-quiet'));top.append(heading);
  const controls=make('div','bc-pw-filter');for(const [key,label] of [['all','All'],['photo','Photos'],['video','Videos']]){const b=button(label,()=>{filter=key;render()});b.setAttribute('aria-pressed',String(filter===key));controls.append(b)}top.append(controls);box.append(top);
  const grid=make('div','bc-pw-feed'),status=make('p','bc-pw-caption','Loading World media…');box.append(grid,status);
  const unassigned=make('section','bc-pw-unsorted');unassigned.hidden=true;if(id==='hybrid'&&!scope.includes('uniform')&&filter!=='video')box.append(unassigned);
  function appendCard(a,target,unsorted){
   const label=unsorted?'Unsorted':mediaWorld(a);
    const card=make('article','bc-pw-card'),frame=make('div','bc-pw-frame');const placeholder=make('span','bc-pw-placeholder',a.kind==='video'?'▶':'Loading photograph…');const img=make('img');img.hidden=true;img.alt=a.caption||label+' media';img.loading='lazy';frame.append(placeholder,img);
    const open=button('',()=>{if(a.kind==='photo')showPhoto(img);else{const u=new URL('corporate-network.html',location.href);u.searchParams.set('view','videos');u.searchParams.set('video',a.id);location.assign(u.href)}},'bc-pw-media');open.append(frame);
    card.append(open,make('strong','',a.kind==='video'?title(a):a.caption||label+' photograph'),make('small','',label+' · '+(a.review_status==='pending'?'Private · pending review':unsorted?'Awaiting World assignment':a.kind==='video'?'BLACKCELL TUBE':'WORLD PHOTO')));target.append(card);
    if(a.kind==='photo')mountPhoto(a,img,gen);else if(a.source_provider==='world-bunny-v1')previews.mount(a,img);
  }
  async function loadUnsorted(){
   if(!unassigned.isConnected)return;
   let offset=0,loading=false;const displayed=new Set(),heading=make('div','bc-pw-heading'),gallery=make('div','bc-pw-feed'),notice=make('p','bc-pw-caption','');
   const info=make('div','bc-pw-feed-heading');info.append(make('h3','','Unsorted photographs'),make('p','bc-pw-caption','These photographs have not been assigned to a World yet.'));heading.append(info);
   const link=make('a','bc-pw-quiet','Open Uniform World');link.href='uniform-world.html#collection';heading.append(link);unassigned.append(heading,gallery,notice);
   async function nextUnsorted(){
    if(loading||gen!==generation)return;loading=true;notice.textContent='Loading photographs…';
    let result;try{result=await client.from('corp_social_assets').select('*').eq('purpose','library').eq('kind','photo').contains('military_tags',['maf:unsorted']).not('military_tags','ov','{maf:military,maf:police,maf:fire,maf:security,maf:medical,maf:professional}').or('and(review_status.eq.approved,adult_restricted.eq.false),and(review_status.eq.pending,owner_id.eq.'+uid+')').order('created_at',{ascending:false}).order('id').range(offset,offset+23)}catch(e){result={error:e}}finally{loading=false}
    if(gen!==generation||!unassigned.isConnected)return;
    if(result.error){unassigned.hidden=false;notice.textContent='Unsorted photographs could not load. ';notice.append(button('Retry',()=>void nextUnsorted(),'bc-pw-quiet'));return}
    const records=result.data||[];offset+=records.length;if(!offset){unassigned.hidden=true;return}
    unassigned.hidden=false;notice.textContent='';
    for(const a of records){if(displayed.has(a.id))continue;displayed.add(a.id);appendCard(a,gallery,true)}
    if(records.length===24)notice.append(button('Load more photographs',()=>void nextUnsorted(),'bc-pw-quiet'));
   }
   await nextUnsorted();
  }
  let offset=0,loading=false;const shown=new Set();async function next(){
   if(loading||gen!==generation)return;loading=true;
   status.textContent='Loading World media…';
   let q=client.from('corp_social_assets').select('*').eq('purpose','library');
   // Uniform remains the umbrella World. One query, one row per asset, even with overlapping tags.
   if(scope.includes('uniform'))q=q.or('and(review_status.eq.approved,adult_restricted.eq.false,or('+uniformTerms+')),and(review_status.eq.pending,owner_id.eq.'+uid+',or('+uniformTerms+'))');
   else q=q.or('and(review_status.eq.approved,adult_restricted.eq.false),and(review_status.eq.pending,owner_id.eq.'+uid+')').overlaps('military_tags',scope.map(k=>'maf:'+k));
   q=filter==='all'?q.in('kind',['photo','video']):q.eq('kind',filter);
   let result;try{result=await q.order('created_at',{ascending:false}).order('id').range(offset,offset+23)}catch(e){result={error:e}}finally{loading=false}
   if(gen!==generation||!box.isConnected)return;
   if(result.error){status.textContent='World media could not load.';status.append(button('Retry',()=>void next(),'bc-pw-quiet'));return}
   const list=result.data||[];offset+=list.length;status.textContent=!offset?'No media in this World yet.':'';
   for(const a of list){if(shown.has(a.id))continue;shown.add(a.id);appendCard(a,grid,false)}
   if(list.length===24)status.append(button('Load more',()=>void next(),'bc-pw-quiet'))
  }
  void next().catch(()=>{if(gen===generation)status.textContent='Unable to load World media. Try again.'});
  if(unassigned.isConnected)void loadUnsorted().catch(()=>{if(gen===generation){unassigned.hidden=false;unassigned.append(make('p','bc-pw-caption','Unsorted photographs could not load.'))}});
 }
 return {load,header,feed,clear,reset:()=>{active=initialWorld(selected);filter='all'},hasActive:()=>!!active,busy:()=>open||saving};
}
