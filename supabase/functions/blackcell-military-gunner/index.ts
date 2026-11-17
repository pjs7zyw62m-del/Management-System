import {createClient} from "npm:@supabase/supabase-js@2.80.0";
const GUNNER_BRIDGE="https://shdebjikbdanvmlehvda.supabase.co/functions/v1/blackcell-gunner-dolphin";
const GUNNER_PUBLISHABLE="sb_publishable_otGGHvOwvHdqqGkAi4P1pg_MRElszia";
const ALLOWED=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const cut=(x,n=160)=>String(x??"").trim().slice(0,n);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function respond(v,status=200,origin=""){return new Response(JSON.stringify(v),{status,headers:{
 "Content-Type":"application/json","Cache-Control":"no-store",
 "Access-Control-Allow-Origin":ALLOWED.has(origin)?origin:"https://blackcellcorp.com",
 "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"
}})}
async function gunnerRequest(token,payload){
 const res=await fetch(GUNNER_BRIDGE,{
  method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token,"apikey":GUNNER_PUBLISHABLE},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(55000)
 });
 const text=await res.text();
 let body;try{body=JSON.parse(text)}catch(_){body={error:"Original Dolphin service returned invalid response"}}
 return {status:res.status,body};
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "Access-Control-Allow-Origin":ALLOWED.has(origin)?origin:"https://blackcellcorp.com",
  "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"}});
 if(req.method!=="POST")return respond({error:"POST required"},405,origin);
 if(origin&&!ALLOWED.has(origin))return respond({error:"Origin not permitted"},403,origin);
 const bearer=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(bearer))return respond({error:"Verified Blackcell session required"},401,origin);
 const token=bearer.replace(/^Bearer\s+/i,"").trim();
 const supaUrl=Deno.env.get("SUPABASE_URL");
 let pub=Deno.env.get("SUPABASE_ANON_KEY");
 if(!pub){try{pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default}catch(_){}}
 if(!supaUrl||!pub)return respond({error:"Blackcell backend credentials unavailable"},503,origin);
 const client=createClient(supaUrl,pub,{global:{headers:{"Authorization":"Bearer "+token}},
  auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user)return respond({error:"Sign in to your corporate account"},401,origin);
 const {data:member,error:memberError}=await client.from("corp_access_members")
  .select("role,active").eq("user_id",user.id).eq("active",true).maybeSingle();
 if(memberError||member?.role!=="owner")
  return respond({error:"The original Gunner Dolphin is accessible to the verified Blackcell owner only"},403,origin);
 const {data:verification,error:verificationError}=await client.rpc("corp_code_status");
 if(verificationError||verification?.ok!==true||verification?.verified!==true)
  return respond({error:"Verify your Blackcell access pass before chatting with Gunner"},403,origin);
 let input;try{input=await req.json()}catch(_){return respond({error:"Invalid JSON"},400,origin)}
 const action=String(input?.action||"");
 if(!["chat","start","status"].includes(action))return respond({error:"Unsupported chat action"},400,origin);
 const bridgeJobId=cut(input?.bridge_job_id,42);
 if(action==="status"){
  if(!UUID.test(bridgeJobId))return respond({error:"Invalid Dolphin chat job reference"},422,origin);
  let bridge;
  try{bridge=await gunnerRequest(token,{action:"status",bridge_job_id:bridgeJobId})}
  catch(e){console.error("Gunner bridge status error",e?.name);return respond({error:"Original Gunner worker is unreachable; the pending chat is preserved"},503,origin)}
  if(bridge.status!==200)return respond({error:cut(bridge.body?.error||"Original Gunner service unavailable",250)},bridge.status,origin);
  const data=bridge.body;
  if(data.status!=="completed"){
   return respond({ok:true,status:"pending",bridge_job_id:bridgeJobId,
    runpod_status:data.runpod_status||"IN_QUEUE",elapsed_seconds:Number(data.elapsed_seconds)||0,provider:"Dolphin 3.0 / RunPod"},200,origin);
  }
  const answer=cut(data.answer,2200);
  if(!answer)return respond({error:"Dolphin replied with no readable text"},502,origin);
  const {data:previous,error:previousError}=await client.from("corp_social_gunner_messages")
   .select("id").eq("user_id",user.id).eq("bridge_job_id",bridgeJobId).eq("role","assistant").limit(1);
  if(previousError)return respond({error:"Cannot access saved Gunner chat history"},500,origin);
  let historyWarning="";
  if(!previous?.length){
   const {error:writeError}=await client.from("corp_social_gunner_messages")
    .insert({user_id:user.id,role:"assistant",bridge_job_id:bridgeJobId,content:answer});
   if(writeError&&writeError.code!=="23505")historyWarning="Reply delivered, but couldn't save the assistant message.";
  }
  return respond({ok:true,status:"completed",answer,provider:"Dolphin 3.0 / RunPod",
   bridge_job_id:bridgeJobId,...(historyWarning?{notice:historyWarning}:{})},200,origin);
 }
 const message=String(input.message||"").trim();
 if(!message||message.length>1600)return respond({error:"Enter a message under 1601 characters"},422,origin);
 const photoId=cut(input.photo_id,45);
 if(photoId&&!UUID.test(photoId))return respond({error:"Invalid photograph"},422,origin);
 let photoContext={};
 if(photoId){
  const {data:asset,error:assetError}=await client.from("corp_social_assets")
   .select("id,filename,caption,military_country_code,military_branch,military_category,military_tags")
   .eq("id",photoId).in("purpose",["post","library"]).maybeSingle();
  if(assetError||!asset)return respond({error:"Selected photo is not visible to this Blackcell account"},403,origin);
  photoContext={
   filename:cut(asset.filename,110),caption:cut(asset.caption,180),
   country:cut(asset.military_country_code,3),branch:cut(asset.military_branch,55),
   category:cut(asset.military_category,60),
   tags:(Array.isArray(asset.military_tags)?asset.military_tags:[]).slice(0,10).map(t=>cut(t,40))
  };
 }
 const {data:recent,error:historyError}=await client.from("corp_social_gunner_messages")
  .select("role,content").eq("user_id",user.id).not("bridge_job_id","is",null).order("id",{ascending:false}).limit(12);
 if(historyError)return respond({error:"Private Gunner history could not be read"},403,origin);
 let collectionBrief="";
 if(input?.collection_mode===true){
  // Obtain aggregates independently from BLACKCELL server-side data. Never trust
  // model-provided or browser-provided counts, and never transmit media pixels.
  const {data:collection,error:collectionError}=await client.rpc("blackcell_gunner_collection_stats");
  if(collectionError||!collection?.media){
   return respond({error:"Gunner's collection statistics are temporarily unavailable. No paid Dolphin job was started."},503,origin);
  }
  const m=collection.media||{},r=collection.references||{},i=collection.interest||{},d=collection.duplicates||{};
  const n=x=>Math.max(0,Math.round(Number(x)||0));
  const countries=(Array.isArray(collection.countries)?collection.countries:[]).slice(0,7)
    .map(x=>cut(x.code,2)+":"+n(x.count)).join(",");
  const branches=(Array.isArray(collection.branches)?collection.branches:[]).slice(0,6)
    .map(x=>cut(x.branch,38)+":"+n(x.count)).join(",");
  // Read-only, owner-RLS filtered coverage statistics. This supplements
  // Gunner's collection awareness; it does not share image bytes or grant writes.
  // Report unavailable rather than invent a zero when a query fails.
  const [analyses,high,semantic,visual]=await Promise.allSettled([
   client.from("corp_social_ai_analysis").select("asset_id",{count:"exact",head:true}).eq("owner_id",user.id),
   client.from("corp_social_ai_analysis").select("asset_id",{count:"exact",head:true}).eq("owner_id",user.id).eq("confidence","high"),
   client.from("corp_uniform_semantic_vectors").select("asset_id",{count:"exact",head:true}).eq("owner_id",user.id),
   client.from("corp_uniform_visual_fingerprints").select("asset_id",{count:"exact",head:true}).eq("owner_id",user.id)
  ]);
  const covered=result=>result.status==="fulfilled"&&!result.value.error?
   String(n(result.value.count)):"unavailable";
  const visionBrief="AI_analysis_records="+covered(analyses)+
   ",high_confidence_model_labels="+covered(high)+
   ",semantic_text_vectors="+covered(semantic)+
   ",near_duplicate_visual_fingerprints="+covered(visual)+
   ". These coverage counters are not verified model accuracy or evidence of true military service.";
  collectionBrief=[
   "[BLACKCELL VERIFIED LIVE COLLECTION AGGREGATES. All counts are authorized database results, not estimates. Record counts may overlap across separate tables. Never call unverified country labels definitive.]",
   "Assets="+n(m.total)+",photos="+n(m.photos)+",videos="+n(m.videos)+
    ",tube_stream_records="+n(collection.stream?.total)+",pending="+n(m.pending)+
    ",unknown_country="+n(m.missing_country)+",unknown_branch="+n(m.missing_branch)+
    ",unknown_era="+n(m.missing_era)+".",
   "Verified_uniform_references="+n(r.verified)+",reference_countries="+n(r.countries)+
    ",drafts="+n(r.draft)+",verified_video_frames="+n(r.video_frames)+".",
   "Favorites="+n(i.favorites)+",rated="+n(i.rated)+",positive_ratings="+n(i.positive_ratings)+
    ",engaged_views="+n(i.engaged_views)+",exact_duplicate_extra_copies="+n(d.extra_copies)+".",
   "Country_record_counts:"+countries+"; Branch_record_counts:"+branches+".",
   visionBrief,
   "Recommend the next lawful, accurately sourced uniform uploads from real gaps; if insufficient evidence, say so. Your suggestions are private and need owner approval."
  ].join(" ");
 }
 // Fictional journal retrieval: Supabase RLS + owner verified access enforce
 // privacy. We send only a short relevant excerpt to Gunner's existing Dolphin
 // service. No new model, paid embedding call, or live media access.
 let journalBrief="";
 const journalCue=/\\b(1999|journal|diary|memory|remember|recall|history|first met|we met|meet|meeting|veterans|marines?|corps|sheriff|corrections|uniforms?|ledger|quota|missed|catch.?up|collection)\\b/i;
 if(journalCue.test(message)){
  const isMeeting=/\\b(meet|met|meeting|first time|first contact)\\b/i.test(message);
  const isMissed=/\\b(miss(?:ed|ing)?|catch.?up|quota|target)\\b/i.test(message);
  const numbered=message.match(/\\b(?:journal\\s*)?(?:page|entry)\\s*(\\d{1,2})\\b/i);
  const requested=numbered?Number(numbered[1]):null;
  const entryNo=requested&&requested>=1&&requested<=60?requested:
   isMeeting?1:isMissed?14:null;
  const terms=isMeeting?"The Man at the Display Case":
   isMissed?"The First Missed Target":message.slice(0,240);
  try{
   const {data:memories,error:recallError}=await client.rpc("blackcell_gunner_journal_recall",{
    p_question:terms,p_limit:entryNo?1:2,p_entry_no:entryNo
   });
   if(recallError)console.warn("Gunner journal recall unavailable",{code:recallError.code||"UNKNOWN"});
   else if(Array.isArray(memories)&&memories.length){
    const fragments=memories.slice(0,2).map(row=>
     "Entry "+Number(row.entry_no)+" ("+cut(row.entry_date,12)+"), "+
     cut(row.title,110)+": "+String(row.excerpt||"").replace(/\\s+/g," ").slice(0,400));
    journalBrief="[PRIVATE FICTIONAL JOURNAL EXCERPT: Proposed Gunner 1999 story canon, NOT a real historical record of the owner. Remain in Gunner's established voice. Modern upload counts and quotas must come from verified live BLACKCELL stats, not fictional 1999 ledger numbers.] "+
     fragments.join(" | ");
   }
  }catch(e){console.warn("Gunner journal retrieval issue",{kind:e?.name||"Error"})}
 }
 // Always preserve the owner's question and keep existing collection metrics.
 // Context is bounded for Dolphin's established message-size limit.
 const messageTail="\\nOwner question: "+message.slice(0,500);
 const space=Math.max(0,1540-messageTail.length);
 const contextParts=collectionBrief||journalBrief?[
  ...(collectionBrief?[collectionBrief.slice(0,journalBrief?Math.min(620,space):space)]:[]),
  ...(journalBrief?[journalBrief.slice(0,collectionBrief?Math.min(520,Math.max(0,space-620)):space)]:[])
 ]:[];
 const context=contextParts.join("\\n");
 const richMessage=context?
  context.slice(0,space)+messageTail:message;
 const payload={action:"start",message:richMessage,photo_context:photoContext,
  page_title:cut(input.page_title||"Military Library",100),
  countries:Array.isArray(input.countries)?input.countries.filter(c=>typeof c==="string"&&/^[A-Z]{2}$/.test(c)).slice(0,12):[],
  history:(recent||[]).reverse().map(r=>({role:r.role,content:cut(r.content,1100)}))};
 let bridge;
 try{bridge=await gunnerRequest(token,payload)}
 catch(e){console.error("Original Dolphin RunPod bridge error",e?.name);
  return respond({error:"Original Gunner service cannot be reached; no alternate model used"},503,origin)}
 if(bridge.status!==200)return respond({error:cut(bridge.body?.error||"Original Dolphin model unavailable",240)},bridge.status,origin);
 if(bridge.body.status!=="pending"||!UUID.test(bridge.body.bridge_job_id))
  return respond({error:"Original Dolphin service did not return a valid pending job"},502,origin);
 const id=bridge.body.bridge_job_id;
 const {error:saveError}=await client.from("corp_social_gunner_messages").insert({
  user_id:user.id,role:"user",content:message,bridge_job_id:id,photo_id:photoId||null
 });
 if(saveError)console.error("Gunner history pending write issue",saveError.code);
 return respond({ok:true,status:"pending",bridge_job_id:id,
  runpod_status:bridge.body.runpod_status||"IN_QUEUE",provider:"Dolphin 3.0 / RunPod",
  ...(saveError?{notice:"Dolphin started but your message history may not be saved."}:{})},200,origin);
});