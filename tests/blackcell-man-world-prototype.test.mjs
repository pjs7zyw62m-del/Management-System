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
 assert.match(html,/No account created/);
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


test("Photo-led bubbles preserve ten selectable hubs and show readable labels",()=>{
 assert.match(html,/PHOTO HUB BUBBLES/);
 assert.match(html,/const hubArt=Object.freeze\(\{/);
 for(const id of ["leather","rubber","pup","bdsm","findom","underwear","bondage","gear","sportswear","uniform"]){
  assert.match(html,new RegExp("\\b"+id+":"));
 }
 assert.match(html,/const circle=create\("span","world-circle"\)/);
 assert.match(html,/circle\.append\(hubImage\(w\),copy\)/);
 assert.match(html,/world-circle-title/);
 assert.match(html,/\.world-image\{/);
 assert.match(html,/object-fit:cover/);
 assert.match(html,/button\.setAttribute\("aria-pressed",String\(selected\.has\(w\.id\)\)\)/);
 assert.match(html,/id="requestHub"/);
});
test("Image bubbles remain stationary and offer a fallback for missing imagery",()=>{
 assert.match(html,/img\.onerror=\(\)=>\{img\.hidden=true\}/);
 assert.match(html,/\.world\[aria-pressed=true\] \.world-circle/);
 assert.doesNotMatch(html,/@keyframes worldDrift|@keyframes filteredDrift|const orbit=\{/);
});

test("BLACKCELL OS pitch black selected-world styling has no checkmark UI",()=>{
 assert.match(html,/OBSIDIAN RED EDITION/);
 assert.match(html,/--bg:#000000/);
 assert.match(html,/\.world\[aria-pressed=true\] \.world-circle\{/);
 assert.match(html,/\.world\[aria-pressed=true\] \.world-image\{/);
 assert.match(html,/\.world-check\{display:none!important\}/);
 assert.doesNotMatch(html,/const check=create\("span","world-check"/);
 assert.match(html,/aria-pressed/);
});

test("BLACKCELL OS 2.0 shell redesign preserves bubble interaction",()=>{
 assert.match(html,/MAN WORLD CHROME 2\.0/);
 assert.match(html,/class="top os-header"/);
 assert.match(html,/class="os-title-group"/);
 assert.match(html,/id="discoverNav"/);
 assert.match(html,/id="myWorldsNav"/);
 assert.match(html,/id="navSelected"/);
 assert.match(html,/class="intro os-intro"/);
 assert.match(html,/class="os-worlds-surface"/);
 assert.match(html,/class="selection os-selection"/);
 assert.match(html,/id="selectionHint"/);
 assert.match(html,/id="selectedPills"/);
 assert.match(html,/class="home os-home"/);
 assert.match(html,/function setNavCurrent\(isHome\)/);
 assert.match(html,/function showChooser\(\)/);
 assert.match(html,/selected\.size===0/);
 assert.match(html,/circle\.append\(hubImage\(w\),copy\)/);
 assert.doesNotMatch(html,/const check=create\("span","world-check"/);
});
test("Header navigation, selected-count preview, and second screen are wired",()=>{
 assert.match(html,/\$\("navSelected"\)\.textContent=String\(selected\.size\)/);
 assert.match(html,/\$\("discoverNav"\)\.onclick=showChooser/);
 assert.match(html,/\$\("myWorldsNav"\)\.onclick=openHome/);
 assert.match(html,/\$\("selectedPills"\)/);
 assert.match(html,/\$\("editSelection"\)\.onclick=showChooser/);
 assert.match(html,/id="homeGrid"/);
 assert.match(html,/id="skip"/);
});
