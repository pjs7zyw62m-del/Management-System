import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(name,'utf8');
const css=read('private-photo-ledger-taller-photo-chat.css');
const fit=read('private-photo-ledger-viewport-fit.js');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');

test('desktop photo/chat no longer has 860px minimum that hides composer',()=>{
 assert.doesNotMatch(css,/min-height:860px!important/);
 assert.match(css,/height:var\(--redline-viewport-fit-height,calc\(100dvh - 92px\)\)!important/);
 assert.match(css,/min-height:0!important/);
 assert.match(css,/#rrAppleRight>\.rr-chat-panel:not\(\[hidden\]\)/);
 assert.match(css,/min-height:220px!important/);
 assert.match(css,/\.redline-message-feed\{/);
 assert.match(css,/overflow-y:auto!important/);
 assert.match(css,/\.redline-message-composer\{/);
});

test('viewport measurement fits below the actual toolbar inside OS iframe',()=>{
 assert.match(fit,/workspace\.getBoundingClientRect\(\)\.top/);
 assert.match(fit,/window\.innerHeight-Math\.max\(0,top\)-12/);
 assert.match(fit,/matchMedia\('\(min-width:1000px\)'\)/);
 assert.match(fit,/!document\.body\.classList\.contains\('bc-ledger-mobile'\)/);
 assert.match(fit,/window\.addEventListener\('resize',schedule/);
 assert.match(fit,/window\.addEventListener\('blackcell:redline:state',schedule/);
 assert.doesNotMatch(fit,/(?:scrollTo|scrollIntoView|appendChild|replaceChildren)\(/);
 assert.equal(864-64-12,788);
});

test('client loads the layout version without cached old CSS',()=>{
 assert.match(html,/private-photo-ledger-taller-photo-chat\.css\?v=20261123-viewport-fit2/);
 assert.match(html,/private-photo-ledger-viewport-fit\.js\?v=20261123-visible-composer1/);
 assert.match(os,/redlineRelease=20261123-viewport-fit-visible-composer1/);
});
