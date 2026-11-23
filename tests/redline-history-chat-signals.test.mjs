import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const core=readFileSync('private-photo-ledger.js','utf8');
const sender=readFileSync('private-photo-ledger-simple-sender.js','utf8');
const css=readFileSync('private-photo-ledger-simple-sender.css','utf8');
const preview=readFileSync('private-photo-ledger-owner-preview.js','utf8');
const sql=readFileSync('supabase/migrations/20261121184500_redline_sender_history_chat_signals.sql','utf8');
const html=readFileSync('private-photo-ledger.html','utf8');

function sampleHistory(){
 const body=core.slice(core.indexOf('function photoHistoryData(){'),core.indexOf('function fiveStarResubmissionData(){'));
 assert.match(body,/function photoHistoryData/);
 const id='00000000-0000-4000-8000-000000000002';
 const entries=[
  {id:'a',uploaded_by:id,decision_status:'accepted',amount_cents:1,created_at:'2026-11-21T08:00:00Z'},
  {id:'b',uploaded_by:id,decision_status:'accepted',amount_cents:0,created_at:'2026-11-21T08:01:00Z'},
  {id:'c',uploaded_by:id,decision_status:'accepted',amount_cents:100,created_at:'2026-11-21T08:02:00Z'},
  {id:'d',uploaded_by:id,decision_status:'rejected',amount_cents:null,created_at:'2026-11-21T08:03:00Z'},
  {id:'e',uploaded_by:id,decision_status:'pending',amount_cents:null,created_at:'2026-11-21T08:04:00Z'},
  {id:'f',uploaded_by:id,decision_status:'accepted',amount_cents:20,created_at:'2026-11-21T08:05:00Z'},
  {id:'copy_f',uploaded_by:id,decision_status:'pending',amount_cents:null,resubmission_origin_id:'f',created_at:'2026-11-21T08:06:00Z'},
  {id:'g',uploaded_by:id,decision_status:'accepted',amount_cents:50,created_at:'2026-11-21T08:07:00Z'},
  {id:'copy_g',uploaded_by:id,decision_status:'rejected',amount_cents:null,resubmission_origin_id:'g',created_at:'2026-11-21T08:08:00Z'},
  {id:'h',uploaded_by:id,decision_status:'accepted',amount_cents:40,resubmission_origin_id:'a',created_at:'2026-11-21T08:09:00Z'},
  {id:'not_member',uploaded_by:'another',decision_status:'accepted',amount_cents:100,created_at:'2026-11-21T08:10:00Z'}
 ];
 const ratings=new Map([
  ['a',{stars:5}],['b',{stars:5}],['c',{stars:4}],['d',{stars:5}],
  ['e',{stars:5}],['f',{stars:5}],['g',{stars:5}],['h',{stars:5}]
 ]);
 const state={room:{member_id:id,active:true,photo_sending_paused:false},
  entries,ratings,showArchive:false};
 const ratedPhotoData=e=>({id:e.id,created_at:e.created_at,
  stars:state.ratings.get(e.id)?.stars||0,amount_cents:e.amount_cents});
 const fn=runInNewContext(body+';photoHistoryData',{state,
  cents:value=>BigInt(value??0),ratedPhotoData});
 return {fn,state};
}
test('Sender history permits any approved original but blocks pending, rejected, archived or copied photos',()=>{
 const {fn,state}=sampleHistory();
 const photos=fn();
 const byId=Object.fromEntries(photos.map(p=>[p.id,p]));
 assert.equal(photos.length,10);
 for(const id of ['a','b','c']){
  assert.equal(byId[id].resubmissionAllowed,true,id);
 }
 for(const id of ['d','e','f','g','copy_f','copy_g','h']){
  assert.equal(byId[id].resubmissionAllowed,false,id);
 }
 assert.equal(byId.b.resubmissionStatus,'ready');
 assert.equal(byId.c.resubmissionStatus,'ready');
 assert.equal(byId.f.resubmissionStatus,'pending');
 assert.equal(byId.g.resubmissionStatus,'rejected');
 assert.equal(byId.not_member,undefined);
 state.room.photo_sending_paused=true;
 assert.equal(fn().find(p=>p.id==='a').resubmissionAllowed,false);
 state.room.photo_sending_paused=false;state.showArchive=true;
 assert.equal(fn().find(p=>p.id==='a').resubmissionAllowed,false);
});
test('Live database trigger permits approved originals while preserving room, pending and rejection checks',()=>{
 const current=readFileSync('supabase/migrations/20261123153000_redline_approved_original_photo_reuse.sql','utf8');
 assert.match(current,/v_source.decision_status IS DISTINCT FROM 'accepted'/);
 assert.doesNotMatch(current,/v_rating IS DISTINCT FROM 5/);
 assert.doesNotMatch(current,/coalesce\(v_source.amount_cents,0\)<1/);
 assert.match(current,/pg_advisory_xact_lock/);
 assert.match(current,/prior.decision_status IN \('pending','rejected'\)/);
 assert.match(current,/v_source.resubmission_origin_id IS NOT NULL/);
 assert.match(current,/member_id=\(SELECT auth.uid\(\)\)/);
 assert.match(current,/current_session_started_at/);
 assert.match(sql,/photo_ledger_verified\(\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on corp_private.redline_chat_signals/);
 assert.match(sql,/revoke all on function public.corp_redline_chat_signal/);
 assert.match(sql,/last_read_at/);
 assert.match(sql,/typing_until/);
});
test('Sender UI and owner read-only preview expose Photo History next to Earnings',()=>{
 assert.match(sender,/\['earnings','Earnings'\],\['history','Photo History'\]/);
 assert.match(sender,/function renderPhotoHistory\(snap\)/);
 assert.match(sender,/BLACKCELL_REDLINE_REUSE_UI\?\.open\(p.id,button\)/);
 assert.match(sender,/historyVisible\+=40/);
 assert.match(preview,/\['history','(?:Photo History|History)',historyPanel\]/);
 assert.match(preview,/renderPreviewPhotoHistory\(\)/);
 assert.match(preview,/btn.disabled=true/);
 assert.match(css,/repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(html,/private-photo-ledger-owner-preview\.js\?v=20261121-current-viewing1/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261123-sender-reuse-popup1/);
});
test('Read receipts and typing presence only use authenticated current room',()=>{
 assert.match(core,/async chatSignal\(roomId,action,messageId=null\)/);
 assert.match(core,/async chatStatus\(roomId\)/);
 assert.match(sender,/peerReadAt/);
 assert.match(sender,/reportRead\(\)/);
 assert.match(sender,/chatVisible\(snap/);
 assert.match(sender,/peerTyping/);
 assert.match(sender,/✓✓ Read/);
 assert.match(sender,/typingNotice/);
 assert.match(sender,/window.setInterval\(\(\)=>\{if\(!document.hidden\)void pollChatStatus\(\)\},1500\)/);
});
test('Running timer stays pinned in conversation until server STOP',()=>{
 assert.match(sender,/card.classList.add\('redline-chat-timer-pinned'\)/);
 assert.match(sender,/if\(pinned\)\{/);
 assert.match(sender,/The active timer is pinned separately ABOVE messages/);
 assert.match(css,/\.redline-message-card > \.redline-chat-timer-slot/);
 assert.match(sender,/timerSlot\.append\(card\)/);
 assert.match(sender,/messageCard\.append\(msgHeader,timerSlot,feed/);
 assert.match(css,/position:sticky!important/);
 assert.match(sender,/if\(e.kind==='timer'\)return makeTimerCard\(e\)/);
 assert.match(sender,/if\(timerSlot\.dataset\.redlinePinnedId!==pinId\)\{/);
});
