import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const src=read('private-photo-ledger-counteroffer-inline.js');
const css=read('private-photo-ledger-counteroffer-inline.css');
const sender=read('private-photo-ledger-simple-sender.js');
const consent=read('private-photo-ledger-consent-negotiation.js');
const core=read('private-photo-ledger.js');
const migration=read('supabase/migrations/20261123190000_redline_sender_open_eligible_counteroffer.sql');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');

test('Sender has optional Counteroffer next to Approved Price, without an automatic sender dialog',()=>{
 assert.match(sender,/approvedPriceControl\(photo,snap\)/);
 assert.match(sender,/viewingPreview\.append\(approvedPriceControl\(photo,snap\)\)/);
 assert.match(sender,/info\.append\(approvedPriceControl\(p,snap\)\)/);
 assert.match(sender,/details\.append\(approvedPriceControl\(p,snap\)\)/);
 assert.match(consent,/if\(s\.isOwner&&data\.enabled&&pending/);
 assert.match(consent,/window\.BLACKCELL_REDLINE_NEGOTIATION_INLINE=Object\.freeze/);
 assert.match(consent,/blackcell:redline:negotiations-updated/);
 assert.match(src,/APPROVED PRICE /);
 assert.match(src,/COUNTEROFFER/);
 assert.match(src,/editor\.hidden=!editor\.hidden/);
 assert.match(css,/\.redline-inline-price-row/);
 assert.match(html,/private-photo-ledger-counteroffer-inline\.js\?v=20261123-photo-credit-counter-inline1/);
 assert.match(html,/private-photo-ledger-counteroffer-inline\.css\?v=20261123-photo-credit-counter-inline1/);
 assert.match(html,/private-photo-ledger-consent-negotiation\.js\?v=20261123-photo-credit-counter-inline1/);
 assert.match(os,/redlineRelease=20261123-photo-credit-counter-inline1/);
 assert.doesNotMatch(src,/showModal\(|openDialog\(|window\.alert\(/);
});
test('Eligible prior approvals can counteroffer once without reopening finalized prices',()=>{
 assert.match(migration,/corp_redline_price_negotiation_open/);
 assert.match(migration,/photo_ledger_verified\(\)/);
 assert.match(migration,/v_room\.member_id<>v_uid/);
 assert.match(migration,/v_entry\.settled_at IS NOT NULL/);
 assert.match(migration,/v_entry\.auto_timer_session_id IS NOT NULL/);
 assert.match(migration,/v_entry\.decision_status<>'accepted'/);
 assert.match(migration,/price_already_final_or_awaiting_receiver/);
 assert.match(migration,/ON CONFLICT\(photo_id\) DO NOTHING/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.corp_redline_price_negotiation_open\(uuid\) FROM PUBLIC,anon/);
 assert.match(core,/db\.rpc\('corp_redline_price_negotiation_open'/);
 assert.match(src,/await api\.priceNegotiationOpen\(photo\.id\)/);
 assert.match(src,/await api\.priceNegotiationAction\(photo\.id,'counter',amount\?\?null\)/);
 assert.match(src,/Number\(offer\.offer_count\)<3/);
});
test('On Android the button opens inline input; sender action reaches verified API without popup',async()=>{
 class El{
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.textContent=''}
  append(...items){this.children.push(...items)}
  addEventListener(name,handler){(this.events[name]??=[]).push(handler)}
  setAttribute(name,value){this[name]=value}
  querySelectorAll(tag){
   const find=n=>[...n.children.filter(c=>c.tag===tag),
    ...n.children.flatMap(c=>find(c))];
   return find(this)
  }
  focus(){}
 }
 const document={createElement:t=>new El(t)};
 const calls=[],events=[];
 const window={
  BLACKCELL_REDLINE_NEGOTIATION_INLINE:{
   offer:()=>null,status:()=>null,refresh:async()=>{calls.push('refresh')}
  },
  BLACKCELL_REDLINE_API:{
   priceNegotiationOpen:async()=>{calls.push('open')},
   priceNegotiationAction:async(_,action,amount)=>{calls.push([action,amount])}
  },
  dispatchEvent:e=>events.push(e.type)
 };
 runInNewContext(src,{window,document,Event:class{constructor(type){this.type=type}},BigInt,Number,String});
 const photo={id:'photo-123',amount_cents:100,settled_at:null,auto_timer_session_id:null};
 const snap={isOwner:false,roomActive:true,archiveMode:false,paymentHistory:[]};
 const widget=window.BLACKCELL_REDLINE_COUNTEROFFER_INLINE.control(photo,snap);
 assert.equal(widget.children[0].children[0].textContent,'APPROVED PRICE $1.00');
 const button=widget.children[0].children[1];
 assert.equal(button.disabled,false);
 assert.equal(widget.children[1].hidden,true);
 button.events.click[0]();
 const form=widget.children[1];
 assert.equal(form.hidden,false,'Counteroffer is an inline editor, not a dialog');
 form.children[0].value='1.25';
 form.events.submit[0]({preventDefault(){}});
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.deepEqual(calls,['open',['counter',125],'refresh']);
 assert.ok(events.includes('blackcell:redline:negotiation-changed'));
 assert.equal(form.hidden,true);
 assert.equal(document.body,undefined,'No popup created in document body');
 const priceFinal=window.BLACKCELL_REDLINE_COUNTEROFFER_INLINE.control(photo,snap);
 window.BLACKCELL_REDLINE_NEGOTIATION_INLINE.status=()=>({status:'original_final'});
 const priceLocked=window.BLACKCELL_REDLINE_COUNTEROFFER_INLINE.control(photo,snap);
 assert.equal(priceLocked.children[0].children[1].disabled,true);
 assert.equal(window.BLACKCELL_REDLINE_COUNTEROFFER_INLINE.control(photo,{...snap,isOwner:true}).children[0].children[1].disabled,true);
});
