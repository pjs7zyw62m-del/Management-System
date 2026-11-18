import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync("blackcell-man-world-prototype.html","utf8");

test("Standalone MAN WORLD preview is nonindexed and does not authenticate or save preferences",()=>{
 assert.match(html,/<title>BLACKCELL MAN WORLD — Select Your World<\/title>/);
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/id="chooser"/);
 assert.match(html,/id="home"/);
 assert.match(html,/id="homeGrid"/);
 assert.match(html,/No account created/);
 assert.doesNotMatch(html,/\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b/);
 assert.doesNotMatch(html,/supabase|service_role|process\.env/i);
});

test("Exactly ten requested MAN WORLD categories remain in their original order",()=>{
 const found=[...html.matchAll(/\{id:"([a-z]+)",name:"([^"]+)"/g)];
 const names=found.map(x=>x[2]);
 assert.deepEqual(names,["Leather","Rubber","Pup Play","BDSM","Findom","Underwear","Bondage","Gear","Sportswear","Uniform"]);
 assert.equal(new Set(found.map(x=>x[1])).size,10);
 assert.match(html,/10 WORLDS/);
});

test("Approved circular photo hubs, red selected-state ring, and no checkmark are preserved",()=>{
 assert.match(html,/class="worlds" id="worldGrid"/);
 assert.match(html,/const circle=create\("span","world-circle"\)/);
 assert.match(html,/circle\.append\(hubImage\(w\),copy\)/);
 assert.match(html,/const hubArt=Object\.freeze\(\{/);
 assert.match(html,/\.world-circle\{/);
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

test("BLACKCELL OS styling uses a desktop menu bar, native-app window, Finder-style sidebar and dock",()=>{
 assert.match(html,/class="os-menubar"/);
 assert.match(html,/class="os-window"/);
 assert.match(html,/class="window-titlebar"/);
 assert.match(html,/class="traffic-dots"/);
 assert.match(html,/class="window-layout"/);
 assert.match(html,/class="sidebar"/);
 assert.match(html,/class="workspace"/);
 assert.match(html,/class="workspace-scroll"/);
 assert.match(html,/class="action-dock"/);
 assert.match(html,/class="workspace-status"/);
 assert.match(html,/class="mobile-tabs"/);
 assert.match(html,/id="discoverNav"/);
 assert.match(html,/id="discoverMobile"/);
 assert.match(html,/id="myWorldsNav"/);
 assert.match(html,/id="myWorldsMobile"/);
 assert.match(html,/id="navSelected"/);
 assert.match(html,/id="navSelectedMobile"/);
 assert.match(html,/id="selectedPills"/);
});

test("Navigation, multi-select, search, skip, and editing remain functional",()=>{
 assert.match(html,/selected=new Set\(\)/);
 assert.match(html,/selected\.has\(w\.id\)\?selected\.delete\(w\.id\):selected\.add\(w\.id\)/);
 assert.match(html,/id="continue" disabled/);
 assert.match(html,/id="skip"/);
 assert.match(html,/id="search"/);
 assert.match(html,/id="searchWrap"/);
 assert.match(html,/id="editSelection"/);
 assert.match(html,/function openHome\(\)/);
 assert.match(html,/function openChooser\(\)/);
 assert.match(html,/\$\("discoverNav"\)\.onclick=openChooser/);
 assert.match(html,/\$\("myWorldsNav"\)\.onclick=openHome/);
 assert.match(html,/\$\("discoverMobile"\)\.onclick=openChooser/);
 assert.match(html,/\$\("myWorldsMobile"\)\.onclick=openHome/);
 assert.match(html,/\$\("searchWrap"\)\.hidden=isHome/);
 assert.match(html,/\$\("actionDock"\)\.hidden=isHome/);
});

test("Native app shell responds to mobile and bubbles remain within their grid cells",()=>{
 assert.match(html,/@media\(max-width:1250px\)/);
 assert.match(html,/@media\(max-width:1000px\)/);
 assert.match(html,/@media\(max-width:760px\)/);
 assert.match(html,/@media\(max-width:565px\)/);
 assert.match(html,/width:min\(100%,clamp\(155px,16\.2vw,222px\)\)/);
 assert.match(html,/aspect-ratio:1/);
 assert.match(html,/scrollbar-width:none/);
 assert.match(html,/prefers-reduced-motion:reduce/);
});

test("Inline browser logic parses without syntax error",()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1]));
});
