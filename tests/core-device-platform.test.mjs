import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('private-photo-ledger-responsive.js','utf8');
const start=src.indexOf('  function nativePlatform(){'),end=src.indexOf('  // Desktop receiver parity',start);
assert.ok(start>=0&&end>start);
const detect=new Function('navigator','location','window','screen','innerWidth',src.slice(start,end)+'\nreturn {platform:nativePlatform(),mode:nativeDeviceMode()};');
const cases=[
 {
  "name": "iPhone",
  "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  "touch": 5,
  "w": 390,
  "h": 844,
  "expected": [
   "apple",
   "mobile"
  ]
 },
 {
  "name": "Android 11",
  "ua": "Mozilla/5.0 (Linux; Android 11; Neon Smarta 2) AppleWebKit Mobile",
  "touch": 5,
  "w": 360,
  "h": 740,
  "expected": [
   "android",
   "mobile"
  ]
 },
 {
  "name": "iPad desktop UA",
  "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
  "touch": 5,
  "w": 820,
  "h": 1180,
  "expected": [
   "apple",
   "tablet"
  ]
 },
 {
  "name": "Mac desktop",
  "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
  "touch": 0,
  "w": 1440,
  "h": 900,
  "expected": [
   "apple",
   "os"
  ]
 },
 {
  "name": "Windows",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "touch": 0,
  "w": 1440,
  "h": 900,
  "expected": [
   "standard",
   "os"
  ]
 },
 {
  "name": "Android tablet",
  "ua": "Mozilla/5.0 (Linux; Android 14; Pixel Tablet)",
  "touch": 5,
  "w": 900,
  "h": 1280,
  "expected": [
   "android",
   "tablet"
  ]
 }
];
for(const c of cases)test(c.name+' uses current browser rather than account role',()=>{
 const got=detect({userAgent:c.ua,maxTouchPoints:c.touch},{href:'https://blackcellcorp.com/private-photo-ledger.html'},{},{width:c.w,height:c.h},c.w);
 assert.deepEqual([got.platform,got.mode],c.expected);
});
