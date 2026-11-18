import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd(),read=name=>fs.readFileSync(path.join(root,name),"utf8");
const html=read("blackcell-os.html"),os=read("blackcell-os.js"),store=read("blackcell-app-store.js");
const links=source=>[...source.matchAll(/\bdata-url="([^"]+)"/g)].map(x=>x[1].replaceAll("&amp;","&")).concat(
 [...source.matchAll(/(?:\burl|["']url["'])\s*:\s*["']([^"']+)["']/g)].map(x=>x[1]));
test("Every configured desktop and optional app launch page exists",()=>{
 const targets=[...new Set([...links(html),...links(os)])];
 assert.ok(targets.length>=40,"Expected core, Uniform World and optional beta app URLs");
 for(const target of targets){
  if(/^https?:\/\//.test(target))continue;
  const route=decodeURIComponent(target.split("?")[0].split("#")[0]).replace(/^\.\//,"");
  assert.ok(route.endsWith(".html")&&fs.existsSync(path.join(root,route)),target+" has no deployable file");
 }
});
test("No duplicate core desktop tile IDs",()=>{
 const ids=[...html.matchAll(/data-app="([a-z][a-z0-9]+)"/g)].map(x=>x[1]);
 assert.ok(ids.length>=25);assert.equal(ids.length,new Set(ids).size);
});
test("Omega and Hunt remain as one app with a legacy entry redirect",()=>{
 assert.match(os,/omega:\{title:'OMEGA \/\/ THE HUNT'/);
 assert.match(read("blackcell-the-hunt.html"),/blackcell-omega\.html\?from=hunt/);
 assert.ok(fs.existsSync(path.join(root,"blackcell-omega.html")));
});
test("App health audits are read-only, scoped and do not uninstall apps",()=>{
 assert.match(store,/Audit installed apps/);
 assert.match(store,/method:'HEAD'/);
 assert.match(store,/credentials:'same-origin'/);
 assert.match(store,/No apps, account records or media were changed/);
 assert.match(store,/Never automatically uninstall/);
});
test("Only exact unreferenced duplicate test page was retired",()=>{
 assert.ok(fs.existsSync(path.join(root,"site-update-test.html")));
 assert.equal(fs.existsSync(path.join(root,"site-update-test-v2.html")),false);
});
