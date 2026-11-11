/* BLACKCELL / PER-MEMBER PERSONALIZATION & VISUAL TRIGGERS
   Members explicitly choose preferred/less-preferred subjects.
   Manual photo ratings and favorites are private; no sensitive-trait inference,
   cross-member profiling, facial identification, or automatic AI spending.
*/
export function createNetworkPersonalization({client,state,toast,onChanged}){
 const id=value=>document.getElementById(value);
 const TOPICS=[
  ['uniforms','Uniform design & fit',/\buniforms?\b|fatigue|utility clothing|\b(?:acu|mccuu|bdu|ocp)\b|dress coat/i],
  ['camouflage','Camouflage patterns',/camouflage|\bcamo\b|marpat|multicam|woodland|desert pattern/i],
  ['boots','Military boots',/\bboots?\b|footwear|combat shoes/i],
  ['protective_gear','Protective gear',/helmet|body armor|protective vest|ballistic|tactical vest|plate carrier|shield/i],
  ['training','Field training',/\btraining\b|drills?|field exercise|marksmanship|obstacle course/i],
  ['fitness','Fitness & exercise',/fitness|workout|exercise|strength|weightlift|running|calisthenics/i],
  ['military_history','Military history',/historical|history|world war|civil war|vietnam|cold war|vintage|heritage/i],
  ['portraits','Personnel portraits',/personnel|portrait|sailors?|soldiers?|marines?|airmen|service ?members/i],
  ['aviation','Military aviation',/aircraft|aviation|helicopter|fighter jet|plane|flight|air force/i],
  ['naval','Naval forces',/naval|vessels?|submarine|maritime|warship|coast guard|navy/i],
  ['vehicles','Military vehicles',/tank|armou?red vehicles?|ground vehicles?|mrap|transport truck/i],
  ['insignia','Insignia & patches',/insignia|rank|badge|patch|medals?|ribbons?/i]
 ];
 const DEFAULT=()=>({user_id:state.user?.id,enabled:false,personalize_feed:false,
   rediscovery_enabled:false,rediscovery_frequency:'occasional',
   preferred_topics:[],muted_topics:[]});
 let current=DEFAULT(),tastes=[],favorites=new Set(),interestSignals=new Map(),loaded=false,saving=false;
 const get=()=>({...current,preferred_topics:[...current.preferred_topics],muted_topics:[...current.muted_topics]});
 const enabled=()=>current.enabled===true;
 const feedEnabled=()=>enabled()&&current.personalize_feed===true;
 const topicList=()=>TOPICS.map(([key,label])=>({key,label}));
 const describe=asset=>{
  const a=asset||{};
  return [a.filename,a.caption,a.military_category,a.military_branch,a.military_era,
   ...(Array.isArray(a.military_tags)?a.military_tags:[])]
   .filter(Boolean).join(' ').toLowerCase();
 };
 const matching=asset=>new Set(TOPICS.filter(([, ,pattern])=>pattern.test(describe(asset))).map(([key])=>key));
 function preferenceScore(asset){
  if(!enabled())return 0;
  const match=matching(asset);
  let score=0;
  for(const key of current.preferred_topics||[])if(match.has(key))score+=20;
  for(const key of current.muted_topics||[])if(match.has(key))score-=50;
  const direct=tastes.find(t=>t.asset_id===asset?.id);
  if(direct){
   if(direct.reaction==='less')score-=55;
   else if(direct.reaction==='more')score+=20;
   if(direct.rating>=4)score+=8;
   if(direct.rating&&direct.rating<=2)score-=12;
  }
  if(favorites.has(asset?.id))score+=19;
  // Explicit Rediscovery/Trigger feedback is stronger than passive viewing.
  const signal=interestSignals.get(asset?.id);
  if(current.rediscovery_enabled&&signal?.rediscovery_feedback==='dislike')score-=120;
  else if(current.rediscovery_enabled&&signal?.rediscovery_feedback==='like')score+=30;
  else if(current.rediscovery_enabled&&signal?.rediscovery_feedback==='more')score+=25;
  // Long viewing or zooming is a *possible* preference; it is never a vote.
  if(current.rediscovery_enabled&&signal?.rediscovery_feedback!=='dislike'&&direct?.reaction!=='less'&&!(direct?.rating>0&&direct.rating<=2)){
   if(signal)score+=Math.min(3,signal.engaged_views||0)*8+Math.min(3,signal.zoom_engaged_views||0)*12;
  }
  return score;
 }
 function relatedScore(asset){
  if(!enabled())return 0;
  let score=0;
  const source=state.assets||[];
  const byId=new Map(source.map(a=>[a.id,a]));
  const liked=tastes.filter(t=>t.reaction==='more'||t.rating>=4).slice(0,80);
  for(const item of liked){
   const match=byId.get(item.asset_id);
   if(!match||match.id===asset?.id)continue;
   if(match.military_category && match.military_category!=='Unsorted' &&
      match.military_category===asset?.military_category)score+=2;
   if(match.military_branch && match.military_branch!=='Unspecified' &&
      match.military_branch===asset?.military_branch)score+=1;
  }
  if(current.rediscovery_enabled){
   for(const [id,signal] of interestSignals){
    const match=byId.get(id);
    if(!match||match.id===asset?.id||signal.rediscovery_feedback==='dislike'||(!signal.engaged_views&&!signal.zoom_engaged_views&&!['like','more'].includes(signal.rediscovery_feedback)))continue;
    if(match.military_category&&match.military_category!=='Unsorted'&&match.military_category===asset?.military_category)score+=3;
    if(match.military_branch&&match.military_branch!=='Unspecified'&&match.military_branch===asset?.military_branch)score+=2;
    if(match.military_era&&match.military_era===asset?.military_era)score+=1;
   }
  }
  return Math.min(score,25);
 }
 function rankAssets(assets){
  if(!enabled())return [...assets];
  const base=new Map(assets.map((a,i)=>[a.id,i]));
  return [...assets].sort((a,b)=>{
   const sa=preferenceScore(a)+relatedScore(a),sb=preferenceScore(b)+relatedScore(b);
   return sb-sa||base.get(a.id)-base.get(b.id);
  });
 }
 function rankFeed(entries){
  if(!feedEnabled())return [...entries];
  const score=entry=>{
   const item=entry.item;
   const assets=entry.type==='library'?[item]:(state.assets||[]).filter(a=>a.post_id===item.id);
   const base=assets.length?Math.max(...assets.map(a=>preferenceScore(a)+relatedScore(a))):0;
   let textScore=0;
   if(item.body && !assets.length){
    for(const [key,,regex] of TOPICS){
     if(regex.test(item.body)){
      if(current.preferred_topics.includes(key))textScore+=12;
      if(current.muted_topics.includes(key))textScore-=25;
     }
    }
   }
   const age=(Date.now()-new Date(item.created_at).getTime())/86400000;
   return base+textScore-Math.min(25,Math.max(0,age)*.65);
  };
  return [...entries].sort((a,b)=>score(b)-score(a)||
    Date.parse(b.item.created_at||0)-Date.parse(a.item.created_at||0));
 }
 async function load(){
  if(!state.user?.id)return;
  const uid=state.user.id;
  const [options,reactions,liked,engagements]=await Promise.all([
   client.from('corp_social_personalization_settings')
     .select('user_id,enabled,personalize_feed,rediscovery_enabled,rediscovery_frequency,preferred_topics,muted_topics')
     .eq('user_id',uid).maybeSingle(),
   client.from('corp_social_photo_tastes')
     .select('asset_id,rating,reaction,cues').eq('user_id',uid).limit(2000),
   client.from('corp_social_photo_favorites')
     .select('asset_id').eq('user_id',uid).limit(2000),
   client.from('corp_social_photo_rediscovery')
     .select('asset_id,engaged_views,zoom_engaged_views,rediscovery_feedback')
     .eq('user_id',uid).limit(2000)
  ]);
  if(options.error)console.warn('Personalization settings could not be loaded:',options.error.message);
  if(reactions.error)console.warn('Photo feedback unavailable:',reactions.error.message);
  if(liked.error)console.warn('Personalized favorites unavailable:',liked.error.message);
  if(engagements.error)console.warn('Private photo interest signals unavailable:',engagements.error.message);
  current=options.data?{
   ...DEFAULT(),...options.data,
   preferred_topics:Array.isArray(options.data.preferred_topics)?options.data.preferred_topics:[],
   muted_topics:Array.isArray(options.data.muted_topics)?options.data.muted_topics:[]
  }:DEFAULT();
  tastes=reactions.data||[];
  favorites=new Set((liked.data||[]).map(a=>a.asset_id));
  interestSignals=new Map((engagements.data||[]).map(row=>[row.asset_id,row]));
  loaded=true;updateButtons();
 }
 function updateButtons(){
  document.querySelectorAll('[data-personalization-open]').forEach(b=>{
   b.classList.toggle('personalization-active',enabled());
   b.setAttribute('aria-label','Open my private personalization settings'+(enabled()?' (on)':' (off)'));
  });
  const label=id('personalizationCurrentStatus');
  if(label)label.textContent=enabled()?
   'ON · RECOMMENDATIONS ONLY FOR YOU':'OFF · PRIVATE UNTIL YOU OPT IN';
 }
 function renderChoices(){
  const root=id('personalizationTopics');if(!root)return;
  root.replaceChildren();
  const selects=new Map();
  for(const [key,label] of TOPICS){
   const row=document.createElement('div');row.className='bc-trigger-topic';
   const title=document.createElement('span');title.textContent=label;
   const actions=document.createElement('div');actions.className='bc-trigger-choice';
   for(const [mode,caption] of [['more','SHOW MORE'],['neutral','NEUTRAL'],['less','SHOW LESS']]){
    const input=document.createElement('input');
    input.type='radio';input.name='bc-topic-'+key;input.value=mode;
    input.id='bc-topic-'+key+'-'+mode;
    input.checked=mode==='more'?current.preferred_topics.includes(key)
      :mode==='less'?current.muted_topics.includes(key):
       !current.preferred_topics.includes(key)&&!current.muted_topics.includes(key);
    const labelEl=document.createElement('label');labelEl.htmlFor=input.id;
    labelEl.append(input,document.createTextNode(caption));
    actions.append(labelEl);
    selects.set(key+'-'+mode,input);
   }
   row.append(title,actions);root.append(row);
  }
 }
 function open(){
  if(!loaded){toast('Personalization settings are loading. Try again.');return}
  const modal=id('personalizationOverlay');if(!modal)return;
  id('personalizationEnabled').checked=enabled();
  id('personalizationFeedEnabled').checked=current.personalize_feed===true;
  id('rediscoveryEnabled').checked=current.rediscovery_enabled===true;
  id('rediscoveryFrequency').value=current.rediscovery_frequency==='rare'?'rare':'occasional';
  id('personalizationFeedback').textContent='';
  renderChoices();
  modal.hidden=false;
  id('personalizationEnabled').focus();
 }
 function close(){
  if(saving)return;
  const modal=id('personalizationOverlay');if(modal)modal.hidden=true;
 }
 async function save(){
  if(saving)return;
  const button=id('personalizationSave');
  const options={
   user_id:state.user.id,
   enabled:id('personalizationEnabled').checked,
   personalize_feed:id('personalizationFeedEnabled').checked,
   rediscovery_enabled:id('rediscoveryEnabled').checked&&id('personalizationEnabled').checked,
   rediscovery_frequency:id('rediscoveryFrequency').value==='rare'?'rare':'occasional',
   preferred_topics:TOPICS.filter(([key])=>
    document.querySelector('input[name="bc-topic-'+key+'"]:checked')?.value==='more').map(([key])=>key),
   muted_topics:TOPICS.filter(([key])=>
    document.querySelector('input[name="bc-topic-'+key+'"]:checked')?.value==='less').map(([key])=>key),
   updated_at:new Date().toISOString()
  };
  saving=true;button.disabled=true;button.textContent='SAVING…';
  try{
   const {error}=await client.from('corp_social_personalization_settings')
     .upsert(options,{onConflict:'user_id'});
   if(error)throw error;
   current={...options};
   if(!options.rediscovery_enabled){
    const {error:clearError}=await client.from('corp_social_photo_rediscovery')
     .delete().eq('user_id',state.user.id);
    if(clearError)console.warn('Could not clear disabled rediscovery history:',clearError.message);
   }
   updateButtons();
   const modal=id('personalizationOverlay');if(modal)modal.hidden=true;
   toast(enabled()?'Your private recommendations have been updated.':'Personalization is off for your account.');
   if(typeof onChanged==='function')onChanged();
  }catch(error){
   id('personalizationFeedback').textContent='Unable to save: '+(error?.message||'Network error');
  }finally{
   saving=false;button.disabled=false;button.textContent='SAVE MY PREFERENCES';
  }
 }
 async function reset(){
  if(saving)return;
  if(!confirm('Reset your chosen topics and switch off personalization? Your photo ratings, area markings, and favorites will remain saved.'))return;
  saving=true;
  try{
   const {data,error}=await client.from('corp_social_personalization_settings')
     .delete().eq('user_id',state.user.id).select('user_id');
   if(error)throw error;
   const {error:clearError}=await client.from('corp_social_photo_rediscovery')
    .delete().eq('user_id',state.user.id);
   if(clearError)console.warn('Photo rediscovery history reset failed:',clearError.message);
   current=DEFAULT();updateButtons();renderChoices();
   id('personalizationEnabled').checked=false;
   id('personalizationFeedEnabled').checked=false;
   id('rediscoveryEnabled').checked=false;
   id('rediscoveryFrequency').value='occasional';
   id('personalizationFeedback').textContent='Your interests were reset. Photo ratings and favorites were kept.';
   toast('Your personal recommendation settings were reset.');
   if(typeof onChanged==='function')onChanged();
  }catch(error){
   id('personalizationFeedback').textContent='Unable to reset: '+(error?.message||'Network error');
  }finally{saving=false}
 }
 function setup(){
  document.querySelectorAll('[data-personalization-open]').forEach(b=>b.addEventListener('click',open));
  id('personalizationSave')?.addEventListener('click',()=>void save());
  id('personalizationReset')?.addEventListener('click',()=>void reset());
  id('personalizationClose')?.addEventListener('click',close);
  id('personalizationCancel')?.addEventListener('click',close);
  id('personalizationOverlay')?.addEventListener('click',e=>{
   if(e.target===id('personalizationOverlay'))close();
  });
  document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&!id('personalizationOverlay').hidden)close();
  });
  updateButtons();
 }
 return {load,setup,open,close,get,enabled,feedEnabled,rankAssets,rankFeed,
   preferenceScore,topicList};
}
