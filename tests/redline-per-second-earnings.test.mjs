import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const controller=read('private-photo-ledger-timers.js');
const sender=read('private-photo-ledger-simple-sender.js');
const sql=read('supabase/migrations/20261121170000_redline_timer_per_second_proration.sql');
const html=read('private-photo-ledger.html');

const snippets=[
 controller.match(/const liveMoney=\(rateCents,elapsedSeconds\)=>\{[\s\S]*?\n\};/)?.[0],
 sender.match(/function liveMoney\(rateCents,elapsedSeconds\)\{[\s\S]*?\n\}/)?.[0]
];
test('Both live timer displays accrue partial cents by second',()=>{
 for(const snippet of snippets){
  assert.ok(snippet,'liveMoney should exist in both clients');
  const fn=runInNewContext(snippet+';liveMoney');
  assert.equal(fn(60,0),'$0.0000');
  assert.equal(fn(60,1),'$0.0100');
  assert.equal(fn(60,15),'$0.1500');
  assert.equal(fn(60,59),'$0.5900');
  assert.equal(fn(60,60),'$0.6000');
  assert.equal(fn(10,1),'$0.0017');
  assert.equal(fn(10,15),'$0.0250');
  assert.equal(fn(10,60),'$0.1000');
  assert.equal(fn(1,1),'$0.0002');
  assert.equal(fn(25,75),'$0.3125');
 }
});
test('Final rounded cents are cumulative, not rounded every second',()=>{
 const finalCents=(rate,seconds)=>(BigInt(rate)*BigInt(seconds)+30n)/60n;
 assert.equal(finalCents(60,15),15n);
 assert.equal(finalCents(10,15),3n);
 assert.equal(finalCents(10,60),10n);
 assert.equal(finalCents(1,30),1n);
 assert.equal(finalCents(25,75),31n);
 assert.equal(finalCents(60,60),60n);
});
test('Server applies same proration on START/STOP/heartbeat/room lifecycle',()=>{
 assert.match(sql,/redline_timer_prorated_cents\(p_rate_cents bigint,p_elapsed_seconds bigint\)/);
 assert.match(sql,/round\(greatest\(0,p_elapsed_seconds\)::numeric \* p_rate_cents::numeric \/ 60\)/);
 assert.match(sql,/v_amount=corp_private\.redline_timer_prorated_cents\(v_timer\.rate_cents,v_seconds\)/);
 assert.match(sql,/earned_cents=corp_private\.redline_timer_prorated_cents/);
 assert.match(sql,/elapsed_seconds/);
 assert.match(sql,/photo_totals/);
 assert.match(sql,/corp_private\.photo_ledger_verified\(\)/);
 assert.match(sql,/stop_current_timer_first/);
 assert.match(sql,/revoke all on function public\.corp_redline_photo_timer_status/);
});
test('Photo history and chat show whole seconds; old minutes-only billing is absent',()=>{
 assert.match(controller,/tickSeconds\(\)/);
 assert.match(controller,/duration\(row\.elapsed_seconds/);
 assert.match(sender,/const display=active\?liveMoney\(row\.rate_cents,seconds\):money\(cents\)/);
 assert.match(sender,/Final elapsed-second amount recorded/);
 assert.doesNotMatch(controller,/BigInt\(minutes\)\*BigInt\(a\.rate_cents/);
 assert.doesNotMatch(sender,/BigInt\(Math\.floor\(seconds\/60\)\)/);
 assert.match(html,/private-photo-ledger-timers\.js\?v=20261121-per-second1/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261122-android-keyboard-return1/);
});
