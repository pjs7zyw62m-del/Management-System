/* OMEGA / Owner-authorized Bunny preview transport.
 * Uses existing World Media Edge reader. No Bunny keys or public URLs are exposed.
 * Gallery thumbnails are downsampled in the browser; full originals load on selection. */
export const isWorldMedia=a=>a?.source_provider==="world-bunny-v1"&&a?.purpose==="library";
export function createOmegaMediaReader(client){
 const thumbnails=new Map(),inFlight=new Map(),max=48*1024*1024;
 async function read(a,signal){
  if(!isWorldMedia(a)||!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(String(a.id||"")))throw Error("Invalid world media reference");
  const cfg=window.BLACKCELL_CORP_CONFIG||{};
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.url||"")||!cfg.publishableKey)throw Error("Media service not configured");
  const {data,error}=await client.auth.getSession(),token=data?.session?.access_token;
  if(error||!token)throw Error("Corporate login required");
  const url=new URL("/functions/v1/blackcell-world-media?action=read",cfg.url);
  const response=await fetch(url.href,{
   method:"POST",headers:{Authorization:"Bearer "+token,apikey:cfg.publishableKey,"Content-Type":"application/json"},
   body:JSON.stringify({id:a.id}),cache:"no-store",credentials:"omit",signal
  });
  if(!response.ok){
   let code="ACCESS_UNAVAILABLE";
   try{code=String((await response.json())?.code||code).slice(0,90)}catch{}
   throw Error("Private Bunny reader: "+code);
  }
  const type=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
  const allowed=a.kind==="photo"?["image/jpeg","image/png","image/webp","image/gif","image/heic"]:
   ["video/mp4","video/webm","video/quicktime","video/x-m4v"];
  if(!allowed.includes(type))throw Error("Invalid media format");
  const blob=await response.blob();
  if(blob.size<1||blob.size>max)throw Error("Private file size unsupported");
  return blob;
 }
 async function downsample(blob){
  const source=URL.createObjectURL(blob);
  let bitmap=null,img=null,canvas=null;
  try{
   let w=0,h=0;
   if(typeof createImageBitmap==="function"){
    try{bitmap=await createImageBitmap(blob);w=bitmap.width;h=bitmap.height}catch{}
   }
   if(!bitmap){img=new Image();img.src=source;await img.decode();w=img.naturalWidth;h=img.naturalHeight}
   if(w<1||h<1)throw Error("Invalid image dimensions");
   const scale=Math.min(1,640/Math.max(w,h));
   canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx)throw Error("Image preview unavailable");
   ctx.drawImage(bitmap||img,0,0,canvas.width,canvas.height);
   const tiny=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.83));
   if(!tiny?.size)throw Error("Image preview encoding failed");
   return URL.createObjectURL(tiny);
  }finally{
   try{bitmap?.close()}catch{}
   if(canvas)canvas.width=canvas.height=1;
   URL.revokeObjectURL(source);
  }
 }
 async function thumbnail(a,signal){
  if(!isWorldMedia(a)||a.kind!=="photo")return "";
  if(thumbnails.has(a.id))return thumbnails.get(a.id);
  if(inFlight.has(a.id))return inFlight.get(a.id);
  const promise=(async()=>{
   const image=await read(a,signal);
   if(signal?.aborted)throw Error("Cancelled");
   const url=await downsample(image);
   if(signal?.aborted){URL.revokeObjectURL(url);throw Error("Cancelled")}
   thumbnails.set(a.id,url);
   return url;
  })().finally(()=>inFlight.delete(a.id));
  inFlight.set(a.id,promise);return promise;
 }
 async function original(a,signal){const blob=await read(a,signal);if(signal?.aborted)throw Error("Cancelled");return URL.createObjectURL(blob)}
 function dispose(){for(const url of thumbnails.values())URL.revokeObjectURL(url);thumbnails.clear();inFlight.clear()}
 return {thumbnail,original,dispose};
}
