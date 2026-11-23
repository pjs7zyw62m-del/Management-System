import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const js=read('private-photo-ledger-bonus-celebration.js');
const css=read('private-photo-ledger-bonus-tracker.css');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');

test('proximity tracker appears in Photo History, not in private chat',()=>{
 assert.match(js,/parent\.insertBefore\(receiverTracker,history\)/);
 assert.match(js,/pane\.insertBefore\(senderTracker,controls\)/);
 assert.match(js,/#photoEntries/);
 assert.match(js,/data-redline-pane="history"/);
 assert.doesNotMatch(js,/chatPanel\.append\(receiverTracker\)/);
 assert.match(css,/\.redline-bonus-tracker-list/);
 assert.match(css,/overflow-y:auto/);
 assert.match(html,/private-photo-ledger-bonus-tracker\.css\?v=20261123-closest-bonus-tracker1/);
 assert.match(html,/private-photo-ledger-bonus-celebration\.js\?v=20261123-closest-bonus-tracker1/);
 assert.match(os,/redlineRelease=20261123-close-to-bonus1/);
});

test('tracker computes closeness from exactly three distinct 5-star prices and three completed timers',()=>{
 assert.match(js,/trackerCount\(p\.five_star_prices\)/);
 assert.match(js,/trackerCount\(p\.completed_timers\)/);
 assert.match(js,/reviews\+timers/);
 assert.match(js,/b\.total-a\.total/);
 assert.match(js,/oneAway=rows\.pending\.filter\(x=>x\.total===5\)/);
 assert.match(js,/CLOSEST FIRST/);
 assert.match(js,/AWARDED \(/);
 assert.match(js,/1 AWAY \(/);
 assert.match(js,/Only completed, positive-earning timer sessions/);
 assert.match(js,/makePhotoPreview\(item\.photo_id,current\)/);
 assert.match(js,/BLACKCELL_REDLINE_HD_VIEWER\?\.open\(item\.photo_id\)/);
 assert.match(js,/if\(fresh\?\.roomId!==current\.roomId\)return/);
 assert.match(js,/lastTrackerStatus=status;lastTrackerSnap=current;/);
 assert.match(js,/api\(\)\.repeatBonusStatus\(current\.roomId\)/);
});

test('actual ordered proximity excludes removed private photos and previously-awarded duplicates',()=>{
 const start=js.indexOf(' function trackerCount(value){');
 const end=js.indexOf(' function makeTrackerProgress(label,count){',start);
 assert.ok(start>=0&&end>start);
 const rows=runInNewContext(js.slice(start,end)+';trackerRows');
 const photo=(id,removal_status=null)=>({id,removal_status,created_at:'2026-11-23'});
 const snap={photoHistory:[photo('a'),photo('b'),photo('c'),photo('gone','removed'),photo('paid')]};
 const status={
   bonuses:[{photo_id:'paid',bonus_cents:100}],
   progress:[
    {photo_id:'a',five_star_prices:3,completed_timers:2},
    {photo_id:'b',five_star_prices:1,completed_timers:1},
    {photo_id:'c',five_star_prices:2,completed_timers:2},
    {photo_id:'gone',five_star_prices:3,completed_timers:3},
    {photo_id:'paid',five_star_prices:3,completed_timers:3}
   ]
 };
 const result=rows(status,snap);
 assert.deepEqual(Array.from(result.pending,el=>[el.photo_id,el.total]),
  [['a',5],['c',4],['b',2]]);
 assert.deepEqual(Array.from(result.awarded,el=>el.photo_id),['paid']);
 assert.equal(result.pending.some(x=>x.photo_id==='gone'),false);
 assert.equal(result.pending.some(x=>x.photo_id==='paid'),false);
});
