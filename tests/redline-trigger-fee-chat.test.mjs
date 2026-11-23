import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261123183000_redline_trigger_fees_in_private_chat.sql');
const core=read('private-photo-ledger.js');
const sender=read('private-photo-ledger-simple-sender.js');
const css=read('private-photo-ledger-simple-sender.css');
const html=read('private-photo-ledger.html');
const os=read('blackcell-os.js');
test('Fee events are read-only, authorized, tied to the triggering message and cannot double-charge',()=>{
 assert.match(sql,/SECURITY DEFINER SET search_path TO ''/);
 assert.match(sql,/corp_private\.photo_ledger_verified\(\)/);
 assert.match(sql,/owner_id=v_user OR member_id=v_user/);
 assert.match(sql,/h\.message_id=ANY\(p_message_ids\)/);
 assert.match(sql,/m\.id=h\.message_id AND m\.room_id=p_room_id/);
 assert.match(sql,/coalesce\(array_length\(p_message_ids,1\),0\)>150/);
 assert.match(sql,/current_session_started_at/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.corp_redline_trigger_chat_events\(uuid,uuid\[\]\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.corp_redline_trigger_chat_events\(uuid,uuid\[\]\)/);
 assert.doesNotMatch(sql,/INSERT INTO corp_private\.redline_trigger_hits/i);
 assert.match(core,/db\.rpc\('corp_redline_trigger_chat_events'/);
 assert.match(core,/p_message_ids:list\.map\(m=>m\.id\)/);
 assert.match(core,/return list\.map\(m=>\(\{\.\.\.m,triggerFee:fees\.get\(m\.id\)\|\|null\}\)\)/);
 assert.match(core,/if\(!list\.length\|\|state\.showArchive\)return list/);
});
test('Verified Trigger Word fee is a separate chat event like photo uploads and reuse',()=>{
 assert.match(sender,/kind:'trigger'/);
 assert.match(sender,/messages\.flatMap\(m=>\{/);
 assert.match(sender,/if\(!fee\|\|!Number\.isInteger\(fee\.price_cents\)/);
 assert.match(sender,/fee\.price_cents<10\|\|fee\.price_cents>25/);
 assert.match(sender,/if\(e.kind==='trigger'\)return 'trigger-fee:'\+String\(e.id\|\|''\)/);
 assert.match(sender,/redline-chat-event redline-chat-trigger-event/);
 assert.match(sender,/snap\?\.isOwner\?'FEE \$':'EARNED \+\$'/);
 assert.doesNotMatch(sender,/bubble\.append\(fee\)/);
 assert.doesNotMatch(css,/\.redline-chat-bubble \.redline-chat-trigger-fee/);
 assert.match(css,/\.redline-message-feed \.redline-chat-trigger-event/);
 assert.match(html,/private-photo-ledger\.js\?v=20261123-photo-credit-counter-inline1/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261123-photo-credit-counter-inline1/);
 assert.match(html,/private-photo-ledger-simple-sender\.css\?v=20261123-photo-credit-counter-inline1/);
 assert.match(os,/redlineRelease=20261123-photo-credit-counter-inline1/);
});
test('Each server-recorded hit generates only one separate event after its original message',()=>{
 const begin=sender.indexOf('...messages.flatMap(m=>{');
 const end=sender.indexOf('].sort((a,b)=>',begin);
 assert.ok(begin>0&&end>begin);
 const text=sender.slice(begin,end).trim();
 const flatMapCode=text.startsWith('...')?text.slice(3).trim().replace(/,\s*$/,''):text;
 const makeEvents=new Function('messages','return '+flatMapCode+';');
 const a={id:'source-message-a',created_at:'2026-11-23T10:00:00Z',
  body:'Wonderful photo!',sender_id:'owner',triggerFee:{word:'wonderful',price_cents:25}};
 const b={id:'source-message-b',created_at:'2026-11-23T10:01:00Z',
  body:'Regular text',sender_id:'owner',triggerFee:null};
 const events=makeEvents([a,b]);
 assert.equal(events.length,3);
 assert.deepEqual(events.map(e=>e.kind),['chat','trigger','chat']);
 assert.equal(events[0].id,a.id);
 assert.equal(events[1].id,a.id);
 assert.equal(events[1].word,'wonderful');
 assert.equal(events[1].priceCents,25);
 assert.equal(events[2].id,b.id);
 assert.deepEqual(makeEvents([b]).map(e=>e.kind),['chat']);
 assert.deepEqual(makeEvents([a]).map(e=>[e.kind,e.id]),makeEvents([a]).map(e=>[e.kind,e.id]));
});
test('Receiver sees FEE and sender sees EARNED on their independent activity cards',()=>{
 const start=sender.indexOf("   if(e.kind==='trigger'){");
 const end=sender.indexOf("   if(e.kind==='rating'){",start);
 assert.ok(start>0&&end>start);
 const renderCard=new Function('e','snap','make','dateText',sender.slice(start,end));
 const make=(tag,cls,text)=>({
  tag,cls,text,children:[],
  append(...n){this.children.push(...n)},
  setAttribute(k,v){this[k]=v}
 });
 const ev={kind:'trigger',id:'one-credit',word:'wonderful',priceCents:25,at:'2026-11-23T10:00:00Z'};
 const ownerCard=renderCard(ev,{isOwner:true},make,()=> '4:00 AM');
 const senderCard=renderCard(ev,{isOwner:false},make,()=> '4:00 AM');
 assert.match(ownerCard.cls,/redline-chat-event redline-chat-trigger-event/);
 assert.deepEqual(ownerCard.children[0].children.map(n=>n.text),['⚡ wonderful','FEE $0.25']);
 assert.deepEqual(senderCard.children[0].children.map(n=>n.text),['⚡ wonderful','EARNED +$0.25']);
 assert.equal(ownerCard.children[1].text,'4:00 AM');
});
