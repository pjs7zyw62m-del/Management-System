/* BLACKCELL Connect: direct WebRTC pilot. No media recording or media upload. */
export const CONNECT_ICE=Object.freeze([{urls:'stun:stun.cloudflare.com:3478'}]);
export function waitForIce(pc,timeout=8000){
 if(pc.iceGatheringState==='complete')return Promise.resolve();
 return new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',change);resolve()};const change=()=>{if(pc.iceGatheringState==='complete')done()};pc.addEventListener('icegatheringstatechange',change);timer=setTimeout(done,timeout);change()});
}
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const btn=(text,fn,cls='')=>{const e=el('button',cls,text);e.type='button';e.onclick=fn;return e};
export function mountBlackcellConnect({client,account,allowed,host=document.body,notify=()=>{},ring=()=>{},ringback=()=>{}}){
 const device=crypto.randomUUID();
 let current=null,pc=null,local=null,remote=null,serial=0,working=false,polling=false,disposed=false,connectedAt=0,ringAt=0,failedAt=0,lastGood=0,lastPoll=0,facing='user',release=null,requested=null,collapsed=false,desktopAlert=null,alertedCall=null;
 const panel=el('section','bc-connect-panel');panel.hidden=true;panel.setAttribute('aria-label','BLACKCELL Connect');
 const header=el('header','bc-connect-header'),brand=el('strong','','BLACKCELL Connect'),minimize=btn('Minimize',()=>{collapsed=!collapsed;panel.classList.toggle('is-collapsed',collapsed);minimize.textContent=collapsed?'Expand':'Minimize'});
 header.append(brand,minimize);
 const name=el('h2','',''),state=el('p','bc-connect-state',''),duration=el('span','bc-connect-duration','');
 state.setAttribute('role','status');
 const stage=el('div','bc-connect-stage'),remoteVideo=el('video','bc-connect-remote'),localVideo=el('video','bc-connect-local');
 for(const v of [remoteVideo,localVideo]){v.autoplay=true;v.playsInline=true;v.setAttribute('playsinline','')}
 localVideo.muted=true;stage.append(remoteVideo,localVideo);
 const controls=el('div','bc-connect-controls');
 const accept=btn('Accept',()=>void answer(),'bc-connect-accept'),decline=btn('Decline',()=>void finish('decline'),'bc-connect-end'),start=btn('Start call',()=>void startCall(),'bc-connect-accept'),end=btn('End call',()=>void finish(),'bc-connect-end');
 const mute=btn('Mute',()=>{const tracks=local?.getAudioTracks()||[];const enabled=tracks.some(t=>t.enabled);tracks.forEach(t=>t.enabled=!enabled);mute.textContent=enabled?'Unmute':'Mute'});
 const camera=btn('Camera off',()=>{const tracks=local?.getVideoTracks()||[];const enabled=tracks.some(t=>t.enabled);tracks.forEach(t=>t.enabled=!enabled);camera.textContent=enabled?'Camera on':'Camera off'});
 const flip=btn('Switch camera',()=>void switchCamera()),resume=btn('Enable call audio',()=>{void remoteVideo.play().catch(()=>{})});
 const enableAlerts=btn('Enable desktop call alerts',()=>{try{void window.Notification.requestPermission().then(()=>{paint();alertIncoming()}).catch(()=>{})}catch(_){}});
 controls.append(start,accept,decline,mute,camera,flip,resume,enableAlerts,end);panel.append(header,name,state,duration,stage,controls);host.append(panel);
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
  if(connectedAt){const seconds=Math.floor((Date.now()-connectedAt)/1000);duration.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}
  if(incoming&&!working)state.textContent='Incoming '+mode+' call';
  else if(requested&&!working)state.textContent='Start a private '+mode+' call? Direct connection pilot; some networks may not connect.';
 }
 function closeAlert(){try{desktopAlert?.close()}catch(_){}desktopAlert=null}
 function alertIncoming(){
  if(!permitted()||!document.hidden||current?.direction!=='incoming'||current.state!=='ringing'||working||alertedCall===current.id||window.Notification?.permission!=='granted')return;
  try{desktopAlert=new window.Notification('BLACKCELL Connect',{body:'Incoming private call. Open BLACKCELL to answer.',tag:'blackcell-connect-'+current.id});alertedCall=current.id;desktopAlert.onclick=()=>{window.focus();closeAlert()}}catch(_){}
 }
 function ringPending(){
  if(!permitted()||working||current?.state!=='ringing')return;
  alertIncoming();
  if(Date.now()-ringAt<5000)return;
  ringAt=Date.now();try{if(current.direction==='incoming')ring();else if(current.direction==='outgoing')ringback()}catch(_){}
 }
 function deviceError(e,mode){
  if(e?.name==='NotFoundError'||e?.name==='DevicesNotFoundError')return 'No '+(mode==='video'?'microphone or camera':'microphone')+' was detected. Connect or enable the required device and try again.';
  if(e?.name==='NotAllowedError'||e?.name==='PermissionDeniedError')return 'Microphone'+(mode==='video'?' and camera':'')+' access was denied. Allow access in your browser and try again.';
  return e?.message||'Calling is unavailable.';
 }
 function cleanup(){
  closeAlert();alertedCall=null;
  serial++;working=false;requested=null;current=null;connectedAt=0;ringAt=0;failedAt=0;lastGood=0;collapsed=false;panel.classList.remove('is-collapsed');minimize.textContent='Minimize';
  if(pc){pc.ontrack=null;pc.onconnectionstatechange=null;try{pc.close()}catch(_){}pc=null}
  for(const t of local?.getTracks()||[])t.stop();for(const t of remote?.getTracks()||[])t.stop();local=null;remote=null;
  for(const v of [remoteVideo,localVideo]){v.pause();v.srcObject=null}
  mute.textContent='Mute';camera.textContent='Camera off';release?.();release=null;paint();
 }
 async function finish(action='end',message='Call ended.'){
  const id=current?.id;cleanup();if(id)try{await rpc(action,{p_call:id})}catch(_){}if(message)notify(message);
 }
 function hold(){if(!release)try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('BLACKCELL Connect call',window)}catch(_){}}
 async function setup(mode,token){
  if(!supported())throw Error('Calling is not supported in this browser.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==='video'?{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}}:false});
  if(token!==serial||!permitted()){stream.getTracks().forEach(t=>t.stop());throw Error('Call cancelled.')}
  local=stream;localVideo.srcObject=stream;remote=new MediaStream();remoteVideo.srcObject=remote;
  const conn=new RTCPeerConnection({iceServers:CONNECT_ICE});pc=conn;
  conn.ontrack=e=>{if(conn!==pc)return;for(const t of e.streams[0]?.getTracks()||[e.track])if(!remote.getTracks().some(x=>x.id===t.id))remote.addTrack(t);void remoteVideo.play().catch(()=>{}).finally(paint)};
  conn.onconnectionstatechange=()=>{
   if(conn!==pc)return;
   if(conn.connectionState==='connected'){connectedAt ||= Date.now();failedAt=0;state.textContent='Connected';paint()}
   if(['failed','closed'].includes(conn.connectionState))void finish('end','Call connection failed. This network may require a TURN relay.');
   else if(conn.connectionState==='disconnected'){failedAt ||= Date.now();state.textContent='Reconnecting…'}
  };
  for(const t of stream.getTracks())conn.addTrack(t,stream);
  paint();return conn;
 }
 async function startCall(){
  if(!requested||working||!permitted())return;
  const request=requested,token=++serial;working=true;hold();state.textContent='Requesting microphone'+(request.mode==='video'?' and camera':'')+'…';paint();
  try{
   const conn=await setup(request.mode,token);
   await conn.setLocalDescription(await conn.createOffer());await waitForIce(conn);
   if(token!==serial||!permitted()){if(token===serial)cleanup();return}
   const row=await rpc('start',{p_peer:request.peer,p_mode:request.mode,p_sdp:conn.localDescription.sdp});
   if(token!==serial||!permitted()){if(row?.id)void rpc('end',{p_call:row.id}).catch(()=>{});return}
   if(!row?.id||row.state!=='ringing')throw Error('The recipient could not be called.');
   current=row;requested=null;lastGood=Date.now();state.textContent='Calling…';working=false;paint();ringPending();
  }catch(e){if(token===serial){cleanup();notify(deviceError(e,request.mode)+' Call was not sent.')}}
 }
 async function answer(){
  if(!current||current.direction!=='incoming'||current.state!=='ringing'||working||!permitted())return;
  const offer=current,token=++serial;working=true;closeAlert();hold();state.textContent='Requesting microphone'+(offer.mode==='video'?' and camera':'')+'…';paint();
  try{
   const conn=await setup(offer.mode,token);
   await conn.setRemoteDescription({type:'offer',sdp:offer.offer});
   await conn.setLocalDescription(await conn.createAnswer());await waitForIce(conn);
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
   if(current?.state==='ringing')ringPending();else closeAlert();
   if(failedAt&&Date.now()-failedAt>30000&&pc?.connectionState!=='connected'){void finish('end','Direct call could not connect. A TURN relay may be required.');return}
   paint();
  }catch(e){if(token===serial&&current&&(!lastGood||Date.now()-lastGood>20000))void finish('end','Call authorization or connection lost.')}
  finally{polling=false}
 }
 const timer=setInterval(()=>{if(current||requested||working||!permitted())void poll();else if(Date.now()-lastPoll>(document.hidden?10000:6500))void poll();if(connectedAt)paint()},2500);
 const wake=()=>{if(!document.hidden)closeAlert();else alertIncoming();void poll()};window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
 const leave=()=>{void finish('end','')};window.addEventListener('pagehide',leave);
 return {request(peer,mode,displayName){
  if(!permitted()||!supported()){notify('Calling requires verified access, a supported browser and microphone permission.');return}
  if(current||requested||working){notify('A call is already open.');return}
  if(!['voice','video'].includes(mode)||typeof peer!=='string'||!/^[0-9a-f-]{36}$/i.test(peer)||peer===account())return;
  serial++;requested={peer,mode,name:String(displayName||'BLACKCELL Member').slice(0,100)};paint();
 },poll,stop:leave,dispose(){disposed=true;clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);window.removeEventListener('pagehide',leave);leave();panel.remove()}};
}
