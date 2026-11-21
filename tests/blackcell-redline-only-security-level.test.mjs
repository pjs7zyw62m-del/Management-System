import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const admin=read('admin.js'),guard=read('corp-guard.js');
const os=read('blackcell-os.js'),auth=read('corp-auth.js');
const ledger=read('private-photo-ledger.js'),ledgerHtml=read('private-photo-ledger.html');
const network=read('corporate-network.js'),chat=read('corporate-chat.js');
const employee=read('employee.js');
const migration=read('supabase/migrations/20261121075604_blackcell_redline_only_owner_security_access.sql');

test('Level R is a restricted access scope, not an escalation of numeric clearance',()=>{
 assert.match(admin,/LEVEL R · REDLINE ONLY/);
 assert.match(admin,/memberSecurityLabel\(member\)/);
 assert.match(admin,/memberSecurityAccess\(member\)/);
 assert.match(admin,/Security access · BLACKCELL REDLINE/);
 assert.match(admin,/access\.add\(new Option\('Level R · REDLINE ONLY','ledger_only'\)\)/);
 assert.match(migration,/access_scope=v_scope/);
 assert.match(migration,/case when p_redline_only then 'ledger_only' else 'full' end/);
 assert.ok(!migration.includes('update public.corp_access_members set clearance_level'));
});

test('Assigning REDLINE ONLY requires a verified owner and targets employees only',()=>{
 assert.match(migration,/create or replace function public\.corp_owner_redline_access/);
 assert.match(migration,/if not public\.corp_owner_validated\(\)/);
 assert.match(migration,/p_member_id=auth\.uid\(\)/);
 assert.match(migration,/m\.role='employee' for update/);
 assert.match(migration,/revoke all on function public\.corp_owner_redline_access\(uuid,boolean\) from anon/);
 assert.match(migration,/grant execute on function public\.corp_owner_redline_access\(uuid,boolean\) to authenticated/);
 assert.match(admin,/corp_admin_members/);
 assert.match(admin,/found\.role!=='employee'/);
 assert.match(admin,/corp_owner_redline_access/);
 assert.match(admin,/p_redline_only:restrict/);
 assert.match(admin,/Permissions changed in another session/);
});

test('Owner directory returns verified security scope and never guesses whether assignment saved',()=>{
 assert.match(migration,/'access_scope',coalesce\(m\.access_scope,'full'\)/);
 assert.match(migration,/if not public\.corp_owner_validated\(\)/);
 assert.match(admin,/data\.access_scope!==\(restrict\?'ledger_only':'full'\)/);
 assert.match(admin,/cardPanel\.replaceChildren/);
 assert.match(admin,/Level R active/);
 assert.match(read('dashboard.html'),/blackcell-redline-security-level\.css\?v=20261121-level-r1/);
 assert.match(read('blackcell-administration-app.html'),/blackcell-redline-security-level\.css\?v=20261121-level-r1/);
 assert.match(guard,/admin\.js\?v=20261121-redline-level-r1/);
 assert.match(read('blackcell-redline-security-level.css'),/bc-redline-security-select/);
});

test('Level R has no BLACKCELL OS, App Store, Network or chat launch path',()=>{
 assert.match(os,/member\.access_scope==='ledger_only'\)\{location\.replace\('private-photo-ledger\.html'\)/);
 assert.match(os,/result\.member\.access_scope==='ledger_only'\)\{location\.replace\('private-photo-ledger\.html'\)/);
 assert.match(auth,/member\.role==='employee'&&member\.access_scope==='ledger_only'&&!allowLedgerOnly/);
 assert.match(auth,/redirect:'private-photo-ledger\.html'/);
 assert.match(network,/access\?\.access_scope==='ledger_only'/);
 assert.match(chat,/access_scope==='ledger_only'/);
 assert.match(employee,/m\.access_scope==='ledger_only'/);
 assert.match(employee,/location\.replace\('private-photo-ledger\.html'\)/);
});

test('REDLINE only view shows its own app and sign-out, never a Network navigation shortcut',()=>{
 assert.match(ledger,/const scoped=!state\.isOwner&&state\.member\?\.access_scope==='ledger_only'/);
 assert.match(ledger,/document\.documentElement\.classList\.toggle\('bc-redline-only-security',scoped\)/);
 assert.match(ledger,/\$\('backLink'\)\.hidden=scoped/);
 assert.match(ledger,/\$\('ledgerBrand'\)\.href=scoped\?'private-photo-ledger\.html'/);
 assert.match(ledger,/\$\('ledgerSignOut'\)\.hidden=state\.isOwner/);
 assert.match(ledger,/LEVEL R · REDLINE ONLY/);
 assert.match(ledgerHtml,/id="backLink"[^>]+hidden/);
 assert.match(ledgerHtml,/id="ledgerBrand" href="private-photo-ledger\.html"/);
 assert.match(ledgerHtml,/private-photo-ledger\.js\?v=(?:20261121-level-r-only1|20261121-fresh-session2)/);
});

test('The change does not assign any user without an owner choosing the account',()=>{
 assert.ok(!/update\s+public\.corp_access_members\s+set\s+access_scope\s*=\s*'ledger_only'\s*;/i.test(migration));
 assert.ok(!/delete\s+from\s+public\.corp_access_members/i.test(migration));
 assert.ok(!/truncate\s+table/i.test(migration));
});
