import { createClient } from "npm:@supabase/supabase-js@2.80.0";
import { Buffer } from "node:buffer";

/* BLACKCELL military image classifier: verified member, photo owner,
   explicit request only, private storage, human approval required. */
const ORIGINS=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const BRANCHES=new Set(["Unspecified","Army","Navy","Marine Corps","Naval Infantry","Special Operations","Air Force","Space Force","Coast Guard","National Guard","Joint / Multinational","Other"]);
const CATEGORIES=new Set(["Unsorted","Personnel","Uniforms","Insignia","Equipment","Ground Vehicles","Aircraft","Naval Vessels","Facilities","Training","Fitness / Exercise","Operations","Ceremonies","Historical","Other"]);
const FOCUS=new Set(["All","Tactical","Dress","Portraits","Training","Fitness","Operations"]);
const MIMES=new Set(["image/jpeg","image/png","image/webp","image/gif"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODEL=Deno.env.get("OPENAI_VISION_MODEL")||"gpt-4.1-mini";
const KEY=Deno.env.get("OPENAI_API_KEY")||"";
const MAX_DIRECT_IMAGE=10*1024*1024;
const MAX_ORIGINAL_UPLOAD=45*1024*1024;
const MAX_ANALYSIS_PREVIEW=3*1024*1024;
const UPLOAD_MIMES=new Set([...MIMES,"image/heic"]);
function cors(origin){return {"Access-Control-Allow-Origin":ORIGINS.has(origin||"")?origin:"https://blackcellcorp.com","Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"}}
function response(obj,status=200,origin=null){return new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...cors(origin)}})}
function clip(x,n){return String(x??"").trim().slice(0,n)}
function normalized(input){
 const country_code=clip(input.country_code,2).toUpperCase();
 let military_branch=clip(input.military_branch,100);
 if(military_branch==="Naval Infantry / Marines")military_branch="Naval Infantry";
 const military_category=clip(input.military_category,100);
 const focus=clip(input.focus,80),confidence=clip(input.confidence,20).toLowerCase();
 const nudity=clip(input.nudity_level,30).toLowerCase();
 const visual_focus=clip(input.visual_focus,40).toLowerCase();
 return {
  country_code:/^[A-Z]{2}$/.test(country_code)?country_code:"",
  military_branch:BRANCHES.has(military_branch)?military_branch:"Unspecified",
  military_category:CATEGORIES.has(military_category)?military_category:"Unsorted",
  uniform_type:clip(input.uniform_type,160),camouflage_pattern:clip(input.camouflage_pattern,160),
  focus:FOCUS.has(focus)?focus:"All",
  confidence:["low","medium","high"].includes(confidence)?confidence:"low",
  nudity_level:["none","partial","genitals_visible","unknown"].includes(nudity)?nudity:"unknown",
  visual_focus:["unknown","full_body","portrait","rear_view_clothed","front_waist_clothed","uniform_detail","other"].includes(visual_focus)?visual_focus:"unknown",
  notes:clip(input.notes,1200),
  tags:[...new Set(Array.isArray(input.tags)?input.tags.map(x=>clip(x,40)).filter(Boolean):[])].slice(0,15)
 };
}
const schema={
 type:"object",additionalProperties:false,
 properties:{
  country_code:{type:"string"},military_branch:{type:"string"},
  military_category:{type:"string"},uniform_type:{type:"string"},
  camouflage_pattern:{type:"string"},focus:{type:"string"},
  confidence:{type:"string",enum:["low","medium","high"]},
  nudity_level:{type:"string",enum:["none","partial","genitals_visible","unknown"]},
  visual_focus:{type:"string",enum:["unknown","full_body","portrait","rear_view_clothed","front_waist_clothed","uniform_detail","other"]},
  notes:{type:"string"},tags:{type:"array",items:{type:"string"}}
 },
 required:["country_code","military_branch","military_category","uniform_type","camouflage_pattern","focus","confidence","nudity_level","visual_focus","notes","tags"]
};
const instructions="Act as a careful visual military uniform cataloguer, using visible evidence only. Return only structured field values. Allowed branch values: Unspecified, Army, Navy, Marine Corps, Naval Infantry, Special Operations, Air Force, Space Force, Coast Guard, National Guard, Joint / Multinational, Other. Allowed category values: Unsorted, Personnel, Uniforms, Insignia, Equipment, Ground Vehicles, Aircraft, Naval Vessels, Facilities, Training, Fitness / Exercise, Operations, Ceremonies, Historical, Other. Allowed focus: All, Tactical, Dress, Portraits, Training, Fitness, Operations. Fitness / Exercise is for visible workouts such as pull-ups, running, weightlifting and stretching, even when military-style clothing is worn. Training is ONLY for recognizable military drills or confirmed training activities, not generic exercise. Prioritize what the image visibly shows over inferred military context. A person doing pull-ups near tents is performing exercise; do not assume those are military tents or military training. Describe generic camo clothing as military-style clothing unless a real uniform has clear identifying evidence. Prefer Fitness / Exercise when the image shows exercise without evidence of military-specific training. Do not infer military affiliation from clothing. Describe the activity and clothing separately. Country and branch are separate decisions: a generic Marine Corps designation does NOT prove that a photograph shows the United States, because many countries have marine forces. However, do not miss specific and clearly readable U.S. Marine Corps markers. If the image clearly displays a United States Marine Corps Eagle Globe and Anchor insignia, an identifiable U.S. Marine Corps emblem or a readable USMC / U.S. Marines / United States Marines uniform marking, use military_branch Marine Corps and country_code US for the uniform or unit depicted, explaining precisely which visible marking supports it. A U.S. flag together with unambiguous Marine Corps identifiers is also strong supporting evidence. USMC distinctive MARPAT and the Marine Corps Combat Utility Uniform can corroborate a U.S. uniform identification, but camouflage color, generic digital patterns, combat boots, plain green shirts, or the word Marines on their own cannot establish country with confidence. If a marking is too small, distorted, or ambiguous, do not pretend it is readable: leave country_code empty and state why. Classify the uniform or depicted military symbol only, never claim the photographed person actually serves in the military. ISO 3166 two-letter country_code or empty string when uncertain. Separate older US BDU from MCCUU and MARPAT, which are not interchangeable. Uniform may be cosplay, fashion, reenactment, or airsoft. Don't identify a real person, guess actual service status, age, sexuality, ethnicity, affiliation, or identity. Don't provide operational detail, sensitive installations, or tactics. Don't infer country, unit, or branch from camouflage alone. Prefer unknowns and low confidence. Concise notes should explain only visible evidence, ambiguity, and uncertainty. For neutral content metadata, nudity_level must be none when none is visible, partial when non-genital nudity is visible, genitals_visible only when distinctly visible, or unknown when unclear. This is a visual label and never verifies age or consent. Keep nudity descriptions strictly factual, non-erotic, and brief. Do not comment on sexual attractiveness or invent sexual activity. If visual-content identification cannot be done, select unknown; do not invent evidence. For neutral clothing and photo composition, visual_focus must be one of unknown, full_body, portrait, rear_view_clothed (back view with clothing), front_waist_clothed (front of clothing around waist), uniform_detail, other. This is a visual description of composition, not a statement about the person or viewers\u0027 arousal, interests, or sexuality. Avoid applying these anatomical focus labels to photographs of minors or when age is uncertain; use unknown instead. Use 5-12 concise evidence-based tags covering visible activity (e.g. pull-ups), clothing, camouflage if discernible, equipment, setting, pose and camera view. If clearly visible, include a factual hairstyle tag distinguishing 'bald head', 'shaved head', 'high-and-tight haircut', 'buzz cut', 'crew cut', or 'fade haircut'. Only use a specific hairstyle label when image detail independently supports it; otherwise prefer 'short hair' or omit hairstyle. Also describe visible clothing details as separate neutral tags when clearly identifiable: 'belt', 'belt buckle', 'shirt', 'uniform shirt', 'shirt fit', 'tucked shirt', 'rolled-up sleeves', 'sleeves down', and 'clothed rear view'. A military uniform shirt and rolled-up sleeves are different attributes and can both be true in one image. A belt does not prove a uniform, and a uniform does not prove a specific country. When these details are unclear, omit the tag rather than guessing. A bald scalp and a closely shaved head can look similar, so do not pretend to know the cause of hairlessness. Haircuts do not prove military affiliation or nationality. Do not infer the viewer's preferences from image content; personal preference is provided only by the user. Do not place user preference, perceived attractiveness, sexuality or ethnicity in photo tags. When a camouflage pattern cannot be securely identified, use a generic pattern description rather than a precise unsupported name. In notes, first explain concrete visible features; then state important uncertainties. Tags: generic descriptive terms.";
function detectMime(buffer){
 const b=new Uint8Array(buffer,0,Math.min(16,buffer.byteLength));
 if(b[0]===255&&b[1]===216&&b[2]===255)return "image/jpeg";
 if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)return "image/png";
 if(String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP")return "image/webp";
 if(String.fromCharCode(...b.slice(0,3))==="GIF")return "image/gif";
 return "";
}

