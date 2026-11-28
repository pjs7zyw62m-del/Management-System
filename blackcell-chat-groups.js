/* Group messaging stays isolated from one-to-one chat state. */
export function mountChatGroups({client,context,onOpen=()=>{},onClose=()=>{}}){
 const $=id=>document.getElementById(id),root=$('bcGroupInbox'),panel=$('bcGroupPanel');if(!root||!panel)return null;
 const make=(tag,cls,t)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(t!==undefined)n.textContent=t;return n};
 const btn=(label,fn,cls='bc-group-button')=>{const n=make('button',cls,label);n.type='button';n.onclick=fn;return n};
 let groups=[],room=null,mode='closed',version=0,visible=true,loading=false,listBusy=false,lastList=0,lastThread=0,lastTyping=0,typingTimer=null,sending=false,receiptIds=new Set(),signature='',pendingSend=null,wasAtBottom=true;
 const available=()=>context().ready&&!!context().self;
 const active=()=>available()&&visible&&!document.hidden;
 const status=t=>$('bcGroupStatus').textContent=t;
 const title=t=>$('bcGroupTitle').textContent=t;
 const body=$('bcGroupBody'),form=$('bcGroupSend'),input=$('bcGroupInput'),send=$('bcGroupSendButton');
 const errors={verification_required:'Verify your BLACKCELL session.',membership_not_allowed:'These participants cannot be grouped under the current access or blocking rules.',group_unavailable:'This group is no longer available.',owner_required:'An authorized owner must remain in the group.',group_limit:'Group creation limit reached. Try tomorrow.',rate_limit:'Too many messages. Try again shortly.'};
 async function rpc(p_action,params={}){const {data,error}=await client.rpc('corp_chat_group',{p_action,...params});if(error||data?.ok!==true)throw Error(errors[data?.reason]||'Group service unavailable. Try again.');return data}
 function drawList(){
  const c=context(),search=String(c.search||'').trim().toLowerCase();
  root.hidden=!available()||c.editing||!['all','unread','known'].includes(c.filter);
  if(root.hidden)return;
  const list=$('bcGroupRows');list.replaceChildren();
  for(const g of groups.filter(g=>String(g.name).toLowerCase().includes(search)&&(c.filter!=='unread'||g.unread>0))){
   const b=btn('',()=>open(g),'bc-group-inbox-row');
   b.append(make('span','bc-group-avatar','♟'),make('span','bc-group-inbox-name',g.name),make('small','',g.available===false?'Unavailable':g.count+' members'));
   if(g.unread)b.append(make('span','bc-group-count',String(g.unread)));list.append(b)
  }
  $('bcGroupCreate').hidden=c.filter==='unread'||!!search;
 }
 async function refreshList(force=false){
  if(!active()||listBusy||(!force&&Date.now()-lastList<15000))return;
  listBusy=true;lastList=Date.now();const uid=context().self;
  try{const d=await rpc('list');if(!available()||context().self!==uid)return;const next=Array.isArray(d.groups)?d.groups:[];if(JSON.stringify(next)!==JSON.stringify(groups)){groups=next;drawList()}}catch(_){/* direct inbox remains independent */}finally{listBusy=false}
 }
 function stopTyping(){clearTimeout(typingTimer);typingTimer=null;lastTyping=0;if(room&&available())void rpc('stop_typing',{p_room:room}).catch(()=>{})}
 function resetPanel(next){version++;stopTyping();threadData=null;room=null;mode=next;receiptIds.clear();signature='';pendingSend=null;sending=false;input.value='';send.disabled=false;form.hidden=true;body.replaceChildren();status('');$('bcGroupTyping').textContent='';$('bcGroupInfo').hidden=true}
 function close(){resetPanel('closed');panel.hidden=true;onClose();void refreshList(true)}
 function start(next){resetPanel(next);panel.hidden=false;onOpen();$('bcGroupClose').focus()}
 function showCreate(){
  if(!active())return;start('create');title('New Group Chat');status('Loading eligible contacts…');const v=version;
  void rpc('contacts').then(d=>{
   if(v!==version||!active())return;status('');
   const name=make('input','bc-group-field');name.placeholder='Group name';name.maxLength=80;name.setAttribute('aria-label','Group name');body.append(name,make('p','bc-group-help','Select at least two contacts. Every group must include an authorized owner. Maximum 20 participants.'));
   const selected=new Set(),list=make('div','bc-group-contacts'),count=make('p','bc-group-help','1 participant (you)');
   for(const c of d.contacts||[]){const label=make('label','bc-group-contact'),check=make('input');check.type='checkbox';check.value=c.id;label.append(check,make('span','',c.name||'Member'),make('small','',c.owner?'Owner':''));check.onchange=()=>{if(check.checked)selected.add(c.id);else selected.delete(c.id);count.textContent=(selected.size+1)+' participants';create.disabled=selected.size<2||selected.size>19||!name.value.trim()};list.append(label)}
   const create=btn('Create Group Chat',async()=>{if(!active()||v!==version||create.disabled)return;create.disabled=true;try{const g=await rpc('create',{p_name:name.value,p_users:[...selected]});if(v!==version)return;void refreshList(true);open({id:g.id,name:name.value})}catch(e){if(v===version){status(e.message);create.disabled=false}}},'bc-group-primary');create.disabled=true;name.oninput=()=>{create.disabled=selected.size<2||selected.size>19||!name.value.trim()};body.append(list,count,create);
  }).catch(e=>{if(v===version)status(e.message)})
 }
 function open(g){
  if(!active())return;start('thread');room=g.id;title(g.name);if(g.available===false){status('Access is unavailable. You can leave this group.');body.append(btn('Leave Group',()=>void leave(),'bc-group-danger'));return}form.hidden=false;$('bcGroupInfo').hidden=false;status('Loading messages…');lastThread=0;void refreshThread();
 }
 async function leave(){if(!room||!active()||!window.confirm('Leave this group? You will no longer have access to its messages.'))return;const v=version;try{await rpc('leave',{p_room:room});if(v===version)close()}catch(e){if(v===version)status(e.message)}}
 function paintThread(d){
  title(d.name);$('bcGroupTyping').textContent=(d.typing||[]).length?d.typing.join(', ')+' '+(d.typing.length===1?'is':'are')+' typing…':'';
  const msgs=d.messages||[],sig=JSON.stringify(msgs);
  if(signature!==sig){const pinned=!signature||body.scrollHeight-body.scrollTop-body.clientHeight<80;const oldTop=body.scrollTop;signature=sig;body.replaceChildren();
   if(!msgs.length)body.append(make('p','bc-group-help','Start the group conversation.'));
   for(const m of msgs){const own=m.sender_id===context().self,row=make('div','bc-group-message'+(own?' mine':''));if(!own)row.append(make('small','bc-group-sender',m.sender_name));row.append(make('div','bc-group-bubble',m.body));const time=new Date(m.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});row.append(make('small','bc-group-time',time+(own?' · '+((m.readers||[]).length?'Read by '+m.readers.join(', '):'Sent'):'')));body.append(row)}
   if(pinned)body.scrollTop=body.scrollHeight;else body.scrollTop=oldTop;
  }
  const bounds=body.getBoundingClientRect();
  const seen=msgs.filter((m,i)=>{const n=body.querySelectorAll('.bc-group-message')[i];if(!n)return false;const r=n.getBoundingClientRect();return m.sender_id!==context().self&&!receiptIds.has(m.id)&&r.bottom>bounds.top&&r.top<bounds.bottom}).map(m=>m.id);
  if(seen.length&&active()&&mode==='thread'){const current=room,v=version;for(const id of seen)receiptIds.add(id);void rpc('read',{p_room:current,p_seen:seen}).then(()=>refreshList(true)).catch(()=>{if(v===version)for(const id of seen)receiptIds.delete(id)})}
 }
 let threadData=null;
 async function refreshThread(){
  if(!active()||mode!=='thread'||!room||loading||form.hidden)return;loading=true;lastThread=Date.now();const v=version,g=room;
  try{const d=await rpc('thread',{p_room:g});if(v!==version||!active()||mode!=='thread')return;threadData=d;paintThread(d);status('')}catch(e){if(v===version){status(e.message);if(e.message===errors.group_unavailable||e.message===errors.verification_required){body.replaceChildren();form.hidden=true;$('bcGroupTyping').textContent='';$('bcGroupInfo').hidden=true;body.append(btn('Leave Group',()=>void leave(),'bc-group-danger'));threadData=null}}}finally{loading=false}
 }
 function info(){
  if(!active()||!room||!threadData)return;stopTyping();mode='info';form.hidden=true;$('bcGroupTyping').textContent='';$('bcGroupInfo').hidden=true;body.replaceChildren();const d=threadData,v=version,g=room;
  body.append(btn('‹ Conversation',()=>{mode='thread';form.hidden=false;$('bcGroupInfo').hidden=false;signature='';void refreshThread()}),make('h3','',d.name));
  if(d.admin){const name=make('input','bc-group-field');name.value=d.name;name.maxLength=80;body.append(name,btn('Save group name',async()=>{try{await rpc('rename',{p_room:g,p_name:name.value});if(v===version){title(name.value);status('Name updated.');void refreshList(true)}}catch(e){if(v===version)status(e.message)}}))}
  for(const m of d.members||[]){const row=make('div','bc-group-contact');row.append(make('span','',m.name),make('small','',m.admin?'Group admin':''));if(d.admin&&m.id!==context().self)row.append(btn('Remove',async()=>{if(!confirm('Remove '+m.name+' from this group?'))return;try{await rpc('remove',{p_room:g,p_users:[m.id]});if(v===version){mode='thread';form.hidden=false;$('bcGroupInfo').hidden=false;signature='';void refreshThread()}}catch(e){if(v===version)status(e.message)}}));body.append(row)}
  if(d.admin)body.append(btn('Add participant',async()=>{try{const result=await rpc('contacts');if(v!==version||mode!=='info')return;const picker=make('select','bc-group-field');picker.setAttribute('aria-label','Choose participant');for(const c of result.contacts||[])if(!(d.members||[]).some(m=>m.id===c.id))picker.add(new Option(c.name,c.id));if(!picker.options.length){status('No eligible additional contacts.');return}body.append(picker,btn('Add selected member',async()=>{try{await rpc('add',{p_room:g,p_users:[picker.value]});if(v===version){mode='thread';form.hidden=false;$('bcGroupInfo').hidden=false;signature='';void refreshThread()}}catch(e){if(v===version)status(e.message)}}))}catch(e){if(v===version)status(e.message)}}));
  body.append(btn('Leave Group',()=>void leave(),'bc-group-danger'));
 }
 const uuid=()=>{if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)};
 form.onsubmit=async e=>{e.preventDefault();if(!active()||mode!=='thread'||sending||!input.value.trim())return;const v=version,g=room,value=input.value.trim();if(!pendingSend||pendingSend.body!==value)pendingSend={id:uuid(),body:value};sending=true;send.disabled=true;try{await rpc('send',{p_room:g,p_body:value,p_client:pendingSend.id});if(v===version){if(input.value.trim()===value)input.value='';pendingSend=null;body.scrollTop=body.scrollHeight;void refreshThread()}}catch(e){if(v===version)status(e.message)}finally{if(v===version){sending=false;send.disabled=false}}};
 input.addEventListener('input',()=>{if(!active()||mode!=='thread')return;if(!input.value.trim()){stopTyping();return}if(Date.now()-lastTyping>1500){lastTyping=Date.now();void rpc('typing',{p_room:room}).catch(()=>{})}clearTimeout(typingTimer);typingTimer=setTimeout(stopTyping,4000)});
 input.addEventListener('blur',stopTyping);
 $('bcGroupCreate').onclick=showCreate;$('bcGroupClose').onclick=close;$('bcGroupInfo').onclick=info;
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTyping();else{void refreshList(true);void refreshThread()}});
 const timer=setInterval(()=>{if(!available()){if(!panel.hidden){resetPanel('closed');panel.hidden=true;onClose()}groups=[];drawList();return}if(!active())return;void refreshList();if(mode==='thread'&&Date.now()-lastThread>=2000)void refreshThread()},1000);
 return {render:drawList,refresh:()=>refreshList(true),create:showCreate,setVisible(v){visible=!!v;if(!visible)stopTyping();else{void refreshList(true);void refreshThread()}},busy:()=>!panel.hidden&&!!input.value.trim(),isOpen:()=>!panel.hidden,close,dispose(){clearInterval(timer);resetPanel('closed');panel.hidden=true;groups=[];drawList()}};
}
