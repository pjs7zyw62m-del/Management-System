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
 assert.equal(await h.api.preview({isTrusted:false}),false);
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
