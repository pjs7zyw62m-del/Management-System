import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(file,'utf8');
const html=read('private-photo-ledger.html');
const sender=read('private-photo-ledger-sender.js');
const style=read('private-photo-ledger-sender.css');
const responsive=read('private-photo-ledger-responsive.js');
const original=read('private-photo-ledger.js');
test('sender enhancement loads only on existing REDLINE page',()=>{
 assert.match(html,/private-photo-ledger-sender\.css\?v=20261120-sender-v3/);
 assert.match(html,/private-photo-ledger-sender\.js\?v=20261120-sender-v3/);
 assert.match(html,/private-photo-ledger-responsive\.js\?v=20261120-sender-v3/);
 assert.ok(html.indexOf('private-photo-ledger-responsive.js')<html.indexOf('private-photo-ledger-sender.js'));
});
test('sender mode requires the original verified room and upload permission',()=>{
 assert.match(sender,/const active=\(\)=>!app\.hidden&&!room\.hidden&&!upload\.hidden/);
 assert.match(sender,/document\.body\.classList\.toggle\('bc-ledger-sender',sender\)/);
 assert.match(sender,/hero\.hidden=!sender/);
 assert.match(sender,/if\(!sender\)landed=false/);
 assert.match(style,/\.bc-sender-hero\[hidden\]/);
 assert.match(style,/body\.bc-ledger-sender\.bc-ledger-mobile/);
});
test('sender upload is native and points only to existing form',()=>{
 assert.match(sender,/file\.click\(\)/);
 assert.match(sender,/file\.addEventListener\('change',updatePreview\)/);
 assert.match(sender,/URL\.createObjectURL\(selected\)/);
 assert.match(sender,/URL\.revokeObjectURL\(objectURL\)/);
 assert.match(sender,/if\(!file\.files\?\.length\)updatePreview\(\)/);
 assert.doesNotMatch(sender,/fetch\(|db\.from\(|\.upload\(|supabase|localStorage/i);
 assert.match(original,/const BUCKET='corp-private-photo-ledger'/);
 assert.match(original,/const ROOMS='corp_private_photo_rooms'/);
 assert.match(original,/const ENTRIES='corp_private_photo_entries'/);
});
test('sender gets upload first, owner remains unchanged',()=>{
 assert.match(sender,/tab\('upload'\)/);
 assert.match(responsive,/key==='upload'&&senderHero&&!senderHero\.hidden\?senderHero/);
 assert.match(style,/data-ledger-navigate="upload"\]\{order:-1\}/);
 assert.match(html,/id="ownerReviewQueue"/);
 assert.match(html,/id="ownerSetup"/);
 assert.match(html,/id="employeeUpload"/);
});
test('media and privacy hints remain accessible to sender',()=>{
 assert.match(sender,/AWAITING REVIEW/);
 assert.match(sender,/BALANCE/);
 assert.match(sender,/TWO-PERSON ACCESS/);
 assert.match(sender,/VIEW HISTORY/);
 assert.match(style,/scroll-margin-top/);
 assert.match(style,/@media\(max-width:370px\)/);
 assert.match(style,/prefers-reduced-motion/);
});
