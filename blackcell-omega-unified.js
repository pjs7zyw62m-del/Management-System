/* OMEGA // THE HUNT — unified discovery and operations.
 * Original OMEGA permissions, Bunny transport and private case rows are reused.
 * AI vision is not fabricated; source scouting is owner-controlled, on demand. */
import {chooseHuntGoal,makeDiscoveryChain,makeCollectorRank,makeLivingAtlas} from "./blackcell-the-hunt-engine.js?v=20261117-scout-r1";
import {mountMilitaryGunner} from "./military-gunner.js?v=20261117-journal-r1";
const good=v=>Boolean(v)&&!/^(unknown|unsorted|unspecified|uniforms?)$/i.test(String(v).trim());
const norm=v=>String(v||"").trim().toLowerCase();
export function omegaClueLabels(a){
 if(!a)return [];
 return [["Country",a.military_country_code],["Branch",a.military_branch],
  ["Era",a.military_era],["Category",a.military_category]]
  .filter(([,v])=>good(v)).map(([label,value])=>({label,value:String(value).slice(0,80)}));
}
export function omegaRelated(a,all,worldFor,limit=5){
 if(!a)return [];
 return (all||[]).filter(item=>item?.id&&item.id!==a.id).map(item=>{
  const shared=[];let score=0;
  for(const [field,name,n] of [["military_branch","Branch",6],["military_era","Era",4],["military_country_code","Country",3]]){
   if(good(a[field])&&norm(a[field])===norm(item[field])){score+=n;shared.push(name)}
  }
  if(worldFor(a)===worldFor(item)){score+=2;shared.push("World")}
  return {item,score,shared};
 }).sort((a,b)=>b.score-a.score||String(b.item.created_at||"").localeCompare(String(a.item.created_at||"")))
  .slice(0,Math.max(0,Math.min(8,Number(limit)||0)));
}
export function omegaSurprise(items,current,seen=[]){
 const others=(items||[]).filter(a=>a?.id&&a.id!==current);
 if(!others.length)return (items||[])[0]||null;
 const fresh=others.filter(a=>!seen.includes(a.id)),pool=fresh.length?fresh:others;
 return pool[Math.floor(Math.random()*pool.length)]||null;
}
export function omegaSourceTerms(world){
 return ({military:"military uniform historical photograph",
  police:"police officer uniform historical photograph",
  fire:"firefighter uniform historical photograph",
  medical:"paramedic uniform historical photograph",
  security:"corrections officer uniform historical photograph",
  professional:"airline pilot uniform historical photograph"})[world]||"historical uniform photograph";
}
export function omegaPublicUrl(value){
 try{const u=new URL(String(value||""));return u.protocol==="https:"&&
   ["commons.wikimedia.org","upload.wikimedia.org"].includes(u.hostname)?u.href:null}catch{return null}
}
export function mountOmegaUnified({client,state,$,e,bunny,visibleAssets,assetWorld,sourceUrl,
 signPreviews,safeTitle,evidenceSummary,selectAsset,showTab}){
 let scoutBusy=false,caseSeq=0,companion=null,lastId="",seen=[];
 const saveKey="bc_omega_unified_v1_"+state.user.id;
 function readSession(){
  try{const saved=JSON.parse(localStorage.getItem(saveKey)||"{}");
   lastId=typeof saved.last==="string"?saved.last:"";
   seen=Array.isArray(saved.seen)?saved.seen.filter(x=>typeof x==="string").slice(-100):[];
  }catch{lastId="";seen=[]}
  $("omegaResume").hidden=!lastId;
 }
 function keep(a){
  if(!a?.id)return;
  lastId=a.id;seen=[...seen.filter(x=>x!==a.id),a.id].slice(-100);
  $("omegaResume").hidden=false;
  try{localStorage.setItem(saveKey,JSON.stringify({last:lastId,seen}))}catch{}
 }
 function chips(a,id){
  const root=$(id);root.replaceChildren();
  for(const x of omegaClueLabels(a))root.append(e("span","",x.label+": "+x.value));
  if(!root.childNodes.length)root.append(e("span","","UNVERIFIED CATEGORY — EXPLORE"));
 }
 async function thumb(a,img,caseSnapshot=null){
  try{
   let url="";
   if(a?.kind!=="photo")return;
   if(a.source_provider==="world-bunny-v1"&&a.purpose==="library")url=await bunny.thumbnail(a);
   else{await signPreviews([a]);url=sourceUrl(a)}
   if(url&&img.isConnected&&(!caseSnapshot||caseSnapshot===caseSeq))img.src=url;
  }catch{}
 }
 function showClues(scroll=true){
  const a=state.items[state.index];if(!a)return;
  $("omegaCluePanel").hidden=false;
  $("omegaClueTitle").textContent="Discover: "+safeTitle(a).slice(0,90);
  chips(a,"omegaClueTags");
  const root=$("omegaConnections");root.replaceChildren();
  const related=omegaRelated(a,visibleAssets(),assetWorld,5);
  for(const x of related){
   const button=e("button","omega-connection"),img=e("img");
   button.type="button";img.alt="";img.loading="lazy";
   const copy=e("span");
   copy.append(e("strong","",safeTitle(x.item)),
    e("small","",x.shared.length?"Shared: "+x.shared.join(" · "):"Another archive item"));
   button.append(img,copy);
   if(x.item.kind!=="photo")img.hidden=true;
   button.addEventListener("click",()=>{
    $("omegaCluePanel").hidden=true;
    selectAsset(x.item);
   });
   root.append(button);
   void thumb(x.item,img);
  }
  if(!related.length)root.append(e("p","","No other eligible archive records available."));
  if(scroll)$("omegaCluePanel").scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 function onCurrent(a){
  keep(a);
  if(a&&!$("omegaCluePanel").hidden)showClues(false);
 }
 function onCase(a){
  if(!a)return;
  const snap=++caseSeq,root=$("omegaCaseVisual");
  root.replaceChildren(e("span","","◈"),e("small","","LOADING AUTHORIZED PHOTO"));
  chips(a,"omegaCaseClues");
  $("omegaCaseSuggestion").textContent="Explore "+evidenceSummary(a)+
   ". What uniform detail catches your eye? Saved labels are not independent historical verification.";
  if(a.kind!=="photo"){
   root.replaceChildren(e("span","","▶"),e("small","","VIDEO EVIDENCE · OPEN IN DISCOVER"));
   return;
  }
  const img=e("img");img.alt="Selected evidence photograph";
  img.onload=()=>{if(snap===caseSeq&&$("omegaCaseDialog").open)root.replaceChildren(img)};
  img.onerror=()=>{if(snap===caseSeq)root.replaceChildren(e("small","","PHOTO PREVIEW UNAVAILABLE"))};
  root.append(img);
  void thumb(a,img,snap);
 }
 function gunner(aboutCase=false){
  if(!companion)return;
  const a=aboutCase?state.caseAsset:state.items[state.index];
  const context=a?"Saved catalog labels: "+evidenceSummary(a)+". Media type "+a.kind+". ":"No media selected. ";
  const query="Gunner, give me an intriguing, factual research direction for this uniform. "+
   context+"Use the archive labels as leads, not visual proof. Ask me what detail to investigate and "+
   "say when identification is uncertain. No imports, publication or spending without approval.";
  companion.setPrompt(query.slice(0,1600)); // user presses Send
 }
 async function updateCampaign(){
  if(state.member?.role!=="owner"){
   $("omegaGoalTitle").textContent="Explore your authorized archive";
   $("omegaGoalDescription").textContent="Campaign statistics are owner-only.";
   return;
  }
  try{
   const [r,g]=await Promise.all([
    client.rpc("blackcell_gunner_collection_stats"),
    client.from("corp_gunner_collection_goals").select("*").eq("owner_id",state.user.id)
     .order("priority",{ascending:false}).limit(80)
   ]);
   if(r.error||!r.data?.media||g.error)throw Error("Campaign statistics unavailable");
   const stats=r.data,goal=chooseHuntGoal(g.data||[]);
   let verified=null;
   const field=goal&&{country:"country_code",branch:"branch",world:"world",era:"era"}[goal.dimension];
   if(field){
    const v=await client.from("corp_uniform_training_references")
     .select("id",{count:"exact",head:true}).eq("owner_id",state.user.id)
     .eq("reference_status","verified").eq(field,goal.value);
    if(!v.error)verified=v.count||0;
   }
   const rank=makeCollectorRank(stats),atlas=makeLivingAtlas(stats),chain=makeDiscoveryChain(stats,goal,verified);
   $("omegaRank").textContent="LEVEL "+rank.level+" · "+rank.title;
   $("omegaGoalTitle").textContent=chain.title;
   $("omegaGoalDescription").textContent=rank.verified+" verified references · "+
    atlas.worldsRepresented+" of 6 worlds with labeled records. "+
    (goal?"Goal: "+goal.value+" / "+goal.target_count+" records.":"Set a goal in Uniform Intelligence to begin.");
   const box=$("omegaStages");box.replaceChildren();
   for(const stage of chain.stages){
    const tile=e("article","omega-stage "+stage.status);
    tile.append(e("small","",stage.status.toUpperCase()),e("h3","",stage.name),e("p","",stage.detail));
    box.append(tile);
   }
  }catch{
   $("omegaGoalTitle").textContent="Progress temporarily unavailable";
   $("omegaGoalDescription").textContent="Media and private dossiers remain accessible.";
  }
 }
 async function scout(){
  if(scoutBusy||state.member?.role!=="owner")return;
  const terms=$("omegaScoutQuery").value.trim().replace(/\s+/g," ").slice(0,110);
  if(terms.length<3){$("omegaScoutStatus").textContent="Enter a research term.";return}
  scoutBusy=true;$("omegaScoutSearch").disabled=true;
  $("omegaScoutStatus").textContent="Checking public archive sources…";
  const root=$("omegaScoutResults");root.replaceChildren();
  try{
   const {data,error}=await client.functions.invoke("blackcell-hunt-scout",{body:{query:terms}});
   if(error||!data?.ok||!Array.isArray(data.results))throw Error(data?.error||error?.message||"Public scout unavailable");
   for(const item of data.results.slice(0,8)){
    const url=omegaPublicUrl(item.source_url);if(!url)continue;
    const card=e("article","omega-source"),preview=omegaPublicUrl(item.thumbnail_url);
    if(preview){const img=e("img");img.alt="Public source preview";img.loading="lazy";img.src=preview;card.append(img)}
    card.append(e("strong","",String(item.title||"Public archive candidate").slice(0,130)),
     e("small","","License reported: "+String(item.license||"Unverified").slice(0,65)));
    const anchor=e("a","","OPEN SOURCE ↗");anchor.href=url;anchor.target="_blank";anchor.rel="noopener noreferrer";
    card.append(anchor);root.append(card);
   }
   $("omegaScoutStatus").textContent="Candidates found: "+root.children.length+". Verify license and attribution before using any.";
  }catch(err){$("omegaScoutStatus").textContent="Public scout unavailable: "+String(err?.message||err).slice(0,120)}
  finally{scoutBusy=false;$("omegaScoutSearch").disabled=false}
 }
 function setup(){
  readSession();
  if(state.member?.role==="owner"){
   companion=mountMilitaryGunner({client,mount:document.body,visible:false,
    getContext:()=>({page_title:"BLACKCELL OMEGA / THE HUNT",collection_mode:true,world:state.world})});
  }else{
   $("omegaScoutSearch").disabled=true;$("omegaScoutQuery").disabled=true;
   $("omegaScoutStatus").textContent="Public source research is reserved for the verified owner.";
  }
  $("omegaScoutQuery").value=omegaSourceTerms("military");
  $("omegaSurprise").addEventListener("click",()=>{
   const item=omegaSurprise(state.items,state.items[state.index]?.id,seen);
   if(item){state.index=state.items.findIndex(a=>a.id===item.id);selectAsset(item,true)}
  });
  $("omegaResume").addEventListener("click",()=>{
   const asset=visibleAssets().find(a=>a.id===lastId);
   if(asset)selectAsset(asset);
  });
  $("omegaCluesToggle").addEventListener("click",()=>showClues());
  $("omegaClueClose").addEventListener("click",()=>{$("omegaCluePanel").hidden=true});
  $("omegaGunnerTalk").addEventListener("click",()=>gunner());
  $("omegaOperationGunner").addEventListener("click",()=>gunner());
  $("omegaCaseGunner").addEventListener("click",()=>gunner(true));
  $("omegaScoutSearch").addEventListener("click",()=>void scout());
  void updateCampaign();
 }
 return {setup,onCurrent,onCase,updateCampaign};
}
