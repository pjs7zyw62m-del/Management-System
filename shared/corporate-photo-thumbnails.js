/* BLACKCELL private Military Library thumbnail delivery.
 * Only image preview sizes are transformed; originals, permissions, uploads and
 * download URLs are unchanged. Uses verified member Supabase Storage signing.
 * If the project has image resizing disabled, fall back to signed originals.
 * Nothing is cached persistently or exposed publicly. */
export function createPrivatePhotoThumbnails({bucket,state}){
 const cache=new Map(),pending=new Map(),jobs=[];
 const bad=new Set();
 let active=0,disabled=false,failedImages=0;
 const near=typeof IntersectionObserver==='function'
  ?new IntersectionObserver(entries=>{
    for(const entry of entries){
     if(!entry.isIntersecting)continue;
     near.unobserve(entry.target);
     const info=entry.target.__bcThumb;
     if(info)void load(entry.target,info);
    }
   },{rootMargin:'650px 0px',threshold:0.01}):null;

 function original(asset){return state.assetUrls.get(asset?.id)||''}
 function fallback(img,asset,fullUrl){
  if(!img?.isConnected)return;
  const src=fullUrl||original(asset);
  if(src&&img.src!==src)img.src=src;
 }
 function isEligible(asset){
  return asset?.kind==='photo'
    &&asset.storage_path
    &&['image/jpeg','image/png','image/webp'].includes(asset.mime_type)
    &&asset.review_status==='approved';
 }
 function paint(img,asset,fullUrl,url){
  if(!img.isConnected)return;
  if(!url){fallback(img,asset,fullUrl);return}
  let reverted=false;
  img.addEventListener('error',()=>{
   if(reverted)return;
   reverted=true;
   bad.add(asset.id);
   failedImages++;
   if(failedImages>=2){disabled=true;cache.clear()}
   fallback(img,asset,fullUrl);
  },{once:true});
  img.addEventListener('load',()=>{
   // Supabase Free plans can return a perfectly valid original image even
   // when the URL requested a 560px preview. Do not spend additional
   // signing requests for ineffective transforms once this is detected.
   if(img.naturalWidth>680){
    disabled=true;
    cache.clear();
   }
  },{once:true});
  img.src=url;
 }
 function pump(){
  while(active<4&&jobs.length){
   const job=jobs.shift();
   active++;
   void (async()=>{
    try{
     if(disabled||bad.has(job.asset.id)){job.resolve('');return}
     const {data,error}=await bucket.createSignedUrl(job.asset.storage_path,1800,{
      transform:{width:560,resize:'contain',quality:72}
     });
     if(error||!data?.signedUrl){bad.add(job.asset.id);job.resolve('');return}
     const url=data.signedUrl;
     cache.set(job.asset.id,{url,expires:Date.now()+24*60*1000});
     job.resolve(url);
    }catch(_){bad.add(job.asset.id);job.resolve('')}
    finally{active--;pump()}
   })();
  }
 }
 function signed(asset){
  const saved=cache.get(asset.id);
  if(saved&&saved.expires>Date.now())return Promise.resolve(saved.url);
  if(disabled||bad.has(asset.id))return Promise.resolve('');
  if(pending.has(asset.id))return pending.get(asset.id);
  const job=new Promise(resolve=>{jobs.push({asset,resolve});pump()});
  pending.set(asset.id,job);
  void job.finally(()=>pending.delete(asset.id));
  return job;
 }
 async function load(img,info){
  const {asset,fullUrl}=info;
  if(!img.isConnected)return;
  if(disabled||!isEligible(asset)){fallback(img,asset,fullUrl);return}
  const url=await signed(asset);
  if(!img.isConnected)return;
  if(disabled){fallback(img,asset,fullUrl);return}
  paint(img,asset,fullUrl,url);
 }
 function bind(img,asset){
  if(!img||!asset)return img;
  img.loading='lazy';
  img.decoding='async';
  img.fetchPriority='low';
  const fullUrl=original(asset);
  const info={asset,fullUrl};
  const known=cache.get(asset.id);
  if(disabled||!isEligible(asset))fallbackWhenMounted(img,fullUrl);
  else if(known&&known.expires>Date.now()){
   // Cached signed previews keep repeat gallery opens fast.
   img.addEventListener('error',()=>fallback(img,asset,fullUrl),{once:true});
   img.src=known.url;
  }else if(near){
   img.__bcThumb=info;
   near.observe(img);
  }else{
   void loadWhenMounted(img,info);
  }
  return img;
 }
 function fallbackWhenMounted(img,url){
  if(url)img.src=url;
 }
 async function loadWhenMounted(img,info){
  await Promise.resolve();
  if(img.isConnected)await load(img,info);
 }
 function reset(){
  cache.clear();bad.clear();failedImages=0;disabled=false;
 }
 return {bind,reset};
}
