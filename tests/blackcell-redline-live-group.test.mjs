import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('Production group uses actual authorized signaling, not a simulation',()=>{
 const js=read('private-photo-ledger-group-live.js'),group=read('private-photo-ledger-groups.js'),sql=read('database/redline-live-group.sql');
 assert.match(group,/mountRedlineGroupLive\(\{db,roomId:id/);assert.match(js,/navigator\.mediaDevices\.getUserMedia/);
 assert.match(js,/direction:'recvonly'/);assert.match(js,/isOwner\|\|!alive\(\)\|\|publishing\|\|local/);
 assert.match(js,/getTracks\(\)\.forEach\(t=>t.stop\(\)\)/);assert.match(js,/blackcell-redline-live-turn/);
 assert.match(sql,/auth\.sessions/);assert.match(sql,/photo_ledger_verified/);assert.match(sql,/publisher_session=sid and s\.publisher_device=p_device/);assert.match(sql,/where s\.room_id=p_room and \(owner or s\.publisher=u\)/);
 assert.match(sql,/>=4 then raise exception 'Four webcam slots/);assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on redline_group_private.streams/);
});
test('Photo panel preserves separate private ledger authorization and paid timers',()=>{
 const group=read('private-photo-ledger-groups.js'),core=read('private-photo-ledger.js'),sql=read('database/redline-live-group-photo-counts.sql');
 assert.match(group,/\(!isOwner&&!member.mine\)/);assert.match(group,/corp_private_photo_rooms/);assert.match(group,/corp_redline_room_payment_status/);assert.match(group,/rdGroupEmbed/);
 assert.match(core,/BLACKCELL_REDLINE_GROUP_SAFE_CLOSE/);assert.match(core,/Stop the paid photo timer before switching/);
 assert.match(sql,/'pending',case when \(owner or m.user_id=u\)/);assert.match(sql,/redline_photo_removals/);
});
test('Device layout, free webcam, and host visibility are integrated',()=>{
 const js=read('private-photo-ledger-group-live.js'),css=read('private-photo-ledger-groups.css'),os=read('blackcell-os.js');
 assert.match(js,/FREE · No webcam charges/);assert.match(js,/blackcell-redline-visibility/);assert.match(os,/baseId==='chat'\|\|id==='photoledger'/);assert.match(os,/blackcell-redline-visibility/);
 assert.match(css,/@media\(max-width:1050px\)/);assert.match(css,/@media\(max-width:700px\)/);
});

test('Owner-only confirmed deletion does not modify individual photo ledgers',()=>{const sql=read('database/redline-group-delete.sql'),js=read('private-photo-ledger-groups.js');assert.match(sql,/r.owner_id=u/);assert.match(sql,/auth.sessions/);assert.match(sql,/Stop all group webcams/);assert.match(sql,/delete from redline_group_private.rooms/);assert.doesNotMatch(sql,/delete from public\./);assert.match(js,/if\(isOwner\)\{const del=button\('Delete group'/);assert.match(js,/confirm\('Permanently delete/);assert.match(js,/corp_redline_group_delete/)});
