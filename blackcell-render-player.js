/* Opt-in adaptive playback for authorized World videos. No signed/public media URL. */
let libraryPromise;
function loadLibrary(){
 if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src=new URL('./vendor/hls-1.7.4.min.js',import.meta.url).href;s.async=true;
  s.onload=()=>window.Hls?.isSupported()?resolve(window.Hls):reject(Error('HLS unavailable'));
  s.onerror=()=>reject(Error('HLS library unavailable'));document.head.append(s);
 }).catch(e=>{libraryPromise=null;throw e});
 return libraryPromise;
}
export async function attachRenderedWorld({client,asset,video,qualityMenu,alive,onFatal,onOriginal,onReady,startPosition=0}){
 if(window.BLACKCELL_ENABLE_RENDER_PLAYBACK!==true||asset?.source_provider!=='world-bunny-v1'||asset.review_status!=='approved'||asset.adult_restricted!==false)return null;
 const config=window.BLACKCELL_CORP_CONFIG||{},base=new URL('/functions/v1/blackcell-render-playback',config.url);
 const url=new URL(base);url.searchParams.set('id',asset.id);
 const auth=async()=>{const out=await client.auth.getSession(),token=out.data?.session?.access_token;if(!token||!alive())throw Error('Session ended');return {'Authorization':'Bearer '+token,'apikey':config.publishableKey}};
 try{
  const first=await fetch(url,{headers:await auth(),cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(!first.ok||!alive())return null;await first.body?.cancel();
  const Hls=await loadLibrary();if(!alive())return null;
  const hls=new Hls({startPosition,capLevelToPlayerSize:true,capLevelOnFPSDrop:true,maxBufferLength:30,backBufferLength:20,
   xhrSetup:async(xhr,uri)=>{
    const target=new URL(uri);if(target.origin!==base.origin||target.pathname!==base.pathname||target.searchParams.get('id')!==asset.id)throw Error('Unexpected HLS destination');
    const headers=await auth();if(xhr.readyState===0)xhr.open('GET',target.href,true);for(const [key,value] of Object.entries(headers))xhr.setRequestHeader(key,value);
   }});
  let disposed=false;const options=new Map();const clear=()=>{qualityMenu.replaceChildren(new Option('Original','original'));qualityMenu.disabled=true};
  const destroy=()=>{if(disposed)return;disposed=true;qualityMenu.removeEventListener('change',change);hls.destroy();clear()};
  const change=()=>{if(qualityMenu.value==='original'){const position=video.currentTime;destroy();if(alive())onOriginal?.(position);return}if(qualityMenu.value==='auto')hls.currentLevel=-1;else if(options.has(qualityMenu.value))hls.currentLevel=options.get(qualityMenu.value)};
  qualityMenu.addEventListener('change',change);
  hls.on(Hls.Events.MANIFEST_PARSED,()=>{if(!alive()||disposed){destroy();return}qualityMenu.replaceChildren(new Option('Auto','auto'));hls.levels.forEach((level,i)=>{const label=Math.min(level.width||0,level.height||0)+'p';if(!options.has(label)){options.set(label,i);qualityMenu.append(new Option(label,label))}});qualityMenu.append(new Option('Original','original'));qualityMenu.disabled=false;onReady?.();void video.play().catch(()=>{})});
  hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal&&!disposed){const position=video.currentTime||startPosition;destroy();if(alive())onFatal?.(position)}});
  hls.on(Hls.Events.MEDIA_ATTACHED,()=>{if(alive()&&!disposed)hls.loadSource(url.href)});
  hls.attachMedia(video);return {destroy};
 }catch{return null}
}
