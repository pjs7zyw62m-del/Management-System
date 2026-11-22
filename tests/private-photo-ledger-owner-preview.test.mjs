import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const html=read('private-photo-ledger.html');
const code=read('private-photo-ledger-owner-preview.js');
const css=read('private-photo-ledger-owner-preview.css');
const core=read('private-photo-ledger.js');
test('owner preview is linked to existing authenticated REDLINE',()=>{
 assert.match(html,/private-photo-ledger-owner-preview\.css\?v=20261121-current-viewing1/);
 assert.match(html,/private-photo-ledger-owner-preview\.js\?v=20261121-current-viewing1/);
 assert.ok(html.indexOf('private-photo-ledger-sender.js')<html.indexOf('private-photo-ledger-owner-preview.js'));
 assert.match(html,/id="ownerSetup"/);
 assert.match(html,/id="ownerUploadInfo"/);
 assert.match(html,/id="employeeUpload"/);
});
test('preview launchers exist only within owner-only sections',()=>{
 assert.match(code,/const setup=\$\('#ownerSetup'\),ownerInfo=\$\('#ownerUploadInfo'\)/);
 assert.match(code,/const ownerVisible=\(\)=>visible\(app\)&&\(visible\(setup\)\|\|visible\(ownerInfo\)\)/);
 assert.match(code,/if\(!ownerVisible\(\)\)return/);
 assert.match(code,/redlineSetupPreviewButton/);
 assert.match(code,/redlineOwnerPreviewButton/);
 assert.match(code,/dialog\.showModal\(\)/);
 assert.match(code,/dialog\.close\(\)/);
});
test('preview is isolated from upload/approval/financial APIs',()=>{
 assert.match(code,/Live senders upload immediately/);
 assert.match(code,/fileInput\.type='file'/);
 assert.match(code,/fileInput\.value=''/);
 assert.doesNotMatch(code,/previewImg|URL\.createObjectURL|submit\.disabled=true/);
 assert.doesNotMatch(code,/\.upload\(|\.insert\(|\.update\(|\.delete\(|client\.rpc\(|fetch\(/);
 assert.doesNotMatch(code,/supabase|localStorage|#submitPhoto|\.click\(\)\s*;\s*document\.querySelector\('#submitPhoto'\)/i);
 assert.match(core,/const BUCKET='corp-private-photo-ledger'/);
 assert.match(core,/const ROOMS='corp_private_photo_rooms'/);
 assert.match(core,/const ENTRIES='corp_private_photo_entries'/);
});
test('preview includes phone/tablet and read-only sender tabs',()=>{
 assert.match(code,/dataset\.device='phone'/);
 assert.match(code,/setDevice\('tablet'\)/);
 assert.match(code,/selectTab\('history'\)/);
 assert.match(code,/renderPreviewPhotoHistory\(\)/);
 assert.match(code,/\.disabled=true/);
 assert.match(code,/make\('button','is-active','Phone'\)/);
 assert.match(css,/data-device=tablet/);
 assert.match(css,/bc-redline-preview-nav/);
 assert.match(css,/bc-redline-sender-preview::backdrop/);
});


test('BLACKCELL OS owner preview is messenger-first with safe sample payday and real payment dates',()=>{
 assert.match(code,/upload\.replaceChildren\(liveStrip,thread,photoDrawer,reviewQueue\)/);
 assert.match(code,/\['upload','Messages',upload\]/);
 assert.match(code,/\['payday','Payday',paydayPanel\]/);
 assert.match(code,/stripStats\.approved\.textContent=earnedValues\.total\.textContent/);
 assert.match(code,/paymentHistory/);
 assert.match(code,/paymentDates\.replaceChildren\(\)/);
 assert.match(code,/PREVIEW ONLY/);
 assert.match(code,/request\.disabled=true/);
 assert.match(css,/bc-redline-preview-live-strip/);
 assert.match(css,/bc-redline-preview-payday-grid/);
 assert.match(css,/repeat\(6,minmax\(0,1fr\)\)!important/);
});
