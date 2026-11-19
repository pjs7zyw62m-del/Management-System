import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const html=read('blackcell-os.html');
const skin=read('blackcell-os-three-device.css');
const ux=read('blackcell-os-three-device.js');
const wallpaper=read('blackcell-os-cinematic-wallpaper.svg');
test('three-device shell loads after existing authenticated OS scripts',()=>{
 assert.match(html,/data-preview="false"/);
 assert.match(html,/id="gate"/);
 assert.match(html,/id="desktop"/);
 assert.match(html,/blackcell-os\.js\?v=/);
 assert.match(html,/blackcell-os-executive-20261119\.css/);
 assert.match(html,/blackcell-os-three-device\.css\?v=20261119-concept3/);
 assert.match(html,/blackcell-os-three-device\.js\?v=20261119-concept3/);
 assert.ok(html.indexOf('blackcell-os-executive-20261119.css')<html.indexOf('blackcell-os-three-device.css'));
 assert.ok(html.indexOf('blackcell-os-executive-20261119.js')<html.indexOf('blackcell-os-three-device.js'));
});
test('desktop, iPad and phone layouts use approved responsive thresholds',()=>{
 assert.match(skin,/@media\(min-width:1024px\)/);
 assert.match(skin,/@media\(min-width:621px\) and \(max-width:1023px\)/);
 assert.match(skin,/@media\(max-width:620px\)/);
 assert.match(skin,/html\.bc-os-phone/);
 assert.match(skin,/blackcell-os-cinematic-wallpaper\.svg/);
 assert.match(skin,/bc-concept-quick/);
 assert.match(skin,/bc-concept-mobile-nav/);
 assert.match(skin,/bc-concept-overlay/);
});
test('mobile navigation and quick-launch cards run existing installed apps',()=>{
 assert.match(ux,/function showOverlay\(/);
 assert.match(ux,/const launch=\(id\)=>/);
 assert.match(ux,/tile\.click\(\)/);
 assert.match(ux,/!tile\.hidden/);
 assert.match(ux,/!tile\.disabled/);
 assert.match(ux,/\['Home','home'/);
 assert.match(ux,/\['Apps','apps'/);
 assert.match(ux,/\['Workspace','workspace'/);
 assert.match(ux,/\['Network','network'/);
 assert.match(ux,/\['More','more'/);
 assert.match(ux,/\.dataset\.osApp/);
});
test('displayed data comes from real BLACKCELL account and storage state',()=>{
 assert.match(ux,/#topStatus/);
 assert.match(ux,/#bcStorageUsed/);
 assert.match(ux,/const apps=installed\(\)/);
 for(const wrong of ['Raccoon City','VIRUS STRAIN','Threat Level: CLEAR','12%','38%','LIVE WEATHER'])assert.ok(!ux.includes(wrong)&&!skin.includes(wrong));
 assert.ok(!ux.includes('localStorage.setItem'));
 assert.ok(!ux.includes('browserbase.com'));
});
test('original branded wallpaper contains BLACKCELL motif, no external assets',()=>{
 assert.match(wallpaper,/viewBox="0 0 1600 900"/);
 assert.match(wallpaper,/<svg/);
 assert.ok(!/href="https?:/.test(wallpaper));
});
