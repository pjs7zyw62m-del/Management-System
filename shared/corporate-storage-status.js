/* BLACKCELL private media storage diagnostics.
 * Member-authorized checks, no private credentials in the browser.
 * The optional 2×2 PNG probe tests upload/read/delete and leaves no library photo.
 * Stored capacity is not a purchased or provisioned quota.
 */
export function setupBlackcellStorageStatus({client,bucket,state}){
 const $=id=>document.getElementById(id);
 const message=$('bcStorageMessage'),badge=$('bcStorageBadge'),files=$('bcStorageFiles');
 const usage=$('bcStorageUsage'),refreshBtn=$('bcStorageRefresh'),testBtn=$('bcStorageTest');
 let busy=false,checkedAt=0;
 const fmt=bytes=>bytes<1048576?(bytes/1024).toFixed(1)+' KB':
  bytes<1073741824?(bytes/1048576).toFixed(1)+' MB':
  (bytes/1073741824).toFixed(2)+' GB';
 function status(label,text,good=false){
  badge.textContent=label;badge.dataset.health=good?'good':'needs-attention';
  message.textContent=text;
 }
 async function refresh({force=false}={}){
  if(busy||!state.user?.id)return;
  if(!force&&Date.now()-checkedAt<50000)return;
  refreshBtn.disabled=true;
  status('CHECKING','Checking your private storage access…');
  try{
   const {data,error}=await client.from('corp_social_assets')
    .select('id,owner_id,bytes,storage_path,kind,purpose').limit(5000);
   if(error)throw Error('Media database: '+error.message);
   const list=data||[];
   files.textContent=String(list.length)+(list.length===5000?'+' : '');
   usage.textContent=fmt(list.reduce((sum,row)=>sum+(Number(row.bytes)||0),0));
   if(list.length){
    const sample=list.find(row=>row.owner_id===state.user.id)||list[0];
    const {data:signed,error:signError}=await bucket.createSignedUrl(sample.storage_path,90);
    if(signError||!signed?.signedUrl)
     throw Error('Private file link unavailable: '+(signError?.message||'Read access denied'));
   }
   checkedAt=Date.now();
   status('CONNECTED','Private bucket accessible. '+list.length+' authorized media records found. For a complete upload/read/delete test, choose Test Storage.',true);
  }catch(error){
   status('CHECK NEEDED','Storage access check failed: '+(error?.message||'Network error'));
  }finally{refreshBtn.disabled=false}
 }
 async function test(){
  if(busy||!state.user?.id)return;
  if(!confirm('Run a private storage test? BLACKCELL will upload a tiny 2×2 test image, read it back, then delete it and its temporary record. It will not appear in your library. Continue?'))return;
  busy=true;testBtn.disabled=true;refreshBtn.disabled=true;
  let rowInserted=false,fileUploaded=false,cleanupFailure='',testFailure='';
  const id=crypto.randomUUID(),path=state.user.id+'/'+id+'.png';
  try{
   status('TESTING','1/4 Creating a small temporary test image…');
   const canvas=document.createElement('canvas');
   canvas.width=2;canvas.height=2;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('Canvas is unavailable on this browser');
   ctx.fillStyle='#1d0209';ctx.fillRect(0,0,2,2);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(
    value=>value?resolve(value):reject(Error('Unable to encode test image')),'image/png'));
   // A cover record is not a gallery item, and its ownership allows
   // the same member to clean it up under existing RLS policies.
   const {error:rowError}=await client.from('corp_social_assets').insert({
    id,owner_id:state.user.id,post_id:null,purpose:'cover',kind:'photo',
    mime_type:'image/png',filename:'storage-test.png',storage_path:path,bytes:blob.size
   });
   if(rowError)throw Error('Private metadata insert failed: '+rowError.message);
   rowInserted=true;
   status('TESTING','2/4 Uploading the temporary test image…');
   const {error:uploadError}=await bucket.upload(path,blob,{
    contentType:'image/png',cacheControl:'0',upsert:false
   });
   if(uploadError)throw Error('Upload failed: '+uploadError.message);
   fileUploaded=true;
   status('TESTING','3/4 Reading the temporary image through a private signed link…');
   const {data:signed,error:linkError}=await bucket.createSignedUrl(path,90);
   if(linkError||!signed?.signedUrl)
    throw Error('Private read authorization failed: '+(linkError?.message||'No signed URL'));
   const response=await fetch(signed.signedUrl,{cache:'no-store'});
   if(!response.ok)throw Error('Private download failed (HTTP '+response.status+')');
   const returned=await response.arrayBuffer();
   if(returned.byteLength!==blob.size)
    throw Error('Downloaded test image size did not match the original');
  }catch(error){testFailure=String(error?.message||'Unknown storage error')}
  finally{
   status('CLEANING','4/4 Removing the temporary image and record…');
   if(fileUploaded){
    const {error:deleteFile}=await bucket.remove([path]);
    if(deleteFile)cleanupFailure='Could not remove test image: '+deleteFile.message;
   }
   if(rowInserted&&!cleanupFailure){
    const {error:deleteRow}=await client.from('corp_social_assets')
     .delete().eq('id',id).eq('owner_id',state.user.id);
    if(deleteRow)cleanupFailure='Could not remove test record: '+deleteRow.message;
   }
   if(cleanupFailure||testFailure){
    status('CHECK NEEDED',(testFailure||'Storage test completed')+
     (cleanupFailure?' · Cleanup issue: '+cleanupFailure:'')+'. The existing library was not altered.');
   }else{
    status('VERIFIED','Upload → private download → cleanup all passed on this device.',true);
   }
   busy=false;testBtn.disabled=false;refreshBtn.disabled=false;
   checkedAt=0;
  }
 }
 refreshBtn.addEventListener('click',()=>void refresh({force:true}));
 testBtn.addEventListener('click',()=>void test());
 return {refresh};
}
