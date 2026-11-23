import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const award=read('supabase/migrations/20261123094000_redline_repeat_photo_bonus.sql');
const balance=read('supabase/migrations/20261123101500_redline_bonus_balance_and_payment.sql');
const client=read('private-photo-ledger-bonus-celebration.js');
const style=read('private-photo-ledger-bonus-celebration.css');
const ledger=read('private-photo-ledger.js');
const html=read('private-photo-ledger.html');

test('bonuses require three distinct priced five-stars and three completed paid timers on the original',()=>{
 assert.match(award,/row_number\(\) over \([\s\S]*?PARTITION BY COALESCE\(e\.resubmission_origin_id,e\.id\)/);
 assert.match(award,/JOIN public\.corp_redline_photo_ratings r ON r\.photo_id=e\.id AND r\.stars=5/);
 assert.match(award,/e\.auto_timer_session_id IS NULL/);
 assert.match(award,/e\.decision_status='accepted' AND e\.amount_cents>0/);
 assert.match(award,/t\.stopped_at IS NOT NULL[\s\S]*?t\.earned_cents>0/);
 assert.match(award,/FROM rated_rows WHERE pos<=3 GROUP BY root_id HAVING count\(\*\)=3/);
 assert.match(award,/FROM timer_rows WHERE pos<=3 GROUP BY root_id HAVING count\(\*\)=3/);
 assert.match(award,/p\.total_cents::numeric\+t\.total_cents::numeric\)\/6/);
 assert.match(award,/CONSTRAINT redline_repeat_photo_bonus_once UNIQUE\(room_id,origin_photo_id\)/);
});

test('bonus is one extra rounded average of all six amounts, not an existing amount replaced',()=>{
 const prices=[100n,200n,300n],timers=[50n,75n,125n];
 const total=[...prices,...timers].reduce((a,b)=>a+b,0n);
 const bonus=(total+3n)/6n; // nonnegative cents, half-up
 assert.equal(total,850n);
 assert.equal(bonus,142n);
 assert.equal(total+bonus,992n);
});

test('bonus awards are private financial records read by only verified room participants',()=>{
 assert.match(award,/ENABLE ROW LEVEL SECURITY/);
 assert.match(award,/REVOKE ALL ON TABLE corp_private\.redline_repeat_photo_bonuses FROM PUBLIC,anon,authenticated/);
 assert.match(award,/v_user IS NULL OR p_room_id IS NULL/);
 assert.match(award,/owner_id=v_user OR member_id=v_user/);
 assert.match(award,/ON CONFLICT \(room_id,origin_photo_id\) DO NOTHING/);
 assert.match(balance,/redline_repeat_photo_bonus_clock/);
 assert.match(balance,/NEW\.earned_at=clock_timestamp\(\)/);
});

test('owner payments and sender balance count bonuses without double-paying photo and timer entries',()=>{
 assert.match(balance,/corp_redline_room_payment_status_without_bonuses/);
 assert.match(balance,/v_bonus_credit:=least\(v_bonus_unpaid/);
 assert.match(balance,/v_remaining:=\(v_base->>'remaining_cents'\)::numeric\+v_bonus_remaining/);
 assert.match(balance,/'bonus_assigned_cents',v_bonus_all/);
 assert.match(balance,/'bonus_paid_cents',v_bonus_paid\+v_bonus_credit/);
 assert.match(balance,/'bonus_owed_cents',v_bonus_remaining/);
 assert.match(balance,/corp_redline_record_paid_in_full/);
 assert.match(balance,/Paid in full including REDLINE repeat-photo bonuses/);
 assert.match(balance,/REVOKE EXECUTE ON FUNCTION public\.corp_redline_repeat_bonus_mark_paid/);
 assert.match(ledger,/async repeatBonusStatus\(roomId\)/);
 assert.match(ledger,/corp_redline_repeat_bonus_status/);
});

test('sender and receiver each get a confetti celebration, private photo, amount, and recorded bonus status',()=>{
 assert.match(client,/BLACKCELL REDLINE/);
 assert.match(client,/BONUS AWARDED!/);
 assert.match(client,/YOU EARNED A BONUS!/);
 assert.match(client,/current\.isOwner/);
 assert.match(client,/photoHistory\|\|\[\]/);
 assert.match(client,/image\.src=url/);
 assert.match(client,/money\(award\.bonus_cents\)/);
 assert.match(client,/redlineBonusConfetti/);
 assert.match(client,/window\.localStorage\.setItem\(keyFor\(userId\)/);
 assert.match(client,/roomPaymentStatus\(current\.roomId,false\)/);
 assert.match(client,/setTimeout\(closePopup,8500\)/);
 assert.match(style,/prefers-reduced-motion/);
 assert.match(style,/pointer-events:none/);
 assert.match(html,/private-photo-ledger-bonus-celebration\.js/);
 assert.match(html,/private-photo-ledger-bonus-celebration\.css/);
});
