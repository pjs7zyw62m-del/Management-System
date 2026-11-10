/* BLACKCELL Military AI — owner-only, opt-in review and approve UI.
   All classification changes are performed by corp_social_ai_approve RPC. */
export function createMilitaryPhotoAI({client,state,toast,getCurrent,mediaUrl,onApproved}){
 const $=id=>document.getElementById(id);
 const name="blackcell-military-ai";
 let asset=null,review=null,busy=false,lastBatch=[];
 const own=a=>a&&a.kind==="photo"&&a.owner_id===state.user?.id&&["library","post"].includes(a.purpose);
 const say=(message)=>{if($("aiPhotoStatus"))$("aiPhotoStatus").textContent=message};
 const setBusy=(on)=>{busy=!!on;for(const id of ["aiPhotoAnalyze","aiPhotoApprove","aiPhotoReject","aiPhotoBatchStart"]){if($(id))$(id).disabled=busy}};
 const label=(t)=>{if($("aiPhotoAnalyze"))$("aiPhotoAnalyze").textContent=t};
 function fillSelect(id,sourceId){
  const target=$(id),src=$(sourceId);
  if(!target||!src)return;
  target.replaceChildren(...[...src.options].map(o=>new Option(o.textContent,o.value)));
 }
 function fields(){
  return {
   country_code:$("aiPhotoCountry").value,
   military_branch:$("aiPhotoBranch").value,
   military_category:$("aiPhotoCategory").value,
   uniform_type:$("aiPhotoUniform").value.trim().slice(0,160),
   camouflage_pattern:$("aiPhotoCamouflage").value.trim().slice(0,160),
   focus:$("aiPhotoFocus").value,
   notes:$("aiPhotoNotes").value.trim().slice(0,1200),
   tags:[...new Set($("aiPhotoTags").value.split(",").map(t=>t.trim().slice(0,40)).filter(Boolean))].slice(0,15)
  };
 }
 function showReview(record){
  review=record;
  if(!record){$("aiPhotoReview").hidden=true;return}
  const setVal=(id,value)=>{if($(id))$(id).value=String(value||"")};
  setVal("aiPhotoCountry",record.country_code);
  setVal("aiPhotoBranch",record.military_branch);
  setVal("aiPhotoCategory",record.military_category);
  setVal("aiPhotoUniform",record.uniform_type);
  setVal("aiPhotoCamouflage",record.camouflage_pattern);
  setVal("aiPhotoFocus",record.focus);
  setVal("aiPhotoNotes",record.notes);
  setVal("aiPhotoTags",Array.isArray(record.tags)?record.tags.join(", "):"");
  const conf=record.confidence||"low";
  $("aiPhotoConfidence").textContent="CONFIDENCE: "+conf.toUpperCase()+" • "+(record.status||"suggested").toUpperCase();
  const ready=record.status==="suggested";
  $("aiPhotoApprove").disabled=!ready;
  $("aiPhotoReject").disabled=!ready;
  $("aiPhotoReview").hidden=false;
  label("↻ RE-ANALYZE");
 }
 function close(){
  if(busy)return;
  $("aiPhotoOverlay").hidden=true;
  asset=null;review=null;lastBatch=[];
  $("aiPhotoBatch").hidden=true;
 }
 async function explain(error){
  try{
   const body=await error?.context?.json?.();
   if(body?.code==="AI_NOT_CONFIGURED")return "AI is installed, but its private provider key hasn't been set. In Supabase → Edge Functions → Secrets, set OPENAI_API_KEY. The photo was not analyzed.";
   if(body?.error)return String(body.error).slice(0,350);
  }catch(_){}
  return error?.message||"The AI service is unavailable. No classifications were changed.";
 }
 async function readExisting(a){
  const {data,error}=await client.from("corp_social_ai_analysis")
   .select("id,asset_id,status,country_code,military_branch,military_category,uniform_type,camouflage_pattern,focus,confidence,notes,tags,attempts,updated_at")
   .eq("asset_id",a.id).eq("owner_id",state.user.id).maybeSingle();
  if(error){say("Could not load previous AI suggestions: "+error.message);return}
  showReview(data);
  if(data){say(data.status==="approved"?"This photo has approved AI tags. You can re-analyze it if you want.":data.status==="rejected"?"Previous suggestions were rejected. You can analyze again.":"Previous AI suggestions are ready for review.");}
  else say("Press Analyze Photo to send this photograph to the private vision analysis endpoint. The image is processed only after you request it.");
 }
 async function open(a){
  if(!own(a)){toast("Only the photo owner can run AI classification.");return}
  if(busy)return;
  asset=a;review=null;
  $("aiPhotoOverlay").hidden=false;
  $("aiPhotoReview").hidden=true;
  $("aiPhotoBatch").hidden=true;
  $("aiPhotoName").textContent=a.filename||"Photograph";
  const img=$("aiPhotoPreview"),url=mediaUrl(a);
  img.hidden=!url;if(url)img.src=url;else img.removeAttribute("src");
  label("✦ ANALYZE PHOTO");
  say("Loading saved suggestions…");
  await readExisting(a);
 }
 async function invokeAnalyze(a){
  const {data,error}=await client.functions.invoke(name,{body:{action:"analyze",asset_id:a.id}});
  if(error)throw Error(await explain(error));
  if(!data?.ok||!data.analysis)throw Error(data?.error||"AI service returned no saved suggestion.");
  return data.analysis;
 }
 async function analyze(){
  if(!asset||busy)return;
  const chosen=asset;
  setBusy(true);label("ANALYZING…");say("Analyzing visible uniform and equipment details. Your photo is not being added to a public gallery.");
  try{
   const result=await invokeAnalyze(chosen);
   if(asset?.id!==chosen.id)return;
   showReview(result);
   say("AI suggestions received. Review every field, correct any errors, then select Approve & Save.");
  }catch(e){say(e.message||"Analysis failed");label(review?"↻ RE-ANALYZE":"✦ ANALYZE PHOTO");}
  finally{setBusy(false);if(review?.status!=="suggested")$("aiPhotoApprove").disabled=true}
 }
 async function approve(){
  if(!asset||!review||review.status!=="suggested"||busy)return;
  const id=asset.id;
  setBusy(true);say("Saving your approved classifications…");
  try{
   const final=fields();
   const {data,error}=await client.rpc("corp_social_ai_approve",{p_analysis_id:review.id,p_review:final});
   if(error)throw error;
   if(!data?.ok)throw Error("Approval could not be completed.");
   const resultAsset=asset;
   review.status="approved";
   onApproved(resultAsset,final);
   showReview({...review,...final,status:"approved"});
   say("Approved and saved. Country, branch, subject and tags now feed World Forces Explorer and For You.");
  }catch(e){say("Couldn't approve: "+(e?.message||"Unknown error"))}
  finally{setBusy(false);if(review?.status!=="suggested"){$("aiPhotoApprove").disabled=true;$("aiPhotoReject").disabled=true}}
 }
 async function reject(){
  if(!review||busy)return;
  setBusy(true);say("Rejecting AI suggestions…");
  try{
   const {error}=await client.from("corp_social_ai_analysis").update({status:"rejected",updated_at:new Date().toISOString()})
    .eq("id",review.id).eq("owner_id",state.user.id);
   if(error)throw error;
   review.status="rejected";
   showReview(review);say("Suggestion rejected. No military labels were changed.");
  }catch(e){say("Could not reject suggestion: "+(e?.message||"Error"))}
  finally{setBusy(false);$("aiPhotoApprove").disabled=true;$("aiPhotoReject").disabled=true}
 }
 async function batch(){
  if(busy)return;
  const images=state.assets.filter(own).slice(0,3);
  if(!images.length){toast("You don't have any owned photographs available for AI analysis yet.");return}
  if(!confirm("Analyze up to "+images.length+" of your own photographs? Each request uses an external AI service and may incur API charges. No tags are applied until you approve."))return;
  lastBatch=[];asset=null;review=null;
  $("aiPhotoOverlay").hidden=false;
  $("aiPhotoReview").hidden=true;
  $("aiPhotoBatch").hidden=false;
  $("aiPhotoName").textContent="My Library · Batch AI Test";
  $("aiPhotoPreview").hidden=true;
  label("✦ ANALYZE PHOTO");
  setBusy(true);
  const list=$("aiPhotoBatchList");list.replaceChildren();
  for(let i=0;i<images.length;i++){
   const a=images[i];
   say("Analyzing "+(i+1)+" of "+images.length+" photographs…");
   try{
    const suggestion=await invokeAnalyze(a);
    lastBatch.push({asset:a,review:suggestion});
    const row=document.createElement("div");row.className="ai-photo-batch-entry";
    const label=document.createElement("small");label.textContent=a.filename.slice(0,45)+" · "+suggestion.confidence+" confidence";
    const btn=document.createElement("button");btn.type="button";btn.textContent="REVIEW ↗";
    btn.addEventListener("click",()=>{if(!busy)void open(a)});
    row.append(label,btn);list.append(row);
   }catch(e){
    const row=document.createElement("div");row.className="ai-photo-batch-entry";
    const txt=document.createElement("small");txt.textContent=a.filename.slice(0,38)+" · "+String(e.message||"Error").slice(0,110);
    row.append(txt);list.append(row);
    if(/key|configured|provider|daily|quota|unavailable/i.test(String(e.message||"")))break;
   }
  }
  setBusy(false);
  say("Batch complete. "+lastBatch.length+" photo(s) have suggestions to review. No classification has been applied automatically.");
 }
 function setup(){
  fillSelect("aiPhotoCountry","militaryAssetCountry");
  fillSelect("aiPhotoBranch","militaryAssetBranch");
  fillSelect("aiPhotoCategory","militaryAssetCategory");
  const controls={
   aiPhotoClose:close,aiPhotoCancel:close,
   aiPhotoAnalyze:()=>void analyze(),aiPhotoApprove:()=>void approve(),
   aiPhotoReject:()=>void reject(),
   aiPhotoBatchStart:()=>void batch(),
   aiLibraryBatchButton:()=>void batch(),
   appleViewerAnalyze:()=>void open(getCurrent())
  };
  for(const [id,handler] of Object.entries(controls))$(id)?.addEventListener("click",handler);
  $("aiPhotoOverlay")?.addEventListener("click",e=>{if(e.target===$("aiPhotoOverlay"))close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("aiPhotoOverlay").hidden){e.stopPropagation();e.preventDefault();close()}},true);
 }
 return {setup,open,batch,toggleForAsset:a=>{if($("appleViewerAnalyze"))$("appleViewerAnalyze").hidden=!own(a)},close};
}
