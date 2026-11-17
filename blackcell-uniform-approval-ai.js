/* Shared secure photo AI preview for Uniform Intelligence manual review. */
export function createUniformReviewAI({client,bucket,userId}){
async function makePreview(a){
 if(a.kind!=='photo')throw new Error('Video AI classification is not available; review videos manually.');
 if(a.owner_id!==userId)throw new Error('AI analysis requires the photograph uploader. You can manually review employee uploads.');
 const request={action:'analyze',asset_id:a.id};
 const maxDirect=10*1024*1024,allowed=new Set(['image/jpeg','image/png','image/webp','image/gif']);
 if(Number(a.bytes)>maxDirect||!allowed.has(a.mime_type)){
  let imageSource='',temporaryUrl='';
  if(a.source_provider==='world-bunny-v1'){
   const {data:sessionData,error:sessionError}=await client.auth.getSession();
   const session=sessionData?.session;
   if(sessionError||!session?.access_token)throw new Error('Corporate session expired. Sign in again.');
   const config=window.BLACKCELL_CORP_CONFIG;
   if(!config?.url||!config?.publishableKey)throw new Error('Private media endpoint is not configured.');
   const readerUrl=new URL('/functions/v1/blackcell-world-media?action=read',config.url);
   const read=await fetch(readerUrl,{method:'POST',headers:{
    'Authorization':'Bearer '+session.access_token,'apikey':config.publishableKey,'Content-Type':'application/json'
   },body:JSON.stringify({id:a.id})});
   if(!read.ok)throw new Error('Private Bunny photo unavailable for preview (HTTP '+read.status+').');
   const blob=await read.blob();
   if(!blob.type.startsWith('image/')||blob.size>45*1024*1024)throw new Error('Unsupported private image preview.');
   temporaryUrl=URL.createObjectURL(blob);imageSource=temporaryUrl;
  }else{
   const {data:signed,error}=await bucket.createSignedUrl(a.storage_path,120);
   if(error||!signed?.signedUrl)throw new Error('Could not access photo to create an AI preview.');
   imageSource=signed.signedUrl;
  }
  const img=new Image();img.crossOrigin='anonymous';
  await new Promise((resolve,reject)=>{
   img.onload=resolve;img.onerror=()=>reject(new Error('This browser cannot decode the photo. Use manual classification.'));
   img.src=imageSource;
  });
  const width=img.naturalWidth,height=img.naturalHeight,scale=Math.min(1,1600/Math.max(width,height));
  if(!width||!height)throw new Error('Original image has no readable dimensions.');
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Could not create AI preview in this browser.');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  request.preview_image=canvas.toDataURL('image/jpeg',0.72);
  canvas.width=canvas.height=1;
  if(temporaryUrl)URL.revokeObjectURL(temporaryUrl);
 }
 const {data,error}=await client.functions.invoke('blackcell-military-ai',{body:request});
 if(error){
  let reason=error.message||'AI request failed';
  try{
   const details=await error.context?.json?.();
   reason=String(details?.error||details?.detail||details?.code||reason).slice(0,220);
  }catch(_){}
  throw new Error('Photo AI suggestions unavailable: '+reason);
 }
 if(!data?.ok||!data.analysis)throw new Error(data?.error||'No suggestions were produced; use manual classification.');
 return data.analysis;
}
 return makePreview;
}
