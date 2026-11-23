import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const alert=read('private-photo-ledger-trigger-alerts.js');
const css=read('private-photo-ledger-trigger-alerts.css');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');

test('Android trigger match popup is wired to REDLINE without changing chat layout',()=>{
 assert.match(html,/private-photo-ledger-trigger-alerts\.js\?v=20261123-sender-enable-popup1/);
 assert.match(html,/private-photo-ledger-trigger-alerts\.css\?v=20261123-sender-live-alert1/);
 assert.match(css,/\.redline-trigger-earned-overlay\[hidden\]/);
 assert.match(css,/position:fixed!important/);
 assert.match(os,/redlineRelease=20261123-trigger-cost-no-popup2/);
 assert.match(alert,/triggerWordStatus\(target\)/);
 assert.match(alert,/window\.setInterval\(tick,4500\)/);
 assert.match(alert,/response\.enabled/);
 assert.doesNotMatch(alert,/(?:sendMessage|INSERT INTO|db\.rpc|triggerWordSave|triggerEnable)\(/);
 assert.doesNotMatch(alert,/scrollTop|appendChild\(messageCard\)|document\.body\.style\.overflow/);
});
test('receiver enablement opens sender explanation once, never treats enablement as earned money',()=>{
 assert.match(alert,/function maybeExplainActivation\(response,room\)/);
 assert.match(alert,/response\?\.enabled!==true/);
 assert.match(alert,/!Array\.isArray\(response\.words\)\|\|!response\.words\.length/);
 assert.match(alert,/markActivationSeen\(room\)/);
 assert.match(alert,/window\.dispatchEvent\(new Event\('blackcell:redline:open-trigger-words'\)\)/);
 assert.match(alert,/window\.sessionStorage\?\.setItem\(activationKey\(room\),'yes'\)/);
 assert.match(alert,/window\.sessionStorage\?\.removeItem\(activationKey\(room\)\)/);
 assert.match(alert,/focused\?\.matches\?\.\('input,textarea,\[contenteditable="true"\]'\)/);
});

test('No old notifications replay; new verified credit pops; receiver and disabled rooms never see popup',async()=>{
 class El{
  constructor(tag='div'){
   this.tagName=tag.toUpperCase();this.children=[];this.hidden=false;
   this.events={};this.attrs={};this.style={setProperty(){}};
   this.textContent='';this.className='';
  }
  append(...v){this.children.push(...v)}
  replaceChildren(...v){this.children=[...v]}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(t,f){(this.events[t]??=[]).push(f)}
 }
 const view={body:new El('body'),hidden:false,
  createElement:t=>new El(t),getElementById:()=>({hidden:false}),
  addEventListener(){}};
 let snap={roomId:'room',isOwner:false,roomActive:true,archiveMode:false};
 const hit=(time,word='wonderful')=>({recorded_at:time,word,price_cents:25});
 let payload={ok:true,enabled:true,recent:[hit('old')]};
 let polls=0;
 const listeners={};
 const win={
  BLACKCELL_REDLINE_API:{snapshot:()=>snap,
   triggerWordStatus:async()=>{polls++;return payload}},
  addEventListener:(t,f)=>{(listeners[t]??=[]).push(f)},
  dispatchEvent:()=>{},
  setInterval:()=>0
 };
 const context={
  document:view,window:win,Event:class{constructor(t){this.type=t}},
  setTimeout:()=>1,clearTimeout:()=>{},Date,Number,Set,String,Array
 };
 runInNewContext(alert,context);
 await Promise.resolve();await Promise.resolve();
 const popup=view.body.children[0];
 assert.equal(popup.hidden,true,'Old hits should establish baseline');
 assert.equal(polls,1);
 payload={...payload,recent:[hit('new'),hit('old')]};
 await win.BLACKCELL_REDLINE_TRIGGER_ALERTS.check();
 assert.equal(popup.hidden,false,'Fresh verified credit should popup');
 assert.equal(popup.children[1].children[4].textContent,'+$0.25');
 popup.children[1].children[0].events.click[0]();
 assert.equal(popup.hidden,true);
 payload={...payload,enabled:false,recent:[hit('disabled'),hit('new'),hit('old')]};
 await win.BLACKCELL_REDLINE_TRIGGER_ALERTS.check();
 assert.equal(popup.hidden,true,'Disabled trigger cannot generate popup');
 snap={...snap,isOwner:true};
 for(const f of listeners['blackcell:redline:state']??[])f();
 await win.BLACKCELL_REDLINE_TRIGGER_ALERTS.check();
 assert.equal(popup.hidden,true,'Receiver does not see sender popup');
});
