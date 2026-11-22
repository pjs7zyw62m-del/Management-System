import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=name=>readFileSync(name,'utf8');
const sql=read('supabase/migrations/20261121220000_redline_timer_consent_price_negotiation_controls.sql');
const guards=read('supabase/migrations/20261121221000_redline_timer_consent_expiry_guards.sql');
const instant=read('supabase/migrations/20261122130000_redline_immediate_timers_sender_stop_setting.sql');
const ui=read('private-photo-ledger-consent-negotiation.js');
const core=read('private-photo-ledger.js');
const timer=read('private-photo-ledger-timers.js');
const html=read('private-photo-ledger.html');

test('owner can enable or disable sender right to stop an automatically started timer',()=>{
 assert.match(instant,/ADD COLUMN IF NOT EXISTS sender_can_stop_timer boolean NOT NULL DEFAULT false/);
 assert.match(instant,/p_key='sender_can_stop_timer'/);
 assert.match(instant,/v_room.owner_id<>v_user/);
 assert.match(ui,/Allow sender to decline and stop timer/);
 assert.match(ui,/sender_can_stop_timer/);
 assert.match(ui,/setRoomFeature\(s.roomId,key,requested\)/);
 assert.match(core,/sender_can_stop_timer/);
 assert.match(core,/async senderStopTimer\(sessionId\)/);
 assert.match(instant,/CREATE OR REPLACE FUNCTION public.corp_redline_sender_stop_timer/);
 assert.match(instant,/sender_stop_disabled/);
 assert.match(instant,/v_user<>v_room.member_id/);
 assert.match(instant,/photo_ledger_verified\(\)/);
 assert.match(instant,/SET stopped_at=v_end,earned_cents=v_amount/);
});
test('owner Start Timer immediately starts without requesting sender approval',()=>{
 assert.match(timer,/await bridge\(\)\.timerStart\(selectedId,cents\)/);
 assert.doesNotMatch(timer,/await bridge\(\)\.timerRequest\(selectedId,cents\)/);
 assert.doesNotMatch(timer,/timer-consent-approved/);
 assert.match(instant,/No timer consent request, sender response, or timeout is required/);
 const functionStart=instant.slice(instant.indexOf('CREATE OR REPLACE FUNCTION public.corp_redline_photo_timer_start('));
 const functionEnd=functionStart.slice(0,functionStart.indexOf('REVOKE ALL ON FUNCTION public.corp_redline_photo_timer_start'));
 assert.doesNotMatch(functionEnd,/sender_consent_required/);
 assert.doesNotMatch(functionEnd,/redline_timer_requests/);
 assert.match(functionEnd,/owner_id/);
 assert.match(timer,/senderDeclineStop\(\)/);
 assert.doesNotMatch(ui,/void pollTimer\(\);/);
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
test('sender counteroffers ask for higher earnings, with exact cents and server-side enforcement',()=>{
 const upgrade=read('supabase/migrations/20261122150000_redline_sender_higher_counteroffers.sql');
 assert.match(upgrade,/p_amount_cents<=v_n.original_cents/);
 assert.match(upgrade,/counter_must_be_higher_than_original/);
 assert.match(upgrade,/v_n.offer_count>=3/);
 assert.match(upgrade,/v_user=v_room.member_id/);
 assert.match(upgrade,/v_user=v_room.owner_id/);
 assert.match(upgrade,/SET amount_cents=v_n.offer_cents/);
 assert.match(upgrade,/REVOKE ALL ON FUNCTION public.corp_redline_price_negotiation_act/);
 assert.doesNotMatch(upgrade,/counter_must_be_lower_than_original/);
 const a=ui.indexOf('function parseCounter(value,original){');
 const b=ui.indexOf('\nasync function actOnNegotiation(',a);
 assert.ok(a>=0&&b>a);
 const parse=runInNewContext('('+ui.slice(a,b).trim()+')');
 assert.equal(parse('1.01',100),101);
 assert.equal(parse('15',1000),1500);
 assert.equal(parse('1,000.50',100000),100050);
 for(const bad of ['-0.01','0.99','1.00','1.999','abc','1e9','999999999999999999']){
  assert.throws(()=>parse(bad,100),bad);
 }
 assert.match(ui,/ask for a higher amount/);
 assert.match(ui,/Your higher counteroffer amount/);
 assert.match(ui,/The sender requests a higher payment/);
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
 assert.match(html,/private-photo-ledger-consent-negotiation\.js\?v=20261122-settings-visible1/);
 assert.match(html,/private-photo-ledger-consent-negotiation\.css\?v=20261122-settings-visible1/);
 assert.match(html,/private-photo-ledger-timers\.js\?v=20261121-per-second1[^"']*consent-negotiation1/);
 assert.match(html,/private-photo-ledger\.js\?v=20261122-redline-android-multisource1/);
});

test('receiver settings button is mounted in visible control header, with MENU fallback',()=>{
 const receiver=read('private-photo-ledger-receiver.js');
 const styles=read('private-photo-ledger-consent-negotiation.css');
 assert.match(ui,/const receiverHeader=\$\('#redlineReceiverCommand \.rr-command-header'\)/);
 assert.match(ui,/host\.append\(settingsButton\)/);
 assert.match(ui,/blackcell:redline:open-settings/);
 assert.match(ui,/settingsButton\.hidden=!owner/);
 assert.match(receiver,/redlineReceiverMenuSettings/);
 assert.match(receiver,/menuItems\.append\(review,history,message,settingsMenu,manage,tools\)/);
 assert.match(styles,/#redlineConsentSettingsOpen\[hidden\]\{display:none!important\}/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261122-settings-visible1/);
});
