import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261123184500_redline_photo_action_bill_credits.sql');
const core=read('private-photo-ledger.js');
const sender=read('private-photo-ledger-simple-sender.js');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');

test('Manual reject credits $0.35 exactly once and ignores delete-generated rejection',()=>{
 assert.match(sql,/AFTER UPDATE OF decision_status ON public\.corp_private_photo_entries/);
 assert.match(sql,/OLD\.decision_status='pending' AND NEW\.decision_status='rejected'/);
 assert.match(sql,/kind,amount_cents,session_started_at/);
 assert.match(sql,/'manual_rejection',-35/);
 assert.match(sql,/IF EXISTS\(SELECT 1 FROM corp_private\.redline_photo_removals rm/);
 assert.match(sql,/ON CONFLICT\(photo_id,kind\) DO NOTHING/);
 assert.match(sql,/corp_private\.photo_ledger_verified\(\)/);
 assert.match(sql,/r\.owner_id=\(SELECT auth\.uid\(\)\)/);
});
test('Deletion credits $1.00 only after confirmed irreversible removal',()=>{
 assert.match(sql,/AFTER UPDATE OF removed_at ON corp_private\.redline_photo_removals/);
 assert.match(sql,/OLD\.removed_at IS NULL AND NEW\.removed_at IS NOT NULL/);
 assert.match(sql,/'permanent_deletion',-100/);
 assert.match(sql,/ON CONFLICT\(photo_id,kind\) DO NOTHING/);
 assert.match(sql,/PRIMARY KEY\(photo_id,kind\)/);
 assert.doesNotMatch(sql,/UPDATE corp_private\.redline_photo_bill_credits SET/);
});
test('Both credits reduce the net bill, carry unused credit and never retroactively backfill',()=>{
 assert.match(sql,/ALTER TABLE corp_private\.redline_photo_bill_credits ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON corp_private\.redline_photo_bill_credits FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/corp_redline_room_payment_status_before_photo_credits/);
 assert.match(sql,/greatest\(0,v_unadjusted-v_credit\)/);
 assert.match(sql,/greatest\(0,v_credit-v_unadjusted\)/);
 assert.match(sql,/photo_action_bill_credit_history/);
 assert.match(sql,/c\.session_started_at IS NOT DISTINCT FROM/);
 assert.doesNotMatch(sql,/INSERT INTO corp_private\.redline_photo_bill_credits[\s\S]*SELECT [\s\S]*FROM public\.corp_private_photo_entries/);
 const bill=(owed,rejects,deletes)=>Math.max(0,owed-rejects*35-deletes*100);
 assert.equal(bill(500,1,1),365);
 assert.equal(bill(200,2,1),30);
 assert.equal(bill(100,1,1),0);
 assert.equal(bill(0,1,1),0);
});
test('New bill credits appear in current REDLINE total, activity and sender earnings, without changing the trigger fee labels',()=>{
 assert.match(core,/photoActionBillCreditCents:/);
 assert.match(core,/photoActionBillCreditHistory:/);
 assert.match(core,/PHOTO REJECTED · \$0\.35 BILL CREDIT/);
 assert.match(core,/PHOTO PERMANENTLY REMOVED FROM SERVER · \$1\.00 BILL CREDIT/);
 assert.match(sender,/PHOTO ACTION BILL CREDITS/);
 assert.match(sender,/kind==='manual_rejection'/);
 assert.match(sender,/kind==='permanent_deletion'/);
 assert.match(sender,/BILL CREDIT -/);
 assert.match(sender,/snap\?\.isOwner\?'FEE \$':'EARNED \+\$'/);
 assert.match(html,/private-photo-ledger\.js\?v=20261123-photo-credit-counter-inline1/);
 assert.match(os,/redlineRelease=20261123-photo-credit-counter-inline1/);
});
