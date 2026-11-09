/* BLACKCELL / verified private chat live state
 * Read acknowledgements: permanent server timestamps visible to the two chat participants.
 * Typing: short-lived private database state; never reveals draft text.
 * Realtime database subscriptions + short fallback poll when the visible thread is open.
 */
export function setupCorporateChatLive({client,context,typingLabel,typingName}){
 let paneVisible=window.parent===window;
 let threadOpen=false;
 let remoteTyping=false;
 let trackedPeer=null;
 let lastTypingWrite=0;
 let stopTimer=null;
 let typingQueue=Promise.resolve();
 let disposed=false;
 let readPending=new Set();
 let reading=false;
 let writingCount=0;
 let polling=false;
 const duration=4100;
 const self=()=>context()?.self;
 const peer=()=>context()?.peer?.user_id;
 const hasThread=()=>Boolean(!disposed&&context()?.ready&&self()&&peer()&&threadOpen&&paneVisible&&!document.hidden);
 const name=()=>String(context()?.peer?.display_name||'Your contact').trim();

 function showRemote(value){
  remoteTyping=!!value&&hasThread();
  typingLabel.hidden=!remoteTyping;
  if(typingName)typingName.textContent=name()+' is typing';
 }
 function queueTyping(to,enabled){
  if(!to||!self()||disposed)return;
  typingQueue=typingQueue.catch(()=>{}).then(async()=>{
   if(disposed||!self())return;
   if(enabled){
    if(!hasThread()||peer()!==to)return;
    writingCount++;
    const {error}=await client.from('corp_chat_typing')
     .upsert({user_id:self(),peer_id:to},{onConflict:'user_id,peer_id'});
    writingCount--;
    if(error)console.warn('Blackcell typing update unavailable:',error.message);
   }else{
    const {error}=await client.from('corp_chat_typing').delete()
     .eq('user_id',self()).eq('peer_id',to);
    if(error)console.warn('Blackcell typing clear unavailable:',error.message);
   }
  });
 }
 function stopTyping(target=trackedPeer){
  if(stopTimer){clearTimeout(stopTimer);stopTimer=null}
  if(target){
   lastTypingWrite=0;
   queueTyping(target,false);
  }
 }
 function onInput(value){
  if(!hasThread())return;
  const to=peer();
  if(!String(value||'').trim()){stopTyping(to);return}
  trackedPeer=to;
  const now=Date.now();
  if(now-lastTypingWrite>1800){
   lastTypingWrite=now;
   queueTyping(to,true);
  }
  clearTimeout(stopTimer);
  stopTimer=setTimeout(()=>stopTyping(to),duration);
 }
 async function refreshRemote(){
  if(!hasThread()){showRemote(false);return}
  const currentPeer=peer(),myUser=self();
  if(polling)return;
  polling=true;
  try{
   const {data,error}=await client.from('corp_chat_typing')
    .select('user_id,peer_id,expires_at')
    .eq('user_id',currentPeer).eq('peer_id',myUser).maybeSingle();
   if(error)throw error;
   // An out-of-order query must not display typing for the wrong conversation.
   if(!hasThread()||peer()!==currentPeer)return;
   const fresh=data&&new Date(data.expires_at).getTime()>Date.now();
   showRemote(Boolean(fresh));
  }catch(_){
   if(peer()===currentPeer)showRemote(false);
  }finally{polling=false}
 }
 function onTypingChange(payload){
  const row=payload.new||payload.old||{};
  if(row.user_id!==peer()||row.peer_id!==self())return;
  // Always refetch to reject stale change events, and to handle deletes.
  void refreshRemote();
 }
 function setVisible(value){
  const was=paneVisible;
  paneVisible=!!value;
  if(!paneVisible){
   showRemote(false);
   stopTyping();
  }else if(!was){
   void refreshRemote();
  }
 }
 function setThreadOpen(value){
  threadOpen=!!value;
  if(!threadOpen){
   showRemote(false);
   stopTyping();
  }else void refreshRemote();
 }
 function onPeerChange(previous,next){
  if(previous&&previous!==next)stopTyping(previous);
  trackedPeer=next||null;
  lastTypingWrite=0;
  showRemote(false);
  if(next)void refreshRemote();
 }
 async function markRead(messages){
  if(!hasThread()||!messages?.length||reading)return;
  const pid=peer(),userId=self();
  const unread=messages.filter(m=>m.sender_id===pid&&m.recipient_id===userId
    &&!m.read_at&&!readPending.has(m.id)).map(m=>m.id);
  if(!unread.length)return;
  // Do not record reads for a minimized chat, a closed inbox, or a different thread.
  if(!hasThread()||peer()!==pid)return;
  reading=true;
  for(const id of unread)readPending.add(id);
  try{
   const {error}=await client.from('corp_chat_messages')
    .update({read_at:new Date().toISOString()})
    .in('id',unread).eq('sender_id',pid).eq('recipient_id',userId).is('read_at',null);
   if(error)throw error;
  }catch(error){
   console.warn('Blackcell receipt update unavailable:',error?.message||error);
  }finally{
   for(const id of unread)readPending.delete(id);
   reading=false;
  }
 }
 function dispose(){
  stopTyping();
  disposed=true;showRemote(false);
 }
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){showRemote(false);stopTyping()}
  else if(hasThread())void refreshRemote();
 });
 window.addEventListener('pagehide',()=>{stopTyping();showRemote(false)});
 const poller=setInterval(()=>{
  if(disposed){clearInterval(poller);return}
  if(hasThread())void refreshRemote();
 },2700);
 return {onInput,stopTyping,onTypingChange,onPeerChange,setVisible,setThreadOpen,
   markRead,refreshRemote,dispose,visible:()=>hasThread()};
}