/* Owner-specific correction memory. This is contextual learning, not weight training. */
function memorySafe(value,max=65){
 return clip(value,max).replace(/[^a-zA-Z0-9\s/(),.+_-]/g," ").replace(/\s+/g," ").trim();
}
function memoryTokens(value){
 const stop=new Set(["img","image","photo","picture","file","jpg","jpeg","png","gif","webp","the","and","with","from","this","that","military","person","man","male"]);
 return new Set(memorySafe(value,180).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=3&&!stop.has(x)));
}
function approvedMemory(rows,filename){
 const keys=memoryTokens(filename);
 const examples=(rows||[]).map(x=>{
  const safeTags=(Array.isArray(x.tags)?x.tags:[]).map(t=>memorySafe(t,35)).filter(t=>t.length>2).slice(0,8);
  const label={
   country_code:memorySafe(x.country_code,2).toUpperCase(),
   branch:memorySafe(x.military_branch,45),
   category:memorySafe(x.military_category,50),
   uniform:memorySafe(x.uniform_type,70),
   camouflage:memorySafe(x.camouflage_pattern,55),
   tags:safeTags
  };
  const raw=x.original_suggestion&&typeof x.original_suggestion==="object"?x.original_suggestion:{};
  const corrected={};
  for(const [key,oldKey] of [["country_code","country_code"],["branch","military_branch"],["category","military_category"],["uniform","uniform_type"],["camouflage","camouflage_pattern"]]){
   if(typeof raw[oldKey]==="string" && memorySafe(raw[oldKey],100).toLowerCase()!==String(label[key]).toLowerCase())corrected[key]=label[key];
  }
  const overlap=[...memoryTokens([label.uniform,label.camouflage,label.category,...safeTags].join(" "))].filter(t=>keys.has(t)).length;
  return {label,corrected,overlap,changes:Object.keys(corrected).length};
 });
 examples.sort((a,b)=>(b.overlap*15+b.changes*2)-(a.overlap*15+a.changes*2));
 const chosen=examples.slice(0,4);
 const references=chosen.map((x,i)=>({
  example:i+1,owner_approved:x.label,
  ...(x.changes?{reviewer_corrected_these_fields:x.corrected}:{})
 }));
 return {
  used:references.length, approved:examples.length, corrections:examples.filter(x=>x.changes>0).length,
  text:references.length?"\nPREVIOUS OWNER-APPROVED CLASSIFICATIONS FROM OTHER PHOTOGRAPHS (editorial examples only): "+
   JSON.stringify(references)+
   "\nUse these examples to learn this library's distinctions and past corrections. They are NOT evidence about the current photo. Never copy country, branch, unit, or camouflage unless independently visible in the new image. Do not assume every Marine Corps label means US. If unclear, leave country unknown.": ""
 };
}


