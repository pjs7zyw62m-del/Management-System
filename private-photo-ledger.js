import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-staff1';

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
 images:new Map(),entryFingerprint:''
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
 if(n<1n||n>MAX_SAFE)throw Error('Amount must be at least $0.01 and within the supported limit.');
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
}
async function initialize(){
 try{
  const {data:{session}}=await db.auth.getSession();
  if(!session)throw Error('Sign in through BLACKCELL first.');
  const a=await corporateAuthorize(db);
  if(!a.ok)throw Error('Your corporate account is not approved or active.');
  state.user=a.user;state.member=a.member;
  state.isOwner=a.member.role==='owner'&&a.member.clearance_level===7;
  if(!state.isOwner&&a.member.role!=='employee')throw Error('This private area is available only to verified owner and selected employees.');
  await verify();
  $('backLink').href=state.isOwner?'dashboard.html':'corporate-network.html?view=profile';
  $('backLink').textContent=state.isOwner?'RETURN TO ADMINISTRATION ↗':'RETURN TO NETWORK ↗';
  $('accessGate').hidden=true;
  $('ledgerApp').hidden=false;
  $('ownerSetup').hidden=!state.isOwner;
  if(state.isOwner)await loadEmployees();
  wireEvents();
  await refresh({initial:true});
  window.setInterval(async()=>{
   if(document.hidden||state.closed||state.busy)return;
   try {await refresh()}catch(e){show('entriesFeedback','Refresh unavailable: '+fail(e))}
  },25000);
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
 if(state.refreshing||state.closed)return;
 state.refreshing=true;
 try{
  const result=await db.from(ROOMS).select('id,owner_id,member_id,title,active,created_at')
   .order('created_at',{ascending:false}).limit(100);
  if(result.error)throw result.error;
  state.rooms=result.data||[];
  const currentId=state.room?.id;
  const requested=new URLSearchParams(location.search).get('room');
  const preferred=state.rooms.find(x=>x.id===currentId)
     ||(validId(requested)?state.rooms.find(x=>x.id===requested):null)
     ||state.rooms[0]||null;
  state.room=preferred;
  $('noRoom').hidden=!!preferred;
  $('activeRoom').hidden=!preferred;
  if(!preferred){
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
  show('owedDescription',state.isOwner?'Amount owed by you to this employee':'Amount the owner owes you');
  const idx=state.rooms.findIndex(x=>x.id===preferred.id);
  show('roomNumber',String(idx+1).padStart(2,'0'));
  const u=new URL(location.href);u.searchParams.set('room',preferred.id);
  history.replaceState(null,'',u.pathname+u.search);
  await loadEntries({force:force||initial||currentId!==preferred.id});
 }finally{state.refreshing=false}
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
   .select('id,room_id,uploaded_by,image_path,file_name,caption,amount_cents,priced_at,settled_at,created_at')
   .eq('room_id',selectedRoom.id).order('created_at',{ascending:false}).range(from,from+249);
  if(result.error)throw result.error;
  all.push(...(result.data||[]));
  if((result.data||[]).length<250)break;
 }
 if(state.room?.id!==selectedRoom.id)return;
 const signature=JSON.stringify(all.map(e=>[e.id,e.amount_cents,e.priced_at,e.settled_at,e.caption]));
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
 for(const e of state.entries){
  if(e.amount_cents===null){pending++;continue}
  const amount=cents(e.amount_cents);
  assigned+=amount;
  if(e.settled_at)paid+=amount;else owed+=amount;
 }
 show('totalAssigned',dollars(assigned));
 show('totalPaid',dollars(paid));
 show('totalOwed',dollars(owed));
 show('pendingCount',String(pending));
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
 if(e.settled_at)return 'settled';
 if(e.amount_cents!==null)return 'owed';
 return 'pending';
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
 const statusBadge=node('span','entry-badge '+status,status==='pending'?'AWAITING AMOUNT':status==='owed'?'AMOUNT OWED':'RECORDED PAID');
 meta.append(statusBadge);
 body.append(meta,node('h3','','PHOTO '+e.id.slice(0,8).toUpperCase()));
 body.append(node('p','caption',e.caption||'No caption provided.'));
 const ctrl=node('div','entry-controls');
 if(e.amount_cents!==null){
  body.append(node('div','entry-amount',dollars(e.amount_cents)));
  ctrl.append(node('small','',e.settled_at
   ?'Manually marked as paid on '+when(e.settled_at)
   :'Amount assigned by the owner on '+when(e.priced_at)+'.'));
  if(state.isOwner&&!e.settled_at){
   ctrl.append(button('✓ RECORD AS PAID',()=>void settle(e),'button-outline'));
  }
 }else{
  body.append(node('div','entry-amount','AWAITING AMOUNT'));
  if(state.isOwner){
   const row=node('div','amount-row');
   const input=node('input');
   input.type='text';input.inputMode='decimal';input.placeholder='USD 0.00';input.maxLength=23;
   input.setAttribute('aria-label','Amount to assign in USD for photo '+e.id.slice(0,8));
   const submit=button('PLACE MY AMOUNT',()=>void assignAmount(e,input,submit),'button-main');
   row.append(input,submit);
   ctrl.append(row,node('small','','Once you assign an amount it is locked. The employee can see it immediately after refreshing.'));
  }else{
   ctrl.append(node('small','','The BLACKCELL owner has not set an amount for this photograph yet.'));
  }
 }
 body.append(ctrl);card.append(body);return card;
}
async function assignAmount(entry,input,submit){
 if(!state.isOwner||state.busy||entry.amount_cents!==null)return;
 let amount;
 try{amount=parseDollars(input.value)}catch(e){show('entriesFeedback',fail(e));return}
 if(!window.confirm('Set '+dollars(amount)+' for this photo? Once assigned, the amount cannot be changed.'))return;
 state.busy=true;submit.disabled=true;submit.textContent='SAVING…';
 try{
  await verify();
  const r=await db.from(ENTRIES).update({amount_cents:amount})
   .eq('id',entry.id).eq('room_id',state.room.id).is('amount_cents',null)
   .select('id,amount_cents').single();
  if(r.error)throw r.error;
  state.entryFingerprint='';await loadEntries({force:true});
  show('entriesFeedback','Amount '+dollars(amount)+' assigned. Both participants can now see it.');
 }catch(e){show('entriesFeedback','Could not assign amount: '+fail(e))}
 finally{state.busy=false;submit.disabled=false;submit.textContent='PLACE MY AMOUNT'}
}
async function settle(entry){
 if(!state.isOwner||state.busy||!entry.amount_cents||entry.settled_at)return;
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
 if(ext==='heic'||ext==='heif')return{mime:'image/'+ext,ext};
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
    id,room_id:room.id,uploaded_by:state.user.id,image_path:path,
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
  state.entryFingerprint='';
  void refresh({force:true}).catch(e=>show('entriesFeedback',fail(e)));
 });
 $('closeRoomBtn').addEventListener('click',()=>void toggleRoom());
 $('copyRoomLink').addEventListener('click',()=>void copyLink());
 $('closeLightbox').addEventListener('click',closeLightbox);
 $('photoLightbox').addEventListener('click',e=>{if(e.target===$('photoLightbox'))closeLightbox()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('photoLightbox').hidden)closeLightbox()});
 document.querySelectorAll('[data-photo-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.photoFilter)));
}
void initialize();
