/* Account-scoped unread snapshots. Never read message bodies or mark messages read.
   Polling is independent of whether the chat iframe exists or is visible. */
export async function queryChatUnread(client,uid){
 const byPeer=new Map(),ids=new Set();let total=0;
 for(let offset=0;offset<5000;offset+=500){
  const {data,error,count}=await client.from('corp_chat_messages').select('id,sender_id',offset===0?{count:'exact'}:{}).eq('recipient_id',uid).is('read_at',null).is('deleted_at',null).order('id',{ascending:true}).range(offset,offset+499);
  if(error)throw error;
  if(offset===0)total=Number.isFinite(count)?count:0;
  for(const row of data||[]){if(!row.id||!row.sender_id||ids.has(row.id))continue;ids.add(row.id);byPeer.set(row.sender_id,(byPeer.get(row.sender_id)||0)+1)}
  if((data||[]).length<500)break;
 }
 return {total:Math.max(total,ids.size),byPeer,ids};
}
export function createChatUnreadMonitor({client,account,allowed,onChange,onNew,interval=8000}){
 let uid=null,seen=new Set(),snapshot=null,busy=false,disposed=false,generation=0;
 const empty=()=>({total:0,byPeer:new Map(),ids:new Set()});
 function reset(){generation++;uid=null;seen.clear();snapshot=null;onChange(empty())}
 async function refresh(){
  if(disposed)return;
  const current=account();
  if(!current||!allowed()){if(uid!==null||snapshot)reset();return}
  if(current!==uid){reset();uid=current}
  if(busy||document.hidden)return;
  busy=true;const seq=generation;
  try{
   const result=await queryChatUnread(client(),current);
   if(disposed||seq!==generation||account()!==current||!allowed())return;
   const initial=snapshot===null;
   const fresh=[...result.ids].filter(id=>!seen.has(id));
   for(const id of result.ids)seen.add(id);
   // Keep bounded state; only currently unread IDs matter after a full snapshot.
   if(seen.size>20000)seen=new Set(result.ids);
   const changed=initial||snapshot.total!==result.total||fresh.length||[...result.byPeer].some(([id,n])=>snapshot.byPeer.get(id)!==n)||snapshot.byPeer.size!==result.byPeer.size;
   snapshot=result;
   if(changed)onChange(result);
   if(initial?result.total>0:fresh.length>0)onNew(initial?result.total:fresh.length,initial);
  }catch(_){/* retain last confirmed unread counts on a transient connection failure */}
  finally{busy=false}
 }
 const timer=setInterval(()=>void refresh(),interval);
 const wake=()=>void refresh();
 document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);window.addEventListener('online',wake);
 return {refresh,reset,dispose(){disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);window.removeEventListener('online',wake);reset()}};
}