/* Optional owner-requested VISUAL preference localization.
   Uses one paid image inference only after a direct user click. */
const PRED_CUES=new Set([
 "uniform_fit","camouflage","boots","physique","pose","exercise","expression",
 "rear_view_clothed","front_waist_clothed","photo_angle","equipment","environment",
 "arms","shoulders","torso","legs","hands","hair_bald","hair_shaved","hair_high_tight",
 "hair_buzz","hair_crew","hair_fade","clothed_backside","belt","belt_buckle",
 "shirt","uniform_shirt","shirt_fit","shirt_tucked","sleeves_rolled","sleeves_down"
]);
const predictedRegionSchema={
 type:"object",additionalProperties:false,
 properties:{
  x:{type:"number"},y:{type:"number"},w:{type:"number"},h:{type:"number"},
  cue:{type:"string"},reason:{type:"string"},confidence:{type:"string",enum:["low","medium","high"]}
 },required:["x","y","w","h","cue","reason","confidence"]
};
const interestSchema={
 type:"object",additionalProperties:false,
 properties:{
  summary:{type:"string"},no_visible_match:{type:"boolean"},
  regions:{type:"array",items:predictedRegionSchema}
 },required:["summary","no_visible_match","regions"]
};
function normalizePrediction(x,allowed){
 if(!x||typeof x!=="object"||!allowed.includes(String(x.cue)))return null;
 const numbers=["x","y","w","h"].map(k=>Number(x[k]));
 if(numbers.some(v=>!Number.isFinite(v)))return null;
 let [a,b,w,h]=numbers;
 a=Math.min(.98,Math.max(0,a));b=Math.min(.98,Math.max(0,b));
 w=Math.min(1-a,Math.max(.015,w));h=Math.min(1-b,Math.max(.015,h));
 if(w<.015||h<.015)return null;
 return {
  x:Math.round(a*10000)/10000,y:Math.round(b*10000)/10000,
  w:Math.round(w*10000)/10000,h:Math.round(h*10000)/10000,
  cue:clip(x.cue,50),detail:clip(x.reason,120),
  confidence:["low","medium","high"].includes(x.confidence)?x.confidence:"low"
 };
}
async function predictInterest({client,user,asset,input,origin}){
 if(!KEY)return response({error:"Visual prediction service is not configured"},503,origin);
 const {data:tastes,error:tasteError}=await client.from("corp_social_photo_tastes")
   .select("reaction,rating,cues,regions").eq("user_id",user.id)
   .order("updated_at",{ascending:false}).limit(50);
 if(tasteError)return response({error:"Could not read private photo preferences"},403,origin);
 const weights=new Map();
 for(const row of tastes||[]){
  const positive=row.reaction==="more"||(row.reaction!=="less"&&Number(row.rating)>=4);
  const negative=row.reaction==="less"||(Number(row.rating)>0&&Number(row.rating)<=2);
  const weight=positive?2:negative?-2:0;
  if(!weight)continue;
  const mentioned=new Set([...(Array.isArray(row.cues)?row.cues:[]),
   ...(Array.isArray(row.regions)?row.regions.flatMap(r=>[r.cue,...(Array.isArray(r.features)?r.features:[])]):[])]);
  for(const cue of mentioned)if(PRED_CUES.has(cue))weights.set(cue,(weights.get(cue)||0)+weight);
 }
 // Human-confirmed or rejected visual predictions are valuable feedback.
 // They affect the next opt-in call; guesses with no feedback never count as truth.
 const {data:priorVotes,error:votesError}=await client.from("corp_social_photo_interest_predictions")
  .select("prediction_regions,region_feedback").eq("user_id",user.id)
  .order("updated_at",{ascending:false}).limit(50);
 if(!votesError)for(const prediction of priorVotes||[]){
  const votes=prediction.region_feedback||{};
  for(const [index,choice] of Object.entries(votes)){
   const cue=(prediction.prediction_regions||[])[Number(index)]?.cue;
   if(!PRED_CUES.has(cue))continue;
   if(choice==="yes")weights.set(cue,(weights.get(cue)||0)+3);
   else if(choice==="no")weights.set(cue,(weights.get(cue)||0)-3);
  }
 }
 const wanted=[...weights].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]);
 if(!wanted.length)return response({error:"First rate a photograph and select Show More Like This, with at least one feature label. Predictions use your actual feedback.",code:"PREDICTION_NEEDS_TASTES"},409,origin);
 const {data:prior,error:priorError}=await client.from("corp_social_photo_interest_predictions")
   .select("attempts,updated_at").eq("user_id",user.id).eq("asset_id",asset.id).maybeSingle();
 if(priorError)return response({error:"Could not check prediction history"},500,origin);
 if(prior?.attempts>=3)return response({error:"This photograph has reached its three-prediction limit. Review or correct the existing prediction.",code:"PREDICTION_PHOTO_CAP"},429,origin);
 if(prior&&Date.now()-Date.parse(prior.updated_at)<30000)
  return response({error:"Wait 30 seconds before generating another paid prediction for this photograph."},429,origin);
 const {count,error:quotaError}=await client.from("corp_social_photo_interest_predictions")
   .select("asset_id",{count:"exact",head:true}).eq("user_id",user.id)
   .gte("created_at",new Date(Date.now()-86400000).toISOString());
 if(quotaError)return response({error:"Could not verify visual prediction test limit"},500,origin);
 if(!prior&&(count||0)>=15)return response({error:"Visual prediction test limit of 15 different photographs per 24 hours reached. Your saved preferences and manual area feedback are still available.",code:"PREDICTION_DAILY_CAP"},429,origin);
 const prefix="data:image/jpeg;base64,",preview=String(input.preview_image||"");
 if(!preview.startsWith(prefix)||preview.length>4_200_000)
  return response({error:"Provide an optimized JPEG image preview under 3 MB for prediction. Your stored original remains unchanged."},422,origin);
 const raw=preview.slice(prefix.length);
 if(!raw||!(/^[A-Za-z0-9+/]*={0,2}$/.test(raw))||raw.length%4===1)
  return response({error:"Invalid private JPEG preview"},422,origin);
 const buffer=Buffer.from(raw,"base64");
 if(!buffer.length||buffer.length>MAX_ANALYSIS_PREVIEW||detectMime(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength))!=="image/jpeg")
  return response({error:"A valid JPEG preview smaller than 3 MB is required"},422,origin);
 const prompt=
 "Predict which specific visible areas of this photographed scene might interest the viewer, based ONLY on these explicitly selected and positively rated feature labels: "+
 JSON.stringify(wanted)+". "+
 "The viewer controls these preferences. Never infer sexuality, identity, intent, arousal, ethnicity, personal history, or service status. "+
 "Look at this NEW image and visually locate up to three of the requested cues IF actually visible. "+
 "Return approximate bounding boxes normalized to x,y,width,height fractions from 0 to 1 of the whole image; x,y indicate top left. "+
 "Every box must enclose the particular visual detail named by cue. "+
 "Only choose cue strings from the supplied list, not similar guesses. For example, a short haircut is not definitely a high-and-tight; a belt does not prove a uniform. "+
 "Do not hallucinate features or place generic boxes over unrelated areas. If no requested feature is visible, set no_visible_match true and regions empty. "+
 "State uncertainty succinctly, avoid definitive claims about viewer reactions. Never highlight nudity, intimate areas, or people who could be minors. "+
 "Output at most three distinct predictions. JSON fields: summary,no_visible_match,regions with x,y,w,h,cue,reason,confidence.";
 let parsed;
 try{
  const res=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",signal:AbortSignal.timeout(45000),
   headers:{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"},
   body:JSON.stringify({model:MODEL,store:false,max_output_tokens:600,
    input:[{role:"user",content:[{type:"input_text",text:prompt},
      {type:"input_image",image_url:preview,detail:"high"}]}],
    text:{format:{type:"json_schema",name:"blackcell_photo_interest_regions",strict:true,schema:interestSchema}}
   })
  });
  const payload=await res.json();
  if(!res.ok){
   const code=String(payload?.error?.code||"");
   if(code==="credit_balance_exhausted")return response({error:"OpenAI API credits exhausted. Your previous preference ratings remain saved.",code:"AI_CREDITS_EXHAUSTED"},402,origin);
   if(res.status===429)return response({error:"OpenAI provider spending or rate limit reached; please try again later.",code:"AI_PROVIDER_LIMIT"},429,origin);
   return response({error:"Visual prediction service failed. No feedback changed."},502,origin);
  }
  const output=payload.output_text||payload.output?.flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("")||"";
  if(!output)return response({error:"No visual prediction returned"},502,origin);
  parsed=JSON.parse(output);
 }catch(e){
  console.error("Blackcell interest localization error",{kind:e?.name||"Error"});
  return response({error:"Visual prediction failed or timed out; original photo unchanged"},502,origin);
 }
 const regions=(Array.isArray(parsed?.regions)?parsed.regions:[]).slice(0,3)
  .map(x=>normalizePrediction(x,wanted)).filter(Boolean);
 const payload={
  user_id:user.id,asset_id:asset.id,prediction_regions:regions,
  summary:clip(parsed?.summary,500)||"Based on your selected photo features, these areas may appeal to you.",
  region_feedback:{},attempts:(prior?.attempts||0)+1,model:MODEL,
  updated_at:new Date().toISOString()
 };
 const {data:saved,error:saveError}=await client.from("corp_social_photo_interest_predictions")
  .upsert(payload,{onConflict:"user_id,asset_id"}).select("asset_id,prediction_regions,summary,attempts,region_feedback,updated_at").single();
 if(saveError){
  console.error("Visual prediction save blocked",{code:saveError.code});
  return response({error:"Prediction was generated but could not be saved to your private account. The original photo was unchanged."},500,origin);
 }
 return response({ok:true,prediction:saved,note:"Image-based predictions are approximate and may be incorrect. Confirm or reject each region to improve later suggestions."},200,origin);
}

Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(!["GET","POST"].includes(req.method))return response({error:"Method not allowed"},405,origin);
 const bearer=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+/i.test(bearer))return response({error:"Corporate sign-in required"},401,origin);
 const url=Deno.env.get("SUPABASE_URL");
 let pub=Deno.env.get("SUPABASE_ANON_KEY");
 if(!pub){try{pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default}catch(_){}}
 if(!url||!pub)return response({error:"Service configuration unavailable"},503,origin);
 const client=createClient(url,pub,{global:{headers:{Authorization:bearer}},auth:{autoRefreshToken:false,persistSession:false}});
 const {data:{user},error:authError}=await client.auth.getUser();
 if(authError||!user)return response({error:"Corporate session not verified"},401,origin);
 if(req.method==="GET")return response({ok:true,configured:!!KEY},200,origin);
 let input;
 try{input=await req.json()}catch(_){return response({error:"Valid JSON required"},400,origin)}
 if(!["analyze","predict_interest","analyze_uniform"].includes(String(input?.action||""))||!UUID.test(String(input?.asset_id||"")))return response({error:"Select a valid photograph and action"},400,origin);
 const assetId=String(input.asset_id);
 const {data:asset,error:findError}=await client.from("corp_social_assets").select("id,owner_id,kind,purpose,mime_type,bytes,storage_path,filename,adult_restricted,review_status,source_provider")
  .eq("id",assetId).eq("owner_id",user.id).maybeSingle();
 if(findError||!asset||asset.kind!=="photo"||!["post","library"].includes(asset.purpose))
  return response({error:"Only your own authorized photographs can be analyzed"},403,origin);
 if(!KEY)return response({error:"AI service key not configured. Set OPENAI_API_KEY in Supabase Edge Function Secrets.",code:"AI_NOT_CONFIGURED"},503,origin);
 if(!UPLOAD_MIMES.has(asset.mime_type)||asset.bytes>MAX_ORIGINAL_UPLOAD||asset.bytes<1)
  return response({error:"Only supported photo uploads up to 45 MB can be analyzed."},422,origin);
 if(input.action==="predict_interest")return await predictInterest({client,user,asset,input,origin});
 if(input.action==="analyze_uniform"){
  const {data:member,error:memberError}=await client.from("corp_access_members").select("role,active,clearance_level").eq("user_id",user.id).maybeSingle();
  const verified=await client.rpc("corp_code_status");
  if(memberError||member?.role!=="owner"||member.active!==true||Number(member.clearance_level)!==7||verified.error||verified.data?.verified!==true||asset.purpose!=="library"||asset.adult_restricted!==false||asset.review_status!=="approved")
   return response({error:"Uniform sorting requires an approved non-restricted photo owned by the verified Level 7 administrator."},403,origin);
 }
 const {data:previous,error:oldErr}=await client.from("corp_social_ai_analysis").select("id,attempts,updated_at")
  .eq("asset_id",assetId).eq("owner_id",user.id).maybeSingle();
 if(oldErr)return response({error:"Could not read analysis history"},500,origin);
 if(previous){
  if(Date.now()-Date.parse(previous.updated_at)<45000)return response({error:"Please wait 45 seconds before re-analyzing the same photograph"},429,origin);
  if(previous.attempts>=5)return response({error:"This photo has reached its five-analysis limit. Review the existing suggestion."},429,origin);
 }
 // The daily cap applies to distinct AI-analyzed photos, not manual reviews.
 // Re-analysis of an existing photo retains the separate five-attempt/photo safeguard.
 const MAX_DISTINCT_PHOTOS_24H=60;
 const {count,error:limitErr}=await client.from("corp_social_ai_analysis").select("id",{count:"exact",head:true})
  .eq("owner_id",user.id).gte("created_at",new Date(Date.now()-86400000).toISOString())
  .gt("attempts",0).neq("model","manual-review");
 if(limitErr)return response({error:"Cannot verify daily AI test quota"},500,origin);
 if((count||0)>=MAX_DISTINCT_PHOTOS_24H&&!previous)return response({
  error:"Blackcell's daily AI test limit of "+MAX_DISTINCT_PHOTOS_24H+" distinct photographs per rolling 24 hours has been reached. Your upload is saved. You can use Manual Review without API credits or analyze it when the limit resets.",
  code:"AI_DAILY_CAP",cap:MAX_DISTINCT_PHOTOS_24H,count:count||0
 },429,origin);
 let memory={text:"",used:0,approved:0,corrections:0};
 try{
  const {data:approved,error:memoryError}=await client.from("corp_social_ai_analysis")
   .select("country_code,military_branch,military_category,uniform_type,camouflage_pattern,tags,original_suggestion,updated_at")
   .eq("owner_id",user.id).eq("status","approved").neq("asset_id",assetId)
   .order("updated_at",{ascending:false}).limit(40);
  if(memoryError)console.warn("Approved classification memory unavailable",{code:memoryError.code});
  else memory=approvedMemory(approved||[],asset.filename||"");
 }catch(_){console.warn("Classification memory could not be loaded; proceeding without examples")}

 // An image over 10 MB is never replaced or resized in Storage.
 // Its owner supplies a reduced JPEG analysis copy generated locally in the browser.
 // Only an owned, verified asset can be tagged; labels still require owner approval.
 let file,mime;
 if(typeof input.preview_image==="string"){
  const dataUrl=input.preview_image;
  const prefix="data:image/jpeg;base64,";
  if(!dataUrl.startsWith(prefix)||dataUrl.length>4_200_000)
   return response({error:"Analysis preview must be a JPEG under 3 MB."},422,origin);
  const encoded=dataUrl.slice(prefix.length);
  if(!encoded||!(/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))||encoded.length%4===1)
   return response({error:"Invalid analysis preview."},422,origin);
  const preview=Buffer.from(encoded,"base64");
  if(preview.length===0||preview.length>MAX_ANALYSIS_PREVIEW)
   return response({error:"Analysis preview exceeds 3 MB."},422,origin);
  const ab=preview.buffer.slice(preview.byteOffset,preview.byteOffset+preview.byteLength);
  if(detectMime(ab)!=="image/jpeg")
   return response({error:"Analysis preview must contain JPEG image data."},422,origin);
  file=ab;mime="image/jpeg";
 }else{
  if(asset.bytes>MAX_DIRECT_IMAGE||!MIMES.has(asset.mime_type))
   return response({error:"A smaller JPEG analysis preview is needed for this photo. The full-resolution original remains stored."},422,origin);
  // World Media originals are privately stored in Bunny, not Supabase Storage.
  // Retrieve through the existing authenticated proxy with the same user's JWT.
  if(asset.source_provider==="world-bunny-v1"){
   if(asset.purpose!=="library")return response({error:"The private World Media reader requires a library photo"},403,origin);
   let original;
   try{
    const readerUrl=new URL("/functions/v1/blackcell-world-media?action=read",url);
    original=await fetch(readerUrl,{method:"POST",signal:AbortSignal.timeout(90000),
     headers:{"Authorization":bearer,"apikey":pub,"Content-Type":"application/json"},
     body:JSON.stringify({id:asset.id})});
   }catch(_){
    return response({error:"Private Bunny photo reader is temporarily unavailable. Your original remains securely stored.",code:"BUNNY_READ_UNAVAILABLE"},502,origin);
   }
   if(!original.ok){
    return response({error:original.status===401||original.status===403?
      "Corporate authorization for the private photo must be refreshed.":
      "The private Bunny photo could not be retrieved. Your original remains securely stored.",
     code:"BUNNY_READ_FAILED"},original.status===401||original.status===403?403:502,origin);
   }
   if(Number(original.headers.get("content-length")||0)>MAX_DIRECT_IMAGE)
    return response({error:"Original exceeds 10 MB; supply a reduced JPEG analysis preview."},422,origin);
   file=await original.arrayBuffer();
   if(file.byteLength>MAX_DIRECT_IMAGE)return response({error:"Original exceeds 10 MB; supply a reduced JPEG analysis preview."},422,origin);
  }else{
   const {data:blob,error:readErr}=await client.storage.from("corp-social-media").download(asset.storage_path);
   if(readErr||!blob)return response({error:"Cannot securely read the original photo from legacy storage"},403,origin);
   if(blob.size>MAX_DIRECT_IMAGE)return response({error:"Original exceeds the direct-analysis limit. Supply a reduced JPEG analysis preview."},422,origin);
   file=await blob.arrayBuffer();
  }
  mime=detectMime(file);
  if(!mime)return response({error:"Unsupported image format"},422,origin);
 }
 let ai;
 try{
  const result=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",signal:AbortSignal.timeout(45000),
   headers:{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"},
   body:JSON.stringify({model:MODEL,store:false,max_output_tokens:700,
    input:[{role:"user",content:[{type:"input_text",text:input.action==="analyze_uniform" ? "Catalog the visible UNIFORM or clothing, without identifying any person, assuming their real employment, or inferring sensitive traits. Choose EXACTLY ONE classification tag from maf:military, maf:police, maf:fire, maf:medical, maf:security (corrections or security), maf:professional (airline pilot or other civilian professional uniform), maf:unsorted. Use maf:unsorted for ordinary clothes, ambiguous uniforms, conflicting cues, or low confidence. Distinguish a firefighter from a paramedic and a police uniform from a corrections uniform using visible markings. Return the selected maf tag in tags; set confidence high only for clear visual evidence, medium for reasonable visual clues, low when unsure. If the image is not a clearly clothed non-explicit uniform photograph, set maf:unsorted and low confidence. For nonmilitary uniforms set military_branch Unspecified and country_code empty. Describe the clothing only in uniform_type; do not infer identity or private characteristics. Return the required schema fields, using empty strings and Unsorted or unknown for irrelevant values." : instructions+memory.text},
      {type:"input_image",image_url:"data:"+mime+";base64,"+Buffer.from(file).toString("base64"),detail:"auto"}]}],
    text:{format:{type:"json_schema",name:"blackcell_military_photo",strict:true,schema}}})
  });
  const payload=await result.json();
  if(!result.ok){
   console.error("Vision provider failed",{status:result.status,code:payload?.error?.code});
   const code=String(payload?.error?.code||"");
   if(code==="credit_balance_exhausted")return response({
    error:"OpenAI API credits are exhausted. Add credits to your OpenAI Platform API billing account, then retry. Your original photo is saved, and no AI tags were changed.",
    code:"AI_CREDITS_EXHAUSTED"
   },402,origin);
   if(code==="organization_usage_limit_exceeded"||code==="organization_spend_limit_exceeded"||code==="project_spend_limit_exceeded")
    return response({error:"OpenAI API usage/spending limit reached. Review your OpenAI Platform organization and project limits before retrying.",code:"AI_SPEND_LIMIT"},429,origin);
   return response({error:result.status===401?"AI provider key rejected":result.status===429?"OpenAI API request rate limit reached; try again later.":"AI provider could not analyze this image",code:"AI_PROVIDER_ERROR"},502,origin);
  }
  const output=payload.output_text||payload.output?.flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("")||"";
  if(!output)return response({error:"AI returned no classification"},502,origin);
  ai=normalized(JSON.parse(output));
 }catch(e){
  console.error("Vision analysis failed",{kind:e?.name||"Error"});
  return response({error:"Analysis failed or timed out; no classifications changed"},502,origin);
 }
 const record={owner_id:user.id,asset_id:asset.id,status:"suggested",...ai,model:MODEL,
  original_suggestion:ai,learned_from_count:memory.used,
  attempts:(previous?.attempts||0)+1,updated_at:new Date().toISOString()};
 const {data:saved,error:saveError}=await client.from("corp_social_ai_analysis").upsert(record,{onConflict:"owner_id,asset_id"})
  .select("id,asset_id,owner_id,status,country_code,military_branch,military_category,uniform_type,camouflage_pattern,focus,confidence,nudity_level,visual_focus,notes,tags,model,attempts,created_at,updated_at").single();
 if(saveError){
  console.error("Could not store AI review",{message:saveError.message});
  return response({error:"AI result could not be saved. Approved classification remains untouched."},500,origin);
 }
 return response({ok:true,analysis:saved,learning:{approved_examples_available:memory.approved,examples_consulted:memory.used,prior_corrected_examples:memory.corrections},notice:"Owner-approved examples guide suggestions, but model weights are not retrained."},200,origin);
});