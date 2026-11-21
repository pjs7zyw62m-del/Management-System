import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const shell=read('blackcell-os.js');
const home=read('blackcell-os-unified-home.js');
const style=read('blackcell-os-unified-home.css');
const phone=read('blackcell-os-springboard.js');
const launchpad=read('blackcell-os-macos-workspaces.js');
const html=read('blackcell-os.html');

test('One home model stores normalized app pins and widget positions in account layout',()=>{
 assert.match(shell,/const emptyUnifiedHome/);
 assert.match(shell,/function normalizeUnifiedHome\(/);
 assert.match(shell,/pins\/|pins:\[\]/);
 assert.match(shell,/widgets:\[/);
 assert.match(shell,/Number\.isFinite\(p\.x\)/);
 assert.match(shell,/Number\.isFinite\(w\.x\)/);
 assert.match(shell,/homeClamp\(p\.x\)/);
 assert.match(shell,/homeClamp\(w\.y\)/);
 assert.match(shell,/unifiedHome\}\)/);
 assert.match(shell,/corp_os_workspace_preferences/);
 assert.match(shell,/upsert\(\{user_id:uid,kind,value/);
 assert.match(shell,/window\.BLACKCELL_OS_UNIFIED_LAYOUT=Object\.freeze/);
});

test('Desktop app placement honors installation and permissions, never installs or deletes apps',()=>{
 assert.match(shell,/next\.pins=next\.pins\.filter\(p=>installedApp\(p\.id\)/);
 assert.match(shell,/!recycledApps\.has\(p\.id\)/);
 assert.match(shell,/if\(typeof id!=='string'\|\|!validAppId\(id\)\|\|!installedApp\(id\)/);
 assert.match(home,/bc-home-desktop-app/);
 assert.match(home,/attachDrag\(b,p\.id,'pin'\)/);
 assert.match(home,/popupAt\(e\.clientX,e\.clientY/);
 assert.match(home,/Remove from Desktop/);
 assert.match(home,/App data remains safe/);
 for(const src of [shell,home])assert.ok(!src.includes('localStorage.clear('));
});

test('Widgets can be added, moved, resized and removed on desktop and tablet',()=>{
 for(const id of ['clock','calendar','applications','session'])assert.match(home,new RegExp(id+':'));
 assert.match(home,/function addWidget\(id\)/);
 assert.match(home,/function removeWidget\(id\)/);
 assert.match(home,/function resizeWidget\(id\)/);
 assert.match(home,/attachDrag\(card,w\.id,'widget'\)/);
 assert.match(home,/bc-home-gallery-shell/);
 assert.match(home,/window\.addEventListener\('blackcell:home-widgets-open'/);
 assert.match(style,/\.bc-home-widget\[data-size="large"\]/);
 assert.match(style,/\.bc-home-widget\[data-size="small"\]/);
});

test('Phone uses the account-saved apps, movable ordering and responsive widget cards',()=>{
 assert.match(phone,/const unified=\(\)=>window\.BLACKCELL_OS_UNIFIED_LAYOUT/);
 assert.match(phone,/const synced=homePinned\(\)\.map\(p=>p\.id\)/);
 assert.match(phone,/unified\(\)\?\.save\?\.\(data\)/);
 assert.match(phone,/blackcell:desktop-layout-updated/);
 assert.match(phone,/blackcell:desktop-add-app/);
 assert.match(home,/bc-home-phone-widget-strip/);
 assert.match(home,/bc-home-phone-widget-picker/);
 assert.match(home,/bc-home-phone-app-picker/);
 assert.match(style,/scroll-snap-type:x mandatory/);
 assert.match(style,/\.bc-home-phone-widget/);
});

test('Cross-device updates refresh automatically when member returns or while active',()=>{
 assert.match(shell,/async function refreshCloudHome\(/);
 assert.match(shell,/window\.addEventListener\('focus'/);
 assert.match(shell,/document\.addEventListener\('visibilitychange'/);
 assert.match(shell,/setInterval\(\(\)=>\{if\(!document\.hidden\)void refreshCloudHome\(\)\},30000\)/);
 assert.match(shell,/incoming\.changedAt<unifiedHome\.changedAt/);
 assert.match(shell,/await cloudWorkspaceSave\('layout',localValue\)/);
  assert.match(shell,/incoming\.changedAt<=unifiedHome\.changedAt/);
 assert.match(shell,/uid!==storeProfile\|\|revision!==cloudDesktopRevision/);
 assert.match(shell,/window\.dispatchEvent\(new Event\('blackcell:desktop-layout-updated'\)\)/);
 assert.ok(!/service_role|SUPABASE_SERVICE_ROLE/.test(home));
});

test('Launchpad has explicit Add to Desktop and saved state, without bypassing authorization',()=>{
 assert.match(launchpad,/blackcell:desktop-add-app/);
 assert.match(launchpad,/bc-mac-pin-shortcut/);
 assert.match(launchpad,/if\(!app\.tile\.hidden&&!app\.tile\.disabled\)app\.tile\.click/);
 assert.match(home,/const available=\(\)=>service\(\)\?\.available/);
 assert.match(home,/return response/);
});

test('Release serves unified home CSS and JavaScript and invalidates old caches',()=>{
 assert.match(html,/blackcell-os-unified-home\.css\?v=20261121-2/);
 assert.match(html,/blackcell-os-unified-home\.js\?v=20261121-2/);
 assert.match(html,/blackcell-os-springboard\.js\?v=ios-a-20261119&amp;rev=mobile-ready2/);
 assert.match(html,/blackcell-os\.js\?v=125-level-r-window-drag/);
 assert.match(read('blackcell-site-version.json'),/level-r-window-drag/);
});


test('Desktop application buttons accept pointer dragging and do not clip their labels',()=>{
 assert.match(home,/type==='widget'&&e\.target\.closest\('button'\)/);
 assert.match(home,/attachDrag\(b,p\.id,'pin'\)/);
 assert.match(home,/element\.style\.left=/);
 assert.match(home,/item\.x=clamp\(/);
 assert.match(style,/width:110px;min-height:126px;height:auto/);
 assert.match(style,/-webkit-line-clamp:3/);
 assert.match(style,/overflow-wrap:break-word/);
});
test('Phone widget gallery redraws after SpringBoard and session activation',()=>{
 assert.match(phone,/blackcell:springboard-ready/);
 assert.match(home,/blackcell:springboard-ready/);
 assert.match(home,/attributeFilter:\['hidden','class'\]/);
 assert.match(home,/makeButton\('Widgets'/);
 assert.match(home,/bc-home-phone-widget-strip/);
 assert.match(home,/bc-home-phone-app-picker/);
});
test('Software Update confirms actual loaded HTML build before saying an update succeeded',()=>{
 const updater=read('blackcell-live-update.js');
 assert.match(html,/meta name="blackcell-os-client-build"/);
 assert.match(updater,/OS_EXPECTED_BUILD/);
 assert.match(updater,/async function latestOSBuild\(/);
 assert.match(updater,/cache:'no-store'/);
 assert.match(updater,/expected===current/);
 assert.match(updater,/buildMismatch/);
 assert.match(read('blackcell-os-settings.js'),/Installed interface build/);
});
