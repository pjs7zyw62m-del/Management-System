import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhoneGesture} from '../blackcell-os-phone-navigation.js';
import {readFileSync} from 'node:fs';
test('Phone gesture thresholds avoid interpreting taps and diagonal movements as gestures',()=>{
 assert.equal(classifyPhoneGesture(0,-8),null);
 assert.equal(classifyPhoneGesture(12,-70),'home');
 assert.equal(classifyPhoneGesture(12,-70,true),'switcher');
 assert.equal(classifyPhoneGesture(-70,8),'next');
 assert.equal(classifyPhoneGesture(70,8),'previous');
 assert.equal(classifyPhoneGesture(70,-70),null);
 assert.equal(classifyPhoneGesture(0,70),null);
});
test('Gesture rail delegates to existing lifecycle and remains phone scoped',()=>{
 const os=readFileSync('blackcell-os.js','utf8'),css=readFileSync('blackcell-os-phone-navigation.css','utf8');
 assert.match(os,/home:\(\)=>\{closeMenu\(\);showDesktop\(\)\}/);
 assert.match(os,/close:id=>requestClose\(windows.get\(id\)\)/);
 assert.match(os,/onLock:\(\)=>\{phoneNavigation.dismiss\(\)/);
 assert.match(css,/html\.bc-os-phone #desktop>\.os-window\[data-os-app\]:not\(\[hidden\]\)>\.os-window-head>\.traffic\{display:none!important\}/);
 assert.match(css,/safe-area-inset-left/);
 assert.match(css,/safe-area-inset-right/);
});
