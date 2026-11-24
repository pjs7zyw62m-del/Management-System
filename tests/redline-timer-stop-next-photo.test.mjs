import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const ledger=readFileSync('private-photo-ledger.js','utf8');
const timer=readFileSync('private-photo-ledger-timers.js','utf8');
const queue=ledger.slice(ledger.indexOf('function renderReviewQueue(){'),
 ledger.indexOf('function renderEntries(){'));
const method=ledger.slice(ledger.indexOf(' async timerStop(sessionId,options={}){'),
 ledger.indexOf(' async timerMarkPaid(',ledger.indexOf(' async timerStop(sessionId,options={}){')));
assert.ok(method.includes("corp_redline_photo_timer_stop"));

function harness({originalStatus='pending',autoSubmit=true,withNext=true,earned=47,refreshFails=true}={}){
 const first={id:'photo-a',created_at:'2026-11-20T12:00:00Z',
  decision_status:originalStatus,amount_cents:originalStatus==='pending'?null:19};
 const second={id:'photo-b',created_at:'2026-11-20T12:01:00Z',
  decision_status:'pending',amount_cents:null};
 const entries=withNext?[first,second]:[first];
 const state={closed:false,isOwner:true,room:{id:'room'},entries,
  reviewSidebarPhotoId:first.id,entryFingerprint:'cached'};
 let visible=first.id,refreshes=0,renderedBeforeRefresh=false;
 let status='',rpcCalls=0,historyRenders=0,totalsRenders=0;
 const context={
  state,validId:()=>true,
  verify:async()=>{},
  db:{rpc:async(method,args)=>{
   rpcCalls++;
   assert.equal(method,'corp_redline_photo_timer_stop');
   assert.equal(args.p_session_id,'timer-session');
   return {data:{ok:true,photo_id:first.id,earned_cents:earned,
    photo_auto_submitted:autoSubmit,photo_has_timer_price:autoSubmit}};
  }},
  renderReviewQueue(){
   // The actual receiver queue chooses the first pending photo, unless an
   // explicitly selected, reviewed timed photo overrides it.
   const pending=state.entries.filter(e=>e.decision_status==='pending')
    .sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
   const selected=state.entries.find(e=>e.id===state.reviewSidebarPhotoId);
   const timedSelection=selected?.decision_status==='accepted'&&Boolean(selected.auto_timer_session_id);
   visible=pending.length?(timedSelection?selected.id:pending[0].id)
    :null;
   renderedBeforeRefresh=true;
  },
  renderEntries(){historyRenders++},
  updateTotals(){totalsRenders++},
  document:{querySelector:()=>visible?{dataset:{redlinePhotoId:visible}}:null},
  show(id,message){if(id==='reviewQueueFeedback')status=message},
  dollars:cents=>'$'+(Number(cents)/100).toFixed(2),
  loadEntries:async({force})=>{
   assert.equal(force,true);
   assert.equal(renderedBeforeRefresh,true,
    'Next photo must render before any network refresh');
   assert.equal(visible,withNext?(autoSubmit||originalStatus==='accepted'?'photo-b':'photo-a'):(autoSubmit||originalStatus==='accepted'?null:'photo-a'));
   refreshes++;
   if(refreshFails)throw Error('simulated offline refresh');
  },
  fail:e=>String(e)
 };
 const stop=runInNewContext('({'+method+'}).timerStop',context);
 return {stop,state,first,second,get visible(){return visible},
  get status(){return status},get refreshes(){return refreshes},
  get rpcCalls(){return rpcCalls},get historyRenders(){return historyRenders},
  get totalsRenders(){return totalsRenders}};
}
test('STOP prices photo A and immediately selects photo B despite a failed network refresh',async()=>{
 const h=harness();
 const result=await h.stop('timer-session');
 assert.equal(result.ok,true);
 assert.equal(h.first.decision_status,'accepted');
 assert.equal(h.first.amount_cents,47);
 assert.equal(h.first.auto_timer_session_id,'timer-session');
 assert.equal(h.second.decision_status,'pending');
 assert.equal(h.state.reviewSidebarPhotoId,null);
 assert.equal(h.visible,'photo-b');
 assert.equal(h.rpcCalls,1);
 assert.equal(h.refreshes,1);
 assert.equal(h.historyRenders,1);
 assert.equal(h.totalsRenders,1);
 assert.match(h.status,/Next pending photo ready/);
});
test('STOP on already reviewed photo returns to the next pending photo without changing original price',async()=>{
 const h=harness({originalStatus:'accepted',autoSubmit:false});
 await h.stop('timer-session');
 assert.equal(h.first.decision_status,'accepted');
 assert.equal(h.first.amount_cents,19,'Previously priced record must not be overwritten');
 assert.equal(h.visible,'photo-b');
 assert.equal(h.state.reviewSidebarPhotoId,null);
});
test('STOP under one cent leaves unpriced pending photograph in viewer, never silently skips it',async()=>{
 const h=harness({earned:0,autoSubmit:false});
 await h.stop('timer-session');
 assert.equal(h.first.decision_status,'pending');
 assert.equal(h.first.amount_cents,null);
 assert.equal(h.visible,'photo-a');
 assert.equal(h.second.decision_status,'pending');
});
test('STOP with no queued photos returns to the waiting screen',async()=>{
 const h=harness({withNext:false});
 await h.stop('timer-session');
 assert.equal(h.visible,null);
 assert.equal(h.first.amount_cents,47);
});
test('Next-photo selection event fires AFTER DOM mount; never sees old timed image',()=>{
 const mounted=queue.indexOf('parent.append(progress,renderEntry(shown));');
 const notify=queue.indexOf("window.dispatchEvent(new CustomEvent('blackcell:redline:review-photo'");
 assert.ok(mounted>=0&&notify>mounted);
 assert.match(queue,/const shown=timedSelection\?selected:current/);
});
test('Timer controller STOP defaults to advancement and ignores stale in-flight selection',()=>{
 assert.match(timer,/async function stopTimer\(keepPhotoSelected=false\)/);
 assert.match(timer,/if\(acting\)\{selectedId=id;render\(\);return\}/);
 assert.match(timer,/selectedId=currentPhoto\(\)/);
 const code=timer.slice(timer.indexOf('function pickPhoto(id){'),
  timer.indexOf("window.addEventListener('blackcell:redline:photo-selected'"));
 let selectedId='photo-a',duplicateStops=0;
 const state={latest:{active:{running:true,photo_id:'photo-a'}},acting:true};
 // vm context can directly mutate a global binding via the function
 const ctx={latest:state.latest,acting:state.acting,
  selectedId,uuid:()=>true,render:()=>{},
  stopTimer:()=>{duplicateStops++}};
 const pick=runInNewContext(code+';pickPhoto',ctx);
 pick('photo-b');
 assert.equal(ctx.selectedId,'photo-b');
 assert.equal(duplicateStops,0);
});

