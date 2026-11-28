import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountChatCamera} from '../blackcell-chat-camera.js';
test('camera starts only after capture selection and stops all tracks on close',async()=>{
 const previous={document:globalThis.document,window:globalThis.window};
 const media=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 let requested=0,stopped=0,delivered=0;const children=[];
 class Element{
 constructor(tag){this.tag=tag;this.children=[];this.open=false;this.value=''}
 append(...nodes){this.children.push(...nodes)}
 setAttribute(){} addEventListener(){} showModal(){this.open=true} close(){this.open=false}
 play(){return Promise.resolve()} click(){}
 }
 globalThis.document={createElement:tag=>new Element(tag),body:{append:d=>children.push(d)},addEventListener(){}};
 globalThis.window={addEventListener(){}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async opts=>{requested++;assert.equal(opts.audio,false);return {getTracks:()=>[{stop(){stopped++}}]}}}}});
 try{
 const camera=mountChatCamera({context:()=>({ready:true,peer:{user_id:'p'},blocked:false}),addFiles:()=>delivered++,status(){}});
 camera.open();assert.equal(requested,0);
 const actions=children[0].children.find(x=>x.className==='bc-camera-actions');
 await actions.children.find(x=>x.textContent==='Photo camera').onclick();
 await new Promise(r=>setImmediate(r));
 assert.equal(requested,1);camera.close();assert.equal(stopped,1);assert.equal(delivered,0);
 }finally{for(const [k,v] of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}if(media)Object.defineProperty(globalThis,'navigator',media);else delete globalThis.navigator}
});
test('captured files use attachment review, never auto-send',()=>{
 const media=readFileSync('corporate-chat-media.js','utf8'),cam=readFileSync('blackcell-chat-camera.js','utf8'),os=readFileSync('blackcell-os.js','utf8'),dock=readFileSync('corporate-chat-dock.js','utf8');
 assert.match(media,/button\('Camera'/);assert.match(media,/openShare\(\);if\(!overlay.hidden\)selectFiles\(files\)/);
 assert.doesNotMatch(cam,/\.upload\(|\.insert\(/);
 assert.match(os,/baseId==='chat'\?'fullscreen; microphone; camera'/);assert.match(dock,/clipboard-write; microphone; camera/);
 assert.match(media,/camera.close\(\);closeMediaTray\(\)/);
});
