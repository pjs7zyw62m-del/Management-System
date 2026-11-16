/* Opt-in adaptive playback for authorized World videos. No signed/public media URL. */
let libraryPromise;
function loadLibrary(){
 if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
  if(window.Hls?.isSupported()){resolve(window.Hls);return}
  const s=document.createElement('script');s.src=new URL('./vendor/hls-1.7.4.min.js',import.meta.url).href;s.async=true;
  s.onload=()=>window.Hls?.isSupported()?resolve(window.Hls):reject(Error('HLS unavailable'));
  s.onerror=()=>{s.remove();reject(Error('HLS library unavailable'))};document.head.append(s);
 }).catch(e=>{libraryPromise=null;throw e});
 return libraryPromise;
}
export async function attachRenderedWorld({client,asset,video,qualityMenu,alive,onFatal,onOriginal,onReady,onUnavailable,startPosition=0,initialQuality='auto'}){
 if(window.BLACKCELL_ENABLE_RENDER_PLAYBACK!==true||asset?.source_provider!=='world-bunny-v1'||asset.review_status!=='approved'||asset.adult_restricted!==false||asset.rights_confirmed!==true||!asset.id||Number(asset.bytes)>45*1024*1024)return null;
 const config=window.BLACKCELL_CORP_CONFIG||{};if(!config.url||!config.publishableKey)return null;
 const base=new URL('/functions/v1/blackcell-render-playback',config.url);
 const url=new URL(base);url.searchParams.set('id',asset.id);
 const auth=async()=>{const out=await client.auth.getSession(),token=out.data?.session?.access_token;if(!token||!alive())throw Error('Session ended');return {'Authorization':'Bearer '+token,'apikey':config.publishableKey}};
 try{
  let first;for(let attempt=0;attempt<2;attempt++){if(!alive())return null;try{first=await fetch(url,{headers:await auth(),cache:'no-store',signal:AbortSignal.timeout(8000)});if(first.ok||[401,403,404].includes(first.status)||attempt===1)break;await first.body?.cancel()}catch(e){if(attempt===1)throw e}if(!alive())return null;await new Promise(resolve=>setTimeout(resolve,600))}
  if(!first.ok||!alive()){if(alive())onUnavailable?.(first.status===404?'Rendering not ready':'Manifest HTTP '+first.status);await first.body?.cancel();return null;}
  const master=await first.text();if(!master.startsWith('#EXTM3U')||!/#EXT-X-STREAM-INF:/.test(master)){onUnavailable?.('Invalid adaptive playlist');return null;}
  for(const line of master.split(/\r?\n/)){if(!line.trim()||line.startsWith('#'))continue;const variant=new URL(line.trim(),url);if(variant.origin!==base.origin||variant.pathname!==base.pathname||variant.searchParams.get('id')!==asset.id||!/^\d+\/index\.m3u8$/.test(variant.searchParams.get('file')||'')){onUnavailable?.('Adaptive playlist route mismatch');return null;}}

  const Hls=await loadLibrary();if(!alive())return null;
  const hls=new Hls({startPosition,startLevel:0,capLevelToPlayerSize:true,capLevelOnFPSDrop:true,maxBufferLength:45,maxMaxBufferLength:90,backBufferLength:30,
   xhrSetup:async(xhr,uri)=>{
    const target=new URL(uri);if(target.origin!==base.origin||target.pathname!==base.pathname||target.searchParams.get('id')!==asset.id)throw Error('Unexpected HLS destination');
    const headers=await auth();if(xhr.readyState===0)xhr.open('GET',target.href,true);for(const [key,value] of Object.entries(headers))xhr.setRequestHeader(key,value);
   }});
  let disposed=false,manifestTimer=null,recoveryTimer=null,networkRecoveries=0,mediaRecoveries=0;const options=new Map();const clear=()=>{qualityMenu.replaceChildren(new Option('Original','original'));qualityMenu.disabled=true};
  const destroy=()=>{if(disposed)return;disposed=true;clearTimeout(manifestTimer);clearTimeout(recoveryTimer);qualityMenu.removeEventListener('change',change);hls.destroy();clear()};
  const change=()=>{if(qualityMenu.value==='original'){const position=video.currentTime;destroy();if(alive())onOriginal?.(position);return}if(qualityMenu.value==='auto')hls.loadLevel=-1;else if(options.has(qualityMenu.value))hls.loadLevel=options.get(qualityMenu.value)};
  qualityMenu.addEventListener('change',change);
  hls.on(Hls.Events.MANIFEST_PARSED,()=>{clearTimeout(manifestTimer);if(!alive()||disposed){destroy();return}qualityMenu.replaceChildren(new Option('Auto','auto'));hls.levels.forEach((level,i)=>{const label=Math.min(level.width||0,level.height||0)+'p';if(!options.has(label)){options.set(label,i);qualityMenu.append(new Option(label,label))}});qualityMenu.append(new Option('Original','original'));qualityMenu.disabled=false;if(initialQuality!=='auto'&&options.has(initialQuality)){qualityMenu.value=initialQuality;hls.loadLevel=options.get(initialQuality)}onReady?.();void video.play().catch(()=>{})});
  hls.on(Hls.Events.ERROR,(_event,data)=>{if(!data.fatal||disposed||!alive())return;const position=video.currentTime||startPosition,detail=String(data.details||data.type||'Playback failure').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,70);if(recoveryTimer!==null)return;if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&networkRecoveries<2&&!/manifest/i.test(detail)){networkRecoveries++;if(qualityMenu.value==='auto')hls.loadLevel=-1;recoveryTimer=setTimeout(()=>{recoveryTimer=null;if(!disposed&&alive())hls.startLoad(position)},500*networkRecoveries);return}if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRecoveries<1){mediaRecoveries++;try{hls.recoverMediaError();return}catch{}}destroy();if(alive())onFatal?.(position,detail)});
  hls.on(Hls.Events.MEDIA_ATTACHED,()=>{if(alive()&&!disposed)hls.loadSource(url.href)});
  manifestTimer=setTimeout(()=>{if(disposed)return;destroy();if(alive())onFatal?.(startPosition,'Manifest timed out')},15000);
  hls.attachMedia(video);return {destroy};
 }catch(e){if(alive())onUnavailable?.(e?.message==='HLS unavailable'?'Browser does not support adaptive playback':e?.message==='HLS library unavailable'?'Player library unavailable':'Adaptive initialization failed');return null}
}
