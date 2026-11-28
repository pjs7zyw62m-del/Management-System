import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountBlackcellConnect,waitForIce,createConnectTonePlayer} from '../blackcell-connect.js';
test('ICE gathering finishes or times out without hanging',async()=>{
 const p=new EventTarget();p.iceGatheringState='gathering';
 const pending=waitForIce(p,1000);p.iceGatheringState='complete';p.dispatchEvent(new Event('icegatheringstatechange'));await pending;
 p.iceGatheringState='gathering';await waitForIce(p,5);
});
test('Incoming ring never opens microphone until explicit accept; end stops all local tracks',async()=>{
 const old=Object.fromEntries(['document','window','MediaStream','RTCPeerConnection'].map(k=>[k,globalThis[k]])),nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 class E{
  constructor(tag){this.tag=tag;this.children=[];this.hidden=false;this.paused=true;this.classList={toggle(){},remove(){}}}
  append(...e){this.children.push(...e)}setAttribute(){}pause(){this.paused=true}play(){this.paused=false;return Promise.resolve()}remove(){}
 }
 let acquired=0,stopped=0,ringed=0,dialed=0,alerts=0,closed=0,failDevice=false;const actions=[];const host=new E('body');
 class Stream{constructor(tracks=[]){this.tracks=tracks}getTracks(){return this.tracks}getAudioTracks(){return this.tracks}getVideoTracks(){return []}addTrack(t){this.tracks.push(t)}}
 class PC{constructor(){this.iceGatheringState='complete';this.connectionState='new'}addTrack(){}close(){}async setRemoteDescription(d){this.remoteDescription=d}async createOffer(){return {type:'offer',sdp:'v=0 test offer'}}async createAnswer(){return {type:'answer',sdp:'v=0 test answer'}}async setLocalDescription(d){this.localDescription=d}}
 globalThis.document={createElement:t=>new E(t),body:host,hidden:true,addEventListener(){},removeEventListener(){}};
 class DesktopAlert{static permission='granted';constructor(title,options){alerts++;assert.equal(title,'BLACKCELL Connect');assert.equal(options.body,'Incoming private call. Open BLACKCELL to answer.')}close(){closed++}}
 globalThis.window={RTCPeerConnection:PC,Notification:DesktopAlert,addEventListener(){},removeEventListener(){}};
 globalThis.MediaStream=Stream;globalThis.RTCPeerConnection=PC;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async opts=>{acquired++;if(failDevice)throw Object.assign(new Error('Requested device not found'),{name:'NotFoundError'});assert.equal(opts.audio,true);assert.equal(opts.video,false);return new Stream([{id:'t',enabled:true,stop(){stopped++}}])}}}});
 const incoming={id:'call',peer:'other',name:'Other',mode:'voice',direction:'incoming',state:'ringing',offer:'v=0 test offer'};
 const outgoing={...incoming,id:'outgoing',direction:'outgoing'};let pending=incoming;const notices=[];
 const client={rpc:async(name,args)=>{assert.equal(name,'corp_connect');actions.push(args.p_action);return {data:{ok:true,call:args.p_action==='poll'?pending:args.p_action==='start'?(pending=outgoing):args.p_action==='answer'?(pending={...incoming,state:'accepted'}): (pending=null)}}}};
 const ctl=mountBlackcellConnect({client:()=>client,account:()=> 'me',allowed:()=>true,host,ring:()=>ringed++,ringback:()=>dialed++,notify:message=>notices.push(message)});
 try{
  await ctl.poll();assert.equal(acquired,0);assert.equal(ringed,1);assert.equal(alerts,1);await ctl.poll();assert.equal(alerts,1);assert.equal(ringed,1);document.hidden=false;
  const buttons=host.children[0].children.find(x=>x.className==='bc-connect-controls').children;
  buttons.find(x=>x.textContent==='Accept').onclick();await new Promise(r=>setImmediate(r));
  assert.equal(acquired,1);assert.ok(actions.includes('answer'));assert.equal(closed,1);
  buttons.find(x=>x.textContent==='End call').onclick();await new Promise(r=>setImmediate(r));assert.equal(stopped,1);assert.ok(actions.includes('end'));
  const peer='12345678-1234-1234-1234-123456789abc';
  ctl.request(peer,'voice','Other');buttons.find(x=>x.textContent==='Start call').onclick();await new Promise(r=>setImmediate(r));assert.equal(dialed,1);assert.ok(actions.includes('start'));await ctl.poll();assert.equal(dialed,1);
  buttons.find(x=>x.textContent==='End call').onclick();await new Promise(r=>setImmediate(r));assert.equal(stopped,2);
  failDevice=true;const starts=actions.filter(x=>x==='start').length;ctl.request(peer,'voice','Other');buttons.find(x=>x.textContent==='Start call').onclick();await new Promise(r=>setImmediate(r));assert.equal(actions.filter(x=>x==='start').length,starts);assert.equal(dialed,1);assert.match(notices.at(-1),/No microphone was detected.*Call was not sent/);
 }finally{ctl.dispose();for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator}
});
test('OS routes verified chat calls and signaling is private, expires, and checks current permissions',()=>{
 const os=readFileSync('blackcell-os.js','utf8'),chat=readFileSync('corporate-chat.js','utf8'),sql=readFileSync('database/blackcell-connect.sql','utf8'),expiry=readFileSync('database/blackcell-connect-expiry.sql','utf8'),code=readFileSync('blackcell-connect.js','utf8');
 assert.match(os,/contextAllowed\(\)&&installedApp\('chat'\)/);assert.match(os,/blackcell-connect-request/);assert.match(os,/connectController\?\.stop\(\)/);assert.match(chat,/requestConnect\('video'\)/);
 assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on bc_connect_private.calls from public,anon,authenticated/);assert.match(sql,/corp_private.chat_pair_unblocked/);assert.match(sql,/auth.sessions/);assert.match(sql,/callee_device=p_device/);assert.match(expiry,/offer=null,answer=null/);
 assert.doesNotMatch(code,/MediaRecorder|\.upload\(/);
});

