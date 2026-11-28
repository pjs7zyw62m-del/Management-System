import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountBlackcellConnect,waitForIce} from '../blackcell-connect.js';
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
 let acquired=0,stopped=0,ringed=0;const actions=[];const host=new E('body');
 class Stream{constructor(tracks=[]){this.tracks=tracks}getTracks(){return this.tracks}getAudioTracks(){return this.tracks}getVideoTracks(){return []}addTrack(t){this.tracks.push(t)}}
 class PC{constructor(){this.iceGatheringState='complete';this.connectionState='new'}addTrack(){}close(){}async setRemoteDescription(d){this.remoteDescription=d}async createAnswer(){return {type:'answer',sdp:'v=0 test answer'}}async setLocalDescription(d){this.localDescription=d}}
 globalThis.document={createElement:t=>new E(t),body:host,hidden:false,addEventListener(){},removeEventListener(){}};
 globalThis.window={RTCPeerConnection:PC,addEventListener(){},removeEventListener(){}};
 globalThis.MediaStream=Stream;globalThis.RTCPeerConnection=PC;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async opts=>{acquired++;assert.equal(opts.audio,true);assert.equal(opts.video,false);return new Stream([{id:'t',enabled:true,stop(){stopped++}}])}}}});
 const incoming={id:'call',peer:'other',name:'Other',mode:'voice',direction:'incoming',state:'ringing',offer:'v=0 test offer'};
 const client={rpc:async(name,args)=>{assert.equal(name,'corp_connect');actions.push(args.p_action);return {data:{ok:true,call:args.p_action==='poll'?incoming:args.p_action==='answer'?{...incoming,state:'accepted'}:null}}}};
 const ctl=mountBlackcellConnect({client:()=>client,account:()=> 'me',allowed:()=>true,host,ring:()=>ringed++});
 try{
  await ctl.poll();assert.equal(acquired,0);assert.equal(ringed,1);
  const buttons=host.children[0].children.find(x=>x.className==='bc-connect-controls').children;
  buttons.find(x=>x.textContent==='Accept').onclick();await new Promise(r=>setImmediate(r));
  assert.equal(acquired,1);assert.ok(actions.includes('answer'));
  buttons.find(x=>x.textContent==='End call').onclick();await new Promise(r=>setImmediate(r));assert.equal(stopped,1);assert.ok(actions.includes('end'));
 }finally{ctl.dispose();for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator}
});
test('OS routes verified chat calls and signaling is private, expires, and checks current permissions',()=>{
 const os=readFileSync('blackcell-os.js','utf8'),chat=readFileSync('corporate-chat.js','utf8'),sql=readFileSync('database/blackcell-connect.sql','utf8'),expiry=readFileSync('database/blackcell-connect-expiry.sql','utf8'),code=readFileSync('blackcell-connect.js','utf8');
 assert.match(os,/contextAllowed\(\)&&installedApp\('chat'\)/);assert.match(os,/blackcell-connect-request/);assert.match(os,/connectController\?\.stop\(\)/);assert.match(chat,/requestConnect\('video'\)/);
 assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on bc_connect_private.calls from public,anon,authenticated/);assert.match(sql,/corp_private.chat_pair_unblocked/);assert.match(sql,/auth.sessions/);assert.match(sql,/callee_device=p_device/);assert.match(expiry,/offer=null,answer=null/);
 assert.doesNotMatch(code,/MediaRecorder|\.upload\(/);
});
