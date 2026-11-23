import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const receiver=read('private-photo-ledger-receiver.js');
const sender=read('private-photo-ledger-simple-sender.js');
const senderWords=read('private-photo-ledger-trigger-words.js');
const owner=read('private-photo-ledger-trigger-owner.js');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');

test('Receiver header and menu expose Trigger Words without relying on hidden Settings',()=>{
 assert.match(receiver,/redlineReceiverTriggerQuick/);
 assert.match(receiver,/rr-trigger-menu/);
 assert.match(receiver,/blackcell:redline:open-trigger-owner/);
 assert.match(owner,/window\.addEventListener\('blackcell:redline:open-trigger-owner'/);
 assert.match(html,/private-photo-ledger-trigger-owner\.js\?v=20261123-trigger-visible-controls1/);
 assert.match(html,/private-photo-ledger-trigger-owner\.css\?v=20261123-trigger-visible-controls1/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261123-trigger-visible-controls1/);
 assert.match(os,/redlineRelease=20261123-trigger-visible-controls1/);
});

test('Sender can open Trigger Words directly from Photos & Chat',()=>{
 assert.match(sender,/redline-sender-trigger-shortcut/);
 assert.match(sender,/blackcell:redline:open-trigger-words/);
 assert.match(senderWords,/window\.addEventListener\('blackcell:redline:open-trigger-words'/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261123-trigger-visible-controls1/);
 assert.match(html,/private-photo-ledger-trigger-words\.js\?v=20261123-trigger-visible-controls1/);
});

test('Receiver Trigger Words uses verified real server status and an owner-only opt-in',()=>{
 assert.match(owner,/s\?\.isOwner===true/);
 assert.match(owner,/await api\(\)\.triggerWordStatus\(roomId\)/);
 assert.match(owner,/api\(\)\.setRoomFeature\(o\.roomId,'trigger_words_enabled',turnOn\)/);
 assert.match(owner,/words.length===0&&!d.enabled/);
 assert.match(owner,/window\.confirm/);
 assert.match(owner,/No credits yet/);
 assert.match(owner,/No words configured yet/);
 assert.doesNotMatch(owner,/(?:db\.from|db\.rpc|localStorage|sessionStorage)/);
});

test('Owner sees server-saved words and can toggle approval in the actual dialog without fake earnings',async()=>{
 class Element{
  constructor(tag='div'){
   this.children=[];this.open=false;this.hidden=false;this.disabled=false;
   this.events={};this.attrs={};this.textContent='';this.className='';
   this.classList={toggle:(key,value)=>{this.attrs[key]=value}};
  }
  append(...xs){this.children.push(...xs)}
  replaceChildren(...xs){this.children=[...xs]}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn)}
  showModal(){this.open=true}
  close(){this.open=false;for(const fn of this.events.close??[])fn()}
 }
 const body=new Element('body'),ledger=new Element(),room=new Element(),quick=new Element();
 const document={
  body,createElement:t=>new Element(t),
  querySelector:q=>q==='#ledgerApp'?ledger:q==='#activeRoom'?room:q==='#redlineReceiverTriggerQuick'?quick:null,
  addEventListener(){}
 };
 const events={};
 const current={roomId:'verified-room',isOwner:true,roomActive:true,archiveMode:false};
 let enabled=true,toggles=0;
 const data=()=>({
  ok:true,room_id:current.roomId,enabled,
  words:[{word:'wonderful',price_cents:25},{word:'excellent',price_cents:10}],
  recent:[],session_total_cents:0
 });
 const window={
  BLACKCELL_REDLINE_API:{
   snapshot:()=>current,
   triggerWordStatus:async()=>data(),
   setRoomFeature:async(_,key,next)=>{assert.equal(key,'trigger_words_enabled');toggles++;enabled=next}
  },
  addEventListener:(name,callback)=>{(events[name]??=[]).push(callback)},
  dispatchEvent:event=>{for(const cb of events[event.type]??[])cb(event)},
  setInterval(){},confirm:()=>true
 };
 runInNewContext(owner,{window,document,Event:class{constructor(t){this.type=t}}});
 window.dispatchEvent({type:'blackcell:redline:open-trigger-owner'});
 for(let i=0;i<12;i++)await Promise.resolve();
 const dialog=body.children[0],status=dialog.children[2],rows=dialog.children[4],toggle=dialog.children[7];
 assert.equal(dialog.open,true);
 assert.match(status.textContent,/ENABLED/);
 assert.equal(rows.children.length,2);
 assert.match(rows.children[0].children[0].textContent,/wonderful/);
 assert.match(toggle.textContent,/DISABLE/);
 await toggle.events.click[0]();
 for(let i=0;i<16;i++)await Promise.resolve();
 assert.equal(toggles,1);
 assert.equal(enabled,false);
 assert.match(toggle.textContent,/ENABLE/);
});
