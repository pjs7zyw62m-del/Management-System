import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const viewer=read('private-photo-ledger-hd-viewer.js');
const styles=read('private-photo-ledger-hd-viewer.css');
const sender=read('private-photo-ledger-simple-sender.js');
const core=read('private-photo-ledger.js');
const bunny=read('private-photo-ledger-bunny.js');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');

test('original viewer keeps native bytes, reports pixel dimensions and prepares only next authorized photo',()=>{
 assert.doesNotThrow(()=>new Script(viewer));
 assert.match(viewer,/window\.BLACKCELL_REDLINE_API/);
 assert.match(viewer,/p\.image_url/);
 assert.match(viewer,/!p\.removal_status&&!p\.removed/);
 assert.match(viewer,/photo\.src=item\.image_url/);
 assert.match(viewer,/photo\.naturalWidth/);
 assert.match(viewer,/photo\.naturalHeight/);
 assert.match(viewer,/pictures\[index\+1\]/);
 assert.match(viewer,/preview\.decode\(\)/);
 assert.match(viewer,/if\(modal\.hidden\|\|index<0/);
 assert.doesNotMatch(viewer,/(?:fetch|createSignedUrl|readBunnyPhoto|createObjectURL|canvas\.toBlob|toDataURL)\(/);
 assert.match(core,/readBunnyPhoto\(db,e\.room_id,e\.id\)/);
 assert.match(bunny,/return value;/);
});

test('private full-screen navigation closes on removed photo or room reset',()=>{
 assert.match(viewer,/s\.roomId!==activeRoom/);
 assert.match(viewer,/close\.click\(\)/);
 assert.match(viewer,/blackcell:redline:reset/);
 assert.match(viewer,/blackcell:redline:state/);
 assert.match(viewer,/ArrowRight/);
 assert.match(viewer,/ArrowLeft/);
 assert.match(styles,/#photoLightbox:not\(\[hidden\]\) #lightboxImage/);
 assert.match(styles,/object-fit:contain!important/);
 assert.match(styles,/body\.redline-sender-simple #photoLightbox:not\(\[hidden\]\)/);
 assert.match(html,/private-photo-ledger-photo-zoom\.js/);
});

test('Android, tablet and desktop sender can open original from existing secure photo screens',()=>{
 assert.match(sender,/VIEW ORIGINAL QUALITY/);
 assert.match(sender,/View this private original photograph full screen/);
 assert.match(sender,/View five-star photograph at original quality/);
 assert.match(sender,/BLACKCELL_REDLINE_HD_VIEWER\?\.open\(/);
 assert.match(html,/private-photo-ledger-hd-viewer\.js\?v=20261123-original-hd1/);
 assert.match(html,/private-photo-ledger-hd-viewer\.css\?v=20261123-original-hd1/);
 assert.match(os,/redlineRelease=20261123-original-hd-viewer1/);
});
