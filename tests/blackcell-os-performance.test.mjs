import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=(path)=>readFileSync(path,"utf8");
const auth=source("corp-auth.js");
const network=source("corporate-network.js");
const autoSort=source("blackcell-upload-auto-sort.js");
const soc=source("blackcell-soc-client.js");
const workspace=source("corporate-workspace-auth.js");

test("concurrent corporate authorization calls use one secure in-flight read",async()=>{
 const clean=auth.replace(/^import \{createClient\} from .*;\s*/m,"const createClient = () => {};");
 assert.notEqual(clean,auth,"Replace the external CDN import only in the isolated unit test");
 const uri="data:text/javascript;base64,"+Buffer.from(clean).toString("base64");
 const {corporateAuthorize}=await import(uri);
 let authCalls=0,memberCalls=0;
 let member={user_id:"test-1",role:"owner",active:true,clearance_level:7};
 const fake={
  auth:{getUser:async()=>{authCalls++;await new Promise(resolve=>setTimeout(resolve,8));return {data:{user:{id:"test-1"}},error:null}}},
  from:table=>{
   assert.equal(table,"corp_access_members");
   return {select(){return this},eq(){return this},
    async maybeSingle(){memberCalls++;await new Promise(resolve=>setTimeout(resolve,8));return {data:member,error:null}}};
  }
 };
 const a=await Promise.all(Array.from({length:12},()=>corporateAuthorize(fake)));
 assert.ok(a.every(x=>x.ok));
 assert.equal(authCalls,1);
 assert.equal(memberCalls,1);

 member=null;
 const later=await corporateAuthorize(fake);
 assert.equal(later.ok,false,"Previously approved member must not remain cached");
 assert.equal(authCalls,2);
 assert.equal(memberCalls,2);
});

test("no persistent authorization caching or bypass of revoked members",()=>{
 assert.match(auth,/new WeakMap\(\)/);
 assert.match(auth,/requests\.delete\(key\)/);
 assert.match(auth,/auth\.getUser\(\)/);
 assert.match(auth,/from\('corp_access_members'\)/);
 assert.doesNotMatch(auth,/localStorage\.setItem/);
});

test("network preserves security checks while reducing duplicate polling",()=>{
 assert.match(network,/window\.setInterval\(\(\)=>void verifyNetworkSession\(\),45000\)/);
 assert.match(network,/networkLastCheckAt/);
 assert.match(network,/if\(status\.error\|\|status\.data\?\.verified!==true\)/);
 assert.match(network,/closeNetworkForSecurity/);
 assert.match(network,/\.auth\.getUser\(\)/);
 assert.match(network,/\(as\.data\|\|\[\]\)\.length>=1000/);
 assert.match(network,/refreshPending/);
 assert.match(network,/refreshAgain/);
});

test("auto-sort does not poll while hidden but continues event-driven uploads",()=>{
 assert.match(autoSort,/if\(document\.hidden\|\|!owner/);
 assert.match(autoSort,/setInterval\(discoveryTick,300000\)/);
 assert.match(autoSort,/window\.addEventListener\("blackcell:upload-saved"/);
 assert.match(autoSort,/window\.addEventListener\("focus",activeDiscovery\)/);
 assert.match(autoSort,/AUTO_LIMIT/);
 assert.match(autoSort,/navigator\.locks\?\.request/);
});

test("SOC alert polling coalesces event storms and retains manual refresh",()=>{
 assert.match(soc,/lastRefreshAt/);
 assert.match(soc,/Date\.now\(\)-lastRefreshAt<12000/);
 assert.match(soc,/refresh\(true\)/);
 assert.match(soc,/setInterval\(focus,60000\)/);
});

test("transient auth network errors lock the workspace but do not log out",()=>{
 assert.match(workspace,/function pauseForTransport\(\)/);
 assert.match(workspace,/verificationPaused=true/);
 assert.match(workspace,/deny\('Secure verification is temporarily unavailable/);
 assert.match(workspace,/function isDefiniteRejection/);
 assert.match(workspace,/status===401\\|\\|status===403/);
 assert.match(workspace,/if\\(error\\)\\{if\\(isDefiniteRejection\\(result\\)\\)await signOut\\(\\);else pauseForTransport\\(\\);return;\\}/);
 assert.match(workspace,/if\(data\?\.ok!==true\|\|data\?\.verified!==true\)\{await signOut\(\);return;\}/);
 assert.match(workspace,/verificationPaused\)\{verificationPaused=false;gate\.hidden=true;app\.hidden=false;/);
 assert.match(workspace,/if\(closed\|\|!client\|\|verifying\)return/);
});
