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
  ["environment","Background / location"]
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
  environment:/desert|forest|outdoor|indoors|camp|tent|snow|jungle|field|water|background|location/i
 };
 let active=null,selected=new Set(),rating=0,busy=false;
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
   for(const cue of t.cues||[]){
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
  rating=Number(saved?.rating||0);
  $("tasteOverlay").hidden=false;
  $("tasteFilename").textContent=a.filename||"Photograph";
  $("tasteNote").value=saved?.note||"";
  $("tasteStatus").textContent=saved?"Your previous feedback is loaded. You can change it or clear it.":"Select the details that catch your eye. The system only learns from what you choose.";
  $("tasteClear").disabled=!saved;
  const image=$("tastePreview"),url=mediaUrl(a);
  image.hidden=!url;if(url)image.src=url;else image.removeAttribute("src");
  updateRating();updateCues();
 }
 function close(){
  if(busy)return;
  $("tasteOverlay").hidden=true;active=null;
 }
 function setBusy(on){
  busy=on;
  for(const id of ["tasteMore","tasteLess","tasteSave","tasteClear","tasteResetAll","tasteClose","tasteCancel"]){
   if($(id))$(id).disabled=on;
  }
 }
 async function save(reaction){
  if(!active||busy)return;
  if(reaction==="neutral"&&!rating&&!selected.size&&!$("tasteNote").value.trim()){
   $("tasteStatus").textContent="Choose at least one detail, a rating, or a note.";
   return;
  }
  setBusy(true);
  $("tasteStatus").textContent="Saving your private photo preferences…";
  const data={user_id:ownId(),asset_id:active.id,rating,reaction,cues:[...selected],
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
   .select("asset_id,rating,reaction,cues,note,updated_at").eq("user_id",ownId()).limit(2000);
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
