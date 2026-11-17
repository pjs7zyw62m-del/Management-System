/* BLACKCELL // THE HUNT 3.0 — pure, read-only session and research advice.
 * No fabricated unlocks, hidden activity tracking, penalty loops or media writes. */
const n=value=>Math.max(0,Math.round(Number(value)||0));
export const HUNT_RESUME_SECTIONS=Object.freeze([
 "#overview","#mission","#campaigns","#discovery","#atlas","#research-next",
 "#scout","#gunner-brief","#quotas","#logs","#signals"
]);
const validGoal=goal=>!!goal&&goal.enabled!==false&&["country","branch","world","era"].includes(goal.dimension)&&typeof goal.id==="string";
export function normalizeHuntSession(raw,goals=[]){
 const saved=raw&&typeof raw==="object"?raw:{};
 const matched=Array.isArray(goals)?goals.find(g=>validGoal(g)&&g.id===saved.goalId):null;
 const section=HUNT_RESUME_SECTIONS.includes(saved.section)?saved.section:"#discovery";
 const seen=saved.seen&&typeof saved.seen==="object"&&
  Number.isFinite(saved.seen.total)&&saved.seen.total>=0&&
  Number.isFinite(saved.seen.verified)&&saved.seen.verified>=0?
  {total:n(saved.seen.total),verified:n(saved.seen.verified)}:null;
 return {
  goalId:matched?matched.id:"",
  section,
  seen,
  savedAt:Number.isFinite(saved.savedAt)&&saved.savedAt>0?saved.savedAt:0
 };
}
export function makeReturnDelta(stats,seen){
 if(!seen)return {available:false,catalog:0,verified:0};
 const catalog=n(stats?.media?.total)-n(seen.total);
 const verified=n(stats?.references?.verified)-n(seen.verified);
 return {available:true,catalog,verified};
}
export function nextHuntStep(stats,goal,verifiedMatches){
 if(!goal)return {stage:"goal",label:"CHOOSE AN OBJECTIVE",href:"blackcell-uniform-intelligence.html#gunner",description:"Create a saved, owner-controlled collection goal before beginning a discovery chain."};
 const key={country:"countries",branch:"branches",world:"worlds",era:"eras"}[goal.dimension];
 const id={country:"code",branch:"branch",world:"world",era:"era"}[goal.dimension];
 if(!key||!id)return {stage:"goal",label:"CHOOSE AN OBJECTIVE",href:"#discovery",description:"The selected objective is not supported."};
 const row=Array.isArray(stats?.[key])?stats[key].find(x=>String(x?.[id]||"").trim().toLowerCase()===String(goal.value||"").trim().toLowerCase()):null;
 const count=n(row?.count),target=n(goal.target_count);
 if(count<target)return {stage:"research",label:"RESEARCH YOUR NEXT SOURCE",href:"#scout",
  description:"This catalog contains "+count+" labeled records against a target of "+target+". Review source licensing before any import."};
 if(verifiedMatches===null)return {stage:"verify",label:"OPEN VERIFICATION",href:"blackcell-uniform-intelligence.html#learning",
  description:"The reference-verification count is unavailable. Open the Intelligence Center to investigate."};
 if(n(verifiedMatches)<1)return {stage:"verify",label:"VERIFY ONE REFERENCE",href:"blackcell-uniform-intelligence.html#learning",
  description:"Your catalog target is met. Verify an accurately sourced, matching uniform reference to complete this chain."};
 return {stage:"complete",label:"REVIEW COMPLETED CAMPAIGN",href:"#discovery",
  description:"Catalog coverage and matching verification conditions are met. You can choose another saved campaign."};
}
export function makeHuntBrief(stats,goals=[],selectedGoalId="",verifiedMatches=null,seen=null){
 const pending=n(stats?.media?.pending),missing=n(stats?.media?.missing_country)+n(stats?.media?.missing_branch);
 const active=Array.isArray(goals)?goals.find(g=>validGoal(g)&&g.id===selectedGoalId):null;
 const goal=active|| (Array.isArray(goals)?goals.filter(validGoal)
  .sort((a,b)=>n(b.priority)-n(a.priority))[0]:null)||null;
 const next=nextHuntStep(stats,goal,verifiedMatches);
 const delta=makeReturnDelta(stats,seen);
 let heading="Gunner's command briefing";
 let summary="Start with a verified collection objective, then use the research tools to make a measurable contribution.";
 if(pending>0){heading="First priority: review the intake";summary=pending+" catalog record"+(pending===1?" is":"s are")+" pending. Confirm classifications, source rights and publication status before expanding the queue."}
 else if(next.stage==="goal"){summary="The archive is ready for a new research assignment. Set a target by country, branch, era or Uniform World."}
 else if(next.stage==="research"){heading="Continue Operation: "+String(goal.value).slice(0,70);summary=next.description}
 else if(next.stage==="verify"){heading="Your operation needs verification";summary=next.description}
 else {heading="Operation milestone confirmed";summary=next.description}
 if(!pending&&missing>0&&next.stage==="goal")summary+=" "+missing+" country/branch metadata fields are still unresolved (overlap possible).";
 return {heading,summary,next,pending,goal,
  changes:delta,priorityHref:pending>0?"blackcell-uniform-intelligence.html#review":next.href,
  priorityLabel:pending>0?"OPEN APPROVAL QUEUE":next.label};
}
const WORLDS=Object.freeze([
 {id:"military",label:"Military",query:"military uniform archival photograph"},
 {id:"police",label:"Law Enforcement",query:"police officer uniform archival photograph"},
 {id:"fire",label:"Fire & Rescue",query:"firefighter uniform archival photograph"},
 {id:"medical",label:"Paramedics",query:"paramedic uniform historical photograph"},
 {id:"security",label:"Corrections",query:"correctional officer uniform archival photograph"},
 {id:"professional",label:"Aviation",query:"airline pilot uniform archival photograph"}
]);
export function suggestHuntWorlds(stats,limit=3){
 const rows=Array.isArray(stats?.worlds)?stats.worlds:[];
 const rank=WORLDS.map((world,index)=>({...world,index,
  count:n(rows.find(x=>x?.world===world.id)?.count)}))
  .sort((a,b)=>a.count-b.count||a.index-b.index);
 return rank.slice(0,Math.max(0,Math.min(6,n(limit)))).map(({index,...item})=>item);
}
