import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync("blackcell-man-world-prototype.html","utf8");

test("BLACKCELL MAN WORLD is a self-contained, nonindexed private design demo",()=>{
 assert.match(html,/<title>BLACKCELL Corporation — MAN WORLD<\/title>/);
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/data:image\/png;base64,/);
 assert.match(html,/data:image\/webp;base64,/);
 assert.match(html,/const ASSET_MAP=/);
 assert.match(html,/Preview mode: account sign-in is not connected/);
 assert.match(html,/does not create accounts/);
 assert.doesNotMatch(html,/\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b/);
 assert.doesNotMatch(html,/supabase|service_role|process\.env/i);
});

test("All ten user-selected worlds are displayed",()=>{
 const found=[...html.matchAll(/\{id:'([a-z]+)',name:'([^']+)'/g)];
 assert.deepEqual(found.map(x=>x[2]),[
  "LEATHER","RUBBER","PUP PLAY","BDSM","FINDOM","UNDERWEAR","BONDAGE","GEAR","SPORTSWEAR","UNIFORM"
 ]);
 assert.equal(new Set(found.map(x=>x[1])).size,10);
});

test("Approved hexagonal corporate emblem and cinematic hero are embedded",()=>{
 assert.match(html,/blackcell-corporate-logo/);
 assert.match(html,/class="hero-emblem"/);
 assert.match(html,/class="hero-picture"/);
 assert.match(html,/class="hero-contents"/);
 assert.match(html,/MAN<\/span> <span class="blood">WORLD/);
 assert.match(html,/PRIVATE COMMUNITIES FOR MEN/);
 assert.match(html,/CHOOSE YOUR WORLDS/);
 assert.match(html,/LEVEL 04/);
});

test("Search, selection, Enter My World and editing are interactive",()=>{
 assert.match(html,/id="worldGrid"/);
 assert.match(html,/id="worldSearch"/);
 assert.match(html,/id="continue" disabled/);
 assert.match(html,/id="selectedCount"/);
 assert.match(html,/id="enterTop"/);
 assert.match(html,/id="exploreTop"/);
 assert.match(html,/id="personalGrid"/);
 assert.match(html,/id="editWorlds"/);
 assert.match(html,/const selected=new Set\(\)/);
 assert.match(html,/selected\.has\(w\.id\)\?selected\.delete\(w\.id\):selected\.add\(w\.id\)/);
 assert.match(html,/setAttribute\('aria-pressed'/);
 assert.match(html,/function draw\(\)/);
 assert.match(html,/function showHome\(\)/);
 assert.match(html,/function showWorlds\(\)/);
 assert.match(html,/\$\('worldSearch'\)\.addEventListener/);
 assert.match(html,/\$\('skip'\)\.onclick=showHome/);
});

test("Polished mobile/desktop layout and reduced motion support",()=>{
 assert.match(html,/grid-template-columns:repeat\(10,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\(max-width:1440px\)/);
 assert.match(html,/@media\(max-width:1050px\)/);
 assert.match(html,/@media\(max-width:700px\)/);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(html,/\.world\[aria-pressed=true\]/);
 assert.doesNotMatch(html,/worldDrift|orbit=\{/);
});

test("Inline JavaScript parses without syntax errors",()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1]));
});
