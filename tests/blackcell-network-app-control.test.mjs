import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('network controls require verified owner and preserve application data',()=>{
 const sql=read('database/blackcell-network-app-control.sql');
 assert.match(sql,/if not own then return jsonb_build_object\('ok',false,'error','Verified Level 7 owner required\.'/);
 assert.match(sql,/p_app=any\(protected_ids\)/);
 assert.match(sql,/delete from bc_store_private\.installs where app_id=p_app/);
 assert.match(sql,/insert into bc_store_private\.core_removed/);
 assert.match(sql,/p_action='install' and coalesce\(network_mode,'active'\)<>'active'/);
 assert.match(sql,/network_app_audit/);
 assert.match(sql,/networkBlocked/);
 assert.doesNotMatch(sql,/delete from (public|storage|auth)\./i);
});
test('administrator navigation, explicit confirmation and blocked placeholders',()=>{
 const ui=read('blackcell-network-app-control.js');
 assert.match(ui,/auth\.member\?\.role!=='owner'/);
 assert.match(ui,/corp_code_status/);
 assert.match(ui,/value!=='REMOVE'/);
 assert.match(read('blackcell-administration-os.js'),/id:'networkapps'/);
 assert.match(read('blackcell-os.js'),/networkBlocked=new Set\(Array\.isArray\(data\.networkBlocked\)/);
 assert.match(read('blackcell-app-store.js'),/!info\.networkBlocked\?\.includes\(a\.id\)/);
});