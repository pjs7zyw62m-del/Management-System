/* BLACKCELL Gunner Production Plan: deterministic, free, no model calls.
 * Suggestions are reversible, not mandates, and never change upload permissions.
 * Real financial usage cannot be inferred from upload counts alone. */
const whole=v=>Math.max(0,Math.round(Number(v)||0));
const sum=(days,key)=>days.reduce((n,d)=>n+whole(d?.[key]),0);
function recommend(total,last7,pending){
 if(total<3)return {ready:false,daily:null,weekly:null,reason:"Not enough 14-day history; collect a few examples before assigning a quota."};
 const baseline=Math.max(1,Math.min(100,Math.round((0.7*total/14)+(0.3*last7/7))));
 const overloaded=pending>=Math.max(12,last7*2);
 const daily=overloaded?Math.max(1,Math.floor(baseline/2)):baseline;
 return {ready:true,daily,weekly:daily*7,baseline,pausedByBacklog:overloaded,
  reason:overloaded?"Review backlog is high, so new intake targets are reduced.":"Based on 14-day upload pace with extra weight on the last seven days."};
}
export function planGunnerProduction(pulse,collection){
 const days=Array.isArray(pulse?.daily)?pulse.daily.slice(-14):[];
 const m=collection?.media||{},summary=pulse?.summary||{};
 const photo14=sum(days,"photos"),video14=sum(days,"videos");
 const photo7=sum(days.slice(-7),"photos"),video7=sum(days.slice(-7),"videos");
 const prev7=sum(days.slice(0,-7),"photos")+sum(days.slice(0,-7),"videos");
 const pending=whole(m.pending),current7=photo7+video7;
 const photo=recommend(photo14,photo7,pending),video=recommend(video14,video7,pending);
 const alerts=[];
 if(pending>=Math.max(12,2*current7)) alerts.push("Review backlog is larger than the recent intake pace. Prioritize approvals and labeling before increasing uploads.");
 if(current7>=25&&current7>=Math.max(1,prev7)*2) alerts.push("Catalog intake has at least doubled versus the previous seven days. Check queue capacity and provider usage before upgrading hosting.");
 const byte14=whole(summary.bytes_14d);
 if(byte14>=5*1024*1024*1024) alerts.push("At least 5 GB of source files were added in 14 days. Review Bunny storage and delivery metrics.");
 return {photo,video,photo7,video7,photo14,video14,pending,previous7:prev7,
  current7,bytes14:byte14,
  photoToday:whole(days[days.length-1]?.photos),videoToday:whole(days[days.length-1]?.videos),
  alerts,health:alerts.length?"REVIEW GROWTH":"NO CAPACITY ALERTS",
  billingKnown:false,
  warning:"This tracks collection activity, not a provider invoice. Bunny bandwidth, Supabase usage and GPU billing are not connected.",
  method:"14-day observed asset uploads. Duplicates, quality, and verified publication must be assessed separately."};
}
