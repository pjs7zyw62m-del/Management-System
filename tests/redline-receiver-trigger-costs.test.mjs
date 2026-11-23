import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const src=read('private-photo-ledger-receiver-trigger-costs.js');
const css=read('private-photo-ledger-receiver-trigger-costs.css');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');
const core=read('private-photo-ledger.js');
test('Receiver costs are visible and come only from authenticated server results',()=>{
 assert.match(html,/private-photo-ledger-receiver-trigger-costs\.js\?v=20261123-trigger-cost-no-popup2/);
 assert.match(html,/private-photo-ledger-receiver-trigger-costs\.css\?v=20261123-trigger-cost-no-popup2/);
 assert.match(html,/private-photo-ledger\.js\?v=20261123-photo-credit-counter-inline1/);
 assert.match(os,/redlineRelease=20261123-photo-credit-counter-inline1/);
 assert.match(src,/redlineReceiverTriggerCost/);
 assert.match(src,/triggerWordStatus\(id\)/);
 assert.match(src,/session_total_cents/);
 assert.match(src,/price_cents/);
 assert.match(src,/roomPaymentStatus\?\.\(id,false\)/);
 assert.match(core,/blackcell:redline:owner-chat-sent/);
 assert.doesNotMatch(css,/redline-receiver-trigger-notice/);
 assert.doesNotMatch(src,/redline-receiver-trigger-notice|showNotice|showCostToast|setTimeout/);
 assert.doesNotMatch(src,/db\.rpc|db\.from|localStorage|sessionStorage|sendMessage\(/);
});
test('Receiver sees ongoing charges in header silently, with no notification popup',async()=>{
 class El{
  constructor(tag='div'){
   this.tag=tag;this.children=[];this.parentNode=null;this.isConnected=true;
   this.textContent='';this.className='';this.hidden=false;this.events={};this.attrs={};
  }
  append(...xs){for(const x of xs){x.parentNode=this;this.children.push(x)}}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(k,f){(this.events[k]??=[]).push(f)}
  remove(){this.parentNode=null;this.isConnected=false}
 }
 const body=new El('body'),header=new El('header'),ledger=new El('main'),room=new El('section');
 const document={
  body,hidden:false,createElement:t=>new El(t),
  querySelector:q=>q==='#ledgerApp'?ledger:q==='#activeRoom'?room:
   q==='#redlineReceiverCommand .rr-command-header'?header:null,
  addEventListener(){}
 };
 const handlers={};
 let role={isOwner:true,roomActive:true,roomId:'mock-room',archiveMode:false};
 const hit=(id,word,price_cents)=>({recorded_at:id,word,price_cents});
 let hits=[hit('old','perfect',15)],payments=0;
 const window={
  BLACKCELL_REDLINE_API:{
   snapshot:()=>role,
   triggerWordStatus:async()=>({
    ok:true,enabled:true,
    session_total_cents:hits.reduce((sum,x)=>sum+x.price_cents,0),
    recent:hits
   }),
   roomPaymentStatus:async()=>{payments++;return {ok:true}}
  },
  addEventListener:(name,fn)=>{(handlers[name]??=[]).push(fn)},
  dispatchEvent:e=>{for(const fn of handlers[e.type]??[])fn(e)},
  setInterval(){}
 };
 runInNewContext(src,{
  window,document,Event:class{constructor(type){this.type=type}},
  setTimeout:()=>1,clearTimeout:()=>{},Set,Date,Number,String
 });
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(header.children.length,1);
 const strip=header.children[0];
 assert.equal(strip.children[1].textContent,'$0.15');
 assert.equal(body.children.length,0,'Do not create an expense popup');
 hits=[hit('new','wonderful',25),...hits];
 window.dispatchEvent({type:'blackcell:redline:owner-chat-sent'});
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(strip.children[1].textContent,'$0.40');
 assert.equal(body.children.length,0,'New credits must not display a cost popup');
 assert.equal(payments,1,'A confirmed new cost refreshes owner financial totals once');
 role={...role,isOwner:false};
 window.dispatchEvent({type:'blackcell:redline:state'});
 for(let i=0;i<4;i++)await Promise.resolve();
 assert.equal(strip.isConnected,false,'Sender cannot see receiver cost strip');
 assert.equal(body.children.length,0,'No cost popup exists at all');
});
