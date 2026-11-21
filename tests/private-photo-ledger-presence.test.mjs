import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(p,'utf8');
const html=read('private-photo-ledger.html');
const core=read('private-photo-ledger.js');
const presence=read('private-photo-ledger-presence.js');
const style=read('private-photo-ledger-simple-sender.css');
const migration=read('supabase/migrations/20261121103000_blackcell_redline_verified_room_presence.sql');
const os=read('blackcell-os.html');
const catalog=read('blackcell-os.js');

test('The same verified REDLINE room controls the two-person online indicator',()=>{
 assert.match(core,/peerName:state\.isOwner\?participantName\(state\.room\.member_id\):participantName\(state\.room\.owner_id\)/);
 assert.match(core,/db\.rpc\('corp_redline_presence_touch'/);
 assert.match(core,/db\.rpc\('corp_redline_presence_status'/);
 assert.match(core,/state\.room\.id!==roomId/);
 assert.match(presence,/bridge\(\)\?\.snapshot\?\.\(\)/);
 assert.match(presence,/snap\.roomActive/);
 assert.match(presence,/crypto\?\.randomUUID/);
});

test('Presence is visible in chat, not a corporate-wide logged-in indicator',()=>{
 assert.match(presence,/\.redline-message-header/);
 assert.match(presence,/ · ONLINE/);
 assert.match(presence,/ · OFFLINE/);
 assert.match(presence,/STATUS UNAVAILABLE/);
 assert.match(style,/redline-peer-presence\[data-state="online"\]/);
 assert.match(style,/redline-peer-presence\[data-state="offline"\]/);
 assert.match(html,/private-photo-ledger-presence\.js\?v=20261121-room-presence1/);
 assert.match(html,/private-photo-ledger\.js\?v=20261121-priced-history4/);
 assert.match(html,/private-photo-ledger-simple-sender\.css\?v=20261121-room-presence1/);
});

test('Inactivity expires and separate browser tabs do not clobber one another',()=>{
 assert.match(presence,/HEARTBEAT_MS=40000/);
 assert.match(presence,/STATUS_MS=25000/);
 assert.match(presence,/visibilitychange/);
 assert.match(presence,/pagehide/);
 assert.match(presence,/presenceTouch\?\.\(oldRoom,sessionId,false\)/);
 assert.match(migration,/primary key\s*\(room_id,user_id,session_id\)/);
 assert.match(migration,/105 seconds/);
});

test('SQL authorization forbids activity disclosure beyond the verified two-person room',()=>{
 assert.match(migration,/corp_private\.photo_ledger_verified\(\)/);
 assert.match(migration,/v_user<>v_owner and v_user<>v_member/);
 assert.match(migration,/v_other is null/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/revoke all on public\.corp_private_photo_presence from public,anon,authenticated/);
 assert.match(migration,/grant execute on function public\.corp_redline_presence_status\(uuid\) to authenticated/);
 assert.match(migration,/p\.room_id=p_room_id and p\.user_id=v_other/);
});

test('BLACKCELL OS launches the newly versioned REDLINE online presence app',()=>{
 assert.match(os,/redlineBuild=receiver-imessage-two-axis-20261121/);
 assert.match(catalog,/redlineBuild=receiver-imessage-two-axis-20261121/);
 assert.match(os,/blackcell-os\.js\?v=138-redline-imessage-two-axis/);
});
