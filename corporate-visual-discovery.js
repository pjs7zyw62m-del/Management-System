/* BLACKCELL VISUAL DISCOVERY
 * Live member gallery + precise area selection + local appearance comparison.
 * Nothing is uploaded to external AI services. No generated or fake results.
 * Does not identify faces, individuals, military objects or clothing by name.
 */
import {signatureFromImage,visualSimilarity,metadataSimilarity,candidateRegions,labelReasons}
 from './corporate-visual-match.js?v=20261111-area3';
export function createVisualDiscovery({client,state,mediaUrl,toast,closeViewer,openPhoto,getCurrentPhoto,personalization,dedupe}){
 const $=id=>document.getElementById(id);
 const overlay=$('visualDiscoveryOverlay'),stage=$('vdStage'),main=$('vdMainPhoto');
 const selectionNode=$('vdSelection');
 let current=null,selection=null,dragStart=null,dragging=false,searchId=0,working=false;
 let previousFocus=null,previousOverflow='',reactions=new Map(),lastResults=[],resizeObserver=null;
 let sourceReady=false,looping=false,lastPointerSelectionAt=0,aiBusy=false,scanBusy=false;
 const onPhone=()=>window.matchMedia('(hover: none) and (pointer: coarse)').matches || window.innerWidth<=600;
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
 function selectRect(rect,{auto=false}={}){
  selection=rect;
  showSelection();preview();
  $('vdAnalyze').disabled=!selection||!current||working;
  $('vdAISearch').disabled=!selection||!current||working||aiBusy;
  $('vdSelectionHint').textContent='DETAIL SELECTED · CHOOSE AI FIND SAME ITEM';
  if(!working)status('Area selected. For the SAME object, choose AI Find Same Item. Color comparison is optional and cannot identify objects.');
  // Do not auto-launch weak pixel search after a tap. It was producing false
  // matches that looked like genuine clothing/object recognition.
 }
 function clearSelection(){
  selection=null;showSelection();preview();
  $('vdAnalyze').disabled=true;$('vdAISearch').disabled=true;
  $('vdSelectionHint').textContent=onPhone()?'TAP A DETAIL · THEN AI FIND':'CLICK OR DRAG TO SELECT A DETAIL';
  status('Select a detail, then choose AI Find Same Item. The image collection must be AI-indexed first.');
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
    Math.max(0,Math.min(1-h,currentPoint.y-h/2)),w,h),{auto:true});
  }else{
   w=Math.max(w,.08);h=Math.max(h,.08);
   selectRect(normalize(Math.min(x,1-w),Math.min(y,1-h),w,h),{auto:true});
  }
  lastPointerSelectionAt=Date.now();
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
  // Scrolling the thumbnail into view vertically can hide the large photo
  // on iPhone. Move only the horizontal source strip.
  const active=host.querySelector('.active');
  if(active){
   const delta=active.getBoundingClientRect().left-host.getBoundingClientRect().left;
   host.scrollLeft+=delta-(host.clientWidth-active.clientWidth)/2;
  }
 }
 function showAsset(asset,{preserve=false,preset=null,autoFind=false,autoAI=false}={}){
  if(!asset||asset.kind!=='photo'||!mediaUrl(asset))return;
  searchId++;working=false;$('vdProcess').hidden=true;
  $('vdAnalyze').disabled=true;
  const kept=preset?{...preset}:(preserve&&selection?{...selection}:null);
  current=asset;selection=null;sourceReady=false;
  main.alt=safeText(asset);main.removeAttribute('src');main.crossOrigin='anonymous';
  const expected=asset.id;
  main.onload=()=>{
   if(!inUse()||current?.id!==expected)return;
   sourceReady=true;
   if(kept)selectRect(kept);else clearSelection();
   showSourceStrip();
   if(autoAI&&kept)void findWithAI();
   else if(autoFind&&kept)void analyze();
  };
  main.onerror=()=>{
   if(current?.id!==expected)return;
   sourceReady=false;status('Unable to display this private photo. Refresh the Network and try again.');
  };
  main.src=mediaUrl(asset);
  $('vdFilename').textContent=asset.filename||'MILITARY PHOTOGRAPH';
  clearSelection();emptyResults('Choose an item on this photo, then press AI Find Same Item. The optional Color comparison is not object recognition.');
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
  void systemCheck();
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
 async function scoreCandidate(asset,mode,sourceSig,region,sourceAsset){
  const meta=metadataSimilarity(sourceAsset,asset);
  let pixel=null,bestRegion=null;
  if(mode!=='tags'&&sourceSig){
   try{
    const image=await loadImage(mediaUrl(asset));
    let best=0;
    for(const r of candidateRegions(region)){
     const sig=signatureFromImage(image,r);
     const similarity=visualSimilarity(sourceSig,sig);
     if(similarity>best){best=similarity;bestRegion=r}
    }
    pixel=best;
   }catch(e){pixel=null}
  }
  if(mode==='tags')return meta>=.31?{asset,score:meta,meta,pixel:null,region:null}:null;
  if(mode==='pixels')return pixel!==null&&pixel>=.94?{asset,score:pixel,meta,pixel,region:null}:null;
  if(pixel!==null&&pixel>=.89&&meta>=.24)return {asset,score:.84*pixel+.16*meta,meta,pixel,region:null};
  return null;
 }
 async function analyze(){
  if(!sourceReady||!current||!selection||working)return;
  const request=++searchId,source=current,region={...selection},mode=$('vdMatchMode').value;
  const mobile=onPhone();
  // Mobile Safari can terminate the tab when many large originals decode at once.
  const candidates=eligible().filter(a=>a.id!==source.id).slice(0,mobile?45:120);
  if(!candidates.length){status('No other photographs are available to compare.');return}
  working=true;$('vdAnalyze').disabled=true;$('vdAISearch').disabled=true;
  $('vdProcess').hidden=false;percent(0,candidates.length);
  emptyResults('Comparing colors and patterns only. This cannot confirm matching uniforms or equipment.');
  let sig=null,pixelBlocked=false,matchedPixels=0,done=0;
  if(mode!=='tags'){
   try{
    const image=await loadImage(mediaUrl(source));
    sig=signatureFromImage(image,region);
   }catch(e){pixelBlocked=true}
  }
  if(mode==='pixels'&&!sig){
   status('Pixel analysis is unavailable for this image. Try Military tags or AI Find Same Item.');
   $('vdProcess').hidden=true;working=false;$('vdAnalyze').disabled=false;
   $('vdAISearch').disabled=!selection||aiBusy;return;
  }
  const matches=[];
  let nextIndex=0;
  const process=async()=>{
   while(true){
    if(request!==searchId||!inUse())return;
    const index=nextIndex++;if(index>=candidates.length)return;
    const a=candidates[index];
    const score=await scoreCandidate(a,mode,sig,region,source);
    if(request!==searchId||!inUse())return;
    if(score){matches.push(score);if(score.pixel!==null)matchedPixels++}
    percent(++done,candidates.length);
    if(mobile&&done%5===0){
     status('Basic appearance comparison: '+done+' of '+candidates.length+' photos checked. Real item matching requires AI indexing.');
    }
    if(index%4===0)await new Promise(r=>setTimeout(r,0));
   }
  };
  // Workers increment the shared index synchronously, with bounded loads.
  await Promise.all(Array.from({length:Math.min(mobile?2:4,candidates.length)},()=>process()));
  if(request!==searchId||!inUse())return;
  working=false;$('vdProcess').hidden=true;$('vdAnalyze').disabled=false;
  $('vdAISearch').disabled=!selection||aiBusy;
  matches.sort((a,b)=>b.score-a.score);
  // Avoid presenting every generic military photo as a specific-area match.
  // Scores describe approximate appearance, NOT semantic object recognition.
  const highest=matches[0]?.score||0;
  const fallback=mode==='tags'||!matchedPixels;
  const threshold=fallback?Math.max(.31,highest-.12):Math.max(.86,highest-.025);
  lastResults=matches.filter(item=>item.score>=threshold).slice(0,6);
  renderResults(lastResults);
  const method=mode==='tags'?'Military metadata only':mode==='pixels'?'Colors/patterns only':'Basic appearance + tags (not AI)';
  $('vdResultMethod').textContent=method.toUpperCase();
  const scope=candidates.length+(eligible().length-1>120?' of '+(eligible().length-1):'');
  const count=lastResults.length;
  if(onPhone()&&count) {
   const resultPanel=$('vdResults');
   // The entire phone dialog scrolls; bring real matched photographs into view.
   requestAnimationFrame(()=>resultPanel.scrollIntoView({behavior:'smooth',block:'nearest'}));
  }
  if(pixelBlocked){
   status('Image pixels unavailable; showing '+count+' category-based suggestions, not matching physical items.');
  }else if(!matchedPixels&&mode!=='tags'){
   status('Visual pixels unavailable. No object recognition was performed; '+count+' tag-based comparisons.');
  }else{
   status(count?
    'Compared '+scope+' photographs by appearance only. '+count+' approximate pattern similarities, NOT verified same-item matches.':
    'No reliable appearance-only matches. For ties, gear and other actual items, use AI Find Same Item after indexing.');
  }
  // Only the separate AI workflow can identify objects; this routine never claims to.
 }
 function renderResults(matches){
  const host=$('vdResults');host.replaceChildren();
  $('vdResultCount').textContent=matches.length?String(matches.length):'';
  if(!matches.length){
   host.append(element('div','bc-vd-empty','No close area matches found in the current collection. Select a larger detail, or search by military tags.'));
   return;
  }
  for(const result of matches){
   const asset=result.asset,card=element('article','bc-vd-match-card');
   const picture=button('',()=>{close();void openPhoto(asset)},'bc-vd-match-picture');
   picture.setAttribute('aria-label','Open full photograph '+safeText(asset));
   const img=element('img');img.src=mediaUrl(asset);img.alt=safeText(asset);img.loading='lazy';
   picture.append(img);
   if(result.ai&&result.region){
    // Only AI-detected item locations get a match box. The basic pixel
    // matcher must NEVER display misleading selected-object outlines.
    const marker=element('span','bc-vd-match-region');
    marker.setAttribute('aria-hidden','true');
    picture.append(marker);
    const positionMatch=()=>{
     if(!img.naturalWidth||!img.naturalHeight)return;
     const box=picture.getBoundingClientRect();
     const fit=Math.min(box.width/img.naturalWidth,box.height/img.naturalHeight);
     const w=img.naturalWidth*fit,h=img.naturalHeight*fit;
     const bounds=result.region;
     marker.style.left=((box.width-w)/2+bounds.x*w)+'px';
     marker.style.top=((box.height-h)/2+bounds.y*h)+'px';
     marker.style.width=(bounds.w*w)+'px';
     marker.style.height=(bounds.h*h)+'px';
    };
    img.addEventListener('load',positionMatch);
    if(img.complete&&img.naturalWidth)positionMatch();
   }
   const body=element('div','bc-vd-match-copy');
   body.append(element('strong','',asset.caption||asset.filename));
   body.append(element('small','',result.ai?
    'AI-recognized '+result.feature_label+' · '+result.feature_description:
    'BASIC appearance/category comparison only — not an identified matching item'));
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
   const more=button('⌖ MORE LIKE THIS',()=>showAsset(asset,{preset:result.region||selection,autoFind:!result.ai,autoAI:!!result.ai}));
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

 function jpegPreview(image,region=null){
  const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  if(!w||!h)throw Error('Photo has not loaded');
  const left=region?Math.floor(Math.max(0,region.x)*w):0;
  const top=region?Math.floor(Math.max(0,region.y)*h):0;
  const cw=region?Math.max(1,Math.min(w-left,Math.ceil(region.w*w))):w;
  const ch=region?Math.max(1,Math.min(h-top,Math.ceil(region.h*h))):h;
  const factor=Math.min(1,750/Math.max(cw,ch));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(cw*factor));
  canvas.height=Math.max(1,Math.round(ch*factor));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Browser canvas unavailable');
  ctx.drawImage(image,left,top,cw,ch,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/jpeg',.72);
  if(data.length>1800000)throw Error('Image preview exceeded server size limit');
  return data;
 }
 function displayAI(matches,details){
  const assets=new Map(eligible().map(a=>[a.id,a]));
  const mapped=(matches||[]).map(row=>{
   const asset=assets.get(row.asset_id);
   if(!asset)return null;
   const box=row.bbox&&typeof row.bbox==='object'?row.bbox:null;
   const valid=box&&[box.x,box.y,box.w,box.h].every(x=>Number.isFinite(Number(x)))
    &&Number(box.w)>0&&Number(box.h)>0;
   return {asset,ai:true,score:Number(row.score||0),
    feature_label:row.feature_label||'Visual detail',
    feature_description:row.feature_description||'',
    pixel:null,region:valid?box:null};
  }).filter(Boolean);
  lastResults=mapped;
  renderResults(mapped);
  $('vdResultMethod').textContent='AI SEMANTIC MATCH';
  if(details?.detected_item)status('AI detected: '+details.detected_item+
   (details.uncertain?' (uncertain)':'')+' · '+mapped.length+' matches from '+details.indexed_photos+' indexed photos.');
  if(!mapped.length)status('AI identified '+(details?.detected_item||'this detail')+
   ', but found no indexed matches. Index more photographs to improve results.');
  if(onPhone()&&mapped.length)requestAnimationFrame(()=>$('vdResults').scrollIntoView({behavior:'smooth',block:'nearest'}));
 }

 async function functionError(error,data){
  if(data?.error)return String(data.error).slice(0,270);
  let extra='';
  try{
   if(error?.context?.clone){
    const payload=await error.context.clone().json();
    extra=payload?.error||payload?.message||payload?.code||'';
   }
  }catch(_){}
  return String(extra||error?.message||'The server returned an unknown error').slice(0,270);
 }
 async function systemCheck(){
  if(!state.user?.id)return;
  const output=$('vdIndexStatus'),button=$('vdSystemCheck');
  button.disabled=true;
  output.textContent='Checking duplicate scanner and AI service… (no API credits used)';
  try{
   const [fingerprints,features,ai]=await Promise.all([
    client.from('corp_social_photo_fingerprints').select('asset_id',{count:'exact',head:true}),
    client.from('corp_social_photo_features').select('asset_id',{count:'exact',head:true}).eq('feature_key','overall'),
    client.functions.invoke('blackcell-visual-ai',{method:'GET'})
   ]);
   const problems=[];
   if(fingerprints.error)problems.push('Duplicate database: '+fingerprints.error.message);
   if(features.error)problems.push('Photo index: '+features.error.message);
   if(ai.error||!ai.data?.ok)problems.push('AI endpoint: '+await functionError(ai.error,ai.data));
   if(problems.length)output.textContent='SYSTEM CHECK FAILED · '+problems.join(' · ');
   else{
    const local=eligible().filter(a=>a.owner_id===state.user.id).length;
    output.textContent='DATABASE CONNECTED · '+(fingerprints.count||0)+' photo fingerprints · '+
     (features.count||0)+' AI-indexed photos · '+local+' of your photos available · AI SERVICE '+
     (ai.data.configured?'READY (API credits required for scans)':'NOT CONFIGURED (missing server API key)')+
     '. To begin, choose Scan Duplicates (free), then Index 5 Photos with AI (paid).';
   }
  }catch(e){output.textContent='SYSTEM CHECK FAILED · '+(e?.message||'Network unavailable')}
  finally{button.disabled=false}
 }

 async function findWithAI(){
  if(aiBusy||!sourceReady||!current||!selection)return;
  if(!confirm('AI visual search sends ONLY your selected photo detail to the configured vision provider and uses API credits. Continue?'))return;
  aiBusy=true;$('vdAISearch').disabled=true;
  status('AI recognizing the selected detail and searching indexed photographs…');
  try{
   const cropped=jpegPreview(main,selection);
   const {data,error}=await client.functions.invoke('blackcell-visual-ai',{body:{
    action:'search',asset_id:current.id,preview:cropped
   }});
   if(error||!data?.ok)throw Error(await functionError(error,data));
   displayAI(data.results,data);
  }catch(e){status('AI search unavailable: '+(e?.message||'Unknown issue')+
   '. Existing color and military-tag search remains available.')}
  finally{aiBusy=false;$('vdAISearch').disabled=!selection||working||!sourceReady}
 }
 async function indexWithAI(){
  if(aiBusy||scanBusy||!state.user)return;
  const mine=eligible().filter(a=>a.owner_id===state.user.id);
  if(!mine.length){$('vdIndexStatus').textContent='No photographs owned by your account to index.';return}
  const {data:rows,error:lookupError}=await client.from('corp_social_photo_features')
   .select('asset_id').eq('feature_key','overall').limit(3000);
  if(lookupError){$('vdIndexStatus').textContent='Could not check indexed photos: '+lookupError.message;return}
  const existing=new Set((rows||[]).map(r=>r.asset_id));
  const next=mine.filter(a=>!existing.has(a.id)).slice(0,5);
  if(!next.length){$('vdIndexStatus').textContent='All your currently visible photographs are AI-indexed.';return}
  if(!confirm('INDEX '+next.length+' PHOTO'+(next.length===1?'':'S')+' WITH AI?\\n\\nBlackcell will send resized copies of these photographs to the configured vision provider and use paid API credits. This is not a background task. Proceed?'))return;
  aiBusy=true;
  const btn=$('vdAIIndex');btn.disabled=true;
  let done=0,failed=0;
  const failureMessages=[];
  try{
   for(const asset of next){
    $('vdIndexStatus').textContent='AI indexing '+(done+failed+1)+' of '+next.length+': '+safeText(asset);
    try{
     const image=await loadImage(mediaUrl(asset));
     const preview=jpegPreview(image);
     const {data,error}=await client.functions.invoke('blackcell-visual-ai',{body:{
      action:'index',asset_id:asset.id,preview
     }});
     if(error||!data?.ok)throw Error(await functionError(error,data));
     done++;
    }catch(e){
     failed++;failureMessages.push(safeText(asset)+': '+(e?.message||'Unknown error'));
     console.warn('AI photo indexing failed',safeText(asset),e?.message);
     $('vdIndexStatus').textContent='AI indexing issue: '+(e?.message||'Try later');
     // A missing key, permission problem, or an exhausted account will affect
     // the entire batch. Stop instead of causing repeated failed API calls.
     if(/not configured|forbidden|401|403|402|credits|permission|not accessible|service config/i.test(e?.message||''))break;
    }
   }
   $('vdIndexStatus').textContent=done+' photos indexed with AI'+(failed?', '+failed+' failed':'')+
    (failureMessages.length?' · FIRST ERROR: '+failureMessages[0]:' · Select a photo detail, then AI Identify & Match.');
  }finally{aiBusy=false;btn.disabled=false}
 }
 async function scanDuplicates(){
  if(scanBusy||aiBusy)return;
  if(!confirm('Scan your existing photos for exact and possible duplicates? This uses browser bandwidth but NO AI API credits. No photographs will be deleted.'))return;
  scanBusy=true;const btn=$('vdDuplicateScan');btn.disabled=true;
  $('vdDuplicateResults').hidden=false;
  $('vdDuplicateResults').replaceChildren(element('div','bc-vd-empty','Checking stored photographs…'));
  try{
   const result=await dedupe.indexExisting({onProgress:progress=>{
    $('vdIndexStatus').textContent='Checking '+progress.processed+' of '+progress.total+
     ' photos. '+progress.flagged+' potential duplicates flagged.';
   }});
   const host=$('vdDuplicateResults');host.replaceChildren();
   if(!result.flagged.length)host.append(element('div','bc-vd-empty',
    result.pending?'No duplicates found among newly scanned photos.':'Your photos are already fingerprinted. No new photos to scan.'));
   for(const pair of result.flagged){
    const card=element('div','bc-vd-duplicate-item');
    card.append(element('strong','',pair.type==='exact'?'EXACT DUPLICATE':'POSSIBLE VISUAL DUPLICATE'),
      element('small','',pair.filename+' ↔ '+pair.match_name));
    host.append(card);
   }
   $('vdIndexStatus').textContent='Fingerprint scan: '+result.saved+' saved, '+result.failed+
    ' unavailable, '+result.flagged.length+' duplicate candidates. No photos deleted.'+
    (result.errors?.length?' FIRST ERROR: '+result.errors[0]:'');
  }catch(e){$('vdIndexStatus').textContent='Could not complete duplicate scan: '+(e?.message||'Unknown error')}
  finally{scanBusy=false;btn.disabled=false}
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
  // Safari tap fallback if pointer events were interrupted before pointerup.
  stage.addEventListener('click',e=>{
   if(!sourceReady||working||Date.now()-lastPointerSelectionAt<800)return;
   const bounds=imageBounds();if(!bounds)return;
   const point=at(e,bounds),w=.25,h=.30;
   selectRect(normalize(Math.max(0,Math.min(1-w,point.x-w/2)),
    Math.max(0,Math.min(1-h,point.y-h/2)),w,h),{auto:true});
  });
  stage.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){
    e.preventDefault();selectRect({x:.35,y:.35,w:.30,h:.30});
   }
  });
  $('vdAnalyze').addEventListener('click',()=>void analyze());
  $('vdAISearch').addEventListener('click',()=>void findWithAI());
  $('vdAIIndex').addEventListener('click',()=>void indexWithAI());
  $('vdSystemCheck').addEventListener('click',()=>void systemCheck());
  $('vdDuplicateScan').addEventListener('click',()=>void scanDuplicates());
  $('vdQuickPick').addEventListener('click',()=>{
   if(!sourceReady||working){status('Choose a loaded photo first.');return}
   selectRect({x:.35,y:.32,w:.30,h:.36},{auto:true});
  });
  $('vdReset').addEventListener('click',clearSelection);
  $('vdMatchMode').addEventListener('change',()=>{if(selection&&!working)status('Search mode changed. Press Find Similar Photos to update results.')});
  document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&inUse()){e.stopPropagation();close()}
  },true);
 }
 return {setup,open,close};
}
