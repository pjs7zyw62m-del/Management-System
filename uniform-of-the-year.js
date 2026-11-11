import {authorizeUniformHub} from './uniform-hub-auth.js?v=20261111-i1';
import {createPhotoVoting} from './corporate-photo-votes.js?v=20261111-votes1';
const $=id=>document.getElementById(id);
const currentYear=new Date().getUTCFullYear();
let session=null,votes=null,history=[],members=new Map(),selectedYear=currentYear;
let loading=false;
function node(tag,cls='',text=null){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==null)el.textContent=String(text);
 return el;
}
function setStatus(message){$('uLiveStatus').textContent=message}
function empty(message){return node('div','u-empty',message)}
function articlePhoto(row,src){
 const fig=node('figure'),image=src?node('img'):null;
 if(image){image.src=src;image.alt=row.caption||row.filename||'Uniform photograph';image.loading='lazy';fig.append(image)}
 else fig.append(node('div','u-history-image','▧'));
 return fig;
}
async function signedFor(rows){
 const paths=rows.map(r=>r.storage_path).filter(Boolean);
 if(!paths.length)return new Map();
 const {data,error}=await session.client.storage.from('corp-social-media').createSignedUrls(paths,1800);
 const result=new Map();
 if(error){console.warn('Unable to sign military images:',error.message);return result}
 for(let i=0;i<paths.length;i++)if(data?.[i]?.signedUrl)result.set(paths[i],data[i].signedUrl);
 return result;
}
async function loadMembers(){
 const {data,error}=await session.client.from('corp_social_profiles')
  .select('user_id,display_name').limit(1000);
 if(error){console.warn('Member names unavailable:',error.message);return}
 members=new Map((data||[]).map(m=>[m.user_id,m.display_name||'Network Member']));
}
async function loadHistory(){
 const {data,error}=await session.client.from('corp_social_uniform_awards')
  .select('award_year,winner_asset_id,winner_filename,winner_caption,winner_owner_name,winner_branch,final_vote_count,finalized_at')
  .order('award_year',{ascending:false}).limit(75);
 if(error){
  $('uHistory').replaceChildren(empty('Past winners could not be loaded. '+error.message));
  return;
 }
 history=data||[];
 const host=$('uHistory');host.replaceChildren();
 if(!history.length){
  host.append(empty('No past Uniform of the Year winners yet. The first Blackcell award will be selected after 2026 voting closes and the administrator finalizes the result.'));
  return;
 }
 const ids=history.map(h=>h.winner_asset_id).filter(Boolean),images=new Map();
 if(ids.length){
  const {data:assets,error:mediaError}=await session.client.from('corp_social_assets')
    .select('id,storage_path').in('id',ids).limit(100);
  if(!mediaError){
   const urls=await signedFor(assets||[]);
   for(const item of assets||[])images.set(item.id,urls.get(item.storage_path)||'');
  }
 }
 for(const item of history){
  const card=node('article','u-history-card');
  const src=images.get(item.winner_asset_id)||'';
  const cover=node('div','u-history-image');
  if(src){const image=node('img');image.src=src;image.alt=item.winner_caption||item.winner_filename;image.loading='lazy';cover.append(image)}
  else cover.textContent='★';
  const detail=node('div','u-history-content');
  detail.append(node('div','u-history-year',String(item.award_year)+' / OFFICIAL WINNER'));
  detail.append(node('h3','',item.winner_caption||item.winner_filename));
  detail.append(node('p','',item.winner_owner_name+(item.winner_branch?' · '+item.winner_branch:'')));
  detail.append(node('p','',Number(item.final_vote_count)+' final '+(Number(item.final_vote_count)===1?'vote':'votes')));
  detail.append(node('p','',src?'Winning photograph preserved in the Military Library.':'The original photograph is unavailable; award information remains archived.'));
  card.append(cover,detail);host.append(card);
 }
}
function awardAsset(row){
 return {id:row.asset_id,kind:'photo',military_category:'Uniforms',created_at:row.created_at,
   filename:row.filename,caption:row.caption||''};
}
async function renderLeaderboard(){
 if(loading)return;
 loading=true;
 const box=$('uLeaderboard');box.replaceChildren();
 setStatus('Retrieving the '+selectedYear+' Uniforms leaderboard…');
 try{
  const {data,error}=await session.client.from('corp_social_uniform_leaderboard')
    .select('asset_id,filename,caption,created_at,owner_id,storage_path,military_branch,award_vote_count,vote_count,award_year')
    .eq('award_year',selectedYear).order('award_vote_count',{ascending:false})
    .order('created_at',{ascending:true}).limit(100);
  if(error)throw error;
  const items=data||[];
  const closed=selectedYear<currentYear;
  const finalized=history.some(x=>x.award_year===selectedYear);
  $('uVotingState').textContent=closed?(finalized?'AWARD FINALIZED':'VOTING CLOSED'):'VOTING OPEN';
  $('uVotingYearText').textContent=selectedYear+' / ANNUAL UNIFORM AWARD';
  $('uLeaderboardTitle').textContent=closed?selectedYear+' FINAL STANDINGS':selectedYear+' CURRENT LEADERS';
  $('uAdminFinalize').hidden=!(closed&&!finalized&&session.member.role==='owner'&&items.some(x=>Number(x.award_vote_count)>0));
  if(!items.length){
   box.append(empty('No eligible Uniforms photos yet for '+selectedYear+'. Open the Military Library, upload or classify your photographs under Subject: Uniforms, and they will appear here automatically.'));
   setStatus('0 eligible photographs. Votes will appear once members submit them.');
   return;
  }
  const urls=await signedFor(items.slice(0,6));
  let total=0;
  for(let rank=0;rank<items.length;rank++){
   if(rank===6)break;
   const item=items[rank],count=Number(item.award_vote_count||0);
   total+=count;
   const card=node('article','u-rank-card');
   const fig=articlePhoto(item,urls.get(item.storage_path));
   const rankLabel=node('span','u-rank-label',rank===0&&count>0?(closed?'YEAR LEADER':'CURRENT LEADER'):'#'+(rank+1));
   fig.append(rankLabel);card.append(fig);
   const detail=node('div','u-rank-copy');
   detail.append(node('div','u-overline',item.military_branch||'MILITARY UNIFORM'));
   detail.append(node('h3','',item.caption||item.filename));
   detail.append(node('p','',members.get(item.owner_id)||'Network Member'));
   detail.append(node('div','u-rank-votes',count+' '+(count===1?'award vote':'award votes')));
   if(!closed&&votes)detail.append(votes.button(awardAsset(item),'u-rank-vote'));
   else detail.append(node('p','',finalized?'OFFICIALLY FINALIZED':'VOTING CLOSED · AWAITING FINALIZATION'));
   card.append(detail);box.append(card);
  }
  setStatus(items.length+' eligible '+(items.length===1?'photograph':'photographs')+' · '+items.filter(x=>Number(x.award_vote_count)>0).length+' received votes · showing top '+Math.min(items.length,6));
 }catch(error){
  box.append(empty('The award leaderboard is temporarily unavailable. Try opening this page again.'));
  setStatus('Could not load votes: '+(error?.message||'Connection error'));
 }finally{loading=false}
}
async function finalizeYear(){
 if(session?.member?.role!=='owner'||selectedYear>=currentYear)return;
 if(!confirm('Finalize Uniform of the Year '+selectedYear+' permanently? The winning record will be archived and cannot be overwritten.'))return;
 const button=$('uFinalizeButton');button.disabled=true;button.textContent='FINALIZING…';
 try{
  const {data,error}=await session.client.rpc('corp_finalize_uniform_award',{p_year:selectedYear});
  if(error||data?.ok!==true)throw new Error(error?.message||data?.reason||'Finalization rejected');
  await loadHistory();
  await renderLeaderboard();
  setStatus('Uniform of the Year '+selectedYear+' has been '+(data.status==='already_finalized'?'previously archived.':'officially finalized and saved to Past Winners.'));
 }catch(error){
  setStatus('Could not finalize the award: '+(error?.message||'Please try again'));
 }finally{button.disabled=false;button.textContent='FINALIZE YEAR ↗'}
}
async function main(){
 session=await authorizeUniformHub();
 if(!session)return;
 $('uYearSelect').replaceChildren();
 for(let year=currentYear;year>=2026;year--){
  const opt=new Option(String(year),String(year));$('uYearSelect').add(opt);
 }
 $('uYearSelect').value=String(selectedYear);
 $('uYearSelect').addEventListener('change',()=>{
  selectedYear=Number($('uYearSelect').value);void renderLeaderboard();
 });
 $('uFinalizeButton').addEventListener('click',()=>void finalizeYear());
 votes=createPhotoVoting({
  client:session.client,userId:()=>session.user.id,
  toast:message=>setStatus(message),
  onChange:()=>void renderLeaderboard()
 });
 await Promise.all([votes.load(),loadMembers(),loadHistory()]);
 await renderLeaderboard();
}
void main();