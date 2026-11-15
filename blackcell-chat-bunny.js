/* Draft direct Bunny chat transport: Supabase authorizes, Bunny delivers.
   No storage passwords or token signing keys in this client. */
export function createChatBunnyTransport(client){
 async function session(){
  const {data:{session},error}=await client.auth.getSession();
  if(error||!session?.access_token)throw Error('Sign in again to access private media.');
  const base=String(client.supabaseUrl||'').replace(/\/$/,'');
  const key=String(client.supabaseKey||'');
  if(!base||!key)throw Error('Private media configuration unavailable.');
  return {endpoint:base+'/functions/v1/blackcell-chat-bunny',token:session.access_token,key};
 }
 async function links(ids){
  if(!ids.length||ids.length>4)throw Error('Invalid attachment selection.');
  const s=await session();
  const r=await fetch(s.endpoint+'?action=links',{method:'POST',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',headers:{Authorization:'Bearer '+s.token,apikey:s.key,'Content-Type':'application/json'},body:JSON.stringify({ids})});
  const d=await r.json();
  if(!r.ok||!d.ok)throw Error(d.code||'Private media unavailable.');
  return new Map((d.links||[]).filter(x=>ids.includes(x.id)&&/^https:\/\/[a-z0-9-]+\.b-cdn\.net\//i.test(x.signedUrl)).map(x=>[x.id,x.signedUrl]));
 }
 async function link(id){const url=(await links([id])).get(id);if(!url)throw Error('Attachment unavailable.');return url}
 async function upload(file,batch,order,mime,onProgress){
  const s=await session();
  return new Promise((resolve,reject)=>{
   const xhr=new XMLHttpRequest();xhr.timeout=180000;
   xhr.open('POST',s.endpoint+'?action=upload',true);
   xhr.setRequestHeader('Authorization','Bearer '+s.token);
   xhr.setRequestHeader('apikey',s.key);
   xhr.setRequestHeader('Content-Type',mime);
   xhr.setRequestHeader('x-bc-batch',batch);
   xhr.setRequestHeader('x-bc-order',String(order));
   xhr.setRequestHeader('x-bc-filename',encodeURIComponent(file.name.slice(0,180)));
   xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.min(file.size,e.loaded))};
   xhr.onerror=()=>reject(Error('Media upload network error.'));
   xhr.ontimeout=()=>reject(Error('Media upload timed out; verify the conversation before retrying.'));
   xhr.onabort=()=>reject(Error('Media upload interrupted.'));
   xhr.onload=()=>{try{const d=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300||!d.ok||!d.record?.id||d.record.batch_id!==batch||Number(d.record.bytes)!==file.size)throw Error(d.code||'Bunny upload not confirmed.');resolve(d.record)}catch(e){reject(e)}};
   xhr.send(file);
  });
 }
 return {link,links,upload};
}
