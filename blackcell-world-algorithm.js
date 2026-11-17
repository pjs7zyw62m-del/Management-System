/* BLACKCELL Seven Worlds adaptive-interest bridge.
 * Opt-in, member-isolated, approved non-adult catalog only. Explicit More/Less
 * choices are separate from passive engagement. No model or paid inference.
 */
import {buildBehavioralAffinity,rankWithDiversity} from './blackcell-adaptive-ranker.js?v=20261117-sevenworlds-r1';

export function createWorldAlgorithm({client,getUser,getCurrent,dialog,image,video,onUpdated}){
 let settings=null,loaded=false,active=null,photoTimer=null,photoSequence=0;
 let tastes=new Map(),favorites=new Set(),photoSignals=new Map(),videoSignals=new Map();
 let videoSeconds=0,lastVideoPosition=null,videoRecorded=false,changing=false;
 const allowed=a=>!!a&&['photo','video'].includes(a.kind)&&a.review_status==='approved'&&a.adult_restricted===false;
 const enabled=()=>settings?.enabled===true;
 const passiveOn=()=>enabled()&&settings?.rediscovery_enabled===true;
 const isActive=a=>!!a&&active?.id===a.id&&getCurrent()?.id===a.id&&dialog?.open&&getUser()?.id;
 const signal=kind=>window.dispatchEvent(new CustomEvent('bc:algorithm-signal',{detail:{kind}}));
 let controls,more,less,status;
 const note=message=>{if(status)status.textContent=message};
 function resetTracking(){
  photoSequence++;
  if(photoTimer!==null){clearInterval(photoTimer);photoTimer=null}
  active=null;videoSeconds=0;lastVideoPosition=null;videoRecorded=false;
 }
 function paint(a){
  if(!controls)return;
  controls.hidden=!enabled()||!allowed(a);
  const reaction=a?.kind==='photo'?tastes.get(a.id)?.reaction:videoSignals.get(a?.id)?.reaction;
  more.setAttribute('aria-pressed',String(reaction==='more'));
  less.setAttribute('aria-pressed',String(reaction==='less'));
  more.disabled=less.disabled=changing;
  note(loaded&&settings?.enabled?'PRIVATE ADAPTIVE RECOMMENDATIONS':'Enable your private recommendations in Network');
 }
 async function load(){
  const uid=getUser()?.id;
  if(!uid){settings=null;loaded=false;return}
  const {data,error}=await client.from('corp_social_personalization_settings')
   .select('enabled,rediscovery_enabled').eq('user_id',uid).maybeSingle();
  settings=!error&&data?data:null;loaded=true;
  if(error)console.warn('Seven Worlds personalized recommendations unavailable',error.message);
  if(!enabled()){paint(active);return}
  const [tasteRows,favs,photoRows,videoRows]=await Promise.all([
   client.from('corp_social_photo_tastes').select('asset_id,reaction,rating').eq('user_id',uid).limit(2000),
   client.from('corp_social_photo_favorites').select('asset_id').eq('user_id',uid).limit(2000),
   client.from('corp_social_photo_rediscovery').select('asset_id,rediscovery_feedback,engaged_views,zoom_engaged_views,not_interested').eq('user_id',uid).limit(2000),
   client.from('corp_social_video_interest').select('asset_id,reaction,engaged_views').eq('user_id',uid).limit(2000)
  ]);
  tastes=new Map((tasteRows.data||[]).map(x=>[x.asset_id,x]));
  favorites=new Set((favs.data||[]).map(x=>x.asset_id));
  photoSignals=new Map((photoRows.data||[]).map(x=>[x.asset_id,x]));
  videoSignals=new Map((videoRows.data||[]).map(x=>[x.asset_id,x]));
  for(const r of [tasteRows,favs,photoRows,videoRows])
   if(r.error)console.warn('Seven Worlds feedback unavailable',r.error.message);
  paint(active);
 }
 function rank(assets){
  if(!enabled())return [...assets];
  const affinity=buildBehavioralAffinity(assets,[...tastes.values()],favorites,photoSignals,videoSignals);
  const score=a=>{
   const row=a.kind==='video'?videoSignals.get(a.id):tastes.get(a.id);
   let v=affinity(a);
   if(row?.reaction==='more')v+=90;
   if(row?.reaction==='less')v-=150;
   if(a.kind==='photo'&&favorites.has(a.id))v+=50;
   return v;
  };
  return rankWithDiversity(assets,score,{top:40,label:a=>a.military_branch||a.military_category||''});
 }
 async function saveReaction(reaction){
  const a=active,uid=getUser()?.id;
  if(!uid||!enabled()||!allowed(a)||!isActive(a)||changing)return;
  changing=true;paint(a);note('Saving private recommendation…');
  try{
   const table=a.kind==='video'?'corp_social_video_interest':'corp_social_photo_tastes';
   // Updating a reaction must never overwrite the user's saved photo rating,
   // selected uniform details or annotated regions.
   const {data:existing,error:updateError}=await client.from(table)
    .update({reaction}).eq('user_id',uid).eq('asset_id',a.id).select('asset_id');
   if(updateError)throw updateError;
   if(!existing?.length){
    const {error:insertError}=await client.from(table).insert({user_id:uid,asset_id:a.id,reaction});
    if(insertError)throw insertError;
   }
   if(!isActive(a))return;
   const map=a.kind==='video'?videoSignals:tastes;
   map.set(a.id,{...(map.get(a.id)||{}),asset_id:a.id,reaction});
   signal('seven-worlds-reaction');
   note(reaction==='more'?'LEARNED · PRIORITIZE SIMILAR UNIFORMS':'LEARNED · SHOW FEWER SIMILAR ITEMS');
   if(typeof onUpdated==='function')onUpdated();
  }catch(e){note('Preference not saved: '+String(e?.message||'Try again').slice(0,130))}
  finally{changing=false;paint(active)}
 }
 function recordPhoto(a){
  if(!passiveOn()||!isActive(a)||!allowed(a)||a.kind!=='photo')return;
  const id=a.id,sequence=photoSequence;
  void client.rpc('corp_record_photo_rediscovery_view',{p_asset_id:id}).then(({error})=>{
   if(error||!isActive(a)||sequence!==photoSequence)return;
   let seconds=0,last=performance.now();
   photoTimer=setInterval(()=>{
    if(!isActive(a)||sequence!==photoSequence){resetTracking();return}
    const now=performance.now(),delta=Math.max(0,Math.min(now-last,850));last=now;
    if(document.hidden||!document.hasFocus()||image.hidden)return;
    seconds+=delta;
    if(seconds<15000)return;
    clearInterval(photoTimer);photoTimer=null;
    void client.rpc('corp_record_photo_rediscovery_engagement',{p_asset_id:id})
     .then(({data,error})=>{
      if(!error&&data===true){signal('world-photo-long-view');void load().catch(()=>{})}
     }).catch(()=>{});
   },500);
  }).catch(()=>{});
 }
 function open(a){
  resetTracking();active=a;paint(a);
  if(!allowed(a)||!passiveOn())return;
  if(a.kind==='photo'){
   // Only a decoded, visible image starts the 15-second attention clock.
   if(image.complete&&image.naturalWidth>0)recordPhoto(a);
   else image.addEventListener('load',()=>{if(isActive(a))recordPhoto(a)},{once:true});
  }
 }
 function videoTimeUpdate(){
  const a=active;
  if(!a||a.kind!=='video'||!allowed(a)||!passiveOn()||videoRecorded)return;
  const position=Number(video.currentTime)||0;
  if(lastVideoPosition===null){lastVideoPosition=position;return}
  const delta=position-lastVideoPosition;
  lastVideoPosition=position;
  if(!isActive(a)||document.hidden||!document.hasFocus()||video.paused||video.seeking)return;
  // A seek is not 15 seconds of actual watching.
  if(delta<=0||delta>2)return;
  videoSeconds+=delta;
  if(videoSeconds<15)return;
  videoRecorded=true;
  void client.rpc('corp_record_video_engagement',{p_asset_id:a.id})
   .then(({data,error})=>{
    if(!error&&data===true){signal('world-video-watched');void load().catch(()=>{})}
   }).catch(()=>{});
 }
 function close(){resetTracking();if(controls)controls.hidden=true}
 function mount(){
  if(controls||!dialog)return;
  controls=document.createElement('div');controls.className='mf-algorithm-actions';controls.hidden=true;
  more=document.createElement('button');less=document.createElement('button');status=document.createElement('small');
  for(const [button,title] of [[more,'+ MORE LIKE THIS'],[less,'− SHOW LESS']]){
   button.type='button';button.className='mf-algorithm-button';button.textContent=title;
  }
  status.className='mf-algorithm-status';status.setAttribute('role','status');
  more.addEventListener('click',()=>void saveReaction('more'));
  less.addEventListener('click',()=>void saveReaction('less'));
  controls.append(more,less,status);
  const footer=dialog.querySelector('.mf-lightbox-bottom');
  if(footer)footer.append(controls);
  video?.addEventListener('timeupdate',videoTimeUpdate);
 }
 return {mount,load,rank,open,close,enabled};
}
