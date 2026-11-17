import test from 'node:test';
import assert from 'node:assert/strict';
import {planGunnerProduction} from '../blackcell-gunner-production.js';

const calculate=(photos, videos=photos.map(()=>0),pending=0)=>planGunnerProduction({
  daily:photos.map((n,i)=>({day:'2026-11-'+String(i+4).padStart(2,'0'),photos:n,videos:(Array.isArray(videos)?videos[i]:0)})),
  summary:{bytes_14d:0}
},{media:{pending}});

test('zero uploads today do not count as a missed day before midnight',()=>{
  const p=calculate(Array(13).fill(10).concat(0));
  assert.equal(p.photo.missedYesterday,false);
  assert.equal(p.photo.carryover,0);
  assert.equal(p.photo.daily,p.photo.baseDaily);
});

test('missing yesterday increases next daily photo quota and explains why',()=>{
  const p=calculate(Array(12).fill(10).concat([0,0]));
  assert.equal(p.photo.missedYesterday,true);
  assert.ok(p.photo.carryover>0);
  assert.equal(p.photo.daily,p.photo.baseDaily+p.photo.carryover);
  assert.match(p.photo.reason,/Because you missed that day/);
  assert.match(p.photo.reason,/today's suggested quota/);
});

test('surplus uploads offset previous missed day rather than charging it twice',()=>{
  const p=calculate(Array(11).fill(10).concat([0,20,0]));
  assert.equal(p.photo.carryover,0);
  assert.equal(p.photo.missedYesterday,false);
});

test('catch-up is capped to keep a multi-day miss realistic',()=>{
  const p=calculate(Array(11).fill(10).concat([0,0,0]));
  assert.ok(p.photo.deferred>=0);
  assert.ok(p.photo.daily<=p.photo.baseDaily*2);
  assert.equal(p.photo.missedYesterday,true);
});

test('large review backlog reduces intake and defers catch-up',()=>{
  const p=calculate(Array(12).fill(10).concat([0,0]),null,200);
  assert.equal(p.photo.pausedByBacklog,true);
  assert.equal(p.photo.carryover,0);
  assert.match(p.photo.reason,/catch-up is deferred/);
});

test('video quota is weekly and not assessed as a missed daily upload',()=>{
  const p=calculate(Array(14).fill(7),Array(12).fill(1).concat([0,0]));
  assert.equal(p.video.ready,true);
  assert.ok(p.video.weekly>=1);
  assert.equal(p.video.daily,undefined);
});

test('no history does not fabricate daily quota',()=>{
  const p=calculate(Array(14).fill(0));
  assert.equal(p.photo.ready,false);
  assert.equal(p.photo.daily,null);
});

test('growth alert is not mistaken for an invoice',()=>{
  const p=calculate(Array(7).fill(0).concat(Array(7).fill(10)));
  assert.ok(p.alerts.some(a=>a.includes('doubled')));
  assert.equal(p.billingKnown,false);
  assert.match(p.warning,/not a provider invoice/);
});

test('a fully completed missed video week adds a bounded weekly catch-up target',()=>{
  const videos=Array(14).fill(0);
  videos[0]=2; // earlier than previous complete Mon–Sun week
  videos[12]=1; // Monday of current calendar week
  const p=calculate(Array(14).fill(10),videos);
  assert.equal(p.video.ready,true);
  assert.equal(p.video.thisWeekCount,1);
  assert.ok(p.video.carryover>0);
  assert.equal(p.video.weekly,p.video.baseWeekly+p.video.carryover);
  assert.match(p.video.reason,/preceding completed week fell short/);
});

test('video has no daily catch-up penalty for a zero-upload yesterday',()=>{
  const p=calculate(Array(12).fill(10).concat([0,0]),Array(13).fill(1).concat(0));
  assert.equal(p.photo.missedYesterday,true);
  assert.equal(p.video.daily,undefined);
  assert.equal(p.video.thisWeekCount,1);
});
