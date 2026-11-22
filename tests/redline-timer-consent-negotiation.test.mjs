import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=name=>readFileSync(name,'utf8');
const sql=read('supabase/migrations/20261121220000_redline_timer_consent_price_negotiation_controls.sql');
const guards=read('supabase/migrations/20261121221000_redline_timer_consent_expiry_guards.sql');
const ui=read('private-photo-ledger-consent-negotiation.js');
const core=read('private-photo-ledger.js');
const timer=read('private-photo-ledger-timers.js');
const html=read('private-photo-ledger.html');

test('explicit switches can be independently enabled or disabled',()=>{
 assert.match(sql,/timer_requests_enabled boolean NOT NULL DEFAULT true/);
 assert.match(sql,/negotiation_enabled boolean NOT NULL DEFAULT true/);
 assert.match(sql,/sender_auto_accept boolean NOT NULL DEFAULT false/);
 assert.match(sql,/p_key='timer_requests_enabled'/);
 assert.match(sql,/p_key='negotiation_enabled'/);
 assert.match(sql,/p_key='sender_auto_accept'/);
 assert.match(sql,/sender_auto_accept' AND v_room.member_id<>v_user/);
 assert.match(sql,/status='cancelled'/);
 assert.match(sql,/status='original_final'/);
 assert.match(ui,/REDLINE SETTINGS/);
 assert.match(ui,/Timer consent requests/);
 assert.match(ui,/Price negotiations/);
 assert.match(ui,/Auto-approve after 30 seconds/);
 assert.match(ui,/setRoomFeature\(s.roomId,key,requested\)/);
});
test('30-second timer waits for sender consent and offers three decline reminders',()=>{
 assert.match(sql,/v_time\+interval '30 seconds'/);
 assert.match(sql,/p_accept boolean/);
 assert.match(sql,/p_request_id uuid/);
 assert.match(sql,/preauthorized_timeout/);
 assert.match(sql,/coalesce\(f.sender_auto_accept,false\)/);
 assert.match(ui,/remaining>20\?1:remaining>10\?2:3/);
 assert.match(ui,/DECLINE CHANCE/);
 assert.match(ui,/✕ DECLINE TIMER/);
 assert.match(ui,/✓ ACCEPT TIMER/);
 assert.match(ui,/consent-approved/);
 assert.match(timer,/await bridge\(\)\.timerRequest\(selectedId,cents\)/);
 assert.match(timer,/timer-consent-approved/);
 assert.match(timer,/await bridge\(\)\.timerStart\(data.photoId,data.rateCents\)/);
 assert.match(sql,/sender_consent_required/);
 assert.match(sql,/WHERE room_id=p_room_id AND photo_id=p_photo_id AND rate_cents=p_rate_cents/);
 assert.match(guards,/redline_cancel_prior_timer_approval/);
 assert.match(guards,/responded_at<clock_timestamp\(\)-interval '2 minutes'/);
 assert.doesNotMatch(timer,/await bridge\(\)\.timerStart\(selectedId,cents\)/);
});
test('three counters max; receiver original wins on third rejection',()=>{
 assert.match(sql,/offer_count BETWEEN 0 AND 3/);
 assert.match(sql,/offer_count>=3/);
 assert.match(sql,/p_action='counter' AND v_user=v_room.member_id/);
 assert.match(sql,/p_action='accept_counter' AND v_user=v_room.owner_id/);
 assert.match(sql,/p_action='reject_counter' AND v_user=v_room.owner_id/);
 assert.match(sql,/CASE WHEN v_n.offer_count>=3 THEN 'original_final'/);
 assert.match(sql,/p_action='finalize_original'/);
 assert.match(sql,/SET amount_cents=v_n.offer_cents/);
 assert.match(sql,/AFTER UPDATE OF decision_status,amount_cents/);
 assert.match(sql,/NEW.auto_timer_session_id IS NOT NULL/);
 assert.match(ui,/3 COUNTEROFFERS/);
 assert.match(ui,/ACCEPT ORIGINAL PRICE/);
 assert.match(ui,/SEND COUNTEROFFER/);
 assert.match(ui,/REJECT COUNTER/);
 assert.match(ui,/KEEP MY ORIGINAL PRICE/);
});
test('counteroffer input safely parses exact cents and enforces lower than original',()=>{
 const a=ui.indexOf('function parseCounter(value,original){');
 const b=ui.indexOf('\nasync function actOnNegotiation(',a);
 assert.ok(a>=0&&b>a);
 const parse=runInNewContext('('+ui.slice(a,b).trim()+')');
 assert.equal(parse('0.10',100),10);
 assert.equal(parse('0.01',100),1);
 assert.equal(parse('1,000.50',100150),100050);
 for(const bad of ['-0.01','5','1.999','abc','1e9','999999999999999999']){
  assert.throws(()=>parse(bad,100),bad);
 }
});
test('all new RPCs restrict room membership, prohibit anonymous direct access',()=>{
 assert.match(sql,/photo_ledger_verified\(\)/);
 assert.match(sql,/owner_id=v_user OR r.member_id=v_user/);
 assert.match(sql,/owner_id<>v_user AND v_room.member_id<>v_user/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON corp_private.redline_room_features/);
 for(const name of ['corp_redline_room_feature_status','corp_redline_set_room_feature',
  'corp_redline_timer_request','corp_redline_timer_request_status',
  'corp_redline_timer_request_respond','corp_redline_price_negotiation_status',
  'corp_redline_price_negotiation_act'])
  assert.ok(sql.includes('public.'+name),'Missing authenticated RPC: '+name);
 assert.match(core,/async roomFeatureStatus\(roomId\)/);
 assert.match(core,/async setRoomFeature\(roomId,key,enabled\)/);
 assert.match(core,/async timerRequestRespond\(requestId,accept\)/);
 assert.match(core,/async priceNegotiationAction\(photoId,action,amountCents=null\)/);
});
test('new popups and CSS load with updated cache versions',()=>{
 assert.match(html,/private-photo-ledger-consent-negotiation\.js\?v=20261121-consent-negotiation1/);
 assert.match(html,/private-photo-ledger-consent-negotiation\.css\?v=20261121-consent-negotiation1/);
 assert.match(html,/private-photo-ledger-timers\.js\?v=20261121-per-second1[^"']*consent-negotiation1/);
 assert.match(html,/private-photo-ledger\.js\?v=20261122-redline-android-multisource1[^"']*consent-negotiation1/);
});
