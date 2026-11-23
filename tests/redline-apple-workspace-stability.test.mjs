import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('REDLINE receiver sidebar is collapsible and Settings is not duplicated there',()=>{
 const js=read('private-photo-ledger-receiver.js');
 assert.match(js,/rrAppleSidebarToggle/);
 assert.match(js,/rr-sidebar-hidden/);
 assert.match(js,/sidebarStorageKey/);
 assert.doesNotMatch(js,/appleLink\('⚙  Settings'/);
 assert.doesNotMatch(js,/redlineReceiverMenuSettings/);
});
test('REDLINE chat polling preserves the reader position and avoids page scroll',()=>{
 const js=read('private-photo-ledger-simple-sender.js');
 const css=read('private-photo-ledger-workspace-stability.css');
 assert.match(js,/priorScrollTop=feed\.scrollTop/);
 assert.match(js,/if\(followBottom\)feed\.scrollTop=feed\.scrollHeight/);
 assert.match(js,/Math\.min\(priorScrollTop,feed\.scrollHeight-feed\.clientHeight\)/);
 assert.match(css,/overflow-anchor:none/);
});
test('REDLINE photo decisions share a scroll-free review strip',()=>{
 const css=read('private-photo-ledger-workspace-stability.css');
 const html=read('private-photo-ledger.html');
 assert.match(css,/max-height:none!important/);
 assert.match(css,/redline-review-actions/);
 assert.match(css,/rr-permanent-delete-button/);
 assert.match(html,/private-photo-ledger-workspace-stability\.css/);
});

test('approved compact REDLINE keeps controls, compresses earnings and expands the chat',()=>{
 const html=read('private-photo-ledger.html');
 const css=read('private-photo-ledger-compact-chat.css');
 assert.match(html,/private-photo-ledger-compact-chat\.css\?v=20261122-approved-compact-chat1/);
 assert.match(css,/#rrAppleTimerMount>#redlineLightboxReview:not\(\[hidden\]\)/);
 assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(105px,1fr\)\)/);
 assert.match(css,/grid-template-rows:auto auto minmax\(0,1fr\)/);
 assert.match(css,/#rrAppleRight>\.rr-chat-panel:not\(\[hidden\]\)/);
 assert.match(css,/rr-permanent-delete-button/);
 assert.match(css,/data-redline-decision="pending"/);
});
test('chat does not redraw unchanged messages during background polling',()=>{
 const js=read('private-photo-ledger-simple-sender.js');
 assert.match(js,/lastChatViewSignature/);
 assert.match(js,/if\(chatSignature===lastChatViewSignature&&feed\.dataset\.redlineScrollReady==='true'\)return/);
 assert.match(js,/feed\.replaceChildren\(\)/);
 assert.match(js,/if\(followBottom\)feed\.scrollTop=feed\.scrollHeight/);
});
