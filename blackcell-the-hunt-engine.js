/* BLACKCELL // THE HUNT 2.0 — deterministic progression from verified source data.
 * No fabricated rarity, streak debts, autonomous media writes, or model calls. */
const n=value=>Math.max(0,Math.round(Number(value)||0));
const asArray=value=>Array.isArray(value)?value:[];
export const HUNT_WORLDS=Object.freeze([
 {id:"military",name:"Military"},
 {id:"police",name:"Law Enforcement"},
 {id:"fire",name:"Fire & Rescue"},
 {id:"medical",name:"Paramedics"},
 {id:"security",name:"Corrections"},
 {id:"professional",name:"Aviation"}
]);
export const HUNT_MODES=Object.freeze(["paused","steady","focused","intense"]);
const DIMENSIONS=Object.freeze({country:"countries",branch:"branches",world:"worlds",era:"eras"});
const DIMENSION_KEYS=Object.freeze({country:"code",branch:"branch",world:"world",era:"era"});
export function chooseHuntGoal(goals,requestedId=""){
 const eligible=asArray(goals).filter(x=>x&&x.enabled!==false&&DIMENSIONS[x.dimension]&&
  typeof x.value==="string"&&x.value.trim().length>0&&n(x.target_count)>0);
 if(!eligible.length)return null;
 return eligible.find(x=>String(x.id)===String(requestedId))||
  eligible.slice().sort((a,b)=>n(b.priority)-n(a.priority)||
   String(a.dimension+":"+a.value).localeCompare(String(b.dimension+":"+b.value)))[0];
}
export function goalCatalogCount(stats,goal){
 if(!goal||!DIMENSIONS[goal.dimension])return null;
 const rows=asArray(stats?.[DIMENSIONS[goal.dimension]]);
 const key=DIMENSION_KEYS[goal.dimension];
 const needle=String(goal.value).trim().toLowerCase();
 const row=rows.find(r=>String(r?.[key]||"").trim().toLowerCase()===needle);
 return n(row?.count);
}
export function makeDiscoveryChain(stats,goal,verifiedMatches){
 if(!goal)return {
  title:"Choose your first campaign",complete:false,stages:[
   {name:"Set a collection objective",detail:"Create a country, branch, era or Uniform World goal in Gunner Command.",status:"active"},
   {name:"Build the selected collection",detail:"Progress unlocks after a goal is selected.",status:"locked"},
   {name:"Verify a matching uniform reference",detail:"Verification unlocks after the collection target is met.",status:"locked"}
  ]
 };
 const current=goalCatalogCount(stats,goal),target=n(goal.target_count);
 const catalogComplete=current!==null&&target>0&&current>=target;
 const verified=verifiedMatches===null?null:n(verifiedMatches);
 const referenceComplete=catalogComplete&&verified!==null&&verified>0;
 return {
  title:"Operation: "+String(goal.value).slice(0,90),
  complete:referenceComplete,
  current,target,verified,
  stages:[
   {name:"Set collection objective",detail:String(goal.dimension).toUpperCase()+" · "+String(goal.value)+" · target "+target+" catalog records",status:"done"},
   {name:"Build collection coverage",detail:current+" / "+target+" labeled catalog records; duplicates may be included",status:catalogComplete?"done":"active"},
   {name:"Verify a matching reference",detail:verified===null?
      "Verification count unavailable; no completion is assumed.":
      verified+" owner-verified matching reference"+(verified===1?"":"s")+
      (catalogComplete?"":" · unlocks after the collection target"),
    status:referenceComplete?"done":catalogComplete?"active":"locked"}
  ]
 };
}
export function makeCollectorRank(stats){
 // Only owner-verified reference records earn credit, not uploads,
 // page views, dwell time, or possible duplicate filenames.
 const verified=n(stats?.references?.verified);
 const perRank=5,level=1+Math.floor(verified/perRank);
 const progress=verified%perRank,needed=perRank-progress;
 const title=level<3?"Scout":level<6?"Archivist":level<10?"Specialist":"Command Archivist";
 return {verified,level,title,progress,perRank,needed,points:verified*20,
  percent:Math.round(100*progress/perRank)};
}
export function makeLivingAtlas(stats){
 const worlds=HUNT_WORLDS.map(w=>({...w,count:n(asArray(stats?.worlds).find(x=>x?.world===w.id)?.count)}));
 const countries=asArray(stats?.countries).filter(x=>x&&x.code&&n(x.count)>0)
  .slice(0,5).map(x=>({label:String(x.code),count:n(x.count)}));
 const branches=asArray(stats?.branches).filter(x=>x&&x.branch&&n(x.count)>0)
  .slice(0,5).map(x=>({label:String(x.branch),count:n(x.count)}));
 const eras=asArray(stats?.eras).filter(x=>x&&x.era&&n(x.count)>0)
  .slice(0,5).map(x=>({label:String(x.era),count:n(x.count)}));
 return {worlds,countries,branches,eras,worldsRepresented:worlds.filter(w=>w.count>0).length};
}
export function recommendPhotoPace(plan,mode="focused"){
 if(mode==="paused")return {ready:false,target:null,reason:"Campaign paused. Existing verified records and rank remain unchanged."};
 if(!plan?.photo?.ready)return {ready:false,target:null,reason:plan?.photo?.reason||"No reliable history yet."};
 const baseline=n(plan.photo.daily);
 const multiplier=mode==="steady"?.75:mode==="intense"?1.25:1;
 const target=Math.max(1,Math.min(125,Math.round(baseline*multiplier)));
 return {ready:true,target,mode,
  reason:"Optional "+mode+" pace based on existing quota history. This is not a mandatory obligation."};
}
