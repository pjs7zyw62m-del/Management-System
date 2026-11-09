import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-staff1';
const client=corporateClient(),$=id=>document.getElementById(id);
let self=null,peer=null,contacts=[],isLoading=false,firstLoad=true,ready=false;
function status(text){$('systemStatus').textContent=text;$('systemStatus').hidden=!text}
function text(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=value;return el}
async function boot(){
 try{
   await client.auth.getSession();
   const member=await corporateAuthorize(client);
   if(!member.ok){status('Sign in and activate your employee account to access chat.');return}
   self=member.user.id;
   const m=member.member;
   if(m.role==='owner'){
     $('returnLink').href='dashboard.html';$('returnLink').textContent='ADMINISTRATION';
     const {data,error}=await client.rpc('corp_code_status');
     if(error||data?.ok!==true||data.verified!==true){status('Level 7 security verification required. Return to Administration and authenticate.');return}
   }else if(m.can_chat!==true){status('Chat has not been enabled for this employee account.');return}
   const {data,error}=await client.rpc('corp_chat_peers');
   if(error||data?.ok!==true||!Array.isArray(data.peers)){status('Contacts cannot be loaded. Contact your corporate administrator.');return}
   contacts=data.peers;ready=true;status('');
   client.channel('blackcell-chat-'+self)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'corp_chat_messages'},payload=>{
      const m=payload.new;
      if(m&&(m.sender_id===self||m.recipient_id===self))void loadMessages();
    }).subscribe();
   renderPeers();
   if(contacts.length)choose(contacts[0].user_id);
   else $('messages').replaceChildren(text('p','empty',m.role==='owner'?'No employees yet. Invite your first employee from User Management → Accounts.':'Your administrator is not available for chat.'));
 }catch(_){status('Could not connect to secure chat. Check your connection.')}
}
function renderPeers(){
 const box=$('peers');box.replaceChildren();
 for(const c of contacts){
   const button=document.createElement('button');button.type='button';button.className='peer'+(peer?.user_id===c.user_id?' active':'');
   button.append(text('span','avatar','B'));
   const wrap=document.createElement('span');wrap.append(text('strong','',c.display_name||'Employee'),text('small','',c.role==='owner'?'CORPORATE OWNER':'LEVEL '+c.clearance_level));
   button.append(wrap);button.onclick=()=>choose(c.user_id);box.append(button);
 }
}
function choose(userId){
 const selected=contacts.find(x=>x.user_id===userId);if(!selected||!ready)return;
 peer=selected;firstLoad=true;$('peerName').textContent=peer.display_name||'Employee';$('peerDetail').textContent=peer.role==='owner'?'LEVEL 7 · OWNER':'LEVEL '+peer.clearance_level;
 $('messageInput').disabled=false;$('sendButton').disabled=false;renderPeers();void loadMessages();
}
async function loadMessages(){
 if(!ready||!peer||isLoading||document.hidden)return;
 isLoading=true;
 try{
  const pid=peer.user_id;
  const filter='and(sender_id.eq.'+self+',recipient_id.eq.'+pid+'),and(sender_id.eq.'+pid+',recipient_id.eq.'+self+')';
  const {data,error}=await client.from('corp_chat_messages').select('id,sender_id,recipient_id,body,created_at').or(filter).order('created_at',{ascending:false}).limit(100);
  if(error){status('Messages could not be loaded.');return}
  const box=$('messages'),atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  const ordered=(data||[]).slice().reverse();
  const newest=ordered.at(-1)?.id||'empty';
  if(box.dataset.newest===newest && !firstLoad)return;
  box.dataset.newest=newest;box.replaceChildren();
  for(const m of ordered){
   const own=m.sender_id===self;
   const item=document.createElement('div');item.className='message'+(own?' mine':'');
   item.append(text('div','bubble',m.body));
   const t=document.createElement('time');t.dateTime=m.created_at;
   t.textContent=new Date(m.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
   item.append(t);box.append(item);
  }
  if(!ordered.length)box.append(text('p','empty','Private conversation started. Send the first message.'));
  if(atBottom||firstLoad)box.scrollTop=box.scrollHeight;
  firstLoad=false;status('');
 }catch(_){status('Chat connection interrupted. Retrying…')}
 finally{isLoading=false}
}
$('sendForm').addEventListener('submit',async e=>{
 e.preventDefault();const body=$('messageInput').value.trim();if(!ready||!peer||!body)return;
 const btn=$('sendButton');btn.disabled=true;status('');
 try{
  const {error}=await client.from('corp_chat_messages').insert({sender_id:self,recipient_id:peer.user_id,body});
  if(error){status('Message not sent. Check your permissions.');return}
  $('messageInput').value='';await loadMessages();
 }catch(_){status('Message not sent. Check your connection.')}
 finally{btn.disabled=false;$('messageInput').focus()}
});
// Chat interactions in the embedded window count as owner activity.
function notifyParentActivity(){
  if(window.parent!==window)window.parent.postMessage({type:'blackcell-chat-activity'},location.origin);
}
for(const evt of ['pointerdown','keydown','wheel']){
  document.addEventListener(evt,notifyParentActivity,{passive:true});
}
setInterval(()=>{if(ready)void loadMessages()},6000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready)void loadMessages()});
void boot();