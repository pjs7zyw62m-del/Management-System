import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync('corporate-chat.js','utf8'),css=readFileSync('corporate-chat-glass-message.css','utf8'),html=readFileSync('corporate-chat.html','utf8');
test('glass styling applies to text, not attachments, shares or deleted messages',()=>{
 assert.match(js,/const plainText=!m.deleted_at&&!m.media_batch_id&&!tubeRef&&!pulseRef&&!mediaPanelMode/);
 assert.match(js,/if\(plainText\)\{\s*item.classList.add\('bc-glass-message'\)/);
 assert.match(css,/\.bc-glass-message.mine>\.bubble/);
});
test('action capsule uses existing reaction menu and persisted stars',()=>{
 assert.match(js,/react.addEventListener\('click',e=>\{e.stopPropagation\(\);popoutActions.open\(bubble,m,own\)\}\)/);
 assert.match(js,/controls.append\(makeStarControl\(m.id\)\)/);
 assert.match(js,/item.append\(controls\)/);
});
test('read receipt still reflects actual server timestamp and own final message',()=>{
 assert.match(js,/if\(own&&!pairedAfter&&!m.deleted_at\)/);
 assert.match(js,/new Date\(m.read_at\).toLocaleTimeString/);
 assert.match(js,/m.read_at\?\(plainText\?'✓':'✓✓'\):'✓'/);
});
test('new assets load after existing chat styling and support touch',()=>{
 assert.match(html,/corporate-chat.js\?v=20261127-choose-contact1&glassMessage=20261128-1/);
 assert.ok(html.indexOf('corporate-chat-glass-message.css')>html.indexOf('corporate-chat-unified-desktop.css'));
 assert.match(css,/@media\(pointer:coarse\)/);
});
