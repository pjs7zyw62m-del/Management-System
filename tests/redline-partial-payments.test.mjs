import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(path,'utf8');
const core=read('private-photo-ledger.js');
const ui=read('private-photo-ledger-receiver.js');
const sender=read('private-photo-ledger-simple-sender.js');
const sql=read('supabase/migrations/20261121164500_redline_partial_payments.sql');

test('partial payment button and accessible modal coexist with Pay in Full',()=>{
 assert.match(ui,/button\('PARTIAL PAYMENT',\(\)=>void openPartialPayment\(\)/);
 assert.match(ui,/const payFull=button\('PAY IN FULL'/);
 assert.match(ui,/payColumn\.append\(payFull,partialPay,payFeedback\)/);
 assert.match(ui,/partialDialog\.showModal\(\)/);
 assert.match(ui,/payBusy=true;savePartial\.disabled=true/);
 assert.match(ui,/api\.recordPartialPayment\(partialRoom,Number\(amount\),partialNote\.value\)/);
 assert.match(ui,/REMAINING AFTER PAYMENT/);
 assert.match(ui,/new Date\(payment\.created_at\)\.toLocaleString\(\)/);
 assert.match(ui,/REDLINE will not transfer funds/);
 assert.match(ui,/partialAmount\.value\.startsWith\('\.'\)/);
});
test('actual money parser uses integer cents, rejects zero, negatives, excess decimals and overflow',()=>{
 const a=ui.indexOf(' function parsePaymentCents(value){');
 const b=ui.indexOf(" partialAmount.addEventListener('input'",a);
 assert.ok(a>=0&&b>a,'parser source not found');
 const parse=runInNewContext('('+ui.slice(a,b).trim()+')');
 assert.equal(parse('0.01'),1n);
 assert.equal(parse('0.10'),10n);
 assert.equal(parse('8.6'),860n);
 assert.equal(parse('1,000.25'),100025n);
 for(const value of ['0','0.00','-1','.10','1.256','1e6','9007199254740992.00']){
  assert.throws(()=>parse(value),'Invalid amount accepted: '+value);
 }
});
test('real balance rendering applies $0.60 credit to oldest $0.75 photo and never inflates balance',()=>{
 const a=core.indexOf('function updateTotals(){');
 const b=core.indexOf('\nfunction clearImageCache(){',a+25);
 const fn=core.slice(a,b);
 assert.match(fn,/summary\.payment_credit_cents/);
 const entries=[
  {id:'a',decision_status:'accepted',amount_cents:75,
   created_at:'2026-11-20T10:00:00Z'},
  {id:'b',decision_status:'accepted',amount_cents:25,
   created_at:'2026-11-20T10:01:00Z'},
  {id:'c',decision_status:'accepted',amount_cents:50,
   created_at:'2026-11-20T10:02:00Z'}
 ];
 const state={entries,paymentAllocations:new Map(),paymentStatus:{
  scope:'room|false|',assigned_cents:150,paid_cents:60,remaining_cents:90,payment_credit_cents:60
 }};
 const output=new Map();
 const ctx={state,cents:v=>BigInt(String(v??0)),dollars:v=>'$'+(Number(v)/100).toFixed(2),
  authoritativePaymentStatus:()=>state.paymentStatus,
  show:(key,val)=>output.set(key,val),window:{dispatchEvent:()=>{}},Event:class{},
  Date};
 const update=runInNewContext('('+fn.trim()+')',ctx);
 update();
 assert.equal(output.get('totalAssigned'),'$1.50');
 assert.equal(output.get('totalPaid'),'$0.60');
 assert.equal(output.get('totalOwed'),'$0.90');
 const original=state.paymentStatus;
 state.paymentStatus={...original,remaining_cents:0,photo_action_bill_credit_carry_cents:175};
 update();
 assert.equal(output.get('totalOwed'),'$-1.75');
 state.paymentStatus=original;update();
 assert.equal(state.paymentAllocations.get('a'),60n);
 assert.equal(state.paymentAllocations.get('b'),undefined);
 const entrySrc=core.slice(core.indexOf('function entryState(e){'),core.indexOf('// Owner-selected photo presence'));
 const entry=runInNewContext('('+entrySrc.trim()+')',{
  state,cents:v=>BigInt(String(v??0))
 });
 assert.equal(entry(entries[0]),'partial');
 assert.equal(entry(entries[1]),'owed');
 state.paymentAllocations.set('a',75n);
 assert.equal(entry(entries[0]),'settled');
});
test('room-scoped security and atomic overpayment prevention in real SQL',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS corp_private\.redline_room_payments/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON corp_private\.redline_room_payments FROM public,anon,authenticated/);
 assert.match(sql,/v_room\.owner_id IS DISTINCT FROM v_user/);
 assert.match(sql,/WHERE id=p_room_id FOR UPDATE/);
 assert.match(sql,/p_amount_cents>v_remaining/);
 assert.match(sql,/stop_current_timer_first/);
 assert.match(sql,/NOT has_function_privilege|revoke all on function public\.corp_redline_record_partial_payment/i);
 assert.match(sql,/session_started_at IS NOT DISTINCT FROM v_room\.current_session_started_at/);
 assert.match(sql,/session_started_at IS DISTINCT FROM v_room\.current_session_started_at/);
});
test('room balance avoids charging auto-submitted timer and priced photo twice',()=>{
 assert.match(sql,/e\.auto_timer_session_id=t\.id/);
 assert.match(sql,/AND NOT EXISTS\(/);
 assert.match(sql,/e\.auto_timer_session_id=t\.id/);
 assert.match(sql,/v_photo_credit:=least\(v_credits,v_photos_unpaid\)/);
 assert.match(sql,/v_remaining:=greatest\(v_photos_unpaid\+v_timers_unpaid-v_credits,0\)/);
 assert.match(sql,/IF EXISTS\(SELECT 1 FROM corp_private\.redline_room_payments p/);
 assert.match(sql,/VALUES\(p_room_id,v_room\.current_session_started_at,v_due,'full'/);
});
test('sender sees partial payments as current and archived Earnings and chat activity',()=>{
 assert.match(core,/paymentHistory:authoritativePaymentStatus\(\)\?\.payment_history\|\|\[\]/);
 assert.match(sender,/PARTIAL PAYMENT RECORDED/);
 assert.match(sender,/function paymentHistoryEvents\(snap\)/);
 assert.match(sender,/\.\.\.paymentHistoryEvents\(snap\)/);
 assert.match(sender,/redline-sender-payment-history/);
 assert.match(sender,/paymentRows\.replaceChildren\(\)/);
});
