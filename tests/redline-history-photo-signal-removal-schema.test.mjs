import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261123133000_redline_history_photo_signal_removal_table_fix.sql','utf8');

test('history look/like RPC checks real private removal tombstones, never a nonexistent photo column',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.corp_redline_history_photo_signal/);
 assert.doesNotMatch(sql,/v_photo\.photo_removal_status/);
 assert.match(sql,/EXISTS\(\s*SELECT 1 FROM corp_private\.redline_photo_removals d/);
 assert.match(sql,/d\.photo_id=v_photo\.id AND d\.room_id=v_photo\.room_id/);
 assert.match(sql,/v_photo\.uploaded_by IS DISTINCT FROM v_room\.member_id/);
 assert.match(sql,/owner_id=v_user AND active/);
 assert.match(sql,/v_photo\.created_at<v_room\.current_session_started_at/);
 assert.match(sql,/p_action IS NULL OR p_action NOT IN \('looking','like'\)/);
 assert.match(sql,/REDLINE_PHOTO_SIGNAL:v1:/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.corp_redline_history_photo_signal\(uuid,text\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.corp_redline_history_photo_signal\(uuid,text\)/);
});
