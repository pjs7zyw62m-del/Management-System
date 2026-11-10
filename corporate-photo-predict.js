/* BLACKCELL / Private opt-in visual interest predictions.
   Predictions localize visible *features*, never infer viewer identity or sexuality.
   One paid image call only when owner explicitly clicks START PREDICTION. */
export function createPhotoPredict({client,state,mediaUrl,toast,onCorrect}){
 const $=id=>document.getElementById(id);
 let photo=null,result=null,busy=false,feedback={};
 const ownId=()=>state.user?.id;
 const LABELS={
  uniform_fit:"Uniform fit",camouflage:"Camouflage",boots:"Boots",belt:"Belt",
  belt_buckle:"Belt buckle",shirt:"Shirt",uniform_shirt:"Uniform shirt",
  shirt_fit:"Shirt fit",shirt_tucked:"Tucked shirt",sleeves_rolled:"Rolled-up sleeves",
  sleeves_down:"Sleeves down",clothed_backside:"Clothed rear view",
  hair_bald:"Bald head",hair_shaved:"Shaved head",hair_high_tight:"High-and-tight haircut",
  hair_buzz:"Buzz cut",hair_crew:"Crew cut",hair_fade:"Fade haircut",
  physique:"Athletic build",pose:"Pose",exercise:"Exercise",expression:"Expression",
  rear_view_clothed:"Clothed rear view",front_waist_clothed:"Clothed front waist",
  photo_angle:"Camera angle",equipment:"Equipment",environment:"Environment",
  arms:"Arms",shoulders:"Shoulders",torso:"Torso",legs:"Legs",hands:"Hands"
 };
 const clean=(v,n=160)=>String(v||"").slice(0,n);
 function showMessage(message){$("predStatus").textContent=message}
 function setBusy(next){
  busy=next;
  for(const id of ["predRun","predClose","predCorrect"]){
   const el=$(id);if(el)el.disabled=next;
  }
  $("predRun").textContent=next?"✦ ANALYZING THE PHOTO…":"✦ RUN VISUAL PREDICTION";
  if(!next&&result?.attempts>=3)$("predRun").disabled=true;
 }
 function forViewer(a){
  const b=$("appleViewerPredict");if(!b)return;
  b.hidden=!a||a.kind!=="photo"||a.owner_id!==ownId();
 }
 function renderRegions(){
  const layer=$("predOverlayLayer"),list=$("predRegionList");
  layer.replaceChildren();list.replaceChildren();
  const arr=Array.isArray(result?.prediction_regions)?result.prediction_regions:[];
  if(!arr.length){
   const e=document.createElement("p");e.className="pred-empty";
   e.textContent=result?"No feature matches were confidently located in this photo. That is a useful negative prediction. You can manually mark what interests you.":"Run an image-based prediction to show approximate boxes over visible features.";
   list.append(e);return;
  }
  arr.forEach((r,i)=>{
   if(![r.x,r.y,r.w,r.h].every(n=>typeof n==="number"&&Number.isFinite(n)))return;
   const marker=document.createElement("div");marker.className="pred-visual-rect";
   marker.style.left=r.x*100+"%";marker.style.top=r.y*100+"%";
   marker.style.width=r.w*100+"%";marker.style.height=r.h*100+"%";
   marker.dataset.label=(i+1)+" · "+(LABELS[r.cue]||r.cue);
   layer.append(marker);
   const row=document.createElement("div");row.className="pred-row";
   const info=document.createElement("div");info.className="pred-row-main";
   const title=document.createElement("strong");title.textContent="AREA "+(i+1)+" · "+(LABELS[r.cue]||r.cue);
   const description=document.createElement("p");description.textContent=clean(r.detail||"AI predicted this area",150);
   const confidence=document.createElement("small");confidence.textContent="Visual confidence: "+clean(r.confidence||"low",10)+". Predicted preference — not confirmed until you respond.";
   info.append(title,description,confidence);
   const controls=document.createElement("div");controls.className="pred-vote-actions";
   for(const [key,text] of [["yes","✓ THAT'S IT"],["no","✕ NOT THAT"]]){
    const b=document.createElement("button");b.type="button";b.textContent=text;
    b.dataset.feedback=key;
    b.className="pred-vote"+(feedback[String(i)]===key?" selected":"");
    b.disabled=busy;b.setAttribute("aria-pressed",String(feedback[String(i)]===key));
    b.addEventListener("click",()=>void vote(i,key));
    controls.append(b);
   }
   row.append(info,controls);list.append(row);
  });
 }
 function updateStage(){
  const img=$("predImage"),surface=$("predImageSurface"),holder=$("predImageFrame");
  if(!img.complete||!img.naturalWidth||!img.naturalHeight||$("predModal").hidden)return;
  const maxWidth=Math.max(70,Math.min(620,holder.clientWidth-20));
  const scale=Math.min(maxWidth/img.naturalWidth,410/img.naturalHeight);
  surface.style.width=Math.max(1,Math.floor(img.naturalWidth*scale))+"px";
  surface.style.height=Math.max(1,Math.floor(img.naturalHeight*scale))+"px";
  surface.hidden=false;
  renderRegions();
 }
 async function loadPrevious(a){
  const {data,error}=await client.from("corp_social_photo_interest_predictions")
   .select("asset_id,prediction_regions,summary,region_feedback,attempts,updated_at")
   .eq("user_id",ownId()).eq("asset_id",a.id).maybeSingle();
  if(photo?.id!==a.id)return;
  if(error){showMessage("Previous prediction unavailable: "+clean(error.message));return}
  result=data||null;feedback=data?.region_feedback||{};
  $("predSummary").textContent=result?result.summary:"No prediction saved for this photo yet.";
  $("predRun").disabled=!!(result&&result.attempts>=3);
  if(result&&result.attempts>=3)showMessage("Three scans used for this photograph. You can still give feedback without spending more API credits.");
  else if(result)showMessage("Saved prediction loaded. Confirm or reject its predictions, or request another paid scan.");
  else showMessage("This is optional. The prediction sends a reduced image to OpenAI only when you click Run Visual Prediction.");
  renderRegions();
 }
 function open(a){
  if(!a||a.kind!=="photo"||a.owner_id!==ownId()){toast("Visual predictions are available for your own library photos.");return}
  if(busy)return;
  photo=a;result=null;feedback={};
  $("predModal").hidden=false;$("predFilename").textContent=clean(a.filename,100);
  $("predSummary").textContent="Reviewing your saved preferences before a new visual prediction.";
  showMessage("Loading any previous prediction…");
  const url=mediaUrl(a);
  const img=$("predImage");img.removeAttribute("src");$("predImageSurface").hidden=true;
  if(url){img.onload=updateStage;img.onerror=()=>showMessage("Could not display the original photo. Refresh the library.");img.src=url}
  else showMessage("Secure image URL is unavailable. Refresh the library.");
  renderRegions();void loadPrevious(a);
 }
 function close(){if(busy)return;$("predModal").hidden=true;photo=null;result=null;feedback={}}
 async function makePreview(a){
  const {data:blob,error}=await client.storage.from("corp-social-media").download(a.storage_path);
  if(error||!blob||!blob.size)throw Error("Cannot securely read the photograph for visual prediction");
  const url=URL.createObjectURL(blob);
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{
    img.onload=resolve;img.onerror=()=>reject(Error("The browser cannot decode this photo; try a JPEG image."));img.src=url;
   });
   if(!img.naturalWidth||!img.naturalHeight)throw Error("The photo dimensions are unreadable");
   const scale=Math.min(1,1500/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement("canvas");
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx)throw Error("This browser cannot prepare an AI preview");
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   let jpeg=canvas.toDataURL("image/jpeg",0.75);
   if(jpeg.length>4_000_000)jpeg=canvas.toDataURL("image/jpeg",0.5);
   canvas.width=1;canvas.height=1;
   if(jpeg.length>4_000_000)throw Error("Could not reduce the preview below 3 MB. Use a smaller image.");
   return jpeg;
  }finally{URL.revokeObjectURL(url)}
 }
 async function run(){
  if(!photo||busy)return;
  if(result?.attempts>=3){showMessage("This photo has reached its three-prediction limit.");return}
  if(!confirm("Run ONE image-based prediction using OpenAI API credits? This analyzes a reduced private image only after your approval. Previously saved manual preferences cost nothing."))return;
  setBusy(true);
  showMessage("Preparing a private reduced image…");
  try{
   const asset=photo,preview=await makePreview(asset);
   showMessage("Comparing visible features against your saved preferences…");
   const {data,error}=await client.functions.invoke("blackcell-military-ai",{
    body:{action:"predict_interest",asset_id:asset.id,preview_image:preview}
   });
   if(error){
    let reason=error.message||"Unknown request error";
    try{
     const payload=await error.context?.json?.();
     if(payload?.error)reason=payload.error;
    }catch(_){}
    throw Error(reason);
   }
   if(!data?.ok||!data?.prediction)throw Error(data?.error||"Prediction was not returned");
   result=data.prediction;feedback={};
   $("predSummary").textContent=result.summary||"Image prediction completed.";
   showMessage((result.prediction_regions||[]).length+
    " visual area"+(result.prediction_regions?.length===1?"":"s")+" predicted. Confirm or reject each one; neither feedback action calls OpenAI.");
   renderRegions();
   $("predRun").disabled=result.attempts>=3;
  }catch(e){showMessage("Prediction unavailable: "+clean(e?.message||"Unknown error",250))}
  finally{setBusy(false);if(result?.attempts>=3)$("predRun").disabled=true}
 }
 async function vote(i,choice){
  if(!photo||!result||busy)return;
  if(!Array.isArray(result.prediction_regions)||!result.prediction_regions[i])return;
  setBusy(true);
  showMessage("Saving prediction feedback privately…");
  const next={...feedback,[String(i)]:choice};
  try{
   const {error}=await client.from("corp_social_photo_interest_predictions")
    .update({region_feedback:next,updated_at:new Date().toISOString()})
    .eq("user_id",ownId()).eq("asset_id",photo.id);
   if(error)throw error;
   feedback=next;renderRegions();
   showMessage(choice==="yes"?"✓ That's It saved. This confirmed prediction can guide later analyses.":"✕ Not That saved. The rejected prediction will be counted as incorrect.");
   toast("Prediction feedback saved");
  }catch(e){showMessage("Could not save prediction feedback: "+clean(e.message))}
  finally{setBusy(false);if(result?.attempts>=3)$("predRun").disabled=true;renderRegions()}
 }
 function setup(){
  $("appleViewerPredict").addEventListener("click",()=>{const a=state.assets.find(x=>x.id===$("appleViewerPredict").dataset.assetId);if(a)open(a)});
  $("predClose").addEventListener("click",close);
  $("predRun").addEventListener("click",()=>void run());
  $("predCorrect").addEventListener("click",()=>{
   if(!photo||busy)return;
   const a=photo;close();if(typeof onCorrect==="function")onCorrect(a);
  });
  $("predModal").addEventListener("click",e=>{if(e.target===$("predModal"))close()});
  window.addEventListener("resize",()=>{if(!$("predModal").hidden)updateStage()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("predModal").hidden){e.stopPropagation();e.preventDefault();close()}},true);
 }
 function selectViewer(a){
  const b=$("appleViewerPredict");if(!b)return;
  b.dataset.assetId=a?.id||"";
  forViewer(a);
 }
 return {setup,selectViewer,open};
}
