/* BLACKCELL / USA PHOTO OF THE DAY
   Personalized, no paid image-analysis calls. Uses existing voluntary photo
   feedback + metadata, and owner-only daily pick records enforced by RLS.
   Never expose Supabase secret keys, inferred sensitive traits or other
   people's private feedback. */
export function createUsaPhotoOfDay({client,getUser,getAssets,getSignedUrl,openAsset}){
 const $=id=>document.getElementById(id);
 const DAILY_TABLE="corp_social_daily_photo_picks";
 const TASTE_TABLE="corp_social_photo_tastes";
 const FAVE_TABLE="corp_social_photo_favorites";
 const PREF_TABLE="corp_social_discovery_preferences";
 const cuePatterns={
  uniform_fit:/uniform|fatigue|dress|utility|shirt|trouser|bdu|acu|mccuu|marpat/i,
  camouflage:/camo|camouflage|woodland|marpat|desert|multicam/i,
  boots:/\bboots?\b|footwear/i,
  belt:/\bbelt\b|waist/i,
  shirt:/\bshirt\b|uniform|utility/i,
  uniform_shirt:/uniform.*shirt|combat shirt|utility shirt|fatigue/i,
  shirt_tucked:/tucked|shirt.*waist/i,
  sleeves_rolled:/rolled.*sleeve|sleeve.*rolled/i,
  sleeves_down:/long sleeve|sleeves down/i,
  physique:/fitness|athletic|physique|weightlift|training/i,
  pose:/posture|pose|standing|portrait/i,
  exercise:/exercise|workout|training|pt\b|fitness/i,
  expression:/face|expression|portrait/i,
  hair_buzz:/buzz|crew cut|short hair/i,
  hair_high_tight:/high.and.tight/i,
  equipment:/gear|equipment|tactical|vest|helmet|ruck/i,
  environment:/outdoor|desert|forest|camp|field/i,
  shoulders:/shoulder/i,torso:/chest|shirt|torso/i,legs:/leg|trousers|pants/i,
  rear_view_clothed:/rear|behind|back view/i,
  front_waist_clothed:/front waist|beltline|waist/i
 };
 const cueLabels={
  uniform_fit:"uniform fit",camouflage:"camouflage",boots:"boots",
  uniform_shirt:"uniform shirts",shirt:"uniform shirts",sleeves_rolled:"rolled sleeves",
  hair_buzz:"short haircuts",hair_high_tight:"high-and-tight haircuts",
  pose:"posture",equipment:"military equipment",physique:"fitness",
  exercise:"training",expression:"facial expressions"
 };
 let state={current:null,date:null,reason:"",tastes:[],busy:false};
 const currentDate=()=>{
  const fmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"});
  const parts=Object.fromEntries(fmt.formatToParts(new Date()).map(p=>[p.type,p.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
 };
 const liked=t=>t?.reaction==="more"||(t?.reaction!=="less"&&Number(t?.rating)>=4);
 const disliked=t=>t?.reaction==="less"||(Number(t?.rating)>0&&Number(t?.rating)<=2);
 const cues=t=>{
  const regions=Array.isArray(t.regions)?t.regions.flatMap(r=>[r?.cue,...(Array.isArray(r?.features)?r.features:[])]):[];
  return [...new Set([...(Array.isArray(t.cues)?t.cues:[]),...regions].filter(Boolean))];
 };
 const txt=a=>[a.filename,a.caption,a.military_branch,a.military_category,a.military_era,a.military_unit,
  ...(Array.isArray(a.military_tags)?a.military_tags:[])].filter(Boolean).join(" ").toLowerCase();
 function overlap(a,b){
  let s=0;
  if(a.military_branch&&a.military_branch===b.military_branch)s+=16;
  if(a.military_category&&a.military_category!=="Unsorted"&&a.military_category===b.military_category)s+=12;
  const tags=new Set((b.military_tags||[]).map(v=>String(v).toLowerCase()));
  s+=Math.min(3,(a.military_tags||[]).filter(v=>tags.has(String(v).toLowerCase())).length)*7;
  return s;
 }
 function tie(day,id,asset){
  let h=2166136261;
  for(const ch of day+"|"+id+"|"+asset){h=Math.imul(h^ch.charCodeAt(0),16777619)}
  return (h>>>0)/4294967295*4;
 }
 function scoreDaily(candidates,tastes,favorites,preferences,history,day,userId){
  const byId=new Map(getAssets().map(a=>[a.id,a]));
  const faveIds=new Set(favorites.map(f=>f.asset_id));
  const favAssets=favorites.map(f=>byId.get(f.asset_id)).filter(Boolean);
  const samples=tastes.filter(t=>liked(t)||disliked(t))
   .map(t=>({taste:t,asset:byId.get(t.asset_id)})).filter(x=>x.asset);
  const weights=new Map();
  for(const t of tastes){
   const sign=liked(t)?1:disliked(t)?-1:0;
   if(!sign)continue;
   for(const cue of cues(t)){
    weights.set(cue,Math.max(-35,Math.min(35,(weights.get(cue)||0)+sign*Math.max(1,Number(t.rating)||3))));
   }
  }
  const recent=new Set(history.filter(x=>x.pick_date!==day).slice(0,30).map(x=>x.asset_id));
  const canBeFresh=candidates.some(x=>!recent.has(x.id));
  const scores=candidates.map(asset=>{
   const existing=tastes.find(t=>t.asset_id===asset.id);
   let value=existing?(disliked(existing)?-180:liked(existing)?-15:0):10;
   if(faveIds.has(asset.id))value+=7;
   if(canBeFresh&&recent.has(asset.id))value-=500;
   const words=txt(asset),evidence=[];
   for(const [cue,weight] of weights){
    if(cuePatterns[cue]?.test(words)){
     value+=Math.max(-60,Math.min(60,weight*5));
     if(weight>0)evidence.push({weight,label:cueLabels[cue]||cue.replaceAll("_"," ")});
    }
   }
   for(const s of samples){if(s.asset.id!==asset.id)value+=(liked(s.taste)?1:-1)*overlap(asset,s.asset)}
   for(const fav of favAssets){if(fav.id!==asset.id)value+=overlap(asset,fav)*.55}
   if(preferences?.military_branch&&asset.military_branch
    &&String(preferences.military_branch).toLowerCase()===String(asset.military_branch).toLowerCase())value+=18;
   value+=tie(day,userId,asset.id);
   evidence.sort((a,b)=>b.weight-a.weight);
   return {asset,value,evidence};
  }).sort((a,b)=>b.value-a.value);
  const best=scores[0];
  if(!best)return null;
  let reason;
  if(best.evidence.length){
   reason="Picked because you've liked "+[...new Set(best.evidence.map(x=>x.label))].slice(0,2).join(" and ")+" in other photos.";
  }else if(samples.some(x=>liked(x.taste))||favAssets.length){
   reason="Matched to the military branches, categories and tags in photos you've liked.";
  }else{
   reason="A discovery pick from your U.S. collection. Rate photos to personalize future picks.";
  }
  return {...best,reason};
 }
 /* Present the model's saved recommendation evidence as concise, readable
    explanation + tags. Nothing is inferred from the photo beyond saved labels. */
 function displayExplanation(savedReason){
  const raw=String(savedReason||"").trim();
  const detail=raw.match(/^Picked because you've liked (.+?) in other photos\.$/i);
  if(detail){
   return {
    explanation:"A close match for the details you enjoy in military photographs.",
    tags:detail[1].split(/\s*,\s*|\s+and\s+/i).map(s=>s.trim()).filter(Boolean).slice(0,4)
   };
  }
  if(/^Matched to the military branches, categories and tags/i.test(raw)){
   return {explanation:"Drawn from the military photos you already enjoy.",tags:["YOUR FAVORITES","RELATED DETAILS"]};
  }
  if(/^A discovery pick from your U\.S\. collection/i.test(raw)){
   return {explanation:"A fresh discovery from your U.S. military archive. Your reactions help improve future picks.",tags:[]};
  }
  return {explanation:raw||"Your next personalized military photo.",tags:[]};
 }
 function renderExplanation(reason){
  const card=$("dailyTags");
  card.replaceChildren();
  const details=displayExplanation(reason);
  $("dailyReason").textContent=details.explanation;
  for(const label of details.tags){
   const pill=document.createElement("span");
   pill.className="daily-match-pill";
   pill.textContent=label.toUpperCase();
   card.append(pill);
  }
 }
 function draw(){
  const button=$("featuredPhotoButton"),image=$("featuredPhotoImage"),placeholder=$("featuredPlaceholder");
  const a=state.current,url=a&&getSignedUrl(a);
  $("dailyDate").textContent=new Date().toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric"}).toUpperCase();
  $("dailyDate").dateTime=state.date||currentDate();
  if(!url){
   image.hidden=true;image.removeAttribute("src");placeholder.hidden=false;
   button.disabled=true;$("dailyLike").disabled=true;$("dailyLess").disabled=true;
   $("dailyTags").replaceChildren();
   $("dailyReason").textContent=getAssets().length?
    "A private photo could not be loaded. Refresh the library and try again.":
    "Add U.S. military photos to your private library to begin daily picks.";
   return;
  }
  image.src=url;image.hidden=false;placeholder.hidden=true;button.disabled=false;
  image.alt="Today's personalized U.S. military photo: "+String(a.filename||"Military photograph");
  renderExplanation(state.reason);
  $("dailyLike").disabled=false;$("dailyLess").disabled=false;
  const t=state.tastes.find(x=>x.asset_id===a.id);
  $("dailyLike").classList.toggle("selected",liked(t));
  $("dailyLess").classList.toggle("selected",disliked(t));
 }
 async function refresh(){
  const user=getUser();
  if(!user||state.busy)return;
  state.busy=true;
  const date=currentDate();state.date=date;
  $("dailyReason").textContent="Finding today’s match in your collection…";
  $("dailyTags").replaceChildren();
  $("dailyFeedbackStatus").textContent="";
  try{
   const candidates=getAssets().filter(a=>a.storage_path&&getSignedUrl(a));
   const [tastesR,favoritesR,preferenceR,historyR]=await Promise.all([
    client.from(TASTE_TABLE).select("asset_id,rating,reaction,cues,regions,note").eq("user_id",user.id).limit(2500),
    client.from(FAVE_TABLE).select("asset_id").eq("user_id",user.id).limit(2500),
    client.from(PREF_TABLE).select("military_branch,focus").eq("user_id",user.id).maybeSingle(),
    client.from(DAILY_TABLE).select("asset_id,pick_date,recommendation_reason").eq("user_id",user.id)
      .order("pick_date",{ascending:false}).limit(65)
   ]);
   const warnings=[tastesR,favoritesR,preferenceR].filter(x=>x.error).map(x=>x.error.message);
   const tastes=tastesR.data||[],favorites=favoritesR.data||[],history=historyR.data||[];
   state.tastes=tastes;
   const today=history.find(x=>x.pick_date===date);
   const existing=candidates.find(x=>x.id===today?.asset_id);
   let selection=existing?{asset:existing,reason:today.recommendation_reason}:
    scoreDaily(candidates,tastes,favorites,preferenceR.data,history,date,user.id);
   if(selection&&!existing){
    const payload={user_id:user.id,pick_date:date,asset_id:selection.asset.id,
      recommendation_reason:selection.reason,selection_version:"preference-ranking-v1"};
    const response=today?
      await client.from(DAILY_TABLE).update(payload).eq("user_id",user.id).eq("pick_date",date).select("asset_id,recommendation_reason").maybeSingle():
      await client.from(DAILY_TABLE).insert(payload).select("asset_id,recommendation_reason").maybeSingle();
    if(response.error){
     if(response.error.code==="23505"){
      const latest=await client.from(DAILY_TABLE).select("asset_id,recommendation_reason")
       .eq("user_id",user.id).eq("pick_date",date).maybeSingle();
      const saved=candidates.find(x=>x.id===latest.data?.asset_id);
      if(saved)selection={asset:saved,reason:latest.data.recommendation_reason};
     }else{
      $("dailyFeedbackStatus").textContent="Today's pick shown, but cloud sync wasn't available.";
     }
    }else{
     const saved=candidates.find(x=>x.id===response.data?.asset_id);
     if(saved)selection={asset:saved,reason:response.data.recommendation_reason};
    }
   }
   state.current=selection?.asset||null;
   state.reason=selection?.reason||"";
   draw();
   if(warnings.length)$("dailyFeedbackStatus").textContent="Some saved preferences were unavailable; today's ranking may be less personalized.";
  }catch(error){
   state.current=null;draw();
   $("dailyFeedbackStatus").textContent="Photo of the Day couldn't load. Refresh to retry.";
   console.warn("Blackcell daily pick",error?.message||error);
  }finally{state.busy=false}
 }
 async function sendFeedback(reaction){
  const user=getUser(),asset=state.current;
  if(!user||!asset||state.busy)return;
  state.busy=true;
  $("dailyLike").disabled=true;$("dailyLess").disabled=true;
  $("dailyFeedbackStatus").textContent="Saving your preference…";
  try{
   const previous=state.tastes.find(t=>t.asset_id===asset.id);
   const values={reaction, rating:reaction==="more"?5:1,updated_at:new Date().toISOString()};
   let result;
   if(previous){
    result=await client.from(TASTE_TABLE).update(values).eq("user_id",user.id).eq("asset_id",asset.id);
   }else{
    result=await client.from(TASTE_TABLE).insert({user_id:user.id,asset_id:asset.id,...values,
      cues:[],regions:[],note:""});
   }
   if(result.error)throw result.error;
   if(previous)Object.assign(previous,values);
   else state.tastes.push({user_id:user.id,asset_id:asset.id,...values,cues:[],regions:[]});
   $("dailyFeedbackStatus").textContent=reaction==="more"?
    "Saved. Future daily picks will favor similar military photos.":
    "Saved. Future daily picks will avoid similar photos.";
   draw();
  }catch(error){
   $("dailyFeedbackStatus").textContent="Feedback not saved: "+String(error?.message||"Try again.");
  }finally{state.busy=false;$("dailyLike").disabled=!state.current;$("dailyLess").disabled=!state.current}
 }
 function setup(){
  $("featuredPhotoButton").addEventListener("click",()=>{if(state.current)openAsset(state.current)});
  $("dailyLike").addEventListener("click",()=>void sendFeedback("more"));
  $("dailyLess").addEventListener("click",()=>void sendFeedback("less"));
 }
 return {setup,refresh,refreshIfNewDay:()=>currentDate()!==state.date?refresh():Promise.resolve(),getCurrent:()=>state.current,scoreDaily};
}
