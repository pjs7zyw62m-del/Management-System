/* BLACKCELL Connect: direct WebRTC pilot. No media recording or media upload. */
export const CONNECT_ICE=Object.freeze([{urls:'stun:stun.cloudflare.com:3478'}]);
// Short-lived, pair-authorized TURN credentials only. Never cache or log them.
export async function loadConnectIce(client,peer,timeout=10000){
 if(!client?.functions?.invoke)return {iceServers:CONNECT_ICE,relay:false};
 let timer;
 try{
  const result=await Promise.race([client.functions.invoke('blackcell-connect-turn',{body:{peer}}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeout)})]);
  if(result?.error||result?.data?.ok!==true||!Array.isArray(result.data.iceServers))return {iceServers:CONNECT_ICE,relay:false};
  const servers=result.data.iceServers.filter(s=>Array.isArray(s?.urls)&&s.urls.length&&s.urls.every(u=>typeof u==='string'&&/^(?:stun:stun\.cloudflare\.com:3478|turns?:turn\.cloudflare\.com:(?:3478|443|80|5349)\?transport=(?:udp|tcp))$/.test(u))).filter(s=>!s.urls.some(u=>u.startsWith('turn'))||(typeof s.username==='string'&&!!s.username&&typeof s.credential==='string'&&!!s.credential)).map(s=>({urls:s.urls,...(s.urls.some(u=>u.startsWith('turn'))?{username:s.username,credential:s.credential}:{})}));
  if(!servers.some(s=>s.urls.some(u=>u.startsWith('turn'))))return {iceServers:CONNECT_ICE,relay:false};
  return {iceServers:[...CONNECT_ICE,...servers.filter(s=>s.urls.some(u=>u.startsWith('turn')))],relay:true};
 }catch(_){return {iceServers:CONNECT_ICE,relay:false}}finally{clearTimeout(timer)}
}
export function waitForIce(pc,timeout=8000){
 if(pc.iceGatheringState==='complete')return Promise.resolve();
 return new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',change);resolve()};const change=()=>{if(pc.iceGatheringState==='complete')done()};pc.addEventListener('icegatheringstatechange',change);timer=setTimeout(done,timeout);change()});
}
/* A separate media player for call tones: never use the microphone or interrupt
   startup speech. Browser autoplay restrictions and user sound preferences apply. */
