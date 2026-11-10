/* BLACKCELL / PRIVATE PHOTO DISCOVERY
   User-directed preferences. Never infer sexuality, ethnicity, or other sensitive traits. */
export function createPhotoTaste({client,state,meta,toast,viewerCurrent,mediaUrl,render,archiveAssets}){
 const $=id=>document.getElementById(id);
 const CUES=[
  ["uniform_fit","Uniform / clothing fit"],
  ["camouflage","Camouflage pattern"],
  ["boots","Boots / footwear"],
  ["physique","Athletic build"],
  ["pose","Pose / posture"],
  ["exercise","Exercise / activity"],
  ["expression","Face / expression"],
  ["rear_view_clothed","Clothed rear view"],
  ["front_waist_clothed","Clothed front waist"],
  ["photo_angle","Camera angle"],
  ["equipment","Military gear"],
  ["environment","Background / location"],
  ["arms","Arms / forearms"],
  ["shoulders","Shoulders"],
  ["torso","Torso / upper body"],
  ["legs","Legs"],
  ["hands","Hands"]
 ];
 const LABELS=Object.fromEntries(CUES);
 const PATTERNS={
  uniform_fit:/uniform|shirt|clothing|wearing|fatigue|trousers|pants|mccuu|bdu|tactical|gear|outfit/i,
  camouflage:/camo|camouflage|m arpat|marpat|multicam|woodland|desert|acu|dcu|digital/i,
  boots:/boots?|footwear|shoes?/i,
  physique:/muscl|physique|athletic|fitness|bodybuild|strength|workout|exercise/i,
  pose:/pose|posing|posture|stance|standing|kneeling|sitting/i,
  exercise:/fitness|exercise|training|pull[\s-]?ups?|push[\s-]?ups?|workout|gym|weightlift|running|squat/i,
  expression:/portrait|face|facial|smil|expression/i,
  rear_view_clothed:/visual:rear_view_clothed|rear[\s-]?view|from behind|back[\s-]?view/i,
  front_waist_clothed:/visual:front_waist_clothed|front waist|waistband|beltline|belt\b/i,
  photo_angle:/side[\s-]?view|close[\s-]?up|camera angle|low angle|full[\s-]?body|portrait|rear[\s-]?view/i,
  equipment:/equipment|vest|helmets?|ruck|rifle|gear|utility|pack/i,
  environment:/desert|forest|outdoor|indoors|camp|tent|snow|jungle|field|water|background|location/i,
  arms:/\barm(s)?\b|bicep|forearm/i,
  shoulders:/shoulders?|deltoid|upper body/i,
  torso:/torso|chest|upper body|shirt/i,
  legs:/\bleg(s)?\b|calves|thighs|trousers|pants/i,
  hands:/\bhands?\b|gloves?|grip/i
 };
 let active=null,selected=new Set(),rating=0,busy=false,regions=[],drag=null,dragPointer=null;
 const current=()=>meta.tastes||[];
 const ownId=()=>state.user?.id;
 const recordFor=a=>current().find(t=>t.asset_id===(typeof a==="string"?a:a?.id));
 const assetText=a=>[a?.filename,a?.caption,a?.military_category,a?.military_branch,a?.military_era,
   ...(Array.isArray(a?.military_tags)?a.military_tags:[])].filter(Boolean).join(" ").toLowerCase();
 const cueMatch=(a,cue)=>!!(PATTERNS[cue]&&PATTERNS[cue].test(assetText(a)));
 const liked=t=>t?.reaction==="more"||(t?.reaction!=="less"&&t?.rating>=4);
 const disliked=t=>t?.reaction==="less"||(t?.rating>0&&t?.rating<=2);
 function weights(){
  const counts=new Map();
  for(const t of current()){
   const positive=liked(t),negative=disliked(t);
   const change=positive?(t.rating>=4?2+t.rating-3:3):negative?-3:0;
   if(!change)continue;
   const mentioned=new Set([...(t.cues||[]),...(Array.isArray(t.regions)?t.regions.map(r=>r.cue):[])]);
   for(const cue of mentioned){
    if(LABELS[cue])counts.set(cue,Math.max(-20,Math.min(20,(counts.get(cue)||0)+change)));
   }
  }
  return counts;
 }
 function rank(items){
  const signal=weights();
  const source=archiveAssets();
  const byId=new Map(source.map(a=>[a.id,a]));
  const samples=current().filter(t=>liked(t)||disliked(t)).map(t=>({taste:t,photo:byId.get(t.asset_id)})).filter(x=>x.photo);
  const order=new Map(items.map((a,i)=>[a.id,i]));
  const score=a=>{
   const own=recordFor(a);
   let n=own?.reaction==="more"?65:own?.reaction==="less"?-140:0;
   if(own?.rating)n+=(own.rating-3)*13;
   for(const [cue,w] of signal){if(cueMatch(a,cue))n+=w*9}
   // Even if someone just selects "Show more", compare approved metadata.
   // Do not infer the viewer's sexuality or the people pictured.
   for(const sample of samples){
    const sg=liked(sample.taste)?1:-1;
    const p=sample.photo;
    if(p.id===a.id)continue;
    if(p.military_category&&p.military_category!=="Unsorted"&&p.military_category===a.military_category)n+=sg*10;
    const tags=new Set((p.military_tags||[]).map(t=>String(t).toLowerCase()));
    const overlap=(a.military_tags||[]).filter(t=>tags.has(String(t).toLowerCase())).length;
    n+=sg*Math.min(overlap,3)*6;
   }
   return n;
  };
  return [...items].sort((a,b)=>score(b)-score(a)||(order.get(a.id)-order.get(b.id)));
 }
 function reason(a){
  const matches=[...weights()].filter(([cue,n])=>n>0&&cueMatch(a,cue)).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if(matches.length)return "You might like this for its "+matches.map(([key])=>LABELS[key].toLowerCase()).join(", ")+".";
  const source=archiveAssets(),related=current().filter(liked).map(t=>source.find(x=>x.id===t.asset_id))
   .filter(x=>x&&x.id!==a?.id&&x.military_category===a?.military_category&&x.military_category!=="Unsorted");
  if(related.length)return "You might like this because you liked other "+String(a.military_category).toLowerCase()+" photographs.";
  if(current().length)return "Recommendations also reflect your favorites and military categories. More feedback makes the matching more specific.";
  return "Choose What Caught Your Eye on a photograph to teach your For You gallery which visible details matter to you.";
 }
 function renderInsights(first,visible){
  const panel=$("tasteInsights");if(!panel)return;
  panel.hidden=!visible;
  if(!visible)return;
  const n=current().length;
  $("tasteInsightCount").textContent=n+" PHOTO"+(n===1?"":"S")+" REVIEWED";
  $("tasteInsightText").textContent=first?reason(first):"Start with a photograph and tell Blackcell which features you prefer.";
  const fav=[...weights()].filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const holder=$("tasteInsightSignals");holder.replaceChildren();
  for(const [key] of fav){
   const span=document.createElement("span");span.textContent=LABELS[key];holder.append(span);
  }
  if(!fav.length){
   const text=document.createElement("small");text.textContent="Personal recommendations use your selected details and favorites. No assumptions about identity or sexuality.";holder.append(text);
  }
  $("tasteResetAll").disabled=!n||busy;
 }

 const round=(x)=>Math.round(x*10000)/10000;
 const limit=(x,low=0,high=1)=>Math.max(low,Math.min(high,x));
 function validRegion(r){
  return r&&typeof r==="object"&&
   ["x","y","w","h"].every(k=>typeof r[k]==="number"&&Number.isFinite(r[k]))&&
   r.x>=0&&r.y>=0&&r.w>=.01&&r.h>=.01&&r.x+r.w<=1.0001&&r.y+r.h<=1.0001&&
   (r.cue===""||!!LABELS[r.cue]);
 }
 function regionOptions(selectedCue=""){
  const options=[new Option("No label yet (saved for later)", "")];
  for(const [key,label] of CUES)options.push(new Option(label,key));
  const frag=document.createDocumentFragment();
  for(const op of options){op.selected=op.value===selectedCue;frag.append(op)}
  return frag;
 }
 function measureRegionImage(){
  const frame=$("tasteRegionFrame"),img=$("tasteMarkImage"),surface=$("tasteMarkSurface");
  if(!img.complete||!img.naturalWidth||!img.naturalHeight||$("tasteOverlay").hidden)return;
  const w=Math.max(65,Math.min(640,frame.clientWidth-24));
  const k=Math.min(1,w/img.naturalWidth,380/img.naturalHeight);
  surface.style.width=Math.max(1,Math.round(img.naturalWidth*k))+"px";
  surface.style.height=Math.max(1,Math.round(img.naturalHeight*k))+"px";
  surface.hidden=false;$("tasteRegionLoading").hidden=true;
  updateRegions();
 }
 function openRegionImage(url){
  const img=$("tasteMarkImage"),surface=$("tasteMarkSurface");
  surface.hidden=true;img.removeAttribute("src");
  $("tasteRegionLoading").hidden=false;
  $("tasteRegionLoading").textContent=url?"Loading full photograph for area selection…":"Photo unavailable for precise selection.";
  if(!url)return;
  img.onload=measureRegionImage;
  img.onerror=()=>{surface.hidden=true;$("tasteRegionLoading").hidden=false;$("tasteRegionLoading").textContent="Unable to load this photograph. Refresh your library and reopen it."};
  img.src=url;
  if(img.complete&&img.naturalWidth)measureRegionImage();
 }
 function regionPoint(event){
  const rect=$("tasteMarkSurface").getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  return {x:limit((event.clientX-rect.left)/rect.width),y:limit((event.clientY-rect.top)/rect.height)};
 }
 function drawRegion(rect,i,draft=false){
  const box=document.createElement("div");
  box.className="taste-region-rect"+(draft?" draft":"");
  box.style.left=(rect.x*100)+"%";box.style.top=(rect.y*100)+"%";
  box.style.width=(rect.w*100)+"%";box.style.height=(rect.h*100)+"%";
  const label=(rect.cue&&LABELS[rect.cue])||"Area";
  box.dataset.label=draft?"DRAWING":(i+1)+" · "+label;
  $("tasteMarkLayer").append(box);
 }
 function updateRegions(){
  const layer=$("tasteMarkLayer"),list=$("tasteRegionList");
  layer.replaceChildren();list.replaceChildren();
  $("tasteAreaCount").textContent=regions.length+" / 5 selected";
  $("tasteAreaUndo").disabled=busy||!regions.length;
  for(let i=0;i<regions.length;i++){
   const r=regions[i];drawRegion(r,i);
   const entry=document.createElement("div");entry.className="taste-region-entry";
   const number=document.createElement("strong");number.textContent="AREA "+(i+1);
   const label=document.createElement("select");label.setAttribute("aria-label","Area "+(i+1)+" label");label.append(regionOptions(r.cue));
   label.addEventListener("change",()=>{
    if(busy)return;
    regions[i].cue=label.value;
    updateRegions();
   });
   const remove=document.createElement("button");remove.type="button";remove.textContent="REMOVE";
   remove.setAttribute("aria-label","Remove marked area "+(i+1));
   remove.disabled=busy;
   remove.addEventListener("click",()=>{if(!busy){regions.splice(i,1);updateRegions()}});
   entry.append(number,label,remove);list.append(entry);
  }
  if(drag){
   const x=Math.min(drag.from.x,drag.to.x),y=Math.min(drag.from.y,drag.to.y);
   const w=Math.abs(drag.from.x-drag.to.x),h=Math.abs(drag.from.y-drag.to.y);
   drawRegion({x,y,w,h},regions.length,true);
  }
 }
 function completeRegion(){
  if(!drag)return;
  let x=Math.min(drag.from.x,drag.to.x),y=Math.min(drag.from.y,drag.to.y);
  let w=Math.abs(drag.to.x-drag.from.x),h=Math.abs(drag.to.y-drag.from.y);
  if(w<.02&&h<.02){w=.16;h=.16;x=limit(drag.from.x-w/2,0,1-w);y=limit(drag.from.y-h/2,0,1-h)}
  else{
   if(w<.02){const cx=(drag.from.x+drag.to.x)/2;w=.04;x=limit(cx-w/2,0,1-w)}
   if(h<.02){const cy=(drag.from.y+drag.to.y)/2;h=.04;y=limit(cy-h/2,0,1-h)}
  }
  regions.push({x:round(x),y:round(y),w:round(Math.min(w,1-x)),h:round(Math.min(h,1-y)),cue:$("tasteAreaType").value||""});
  drag=null;dragPointer=null;
  updateRegions();
  $("tasteStatus").textContent="Area marked. Add a label if you want recommendations to match its visible features, then save your preferences.";
 }
 function setupRegionControls(){
  const pick=$("tasteAreaType");
  pick.append(regionOptions(""));
  const layer=$("tasteMarkLayer");
  layer.addEventListener("pointerdown",e=>{
   if(busy||regions.length>=5||!active||$("tasteMarkSurface").hidden)return;
   if(e.pointerType==="mouse"&&e.button!==0)return;
   const point=regionPoint(e);if(!point)return;
   e.preventDefault();dragPointer=e.pointerId;
   drag={from:point,to:point};
   try{layer.setPointerCapture(e.pointerId)}catch(_){}
   updateRegions();
  });
  layer.addEventListener("pointermove",e=>{
   if(!drag||dragPointer!==e.pointerId)return;
   const point=regionPoint(e);if(!point)return;
   e.preventDefault();drag.to=point;updateRegions();
  });
  layer.addEventListener("pointerup",e=>{
   if(!drag||dragPointer!==e.pointerId)return;
   const point=regionPoint(e);if(point)drag.to=point;
   e.preventDefault();
   try{layer.releasePointerCapture(e.pointerId)}catch(_){}
   completeRegion();
  });
  layer.addEventListener("pointercancel",e=>{
   if(dragPointer!==e.pointerId)return;
   drag=null;dragPointer=null;updateRegions();
  });
  $("tasteAreaUndo").addEventListener("click",()=>{if(!busy&&regions.length){regions.pop();updateRegions()}});
  window.addEventListener("resize",()=>{
   if(!$("tasteOverlay").hidden)measureRegionImage();
  });
 }

 function updateRating(){
  for(const btn of document.querySelectorAll("[data-taste-rating]")){
   const v=Number(btn.dataset.tasteRating);
   const active=v<=rating;btn.classList.toggle("active",active);
   btn.setAttribute("aria-pressed",String(v===rating));
  }
  $("tasteRatingText").textContent=rating?rating+" / 5 stars":"Rate this photograph (optional)";
 }
 function updateCues(){
  for(const btn of document.querySelectorAll("[data-taste-cue]")){
   const active=selected.has(btn.dataset.tasteCue);
   btn.classList.toggle("selected",active);btn.setAttribute("aria-pressed",String(active));
  }
  $("tasteSelectionCount").textContent=selected.size+" selected";
 }
 function open(a=viewerCurrent()){
  if(!a||a.kind!=="photo"){toast("Choose a photograph to give feedback.");return}
  if(busy)return;
  active=a;
  const saved=recordFor(a);
  selected=new Set((saved?.cues||[]).filter(c=>LABELS[c]));
  regions=(Array.isArray(saved?.regions)?saved.regions:[]).slice(0,5).filter(validRegion).map(r=>({...r}));
  drag=null;dragPointer=null;
  rating=Number(saved?.rating||0);
  $("tasteOverlay").hidden=false;
  $("tasteFilename").textContent=a.filename||"Photograph";
  $("tasteNote").value=saved?.note||"";
  $("tasteStatus").textContent=saved?"Your previous feedback is loaded. You can change it or clear it.":"Select the details that catch your eye. The system only learns from what you choose.";
  $("tasteClear").disabled=!saved;
  const image=$("tastePreview"),url=mediaUrl(a);
  image.hidden=!url;if(url)image.src=url;else image.removeAttribute("src");
  updateRating();updateCues();
  openRegionImage(url);
  updateRegions();
 }
 function close(){
  if(busy)return;
  $("tasteOverlay").hidden=true;active=null;drag=null;dragPointer=null;
 }
 function setBusy(on){
  busy=on;
  for(const id of ["tasteMore","tasteLess","tasteSave","tasteClear","tasteResetAll","tasteClose","tasteCancel"]){
   if($(id))$(id).disabled=on;
  }
 }
 async function save(reaction){
  if(!active||busy)return;
  if(reaction==="neutral"&&!rating&&!selected.size&&!regions.length&&!$("tasteNote").value.trim()){
   $("tasteStatus").textContent="Choose at least one detail, a rating, or a note.";
   return;
  }
  setBusy(true);
  $("tasteStatus").textContent="Saving your private photo preferences…";
  const data={user_id:ownId(),asset_id:active.id,rating,reaction,cues:[...selected],
    regions:regions.map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,cue:r.cue||""})),
    note:$("tasteNote").value.trim().slice(0,500),updated_at:new Date().toISOString()};
  try{
   const {error}=await client.from("corp_social_photo_tastes")
    .upsert(data,{onConflict:"user_id,asset_id"});
   if(error)throw error;
   meta.tastes=[...current().filter(t=>t.asset_id!==active.id),data];
   toast(reaction==="less"?"We'll show fewer photos with similar features.":"Your preferences are saved. For You will use this feedback.");
   $("tasteOverlay").hidden=true;active=null;
   render();
  }catch(e){$("tasteStatus").textContent="Couldn't save preference: "+(e?.message||"Unknown error")}
  finally{setBusy(false)}
 }
 async function clearOne(){
  if(!active||busy)return;
  setBusy(true);
  try{
   const {error}=await client.from("corp_social_photo_tastes").delete().eq("user_id",ownId()).eq("asset_id",active.id);
   if(error)throw error;
   meta.tastes=current().filter(t=>t.asset_id!==active.id);
   $("tasteOverlay").hidden=true;active=null;render();
   toast("Preference for this photo cleared.");
  }catch(e){$("tasteStatus").textContent="Couldn't clear preference: "+(e?.message||"Unknown error")}
  finally{setBusy(false)}
 }
 async function resetAll(){
  if(busy||!current().length)return;
  if(!confirm("Reset all of your private photo preferences? This removes your ratings and selected details. Your photo favorites will remain unchanged."))return;
  setBusy(true);
  try{
   const {error}=await client.from("corp_social_photo_tastes").delete().eq("user_id",ownId());
   if(error)throw error;
   meta.tastes=[];render();toast("Personal photo preference feedback reset. Favorites are unchanged.");
  }catch(e){toast("Couldn't reset preferences: "+(e?.message||"Unknown error"))}
  finally{setBusy(false)}
 }
 async function load(){
  if(!ownId())return;
  const {data,error}=await client.from("corp_social_photo_tastes")
   .select("asset_id,rating,reaction,cues,regions,note,updated_at").eq("user_id",ownId()).limit(2000);
  if(error){console.warn("Private photo tastes not available:",error.message);meta.tastes=[];return}
  meta.tastes=data||[];
 }
 function setup(){
  const root=$("tasteCues");
  root.replaceChildren();
  for(const [key,label] of CUES){
   const btn=document.createElement("button");btn.type="button";
   btn.className="taste-cue";btn.textContent=label;btn.dataset.tasteCue=key;
   btn.setAttribute("aria-pressed","false");
   btn.addEventListener("click",()=>{
    if(busy)return;
    if(selected.has(key))selected.delete(key);else selected.add(key);
    updateCues();
   });
   root.append(btn);
  }
  setupRegionControls();
  const stars=$("tasteRatingButtons");
  for(let i=1;i<=5;i++){
   const btn=document.createElement("button");btn.type="button";
   btn.textContent="★";btn.setAttribute("aria-label",i+" stars");btn.dataset.tasteRating=String(i);
   btn.addEventListener("click",()=>{if(!busy){rating=rating===i?0:i;updateRating()}});
   stars.append(btn);
  }
  $("appleViewerTaste").addEventListener("click",()=>open());
  $("tasteClose").addEventListener("click",close);
  $("tasteCancel").addEventListener("click",close);
  $("tasteMore").addEventListener("click",()=>void save("more"));
  $("tasteLess").addEventListener("click",()=>void save("less"));
  $("tasteSave").addEventListener("click",()=>void save("neutral"));
  $("tasteClear").addEventListener("click",()=>void clearOne());
  $("tasteResetAll").addEventListener("click",()=>void resetAll());
  $("tasteOverlay").addEventListener("click",e=>{if(e.target===$("tasteOverlay"))close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("tasteOverlay").hidden){e.preventDefault();e.stopPropagation();close()}},true);
 }
 function forViewer(a){
  const btn=$("appleViewerTaste");if(!btn)return;
  btn.hidden=!a||a.kind!=="photo";
  if(a?.kind==="photo"){
   const record=recordFor(a);
   btn.textContent=record?"✦ EDIT MY PREFERENCES":"✦ WHAT CAUGHT YOUR EYE?";
  }
 }
 return {setup,load,rank,renderInsights,forViewer,open,reason};
}
