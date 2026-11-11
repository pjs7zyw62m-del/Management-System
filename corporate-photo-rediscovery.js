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
 const on=()=>{const p=opts();return p.enabled===true&&p.rediscovery_enabled===true};
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
  if(!on()){
   closeCard();if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null}
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

 /* Count time only while the member is actually looking at the enlarged image.
  * A 15-second view is an interest clue, NOT a like, vote or rating.
  * Pausing, changing photos and leaving the tab all prevent accidental counts. */
 function stopViewing(){
  dwellSequence++;
  if(dwellTimer!==null){clearInterval(dwellTimer);dwellTimer=null}
 }
 function startViewing(asset){
  stopViewing();
  if(!on()||asset?.kind!=='photo'||!asset.id)return;
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
  if(card){card.remove();card=null}
  lastSourceId='';
 }
 function chooseNext(seed,choice='more'){
  const all=possibleSource().filter(a=>!sessionSeen.has(a.id)&&a.id!==seed.id);
  if(!all.length)return null;
  const related=findSimilar(seed).filter(a=>!sessionSeen.has(a.id));
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
   const next=chooseNext(seed,feedback);
   if(trigger){
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
  close.setAttribute('aria-label','Close photo suggestions');
  head.append(label,close);
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
  const {data,error}=await client.from('corp_social_photo_rediscovery')
    .select('asset_id,view_count,engaged_views,zoom_engaged_views,last_viewed_at,last_suggested_at,not_interested')
    .eq('user_id',state.user.id).eq('not_interested',false)
    .order('engaged_views',{ascending:false}).order('view_count',{ascending:false}).limit(130);
  if(error){console.warn('Rediscovery suggestions unavailable:',error.message);return false}
  const candidates=(data||[]).filter(r=>
   (Number(r.zoom_engaged_views||0)>0||Number(r.engaged_views||0)>0||Number(r.view_count||0)>=(preview?1:2)) &&
   possibleSource().some(a=>a.id===r.asset_id) &&
   (preview||elapsed(r.last_viewed_at)>3*60000));
  if(!candidates.length){
   if(preview&&!test)toast('Open a Military Library photo after enabling Rediscovery, then try Preview again.');
   return false;
  }
  const cooldown=rare()?7*86400000:24*3600000;
  if(!preview&&!test){
   const newest=Math.min(...(data||[]).map(r=>elapsed(r.last_suggested_at)));
   if(newest<cooldown)return false;
  }
  const eligible=candidates.filter(c=>preview||test||elapsed(c.last_suggested_at)>cooldown);
  if(!eligible.length)return false;
  // Longer looks outweigh repeated openings; neither is a confirmed like or vote.
  const strength=row=>Math.min(5,Number(row.zoom_engaged_views||0))*7+Math.min(5,Number(row.engaged_views||0))*5+Math.min(10,Number(row.view_count||0));
  const sorted=eligible.sort((a,b)=>strength(b)-strength(a)).slice(0,12);
  const pool=test&&sorted.length>1?sorted.filter(x=>x.asset_id!==lastTestPhotoId):sorted;
  const choice=pool[Math.floor(Math.pow(Math.random(),1.5)*pool.length)];
  const seed=possibleSource().find(a=>a.id===choice.asset_id);
  if(!seed)return false;
  if(!preview&&!test){
   const {data:marked,error:markError}=await client.from('corp_social_photo_rediscovery')
    .update({last_suggested_at:new Date().toISOString()})
    .eq('user_id',state.user.id).eq('asset_id',seed.id).select('asset_id');
   if(markError||!marked?.length)return;
   sessionShown=true;
  }
  const qualified=Number(choice.zoom_engaged_views||0)>0||Number(choice.engaged_views||0)>0;
  const related=findSimilar(seed).filter(a=>a.id!==lastTestPhotoId);
  const wantTrigger=(test&&requestedMode==='trigger')||(!preview&&!test&&qualified&&Math.random()<.4);
  // Only label it a Trigger Card when actual military metadata gives a match.
  // Otherwise fall back to Rediscovery rather than claiming false similarity.
  const suggested=wantTrigger&&related.length?related[0]:seed;
  const selectedMode=wantTrigger&&related.length?'trigger':'rediscovery';
  if(test)lastTestPhotoId=suggested.id;
  sessionSeen.clear();
  showSeed(suggested,selectedMode);
  return true;
 }
 function start(){
  if(active)return;active=true;
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
    const candidates=possibleSource();
    if(!candidates.length){toast('Upload photos to the Military Library to preview Trigger Cards.');return}
    const {data}=await client.from('corp_social_photo_rediscovery')
      .select('asset_id,view_count,engaged_views,zoom_engaged_views,rediscovery_feedback')
      .eq('user_id',state.user.id).eq('not_interested',false)
      .order('view_count',{ascending:false}).limit(100);
    const score=x=>Number(x.zoom_engaged_views||0)*8+Number(x.engaged_views||0)*5+
      Number(x.view_count||0)+(x.rediscovery_feedback==='like'?20:0)+(x.rediscovery_feedback==='more'?15:0);
    const rows=(data||[]).sort((a,b)=>score(b)-score(a));
    const source=rows.map(r=>candidates.find(a=>a.id===r.asset_id)).find(Boolean);
    const suggested=source?findSimilar(source)[0]:null;
    if(!suggested){toast('Open and explore more classified photographs so Blackcell can find related Trigger Cards.');return}
    sessionSeen.clear();
    showSeed(suggested,'trigger');
   });
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
