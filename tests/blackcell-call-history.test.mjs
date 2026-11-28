import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callHistoryLabel} from '../blackcell-call-history.js';
const read=p=>readFileSync(p,'utf8');
test('Call history distinguishes missed, declined, unanswered and confirmed duration',()=>{
 assert.equal(callHistoryLabel({mode:'video',direction:'incoming',outcome:'missed'}),'Missed video call');
 assert.equal(callHistoryLabel({mode:'voice',direction:'outgoing',outcome:'declined'}),'Outgoing voice call · Declined');
 assert.equal(callHistoryLabel({mode:'voice',direction:'outgoing',outcome:'unanswered'}),'Outgoing voice call · Unanswered');
 assert.equal(callHistoryLabel({mode:'voice',direction:'incoming',outcome:'connected',seconds:65}),'Incoming voice call · 1m 05s');
 assert.match(callHistoryLabel({mode:'video',direction:'incoming',outcome:'answered_unconfirmed'}),/connection unconfirmed/);
});
test('History is private metadata only and per-participant deletion preserves other history',()=>{
 const sql=read('database/blackcell-connect-history.sql');
 assert.match(sql,/auth\.sessions/);assert.match(sql,/corp_private\.chat_verified/);assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on bc_connect_private\.history/);assert.match(sql,/h\.caller=u and not h\.caller_hidden/);
 assert.match(sql,/h\.callee=u and not h\.callee_hidden/);assert.match(sql,/caller_connected_at is not null and h\.callee_connected_at is not null/);
 assert.doesNotMatch(sql,/new\.(offer|answer)\b/);assert.match(sql,/interval '30 days'/);
});
test('iMessage mounts history, callback uses verified existing Connect, and reports actual WebRTC state',()=>{
 const chat=read('corporate-chat.js'),html=read('corporate-chat.html'),connect=read('blackcell-connect.js');
 for(const id of ['bcCallsOpen','bcCallsBadge','bcCallsPanel','bcCallsAll','bcCallsMissed','bcCallsList'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(chat,/mountCallHistory\(\{client/);assert.match(chat,/choose\(c\.peer\);void requestConnect\(c\.mode\)/);
 assert.match(connect,/pc\?\.connectionState!=='connected'/);assert.match(connect,/p_action:'connected',p_call:id,p_device:device/);
 assert.match(read('blackcell-call-history.js'),/rpc\('hide',\{p_call:c\.id\}\)/);
});
