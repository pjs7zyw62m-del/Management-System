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
 assert.match(html,/corporate-chat.js\?v=20261127-choose-contact1&glassMessage=20261128-5/);
 assert.ok(html.indexOf('corporate-chat-glass-message.css')>html.indexOf('corporate-chat-unified-desktop.css'));
 assert.match(css,/@media\(pointer:coarse\)/);
});

test('ordinary messages keep controls hidden until selected and only one toolbar opens',()=>{
 assert.match(css,/\.bc-glass-message:not\(\.show-time\)>\.bc-glass-message-actions\{display:none\}/);
 assert.match(js,/box.querySelectorAll\('\.bc-glass-message.show-time'\)/);
 assert.match(js,/other.classList.remove\('show-time'\)/);
 assert.match(js,/bubble.setAttribute\('aria-expanded',String\(opening\)\)/);
});
test('timestamps and receipts share compact metadata and remain based on real data',()=>{
 assert.match(js,/const meta=plainText\?text\('div','bc-glass-message-meta',''\):item/);
 assert.match(js,/meta.append\(receipt\)/);
 assert.match(css,/\.bc-glass-message-meta\{display:flex;align-items:center;flex-wrap:wrap/);
 assert.match(css,/\.bc-glass-message:not\(\.show-time\)>\.bc-glass-message-meta>time.group-time\{display:none\}/);
});

test('reactions are persisted by original message ID, not inserted as text messages',()=>{
 const actions=readFileSync('corporate-chat-popout-actions.js','utf8');
 assert.match(actions,/await sendReaction\(entry.message,glyph\)/);
 assert.doesNotMatch(actions,/reacted to/);
 assert.match(js,/upsert\(\{message_id:message.id,reactor_id:uid,reaction:glyph\}/);
 assert.match(js,/existing\?\.reaction===glyph/);
 assert.match(js,/corp_chat_reactions\(reactor_id,reaction\)/);
 assert.match(js,/JSON.stringify\(\(m.corp_chat_reactions/);
});
test('reaction badge follows the original bubble, and permissions remain participant scoped',()=>{
 const sql=readFileSync('database/blackcell-chat-attached-reactions.sql','utf8');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/primary key\(message_id,reactor_id\)/);
 assert.match(sql,/reactor_id=\(select auth.uid\(\)\)/);
 assert.match(sql,/corp_private.chat_pair_unblocked/);
 assert.match(js,/bubble.append\(badges\)/);
 assert.match(css,/\.mine \.bubble>\.bc-attached-reactions\{right:auto;left:5px\}/);
 assert.match(css,/padding-top:16px!important/);
 assert.match(css,/position:absolute;top:-12px;right:5px/);
 assert.match(css,/bc-has-attached-reactions\{padding-top:12px\}/);
 assert.match(css,/data-reaction-count="2"/);
 const actions=readFileSync('corporate-chat-popout-actions.js','utf8');
 assert.match(actions,/if\(badges\)bubble.append\(badges\)/);
});