const refreshedPhoto=ledger.slice(ledger.indexOf(' async refreshTimerPhoto(completed=null,sessionId=null){'),
 ledger.indexOf(' async senderStopTimer(',ledger.indexOf(' async refreshTimerPhoto(completed=null,sessionId=null){')));
const stopChallenge=ledger.slice(ledger.indexOf(' async timerStopRequest(sessionId){'),
 ledger.indexOf(' async senderVetoTimerStop(',ledger.indexOf(' async timerStopRequest(sessionId){')));
test('third STOP uses the same next pending photo handoff as ordinary STOP',async()=>{
 const first={id:'photo-a',created_at:'2026-11-20T12:00:00Z',decision_status:'pending',amount_cents:null};
 const second={id:'photo-b',created_at:'2026-11-20T12:01:00Z',decision_status:'pending',amount_cents:null};
 const state={closed:false,user:{id:'u'},isOwner:true,room:{id:'room',active:true},
  showArchive:false,entries:[first,second],reviewSidebarPhotoId:first.id,entryFingerprint:'old'};
 let visible=first.id,refreshes=0,firstRenderedBeforeNetwork=false,feedback='';
 const ctx={state,validId:()=>true,window:{},document:{
  querySelector:()=>({dataset:{redlinePhotoId:visible}})
 },renderReviewQueue(){
   visible=state.entries.filter(p=>p.decision_status==='pending')
    .sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))[0]?.id||null;
   firstRenderedBeforeNetwork=true;
 },renderEntries:()=>{},updateTotals:()=>{},
 show:(id,message)=>{if(id==='reviewQueueFeedback')feedback=message},
 dollars:x=>'$'+(Number(x)/100).toFixed(2),
 loadEntries:async({force})=>{
  assert.equal(force,true);
  assert.equal(firstRenderedBeforeNetwork,true,'next photo should be visible before network');
  assert.equal(visible,'photo-b');
  refreshes++;throw Error('Simulated network loss');
 },fail:e=>e.message};
 const refresh=runInNewContext('({'+refreshedPhoto+'}).refreshTimerPhoto',ctx);
 const out=await refresh({photo_id:'photo-a',earned_cents:50,photo_auto_submitted:true},'timer-id');
 assert.equal(out,false,'background refresh can fail without blocking the next photo');
 assert.equal(first.decision_status,'accepted');
 assert.equal(first.amount_cents,50);
 assert.equal(first.auto_timer_session_id,'timer-id');
 assert.equal(state.reviewSidebarPhotoId,null);
 assert.equal(visible,'photo-b');
 assert.equal(second.decision_status,'pending');
 assert.equal(refreshes,1);
 assert.match(feedback,/Next pending photo ready/);
});
test('ten-second timeout uses identical handoff, but never skips an unpriced under-cent photo',async()=>{
 const photo={id:'photo-a',created_at:'2026-11-20T12:00:00Z',decision_status:'pending',amount_cents:null};
 const next={id:'photo-b',created_at:'2026-11-20T12:01:00Z',decision_status:'pending',amount_cents:null};
 const state={closed:false,user:{id:'u'},isOwner:true,room:{id:'room',active:true},
  showArchive:false,entries:[photo,next],reviewSidebarPhotoId:'photo-a',entryFingerprint:'old'};
 let visible='photo-a',renders=0;
 const ctx={state,validId:()=>true,document:{querySelector:()=>({dataset:{redlinePhotoId:visible}})},
 renderReviewQueue:()=>{renders++;visible=state.entries.find(e=>e.decision_status==='pending')?.id},
 renderEntries:()=>{},updateTotals:()=>{},show:()=>{},dollars:v=>'$0.00',
 loadEntries:async()=>{},fail:String};
 const refresh=runInNewContext('({'+refreshedPhoto+'}).refreshTimerPhoto',ctx);
 await refresh({photo_id:'photo-a',earned_cents:0},'timer-id');
 assert.equal(photo.decision_status,'pending');
 assert.equal(visible,'photo-a');
 assert.equal(next.decision_status,'pending');
 assert.equal(renders,1);
});
test('third STOP RPC triggers next-photo reconciliation once and never a duplicate STOP',async()=>{
 let calls=0,advances=0;
 const context={state:{closed:false,isOwner:true,room:{id:'room',active:true},showArchive:false},
  validId:()=>true,verify:async()=>{},
  db:{rpc:async(name,args)=>{
   calls++;assert.equal(name,'corp_redline_timer_stop_request');
   assert.equal(args.p_session_id,'timer-id');
   return {data:{ok:true,status:'stopped',photo_id:'photo-a',earned_cents:50,photo_auto_submitted:true}};
  }},
  window:{BLACKCELL_REDLINE_API:{refreshTimerPhoto:async(row,id)=>{
   advances++;assert.equal(row.photo_id,'photo-a');assert.equal(id,'timer-id');
  }}}};
 const req=runInNewContext('({'+stopChallenge+'}).timerStopRequest',context);
 const result=await req('timer-id');
 assert.equal(result.status,'stopped');
 assert.equal(calls,1,'only one stop request, no second timerStop RPC');
 assert.equal(advances,1,'completed photo advances exactly once');
});
test('timeout status sync reconciles completed timer only when it matches active session',()=>{
 assert.match(timer,/const previousActive=latest\?\.active\?\.running\?latest\.active:null/);
 assert.match(timer,/const completed=latest\?\.recent\?\.find\(x=>x\.id===previousActive\.id\)/);
 assert.match(timer,/await bridge\(\)\?\.refreshTimerPhoto\?\.\(completed,previousActive\.id\)/);
 assert.match(timer,/lastAdvancedTimerId!==previousActive\.id/);
 assert.match(timer,/lastAdvancedTimerId=id/);
});

