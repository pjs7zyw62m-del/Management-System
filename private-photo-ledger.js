import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261112-access2';

const db=corporateClient();
const BUCKET='corp-private-photo-ledger';
const ROOMS='corp_private_photo_rooms';
const ENTRIES='corp_private_photo_entries';
const MAX_IMAGE_BYTES=12*1024*1024;
const MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);
const VALID_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const $=id=>document.getElementById(id);
const state={
 user:null,member:null,isOwner:false,rooms:[],room:null,employees:[],
 entries:[],filter:'all',busy:false,refreshing:false,closed:false,
 images:new Map(),entryFingerprint:'',liveStarted:false,roomChannel:null,roomsChannel:null,liveRoomId:null,liveQueued:false,liveTimer:null,liveConnected:false,scopeMemberId:null,scopeValue:'full',scopeLoading:false
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
  if(!state.isOwner&&a.member.role!=='employee')throw Error('This private area is available only to verified owner and selected employees.');
  await verify();
  updateLedgerNavigation();
  $('accessGate').hidden=true;
  $('ledgerApp').hidden=false;
  $('ownerSetup').hidden=!state.isOwner;
  if(state.isOwner)await loadEmployees();
  wireEvents();
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
 show('ledgerScopeStatus',limited?'LEDGER-ONLY ACCESS':'FULL CORPORATE ACCESS');
 show('ledgerScopeIndicator',limited?'RESTRICTED':'STANDARD ACCESS');
 show('ledgerScopeDescription',limited
  ?'The assigned employee can only use this private photo ledger. Network, chat and other corporate applications are blocked by server-side permissions. You may restore normal access.'
  :'This employee currently has regular corporate access. Restrict them to this photo ledger to block Network, chat and other authorized corporate apps.');
 const btn=$('ledgerScopeToggle');
 btn.disabled=state.scopeLoading;
 btn.textContent=limited?'RESTORE FULL CORPORATE ACCESS':'RESTRICT EMPLOYEE TO LEDGER ONLY';
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
  ?'RESTRICT '+who+' to the Private Photo Ledger ONLY?\n\nThe employee will no longer be able to use Blackcell Network, chat, or other corporate apps. Existing private ledger photos stay available.'
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
   ?'Ledger-only restriction saved. Other corporate data access is now blocked for that employee.'
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
  const result=await db.from(ROOMS).select('id,owner_id,member_id,title,active,created_at')
   .order('created_at',{ascending:false}).limit(100);
  if(result.error)throw result.error;
  state.rooms=result.data||[];
  const currentId=state.room?.id;
  const requested=new URLSearchParams(location.search).get('room');
  const preferred=(validId(requested)?state.rooms.find(x=>x.id===requested):null)
     ||state.rooms.find(x=>x.id===currentId)
     ||state.rooms[0]||null;
  state.room=preferred;
  if(state.liveStarted)subscribeEntries(preferred);
  $('noRoom').hidden=!!preferred;
  $('activeRoom').hidden=!preferred;
  if(!preferred){
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
  await loadEntries({force:force||initial||currentId!==preferred.id});
 }finally{
  state.refreshing=false;
  if(state.liveQueued){state.liveQueued=false;queueLiveRefresh()}
 }
}
function updateUploadAccess(room){
 const available=Boolean(room?.active);
 $('uploadAccessStatus').hidden=!room;
 if(!room)return;
 $('ownerUploadInfo').hidden=!state.isOwner;
 const action=$('uploadAccessAction');
 if(state.isOwner){
  show('uploadAccessTitle','PHOTO UPLOAD · ASSIGNED EMPLOYEE');
  show('uploadAccessDetail',available
   ?'The selected employee has the working Upload Photo control on his account. You can copy the private link and see each photo here before assigning an amount.'
   :'This room is closed. Reopen it before the employee can upload.');
  show('ownerUploadDescription',available
   ?'The photo upload form is available when the selected employee signs in with his own corporate account. Your Level 7 account controls amounts and settlement records.'
   :'This room is closed. Existing photos remain available, but new employee uploads are paused.');
  action.textContent=available?'COPY EMPLOYEE UPLOAD LINK':'REOPEN ROOM TO UPLOAD';
  action.disabled=false;
 }else{
  show('uploadAccessTitle',available?'UPLOAD A PRIVATE PHOTO':'PHOTO UPLOAD PAUSED');
  show('uploadAccessDetail',available
   ?'Your private room is active. Tap the button to open the photo picker on this iPad or choose a photo in the upload panel below.'
   :'The owner has closed this room. Previous submissions remain visible, but uploading is temporarily disabled.');
  action.textContent=available?'＋ UPLOAD PHOTO':'ROOM CLOSED';
  action.disabled=!available;
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
async function loadEntries({force=false}={}){
 const selectedRoom=state.room;
 if(!selectedRoom)return;
 const all=[];
 for(let from=0;from<5000;from+=250){
  const result=await db.from(ENTRIES)
   .select('id,room_id,uploaded_by,image_path,file_name,caption,amount_cents,decision_status,decided_at,priced_at,settled_at,created_at')
   .eq('room_id',selectedRoom.id).order('created_at',{ascending:false}).range(from,from+249);
  if(result.error)throw result.error;
  all.push(...(result.data||[]));
  if((result.data||[]).length<250)break;
 }
 if(state.room?.id!==selectedRoom.id)return;
 const signature=JSON.stringify(all.map(e=>[e.id,e.amount_cents,e.decision_status,e.decided_at,e.priced_at,e.settled_at,e.caption]));
 state.entries=all;
 updateTotals();
 const needsSignedRefresh=all.some(e=>!state.images.has(e.image_path)
   ||state.images.get(e.image_path).expires<Date.now());
 if(signature!==state.entryFingerprint||force||needsSignedRefresh){
  state.entryFingerprint=signature;
  await signImages(all);
  renderEntries();
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
function renderEntries(){
 const parent=$('photoEntries');parent.replaceChildren();
 if(!state.room)return;
 const list=state.entries.filter(e=>state.filter==='all'||entryState(e)===state.filter);
 if(!list.length){
  parent.append(node('div','empty-entries',state.filter==='all'
   ?'No photos yet. The selected employee can upload the first picture here.'
   :'No photo entries match this filter.'));
  return;
 }
 for(const e of list)parent.append(renderEntry(e));
}
function renderEntry(e){
 const status=entryState(e);
 const card=node('article','photo-entry');
 const imageButton=button('',()=>{
  const src=state.images.get(e.image_path)?.url;
  if(!src)return;
  $('lightboxImage').src=src;
  $('lightboxImage').alt=e.caption||'Private uploaded photograph';
  $('photoLightbox').hidden=false;document.body.style.overflow='hidden';
 },'photo-image-btn');
 imageButton.setAttribute('aria-label','View original private photo');
 const img=node('img');
 img.loading='lazy';img.alt=e.caption||e.file_name;
 const signed=state.images.get(e.image_path)?.url;
 if(signed)img.src=signed;else{
  img.alt='Image preview unavailable. Select Refresh to retry.';
  imageButton.title='Private preview unavailable — refresh';
 }
 imageButton.append(img);card.append(imageButton);
 const body=node('div','photo-entry-content');
 const meta=node('div','entry-meta');
 meta.append(node('span','',when(e.created_at)));
 const statusBadge=node('span','entry-badge '+status,status==='pending'?'AWAITING YOUR REVIEW':status==='rejected'?'REJECTED':status==='free'?'ACCEPTED · $0.00':status==='owed'?'AMOUNT OWED':'RECORDED PAID');
 meta.append(statusBadge);
 body.append(meta,node('h3','','PHOTO '+e.id.slice(0,8).toUpperCase()));
 body.append(node('p','caption',e.caption||'No caption provided.'));
 const ctrl=node('div','entry-controls');
 if(status==='rejected'){
  body.append(node('div','entry-amount','REJECTED'));
  ctrl.append(node('small','','The owner rejected this photo on '+when(e.decided_at)+'. Nothing was added to the balance.'));
 }else if(status==='free'){
  body.append(node('div','entry-amount','$0.00'));
  ctrl.append(node('small','','Accepted at no charge on '+when(e.decided_at)+'. No payment is owed.'));
 }else if(e.decision_status==='accepted'){
  body.append(node('div','entry-amount',dollars(e.amount_cents)));
  ctrl.append(node('small','',e.settled_at
   ?'Manually recorded as paid on '+when(e.settled_at)
   :'Accepted by the owner on '+when(e.decided_at)+'.'));
  if(state.isOwner&&!e.settled_at&&cents(e.amount_cents)>0n){
   ctrl.append(button('✓ RECORD AS PAID',()=>void settle(e),'button-outline'));
  }
 }else{
  body.append(node('div','entry-amount','PENDING OWNER REVIEW'));
  if(state.isOwner){
   const row=node('div','amount-row');
   const input=node('input');
   input.type='text';input.inputMode='decimal';input.placeholder='USD 0.00';input.maxLength=23;
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
 body.append(ctrl);card.append(body);return card;
}
async function assignAmount(entry,input,submit){
 if(!state.isOwner||state.busy||entry.decision_status!=='pending')return;
 let amount;
 try{amount=parseDollars(input.value)}catch(e){show('entriesFeedback',fail(e));return}
 if(!window.confirm('ACCEPT this photo for '+dollars(amount)+'? This acceptance and amount are final.'))return;
 state.busy=true;submit.disabled=true;submit.textContent='SAVING…';
 try{
  await verify();
  const r=await db.from(ENTRIES).update({amount_cents:amount,decision_status:'accepted'})
   .eq('id',entry.id).eq('room_id',state.room.id).eq('decision_status','pending')
   .select('id,amount_cents,decision_status').single();
  if(r.error)throw r.error;
  state.entryFingerprint='';await loadEntries({force:true});
  show('entriesFeedback','Photo accepted for '+dollars(amount)+'. Both screens will update automatically.');
 }catch(e){show('entriesFeedback','Could not assign amount: '+fail(e))}
 finally{state.busy=false;submit.disabled=false;submit.textContent='✓ ACCEPT PHOTO'}
}
async function acceptZero(entry,trigger){
 const field=document.createElement('input');
 field.value='0.00';
 await assignAmount(entry,field,trigger);
}
async function rejectPhoto(entry,trigger){
 if(!state.isOwner||state.busy||entry.decision_status!=='pending')return;
 if(!window.confirm('Reject this photo? It will remain in the private record as REJECTED with no amount owed. This cannot be undone.'))return;
 state.busy=true;trigger.disabled=true;
 try{
  await verify();
  const r=await db.from(ENTRIES).update({decision_status:'rejected'})
    .eq('id',entry.id).eq('room_id',state.room.id).eq('decision_status','pending')
    .select('id,decision_status').single();
  if(r.error)throw r.error;
  state.entryFingerprint='';await loadEntries({force:true});
  show('entriesFeedback','Photo rejected. Both participants will see the decision automatically.');
 }catch(e){show('entriesFeedback','Could not reject photo: '+fail(e))}
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
async function uploadPhoto(event){
 event.preventDefault();
 if(state.isOwner||state.busy||!state.room?.active)return;
 const file=$('uploadPhoto').files?.[0];
 if(!file){show('uploadFeedback','Choose a photo first.');return}
 if(file.size>MAX_IMAGE_BYTES||file.size===0){show('uploadFeedback','Choose a non-empty image no larger than 12 MB.');return}
 let info;
 try{info=imageType(file)}catch(e){show('uploadFeedback',fail(e));return}
 state.busy=true;
 const btn=$('submitPhoto');btn.disabled=true;btn.textContent='UPLOADING PRIVATELY…';
 const room=state.room;
 const id=crypto.randomUUID();
 const path=room.id+'/'+id+'.'+info.ext;
 try{
  await verify();
  const upload=await db.storage.from(BUCKET).upload(path,file,{contentType:info.mime,upsert:false,cacheControl:'60'});
  if(upload.error)throw upload.error;
  const r=await db.from(ENTRIES).insert({
    id,room_id:room.id,uploaded_by:state.user.id,image_path:path,decision_status:'pending',
    file_name:file.name.slice(0,180),caption:$('uploadCaption').value.trim().slice(0,500)
  }).select('id').single();
  if(r.error){
   // The cleanup policy allows deleting an uploaded file only if no ledger entry references it.
   await db.storage.from(BUCKET).remove([path]);
   throw r.error;
  }
  $('uploadPhoto').value='';$('uploadCaption').value='';
  show('selectedPhotoName','No photo selected');
  show('uploadFeedback','Photo saved privately. The owner can now assign an amount.');
  state.entryFingerprint='';
  await loadEntries({force:true});
 }catch(e){show('uploadFeedback','Could not post photo: '+fail(e))}
 finally{state.busy=false;btn.disabled=false;btn.textContent='POST TO OUR PRIVATE ROOM ↗'}
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
 $('photoLightbox').hidden=true;$('lightboxImage').removeAttribute('src');
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
  void refresh({force:true}).catch(e=>show('entriesFeedback',fail(e)));
 });
 $('closeRoomBtn').addEventListener('click',()=>void toggleRoom());
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
void initialize();
