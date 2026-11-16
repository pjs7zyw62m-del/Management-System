/* Private World video presentation shared by the Worlds and Video channel.
 * Never sends frames to an external AI service or changes sharing status.
 * Preview frames are generated on-device and kept only in this page's memory.
 */
export const isWorldVideo=a=>a?.source_provider==='world-bunny-v1'&&a.kind==='video'&&a.purpose==='library';
const labels={military:'Military',police:'Law Enforcement',fire:'Fire & Rescue',medical:'Emergency Medical',security:'Corrections & Security',professional:'Aviation & Professional Uniforms',unsorted:'Uniform'};
export function worldVideoTitle(a){
 const provided=String(a?.caption||'').trim();
 if(provided&&provided!==a.filename)return provided.slice(0,180);
 const tag=(a?.military_tags||[]).find(t=>/^maf:/.test(t));
 const label=labels[tag?.slice(4)]||'Uniform';
 const date=String(a?.created_at||'').slice(0,10);
 return label+' Video'+(/^\d{4}-\d{2}-\d{2}$/.test(date)?' · '+date:'');
}
export async function worldPlaybackUrl(client,a){
 if(!isWorldVideo(a))throw Error('Not a World video');
 const session=(await client.auth.getSession()).data?.session,config=window.BLACKCELL_CORP_CONFIG||{};
 if(!session?.access_token||!config.url||!config.publishableKey)throw Error('Sign in again to play this private video.');
 const endpoint=config.url.replace(/\/$/,'')+'/functions/v1/blackcell-world-playback';
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({id:a.id}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Secure playback unavailable ('+response.status+')');
 const result=await response.json();if(typeof result.ticket!=='string'||!result.ticket)throw Error('Playback ticket unavailable');
 if((await client.auth.getSession()).data?.session?.user?.id!==session.user.id)throw Error('Session changed');
 const url=new URL(endpoint);url.searchParams.set('ticket',result.ticket);return url.href;
}
export async function readWorldVideo(client,a){
 if(!isWorldVideo(a))throw Error('Not a World video');
 const session=(await client.auth.getSession()).data?.session;
 const config=window.BLACKCELL_CORP_CONFIG||{};
 if(!session?.access_token||!config.url||!config.publishableKey)throw Error('Sign in again to play this private video.');
 const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/blackcell-world-media?action=read',{
  method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:config.publishableKey,'Content-Type':'application/json'},
  body:JSON.stringify({id:a.id})
 });
 if(!response.ok)throw Error('Private video unavailable ('+response.status+')');
 const blob=await response.blob();
 if(!blob.size||blob.size>45*1048576)throw Error('Video preview outside supported size');
 if((await client.auth.getSession()).data?.session?.user?.id!==session.user.id)throw Error('Session changed');
 return blob;
}
async function frameFromBlob(blob){
 const url=URL.createObjectURL(blob),video=document.createElement('video');
 video.muted=true;video.playsInline=true;video.preload='auto';
 try{
  await new Promise((resolve,reject)=>{
   let timer=setTimeout(()=>finish(Error('Preview decode timed out')),12000);
   function finish(error){clearTimeout(timer);video.removeEventListener('loadeddata',loaded);video.removeEventListener('error',failed);error?reject(error):resolve()}
   function loaded(){finish()}
   function failed(){finish(Error('Unsupported video preview'))}
   video.addEventListener('loadeddata',loaded,{once:true});video.addEventListener('error',failed,{once:true});video.src=url;video.load();
  });
  if(Number.isFinite(video.duration)&&video.duration>1){
   await new Promise(resolve=>{
    const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve()};
    const timer=setTimeout(done,2200);video.addEventListener('seeked',done,{once:true});
    try{video.currentTime=Math.min(video.duration*.18,4,video.duration-.1)}catch{done()}
   });
  }
  if(!video.videoWidth||!video.videoHeight)throw Error('No decoded frame');
  const canvas=document.createElement('canvas'),scale=Math.min(1,640/video.videoWidth,640/video.videoHeight);
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
  if(!jpeg)throw Error('Preview encoding failed');
  return jpeg;
 }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
export function createWorldVideoPreviews(client){
 const cache=new Map(),queued=new Map();let tail=Promise.resolve(),epoch=0;
 const clear=()=>{epoch++;for(const value of cache.values())URL.revokeObjectURL(value);cache.clear();queued.clear()};
 window.addEventListener('pagehide',clear);
 client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')clear()});
 async function get(a){
  if(cache.has(a.id))return cache.get(a.id);
  if(queued.has(a.id))return queued.get(a.id);
  const version=epoch;
  const job=tail.then(async()=>{
   if(version!==epoch)throw Error('Preview session changed');
   const blob=await readWorldVideo(client,a),jpeg=await frameFromBlob(blob);
   if(version!==epoch)throw Error('Preview session changed');
   const url=URL.createObjectURL(jpeg);cache.set(a.id,url);return url;
  });
  tail=job.catch(()=>{});queued.set(a.id,job);
  try{return await job}finally{if(queued.get(a.id)===job)queued.delete(a.id)}
 }
 function mount(a,img){
  const run=()=>{if(!img.isConnected)return;get(a).then(url=>{if(img.isConnected){img.src=url;img.hidden=false}}).catch(()=>{if(img.isConnected)img.dataset.previewUnavailable='true'})};
  if(cache.has(a.id)){img.src=cache.get(a.id);img.hidden=false;return}
  if(!('IntersectionObserver' in window)){requestAnimationFrame(run);return}
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.disconnect();run()}},{rootMargin:'60px'});
  observer.observe(img.parentElement||img);
  // Detached tile observers are cleaned up even when they never enter view.
  setTimeout(()=>observer.disconnect(),30000);
 }
 return {mount,get,clear};
}
