import {createChatBunnyTransport} from './blackcell-chat-bunny.js?v=1';
export const VOICE_BODY='Voice message';
const TYPES={'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg'};
export const voiceMime=type=>{const mime=String(type||'').split(';')[0].trim().toLowerCase();return Object.hasOwn(TYPES,mime)?mime:''};
export function voiceFormat(Recorder){return ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg'].find(t=>Recorder?.isTypeSupported?.(t))||''}
export function voicePermissionMessage(error){
 if(['NotAllowedError','PermissionDeniedError','SecurityError'].includes(error?.name))return 'Microphone permission was not granted. In browser site permissions for blackcellcorp.com choose Allow while visiting the site, if available; also allow the browser microphone in device settings.';
 if(['NotFoundError','DevicesNotFoundError'].includes(error?.name))return 'No microphone was detected. Connect or enable your microphone and try again.';
 if(['NotReadableError','TrackStartError','AbortError'].includes(error?.name))return 'Microphone could not start. End any other call or recording and try again.';
 return 'Voice recording could not start. Check microphone availability and browser permissions.';
}
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
const button=(label,fn)=>{const b=el('button','bc-voice-button',label);b.type='button';b.onclick=fn;return b};
export function mountChatVoice({client,context,composer,input,status,reload}){
 const transport=createChatBunnyTransport(client);
 let stream=null,recorder=null,chunks=[],clip=null,previewUrl=null,recognizer=null,gen=0,target=null,sending=false,starting=false,timer=null,started=0,dictationConsent=false,dictating=false,releaseCapture=null;
 const usable=()=>{const c=context();return c?.ready&&!c.blocked&&!!c.self&&!!c.peer?.user_id};
 const same=()=>usable()&&target===context().peer.user_id;
 const controls=el('div','bc-voice-controls');controls.hidden=true;
 const note=el('p','bc-voice-note',''),player=el('audio','bc-voice-preview');player.controls=true;player.hidden=true;
 const record=button('◉',()=>void begin());record.title='Record voice note';record.classList.add('bc-voice-record');record.setAttribute('aria-label','Record voice note');
 const dictate=button('🎙',()=>dictation());dictate.title='Voice to text';dictate.classList.add('bc-voice-dictate');dictate.setAttribute('aria-label','Voice to text');
 const stop=button('Stop',()=>finishRecording()),pause=button('Pause',()=>{if(recorder?.state==='recording'){recorder.pause();pause.textContent='Resume'}else if(recorder?.state==='paused'){recorder.resume();pause.textContent='Pause'}});
 const cancel=button('Cancel',()=>reset()),send=button('Send voice note',()=>void sendClip());
 controls.append(note,player,pause,stop,cancel,send);composer.before(controls);composer.insertBefore(record,composer.lastElementChild);composer.insertBefore(dictate,composer.lastElementChild);
 function holdCapture(){if(!releaseCapture)try{releaseCapture=window.top?.BLACKCELL_LIVE_UPDATE?.hold('Voice note capture or preview',window)}catch(_){}}
 function releaseHold(){releaseCapture?.();releaseCapture=null}
 function stopTracks(){for(const track of stream?.getTracks()||[])track.stop();stream=null}
 function clearClock(){clearInterval(timer);timer=null}
 function reset(){gen++;starting=false;clearClock();releaseHold();if(recognizer){try{recognizer.abort()}catch(_){}recognizer=null}dictating=false;if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(_){}}recorder=null;stopTracks();chunks=[];clip=null;target=null;player.pause();player.removeAttribute('src');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;controls.hidden=true;controls.removeAttribute('aria-busy');player.hidden=true;dictate.textContent='🎙';sync()}
 function sync(){const blocked=!usable();if(blocked&&!sending&&(recorder||clip||starting||dictating))reset();record.disabled=blocked||sending||starting||!!recorder||!!clip||dictating;dictate.disabled=blocked||sending||starting||!!recorder||!!clip;send.disabled=sending||!clip||!same();cancel.disabled=sending;pause.disabled=!recorder||recorder.state==='inactive';stop.disabled=pause.disabled}
 function clock(){const seconds=Math.floor((Date.now()-started)/1000);note.textContent='Recording · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');if(seconds>=120)finishRecording()}
 function finishRecording(){if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(_){reset()}}}
 async function begin(){
  if(!usable()||record.disabled)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Voice recording is not supported on this browser.');return}
  target=context().peer.user_id;const seq=++gen;starting=true;holdCapture();controls.hidden=false;controls.setAttribute('aria-busy','true');note.textContent='Waiting for microphone permission…';sync();
  try{
   const picked=voiceFormat(window.MediaRecorder);const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
   if(seq!==gen||!same()||document.hidden){acquired.getTracks().forEach(t=>t.stop());if(seq===gen){reset();status('Return to the conversation and tap Record again.')}return}
   stream=acquired;recorder=picked?new MediaRecorder(stream,{mimeType:picked}):new MediaRecorder(stream);chunks=[];
   recorder.ondataavailable=e=>{if(seq===gen&&e.data.size)chunks.push(e.data)};
   recorder.onerror=()=>{if(seq===gen){reset();status('Recording failed. Please try again.')}};
   recorder.onstop=()=>{
    if(seq!==gen)return;clearClock();stopTracks();
    const mime=voiceMime(recorder.mimeType||chunks[0]?.type),blob=new Blob(chunks,{type:mime});recorder=null;chunks=[];
    if(!same()||!mime||!blob.size||blob.size>10*1024*1024){reset();status('Recording unavailable or too large.');return}
    clip=new File([blob],'voice-note.'+TYPES[mime],{type:mime});previewUrl=URL.createObjectURL(clip);player.src=previewUrl;player.hidden=false;note.textContent='Voice note ready · preview or send';controls.removeAttribute('aria-busy');sync();
   };
   recorder.start(250);started=Date.now();controls.hidden=false;controls.setAttribute('aria-busy','true');pause.textContent='Pause';clock();timer=setInterval(clock,250);
  }catch(error){if(seq===gen){reset();status(voicePermissionMessage(error))}}finally{if(seq===gen){starting=false;sync()}}
 }
 async function sendClip(){
  if(!clip||!same()||sending)return;
  const c=context(),uid=c.self,peerId=target,file=clip;let posted=false;
  sending=true;controls.setAttribute('aria-busy','true');note.textContent='Sending private voice note…';sync();
  let release;try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('Voice note upload',window)}catch(_){}
  try{
   const batchId=crypto.randomUUID();
   const {error}=await client.from('corp_chat_media_batches').insert({id:batchId,sender_id:uid,recipient_id:peerId});if(error)throw error;
   await transport.upload(file,batchId,0,file.type,loaded=>{note.textContent='Sending voice note · '+Math.round(loaded/file.size*100)+'%'});
   if(!same()||context().self!==uid)throw Error('Conversation changed before sending.');
   const result=await client.from('corp_chat_messages').insert({sender_id:uid,recipient_id:peerId,body:VOICE_BODY,media_batch_id:batchId});if(result.error)throw result.error;
   posted=true;status('Voice note sent.');await reload();
  }catch(_){status(posted?'Voice note sent. Reopen the conversation if needed.':'Voice note not confirmed. Check the conversation before retrying.')}
  finally{sending=false;release?.();reset()}
 }
 function dictation(){
  if(recognizer){try{recognizer.stop()}catch(_){}return}
  if(!usable()||dictate.disabled)return;
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){status('Voice-to-text is unavailable in this browser. Use your device keyboard microphone instead.');return}
  if(!dictationConsent){if(!confirm('Voice-to-text may send microphone audio to your browser provider for speech recognition. BLACKCELL will insert editable text only. Continue?'))return;dictationConsent=true}
  const seq=++gen;target=context().peer.user_id;const base=input.value;let inserted=base;
  try{
   const r=new Recognition();recognizer=r;dictating=true;r.lang=navigator.language||'en-US';r.continuous=false;r.interimResults=false;
   r.onresult=e=>{
    if(seq!==gen||!same())return;
    const final=Array.from(e.results).filter(x=>x.isFinal).map(x=>x[0].transcript).join(' ').trim();
    if(!final)return;
    if(input.value!==inserted){status('Draft changed during dictation. Start again to avoid overwriting it.');return}
    inserted=(base+(base&&!/\s$/.test(base)?' ':'')+final).slice(0,input.maxLength>0?input.maxLength:2000);input.value=inserted;input.dispatchEvent(new Event('input',{bubbles:true}));status('Dictation added. Review and send when ready.');
   };
   r.onerror=()=>{if(seq===gen)status('Voice-to-text unavailable. Check microphone permission or use keyboard dictation.')};
   r.onend=()=>{if(seq!==gen)return;recognizer=null;dictating=false;target=null;dictate.textContent='🎙';sync()};
   dictate.textContent='■';status('Listening… Tap again to stop.');r.start();sync();
  }catch(_){reset();status('Unable to start voice-to-text.')}
 }
 function pauseAll(){if(!sending)reset();else{stopTracks();player.pause()}for(const audio of document.querySelectorAll('.bc-voice-playback'))audio.pause()}
 function onVisibility(){if(!document.hidden)return;
  // Native permission dialogs may temporarily hide Android Chrome. Keep only the pending request alive; never capture while hidden.
  if(starting&&!stream)return;
  if(recorder){finishRecording();stopTracks()}else if(dictating)reset();else player.pause();
  for(const audio of document.querySelectorAll('.bc-voice-playback'))audio.pause();
 }
 document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',pauseAll);
 function render(message){
  const cell=el('div','bubble bc-voice-bubble'),label=el('strong','','Voice message'),play=button('Play voice note',async()=>{
   if(!usable()||!cell.isConnected)return;play.disabled=true;
   try{
    const {data,error}=await client.from('corp_chat_media_items').select('id').eq('batch_id',message.media_batch_id).eq('kind','audio').limit(1);if(error||!data?.length)throw Error();
    const url=await transport.link(data[0].id);if(!cell.isConnected||!usable())return;
    const audio=el('audio','bc-voice-playback');audio.controls=true;audio.preload='none';audio.src=url;cell.append(audio);play.hidden=true;audio.addEventListener('error',()=>{audio.remove();play.hidden=false;play.disabled=false});await audio.play().catch(()=>{});
   }catch(_){play.textContent='Retry voice note'}finally{play.disabled=false}
  });
  cell.append(label,play);return cell;
 }
 sync();return {sync,reset,pause:pauseAll,render,busy:()=>sending||starting||!!recorder||!!clip||dictating};
}
