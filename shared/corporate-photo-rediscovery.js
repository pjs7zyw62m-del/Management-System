/* BLACKCELL / PHOTO REDISCOVERY
 * Private, user-controlled suggestions. Never assumes a view or revisit is a vote.
 * No push notifications, dark patterns, background tracking while tab is closed,
 * biometric/sensitive inferences or paid AI requests. */
export function createPhotoRediscovery({client,state,personalization,mediaUrl,openPhoto,toast}){
 let pendingTimer=null,active=false,card=null,lastInteraction=Date.now(),sessionShown=false;
 let testTurn=0,lastTestPhotoId=null;
 let lastSourceId='',didBind=false,feedbackBusy=false,mode='rediscovery',lastFocus=null;
 let sessionSeen=new Set();
 let dwellTimer=null,dwellSequence=0,cardZoomCleanup=null;
 const $=id=>document.getElementById(id);
 const opts=()=>personalization.get();
 const owner=()=>state.member?.role==='owner'&&Number(state.member?.clearance_level)===7;
 let paused=false;
 const pauseKey=()=> 'bc-photo-suggestions-paused:'+String(state.user?.id||'');
 const consent=()=>{const p=opts();return p.enabled===true&&p.rediscovery_enabled===true};
 const on=()=>!paused&&(owner()||consent());
 const suggestedThisVisit=new Set();
 function updatePauseButton(){
  const b=$('bcPhotoSuggestionsPause');
  if(!b)return;
  b.hidden=!owner()&&!consent();
  b.textContent=paused?'▶ RESUME PHOTO SUGGESTIONS':'Ⅱ PAUSE PHOTO SUGGESTIONS';
  b.setAttribute('aria-pressed',String(paused));
 }
 function togglePaused(){
  paused=!paused;
  try{localStorage.setItem(pauseKey(),paused?'1':'0')}catch(_){}
  if(paused){stopViewing();closeCard();if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null}}
  updatePauseButton();refresh();
  toast(paused?'Automatic photo suggestions paused.':'Automatic photo suggestions resumed.');
 }
 const rare=()=>opts().rediscovery_frequency==='rare';
 // TEMPORARY TESTING ONLY: the Level 7 owner sees a card every 30 seconds
 // while actively browsing, with no annual/day cooldown. Employees keep their
 // opted-in standard Rare/Occasional cadence.
 const testMode=()=>on()&&state.member?.role==='owner'&&Number(state.member?.clearance_level)===7;
 const interval=()=>testMode()?30000:Math.round(((rare()?35:16)+Math.random()*(rare()?35:22))*60000);
 const elapsed=(value)=>value?Date.now()-new Date(value).getTime():Infinity;
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
  if(!active||!on()||(!testMode()&&sessionShown))return;
  pendingTimer=setTimeout(async()=>{
   pendingTimer=null;
   if(!active||!on()||(!testMode()&&sessionShown))return;
   // Do not open a new card over an existing card, photo viewer,
   // settings dialog, or while the member is away from Blackcell.
   if(!card&&allowedMoment()){
    if(testMode()){
     const requestedMode=testTurn%2===0?'rediscovery':'trigger';
     const shown=await offer({preview:true,test:true,requestedMode});
     if(shown)testTurn++;
    }else await offer();
   }
   schedule();
  },interval());
 }
 function destroyCard(){
  if(cardZoomCleanup){cardZoomCleanup();cardZoomCleanup=null}
  if(card){card.remove();card=null}
  lastSourceId='';
 }
 function refresh(){
  updatePauseButton();
  if(!on()){
   closeCard();if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null}
   return;
  }
  if(active)schedule();
 }
 async function recordView(asset){
  if(!on()||!consent()||asset?.kind!=='photo')return;
  // This RPC atomically records only intentional enlarged photo views,
  // and checks the user's current opt-in at the database layer.
  try{
   const {error}=await client.rpc('corp_record_photo_rediscovery_view',{p_asset_id:asset.id});
   if(error)console.warn('Rediscovery view was not recorded:',error.message);
  }catch(error){console.warn('Rediscovery view failed:',error?.message)}
 }

 /* Count time only while the member is actually looking at the enlarged image.
  * A 15-second view is an interest clue, NOT a like, vote or rating.
  * Pausing, changing photos and leaving the tab all prevent accidental counts. */
 function stopViewing(){
  dwellSequence++;
  if(dwellTimer!==null){clearInterval(dwellTimer);dwellTimer=null}
 }
 function startViewing(asset){
  stopViewing();
  if(!on()||!consent()||asset?.kind!=='photo'||!asset.id)return;
  const sequence=dwellSequence,assetId=asset.id;
  let activeTime=0,lastTick=performance.now();
  dwellTimer=setInterval(()=>{
   if(sequence!==dwellSequence)return;
   const now=performance.now();
   const delta=Math.max(0,Math.min(now-lastTick,900));
   lastTick=now;
   const viewer=$('applePhotoViewer');
   const blocked=['militaryAssetOverlay','aiPhotoOverlay','tasteOverlay','predOverlayLayer','personalizationOverlay']
     .some(id=>$(id)?.hidden===false);
   if(document.hidden||!document.hasFocus()||viewer?.hidden!==false||blocked)return;
   activeTime+=delta;
   if(activeTime>=15000){
    stopViewing();
    void client.rpc('corp_record_photo_rediscovery_engagement',{p_asset_id:assetId})
      .then(({data,error})=>{
       if(error)console.warn('15-second photo signal could not be recorded:',error.message);
       else if(data===true)console.info('Photo rediscovery: long-view interest signal recorded.');
      }).catch(error=>console.warn('Photo engagement request failed:',error?.message));
   }
  },500);
 }

 async function recordZoomHold(asset){
  if(!on()||asset?.kind!=='photo'||!asset.id)return false;
  try{
   const {data,error}=await client.rpc('corp_record_photo_zoom_engagement',{p_asset_id:asset.id});
   if(error){console.warn('Private zoom interest was not saved:',error.message);return false}
   return data===true;
  }catch(error){console.warn('Zoom engagement unavailable:',error?.message);return false}
 }
 function possibleSource(){
  return (state.assets||[]).filter(a=>a.kind==='photo'&&a.purpose==='library'&&a.review_status==='approved'&&!a.adult_restricted&&mediaUrl(a));
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

 function el(tag,cls='',content=null){
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(content!==null)e.textContent=String(content);
  return e;
 }
 function button(label,handler,cls=''){
  const e=el('button',cls,label);e.type='button';e.addEventListener('click',handler);return e;
 }
 function closeCard(){
  if(cardZoomCleanup){cardZoomCleanup();cardZoomCleanup=null}
  if(card){card.remove();card=null}
  lastSourceId='';
  const old=lastFocus;lastFocus=null;sessionSeen.clear();mode='rediscovery';
  if(old?.isConnected)old.focus({preventScroll:true});
 }
 function destroyCard(){
  // Card transitions must also stop the old zoom-hold observer.
  if(cardZoomCleanup){cardZoomCleanup();cardZoomCleanup=null}
  if(card){card.remove();card=null}
  lastSourceId='';
 }
 // Recheck the authenticated member's actual vote records on each card.
 // Liked and "More Like This" source photos are kept as recommendation
 // seeds, but never shown again as Rediscovery suggestions.
 async function readDecisionState(){
  const uid=state.user?.id;
  if(!uid)return null;
  const [votes,history]=await Promise.all([
   client.from('corp_social_photo_votes')
    .select('asset_id').eq('user_id',uid).limit(10000),
   client.from('corp_social_photo_rediscovery')
    .select('asset_id,view_count,engaged_views,zoom_engaged_views,last_viewed_at,last_suggested_at,last_feedback_at,not_interested,rediscovery_feedback')
    .eq('user_id',uid).order('view_count',{ascending:false}).limit(10000)
  ]);
  if(votes.error||history.error){
   console.warn('Photo preference/vote exclusions unavailable',
    votes.error?.message||history.error?.message);
   return null; // Never display a possibly-voted photo when checks fail.
  }
  const voted=new Set((votes.data||[]).map(row=>row.asset_id));
  const historyRows=history.data||[];
  const decided=new Set(historyRows.filter(row=>
   row.not_interested===true||['like','more','dislike'].includes(row.rediscovery_feedback)
  ).map(row=>row.asset_id));
  return {voted,history:historyRows,
   suppressed:new Set([...voted,...decided])};
 }
 async function isNotVotedNow(id){
  const {data,error}=await client.from('corp_social_photo_votes')
   .select('asset_id').eq('user_id',state.user.id).eq('asset_id',id).limit(1);
  if(error){console.warn('Could not verify current photo vote',error.message);return false}
  return !data?.length;
 }

 function chooseNext(seed,choice='more',suppressed=new Set()){
  const all=possibleSource().filter(a=>!sessionSeen.has(a.id)&&a.id!==seed.id&&!suppressed.has(a.id));
  if(!all.length)return null;
  const related=findSimilar(seed).filter(a=>!sessionSeen.has(a.id)&&!suppressed.has(a.id));
  if(choice!=='dislike'&&related.length)return related[Math.floor(Math.random()*Math.min(4,related.length))];
  const category=x=>[x.military_category,x.military_branch,x.military_era].filter(known).join(':');
  const alternatives=choice==='dislike'?all.filter(a=>category(a)!==category(seed)):all;
  const source=alternatives.length?alternatives:all;
  return source[Math.floor(Math.random()*source.length)];
 }
 async function storeFeedback(seed,feedback){
  if(!on()||!seed?.id||!state.user?.id)return false;
  const uid=state.user.id;
  const fields={rediscovery_feedback:feedback,not_interested:feedback==='dislike',last_feedback_at:new Date().toISOString()};
  try{
   const {data:updated,error}=await client.from('corp_social_photo_rediscovery')
    .update(fields).eq('user_id',uid).eq('asset_id',seed.id).select('asset_id');
   if(error)throw error;
   if(!updated?.length){
    const {error:insertError}=await client.from('corp_social_photo_rediscovery')
     .insert({user_id:uid,asset_id:seed.id,view_count:0,...fields});
    if(insertError)throw insertError;
   }
   if(typeof personalization.load==='function'){
    void personalization.load().catch(e=>console.warn('Private recommendation refresh:',e));
   }
   return true;
  }catch(e){
   toast('Could not save your choice: '+(e?.message||'Connection error'));
   return false;
  }
 }
 async function respond(seed,feedback,{trigger=false}={}){
  if(feedbackBusy)return;
  feedbackBusy=true;
  if(card)card.classList.add('bc-rediscovery-busy');
  try{
   if(!await storeFeedback(seed,feedback))return;
   const decisions=await readDecisionState();
   if(!decisions){toast('Could not check which photos you already voted for. Try again.');return}
   const next=chooseNext(seed,feedback,decisions.suppressed);
   // A Like means "show me what else might interest me"—not another
   // rediscovery of the same image and never a competition vote.
   if(trigger||feedback==='like'||feedback==='more'){
    destroyCard();
    if(!next){closeCard();toast('Your choice is saved. Add more classified photographs to discover similar images.');return}
    showSeed(next,'trigger');
    return;
   }
   if(!next){closeCard();toast('All available photos reviewed. Your choices were saved.');return}
   showSeed(next,mode);
  }finally{
   feedbackBusy=false;
   if(card)card.classList.remove('bc-rediscovery-busy');
  }
 }

 /* Full-size viewer parity: wheel and double-click zoom into the pixel
    under the mouse; touch pinch zooms at finger midpoint. Default 100%
    always shows the ENTIRE original, with object-fit:contain.
    These are local CSS transforms; no media is downloaded or modified. */
 function attachCardZoom(viewport,image,seed){
  const points=new Map();
  let scale=1,tx=0,ty=0,pinchStart=0,pinchBase=1;
  let lastTick=performance.now(),activeZoomMs=0,holdTimer=null;
  let tracked=false,holdRecorded=false,disposed=false;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  function render(){
   if(disposed)return;
   tx=clamp(tx,-Math.max(0,image.clientWidth*(scale-1)/2),
                   Math.max(0,image.clientWidth*(scale-1)/2));
   ty=clamp(ty,-Math.max(0,image.clientHeight*(scale-1)/2),
                   Math.max(0,image.clientHeight*(scale-1)/2));
   image.style.transform='translate3d('+tx.toFixed(2)+'px,'+ty.toFixed(2)+'px,0) scale('+scale.toFixed(3)+')';
   viewport.classList.toggle('bc-card-zoomed',scale>1.02);
  }
  function zoomTo(next,x,y){
   if(disposed)return;
   next=clamp(Math.round(next*100)/100,1,5);
   if(next===scale)return;
   const old=scale;
   if(next===1){scale=1;tx=0;ty=0;activeZoomMs=0}
   else {
    const box=image.getBoundingClientRect();
    const cx=box.left+box.width/2,cy=box.top+box.height/2;
    // Clamp the zoom focus to the visibly contained photo rather than
    // surrounding black letterboxing on portrait/landscape images.
    const iw=image.naturalWidth||image.clientWidth||1;
    const ih=image.naturalHeight||image.clientHeight||1;
    const fitted=Math.min(image.clientWidth/iw,image.clientHeight/ih);
    const shownW=iw*fitted*old,shownH=ih*fitted*old;
    const ax=clamp(x,cx-shownW/2,cx+shownW/2);
    const ay=clamp(y,cy-shownH/2,cy+shownH/2);
    const ratio=next/old;
    tx+=(ax-cx)*(1-ratio);
    ty+=(ay-cy)*(1-ratio);
    scale=next;
   }
   if(scale>=1.3&&!tracked){
    tracked=true;
    void recordView(seed);
   }
   lastTick=performance.now();
   render();
  }
  function wheel(e){
   if(disposed||e.deltaY===0)return;
   e.preventDefault();
   zoomTo(scale+(e.deltaY<0?.25:-.25),e.clientX,e.clientY);
  }
  function dblclick(e){
   e.preventDefault();
   zoomTo(scale>=1.8?1:2,e.clientX,e.clientY);
  }
  const distance=()=>{
   const p=[...points.values()];
   return p.length<2?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
  };
  function down(e){
   if(e.pointerType==='mouse'&&e.button!==0)return;
   points.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(points.size>=2){pinchStart=distance();pinchBase=scale}
   if(scale>1.02||points.size>=2){
    try{viewport.setPointerCapture(e.pointerId)}catch(_){}
   }
  }
  function move(e){
   const previous=points.get(e.pointerId);
   if(!previous)return;
   points.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(points.size>=2){
    const d=distance();
    if(!pinchStart){pinchStart=d;pinchBase=scale}
    if(d>0&&pinchStart){
     const p=[...points.values()];
     zoomTo(pinchBase*d/pinchStart,
       (p[0].x+p[1].x)/2,(p[0].y+p[1].y)/2);
    }
   }else if(scale>1.02){
    tx+=e.clientX-previous.x;ty+=e.clientY-previous.y;
    render();
   }
  }
  function up(e){
   points.delete(e.pointerId);
   if(points.size<2){pinchStart=0;pinchBase=scale}
  }
  function tick(){
   if(disposed)return;
   const now=performance.now();
   const delta=Math.max(0,Math.min(750,now-lastTick));lastTick=now;
   if(scale<1.3){activeZoomMs=0;return}
   if(document.hidden||!document.hasFocus()||card?.contains(viewport)!==true)return;
   activeZoomMs+=delta;
   if(activeZoomMs>=4000&&!holdRecorded){
    holdRecorded=true;
    void recordZoomHold(seed).then(saved=>{
     if(saved&&typeof personalization.load==='function')void personalization.load();
    });
   }
  }
  viewport.addEventListener('wheel',wheel,{passive:false});
  viewport.addEventListener('dblclick',dblclick);
  viewport.addEventListener('pointerdown',down);
  viewport.addEventListener('pointermove',move);
  viewport.addEventListener('pointerup',up);
  viewport.addEventListener('pointercancel',up);
  holdTimer=setInterval(tick,250);
  return ()=>{
   disposed=true;
   if(holdTimer!==null)clearInterval(holdTimer);
   viewport.removeEventListener('wheel',wheel);
   viewport.removeEventListener('dblclick',dblclick);
   viewport.removeEventListener('pointerdown',down);
   viewport.removeEventListener('pointermove',move);
   viewport.removeEventListener('pointerup',up);
   viewport.removeEventListener('pointercancel',up);
   points.clear();
   image.style.transform='';
  };
 }

 function showSeed(seed,nextMode='rediscovery'){
  if(!on()||!seed?.id||!mediaUrl(seed))return;
  if(!lastFocus)lastFocus=document.activeElement;
  destroyCard();
  mode=nextMode==='trigger'?'trigger':'rediscovery';
  lastSourceId=seed.id;
  sessionSeen.add(seed.id);
  const overlay=el('div','bc-rediscovery-overlay');
  overlay.setAttribute('role','presentation');
  const panel=el('section','bc-rediscovery-panel');
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label',mode==='trigger'?'Your personal Trigger Card':'Photo Rediscovery');
  const head=el('header','bc-rediscovery-head');
  const label=el('strong','bc-rediscovery-title',mode==='trigger'?'TRIGGER CARD':'PHOTO REDISCOVERY');
  const close=button('✕',closeCard,'bc-rediscovery-close');
  const pause=button('Ⅱ PAUSE',togglePaused,'bc-view-full-thumb');
  pause.style.cssText='position:static;margin-left:auto;padding:6px 10px;font-size:11px;background:#171217;color:#fff;border:1px solid #785463;border-radius:8px';
  close.setAttribute('aria-label','Close photo suggestions');
  head.append(label,pause,close);
  const imageBox=el('div','bc-rediscovery-large-photo');
  const image=el('img');
  image.src=mediaUrl(seed);
  image.alt=seed.caption||seed.filename||'Military Library photograph';
  image.draggable=false;image.loading='eager';
  imageBox.append(image);
  const actions=el('div','bc-rediscovery-choice-row');
  const like=button('♡  LIKE',()=>void respond(seed,'like'),'bc-rediscovery-like');
  const dislike=button('✕  DON’T LIKE',()=>void respond(seed,'dislike'),'bc-rediscovery-dislike');
  actions.append(like,dislike);
  const more=button('MORE LIKE THIS',()=>void respond(seed,'more',{trigger:true}),'bc-rediscovery-more');
  more.setAttribute('aria-label','Find similar military photos without voting');
  const foot=el('footer','bc-rediscovery-footer');
  foot.append(actions,more);
  panel.append(head,imageBox,foot);
  overlay.append(panel);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeCard()});
  document.body.append(overlay);
  card=overlay;
  cardZoomCleanup=attachCardZoom(imageBox,image,seed);
  close.focus({preventScroll:true});
 }

