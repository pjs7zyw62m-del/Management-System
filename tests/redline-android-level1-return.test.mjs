import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('private-photo-ledger.js','utf8');
const start=source.indexOf('// A suspended Android tab can reopen REDLINE');
const end=source.indexOf('\nfunction gate(',start);
assert.ok(start>0&&end>start,'Scoped Android restore helper must exist');
const make=(scope,{android=true,embedded=false,owner=false}={})=>{
 const store=new Map(),moves=[];
 const state={user:{id:'user-1'},member:{access_scope:scope},isOwner:owner};
 const window={};
 window.top=embedded?{}:window;
 const storage={
  getItem:key=>store.has(key)?store.get(key):null,
  setItem:(key,value)=>store.set(key,value),
  removeItem:key=>store.delete(key)
 };
 const location={replace:path=>moves.push(path)};
 const navigator={userAgent:android?'Mozilla/5.0 (Linux; Android 15; Pixel 8)':'Mozilla/5.0 (Macintosh)'};
 const functions=new Function('state','sessionStorage','window','navigator','location',
  source.slice(start,end)+'\nreturn {recordRestrictedRedlineEntry,returnRestoredAndroidToOS,redlineScopeRestoreKey};'
 )(state,storage,window,navigator,location);
 return {state,store,moves,...functions};
};
test('Android former Level 0 tab returns to OS exactly once after verified full access',()=>{
 const env=make('ledger_only');
 env.recordRestrictedRedlineEntry();
 assert.ok(env.store.has(env.redlineScopeRestoreKey()));
 env.state.member.access_scope='full';
 assert.equal(env.returnRestoredAndroidToOS(),true);
 assert.deepEqual(env.moves,['blackcell-os.html']);
 assert.equal(env.store.has(env.redlineScopeRestoreKey()),false);
 assert.equal(env.returnRestoredAndroidToOS(),false);
});
test('Normal Level 1 REDLINE room links remain accessible and do not auto-redirect',()=>{
 const env=make('full');
 assert.equal(env.returnRestoredAndroidToOS(),false);
 assert.deepEqual(env.moves,[]);
});
test('Level 0 stays within REDLINE even with a saved marker',()=>{
 const env=make('ledger_only');
 env.recordRestrictedRedlineEntry();
 assert.equal(env.returnRestoredAndroidToOS(),false);
 assert.deepEqual(env.moves,[]);
});
test('Never redirect owner, desktop or embedded OS REDLINE',()=>{
 for(const options of [{owner:true},{android:false},{embedded:true}]){
  const env=make('ledger_only',options);
  env.recordRestrictedRedlineEntry();
  env.state.member.access_scope='full';
  assert.equal(env.returnRestoredAndroidToOS(),false);
  assert.deepEqual(env.moves,[]);
 }
});
test('Expired previous Level 0 marker does not redirect an intentional Level 1 visit',()=>{
 const env=make('full');
 env.store.set(env.redlineScopeRestoreKey(),String(Date.now()-49*60*60*1000));
 assert.equal(env.returnRestoredAndroidToOS(),false);
 assert.deepEqual(env.moves,[]);
 assert.equal(env.store.has(env.redlineScopeRestoreKey()),false);
});
test('Verified REDLINE route offers OS return only for standard access',()=>{
 assert.match(source,/\$\('backLink'\)\.hidden=scoped/);
 assert.match(source,/\$\('ledgerBrand'\)\.href=scoped\?'private-photo-ledger\.html'/);
 assert.match(source,/\$\('backLink'\)\.href=state\.isOwner\?'dashboard\.html':'blackcell-os\.html'/);
 assert.match(source,/RETURN TO BLACKCELL OS/);
 assert.match(source,/if\(returnRestoredAndroidToOS\(\)\)return;/);
 assert.match(source,/if\(!returnRestoredAndroidToOS\(\)\)return refresh\(\)/);
});
