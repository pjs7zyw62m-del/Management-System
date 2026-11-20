import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const html=read('private-photo-ledger.html'),js=read('private-photo-ledger-responsive.js'),css=read('private-photo-ledger-responsive.css'),core=read('private-photo-ledger.js');
test('mobile revision assets are cache-busted and original backend is retained',()=>{
 assert.match(html,/private-photo-ledger-responsive\.js\?v=20261120-sender-v3/);
 assert.match(html,/private-photo-ledger-responsive\.css\?v=20261120-mobile2/);
 assert.match(html,/private-photo-ledger\.js\?v=/);
 assert.match(core,/corp_private_photo_rooms/);
 assert.match(core,/corp_private_photo_entries/);
});
test('mobile tabs now reveal the selected content rather than scrolling to page top',()=>{
 assert.match(js,/destination\.scrollIntoView\(\{behavior:mobile\?'auto':'smooth'/);
 assert.match(js,/requestAnimationFrame\(\(\)=>/);
 assert.ok(!js.includes("window.scrollTo({top:0"));
});
test('owner Reviewed Photos action switches to actually visible history',()=>{
 assert.match(js,/VIEW REVIEWED PHOTOS/);
 assert.match(js,/activate\('photos'\)/);
 assert.match(css,/data-ledger-view="photos"/);
 assert.match(css,/#ownerReviewQueue\{display:none!important\}/);
});
test('role restrictions are preserved',()=>{
 assert.match(js,/isShown\(room\)&&isShown\(\$\('#ownerReviewQueue'\)\)/);
 assert.match(js,/isShown\(room\)&&isShown\(\$\('#employeeUpload'\)\)/);
 assert.match(js,/nav\.hidden=!isShown\(app\)\|\|!isShown\(room\)\|\|!isMobile/);
 assert.ok(!js.includes('fetch('));
 assert.ok(!js.includes('supabase'));
 assert.ok(!js.includes('db.rpc('));
});
test('small phones, safe-area, photos, and form interactions are accommodated',()=>{
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/scroll-margin-top/);
 assert.match(css,/bc-ledger-keyboard-active/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/body\.bc-ledger-mobile \.photo-entry img/);
 assert.match(css,/#employeeUpload input\[type=file\]/);
 assert.match(css,/grid-template-columns:repeat\(var\(--ledger-visible-tabs,4\)/);
 assert.match(js,/bc-ledger-keyboard-active/);
});
