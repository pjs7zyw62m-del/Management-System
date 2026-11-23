import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const core=read('private-photo-ledger.js');
const sender=read('private-photo-ledger-simple-sender.js');
const sql=read('supabase/migrations/20261123114500_redline_history_photo_signal.sql');
const css=read('private-photo-ledger-history-signals.css');
const html=read('private-photo-ledger.html');

test('receiver controls are opt-in actions on historical photo cards, not automatic signals',()=>{
 assert.match(core,/if\(state\.isOwner&&state\.room\?\.active&&!state\.showArchive\)/);
 assert.match(core,/sendHistoryPhotoSignal\(e,'looking'/);
 assert.match(core,/sendHistoryPhotoSignal\(e,'like'/);
 assert.match(core,/corp_redline_history_photo_signal/);
 assert.match(core,/blackcell:redline:messages-changed/);
 assert.match(css,/\.redline-history-photo-signals\{display:none\}/);
 assert.match(css,/#photoEntries \.redline-history-photo-signals/);
 assert.match(css,/body\.bc-redline-receiver #photoEntries/);
 assert.match(html,/private-photo-ledger-history-signals\.css/);
});

test('database only allows current-room verified owner to notify about sender-owned, not removed, photograph',()=>{
 assert.match(sql,/p_action NOT IN \('looking','like'\)/);
 assert.match(sql,/corp_private\.photo_ledger_verified\(\)/);
 assert.match(sql,/owner_id=v_user AND active/);
 assert.match(sql,/v_photo\.uploaded_by IS DISTINCT FROM v_room\.member_id/);
 assert.match(sql,/v_photo\.photo_removal_status IS NOT NULL/);
 assert.match(sql,/v_photo\.created_at<v_room\.current_session_started_at/);
 assert.match(sql,/public\.corp_private_photo_messages/);
 assert.match(sql,/REDLINE_PHOTO_SIGNAL:v1:/);
 assert.match(sql,/clock_timestamp\(\)/);
 assert.match(sql,/interval '12 seconds'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.corp_redline_history_photo_signal/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.corp_redline_history_photo_signal/);
});

test('only sender-authored spoofed markers are ignored; verified owner messages make true photo cards',()=>{
 const start=sender.indexOf('function historyPhotoSignal(e,snap){');
 const end=sender.indexOf('\nfunction makeHistoryPhotoSignalCard',start);
 assert.ok(start>=0&&end>start);
 const parse=runInNewContext(sender.slice(start,end)+';historyPhotoSignal');
 const owner='00000000-0000-4000-8000-000000000111';
 const member='00000000-0000-4000-8000-000000000222';
 const photo='00000000-0000-4000-8000-000000000333';
 const msg={kind:'chat',sender:owner,body:'REDLINE_PHOTO_SIGNAL:v1:like:'+photo};
 const senderSnapshot={isOwner:false,userId:member,photoHistory:[{id:photo,image_url:'https://example.org/secure-image'}]};
 const result=parse(msg,senderSnapshot);
 assert.equal(result.action,'like');
 assert.equal(result.photo.id,photo);
 assert.equal(parse({...msg,sender:member},senderSnapshot),null);
 assert.equal(parse({...msg,body:'REDLINE_PHOTO_SIGNAL:v1:like:invalid'},senderSnapshot),null);
 assert.equal(parse({...msg,body:'hello'},senderSnapshot),null);
 assert.equal(parse(msg,{...senderSnapshot,isOwner:true,userId:owner}).action,'like');
});

test('sender receives a photo thumbnail in a bounded chat card without changing scroll anchoring',()=>{
 assert.match(sender,/RECEIVER LIKES YOUR PHOTO/);
 assert.match(sender,/RECEIVER IS LOOKING AT YOUR PHOTO/);
 assert.match(sender,/const photoBox=make\('div','redline-chat-photo-signal-image'\)/);
 assert.match(sender,/img\.src=signal\.photo\.image_url/);
 assert.match(sender,/makeHistoryPhotoSignalCard\(e,snap\)/);
 assert.match(sender,/Boolean\(historyPhotoSignal\(e,snap\)\?\.photo\?\.image_url\)/);
 assert.match(sender,/restoreReaderAnchor/);
 assert.match(css,/\.redline-chat-photo-signal/);
});
