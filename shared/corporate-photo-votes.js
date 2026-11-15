/* BLACKCELL / MANSARMEDFORCES
   One authenticated vote per member per photograph, independent of favorites.
   Shared by the private gallery and the Uniform of the Year leaderboard.
*/
export function createPhotoVoting({client,userId,toast=()=>{},onChange=()=>{}}){
 const counts=new Map(),myVotes=new Set(),busy=new Set();
 let loaded=false;
 const uid=()=>typeof userId==='function'?userId():userId;
 const count=a=>Number(counts.get(typeof a==='string'?a:a?.id)?.vote_count||0);
 const awardCount=a=>Number(counts.get(typeof a==='string'?a:a?.id)?.award_vote_count||0);
 const didVote=a=>myVotes.has(typeof a==='string'?a:a?.id);
 function updateControls(){
  document.querySelectorAll('button[data-blackcell-photo-vote]').forEach(btn=>{
   const id=btn.dataset.blackcellPhotoVote;
   const mine=myVotes.has(id),n=count(id);
   btn.disabled=busy.has(id);
   btn.classList.toggle('is-voted',mine);
   btn.setAttribute('aria-pressed',String(mine));
   btn.setAttribute('aria-label',(mine?'Withdraw your vote':'Vote for this photograph')+' · '+n+' total '+(n===1?'vote':'votes'));
   const label=btn.querySelector('[data-vote-label]');
   const tally=btn.querySelector('[data-vote-count]');
   if(label)label.textContent=mine?'VOTED':'VOTE';
   if(tally)tally.textContent=String(n);
  });
 }
 async function load(){
  const [total,own]=await Promise.all([
   client.from('corp_social_photo_vote_counts')
     .select('asset_id,vote_count,award_vote_count,award_year').limit(10000),
   client.from('corp_social_photo_votes').select('asset_id')
     .eq('user_id',uid()).limit(10000)
  ]);
  if(total.error||own.error){
   console.warn('Blackcell photo voting unavailable',total.error?.message||own.error?.message);
   if(!loaded)toast('Photo vote totals are temporarily unavailable.');
   return false;
  }
  counts.clear();myVotes.clear();
  for(const row of total.data||[])counts.set(row.asset_id,row);
  for(const row of own.data||[])myVotes.add(row.asset_id);
  loaded=true;updateControls();
  return true;
 }
 async function toggle(asset){
  if(!asset||asset.kind!=='photo'||busy.has(asset.id))return;
  const id=asset.id,wasVoted=didVote(id);
  busy.add(id);updateControls();
  try{
   const query=wasVoted?
    client.from('corp_social_photo_votes').delete().eq('asset_id',id).eq('user_id',uid()).select('asset_id'):
    client.from('corp_social_photo_votes').insert({asset_id:id,user_id:uid()}).select('asset_id');
   const {data,error}=await query;
   if(error)throw error;
   if(!Array.isArray(data)||data.length!==1)throw Error('Your vote was not authorized or the annual vote is locked.');
   if(wasVoted)myVotes.delete(id);else myVotes.add(id);
   const old=counts.get(id)||{asset_id:id,vote_count:0,award_vote_count:0,
      award_year:new Date(asset.created_at).getUTCFullYear()};
   const next={...old,vote_count:Math.max(0,Number(old.vote_count||0)+(wasVoted?-1:1))};
   const year=new Date().getUTCFullYear(),eligible=asset.military_category==='Uniforms'
     &&new Date(asset.created_at).getUTCFullYear()===year;
   if(eligible)next.award_vote_count=Math.max(0,Number(old.award_vote_count||0)+(wasVoted?-1:1));
   counts.set(id,next);
   updateControls();onChange(id);
   toast(wasVoted?'Your vote was withdrawn.':'Your vote has been saved.');
  }catch(error){
   toast('Could not save vote: '+(error?.message||'Please try again.'));
   console.warn('Photo vote action rejected:',error);
  }finally{busy.delete(id);updateControls()}
 }
 function button(asset,className=''){
  const el=document.createElement('button');
  el.type='button';
  el.className='bc-photo-vote '+className;
  el.dataset.blackcellPhotoVote=asset.id;
  el.innerHTML='<span class="bc-vote-mark" aria-hidden="true">◆</span><span data-vote-label>VOTE</span><b data-vote-count>0</b>';
  el.addEventListener('click',e=>{e.stopPropagation();void toggle(asset)});
  queueMicrotask(updateControls);
  return el;
 }
 return {load,toggle,button,count,awardCount,didVote,updateControls};
}