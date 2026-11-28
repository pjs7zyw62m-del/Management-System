import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const os=readFileSync('blackcell-os.js','utf8');
const html=readFileSync('blackcell-os.html','utf8');
const workspace=readFileSync('blackcell-os-macos-workspaces.js','utf8');
function harness(){
 const snippet=os.slice(os.indexOf('let tabletPair=null;'),os.indexOf('function fullscreenWindow('));
 let mode='tablet',locked=false,busy=false;
 const makeClass=()=>{const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x),toggle:(x,v)=>v?values.add(x):values.delete(x)}};
 const element=()=>({hidden:false,dataset:{},classList:makeClass(),removeAttribute(key){if(key==='data-bc-split')delete this.dataset.bcSplit}});
 const shell=element(),windows=new Map();
 for(const id of ['settings','files','photoledger','personalphotos'])windows.set(id,{id,title:id,el:element(),spaceId:'1'});
 const document={documentElement:{classList:{contains:x=>x==='bc-os-'+mode}}};
 const build=new Function('document','windows','$','workspaceLock','appProtected','appBusy','active','preview','leaving','bcSpace','innerWidth', 'raise', 'initial',
 'let selectedWindow=initial;'+snippet+';return {options:tabletSplitOptions,split:tabletSplit,clear:clearTabletSplit,sync:syncFullscreenShell,setSelected:r=>selectedWindow=r}');
 const api=build(document,windows,()=>shell,{isLocked:()=>locked},id=>id==='personalphotos',()=>busy,true,false,false,'1',1024,()=>{},windows.get('settings'));
 return {api,windows,shell,mode:v=>mode=v,lock:v=>locked=v,busy:v=>busy=v};
}
test('Tablet split preserves existing window records and refuses ineligible apps',()=>{
 const h=harness();
 assert.deepEqual(h.api.options().map(r=>r.id),['settings','files']);
 assert.equal(h.api.split('settings','settings'),false);
 assert.equal(h.api.split('settings','photoledger'),false);
 assert.equal(h.api.split('settings','personalphotos'),false);
 assert.equal(h.api.split('settings','files'),true);
 assert.equal(h.windows.get('settings').el.dataset.bcSplit,'left');
 assert.equal(h.windows.get('files').el.dataset.bcSplit,'right');
 assert.equal(h.shell.classList.contains('bc-tablet-split'),true);
 h.windows.get('files').el.hidden=true;h.api.sync();
 assert.equal(h.shell.classList.contains('bc-tablet-split'),false);
 assert.equal(h.windows.size,4);
 h.lock(true);assert.equal(h.api.options().length,0);
 h.lock(false);h.busy(true);assert.equal(h.api.options().length,0);
 h.busy(false);h.mode('phone');assert.equal(h.api.options().length,0);
});
test('Phone app switching is distinct from tablet workspace and keeps authenticated launch path',()=>{
 assert.match(os,/isPhone:\(\)=>document\.documentElement\.classList\.contains\('bc-os-phone'\)/);
 assert.match(os,/isTablet:\(\)=>document\.documentElement\.classList\.contains\('bc-os-tablet'\)/);
 assert.match(os,/focusWindow:id=>\{if\(!windows\.has\(id\)\)return false;showApp\(id\)/);
 assert.match(workspace,/bridge\(\)\?\.isPhone\(\)&&type!=='mission'/);
 assert.match(workspace,/if\(!phone\)grid\.append\(toolbar\)/);
 assert.match(os,/clearTabletSplit\(\);if\(!preview\)window\.BLACKCELL_SYSTEM_SOUNDS/);
});
test('All changed native app entry references are versioned',()=>{
 const assets=['blackcell-os.css','blackcell-os-window-controls.css','blackcell-os-obsidian-v2.css','blackcell-os-macos-workspaces.css','blackcell-os-unified-home.css','blackcell-app-store-grid.css','blackcell-os-macos-workspaces.js','blackcell-os-springboard.js'];
 for(const asset of assets){
  assert.ok(html.split('\n').some(line=>line.includes(asset+'?')&&line.includes('nativeExperience=20261127-1')),asset);
 }
 const build=html.match(/name="blackcell-os-client-build" content="([^"]+)"/)?.[1];
 assert.equal(build,readFileSync('blackcell-site-version.json','utf8').match(/"fallback":"([^"]+)"/)?.[1]);
 for(const [page,asset] of Object.entries({'private-photo-ledger.html':'private-photo-ledger-sender-menu.css','corporate-chat.html':'corporate-chat-unified-desktop.css','corporate-network.html':'blackcell-tube-watch.css','blackcell-administration-app.html':'blackcell-administration-os.css','corporate-systems.html':'blackcell-native-admin-workspaces.css','uniform-world.html':'mans-armed-forces-workspace.css'})){
  assert.ok(readFileSync(page,'utf8').split('\n').some(line=>line.includes(asset+'?')&&line.includes('nativeExperience=20261127-1')),page);
 }
});
