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
test("All 12 worlds have unique identifiers and meaningful labels",()=>{
 const ids=[...html.matchAll(/\{id:"([a-z]+)",name:"([^"]+)"/g)];
 assert.equal(ids.length,12);
 assert.equal(new Set(ids.map(x=>x[1])).size,12);
 for(const expected of ["Uniform World","Bear World","Daddy World","Muscle World","Leather World","Twink World","Sports World","Rugged World","Nightlife World","Creator World","Connection World","Pride World"]){
  assert.ok(ids.some(x=>x[2]===expected),expected+" is missing");
 }
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
