import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
const phone=read('blackcell-os-springboard.js'),os=read('blackcell-os.js');
const css=read('blackcell-os-obsidian-v2.css'),html=read('blackcell-os.html');
const settings=read('blackcell-os-settings.js');

test('iPhone SpringBoard respects the saved OS dockAutoHide preference',()=>{
 assert.match(phone,/shell\.classList\.contains\('os-dock-auto-hide'\)/);
 assert.match(phone,/function syncDockPreference\(/);
 assert.match(phone,/function hideDock\(/);
 assert.match(phone,/function showDock\(/);
 assert.match(phone,/bc-sb-dock-auto-hide/);
 assert.match(phone,/dock\.toggleAttribute\('inert',dockAuto\(\)\)/);
 assert.match(phone,/aria-expanded/);
 assert.match(phone,/attributeFilter:\['hidden','class'\]/);
});
test('iPhone has a visible 44px touch handle, swipe reveal and idle collapse',()=>{
 assert.match(phone,/Show Favorite Apps Dock/);
 assert.match(phone,/Show Dock/);
 assert.match(phone,/dockHandle\.addEventListener\('click',showDock\)/);
 assert.match(phone,/if\(dy< -32/);
 assert.match(phone,/\},4500\)/);
 assert.match(css,/\.bc-sb-dock-handle/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/\.bc-sb-dock-shown \.bc-sb-dock/);
 assert.match(css,/\.bc-sb-dock-auto-hide \.bc-sb-dock/);
});
test('iPad and desktop Home obey auto-hide instead of the forced-visible dock rule',()=>{
 assert.match(css,/#desktop\.bc-three-device-os\.os-dock-auto-hide:not/);
 assert.match(css,/#desktop\.bc-three-device-os\.os-dock-auto-hide\.os-dock-revealed:not/);
 assert.match(css,/visibility:hidden!important;pointer-events:none!important/);
 assert.match(os,/let dockHideTimer=null,dockIdleTimer=null/);
 assert.match(os,/\},4800\)/);
 assert.match(os,/function dockReveal\(show\)/);
});
test('manual always-visible preference remains operational and no user data is erased',()=>{
 assert.match(phone,/if\(!auto\)\{stopDockIdle\(\)/);
 assert.match(settings,/Automatically hide the Dock/);
 assert.match(settings,/Turn off to keep it visible/);
 for(const src of [phone,os,css]){
  for(const forbidden of ['localStorage.clear(', 'sessionStorage.clear(', 'caches.delete('])assert.ok(!src.includes(forbidden),forbidden);
 }
});
test('new assets are cache-busted for installed OS updates',()=>{
 assert.match(html,/blackcell-os-obsidian-v2\.css\?v=20261120-dock-autohide/);
 assert.match(html,/blackcell-os-springboard\.js\?v=ios-a-20261119&amp;rev=dock-autohide/);
 assert.match(html,/blackcell-os\.js\?v=(?:119-os-update-ux2&amp;rev=dock-autohide|120-macos-personal-wallpaper|121-mac-workspaces)/);
});
