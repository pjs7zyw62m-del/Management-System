import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('corporate-chat.js','utf8');
const start=src.indexOf('   const requested=embedParams.get(\'peer\');');
const end=src.indexOf("   if(mediaPanelMode==='share'",start);
assert.ok(start>0&&end>start);
const boot=new Function('embedParams','contacts','mediaPanelMode','choose',src.slice(start,end));
const people=[{user_id:'first'},{user_id:'second'}];
test('normal launch does not choose any contact even with multiple authorized contacts',()=>{
 const picked=[];boot(new URLSearchParams(),people,null,id=>picked.push(id));assert.deepEqual(picked,[]);
});
test('explicit authorized conversation links work, unknown contacts do not auto-select',()=>{
 const picked=[];boot(new URLSearchParams('peer=second'),people,null,id=>picked.push(id));
 boot(new URLSearchParams('peer=unknown'),people,null,id=>picked.push(id));assert.deepEqual(picked,['second']);
});
test('media-only route preserves existing fallback; resizing does not choose a recipient',()=>{
 const picked=[];boot(new URLSearchParams(),people,'library',id=>picked.push(id));assert.deepEqual(picked,['first']);
 const resize=src.slice(src.indexOf("smallWindow.addEventListener('change'"),src.indexOf('const composerText='));
 assert.doesNotMatch(resize,/choose\(/);
});
test('desktop reopen is draft-aware and dedicated popouts are excluded',()=>{
 const reset=src.slice(src.indexOf('function returnToDesktopInbox(){'),src.indexOf('function choose(userId){'));
 assert.match(reset,/popout\|\|mediaPanelMode/);assert.match(reset,/messageInput'\)\.value\.trim\(\)/);
 assert.match(reset,/peer=null/);assert.match(reset,/Select a contact/);
 assert.match(readFileSync('blackcell-os.js','utf8'),/id==='chat'&&existing.el.hidden&&!touchOS\(\)/);
});
