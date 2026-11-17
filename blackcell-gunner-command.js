/* BLACKCELL Gunner Collection Command.
 * Separate live aggregate analytics, evidence-based upload missions, and
 * Gunner's original Dolphin 3.0 personality (no replacement model).
 */
import {mountMilitaryGunner} from "./military-gunner.js?v=20261117-analytics-r1";
const N=v=>Math.max(0,Math.round(Number(v)||0));
const fmt=v=>N(v).toLocaleString("en-US");
const el=(tag,cls,content)=>{
 const x=document.createElement(tag);
 if(cls)x.className=cls;
 if(content!==undefined)x.textContent=String(content);
 return x;
};
const W={military:"Military",police:"Law Enforcement",fire:"Fire & Rescue",medical:"Medical",security:"Corrections",professional:"Aviation",unsorted:"Unsorted"};
function country(code){try{return new Intl.DisplayNames(["en"],{type:"region"}).of(code)||code}catch{return code}}
function ratio(x,total){return total>0?Math.min(100,Math.max(0,Math.round(100*N(x)/N(total)))):0}
function miniCounts(values,label,countKey,emptyLabel){
 if(!Array.isArray(values)||!values.length)return [{label:emptyLabel,count:0}];
 return values.slice(0,12).map(x=>({label:label(x),count:N(x[countKey])}));
}
function getCount(stats,dim,value){
 const s=dim==="country"?stats.countries:dim==="branch"?stats.branches:dim==="world"?stats.worlds:dim==="era"?stats.eras:[];
 const key=dim==="country"?"code":dim;
 const record=Array.isArray(s)?s.find(x=>String(x[key]||"").toLowerCase()===String(value||"").toLowerCase()):null;
 return N(record?.count);
}
function getPositiveCountry(stats,code){
 const record=(stats.liked_countries||[]).find(x=>x.code===code);
 return N(record?.votes);
}
function priorityScore(stats,goal){
 const current=getCount(stats,goal.dimension,goal.value),target=N(goal.target_count)||10;
 const gap=Math.min(1,Math.max(0,(target-current)/target));
 const preferred=goal.dimension==="country"?Math.min(1,getPositiveCountry(stats,goal.value)/3):0;
 const variety=current===0?1:Math.min(1,1/(current+1)*3);
 const verified=goal.dimension==="country"&&N(stats.references?.verified)<N(stats.media?.photos)?1:0.4;
 const fresh=N(stats.media?.uploaded_week)>0?1:0.5;
 const total=0.35*gap+0.25*preferred+0.20*variety+0.10*verified+0.10*fresh;
 return Math.min(99,Math.max(1,Math.round(100*total)));
}
function createMissions(stats,goals){
 const media=stats.media||{},video=stats.stream||{},refs=stats.references||{},dupes=stats.duplicates||{},taste=stats.interest||{};
 const missions=[];
 const add=(title,reason,value,points,action)=>missions.push({title,reason,value,score:points,action});
 if(N(media.missing_country)>0)
  add("Verify missing country labels","Country assignments need visible markings or authoritative references; no guessing from camouflage alone.",
   fmt(media.missing_country)+" unlabeled records",96,"Open Content Inventory, filter the unknown country records, and confirm their markings before training.");
 if(N(media.missing_branch)>0)
  add("Identify unknown service branches","Separate Army, Marines, Navy, and foreign service types using badges, garment details and verified examples.",
   fmt(media.missing_branch)+" unspecified branches",94,"Compare patches, uniforms and source records; leave ambiguous branches unspecified.");
 if(N(media.pending)>0)
  add("Review private media intake","Pending photos and videos are not published. Review classification and permissions before approval.",
   fmt(media.pending)+" awaiting review",90,"Open Upload Media and the Media Administration approval queue.");
 if(N(dupes.exact_duplicate_groups)>0)
  add("Investigate exact duplicate fingerprints","Duplicate candidates share SHA-256 fingerprints; confirm before removing anything.",
   fmt(dupes.exact_duplicate_groups)+" duplicate groups",89,"Review duplicates in the media administration tools; never delete automatically.");
 if(N(video.total)>0&&N(refs.video_frames)===0)
  add("Create verified video-frame examples","Videos need frame timestamps and correctly labeled uniform details to become useful references.",
   fmt(video.total)+" streaming video records",88,"Select a video in Content Inventory and save a reference with an exact frame time.");
 if(N(media.photos)>N(refs.verified))
  add("Expand confirmed uniform examples","Verified labels help distinguish real patterns and branches from lookalikes.",
   fmt(refs.verified)+" verified / "+fmt(media.photos)+" photos",84,"Teach AI using authentic patches, camouflage and historical uniform evidence.");
 const countries=Array.isArray(stats.countries)?stats.countries:[];
 if(countries.length>=2){
  const small=[...countries].filter(x=>N(x.count)>0).sort((a,b)=>N(a.count)-N(b.count)||String(a.code).localeCompare(String(b.code)))[0];
  if(small&&N(small.count)<=2)
   add("Broaden "+country(small.code)+" coverage","This country's catalog is sparsely represented. Seek well-sourced examples of different branches and distinctive insignia.",
    fmt(small.count)+" catalog records",78,"Add authorized, labeled examples; verify each branch and pattern.");
 }
 if(!N(taste.rated)&&!N(taste.favorites))
  add("Build your preference signals","Gunner needs actual favorites and ratings before making reliable recommendations based on personal taste.",
   "No explicit ratings yet",69,"Rate a small set of authorized photos, including ones you don't favor.");
 for(const goal of goals.filter(g=>g.enabled!==false)){
  const current=getCount(stats,goal.dimension,goal.value),target=N(goal.target_count)||10;
  if(current>=target)continue;
  const title=goal.dimension==="country"?"Expand "+country(goal.value)+" coverage":"Expand "+(W[goal.value]||goal.value)+" coverage";
  add(title,"Your saved private collection goal. "+(goal.note||"Find distinct, properly labeled and nonduplicate examples."),
   fmt(current)+" / "+fmt(target)+" records",priorityScore(stats,goal),"Collect "+fmt(target-current)+" additional eligible records and verify their labels.");
 }
 if(!missions.length)
  add("Choose the next verified reference","Current metadata does not reveal a clear gap; use a new country or branch goal to direct collection growth.",
   "Set a collection target",50,"Add a target below or mark your favorite photographs.");
 return missions.sort((a,b)=>b.score-a.score).slice(0,9);
}
export function initGunnerCommand({client,userId}){
 const $=id=>document.getElementById(id);
 const state={snapshot:null,goals:[],refreshing:false,loaded:false};
 const companion=mountMilitaryGunner({
  client,mount:document.body,visible:false,
  getContext:()=>({
   page_title:"Gunner Collection Command / BLACKCELL Uniform Intelligence",
   collection_mode:true,
   countries:(state.snapshot?.countries||[]).slice(0,10).map(x=>x.code)
  })
 });
 function error(message){$("bcGunnerState").textContent=message}
 function statBox(label,value,detail){
  const card=el("article","bc-gunner-stat");
  card.append(el("span","",label),el("strong","",fmt(value)),el("small","",detail));
  return card;
 }
 function drawBars(id,items){
  const root=$(id);root.replaceChildren();
  const largest=Math.max(1,...items.map(x=>x.count));
  if(!items.length||items.every(x=>!x.count)){
   root.append(el("p","bc-gunner-no-data","No classified records in this category yet."));return;
  }
  for(const item of items){
   const line=el("div","bc-gunner-bar-row");
   const head=el("div","bc-gunner-bar-label");
   head.append(el("span","",item.label),el("strong","",fmt(item.count)));
   const track=el("div","bc-gunner-bar-track"),fill=el("div","bc-gunner-bar-fill");
   fill.style.width=Math.max(3,Math.round(100*item.count/largest))+"%";
   track.append(fill);line.append(head,track);root.append(line);
  }
 }
 function drawGoals(){
  const root=$("bcGunnerGoals");root.replaceChildren();
  if(!state.goals.length){root.append(el("p","bc-gunner-no-data","No collection goals yet. Create one to tell Gunner what you want more of."));return}
  for(const goal of state.goals){
   const box=el("div","bc-gunner-goal"),left=el("div");
   const count=getCount(state.snapshot||{},goal.dimension,goal.value);
   const label=goal.dimension==="country"?country(goal.value):(W[goal.value]||goal.value);
   left.append(el("strong","",label+" · "+fmt(count)+" / "+fmt(goal.target_count)),
    el("small","",goal.dimension.toUpperCase()+" · PRIORITY "+goal.priority+
     (goal.note?" · "+goal.note:"")));
   const progress=el("div","bc-gunner-goal-track"),fill=el("div","bc-gunner-goal-fill");
   fill.style.width=ratio(count,goal.target_count)+"%";progress.append(fill);left.append(progress);
   const remove=el("button","bc-btn bc-btn-outline","Remove");
   remove.type="button";remove.setAttribute("aria-label","Remove goal "+label);
   remove.onclick=()=>void deleteGoal(goal);
   box.append(left,remove);root.append(box);
  }
 }
 function draw(){
  const s=state.snapshot;if(!s)return;
  const m=s.media||{},stream=s.stream||{},refs=s.references||{},taste=s.interest||{},dupes=s.duplicates||{};
  const kpi=$("bcGunnerMetrics");kpi.replaceChildren(
   statBox("CATALOG PHOTO RECORDS",m.photos,"All authorized asset rows"),
   statBox("VIDEO RECORDS",N(m.videos)+N(stream.total),"Asset + Tube records; may overlap"),
   statBox("COUNTRIES LABELED",(s.countries||[]).length,"Catalog metadata; not verified"),
   statBox("VERIFIED AI REFERENCES",refs.verified,"Owner-confirmed labels"),
   statBox("PENDING REVIEWS",m.pending,"Awaiting private media review"),
   statBox("PERSONAL SIGNALS",N(taste.favorites)+N(taste.rated),"Favorites and ratings")
  );
  const topCountries=miniCounts(s.countries,x=>country(x.code),"count","No countries labeled");
  drawBars("bcGunnerCountries",topCountries);
  drawBars("bcGunnerBranches",miniCounts(s.branches,x=>x.branch,"count","No branches labeled"));
  drawBars("bcGunnerWorlds",miniCounts(s.worlds,x=>W[x.world]||x.world,"count","No World tags"));
  const missions=createMissions(s,state.goals);const cards=$("bcGunnerMissions");cards.replaceChildren();
  for(let i=0;i<missions.length;i++){
   const m=missions[i],card=el("article","bc-gunner-mission");
   const head=el("div","bc-gunner-mission-head");
   const name=el("strong","",String(i+1).padStart(2,"0")+" · "+m.title);
   head.append(name,el("span","bc-gunner-priority",m.score+" / 100"));
   card.append(head,el("p","",m.reason),el("small","bc-gunner-mission-count",m.value));
   const btn=el("button","bc-btn bc-btn-outline","Ask Gunner why");
   btn.type="button";btn.onclick=()=>companion.setPrompt("Gunner, explain why this is a priority using your live collection numbers: "+m.title+
    ". "+m.value+". Suggest three precise legal upload or verification tasks and avoid guessing the country from camouflage.");
   card.append(btn);cards.append(card);
  }
  $("bcGunnerSignals").textContent=
   "Favorites "+fmt(taste.favorites)+" · Rated "+fmt(taste.rated)+
   " · Strong ratings "+fmt(taste.positive_ratings)+
   " · Engaged views "+fmt(taste.engaged_views)+
   " · Zoom engagements "+fmt(taste.zoom_engagements)+
   " · Exact duplicate candidates "+fmt(dupes.extra_copies);
  drawGoals();
  $("bcGunnerGenerated").textContent=s.generated_at?"Recalculated "+new Date(s.generated_at).toLocaleString():"Live aggregate results";
  error("Connected to BLACKCELL's private statistics. Gunner can explain these results using the original Dolphin 3.0 chat.");
 }
 async function refresh(){
  if(state.refreshing)return;state.refreshing=true;
  $("bcGunnerRefresh").disabled=true;error("Calculating authorized collection statistics…");
  try{
   const [res,goals]=await Promise.all([
    client.rpc("blackcell_gunner_collection_stats"),
    client.from("corp_gunner_collection_goals").select("*").eq("owner_id",userId).order("priority",{ascending:false}).limit(100)
   ]);
   if(res.error||!res.data?.media)throw Error(res.error?.message||"No numeric analytics returned");
   if(goals.error)throw Error("Collection goals cannot be read: "+goals.error.message);
   state.snapshot=res.data;state.goals=goals.data||[];state.loaded=true;draw();
  }catch(e){error("Analytics unavailable: "+String(e.message||e).slice(0,230))}
  finally{state.refreshing=false;$("bcGunnerRefresh").disabled=false}
 }
 async function saveGoal(ev){
  ev.preventDefault();if(!state.snapshot)return;
  const dimension=$("bcGunnerGoalType").value,value=$("bcGunnerGoalValue").value.trim();
  const target=Number($("bcGunnerGoalTarget").value),priority=Number($("bcGunnerGoalPriority").value);
  if(!value||value.length>90||!Number.isInteger(target)||target<1||target>10000){error("Enter a valid target and a number from 1 to 10,000");return}
  const normalized=dimension==="country"?value.toUpperCase():dimension==="world"?value.toLowerCase():value;
  if(dimension==="country"&&!/^[A-Z]{2}$/.test(normalized)){error("Use the two-letter country code, for example JP or DE.");return}
  if(dimension==="world"&&!Object.hasOwn(W,normalized)){error("Choose a valid Uniform World.");return}
  $("bcGunnerAddGoal").disabled=true;
  try{
   const payload={owner_id:userId,dimension,value:normalized,target_count:target,priority};
   const r=await client.from("corp_gunner_collection_goals").upsert(payload,{onConflict:"owner_id,dimension,value"}).select("*").single();
   if(r.error)throw r.error;
   const i=state.goals.findIndex(x=>x.id===r.data.id);
   if(i>=0)state.goals[i]=r.data;else state.goals.push(r.data);
   state.goals.sort((a,b)=>b.priority-a.priority);
   $("bcGunnerGoalValue").value="";draw();error("Collection target saved. Gunner's upload priorities have been recalculated.");
  }catch(e){error("Could not save target: "+String(e.message||e).slice(0,190))}
  finally{$("bcGunnerAddGoal").disabled=false}
 }
 async function deleteGoal(goal){
  if(!confirm("Remove collection target "+goal.value+"? No media or verified training data will change."))return;
  const r=await client.from("corp_gunner_collection_goals").delete().eq("id",goal.id).eq("owner_id",userId);
  if(r.error){error("Cannot remove target: "+r.error.message);return}
  state.goals=state.goals.filter(x=>x.id!==goal.id);draw();error("Collection target removed. Verified uniform facts were unchanged.");
 }
 function openGunner(prompt){
  companion.setPrompt(prompt||"Gunner, evaluate my BLACKCELL uniform collection and give me the top three evidence-based upload missions. Show the real counts, identify missing country and branch examples, and explain your choices.");
 }
 $("bcGunnerRefresh").onclick=()=>void refresh();
 $("bcGunnerAsk").onclick=()=>openGunner();
 $("bcGunnerGoalForm").addEventListener("submit",saveGoal);
 $("bcGunnerGoalType").addEventListener("change",()=>{
  const type=$("bcGunnerGoalType").value;
  $("bcGunnerGoalValue").placeholder=type==="country"?"US, JP, GB…":type==="branch"?"Army, Marine Corps, Navy…":type==="era"?"1990s, 2010s…":"military, police, fire…";
 });
 return {open:()=>{if(!state.loaded)void refresh()},refresh,ask:openGunner,getSnapshot:()=>state.snapshot};
}
