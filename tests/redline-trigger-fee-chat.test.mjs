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
test('Same authorized chat bubble carries word first, then FEE on receiver or EARNED on sender',()=>{
 assert.match(sender,/triggerFee:m\.triggerFee\|\|null/);
 assert.match(sender,/e\.triggerFee\?\.price_cents\?\?null/);
 assert.match(sender,/redline-chat-trigger-fee/);
 assert.match(sender,/snap\?\.isOwner\?'FEE \$':'EARNED \+\$'/);
 assert.match(css,/\.redline-chat-bubble \.redline-chat-trigger-fee/);
 assert.match(css,/border-top:1px solid/);
 assert.match(html,/private-photo-ledger\.js\?v=20261123-trigger-fee-chat1/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261123-trigger-fee-chat1/);
 assert.match(html,/private-photo-ledger-simple-sender\.css\?v=20261123-trigger-fee-chat1/);
 assert.match(os,/redlineRelease=20261123-trigger-cost-no-popup2/);
 const start=sender.indexOf('if(e.triggerFee&&Number.isInteger');
 const end=sender.indexOf('   if(receipt){',start);
 assert.ok(start>0&&end>start);
 const block=sender.slice(start,end);
 const make=(tag,cls,text)=>({
  tag,cls,text,children:[],append(...n){this.children.push(...n)},
  setAttribute(k,v){this[k]=v}
 });
 const display=new Function('e','snap','bubble','make',block);
 const fee={triggerFee:{word:'Wonderful',price_cents:25}};
 const receiver=make('article','');
 display(fee,{isOwner:true},receiver,make);
 assert.deepEqual(receiver.children[0].children.map(n=>n.text),['⚡ Wonderful','FEE $0.25']);
 const employee=make('article','');
 display(fee,{isOwner:false},employee,make);
 assert.deepEqual(employee.children[0].children.map(n=>n.text),['⚡ Wonderful','EARNED +$0.25']);
 const noMatch=make('article','');
 display({triggerFee:null},{isOwner:true},noMatch,make);
 assert.equal(noMatch.children.length,0);
});
