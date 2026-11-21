import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const os=read('blackcell-os.js'),work=read('blackcell-os-macos-workspaces.js');
const skin=read('blackcell-os-macos-workspaces.css'),html=read('blackcell-os.html');
const mac=read('blackcell-os-macos-desktop.js'),settings=read('blackcell-os-settings.js');
const files=read('blackcell-files.js');

test('Applications opens full-screen Launchpad and retains authorized application tiles',()=>{
 assert.match(mac,/blackcell:launchpad-open/);
 assert.match(work,/bc-mac-overlay bc-mac-/);
 assert.match(work,/bc-mac-launch-grid/);
 assert.match(work,/\.workspace \.apps \.app\[data-app\]/);
 assert.match(work,/if\(!app\.tile\.hidden&&!app\.tile\.disabled\)app\.tile\.click\(\)/);
 assert.match(work,/aria-modal/);
 assert.match(skin,/backdrop-filter:blur\(44px\)/);
 assert.match(skin,/bc-mac-launch-grid/);
});
test('Spaces support six local account-scoped desktops and retain app windows',()=>{
 assert.match(os,/const MAX_BC_SPACES=6/);
 assert.match(os,/bc\.os\.spaces\.v1:/);
 assert.match(os,/spaceLoad\(\)/);
 assert.match(os,/spaceSave\(\)/);
 assert.match(os,/function spaceSwitch\(/);
 assert.match(os,/function spaceAdd\(/);
 assert.match(os,/function spaceMove\(/);
 assert.match(os,/spaceId:r\.spaceId\|\|'1'/);
 assert.match(os,/spaceShown:false|spaceShown=true/);
 assert.match(os,/syncFullscreenShell\(\)/);
 assert.match(work,/bc-mac-mission-body/);
 assert.match(work,/Move .*to desktop/);
 assert.ok(!work.includes('localStorage.clear('));
});
test('Spotlight, Stage Manager, and Control Center use browser-safe actions',()=>{
 assert.match(work,/function openSpotlight\(/);
 assert.match(work,/function evalArithmetic\(/);
 assert.match(work,/ctrl&&e\.key===' '/);
 assert.match(work,/function toggleStage\(/);
 assert.match(work,/bc-mac-stage-rail/);
 assert.match(work,/BLACKCELL Control Center/);
 assert.match(work,/dockAutoHide/);
 assert.match(work,/desktopClean/);
 assert.ok(!/navigator\.bluetooth\.requestDevice|navigator\.wifi/.test(work));
});
test('Desktop comes from BLACKCELL private Files account folder, no public shortcuts',()=>{
 assert.match(os,/storage\.from\('blackcell-os-files'\)\.list\(storeProfile\+'\/Desktop'/);
 assert.match(os,/!installedApp\('files'\)/);
 assert.match(files,/btn\('▣  Desktop',\(\)=>navigate\(\['Desktop'\]\)/);
 assert.match(work,/bc-mac-desktop-stacks/);
 assert.match(work,/expandedStack/);
 assert.match(work,/bridge\(\)\?\.openDesktopFiles\(\)/);
});
test('Dock can be moved and full-screen windows can reveal controls by screen edge',()=>{
 assert.match(os,/dockPosition:'bottom'/);
 assert.match(os,/dockPosition:\['bottom','left','right'\]/);
 assert.match(settings,/Dock position/);
 assert.match(os,/function fullscreenWindow\(/);
 assert.match(os,/bc-os-fullscreen-active/);
 assert.match(skin,/data-bc-dock-position="left"/);
 assert.match(skin,/data-bc-dock-position="right"/);
 assert.match(skin,/bc-os-menu-edge-open/);
 assert.match(skin,/bc-os-dock-edge-open/);
});
test('Published release loads the whole upgraded component set',()=>{
 assert.match(html,/blackcell-os-macos-workspaces\.css\?v=20261121-(?:1|2)/);
 assert.match(html,/blackcell-os-macos-workspaces\.js\?v=20261121-(?:1|2)/);
 assert.match(html,/blackcell-os-macos-desktop\.js\?v=20261121-2/);
 assert.match(html,/blackcell-os\.js\?v=(?:121-mac-workspaces|122-unified-desktop-sync|123-mobile-ready-drag-fix|124-auto-save-updates|125-level-r-window-drag)/);
});
