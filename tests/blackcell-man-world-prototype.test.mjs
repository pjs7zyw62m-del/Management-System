import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync("blackcell-man-world-prototype.html","utf8");

test("Standalone prototype is nonindexed and does not save or transmit selections",()=>{
 assert.match(html,/<title>BLACKCELL MAN WORLD — Select Your World<\/title>/);
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/id="chooser"/);
 assert.match(html,/id="homeGrid"/);
 assert.match(html,/No account created/);
 assert.doesNotMatch(html,/\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b/);
 assert.doesNotMatch(html,/supabase|service_role|process\.env/i);
});

test("Exactly ten requested worlds are preserved",()=>{
 const worlds=[...html.matchAll(/\{id:"([a-z]+)",name:"([^"]+)"/g)];
 assert.deepEqual(worlds.map(x=>x[2]),["Leather","Rubber","Pup Play","BDSM","Findom","Underwear","Bondage","Gear","Sportswear","Uniform"]);
 assert.equal(new Set(worlds.map(x=>x[1])).size,10);
});

test("Prominent male-photography hero and editorial-first layout replace simulated OS desktop",()=>{
 assert.match(html,/CINEMATIC EDITORIAL 4\.0/);
 assert.match(html,/MEN\. COMMUNITY\. CONNECTION\./);
 assert.match(html,/FIND YOUR <span>WORLD/);
 assert.match(html,/class="hero-art"/);
 assert.match(html,/assets\/maf\/portrait-law-enforcement\.png/);
 assert.match(html,/assets\/maf\/portrait-military\.png/);
 assert.match(html,/assets\/maf\/portrait-fire-rescue\.png/);
 assert.match(html,/class="site-head"/);
 assert.match(html,/class="section-head"/);
 assert.doesNotMatch(html,/class="os-menubar"|class="os-window"|class="sidebar"/);
});

test("Photo hubs remain circles without checkmarks or moving bubbles",()=>{
 assert.match(html,/class="worlds" id="worldGrid"/);
 assert.match(html,/const circle=create\("span","world-circle"\)/);
 assert.match(html,/circle\.append\(hubImage\(w\),copy\)/);
 assert.match(html,/const hubArt=Object\.freeze\(\{/);
 assert.match(html,/border-radius:50%/);
 assert.match(html,/\.world-image\{/);
 assert.match(html,/object-fit:cover/);
 assert.match(html,/\.world\[aria-pressed=true\] \.world-circle\{/);
 assert.match(html,/\.world\[aria-pressed=true\] \.world-image\{/);
 assert.match(html,/button\.setAttribute\("aria-pressed",String\(selected\.has\(w\.id\)\)\)/);
 assert.match(html,/img\.onerror=\(\)=>\{img\.hidden=true\}/);
 assert.doesNotMatch(html,/const check=create\("span","world-check"/);
 assert.doesNotMatch(html,/@keyframes worldDrift|@keyframes filteredDrift|const orbit=\{/);
});

test("Working category search, multi-select, navigation, skip and home return",()=>{
 assert.match(html,/selected=new Set\(\)/);
 assert.match(html,/selected\.has\(w\.id\)\?selected\.delete\(w\.id\):selected\.add\(w\.id\)/);
 assert.match(html,/id="search"/);
 assert.match(html,/id="selectedCount"/);
 assert.match(html,/id="continue" disabled/);
 assert.match(html,/id="skip"/);
 assert.match(html,/id="editSelection"/);
 assert.match(html,/id="requestHub"/);
 assert.match(html,/id="discoverNav"/);
 assert.match(html,/id="myWorldsNav"/);
 assert.match(html,/function openChooser\(\)/);
 assert.match(html,/function openHome\(\)/);
 assert.match(html,/\$\("discoverNav"\)\.onclick=openChooser/);
 assert.match(html,/\$\("myWorldsNav"\)\.onclick=openHome/);
});

test("Responsive circles and selection dock support phone and desktop",()=>{
 assert.match(html,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\(max-width:1160px\)/);
 assert.match(html,/@media\(max-width:850px\)/);
 assert.match(html,/@media\(max-width:620px\)/);
 assert.match(html,/width:min\(100%,clamp\(164px,16vw,225px\)\)/);
 assert.match(html,/aspect-ratio:1/);
 assert.match(html,/class="selection" id="selectionDock"/);
 assert.match(html,/prefers-reduced-motion:reduce/);
});

test("Inline JavaScript parses",()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1]));
});
