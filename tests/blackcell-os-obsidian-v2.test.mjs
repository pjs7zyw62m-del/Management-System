import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const home=read('blackcell-os-springboard.js');
const shell=read('blackcell-os.js');
const settings=read('blackcell-os-settings.js');
const skin=read('blackcell-os-obsidian-v2.css');
const html=read('blackcell-os.html');
const manifest=read('blackcell-site-version.json');

test('the new visual layer is included after existing responsive styles',()=>{
 assert.match(html,/blackcell-os-obsidian-v2\.css\?v=20261120-(?:obsidian2|dock-autohide)/);
 assert.ok(html.indexOf('blackcell-os-device-label.css')<html.indexOf('blackcell-os-obsidian-v2.css'));
 assert.match(html,/blackcell-os-springboard\.js\?v=ios-a-20261119/);
 assert.match(html,/blackcell-os\.js\?v=(?:119-os-update-ux2|120-macos-personal-wallpaper)/);
 assert.match(manifest,/(?:obsidian2|dock-auto-hide|macos-personal-wallpaper)/);
});

test('iPhone default artwork is an original lightweight same-origin SVG',()=>{
 const portrait=read('blackcell-os-wallpaper-obsidian-mobile.svg');
 const landscape=read('blackcell-os-wallpaper-obsidian.svg');
 for(const src of [portrait,landscape]){
  assert.match(src,/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(src,/<title>BLACKCELL Obsidian Arc/);
  assert.ok(!/<(?:image|script|foreignObject)\b/i.test(src));
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/i.test(src));
 }
 assert.match(skin,/blackcell-os-wallpaper-obsidian-mobile\.svg/);
 assert.match(skin,/blackcell-os-wallpaper-obsidian\.svg/);
 assert.match(skin,/blackcell-os-cinematic-wallpaper\.svg/);
});

test('the original secure app launcher is preserved while first page is curated',()=>{
 assert.match(home,/\.workspace \.apps/);
 assert.match(home,/if\(!tile\|\|tile\.hidden\|\|tile\.disabled/);
 assert.match(home,/tile\.click\(\)/);
 assert.match(home,/const priority=\[/);
 assert.match(home,/\.\.\.order,\.\.\.priority/);
 assert.match(home,/bc-sb-identity-headline/);
 assert.match(home,/bc-sb-diamond/);
 assert.match(home,/MutationObserver/);
});

test('new app chrome is glass layered and controls have practical touch targets',()=>{
 assert.match(skin,/backdrop-filter:blur/);
 assert.match(skin,/\.os-window-head \.traffic button:nth-child\(-n\+3\)/);
 assert.match(skin,/width:42px!important/);
 assert.match(skin,/height:44px!important/);
 assert.match(skin,/\.bc-sb-app-art/);
 assert.match(skin,/\.bc-sb-dock/);
 assert.match(skin,/prefers-reduced-motion/);
 assert.match(skin,/orientation:landscape/);
});

test('wallpaper choice persists as an account preference, without changing permissions',()=>{
 assert.match(shell,/wallpaper:'midnight'/);
 assert.match(shell,/shell\.dataset\.bcWallpaper/);
 assert.match(shell,/\['midnight','obsidian','skyline','custom'\]/);
 assert.match(shell,/cloudWorkspaceSave\('settings',record\)/);
 assert.match(settings,/Wallpaper Studio/);
 assert.match(read('blackcell-os-wallpaper-settings.js'),/Obsidian Arc/);
 assert.match(read('blackcell-os-wallpaper-settings.js'),/Cinematic Skyline/);
 assert.match(shell,/const IDLE=60\*60\*1000/);
 assert.match(shell,/function authorizedApp\(/);
});
