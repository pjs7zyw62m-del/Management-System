import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountChatGroups} from '../blackcell-chat-groups.js';
const read=p=>readFileSync(p,'utf8');
test('group messaging uses distinct authorized RPC and inbox controls',()=>{
 const html=read('corporate-chat.html'),js=read('corporate-chat.js'),group=read('blackcell-chat-groups.js');
 for(const id of ['bcGroupInbox','bcGroupCreate','bcGroupRows','bcGroupPanel','bcGroupSend','bcGroupInput'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/mountChatGroups\(\{client/);assert.match(js,/groups\?\.setVisible/);assert.match(group,/client\.rpc\('corp_chat_group'/);
 assert.doesNotMatch(group,/corp_chat_messages/);assert.match(js,/from\('corp_chat_messages'\)\.insert/);
 assert.match(group,/m\.sender_id!==context\(\)\.self/);assert.match(group,/r\.bottom>bounds\.top&&r\.top<bounds\.bottom/);
});
test('RPC checks verified live session, eligibility, membership, owner and blocking',()=>{
 const sql=read('database/blackcell-imessage-groups.sql');
 assert.match(sql,/auth\.sessions/);assert.match(sql,/corp_private\.chat_verified\(\)/);assert.match(sql,/bc_connect_private\.eligible/);
 assert.match(sql,/not bc_group_private\.allowed_room\(g,u\)/);assert.match(sql,/corp_private\.chat_pair_unblocked/);
 assert.match(sql,/m\.created_at>=joined/);assert.match(sql,/revoke all on all tables in schema bc_group_private/);
 assert.match(sql,/security invoker set search_path/);assert.match(sql,/from public,anon,authenticated/);
});
test('group picker and send panel work with a mocked authorized RPC',async()=>{
 const prev={document:globalThis.document,window:globalThis.window,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 class Node{
  constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=true;this.value='';this.textContent='';this.disabled=false;this.scrollHeight=200;this.scrollTop=0;this.clientHeight=200;this.className=''}
  append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=nodes}setAttribute(){}addEventListener(){}focus(){}getBoundingClientRect(){return {top:0,bottom:200}}querySelectorAll(cls){return this.children.filter(n=>n.className?.includes(cls.slice(1)))}
 }
 const ids=Object.fromEntries(['bcGroupInbox','bcGroupPanel','bcGroupStatus','bcGroupTitle','bcGroupBody','bcGroupSend','bcGroupInput','bcGroupSendButton','bcGroupRows','bcGroupCreate','bcGroupInfo','bcGroupClose','bcGroupTyping'].map(k=>[k,new Node()]));
 globalThis.document={hidden:false,getElementById:id=>ids[id],createElement:tag=>new Node(tag),addEventListener(){}};
 globalThis.window={confirm:()=>true};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 const actions=[];const client={rpc:async(_name,p)=>{actions.push(p.p_action);return {data:{ok:true,groups:[],contacts:[{id:'a',name:'A'},{id:'b',name:'B',owner:true}],id:'g',name:'Group',messages:[],members:[],typing:[]},error:null}}};
 const ctx=()=>({ready:true,self:'me',filter:'all'});let ctl;
 const flush=()=>new Promise(r=>setImmediate(r));
 try{ctl=mountChatGroups({client,context:ctx});ctl.render();assert.equal(ids.bcGroupInbox.hidden,true);ids.bcGroupCreate.onclick();await flush();const children=ids.bcGroupBody.children;const name=children[0],contacts=children[2],create=children[4];name.value='Group';name.oninput();for(const label of contacts.children){label.children[0].checked=true;label.children[0].onchange()}assert.equal(create.disabled,false);await create.onclick();await flush();assert.ok(actions.includes('create'));assert.ok(actions.includes('thread'));assert.equal(ids.bcGroupSend.hidden,false);ids.bcGroupInput.value='Hello';await ids.bcGroupSend.onsubmit({preventDefault(){}});assert.ok(actions.includes('send'));ctl.close();assert.equal(ids.bcGroupPanel.hidden,true)}finally{ctl?.dispose();for(const [k,v] of Object.entries(prev))if(v===undefined)delete globalThis[k];else globalThis[k]=v}
});
