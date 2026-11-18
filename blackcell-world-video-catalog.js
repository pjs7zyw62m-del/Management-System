/* Private World video presentation shared by the Worlds and Video channel.
 * Never sends frames to an external AI service or changes sharing status.
 * Thumbnail JPEGs are generated once and saved privately by the media owner, and reused.
 */
export const isWorldMedia=a=>a?.source_provider==='world-bunny-v1'&&['photo','video'].includes(a.kind)&&a.purpose==='library';
export const isWorldVideo=a=>isWorldMedia(a)&&a.kind==='video';
const labels={military:'Military',police:'Law Enforcement',fire:'Fire & Rescue',medical:'Emergency Medical',security:'Corrections & Security',professional:'Aviation & Professional Uniforms',unsorted:'Uniform'};
export function worldVideoTitle(a){
 const provided=String(a?.caption||'').trim();
 if(provided&&provided!==a.filename)return provided.slice(0,180);
 const tag=(a?.military_tags||[]).find(t=>/^maf:/.test(t));
 const label=labels[tag?.slice(4)]||'Uniform';
 const date=String(a?.created_at||'').slice(0,10);
 return label+' Video'+(/^\d{4}-\d{2}-\d{2}$/.test(date)?' · '+date:'');
}
export async function readWorldMedia(client,a,{signal}={}){
 if(!isWorldMedia(a))throw Error('Not a World media asset');
 const session=(await client.auth.getSession()).data?.session;
 const config=window.BLACKCELL_CORP_CONFIG||{};
 if(!session?.access_token||!config.url||!config.publishableKey)throw Error('Sign in again to play this private video.');
 const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/blackcell-world-media?action=read',{
  signal,method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:config.publishableKey,'Content-Type':'application/json'},
  body:JSON.stringify({id:a.id})
 });
 if(!response.ok)throw Error('Private '+(a.kind==='video'?'video':'photo')+' unavailable ('+response.status+')');
 const blob=await response.blob();
 if(!blob.size||blob.size>45*1048576)throw Error('Media preview outside supported size');
 if((await client.auth.getSession()).data?.session?.user?.id!==session.user.id)throw Error('Session changed');
 return blob;
}
export async function readWorldVideo(client,a,options={}){
 if(!isWorldVideo(a))throw Error('Not a World video');
 return readWorldMedia(client,a,options);
}
export async function createWorldVideoPoster(blob,signal){
 signal?.throwIfAborted();
 const url=URL.createObjectURL(blob),video=document.createElement('video');
 video.muted=true;video.playsInline=true;video.preload='auto';
 try{
  await new Promise((resolve,reject)=>{
   let timer=setTimeout(()=>finish(Error('Preview decode timed out')),12000);
   function abort(){finish(new DOMException('Preview paused','AbortError'))}
   function finish(error){signal?.removeEventListener('abort',abort);clearTimeout(timer);video.removeEventListener('loadeddata',loaded);video.removeEventListener('error',failed);error?reject(error):resolve()}
   function loaded(){finish()}
   function failed(){finish(Error('Unsupported video preview'))}
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return}
   video.addEventListener('loadeddata',loaded,{once:true});video.addEventListener('error',failed,{once:true});video.src=url;video.load();
  });
  signal?.throwIfAborted();
  if(Number.isFinite(video.duration)&&video.duration>1){
   await new Promise(resolve=>{
    const done=()=>{signal?.removeEventListener('abort',done);clearTimeout(timer);video.removeEventListener('seeked',done);resolve()};
    const timer=setTimeout(done,2200);video.addEventListener('seeked',done,{once:true});signal?.addEventListener('abort',done,{once:true});if(signal?.aborted){done();return}
    try{video.currentTime=Math.min(video.duration*.18,4,video.duration-.1)}catch{done()}
   });
  }
  signal?.throwIfAborted();
  if(!video.videoWidth||!video.videoHeight)throw Error('No decoded frame');
  const canvas=document.createElement('canvas'),scale=Math.min(1,640/video.videoWidth,640/video.videoHeight);
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
  if(!jpeg)throw Error('Preview encoding failed');
  return jpeg;
 }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}

