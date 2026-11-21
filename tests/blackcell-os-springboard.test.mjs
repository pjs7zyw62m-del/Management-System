import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const html=read('blackcell-os.html'),css=read('blackcell-os-springboard.css'),js=read('blackcell-os-springboard.js');
test('new iPhone screen is layered after existing authenticated OS',()=>{
 assert.match(html,/data-preview="false"/);
 assert.match(html,/blackcell-os\.js\?v=/);
 assert.match(html,/blackcell-os-three-device\.css/);
 assert.match(html,/blackcell-os-springboard\.css\?v=ios-a-20261119/);
 assert.match(html,/blackcell-os-springboard\.js\?v=ios-a-20261119/);
 assert.ok(html.indexOf('blackcell-os-three-device.css')<html.indexOf('blackcell-os-springboard.css'));
 assert.ok(html.indexOf('blackcell-os-three-device.js')<html.indexOf('blackcell-os-springboard.js'));
});
test('Version A presents four-column home and translucent iPhone dock',()=>{
 assert.match(css,/html\.bc-os-phone #desktop\.bc-springboard-ready/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
 for(const c of ['bc-sb-widget','bc-sb-dock','bc-sb-dots','bc-sb-overlay','orientation:landscape','prefers-reduced-motion'])assert.ok(css.includes(c),c);
});
test('all launches still go through authorized OS application tiles',()=>{
 assert.match(js,/\.workspace \.apps/);
 assert.match(js,/if\(!tile\|\|tile\.hidden\|\|tile\.disabled/);
 assert.match(js,/tile\.click\(\)/);
 assert.match(js,/MutationObserver/);
 assert.match(js,/attributeFilter:\['hidden','class'\]/);
 assert.match(js,/window\.BLACKCELL_OS_WIDGET_LAYOUT/);
 assert.match(js,/bc\.os\.iphone-springboard\.v1:/);
 assert.match(js,/if\(!key\|\|shell\.hidden\)return/);
 assert.ok(!js.includes('browserbase.com'));
 assert.ok(!js.includes('fetch('));
});
test('swipes, App Library, Spotlight and Home Screen editing work',()=>{
 for(const mark of ['function setPage(','function openModal(','function enterEdit(','function moveIcon(','touchstart','touchend','library.addEventListener','searchPill.addEventListener','lock.addEventListener'])assert.ok(js.includes(mark),mark);
});
test('no fake data was introduced',()=>{
 for(const wrong of ['Raccoon City','VIRUS STRAIN','Research_Virus','38%','100% ONLINE'])assert.ok(!js.includes(wrong)&&!css.includes(wrong),wrong);
 assert.match(js,/Intl\.DateTimeFormat/);
 assert.match(js,/all\.length\+' available app'/);
});

test('iPhone landscape hides original desktop dock to avoid double docks',()=>{
 assert.match(css,/bc-springboard-ready\.os-dock-auto-hide:not\(:has\(>\.os-window:not\(\[hidden\]\)\)\)/);
 assert.match(css,/display:none!important;visibility:hidden!important;pointer-events:none!important/);
});
