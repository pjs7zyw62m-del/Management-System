/* BLACKCELL OMEGA / LIVE. Uses existing verified RLS catalog and protected media.
 * All intelligence desks and missions are read-only rules, not autonomous AI.
 * No paid model calls, background scraping, video synthesis, or publication. */
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261117-os-perf1';
import {WORLDS,eligibleOmegaAsset,assetWorld,getWorld,buildWorldDesk,makeChannel,
 proposeMissions,safeCaseTitle,evidenceSummary} from './blackcell-omega-core.js?v=20261117-o1';
import {buildBehavioralAffinity} from './blackcell-adaptive-ranker.js?v=20261117-aggressive-r1';
import {planGunnerProduction} from './blackcell-gunner-production.js?v=20261117-pulse-r1';
import {createOmegaMediaReader,isWorldMedia} from './blackcell-omega-media.js?v=20261117-bunnyfix-r1';
const $=id=>document.getElementById(id);
const client=corporateClient(),bucket=client.storage.from('corp-social-media'),bunny=createOmegaMediaReader(client);
const e=(tag,cls='',value=null)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==null)n.textContent=String(value);return n};
const number=v=>Math.max(0,Math.trunc(Number(v)||0)).toLocaleString('en-US');
const short=s=>String(s||'').trim();
const state={user:null,member:null,assets:[],pending:0,cases:[],prefs:[],pulse:null,
 world:'all',mode:'mix',tab:'live',items:[],index:0,playing:false,playTimer:null,
 signed:new Map(),loading:false,rank:()=>0,caseAsset:null,caseRecord:null,renderSeq:0,previewObserver:null,previewAbort:null,viewAbort:null,viewUrl:null,viewSeq:0};
const visibleAssets=()=>state.assets.filter(eligibleOmegaAsset);
const current=()=>state.items[state.index]||null;
const safeTitle=a=>short(a?.caption||a?.filename)||'Untitled uniform record';
const dateLabel=s=>{try{return new Date(s).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}catch{return 'Unknown date'}};
function setStatus(label){$('connectionStatus').textContent=label}
function gate(msg,retry=false){$('omegaApp').hidden=true;$('omegaGate').hidden=false;$('gateText').textContent=msg;$('gateRetry').hidden=!retry;stopPlayback();clearView();clearGrid();bunny.dispose()}
function clearNode(node){node.replaceChildren()}
function stopped(){return document.hidden||state.tab!=='live'||$('omegaApp').hidden}
function stopPlayback(){state.playing=false;clearTimeout(state.playTimer);state.playTimer=null;$('screenPlay').textContent='▶';try{$('screenVideo').pause()}catch(_){}}
function schedulePlayback(){
 clearTimeout(state.playTimer);
 if(!state.playing||stopped()||!state.items.length)return;
 // Curated channels rotate photos and video posters; actual video playback
 // is started only by an explicit click and never downloads automatically.
 state.playTimer=setTimeout(()=>{state.index=(state.index+1)%state.items.length;void showCurrent().then(schedulePlayback)},8500);
}
function selectedMode(mode){state.mode=['mix','photos','videos'].includes(mode)?mode:'mix';
 for(const btn of document.querySelectorAll('[data-mode]'))btn.classList.toggle('active',btn.dataset.mode===state.mode);
 updateChannel()}