async function posterRequest(client,id,action,blob=null,signal){
 const session=(await client.auth.getSession()).data?.session;
 const cfg=window.BLACKCELL_CORP_CONFIG||{};
 if(!session?.access_token||!cfg.url||!cfg.publishableKey)throw Error("Corporate session required for preview");
 const write=action==="poster-write";
 const response=await fetch(cfg.url.replace(/\/$/,"")+"/functions/v1/blackcell-world-media?action="+action,{
  method:"POST",cache:"no-store",signal,
  headers:{Authorization:"Bearer "+session.access_token,apikey:cfg.publishableKey,
   "Content-Type":write?"image/jpeg":"application/json",...(write?{"x-bc-media-id":id}:{})},
  body:write?blob:JSON.stringify({id})
 });
 if(response.status===404&&!write){
  const data=await response.json().catch(()=>({}));
  if(data?.code==="POSTER_MISSING")return null;
 }
 if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(String(data?.code||"POSTER_UNAVAILABLE").slice(0,80))}
 if((await client.auth.getSession()).data?.session?.user?.id!==session.user.id)throw Error("Corporate session changed");
 return write?true:response.blob();
}
export async function saveWorldVideoPoster(client,id,jpeg,signal){
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw Error("Invalid asset id");
 if(!(jpeg instanceof Blob)||jpeg.type!=="image/jpeg"||jpeg.size<80||jpeg.size>512*1024)throw Error("Invalid poster dimensions or size");
 return posterRequest(client,id,"poster-write",jpeg,signal);
}
export async function readWorldVideoPoster(client,id,signal){
 return posterRequest(client,id,"poster",null,signal);
}
export function createWorldVideoPreviews(client){
 const cache=new Map(),queued=new Map(),controllers=new Set();
 let tail=Promise.resolve(),epoch=0,paused=false;
 function clear(){
  epoch++;
  for(const ctl of controllers)ctl.abort();
  controllers.clear();
  for(const url of cache.values())URL.revokeObjectURL(url);
  cache.clear();queued.clear();tail=Promise.resolve();
 }
 window.addEventListener("pagehide",clear);
 client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")clear()});
 function setPaused(value){
  const next=!!value;if(next===paused)return;
  paused=next;
  if(paused){epoch++;for(const ctl of controllers)ctl.abort();queued.clear();tail=Promise.resolve()}
 }
 function get(a,{posterOnly=false}={}){
  if(cache.has(a.id))return Promise.resolve(cache.get(a.id));
  // Opening the cinema suspends expensive full-video poster generation,
  // but the sidebar may still retrieve already-persisted lightweight JPEGs.
  if(paused&&!posterOnly)return Promise.reject(Error("Preview paused for playback"));
  const queueKey=a.id+(posterOnly?":poster":":full");
  if(queued.has(queueKey))return queued.get(queueKey);
  const ticket=epoch,ctl=new AbortController();controllers.add(ctl);
  const task=(async()=>{
   let jpeg=await readWorldVideoPoster(client,a.id,ctl.signal);
   if(!jpeg){
    // Never download and decode a 30 MB video while another one is playing.
    if(posterOnly||paused)throw Error("Poster not generated yet");
    const session=(await client.auth.getSession()).data?.session;
    if(a.owner_id!==session?.user?.id)throw Error("Poster pending owner generation");
    // Old videos are backfilled once by their authorized owner.
    // New uploads generate this image from the local file, no download.
    const generate=tail.then(async()=>{
     if(ticket!==epoch||paused||ctl.signal.aborted)throw Error("Preview session changed");
     const original=await readWorldVideo(client,a,{signal:ctl.signal});
     const image=await createWorldVideoPoster(original,ctl.signal);
     await saveWorldVideoPoster(client,a.id,image,ctl.signal);
     return image;
    });
    tail=generate.catch(()=>{});
    jpeg=await generate;
   }
   if(ticket!==epoch||ctl.signal.aborted||(paused&&!posterOnly))throw Error("Preview session changed");
   if(!(jpeg instanceof Blob)||!jpeg.size||jpeg.size>512*1024||!jpeg.type.startsWith("image/"))throw Error("Poster invalid");
   const url=URL.createObjectURL(jpeg);cache.set(a.id,url);return url;
  })().finally(()=>{controllers.delete(ctl);if(queued.get(queueKey)===task)queued.delete(queueKey)});
  queued.set(queueKey,task);return task;
 }
 function mount(a,img,{posterOnly=false}={}){
  const run=()=>{
   if(!img.isConnected)return;
   get(a,{posterOnly}).then(url=>{
    if(img.isConnected){img.src=url;img.hidden=false;img.removeAttribute("data-preview-unavailable")}
   }).catch(error=>{
    if(img.isConnected){img.dataset.previewUnavailable="true";img.dataset.previewReason=String(error?.message||"Preview unavailable").slice(0,90)}
   });
  };
  if(cache.has(a.id)){img.src=cache.get(a.id);img.hidden=false;return}
  if(!("IntersectionObserver" in window)){requestAnimationFrame(run);return}
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting){observer.disconnect();run()}
  },{rootMargin:"120px"});
  observer.observe(img.parentElement||img);
  setTimeout(()=>observer.disconnect(),30000);
 }
 return {mount,get,clear,setPaused};
}
