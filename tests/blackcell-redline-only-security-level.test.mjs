import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(p,'utf8');
const admin=read('admin.js');
const guard=read('corp-guard.js');
const osPage=read('blackcell-os.html');
const os=read('blackcell-os.js');
const appPage=read('blackcell-administration-app.html');
const dashboard=read('dashboard.html');
const auth=read('corp-auth.js');
const ledger=read('private-photo-ledger.js');
const network=read('corporate-network.js');
const chat=read('corporate-chat.js');
const migration=read('supabase/migrations/20261121093000_blackcell_level_zero_redline_only_clearance.sql');

test('Level 0 is a real REDLINE-only clearance in the displayed Administration directory',()=>{
 assert.match(admin,/dropdown\.add\(new Option\('Level 0 — REDLINE ONLY','0'\)\)/);
 assert.match(admin,/next<0\|\|next>6/);
 assert.match(admin,/corp_set_clearance_level/);
 assert.match(admin,/Level 0 — REDLINE ONLY: the employee/);
 assert.match(admin,/LEVEL 0 · REDLINE ONLY/);
});

test('BLACKCELL OS loads the corrected Administration app and JS asset chain',()=>{
 assert.match(osPage,/blackcell-administration-app\.html\?osApp=administration&amp;rev=20261121-level-zero-os3/);
 assert.match(appPage,/corp-guard\.js\?v=20261121-level-zero-os3/);
 assert.match(guard,/admin\.js\?v=20261121-level-zero-clearance2/);
 assert.match(dashboard,/corp-guard\.js\?v=20261121-level-zero-clearance2/);
 assert.match(appPage,/blackcell-redline-security-level\.css\?v=20261121-level-zero2/);
});

test('Database enforces Level 0 + ledger-only scope together',()=>{
 assert.match(migration,/DROP CONSTRAINT IF EXISTS corp_clearance_level_consistent/);
 assert.match(migration,/clearance_level=0 AND access_scope='ledger_only'/);
 assert.match(migration,/clearance_level BETWEEN 1 AND 6 AND access_scope='full'/);
 assert.match(migration,/role='owner' AND clearance_level=7/);
 assert.match(migration,/set clearance_level=0,access_scope='ledger_only',can_chat=false/i);
});

test('Only a verified owner can update another employee clearance',()=>{
 assert.match(migration,/corp_owner_redline_access/);
 assert.match(migration,/corp_set_clearance_level/);
 assert.match(migration,/corp_owner_validated\(\)/);
 assert.match(migration,/role='employee'/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.corp_owner_redline_access/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.corp_owner_redline_access/);
});

test('Level 0 employees are redirected to REDLINE rather than the other OS apps',()=>{
 assert.match(os,/access_scope==='ledger_only'/);
 assert.match(auth,/member\.role==='employee'&&member\.access_scope==='ledger_only'&&!allowLedgerOnly/);
 assert.match(auth,/redirect:'private-photo-ledger\.html'/);
 assert.match(network,/access\?\.access_scope==='ledger_only'/);
 assert.match(chat,/access_scope==='ledger_only'/);
 assert.match(ledger,/document\.documentElement\.classList\.toggle\('bc-redline-only-security',scoped\)/);
 assert.match(ledger,/\$\('backLink'\)\.hidden=scoped/);
});

test('Migration does not reassign ordinary Level 1 employees or alter owner clearance',()=>{
 assert.ok(!/UPDATE public\.corp_access_members SET clearance_level=0[^;]*WHERE role='employee' AND access_scope='full'/i.test(migration));
 assert.ok(!/delete\s+from\s+public\.corp_access_members/i.test(migration));
 assert.ok(!/truncate\s+table/i.test(migration));
});
