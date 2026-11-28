/* Explicit camera capture. Nothing uploads until the existing attachment Send action. */
export function mountChatCamera({context,addFiles,status}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
 const btn=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b};
 const dialog=el('dialog');dialog.className='bc-chat-camera-dialog';dialog.setAttribute('aria-label','Camera capture');
 const title=el('h2','BLACKCELL Camera'),video=el('video');video.autoplay=true;video.playsInline=true;video.muted=true;
 const note=el('p','Camera is off until you choose a capture mode.');note.setAttribute('role','status');
 const actions=el('div');actions.className='bc-camera-actions';
 const nativePhoto=el('input'),nativeVideo=el('input');
 for(const [input,type] of [[nativePhoto,'image/*'],[nativeVideo,'video/*']]){input.type='file';input.accept=type;input.setAttribute('capture','environment');input.hidden=true}
 let generation=0,target=null,stream=null,recorder=null,chunks=[],timer=null,facing='environment',mode='photo',pending=false;
 const valid=()=>{const c=context();return !!target&&c?.ready&&!c.blocked&&c.peer?.user_id===target};
 function clear(){generation++;clearTimeout(timer);timer=null;pending=false;if(recorder?.state!=='inactive'){try{recorder?.stop()}catch(_){}}recorder=null;for(const t of stream?.getTracks()||[])t.stop();stream=null;video.srcObject=null;chunks=[];sync()}
 function close(){clear();target=null;if(dialog.open)dialog.close()}
 function deliver(files){if(!valid()){close();return}const selected=Array.from(files||[]);close();if(selected.length)addFiles(selected)}
 for(const input of [nativePhoto,nativeVideo])input.onchange=()=>{const files=Array.from(input.files||[]);input.value='';deliver(files)};
 async function start(next){
  if(!valid()||pending)return;
  clear();mode=next;pending=true;sync();const serial=generation;
  try{
   const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:next==='video'});
   if(serial!==generation||!valid()){acquired.getTracks().forEach(t=>t.stop());return}
   stream=acquired;video.srcObject=stream;await video.play().catch(()=>{});note.textContent=next==='video'?'Ready to record a video.':'Ready to take a photograph.';
  }catch(_){if(serial===generation)note.textContent='Camera unavailable. Check permissions or use the device camera option.'}
  finally{if(serial===generation){pending=false;sync()}}
 }
 function photo(){
  if(!valid()||!stream||!video.videoWidth)return;
  const serial=generation,canvas=el('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
  canvas.toBlob(blob=>{if(serial===generation&&valid()&&blob)deliver([new File([blob],'camera-'+Date.now()+'.jpg',{type:'image/jpeg'})])},'image/jpeg',.9);
 }
 function record(){
  if(recorder){if(recorder.state==='recording')recorder.stop();return}
  if(!valid()||!stream||mode!=='video'||!window.MediaRecorder)return;
  try{
   const mime=['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
   recorder=mime?new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1500000}):new MediaRecorder(stream);
   const serial=generation;chunks=[];
   recorder.ondataavailable=e=>{if(serial===generation&&e.data.size)chunks.push(e.data)};
   recorder.onerror=()=>{if(serial===generation){clear();note.textContent='Recording failed. Try again.'}};
   recorder.onstop=()=>{if(serial!==generation||!valid())return;clearTimeout(timer);const type=(recorder.mimeType||chunks[0]?.type||'').split(';')[0];const blob=new Blob(chunks,{type});if(!['video/mp4','video/webm'].includes(type)||!blob.size||blob.size>50*1024*1024){clear();note.textContent='Video format unsupported or recording too large.';return}deliver([new File([blob],'camera-'+Date.now()+(type==='video/mp4'?'.mp4':'.webm'),{type})])};
   recorder.start(250);note.textContent='Recording video · maximum 30 seconds';timer=setTimeout(()=>{if(serial===generation&&recorder?.state==='recording')recorder.stop()},30000);sync()
  }catch(_){clear();note.textContent='Video recording unavailable. Try the device camera.'}
 }
 const nativeP=btn('Device photo',()=>{if(valid()){nativePhoto.value='';nativePhoto.click()}}),nativeV=btn('Device video',()=>{if(valid()){nativeVideo.value='';nativeVideo.click()}});
 const photoMode=btn('Photo camera',()=>void start('photo')),videoMode=btn('Video camera',()=>void start('video')),flip=btn('Switch camera',()=>{facing=facing==='environment'?'user':'environment';void start(mode)}),capture=btn('Take photo',photo),recordBtn=btn('Record video',record),cancel=btn('Cancel',close);
 function sync(){const active=!!stream,recording=recorder?.state==='recording';video.hidden=!active;capture.hidden=!active||mode!=='photo';recordBtn.hidden=!active||mode!=='video';recordBtn.textContent=recording?'Stop recording':'Record video';for(const b of [nativeP,nativeV,photoMode,videoMode,flip])b.disabled=pending||recording;flip.hidden=!active}
 actions.append(nativeP,nativeV,photoMode,videoMode,flip,capture,recordBtn,cancel);dialog.append(title,note,video,actions,nativePhoto,nativeVideo);document.body.append(dialog);sync();
 dialog.addEventListener('cancel',e=>{e.preventDefault();close()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)close()});window.addEventListener('pagehide',close);
 return {open(){const c=context();if(!c?.ready||c.blocked||!c.peer?.user_id){status('Select an authorized conversation first.');return}close();target=c.peer.user_id;note.textContent='Choose the device camera or open an in-app camera preview.';dialog.showModal()},close};
}
