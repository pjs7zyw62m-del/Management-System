import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {queryChatUnread,createChatUnreadMonitor} from '../blackcell-chat-unread.js';
function fake(getRows){
 return {from(table){assert.equal(table,'corp_chat_messages');const q={select(cols){assert.equal(cols,'id,sender_id');return q},eq(k,v){assert.equal(k,'recipient_id');assert.equal(v,'me');return q},is(k,v){assert.ok(['read_at','deleted_at'].includes(k));assert.equal(v,null);return q},order(){return q},async range(a,b){const rows=getRows();return {data:rows.slice(a,b+1),count:rows.length,error:null}}};return q}};
}
test('actual unread messages counted individually and by sender',async()=>{
 const rows=[{id:'a',sender_id:'one'},{id:'b',sender_id:'one'},{id:'c',sender_id:'two'}];
 const s=await queryChatUnread(fake(()=>rows),'me');assert.equal(s.total,3);assert.equal(s.byPeer.get('one'),2);assert.equal(s.byPeer.get('two'),1);
});
test('existing backlog, new messages, real reads and lock are handled without duplicates',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
 let rows=[{id:'a',sender_id:'one'},{id:'b',sender_id:'one'}],allowed=true;const notices=[],snapshots=[];
 const monitor=createChatUnreadMonitor({client:()=>fake(()=>rows),account:()=>'me',allowed:()=>allowed,onChange:s=>snapshots.push(s.total),onNew:(n,initial)=>notices.push([n,initial]),interval:600000});
 try{await monitor.refresh();await monitor.refresh();assert.deepEqual(notices,[[2,true]]);assert.equal(snapshots.at(-1),2);
 rows.push({id:'c',sender_id:'two'});await monitor.refresh();assert.deepEqual(notices,[[2,true],[1,false]]);assert.equal(snapshots.at(-1),3);
 rows=rows.filter(r=>r.id!=='a');await monitor.refresh();assert.equal(snapshots.at(-1),2);assert.equal(notices.length,2);
 allowed=false;await monitor.refresh();assert.equal(snapshots.at(-1),0);
 }finally{monitor.dispose();globalThis.window=oldWindow;globalThis.document=oldDocument}
});
test('OS, floating bubble and inbox use persistent unread counts rather than clearing on open',()=>{
 const os=readFileSync('blackcell-os.js','utf8'),dock=readFileSync('corporate-chat-dock.js','utf8'),chat=readFileSync('corporate-chat.js','utf8'),live=readFileSync('corporate-chat-live.js','utf8');
 assert.match(os,/createChatUnreadMonitor/);assert.match(os,/\.os-parked-chat-bubble/);assert.match(os,/\.bc-sb-icon\[data-id="chat"\]/);assert.match(os,/osNotice\('iMessage/);
 assert.match(dock,/onChange:result=>setUnread\(result.total\)/);assert.doesNotMatch(dock,/setUnread\(0\);saveWindowState/);
 assert.match(chat,/inboxUnreadCounts.get\(c.user_id\)/);assert.match(live,/type:'blackcell-chat-read'/);
});
