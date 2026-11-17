/* BLACKCELL adaptive ranking core — deterministic, no cloud inference charge.
 * Learns ONLY from chosen topics and non-sensitive media interactions.
 * Do not treat inferred interests as votes or identity/sensitive-trait labels. */
const dims=[["military_category",4],["military_branch",3],["military_era",2],["military_country_code",1]];
const invalid=new Set(["","unknown","other","unspecified","unsorted","general","none"]);
const key=(name,value)=>{const v=String(value||"").trim().toLowerCase();return invalid.has(v)?"":name+":"+v};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function buildBehavioralAffinity(assets=[],tastes=[],favorites=new Set(),engagements=new Map()){
 const byId=new Map(assets.map(a=>[a.id,a]));
 const votes=new Map();
 for(const t of tastes){
  let w=0;
  if(t.reaction==="more")w+=6;
  if(t.reaction==="less")w-=10;
  if(Number(t.rating)>=4)w+=4;
  if(Number(t.rating)>0&&Number(t.rating)<=2)w-=5;
  if(w)votes.set(t.asset_id,(votes.get(t.asset_id)||0)+w);
 }
 for(const id of favorites)votes.set(id,(votes.get(id)||0)+6);
 for(const [id,signal] of engagements){
  if(signal.rediscovery_feedback==="like")votes.set(id,(votes.get(id)||0)+7);
  if(signal.rediscovery_feedback==="more")votes.set(id,(votes.get(id)||0)+6);
  if(signal.rediscovery_feedback==="dislike"||signal.not_interested===true)votes.set(id,(votes.get(id)||0)-12);
  // Passive dwell counts far less than an explicit choice.
  if(!["dislike"].includes(signal.rediscovery_feedback)){
   const passive=clamp(Number(signal.engaged_views)||0,0,3)*.6+
    clamp(Number(signal.zoom_engaged_views)||0,0,3)*1.1;
   if(passive)votes.set(id,(votes.get(id)||0)+passive);
  }
 }
 const scores=new Map();
 for(const [id,weight] of votes){
  const asset=byId.get(id);
  if(!asset||asset.kind!=="photo"||asset.review_status!=="approved"||asset.adult_restricted===true)continue;
  for(const [dimension,multiplier] of dims){
   const k=key(dimension,asset[dimension]);if(!k)continue;
   scores.set(k,clamp((scores.get(k)||0)+weight*multiplier,-120,120));
  }
 }
 return asset=>{
  let score=0;
  for(const [dim] of dims){const k=key(dim,asset?.[dim]);if(k)score+=scores.get(k)||0}
  return clamp(score,-100,100);
 };
}
/** The strongest matches lead, but multiple adjacent cards should not all
 * be from one branch when comparable alternatives exist. Deterministic order
 * ensures stable pages across re-renders, without random repeated prompts. */
export function rankWithDiversity(items,score,{label=(v)=>v?.military_branch||"",top=36}={}){
 const ranked=[...items].map((item,index)=>({item,index,value:Number(score(item))||0}))
  .sort((a,b)=>b.value-a.value||a.index-b.index);
 const head=[],limit=Math.min(Math.max(0,top),ranked.length);
 for(let step=0;step<limit;step++){
  let best=0,bestScore=-Infinity;
  for(let i=0;i<ranked.length;i++){
   const candidate=ranked[i],category=String(label(candidate.item)||"").toLowerCase();
   const duplicate=category&&head.slice(-3).filter(x=>String(label(x.item)||"").toLowerCase()===category).length;
   const adjusted=candidate.value-duplicate*9;
   if(adjusted>bestScore){bestScore=adjusted;best=i}
  }
  head.push(ranked.splice(best,1)[0]);
 }
 return [...head,...ranked].map(x=>x.item);
}
export const notifyAlgorithmSignal=kind=>{
 if(typeof window!=="undefined"&&typeof CustomEvent!=="undefined")
  window.dispatchEvent(new CustomEvent("bc:algorithm-signal",{detail:{kind:String(kind||"feedback").slice(0,40)}}));
};