export function createConnectTonePlayer({AudioClass=window.Audio,urls=window.URL,preferences=()=>({enabled:true,volume:.35})}={}){
 let player=null,url=null,epoch=0;
 function stop(){epoch++;try{player?.pause()}catch(_){}if(url){try{urls.revokeObjectURL(url)}catch(_){}url=null}}
 async function play(kind){
  stop();const ticket=epoch,p=preferences();
  if(!p.enabled||!(p.volume>0))return {ok:false,reason:'muted'};
  if(!AudioClass||!urls?.createObjectURL)return {ok:false,reason:'unsupported'};
  try{
   const notes=kind==='ringback'?[[440,0,.95,.5],[480,0,.95,.5]]:[[440,0,.32,.65],[659.25,.10,.32,.4],[440,.53,.32,.65],[659.25,.63,.32,.4]];
   const rate=22050,frames=Math.ceil((Math.max(...notes.map(n=>n[1]+n[2]))+.03)*rate);
   const buffer=new ArrayBuffer(44+frames*2),v=new DataView(buffer);
   const tag=(offset,value)=>{for(let i=0;i<value.length;i++)v.setUint8(offset+i,value.charCodeAt(i))};
   tag(0,'RIFF');v.setUint32(4,36+frames*2,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,frames*2,true);
   for(let i=0;i<frames;i++){const t=i/rate;let sum=0;for(const [freq,delay,duration,level] of notes){const x=t-delay;if(x<0||x>=duration)continue;const env=Math.min(1,x/.012,(duration-x)/.035);sum+=Math.sin(2*Math.PI*freq*x)*level*env}v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sum))*Math.min(1,p.volume)*32767),true)}
   url=urls.createObjectURL(new Blob([buffer],{type:'audio/wav'}));player ||= new AudioClass();player.src=url;player.muted=false;player.volume=1;player.loop=false;player.playsInline=true;
   await player.play();return ticket===epoch?{ok:true}:{ok:false,reason:'cancelled'};
  }catch(e){return {ok:false,reason:ticket!==epoch?'cancelled':e?.name==='NotAllowedError'?'blocked':'media-error'}}
 }
 return {play,stop};
}
function callSoundPreferences(){
 try{const p=window.BLACKCELL_SYSTEM_SOUNDS?.preferences();if(p)return p;const saved=JSON.parse(localStorage.getItem('bc.os.system-sounds.v1')||'null');return {enabled:typeof saved?.enabled==='boolean'?saved.enabled:localStorage.getItem('bcLandingMuted')!=='1',volume:Number.isFinite(saved?.volume)?Math.max(0,Math.min(1,saved.volume)):.35}}catch(_){return {enabled:true,volume:.35}}
}
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const btn=(text,fn,cls='')=>{const e=el('button',cls,text);e.type='button';e.onclick=fn;return e};
export function mountBlackcellConnect({client,account,allowed,host=document.body,notify=()=>{},ring=()=>{},ringback=()=>{}}){
 const device=crypto.randomUUID();
 let current=null,pc=null,local=null,remote=null,serial=0,working=false,polling=false,disposed=false,connectedAt=0,ringAt=0,failedAt=0,lastGood=0,lastPoll=0,facing='user',release=null,requested=null,collapsed=false,desktopAlert=null,alertedCall=null;
 const tonePlayer=createConnectTonePlayer({preferences:callSoundPreferences});let toneEpoch=0,relayReady=false,reportedCall=null,reportingCall=null,lastReport=0;
 async function reportConnection(){const id=current?.id;if(!id||current.state!=='accepted'||pc?.connectionState!=='connected'||reportedCall===id||reportingCall===id||Date.now()-lastReport<2000||!permitted())return;reportingCall=id;lastReport=Date.now();try{const {data,error}=await client().rpc('corp_connect_history',{p_action:'connected',p_call:id,p_device:device});if(!error&&data?.ok===true&&current?.id===id)reportedCall=id}catch(_){}finally{if(reportingCall===id)reportingCall=null}}

 const panel=el('section','bc-connect-panel');panel.hidden=true;panel.setAttribute('aria-label','BLACKCELL Connect');
 const header=el('header','bc-connect-header'),brand=el('strong','','BLACKCELL Connect'),minimize=btn('Minimize',()=>{collapsed=!collapsed;panel.classList.toggle('is-collapsed',collapsed);minimize.textContent=collapsed?'Expand':'Minimize'});
 header.append(brand,minimize);
 const name=el('h2','',''),state=el('p','bc-connect-state',''),duration=el('span','bc-connect-duration','');
 state.setAttribute('role','status');
 const networkStatus=el('p','bc-connect-state','');networkStatus.hidden=true;
 const soundStatus=el('p','bc-connect-state',''),privacy=el('p','bc-connect-state','');soundStatus.setAttribute('role','status');privacy.hidden=true;soundStatus.hidden=true;
 const stage=el('div','bc-connect-stage'),remoteVideo=el('video','bc-connect-remote'),localVideo=el('video','bc-connect-local');
 for(const v of [remoteVideo,localVideo]){v.autoplay=true;v.playsInline=true;v.setAttribute('playsinline','')}
 localVideo.muted=true;stage.append(remoteVideo,localVideo);
 const controls=el('div','bc-connect-controls');
 const accept=btn('Accept',()=>void answer(),'bc-connect-accept'),decline=btn('Decline',()=>void finish('decline'),'bc-connect-end'),start=btn('Start call',()=>void startCall(),'bc-connect-accept'),end=btn('End call',()=>void finish(),'bc-connect-end');
 const mute=btn('Mute',()=>{const tracks=local?.getAudioTracks()||[];const enabled=tracks.some(t=>t.enabled);tracks.forEach(t=>t.enabled=!enabled);mute.textContent=enabled?'Unmute':'Mute'});
 const camera=btn('Camera off',()=>{const tracks=local?.getVideoTracks()||[];const enabled=tracks.some(t=>t.enabled);tracks.forEach(t=>t.enabled=!enabled);camera.textContent=enabled?'Camera on':'Camera off'});
 const flip=btn('Switch camera',()=>void switchCamera()),resume=btn('Enable call audio',()=>{void remoteVideo.play().catch(()=>{})});
 const enableAlerts=btn('Enable desktop call alerts',()=>{try{void window.Notification.requestPermission().then(()=>{paint();alertIncoming()}).catch(()=>{})}catch(_){}});
 const testSound=btn('Test call sound',()=>{const kind=current?.direction==='outgoing'?'ringback':'callring';void playCallTone(kind,true)});
 controls.append(start,accept,decline,mute,camera,flip,resume,testSound,enableAlerts,end);panel.append(header,name,state,soundStatus,networkStatus,privacy,duration,stage,controls);host.append(panel);
 const permitted=()=>!disposed&&!!account()&&allowed();
 const supported=()=>!!window.RTCPeerConnection&&!!navigator.mediaDevices?.getUserMedia;
 async function rpc(action,args={}){
  const {data,error}=await client().rpc('corp_connect',{p_action:action,p_device:device,...args});
  if(error)throw Error('Calling service unavailable.');
  if(!data?.ok)throw Error(data?.error||'Calling access unavailable.');
  return data.call||null;
 }
 function paint(){
  const visible=!!(current||requested||working);panel.hidden=!visible;if(!visible)return;
  const incoming=current?.direction==='incoming'&&current.state==='ringing';
  name.textContent=current?.name||requested?.name||'BLACKCELL Member';
  const mode=current?.mode||requested?.mode||'voice';
  start.hidden=!requested||working||!!current;accept.hidden=!incoming||working;decline.hidden=!incoming;
  end.hidden=incoming&&!working;minimize.hidden=!current||incoming;
  stage.hidden=!local;stage.classList.toggle('is-voice',mode==='voice');localVideo.hidden=mode!=='video';
  mute.hidden=!local;camera.hidden=!local?.getVideoTracks().length;flip.hidden=camera.hidden;
  resume.hidden=!remote||!remoteVideo.paused;duration.hidden=!connectedAt;
  enableAlerts.hidden=window.Notification?.permission!=='default'||(!incoming&&!requested);
  testSound.hidden=working||!!current&&current.state!=='ringing';privacy.hidden=!local;privacy.textContent=mode==='video'?'Camera and microphone access active for this live call. No call recording.':'Microphone access active for this live call. No call recording.';
  if(connectedAt){const seconds=Math.floor((Date.now()-connectedAt)/1000);duration.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}
  if(incoming&&!working)state.textContent='Incoming '+mode+' call';
  else if(requested&&!working)state.textContent='Start a private '+mode+' call? Direct connection pilot; some networks may not connect.';
 }
 function closeAlert(){try{desktopAlert?.close()}catch(_){}desktopAlert=null}
 function alertIncoming(){
  if(!permitted()||!document.hidden||current?.direction!=='incoming'||current.state!=='ringing'||working||alertedCall===current.id||window.Notification?.permission!=='granted')return;
  try{desktopAlert=new window.Notification('BLACKCELL Connect',{body:'Incoming private call. Open BLACKCELL to answer.',tag:'blackcell-connect-'+current.id});alertedCall=current.id;desktopAlert.onclick=()=>{window.focus();closeAlert()}}catch(_){}
 }
 function stopCallTone(){toneEpoch++;tonePlayer.stop();soundStatus.hidden=true;soundStatus.textContent=''}
 async function playCallTone(kind,manual=false){
  const ticket=++toneEpoch;const result=await tonePlayer.play(kind);if(ticket!==toneEpoch||!permitted())return;
  if(result.ok){soundStatus.hidden=!manual;soundStatus.textContent=manual?'Call sound played. Check your device volume if you did not hear it.':'';return}
  if(result.reason==='muted'){soundStatus.hidden=false;soundStatus.textContent='Call sounds are muted in BLACKCELL Settings.';return}
  let fallback=false;try{fallback=(kind==='ringback'?ringback():ring())===true}catch(_){}
  soundStatus.hidden=fallback&&!manual;soundStatus.textContent=fallback?'Call sound requested. Check your device volume.':'Call sound could not play. Tap Test call sound to enable audio in your browser.';
 }
 function ringPending(){
  if(!permitted()||working||current?.state!=='ringing')return;
  alertIncoming();
  if(Date.now()-ringAt<5000)return;
  ringAt=Date.now();if(current.direction==='incoming')void playCallTone('callring');else if(current.direction==='outgoing')void playCallTone('ringback');
 }
 function deviceError(e,mode){
  if(e?.name==='NotFoundError'||e?.name==='DevicesNotFoundError')return 'No '+(mode==='video'?'microphone or camera':'microphone')+' was detected. Connect or enable the required device and try again.';
  if(e?.name==='NotAllowedError'||e?.name==='PermissionDeniedError')return 'Microphone'+(mode==='video'?' and camera':'')+' access was denied. Allow access in your browser and try again.';
  return e?.message||'Calling is unavailable.';
 }
 function cleanup(){
  closeAlert();stopCallTone();alertedCall=null;relayReady=false;networkStatus.hidden=true;networkStatus.textContent='';
  serial++;working=false;requested=null;current=null;reportedCall=null;reportingCall=null;lastReport=0;connectedAt=0;ringAt=0;failedAt=0;lastGood=0;collapsed=false;panel.classList.remove('is-collapsed');minimize.textContent='Minimize';
  if(pc){pc.ontrack=null;pc.onconnectionstatechange=null;try{pc.close()}catch(_){}pc=null}
  for(const t of local?.getTracks()||[])t.stop();for(const t of remote?.getTracks()||[])t.stop();local=null;remote=null;
  for(const v of [remoteVideo,localVideo]){v.pause();v.srcObject=null}
  mute.textContent='Mute';camera.textContent='Camera off';release?.();release=null;paint();
 }
 async function finish(action='end',message='Call ended.'){
  const id=current?.id;cleanup();if(id)try{await rpc(action,{p_call:id})}catch(_){}if(message)notify(message);
 }
 function hold(){if(!release)try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL Connect call',window)}catch(_){}}
 async function setup(mode,token,peer){
  if(!supported())throw Error('Calling is not supported in this browser.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==='video'?{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}}:false});
  if(token!==serial||!permitted()){stream.getTracks().forEach(t=>t.stop());throw Error('Call cancelled.')}
  local=stream;localVideo.srcObject=stream;remote=new MediaStream();remoteVideo.srcObject=remote;
  state.textContent='Preparing secure call connection…';
  const config=await loadConnectIce(client(),peer);
  if(token!==serial||!permitted())throw Error('Call cancelled.');
  relayReady=config.relay;networkStatus.hidden=false;networkStatus.textContent=relayReady?'Network: direct connection or secure relay available':'Network: direct connection only · relay unavailable';
  const conn=new RTCPeerConnection({iceServers:config.iceServers});pc=conn;
  conn.ontrack=e=>{if(conn!==pc)return;for(const t of e.streams[0]?.getTracks()||[e.track])if(!remote.getTracks().some(x=>x.id===t.id))remote.addTrack(t);void remoteVideo.play().catch(()=>{}).finally(paint)};
  conn.onconnectionstatechange=()=>{
   if(conn!==pc)return;
   if(conn.connectionState==='connected'){connectedAt ||= Date.now();failedAt=0;state.textContent='Connected';paint();void reportConnection()}
   if(['failed','closed'].includes(conn.connectionState))void finish('end',relayReady?'Call connection failed even with relay available. Try Wi-Fi or another network.':'Call connection failed. The relay service is unavailable.');
   else if(conn.connectionState==='disconnected'){failedAt ||= Date.now();state.textContent='Reconnecting…'}
  };
  for(const t of stream.getTracks())conn.addTrack(t,stream);
  paint();return conn;
 }
 async function startCall(){
  if(!requested||working||!permitted())return;
  const request=requested,token=++serial;working=true;stopCallTone();hold();state.textContent='Requesting microphone'+(request.mode==='video'?' and camera':'')+'…';paint();
  try{
   const conn=await setup(request.mode,token,request.peer);
   await conn.setLocalDescription(await conn.createOffer());await waitForIce(conn,relayReady?12000:8000);
   if(token!==serial||!permitted()){if(token===serial)cleanup();return}
   const row=await rpc('start',{p_peer:request.peer,p_mode:request.mode,p_sdp:conn.localDescription.sdp});
   if(token!==serial||!permitted()){if(row?.id)void rpc('end',{p_call:row.id}).catch(()=>{});return}
   if(!row?.id||row.state!=='ringing')throw Error('The recipient could not be called.');
   current=row;requested=null;lastGood=Date.now();state.textContent='Calling…';working=false;paint();ringPending();
  }catch(e){if(token===serial){cleanup();notify(deviceError(e,request.mode)+' Call was not sent.')}}
 }
 async function answer(){
  if(!current||current.direction!=='incoming'||current.state!=='ringing'||working||!permitted())return;
  const offer=current,token=++serial;working=true;closeAlert();stopCallTone();hold();state.textContent='Requesting microphone'+(offer.mode==='video'?' and camera':'')+'…';paint();
  try{
   const conn=await setup(offer.mode,token,offer.peer);
   await conn.setRemoteDescription({type:'offer',sdp:offer.offer});
   await conn.setLocalDescription(await conn.createAnswer());await waitForIce(conn,relayReady?12000:8000);
   if(token!==serial||!permitted()){if(token===serial)cleanup();return}
   const row=await rpc('answer',{p_call:offer.id,p_sdp:conn.localDescription.sdp});
   if(token!==serial||!permitted()){if(row?.id)void rpc('end',{p_call:row.id}).catch(()=>{});return}
   if(!row||row.state!=='accepted')throw Error('Call is no longer available.');
   current=row;working=false;lastGood=Date.now();if(!connectedAt){failedAt=Date.now();state.textContent='Connecting…'}paint();
  }catch(e){if(token===serial)void finish('decline',deviceError(e,offer.mode))}
 }
 async function switchCamera(){
  if(!pc||!local||!permitted()||working)return;
  const token=serial,conn=pc,old=local.getVideoTracks()[0];if(!old)return;
  flip.disabled=true;facing=facing==='user'?'environment':'user';
  try{
   const replacement=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing}},audio:false});
   const track=replacement.getVideoTracks()[0];if(token!==serial||!permitted()||!track){replacement.getTracks().forEach(t=>t.stop());return}
   try{track.enabled=old.enabled;await conn.getSenders().find(s=>s.track===old).replaceTrack(track);if(token!==serial){track.stop();return}local.removeTrack(old);local.addTrack(track);old.stop();localVideo.srcObject=local}catch(e){track.stop();throw e}
  }catch(_){notify('Camera switch unavailable.')}finally{flip.disabled=false}
 }
 async function poll(){
  if(disposed)return;
  if(!permitted()){if(current||requested||local)void finish('end','');return}
  if(polling||working||requested)return;
  polling=true;lastPoll=Date.now();const token=serial;
  try{
   const row=await rpc('poll',current?{p_call:current.id}:{});
   if(token!==serial||!permitted()){if(token===serial)cleanup();return}
   lastGood=Date.now();
   if(!row){if(current){cleanup();notify('Call ended or was not answered.')}return}
   if(!current){
    if(row.direction!=='incoming'||row.state!=='ringing')return;
    current=row;ringAt=0;hold();state.textContent='Incoming '+row.mode+' call';notify('Incoming '+row.mode+' call from '+row.name);
   }else{
    current=row;
    if(row.state==='accepted'&&row.direction==='outgoing'&&pc&&!pc.remoteDescription&&row.answer){await pc.setRemoteDescription({type:'answer',sdp:row.answer});if(token!==serial)return;if(!connectedAt){failedAt=Date.now();state.textContent='Connecting…'}}
   }
   if(current?.state==='ringing')ringPending();else{closeAlert();stopCallTone()}
   if(failedAt&&Date.now()-failedAt>30000&&pc?.connectionState!=='connected'){void finish('end',relayReady?'Call timed out even with relay available. Try another network.':'Direct call timed out. The relay service is unavailable.');return}
   paint();
  }catch(e){if(token===serial&&current&&(!lastGood||Date.now()-lastGood>20000))void finish('end','Call authorization or connection lost.')}
  finally{polling=false}
 }
 const timer=setInterval(()=>{if(current||requested||working||!permitted())void poll();else if(Date.now()-lastPoll>(document.hidden?10000:6500))void poll();if(connectedAt){paint();void reportConnection()}},2500);
 const wake=()=>{if(!document.hidden)closeAlert();else alertIncoming();void poll()};window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
 const leave=()=>{void finish('end','')};window.addEventListener('pagehide',leave);
 return {request(peer,mode,displayName){
  if(!permitted()||!supported()){notify('Calling requires verified access, a supported browser and microphone permission.');return}
  if(current||requested||working){notify('A call is already open.');return}
  if(!['voice','video'].includes(mode)||typeof peer!=='string'||!/^[0-9a-f-]{36}$/i.test(peer)||peer===account())return;
  serial++;requested={peer,mode,name:String(displayName||'BLACKCELL Member').slice(0,100)};paint();
 },poll,stop:leave,dispose(){disposed=true;clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);window.removeEventListener('pagehide',leave);leave();panel.remove()}};
}
