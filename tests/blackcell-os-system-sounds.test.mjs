import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const launch=readFileSync('blackcell-os-launch.js','utf8');
const source=launch.slice(launch.indexOf('/* Original, lightweight system tones.'),launch.indexOf("window.addEventListener('pagehide',stop);"));
function harness(search=''){
 let played=0,ctx=null;
 const listeners={},winListeners={},memory={};
 class AudioContext{
  constructor(){ctx=this;this.state='suspended';this.currentTime=1}
  resume(){this.state='running';return Promise.resolve()}
  close(){this.state='closed';return Promise.resolve()}
  createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){played++},stop(){}}}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
 }
 const win={AudioContext,addEventListener:(k,fn)=>winListeners[k]=fn};
 const doc={hidden:false,addEventListener:(k,fn)=>listeners[k]=fn};
 const storage={getItem:k=>memory[k]||null,setItem:(k,v)=>memory[k]=v};
 const audio={paused:true,ended:false,addEventListener(){}};
 new Function('window','document','localStorage','location','audio','muted',source)(win,doc,storage,{search},audio,()=>false);
 return {api:win.BLACKCELL_SYSTEM_SOUNDS,doc,audio,memory,gesture:()=>listeners.pointerdown({isTrusted:true}),ready:()=>winListeners['blackcell:desktop-ready'](),exit:()=>winListeners.pagehide({persisted:false}),count:()=>played,context:()=>ctx,advance:()=>{ctx.currentTime+=1}};
}
test('System tones require browser activation and suppress repeat actions',async()=>{
 const h=harness();
 assert.equal(h.api.preferences().enabled,true);
 assert.equal(h.api.play('open'),false);
 assert.equal(h.context(),null);
 assert.deepEqual(await h.api.preview({isTrusted:false}),{ok:false,reason:'gesture'});
 await h.gesture();
 assert.equal(h.context().state,'running');
 assert.equal(h.api.play('open'),true);
 assert.equal(h.count(),2);
 assert.equal(h.api.play('close'),false);
});
test('Mute, volume, hidden documents and spoken announcement remain protected',async()=>{
 const h=harness();await h.gesture();
 h.api.setPreference({enabled:false});assert.equal(h.api.play('notice'),false);
 h.api.setPreference({enabled:true,volume:0});assert.equal(h.api.play('notice'),false);
 h.api.setPreference({volume:.4});h.doc.hidden=true;assert.equal(h.api.play('notice'),false);
 h.doc.hidden=false;h.audio.paused=false;assert.equal(h.api.play('notice'),false);
 h.audio.paused=true;assert.equal(h.api.play('notice'),true);
 assert.equal(JSON.parse(h.memory['bc.os.system-sounds.v1']).volume,.4);
});
test('Startup plays once, update navigation stays quiet, and page exit releases context',async()=>{
 const h=harness();await h.gesture();h.ready();assert.equal(h.count(),4);
 h.advance();h.ready();assert.equal(h.count(),4);
 h.exit();assert.equal(h.api.play('open'),false);assert.equal(h.context().state,'closed');
 const updated=harness('?bc_os_release=release123');await updated.gesture();updated.ready();assert.equal(updated.count(),0);
});
test('HTML, startup engine and settings share the release references',()=>{
 const html=readFileSync('blackcell-os.html','utf8'),os=readFileSync('blackcell-os.js','utf8'),manifest=readFileSync('blackcell-site-version.json','utf8');
 const build=html.match(/name="blackcell-os-client-build" content="([^"]+)"/)?.[1];
 assert.ok(build);
 assert.equal(build,manifest.match(/"fallback":"([^"]+)"/)?.[1]);
 assert.match(html,/blackcell-os-launch\.js\?[^"']+/);
 assert.match(os,/blackcell-os-settings\.js\?[^"']+/);
 assert.match(os,/BLACKCELL_SYSTEM_SOUNDS\?\.play/);
});

test('Settings section buttons keep working when workspace persistence throws',()=>{
 const source=readFileSync('blackcell-os-settings.js','utf8').replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'');
 class Element {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.classList={add(){},toggle(){}};this.textContent='';this.scrollTop=0;}
  append(...items){this.children.push(...items)}
  replaceChildren(...items){this.children=items}
  setAttribute(){}
 }
 const document={createElement:tag=>new Element(tag),querySelector:()=>({content:'test-build'})};
 const window={addEventListener(){},removeEventListener(){},BLACKCELL_SYSTEM_SOUNDS:{preferences:()=>({enabled:true,available:true,volume:.35})}};
 const mount=new Function('document','window','Node','mountWallpaperControls',source+';return mountSettings;')(document,window,Element,()=>{});
 const host=new Element('div');
 const app=mount(host,{alive:()=>true,account:()=>({name:'Demo',username:'demo',access:'Owner',clearance:'7'}),preferences:()=>({}),onSection:()=>{throw Error('Simulated persistence failure')},openOrStore(){},openStore(){}});
 const [nav,body]=host.children;
 const click=label=>{const button=nav.children.find(x=>x.children[1]?.textContent===label);assert.ok(button,label);button.onclick({preventDefault(){}});assert.equal(body.children[0].children[1].textContent,label)};
 for(const label of ['Account','Sound','About','General'])click(label);
 app.dispose();
});
test('Active window taps do not trigger repeated workspace raises',()=>{
 const source=readFileSync('blackcell-os.js','utf8');
 const start=source.indexOf("w.addEventListener('pointerdown',event=>{");
 const end=source.indexOf('},true);',start);
 assert.ok(start>=0&&end>start);
 const handler=source.slice(start,end+8);
 let calls=0,listener;
 const r={suspended:false,el:{hidden:false}},w={addEventListener:(_,fn)=>listener=fn};
 const run=new Function('w','r','selectedWindow','raise',handler);
 run(w,r,r,()=>calls++);
 listener({target:{closest:()=>null}});assert.equal(calls,0);
 run(w,r,null,()=>calls++);
 listener({target:{closest:()=>null}});assert.equal(calls,1);
 listener({target:{closest:()=>true}});assert.equal(calls,1);
});

test('Explicit sample uses trusted native media playback and reports actual completion',async()=>{
 let player,called=false,wave;
 class Audio{
  constructor(){player=this;this.listeners=new Map();this.paused=true}
  pause(){this.paused=true}
  addEventListener(name,fn){this.listeners.set(name,fn)}
  removeEventListener(name){this.listeners.delete(name)}
  play(){called=true;this.paused=false;return Promise.resolve()}
 }
 const win={addEventListener(){}},doc={hidden:false,addEventListener(){}};
 const storage={getItem:()=>null,setItem(){}};
 const url={createObjectURL:b=>{wave=b;return 'blob:test'},revokeObjectURL(){}};
 new Function('window','document','localStorage','location','audio','muted','Audio','URL',source)(win,doc,storage,{search:''},{paused:true,ended:false,addEventListener(){}},()=>false,Audio,url);
 const api=win.BLACKCELL_SYSTEM_SOUNDS;
 assert.equal(api.preferences().available,true);
 const result=api.preview({isTrusted:true});
 assert.equal(called,true,'play is called synchronously in click handler');
 assert.equal(player.muted,false);
 assert.equal(wave.type,'audio/wav');
 const bytes=new Uint8Array(await wave.arrayBuffer());
 assert.equal(Buffer.from(bytes.slice(0,4)).toString(),'RIFF');
 assert.ok(bytes.slice(44).some(n=>n!==0),'generated PCM is not silent');
 player.listeners.get('ended')();
 assert.deepEqual(await result,{ok:true,output:'media'});
 player.play=()=>Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}));
 assert.deepEqual(await api.preview({isTrusted:true}),{ok:false,reason:'blocked'});
 api.setPreference({enabled:false});
 assert.deepEqual(await api.preview({isTrusted:true}),{ok:false,reason:'muted'});
});

