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
 assert.match(js,/const scrollBefore=feed\.scrollTop/);
 assert.match(js,/feed\.insertBefore\(node,cursor\)/);
 assert.match(js,/if\(scrollToLatest\)feed\.scrollTop=feed\.scrollHeight/);
 assert.match(js,/anchor\.getBoundingClientRect\(\)\.top-anchorTop/);
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
 assert.match(js,/feed\.insertBefore\(node,cursor\)/);
 assert.doesNotMatch(js,/if\(followBottom\)feed\.scrollTop=feed\.scrollHeight/);
});


test('REDLINE no-bounce policy forbids automatic jumps on receipt and timer polling',()=>{
 const js=read('private-photo-ledger-simple-sender.js');
 const html=read('private-photo-ledger.html');
 const css=read('private-photo-ledger-chat-scroll-fix.css');
 assert.match(js,/function renderChat\(\{scrollToLatest=false\}=\{\}\)/);
 assert.match(js,/const anchor=\[\.\.\.feed\.children\]\.find/);
 assert.match(js,/const keep=new Set\(desired\)/);
 assert.match(js,/if\(scrollToLatest\)feed\.scrollTop=feed\.scrollHeight/);
 assert.match(js,/chatOwnSendPending=true/);
 assert.match(js,/chatInitialPositionPending=false/);
 assert.match(js,/renderChat\(\{scrollToLatest:chatInitialPositionPending\|\|chatOwnSendPending\}\)/);
 assert.doesNotMatch(js,/home\.scrollIntoView/);
 assert.match(css,/scroll-behavior:auto!important/);
 assert.match(css,/overflow-anchor:none!important/);
 assert.match(html,/private-photo-ledger-chat-scroll-fix\.css/);
});


test('REDLINE transient owner refresh cannot discard the mounted chat or auto-reload page',()=>{
 const js=read('private-photo-ledger-simple-sender.js');
 const live=read('blackcell-live-update.js');
 const html=read('private-photo-ledger.html');
 const owner=js.slice(js.indexOf('function syncOwnerChat(snap){'),js.indexOf('function sync(){',js.indexOf('function syncOwnerChat(snap){')));
 assert.doesNotMatch(owner,/if\(!ready\)\{\s*lastOwnerSession=null/);
 assert.match(owner,/if\(!ready\)\{[\s\S]*?return;/);
 assert.match(js,/if\(messageCard\.parentNode!==uploadPane\)/);
 assert.match(live,/const redlineLiveThread=/);
 assert.match(live,/if\(redlineLiveThread\)return/);
 assert.match(js,/if\(lastOwnerSession\)ownerChatNeedsResume=true/);
 assert.match(js,/else if\(ownerChatNeedsResume\)/);
 assert.match(html,/site-presence2-redline-continuity/);
});


test('REDLINE saves a user-selected message anchor through receiver hidden/reflow without forcing bottom',()=>{
 const js=read('private-photo-ledger-simple-sender.js');
 const html=read('private-photo-ledger.html');
 assert.match(js,/let readerAnchor=null,readerGestureUntil=0,readerRestoring=false/);
 assert.match(js,/function saveReaderAnchor\(\)/);
 assert.match(js,/function restoreReaderAnchor\(\)/);
 assert.match(js,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(saveReaderAnchor\)\)/);
 assert.match(js,/const retained=readerAnchor\?\.roomKey===readerRoomKey\(\)\?readerAnchor:null/);
 assert.match(js,/else if\(retained\)restoreReaderAnchor\(\)/);
 assert.match(js,/readerResizeObserver\.observe\(feed\)/);
 assert.match(js,/if\(readerAnchor\)requestAnimationFrame\(restoreReaderAnchor\)/);
 assert.match(js,/const followLatest=Boolean\(scrollToLatest&&\(chatOwnSendPending/);
 assert.match(html,/stableChat=20261123-v6-durable-read-anchor/);
});
