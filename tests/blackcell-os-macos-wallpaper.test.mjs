import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(name,'utf8');
const os=read('blackcell-os.js'),html=read('blackcell-os.html'),skin=read('blackcell-os-macos-midnight.css');
const panel=read('blackcell-os-wallpaper-settings.js'),wallpaper=read('blackcell-os-wallpaper.js');
const mac=read('blackcell-os-macos-desktop.js'),schema=read('supabase/migrations/20261121045949_blackcell_os_private_user_wallpapers.sql');

test('Midnight Silk is the new default and old Obsidian layouts remain available',()=>{
 assert.match(os,/wallpaper:'midnight'/);
 assert.match(os,/desktopClean:true/);
 assert.match(os,/wallet=|wallpaperManager/);
 assert.match(html,/blackcell-os-macos-midnight\.css\?v=20261121-1/);
 assert.match(html,/blackcell-os-macos-desktop\.js\?v=20261121-(?:1|2)/);
 assert.match(html,/blackcell-os\.js\?v=(?:120-macos-personal-wallpaper|121-mac-workspaces|122-unified-desktop-sync|123-mobile-ready-drag-fix|124-auto-save-updates)/);
 assert.match(skin,/blackcell-os-wallpaper-midnight-mobile\.svg/);
 assert.match(skin,/blackcell-os-wallpaper-midnight\.svg/);
 assert.match(skin,/data-bc-wallpaper="custom"/);
});

test('A genuine desktop, not an always-on dashboard',()=>{
 assert.match(skin,/\.bc-macos-desktop \.workspace>section:first-of-type/);
 assert.match(skin,/\.bc-macos-desktop\.bc-macos-apps-open/);
 assert.match(skin,/\.bc-macos-desktop\.bc-macos-widgets-open/);
 assert.match(skin,/\.bc-exec-stage \.bc-exec-brand/);
 assert.match(mac,/Applications/);
 assert.match(mac,/Widgets/);
 assert.match(mac,/blackcell:open-wallpaper-settings/);
 assert.match(os,/openAppOrStore\('settings','appearance'\)/);
 assert.ok(!/window\.location\s*=|localStorage\.clear\(/.test(mac));
});

test('Custom wallpaper input previews locally; account upload occurs only after Apply',()=>{
 assert.match(panel,/input\.type='file'/);
 assert.match(panel,/URL\.createObjectURL\(file\)/);
 assert.match(panel,/const apply=btn\('Apply Wallpaper'/);
 assert.match(panel,/api\.wallpaper\.upload\(selected,dest\.value\)/);
 assert.match(panel,/clearPreview/);
 assert.match(panel,/Wallpaper devices/);
 assert.match(panel,/Different on phone, tablet and desktop/);
 assert.match(panel,/wallpaperFit/);
 assert.match(panel,/wallpaperDim/);
 assert.match(panel,/wallpaperBlur/);
 assert.match(panel,/Recent personal wallpapers/);
});

test('Storage bucket is private, sized, and enforced by auth UID path policies',()=>{
 assert.match(schema,/blackcell-os-wallpapers','blackcell-os-wallpapers',false,8388608/);
 assert.match(schema,/for select to authenticated/);
 assert.match(schema,/for insert to authenticated/);
 assert.match(schema,/for update to authenticated/);
 assert.match(schema,/for delete to authenticated/);
 assert.match(schema,/storage\.foldername\(name\)\)\[1\]=\(select auth\.uid\(\)\)::text/);
 assert.ok(!/to anon|public,true/i.test(schema));
});

test('Wallpaper uploader rejects unsafe SVG and oversized images before network upload',async()=>{
 const {createWallpaperController}=await import('data:text/javascript;base64,'+Buffer.from(wallpaper).toString('base64'));
 const uid='01234567-89ab-4cde-8fab-0123456789ab';
 let uploads=0,downloads=0;
 let prefs={wallpaper:'midnight',wallpaperMode:'all',wallpaperImages:{all:'',phone:'',tablet:'',desktop:''},wallpaperHistory:[],wallpaperDim:12,wallpaperBlur:0};
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window={BLACKCELL_LIVE_UPDATE:null};
 const props={};
 globalThis.document={documentElement:{classList:{contains:cls=>cls==='bc-os-phone'}},getElementById:()=>({style:{setProperty:(k,v)=>{props[k]=v}}})};
 const fake={storage:{from:bucket=>{
  assert.equal(bucket,'blackcell-os-wallpapers');
  return {
   upload:async(path,file)=>{uploads++;assert.ok(path.startsWith(uid+'/phone/'));return {error:null}},
   download:async(path)=>{downloads++;return {data:new Blob(['image'],{type:'image/png'}),error:null}}
  };
 }}};
 const manager=createWallpaperController({getClient:()=>fake,getAccount:()=>uid,getPrefs:()=>prefs,
  setPreference:(k,v)=>{prefs={...prefs,[k]:v};return {ok:true}},
  isPreview:()=>false,getCloudReady:()=>true,awaitSync:async()=>true});
 try{
  let result=await manager.upload(new Blob(['<svg/>'],{type:'image/svg+xml'}),'phone');
  assert.equal(result.ok,false);assert.equal(uploads,0);
  result=await manager.upload(new Blob([new Uint8Array(8*1024*1024+1)],{type:'image/png'}),'phone');
  assert.equal(result.ok,false);assert.equal(uploads,0);
  result=await manager.upload(new Blob(['safe'],{type:'image/png'}),'phone');
  assert.equal(result.ok,true);assert.equal(uploads,1);
  assert.equal(prefs.wallpaper,'custom');assert.equal(prefs.wallpaperMode,'separate');
  assert.ok(prefs.wallpaperImages.phone.startsWith(uid+'/phone/'));
  assert.equal(prefs.wallpaperHistory.length,1);
  assert.ok(downloads<=1,'avoid duplicate downloaded wallpaper requests');
 }finally{manager.dispose();globalThis.document=oldDocument;globalThis.window=oldWindow}
});
