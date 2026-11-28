import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const shell=readFileSync('blackcell-os.js','utf8'),phone=readFileSync('blackcell-os-springboard.js','utf8'),html=readFileSync('blackcell-os.html','utf8');
function extract(source,name,end){
 const start=source.indexOf('function '+name+'('),stop=source.indexOf(end,start);
 assert.ok(start>=0&&stop>start);
 return vm.runInNewContext('('+source.slice(start,stop).trim()+')');
}
const defaultPins=extract(shell,'defaultMemberHomePins','\nwindow.BLACKCELL_OS_UNIFIED_LAYOUT');
const placement=extract(phone,'phoneHomePlacement','\n function render()');
const ids=arr=>Array.from(arr,x=>x.id);
const store={id:'store'},chat={id:'chat'},notes={id:'notes'},calendar={id:'calendar'},files={id:'files'},browser={id:'browser'};
test('untouched eligible standard member starts with App Store shortcut',()=>{
 const state={changedAt:0,pins:[]};
 assert.deepEqual(ids(defaultPins(state,{eligible:true})),['store']);
 assert.deepEqual(state.pins,[]);
 assert.deepEqual(ids(defaultPins(state,{eligible:false})),[]);
 assert.match(shell,/eligible:active&&!preview&&!owner&&storeLevel!==null&&Number\(storeLevel\)>0&&!storeError&&installedApp\('store'\)/);
});
test('custom empty layout and existing pinned positions are not overwritten',()=>{
 assert.deepEqual(ids(defaultPins({changedAt:10,pins:[]},{eligible:true})),[]);
 const pins=[{id:'notes',x:.2,y:.5}];
 assert.equal(defaultPins({changedAt:0,pins},{eligible:true}),pins);
});
test('sole App Store is on mobile home rather than hidden in Dock',()=>{
 const x=placement([store],['store'],false);
 assert.deepEqual(ids(x.homes),['store']);assert.deepEqual(ids(x.dockAll),[]);
});
test('installed apps retain normal placement while explicit home pins are honored',()=>{
 const all=[store,chat,notes,calendar,files,browser];
 const x=placement(all,['store'],false);
 assert.ok(ids(x.homes).includes('store'));
 assert.equal(x.dockAll.length,4);
 assert.equal(x.homes.length+x.dockAll.length,all.length);
 const custom=placement(all,['store'],true);
 assert.deepEqual(ids(custom.homes),['store']);
 assert.ok(!ids(custom.dockAll).includes('store'));
});
test('render and page navigation share the same placement logic and cache keys',()=>{
 assert.match(phone,/phoneHomePlacement\(all,homePinned\(\).map\(x=>x.id\),unified\(\)\?\.read\?\.\(\).changedAt>0\)/);
 assert.match(phone,/phoneHomePlacement\(ordered\(\),homePinned/);
 assert.match(html,/memberStoreHome=20261128-1/);
});