function selectWorld(id){state.world=getWorld(id).id;updateChannel();renderWorlds();renderAtlas();updateGunner()}
function pathFor(a){if(isWorldMedia(a))return null;return a?.kind==='video'?a.video_poster_path||null:a?.storage_path||null}
async function signPreviews(items){
 const paths=[...new Set(items.map(pathFor).filter(Boolean))].filter(path=>!state.signed.has(path));
 for(let index=0;index<paths.length;index+=24){
  const subset=paths.slice(index,index+24);
  try{
   const {data,error}=await bucket.createSignedUrls(subset,1800);
   if(error)throw error;
   (data||[]).forEach((entry,i)=>{if(entry?.signedUrl)state.signed.set(subset[i],entry.signedUrl)});
  }catch(error){console.warn('OMEGA secure preview unavailable:',error?.message||error)}
 }
}
async function signVideo(a){
 if(isWorldMedia(a)||!a?.storage_path)return '';
 try{const {data,error}=await bucket.createSignedUrl(a.storage_path,900);if(error)throw error;return data?.signedUrl||''}
 catch(error){console.warn('OMEGA protected playback unavailable:',error?.message||error);return ''}
}
function sourceUrl(a){return state.signed.get(pathFor(a))||''}
function showTab(name){
 state.tab=['live','atlas','cases','missions'].includes(name)?name:'live';
 for(const btn of document.querySelectorAll('[data-tab]'))btn.classList.toggle('active',btn.dataset.tab===state.tab);
 for(const page of document.querySelectorAll('[data-panel]'))page.hidden=page.dataset.panel!==state.tab;
 if(state.tab!=='live')stopPlayback();
 if(state.tab==='cases')renderCases();
 if(state.tab==='missions')renderMissions();
}
function renderWorlds(){
 const root=$('worldButtons');clearNode(root);
 for(const w of buildWorldDesk(state.assets)){
  const btn=e('button','world-button'+(state.world===w.id?' active':''));btn.type='button';
  btn.setAttribute('aria-pressed',String(state.world===w.id));
  const ico=e('span','world-symbol',w.icon),copy=e('span','world-copy'),
   title=e('strong','',w.name),small=e('small','',w.subtitle),count=e('span','world-count',number(w.count));
  copy.append(title,small);btn.append(ico,copy,count);btn.addEventListener('click',()=>{selectWorld(w.id);showTab('live')});root.append(btn);
 }
}
function renderAtlas(){
 const root=$('atlasGrid');clearNode(root);
 for(const w of buildWorldDesk(state.assets)){
  const tile=e('button','atlas-tile');tile.type='button';
  tile.append(e('span','atlas-icon',w.icon),e('strong','',w.name),e('p','',w.subtitle));
  const stats=e('div','atlas-numbers');for(const [value,label] of [[w.count,'FILES'],[w.photos,'PHOTOS'],[w.videos,'VIDEOS'],[w.eras,'ERAS']]){
   const group=e('span');group.append(e('b','',number(value)),document.createTextNode(label));stats.append(group)
  }
  tile.append(stats);tile.addEventListener('click',()=>{selectWorld(w.id);showTab('live')});root.append(tile);
 }
}
function metrics(){
 const desks=buildWorldDesk(state.assets);
 $('metricMedia').textContent=number(desks[0].count);
 $('metricVideo').textContent=number(desks[0].videos);
 $('metricCases').textContent=number(state.cases.length);
 $('worldsRepresented').textContent=desks.slice(1).filter(w=>w.count>0).length+' / 6';
 $('activeCases').textContent=number(state.cases.filter(c=>c.stage!=='complete').length);
}

function clearGrid(){
 state.previewObserver?.disconnect();state.previewObserver=null;
 state.previewAbort?.abort();state.previewAbort=null;
}
function clearView(){
 state.viewSeq++;
 state.viewAbort?.abort();state.viewAbort=null;
 if(state.viewUrl){URL.revokeObjectURL(state.viewUrl);state.viewUrl=null}
 const image=$("screenImage"),video=$("screenVideo");
 if(image){image.onload=null;image.onerror=null;image.removeAttribute("src");image.hidden=true}
 if(video){try{video.pause()}catch{}video.removeAttribute("src");video.load();video.hidden=true}
}
function displayPrivateThumbnails(jobs,seq){
 if(!jobs.length)return;
 const ctl=new AbortController();state.previewAbort=ctl;
 const queued=[],seen=new Set();let active=0;
 const pump=()=>{
  while(active<2&&queued.length&&!ctl.signal.aborted&&seq===state.renderSeq){
   const [a,poster]=queued.shift();active++;
   void bunny.thumbnail(a,ctl.signal).then(src=>{
    if(ctl.signal.aborted||seq!==state.renderSeq)return;
    const img=e("img");img.alt="";img.decoding="async";img.loading="lazy";
    img.onload=()=>poster.classList.remove("loading");
    img.onerror=()=>{img.remove();poster.textContent="PREVIEW UNAVAILABLE";poster.classList.add("preview-failed")};
    img.src=src;poster.replaceChildren(img);
   }).catch(error=>{
    if(ctl.signal.aborted||seq!==state.renderSeq)return;
    poster.textContent="PREVIEW UNAVAILABLE";poster.classList.add("preview-failed");
    poster.title=String(error?.message||"Protected source unavailable").slice(0,100);
   }).finally(()=>{active--;pump()});
  }
 };
 if(typeof IntersectionObserver==="undefined"){
  queued.push(...jobs);pump();return;
 }
 const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting||seen.has(entry.target))continue;
   seen.add(entry.target);observer.unobserve(entry.target);
   const match=jobs.find(([,el])=>el===entry.target);
   if(match)queued.push(match);
  }
  pump();
 },{rootMargin:"220px"});
 state.previewObserver=observer;
 for(const [,poster] of jobs)observer.observe(poster);
}

