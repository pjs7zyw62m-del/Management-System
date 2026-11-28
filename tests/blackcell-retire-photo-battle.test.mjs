import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('retired app is absent from production launch paths, catalog and styles',()=>{
 for(const file of ['blackcell-os.js','blackcell-os.html','blackcell-os.css','blackcell-os-springboard.js','blackcell-app-store.js','blackcell-app-store-grid.css']){
  assert.doesNotMatch(readFileSync(file,'utf8'),/photobattle|photo-battle|Photo Battle/i,file);
 }
 assert.equal(existsSync('blackcell-photo-battle.js'),false);
});
test('retirement removes installation and distribution rows without deleting media',()=>{
 const sql=readFileSync('database/blackcell-retire-photo-battle.sql','utf8');
 assert.match(sql,/delete from bc_store_private.installs where app_id='photobattle'/);
 assert.match(sql,/delete from bc_store_private.app_rules where app_id='photobattle'/);
 assert.doesNotMatch(sql,/corp_social_assets|storage\.objects|drop table/i);
});
