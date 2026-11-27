/* Device-local REDLINE outbox. Records are scoped to verified account, room
 and reset generation. No credentials, signed URLs or completed photo bytes. */
const DB='blackcell-redline-outbox-v1',TTL=24*60*60*1000;
let opening;
function open(){
 if(!opening)opening=new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('Persistent upload storage unavailable'));return}
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>{const d=r.result,store=d.createObjectStore('photos',{keyPath:'id'});store.createIndex('account','uid');store.createIndex('scope','scope');d.createObjectStore('leases',{keyPath:'scope'})};
  r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();opening=null};resolve(r.result)};
  r.onerror=()=>reject(r.error||Error('Could not open private upload storage'));
  r.onblocked=()=>reject(Error('Close other REDLINE tabs and retry'));
 }).catch(e=>{opening=null;throw e});
 return opening;
}
async function tx(store,mode,fn){
 const db=await open();return new Promise((resolve,reject)=>{
  const t=db.transaction(store,mode),os=t.objectStore(store);let result;
  t.oncomplete=()=>resolve(result);t.onerror=t.onabort=()=>reject(t.error||Error('Could not save upload queue'));
  try{fn(os,v=>{result=v})}catch(e){t.abort();reject(e)}
 });
}
export const makeScope=(uid,room,reset)=>[uid,room,reset||''].join('|');
export async function saveBatch(rows){return tx('photos','readwrite',os=>{for(const row of rows)os.add(row)})}
export async function remove(ids){return tx('photos','readwrite',os=>{for(const id of ids)os.delete(id)})}
export async function list(scope){return tx('photos','readonly',(os,set)=>{const r=os.index('scope').getAll(scope);r.onsuccess=()=>set(r.result.sort((a,b)=>a.created-b.created||a.order-b.order))})}
export async function prune(uid,room,scope){
 return tx('photos','readwrite',os=>{const r=os.index('account').openCursor(uid);r.onsuccess=()=>{const c=r.result;if(!c)return;const v=c.value;if(Date.now()-v.created>TTL||(v.roomId===room&&v.scope!==scope))c.delete();c.continue()}})
}
export async function clearAccount(uid){return tx('photos','readwrite',os=>{const r=os.index('account').openCursor(uid);r.onsuccess=()=>{const c=r.result;if(c){c.delete();c.continue()}}})}
async function lease(scope,token,release=false){
 return tx('leases','readwrite',(os,set)=>{const r=os.get(scope);r.onsuccess=()=>{const old=r.result;if(release){if(old?.token===token)os.delete(scope);set(true);return}if(old&&old.token!==token&&old.until>Date.now()){set(false);return}os.put({scope,token,until:Date.now()+120000});set(true)}})
}
// Web Locks release automatically on navigation; older browsers use an expiring
// device-local lease. Stable server photo IDs are the final duplicate guard.
export async function exclusive(scope,run){
 if(navigator.locks?.request)return navigator.locks.request('redline-outbox:'+scope,{ifAvailable:true},lock=>lock?run(()=>true):false);
 const token=crypto.randomUUID();if(!await lease(scope,token))return false;
 let alive=true;const pulse=setInterval(()=>{void lease(scope,token).then(ok=>{if(!ok)alive=false}).catch(()=>{alive=false})},15000);
 try{return await run(()=>alive)}finally{clearInterval(pulse);await lease(scope,token,true).catch(()=>{})}
}
