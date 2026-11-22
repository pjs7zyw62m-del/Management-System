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
 assert.match(ui,/OF 3 · COUNTEROFFERS/);
 assert.match(ui,/ACCEPT ORIGINAL PRICE/);
 assert.match(ui,/SEND COUNTEROFFER/);
 assert.match(ui,/REJECT COUNTER/);
 assert.match(ui,/KEEP MY ORIGINAL PRICE/);
});
test('sender may counteroffer HIGHER or LOWER amounts with exact cents and room-owner approval',()=>{
 const upgrade=read('supabase/migrations/20261122161000_redline_bidirectional_counteroffers.sql');
 assert.match(upgrade,/p_amount_cents<0 OR p_amount_cents=v_n.original_cents/);
 assert.match(upgrade,/counter_must_differ_from_original/);
 assert.match(upgrade,/v_n.offer_count>=3/);
 assert.match(upgrade,/v_user=v_room.member_id/);
 assert.match(upgrade,/v_user=v_room.owner_id/);
 assert.match(upgrade,/SET amount_cents=v_n.offer_cents/);
 assert.match(upgrade,/REVOKE ALL ON FUNCTION public.corp_redline_price_negotiation_act/);
 assert.doesNotMatch(upgrade,/counter_must_be_(lower|higher)_than_original/);
 const a=ui.indexOf('function parseCounter(value,original){');
 const b=ui.indexOf('\nfunction parseFinalAmount(',a);
 assert.ok(a>=0&&b>a);
 const parse=runInNewContext('('+ui.slice(a,b).trim()+')');
 assert.equal(parse('1.01',100),101);
 assert.equal(parse('0.99',100),99);
 assert.equal(parse('0',100),0);
 assert.equal(parse('15',1000),1500);
 assert.equal(parse('7.00',1000),700);
 assert.equal(parse('1,000.50',100000),100050);
 for(const bad of ['-0.01','1.00','1.999','abc','1e9','999999999999999999']){
  assert.throws(()=>parse(bad,100),bad);
 }
 assert.match(ui,/propose any higher or lower price/);
 assert.match(ui,/Your counteroffer amount in dollars, higher or lower/);
 assert.match(ui,/SENDER COUNTEROFFER/);
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
 assert.match(html,/private-photo-ledger-consent-negotiation\.js\?v=20261122-owner-counter-to-sender2/);
 assert.match(html,/private-photo-ledger-consent-negotiation\.css\?v=20261122-negotiation2-custom1/);
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

test('owner custom counteroffer waits for sender approval; reviewed photos stay immutable',()=>{
 const migration=read('supabase/migrations/20261122181000_redline_sender_approval_of_owner_custom_price.sql');
 const styles=read('private-photo-ledger-consent-negotiation.css');
 const a=ui.indexOf('function parseFinalAmount(value){');
 const b=ui.indexOf('\nasync function actOnNegotiation(',a);
 assert.ok(a>=0&&b>a);
 const parse=runInNewContext('('+ui.slice(a,b).trim()+')');
 assert.equal(parse('14.75'),1475);
 assert.equal(parse('0'),0);
 assert.equal(parse('0.50'),50);
 assert.throws(()=>parse('-1'));
 assert.throws(()=>parse('1.234'));
 assert.throws(()=>parse('900719925474099.99'));
 assert.match(migration,/owner_offer_cents bigint/);
 assert.match(migration,/status='awaiting_sender_owner'/);
 assert.match(migration,/p_action='set_owner_price' AND v_user=v_room.owner_id/);
 assert.match(migration,/p_action='accept_owner_offer' AND v_user=v_room.member_id/);
 assert.match(migration,/p_action='reject_owner_offer' AND v_user=v_room.member_id/);
 assert.match(migration,/finalized_by='sender_accepted_owner'/);
 assert.match(migration,/final_cents=NULL,finalized_by=NULL/);
 const ownerBranch=migration.slice(migration.indexOf("ELSIF p_action='set_owner_price'"),
  migration.indexOf("ELSIF p_action='accept_owner_offer'"));
 assert.doesNotMatch(ownerBranch,/UPDATE public\.corp_private_photo_entries/);
 assert.match(migration,/old.auto_timer_session_id is null/);
 assert.match(migration,/old.settled_at is null and new.settled_at is null/);
 assert.match(migration,/new.decided_at is distinct from old.decided_at/);
 assert.match(migration,/new.priced_at is distinct from old.priced_at/);
 assert.match(migration,/corp_photo_entry_immutable_trigger/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public.corp_redline_price_negotiation_act/);
 assert.match(core,/accept_owner_offer/);
 assert.match(core,/reject_owner_offer/);
 assert.match(ui,/SEND YOUR CUSTOM COUNTEROFFER/);
 assert.match(ui,/SEND TO SENDER/);
 assert.match(ui,/RECEIVER CUSTOM OFFER/);
 assert.match(ui,/DECLINE OWNER OFFER/);
 assert.match(ui,/accept_owner_offer/);
 assert.match(ui,/reject_owner_offer/);
 assert.match(ui,/awaiting_sender_owner/);
 assert.match(styles,/#redlinePriceNegotiation\.redline-negotiation-ui/);
 assert.match(html,/private-photo-ledger\.js\?v=20261122-redline-android-multisource1-instant-timer1-sender-owner-counter2/);
});
