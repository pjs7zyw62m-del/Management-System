import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installAndroidChatCaretGuard} from '../corporate-chat-android-caret.js';

class MockEditor extends EventTarget {
 constructor(){super();this.value='';this.selectionStart=0;this.selectionEnd=0;this.dataset={};}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
}
function event(type,inputType='',extra={}){
 const e=new Event(type);
 Object.defineProperty(e,'inputType',{value:inputType});
 for(const [key,value] of Object.entries(extra))Object.defineProperty(e,key,{value});
 return e;
}
const android='Mozilla/5.0 (Linux; Android 14; Neon Smarta 2 Build/UP1A.231005.007) AppleWebKit/537.36 Chrome/144.0 Mobile Safari/537.36';
function composer(ua=android){const box=new MockEditor();const guard=installAndroidChatCaretGuard(box,{userAgent:ua});return {box,guard};}
function input(box,letter,{forceStart=false,withBefore=false,inputType='insertText'}={}){
 if(forceStart)box.setSelectionRange(0,0); // affected keyboard resets cursor
 if(withBefore)box.dispatchEvent(event('beforeinput',inputType));
 const at=box.selectionStart;
 box.value=box.value.slice(0,at)+letter+box.value.slice(box.selectionEnd);
 box.setSelectionRange(at+letter.length,at+letter.length);
 box.dispatchEvent(event('input',inputType));
}
test('Neon Smarta 2: actual reverse-at-start insertion is recovered into hello',()=>{
 const {box,guard}=composer();
 for(const ch of 'hello')input(box,ch,{forceStart:true});
 assert.equal(box.value,'hello');
 assert.equal(box.selectionStart,5);
 assert.equal(guard.enabled,true);
 assert.ok(guard.correctionCount>=3);
});
test('Neon Smarta 2: pre-insertion safeguard corrects the caret before the next character',()=>{
 const {box,guard}=composer();
 for(const ch of 'hello')input(box,ch,{forceStart:true,withBefore:true});
 assert.equal(box.value,'hello');assert.equal(box.selectionStart,5);
 assert.ok(guard.correctionCount>=1);
});
test('Other Android users typing normally are left entirely untouched',()=>{
 const {box,guard}=composer('Mozilla/5.0 (Linux; Android 15; Pixel 8) Chrome/145 Mobile Safari/537.36');
 for(const ch of 'hello')input(box,ch);
 assert.equal(box.value,'hello');
 assert.equal(guard.correctionCount,0);
});
test('Intentional editing at beginning is respected, not reordered',()=>{
 const {box}=composer();
 for(const ch of 'hello')input(box,ch,{forceStart:true});
 box.setSelectionRange(0,0);box.dispatchEvent(event('pointerup'));
 input(box,'X');assert.equal(box.value,'Xhello');
 assert.equal(box.selectionStart,1);
});
test('Composing keyboard is not modified mid-composition, but fixes unambiguous final prepend',()=>{
 const {box}=composer();
 for(const ch of 'he')input(box,ch);
 box.dispatchEvent(event('compositionstart'));
 box.value='lhe';box.setSelectionRange(1,1);
 box.dispatchEvent(event('input','insertCompositionText',{isComposing:true}));
 assert.equal(box.value,'lhe','Do not interfere while composition is ongoing');
 box.dispatchEvent(event('compositionend'));
 assert.equal(box.value,'hel');
 assert.equal(box.selectionStart,3);
});
test('Backspace and a new message after send remain editable',()=>{
 const {box,guard}=composer();
 for(const ch of 'hello')input(box,ch,{forceStart:true});
 box.value='hell';box.setSelectionRange(4,4);box.dispatchEvent(event('input','deleteContentBackward'));
 assert.equal(box.value,'hell');
 box.value='';box.setSelectionRange(0,0);guard.reset();
 for(const ch of 'new')input(box,ch,{forceStart:true});
 assert.equal(box.value,'new');
});
test('Desktop/non-Android devices get no typing intervention',()=>{
 const {box,guard}=composer('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
 for(const ch of 'hello')input(box,ch);
 assert.equal(box.value,'hello');assert.equal(guard.enabled,false);
});
// Simulate Android 11 Chrome being backgrounded by another app. The older
// browser can resume with the textarea's selection reset to position 0.
function resumedComposer(){
 const box=new MockEditor(),doc=new EventTarget(),view=new EventTarget();
 doc.hidden=false;doc.defaultView=view;doc.activeElement=box;
 box.ownerDocument=doc;
 const guard=installAndroidChatCaretGuard(box,{userAgent:'Mozilla/5.0 (Linux; Android 11; Neon Smarta 2) AppleWebKit/537.36 Chrome/110.0.0.0 Mobile Safari/537.36'});
 function background(){
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
  box.setSelectionRange(0,0);
  box.dispatchEvent(new Event('blur'));
 }
 function resume(){
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
  view.dispatchEvent(new Event('pageshow'));
  box.dispatchEvent(new Event('focus'));
 }
 return {box,guard,doc,view,background,resume};
}
test('Android 11: app switch resets Chrome selection to start and input without beforeinput still appends',()=>{
 const {box,guard,background,resume}=resumedComposer();
 for(const ch of 'hello')input(box,ch);
 background();resume();
 input(box,'!',{forceStart:true});
 assert.equal(box.value,'hello!');
 assert.equal(box.selectionStart,6);
 assert.ok(guard.correctionCount>=1);
});
test('Android 11: beforeinput following app resume restores caret before the keystroke',()=>{
 const {box,guard,background,resume}=resumedComposer();
 for(const ch of 'hello')input(box,ch);
 background();resume();
 input(box,'!',{forceStart:true,withBefore:true});
 assert.equal(box.value,'hello!');
 assert.equal(box.selectionStart,6);
 assert.ok(guard.correctionCount>=1);
});
test('Android 11: user deliberately taps beginning after resume to edit and app does not reorder text',()=>{
 const {box,background,resume}=resumedComposer();
 for(const ch of 'hello')input(box,ch);
 background();resume();
 box.setSelectionRange(0,0);box.dispatchEvent(new Event('pointerup'));
 input(box,'X');
 assert.equal(box.value,'Xhello');
 assert.equal(box.selectionStart,1);
});
test('Android 11: keyboard navigation to a middle insertion point survives backgrounding',()=>{
 const {box,background,resume}=resumedComposer();
 for(const ch of 'hello')input(box,ch);
 box.setSelectionRange(2,2);box.dispatchEvent(event('keyup','',{key:'ArrowLeft'}));
 background();resume();
 box.setSelectionRange(2,2);input(box,'X');
 assert.equal(box.value,'heXllo');
});
test('Android 11: a pagehide/pageshow restore with missing inputType still recovers an accidental prepend',()=>{
 const {box,view,guard}=resumedComposer();
 for(const ch of 'hi')input(box,ch);
 view.dispatchEvent(new Event('pagehide'));
 box.setSelectionRange(0,0);
 view.dispatchEvent(new Event('pageshow'));
 input(box,'!',{forceStart:true,inputType:''});
 assert.equal(box.value,'hi!');
 assert.ok(guard.correctionCount>=1);
});
test('Android 11: sent/cleared draft never leaks back in after returning from another app',()=>{
 const {box,guard,background,resume}=resumedComposer();
 for(const ch of 'hello')input(box,ch);
 background();
 box.value='';box.setSelectionRange(0,0);guard.reset();
 resume();
 input(box,'N',{forceStart:true});
 input(box,'o',{forceStart:true});
 assert.equal(box.value,'No');
});
test('Integration loads guarded helper before live typing and busts asset cache',()=>{
 const chat=readFileSync('corporate-chat.js','utf8');
 const html=readFileSync('corporate-chat.html','utf8');
 assert.match(chat,/import \{installAndroidChatCaretGuard\} from/);
 assert.match(chat,/installAndroidChatCaretGuard\(composerText\)/);
 assert.ok(chat.indexOf('installAndroidChatCaretGuard(composerText)')<chat.indexOf("composerText.addEventListener('input'"));
 assert.match(chat,/androidChatCaretGuard\.reset\(\)/);
 assert.match(html,/corporate-chat\.js\?v=20261122-android11-inbox-recovery8/);
});