function renderMediaGrid(){
 clearGrid();
 const root=$('channelGrid');clearNode(root);const visible=state.items.slice(0,21),worldJobs=[];
 $('queueCount').textContent=number(state.items.length)+' AUTHORIZED RECORDS';
 $('queueHeading').textContent=getWorld(state.world).name+' / '+(state.mode==='mix'?'ALL MEDIA':state.mode.toUpperCase());
 if(!visible.length){root.append(e('div','case-empty','No eligible media in this channel. Select another world.'));return}
 for(const [index,a] of visible.entries()){
  const button=e('button','media-card');button.type='button';button.title=safeTitle(a);
  const poster=e('div','media-poster',a.kind==='video'?'▶':'◈');
  const img=e('img');img.alt='';img.loading='lazy';img.decoding='async';
  const path=pathFor(a),url=sourceUrl(a);
  if(isWorldMedia(a)&&a.kind==='photo'){
   poster.textContent='LOADING PHOTO';poster.classList.add('loading');worldJobs.push([a,poster]);
  }else if(isWorldMedia(a)&&a.kind==='video'){
   poster.classList.add('video-placeholder');
   poster.replaceChildren(e('span','video-symbol','▶'),e('small','','TAP TO PLAY VIDEO'));
  }else if(url){poster.textContent='';img.src=url;poster.append(img)}
  else if(path)poster.dataset.path=path;
  if(a.kind==='video')poster.append(e('span','media-video','▶ VIDEO'));
  const copy=e('div','media-copy');copy.append(e('strong','',safeTitle(a)),
   e('small','',evidenceSummary(a)));button.append(poster,copy);
  button.addEventListener('click',()=>{stopPlayback();state.index=index;void showCurrent();$('liveScreen').scrollIntoView({behavior:'smooth',block:'nearest'})});
  root.append(button);
 }
 const seq=++state.renderSeq;
 displayPrivateThumbnails(worldJobs,seq);
 void signPreviews(visible.filter(a=>!isWorldMedia(a))).then(()=>{
  if(seq!==state.renderSeq)return;
  for(const poster of root.querySelectorAll('[data-path]')){
   const url=state.signed.get(poster.dataset.path);
   if(!url)continue;
   const img=e('img');img.alt='';img.loading='lazy';img.decoding='async';img.src=url;
   poster.textContent='';poster.append(img);
   const card=poster.closest('.media-card');
   const idx=[...root.children].indexOf(card);
   if(idx>=0&&visible[idx]?.kind==='video')poster.append(e('span','media-video','▶ VIDEO'));
   poster.removeAttribute('data-path');
  }
 });
}
async function showCurrent(){
 clearView();
 const a=current(),seq=state.viewSeq,image=$("screenImage"),blank=$("screenEmpty");
 $("screenChannel").textContent=getWorld(state.world).name;
 $("screenCounter").textContent=state.items.length?(state.index+1)+" / "+state.items.length:"0 / 0";
 $("screenTitle").textContent=a?safeTitle(a):"No eligible media";
 $("screenMeta").textContent=a?evidenceSummary(a)+" · "+dateLabel(a.created_at):"Select a different channel";
 $("screenCase").disabled=!a;
 $("screenWatch").hidden=!a||a.kind!=="video";
 $("broadcastState").textContent=state.playing?"· BROADCASTING":"· PAUSED";
 blank.hidden=false;
 if(!a){blank.querySelector("strong").textContent="SELECT A WORLD";blank.querySelector("small").textContent="No media in this channel";return}
 if(a.kind==="video"){
  blank.querySelector("strong").textContent="PRIVATE VIDEO READY";
  blank.querySelector("small").textContent="Press PLAY VIDEO to retrieve the original. Video files never preload automatically.";
  $("screenWatch").textContent="PLAY VIDEO";return;
 }
 blank.querySelector("strong").textContent="LOADING PRIVATE PHOTO";
 blank.querySelector("small").textContent="Retrieving authorized full-resolution media…";
 const ctl=new AbortController();state.viewAbort=ctl;
 try{
  let src;
  if(isWorldMedia(a)){
   src=await bunny.original(a,ctl.signal);
   if(ctl.signal.aborted||state.viewSeq!==seq||current()?.id!==a.id){URL.revokeObjectURL(src);return}
   state.viewUrl=src;
  }else{
   await signPreviews([a]);if(state.viewSeq!==seq||current()?.id!==a.id)return;
   src=sourceUrl(a);
  }
  if(!src)throw Error("No authorized preview is available");
  image.onload=()=>{if(state.viewSeq===seq&&current()?.id===a.id){image.hidden=false;blank.hidden=true}};
  image.onerror=()=>{if(state.viewSeq===seq){image.hidden=true;blank.hidden=false;blank.querySelector("small").textContent="Unable to decode photo. Refresh to retry."}};
  image.src=src;
 }catch(error){
  if(ctl.signal.aborted||state.viewSeq!==seq)return;
  blank.querySelector("strong").textContent="PHOTO PREVIEW UNAVAILABLE";
  blank.querySelector("small").textContent=String(error?.message||error).slice(0,170);
 }
}
function updateChannel(){
 stopPlayback();
 state.items=makeChannel(state.assets,state.world,state.mode,state.rank);
 state.index=0;renderMediaGrid();void showCurrent();updateGunner();
}
function goNext(step){if(!state.items.length)return;state.index=(state.index+step+state.items.length)%state.items.length;void showCurrent().then(schedulePlayback)}
async function playVideo(){
 const a=current();if(!a||a.kind!=="video")return;
 stopPlayback();
 const button=$("screenWatch"),video=$("screenVideo"),blank=$("screenEmpty");
 if(!video.hidden&&video.src){
  try{await video.play();button.hidden=true;$("broadcastState").textContent="· PLAYING VIDEO"}
  catch{button.textContent="TAP PLAY ON VIDEO"}
  return;
 }
 if(button.textContent.startsWith("OPEN")){
  const u=new URL("corporate-network.html",location.href);
  u.searchParams.set("view","videos");u.searchParams.set("video",a.id);
  window.open(u.href,"_blank","noopener");return;
 }
 const seq=state.viewSeq,ctl=new AbortController();state.viewAbort=ctl;
 button.disabled=true;button.textContent="RETRIEVING PRIVATE VIDEO…";
 try{
  const src=isWorldMedia(a)?await bunny.original(a,ctl.signal):await signVideo(a);
  if(ctl.signal.aborted||seq!==state.viewSeq||current()?.id!==a.id){
   if(isWorldMedia(a)&&src)URL.revokeObjectURL(src);
   return;
  }
  if(!src)throw Error("Protected video source unavailable");
  if(isWorldMedia(a))state.viewUrl=src;
  video.src=src;video.controls=true;video.playsInline=true;video.preload="metadata";
  video.hidden=false;blank.hidden=true;video.load();
  try{await video.play();button.hidden=true;$("broadcastState").textContent="· PLAYING VIDEO"}
  catch{button.textContent="TAP PLAY ON VIDEO";setStatus("VIDEO READY · PRESS PLAY IN CONTROLS")}
 }catch(error){
  if(seq===state.viewSeq&&!ctl.signal.aborted){
   blank.hidden=false;blank.querySelector("strong").textContent="VIDEO UNAVAILABLE";
   blank.querySelector("small").textContent=String(error?.message||error).slice(0,160);
   button.textContent=isWorldMedia(a)?"RETRY VIDEO":"OPEN IN TUBE ↗";
  }
 }finally{button.disabled=false}
}
function renderCases(){
 const root=$('caseList');clearNode(root);
 const source=new Map(visibleAssets().map(a=>[a.id,a]));
 const entries=[...state.cases].filter(c=>source.has(c.asset_id)).sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0));
 if(!entries.length){const box=e('div','case-empty');box.append(e('strong','','NO INVESTIGATIONS OPENED YET'),e('p','','Select a photograph or video in BLACKCELL LIVE, then choose + CASE FILE to begin a private investigation.'));root.append(box);return}
 for(const c of entries){
  const box=e('div','case-entry'),left=e('div');left.append(e('span','eyebrow',c.stage.toUpperCase()),e('h3','',c.title),
   e('p','',evidenceSummary(source.get(c.asset_id))+' · Updated '+dateLabel(c.updated_at)));
  const edit=e('button','','OPEN CASE');edit.type='button';edit.addEventListener('click',()=>openCase(source.get(c.asset_id)));box.append(left,edit);root.append(box);
 }
}
function openCase(a){
 if(!a||!eligibleOmegaAsset(a))return;
 stopPlayback();const existing=state.cases.find(c=>c.asset_id===a.id)||null;
 state.caseAsset=a;state.caseRecord=existing;
 $('caseDialogTitle').textContent=existing?'INVESTIGATION FILE':'NEW INVESTIGATION';
 $('caseEvidence').textContent=evidenceSummary(a)+' · '+(a.kind||'').toUpperCase()+' · '+dateLabel(a.created_at);
 $('caseTitleInput').value=existing?.title||safeCaseTitle(a).slice(0,160);
 $('caseNoteInput').value=existing?.note||'';
 $('caseStageInput').value=existing?.stage||'research';$('caseDelete').hidden=!existing;
 $('caseMessage').textContent='';$('omegaCaseDialog').showModal();$('caseTitleInput').focus();
}
async function saveCase(ev){
 ev.preventDefault();const a=state.caseAsset;if(!a||!state.user)return;
 const form=$('omegaCaseForm'),submit=form.querySelector('[type=submit]');
 const title=$('caseTitleInput').value.trim(),note=$('caseNoteInput').value.trim(),stage=$('caseStageInput').value;
 if(!title||title.length>160||note.length>4000||!['research','evidence','complete'].includes(stage)){ $('caseMessage').textContent='Check case fields and try again.';return}
 submit.disabled=true;$('caseMessage').textContent='Saving private case…';
 try{
  const {data,error}=await client.from('corp_omega_cases')
   .upsert({user_id:state.user.id,asset_id:a.id,title,note,stage,updated_at:new Date().toISOString()},
    {onConflict:'user_id,asset_id'}).select('id,user_id,asset_id,title,note,stage,updated_at').single();
  if(error||!data)throw error||Error('No saved case returned');
  state.cases=[data,...state.cases.filter(c=>c.asset_id!==a.id)];
  $('omegaCaseDialog').close();metrics();renderCases();renderMissions();setStatus('PRIVATE CASE SAVED');
 }catch(error){$('caseMessage').textContent='Could not save: '+(error?.message||'Verification failed')}
 finally{submit.disabled=false}
}
async function deleteCase(){
 const c=state.caseRecord;if(!c||!state.user||!confirm('Delete this private investigation file? The original media remains unchanged.'))return;
 $('caseDelete').disabled=true;
 try{const {error}=await client.from('corp_omega_cases').delete().eq('id',c.id).eq('user_id',state.user.id);if(error)throw error;
  state.cases=state.cases.filter(row=>row.id!==c.id);
  $('omegaCaseDialog').close();metrics();renderCases();setStatus('PRIVATE CASE DELETED');
 }catch(error){$('caseMessage').textContent='Delete failed: '+(error?.message||'Retry')}
 finally{$('caseDelete').disabled=false}
}
function renderMissions(){
 const root=$('missionGrid'),stats=$('quotaPanel');clearNode(root);clearNode(stats);
 const plan=proposeMissions([...state.assets,...state.pendingAssets||[]],state.pulse);
 const quota=state.pulse?planGunnerProduction(state.pulse,{media:{pending:state.pending}}):null;
 for(const [label,value] of [
  ['PHOTO UPLOADS TODAY',quota?quota.photoToday:'—'],
  ['VIDEOS THIS WEEK',quota?quota.videoThisWeek:'—'],
  ['SUGGESTED PHOTO QUOTA',quota?.photo?.ready?quota.photo.daily:'MEASURING'],
  ['WEEKLY VIDEO QUOTA',quota?.video?.ready?quota.video.weekly:'MEASURING']
 ]){
  const item=e('div','quota-item');item.append(e('small','',label),e('strong','',typeof value==='number'?number(value):value));stats.append(item)
 }
 if(!quota){stats.append(e('small','','Production pacing is available to the verified Level 7 owner.'))}
 for(const [i,m] of plan.missions.entries()){
  const card=e('article','mission-card');card.append(e('p','eyebrow','MISSION '+String(i+1).padStart(2,'0')+' / '+m.category),e('h3','',m.title),
   e('p','',m.action),e('small','',m.reason));root.append(card)
 }
}
function updateGunner(){
 const plan=proposeMissions([...state.assets,...state.pendingAssets||[]],state.pulse);
 const desk=buildWorldDesk(state.assets).find(w=>w.id===state.world);
 const mission=plan.missions[0];
 $('gunnerBrief').textContent=desk?.count?
  'We have '+number(desk.count)+' eligible records on this frequency. '+mission.action+
  ' Your next move should improve real archive coverage, not inflate counts with duplicates.':
  'This frequency has no eligible archive media. '+(mission?.action||'Begin with verified uniform references.');
 const root=$('priorityMissions');clearNode(root);
 for(const [i,m] of plan.missions.slice(0,4).entries()){
  const card=e('div','priority');card.append(e('strong','',String(i+1).padStart(2,'0')+' / '+m.title),
   e('small','',m.action));root.append(card);
 }
}
async function loadPersonalRanking(){
 try{
  const uid=state.user.id;
  const [prefs,tastes,favorites,engagements]=await Promise.all([
   client.from('corp_social_personalization_settings').select('enabled,personalize_feed').eq('user_id',uid).maybeSingle(),
   client.from('corp_social_photo_tastes').select('asset_id,reaction,rating').eq('user_id',uid).limit(1000),
   client.from('corp_social_photo_favorites').select('asset_id').eq('user_id',uid).limit(1000),
   client.from('corp_social_photo_rediscovery').select('asset_id,engaged_views,zoom_engaged_views,rediscovery_feedback,not_interested').eq('user_id',uid).limit(1000)
  ]);
  if(prefs.error||tastes.error||favorites.error||engagements.error)throw Error('Preference permissions not ready');
  if(prefs.data?.enabled&&prefs.data?.personalize_feed){
   state.rank=buildBehavioralAffinity(state.assets,tastes.data||[],
     new Set((favorites.data||[]).map(r=>r.asset_id)),
     new Map((engagements.data||[]).map(r=>[r.asset_id,r])));
  }else state.rank=()=>0;
 }catch(error){state.rank=()=>0;console.warn('OMEGA uses chronological order:',error?.message||error)}
}
async function loadCatalog(){
 if(state.loading)return;state.loading=true;setStatus('SYNCING ARCHIVE…');
 clearGrid();clearView();
 try{
  const uid=state.user.id;
  const [assets,cases,pending]=await Promise.all([
   client.from('corp_social_assets')
    .select('id,owner_id,kind,purpose,review_status,rights_confirmed,adult_restricted,caption,filename,storage_path,mime_type,source_provider,video_poster_path,video_category,created_at,military_category,military_branch,military_era,military_country_code,military_tags')
    .eq('review_status','approved').eq('rights_confirmed',true).eq('adult_restricted',false)
    .in('purpose',['post','library']).in('kind',['photo','video']).order('created_at',{ascending:false}).limit(500),
   client.from('corp_omega_cases').select('id,user_id,asset_id,title,note,stage,updated_at').eq('user_id',uid).order('updated_at',{ascending:false}).limit(250),
   state.member?.role==='owner'?
    client.from('corp_social_assets').select('id,kind,review_status,rights_confirmed')
     .eq('owner_id',uid).eq('review_status','pending').limit(250):
    Promise.resolve({data:[],error:null})
  ]);
  if(assets.error)throw assets.error;
  if(cases.error)throw cases.error;
  state.assets=(assets.data||[]).filter(eligibleOmegaAsset);
  state.cases=cases.data||[];state.pendingAssets=pending.error?[]:pending.data||[];
  state.pending=state.pendingAssets.filter(a=>a.rights_confirmed!==true).length;
  if(state.member?.role==='owner'){
   const p=await client.rpc('blackcell_gunner_production_pulse');
   state.pulse=p.error?null:p.data;
  }
  await loadPersonalRanking();
  renderWorlds();renderAtlas();metrics();renderCases();renderMissions();updateChannel();
  setStatus('PRIVATE NETWORK · READY');
 }catch(error){setStatus('ARCHIVE UNAVAILABLE');console.warn('OMEGA catalog unavailable:',error?.message||error);
  $('gunnerBrief').textContent='The protected archive is unavailable. Refresh to try again. No private media is shown until verification succeeds.'}
 finally{state.loading=false}
}
async function boot(){
 gate('Verifying private BLACKCELL credentials…');
 try{
  const authorization=await corporateAuthorize(client);
  if(!authorization.ok||!authorization.user||!authorization.member)throw Error('Corporate sign-in required.');
  state.user=authorization.user;state.member=authorization.member;
  const verify=await client.rpc(state.member.role==='owner'?'corp_code_status':'corp_employee_code_status');
  if(verify.error||verify.data?.ok!==true||verify.data?.verified!==true)throw Error('Your corporate security verification has expired.');
  const catalog=await client.rpc('corp_app_store',{p_action:'catalog'});
  if(catalog.error||catalog.data?.ok!==true)throw Error('Unable to verify OMEGA app authorization.');
  const omega=(catalog.data.apps||[]).find(a=>a.id==='omega');
  if(!omega?.allowed||!omega?.installed)throw Error('OMEGA is not installed or authorized. Open the BLACKCELL OS App Store.');
  $('omegaGate').hidden=true;$('omegaApp').hidden=false;
  await loadCatalog();
 }catch(error){gate('Access restricted: '+(error?.message||'Corporate verification unavailable.'),true)}
}
function events(){
 for(const btn of document.querySelectorAll('[data-tab]'))btn.addEventListener('click',()=>showTab(btn.dataset.tab));
 for(const btn of document.querySelectorAll('[data-mode]'))btn.addEventListener('click',()=>selectedMode(btn.dataset.mode));
 $('screenPrev').addEventListener('click',()=>goNext(-1));
 $('screenNext').addEventListener('click',()=>goNext(1));
 $('screenPlay').addEventListener('click',()=>{
  if(state.playing){stopPlayback();$('broadcastState').textContent='· PAUSED'}
  else if(state.items.length){state.playing=true;$('screenPlay').textContent='Ⅱ';$('broadcastState').textContent='· BROADCASTING';schedulePlayback()}
 });
 $('screenWatch').addEventListener('click',()=>void playVideo());
 $('screenCase').addEventListener('click',()=>openCase(current()));
 $('refreshOmega').addEventListener('click',()=>void loadCatalog());
 $('gateRetry').addEventListener('click',()=>void boot());
 $('caseDialogClose').addEventListener('click',()=>$('omegaCaseDialog').close());
 $('caseCancel').addEventListener('click',()=>$('omegaCaseDialog').close());
 $('omegaCaseForm').addEventListener('submit',saveCase);
 $('caseDelete').addEventListener('click',()=>void deleteCase());
 $('screenVideo').addEventListener('ended',()=>{if(state.playing)goNext(1)});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback()});
 // Feedback from existing Network pages is read on entry, never profiled
 // across members. No continuous hidden-tab network activity.
 window.addEventListener('focus',()=>{
  if(state.user&&!document.hidden&&Date.now()-lastFocusRefresh>180000){lastFocusRefresh=Date.now();void loadCatalog()}
 });
}
let lastFocusRefresh=Date.now();events();void boot();
