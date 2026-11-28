import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {voiceMime,voiceFormat,mountChatVoice,voicePermissionMessage} from '../blackcell-chat-voice.js';
test('Voice MIME formats are normalized without accepting arbitrary files',()=>{
 assert.equal(voiceMime('audio/webm;codecs=opus'),'audio/webm');
 assert.equal(voiceMime('audio/mp4'),'audio/mp4');
 assert.equal(voiceMime('audio/ogg'),'audio/ogg');
 assert.equal(voiceMime('text/html'),'');
 assert.equal(voiceFormat({isTypeSupported:t=>t==='audio/webm;codecs=opus'}),'audio/webm;codecs=opus');
});
test('Dictation requires explicit consent, preserves draft, never sends automatically',()=>{
 const old={window:globalThis.window,document:globalThis.document,confirm:globalThis.confirm};
 class Node {constructor(tag){this.tag=tag;this.children=[];this.value='';this.maxLength=2000;this.classList={add(){}}}append(...nodes){this.children.push(...nodes)}before(){}insertBefore(n){this.children.push(n)}setAttribute(){}removeAttribute(){}pause(){}dispatchEvent(){this.changed=true}}
 let recognition,consent=false,starts=0,notices=[];
 class Recognition {constructor(){recognition=this}start(){starts++}abort(){}stop(){this.onend?.()}}
 globalThis.document={createElement:t=>new Node(t),addEventListener(){},querySelectorAll:()=>[],hidden:false};
 globalThis.window={SpeechRecognition:Recognition,addEventListener(){}};
 globalThis.confirm=()=>consent;
 try{
 const composer=new Node('form'),input=new Node('textarea');input.value='Hello';
 const controller=mountChatVoice({client:{},context:()=>({ready:true,blocked:false,self:'sender',peer:{user_id:'recipient'}}),composer,input,status:t=>notices.push(t),reload:()=>{throw Error('Must not auto-send')}});
 const dictate=composer.children.find(x=>x.title==='Voice to text');
 dictate.onclick();assert.equal(starts,0);
 consent=true;dictate.onclick();assert.equal(starts,1);
 const result=[{transcript:'there'}];result.isFinal=true;
 recognition.onresult({results:[result]});assert.equal(input.value,'Hello there');assert.equal(input.changed,true);
 recognition.onend();assert.equal(controller.busy(),false);
 controller.reset();
 }finally{for(const k of Object.keys(old)){if(old[k]===undefined)delete globalThis[k];else globalThis[k]=old[k]}}
});
test('Voice is wired to private attachments and separate from image/video galleries',()=>{
 const chat=readFileSync('corporate-chat.js','utf8'),os=readFileSync('blackcell-os.js','utf8'),dock=readFileSync('corporate-chat-dock.js','utf8'),media=readFileSync('corporate-chat-media.js','utf8'),voice=readFileSync('blackcell-chat-voice.js','utf8'),edge=readFileSync('supabase/functions/blackcell-chat-bunny/index.ts','utf8'),sql=readFileSync('database/blackcell-chat-voice.sql','utf8');
 assert.match(chat,/mountChatVoice/);assert.match(chat,/m.body===VOICE_BODY/);assert.match(chat,/voice\?\.pause\(\)/);
 assert.match(os,/baseId==='chat'\?'fullscreen; microphone; camera'/);assert.match(dock,/clipboard-write; microphone/);
 assert.match(media,/neq\('kind','audio'\)/);assert.match(voice,/transport.upload\(file,batchId,0,file.type/);
 assert.match(voice,/media_batch_id:batchId/);assert.match(edge,/"audio\/mp4":"m4a"/);assert.match(sql,/kind='audio'/);
});

test('Microphone errors distinguish persistent permission from missing or busy devices',()=>{
 assert.match(voicePermissionMessage({name:'NotAllowedError'}),/Allow while visiting the site/);
 assert.match(voicePermissionMessage({name:'NotFoundError'}),/No microphone/);
 assert.match(voicePermissionMessage({name:'NotReadableError'}),/End any other call or recording/);
});
test('A permission dialog does not cancel an in-flight voice note, but hidden capture is released',async()=>{
 const old={window:globalThis.window,document:globalThis.document};const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolvePermission,requests=0,stops=0,holds=0,releases=0;const listeners={};
 class Node{constructor(tag){this.tag=tag;this.children=[];this.classList={add(){}}}append(...nodes){this.children.push(...nodes)}before(){}insertBefore(n){this.children.push(n)}setAttribute(){}removeAttribute(){}pause(){}}
 globalThis.document={createElement:t=>new Node(t),addEventListener:(k,fn)=>listeners[k]=fn,querySelectorAll:()=>[],hidden:false};
 globalThis.window={MediaRecorder:class{},addEventListener(){},top:{BLACKCELL_LIVE_UPDATE:{hold(){holds++;return ()=>releases++}}}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>{requests++;return new Promise(r=>resolvePermission=r)}}}});
 try{const composer=new Node('form');const ctl=mountChatVoice({client:{},context:()=>({ready:true,blocked:false,self:'sender',peer:{user_id:'recipient'}}),composer,input:new Node('textarea'),status:()=>{},reload:()=>{}});const record=composer.children.find(x=>x.title==='Record voice note');record.onclick();assert.equal(requests,1);assert.equal(holds,1);document.hidden=true;listeners.visibilitychange();assert.equal(ctl.busy(),true);resolvePermission({getTracks:()=>[{stop(){stops++}}]});await new Promise(r=>setImmediate(r));assert.equal(stops,1);assert.equal(releases,1);assert.equal(ctl.busy(),false)}finally{for(const k of Object.keys(old)){if(old[k]===undefined)delete globalThis[k];else globalThis[k]=old[k]}if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator}
});
