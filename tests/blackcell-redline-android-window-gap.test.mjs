import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync('blackcell-os-window-controls.css','utf8');
const html=readFileSync('blackcell-os.html','utf8');
const os=readFileSync('blackcell-os.js','utf8');
const block=css.slice(css.indexOf('REDLINE Android fullscreen conversation repair'));

test('REDLINE only: phone app window starts at viewport top, not below an unused black strip',()=>{
 assert.ok(block.startsWith('REDLINE Android fullscreen conversation repair') === false);
 assert.match(block,/@media\(max-width:620px\)/);
 assert.match(block,/html\.bc-os-phone #desktop > \.os-window\[data-os-app="photoledger"\]:not\(\[hidden\]\)/);
 assert.match(block,/left:0!important;top:0!important;right:0!important;bottom:0!important/);
 assert.match(block,/width:100%!important;height:100%!important/);
 assert.match(block,/min-width:0!important;min-height:0!important/);
 assert.match(block,/z-index:100!important/);
 assert.doesNotMatch(block,/data-os-app="chat"|data-os-app="administration"/);
});

test('green restore still yields a distinct inset layout without a 51px black band',()=>{
 assert.match(block,/\.bc-os-window-compact:not\(\[hidden\]\)/);
 assert.match(block,/left:5px!important;top:5px!important/);
 assert.match(block,/height:calc\(100% - 10px\)!important/);
 assert.match(block,/border-radius:13px!important/);
 assert.match(os,/w\.classList\.toggle\('bc-os-window-compact',compact\)/);
});

test('the live OS requests the updated CSS while preserving its standard phone window controls',()=>{
 assert.match(html,/redlinePhoneFill=20261123-v1/);
 assert.match(html,/blackcell-os-client-build" content="20261123-redline-android-phone-window-fill1"/);
 assert.match(css,/#desktop > \.os-window:not\(\[hidden\]\) > \.os-window-head > \.traffic/);
});