test('Sound library exposes 21 distinct entries and original voice clips with single-player interruption',async()=>{
 let player,wave;
 class Audio{
  constructor(){player=this;this.listeners=new Map()}
  pause(){}
  addEventListener(n,f){this.listeners.set(n,f)}
  removeEventListener(n){this.listeners.delete(n)}
  play(){return Promise.resolve()}
 }
 const win={addEventListener(){}},doc={hidden:false,addEventListener(){}};
 const url={createObjectURL:b=>{wave=b;return 'blob:library'},revokeObjectURL(){}};
 new Function('window','document','localStorage','location','audio','muted','Audio','URL',source)(win,doc,{getItem:()=>null,setItem(){}},{search:''},{paused:true,ended:false,addEventListener(){}},()=>false,Audio,url);
 const api=win.BLACKCELL_SYSTEM_SOUNDS;
 const library=api.library();
 assert.equal(library.length,21);
 assert.equal(new Set(library.map(x=>x.id)).size,21);
 const files={security:'blackcell-security-announcement.mp3',welcome:'blackcell-welcome-david2.mp3',access:'blackcell-access-granted-david.mp3',initialize:'blackcell-os-launch-david.mp3'};
 for(const [id,file] of Object.entries(files)){
  assert.ok(readFileSync(file).length>0);
  const result=api.preview({isTrusted:true},id);
  assert.ok(player.src.startsWith(file));
  player.listeners.get('ended')();
  assert.equal((await result).ok,true);
 }
 const first=api.preview({isTrusted:true},'crystal');
 const second=api.preview({isTrusted:true},'pulse');
 assert.deepEqual(await first,{ok:false,reason:'stopped'});
 assert.ok(new Uint8Array(await wave.arrayBuffer()).slice(44).some(n=>n!==0));
 api.stop();
 assert.deepEqual(await second,{ok:false,reason:'stopped'});
 assert.deepEqual(await api.preview({isTrusted:true},'invalid'),{ok:false,reason:'unknown'});
});

test('Dedicated iMessage arrival tone is audible after activation and respects mute',async()=>{
 const h=harness();await h.gesture();
 assert.equal(h.api.library().find(x=>x.id==='message').label,'iMessage arrival');
 assert.equal(h.api.play('message'),true);assert.equal(h.count(),2);
 h.advance();h.api.setPreference({enabled:false});assert.equal(h.api.play('message'),false);assert.equal(h.count(),2);
 const os=readFileSync('blackcell-os.js','utf8'),dock=readFileSync('corporate-chat-dock.js','utf8');
 assert.ok(os.includes("osNotice('iMessage · '+count+(initial?' unread':' new')+' message'+(count===1?'':'s'),'message')"));
 assert.match(os,/function osNotice\(message,sound='notice'\)/);
 assert.match(dock,/messageSound\?\.play\(\)/);
});