test('actual review queue stays empty after review and advances when a new photo arrives',()=>{
 const parent={children:[],replaceChildren(){this.children=[]},append(...xs){this.children.push(...xs)}};
 const state={isOwner:true,room:{id:'room'},showArchive:false,reviewSidebarPhotoId:'old',entries:[
  {id:'old',created_at:'2026-11-24T10:00:00Z',decision_status:'accepted'}],timedPhotoTotals:new Map()};
 let sidebar,events=[];
 const make=(tag,cls,value)=>({tag,cls,value,children:[],append(...xs){this.children.push(...xs)}});
 const ctx={state,$:id=>id==='reviewQueueCurrent'?parent:id==='photoLightbox'?{hidden:true}:{},
  document:{body:{classList:{remove(){}}},querySelectorAll:()=>[]},
  entryState:e=>e.decision_status,show(){},node:make,renderEntry:e=>({photo:e.id}),
  preparePhotoReviewLightbox:e=>{sidebar=e},ownerVisiblePhotoId:()=>null,publishOwnerViewing(){},
  window:{dispatchEvent:e=>events.push(e.type)},Event:class{constructor(type){this.type=type}},
  CustomEvent:class{constructor(type){this.type=type}}};
 const render=runInNewContext(queue+';renderReviewQueue',ctx);
 render();assert.equal(parent.children[0].children[0].value,'WAITING FOR FIRST PHOTO');assert.equal(sidebar,null);
 assert.equal(state.reviewSidebarPhotoId,null);assert.ok(events.includes('blackcell:redline:review-empty'));
 render();assert.equal(parent.children[0].children[1].value,'Incoming photos will appear here one at a time.');
 state.entries.push({id:'new',created_at:'2026-11-24T10:01:00Z',decision_status:'pending'});
 render();assert.equal(parent.children[1].photo,'new');assert.equal(sidebar.id,'new');
 assert.equal(state.entries[0].decision_status,'accepted');
});
