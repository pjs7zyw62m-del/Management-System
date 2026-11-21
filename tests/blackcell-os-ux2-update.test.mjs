import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const updater=read('blackcell-live-update.js');
const settings=read('blackcell-os-settings.js');
const os=read('blackcell-os.js');
const store=read('blackcell-app-store.js');
const html=read('blackcell-os.html');
const css=read('blackcell-os.css');

test('BLACKCELL OS auto-installs by default while preserving a manual opt-out',()=>{
 assert.match(updater,/function autoEnabled\(/);
 assert.match(updater,/localStorage\.getItem\(OS_AUTO\)!=='off'/);
 assert.match(updater,/function setAutoEnabled\(/);
 assert.match(updater,/if\(autoEnabled\(\)\)/);
 assert.match(updater,/if\(safe\(\)\)void refresh\(\)/);
 assert.match(updater,/Update Now/);
 assert.match(updater,/Later/);
 assert.match(updater,/sessionStorage\.setItem\(OS_TARGET,pending\)/);
 assert.match(updater,/location\.replace\(url\.href\)/);
 assert.match(settings,/Automatic updates/);
 assert.match(settings,/auto\.onchange/);
});
test('Auto updater saves OS workspace, skips hidden false positives, and blocks real activity',()=>{
 assert.match(os,/BLACKCELL_OS_AUTOSAVE_WORKSPACE/);
 assert.match(os,/saveWorkspace\(\)/);
 assert.match(updater,/await window\.BLACKCELL_OS_AUTOSAVE_WORKSPACE\(\)/);
 assert.match(updater,/function blockingReason\(/);
 assert.match(updater,/if\(busy\(\)\)return/);
 assert.match(updater,/if\(modified\(\)\)return/);
 assert.match(updater,/if\(openModal\(\)\)return/);
 assert.match(updater,/if\(!visible\(frame\)\)continue/);
 assert.match(updater,/\.some\(visible\)/);
 assert.match(updater,/document\.hidden/);
 assert.match(updater,/navigator\.onLine/);
 for(const forbidden of ['localStorage.clear(', 'sessionStorage.clear(', 'indexedDB.deleteDatabase(', 'caches.delete(']){
  assert.ok(!updater.includes(forbidden), forbidden);
 }
});

test('Workspace idle lock exposes 30 and 60 minutes without bypassing security session',()=>{
  assert.match(os,/\[0,1,5,10,15,30,60\]\.includes/);
  assert.match(settings,/\[1,5,10,15,30,60,0\]/);
  assert.match(settings,/Corporate session inactivity limit/);
  assert.match(settings,/Lock workspace after/);
  assert.match(os,/const IDLE=60\*60\*1000/);
  assert.match(os,/corp_touch_session/);
  assert.match(os,/corp_employee_touch_session/);
});

test('Settings shows Software Update and app lifecycle separates Betas from ready apps',()=>{
  assert.match(settings,/Software Update/);
  assert.match(settings,/BLACKCELL_LIVE_UPDATE\?\.show/);
  assert.match(store,/Beta Lab/);
  assert.match(store,/isBeta/);
  assert.match(store,/unavailable/);
  assert.match(store,/SAVE DISTRIBUTION/);
  assert.match(store,/Saved files and account data are not removed/);
  assert.match(css,/bc-store-status/);
});

test('OS loads updated assets while keeping regular website update machinery',()=>{
  assert.match(html,/blackcell-os\.js\?v=(?:119-os-update-ux2|120-macos-personal-wallpaper|121-mac-workspaces|122-unified-desktop-sync|123-mobile-ready-drag-fix|124-auto-save-updates|125-level-r-window-drag|146-redline-bid-timer-sidebar3)/);
  assert.match(html,/blackcell-live-update\.js\?v=(?:20261120-os-update-ux2|20261121-verified-mobile-refresh1|20261121-auto-save-updates1)/);
  assert.match(os,/blackcell-app-store\.js\?v=13-ux2-lifecycle/);
  assert.match(os,/blackcell-os-settings\.js\?v=(?:5-session-lock-30-60|6-personal-wallpaper-macos|7-mobile-version-check|8-auto-updates)/);
});
