import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-staff1';
import {setupCorporateMedia} from './corporate-chat-media.js?v=20261109-media-bubbles3';
const client=corporateClient(),$=id=>document.getElementById(id);
const embedParams=new URLSearchParams(location.search);
const mediaPanelMode=['share','library'].includes(embedParams.get('mediaPanel'))?embedParams.get('mediaPanel'):null;
if(embedParams.get('embed')==='1')document.documentElement.classList.add('bc-embedded');
const compactChat=embedParams.get('embed')==='1'&&!mediaPanelMode;
if(compactChat)document.documentElement.classList.add('bc-compact-chat');
if(mediaPanelMode)document.documentElement.classList.add('bc-media-panel','bc-media-'+mediaPanelMode);
if(!mediaPanelMode&&window.parent===window&&window.BlackcellMediaBubbleHost)
 window.BlackcellMediaBubbleHostController=window.BlackcellMediaBubbleHost({mode:'standalone'});
let self=null,peer=null,contacts=[],isLoading=false,firstLoad=true,ready=false;
let inboxSummaries=new Map();
let employeeSession=false,sessionEnded=false,lastActivity=Date.now(),lastTouch=Date.now();
const IDLE_LIMIT_MS=60*60*1000;
async function endChatAccess(reason){
 if(sessionEnded)return;
 sessionEnded=true;ready=false;employeeSession=false;
 $('messageInput').disabled=true;$('sendButton').disabled=true;
 status(reason);
 try{await client.rpc('corp_employee_end_session')}catch(_){}
 try{await client.auth.signOut({scope:'local'})}catch(_){}
 $('returnLink').href='employee.html';$('returnLink').textContent='SIGN IN AGAIN';
}
function chatActivity(){
 if(sessionEnded)return;
 if(window.parent!==window)
  window.parent.postMessage({type:'blackcell-chat-activity'},location.origin);
 if(!employeeSession)return;
 if(Date.now()-lastActivity>=IDLE_LIMIT_MS){
  void endChatAccess('Signed out after 60 minutes of inactivity.');return;
 }
 lastActivity=Date.now();
 if(Date.now()-lastTouch>60000){
  lastTouch=Date.now();
  void client.rpc('corp_employee_touch_session').then(({data,error})=>{
   if(error||data?.ok!==true)void endChatAccess('Your employee session expired. Sign in again.');
  }).catch(()=>void endChatAccess('Security session could not be checked.'));
 }
}

