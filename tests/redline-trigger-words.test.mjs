import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const core=read('private-photo-ledger.js');
const owner=read('private-photo-ledger-consent-negotiation.js');
const sender=read('private-photo-ledger-trigger-words.js');
const css=read('private-photo-ledger-trigger-words.css');
const html=read('private-photo-ledger.html');
const migration=read('supabase/migrations/20261123170000_redline_trigger_words_owner_opt_in.sql');
const edit=read('supabase/migrations/20261123173000_redline_trigger_words_reapproval_on_edit.sql');
const reset=read('supabase/migrations/20261123175000_redline_trigger_ignore_system_and_session_reset.sql');
const noCooldown=read('supabase/migrations/20261123180000_redline_trigger_words_no_cooldown.sql');

test('sender popup explains the opt-in rules, requires valid $0.10–$0.25 and cannot control receiver toggle',()=>{
 assert.doesNotThrow(()=>new Script(sender));
 assert.match(sender,/redline-trigger-walkthrough/);
 assert.match(sender,/Only new receiver messages count/);
 assert.match(sender,/Math\.abs\(amount\*100-cents\)>0\.000001/);
 assert.match(sender,/cents<10\|\|cents>25/);
 assert.match(sender,/^[^\n]*\{1,23\}/m);
 assert.match(sender,/triggerWordSave/);
 assert.doesNotMatch(sender,/triggerEnable|trigger_words_enabled\s*=/);
 assert.match(sender,/data-redline-pane="earnings"/);
 assert.match(sender,/data-redline-pane="history"/);
 assert.match(sender,/dialog\.showModal/);
 assert.match(css,/\.redline-trigger-dialog::backdrop/);
 assert.match(css,/max-height:calc\(100dvh - 20px\)/);
});
test('receiver alone enables priced words in existing REDLINE Settings with explicit confirmation',()=>{
 assert.match(owner,/featureRow\('Trigger words/);
 assert.match(owner,/'trigger_words_enabled',features\.trigger_words_enabled===true,true/);
 assert.match(owner,/key==='trigger_words_enabled'&&requested&&!window\.confirm/);
 assert.match(owner,/Sender trigger words:/);
 assert.match(owner,/no cooldown between messages/);
 assert.match(owner,/one per message, no cooldown/);
 assert.match(sender,/There is NO cooldown/);
 assert.match(core,/if\(key==='trigger_words_enabled'\)/);
 assert.match(core,/!state\.isOwner\|\|!state\.room\?\.active/);
 assert.match(core,/corp_redline_trigger_enable/);
});
test('server validates two participants, protects private tables and prohibits unauthorised words or amounts',()=>{
 assert.match(migration,/trigger_words_enabled boolean NOT NULL DEFAULT false/);
 assert.match(migration,/CHECK\(price_cents BETWEEN 10 AND 25\)/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS corp_private\.redline_trigger_words/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS corp_private\.redline_trigger_hits/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/REVOKE ALL ON corp_private\.redline_trigger_words/);
 assert.match(migration,/REVOKE ALL ON corp_private\.redline_trigger_hits/);
 assert.match(migration,/v_room\.member_id IS DISTINCT FROM v_user/);
 assert.match(migration,/v_room\.owner_id IS DISTINCT FROM v_user/);
 assert.match(migration,/p_price_cents NOT BETWEEN 10 AND 25/);
 assert.match(migration,/count\(\*\) FROM corp_private\.redline_trigger_words WHERE room_id=p_room_id\)>=10/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.corp_redline_trigger_save/);
});
test('new receiver messages use whole words, one match per message and daily cap, without cooldown',()=>{
 assert.match(migration,/AFTER INSERT ON public\.corp_private_photo_messages/);
 assert.match(migration,/v_room\.owner_id IS DISTINCT FROM NEW\.sender_id/);
 assert.match(migration,/NEW\.sender_id IS DISTINCT FROM \(SELECT auth\.uid\(\)\)/);
 assert.match(migration,/current_session_started_at/);
 assert.match(migration,/strpos\(v_normalized,' '\|\|w\.word\|\|' '\)>0/);
 assert.match(migration,/regexp_replace\(lower\(NEW\.body\)/);
 // The original migration had a cooldown, but the newest replacement
 // removes it and exposes zero seconds in the verified status API.
 assert.match(migration,/interval '60 seconds'/);
 assert.match(noCooldown,/'cooldown_seconds',0/);
 assert.doesNotMatch(noCooldown,/interval '60 seconds'/);
 assert.doesNotMatch(noCooldown,/AND NOT EXISTS\(/);
 assert.match(noCooldown,/ON CONFLICT\(message_id\) DO NOTHING/);
 assert.match(noCooldown,/v_today>=500/);
 assert.match(noCooldown,/w.price_cents<=500-v_today/);
 assert.match(noCooldown,/ORDER BY w.price_cents DESC,w.word ASC LIMIT 1/);
 assert.match(migration,/v_today>=500/);
 assert.match(migration,/ORDER BY w\.price_cents DESC,w\.word ASC LIMIT 1/);
 assert.match(migration,/UNIQUE REFERENCES public\.corp_private_photo_messages/);
 assert.match(reset,/WHEN \(left\(NEW\.body,8\)<>'REDLINE_'\)/);
});
test('editing prices, removing words and session reset pause charging until receiver reapproves',()=>{
 assert.match(edit,/AFTER INSERT OR UPDATE OR DELETE ON corp_private\.redline_trigger_words/);
 assert.match(edit,/SET trigger_words_enabled=false/);
 assert.match(reset,/AFTER UPDATE OF current_session_started_at/);
 assert.match(reset,/SET trigger_words_enabled=false/);
});
test('verified trigger ledger remains distinct but included in assigned and outstanding room balance',()=>{
 assert.match(migration,/RENAME TO corp_redline_room_payment_status_without_triggers/);
 assert.match(migration,/v_base:=public\.corp_redline_room_payment_status_without_triggers/);
 assert.match(migration,/'trigger_assigned_cents',v_total/);
 assert.match(migration,/'trigger_owed_cents',v_due/);
 assert.match(migration,/'assigned_cents',v_assigned\+v_total/);
 assert.match(migration,/'remaining_cents',coalesce/);
 assert.match(html,/private-photo-ledger-trigger-words\.js\?v=20261123-trigger-visible-controls1/);
 assert.match(html,/private-photo-ledger-trigger-words\.css\?v=20261123-trigger-visible-controls1/);
 assert.match(html,/private-photo-ledger-consent-negotiation\.js\?v=20261123-photo-credit-counter-inline1/);
});
