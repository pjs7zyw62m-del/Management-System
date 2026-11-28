import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
test('Personnel navigation consolidates directory, presence, preview and permissions',()=>{
 const shell=read('blackcell-administration-os.js'),admin=read('admin.js');
 assert.match(shell,/id:'users',label:'Personnel Command'/);
 assert.doesNotMatch(shell,/id:'memberpreview',label:/);
 assert.doesNotMatch(shell,/id:'presence',label:/);
 for(const [id,label] of [['profiles','Directory'],['presence','Live Presence'],['preview','Experience Preview'],['accounts','Invitations'],['roles','Clearance'],['access','Permissions']])assert.ok(admin.includes("['"+id+"','"+label+"']"));
 assert.match(admin,/corp_site_presence_overview/);assert.match(admin,/corp_admin_members/);
 assert.match(admin,/e\.user_id===m\.user_id/);
 assert.match(admin,/document\.documentElement\.classList\.contains\('corp-ok'\)/);
 for(const p of ['dashboard.html','blackcell-administration-app.html'])assert.match(read(p),/Personnel Command/);
});
test('Presence distinguishes visible connections from left and offline without guessing',()=>{
 const admin=read('admin.js'),source=admin.slice(admin.indexOf('function personnelState('),admin.indexOf('function personnelDate('));
 const classify=runInNewContext(source+';personnelState');
 assert.equal(classify({sessions:[]}), 'offline');
 assert.equal(classify({sessions:[{status:'offline'}]}), 'offline');
 assert.equal(classify({sessions:[{status:'left'}]}), 'left');
 assert.equal(classify({sessions:[{status:'left'},{status:'online'}]}), 'online');
});
test('Member simulation keeps its sandbox and validates clearance presets',()=>{
 const preview=read('blackcell-member-preview.js'),html=read('blackcell-member-preview.html'),admin=read('admin.js');
 assert.match(html,/sandbox="allow-scripts"/);
 assert.doesNotMatch(html,/allow-same-origin/);
 assert.match(preview,/connect-src 'none'/);
 assert.ok(preview.includes("params.get('personnel')==='1'"));
 assert.match(admin,/level>=0&&level<=6/);
 assert.match(admin,/member\.role==='owner'/);
});
