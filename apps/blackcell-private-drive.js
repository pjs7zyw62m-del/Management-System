/* Private OS drive adapter: encrypted Bunny files and read/write access to legacy Supabase files.
   Browser receives no storage-zone credentials or encryption keys. */
export const PRIVATE_FILE_LIMIT=256*1024*1024;
const BUCKET='blackcell-os-files',MARK='.blackcell-folder',CHUNK=4*1024*1024;
const ok=data=>({data,error:null}),err=e=>({data:null,error:{message:String(e?.message||e||'Private drive error').slice(0,220)}});
export function createPrivateDrive(client,uid){
 const legacy=client?.storage.from(BUCKET);
 if(!client||!uid)return legacy;
 let cached=null,cacheAt=0,flight=null;const invalid=()=>{cached=null;cacheAt=0;flight=null};
 function relative(full){if(full===uid)return '';if(typeof full!=='string'||!full.startsWith(uid+'/'))throw Error('Private path denied.');const p=full.slice(uid.length+1);if(!p||p.split('/').some(s=>!s||s==='.'||s==='..'||/[\x00-\x1f\x7f\\]/.test(s)))throw Error('Invalid private path.');return p}
 async function request(action,data={},binary=null,id=null,index=null,read=false){
  const cfg=window.BLACKCELL_CORP_CONFIG;
  if(!cfg?.url||!cfg?.publishableKey)throw Error('Corporate storage configuration unavailable.');
  const {data:session,error}=await client.auth.getSession();if(error||!session?.session?.access_token)throw Error('Verify corporate access.');
  const u=new URL(cfg.url+'/functions/v1/blackcell-os-private-drive');u.searchParams.set('action',action);
  const headers={Authorization:'Bearer '+session.session.access_token,apikey:cfg.publishableKey,'Content-Type':binary?'application/octet-stream':'application/json'};
  if(binary){headers['x-bc-id']=id;headers['x-bc-index']=String(index)}
  const res=await fetch(u.href,{method:'POST',headers,body:binary||JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(95000)});
  if(read&&res.ok)return await res.blob();
  const result=await res.json().catch(()=>null);
  if(!res.ok||!result?.ok)throw Error(result?.error||'Private storage request failed ('+res.status+').');
  return result;
 }
 async function catalog(force=false){
  if(!force&&cached&&Date.now()-cacheAt<2300)return cached;if(flight)return flight;
  const current=request('list').then(r=>{cached=r.rows||[];cacheAt=Date.now();return cached});flight=current;try{return await current}finally{if(flight===current)flight=null}
 }
 function localRows(rows,prefix){
  const start=prefix?prefix+'/':'',map=new Map();
  for(const r of rows){if(!r.path.startsWith(start))continue;const rest=r.path.slice(start.length);if(!rest)continue;const slash=rest.indexOf('/'),name=slash<0?rest:rest.slice(0,slash);if(slash>=0){if(!map.has(name))map.set(name,{name,id:null,metadata:null});continue}
   map.set(name,{name,id:r.id,metadata:{size:Number(r.size_bytes)},updated_at:r.updated_at,created_at:r.updated_at,provider:'bunny',state:r.state});
  }return map
 }
 async function list(full,opts={}){
  try{const p=relative(full),rows=localRows(await catalog(),p);let offset=0;
   for(;offset<5000;offset+=100){const r=await legacy.list(full,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(r.error)throw r.error;for(const e of r.data||[]){if(!rows.has(e.name))rows.set(e.name,e)}if((r.data||[]).length<100)break}
   let merged=[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name));if(opts.search)merged=merged.filter(r=>r.name.includes(opts.search));if(opts.sortBy?.order==='desc')merged.reverse();
   return ok(merged.slice(opts.offset||0,(opts.offset||0)+(opts.limit||100)))
  }catch(e){return err(e)}
 }
 async function lookup(full){return (await request('lookup',{path:relative(full)})).row}
 async function upload(full,file,opts={}){
  let id=null;
  try{
   const path=relative(full);
   if(path.endsWith('/'+MARK)){const existing=await list(full.slice(0,-(MARK.length+1)),{limit:2});if(existing.error)throw existing.error;if(existing.data.some(r=>r.name!==MARK))throw Error('A folder already exists here.');return await legacy.upload(full,file,{...opts,upsert:false})}
   if(!file.size||file.size>PRIVATE_FILE_LIMIT)throw Error('Select a file from 1 byte through 256 MB.');
   const r=await request('start',{path,size:file.size});id=r.id;const chunkSize=r.chunkBytes;if(chunkSize!==CHUNK)throw Error('Unsupported upload chunk size.');
   for(let index=0,offset=0;offset<file.size;index++,offset+=CHUNK){const part=file.slice(offset,Math.min(file.size,offset+CHUNK));let problem;
    for(let attempt=0;attempt<3;attempt++){try{await request('chunk',{},part,id,index);problem=null;break}catch(e){problem=e;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)))}}
    if(problem)throw problem;opts.onProgress?.(Math.min(file.size,offset+part.size),file.size);
   }
   await request('finish',{id});id=null;invalid();return ok({path:full,provider:'bunny'})
  }catch(e){if(id){try{await request('cancel',{id})}catch(_){/* reservation remains until an explicit cleanup */}}invalid();return err(e)}
 }
 async function download(full){
  try{const row=await lookup(full);if(!row)return await legacy.download(full);if(row.state!=='ready')throw Error('File unavailable; retry its removal.');
   const parts=[];for(let index=0;index<Math.ceil(Number(row.size_bytes)/CHUNK);index++){let got=null;for(let attempt=0;attempt<3;attempt++){try{got=await request('read',{id:row.id,index},null,null,null,true);break}catch(e){if(attempt===2)throw e}}const expected=Math.min(CHUNK,Number(row.size_bytes)-index*CHUNK);if(!got||got.size!==expected)throw Error('Incomplete file download.');parts.push(got)}
   return ok(new Blob(parts,{type:'application/octet-stream'}))
  }catch(e){return err(e)}
 }
 async function move(from,to){
  try{const src=relative(from),dest=relative(to);if(src===dest)return ok({});const row=await lookup(from);if(row){await request('move',{id:row.id,path:dest});invalid();return ok({})}
   const sibling=await list(to.slice(0,to.lastIndexOf('/')),{search:to.split('/').at(-1),limit:100});if(sibling.error)throw sibling.error;if(sibling.data.some(r=>r.name===to.split('/').at(-1)))throw Error('Destination already exists.');
   const result=await legacy.move(from,to);invalid();return result;
  }catch(e){return err(e)}
 }
 async function remove(fulls){
  try{for(const full of fulls){const path=relative(full);if(path.endsWith('/'+MARK)){const parent=full.slice(0,-(MARK.length+1)),rows=await list(parent,{limit:2});if(rows.error)throw rows.error;if(rows.data.some(r=>r.name!==MARK))throw Error('Only an empty folder can be removed.');const r=await legacy.remove([full]);if(r.error)throw r.error;continue}
   const row=await lookup(full);if(row)await request('delete',{id:row.id});else{const r=await legacy.remove([full]);if(r.error)throw r.error}
  }invalid();return ok([])}catch(e){invalid();return err(e)}
 }
 return {list,upload,download,move,remove,connection:()=>request('status'),invalidate:invalid}
}
