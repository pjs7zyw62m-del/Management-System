import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setupCorporateChatLive} from '../corporate-chat-live.js';
test('Typing bubble is mounted and message refresh retains updates during an active fetch',()=>{
 const html=readFileSync('corporate-chat.html','utf8'),js=readFileSync('corporate-chat.js','utf8');
 assert.match(html,/id="typingIndicator"[^>]*hidden/);assert.match(html,/id="typingName"/);
 assert.match(js,/if\(isLoading\)\{if\(urgent===true\)refreshAfterLoad=true;return\}/);
 assert.match(js,/if\(refreshAfterLoad\)\{refreshAfterLoad=false;void loadMessages\(\)\}/);
 assert.match(js,/realtimeReady\?5000:2500/);
});
test('Typing only appears for the visible conversation and refreshes after a concurrent update',async()=>{
 const old={window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval};
 let requests=0,resolveFirst;const label={hidden:true},name={};
 const win={addEventListener(){}};win.parent=win;globalThis.window=win;globalThis.document={hidden:false,addEventListener(){}};globalThis.setInterval=()=>0;
 const future=new Date(Date.now()+60000).toISOString();
 const client={from(){return {select(){return this},eq(){return this},maybeSingle(){requests++;return requests===1?new Promise(r=>resolveFirst=r):Promise.resolve({data:{expires_at:future},error:null})},delete(){return this},then(resolve){resolve({error:null})}}}};
 const ctl=setupCorporateChatLive({client,context:()=>({self:'me',peer:{user_id:'peer',display_name:'Contact'},ready:true}),typingLabel:label,typingName:name});
 try{
  ctl.setThreadOpen(true);ctl.onTypingChange({new:{user_id:'peer',peer_id:'me'}});assert.equal(requests,1);
  resolveFirst({data:null,error:null});await new Promise(r=>setImmediate(r));assert.equal(requests,2);assert.equal(label.hidden,false);assert.equal(name.textContent,'Contact is typing');
  ctl.setVisible(false);assert.equal(label.hidden,true);
 }finally{ctl.dispose();for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
