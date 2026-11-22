import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const html=read('blackcell-os.html'),js=read('blackcell-os-device-label.js'),css=read('blackcell-os-device-label.css');
test('device name assets load after the real OS and SpringBoard',()=>{
 assert.match(html,/blackcell-os-device-label\.css\?v=20261119-1/);
 assert.match(html,/blackcell-os-device-label\.js\?v=20261122-android-mobile1/);
 assert.ok(html.indexOf('blackcell-os-springboard.js')<html.indexOf('blackcell-os-device-label.js'));
});
test('computer, tablet and phone names exactly match approved labels',()=>{
 assert.match(js,/desktop:'BLACKCELL OS'/);
 assert.match(js,/tablet:'BLACKCELL OS Tablet'/);
 assert.match(js,/phone:'BLACKCELL OS Mobile'/);
 assert.match(js,/bc-os-phone/);
 assert.match(js,/bc-os-tablet/);
 assert.match(js,/document\.title=label/);
 assert.match(js,/bc-sb-status-brand/);
 assert.match(js,/bc-topbrand/);
 assert.match(js,/bc-exec-brand/);
 assert.match(js,/apple-mobile-web-app-title/);
});
test('does not modify app logic or permissions',()=>{
 assert.ok(!js.includes('fetch('));
 assert.ok(!js.includes('localStorage'));
 assert.ok(!js.includes('tile.click'));
 assert.ok(!js.includes('showApp('));
 assert.match(css,/bc-device-label/);
 assert.match(css,/bc-device-suffix/);
});

test('Android phone and tablet identify their edition but retain shared OS identity',()=>{
 assert.match(js,/bc-os-android/);
 assert.match(js,/blackcellOsPlatform/);
 assert.match(js,/names\[current\]\+' · Android'/);
 assert.match(js,/navigator\.userAgentData\?\.platform==='Android'/);
 assert.match(js,/current==='phone'\|\|current==='tablet'/);
});
