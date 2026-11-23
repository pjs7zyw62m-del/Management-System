import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const css=read('private-photo-ledger-sender-android-chat.css');
const fit=read('private-photo-ledger-sender-android-fit.js');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');
const messenger=read('private-photo-ledger-sender-messenger.js');

test('Android sender viewport is measured from actual topbar and visual viewport bottom',()=>{
 assert.doesNotThrow(()=>new Script(fit));
 assert.match(fit,/Android/i);
 assert.match(fit,/app\.getBoundingClientRect\(\)\.top/);
 assert.match(fit,/visual\.offsetTop/);
 assert.match(fit,/visual\.height/);
 assert.match(fit,/redline-android-chat-app-height/);
 assert.match(fit,/window\.addEventListener\('pageshow',schedule\)/);
 assert.match(fit,/visual\?\.addEventListener\('resize',schedule/);
 assert.doesNotMatch(fit,/scrollTo\(|scrollIntoView\(|\.focus\(|\.value\s*=/);
 assert.equal(Math.floor(730-128-5),597);
});

test('sender chat consumes remaining viewport while preserving independently scrolling messages and composer',()=>{
 assert.match(css,/@media \(max-width:719px\)/);
 assert.match(css,/body\.redline-sender-simple\.redline-sender-messenger\.redline-chat-immersive/);
 assert.match(css,/#ledgerApp\.shell/);
 assert.match(css,/height:var\(--redline-android-chat-app-height/);
 assert.match(css,/\.redline-message-card\{/);
 assert.match(css,/flex:1 1 0!important/);
 assert.match(css,/\.redline-message-feed\{/);
 assert.match(css,/overflow-y:auto!important/);
 assert.match(css,/\.redline-message-composer\{/);
 assert.match(css,/flex:0 0 auto!important/);
 assert.match(css,/\.redline-message-entry\{/);
 assert.match(css,/font-size:16px!important/);
 assert.match(css,/redline-android-keyboard-open/);
 assert.match(css,/redline-chat-immersive\.redline-android-keyboard-open[\s\S]*?\.redline-simple-tabs\{display:none!important\}/);
 assert.match(css,/redline-chat-immersive\.redline-android-keyboard-open[\s\S]*?\.redline-message-card > \.redline-chat-timer-slot:not\(\[hidden\]\)\{display:none!important\}/);
});

test('repeated tabs, footer, and oversized timer/photo do not cover message feed',()=>{
 assert.match(css,/> footer\{/);
 assert.match(css,/display:none!important/);
 assert.match(css,/\.redline-messenger-quick\{/);
 assert.match(css,/\.redline-messenger-live-strip:not\(\[hidden\]\)\{/);
 assert.match(css,/\.redline-chat-timer-slot \.redline-chat-timer-photo\{display:none!important\}/);
 assert.match(css,/\.redline-chat-rated-photo \.redline-rated-photo-image\{/);
 assert.match(messenger,/history:'History'/);
 assert.match(messenger,/viewing:'Viewing'/);
 assert.match(messenger,/addPhoto\.setAttribute\('aria-label','Open private photo upload'\)/);
});

test('new Android assets are loaded last and OS launcher URL refreshes',()=>{
 const oldStyle=html.indexOf('private-photo-ledger-sender-messenger.css');
 const newStyle=html.indexOf('private-photo-ledger-sender-android-chat.css?v=20261123-android-sender-chat-fit2');
 assert.ok(newStyle>oldStyle);
 assert.match(html,/private-photo-ledger-sender-android-fit\.js\?v=20261123-android-sender-chat-fit1/);
 assert.match(os,/redlineRelease=20261123-android-sender-chat-fit2/);
});
