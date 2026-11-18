import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync("blackcell-man-world-prototype.html","utf8");
test("World selection is a standalone nonindexed demonstration",()=>{
 assert.match(html,/<title>BLACKCELL MAN WORLD — Select Your World<\/title>/);
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/id="chooser"/);
 assert.match(html,/id="worldGrid"/);
 assert.match(html,/id="selectedCount"/);
 assert.match(html,/id="homeGrid"/);
 assert.match(html,/id="editSelection"/);
 assert.match(html,/No user account is created/);
});
test("All ten requested worlds have unique identifiers and meaningful labels",()=>{
 const ids=[...html.matchAll(/\{id:"([a-z]+)",name:"([^"]+)"/g)];
 assert.equal(ids.length,10);
 assert.equal(new Set(ids.map(x=>x[1])).size,10);
 for(const expected of ["Leather","Rubber","Pup Play","BDSM","Findom","Underwear","Bondage","Gear","Sportswear","Uniform"]){
  assert.ok(ids.some(x=>x[2]===expected),expected+" is missing");
 }
 assert.match(html,/10 worlds available/);
});
test("World selection is multi-select and has a skip path",()=>{
 assert.match(html,/selected=new Set\(\)/);
 assert.match(html,/selected\.has\(w\.id\)\?selected\.delete\(w\.id\):selected\.add\(w\.id\)/);
 assert.match(html,/id="continue" disabled/);
 assert.match(html,/id="skip"/);
 assert.match(html,/aria-pressed/);
 assert.match(html,/function openHome\(\)/);
});
test("Sensitive member world preferences are not persisted in this prototype",()=>{
 assert.doesNotMatch(html,/\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b/);
 assert.doesNotMatch(html,/supabase|service_role|process\.env/i);
});

test("Worlds use the existing profile-style stationary circular selector",()=>{
 assert.match(html,/PROFILE-STYLE STATIC WORLD CIRCLES/);
 assert.match(html,/classList\.toggle\("is-filtering",query\.length>0\)/);
 assert.match(html,/\.world-circle\{/);
 assert.match(html,/border-radius:50%/);
 assert.match(html,/\.world\[aria-pressed=true\] \.world-circle\{/);
 assert.match(html,/const circle=create\("span","world-circle"\)/);
 assert.match(html,/button\.dataset\.world=w\.id/);
 assert.doesNotMatch(html,/const orbit=\{|@keyframes worldDrift|@keyframes filteredDrift/);
 assert.match(html,/animation:none!important/);
});
test("Ten circular worlds reflow responsively",()=>{
 assert.match(html,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\(max-width:990px\)/);
 assert.match(html,/@media\(max-width:710px\)/);
 assert.match(html,/@media\(max-width:500px\)/);
 assert.match(html,/prefers-reduced-motion:reduce/);
});
test("The inline prototype script parses",()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1]));
});