function status(text){$('systemStatus').textContent=text;$('systemStatus').hidden=!text}
const sharedMedia=setupCorporateMedia({client,context:()=>({self,peer,ready}),reloadMessages:loadMessages,status});
const mediaControls=document.querySelector('.media-actions');
const mediaToggle=$('mediaToggleButton');
mediaToggle.addEventListener('click',()=>{
 const collapsed=mediaControls.classList.toggle('is-collapsed');
 mediaToggle.setAttribute('aria-expanded',String(!collapsed));
 mediaToggle.classList.toggle('open',!collapsed);
});
if(compactChat){
 mediaControls.classList.add('is-collapsed');
 mediaToggle.setAttribute('aria-expanded','false');
 mediaToggle.classList.remove('open');
}else mediaToggle.classList.add('open');
$('peerSearch').addEventListener('input',renderPeers);
$('backToInbox').addEventListener('click',()=>{
 if(!compactChat)return;
 document.querySelector('.chat').classList.remove('bc-thread-active');
 document.querySelector('.media-actions')?.classList.add('is-collapsed');
 $('mediaToggleButton').setAttribute('aria-expanded','false');
 $('mediaToggleButton').classList.remove('open');
 if(window.parent!==window)window.parent.postMessage({type:'blackcell-chat-inbox-open'},location.origin);
 void refreshInboxSummaries();
});
const composerText=$('messageInput');
function resizeComposer(){composerText.style.height='auto';composerText.style.height=Math.min(composerText.scrollHeight,112)+'px'}
composerText.addEventListener('input',resizeComposer);
composerText.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!composerText.disabled)$('sendForm').requestSubmit()}
});
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
   }else if(m.role==='employee'){
     if(m.can_chat!==true){status('Chat is not enabled for your employee account.');return}
     const {data:employeeStatus,error:employeeError}=await client.rpc('corp_employee_code_status');
     if(employeeError||employeeStatus?.ok!==true||employeeStatus?.verified!==true){
       $('returnLink').href='employee.html';$('returnLink').textContent='VERIFY EMPLOYEE CARD';
       status('Verify your 4-digit Access Code and Security Code on your employee card first.');
       return;
     }
     employeeSession=true;lastActivity=Date.now();lastTouch=Date.now();
   }else{status('This account cannot access Employee Chat.');return}
   const {data,error}=await client.rpc('corp_chat_peers');
   if(error||data?.ok!==true||!Array.isArray(data.peers)){status('Contacts cannot be loaded. Contact your corporate administrator.');return}
   contacts=data.peers;ready=true;status('');
   client.channel('blackcell-chat-'+self)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'corp_chat_messages'},payload=>{
      const m=payload.new;
      if(m&&(m.sender_id===self||m.recipient_id===self)){void loadMessages();void refreshInboxSummaries()}
    }).subscribe();
   renderPeers();
   void refreshInboxSummaries();
   if(contacts.length){
     const requested=embedParams.get('peer');
     if(!compactChat||requested&&contacts.some(x=>x.user_id===requested))
      choose(contacts.some(x=>x.user_id===requested)?requested:contacts[0].user_id);
     if(mediaPanelMode==='share')sharedMedia.openShare();
     else if(mediaPanelMode==='library'){
       const batch=embedParams.get('batch');
       if(batch&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batch))
        void sharedMedia.openBatch(batch);
       else void sharedMedia.openLibrary();
     }
   }
   else $('messages').replaceChildren(text('p','empty',m.role==='owner'?'No employees yet. Invite your first employee from User Management → Accounts.':'Your administrator is not available for chat.'));
 }catch(_){status('Could not connect to secure chat. Check your connection.')}
}
function formatChatDay(date){
 const today=new Date(),yesterday=new Date();
 yesterday.setDate(today.getDate()-1);
 if(date.toDateString()===today.toDateString())return 'TODAY';
 if(date.toDateString()===yesterday.toDateString())return 'YESTERDAY';
 return date.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
}
function isBubbleNeighbor(first,second){
 if(!first||!second)return false;
 if(first.sender_id!==second.sender_id||first.media_batch_id||second.media_batch_id)return false;
 const a=new Date(first.created_at),b=new Date(second.created_at);
 return a.toDateString()===b.toDateString()&&(b.getTime()-a.getTime())<=5*60*1000;
}
async function refreshInboxSummaries(){
 if(!ready||!self)return;
 try{
  const {data,error}=await client.from('corp_chat_messages')
   .select('sender_id,recipient_id,body,media_batch_id,created_at')
   .or('sender_id.eq.'+self+',recipient_id.eq.'+self)
   .order('created_at',{ascending:false}).limit(180);
  if(error)return;
  const summaries=new Map();
  for(const message of data||[]){
   const other=message.sender_id===self?message.recipient_id:message.sender_id;
   if(other===self||summaries.has(other))continue;
   summaries.set(other,{
    preview:message.media_batch_id?'▧ Photo or video collection':String(message.body||'').slice(0,120),
    when:message.created_at
   });
  }
  inboxSummaries=summaries;renderPeers();
 }catch(_){}
}
function renderPeers(){
 const box=$('peers');box.replaceChildren();
 const query=$('peerSearch').value.trim().toLowerCase();
 const visible=contacts.filter(c=>(String(c.display_name||'')+' '+String(c.role||'')).toLowerCase().includes(query))
  .sort((a,b)=>new Date(inboxSummaries.get(b.user_id)?.when||0)-new Date(inboxSummaries.get(a.user_id)?.when||0));
 $('contactCount').textContent=String(contacts.length);
 if(!visible.length){box.append(text('p','empty',query?'No matching contacts.':'No authorized contacts.'));return}
 for(const c of visible){
   const button=document.createElement('button');button.type='button';button.className='peer'+(peer?.user_id===c.user_id?' active':'');
   const initial=String(c.display_name||'B').trim().slice(0,1).toUpperCase();
   button.append(text('span','avatar',initial));
   const wrap=document.createElement('span');
   wrap.append(text('strong','',c.display_name||'Employee'),text('small','',c.role==='owner'?'CORPORATE OWNER':'LEVEL '+c.clearance_level));
   const summary=inboxSummaries.get(c.user_id);
   wrap.append(text('span','peer-preview',summary?.preview||'Start a private conversation'));
   button.append(wrap);
   if(summary?.when){
    const time=document.createElement('time');time.className='peer-meta';
    time.dateTime=summary.when;
    time.textContent=new Date(summary.when).toLocaleDateString([],{month:'short',day:'numeric'});
    button.append(time);
   }
   button.onclick=()=>choose(c.user_id);box.append(button);
 }
}
function choose(userId){
 const selected=contacts.find(x=>x.user_id===userId);if(!selected||!ready)return;
 peer=selected;sharedMedia.onPeerChange(userId);firstLoad=true;
 if(compactChat)document.querySelector('.chat').classList.add('bc-thread-active');
 if(window.parent!==window)window.parent.postMessage({type:'blackcell-chat-conversation',peerId:userId,name:peer.display_name||'Employee'},location.origin);$('peerName').textContent=peer.display_name||'Employee';$('peerDetail').textContent=peer.role==='owner'?'LEVEL 7 · OWNER':'LEVEL '+peer.clearance_level;
 $('imessagePortrait').textContent=String(peer.display_name||'B').trim().slice(0,1).toUpperCase();
 $('peerProfileLink').href='corporate-network.html?user='+encodeURIComponent(userId);
 $('peerProfileLink').hidden=false;
 $('messageInput').disabled=false;$('sendButton').disabled=false;renderPeers();void loadMessages();
}
async function loadMessages(){
 if(!ready||!peer||isLoading||document.hidden)return;
 isLoading=true;
 try{
  const pid=peer.user_id;
  const filter='and(sender_id.eq.'+self+',recipient_id.eq.'+pid+'),and(sender_id.eq.'+pid+',recipient_id.eq.'+self+')';
  const {data,error}=await client.from('corp_chat_messages').select('id,sender_id,recipient_id,body,created_at,media_batch_id').or(filter).order('created_at',{ascending:false}).limit(100);
  if(error){status('Messages could not be loaded.');return}
  const box=$('messages'),atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  const ordered=(data||[]).slice().reverse();
  const newest=ordered.at(-1)?.id||'empty',oldNewest=box.dataset.newest;
  if(oldNewest===newest && !firstLoad)return;
  box.dataset.newest=newest;box.replaceChildren();
  let currentDay='';
  for(let i=0;i<ordered.length;i++){
   const m=ordered[i],previous=ordered[i-1],next=ordered[i+1];
   const own=m.sender_id===self,when=new Date(m.created_at);
   const day=when.toDateString();
   if(day!==currentDay){
    currentDay=day;
    const separator=text('div','chat-day-separator',formatChatDay(when));
    separator.setAttribute('role','separator');box.append(separator);
   }
   const pairedBefore=isBubbleNeighbor(previous,m),pairedAfter=isBubbleNeighbor(m,next);
   const group=pairedBefore?(pairedAfter?'group-middle':'group-end'):(pairedAfter?'group-start':'group-single');
   const item=document.createElement('div');
   item.className='message '+group+(own?' mine':'')+(m.media_batch_id?' message-media':'');
   if(!firstLoad&&oldNewest!==newest&&m.id===newest)item.classList.add('message-fresh');
   const bubble=m.media_batch_id?sharedMedia.renderMediaBubble(m,own):text('div','bubble',m.body);
   if(!m.media_batch_id){
    bubble.tabIndex=0;
    bubble.title='Sent '+when.toLocaleString()+' · Tap to show the time';
    const reveal=()=>item.classList.toggle('show-time');
    bubble.addEventListener('click',reveal);
    bubble.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();reveal()}});
   }
   item.append(bubble);
   const t=document.createElement('time');
   t.dateTime=m.created_at;t.textContent=when.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
   t.title=when.toLocaleString();
   if(pairedAfter&&!m.media_batch_id)t.classList.add('group-time');
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
  $('messageInput').value='';resizeComposer();await loadMessages();
 }catch(_){status('Message not sent. Check your connection.')}
 finally{btn.disabled=false;$('messageInput').focus()}
});
// Only actual user input extends security sessions. Polling does not.
for(const evt of ['pointerdown','keydown','wheel','touchstart']){
 document.addEventListener(evt,chatActivity,{passive:true});
}
setInterval(()=>{if(ready){void loadMessages();if(compactChat)void refreshInboxSummaries()}},12000);
setInterval(()=>{
 if(employeeSession&&!sessionEnded&&Date.now()-lastActivity>=IDLE_LIMIT_MS)
  void endChatAccess('Signed out after 60 minutes of inactivity.');
},15000);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden||!ready)return;
 if(employeeSession){
  if(Date.now()-lastActivity>=IDLE_LIMIT_MS){void endChatAccess('Signed out after 60 minutes of inactivity.');return}
  void client.rpc('corp_employee_code_status').then(({data,error})=>{
   if(error||data?.verified!==true)void endChatAccess('Employee code verification expired.');
   else void loadMessages();
  }).catch(()=>void endChatAccess('Employee session check failed.'));
 }else void loadMessages();
});

window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent)return;
 if(event.data?.type==='blackcell-select-peer'&&ready){
  const id=event.data.peerId;
  if(typeof id==='string'&&contacts.some(x=>x.user_id===id))choose(id);
 }
});
void boot();