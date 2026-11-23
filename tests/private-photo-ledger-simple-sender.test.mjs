import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(x,'utf8');
const html=read('private-photo-ledger.html'),bridge=read('private-photo-ledger.js');
const ui=read('private-photo-ledger-simple-sender.js'),css=read('private-photo-ledger-simple-sender.css');
const migration=read('supabase/migrations/20261120184611_blackcell_redline_private_room_messages.sql');
test('approved Upload, Earnings, Messages surfaces load after old sender shell',()=>{
 assert.match(html,/private-photo-ledger-simple-sender\.css\?v=20261123-trigger-fee-chat1/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261123-trigger-fee-chat1/);
 assert.ok(html.indexOf('private-photo-ledger-sender.js')<html.indexOf('private-photo-ledger-simple-sender.js'));
 assert.match(ui,/redline-simple-home/);
 for(const term of ['redline-simple-tab','redline-earnings-box','redline-activity-box','redline-message-card'])assert.ok(ui.includes(term),term);
});
test('existing upload form is moved without duplication, preserving backend upload',()=>{
 assert.match(ui,/if\(upload\.parentNode!==uploadMount\)uploadMount\.append\(upload\)/);
 assert.match(html,/id="uploadPhotoForm"/);
 assert.match(html,/id="submitPhoto"/);
 assert.match(bridge,/await uploadBunnyPhoto\(db,room\.id,state\.user\.id,id,file,info\.mime\)/);
 assert.match(bridge,/const BUCKET='corp-private-photo-ledger'/);
 assert.doesNotMatch(ui,/\.upload\(|db\.storage\.from\(/);
});
test('earnings come from current authenticated ledger room, not invented data',()=>{
 for(const name of ["owed","paid","assigned","pending"]){
  assert.match(bridge,new RegExp(name+"[:=]"));
 }
 assert.match(bridge,/state\.entries\.slice\(0,200\)/);
 assert.match(ui,/function renderEarnings\(snap\)/);
 assert.match(ui,/createEvents\(snap\?\.entries\)/);
 assert.match(ui,/REDLINE records amounts and owner-confirmed settlements/);
});
test('private messages use RLS verified two-person room only',()=>{
 assert.match(migration,/enable row level security/);
 assert.match(migration,/revoke all on public\.corp_private_photo_messages from public,anon,authenticated/);
 assert.match(migration,/grant select,insert on public\.corp_private_photo_messages to authenticated/);
 assert.match(migration,/corp_private\.photo_ledger_verified\(\)/);
 assert.match(migration,/sender_id=\(select auth\.uid\(\)\)/);
 assert.match(migration,/r\.active/);
 assert.match(bridge,/db\.from\(REDLINE_MESSAGES\)\.insert/);
 assert.match(bridge,/const room=state\.room/);
 assert.match(bridge,/if\(state\.closed\|\|!room\?\.active/);
 assert.match(bridge,/await verify\(\)/);
 assert.match(ui,/await bridge\(\)\.sendMessage\(text\)/);
 assert.match(ui,/Message not sent:/);
});
test('owner can communicate but cannot access sender upload',()=>{
 assert.match(ui,/const ownerButton=make\('button','redline-owner-open-messages','MESSAGE SENDER'\)/);
 assert.match(ui,/if\(!snap\?\.isOwner\)return/);
 assert.match(ui,/ownerMount\.append\(messageCard\)/);
 assert.match(ui,/const snap=snapshot\(\),sender=isSender\(\)/);
 assert.match(ui,/document\.body\.classList\.toggle\('redline-sender-simple',sender\)/);
 assert.match(ui,/if\(sender\)\{/);
 assert.match(css,/body\.redline-sender-simple #activeRoom>.room-body/);
 assert.match(css,/redline-chat-bubble\.is-mine/);
 assert.match(css,/redline-chat-bubble\.is-theirs/);
});

test('Owner receiver mounts the same authenticated thread inline without cloning the chat',()=>{
 const receiver=read('private-photo-ledger-receiver.js');
 assert.match(receiver,/chatMount\.id='redlineReceiverChatMount'/);
 assert.match(receiver,/chatPanel\.id='redlineReceiverChat'/);
 assert.match(receiver,/dashboard\.append\(header,stats,nav,chatPanel\)/);
 assert.match(ui,/function syncOwnerChat\(snap\)/);
 assert.match(ui,/if\(messageCard\.parentNode!==mount\)mount\.append\(messageCard\)/);
 assert.match(ui,/const key=snap\.roomId\+/);
 assert.match(ui,/send\.disabled=Boolean\(!snap\.roomActive\|\|snap\.archiveMode\)/);
 assert.match(ui,/window\.addEventListener\('blackcell:redline:receiver-ready',sync\)/);
 assert.match(ui,/await bridge\(\)\.sendMessage\(text\)/);
});

test('Currently Viewing has authenticated selected-photo presence and photo beneath pinned timer',()=>{
 const migration=read('supabase/migrations/20261121201500_redline_currently_viewing_photo.sql');
 assert.match(ui,/\['viewing','Currently Viewing'\]/);
 assert.match(ui,/function renderCurrentlyViewing\(snap\)/);
 assert.match(ui,/async function pollCurrentlyViewing\(force=false\)/);
 assert.match(ui,/bridge\(\)\.currentlyViewingStatus\(roomId\)/);
 assert.match(ui,/redline-chat-timer-photo/);
 assert.match(ui,/photo\.image_url/);
 assert.match(ui,/p\.id===e\.timer\.photo_id/);
 assert.match(css,/redline-chat-timer-image/);
 assert.match(css,/repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(bridge,/async setCurrentlyViewing\(photoId\)/);
 assert.match(bridge,/async currentlyViewingStatus\(roomId\)/);
 assert.match(migration,/create table if not exists corp_private\.redline_currently_viewing/);
 assert.match(migration,/alter table corp_private\.redline_currently_viewing enable row level security/);
 assert.match(migration,/revoke all on corp_private\.redline_currently_viewing from public,anon,authenticated/);
 assert.match(migration,/owner_id=v_user and active/);
 assert.match(migration,/owner_id=v_user or member_id=v_user/);
 assert.match(migration,/v_updated<clock_timestamp\(\)-interval '45 seconds'/);
 assert.match(migration,/revoke all on function public\.corp_redline_currently_viewing_status\(uuid\)/);
});
