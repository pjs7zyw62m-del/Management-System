/* BLACKCELL Photo Fingerprints — exact SHA-256 + resize/recompression dHash
 * No external AI billing. No automatic deletion. Duplicate matches are suggestions.
 * Authenticated Supabase/RLS; fingerprints are visible only to verified members.
 */
const EMPTY='0000000000000000';
const HEX=/^[0-9a-f]{16}$/;
function bitsApart(a,b){
 if(!HEX.test(String(a||''))||!HEX.test(String(b||''))||a===EMPTY||b===EMPTY)return 65;
 let n=BigInt('0x'+a)^BigInt('0x'+b),count=0;
 while(n){count++;n&=n-1n}
 return count;
}
async function fileImage(file){
 if(typeof createImageBitmap==='function'){
  try{const image=await createImageBitmap(file,{imageOrientation:'from-image'});return {image,release:()=>image.close()}}
  catch(_){}
 }
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise((ok,bad)=>{
   const img=new Image();img.onload=()=>ok(img);img.onerror=()=>bad(Error('Photo preview unsupported'));img.src=url;
  });
  return {image,release:()=>URL.revokeObjectURL(url)};
 }catch(e){URL.revokeObjectURL(url);throw e}
}
export async function calculatePhotoFingerprint(file){
 if(!file||!file.size||file.size>46*1024*1024)throw Error('Invalid photo size');
 if(!globalThis.crypto?.subtle)throw Error('Secure browser required for duplicate scanning');
 const sha=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 const sha256=Array.from(new Uint8Array(sha),b=>b.toString(16).padStart(2,'0')).join('');
 let dhash=EMPTY,width=0,height=0;
 try{
  const {image,release}=await fileImage(file);
  try{
   width=image.width||image.naturalWidth;height=image.height||image.naturalHeight;
   const canvas=document.createElement('canvas');canvas.width=9;canvas.height=8;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas unsupported');
   ctx.drawImage(image,0,0,9,8);
   const rgba=ctx.getImageData(0,0,9,8).data;
   let bits=0n;
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const i=(y*9+x)*4,j=i+4;
    const left=rgba[i]*.299+rgba[i+1]*.587+rgba[i+2]*.114;
    const right=rgba[j]*.299+rgba[j+1]*.587+rgba[j+2]*.114;
    bits=(bits<<1n)|BigInt(left>right?1:0);
   }
   dhash=bits.toString(16).padStart(16,'0');
  }finally{release()}
 }catch(_){ /* Exact SHA-256 still available when browser cannot decode HEIC. */ }
 return {sha256,dhash,width:width||1,height:height||1};
}
export function comparePhotoFingerprint(a,b){
 if(a.sha256&&a.sha256===b.sha256)return {type:'exact',distance:0};
 const distance=bitsApart(a.dhash,b.dhash);
 if(distance>6)return null;
 if(a.width<=1||a.height<=1||b.width<=1||b.height<=1)return null;
 const aspect=a.width/a.height,other=b.width/b.height;
 if(Math.max(aspect,other)/Math.min(aspect,other)>1.08)return null;
 return {type:'possible',distance};
}
export function createPhotoDedupe({client,state,mediaUrl,toast}){
 let entries=[],loaded=false;
 const owned=asset=>asset?.owner_id===state.user?.id&&asset?.kind==='photo';
 async function load(){
  if(!state.user)return;
  const {data,error}=await client.from('corp_social_photo_fingerprints')
   .select('asset_id,owner_id,sha256,dhash,width,height').limit(3000);
  if(error){console.warn('Duplicate index unavailable:',error.message);return false}
  entries=data||[];loaded=true;return true;
 }
 async function preflight(file){
  const fingerprint=await calculatePhotoFingerprint(file);
  if(!loaded)await load();
  const matches=entries.map(e=>({asset_id:e.asset_id,...compareOrEmpty(fingerprint,e)}))
   .filter(e=>e.type).sort((a,b)=>a.type==='exact'?-1:b.type==='exact'?1:a.distance-b.distance);
  return {fingerprint,matches};
 }
 function compareOrEmpty(a,b){return comparePhotoFingerprint(a,b)||{}}
 function nameOf(id){
  const asset=state.assets.find(a=>a.id===id);
  return asset?.filename||'Another member photo';
 }
 async function record(asset,fingerprint){
  if(!owned(asset))return false;
  const row={asset_id:asset.id,owner_id:asset.owner_id,...fingerprint};
  const {error}=await client.from('corp_social_photo_fingerprints')
   .upsert(row,{onConflict:'asset_id'});
  if(error){console.warn('Photo fingerprint could not save:',error.message);return false}
  entries=entries.filter(x=>x.asset_id!==asset.id);
  entries.push(row);loaded=true;return true;
 }
 async function indexExisting({onProgress}={}){
  if(!loaded&&!(await load()))throw Error('Private fingerprint database unavailable');
  const pending=state.assets.filter(a=>owned(a)&&['library','post'].includes(a.purpose)&&mediaUrl(a)&&
   !entries.some(x=>x.asset_id===a.id)).slice(0,100);
  let saved=0,skipped=0,failed=0;
  const flagged=[];
  for(let i=0;i<pending.length;i++){
   const asset=pending[i];
   try{
    const response=await fetch(mediaUrl(asset),{method:'GET',cache:'no-store'});
    if(!response.ok)throw Error('Photo access denied');
    const blob=await response.blob();
    if(blob.size>46*1024*1024)throw Error('File too large');
    const file=new File([blob],asset.filename||'photo.jpg',{type:blob.type||asset.mime_type||'image/jpeg'});
    const {fingerprint,matches}=await preflight(file);
    const hit=matches.find(m=>m.asset_id!==asset.id);
    if(hit)flagged.push({asset_id:asset.id,filename:asset.filename,match_asset_id:hit.asset_id,match_name:nameOf(hit.asset_id),type:hit.type});
    if(await record(asset,fingerprint))saved++;else failed++;
   }catch(e){failed++;console.warn('Could not fingerprint '+asset.filename,e?.message)}
   if(onProgress)onProgress({processed:i+1,total:pending.length,saved,failed,flagged:flagged.length});
   if((i+1)%5===0)await new Promise(r=>setTimeout(r,0));
  }
  if(!pending.length)skipped=entries.length;
  return {saved,failed,skipped,pending:pending.length,flagged};
 }
 return {load,preflight,record,indexExisting,nameOf,comparePhotoFingerprint};
}
