import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync('blackcell-mail.js','utf8'),html=readFileSync('blackcell-mail.html','utf8'),css=readFileSync('blackcell-mail.css','utf8'),sql=readFileSync('database/blackcell-internal-mail.sql','utf8'),os=readFileSync('blackcell-os.js','utf8');
test('Mail is a real optional internal application, not a mailto handoff',()=>{
 assert.match(os,/"title":"BLACKCELL Mail","sub":"Private corporate email","url":"blackcell-mail.html/);
 assert.match(js,/client.rpc\('corp_internal_mail'/);
 assert.doesNotMatch(js,/mailto:|resend\.com/);
});
test('mailbox access is scoped to verified installed app and owner ID',()=>{
 assert.match(sql,/catalog:=public.corp_app_store\('catalog'\)/);
 assert.match(sql,/a->>'installed'='true'/);
 assert.match(sql,/where owner_id=uid and id=p_id for update/);
 assert.match(sql,/revoke all on bc_mail_private.mailbox from public,anon,authenticated/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/security invoker set search_path=''/);
});
test('sending writes a private recipient copy and transitions the saved draft',()=>{
 assert.match(sql,/if entry.origin='sent' then return/);
 assert.match(sql,/values\(other.user_id,p_id,uid,other.user_id/);
 assert.match(sql,/set folder='sent',origin='sent'/);
 assert.match(sql,/corp_private.chat_pair_unblocked/);
 assert.match(sql,/m.access_scope is distinct from 'ledger_only'/);
 assert.match(js,/await rpc\('send',\{p_id:draftId\}\)/);
});
test('mail UI has responsive folders, compose, search, and safe plain text rendering',()=>{
 for(const id of ['folders','searchForm','recipient','subject','body','save','send','reading'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/@media\(max-width:780px\)/);
 assert.match(js,/n.textContent=txt/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(js,/client.auth.onAuthStateChange/);
});
