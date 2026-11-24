import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-clearance5';
const $=id=>document.getElementById(id);
const make=(tag,className='',value='')=>{
 const node=document.createElement(tag);if(className)node.className=className;
 if(value!==undefined)node.textContent=value;return node;
};
const uuid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x);
const readable=x=>new Date(x).toLocaleString();
const bytes=n=>Number(n)>=1048576?(Number(n)/1048576).toFixed(1)+' MB':
 (Number(n)/1024).toFixed(0)+' KB';
let client=null,owner=null,files=[],members=[],page=0,selectedUser=null;
let selectedFile=null,pendingDelete=null,loading=false,busy=false,sequence=0,viewerUrl=null,transferBusy=false;
const thumbnails=new Map();
const notice=(msg)=>{$('notice').textContent=msg};
const revoke=()=>{
 for(const url of thumbnails.values())URL.revokeObjectURL(url);
 thumbnails.clear();
};
const clearViewer=()=>{if(viewerUrl)URL.revokeObjectURL(viewerUrl);viewerUrl=null};
function displayError(error){
 const msg=String(error?.message||error||'Operation unavailable');
 return msg.length>180?msg.slice(0,180)+'…':msg;
}
function labelMember(userId){
 const m=members.find(x=>x.user_id===userId);
 return m?.display_name||m?.username||'Member';
}
async function invoke(action,body={},binary=false){
 if(!client||!owner)throw Error('Owner access is required.');
 const {data,error}=await client.auth.getSession();
 if(error||!data?.session?.access_token||data.session.user?.id!==owner)
  throw Error('Your owner session has expired.');
 const cfg=window.BLACKCELL_CORP_CONFIG;
 if(!cfg?.url||!cfg.publishableKey)throw Error('Media service configuration unavailable.');
 const url=new URL(cfg.url+'/functions/v1/blackcell-media-oversight');
 url.searchParams.set('action',action);
 const response=await fetch(url,{
  method:'POST',headers:{'Authorization':'Bearer '+data.session.access_token,
   'apikey':cfg.publishableKey,'Content-Type':'application/json'},
  body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(90000)
 });
 if(binary&&response.ok)return response.blob();
 const answer=await response.json().catch(()=>({ok:false,error:'No server response'}));
 if(!response.ok||!answer?.ok)throw Error(answer?.error||'Media oversight unavailable ('+response.status+')');
 return answer;
}
function reset(){
 sequence++;revoke();files=[];page=0;selectedFile=null;clearViewer();
 $('gallery').replaceChildren();$('more').hidden=true;
 if($('viewDialog').open)$('viewDialog').close();
}
async function loadMembers(){
 const response=await invoke('members');
 members=Array.isArray(response.members)?response.members:[];
 const previous=selectedUser;
 const menu=$('members');menu.replaceChildren(new Option('Select a member',''));
 for(const member of members){
  const label=(member.display_name||member.username||'Member')+
   (member.active?'':' · inactive')+' · '+member.role;
  menu.add(new Option(label,member.user_id));
 }
 if(previous&&members.some(x=>x.user_id===previous))menu.value=previous;
 $('fileSummary').textContent=members.length+' members available · Select a member to inspect saved Photos.';
}
async function loadFiles(append=false){
 const who=$('members').value;
 if(!uuid(who)){reset();selectedUser=null;return}
 if(loading)return;
 if(!append){reset();selectedUser=who;}
 loading=true;$('reload').disabled=true;$('more').disabled=true;
 notice('Loading '+labelMember(who)+'’s private Photos…');
 const generation=sequence;
 try{
  const response=await invoke('files',{user_id:who,page:append?page:0});
  if(sequence!==generation||$('members').value!==who)return;
  if(append)files.push(...response.files);
  else files=Array.isArray(response.files)?response.files:[];
  if(!append)page=0;
  page++;
  renderGallery(generation);
  $('more').hidden=!response.has_more;
  $('fileSummary').textContent=labelMember(who)+' · '+files.length+
   ' photograph'+(files.length===1?'':'s')+'/videos shown'+(response.has_more?' · More available':'');
  notice('Private member Photos loaded. Opening a file is recorded in the audit log.');
 }catch(e){notice(displayError(e))}
 finally{loading=false;$('reload').disabled=false;$('more').disabled=false}
}
function thumbnail(file,box,generation){
 if(!file.mime.startsWith('image/')){
  const placeholder=box.querySelector('span');
  if(placeholder)placeholder.textContent='▶ VIDEO';
  return;
 }
 void(async()=>{
  try{
   const blob=await invoke('preview',{user_id:selectedUser,id:file.id},true);
   if(generation!==sequence||!box.isConnected||!blob?.size)return;
   const url=URL.createObjectURL(blob);
   thumbnails.set(file.id,url);
   const image=make('img');image.alt='';image.loading='lazy';image.src=url;
   box.replaceChildren(image);
  }catch(_){/* Existing photos may not have a Bunny thumbnail yet.
               The full original can still be opened for moderation. */}
 })();
}
function renderGallery(generation){
 const root=$('gallery');root.replaceChildren();
 if(!files.length){root.append(make('p','muted','No available photographs or videos in this member’s BLACKCELL Photos library.'));return}
 for(const file of files){
  const item=make('article','media');
  const preview=make('button','preview');
  preview.type='button';preview.setAttribute('aria-label','View '+file.name);
  preview.append(make('span','',file.mime.startsWith('video/')?'▶ VIDEO':'VIEW PHOTO'));
  preview.addEventListener('click',()=>void openFile(file));
  const info=make('div','details');
  const filename=make('span','filename',file.name);
  const meta=make('span','meta',bytes(file.size_bytes)+' · '+file.state);
  const open=make('button','button secondary','Inspect full media');
  open.type='button';open.addEventListener('click',()=>void openFile(file));
  const remove=make('button','button danger','Remove content');
  remove.type='button';remove.addEventListener('click',()=>confirmRemoval(file));
  info.append(filename,meta,open);
  if(file.mime.startsWith('image/')&&file.state==='ready'&&selectedUser!==owner){
   const transfer=make('button','button primary','Transfer to My Photos');
   transfer.type='button';transfer.addEventListener('click',async()=>{await openFile(file);if(selectedFile?.id===file.id&&$('viewDialog').open&&!$('transferPhoto').disabled)$('transferPhoto').focus()});
   info.append(transfer);
  }
  info.append(remove);
  item.append(preview,info);root.append(item);
  if(file.state==='ready')thumbnail(file,preview,generation);
 }
}
async function openFile(file){
 if(busy||file.state!=='ready'||selectedUser!==$('members').value)return;
 const generation=sequence;selectedFile=file;busy=true;clearViewer();
 $('viewTitle').textContent=file.name;
 $('viewInfo').textContent=labelMember(selectedUser)+' · '+bytes(file.size_bytes)+
  ' · '+file.mime+' · Updated '+readable(file.updated_at);
 $('viewer').replaceChildren(make('p','muted','Loading encrypted media for Level 7 review…'));
 $('removeFromViewer').disabled=true;
 $('transferPhoto').hidden=!file.mime.startsWith('image/')||selectedUser===owner;
 $('transferPhoto').disabled=true;$('copyShareLink').hidden=true;$('transferStatus').textContent='';
 $('viewDialog').showModal();
 try{
  const pieces=new Array(Math.ceil(Number(file.size_bytes)/4194304));
  // Cap simultaneous Edge Function calls; no proactive bulk originals.
  for(let i=0;i<pieces.length;i+=3){
   const tasks=[];
   for(let j=i;j<Math.min(i+3,pieces.length);j++){
    tasks.push(invoke('read',{user_id:selectedUser,id:file.id,index:j},true)
     .then(chunk=>{pieces[j]=chunk}));
   }
   await Promise.all(tasks);
   if(generation!==sequence||!$('viewDialog').open||selectedFile?.id!==file.id)
    return;
  }
  const blob=new Blob(pieces,{type:file.mime});viewerUrl=URL.createObjectURL(blob);
  const media=make(file.mime.startsWith('video/')?'video':'img');
  media.src=viewerUrl;
  if(media.tagName==='VIDEO'){media.controls=true;media.playsInline=true;media.preload='metadata'}
  media.alt='Media under administrative review';
  $('viewer').replaceChildren(media);
  $('removeFromViewer').disabled=false;
  $('transferPhoto').disabled=false;
 }catch(e){$('viewer').replaceChildren(make('p','muted','Unable to retrieve media: '+displayError(e)))}
 finally{busy=false}
}
async function transferSelected(){
 const file=selectedFile,target=selectedUser;
 if(transferBusy||!file?.mime.startsWith('image/')||target===owner||!$('viewDialog').open)return;
 const current=()=>selectedFile?.id===file.id&&selectedUser===target&&$('viewDialog').open;
 transferBusy=true;$('transferPhoto').disabled=true;$('copyShareLink').hidden=true;
 $('transferStatus').textContent='Saving authorized reference…';
 try{
  const result=await invoke('transfer',{user_id:target,id:file.id});
  if(current()){
   $('transferStatus').textContent=result.permission_required?'The member must authorize this photograph once. Send them the permission link.':result.already?'Already in My Photos.':'Transferred to My Photos.';
   $('copyShareLink').hidden=!result.permission_required;
  }
  if(!result.permission_required){
   try{const channel=new BroadcastChannel('bc-private-photos-transfer');channel.postMessage({type:'photos-changed',uid:owner});channel.close()}catch(_){}
   void loadAudit();
  }
 }catch(e){if(current())$('transferStatus').textContent=displayError(e)}
 finally{transferBusy=false;if(current())$('transferPhoto').disabled=false}
}
$('transferPhoto').addEventListener('click',()=>void transferSelected());
$('copyShareLink').addEventListener('click',async()=>{
 if(!selectedFile||!owner||!selectedUser||!$('viewDialog').open)return;
 const url=new URL('blackcell-photo-permission.html',location.href);
 url.searchParams.set('id',selectedFile.id);url.searchParams.set('recipient',owner);
 try{await navigator.clipboard.writeText(url.href);$('transferStatus').textContent='Permission link copied. Send it to the photograph’s owner.'}
 catch(_){$('transferStatus').textContent='Share this permission link: '+url.href}
});
function closeView(){
 if($('viewDialog').open)$('viewDialog').close();
 $('viewer').replaceChildren();clearViewer();
 selectedFile=null;
}
function confirmRemoval(file){
 if(!file||file.state!=='ready'||selectedUser!==$('members').value)return;
 pendingDelete={...file,user_id:selectedUser};
 $('deleteTarget').textContent=labelMember(selectedUser)+' / '+file.name;
 $('deleteReason').value='';$('deleteConfirm').value='';
 $('deleteStatus').textContent='Permanent deletion requires a reason and explicit confirmation.';
 $('confirmDelete').disabled=true;
 if(!$('deleteDialog').open)$('deleteDialog').showModal();
}
function cancelRemoval(){
 if($('deleteDialog').open)$('deleteDialog').close();
 pendingDelete=null;
}
function validate(){
 $('confirmDelete').disabled=busy||!pendingDelete||
  $('deleteReason').value.trim().length<8||
  $('deleteConfirm').value!=='DELETE';
}
async function removeFile(){
 const file=pendingDelete;
 if(!file||busy||file.user_id!==$('members').value)return;
 const reason=$('deleteReason').value.trim();
 if(reason.length<8||$('deleteConfirm').value!=='DELETE')return;
 busy=true;validate();
 $('deleteStatus').textContent='Deleting encrypted file and thumbnail from Bunny Storage…';
 try{
  await invoke('delete',{user_id:file.user_id,id:file.id,reason,confirm:'DELETE'});
  cancelRemoval();
  if($('viewDialog').open)closeView();
  notice('Permanently removed '+file.name+' · Moderation action recorded.');
  await loadFiles();
  await loadAudit();
 }catch(e){$('deleteStatus').textContent=displayError(e)}
 finally{busy=false;validate()}
}
async function loadAudit(){
 const root=$('auditRows');root.replaceChildren(make('p','muted','Loading audited actions…'));
 try{
  const data=await invoke('recent');
  const events=Array.isArray(data.events)?data.events:[];
  root.replaceChildren();
  if(!events.length){root.append(make('p','muted','No administrative reviews or deletions recorded yet.'));return;}
  for(const entry of events){
   const row=make('div','audit');
   row.append(make('strong','',entry.action?.replaceAll('_',' ').toUpperCase()||'ACTION'),make('span','',
    ' · '+readable(entry.occurred_at)+' · '+labelMember(entry.target_user_id)));
   if(entry.file_path)row.append(make('div','',entry.file_path));
   if(entry.reason)row.append(make('div','',entry.reason));
   row.append(make('div','',entry.outcome==='failed'?'FAILED':'Recorded'));
   root.append(row);
  }
 }catch(e){root.replaceChildren(make('p','muted',displayError(e)))}
}
$('members').addEventListener('change',()=>void loadFiles());
$('reload').addEventListener('click',()=>void loadFiles());
$('more').addEventListener('click',()=>void loadFiles(true));
$('auditRefresh').addEventListener('click',()=>void loadAudit());
$('closeView').addEventListener('click',closeView);
$('viewDialog').addEventListener('close',clearViewer);
$('removeFromViewer').addEventListener('click',()=>{if(selectedFile){const file=selectedFile;closeView();confirmRemoval(file)}});
$('closeDelete').addEventListener('click',cancelRemoval);
$('cancelDelete').addEventListener('click',cancelRemoval);
$('deleteReason').addEventListener('input',validate);
$('deleteConfirm').addEventListener('input',validate);
$('confirmDelete').addEventListener('click',()=>void removeFile());
async function init(){
 try{
  client=corporateClient();
  const access=await corporateAuthorize(client);
  if(!access.ok||access.member?.role!=='owner'||Number(access.member?.clearance_level)!==7)
   throw Error('Only the verified Level 7 owner may access Media Oversight.');
  const {data,error}=await client.rpc('corp_code_status');
  if(error||data?.ok!==true||data.verified!==true)
   throw Error('Your Level 7 security verification has expired.');
  owner=access.user?.id;
  if(!uuid(owner))throw Error('Verified owner access is required.');
  await loadMembers();
  $('workspace').hidden=false;
  notice('Media Oversight ready. Select a member to review their private Photos.');
 }catch(e){
  $('workspace').hidden=true;owner=null;
  notice(displayError(e)+' Return to BLACKCELL Administration to verify your account.');
 }
}
void init();