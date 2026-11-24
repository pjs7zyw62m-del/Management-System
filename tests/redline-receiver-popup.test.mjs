import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const r=readFileSync('private-photo-ledger-receiver.js','utf8'),css=readFileSync('private-photo-ledger-receiver-popup.css','utf8');
test('receiver popup reuses existing review and chat and opens only for new pending ids',()=>{assert.match(r,/seenPending.has\(e.id\)/);assert.match(r,/reviewStage.append\(originalReview\)/);assert.match(r,/reviewStage.append\(bidTimerPanel\)/);assert.match(r,/chatPanel.parentNode!==dashboard/);assert.match(r,/chatSplit.addEventListener\('pointermove'/);assert.match(css,/rr-media-closed/);assert.match(css,/--rr-popup-share/);});

test('receiver startup keeps the chat in the dashboard before adding popup controls',()=>{
 assert.doesNotMatch(r,/workspace\.append\(chatPanel,photos\)/);
 assert.match(r,/dashboard\.append\(waiting,chatPanel\)/);
 assert.match(r,/dashboard\.append\(chatSplit,chatPanel\)/);
 assert.doesNotMatch(r,/dashboard\.insertBefore\((?:waiting|chatSplit),chatPanel\)/);
});
