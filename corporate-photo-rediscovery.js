/* BLACKCELL / PHOTO REDISCOVERY
 * Private, user-controlled suggestions. Never assumes a view or revisit is a vote.
 * No push notifications, dark patterns, background tracking while tab is closed,
 * biometric/sensitive inferences or paid AI requests. */
export function createPhotoRediscovery({client,state,personalization,mediaUrl,openPhoto,toast}){
 let pendingTimer=null,active=false,card=null,lastInteraction=Date.now(),sessionShown=false;
 let lastSourceId='',didBind=false;
 const $=id=>document.getElementById(id);
 const opts=()=>personalization.get();
 const on=()=>{const p=opts();return p.enabled===true&&p.rediscovery_enabled===true};
 const rare=()=>opts().rediscovery_frequency==='rare';
 const interval=()=>Math.round((rare()?35:16 + Math.random()*(rare()?35:22))*60000);
 const elapsed=(value)=>value?Date.now()-new Date(value).getTime():Infinity;
 const safe=()=>document.visibilityState==='visible' && !document.hidden &&
   ['feed','photos','profile'].includes(state.view) &&
   Date.now()-lastInteraction < 5*60000 &&
   !$('applePhotoViewer')?.hidden===false; // overwritten below by clearer predicate
 function allowedMoment(){
  if(document.hidden||!['feed','photos','profile'].includes(state.view))return false;
  if(Date.now()-lastInteraction>5*60000)return false;
  if($('applePhotoViewer')?.hidden===false)return false;
  if($('personalizationOverlay')?.hidden===false)return false;
  const focused=document.activeElement;
  if(focused?.matches?.('input,textarea,select,[contenteditable="true"]'))return false;
  return true;
 }
 function schedule(){
  if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null}
  if(!active||!on()||sessionShown)return;
  pendingTimer=setTimeout(async()=>{
   pendingTimer=null;
   if(!active||!on()||sessionShown)return;
   if(allowedMoment())await offer();
   schedule();
  },interval());
 }
 function destroyCard(){
  if(card){card.remove();card=null}
  lastSourceId='';
 }
 function refresh(){
  if(!on()){
   destroyCard();if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null}
   return;
  }
  if(active)schedule();
 }
 async function recordView(asset){
  if(!on()||asset?.kind!=='photo')return;
  // This RPC atomically records only intentional enlarged photo views,
  // and checks the user's current opt-in at the database layer.
  try{
   const {error}=await client.rpc('corp_record_photo_rediscovery_view',{p_asset_id:asset.id});
   if(error)console.warn('Rediscovery view was not recorded:',error.message);
  }catch(error){console.warn('Rediscovery view failed:',error?.message)}
 }
 function possibleSource(){
  return (state.assets||[]).filter(a=>a.kind==='photo'&&a.purpose==='library'&&mediaUrl(a));
 }
 function same(x,y){
  return String(x||'').trim().toLowerCase()===String(y||'').trim().toLowerCase();
 }
 function known(x){
  const val=String(x||'').toLowerCase().trim();
  return val&&!['unspecified','unsorted','unknown','other','general','all','none'].includes(val);
 }
 function words(a){
  return new Set([a.caption||'',a.filename||'',...(a.military_tags||[])]
   .join(' ').toLowerCase().replace(/[_-]/g,' ')
   .split(/[^a-z0-9]+/).filter(w=>w.length>=4 &&
    !['photo','image','jpeg','heic','jpg','military','uploaded','original','gallery','blackcell','file','taken'].includes(w)));
 }
 function findSimilar(seed){
  const base=words(seed);
  const rank=a=>{
   let score=0;
   if(known(seed.military_category)&&same(seed.military_category,a.military_category))score+=7;
   if(known(seed.military_branch)&&same(seed.military_branch,a.military_branch))score+=5;
   if(known(seed.military_era)&&same(seed.military_era,a.military_era))score+=4;
   if(known(seed.military_country_code)&&same(seed.military_country_code,a.military_country_code))score+=2;
   const overlap=[...words(a)].filter(w=>base.has(w)).length;
   return score+Math.min(overlap,5);
  };
  return possibleSource().filter(a=>a.id!==seed.id)
   .map(a=>({a,score:rank(a)})).filter(x=>x.score>=2)
   .sort((x,y)=>y.score-x.score||Date.parse(y.a.created_at||0)-Date.parse(x.a.created_at||0))
   .slice(0,4).map(x=>x.a);
 }
 async function suppress(assetId){
  const uid=state.user?.id;
  if(!uid)return;
  const {data,error}=await client.from('corp_social_photo_rediscovery')
    .update({not_interested:true}).eq('user_id',uid).eq('asset_id',assetId)
    .select('asset_id');
  if(error||!data?.length){toast('Could not update this suggestion. Please try again.');return}
  destroyCard();
  toast("Won't suggest this photo again.");
 }
 function el(tag,cl,text){
  const node=document.createElement(tag);if(cl)node.className=cl;
  if(text!==undefined)node.textContent=String(text);
  return node;
 }
 function button(text,action,cls=''){
  const b=el('button',cls,text);b.type='button';b.addEventListener('click',action);return b;
 }
 function showSeed(seed,preview=false){
  if(!on()||!seed||!mediaUrl(seed))return;
  destroyCard();
  lastSourceId=seed.id;
  const wrap=el('aside','bc-rediscovery-card');
  wrap.setAttribute('aria-label','Suggested photograph from your personal history');
  wrap.setAttribute('role','complementary');
  const head=el('div','bc-rediscovery-head');
  const intro=el('div');
  intro.append(el('small','',preview?'PREVIEW · PHOTO REDISCOVERY':'FROM YOUR PHOTO HISTORY'));
  intro.append(el('strong','',preview?'TEST YOUR REDISCOVERY CARD':'REVISIT A PHOTO'));
  head.append(intro,button('✕',destroyCard,'bc-rediscovery-close'));
  const fig=el('div','bc-rediscovery-image');
  const img=el('img');
  img.src=mediaUrl(seed);img.alt=seed.caption||seed.filename||'Military photograph you explored';
  img.loading='lazy';fig.append(img);
  const desc=el('p','', 'You opened this photo before. Want another look, or see related photographs?');
  const label=el('div','bc-rediscovery-photo-title',
   (seed.caption||seed.filename||'Military photo').slice(0,115));
  const actions=el('div','bc-rediscovery-actions');
  actions.append(button('OPEN PHOTO · VOTE',()=>{
   destroyCard();void openPhoto(seed);
  },'primary'));
  actions.append(button('MORE LIKE THIS',()=>{
   const matches=findSimilar(seed);
   const list=wrap.querySelector('.bc-rediscovery-related');
   if(list){list.remove();return}
   const related=el('div','bc-rediscovery-related');
   related.append(el('small','',matches.length?'SIMILAR SUBJECT · BRANCH · ERA':'NO MATCHING PHOTOS YET'));
   if(!matches.length){
    related.append(el('p','','Related results will appear as your military archive grows and photos receive subject tags.'));
   }
   for(const found of matches){
    const item=button('',()=>{destroyCard();void openPhoto(found)},'bc-rediscovery-related-photo');
    const image=el('img');image.src=mediaUrl(found);
    image.alt=found.caption||found.filename||'Related military photograph';image.loading='lazy';
    item.append(image,el('span','',(found.caption||found.filename||'Military photograph').slice(0,45)));
    related.append(item);
   }
   actions.insertAdjacentElement('afterend',related);
  }));
  const foot=el('div','bc-rediscovery-foot');
  foot.append(button('NOT INTERESTED',()=>{void suppress(seed.id)}));
  foot.append(button('DISMISS',destroyCard));
  wrap.append(head,fig,label,desc,actions,foot);
  document.body.append(wrap);card=wrap;
 }
 async function offer({preview=false}={}){
  if(!on()||!state.user?.id||(sessionShown&&!preview))return;
  if(!preview&&!allowedMoment())return;
  const {data,error}=await client.from('corp_social_photo_rediscovery')
    .select('asset_id,view_count,last_viewed_at,last_suggested_at,not_interested')
    .eq('user_id',state.user.id).eq('not_interested',false)
    .gte('view_count',preview?1:2).order('view_count',{ascending:false}).limit(130);
  if(error){console.warn('Rediscovery suggestions unavailable:',error.message);return}
  const candidates=(data||[]).filter(r=>
   possibleSource().some(a=>a.id===r.asset_id) &&
   (preview||elapsed(r.last_viewed_at)>3*60000));
  if(!candidates.length){
   if(preview)toast('Open a Military Library photo after enabling Rediscovery, then try Preview again.');
   return;
  }
  const cooldown=rare()?7*86400000:24*3600000;
  if(!preview){
   const newest=Math.min(...(data||[]).map(r=>elapsed(r.last_suggested_at)));
   if(newest<cooldown)return;
  }
  const eligible=candidates.filter(c=>preview||elapsed(c.last_suggested_at)>cooldown);
  if(!eligible.length)return;
  // Weighted random choice from explicit revisits; higher view count only
  // increases eligibility modestly. Nothing here is a vote.
  const sorted=eligible.sort((a,b)=>b.view_count-a.view_count).slice(0,12);
  const choice=sorted[Math.floor(Math.pow(Math.random(),1.5)*sorted.length)];
  const seed=possibleSource().find(a=>a.id===choice.asset_id);
  if(!seed)return;
  if(!preview){
   const {data:marked,error:markError}=await client.from('corp_social_photo_rediscovery')
    .update({last_suggested_at:new Date().toISOString()})
    .eq('user_id',state.user.id).eq('asset_id',seed.id).select('asset_id');
   if(markError||!marked?.length)return;
   sessionShown=true;
  }
  showSeed(seed,preview);
 }
 function start(){
  if(active)return;active=true;
  if(!didBind){
   const touch=()=>{lastInteraction=Date.now()};
   document.addEventListener('pointerdown',touch,{passive:true});
   document.addEventListener('keydown',touch,{passive:true});
   document.addEventListener('visibilitychange',()=>{
    if(document.hidden)destroyCard();
   });
   $('rediscoveryPreview')?.addEventListener('click',()=>void offer({preview:true}));
   didBind=true;
  }
  schedule();
 }
 function stop(){
  active=false;destroyCard();
  if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null}
 }
 return {start,stop,refresh,recordView,preview:()=>offer({preview:true}),findSimilar};
}
