import {mountGroupRooms} from './private-photo-ledger-groups.js?v=20261128-live-group2';
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261112-access2';
import {isBunnyPath,uploadBunnyPhoto,transferBunnyLibraryPhoto,readBunnyPhoto,cleanupUnpostedBunny,deleteRedlinePhotoFile} from './private-photo-ledger-bunny.js?v=20261127-server-transfer1';

const db=corporateClient();
// Legacy archive photo paths use the old private bucket; new uploads never do.
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
 entries:[],ratings:new Map(),resubmittingPhotoId:null,deletingPhotoId:null,filter:'all',timedPhotoTotals:new Map(),timedPhotoFingerprint:'',busy:false,refreshing:false,closed:false,
 images:new Map(),entryFingerprint:'',liveStarted:false,roomChannel:null,roomsChannel:null,liveRoomId:null,liveQueued:false,liveTimer:null,liveConnected:false,scopeMemberId:null,scopeValue:'full',scopeLoading:false,showArchive:false,paymentStatus:null,paymentAllocations:new Map()
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
 const signed=cents(value),amount=signed<0n?-signed:signed;
 const whole=(amount/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return (signed<0n?'-':'')+'$'+whole+'.'+(amount%100n).toString().padStart(2,'0');
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
function show(id,text){const el=$(id),value=String(text||'');if(el&&el.textContent!==value)el.textContent=value}
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
// A suspended Android tab can reopen REDLINE after Level 0 is restored to
// Level 1. Remember only the verified restriction of this tab, never a grant.
const REDLINE_SCOPE_RESTORE_WINDOW_MS=48*60*60*1000;
function redlineScopeRestoreKey(){return 'bc.redline.level0-entry.v1:'+String(state.user?.id||'')}
function recordRestrictedRedlineEntry(){
 if(state.isOwner||state.member?.access_scope!=='ledger_only')return;
 try{sessionStorage.setItem(redlineScopeRestoreKey(),String(Date.now()))}catch(_){}
}
function returnRestoredAndroidToOS(){
 if(state.isOwner||state.member?.access_scope!=='full')return false;
 try{sessionStorage.removeItem(redlineScopeRestoreKey())}catch(_){}
 // Stay in REDLINE even when full workspace permissions return.
 // Navigation to BLACKCELL OS is now explicitly user initiated.
 return false;
}
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
  recordRestrictedRedlineEntry();
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
  if(!state.isOwner){try{globalThis.indexedDB?.deleteDatabase('blackcell-redline-outbox-v1')}catch(_){}}
  if(returnRestoredAndroidToOS())return;
  updateLedgerNavigation();
  $('accessGate').hidden=true;
  $('ledgerApp').hidden=false;
  $('ownerSetup').hidden=!state.isOwner;
  if(new URLSearchParams(location.search).get('rdHome')==='1'||(state.isOwner&&!new URLSearchParams(location.search).has('room')))document.body.dataset.redlineRoomHome='loading';
  if(state.isOwner)await loadEmployees();
  wireEvents();
  setFilter(state.filter);
  await refresh({initial:true});
  setupRealtime();
  if(state.isOwner)void drainFinalizedSourceFiles();
  window.setInterval(async()=>{
   if(document.hidden||state.closed||state.busy)return;
   try {await refresh()}catch(e){show('entriesFeedback','Refresh unavailable: '+fail(e))}
  },15000);
  window.setInterval(async()=>{
   if(document.hidden||state.closed)return;
   try{await verify()}catch(e){gate(fail(e))}
  },60000);
  document.addEventListener('visibilitychange',()=>{
   if(!document.hidden&&!state.closed)void verify().then(()=>{
    if(!returnRestoredAndroidToOS())return refresh();
   }).catch(e=>gate(fail(e)));
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
  state.isOwner?'dashboard.html':'blackcell-os.html';
 if(!scoped){
  $('backLink').href=state.isOwner?'dashboard.html':'blackcell-os.html';
  $('backLink').textContent=state.isOwner?'RETURN TO ADMINISTRATION ↗':'RETURN TO BLACKCELL OS ↗';
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
// Owner room directory: explicit selection, never automatically open the first sender.
let roomDirectorySignature='',directorySummaryGeneration=0;
const directorySummaryFields=new Map();
function directoryMetric(label,value,icon){
 const metric=node('span','rd-room-metric'),symbol=node('span','rd-room-metric-icon',icon),copy=node('span','rd-room-metric-copy'),number=node('strong','rd-room-metric-value',value);
 symbol.setAttribute('aria-hidden','true');copy.append(node('span','rd-room-metric-label',label),number);metric.append(symbol,copy);return {metric,number};
}
function directoryActivity(photo,message){
 const dates=[photo,message].map(x=>Date.parse(x||'')).filter(Number.isFinite);
 return dates.length?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(Math.max(...dates))):'No activity';
}
// Read-only, bounded parallel summaries. No image downloads or additional polling.
async function loadDirectorySummaries(rooms){
 const generation=++directorySummaryGeneration,uid=state.user?.id;
 const current=()=>generation===directorySummaryGeneration&&state.isOwner&&!state.closed&&!state.room&&state.user?.id===uid&&!$('ledgerApp').hidden;
 if(!current())return;
 let index=0;
 async function worker(){
  while(current()&&index<rooms.length){
   const r=rooms[index++],fields=directorySummaryFields.get(r.id);
   if(!fields||r.owner_id!==uid||!validId(r.id))continue;
   for(const el of [fields.activity,fields.payment,fields.photos]){el.textContent='Loading…';el.removeAttribute('data-tone')}
   const result=await Promise.allSettled([
    db.from(ENTRIES).select('created_at',{count:'exact'}).eq('room_id',r.id).order('created_at',{ascending:false}).limit(1),
    db.from(REDLINE_MESSAGES).select('created_at').eq('room_id',r.id).order('created_at',{ascending:false}).limit(1),
    db.rpc('corp_redline_room_payment_status',{p_room_id:r.id,p_archive:false})
   ]);
   if(!current()||directorySummaryFields.get(r.id)!==fields)continue;
   const unpack=x=>x.status==='fulfilled'&&!x.value?.error?x.value:null;
   const [p,m,b]=result.map(unpack);
   fields.activity.textContent=p&&m?directoryActivity(p.data?.[0]?.created_at,m.data?.[0]?.created_at):'Unavailable';
   fields.photos.textContent=Number.isInteger(p?.count)?String(p.count):'Unavailable';
   const remaining=b?.data?.remaining_cents,valid=b?.data?.ok===true&&/^[0-9]+$/.test(String(remaining??''));
   const net=valid?cents(remaining)-cents(b.data.photo_action_bill_credit_carry_cents):0n;
   fields.payment.textContent=valid?dollars(net):'Unavailable';
   if(valid)fields.payment.dataset.tone=net>0n?'outstanding':'clear';
  }
 }
 await Promise.all(Array.from({length:Math.min(3,rooms.length)},()=>worker()));
}
function chooseAuthorizedRoom(rooms,requested,currentId,isOwner,uid){
 if(isOwner)return validId(requested)?rooms.find(r=>r.id===requested&&r.owner_id===uid)||null:null;
 return (validId(requested)?rooms.find(r=>r.id===requested):null)||rooms.find(r=>r.id===currentId)||rooms[0]||null;
}
function navigateRoomDirectory(roomId=null){
 if(state.closed||!state.user||$('ledgerApp').hidden)return false;
 if(roomId!==null&&!state.rooms.some(r=>r.id===roomId&&(state.isOwner?r.owner_id===state.user.id:r.member_id===state.user.id)))return false;
 if(state.busy||state.deletingPhotoId||state.resubmittingPhotoId||redlineQueueRunning||redlinePhotoQueue.length){alert('Finish the current REDLINE operation before changing rooms.');return false}
 const draft=Array.from(document.querySelectorAll('.redline-message-entry')).some(e=>e.value?.trim());
 if(draft&&!confirm('Leave this room with an unsent message? Your saved records are preserved.'))return false;
 const u=new URL(location.href);
 if(roomId){u.searchParams.set('room',roomId);u.searchParams.delete('rdHome')}else{u.searchParams.delete('room');u.searchParams.set('rdHome','1')}
 u.searchParams.set('rdRoomEntry','20261125-redline-home1');
 location.assign(u.href);return true;
}
function renderRoomDirectory(preferred,refreshSummaries=false){
 const home=!preferred,section=$('redlineRoomDirectory');
 section.hidden=!home;
 if(!home){directorySummaryGeneration++;delete document.body.dataset.redlineRoomHome;delete document.body.dataset.redlineRoomCreate;return}
 document.body.dataset.redlineRoomHome='ready';
 mountGroupRooms(db,{isOwner:state.isOwner,section});
 const own=state.rooms.filter(r=>state.isOwner?r.owner_id===state.user.id:r.member_id===state.user.id);
 section.querySelector('.rd-directory-slash').textContent=state.isOwner?'/ OWNER WORKSPACE':'/ SENDER WORKSPACE';
 section.querySelector('.rd-directory-owner').textContent=state.isOwner?'♙ OWNER ACCESS':'♙ SENDER ACCESS';
 $('redlineDirectoryCreate').hidden=!state.isOwner;
 const active=own.filter(r=>r.active===true).length;
 show('redlineDirectoryActive',String(active));show('redlineDirectoryClosed',String(own.length-active));
 const rows=own.slice().sort((a,b)=>Number(b.active===true)-Number(a.active===true)||String(a.title).localeCompare(String(b.title)));
 const sig=JSON.stringify(rows.map(r=>[r.id,r.title,r.active,r.photo_sending_paused,participantName(state.isOwner?r.member_id:r.owner_id),state.isOwner]));
 if(sig!==roomDirectorySignature){
  roomDirectorySignature=sig;
  const list=$('redlineDirectoryList');list.replaceChildren();directorySummaryFields.clear();
  if(!rows.length){const empty=node('div','rd-room-empty');empty.append(node('strong','','No private rooms yet'),node('p','',state.isOwner?'Create a room and assign an activated employee.':'Your assigned private rooms will appear here.'));list.append(empty)}
  for(const r of rows){
   const card=button('',()=>navigateRoomDirectory(r.id),'rd-room-card'+(r.active?' is-active':' is-closed'));
   const top=node('span','rd-room-card-top'),name=participantName(state.isOwner?r.member_id:r.owner_id);
   const initials=name.trim().split(/\s+/).slice(0,2).map(s=>Array.from(s)[0]||'').join('').toUpperCase()||'BC';
   const avatar=node('span','rd-room-avatar',initials),status=node('span','rd-room-status'+(r.active?' is-active':''),r.active?(r.photo_sending_paused?'UPLOADS PAUSED':'ACTIVE'):'CLOSED');
   const identity=node('span','rd-room-identity');
   identity.append(node('strong','rd-room-title',r.title||'Private room'),node('span','rd-room-member',name),status);top.append(avatar,identity);
   const activity=directoryMetric('Last photo / chat','Loading…','◷'),payment=directoryMetric('Current balance','Loading…','▤'),photos=directoryMetric('Photo records','Loading…','▧'),session=directoryMetric('Session state',r.active?(r.photo_sending_paused?'Uploads paused':'Open'):'Closed','∿');
   directorySummaryFields.set(r.id,{activity:activity.number,payment:payment.number,photos:photos.number});
   const stats=node('span','rd-room-stats');if(state.isOwner)stats.append(activity.metric,payment.metric,photos.metric);stats.append(session.metric);
   card.append(top,stats,node('span','rd-room-open',r.active?'Open Room →':'View Records →'));
   list.append(card);
  }
  if(state.isOwner)void loadDirectorySummaries(rows);
 }else if(refreshSummaries&&state.isOwner)void loadDirectorySummaries(rows);
 if(!state.isOwner){show('redlineDirectoryNote','Only rooms assigned to your verified account are visible.');return}
 const assigned=new Set(own.map(r=>r.member_id));
 for(const option of $('employeeChoice').options)if(option.value)option.disabled=assigned.has(option.value);
 if(assigned.has($('employeeChoice').value))$('employeeChoice').value='';
 const available=state.employees.some(e=>!assigned.has(e.user_id));
 $('redlineDirectoryCreate').disabled=!available;
 $('createRoom').disabled=!available||state.busy;
 show('redlineDirectoryNote',available?'Each room is private between you and one assigned employee.':'All activated employees already have a room, or no employees are available.');
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
  const explicitHome=new URLSearchParams(location.search).get('rdHome')==='1';
  const eligible=state.rooms.filter(r=>state.isOwner?r.owner_id===state.user.id:r.member_id===state.user.id);
  const preferred=explicitHome?null:chooseAuthorizedRoom(eligible,requested,currentId,state.isOwner,state.user?.id);
  if(currentId!==preferred?.id){
   state.showArchive=false;
   state.timedPhotoTotals.clear();
   state.timedPhotoFingerprint='';
  }
  state.room=preferred;
  if(state.liveStarted)subscribeEntries(preferred);
  const noRoomHidden=!!preferred||state.isOwner;
  if($('noRoom').hidden!==noRoomHidden)$('noRoom').hidden=noRoomHidden;
  if($('activeRoom').hidden!==!preferred)$('activeRoom').hidden=!preferred;
  renderRoomDirectory(preferred,initial||force);
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
   state.entries=[];state.ratings.clear();state.paymentStatus=null;state.paymentAllocations.clear();state.entryFingerprint='';clearImageCache();
   updateRedlineResetControls();
   window.dispatchEvent(new Event('blackcell:redline:state'));
   return;
  }
  fillRoomPicker();
  show('activeRoomTitle',preferred.title);
  show('roomPeople',state.isOwner
   ?'You ↔ '+participantName(preferred.member_id)+' · Only these two accounts'
   :participantName(preferred.owner_id)+' ↔ You · Only these two accounts');
  show('roomStateLabel',preferred.active?'ACTIVE':'CLOSED');
  $('closeRoomBtn').hidden=!state.isOwner;
  $('redlineRoomBack').hidden=false;
  $('closeRoomBtn').textContent=preferred.active?'END SESSION':'COMPLETE END SESSION';
  const uploadHidden=state.isOwner||!preferred.active;
  if($('employeeUpload').hidden!==uploadHidden)$('employeeUpload').hidden=uploadHidden;
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
  if(u.pathname+u.search!==location.pathname+location.search)history.replaceState(null,'',u.pathname+u.search+u.hash);
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
  if(state.refreshing){state.liveQueued=true;return}
  if(state.busy){state.liveTimer=setTimeout(queueLiveRefresh,1000);return}
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
let roomPickerSignature='';
function fillRoomPicker(){
 const sel=$('roomPicker');
 const rows=state.rooms.map(r=>[r.id,(state.isOwner?participantName(r.member_id):r.title)+(r.active?'':' · CLOSED')]);
 const sig=JSON.stringify(rows);
 if(sig!==roomPickerSignature){sel.replaceChildren(...rows.map(([id,label])=>new Option(label,id)));roomPickerSignature=sig}
 if(sel.value!==state.room.id)sel.value=state.room.id;
 const wrap=$('roomPickerWrap'),hidden=state.rooms.length<=1;if(wrap.hidden!==hidden)wrap.hidden=hidden;
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
  created_at:e.created_at,caption:e.photo_removal_status?'':e.caption||'',
  amount_cents:e.amount_cents,
  settled_at:e.settled_at||null,
  auto_timer_session_id:e.auto_timer_session_id||null,
  removed:e.photo_removal_status==='removed',
  removal_status:e.photo_removal_status||null,
  image_url:e.photo_removal_status?'':state.images.get(e.image_path)?.url||''
 };
}
function photoHistoryData(){
 if(!state.room)return [];
 const copies=new Map();
 for(const e of state.entries){
  if(!e.resubmission_origin_id)continue;
  const prior=copies.get(e.resubmission_origin_id)||[];
  prior.push(e);copies.set(e.resubmission_origin_id,prior);
 }
 return state.entries.filter(e=>e.uploaded_by===state.room.member_id).map(e=>{
  const attempts=copies.get(e.id)||[];
  const rejected=e.decision_status==='rejected'||attempts.some(x=>x.decision_status==='rejected');
  const pending=attempts.some(x=>x.decision_status==='pending');
  // Reuse differs from bonus qualification: an approved original can
  // be resubmitted unless its earlier copy was rejected or is pending.
  const eligibleOriginal=!e.photo_removal_status&&!e.resubmission_origin_id&&
   e.decision_status==='accepted';
  const resubmissionStatus=e.photo_removal_status?'removed':e.resubmission_origin_id?'reused-copy':
   rejected?'rejected':e.decision_status==='pending'?'original-pending':
   pending?'pending':e.decision_status!=='accepted'?'not-approved':'ready';
  return {...ratedPhotoData(e),decision_status:e.decision_status,settled_at:e.settled_at,
   resubmission_origin_id:e.resubmission_origin_id||null,
   resubmissionCount:attempts.length,resubmissionStatus,
   resubmissionAllowed:eligibleOriginal&&!rejected&&!pending&&
    !state.showArchive&&state.room.active===true&&state.room.photo_sending_paused!==true};
 }).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
}
function fiveStarResubmissionData(history=photoHistoryData()){
 const fiveStarRoots=new Set(history.filter(p=>!p.removal_status&&p.stars===5).map(p=>p.resubmission_origin_id||p.id));
 return history.filter(p=>!p.removal_status&&!p.resubmission_origin_id&&fiveStarRoots.has(p.id))
  .sort((a,b)=>Number(b.resubmissionAllowed)-Number(a.resubmissionAllowed)||
   (b.resubmissionCount-a.resubmissionCount)||(Number(b.amount_cents||0)-Number(a.amount_cents||0)));
}
function roomPaymentScope(){
 return state.room?.id+'|'+String(state.showArchive)+'|'+String(state.room?.current_session_started_at||'');
}
function authoritativePaymentStatus(){
 const p=state.paymentStatus;
 return p?.scope===roomPaymentScope()?p:null;
}
let paymentRefreshSequence=0,paymentAppliedSequence=0;
async function loadRoomPayments(roomId,archive=state.showArchive){
 if(!validId(roomId))return null;
 const scope=roomId+'|'+String(archive)+'|'+String(state.room?.current_session_started_at||'');
 const requestId=++paymentRefreshSequence;
 const response=await db.rpc('corp_redline_room_payment_status',{p_room_id:roomId,p_archive:archive});
 if(response.error||response.data?.ok!==true)throw Error(fail(response.error||response.data?.reason||'Payment balances unavailable.'));
 if(state.closed||state.room?.id!==roomId||roomPaymentScope()!==scope||requestId<paymentAppliedSequence)return null;
 paymentAppliedSequence=requestId;
 const next={...response.data,scope},changed=JSON.stringify(state.paymentStatus)!==JSON.stringify(next);
 state.paymentStatus=next;
 updateTotals({notify:false});
 if(changed){renderEntries();window.dispatchEvent(new Event('blackcell:redline:state'))}
 return state.paymentStatus;
}
async function loadEntries({force=false}={}){
 const selectedRoom=state.room;
 if(!selectedRoom)return;
 const loadScope=roomPaymentScope();
 const stillCurrent=()=>!state.closed&&roomPaymentScope()===loadScope;
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
 if(!stillCurrent())return;
 // A private server tombstone immediately blocks all future photo reads.
 // This is checked on both parties' views, including ongoing Bunny deletion.
 const removal=await db.rpc('corp_redline_photo_removal_status',{p_room_id:selectedRoom.id});
 if(removal.error||removal.data?.ok!==true)
  throw Error(fail(removal.error||removal.data?.reason||'Private photo removal status unavailable.'));
 if(!stillCurrent())return;
 const removals=new Map((removal.data.photos||[]).filter(x=>validId(x.photo_id))
  .map(x=>[x.photo_id,x.status]));
 for(const e of all){
  e.photo_removal_status=removals.get(e.id)||null;
  if(e.photo_removal_status){
   const previous=state.images.get(e.image_path);
   if(previous?.object&&previous.url?.startsWith('blob:'))
    try{URL.revokeObjectURL(previous.url)}catch(_){}
   state.images.delete(e.image_path);
  }
 }
 const ratings=await loadPhotoRatings(all,selectedRoom.id);
 if(!ratings||!stillCurrent())return;
 state.ratings=ratings;
 const ratingsSig=JSON.stringify([...ratings.values()].map(r=>[r.photo_id,r.stars,r.rated_at]).sort((a,b)=>a[0].localeCompare(b[0])));
 const signature=ratingsSig+'|'+JSON.stringify([loadScope,selectedRoom.active,selectedRoom.photo_sending_paused,selectedRoom.title])+'|'+JSON.stringify(all.map(e=>[e.id,e.amount_cents,e.auto_timer_session_id,e.resubmission_origin_id,e.decision_status,e.decided_at,e.priced_at,e.settled_at,e.photo_removal_status,e.caption]));
 state.entries=all;
 updateTotals({notify:false});
 const previewItems=state.isOwner?all:senderPreviewEntries(all);
 const needsSignedRefresh=previewItems.some(e=>!e.photo_removal_status&&
  (!state.images.has(e.image_path)||state.images.get(e.image_path).expires<Date.now()));
 if(signature!==state.entryFingerprint||force){
  state.entryFingerprint=signature;
  renderEntries();renderReviewQueue();
  window.dispatchEvent(new Event('blackcell:redline:state'));
 }
 // Metadata and balances must never wait for a room's media downloads.
 if(needsSignedRefresh&&(!state.isOwner?(!redlineQueueRunning&&!state.busy):true))queuePhotoPreviews(previewItems,loadScope);
 if(all.length>=5000)show('entriesFeedback','Showing up to 5,000 latest submissions; ask administration to archive older records.');
 else show('entriesFeedback','');
 try{await loadRoomPayments(selectedRoom.id,state.showArchive);if(stillCurrent())liveStatus(state.liveConnected?'● LIVE UPDATES CONNECTED':'● AUTOMATIC SYNC ACTIVE',state.liveConnected)}
 catch(e){if(stillCurrent()){show('entriesFeedback','Photos loaded. Payment balance could not refresh: '+fail(e));liveStatus('BALANCE REFRESH FAILED · RETRYING',false)}}
}
function updateTotals({notify=true}={}){
 let assigned=0n,paid=0n,owed=0n,pending=0;
 let rejected=0,complimentary=0;
 for(const e of state.entries){
  if(e.decision_status==='rejected'||(e.photo_removal_status&&e.decision_status==='pending')){rejected++;continue}
  if(e.decision_status!=='accepted'||e.amount_cents===null){pending++;continue}
  const amount=cents(e.amount_cents);
  if(amount===0n)complimentary++;
  assigned+=amount;
  if(e.settled_at)paid+=amount;else owed+=amount;
 }
 // Room-level payment records are applied to oldest unpaid photos before
 // extra timed earnings. The authoritative RPC also deduplicates timer
 // charges already priced into auto-accepted photographs.
 state.paymentAllocations.clear();
 const summary=authoritativePaymentStatus();
 if(summary){
  let available=cents(summary.payment_credit_cents);
  const oldest=state.entries.filter(e=>e.decision_status==='accepted'&&!e.settled_at&&cents(e.amount_cents)>0n)
   .sort((a,b)=>Date.parse(a.decided_at||a.created_at)-Date.parse(b.decided_at||b.created_at)||a.id.localeCompare(b.id));
  for(const e of oldest){
   const applied=available<cents(e.amount_cents)?available:cents(e.amount_cents);
   if(applied>0n){state.paymentAllocations.set(e.id,applied);available-=applied}
   if(available<=0n)break;
  }
  assigned=cents(summary.assigned_cents);paid=cents(summary.paid_cents);owed=cents(summary.remaining_cents)-cents(summary.photo_action_bill_credit_carry_cents);
 }
 show('totalAssigned',dollars(assigned));
 show('totalPaid',dollars(paid));
 show('totalOwed',dollars(owed));
 show('pendingCount',String(pending));
 show('rejectedCount',String(rejected));
 show('freeCount',String(complimentary));
 if(notify)window.dispatchEvent(new Event('blackcell:redline:state'));
}
function clearImageCache(){
 for(const image of state.images.values())if(image?.object&&image.url?.startsWith('blob:'))
  try{URL.revokeObjectURL(image.url)}catch(_){}
 state.images.clear();
}
function rememberImage(path,url,expires,object=false){
 const old=state.images.get(path);
 if(old?.object&&old.url!==url&&old.url?.startsWith('blob:'))
  try{URL.revokeObjectURL(old.url)}catch(_){}
 state.images.set(path,{url,expires,object});
}
let photoPreviewJob=null,senderPreviewScope='',senderPreviewWanted=new Set(),senderPreviewTimer=null;
function senderPreviewEntries(items){
 const scope=roomPaymentScope();if(senderPreviewScope!==scope){senderPreviewScope=scope;senderPreviewWanted.clear()}
 return items.filter(e=>senderPreviewWanted.has(e.id)&&!e.photo_removal_status);
}
function requestSenderPreviews(ids){
 if(state.isOwner||state.closed||!state.room||!Array.isArray(ids))return;
 senderPreviewEntries(state.entries);
 for(const id of ids){if(validId(id))senderPreviewWanted.add(id)}
 if(senderPreviewTimer!==null)return;
 senderPreviewTimer=setTimeout(()=>{senderPreviewTimer=null;if(state.closed||state.isOwner||state.busy||redlineQueueRunning||document.hidden)return;queuePhotoPreviews(senderPreviewEntries(state.entries),roomPaymentScope())},250);
}
function queuePhotoPreviews(items,scope){
 if(!items.length||photoPreviewJob?.scope===scope)return;
 if(!items.some(e=>!e.photo_removal_status&&(!state.images.has(e.image_path)||state.images.get(e.image_path).expires<Date.now())))return;
 const job={scope};photoPreviewJob=job;
 const valid=()=>!state.closed&&photoPreviewJob===job&&roomPaymentScope()===scope&&(state.isOwner||(!state.busy&&!redlineQueueRunning&&!document.hidden));
 const notify=()=>{if(valid()){if(state.isOwner){renderEntries();renderReviewQueue()}window.dispatchEvent(new Event('blackcell:redline:state'))}};
 void signImages(items,valid,notify).catch(e=>{if(valid())show('entriesFeedback','Some photo previews are unavailable: '+fail(e))}).finally(()=>{if(photoPreviewJob===job)photoPreviewJob=null});
}
async function signImages(items,valid=()=>true,notify=()=>{}){
 const now=Date.now();
 const needed=items.filter(e=>!e.photo_removal_status&&
  (!state.images.has(e.image_path)||state.images.get(e.image_path).expires<now));
 const bunny=needed.filter(e=>isBunnyPath(e.image_path));
 const legacy=needed.filter(e=>!isBunnyPath(e.image_path));
 const concurrency=state.isOwner?5:1;
 for(let i=0;i<bunny.length;i+=concurrency){
  if(!valid())return;
  await Promise.all(bunny.slice(i,i+concurrency).map(async e=>{
   try{
    const data=await readBunnyPhoto(db,e.room_id,e.id);
    if(!valid()||!state.entries.some(x=>x.id===e.id&&x.image_path===e.image_path&&!x.photo_removal_status))return;
    rememberImage(e.image_path,URL.createObjectURL(data),Date.now()+20*60*1000,true);
   }catch(error){
    if(valid())show('entriesFeedback','Some REDLINE photos could not load from private Bunny storage: '+fail(error));
   }
  }));
  if(valid()&&(state.isOwner||i%4===3||i+concurrency>=bunny.length))notify();
  if(!state.isOwner)await new Promise(resolve=>setTimeout(resolve,100));
 }
 // Old photo records remain readable if a historical Supabase original
 // is restored in the future. No new media is uploaded to this bucket.
 for(let i=0;i<legacy.length;i+=30){
  if(!valid())return;
  const batch=legacy.slice(i,i+30);
  const result=await db.storage.from(BUCKET).createSignedUrls(batch.map(e=>e.image_path),600);
  if(!valid())return;
  if(result.error)continue;
  for(let j=0;j<batch.length;j++){
   const url=result.data?.[j]?.signedUrl;
   if(url&&typeof url==='string'&&url.startsWith('https://')&&state.entries.some(x=>x.id===batch[j].id&&!x.photo_removal_status))
    rememberImage(batch[j].image_path,url,Date.now()+4*60*1000);
  }
  if(valid())notify();
 }
}
function setFilter(name){
 state.filter=name;
 const title=document.querySelector('.timeline-column .timeline-toolbar h2');
 if(title)title.textContent=name==='priced'?'Priced Photos':'Photo History';
 document.querySelectorAll('[data-photo-filter]').forEach(b=>
  b.setAttribute('aria-pressed',String(b.dataset.photoFilter===name)));
 renderEntries();
}
function entryState(e){
 if(e.photo_removal_status)return 'removed';
 if(e.decision_status==='rejected')return 'rejected';
 if(e.decision_status!=='accepted')return 'pending';
 if(cents(e.amount_cents)===0n)return 'free';
 if(e.settled_at)return 'settled';
 const credit=state.paymentAllocations.get(e.id)||0n;
 return credit>=cents(e.amount_cents)?'settled':credit>0n?'partial':'owed';
}
// Owner-selected photo presence, confined to this verified two-person room.
// This reflects the image displayed, not whether anyone read a chat message.
let viewingLastRoom=null,viewingLastId=undefined,viewingLastAt=0;
let viewingInFlight=false,viewingQueued=undefined;
function ownerVisiblePhotoId(){
 if(!$('photoLightbox')?.hidden&&validId(state.reviewSidebarPhotoId))return state.reviewSidebarPhotoId;
 return document.querySelector('#reviewQueueCurrent .photo-entry[data-redline-photo-id]')?.dataset.redlinePhotoId||null;
}
async function publishOwnerViewing(photoId){
 if(!state.isOwner||state.closed||state.showArchive||!state.room?.active||
    $('ledgerApp').hidden||document.hidden)return;
 const id=validId(photoId)?photoId:null,roomId=state.room.id;
 if(viewingLastRoom!==roomId){viewingLastRoom=roomId;viewingLastId=undefined;viewingLastAt=0}
 if(viewingInFlight){viewingQueued=id;return}
 if(viewingLastId===id&&Date.now()-viewingLastAt<12000)return;
 if(!window.BLACKCELL_REDLINE_API?.setCurrentlyViewing)return;
 viewingInFlight=true;
 try{
  await window.BLACKCELL_REDLINE_API.setCurrentlyViewing(id);
  if(state.room?.id===roomId){viewingLastId=id;viewingLastAt=Date.now()}
 }catch(_){/* Presence expires automatically when no longer refreshed. */}
 finally{
  viewingInFlight=false;
  if(viewingQueued!==undefined){
   const queued=viewingQueued;viewingQueued=undefined;
   if(queued!==viewingLastId)void publishOwnerViewing(queued);
  }
 }
}
window.setInterval(()=>{
 if(state.isOwner&&!document.hidden&&!state.showArchive&&state.room?.active)
  void publishOwnerViewing(ownerVisiblePhotoId());
},15000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&state.isOwner)void publishOwnerViewing(ownerVisiblePhotoId());
});
function renderReviewQueue(){
 const queue=$('ownerReviewQueue');
 queue.hidden=!state.isOwner||!state.room||state.showArchive;
 if(queue.hidden){
  const sidebar=$('redlineLightboxReview');
  if(sidebar)sidebar.hidden=true;
  $('redlineReceiverPauseHeader')?.remove();
  return;
 }
 // The live review queue is the ONE canonical photo viewer. An earlier
 // timed-photo feature added a second preview and its CSS hid this queue.
 // Clear both stale visibility paths SYNCHRONOUSLY on every review render.
 document.body.classList.remove('rr-timing-priced-photo');
 for(const stale of document.querySelectorAll('.rr-timer-selected-preview'))
  stale.hidden=true;
 const pending=state.entries
  .filter(e=>!e.photo_removal_status&&entryState(e)==='pending')
  .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||a.id.localeCompare(b.id));
 show('reviewQueueCount',pending.length+' WAITING');
 const parent=$('reviewQueueCurrent');parent.replaceChildren();
 if(!pending.length){
  // Completed photos belong in Photo History, not the incoming queue.
  if($('photoLightbox')?.hidden!==false)state.reviewSidebarPhotoId=null;
  const empty=node('div','queue-empty');
  empty.append(node('strong','','WAITING FOR FIRST PHOTO'));
  empty.append(node('p','','Incoming photos will appear here one at a time.'));
  parent.append(empty);
  preparePhotoReviewLightbox(null);
  window.dispatchEvent(new Event('blackcell:redline:review-empty'));
  void publishOwnerViewing(ownerVisiblePhotoId());
  return;
 }
 const current=pending[0];
 const selected=state.reviewSidebarPhotoId?
  state.entries.find(e=>e.id===state.reviewSidebarPhotoId&&!e.photo_removal_status):null;
 // If the owner just stopped a timer, keep that newly accepted photo on
 // screen with its final price. Do not silently switch to another photo.
 const timedSelection=selected?.decision_status==='accepted'&&
  Boolean(state.timedPhotoTotals.get(selected.id)||selected.auto_timer_session_id);
 const shown=timedSelection?selected:current;
 const progress=node('div','queue-progress');
 progress.append(
  node('strong','',timedSelection?'TIMED PHOTO · FINAL PRICE':'NEXT PHOTO TO REVIEW'),
  node('span','',timedSelection?pending.length+' STILL WAITING':'1 OF '+pending.length+' · OLDEST FIRST')
 );
 parent.append(progress,renderEntry(shown));
 preparePhotoReviewLightbox(shown);
 // Mount the next image BEFORE telling timer controls about it.
 // Otherwise the old timed image can be reselected from stale DOM.
 window.dispatchEvent(new CustomEvent('blackcell:redline:review-photo',{detail:{photoId:shown.id}}));
 void publishOwnerViewing(ownerVisiblePhotoId());
}
function renderEntries(){
 const parent=$('photoEntries');
 if(!state.isOwner&&document.body.classList.contains('redline-sender-simple')){if(parent.childElementCount)parent.replaceChildren();return}
 parent.replaceChildren();
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
// Receiver-initiated photo-history reactions are explicit private messages.
 // The server verifies the owner, sender's photo, and current room before posting.
async function sendHistoryPhotoSignal(e,action,feedback,actions){
 const roomId=state.room?.id;
 if(!state.isOwner||!roomId||!state.room?.active||state.showArchive||
    e.photo_removal_status||!validId(e.id))return;
 for(const b of actions)b.disabled=true;
 feedback.textContent='Sending privately to the sender…';
 try{
  await verify();
  if(state.closed||state.room?.id!==roomId||state.showArchive)
   throw Error('REDLINE room changed. Reopen the photo history.');
  const result=await db.rpc('corp_redline_history_photo_signal',{
   p_photo_id:e.id,p_action:action
  });
  if(result.error||result.data?.ok!==true)
   throw Error(fail(result.error||result.data?.reason||'Photo notification unavailable.'));
  feedback.textContent=result.data.already_sent
   ?'Already sent to this sender just now.'
   :action==='like'?'♥ The sender was told you like this photo.':'👁 The sender was told you are looking at this photo.';
  window.dispatchEvent(new Event('blackcell:redline:messages-changed'));
 }catch(error){
  feedback.textContent='Not sent: '+fail(error);
 }finally{for(const b of actions)b.disabled=false}
}
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
 card.dataset.redlineStars=String(state.ratings.get(e.id)?.stars||0);
 card.dataset.redlineDecision=String(e.decision_status||'pending');
 if(e.photo_removal_status){
  // Only a record marker survives. Never render the image, caption, filename
  // or an old saved object URL once the owner has begun deletion.
  card.classList.add('redline-photo-removed');
  const placeholder=node('div','redline-photo-removed-placeholder');
  placeholder.append(
   node('strong','','PHOTO REMOVED FROM REDLINE'),
   node('small','',e.photo_removal_status==='removed'
    ?'Original media permanently removed from private storage.'
    :'Photo access disabled. Server deletion must be retried.'));
  const content=node('div','photo-entry-content');
  content.append(node('h3','','PHOTO '+e.id.slice(0,8).toUpperCase()),
   node('span','entry-badge removed',e.photo_removal_status==='removed'
    ?'PERMANENTLY REMOVED':'REMOVAL PENDING'));
  if(e.decision_status==='accepted'){
   content.append(node('p','redline-removed-ledger-summary',
    'Recorded ledger price '+dollars(e.amount_cents)+' · Financial history retained.'));
  }else{
   content.append(node('p','redline-removed-ledger-summary',
    'No new bid can be placed on this removed photograph.'));
  }
  if(state.isOwner&&e.photo_removal_status!=='removed'){
   content.append(button('RETRY SERVER DELETION',()=>void deletePhotoPermanently(e),
    'redline-photo-delete-button'));
  }
  card.append(placeholder,content);
  return card;
 }
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
 const statusBadge=node('span','entry-badge '+status,status==='pending'?'AWAITING YOUR REVIEW':status==='rejected'?'REJECTED':status==='free'&&timedCents>0n?'ACCEPTED · TIMED EARNED':status==='free'?'ACCEPTED · $0.00':status==='owed'?'AMOUNT OWED':status==='partial'?'PARTIALLY PAID':'RECORDED PAID');
 meta.append(statusBadge);
 body.append(meta,node('h3','','PHOTO '+e.id.slice(0,8).toUpperCase()));
 if(e.resubmission_origin_id)body.append(node('div','rr-photo-resubmission-tag',
  '↻ REUSED PHOTO · ORIGINAL '+e.resubmission_origin_id.slice(0,8).toUpperCase()));
 if(rating||state.isOwner){
  const stars=rating?.stars||0;
  body.append(node('div','rr-photo-star-summary',
   '★'.repeat(stars)+'☆'.repeat(5-stars)+
   (stars===5?' · TOP PICK':stars?' · '+stars+'/5 STARS':' · 0/5 · NOT RATED')));
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
  const credited=state.paymentAllocations.get(e.id)||0n;
  ctrl.append(node('small','',e.settled_at
   ?'Manually recorded as paid on '+when(e.settled_at)
   :credited>0n?'Room payment allocated '+dollars(credited)+' · Remaining '+dollars(cents(e.amount_cents)-credited)+'.'
   :'Accepted by the owner on '+when(e.decided_at)+'.'));
  if(state.isOwner&&!e.settled_at&&cents(e.amount_cents)>0n){
   if(cents(authoritativePaymentStatus()?.payment_credit_cents)>0n)
    ctrl.append(node('small','','Record further payments using PARTIAL PAYMENT or PAY IN FULL above.'));
   else ctrl.append(button('✓ RECORD AS PAID',()=>void settle(e),'button-outline'));
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
 if(state.isOwner)ctrl.append(button('DELETE PHOTO PERMANENTLY',
  ()=>void deletePhotoPermanently(e),'redline-photo-delete-button'));
 // These controls appear inside Photo History, NOT over the large photograph
 // or inside the narrow chat. They are never automatic view notifications.
 if(state.isOwner&&state.room?.active&&!state.showArchive){
  const historySignals=node('div','redline-history-photo-signals');
  const feedback=node('small','redline-history-signal-feedback','');
  feedback.setAttribute('role','status');
  feedback.setAttribute('aria-live','polite');
  const look=button('◉ LOOKING AT THIS',()=>void sendHistoryPhotoSignal(e,'looking',feedback,[look,like]),
   'redline-history-look-btn');
  const like=button('♡ Like photo',()=>void sendHistoryPhotoSignal(e,'like',feedback,[look,like]),
   'redline-history-like-btn');
  look.setAttribute('aria-label','Notify sender you are viewing this specific photograph');
  like.setAttribute('aria-label','Notify sender you like this specific photograph');
  historySignals.append(look,like,feedback);
  ctrl.append(historySignals);
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
 if(!selected||selected.photo_removal_status)return;
 state.reviewSidebarPhotoId=id;
 preparePhotoReviewLightbox(selected);
 void publishOwnerViewing(id);
});
// This owner-only control is located in the receiver's bid/timer sidebar.
function appendReceiverPauseControl(panel){
 if(!state.isOwner||!state.room||state.showArchive)return;
 // Apple web/tablet: keep the server-authorized pause control next to the
 // header Settings action, outside the full-height photo review deck.
 $('redlineReceiverPauseHeader')?.remove();
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
 const commandHeader=document.body.classList.contains('bc-redline-apple-mode')
  ?document.querySelector('#redlineReceiverCommand .rr-command-header'):null;
 if(commandHeader){
  wrapper.id='redlineReceiverPauseHeader';
  const settings=$('redlineConsentSettingsOpen');
  if(settings?.parentNode===commandHeader)settings.after(wrapper);
  else commandHeader.append(wrapper);
 }else panel.append(wrapper);
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
 const removalSig=entry?.photo_removal_status||'none';
 if(panel.dataset.redlinePhotoId===(entry?.id||'none')&&
    panel.dataset.redlineDecision===(entry?.decision_status||'empty')&&
    panel.dataset.redlinePause===String(Boolean(state.room?.photo_sending_paused))&&
    panel.dataset.redlineTimed===timedSignature&&
    panel.dataset.redlineRating===ratingSig&&
    panel.dataset.redlineRemoval===removalSig&&!panel.hidden)return;
 panel.dataset.redlinePhotoId=entry?.id||'none';
 panel.dataset.redlineDecision=entry?.decision_status||'empty';
 panel.dataset.redlinePause=String(Boolean(state.room?.photo_sending_paused));
 panel.dataset.redlineTimed=timedSignature;
 panel.dataset.redlineRating=ratingSig;
 panel.dataset.redlineRemoval=removalSig;
 // Preserve the same authenticated timer node when refreshing the bid UI.
 const liveTimer=$('redlinePhotoTimerPanel');
 if(liveTimer?.parentNode===panel)liveTimer.remove();
 panel.replaceChildren();
 const restoreTimer=()=>{if(liveTimer&&state.isOwner&&!document.body.classList.contains('bc-redline-apple-mode'))panel.append(liveTimer)};
 const review=state.isOwner&&entry?.decision_status==='pending'&&!state.showArchive;
 // The sidebar is visible to the verified receiver for both pending and
 // accepted photographs. Only pending images can receive a final price.
 const receiverActions=state.isOwner&&!state.showArchive;
 panel.hidden=!receiverActions;
 if(!receiverActions){
  $('redlineReceiverPauseHeader')?.remove();
  return;
 }
 appendReceiverPauseControl(panel);
 if(entry)appendPhotoRatingControl(panel,entry);
 if(!review){
  const summary=entry?state.timedPhotoTotals.get(entry.id):null;
  const timed=cents(summary?.timed_cents||0),credited=cents(summary?.credited_to_photo_cents||0);
  const extra=summary?.additional_timed_cents!==undefined
   ?cents(summary.additional_timed_cents):(timed>credited?timed-credited:0n);
  panel.append(node('span','redline-review-kicker','VERIFIED RECEIVER'));
  panel.append(node('h3','','PHOTO CONTROLS'));
  // Explain the empty incoming queue; completed photos remain in history.
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
  if(entry&&!entry.photo_removal_status){
   panel.append(button('DELETE PHOTO PERMANENTLY',
    ()=>void deletePhotoPermanently(entry),'rr-permanent-delete-button'));
  }
  restoreTimer();
  return;
 }
 panel.append(node('span','redline-review-kicker','VERIFIED OWNER · PRIVATE REVIEW'));
 const label=node('label','redline-review-label','YOUR BID · USD');
 if(document.body.classList.contains('bc-redline-apple-mode'))label.textContent='PHOTO PRICE · USD';
 const input=node('input','redline-review-amount');
 input.type='text';input.inputMode='decimal';input.placeholder='0.00';input.maxLength=23;attachCurrencyLeadingZero(input);
 input.setAttribute('aria-label','Acceptance amount in US dollars');
 label.append(input);panel.append(label);
 const controls=node('div','redline-review-actions');
 const accept=button(document.body.classList.contains('bc-redline-apple-mode')
  ?'➤ SUBMIT PRICE & NEXT PHOTO':'✓ ACCEPT FOR AMOUNT',()=>void decision('accept'),'button-main');
 const zero=button('✓ ACCEPT $0.00',()=>void decision('zero'),'button-outline');
 const reject=button('✕ REJECT PHOTO',()=>void decision('reject'),'button-outline reject-photo');
 controls.append(accept,zero,reject);
 panel.append(controls,node('p','redline-review-hint','Decisions are final. No actual payment is transferred.'));
 panel.append(button('DELETE PHOTO PERMANENTLY',
  ()=>void deletePhotoPermanently(entry),'rr-permanent-delete-button'));
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
  show('reviewQueueFeedback','PHOTO REJECTED · $0.35 BILL CREDIT · Showing next photo.');
  // Refresh verified bill credits before metadata and preview work.
  try{await loadRoomPayments(state.room.id,state.showArchive)}catch(_){/* loadEntries retries below. */}
  state.entryFingerprint='';
  try{await loadEntries({force:true})}
  catch(refreshError){show('entriesFeedback',
   'Photo rejection saved. Next photo displayed; background refresh unavailable: '+fail(refreshError));}
  return true;
 }catch(e){show('entriesFeedback','Could not reject photo: '+fail(e));return false}
 finally{state.busy=false;trigger.disabled=false}
}
// Distinct from REJECT PHOTO: this server action irreversibly erases media
// bytes while retaining the minimum financial/audit ledger record.
async function confirmPermanentPhotoDeletion(entry){
 const dialog=$('redlinePurgeConfirm');
 if(!dialog||dialog.open)return false;
 const input=$('redlinePurgeType'),approve=$('redlinePurgeSubmit'),cancel=$('redlinePurgeCancel');
 const note=$('redlinePurgeWarning');
 $('redlinePurgePhotoRef').textContent='PHOTO '+entry.id.slice(0,8).toUpperCase();
 note.textContent=entry.photo_removal_status==='pending'
  ?'REDLINE already blocked this photo. Retry to finish deleting its original file from the server. Prices and payment records will stay in the ledger; separately uploaded copies must be deleted individually.'
  :entry.decision_status==='accepted'
   ?'Permanently erase this photo from Bunny Storage. The previously recorded price '+dollars(entry.amount_cents)+' and payment history WILL REMAIN in the ledger. Already downloaded or separately uploaded copies cannot be recalled by deleting this file.'
   :'Permanently erase the original photo from Bunny Storage and reject its pending review. This cannot be undone. Other independently uploaded copies are not affected; the sender will see a removed-photo record.';
 note.textContent+='\n\nA completed permanent deletion records a one-time $1.00 bill credit.';
 input.value='';approve.disabled=true;dialog.returnValue='';
 return await new Promise(resolve=>{
  input.oninput=()=>{approve.disabled=input.value.trim()!=='DELETE'};
  cancel.onclick=()=>dialog.close('cancel');
  approve.onclick=()=>{if(input.value.trim()==='DELETE')dialog.close('delete')};
  dialog.addEventListener('close',()=>{
   input.oninput=null;cancel.onclick=null;approve.onclick=null;
   resolve(dialog.returnValue==='delete');
  },{once:true});
  dialog.showModal();
  input.focus();
 });
}
async function deletePhotoPermanently(entry){
 if(!state.isOwner||!state.room||state.closed||state.busy||
    state.deletingPhotoId||!validId(entry?.id)||
    entry.room_id!==state.room.id||entry.photo_removal_status==='removed')return false;
 if(!await confirmPermanentPhotoDeletion(entry))return null;
 const roomId=state.room.id,photoId=entry.id;
 state.deletingPhotoId=photoId;state.busy=true;
 try{
  await verify();
  if(state.room?.id!==roomId)throw Error('Private room changed. No deletion was authorized.');
  // The Edge Function first marks a verified room tombstone to deny reads,
  // then executes Bunny DELETE, then acknowledges the permanent purge.
  const result=await deleteRedlinePhotoFile(db,roomId,photoId);
  if(result.status!=='removed')throw Error('Server did not confirm permanent deletion.');
  const cached=state.images.get(entry.image_path);
  if(cached?.object&&cached.url?.startsWith('blob:'))
   try{URL.revokeObjectURL(cached.url)}catch(_){}
  state.images.delete(entry.image_path);
  entry.photo_removal_status='removed';
  if(entry.decision_status==='pending')entry.decision_status='rejected';
  const existing=state.entries.find(e=>e.id===photoId);
  if(existing&&existing!==entry){
   existing.photo_removal_status='removed';
   if(existing.decision_status==='pending')existing.decision_status='rejected';
  }
  state.reviewSidebarPhotoId=null;
  if(!$('photoLightbox').hidden)closeLightbox();
  state.entryFingerprint='';
  renderEntries();renderReviewQueue();updateTotals();
  window.dispatchEvent(new CustomEvent('blackcell:redline:photo-removed',{detail:{photoId,roomId}}));
  try{await loadEntries({force:true})}
  catch(_){/* Server confirmed purge; local client updates above stay visible. */}
  show('entriesFeedback','PHOTO PERMANENTLY REMOVED FROM SERVER · $1.00 BILL CREDIT · Financial and audit records preserved.');
  return true;
 }catch(e){
  // A partial failure leaves the server-side tombstone blocking further reads
  // until a future RETRY SERVER DELETION completes the physical purge.
  state.entryFingerprint='';
  try{await loadEntries({force:true})}catch(_){}
  show('entriesFeedback','Server deletion was not confirmed: '+fail(e)+
   ' · If this photo says REMOVAL PENDING, select RETRY SERVER DELETION.');
  return false;
 }finally{state.busy=false;state.deletingPhotoId=null}
}
async function settle(entry){
 if(!state.isOwner||state.busy||entry.decision_status!=='accepted'||cents(entry.amount_cents)<=0n||entry.settled_at||
    cents(authoritativePaymentStatus()?.payment_credit_cents)>0n)return;
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
// Sender upload choices are independent of iMessage. Every selected photo goes
// through the REDLINE-only server-authorized Bunny pipeline and review queue.
const redlinePhotoQueue=[];
let redlineQueueRunning=false,redlineStopAfterCurrent=false;
let redlineBatchTotal=0,redlineBatchDone=0,redlineBatchFailed=0,redlineBatchDuplicates=0;
const redlineBatchHashes=new Set();
let redlineUploadStatus=null,redlineBatchRoom=null;
const redlinePhotoEligible=()=>!state.closed&&!state.isOwner&&!!state.user&&
 !!state.room?.active&&!state.room.photo_sending_paused&&!state.showArchive;
function redlineBatchUI(){
 const host=$('employeeUpload');
 if(!host)return null;
 let panel=$('redlineUploadBatch');
 if(!panel){
  panel=node('div','redline-upload-batch');
  panel.id='redlineUploadBatch';panel.hidden=true;panel.setAttribute('role','status');
  panel.setAttribute('aria-live','polite');
  const progress=node('p','redline-upload-batch-status');
  progress.id='redlineUploadBatchStatus';
  const cancel=button('STOP REMAINING',()=>{
   redlineStopAfterCurrent=true;redlinePhotoQueue.length=0;
   progress.textContent='Remaining uploads stopped. An upload already underway can finish.';
  },'redline-upload-batch-stop');
  cancel.id='redlineStopUploads';
  panel.append(progress,cancel);
  host.append(panel);
 }
 return panel;
}
function redlineQueueStatus(message,active=false){
 redlineUploadStatus={roomId:redlineBatchRoom,active,total:redlineBatchTotal,done:redlineBatchDone,failed:redlineBatchFailed,message};
 window.dispatchEvent(new Event('blackcell:redline:upload-progress'));
 const panel=redlineBatchUI();
 if(!panel)return;
 panel.hidden=false;
 $('redlineUploadBatchStatus').textContent=message;
 $('redlineStopUploads').hidden=!active;
 show('uploadFeedback',message);
}
function enqueueRedlineFiles(items){
 if(!redlinePhotoEligible()){
  redlineQueueStatus('REDLINE photo sending is unavailable in this room. The receiver may have paused sending.');
  return false;
 }
 if(!Array.isArray(items)||!items.length)return false;
 // Do not impose an artificial selection count: the 12 MB Bunny limit applies
 // to EACH image, and selected images are sent one-by-one to reduce Android RAM.
 if(!redlineQueueRunning){
  redlineBatchDone=0;redlineBatchFailed=0;redlineBatchTotal=0;redlineBatchDuplicates=0;redlineBatchHashes.clear();
  redlineStopAfterCurrent=false;redlineBatchRoom=state.room.id;
 }
 const roomId=state.room.id;
 if(redlineBatchRoom!==roomId)return false;
 for(const item of items)redlinePhotoQueue.push({...item,roomId});
 redlineBatchTotal+=items.length;
 redlineQueueStatus('Preparing '+redlineBatchTotal+' REDLINE photo'+(redlineBatchTotal===1?'':'s')+' for private upload…',true);
 if(!redlineQueueRunning)void drainRedlinePhotoQueue();
 return true;
}
async function drainRedlinePhotoQueue(){
 if(redlineQueueRunning)return;
 redlineQueueRunning=true;
 let interruptedReason='';
 try{
  while(redlinePhotoQueue.length&&!redlineStopAfterCurrent){
   const item=redlinePhotoQueue.shift();
   if(!redlinePhotoEligible()||state.room?.id!==item.roomId){
    redlinePhotoQueue.length=0;redlineBatchFailed++;
    interruptedReason='REDLINE photo sending stopped because the room changed, closed, or the receiver paused uploads.';
    redlineQueueStatus(interruptedReason);
    break;
   }
   if(state.busy){
    redlinePhotoQueue.unshift(item);
    await new Promise(resolve=>setTimeout(resolve,350));
    continue;
   }
   const index=redlineBatchDone+redlineBatchFailed+redlineBatchDuplicates+1;
   redlineQueueStatus('Uploading photo '+index+' of '+redlineBatchTotal+' · '+String(item.label||'Photo').slice(0,65),true);
   let file=item.file;
   const library=item.library||null;
   try{
    if(library){
     if(!library.size||library.size>MAX_IMAGE_BYTES)throw Error('Each REDLINE photo must be no larger than 12 MB.');
     imageType(library);
     const selectionKey='library:'+library.objectId;
     if(redlineBatchHashes.has(selectionKey))redlineBatchDuplicates++;
     else{
      const success=await uploadPhoto({preventDefault(){},detail:{library}});
      if(success===true){redlineBatchDone++;redlineBatchHashes.add(selectionKey)}else redlineBatchFailed++;
     }
    }else{
    if(!file&&typeof item.readFile==='function')file=await item.readFile();
    if(!file)throw Error('Could not read the selected photo.');
    if(!file.size||file.size>MAX_IMAGE_BYTES)throw Error('Each REDLINE photo must be no larger than 12 MB.');
    imageType(file); // Per-photo validation also runs in uploadPhoto.
    // Byte-identical repeat selections in this batch need no second upload.
    // A successful send is required before a fingerprint is remembered.
    let hash=null;
    if(globalThis.crypto?.subtle)try{
     hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
    }catch(_){}
    if(hash&&redlineBatchHashes.has(hash)){redlineBatchDuplicates++}
    else{
     const success=await uploadPhoto({preventDefault(){},detail:{file}});
     if(success===true){redlineBatchDone++;if(hash)redlineBatchHashes.add(hash)}
     else redlineBatchFailed++;
    }
    }
   }catch(error){
    redlineBatchFailed++;
    show('uploadFeedback','Photo '+index+' not sent: '+fail(error));
   }finally{file=null}
   redlineQueueStatus('REDLINE photos: '+redlineBatchDone+' uploaded · '+redlineBatchFailed+
    ' failed · '+redlineBatchDuplicates+' duplicates skipped · '+redlinePhotoQueue.length+' remaining',redlinePhotoQueue.length>0);
  }
 }finally{
  const refreshAfterBatch=redlineBatchDone>0&&state.room?.id===redlineBatchRoom;
  redlineQueueRunning=false;
  const note='REDLINE upload finished: '+redlineBatchDone+' photo'+(redlineBatchDone===1?'':'s')+
   ' sent privately'+(redlineBatchDuplicates?' · '+redlineBatchDuplicates+' identical batch duplicates skipped':'')+(redlineBatchFailed?' · '+redlineBatchFailed+' not sent; select failed photos again':'')+'.';
  redlineQueueStatus(redlineStopAfterCurrent?'Remaining photo uploads stopped. '+note:interruptedReason?interruptedReason+' '+note:note);
  redlineStopAfterCurrent=false;redlinePhotoQueue.length=0;redlineBatchHashes.clear();
  show('selectedPhotoName','Choose photos from your device or BLACKCELL Photos.');
  if(refreshAfterBatch)void loadEntries({force:true}).catch(()=>{});
 }
}
function redlineDevicePicker(){
 let picker=$('redlineDevicePicker');
 if(picker)return picker;
 // A separate input attached to body is necessary on older Android Chrome:
 // REDLINE's original form can live inside a collapsed <details> drawer.
 picker=node('input');picker.id='redlineDevicePicker';picker.type='file';
 picker.accept='image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
 picker.multiple=true;picker.tabIndex=-1;
 picker.setAttribute('aria-label','Choose multiple REDLINE photos from your device');
 Object.assign(picker.style,{
  position:'fixed',left:'-9999px',top:'0',width:'1px',height:'1px',
  opacity:'0',pointerEvents:'none'
 });
 picker.addEventListener('change',()=>{
  const files=Array.from(picker.files||[]);
  picker.value='';
  if(files.length)enqueueRedlineFiles(files.map(file=>({file,label:file.name})));
 });
 document.body.append(picker);
 return picker;
}
function openRedlinePhonePicker(){
 if(!redlinePhotoEligible()){
  show('uploadFeedback','REDLINE photo sending is paused or this private room is unavailable.');
  return;
 }
 const picker=redlineDevicePicker();
 picker.value='';
 try{picker.click()}catch(_){
  show('uploadFeedback','Could not open Android Photos. Try the REDLINE + button again.');
 }
}
let redlineSourceOverlay=null;
function closeRedlinePhotoChooser(){
 if(!redlineSourceOverlay)return;
 redlineSourceOverlay.hidden=true;
}
function openRedlinePhotoChooser(){
 if(!redlinePhotoEligible()){
  show('uploadFeedback','Photo sending is unavailable until this REDLINE room is active and the receiver allows uploads.');
  return;
 }
 if(!redlineSourceOverlay){
  const overlay=node('div','redline-photo-source-overlay');overlay.id='redlinePhotoSourceOverlay';
  overlay.hidden=true;overlay.setAttribute('role','presentation');
  const panel=node('section','redline-photo-source-dialog');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Add photos to REDLINE');
  const header=node('div','redline-photo-source-head');
  header.append(node('strong','','ADD PHOTOS TO REDLINE'));
  const dismiss=button('✕',closeRedlinePhotoChooser,'redline-source-close');
  dismiss.setAttribute('aria-label','Close photo choices');header.append(dismiss);
  panel.append(header,node('p','redline-source-intro',
   'Choose photos from your phone or BLACKCELL Photos. All selected photos upload automatically to this private room.'));
  const device=button('＋  Camera Roll',()=>{
   closeRedlinePhotoChooser();
   // Triggered directly within the Android user's tap (not after an await).
   openRedlinePhonePicker();
  },'redline-source-device');
  device.id='redlineSourceDevice';
  const library=button('▣  BLACKCELL Photos',()=>{
   closeRedlinePhotoChooser();
   const roomId=state.room?.id,uid=state.user?.id;
   void (async()=>{
    try{
     const {choosePrivateMedia}=await import('./blackcell-private-media.js?v=20261122-redline-bunny-library1');
     if(!redlinePhotoEligible()||state.room?.id!==roomId||state.user?.id!==uid)return;
     await choosePrivateMedia({
      client:db,userId:uid,max:Number.POSITIVE_INFINITY,photoOnly:true,
      actionLabel:'SEND SELECTED PHOTOS TO REDLINE',
      onSelectRows:async(rows,readFile)=>{
       if(!redlinePhotoEligible()||state.room?.id!==roomId)return;
       enqueueRedlineFiles(rows.map(row=>row.provider==='bunny'&&row.objectId&&Number(row.size)>0?{label:row.name,library:{objectId:row.objectId,name:row.name,type:row.type,size:Number(row.size)}}:{label:row.name,readFile:()=>readFile(row)}));
      },
      onDeviceUpload:()=>{
       if(!redlinePhotoEligible()||state.room?.id!==roomId)return;
       openRedlinePhonePicker();
      }
     });
    }catch(error){show('uploadFeedback','BLACKCELL Photos could not open: '+fail(error))}
   })();
  },'redline-source-library');
  library.id='redlineSourceLibrary';
  const actions=node('div','redline-source-actions');actions.append(device,library);
  panel.append(actions,node('small','redline-source-footnote',
   'No selection count limit. Images must be JPEG, PNG, WebP or HEIC, up to 12 MB each. The receiver can pause photo sending.'));
  overlay.append(panel);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeRedlinePhotoChooser()});
  document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&!overlay.hidden){e.preventDefault();closeRedlinePhotoChooser()}
  });
  document.body.append(overlay);redlineSourceOverlay=overlay;
 }
 redlineSourceOverlay.hidden=false;
 redlineSourceOverlay.querySelector('#redlineSourceDevice')?.focus({preventScroll:true});
}
window.BLACKCELL_REDLINE_UPLOAD_UI={open:openRedlinePhotoChooser,
 enqueue:enqueueRedlineFiles,get pendingCount(){return redlinePhotoQueue.length},get progress(){return redlineUploadStatus?.roomId===state.room?.id?redlineUploadStatus:null}};
