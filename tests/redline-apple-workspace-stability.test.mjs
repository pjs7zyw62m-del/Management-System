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