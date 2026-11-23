import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const script=read('private-photo-ledger-sender-reuse.js');
const sender=read('private-photo-ledger-simple-sender.js');
const core=read('private-photo-ledger.js');
const css=read('private-photo-ledger-sender-reuse.css');
const html=read('private-photo-ledger.html');
const sql=read('supabase/migrations/20261123153000_redline_approved_original_photo_reuse.sql');

test('server checks sender ownership, approved original, active room and blocks pending/rejected/tombstone copies',()=>{
 assert.match(sql,/v_source\.decision_status IS DISTINCT FROM 'accepted'/);
 assert.match(sql,/v_source\.resubmission_origin_id IS NOT NULL/);
 assert.match(sql,/v_source\.uploaded_by IS DISTINCT FROM \(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/member_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/active AND NOT photo_sending_paused/);
 assert.match(sql,/current_session_started_at/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/prior\.decision_status IN \('pending','rejected'\)/);
 assert.match(sql,/redline_no_removed_resubmission/);
 assert.doesNotMatch(sql,/v_rating IS DISTINCT FROM 5/);
 assert.match(core,/resubmissionAllowed:eligibleOriginal&&!rejected&&!pending/);
 assert.match(core,/async reusePhoto\(photoId\)/);
 assert.match(core,/resubmission_origin_id:photoId,decision_status:'pending'/);
 assert.match(core,/await readBunnyPhoto\(db,room\.id,source\.id\)/);
 assert.match(core,/await uploadBunnyPhoto\(db,room\.id,state\.user\.id,id,blob,mime\)/);
});

test('reuse button opens custom confirmation from sender Viewing, History and 5-Star Photos',()=>{
 assert.match(sender,/redline-reuse-photo-button/);
 assert.match(sender,/BLACKCELL_REDLINE_REUSE_UI\?\.open\(rootId,reuse\)/);
 assert.match(sender,/BLACKCELL_REDLINE_REUSE_UI\?\.open\(p\.id,button\)/);
 assert.match(sender,/BLACKCELL_REDLINE_REUSE_UI\?\.open\(photo\.id,action\)/);
 assert.doesNotMatch(sender,/window\.confirm\('Resend this 5-star original/);
 assert.match(css,/\.redline-reuse-overlay\[hidden\]/);
 assert.match(css,/max-height:calc\(100dvh - 24px\)/);
 assert.match(html,/private-photo-ledger-sender-reuse\.js\?v=20261123-reuse-popup1/);
 assert.match(html,/private-photo-ledger-sender-reuse\.css\?v=20261123-reuse-popup1/);
});

test('sender never uploads before confirmation and cannot reuse pending originals',async()=>{
 class Element{
  constructor(tag='div'){
   this.tag=tag;this.children=[];this.handlers={};this.attrs={};
   this.hidden=false;this.disabled=false;this.textContent='';this.style={};
  }
  addEventListener(t,cb){(this.handlers[t]??=[]).push(cb)}
  setAttribute(k,v){this.attrs[k]=v}
  append(...xs){this.children.push(...xs)}
  replaceChildren(...xs){this.children=[...xs]}
  focus(){document.activeElement=this}
 }
 const document={
  body:new Element('body'),activeElement:null,
  createElement:t=>new Element(t),addEventListener(){}
 };
 const id='11111111-1111-4111-8111-111111111111',roomId='22222222-2222-4222-8222-222222222222';
 const data={roomId,isOwner:false,roomActive:true,archiveMode:false,
  photoHistory:[{id,resubmissionAllowed:true,removal_status:null,image_url:'blob:private'}]};
 let current=data,calls=0,events=0;
 const window={BLACKCELL_REDLINE_API:{
   snapshot:()=>current,
   reusePhoto:async()=>{calls++;return {ok:true,photoId:'new-copy'}}
  },addEventListener(){},dispatchEvent(){events++}};
 runInNewContext(script,{window,document,Event:class{constructor(t){this.type=t}}});
 const opened=window.BLACKCELL_REDLINE_REUSE_UI.open(id,null);
 assert.equal(opened,true);
 assert.equal(calls,0,'photo must not be reused just by opening the dialog');
 const dialog=document.body.children[0],actions=dialog.children[0].children.at(-1);
 const submit=actions.children[0],close=actions.children[1];
 await submit.handlers.click[0]();
 assert.equal(calls,1);
 assert.equal(events,1);
 assert.equal(close.disabled,false);
 await close.handlers.click[0]();
 assert.equal(dialog.hidden,true);
 current={...data,photoHistory:[{...data.photoHistory[0],resubmissionAllowed:false}]};
 assert.equal(window.BLACKCELL_REDLINE_REUSE_UI.open(id,null),false);
 assert.equal(calls,1);
});