async function uploadPhoto(...args){
 let release;
 try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('uploadPhoto',window)}catch(_){}
 try{return await bcLiveOriginal_uploadPhoto.apply(this,args)}finally{release?.()}
}
async function bcLiveOriginal_uploadPhoto(event){
 event?.preventDefault?.();
 if(state.isOwner||state.busy||!state.room?.active)return;
 if(state.room.photo_sending_paused){
  $('uploadPhoto').value='';
  show('uploadFeedback','Photo sending was paused by the receiver.');
  return;
 }
 if(state.showArchive){show('uploadFeedback','Return to the current REDLINE session before uploading new photos.');return}
 const library=event?.detail?.library||null;
 const file=library||event?.detail?.file||$('uploadPhoto').files?.[0];
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
 let path=null,bunnyUploadAttempted=false,posted=false;
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
  // No photo bytes go to Supabase Storage. Verified Bunny write MUST finish
  // before the corresponding REDLINE metadata record is created.
  bunnyUploadAttempted=true;
  path=library?await transferBunnyLibraryPhoto(db,room.id,state.user.id,id,library.objectId,info.mime,file.size):await uploadBunnyPhoto(db,room.id,state.user.id,id,file,info.mime);
  const r=await db.from(ENTRIES).insert({
    id,room_id:room.id,uploaded_by:state.user.id,image_path:path,decision_status:'pending',
    file_name:file.name.slice(0,180),caption:''
  }).select('id').single();
  if(r.error)throw r.error;
  posted=true;
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
  // For a batch, refresh once after the last confirmed upload. Receiver
  // subscriptions still receive each inserted photo immediately.
  if(!redlineQueueRunning){
   try{await loadEntries({force:true})}
   catch(refreshError){show('uploadFeedback','Photo saved privately, but the review list has not refreshed yet: '+fail(refreshError));}
  }
  return true;
 }catch(e){
  if(bunnyUploadAttempted&&!posted)
   try{await cleanupUnpostedBunny(db,room.id,id)}catch(_){}
  picker.value='';
  show('selectedPhotoName','Select a photo to try again.');
  show('uploadFeedback','Photo not sent: '+fail(e)+'. Choose a photo again to retry.');
  return false;
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
  // Navigate to a clean room document after the verified insert succeeds.
  const link=new URL(location.href);link.searchParams.set('room',r.data.id);link.searchParams.delete('rdHome');link.searchParams.set('rdRoomEntry','20261125-redline-home1');
  show('setupFeedback','Private room created. Opening the assigned room…');
  location.assign(link.href);
 }catch(e){show('setupFeedback','Could not create room: '+fail(e))}
 finally{state.busy=false;$('createRoom').disabled=!state.employees.length}
}
let finalCleanupRunning=false;
async function drainFinalizedSourceFiles(roomId=null){
 if(!state.isOwner||state.closed||finalCleanupRunning)return;
 finalCleanupRunning=true;
 try{
  for(let batch=0;batch<25&&!state.closed;batch++){
   const r=await db.functions.invoke('blackcell-redline-session-export',{body:{action:'cleanup',room_id:roomId}});
   if(r.error||r.data?.ok!==true||r.data.more!==true)break;
  }
 }catch(_){/* Retain queue; retry next verified owner entry. */}
 finally{finalCleanupRunning=false}
}
async function toggleRoom(){
 if(!state.isOwner||!state.room||state.busy)return;
 const room=state.room;
 if(!window.confirm('End this REDLINE session permanently? Authorized photos will be saved to participant libraries, then the room and session records will be deleted. If a transfer or settlement is incomplete, the closed room remains available for retry.'))return;
 state.busy=true;
 const control=$('closeRoomBtn');if(control)control.disabled=true;
 const status=$('redlineResetStatus');
 const progress=message=>{if(status)status.textContent=message;show('entriesFeedback',message)};
 try{
  await verify();
  if(room.active){
   const closed=await db.from(ROOMS).update({active:false}).eq('id',room.id).select('id').single();
   if(closed.error||closed.data?.id!==room.id)throw Error('Room closure not confirmed.');
  }
  progress('Checking settlement before exporting photos…');
  for(const archive of [false,true]){
   const payment=await db.rpc('corp_redline_room_payment_status',{p_room_id:room.id,p_archive:archive});
   if(payment.error||payment.data?.ok!==true||payment.data.remaining_cents==null||Number(payment.data.remaining_cents)!==0)throw Error('Settle the remaining REDLINE balance before ending the session.');
  }
  const removed=await db.rpc('corp_redline_photo_removal_status',{p_room_id:room.id});
  if(removed.error||removed.data?.ok!==true)throw Error('Photo removal status unavailable.');
  const excluded=new Set((removed.data.photos||[]).map(x=>x.photo_id));
  const photos=[];
  for(let offset=0;;offset+=100){
   const rows=await db.from(ENTRIES).select('id').eq('room_id',room.id).order('id').range(offset,offset+99);
   if(rows.error)throw rows.error;
   const page=rows.data||[];
   photos.push(...page.filter(x=>!excluded.has(x.id)));
   if(page.length<100)break;
   if(offset>=10000)throw Error('Session too large for this transfer workflow.');
  }
  let completed=0;
  for(const photo of photos){
   if(state.closed)throw Error('Session verification expired. Sign in to retry.');
   progress('Saving and verifying photos: '+completed+' / '+photos.length);
   const transfer=await db.functions.invoke('blackcell-redline-session-export',{body:{room_id:room.id,photo_id:photo.id}});
   if(transfer.error||transfer.data?.ok!==true||transfer.data?.photo_id!==photo.id)throw Error('A photo could not be verified in the library. No room data was deleted. Retry after resolving the missing file or storage limit.');
   completed++;
  }
  progress('Removing verified completed session…');
  const final=await db.rpc('corp_owner_redline_finalize_exported_room',{p_room_id:room.id,p_confirmation:'END SESSION'});
  if(final.error||final.data?.ok!==true||final.data.deleted_room!==room.id)throw Error(final.data?.reason||final.error?.message||'Session deletion not confirmed.');
  clearImageCache();state.room=null;state.entries=[];state.showArchive=false;state.entryFingerprint='';
  const url=new URL(location.href);url.searchParams.delete('room');url.searchParams.set('rdHome','1');history.replaceState(history.state,'',url.href);
  await refresh({force:true});
  window.dispatchEvent(new Event('blackcell:redline:reset'));
  void drainFinalizedSourceFiles(room.id);
  window.dispatchEvent(new CustomEvent('bc-private-files-changed',{detail:{source:'redline'}}));
 }catch(e){progress('Session not finalized: '+fail(e));await refresh({force:true})}
 finally{state.busy=false;if(control)control.disabled=false}
}
function updateRedlineResetControls(){
 const room=state.room,hasArchive=!!room?.current_session_started_at;
 const tools=$('redlineSessionTools'),actions=$('redlineResetActions');
 if(tools)tools.hidden=!room;
 if(actions)actions.hidden=true; // Legacy archive/reset actions are retired from the production UI.
 const purge=$('redlineDeleteArchivedChat');
 if(purge){purge.hidden=true;purge.disabled=!room||room.active||state.busy;purge.title=room?.active?'Close the room before deleting previous chat.':'Permanently delete archived chat except messages needed for fee records.'}
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
 state.showArchive=!!archive;state.entryFingerprint='';clearImageCache();
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
  state.showArchive=false;state.entryFingerprint='';clearImageCache();
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
async function deleteRedlineArchivedChat(){
 const room=state.room,control=$('redlineDeleteArchivedChat'),status=$('redlineResetStatus');
 if(!state.isOwner||!room||room.active||!room.current_session_started_at||state.busy||!control)return;
 const phrase='DELETE ARCHIVED CHAT';
 const typed=window.prompt('Permanently delete all previous-session chat messages in THIS closed room, for both participants? Messages tied to financial fees, photographs and payment records are preserved. This cannot be undone.\n\nType '+phrase+' to confirm:','');
 if(typed!==phrase)return;
 state.busy=true;control.disabled=true;
 if(status)status.textContent='Deleting archived chat securely…';
 try{
  await verify();
  if(state.closed||state.room?.id!==room.id||state.room?.active)throw Error('Room changed. Reopen its session tools.');
  const {data,error}=await db.rpc('corp_owner_redline_delete_archived_chat',{p_room_id:room.id,p_cutoff:room.current_session_started_at,p_confirmation:phrase});
  if(error||data?.ok!==true)throw Error(data?.reason||error?.message||'Deletion not confirmed.');
  window.dispatchEvent(new Event('blackcell:redline:messages-changed'));
  if(status)status.textContent=String(data.messages_deleted)+' archived chat messages permanently deleted. '+String(data.fee_messages_retained)+' fee-linked messages retained. Photos and financial records are unchanged.';
 }catch(e){if(status)status.textContent='Unable to delete archived chat: '+fail(e)}
 finally{state.busy=false;updateRedlineResetControls()}
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
 // The sender should see the main viewer photo immediately after full-size
 // inspection closes, rather than waiting for the 15-second presence pulse.
 void publishOwnerViewing(ownerVisiblePhotoId());
}
function wireEvents(){
 $('redlineDirectoryCreate')?.addEventListener('click',()=>{
  if(!state.isOwner||state.closed)return;
  document.body.dataset.redlineRoomCreate='open';
  $('ownerSetup').scrollIntoView({block:'nearest'});$('employeeChoice').focus({preventScroll:true});
 });
 $('redlineDirectoryCancel')?.addEventListener('click',()=>{delete document.body.dataset.redlineRoomCreate;$('redlineDirectoryCreate').focus()});
 $('redlineDirectoryRefresh')?.addEventListener('click',async()=>{
  if(state.closed||state.busy)return;
  try{await verify();if(state.isOwner)await loadEmployees();await refresh({force:true})}catch(e){show('redlineDirectoryNote',fail(e))}
 });
 $('redlineRoomBack')?.addEventListener('click',()=>navigateRoomDirectory());
 $('createRoomForm').addEventListener('submit',e=>void createRoom(e));
 $('uploadPhotoForm').addEventListener('submit',e=>{
  e.preventDefault();
  const files=Array.from($('uploadPhoto').files||[]);
  $('uploadPhoto').value='';
  if(files.length)enqueueRedlineFiles(files.map(file=>({file,label:file.name})));
 });
 const dropLabel=document.querySelector('#employeeUpload label[for="uploadPhoto"]');
 dropLabel?.addEventListener('click',event=>{
  event.preventDefault();
  openRedlinePhotoChooser();
 });
 $('uploadPhoto').addEventListener('change',()=>{
  const files=Array.from($('uploadPhoto').files||[]);
  $('uploadPhoto').value='';
  if(files.length)enqueueRedlineFiles(files.map(file=>({file,label:file.name})));
 });
 $('refreshLedger').addEventListener('click',()=>{state.entryFingerprint='';void refresh({force:true}).catch(e=>show('entriesFeedback','Refresh failed: '+fail(e)))});
 $('roomPicker').addEventListener('change',()=>{
  if(state.isOwner){const selected=$('roomPicker').value;if(!navigateRoomDirectory(selected)&&state.room)$('roomPicker').value=state.room.id;return}
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
 $('redlineDeleteArchivedChat')?.addEventListener('click',()=>void deleteRedlineArchivedChat());
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
  openRedlinePhotoChooser();
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
 // A group photo frame must not be replaced while uploads, drafts or paid timers are active.
 if(new URLSearchParams(location.search).get('rdGroupEmbed')==='1'){
  window.BLACKCELL_REDLINE_GROUP_SAFE_CLOSE=async()=>{
   if(state.closed||$('ledgerApp').hidden)return {ok:true};
   if(!state.room)return {ok:false,reason:'Wait for the private room to finish loading.'};
   if(state.busy||state.deletingPhotoId||state.resubmittingPhotoId||redlineQueueRunning||redlinePhotoQueue.length||document.querySelector('[aria-busy=true],.is-uploading,[data-busy=true],dialog[open]'))return {ok:false,reason:'Finish the current photo operation before switching.'};
   if(Array.from(document.querySelectorAll('.redline-message-entry')).some(e=>e.value?.trim()))return {ok:false,reason:'Send or clear the private chat draft before switching.'};
   if(state.room.active){try{const result=await window.BLACKCELL_REDLINE_API.timerStatus(state.room.id);if(result.active?.running)return {ok:false,reason:'Stop the paid photo timer before switching.'}}catch(_){return {ok:false,reason:'Could not verify the photo timer. Try again.'}}}
   return {ok:true};
  };
 }

window.BLACKCELL_REDLINE_API=Object.freeze({
 returnToRooms:()=>navigateRoomDirectory(),
 requestSenderPreviews:ids=>requestSenderPreviews(ids),
 // Read-only test fixtures from the selected, verified receiver's own
 // REDLINE exchange. Never inspect the sender's unrelated private library.
 async previousPreviewPhotos({onBatch=null,isCurrent=()=>true}={}){
  if(!state.isOwner||state.closed||!state.user||!state.room||$('ledgerApp').hidden)throw Error('Verified receiver room required.');
  const room=state.room,uid=state.user.id;
  const stillAuthorized=()=>!state.closed&&state.isOwner&&state.user?.id===uid&&state.room?.id===room.id&&!$('ledgerApp').hidden;
  await verify();
  if(!stillAuthorized())throw Error('Selected room changed.');
  let query=db.from(ENTRIES).select('id,room_id,uploaded_by,image_path,created_at').eq('room_id',room.id).eq('uploaded_by',room.member_id);
  if(room.current_session_started_at)query=query.lt('created_at',room.current_session_started_at);
  const result=await query.order('created_at',{ascending:false}).limit(48);
  if(result.error)throw result.error;
  const removal=await db.rpc('corp_redline_photo_removal_status',{p_room_id:room.id});
  if(removal.error||removal.data?.ok!==true)throw Error('Unable to verify removed photos.');
  const removed=new Set((removal.data.photos||[]).map(x=>x.photo_id));
  const rows=(result.data||[]).filter(e=>!removed.has(e.id));
  const blobs=[];
  const allowed=()=>stillAuthorized()&&isCurrent();
  // Reuse the already-authorized in-memory object URL, never a public URL.
  // Uncached archive objects are read only once per loaded room and retained
  // in the existing revocable REDLINE image cache, not persisted to disk.
  for(let i=0;i<rows.length&&blobs.length<24;i+=3){
   if(!allowed())throw Error('Selected room changed.');
   const batch=await Promise.all(rows.slice(i,i+Math.min(3,24-blobs.length)).map(async e=>{
    try{
     if(!isBunnyPath(e.image_path))return null;
     const cached=state.images.get(e.image_path);
     if(cached?.object&&cached.url?.startsWith('blob:')&&cached.expires>Date.now()){
      const blob=await fetch(cached.url).then(r=>r.blob());
      if(blob.size&&blob.size<=12*1024*1024)return blob;
     }
     if(!allowed())return null;
     const blob=await readBunnyPhoto(db,room.id,e.id);
     if(!allowed()||!(blob instanceof Blob)||!blob.size||blob.size>12*1024*1024)return null;
     // A revoked/deleted source must not be reintroduced into the preview.
     if(state.entries.some(x=>x.id===e.id&&x.photo_removal_status))return null;
     rememberImage(e.image_path,URL.createObjectURL(blob),Date.now()+20*60*1000,true);
     return blob;
    }catch(_){return null}
   }));
   if(!allowed())throw Error('Selected room changed.');
   const valid=batch.filter(Boolean);
   blobs.push(...valid);
   if(valid.length&&typeof onBatch==='function')await onBatch(valid);
  }
  if(!allowed())throw Error('Selected room changed.');
  return {roomId:room.id,blobs};
 },
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
 async roomFeatureStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||state.showArchive)
   throw Error('Verified current room required.');
  const r=await db.rpc('corp_redline_room_feature_status',{p_room_id:roomId});
  if(r.error||r.data?.ok!==true)throw Error(fail(r.error||r.data?.reason||'Feature settings unavailable.'));
  // Receiver settings display the independent server-verified trigger switch
  // and configured prices. The legacy timer/negotiation RPC stays unchanged.
  const trigger=await db.rpc('corp_redline_trigger_status',{p_room_id:roomId});
  if(trigger.error||trigger.data?.ok!==true)
   throw Error(fail(trigger.error||trigger.data?.reason||'Trigger-word settings unavailable.'));
  return {...r.data,trigger_words_enabled:trigger.data.enabled===true,
   trigger_words:trigger.data.words||[]};
 },
 async triggerWordStatus(roomId){
  if(state.closed||!state.user||state.showArchive||state.room?.id!==roomId||!validId(roomId))
   throw Error('A verified current REDLINE room is required.');
  const r=await db.rpc('corp_redline_trigger_status',{p_room_id:roomId});
  if(r.error||r.data?.ok!==true)
   throw Error(fail(r.error||r.data?.reason||'Trigger words unavailable.'));
  return r.data;
 },
 async triggerWordSave(roomId,word,priceCents,remove=false){
  if(state.closed||state.isOwner||!state.user||state.showArchive||
   !state.room?.active||state.room?.id!==roomId||!validId(roomId))
   throw Error('Only the active sender may configure trigger words.');
  const r=await db.rpc('corp_redline_trigger_save',{
   p_room_id:roomId,p_word:word,p_price_cents:priceCents,p_delete:remove===true
  });
  if(r.error||r.data?.ok!==true)
   throw Error(fail(r.error||r.data?.reason||'Word settings could not be saved.'));
  return r.data;
 },
 async setRoomFeature(roomId,key,enabled){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||state.showArchive)
   throw Error('Verified current room required.');
  if(key==='trigger_words_enabled'){
   if(!state.isOwner||!state.room?.active)
    throw Error('Only the receiver can enable or disable trigger words.');
   const r=await db.rpc('corp_redline_trigger_enable',{
    p_room_id:roomId,p_enabled:enabled===true
   });
   if(r.error||r.data?.ok!==true)
    throw Error(fail(r.error||r.data?.reason||'Trigger words could not be enabled.'));
   return {...(await this.roomFeatureStatus(roomId))};
  }
  if(!['timer_requests_enabled','negotiation_enabled','sender_auto_accept','sender_can_stop_timer','sender_can_veto_stop_timer'].includes(key))
   throw Error('Invalid setting.');
  const r=await db.rpc('corp_redline_set_room_feature',{
   p_room_id:roomId,p_key:key,p_enabled:enabled===true
  });
  if(r.error||r.data?.ok!==true)throw Error(fail(r.error||r.data?.reason||'Setting could not be saved.'));
  return r.data;
 },
 async timerRequest(photoId,rateCents){
  if(state.closed||!state.isOwner||state.showArchive||!state.room?.active||!validId(photoId)
    ||!Number.isSafeInteger(rateCents)||rateCents<1||rateCents>100000)
   throw Error('Verified receiver, photo and valid rate required.');
  const roomId=state.room.id;
  await verify();
  if(state.room?.id!==roomId)throw Error('Room changed. Request not sent.');
  const r=await db.rpc('corp_redline_timer_request',{
   p_room_id:roomId,p_photo_id:photoId,p_rate_cents:rateCents
  });
  if(r.error||r.data?.ok!==true)throw Error(fail(r.error||r.data?.reason||'Timer request could not be sent.'));
  return r.data;
 },
 async timerRequestStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||state.showArchive)
   throw Error('Verified current room required.');
  const r=await db.rpc('corp_redline_timer_request_status',{p_room_id:roomId});
  if(r.error||r.data?.ok!==true)throw Error(fail(r.error||r.data?.reason||'Timer request unavailable.'));
  return r.data;
 },
 async timerRequestRespond(requestId,accept){
  if(state.closed||state.isOwner||!state.room?.active||state.showArchive||!validId(requestId))
   throw Error('Only the verified sender may respond to a timer request.');
  const r=await db.rpc('corp_redline_timer_request_respond',{
   p_request_id:requestId,p_accept:accept===true
  });
  if(r.error||r.data?.ok!==true)throw Error(fail(r.error||r.data?.reason||'Timer response failed.'));
  return r.data;
 },
 async rateTimedPhoto(photoId,stars){
  if(state.closed||!state.isOwner||!state.user||!state.room?.active||state.showArchive||!validId(photoId)||!Number.isInteger(stars)||stars<1||stars>5)throw Error('Verified active receiver and valid rating required.');
  const room=state.room,uid=state.user.id,cutoff=room.current_session_started_at||null;
  const eligible=()=>!state.closed&&state.isOwner&&state.user?.id===uid&&state.room?.id===room.id&&state.room?.active&&!state.showArchive&&(state.room.current_session_started_at||null)===cutoff&&state.entries.some(e=>e.id===photoId&&e.room_id===room.id&&e.uploaded_by===room.member_id&&!e.photo_removal_status&&e.decision_status!=='rejected');
  if(!eligible())throw Error('This photograph is no longer available.');
  await verify();
  if(!eligible())throw Error('Private session changed.');
  const timer=await db.rpc('corp_redline_photo_timer_status',{p_room_id:room.id});
  if(timer.error||timer.data?.ok!==true||timer.data?.active?.running!==true||timer.data.active.photo_id!==photoId||!eligible())throw Error('The selected photograph is no longer the active timer.');
  const result=await db.from(RATINGS).upsert({photo_id:photoId,stars},{onConflict:'photo_id'}).select('photo_id,stars,rated_at').single();
  if(result.error||!result.data)throw Error(fail(result.error||'Rating not saved'));
  if(eligible()){state.ratings.set(photoId,result.data);state.entryFingerprint='';renderEntries();window.dispatchEvent(new Event('blackcell:redline:state'))}
  return result.data;
 },
 async priceNegotiationOpen(photoId){
  if(state.closed||state.isOwner||!state.user||!state.room?.active||
   state.showArchive||!validId(photoId))
   throw Error('Only the verified sender can request an optional counteroffer.');
  const r=await db.rpc('corp_redline_price_negotiation_open',{p_photo_id:photoId});
  if(r.error||r.data?.ok!==true)
   throw Error(fail(r.error||r.data?.reason||'The approved price is final or no longer open.'));
  return r.data;
 },
 async priceNegotiationStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||state.showArchive)
   throw Error('Verified current room required.');
  const r=await db.rpc('corp_redline_price_negotiation_status',{p_room_id:roomId});
  if(r.error||r.data?.ok!==true)throw Error(fail(r.error||r.data?.reason||'Negotiations unavailable.'));
  return r.data;
 },
 async priceNegotiationAction(photoId,action,amountCents=null){
  if(state.closed||!state.user||!state.room?.active||state.showArchive||!validId(photoId))
   throw Error('Verified active room required.');
  if(!['counter','accept_original','accept_counter','reject_counter','finalize_original','set_owner_price','accept_owner_offer','reject_owner_offer'].includes(action))
   throw Error('Invalid negotiation action.');
  const r=await db.rpc('corp_redline_price_negotiation_act',{
   p_photo_id:photoId,p_action:action,p_amount_cents:amountCents
  });
  if(r.error||r.data?.ok!==true)throw Error(fail(r.error||r.data?.reason||'Negotiation response failed.'));
  if(action==='accept_counter'&&state.isOwner||action==='accept_owner_offer'){
   state.entryFingerprint='';
   try{await loadEntries({force:true})}catch(_){/* Next room refresh will pick up price. */}
  }
  return r.data;
 },
 async repeatBonusStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||
     !validId(roomId)||state.showArchive)throw Error('Verified current REDLINE room required.');
  const result=await db.rpc('corp_redline_repeat_bonus_status',{p_room_id:roomId});
  if(result.error||result.data?.ok!==true)
   throw Error(fail(result.error||result.data?.reason||'Repeat-photo bonus ledger unavailable.'));
  return result.data;
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
 async timerStopRequest(sessionId){
  if(state.closed||!state.isOwner||!state.room?.active||state.showArchive||!validId(sessionId))
   throw Error('An active owner timer is required.');
  const roomId=state.room.id;
  await verify();
  if(state.room?.id!==roomId)throw Error('Room changed; timer stop was not requested.');
  const result=await db.rpc('corp_redline_timer_stop_request',{p_session_id:sessionId});
  if(result.error||result.data?.ok!==true)
   throw Error(fail(result.error||result.data?.reason||'Timer stop request failed.'));
  if(result.data.status==='stopped'){
   // Third STOP (or a 10-second timeout) must follow the exact same
   // finished-photo/next-photo path as the original immediate STOP.
   await window.BLACKCELL_REDLINE_API.refreshTimerPhoto(result.data,sessionId);
  }
  return result.data;
 },
 async senderVetoTimerStop(sessionId){
  if(state.closed||state.isOwner||state.showArchive||!state.room?.active||!validId(sessionId))
   throw Error('Verified sender access required to decline the stop.');
  const roomId=state.room.id;
  await verify();
  if(state.room?.id!==roomId)throw Error('Room changed; stop response was not sent.');
  const result=await db.rpc('corp_redline_timer_stop_veto',{p_session_id:sessionId});
  if(result.error||result.data?.ok!==true)
   throw Error(fail(result.error||result.data?.reason||'Stop response failed.'));
  return result.data;
 },
 async refreshTimerPhoto(completed=null,sessionId=null){
  if(state.closed||!state.user||!state.room?.active||state.showArchive)return false;
  const roomId=state.room.id,owner=state.isOwner;
  const finishedId=completed?.photo_id;
  if(owner&&validId(finishedId)){
   // Never keep the stopped photo pinned over the NEXT pending submission.
   // Make the server-authoritative completion visible before awaiting a
   // potentially slow/failed Android data refresh.
   const photo=state.entries.find(e=>e.id===finishedId);
   if(photo&&photo.decision_status==='pending'&&Number(completed.earned_cents)>0){
    const decided=new Date().toISOString();
    Object.assign(photo,{
     amount_cents:completed.earned_cents,decision_status:'accepted',
     auto_timer_session_id:validId(sessionId)?sessionId:photo.auto_timer_session_id,
     priced_at:decided,decided_at:decided
    });
   }
   state.reviewSidebarPhotoId=null;
   renderReviewQueue();
   renderEntries();
   updateTotals();
   const next=document.querySelector('#reviewQueueCurrent .photo-entry[data-redline-photo-id]');
   const nextId=next?.dataset.redlinePhotoId||null;
   show('reviewQueueFeedback',nextId&&nextId!==finishedId
    ?'Timer completed · '+dollars(completed.earned_cents)+' recorded · Next pending photo ready.'
    :'Timer completed · '+dollars(completed.earned_cents)+' recorded · Waiting for next pending photo.');
  }
  state.entryFingerprint='';
  try{
   await loadEntries({force:true});
   return state.room?.id===roomId;
  }catch(e){
   if(owner&&validId(finishedId))show('entriesFeedback',
    'Timer completed; next photo selected. Background refresh unavailable: '+fail(e));
   return false;
  }
 },
 async senderStopTimer(sessionId){
  if(state.closed||state.isOwner||state.showArchive||!state.room?.active||!validId(sessionId))
   throw Error('A verified sender with an active REDLINE timer is required.');
  const roomId=state.room.id;
  await verify();
  if(state.room?.id!==roomId)throw Error('Room changed; the timer was not stopped.');
  const result=await db.rpc('corp_redline_sender_stop_timer',{p_session_id:sessionId});
  if(result.error||result.data?.ok!==true)
   throw Error(fail(result.error||result.data?.reason||'Timer stop is unavailable.'));
  state.entryFingerprint='';
  try{await loadEntries({force:true})}catch(_){/* New status polling will refresh room records. */}
  window.dispatchEvent(new Event('blackcell:redline:state'));
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
  const roomId=state.room?.id;
  await verify();
  if(state.room?.id!==roomId)throw Error('Room changed; timer not stopped in this view.');
  const result=await db.rpc('corp_redline_photo_timer_stop',{p_session_id:sessionId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Timer could not stop.'));
  if(result.data.photo_id&&state.room?.id===roomId){
   const photoId=result.data.photo_id;
   const photo=state.entries.find(e=>e.id===photoId);
   // The server committed this price atomically. Reflect that accepted
   // decision locally BEFORE a network refresh, like manual pricing does.
   if(result.data.photo_auto_submitted===true&&photo&&photo.decision_status==='pending'){
    const decided=new Date().toISOString();
    Object.assign(photo,{
     amount_cents:result.data.earned_cents,
     decision_status:'accepted',auto_timer_session_id:sessionId,
     priced_at:decided,decided_at:decided
    });
   }
   if(options.keepPhotoSelected===true){
    state.reviewSidebarPhotoId=photoId;
   }else{
    // STOP TIMING advances to the OLDEST pending photo, not the one that
    // was just priced. A new pending upload must not be blocked by a timer.
    state.reviewSidebarPhotoId=null;
   }
   renderReviewQueue();
   renderEntries();
   updateTotals();
   const next=document.querySelector('#reviewQueueCurrent .photo-entry[data-redline-photo-id]');
   const nextPhotoId=next?.dataset.redlinePhotoId||null;
   show('reviewQueueFeedback',nextPhotoId&&nextPhotoId!==photoId
    ?'Timer stopped · '+dollars(result.data.earned_cents)+' recorded · Next pending photo ready.'
    :'Timer stopped · '+dollars(result.data.earned_cents)+' recorded · Waiting for next photo.');
   state.entryFingerprint='';
   try{await loadEntries({force:true})}
   catch(refreshError){show('entriesFeedback',
    'Timer price saved and photo queue advanced. Background refresh unavailable: '+fail(refreshError))}
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
 async roomPaymentStatus(roomId,archive=state.showArchive){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||!validId(roomId))
   throw Error('A verified REDLINE room is required.');
  return await loadRoomPayments(roomId,archive);
 },
 async recordPartialPayment(roomId,amountCents,note=''){
  if(state.closed||!state.isOwner||state.busy||state.showArchive||!state.room?.active||
     state.room.id!==roomId||!validId(roomId)||$('ledgerApp').hidden)
   throw Error('An active, verified receiver room is required to record a payment.');
  if(!Number.isSafeInteger(amountCents)||amountCents<1)
   throw Error('Enter a valid partial payment of at least $0.01.');
  if(String(note).length>180)throw Error('Payment note is too long.');
  state.busy=true;
  try{
   await verify();
   if(state.room?.id!==roomId||state.showArchive)throw Error('Room changed. Payment was not recorded.');
   const response=await db.rpc('corp_redline_record_partial_payment',{
    p_room_id:roomId,p_amount_cents:amountCents,p_note:String(note).trim()
   });
   if(response.error||response.data?.ok!==true)
    throw Error(fail(response.error||response.data?.reason||'Partial payment could not be recorded.'));
   let refreshUnavailable=false;
   try{await loadRoomPayments(roomId,false)}catch(_){refreshUnavailable=true}
   return {...response.data,refreshUnavailable};
  }finally{state.busy=false}
 },
 async recordPaidInFull(roomId){
  if(state.closed||!state.isOwner||state.busy||state.showArchive||!state.room
   ||state.room.id!==roomId||!validId(roomId)||$('ledgerApp').hidden)
   throw Error('An active, verified receiver room is required to record full payment.');
  state.busy=true;
  try{
   await verify();
   if(state.closed||state.room?.id!==roomId||state.showArchive)
    throw Error('Room changed. Payment was not recorded.');
   const response=await db.rpc('corp_redline_record_paid_in_full',{p_room_id:roomId});
   if(response.error||response.data?.ok!==true)
    throw Error(fail(response.error||response.data?.reason||'Full payment could not be recorded.'));
   state.entryFingerprint='';
   let refreshUnavailable=false;
   try{await loadEntries({force:true})}catch(_){refreshUnavailable=true}
   window.dispatchEvent(new Event('blackcell:redline:state'));
   return {...response.data,refreshUnavailable};
  }finally{state.busy=false}
 },
 async presenceTouch(roomId,sessionId,active=true){
  if(state.closed||!state.user||!validId(roomId)||!validId(sessionId)||typeof active!=='boolean'||(active&&state.room?.id!==roomId))throw Error('REDLINE room presence unavailable.');
  const result=await db.rpc('corp_redline_presence_touch',{p_room_id:roomId,p_session_id:sessionId,p_active:active});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Presence update failed.'));
  return true;
 },
 async setCurrentlyViewing(photoId){
  if(state.closed||!state.isOwner||state.showArchive||!state.room?.active||
     (photoId!==null&&!validId(photoId)))
   throw Error('Active verified owner room required to share selected photo.');
  const roomId=state.room.id;
  const result=await db.rpc('corp_redline_set_currently_viewing',{
   p_room_id:roomId,p_photo_id:photoId
  });
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Viewing presence not saved.'));
  return true;
 },
 async currentlyViewingStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||!validId(roomId))
   throw Error('A verified room is required to view receiver activity.');
  const result=await db.rpc('corp_redline_currently_viewing_status',{p_room_id:roomId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Viewing status unavailable.'));
  return {photoId:result.data.photo_id||null,active:result.data.active===true,
   updatedAt:result.data.updated_at||null};
 },
 async presenceStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||!validId(roomId))throw Error('Verified REDLINE room required.');
  const result=await db.rpc('corp_redline_presence_status',{p_room_id:roomId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Presence status unavailable.'));
  return {online:result.data.online===true,lastActiveAt:result.data.last_active_at||null};
 },
 snapshot(options={}){
  if(state.closed||!state.user||!state.room||$('ledgerApp').hidden)return null;
  // Hot-path room checks must not sort or allocate the entire photo history.
  const base={
   roomId:state.room.id,
   userId:state.user.id,
   peerName:state.isOwner?participantName(state.room.member_id):participantName(state.room.owner_id),
   isOwner:state.isOwner,
   roomActive:state.room.active===true,
   photoSendingPaused:state.room.photo_sending_paused===true,
   roomTitle:state.room.title,
   archiveMode:state.showArchive,
   resetAt:state.room.current_session_started_at||null
  };
  if(options?.light===true)return base;
  const history=photoHistoryData();
  return {...base,
   pending:state.entries.filter(e=>e.decision_status==='pending'&&!e.photo_removal_status).length,
   owed:$('totalOwed').textContent,
   assigned:$('totalAssigned').textContent,
   paid:$('totalPaid').textContent,
   paymentSummary:authoritativePaymentStatus(),
   paymentHistory:authoritativePaymentStatus()?.payment_history||[],
   photoActionBillCreditCents:authoritativePaymentStatus()?.photo_action_bill_credit_cents||0,
   photoActionBillCreditCarryCents:authoritativePaymentStatus()?.photo_action_bill_credit_carry_cents||0,
   photoActionBillCreditHistory:authoritativePaymentStatus()?.photo_action_bill_credit_history||[],
   entries:state.entries.slice(0,200).map(e=>({
    id:e.id,created_at:e.created_at,decided_at:e.decided_at,
    settled_at:e.settled_at,decision_status:e.decision_status,
    auto_timer_session_id:e.auto_timer_session_id||null,
    amount_cents:e.amount_cents,
    resubmission_origin_id:e.resubmission_origin_id||null,
    removal_status:e.photo_removal_status||null,
    caption:e.photo_removal_status?'':e.caption||''
   })),
   ratingEvents:state.entries.filter(e=>!e.photo_removal_status&&state.ratings.has(e.id))
    .sort((a,b)=>Date.parse(state.ratings.get(b.id)?.rated_at||0)-Date.parse(state.ratings.get(a.id)?.rated_at||0))
    .slice(0,40).map(ratedPhotoData),
   topPicks:state.entries.filter(e=>!e.photo_removal_status&&state.ratings.has(e.id))
    .sort((a,b)=>
     (state.ratings.get(b.id)?.stars||0)-(state.ratings.get(a.id)?.stars||0)||
     Number(cents(a.amount_cents)<cents(b.amount_cents))-Number(cents(a.amount_cents)>cents(b.amount_cents))||
     Date.parse(state.ratings.get(b.id)?.rated_at||0)-Date.parse(state.ratings.get(a.id)?.rated_at||0))
    .slice(0,5).map(ratedPhotoData),
   fiveStarPhotos:fiveStarResubmissionData(history),
   photoHistory:history
  };
 },
 async resubmitFiveStarPhoto(photoId){
  const room=state.room;
  if(state.closed||state.isOwner||state.showArchive||!state.user||
    !room?.active||room.photo_sending_paused||!validId(photoId))
   throw Error('Return to an active sender room with photo sending enabled.');
  if(state.resubmittingPhotoId)throw Error('A private photo is already being resubmitted.');
  const source=state.entries.find(e=>e.id===photoId&&e.room_id===room.id);
  const allowed=photoHistoryData().find(p=>p.id===photoId&&p.resubmissionAllowed);
  if(!source||!allowed)throw Error('Reuse requires an approved original with no pending or rejected copy in the active private room.');
  const extension=source.image_path.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)?.[1]?.toLowerCase();
  if(!extension)throw Error('Original photo type is unsupported.');
  state.resubmittingPhotoId=photoId;
  let newPath=null,posted=false,bunnyAttempted=false,resubmitId=null;
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
   let blob;
   if(isBunnyPath(source.image_path))blob=await readBunnyPhoto(db,room.id,source.id);
   else{
    const download=await db.storage.from(BUCKET).download(source.image_path);
    if(download.error||!download.data)
     throw Error('The archived original is missing from deleted Supabase storage. Re-upload it to Bunny first.');
    blob=download.data;
   }
   if(!blob.size||blob.size>MAX_IMAGE_BYTES)throw Error('The stored original exceeds the supported photo limit.');
   const id=crypto.randomUUID();resubmitId=id;
   const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',
    webp:'image/webp',heic:'image/heic',heif:'image/heif'}[extension];
   bunnyAttempted=true;
   newPath=await uploadBunnyPhoto(db,room.id,state.user.id,id,blob,mime);
   const created=await db.from(ENTRIES).insert({
    id,room_id:room.id,uploaded_by:state.user.id,image_path:newPath,
    resubmission_origin_id:photoId,decision_status:'pending',
    file_name:source.file_name,caption:source.caption||''
   }).select('id').single();
   if(created.error||!created.data)throw Error(fail(created.error||'The receiver has blocked photo reuse.'));
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
   if(bunnyAttempted&&!posted&&resubmitId)
    try{await cleanupUnpostedBunny(db,room.id,resubmitId)}catch(_){}
   throw error;
  }finally{state.resubmittingPhotoId=null}
 },
 // New sender UI calls reusePhoto. Keep the previous method for compatibility.
 async reusePhoto(photoId){
  return await window.BLACKCELL_REDLINE_API.resubmitFiveStarPhoto(photoId);
 },
 async breakEvents(){
 const room=state.room,cutoff=room?.current_session_started_at;
 if(state.closed||!state.user||!room?.active||state.showArchive)return [];
 let q=db.from('corp_redline_break_events').select('id,kind,request_id,photo_id,created_at').eq('room_id',room.id);
 if(cutoff)q=q.gte('created_at',cutoff);
 const result=await q.order('created_at',{ascending:false}).limit(500);
 if(result.error)throw Error(fail(result.error));
 return state.room?.id===room.id&&!state.showArchive&&state.room?.current_session_started_at===cutoff?result.data||[]:[];
 },
 async breakAction(kind,requestId=null,photoId=null){
 const room=state.room;
 if(state.closed||!state.user||!room?.active||state.showArchive||!['request','ack','end','favorite'].includes(kind)||(state.isOwner===(kind==='request')))throw Error('Open an active verified private room.');
 if(kind!=='request'&&!validId(requestId))throw Error('Invalid break request.');
 if(kind==='favorite'&&(!validId(photoId)||!photoHistoryData().some(p=>p.id===photoId&&!p.removal_status&&p.decision_status==='accepted')))throw Error('Select an approved photograph.');
 if(kind==='ack'){
 const status=await window.BLACKCELL_REDLINE_API.timerStatus(room.id);
 if(!status?.ok||status.active?.running)throw Error('Stop the paid timer before acknowledging this break.');
 }
 if(state.room?.id!==room.id||state.showArchive)throw Error('Private room changed.');
 const result=await db.from('corp_redline_break_events').insert({room_id:room.id,kind,request_id:requestId,photo_id:photoId}).select('id').single();
 if(result.error)throw Error(fail(result.error));return result.data;
 },
 async refreshSenderRecords(){
  if(state.closed||state.isOwner||!state.user||!state.room)throw Error('Open a verified sender room first.');
  await loadEntries({force:true});
  return true;
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
  const list=(result.data||[]).reverse();
  // Add ONLY independently verified trigger fees to already-authorized chat.
  // The existing single charge per message is never created by browser.
  if(!list.length||state.showArchive)return list;
  try{
   const receipt=await db.rpc('corp_redline_trigger_chat_events',{
    p_room_id:roomId,p_message_ids:list.map(m=>m.id)
   });
   if(state.closed||state.room?.id!==roomId||state.showArchive)return [];
   if(receipt.error||receipt.data?.ok!==true){
    console.warn('REDLINE chat trigger receipts unavailable',receipt.error||receipt.data?.reason);
    return list;
   }
   const fees=new Map((receipt.data.events||[])
    .filter(x=>validId(x.message_id)&&Number.isInteger(x.price_cents)&&
     x.price_cents>=10&&x.price_cents<=25)
    .map(x=>[x.message_id,x]));
   return list.map(m=>({...m,triggerFee:fees.get(m.id)||null}));
  }catch(error){
   // A fee display outage must never prevent a private chat from loading.
   console.warn('REDLINE trigger fee receipt unavailable',error);
   return list;
  }
 },
 async chatSignal(roomId,action,messageId=null){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||!validId(roomId)||
   state.showArchive||!['typing','stopped','read'].includes(action))
   throw Error('A verified current REDLINE room is required.');
  const result=await db.rpc('corp_redline_chat_signal',{p_room_id:roomId,p_action:action,p_message_id:messageId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Chat signal unavailable.'));
  return true;
 },
 async chatStatus(roomId){
  if(state.closed||!state.user||!state.room||state.room.id!==roomId||!validId(roomId)||
   state.showArchive)throw Error('A verified current REDLINE room is required.');
  const result=await db.rpc('corp_redline_chat_status',{p_room_id:roomId});
  if(result.error||result.data?.ok!==true)throw Error(fail(result.error||result.data?.reason||'Chat status unavailable.'));
  return {peerReadAt:result.data.peer_read_at||null,peerTyping:result.data.peer_typing===true};
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
  if(state.isOwner)window.dispatchEvent(new Event('blackcell:redline:owner-chat-sent'));
  return true;
 }
});
window.dispatchEvent(new Event('blackcell:redline:bridge'));
void initialize();
