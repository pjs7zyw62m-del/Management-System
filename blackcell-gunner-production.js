/* BLACKCELL Gunner Production Plan: deterministic, free, no paid model calls.
 * Targets are recommendations, not mandatory obligations. No media mutation.
 * A day is only "missed" after midnight in the user's account timezone.
 * No provider invoices are inferred from upload counts. */
const whole=v=>Math.max(0,Math.round(Number(v)||0));
const sum=(days,key)=>days.reduce((n,d)=>n+whole(d?.[key]),0);
const clip=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

function photoQuota(days,pending){
 const completed=days.slice(0,-1); // today is never a missed day
 const last7=completed.slice(-7);
 const total=sum(completed,"photos");
 if(completed.length<7||total<3)return {
  ready:false,daily:null,weekly:null,baseDaily:null,carryover:0,
  missedDays:0,deferred:0,
  reason:"Not enough completed upload history for a reliable daily photo target."
 };
 const recent=sum(last7,"photos");
 // Excluding the current, unfinished day keeps the baseline from dropping
 // early in the morning before the owner has had a chance to upload.
 const baseline=clip(Math.round(.7*total/completed.length+.3*recent/last7.length),1,100);
 const overloaded=pending>=Math.max(12,recent*2);
 const normal=overloaded?Math.max(1,Math.floor(baseline/2)):baseline;
 // Account for up to three completed days; surplus uploads offset earlier
 // shortfalls, preventing a missed day from being charged again after catch-up.
 const recentCompleted=completed.slice(-3);
 const netShortfall=Math.max(0,recentCompleted.reduce((debt,day)=>
  debt+normal-whole(day.photos),0));
 const missedDays=recentCompleted.filter(day=>whole(day.photos)===0).length;
 // Never impose an unbounded quota. The remainder remains advisory.
 const carryover=overloaded?0:Math.min(normal,netShortfall);
 const deferred=Math.max(0,netShortfall-carryover);
 const daily=normal+carryover;
 const yesterday=completed[completed.length-1];
 const missedYesterday=whole(yesterday?.photos)===0;
 const start=missedYesterday&&carryover>0?
  "Yesterday had no photo uploads. Because you missed that day, "+
  carryover+" unfinished photo"+(carryover===1?" has":"s have")+
  " been added to today's suggested quota: "+daily+". ":
  carryover>0?
   "Recent photo uploads were below the suggested pace. "+
    carryover+" photos have been added to today's suggested quota: "+daily+". ":
   "Today's suggested quota is "+daily+" photos. ";
 const reason=overloaded?
  "The review queue is overloaded. New intake targets are reduced, and catch-up is deferred.":
  start+(deferred>0?deferred+" additional photos remain to catch up over future days. ":"")+
  "This is a recommendation, not a mandatory requirement.";
 return {ready:true,daily,weekly:daily*7,baseDaily:normal,carryover,deferred,
  missedDays,missedYesterday,pausedByBacklog:overloaded,reason};
}

function videoQuota(days,pending){
 const completed=days.slice(0,-1);
 const count=sum(completed,"videos");
 if(completed.length<7||count<2)return {ready:false,weekly:null,
  reason:"Video targets are weekly. More upload history is needed before suggesting a quota."};
 // Videos are often less frequent than photos. Never mark a video day missed
 // simply because no video was uploaded yesterday.
 const baseline=clip(Math.round(count/completed.length*7),1,30);
 // Compare complete Monday–Sunday calendar weeks, not arbitrary rolling
 // windows that could falsely classify a partly completed week as "missed".
 const today=String(days[days.length-1]?.day||"");
 let priorCount=null,thisWeekCount=0;
 if(/^\d{4}-\d{2}-\d{2}$/.test(today)){
  const ms=Date.parse(today+"T00:00:00Z"),oneDay=86400000;
  const currentMonday=ms-((new Date(ms).getUTCDay()+6)%7)*oneDay;
  const previousMonday=currentMonday-7*oneDay;
  const previous=days.filter(x=>{
   const t=Date.parse(String(x.day)+"T00:00:00Z");
   return t>=previousMonday&&t<currentMonday;
  });
  if(previous.length===7)priorCount=sum(previous,"videos");
  thisWeekCount=sum(days.filter(x=>{
   const t=Date.parse(String(x.day)+"T00:00:00Z");
   return t>=currentMonday&&t<currentMonday+7*oneDay;
  }),"videos");
 }
 const overdue=priorCount===null?0:Math.max(0,baseline-priorCount);
 const overloaded=pending>=Math.max(12,sum(completed.slice(-7),"photos")*2);
 const carryover=overloaded?0:Math.min(baseline,overdue);
 return {ready:true,weekly:baseline+carryover,baseWeekly:baseline,carryover,
  thisWeekCount,reason:overloaded?
   "Backlog is high. Review existing media before increasing new video intake.":
   carryover?"The preceding completed week fell short. The suggested weekly video target includes "+
    carryover+" catch-up video"+(carryover===1?"":"s")+". ":
    "Weekly video target, based on completed upload history; no daily video penalty."};
}

export function planGunnerProduction(pulse,collection){
 const days=Array.isArray(pulse?.daily)?pulse.daily.slice(-14):[];
 const m=collection?.media||{},summary=pulse?.summary||{};
 const photo14=sum(days,"photos"),video14=sum(days,"videos");
 const photo7=sum(days.slice(-7),"photos"),video7=sum(days.slice(-7),"videos");
 const prev7=sum(days.slice(0,-7),"photos")+sum(days.slice(0,-7),"videos");
 const pending=whole(m.pending),current7=photo7+video7;
 const photo=photoQuota(days,pending),video=videoQuota(days,pending);
 const alerts=[];
 if(pending>=Math.max(12,2*current7))alerts.push(
  "Review backlog is larger than recent intake pace. Prioritize approvals and labeling before increasing uploads.");
 if(current7>=25&&current7>=Math.max(1,prev7)*2)alerts.push(
  "Catalog intake has at least doubled versus the previous seven days. Check queue capacity and provider usage before upgrading hosting.");
 const byte14=whole(summary.bytes_14d);
 if(byte14>=5*1024*1024*1024)alerts.push(
  "At least 5 GB of source files were added in 14 days. Review Bunny storage and delivery metrics.");
 return {photo,video,photo7,video7,photo14,video14,pending,previous7:prev7,
  current7,bytes14:byte14,
  photoToday:whole(days[days.length-1]?.photos),videoToday:whole(days[days.length-1]?.videos),
  videoThisWeek:whole(video.thisWeekCount),
  alerts,health:alerts.length?"REVIEW GROWTH":"NO CAPACITY ALERTS",
  billingKnown:false,
  warning:"This tracks collection activity, not a provider invoice. Bunny bandwidth, Supabase usage and GPU billing are not connected.",
  method:"14-day observed asset uploads; previous completed days set quotas. Duplicate/verified/publication counts are separate."};
}
