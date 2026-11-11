/* BLACKCELL VISUAL DISCOVERY
 * Live member gallery + precise area selection + local appearance comparison.
 * Nothing is uploaded to external AI services. No generated or fake results.
 * Does not identify faces, individuals, military objects or clothing by name.
 */
import {signatureFromImage,visualSimilarity,metadataSimilarity,candidateRegions,labelReasons}
 from './corporate-visual-match.js?v=20261111-vd1';
export function createVisualDiscovery({client,state,mediaUrl,toast,closeViewer,openPhoto,getCurrentPhoto,personalization}){
 const $=id=>document.getElementById(id);
 const overlay=$('visualDiscoveryOverlay'),stage=$('vdStage'),main=$('vdMainPhoto');
 const selectionNode=$('vdSelection');
 let current=null,selection=null,dragStart=null,dragging=false,searchId=0,working=false;
 let previousFocus=null,previousOverflow='',reactions=new Map(),lastResults=[],resizeObserver=null;
 let sourceReady=false,looping=false;
 const eligible=()=>state.assets.filter(a=>a.kind==='photo'&&['library','post'].includes(a.purpose)&&mediaUrl(a));
 const status=s=>{$('vdStatus').textContent=s};
 const element=(tag,cl='',value=null)=>{
  const node=document.createElement(tag);if(cl)node.className=cl;
  if(value!==null)node.textContent=String(value);
  return node;
 };
 const button=(value,callback,cl='')=>{
  const n=element('button',cl,value);n.type='button';n.addEventListener('click',callback);
  return n;
 };
 const safeText=a=>a.caption||a.filename||'Military photograph';
 const normalize=(x,y,w,h)=>({
  x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),
  w:Math.max(.015,Math.min(1,w)),h:Math.max(.015,Math.min(1,h))
 });
 const inUse=()=>!overlay.hidden;
 function imageBounds(){
  if(!main.naturalWidth||!main.naturalHeight)return null;
  const rect=main.getBoundingClientRect();
  const scale=Math.min(rect.width/main.naturalWidth,rect.height/main.naturalHeight);
  const w=main.naturalWidth*scale,h=main.naturalHeight*scale;
  return {left:rect.left+(rect.width-w)/2,top:rect.top+(rect.height-h)/2,width:w,height:h};
 }
 function at(e,b){
  return {x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),
   y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};
 }
 function showSelection(){
  const b=imageBounds();
  if(!selection||!b){selectionNode.hidden=true;return}
  const base=stage.getBoundingClientRect();
  const x=b.left-base.left+selection.x*b.width,y=b.top-base.top+selection.y*b.height;
  selectionNode.style.left=x+'px';selectionNode.style.top=y+'px';
  selectionNode.style.width=(selection.w*b.width)+'px';
  selectionNode.style.height=(selection.h*b.height)+'px';
  selectionNode.hidden=false;
 }
 function preview(){
  const canvas=$('vdCropPreview'),ctx=canvas.getContext('2d');
  ctx.fillStyle='#04070c';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(!selection||!main.naturalWidth){$('vdCropMessage').hidden=false;return}
  try{
   const sx=Math.round(selection.x*main.naturalWidth),sy=Math.round(selection.y*main.naturalHeight);
   const sw=Math.max(1,Math.round(selection.w*main.naturalWidth));
   const sh=Math.max(1,Math.round(selection.h*main.naturalHeight));
   // Fit the selected crop without stretching its proportions.
   const scale=Math.min(canvas.width/sw,canvas.height/sh);
   const width=sw*scale,height=sh*scale;
   ctx.drawImage(main,sx,sy,sw,sh,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
   $('vdCropMessage').hidden=true;
  }catch(e){
   $('vdCropMessage').hidden=false;
   $('vdCropMessage').textContent='Preview unavailable; military tags can still be searched.';
  }
 }
 function selectRect(rect){
  selection=rect;
  showSelection();preview();
  $('vdAnalyze').disabled=!selection||!current||working;
  $('vdSelectionHint').textContent='AREA SELECTED · SEARCH OR SELECT A NEW DETAIL';
  if(!working)status('Ready. Search by this area’s colors, textures, and available military classification.');
 }
 function clearSelection(){
  selection=null;showSelection();preview();
  $('vdAnalyze').disabled=true;
  $('vdSelectionHint').textContent='CLICK A DETAIL OR DRAG TO SELECT AN AREA';
  status('Click the photograph or drag across a detail to select it.');
 }
 function down(e){
  if(!main.naturalWidth||working)return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const b=imageBounds();if(!b)return;
  dragStart=at(e,b);dragging=true;
  try{stage.setPointerCapture(e.pointerId)}catch(_){}
  e.preventDefault();
 }
 function move(e){
  if(!dragging||!dragStart||working)return;
  const b=imageBounds();if(!b)return;
  const cur=at(e,b);
  const x=Math.min(cur.x,dragStart.x),y=Math.min(cur.y,dragStart.y);
  const w=Math.abs(cur.x-dragStart.x),h=Math.abs(cur.y-dragStart.y);
  if(w>.015&&h>.015){
   selection=normalize(x,y,w,h);showSelection();
  }
 }
 function up(e){
  if(!dragging||!dragStart)return;
  dragging=false;const b=imageBounds();
  if(!b){dragStart=null;return}
  const currentPoint=at(e,b),x=Math.min(currentPoint.x,dragStart.x);
  const y=Math.min(currentPoint.y,dragStart.y);
  let w=Math.abs(currentPoint.x-dragStart.x),h=Math.abs(currentPoint.y-dragStart.y);
  if(w<.025||h<.025){
   w=.25;h=.30;
   selectRect(normalize(Math.max(0,Math.min(1-w,currentPoint.x-w/2)),
    Math.max(0,Math.min(1-h,currentPoint.y-h/2)),w,h));
  }else{
   w=Math.max(w,.08);h=Math.max(h,.08);
   selectRect(normalize(Math.min(x,1-w),Math.min(y,1-h),w,h));
  }
  dragStart=null;e.preventDefault();
 }
 function emptyResults(message){
  $('vdResults').replaceChildren(element('div','bc-vd-empty',message));
  $('vdResultCount').textContent='';$('vdResultMethod').textContent='';
 }
 function showSourceStrip(){
  const photos=eligible(),host=$('vdSourceStrip');host.replaceChildren();
  $('vdSourceCount').textContent=photos.length+' PHOTOGRAPHS';
  for(const asset of photos){
   const b=button('',()=>showAsset(asset),current?.id===asset.id?'active':'');
   b.setAttribute('aria-label','Explore '+safeText(asset));
   b.setAttribute('aria-pressed',String(current?.id===asset.id));
   const img=element('img');img.src=mediaUrl(asset);img.alt='';img.loading='lazy';
   const label=element('span','',asset.filename||'Military photo');
   b.append(img,label);host.append(b);
  }
  host.querySelector('.active')?.scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'});
 }
 function showAsset(asset,{preserve=false,autoFind=false}={}){
  if(!asset||asset.kind!=='photo'||!mediaUrl(asset))return;
  searchId++;working=false;$('vdProcess').hidden=true;
  $('vdAnalyze').disabled=true;
  const kept=preserve&&selection?{...selection}:null;
  current=asset;selection=null;sourceReady=false;
  main.alt=safeText(asset);main.removeAttribute('src');
  const expected=asset.id;
  main.onload=()=>{
   if(!inUse()||current?.id!==expected)return;
   sourceReady=true;
   if(kept)selectRect(kept);else clearSelection();
   showSourceStrip();
   if(autoFind&&kept)void analyze();
  };
  main.onerror=()=>{
   if(current?.id!==expected)return;
   sourceReady=false;status('Unable to display this private photo. Refresh the Network and try again.');
  };
  main.src=mediaUrl(asset);
  $('vdFilename').textContent=asset.filename||'MILITARY PHOTOGRAPH';
  clearSelection();emptyResults('Select an area of this photo, then choose Find Similar Photos.');
  showSourceStrip();
 }
 async function loadReactions(){
  if(!state.user?.id)return;
  const {data,error}=await client.from('corp_social_photo_tastes')
   .select('asset_id,reaction').eq('user_id',state.user.id).limit(2500);
  if(error){console.warn('Visual Discovery preferences unavailable:',error.message);return}
  reactions=new Map((data||[]).map(r=>[r.asset_id,r.reaction]));
 }
 function open(asset=null){
  if(!state.user?.id){toast('Please sign in to use Visual Discovery.');return}
  if(inUse())return;
  previousFocus=document.activeElement;
  // The selection screen replaces the full viewer, so modals never stack.
  if(!$('applePhotoViewer').hidden&&typeof closeViewer==='function')closeViewer();
  overlay.hidden=false;
  previousOverflow=document.body.style.overflow;
  document.body.classList.add('bc-vd-open');
  $('vdClose').focus({preventScroll:true});
  resizeObserver?.disconnect();
  resizeObserver=new ResizeObserver(()=>{showSelection()});
  resizeObserver.observe(stage);
  void loadReactions();
  const pool=eligible();
  if(!pool.length){
   current=null;sourceReady=false;main.removeAttribute('src');
   $('vdNoPhoto').hidden=false;
   $('vdSourceStrip').replaceChildren();$('vdSourceCount').textContent='0 PHOTOGRAPHS';
   $('vdFilename').textContent='NO MILITARY PHOTOGRAPHS';
   emptyResults('The Library has no accessible photographs to compare.');
   status('Upload a photograph to Military Library first.');
   clearSelection();
  }else{
   $('vdNoPhoto').hidden=true;
   showAsset(pool.find(a=>a.id===asset?.id)||pool[0]);
  }
 }
 function close(){
  searchId++;working=false;dragging=false;dragStart=null;
  resizeObserver?.disconnect();resizeObserver=null;
  overlay.hidden=true;document.body.classList.remove('bc-vd-open');
  document.body.style.overflow=previousOverflow;
  main.removeAttribute('src');main.onload=null;main.onerror=null;
  selection=null;current=null;sourceReady=false;
  const old=previousFocus;previousFocus=null;
  if(old?.isConnected)old.focus({preventScroll:true});
 }
 function percent(done,total){
  const n=Math.round(done/Math.max(1,total)*100);
  $('vdProgressNumber').textContent=n+'%';$('vdProgressBar').style.width=n+'%';
 }
 function loadImage(url){
  return new Promise((resolve,reject)=>{
   const image=new Image();image.crossOrigin='anonymous';image.decoding='async';
   let settled=false;
   const timeout=setTimeout(()=>{
    if(settled)return;settled=true;image.src='';reject(Error('Image timeout'));
   },9000);
   image.onload=()=>{if(settled)return;settled=true;clearTimeout(timeout);resolve(image)};
   image.onerror=()=>{if(settled)return;settled=true;clearTimeout(timeout);reject(Error('Image data unavailable'))};
   image.src=url;
  });
 }
 async function scoreCandidate(asset,mode,sourceSig,region){
  const meta=metadataSimilarity(current,asset);
  let pixel=null;
  if(mode!=='tags'&&sourceSig){
   try{
    const image=await loadImage(mediaUrl(asset));
    let best=0;
    for(const r of candidateRegions(region)){
     const sig=signatureFromImage(image,r);
     best=Math.max(best,visualSimilarity(sourceSig,sig));
    }
    pixel=best;
   }catch(e){pixel=null}
  }
  if(mode==='tags')return meta>0?{asset,score:meta,meta,pixel:null}:null;
  if(mode==='pixels')return pixel!==null?{asset,score:pixel,meta,pixel}:null;
  if(pixel!==null)return {asset,score:.77*pixel+.23*meta,meta,pixel};
  return meta>0?{asset,score:meta*.65,meta,pixel:null}:null;
 }
 async function analyze(){
  if(!sourceReady||!current||!selection||working)return;
  const request=++searchId,source=current,region={...selection},mode=$('vdMatchMode').value;
  const candidates=eligible().filter(a=>a.id!==source.id).slice(0,120);
  if(!candidates.length){status('No other photographs are available to compare.');return}
  working=true;$('vdAnalyze').disabled=true;$('vdProcess').hidden=false;percent(0,candidates.length);
  emptyResults('Comparing this detail with real Military Library photographs…');
  let sig=null,pixelBlocked=false,matchedPixels=0,done=0;
  if(mode!=='tags'){
   try{
    const image=await loadImage(mediaUrl(source));
    sig=signatureFromImage(image,region);
   }catch(e){pixelBlocked=true}
  }
  if(mode==='pixels'&&!sig){
   status('Pixel analysis is blocked by the photo format or storage access. Try Appearance + military tags or Military tags.');
   $('vdProcess').hidden=true;working=false;$('vdAnalyze').disabled=false;return;
  }
  const matches=[];
  let nextIndex=0;
  const process=async()=>{
   while(true){
    if(request!==searchId||!inUse())return;
    const index=nextIndex++;if(index>=candidates.length)return;
    const a=candidates[index];
    const score=await scoreCandidate(a,mode,sig,region);
    if(request!==searchId||!inUse())return;
    if(score){matches.push(score);if(score.pixel!==null)matchedPixels++}
    percent(++done,candidates.length);
    if(index%4===0)await new Promise(r=>setTimeout(r,0));
   }
  };
  // Workers increment the shared index synchronously, with bounded loads.
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},()=>process()));
  if(request!==searchId||!inUse())return;
  working=false;$('vdProcess').hidden=true;$('vdAnalyze').disabled=false;
  matches.sort((a,b)=>b.score-a.score);
  lastResults=matches.slice(0,12);
  renderResults(lastResults);
  const method=mode==='tags'||!matchedPixels?'Military metadata':'Visual appearance'+(mode==='hybrid'?' + tags':'');
  $('vdResultMethod').textContent=method.toUpperCase();
  const scope=candidates.length+(eligible().length-1>120?' of '+(eligible().length-1):'');
  const count=lastResults.length;
  if(pixelBlocked){
   status('Image pixels were unavailable; used existing military tags. '+count+' matches from '+scope+' photos.');
  }else if(!matchedPixels&&mode!=='tags'){
   status('Visual pixel access was unavailable; ranked existing military classifications. '+count+' matches.');
  }else{
   status('Compared '+scope+' photographs; showing '+count+' closest matches based on available image information.');
  }
  // No automated inference that the clicked detail is a tie, face, or person.
 }
 function renderResults(matches){
  const host=$('vdResults');host.replaceChildren();
  $('vdResultCount').textContent=matches.length?String(matches.length):'';
  if(!matches.length){
   host.append(element('div','bc-vd-empty','No matches could be calculated. Try another area or choose the military-tag search mode.'));
   return;
  }
  for(const result of matches){
   const asset=result.asset,card=element('article','bc-vd-match-card');
   const picture=button('',()=>{close();void openPhoto(asset)},'bc-vd-match-picture');
   picture.setAttribute('aria-label','Open full photograph '+safeText(asset));
   const img=element('img');img.src=mediaUrl(asset);img.alt=safeText(asset);img.loading='lazy';
   picture.append(img);
   const body=element('div','bc-vd-match-copy');
   body.append(element('strong','',asset.caption||asset.filename));
   body.append(element('small','',labelReasons(current,asset,result.pixel!==null)));
   const actions=element('div','bc-vd-match-actions');
   const liked=button('♡ LIKE',()=>void feedback(asset,'more',liked,less),'');
   const less=button('✕ PASS',()=>void feedback(asset,'less',less,liked),'');
   liked.dataset.feedback='more';less.dataset.feedback='less';
   const sync=()=>{
    liked.classList.toggle('selected',reactions.get(asset.id)==='more');
    less.classList.toggle('selected',reactions.get(asset.id)==='less');
    liked.setAttribute('aria-pressed',String(reactions.get(asset.id)==='more'));
    less.setAttribute('aria-pressed',String(reactions.get(asset.id)==='less'));
   };
   const more=button('⌖ MORE LIKE THIS',()=>showAsset(asset,{preserve:true,autoFind:true}));
   actions.append(liked,less,more);
   body.append(actions);card.append(picture,body);host.append(card);sync();
  }
 }
 async function feedback(asset,reaction,control,other){
  if(!state.user?.id)return;
  control.disabled=true;other.disabled=true;
  try{
   const {data,error}=await client.from('corp_social_photo_tastes').upsert({
    user_id:state.user.id,asset_id:asset.id,reaction
   },{onConflict:'user_id,asset_id'}).select('asset_id');
   if(error||!data?.length)throw error||Error('Permission rejected');
   reactions.set(asset.id,reaction);
   control.classList.add('selected');other.classList.remove('selected');
   control.setAttribute('aria-pressed','true');other.setAttribute('aria-pressed','false');
   status(reaction==='more'?'Saved to your private preferences: show more like this.':
    'Saved: show less like this. This is not a competition vote.');
   if(personalization?.load)void personalization.load();
  }catch(e){status('Your choice could not be saved: '+(e?.message||'Please try again'))}
  finally{control.disabled=false;other.disabled=false}
 }
 function setup(){
  document.querySelectorAll('[data-open-visual-discovery]').forEach(el=>
   el.addEventListener('click',()=>open()));
  $('appleViewerVisualDiscovery')?.addEventListener('click',()=>{
   open(typeof getCurrentPhoto==='function'?getCurrentPhoto():null);
  });
  $('vdClose').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  stage.addEventListener('pointerdown',down);
  stage.addEventListener('pointermove',move);
  stage.addEventListener('pointerup',up);
  stage.addEventListener('pointercancel',()=>{dragging=false;dragStart=null});
  stage.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){
    e.preventDefault();selectRect({x:.35,y:.35,w:.30,h:.30});
   }
  });
  $('vdAnalyze').addEventListener('click',()=>void analyze());
  $('vdReset').addEventListener('click',clearSelection);
  $('vdMatchMode').addEventListener('change',()=>{if(selection&&!working)status('Search mode changed. Press Find Similar Photos to update results.')});
  document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&inUse()){e.stopPropagation();close()}
  },true);
 }
 return {setup,open,close};
}
