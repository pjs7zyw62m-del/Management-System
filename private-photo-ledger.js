import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261112-access2';

const db=corporateClient();
const BUCKET='corp-private-photo-ledger';
const ROOMS='corp_private_photo_rooms';
const ENTRIES='corp_private_photo_entries';
const RATINGS='corp_redline_photo_ratings';
const RESUBMISSION_UPLOADS='corp-private-photo-ledger';
const MAX_IMAGE_BYTES=12*1024*1024;
const MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);
const VALID_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const $=id=>document.getElementById(id);
const state={
 user:null,member:null,isOwner:false,rooms:[],room:null,employees:[],
 entries:[],ratings:new Map(),resubmittingPhotoId:null,filter:'all',timedPhotoTotals:new Map(),timedPhotoFingerprint:'',busy:false,refreshing:false,closed:false,
 images:new Map(),entryFingerprint:'',liveStarted:false,roomChannel:null,roomsChannel:null,liveRoomId:null,liveQueued:false,liveTimer:null,liveConnected:false,scopeMemberId:null,scopeValue:'full',scopeLoading:false,showArchive:false
};
const node=(tag,klass,content)=>{
 const n=document.createElement(tag);
 if(klass)n.className=klass;
 if(content!==undefined)n.textContent=String(content);
 return n;
};
const button=(label,fn,klass='')=>{
 const b=node('button',klass,label);
 b.type='button';b.addEventListener('click',fn);return b;
};
const cents=value=>{
 try {return BigInt(String(value===null?0:value))}catch(_){return 0n}
};
function dollars(value){
 const amount=cents(value);
 const whole=(amount/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return '$'+whole+'.'+(amount%100n).toString().padStart(2,'0');
}
function parseDollars(value){
 const str=String(value||'').trim().replace(/[$,]/g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(str))throw Error('Enter a valid USD amount with up to two decimals, for example 3.50.');
 const [a,b='']=str.split('.');
 const n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));
 if(n<0n||n>MAX_SAFE)throw Error('Amount must be $0.00 or more, within the supported limit.');
 return Number(n);
}
// Typing or pasting .10 in any price field immediately displays 0.10.
function attachCurrencyLeadingZero(input){
 input.addEventListener('input',()=>{
  if(!input.value.startsWith('.'))return;
  const start=input.selectionStart,end=input.selectionEnd;
  input.value='0'+input.value;
  try{input.setSelectionRange(start===null?input.value.length:start+1,
   end===null?input.value.length:end+1)}catch(_){}
 });
 return input;
}
function show(id,text){$(id).textContent=String(text||'')}
function when(date){
 if(!date)return '—';
 const d=new Date(date);
 return Number.isNaN(d.valueOf())?'—':d.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
}
function fail(err){
 return String(err?.message||err||'Unexpected error').replace(/\s+/g,' ').slice(0,280);
}
function participantName(id){
 if(id===state.user?.id)return state.member?.display_name||'You';
 const m=state.employees.find(x=>x.user_id===id);
 return m?.display_name||(id===state.room?.owner_id?'Corporate Owner':'Selected Employee');
}
function roomLink(room){
 const u=new URL('private-photo-ledger.html',location.href);
 u.searchParams.set('room',room.id);
 u.searchParams.delete('v');
 return u.href;
}
function validId(input){return typeof input==='string'&&VALID_ID.test(input)}
function gate(message){
 state.closed=true;
 if(state.liveTimer)clearTimeout(state.liveTimer);
 if(state.roomChannel)void db.removeChannel(state.roomChannel);
 if(state.roomsChannel)void db.removeChannel(state.roomsChannel);
 $('ledgerApp').hidden=true;
 $('accessGate').hidden=false;
 show('gateMessage',message);
}
async function verify(){
 const {data,error}=await db.auth.getUser();
 if(error||!data?.user||data.user.id!==state.user.id)throw Error('Your corporate session has ended.');
 const method=state.isOwner?'corp_code_status':'corp_employee_code_status';
 const res=await db.rpc(method);
 if(res.error||res.data?.ok!==true||res.data.verified!==true)throw Error('Your corporate security verification has expired.');
 if(!state.isOwner){
  const {data,error:scopeError}=await db.from('corp_access_members')
   .select('access_scope').eq('user_id',state.user.id).single();
  if(scopeError)throw Error('Your current employee permissions could not be checked.');
  state.member.access_scope=data?.access_scope==='ledger_only'?'ledger_only':'full';
  updateLedgerNavigation();
 }
}
async function initialize(){
 try{
  const {data:{session}}=await db.auth.getSession();
  if(!session)throw Error('Sign in through BLACKCELL first.');
  const a=await corporateAuthorize(db,{allowLedgerOnly:true});
  if(!a.ok)throw Error('Your corporate account is not approved or active.');
  state.user=a.user;state.member=a.member;
  state.isOwner=a.member.role==='owner'&&a.member.clearance_level===7;
  state.filter=state.isOwner?'priced':'all';
  if(!state.isOwner&&a.member.role!=='employee')throw Error('This private area is available only to verified owner and selected employees.');
  await verify();
  updateLedgerNavigation();
  $('accessGate').hidden=true;
  $('ledgerApp').hidden=false;
  $('ownerSetup').hidden=!state.isOwner;
  if(state.isOwner)await loadEmployees();
  wireEvents();
  setFilter(state.filter);
  await refresh({initial:true});
  setupRealtime();
  window.setInterval(async()=>{
   if(document.hidden||state.closed||state.busy)return;
   try {await refresh()}catch(e){show('entriesFeedback','Refresh unavailable: '+fail(e))}
  },15000);
  window.setInterval(async()=>{
   if(document.hidden||state.closed)return;
   try{await verify()}catch(e){gate(fail(e))}
  },60000);
  document.addEventListener('visibilitychange',()=>{
   if(!document.hidden&&!state.closed)void verify().then(()=>refresh()).catch(e=>gate(fail(e)));
  });
  db.auth.onAuthStateChange(event=>{
   if(event==='SIGNED_OUT'&&!state.closed)gate('Signed out. Sign in again to enter this private room.');
  });
 }catch(e){gate(fail(e))}
}
function updateLedgerNavigation(){
 const scoped=!state.isOwner&&state.member?.access_scope==='ledger_only';
 document.documentElement.classList.toggle('bc-redline-only-security',scoped);
 const badge=document.querySelector('.privacy-pill');
 if(badge){
  badge.setAttribute('aria-label',scoped?'LEVEL R · BLACKCELL REDLINE ONLY':'Private two-person REDLINE room');
  const light=badge.querySelector('.status-dot');
  badge.replaceChildren(light||document.createElement('span'),document.createTextNode(scoped?' LEVEL R · REDLINE ONLY':' RESTRICTED · 2 PERSONS'));
 }
 $('backLink').hidden=scoped;
 $('ledgerSignOut').hidden=state.isOwner;
 $('ledgerBrand').href=scoped?'private-photo-ledger.html':
  state.isOwner?'dashboard.html':'corporate-network.html?view=profile';
 if(!scoped){
  $('backLink').href=state.isOwner?'dashboard.html':'corporate-network.html?view=profile';
  $('backLink').textContent=state.isOwner?'RETURN TO ADMINISTRATION ↗':'RETURN TO NETWORK ↗';
 }
}
function renderLedgerScope(){
 const limited=state.scopeValue==='ledger_only';
 show('ledgerScopeStatus',limited?'LEVEL 0 · REDLINE ONLY':'STANDARD CORPORATE ACCESS');
 show('ledgerScopeIndicator',limited?'RESTRICTED':'STANDARD ACCESS');
 show('ledgerScopeDescription',limited
  ?'Level 0: this employee can only use BLACKCELL REDLINE. Network, chat and other corporate applications are blocked by server-side permissions. You may restore normal access.'
  :'This employee currently has regular corporate access. Restrict them to BLACKCELL REDLINE to block Network, chat and other authorized corporate apps.');
 const btn=$('ledgerScopeToggle');
 btn.disabled=state.scopeLoading;
 btn.textContent=limited?'RESTORE STANDARD APPLICATION ACCESS':'SET REDLINE ONLY ACCESS';
 btn.classList.toggle('scope-restricted',limited);
}
async function loadLedgerScope(memberId){
 if(!state.isOwner||!memberId)return;
 const r=await db.rpc('corp_owner_ledger_scope',{p_member_id:memberId,p_ledger_only:null});
 if(state.room?.member_id!==memberId)return;
 if(r.error||r.data?.ok!==true){
  show('ledgerScopeStatus','COULD NOT VERIFY PERMISSIONS');
  show('ledgerScopeFeedback','Unable to read employee permissions: '+fail(r.error||r.data?.reason));
  $('ledgerScopeToggle').disabled=true;
  state.scopeMemberId=null; // Retry automatically on the next sync.
  return;
 }
 state.scopeValue=r.data.access_scope==='ledger_only'?'ledger_only':'full';
 state.scopeLoading=false;
 show('ledgerScopeFeedback','');
 renderLedgerScope();
}
async function toggleLedgerScope(){
 const room=state.room;
 if(!state.isOwner||!room||state.busy||state.scopeLoading)return;
 const restrict=state.scopeValue!=='ledger_only';
 const who=participantName(room.member_id);
 const message=restrict
  ?'RESTRICT '+who+' to the BLACKCELL REDLINE ONLY?\n\nThe employee will no longer be able to use Blackcell Network, chat, or other corporate apps. Existing private ledger photos stay available.'
  :'RESTORE FULL CORPORATE ACCESS for '+who+'?\n\nThis will re-enable their other permitted BLACKCELL applications.';
 if(!window.confirm(message))return;
 state.scopeLoading=true;
 renderLedgerScope();
 show('ledgerScopeFeedback','Updating employee permissions…');
 try{
  await verify();
  const r=await db.rpc('corp_owner_ledger_scope',{
   p_member_id:room.member_id,p_ledger_only:restrict
  });
  if(r.error||r.data?.ok!==true)throw Error(r.error?.message||r.data?.reason||'Permission update declined');
  if(state.room?.member_id!==room.member_id)return;
  state.scopeValue=r.data.access_scope==='ledger_only'?'ledger_only':'full';
  show('ledgerScopeFeedback',restrict
   ?'Level 0 saved. Only REDLINE remains available.'
   :'Full access restored to the employee’s otherwise authorized applications.');
 }catch(e){show('ledgerScopeFeedback','Permission change failed: '+fail(e))}
 finally{state.scopeLoading=false;renderLedgerScope()}
}
async function loadEmployees(){
 const r=await db.rpc('corp_admin_members');
 if(r.error||r.data?.ok!==true||!Array.isArray(r.data.members))throw Error('Owner authorization is required to select employees.');
 state.employees=r.data.members.filter(m=>m.role==='employee'&&m.active===true&&m.password_activated===true&&m.activated===true);
 const sel=$('employeeChoice');sel.replaceChildren();
 sel.append(new Option('Select an activated employee',''));
 for(const member of state.employees)sel.append(new Option(member.display_name+(member.username?' · @'+member.username:''),member.user_id));
 $('createRoom').disabled=!state.employees.length;
 if(!state.employees.length)show('setupFeedback','No activated employees are available. Activate an employee in User Management first.');
}
async function refresh({initial=false,force=false}={}){
 if(state.closed)return;
 if(state.refreshing){state.liveQueued=true;return}
 state.refreshing=true;
 try{
  const result=await db.from(ROOMS).select('id,owner_id,member_id,title,active,photo_sending_paused,created_at,current_session_started_at')
   .order('created_at',{ascending:false}).limit(100);
  if(result.error)throw result.error;
  state.rooms=result.data||[];
  const currentId=state.room?.id;
  const previousPause=state.room?.photo_sending_paused===true;
  const requested=new URLSearchParams(location.search).get('room');
  const preferred=(validId(requested)?state.rooms.find(x=>x.id===requested):null)
     ||state.rooms.find(x=>x.id===currentId)
     ||state.rooms[0]||null;
  if(currentId!==preferred?.id){
   state.showArchive=false;
   state.timedPhotoTotals.clear();
   state.timedPhotoFingerprint='';
  }
  state.room=preferred;
  if(state.liveStarted)subscribeEntries(preferred);
  $('noRoom').hidden=!!preferred;
  $('activeRoom').hidden=!preferred;
  if(!preferred){
   $('ownerReviewQueue').hidden=true;
   $('reviewQueueCurrent').replaceChildren();
   $('ownerLedgerScope').hidden=true;
   state.scopeMemberId=null;
   $('uploadAccessStatus').hidden=true;
   $('ownerUploadInfo').hidden=true;
   $('employeeUpload').hidden=true;
   $('noRoomText').textContent=state.isOwner?
    'Choose an activated employee above to create a private room. No one can post pictures until you assign them.':
    'No private room has been assigned to your employee account yet. Only the BLACKCELL owner can grant access.';
   $('roomPickerWrap').hidden=true;
   state.entries=[];
   updateRedlineResetControls();
   return;
  }
  fillRoomPicker();
  show('activeRoomTitle',preferred.title);
  show('roomPeople',state.isOwner
   ?'You ↔ '+participantName(preferred.member_id)+' · Only these two accounts'
   :participantName(preferred.owner_id)+' ↔ You · Only these two accounts');
  show('roomStateLabel',preferred.active?'ACTIVE':'CLOSED');
  $('closeRoomBtn').hidden=!state.isOwner;
  $('closeRoomBtn').textContent=preferred.active?'CLOSE ROOM':'REOPEN ROOM';
  $('employeeUpload').hidden=state.isOwner||!preferred.active;
  $('ownerLedgerScope').hidden=!state.isOwner;
  if(state.isOwner&&state.scopeMemberId!==preferred.member_id){
   state.scopeMemberId=preferred.member_id;
   state.scopeValue='full';
   show('ledgerScopeStatus','CHECKING PERMISSIONS…');
   $('ledgerScopeToggle').disabled=true;
   void loadLedgerScope(preferred.member_id);
  }
  updateUploadAccess(preferred);
  show('owedDescription',state.isOwner?'Amount owed by you to this employee':'Amount the owner owes you');
  const idx=state.rooms.findIndex(x=>x.id===preferred.id);
  show('roomNumber',String(idx+1).padStart(2,'0'));
  const u=new URL(location.href);u.searchParams.set('room',preferred.id);
  history.replaceState(null,'',u.pathname+u.search);
  updateRedlineResetControls();
  await loadEntries({force:force||initial||currentId!==preferred.id||
   previousPause!==(preferred.photo_sending_paused===true)});
 }finally{
  state.refreshing=false;
  if(state.liveQueued){state.liveQueued=false;queueLiveRefresh()}
 }
}
function updateUploadAccess(room){
 const available=Boolean(room?.active),paused=Boolean(room?.photo_sending_paused);
 $('uploadAccessStatus').hidden=!room;
 if(!room)return;
 $('ownerUploadInfo').hidden=!state.isOwner;
 const action=$('uploadAccessAction');
 if(state.isOwner){
  show('uploadAccessTitle','PHOTO UPLOAD · ASSIGNED SENDER');
  show('uploadAccessDetail',!available?'Room closed. Reopen it to allow photos.':
   paused?'You have paused this sender’s new photo uploads. Chat remains available.':
   'Sender photo uploads are enabled. You can pause sending from your receiver photo sidebar.');
  show('ownerUploadDescription',paused?
   'Photo uploads are paused by you. Existing photos, chat and timed earnings remain available.':
   'Your receiver-side Pause / Resume Sending button controls future photo uploads.');
  action.textContent=available?'COPY EMPLOYEE UPLOAD LINK':'REOPEN ROOM TO UPLOAD';
  action.disabled=false;
 }else{
  show('uploadAccessTitle',available&&!paused?'UPLOAD A PRIVATE PHOTO':'PHOTO UPLOAD PAUSED');
  show('uploadAccessDetail',!available?
   'The receiver has closed this room. Previous submissions remain visible.':
   paused?'The receiver paused new photo sending. Private chat remains available.':
   'Choose a photo to send it automatically to your private room.');
  action.textContent=!available?'ROOM CLOSED':paused?'SENDING PAUSED':'＋ UPLOAD PHOTO';
  action.disabled=!available||paused;
 }
}
function liveStatus(message,connected=false){
 state.liveConnected=connected;
 const el=$('ledgerLiveStatus');
 if(el){el.textContent=message;el.dataset.connected=connected?'true':'false'}
}
function queueLiveRefresh(){
 if(state.closed)return;
 if(state.liveTimer)clearTimeout(state.liveTimer);
 state.liveTimer=setTimeout(()=>{
  state.liveTimer=null;
  if(state.busy||state.refreshing){state.liveQueued=true;return}
  void refresh().catch(err=>{
   show('entriesFeedback','Live synchronization interrupted: '+fail(err));
   liveStatus('RECONNECTING · AUTOMATIC SYNC',false);
  });
 },200);
}
function subscribeEntries(room){
 const id=room?.id||null;
 if(state.liveRoomId===id)return;
 if(state.roomChannel){void db.removeChannel(state.roomChannel);state.roomChannel=null}
 state.liveRoomId=id;
 if(!id)return;
 const channel=db.channel('bc-private-entry-'+id+'-'+state.user.id)
  .on('postgres_changes',{
   event:'*',schema:'public',table:ENTRIES,filter:'room_id=eq.'+id
  },()=>queueLiveRefresh());
 state.roomChannel=channel;
 channel.subscribe(status=>{
  if(state.closed)return;
  if(status==='SUBSCRIBED'){liveStatus('● LIVE UPDATES CONNECTED',true);queueLiveRefresh()}
  else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')
   liveStatus('RECONNECTING · AUTOMATIC SYNC',false);
 });
}
function setupRealtime(){
 if(state.liveStarted||state.closed)return;
 state.liveStarted=true;
 const scope=state.isOwner?'owner_id':'member_id';
 const channel=db.channel('bc-private-rooms-'+state.user.id)
  .on('postgres_changes',{
   event:'*',schema:'public',table:ROOMS,filter:scope+'=eq.'+state.user.id
  },()=>queueLiveRefresh());
 state.roomsChannel=channel;
 channel.subscribe(status=>{
  if(state.closed)return;
  if(status==='SUBSCRIBED')queueLiveRefresh();
 });
 subscribeEntries(state.room);
}
function fillRoomPicker(){
 const sel=$('roomPicker');sel.replaceChildren();
 for(const r of state.rooms){
  const n=state.isOwner?participantName(r.member_id):r.title;
  sel.append(new Option(n+(r.active?'':' · CLOSED'),r.id));
 }
 sel.value=state.room.id;
 $('roomPickerWrap').hidden=state.rooms.length<=1;
}
async function loadPhotoRatings(items,roomId){
 const next=new Map();
 // RLS confines responses to the sender and receiver of this private room.
 // Limit the lookup to the photographs in the selected current/archive view.
 for(let from=0;from<items.length;from+=150){
  const ids=items.slice(from,from+150).map(e=>e.id);
  if(!ids.length)continue;
  const result=await db.from(RATINGS).select('photo_id,stars,rated_at').in('photo_id',ids);
  if(result.error)throw result.error;
  if(state.room?.id!==roomId)return null;
  for(const rating of result.data||[]){
   if(validId(rating.photo_id)&&Number.isInteger(rating.stars)&&rating.stars>=1&&rating.stars<=5)
    next.set(rating.photo_id,rating);
  }
 }
 return next;
}
function ratedPhotoData(e){
 const rating=state.ratings.get(e.id);
 return {
  id:e.id,stars:rating?.stars||0,rated_at:rating?.rated_at||null,
  created_at:e.created_at,caption:e.caption||'',
  amount_cents:e.amount_cents,
  image_url:state.images.get(e.image_path)?.url||''
 };
}
function fiveStarResubmissionData(){
 if(state.showArchive)return [];
 const copies=new Map();
 for(const e of state.entries){
  if(!e.resubmission_origin_id)continue;
  const old=copies.get(e.resubmission_origin_id)||[];
  old.push(e);copies.set(e.resubmission_origin_id,old);
 }
 return state.entries
  .filter(e=>!e.resubmission_origin_id&&
   state.ratings.get(e.id)?.stars===5&&e.uploaded_by===state.room?.member_id)
  .map(e=>{
   const attempts=copies.get(e.id)||[];
   const rejected=e.decision_status==='rejected'||
    attempts.some(x=>x.decision_status==='rejected');
   const pending=attempts.some(x=>x.decision_status==='pending');
   const originalPending=e.decision_status==='pending';
   return {...ratedPhotoData(e),resubmissionCount:attempts.length,
    resubmissionStatus:rejected?'rejected':originalPending?'original-pending':
     pending?'pending':'ready',
    resubmissionAllowed:e.decision_status==='accepted'&&!rejected&&!pending&&
     state.room?.active===true&&state.room?.photo_sending_paused!==true};
  })
  .sort((a,b)=>(b.resubmissionCount-a.resubmissionCount)||
    (Number(b.amount_cents||0)-Number(a.amount_cents||0)));
}
async function loadEntries({force=false}={}){
 const selectedRoom=state.room;
 if(!selectedRoom)return;
 const all=[];
 for(let from=0;from<5000;from+=250){
  let query=db.from(ENTRIES)
   .select('id,room_id,uploaded_by,image_path,file_name,caption,amount_cents,auto_timer_session_id,resubmission_origin_id,decision_status,decided_at,priced_at,settled_at,created_at')
   .eq('room_id',selectedRoom.id);
  if(selectedRoom.current_session_started_at){
   query=state.showArchive
    ?query.lt('created_at',selectedRoom.current_session_started_at)
    :query.gte('created_at',selectedRoom.current_session_started_at);
  }else if(state.showArchive){state.showArchive=false;updateRedlineResetControls()}
  const result=await query.order('created_at',{ascending:false}).range(from,from+249);
  if(result.error)throw result.error;
  all.push(...(result.data||[]));
  if((result.data||[]).length<250)break;
 }
 if(state.room?.id!==selectedRoom.id)return;
 const ratings=await loadPhotoRatings(all,selectedRoom.id);
 if(!ratings||state.room?.id!==selectedRoom.id)return;
 state.ratings=ratings;
 const ratingsSig=JSON.stringify([...ratings.values()].map(r=>[r.photo_id,r.stars,r.rated_at]).sort((a,b)=>a[0].localeCompare(b[0])));
 const signature=ratingsSig+'|'+String(state.showArchive)+'|'+JSON.stringify(all.map(e=>[e.id,e.amount_cents,e.auto_timer_session_id,e.resubmission_origin_id,e.decision_status,e.decided_at,e.priced_at,e.settled_at,e.caption]));
 state.entries=all;
 updateTotals();
 const needsSignedRefresh=all.some(e=>!state.images.has(e.image_path)
   ||state.images.get(e.image_path).expires<Date.now());
 if(signature!==state.entryFingerprint||force||needsSignedRefresh){
  state.entryFingerprint=signature;
  await signImages(all);
  renderEntries();
  renderReviewQueue();
  // Chat photo previews become available only after the signed URLs load.
  window.dispatchEvent(new Event('blackcell:redline:state'));
 }
 if(all.length>=5000)show('entriesFeedback','Showing up to 5,000 latest submissions; ask administration to archive older records.');
 else show('entriesFeedback','');
}
function updateTotals(){
 let assigned=0n,paid=0n,owed=0n,pending=0;
 let rejected=0,complimentary=0;
 for(const e of state.entries){
  if(e.decision_status==='rejected'){rejected++;continue}
  if(e.decision_status!=='accepted'||e.amount_cents===null){pending++;continue}
  const amount=cents(e.amount_cents);
  if(amount===0n)complimentary++;
  assigned+=amount;
  if(e.settled_at)paid+=amount;else owed+=amount;
 }
 show('totalAssigned',dollars(assigned));
 show('totalPaid',dollars(paid));
 show('totalOwed',dollars(owed));
 show('pendingCount',String(pending));
 show('rejectedCount',String(rejected));
 show('freeCount',String(complimentary));
 window.dispatchEvent(new Event('blackcell:redline:state'));
}
async function signImages(items){
 const now=Date.now();
 const needed=items.filter(e=>!state.images.has(e.image_path)||state.images.get(e.image_path).expires<now);
 for(let i=0;i<needed.length;i+=30){
  const batch=needed.slice(i,i+30);
  const result=await db.storage.from(BUCKET).createSignedUrls(batch.map(e=>e.image_path),600);
  if(result.error){show('entriesFeedback','Private photo previews unavailable: '+fail(result.error));continue}
  for(let j=0;j<batch.length;j++){
   const url=result.data?.[j]?.signedUrl;
   if(url&&typeof url==='string'&&url.startsWith('https://')){
    state.images.set(batch[j].image_path,{url,expires:Date.now()+4*60*1000});
   }
  }
 }
}
function setFilter(name){
 state.filter=name;
 const title=document.querySelector('#activeRoom .timeline-toolbar h2');
 if(title)title.textContent=name==='priced'?'Priced Photos':'Photo History';
 document.querySelectorAll('[data-photo-filter]').forEach(b=>
  b.setAttribute('aria-pressed',String(b.dataset.photoFilter===name)));
 renderEntries();
}
function entryState(e){
 if(e.decision_status==='rejected')return 'rejected';
 if(e.decision_status!=='accepted')return 'pending';
 if(cents(e.amount_cents)===0n)return 'free';
 if(e.settled_at)return 'settled';
 return 'owed';
}
function renderReviewQueue(){
 const queue=$('ownerReviewQueue');
 queue.hidden=!state.isOwner||!state.room||state.showArchive;
 if(queue.hidden){
  const sidebar=$('redlineLightboxReview');
  if(sidebar)sidebar.hidden=true;
  return;
 }
 // The live review queue is the ONE canonical photo viewer. An earlier
 // timed-photo feature added a second preview and its CSS hid this queue.
 // Clear both stale visibility paths SYNCHRONOUSLY on every review render.
 document.body.classList.remove('rr-timing-priced-photo');
 for(const stale of document.querySelectorAll('.rr-timer-selected-preview'))
  stale.hidden=true;
 const pending=state.entries
  .filter(e=>entryState(e)==='pending')
  .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||a.id.localeCompare(b.id));
 show('reviewQueueCount',pending.length+' WAITING');
 const parent=$('reviewQueueCurrent');parent.replaceChildren();
 if(!pending.length){
  // A finished review queue is NOT an empty viewer. Keep the currently
  // selected reviewed photograph in the same one-photo viewport and keep
  // its authenticated controls to the right.
  const selected=state.entries.find(e=>e.id===state.reviewSidebarPhotoId);
  const reviewed=selected&&selected.decision_status!=='pending'?selected:
   state.entries.find(e=>e.decision_status==='accepted')||
   state.entries.find(e=>e.decision_status==='rejected');
  if(reviewed){
   parent.append(renderEntry(reviewed));
  }else{
   const empty=node('div','queue-empty');
   empty.append(node('strong','','WAITING FOR FIRST PHOTO'));
   empty.append(node('p','','Incoming photos will appear here one at a time.'));
   parent.append(empty);
  }
  // Receiver's pause and timer controls remain available even when all
  // received photos were already reviewed.
  preparePhotoReviewLightbox(reviewed||null);
  return;
 }
 const current=pending[0];
 const selected=state.reviewSidebarPhotoId?
  state.entries.find(e=>e.id===state.reviewSidebarPhotoId):null;
 // If the owner just stopped a timer, keep that newly accepted photo on
 // screen with its final price. Do not silently switch to another photo.
 const timedSelection=selected?.decision_status==='accepted'&&
  Boolean(state.timedPhotoTotals.get(selected.id)||selected.auto_timer_session_id);
 const shown=timedSelection?selected:current;
 window.dispatchEvent(new CustomEvent('blackcell:redline:review-photo',{detail:{photoId:shown.id}}));
 const progress=node('div','queue-progress');
 progress.append(
  node('strong','',timedSelection?'TIMED PHOTO · FINAL PRICE':'NEXT PHOTO TO REVIEW'),
  node('span','',timedSelection?pending.length+' STILL WAITING':'1 OF '+pending.length+' · OLDEST FIRST')
 );
 parent.append(progress,renderEntry(shown));
 preparePhotoReviewLightbox(shown);
}
function renderEntries(){
 const parent=$('photoEntries');parent.replaceChildren();
 if(!state.room)return;
 const list=state.entries.filter(e=>
  state.filter==='all'
  ||(state.filter==='reviewed'&&entryState(e)!=='pending')
  ||(state.filter==='priced'&&e.decision_status==='accepted')
  ||entryState(e)===state.filter
 );
 if(!list.length){
  const message=state.filter==='priced'
   ?'No priced photos yet. Once a photo is accepted, it appears in this list.'
   :state.filter==='reviewed'
   ?'No reviewed photos yet. Accept or reject a picture above and it will appear here.'
   :state.filter==='all'
     ?state.showArchive?'No archived photos in this room.':'No photos yet. The selected employee can upload the first picture here.'
     :'No photo entries match this filter.';
  parent.append(node('div','empty-entries',message));
  return;
 }
 for(const e of list)parent.append(renderEntry(e));
}
// Status RPC is verified for the same two-person room. The per-photo total
// appears automatically after STOP, without rewriting an immutable bid or
// adding the same money a second time to the separate timer ledger.
window.addEventListener('blackcell:redline:timed-photo-summary',event=>{
 if(!state.room||event.detail?.roomId!==state.room.id)return;
 const rows=Array.isArray(event.detail.photoTotals)?event.detail.photoTotals:[];
 const signature=JSON.stringify(rows.map(r=>[r.photo_id,r.timed_cents,r.credited_to_photo_cents,r.additional_timed_cents,r.timed_paid_cents,r.timed_owed_cents,r.completed_minutes]));
 if(signature===state.timedPhotoFingerprint)return;
 state.timedPhotoFingerprint=signature;
 state.timedPhotoTotals=new Map(rows.filter(r=>validId(r.photo_id)).map(r=>[r.photo_id,r]));
 if(state.entries.length){renderEntries();renderReviewQueue()}
});
function renderEntry(e){
 const status=entryState(e);
 const timed=state.timedPhotoTotals.get(e.id);
 const timedCents=cents(timed?.timed_cents??0);
 const creditedCents=cents(timed?.credited_to_photo_cents??0);
 const extraTimedCents=timed?.additional_timed_cents!==undefined
  ?cents(timed.additional_timed_cents):(timedCents>creditedCents?timedCents-creditedCents:0n);
 const baseCents=cents(e.amount_cents);
 // The STOP amount exists in BOTH the timer ledger and photo price. Only
 // other timed sessions are added on top of that auto-submitted photo price.
 const combinedPrice=baseCents+extraTimedCents;
 const card=node('article','photo-entry');
 card.dataset.redlinePhotoId=e.id;
 const rating=state.ratings.get(e.id);
 const imageButton=button('',()=>{
  window.dispatchEvent(new CustomEvent('blackcell:redline:photo-selected',{detail:{photoId:e.id}}));
  const src=state.images.get(e.image_path)?.url;
  if(!src)return;
  $('lightboxImage').src=src;
  $('lightboxImage').alt=e.caption||'Private uploaded photograph';
  // Full-screen inspection is a separate photo-only overlay.
  // All verified bid and timer controls remain alongside the normal viewer.
  $('photoLightbox').hidden=false;document.body.style.overflow='hidden';
 },'photo-image-btn');
 imageButton.setAttribute('aria-label','Open the full-size photograph without other controls');
 const img=node('img');
 img.loading=state.isOwner&&status==='pending'?'eager':'lazy';
 img.decoding='async';img.alt=e.caption||e.file_name;
 const signed=state.images.get(e.image_path)?.url;
 if(signed)img.src=signed;else{
  img.alt='Image preview unavailable. Select Refresh to retry.';
  imageButton.title='Private preview unavailable — refresh';
  if(state.isOwner&&status==='pending')imageButton.append(node('span','rr-photo-unavailable','Image unavailable — use Refresh to load the private photo.'));
 }
 imageButton.append(img);
 if(state.isOwner&&status==='pending'){
  imageButton.classList.add('review-image-button');
  imageButton.append(node('span','review-photo-enlarge','⤢  VIEW FULL PHOTO'));
 }
 card.append(imageButton);
 const body=node('div','photo-entry-content');
 const meta=node('div','entry-meta');
 meta.append(node('span','',when(e.created_at)));
 const statusBadge=node('span','entry-badge '+status,status==='pending'?'AWAITING YOUR REVIEW':status==='rejected'?'REJECTED':status==='free'&&timedCents>0n?'ACCEPTED · TIMED EARNED':status==='free'?'ACCEPTED · $0.00':status==='owed'?'AMOUNT OWED':'RECORDED PAID');
 meta.append(statusBadge);
 body.append(meta,node('h3','','PHOTO '+e.id.slice(0,8).toUpperCase()));
 if(e.resubmission_origin_id)body.append(node('div','rr-photo-resubmission-tag',
  '↻ RESUBMITTED 5-STAR PHOTO · ORIGINAL '+e.resubmission_origin_id.slice(0,8).toUpperCase()));
 if(rating){
  body.append(node('div','rr-photo-star-summary',
   '★'.repeat(rating.stars)+'☆'.repeat(5-rating.stars)+
   (rating.stars===5?' · TOP PICK':' · '+rating.stars+'/5 STARS')));
 }
 if(e.caption?.trim())body.append(node('p','caption',e.caption.trim()));
 const ctrl=node('div','entry-controls');
 if(status==='rejected'){
  body.append(node('div','entry-amount','REJECTED'));
  if(timedCents>0n)body.append(node('div','rr-photo-timed-summary','Timed earnings recorded: '+dollars(timedCents)));
  ctrl.append(node('small','',timedCents>0n
   ?'One-time bid rejected. Completed timed earnings remain recorded separately.'
   :'The owner rejected this photo on '+when(e.decided_at)+'. No amount was added.'));
 }else if(status==='free'){
  body.append(node('div','entry-amount',dollars(combinedPrice)));
  if(timedCents>0n)body.append(node('div','rr-photo-timed-summary','Timed earnings '+dollars(timedCents)+' · One-time bid $0.00'));
  ctrl.append(node('small','',timedCents>0n
   ?'Completed-minute earnings have been saved automatically. No one-time bid.'
   :'Accepted at no charge on '+when(e.decided_at)+'. No payment is owed.'));
 }else if(e.decision_status==='accepted'){
  body.append(node('div','entry-amount',dollars(combinedPrice)));
  if(timedCents>0n)body.append(node('div','rr-photo-timed-summary',
   e.auto_timer_session_id
    ?'Automatically submitted from timer '+dollars(baseCents)+(extraTimedCents>0n?' + other timed earnings '+dollars(extraTimedCents):'')
    :'One-time bid '+dollars(baseCents)+' + timed earnings '+dollars(extraTimedCents)));
  ctrl.append(node('small','',e.settled_at
   ?'Manually recorded as paid on '+when(e.settled_at)
   :'Accepted by the owner on '+when(e.decided_at)+'.'));
  if(state.isOwner&&!e.settled_at&&cents(e.amount_cents)>0n){
   ctrl.append(button('✓ RECORD AS PAID',()=>void settle(e),'button-outline'));
  }
 }else{
  body.append(node('div','entry-amount','PENDING OWNER REVIEW'));
  if(timedCents>0n)body.append(node('div','rr-photo-timed-summary',
   'Automatic timed price: '+dollars(timedCents)+' · Saved after timer stopped'));
  if(state.isOwner){
   body.append(node('strong','review-price-heading','SET YOUR PRICE'));
   const row=node('div','amount-row');
   const input=node('input');
   input.type='text';input.inputMode='decimal';input.placeholder='USD 0.00';input.maxLength=23;attachCurrencyLeadingZero(input);
   input.setAttribute('aria-label','Amount to accept in USD for photo '+e.id.slice(0,8));
   const submit=button('✓ ACCEPT PHOTO',()=>void assignAmount(e,input,submit),'button-main');
   const zero=button('✓ ACCEPT $0.00',()=>void acceptZero(e,zero),'button-outline');
   const reject=button('✕ REJECT PHOTO',()=>void rejectPhoto(e,reject),'button-outline reject-photo');
   row.append(input,submit,zero,reject);
   ctrl.append(row,node('small','','Accept for any amount, including $0.00, or reject. A decision is recorded and cannot be undone.'));
  }else{
   ctrl.append(node('small','','Waiting for the BLACKCELL owner to accept or reject this photograph.'));
  }
 }
 if(state.isOwner&&status!=='rejected'){
  ctrl.append(button('⏱ TIME THIS PHOTO',()=>{
   window.dispatchEvent(new CustomEvent('blackcell:redline:photo-selected',{detail:{photoId:e.id},bubbles:false}));
   document.querySelector('#redlineReceiverReviewStage')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  },'redline-photo-timer-pick'));
 }
 body.append(ctrl);card.append(body);return card;
}
// Moving on after reviewing a timed photo returns to the next pending entry.
window.addEventListener('blackcell:redline:next-incoming',()=>{
 state.reviewSidebarPhotoId=null;
 renderReviewQueue();
});
// Changing the visible photo updates its matching bid/timer sidebar.
window.addEventListener('blackcell:redline:photo-selected',event=>{
 const id=event.detail?.photoId;
 if(!state.isOwner||!id)return;
 const selected=state.entries.find(e=>e.id===id);
 if(!selected)return;
 state.reviewSidebarPhotoId=id;
 preparePhotoReviewLightbox(selected);
});
// This owner-only control is located in the receiver's bid/timer sidebar.
function appendReceiverPauseControl(panel){
 if(!state.isOwner||!state.room||state.showArchive)return;
 const wrapper=node('section','rr-receiver-photo-pause');
 const paused=state.room.photo_sending_paused===true;
 const label=node('strong','rr-receiver-pause-heading','PHOTO SENDING');
 const action=button(paused?'▶ RESUME SENDING':'⏸ PAUSE SENDING',
  ()=>void toggleReceiverPause(),'rr-receiver-pause-button');
 action.id='redlineReceiverSendingPause';
 action.type='button';
 action.setAttribute('aria-pressed',String(paused));
 const status=node('p','rr-receiver-pause-status',paused?
  'Sender photo uploads paused. Chat remains available.':'Sender may send new photographs.');
 status.setAttribute('role','status');
 wrapper.append(label,action,status);
 panel.append(wrapper);
 async function toggleReceiverPause(){
  if(!state.room||!state.isOwner||state.showArchive)return;
  const roomId=state.room.id;
  action.disabled=true;status.textContent='Saving receiver setting…';
  try{
   await verify();
   if(state.room?.id!==roomId)throw Error('The selected room changed.');
   const target=!Boolean(state.room.photo_sending_paused);
   const result=await db.from(ROOMS)
    .update({photo_sending_paused:target})
    .eq('id',roomId).eq('owner_id',state.user.id)
    .select('id,photo_sending_paused').single();
   if(result.error||!result.data)throw Error(fail(result.error||'Could not save receiver setting.'));
   if(state.room?.id!==roomId)return;
   const saved=result.data.photo_sending_paused===true;
   state.room.photo_sending_paused=saved;
   for(const r of state.rooms)if(r.id===roomId)r.photo_sending_paused=saved;
   panel.dataset.redlinePause=String(saved);
   action.textContent=saved?'▶ RESUME SENDING':'⏸ PAUSE SENDING';
   action.setAttribute('aria-pressed',String(saved));
   status.textContent=saved?'New photo uploads are paused. Chat stays active.':'Sender photo uploads resumed.';
   updateUploadAccess(state.room);
   window.dispatchEvent(new Event('blackcell:redline:state'));
  }catch(error){status.textContent='Could not change sending: '+fail(error)}
  finally{action.disabled=false}
 }
}
// Star ratings are not bids, timers, acceptance decisions or payments.
function appendPhotoRatingControl(panel,entry){
 if(!state.isOwner||!state.room||state.showArchive||!entry)return;
 const wrap=node('section','rr-photo-rating-panel');
 const title=node('strong','rr-photo-rating-title','RATE THIS PHOTOGRAPH');
 const buttons=node('div','rr-photo-rating-buttons');
 buttons.setAttribute('role','group');
 buttons.setAttribute('aria-label','Choose a one to five star rating');
 const result=node('p','rr-photo-rating-feedback');
 result.setAttribute('role','status');
 const current=state.ratings.get(entry.id)?.stars||0;
 const controls=[];
 for(let n=1;n<=5;n++){
  const star=button('★',()=>void saveRating(n),'rr-photo-rating-star'+(n<=current?' is-filled':''));
  star.setAttribute('aria-label','Rate photo '+n+' out of 5 stars');
  star.setAttribute('aria-pressed',String(n===current));
  star.title=n+' of 5 stars';
  controls.push(star);
  buttons.append(star);
 }
 const hint=node('small','rr-photo-rating-hint',
  current===5?'TOP PICK · 5 STARS':current?current+' OF 5 STARS':'Choose 1–5 stars · Sender sees your rating in chat');
 wrap.append(title,buttons,hint,result);panel.append(wrap);
 let saving=false;
 async function saveRating(stars){
  if(saving||!state.isOwner||state.room?.id!==entry.room_id)return;
  saving=true;for(const item of controls)item.disabled=true;
  result.textContent='Saving rating…';
  try{
   await verify();
   const response=await db.from(RATINGS).upsert(
    {photo_id:entry.id,stars},{onConflict:'photo_id'}
   ).select('photo_id,stars,rated_at').single();
   if(response.error||!response.data)throw Error(fail(response.error||'Rating not saved'));
   if(state.room?.id!==entry.room_id)return;
   state.ratings.set(entry.id,response.data);
   result.textContent=stars===5?'Saved · 5 STARS · TOP PICK':'Saved · '+stars+' of 5 stars';
   for(let i=0;i<controls.length;i++){
    controls[i].classList.toggle('is-filled',i<stars);
    controls[i].setAttribute('aria-pressed',String(i+1===stars));
   }
   hint.textContent=stars===5?'TOP PICK · 5 STARS':stars+' OF 5 STARS';
   panel.dataset.redlineRating=String(stars);
   // The signed photo URL stays in the existing verified room snapshot.
   // The sender's separate device receives the rating through room polling.
   state.entryFingerprint='';
   renderEntries();
   window.dispatchEvent(new Event('blackcell:redline:state'));
  }catch(error){result.textContent='Could not save rating: '+fail(error)}
  finally{saving=false;for(const item of controls)item.disabled=false}
 }
}
// Full-screen inspection uses the existing authenticated decision handlers
// in the NORMAL viewer sidebar, never in the full-screen photo-only popup.
function preparePhotoReviewLightbox(entry){
 const panel=$('redlineLightboxReview');
 if(!panel)return;
 // Keep entered bid values stable while the room refreshes or timer ticks.
 const photoTimed=entry?state.timedPhotoTotals.get(entry.id):null;
 const timedSignature=String(photoTimed?.timed_cents||0)+'/'+
  String(photoTimed?.credited_to_photo_cents||0)+'/'+String(photoTimed?.additional_timed_cents||0);
 const ratingSig=String(entry?state.ratings.get(entry.id)?.stars||0:0);
 if(panel.dataset.redlinePhotoId===(entry?.id||'none')&&
    panel.dataset.redlineDecision===(entry?.decision_status||'empty')&&
    panel.dataset.redlinePause===String(Boolean(state.room?.photo_sending_paused))&&
    panel.dataset.redlineTimed===timedSignature&&
    panel.dataset.redlineRating===ratingSig&&!panel.hidden)return;
 panel.dataset.redlinePhotoId=entry?.id||'none';
 panel.dataset.redlineDecision=entry?.decision_status||'empty';
 panel.dataset.redlinePause=String(Boolean(state.room?.photo_sending_paused));
 panel.dataset.redlineTimed=timedSignature;
 panel.dataset.redlineRating=ratingSig;
 // Preserve the same authenticated timer node when refreshing the bid UI.
 const liveTimer=$('redlinePhotoTimerPanel');
 if(liveTimer?.parentNode===panel)liveTimer.remove();
 panel.replaceChildren();
 const restoreTimer=()=>{if(liveTimer&&state.isOwner)panel.append(liveTimer)};
 const review=state.isOwner&&entry?.decision_status==='pending'&&!state.showArchive;
 // The sidebar is visible to the verified receiver for both pending and
 // accepted photographs. Only pending images can receive a final price.
 const receiverActions=state.isOwner&&!state.showArchive;
 panel.hidden=!receiverActions;
 if(!receiverActions)return;
 appendReceiverPauseControl(panel);
 if(entry)appendPhotoRatingControl(panel,entry);
 if(!review){
  const summary=entry?state.timedPhotoTotals.get(entry.id):null;
  const timed=cents(summary?.timed_cents||0),credited=cents(summary?.credited_to_photo_cents||0);
  const extra=summary?.additional_timed_cents!==undefined
   ?cents(summary.additional_timed_cents):(timed>credited?timed-credited:0n);
  panel.append(node('span','redline-review-kicker','VERIFIED RECEIVER'));
  panel.append(node('h3','','PHOTO CONTROLS'));
  // Keep the last reviewed photograph visible, but explain why there is no
  // next photo. Archived photos must not cross the Start Fresh boundary.
  const pendingInCurrent=state.entries.some(e=>e.decision_status==='pending');
  if(!pendingInCurrent){
   panel.append(node('p','rr-current-session-finished',
    state.entries.length
     ?'NO NEXT PHOTO · All photographs in this current session have been reviewed. New uploads will appear automatically.'
     :'NO NEXT PHOTO · Waiting for the first photograph in this session.'));
  }
  if(entry){
   panel.append(node('p','rr-photo-price-title',
    entry.decision_status==='accepted'?'ACCEPTED PHOTO PRICE':'COMPLETED TIMER PRICE'));
   panel.append(node('strong','rr-photo-price-amount',dollars(cents(entry.amount_cents)+extra)));
   if(timed>0n)panel.append(node('p','rr-photo-price-breakdown',
    entry.auto_timer_session_id
     ?'Auto-submitted on Stop Timer · '+dollars(timed)+' total timed earnings'
     :entry.decision_status==='accepted'
      ?'Original bid '+dollars(entry.amount_cents)+' + timed earnings '+dollars(timed)
      :'Saved timer earnings '+dollars(timed)));
  }
  restoreTimer();
  return;
 }
 panel.append(node('span','redline-review-kicker','VERIFIED OWNER · PRIVATE REVIEW'));
 const label=node('label','redline-review-label','YOUR BID · USD');
 const input=node('input','redline-review-amount');
 input.type='text';input.inputMode='decimal';input.placeholder='0.00';input.maxLength=23;attachCurrencyLeadingZero(input);
 input.setAttribute('aria-label','Acceptance amount in US dollars');
 label.append(input);panel.append(label);
 const controls=node('div','redline-review-actions');
 const accept=button('✓ ACCEPT FOR AMOUNT',()=>void decision('accept'),'button-main');
 const zero=button('✓ ACCEPT $0.00',()=>void decision('zero'),'button-outline');
 const reject=button('✕ REJECT PHOTO',()=>void decision('reject'),'button-outline reject-photo');
 controls.append(accept,zero,reject);
 panel.append(controls,node('p','redline-review-hint','Decisions are final. No actual payment is transferred.'));
 const statusLine=node('p','redline-review-status');
 statusLine.setAttribute('role','status');
 panel.append(statusLine);
 restoreTimer();
 const allButtons=[accept,zero,reject];
 let running=false;
 async function decision(kind){
  if(running)return;
  running=true;for(const b of allButtons)b.disabled=true;
  statusLine.textContent='Verifying and saving your decision…';
  try{
   const result=kind==='reject'?await rejectPhoto(entry,reject):
    kind==='zero'?await assignAmount(entry,{value:'0.00'},zero):
     await assignAmount(entry,input,accept);
   if(result===true){if(!$('photoLightbox').hidden)closeLightbox();return}
   if(kind==='reject'&&result===null){statusLine.textContent='Rejection cancelled. The photo remains pending.';return}
   statusLine.textContent='No decision was saved. Check the amount, or try again.';
  }catch(error){statusLine.textContent='Decision not saved: '+fail(error)}
  finally{running=false;for(const b of allButtons)b.disabled=false}
 }
}
async function assignAmount(entry,input,submit){
 if(!state.isOwner||state.busy||entry.decision_status!=='pending')return;
 let amount;
 try{amount=parseDollars(input.value)}catch(e){show('entriesFeedback',fail(e));return}
 state.busy=true;submit.disabled=true;submit.textContent='SAVING…';
 try{
  await verify();
  const r=await db.from(ENTRIES).update({amount_cents:amount,decision_status:'accepted'})
   .eq('id',entry.id).eq('room_id',state.room.id).eq('decision_status','pending')
   .select('id,amount_cents,decision_status').single();
  if(r.error)throw r.error;
  // Server has CONFIRMED the decision. Advance immediately from local state
  // before any follow-up network request can delay or undo the next image.
  Object.assign(entry,{amount_cents:amount,decision_status:'accepted',
   decided_at:new Date().toISOString(),priced_at:new Date().toISOString()});
  const saved=state.entries.find(e=>e.id===entry.id);
  if(saved&&saved!==entry)Object.assign(saved,entry);
  state.reviewSidebarPhotoId=null;
  window.dispatchEvent(new CustomEvent('blackcell:redline:photo-decided',{detail:{photoId:entry.id}}));
  renderReviewQueue();
  renderEntries();
  updateTotals();
  show('reviewQueueFeedback','Accepted for '+dollars(amount)+' · Showing the next pending photo.');
  state.entryFingerprint='';
  try{await loadEntries({force:true})}
  catch(refreshError){show('entriesFeedback',
   'Photo price saved and next photo displayed. Background refresh unavailable: '+fail(refreshError));}
  return true;
 }catch(e){show('entriesFeedback','Could not assign amount: '+fail(e));return false}
 finally{state.busy=false;submit.disabled=false;submit.textContent='✓ ACCEPT PHOTO'}
}
async function acceptZero(entry,trigger){
 const field=document.createElement('input');
 field.value='0.00';
 return await assignAmount(entry,field,trigger);
}
async function confirmRejectPhoto(entry){
 const dialog=$('redlineRejectPhotoConfirm');
 if(!dialog||dialog.open)return false;
 $('redlineRejectPhotoRef').textContent='PHOTO '+entry.id.slice(0,8).toUpperCase();
 dialog.returnValue='';
 return new Promise(resolve=>{
  dialog.addEventListener('close',()=>resolve(dialog.returnValue==='reject'),{once:true});
  dialog.showModal();
 });
}
async function rejectPhoto(entry,trigger){
 if(!state.isOwner||state.busy||entry.decision_status!=='pending')return;
 if(!await confirmRejectPhoto(entry))return null;
 state.busy=true;trigger.disabled=true;
 try{
  await verify();
  const r=await db.from(ENTRIES).update({decision_status:'rejected'})
    .eq('id',entry.id).eq('room_id',state.room.id).eq('decision_status','pending')
    .select('id,decision_status').single();
  if(r.error)throw r.error;
  Object.assign(entry,{decision_status:'rejected',decided_at:new Date().toISOString()});
  const saved=state.entries.find(e=>e.id===entry.id);
  if(saved&&saved!==entry)Object.assign(saved,entry);
  state.reviewSidebarPhotoId=null;
  window.dispatchEvent(new CustomEvent('blackcell:redline:photo-decided',{detail:{photoId:entry.id}}));
  renderReviewQueue();
  renderEntries();
  updateTotals();
  show('reviewQueueFeedback','Photo rejected · Showing the next pending photo.');
  state.entryFingerprint='';
  try{await loadEntries({force:true})}
  catch(refreshError){show('entriesFeedback',
   'Photo rejection saved. Next photo displayed; background refresh unavailable: '+fail(refreshError));}
  return true;
 }catch(e){show('entriesFeedback','Could not reject photo: '+fail(e));return false}
 finally{state.busy=false;trigger.disabled=false}
}
async function settle(entry){
 if(!state.isOwner||state.busy||entry.decision_status!=='accepted'||cents(entry.amount_cents)<=0n||entry.settled_at)return;
 const message='Record '+dollars(entry.amount_cents)+' as paid?\n\nThis is only a ledger record; no money will move. Only continue if you actually settled the amount.';
 if(!window.confirm(message))return;
 state.busy=true;
 try{
  await verify();
  const r=await db.from(ENTRIES).update({settled_at:new Date().toISOString()})
    .eq('id',entry.id).eq('room_id',state.room.id).is('settled_at',null)
    .select('id,settled_at').single();
  if(r.error)throw r.error;
  state.entryFingerprint='';await loadEntries({force:true});
  show('entriesFeedback','Payment manually recorded. The shared balance was updated.');
 }catch(e){show('entriesFeedback','Could not record settlement: '+fail(e))}
 finally{state.busy=false}
}
function imageType(file){
 const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif'};
 const normalized=String(file?.type||'').toLowerCase();
 if(types[normalized])return{mime:normalized,ext:types[normalized]};
 const ext=String(file?.name||'').split('.').pop().toLowerCase();
 const fileTypes={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',
  webp:'image/webp',heic:'image/heic',heif:'image/heif'};
 if(!normalized&&fileTypes[ext])return{mime:fileTypes[ext],ext:ext==='jpeg'?'jpg':ext};
 throw Error('Choose a JPEG, PNG, WebP or HEIC image.');
}
async function uploadPhoto(...args){
 let release;
 try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('uploadPhoto',window)}catch(_){}
 try{return await bcLiveOriginal_uploadPhoto.apply(this,args)}finally{release?.()}
}
async function bcLiveOriginal_uploadPhoto(event){
 event.preventDefault();
 if(state.isOwner||state.busy||!state.room?.active)return;
 if(state.room.photo_sending_paused){
  $('uploadPhoto').value='';
  show('uploadFeedback','Photo sending was paused by the receiver.');
  return;
 }
 if(state.showArchive){show('uploadFeedback','Return to the current REDLINE session before uploading new photos.');return}
 const file=$('uploadPhoto').files?.[0];
 if(!file){show('uploadFeedback','Choose a photo first.');return}
 if(file.size>MAX_IMAGE_BYTES||file.size===0){$('uploadPhoto').value='';show('uploadFeedback','Choose a non-empty image no larger than 12 MB. Select a different photo to try again.');return}
 let info;
 try{info=imageType(file)}catch(e){$('uploadPhoto').value='';show('uploadFeedback',fail(e)+' Choose a supported photo to try again.');return}
 state.busy=true;
 const btn=$('submitPhoto'),picker=$('uploadPhoto');
 btn.disabled=true;picker.disabled=true;$('employeeUpload').classList.add('bc-photo-sending');
 btn.textContent='UPLOADING PRIVATELY…';
 show('selectedPhotoName','Sending photo privately…');
 show('uploadFeedback','Sending privately to your assigned REDLINE room…');
 const room=state.room;
 const id=crypto.randomUUID();
 const path=room.id+'/'+id+'.'+info.ext;
 try{
  await verify();
  // Read the current server-side room flag before sending. A receiver may
  // pause from another device; database policies also guard against races.
  const permission=await db.from(ROOMS).select('id,active,photo_sending_paused')
   .eq('id',room.id).single();
  if(permission.error||!permission.data)throw Error('Could not verify photo sending permission.');
  if(state.room?.id!==room.id)throw Error('Private room changed. Photo not sent.');
  state.room.photo_sending_paused=permission.data.photo_sending_paused===true;
  if(!permission.data.active||permission.data.photo_sending_paused){
   window.dispatchEvent(new Event('blackcell:redline:state'));
   throw Error(permission.data.photo_sending_paused?'The receiver paused photo sending.':'Private room closed.');
  }
  const upload=await db.storage.from(BUCKET).upload(path,file,{contentType:info.mime,upsert:false,cacheControl:'60'});
  if(upload.error)throw upload.error;
  const r=await db.from(ENTRIES).insert({
    id,room_id:room.id,uploaded_by:state.user.id,image_path:path,decision_status:'pending',
    file_name:file.name.slice(0,180),caption:''
  }).select('id').single();
  if(r.error){
   // The cleanup policy allows deleting an uploaded file only if no ledger entry references it.
   await db.storage.from(BUCKET).remove([path]);
   throw r.error;
  }
  const accompanyingMessage=$('uploadCaption').value.trim();
  $('uploadPhoto').value='';
  show('selectedPhotoName','Select another photo to send automatically.');
  if(accompanyingMessage){
   try{
    await window.BLACKCELL_REDLINE_API.sendMessage(accompanyingMessage);
    $('uploadCaption').value='';
    window.dispatchEvent(new Event('blackcell:redline:messages-changed'));
    show('uploadFeedback','Photo and private message sent successfully.');
   }catch(messageError){
    show('uploadFeedback','Photo saved, but the message was not sent: '+fail(messageError)+'. Your message is still in the box; select Send Message Only to retry.');
   }
  }else{
   show('uploadFeedback','Photo saved privately. The owner can now assign an amount.');
  }
  state.entryFingerprint='';
  try{await loadEntries({force:true})}
  catch(refreshError){show('uploadFeedback','Photo saved privately, but the review list has not refreshed yet: '+fail(refreshError));}
 }catch(e){
  picker.value='';
  show('selectedPhotoName','Select a photo to try again.');
  show('uploadFeedback','Photo not sent: '+fail(e)+'. Choose a photo again to retry.');
 }
 finally{
  state.busy=false;btn.disabled=false;
  picker.disabled=Boolean(state.room?.photo_sending_paused);
  $('employeeUpload').classList.remove('bc-photo-sending');
  btn.textContent='POST TO OUR PRIVATE ROOM ↗';
 }
}
async function createRoom(event){
 event.preventDefault();
 if(!state.isOwner||state.busy)return;
 const memberId=$('employeeChoice').value;
 const chosen=state.employees.find(e=>e.user_id===memberId);
 if(!chosen){show('setupFeedback','Choose an activated employee first.');return}
 const title=$('roomLabel').value.trim().slice(0,90);
 if(!title){show('setupFeedback','Enter a short room title.');return}
 if(state.rooms.some(r=>r.member_id===memberId)){
  show('setupFeedback','A private room already exists for that employee. Select it from the room list.');
  return;
 }
 state.busy=true;$('createRoom').disabled=true;show('setupFeedback','Creating a private two-person room…');
 try{
  await verify();
  const r=await db.from(ROOMS).insert({
   owner_id:state.user.id,member_id:memberId,title,active:true
  }).select('id').single();
  if(r.error)throw r.error;
  state.room=null;state.entryFingerprint='';
  const link=new URL(location.href);link.searchParams.set('room',r.data.id);
  history.replaceState(null,'',link.pathname+link.search);
  await refresh({force:true});
  show('setupFeedback','Private room created for '+chosen.display_name+'. Only you and that account can open it.');
 }catch(e){show('setupFeedback','Could not create room: '+fail(e))}
 finally{state.busy=false;$('createRoom').disabled=!state.employees.length}
}
async function toggleRoom(){
 if(!state.isOwner||!state.room||state.busy)return;
 const room=state.room;
 const next=!room.active;
 if(!window.confirm((next?'Reopen':'Close')+' this private room? Existing photos and amounts will remain visible.'))return;
 state.busy=true;
 try{
  await verify();
  const r=await db.from(ROOMS).update({active:next}).eq('id',room.id).select('id').single();
  if(r.error)throw r.error;
  await refresh({force:true});
 }catch(e){show('entriesFeedback','Could not change room access: '+fail(e))}
 finally{state.busy=false}
}
function updateRedlineResetControls(){
 const room=state.room,hasArchive=!!room?.current_session_started_at;
 const tools=$('redlineSessionTools'),actions=$('redlineResetActions');
 if(tools)tools.hidden=!room;
 if(actions)actions.hidden=!state.isOwner||!room;
 const archive=$('redlineArchiveToggle');
 if(archive){
  archive.hidden=!hasArchive;
  archive.textContent=state.showArchive?'← RETURN TO CURRENT SESSION':'VIEW PREVIOUS RECORDS ↗';
  archive.setAttribute('aria-pressed',String(state.showArchive));
 }
 const description=$('redlineSessionDescription');
 if(description)description.textContent=state.showArchive
  ?'ARCHIVE · Earlier photos, messages and payment records are preserved. They have not been deleted or cancelled.'
  :hasArchive
   ?'CURRENT SESSION · A fresh REDLINE workspace. Previous records and unpaid balances remain in the archive.'
   :'CURRENT SESSION · Your verified private REDLINE room.';
 document.body.classList.toggle('bc-redline-archive-view',state.showArchive);
 window.dispatchEvent(new Event('blackcell:redline:session-mode'));
}
async function setRedlineArchiveView(archive){
 if(!state.room)return;
 if(archive&&!state.room.current_session_started_at)return;
 state.showArchive=!!archive;state.entryFingerprint='';state.images.clear();
 updateRedlineResetControls();
 setFilter(state.showArchive?'all':state.isOwner?'reviewed':'all');
 await loadEntries({force:true});
 window.dispatchEvent(new Event('blackcell:redline:state'));
}
async function startRedlineFresh(all=false){
 if(!state.isOwner||!state.room||state.busy)return;
 const title=all?'ALL YOUR REDLINE ROOMS':'THIS PRIVATE ROOM';
 const phrase=all?'RESET REDLINE':'START FRESH';
 const entered=window.prompt(
  'START FRESH · '+title+'\n\nThe active workspace will appear blank. Older photos, messages and financial records will be archived—not deleted. Previous unpaid amounts remain owed and accessible in Archive.\n\nType '+phrase+' to confirm:',''
 );
 if(entered!==phrase)return;
 if(!window.confirm('Confirm '+title+'? Old history remains accessible in Archive, including outstanding balances.'))return;
 state.busy=true;
 const status=$('redlineResetStatus');
 if(status)status.textContent='Verifying owner authorization and starting a fresh session…';
 $('redlineStartFreshRoom').disabled=$('redlineMasterReset').disabled=true;
 try{
  await verify();
  const {data,error}=await db.rpc('corp_owner_redline_start_fresh',{
   p_confirmation:phrase,p_room_id:all?null:state.room.id
  });
  if(error||data?.ok!==true||(!all&&data.rooms_reset!==1)){
   throw Error(data?.reason||error?.message||'The server did not confirm the reset.');
  }
  state.showArchive=false;state.entryFingerprint='';state.images.clear();
  await refresh({force:true});
  if(status)status.textContent='Fresh REDLINE session ready. '+data.rooms_reset+' room(s) archived. No financial records or photos deleted.';
  window.dispatchEvent(new Event('blackcell:redline:reset'));
 }catch(e){
  if(status)status.textContent='Unable to start fresh: '+fail(e);
 }finally{
  state.busy=false;
  $('redlineStartFreshRoom').disabled=$('redlineMasterReset').disabled=false;
 }
}
async function copyLink(){
 if(!state.room)return;
 const link=roomLink(state.room);
 try{
  if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
  await navigator.clipboard.writeText(link);
  show('linkFeedback','Private link copied. Only the assigned employee and owner can view it.');
 }catch(_){window.prompt('Copy this private link:',link)}
}
function closeLightbox(){
 $('photoLightbox').hidden=true;
 $('photoLightbox').classList.remove('is-review');
 $('lightboxImage').removeAttribute('src');
 // The persistent bid/timer sidebar is NOT part of this image-only popup.
 document.body.style.overflow='';
}
function wireEvents(){
 $('createRoomForm').addEventListener('submit',e=>void createRoom(e));
 $('uploadPhotoForm').addEventListener('submit',e=>void uploadPhoto(e));
 $('uploadPhoto').addEventListener('change',()=>show('selectedPhotoName',$('uploadPhoto').files?.[0]?.name||'No photo selected'));
 $('refreshLedger').addEventListener('click',()=>{state.entryFingerprint='';void refresh({force:true}).catch(e=>show('entriesFeedback','Refresh failed: '+fail(e)))});
 $('roomPicker').addEventListener('change',()=>{
  state.room=state.rooms.find(r=>r.id===$('roomPicker').value)||null;
  if(state.room){
   const u=new URL(location.href);u.searchParams.set('room',state.room.id);
   history.replaceState(null,'',u.pathname+u.search);
  }
  state.entryFingerprint='';
  show('reviewQueueFeedback','');
  void refresh({force:true}).catch(e=>show('entriesFeedback',fail(e)));
 });
 $('closeRoomBtn').addEventListener('click',()=>void toggleRoom());
 $('redlineArchiveToggle').addEventListener('click',()=>void setRedlineArchiveView(!state.showArchive));
 $('redlineStartFreshRoom').addEventListener('click',()=>void startRedlineFresh(false));
 $('redlineMasterReset').addEventListener('click',()=>void startRedlineFresh(true));
 $('copyRoomLink').addEventListener('click',()=>void copyLink());
 $('ledgerScopeToggle').addEventListener('click',()=>void toggleLedgerScope());
 $('ledgerSignOut').addEventListener('click',async()=>{
  try{await db.auth.signOut({scope:'local'})}catch(_){}
  location.replace('employee.html');
 });
 $('ownerUploadShare').addEventListener('click',()=>void copyLink());
 $('uploadAccessAction').addEventListener('click',()=>{
  if(!state.room)return;
  if(state.isOwner){
   if(state.room.active)void copyLink();
   else void toggleRoom();
   return;
  }
  if(!state.room.active)return;
  const panel=$('employeeUpload');
  panel.scrollIntoView({behavior:'smooth',block:'center'});
  $('uploadPhoto').click();
 });
 $('closeLightbox').addEventListener('click',closeLightbox);
 $('photoLightbox').addEventListener('click',e=>{if(e.target===$('photoLightbox'))closeLightbox()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('photoLightbox').hidden)closeLightbox()});
 document.querySelectorAll('[data-photo-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.photoFilter)));
}
/* REDLINE two-party chat / earnings bridge.
 * Exposes only the currently authenticated private room. The database RLS
 * verifies both sides independently; this interface does not alter identity.
 */
