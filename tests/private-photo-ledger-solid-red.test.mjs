import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(x,'utf8');
const html=read('private-photo-ledger.html');
const code=read('private-photo-ledger-solid-red.js');
const css=read('private-photo-ledger-solid-red.css');
const core=read('private-photo-ledger.js');
test('solid red assets load after existing responsive and sender design',()=>{
 assert.match(html,/private-photo-ledger-solid-red\.css\?v=20261120-solid-red1/);
 assert.match(html,/private-photo-ledger-solid-red\.js\?v=20261120-solid-red1/);
 assert.ok(html.indexOf('private-photo-ledger-owner-preview.css')<html.indexOf('private-photo-ledger-solid-red.css'));
 assert.ok(html.indexOf('private-photo-ledger-sender.js')<html.indexOf('private-photo-ledger-solid-red.js'));
});
test('pure presentation scope uses verified sender, never owner',()=>{
 assert.match(code,/const senderView=!app\.hidden&&owner\.hidden/);
 assert.match(code,/document\.body\.classList\.toggle\('bc-redline-solid-sender',senderView\)/);
 assert.match(code,/observer\.observe\(app,\{attributes:true,attributeFilter:\['hidden'\]\}\)/);
 assert.match(code,/observer\.observe\(owner,\{attributes:true,attributeFilter:\['hidden'\]\}\)/);
 assert.doesNotMatch(code,/fetch\(|rpc\(|upload\(|\.insert\(|\.update\(|localStorage|supabase/i);
});
test('sender no-room screen is solid black and bright crimson',()=>{
 assert.match(css,/body\.bc-redline-solid-sender\{/);
 assert.match(css,/background:#000!important/);
 assert.match(css,/#noRoom\.empty-room\{/);
 assert.match(css,/border:2px solid #e0001b!important/);
 assert.match(css,/\.no-room-upload-hint\{/);
 assert.match(css,/border:1\.5px dashed #ee132e!important/);
 assert.ok(!/linear-gradient\(|radial-gradient\(|backdrop-filter:blur\([0-9]/.test(css));
});
test('sender active room, photo upload, history and owner preview share flat palette',()=>{
 for(const term of ['.bc-sender-hero','#employeeUpload','.bc-ledger-phone-nav',
 '#activeRoom .metric','#activeRoom .photo-entry','.bc-redline-sender-preview']){
  assert.ok(css.includes(term),term);
 }
 assert.match(css,/\.bc-redline-preview-submit\{/);
 assert.match(core,/const ROOMS='corp_private_photo_rooms'/);
 assert.match(core,/const ENTRIES='corp_private_photo_entries'/);
 assert.match(core,/const BUCKET='corp-private-photo-ledger'/);
 assert.match(html,/private-photo-ledger\.js\?v=(?:20261121-compact-bid-controls1)/);
});