async function offer({preview=false,test=false,requestedMode='rediscovery'}={}){
  if(!on()||!state.user?.id||card||(sessionShown&&!preview&&!test))return false;
  if((!preview||test)&&!allowedMoment())return false;
  const decisions=await readDecisionState();
  if(!decisions)return false;
  if(card)return false;
  const {voted,history,suppressed}=decisions;
  const photos=possibleSource();
  const assetsById=new Map(photos.map(asset=>[asset.id,asset]));
  const score=row=>
   Math.min(5,Number(row.zoom_engaged_views||0))*7+
   Math.min(5,Number(row.engaged_views||0))*5+
   Math.min(10,Number(row.view_count||0));
  const accepted=row=>['like','more'].includes(row.rediscovery_feedback);
  const candidates=history.filter(row=>
   !suppressed.has(row.asset_id)&&row.not_interested!==true&&
   assetsById.has(row.asset_id)&&
   (Number(row.zoom_engaged_views||0)>0||Number(row.engaged_views||0)>0||
    Number(row.view_count||0)>=(preview?1:2))&&
   (preview||elapsed(row.last_viewed_at)>3*60000));
  const cooldown=rare()?7*86400000:24*3600000;
  const newest=Math.min(...candidates.map(row=>elapsed(row.last_suggested_at)));
  const eligible=candidates.filter(row=>preview||test||elapsed(row.last_suggested_at)>cooldown);
  const ranked=eligible.sort((x,y)=>score(y)-score(x)).slice(0,12);
  const unrepeat=test&&ranked.length>1?
   ranked.filter(row=>row.asset_id!==lastTestPhotoId):ranked;
  const choice=unrepeat.length?unrepeat[Math.floor(Math.pow(Math.random(),1.5)*unrepeat.length)]:null;
  const rediscovery=choice?assetsById.get(choice.asset_id):null;

  // Explicit likes and real votes are strong *source* signals for Trigger
  // Cards. We never redisplay those source photos as cards.
  const sourceIds=[
   ...history.filter(accepted).sort((x,y)=>
    Date.parse(y.last_feedback_at||y.last_viewed_at||0)-
    Date.parse(x.last_feedback_at||x.last_viewed_at||0)).map(row=>row.asset_id),
   ...voted,
   ...history.filter(row=>row.not_interested!==true&&
    (row.zoom_engaged_views>0||row.engaged_views>0))
    .sort((x,y)=>score(y)-score(x)).map(row=>row.asset_id)
  ];
  const sourceSeen=new Set();
  const recommendations=[];
  for(const id of sourceIds){
   if(sourceSeen.has(id))continue;
   sourceSeen.add(id);
   const source=assetsById.get(id);
   if(!source)continue;
   for(const suggested of findSimilar(source)){
    if(suppressed.has(suggested.id)||!assetsById.has(suggested.id))continue;
    if(!recommendations.some(item=>item.id===suggested.id))recommendations.push(suggested);
   }
   if(recommendations.length>=12)break;
  }
  const freshSuggestions=recommendations.filter(a=>a.id!==lastTestPhotoId);
  const related=freshSuggestions.length?freshSuggestions:recommendations;
  // Prefer Trigger Cards after the member has liked/voted for photos.
  // An admin's temporary 30s testing still alternates when possible.
  const wantTrigger=requestedMode==='trigger'||
    (!rediscovery&&related.length>0)||
    (!preview&&!test&&related.length>0&&Math.random()<.4);

  let proposed=null,selectedMode='rediscovery';
  if(wantTrigger&&related.length){
   proposed=related[Math.floor(Math.random()*Math.min(related.length,5))];
   selectedMode='trigger';
  }else if(requestedMode==='trigger'&&preview&&!test){
   // Explicit Trigger Preview must not silently show a Rediscovery Card.
   return false;
  }else if(rediscovery&&(preview||test||newest>=cooldown)){
   proposed=rediscovery;
  }else if(!rediscovery&&related.length){
   proposed=related[0];selectedMode='trigger';
  }
  if(!proposed&&owner()&&!preview||!proposed&&owner()&&test){
   const fresh=photos.filter(a=>!suppressed.has(a.id)&&!suggestedThisVisit.has(a.id));
   if(fresh.length){proposed=fresh[Math.floor(Math.random()*fresh.length)];selectedMode='trigger'}
  }
  if(!proposed){
   if(preview&&!test)toast('No unreviewed photos are ready. Explore more photographs or select Trigger Preview.');
   return false;
  }
  // Exact targeted query prevents races and protects members with more
  // historical votes than the initial snapshot's result limit.
  if(!await isNotVotedNow(proposed.id))return false;
  if(card||!on())return false;
  if(!preview&&!test&&selectedMode==='rediscovery'){
   const {data:marked,error:markError}=await client.from('corp_social_photo_rediscovery')
    .update({last_suggested_at:new Date().toISOString()})
    .eq('user_id',state.user.id).eq('asset_id',proposed.id).select('asset_id');
   if(markError||!marked?.length)return false;
  }
  if(!preview&&!test)sessionShown=true;
  if(test)lastTestPhotoId=proposed.id;
  sessionSeen.clear();
  if(!on())return false;
  suggestedThisVisit.add(proposed.id);
  showSeed(proposed,selectedMode);
  return true;
 }
 function start(){
  if(active)return;active=true;
  try{paused=localStorage.getItem(pauseKey())==='1'}catch(_){paused=false}
  updatePauseButton();
  if(!didBind){
   const touch=()=>{lastInteraction=Date.now()};
   document.addEventListener('pointerdown',touch,{passive:true});
   document.addEventListener('keydown',touch,{passive:true});
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&card)closeCard()});
   document.addEventListener('visibilitychange',()=>{
    if(document.hidden)closeCard();
   });
   $('rediscoveryPreview')?.addEventListener('click',()=>{
    if(!on()){toast('Enable and save Photo Rediscovery first.');return}
    if($('personalizationOverlay'))$('personalizationOverlay').hidden=true;
    void offer({preview:true});
   });
   $('triggerPreview')?.addEventListener('click',async()=>{
    if(!on()){toast('Enable and save Photo Rediscovery first.');return}
    if($('personalizationOverlay'))$('personalizationOverlay').hidden=true;
    const shown=await offer({preview:true,requestedMode:'trigger'});
    if(!shown)toast('No new related photographs are available yet. Explore more classified photos to help Trigger Cards find matches.');
   });
   $('bcPhotoSuggestionsPause')?.addEventListener('click',togglePaused);
   didBind=true;
  }
  schedule();
 }
 function stop(){
  active=false;stopViewing();closeCard();
  if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null}
 }
 return {start,stop,refresh,recordView,startViewing,stopViewing,recordZoomHold,
  preview:()=>offer({preview:true}),findSimilar,imageUrl:mediaUrl};
}