const REDLINE_MESSAGES='corp_private_photo_messages';
window.BLACKCELL_REDLINE_API=Object.freeze({
 async ownerAccessMembers(){
  if(!state.isOwner||state.closed||!state.user||$('ledgerApp').hidden)throw Error('Verified owner access required.');
  await verify();
  const result=await db.rpc('corp_admin_members');
  if(result.error||result.data?.ok!==true||!Array.isArray(result.data.members))throw Error('Unable to load employee permissions.');
  return result.data.members.filter(member=>member.role==='employee').map(member=>({
   userId:member.user_id,name:member.display_name||member.username||'Employee',
   username:member.username||'',clearance:member.clearance_level,
   accessScope:member.access_scope==='ledger_only'?'ledger_only':'full',
   active:member.active===true
  }));
 },
 async ownerSetRedlineOnly(userId,restricted){
  if(!state.isOwner||state.closed||!state.user||$('ledgerApp').hidden)throw Error('Verified owner access required.');
  if(!validId(userId)||typeof restricted!=='boolean'||userId===state.user.id)throw Error('Invalid employee selection.');
  await verify();
  const result=await db.rpc('corp_owner_redline_access',{
   p_member_id:userId,p_redline_only:restricted
  });
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Access update declined.'));
  if(state.room?.member_id===userId){
   state.scopeValue=restricted?'ledger_only':'full';
   renderLedgerScope();
  }
  return {accessScope:result.data.access_scope,clearanceLevel:result.data.clearance_level};
 },
 async timerStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||!validId(roomId))throw Error('Verified private room required.');
  const result=await db.rpc('corp_redline_photo_timer_status',{p_room_id:roomId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Timed photo ledger unavailable.'));
  return result.data;
 },
 async timerStart(photoId,rateCents){
  if(state.closed||!state.isOwner||state.showArchive||!state.room?.active||!validId(photoId)
     ||!Number.isSafeInteger(rateCents)||rateCents<1||rateCents>100000)throw Error('Select a photo and a valid rate up to $1,000 per minute.');
  const roomId=state.room.id;
  await verify();
  if(state.room?.id!==roomId)throw Error('Room changed; timer not started.');
  const result=await db.rpc('corp_redline_photo_timer_start',{
   p_room_id:roomId,p_photo_id:photoId,p_rate_cents:rateCents
  });
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Timer could not start.'));
  return result.data;
 },
 async timerHeartbeat(sessionId){
  if(state.closed||!state.isOwner||!validId(sessionId)||document.hidden)throw Error('Visible owner session required.');
  const result=await db.rpc('corp_redline_photo_timer_heartbeat',{p_session_id:sessionId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Timer expired.'));
  return true;
 },
 async timerStop(sessionId,options={}){
  if(state.closed||!state.isOwner||!validId(sessionId))throw Error('Owner timer session required.');
  await verify();
  const result=await db.rpc('corp_redline_photo_timer_stop',{p_session_id:sessionId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Timer could not stop.'));
  // Explicit STOP keeps the final priced photo visible. A timer implicitly
  // stopped by accepting/advancing must NEVER select the previous photo.
  if(result.data.photo_id&&state.room?.id){
   if(options.keepPhotoSelected!==false)state.reviewSidebarPhotoId=result.data.photo_id;
   state.entryFingerprint='';
   try{await loadEntries({force:true})}catch(_){}
  }
  return result.data;
 },
 async timerMarkPaid(sessionId){
  if(state.closed||!state.isOwner||!validId(sessionId))throw Error('Verified owner required.');
  await verify();
  const result=await db.rpc('corp_redline_photo_timer_mark_paid',{p_session_id:sessionId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Timed payment could not be recorded.'));
  return result.data;
 },
 async presenceTouch(roomId,sessionId,active=true){
  if(state.closed||!state.user||!validId(roomId)||!validId(sessionId)||typeof active!=='boolean'||(active&&state.room?.id!==roomId))throw Error('REDLINE room presence unavailable.');
  const result=await db.rpc('corp_redline_presence_touch',{p_room_id:roomId,p_session_id:sessionId,p_active:active});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Presence update failed.'));
  return true;
 },
 async presenceStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||!validId(roomId))throw Error('Verified REDLINE room required.');
  const result=await db.rpc('corp_redline_presence_status',{p_room_id:roomId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Presence status unavailable.'));
  return {online:result.data.online===true,lastActiveAt:result.data.last_active_at||null};
 },
 snapshot(){
  if(state.closed||!state.user||!state.room||$('ledgerApp').hidden)return null;
  return {
   roomId:state.room.id,
   userId:state.user.id,
   peerName:state.isOwner?participantName(state.room.member_id):participantName(state.room.owner_id),
   isOwner:state.isOwner,
   roomActive:state.room.active===true,
   photoSendingPaused:state.room.photo_sending_paused===true,
   roomTitle:state.room.title,
   archiveMode:state.showArchive,
   resetAt:state.room.current_session_started_at||null,
   pending:state.entries.filter(e=>e.decision_status==='pending').length,
   owed:$('totalOwed').textContent,
   assigned:$('totalAssigned').textContent,
   paid:$('totalPaid').textContent,
   entries:state.entries.slice(0,200).map(e=>({
    id:e.id,created_at:e.created_at,decided_at:e.decided_at,
    settled_at:e.settled_at,decision_status:e.decision_status,
    amount_cents:e.amount_cents,
    resubmission_origin_id:e.resubmission_origin_id||null,
    caption:e.caption||''
   })),
   ratingEvents:state.entries.filter(e=>state.ratings.has(e.id))
    .sort((a,b)=>Date.parse(state.ratings.get(b.id)?.rated_at||0)-Date.parse(state.ratings.get(a.id)?.rated_at||0))
    .slice(0,40).map(ratedPhotoData),
   topPicks:state.entries.filter(e=>state.ratings.has(e.id))
    .sort((a,b)=>
     (state.ratings.get(b.id)?.stars||0)-(state.ratings.get(a.id)?.stars||0)||
     Number(cents(a.amount_cents)<cents(b.amount_cents))-Number(cents(a.amount_cents)>cents(b.amount_cents))||
     Date.parse(state.ratings.get(b.id)?.rated_at||0)-Date.parse(state.ratings.get(a.id)?.rated_at||0))
    .slice(0,5).map(ratedPhotoData),
   fiveStarPhotos:fiveStarResubmissionData()
  };
 },
 async resubmitFiveStarPhoto(photoId){
  const room=state.room;
  if(state.closed||state.isOwner||state.showArchive||!state.user||
    !room?.active||room.photo_sending_paused||!validId(photoId))
   throw Error('Return to an active sender room with photo sending enabled.');
  if(state.resubmittingPhotoId)throw Error('A five-star photo is already being resubmitted.');
  const source=state.entries.find(e=>e.id===photoId&&e.room_id===room.id);
  const allowed=fiveStarResubmissionData().find(p=>p.id===photoId&&p.resubmissionAllowed);
  if(!source||!allowed)throw Error('This five-star photo is not eligible for another resubmission.');
  const extension=source.image_path.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)?.[1]?.toLowerCase();
  if(!extension)throw Error('Original photo type is unsupported.');
  state.resubmittingPhotoId=photoId;
  let newPath=null,posted=false;
  try{
   await verify();
   const permission=await db.from(ROOMS)
    .select('id,active,photo_sending_paused,current_session_started_at')
    .eq('id',room.id).single();
   if(permission.error||!permission.data)throw Error('Unable to verify receiver photo sending permission.');
   if(!permission.data.active||permission.data.photo_sending_paused)
    throw Error('The receiver paused photo sending or closed this room.');
   if(permission.data.current_session_started_at&&
     Date.parse(source.created_at)<Date.parse(permission.data.current_session_started_at))
    throw Error('An archived photo cannot be resubmitted to the current session.');
   if(state.room?.id!==room.id)throw Error('The selected REDLINE room changed.');
   const download=await db.storage.from(BUCKET).download(source.image_path);
   if(download.error||!download.data)throw Error(fail(download.error||'Unable to retrieve original photo.'));
   const blob=download.data;
   if(!blob.size||blob.size>MAX_IMAGE_BYTES)throw Error('The stored original exceeds the supported photo limit.');
   const id=crypto.randomUUID();
   newPath=room.id+'/'+id+'.'+extension;
   const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',
    webp:'image/webp',heic:'image/heic',heif:'image/heif'}[extension];
   const storage=await db.storage.from(BUCKET).upload(newPath,blob,{
    contentType:mime,upsert:false,cacheControl:'60'
   });
   if(storage.error)throw Error(fail(storage.error));
   const created=await db.from(ENTRIES).insert({
    id,room_id:room.id,uploaded_by:state.user.id,image_path:newPath,
    resubmission_origin_id:photoId,decision_status:'pending',
    file_name:source.file_name,caption:source.caption||''
   }).select('id').single();
   if(created.error||!created.data)throw Error(fail(created.error||'The receiver has blocked another resend.'));
   posted=true;
   // The original (and its accepted price) are untouched. The fresh copy is
   // a pending review with NO price until this receiver decides again.
   state.entryFingerprint='';
   try{await loadEntries({force:true})}catch(_){}
   window.dispatchEvent(new Event('blackcell:redline:state'));
   return {ok:true,photoId:created.data.id,originId:photoId};
  }catch(error){
   // Safely remove only an unposted temporary storage copy. Never delete
   // the original or any successful ledger resubmission.
   if(newPath&&!posted)try{await db.storage.from(BUCKET).remove([newPath])}catch(_){}
   throw error;
  }finally{state.resubmittingPhotoId=null}
 },
 async toggleArchive(){
  await setRedlineArchiveView(!state.showArchive);
  return {archiveMode:state.showArchive};
 },
  async loadMessages(){
  const roomId=state.room?.id;
  if(state.closed||!state.user||!roomId)return [];
  let query=db.from(REDLINE_MESSAGES)
   .select('id,room_id,sender_id,body,created_at').eq('room_id',roomId);
  const cutoff=state.room?.current_session_started_at;
  if(cutoff)query=state.showArchive?query.lt('created_at',cutoff):query.gte('created_at',cutoff);
  const result=await query.order('created_at',{ascending:false}).limit(150);
  if(result.error)throw result.error;
  if(state.closed||state.room?.id!==roomId)return [];
  return (result.data||[]).reverse();
 },
 async sendMessage(message){
  const body=String(message||'').trim();
  if(!body||body.length>2000)throw Error('Enter a message of 1 to 2,000 characters.');
  const room=state.room;
  if(state.closed||!room?.active||!state.user||state.showArchive)throw Error('Return to the current session before sending messages.');
  await verify();
  if(state.closed||state.room?.id!==room.id||!state.room.active)throw Error('Private room changed; try again.');
  const result=await db.from(REDLINE_MESSAGES).insert({
   room_id:room.id,sender_id:state.user.id,body
  });
  if(result.error)throw result.error;
  return true;
 }
});
window.dispatchEvent(new Event('blackcell:redline:bridge'));
void initialize();
