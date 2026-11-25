/* REDLINE strictly private Bunny transport. Supabase authenticates users, Bunny
   holds photo bytes. Never put storage AccessKey or private media URLs in HTML. */
export const BUNNY_PREFIX='redline/v1/';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
 'image/heic':'heic','image/heif':'heif'};
const MAX=12*1024*1024;
export const isBunnyPath=path=>typeof path==='string'&&path.startsWith(BUNNY_PREFIX);
async function request(db,action,{roomId,photoId,blob=null,mime=null}){
 if(!uuid.test(roomId)||!uuid.test(photoId))throw Error('Invalid private room or photo.');
 const {data:{session},error}=await db.auth.getSession();
 if(error||!session?.access_token)throw Error('Sign in to BLACKCELL again.');
 const config=window.BLACKCELL_CORP_CONFIG||{};
 const host=db.supabaseUrl||config.url;
 const key=db.supabaseKey||config.publishableKey;
 if(typeof host!=='string'||!host.startsWith('https://')||!key)
  throw Error('Private Bunny storage is not configured.');
 const endpoint=new URL('/functions/v1/blackcell-redline-bunny',host);
 endpoint.searchParams.set('action',action);
 const headers={Authorization:'Bearer '+session.access_token,apikey:key};
 if(blob){
  headers['Content-Type']=mime||blob.type||'application/octet-stream';
  headers['x-bc-room']=roomId;headers['x-bc-photo-id']=photoId;
 }else headers['Content-Type']='application/json';
 const controller=action==='read'?new AbortController():null;
 const timeout=controller?setTimeout(()=>controller.abort(),20000):null;
 try{
 const response=await fetch(endpoint.href,{method:'POST',cache:'no-store',
  credentials:'omit',referrerPolicy:'no-referrer',headers,signal:controller?.signal,
  body:blob||JSON.stringify({room_id:roomId,photo_id:photoId})});
 if(!response.ok){
  let code;
  try{code=(await response.json()).code}catch(_){}
  throw Error('Private Bunny '+action+' failed: '+(code||response.status));
 }
 if(action==='read'){
  const value=await response.blob();
  if(!value.size||value.size>MAX)throw Error('Private Bunny photo is unavailable.');
  return value;
 }
 const value=await response.json();
 if(value?.ok!==true)throw Error('Private Bunny '+action+' was not confirmed.');
 return value;
 }finally{if(timeout!==null)clearTimeout(timeout)}
}
export async function uploadBunnyPhoto(db,roomId,userId,photoId,blob,mime){
 if(!extensions[mime]||!blob?.size||blob.size>MAX||!uuid.test(userId))
  throw Error('Unsupported photo or file too large for REDLINE.');
 const result=await request(db,'upload',{roomId,photoId,blob,mime});
 const expected=BUNNY_PREFIX+roomId+'/'+userId+'/'+photoId+'.'+extensions[mime];
 if(result.path!==expected||result.photo_id!==photoId||result.bytes!==blob.size)
  throw Error('Bunny did not confirm the correct private photo.');
 return result.path;
}
export async function readBunnyPhoto(db,roomId,photoId){
 return await request(db,'read',{roomId,photoId});
}
export async function cleanupUnpostedBunny(db,roomId,photoId){
 return await request(db,'cleanup',{roomId,photoId});
}

/* Owner-only deletion invokes server-confirmed Bunny removal. No browser
   access key, direct Bunny delete or local-only hiding is ever accepted. */
export async function deleteRedlinePhotoFile(db,roomId,photoId){
 const result=await request(db,'delete',{roomId,photoId});
 if(result?.status!=='removed'||result.photo_id!==photoId)
  throw Error('REDLINE did not confirm permanent file deletion.');
 return result;
}