test('Call controls allow retrying unknown block status without bypassing verification',()=>{
 const chat=readFileSync('corporate-chat.js','utf8'),os=readFileSync('blackcell-os.js','utf8');
 assert.match(chat,/b\.disabled=!ready\|\|!self\|\|!peer\|\|sessionEnded\|\|chatBlocked\|\|blockBusy/);
 assert.match(chat,/await refreshCurrentBlock\(\)/);
 assert.match(chat,/if\(!blockKnown\|\|chatBlocked\|\|blockBusy\)/);
 assert.match(os,/selectedWindow===source\|\|document\.activeElement===source\.frame/);
 assert.match(os,/blackcell-connect-unavailable/);
});

test('Dedicated ringtone uses non-silent WAV, honors mute, and stops on cleanup',async()=>{
 let played=0,paused=0,wave,revoked=0,enabled=true,deny=false;
 class AudioMock{pause(){paused++}play(){played++;return deny?Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'})):Promise.resolve()}}
 const player=createConnectTonePlayer({AudioClass:AudioMock,urls:{createObjectURL:b=>{wave=b;return 'blob:call'},revokeObjectURL(){revoked++}},preferences:()=>({enabled,volume:.6})});
 assert.deepEqual(await player.play('ringback'),{ok:true});const bytes=new Uint8Array(await wave.arrayBuffer());assert.equal(Buffer.from(bytes.slice(0,4)).toString(),'RIFF');assert.ok(bytes.slice(44).some(n=>n!==0));
 player.stop();assert.ok(paused>0);assert.equal(revoked,1);enabled=false;assert.deepEqual(await player.play('callring'),{ok:false,reason:'muted'});assert.equal(played,1);enabled=true;deny=true;assert.deepEqual(await player.play('callring'),{ok:false,reason:'blocked'});player.stop();assert.equal(revoked,2);
});
