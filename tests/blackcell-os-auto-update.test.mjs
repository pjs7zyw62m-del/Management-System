import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const updater=readFileSync('blackcell-live-update.js','utf8');
const os=readFileSync('blackcell-os.js','utf8');
const settings=readFileSync('blackcell-os-settings.js','utf8');
const html=readFileSync('blackcell-os.html','utf8');

const extract=(from,to)=>{
 const a=updater.indexOf(from),b=updater.indexOf(to,a);
 assert.ok(a>=0&&b>a,'Missing update helper '+from);
 return updater.slice(a,b);
};

const visibility=new Function(extract('function visible(el){','function busy(){')+';return {visible,activityDoc};')();
const el=({hidden=false,display='block',visibility='visible',opacity='1',playing=false,src='',withinWindow=false}={})=>({
 isConnected:true,
 closest:(selector)=>selector.includes('[hidden]')&&hidden?{}:selector==='.os-window'&&withinWindow?{}:null,
 getClientRects:()=>[{}],
 ownerDocument:{defaultView:{getComputedStyle:()=>({display,visibility,opacity})}},
 paused:!playing,ended:false,currentSrc:src,getAttribute:()=>src,
 id:withinWindow?'bcCinemaStreamPlayer':'',
 dataset:{},
 contentDocument:null
});
const doc=({busyItems=[],media=[],frames=[]}={})=>({
 querySelector:()=>null,
 querySelectorAll:selector=>selector.includes('[aria-busy=')?busyItems:selector==='video,audio'?media:selector==='iframe'?frames:[]
});

test('Background and hidden UI are not false-positive auto-update blockers',()=>{
 const hiddenBusy=el({hidden:true});
 const visibleBusy=el();
 assert.equal(visibility.visible(hiddenBusy),false);
 assert.equal(visibility.visible(el({opacity:'0'})),false);
 assert.equal(visibility.visible(el({display:'none'})),false);
 assert.equal(visibility.visible(visibleBusy),true);
 assert.equal(visibility.activityDoc(doc({busyItems:[hiddenBusy]})),false);
 assert.equal(visibility.activityDoc(doc({busyItems:[visibleBusy]})),true);
 assert.equal(visibility.activityDoc(doc({media:[el({hidden:true,playing:true,src:'demo.mp4'})]})),false);
 assert.equal(visibility.activityDoc(doc({media:[el({playing:true,src:'demo.mp4'})]})),true);
 assert.equal(visibility.activityDoc(doc({frames:[el({hidden:true,src:'video',withinWindow:true})]})),false);
 assert.equal(visibility.activityDoc(doc({frames:[el({src:'video',withinWindow:true})]})),true);
});

test('Automatic OS updates are enabled by default but can be disabled per device',()=>{
 const body=extract('function autoEnabled(){','let osDeferred');
 const autoEnabled=new Function('localStorage','OS_AUTO',body+';return autoEnabled;');
 const key='bc.os.auto-updates.v1';
 assert.equal(autoEnabled({getItem:()=>null},key)(),true);
 assert.equal(autoEnabled({getItem:()=> 'on'},key)(),true);
 assert.equal(autoEnabled({getItem:()=> 'off'},key)(),false);
 assert.match(settings,/row\(p,'Automatic updates',auto/);
 assert.match(settings,/auto\.onchange=/);
});

test('An idle OS updates without a repeated Update Now prompt',()=>{
 const body=extract('function maybeRefresh(){','function setOSNoticeStatus');
 const evaluate=({auto=true,idle=true,osMode=true}={})=>{
  let refreshes=0,prompts=0;
  const create=new Function('pending','refreshing','osMode','autoEnabled','safe','refresh','osNotice','osRequested','showOSNotice','blockingReason','setOSNoticeStatus',body+';return maybeRefresh;');
  const maybe=create('new-release',false,osMode,()=>auto,()=>idle,()=>{refreshes++},null,false,()=>{prompts++},()=>'none',()=>{});
  maybe();return {refreshes,prompts};
 };
 assert.deepEqual(evaluate(),{refreshes:1,prompts:0});
 assert.deepEqual(evaluate({idle:false}),{refreshes:0,prompts:0});
 assert.deepEqual(evaluate({auto:false}),{refreshes:0,prompts:1});
});

test('Workspace is saved before updating and sensitive arbitrary drafts are not copied',()=>{
 assert.match(os,/window\.BLACKCELL_OS_AUTOSAVE_WORKSPACE=async/);
 assert.match(os,/sessionStorage\.getItem\(workspaceKey\(\)\)/);
 assert.match(updater,/await window\.BLACKCELL_OS_AUTOSAVE_WORKSPACE\(\)/);
 assert.match(updater,/function blockingReason\(/);
 assert.match(updater,/function modified\(/);
 assert.match(updater,/function openModal\(/);
 assert.match(updater,/holds\.size>0\|\|activityDoc\(document\)/);
 for(const str of ['localStorage.clear(', 'sessionStorage.clear(', 'indexedDB.deleteDatabase(', 'caches.delete(']){
  assert.ok(!updater.includes(str),'Destructive data-clearing operation: '+str);
 }
});

test('New verified build and update release assets are consistent',()=>{
 assert.match(html,/blackcell-os-client-build" content="20261121-quiet-auto-save-updates-1"/);
 assert.match(html,/blackcell-live-update\.js\?v=20261121-auto-save-updates1/);
 assert.match(html,/blackcell-os\.js\?v=124-auto-save-updates/);
 assert.match(readFileSync('blackcell-site-version.json','utf8'),/quiet-auto-save-updates-1/);
});
