import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const page=fs.readFileSync(path.join(root,"blackcell-men-prototype.html"),"utf8");
const os=fs.readFileSync(path.join(root,"blackcell-os.js"),"utf8");
test("BLACKCELL MEN prototype remains a separate noindex website",()=>{
 assert.match(page,/<title>BLACKCELL MEN \| Private Prototype<\/title>/);
 assert.match(page,/name="robots" content="noindex,nofollow"/);
 assert.match(page,/id="ageGate"/);
 assert.match(page,/not a production-grade age verification system/i);
 assert.match(page,/No explicit media or real user accounts/i);
 assert.match(page,/id="mediaGrid"/);
 assert.match(page,/id="search"/);
 assert.match(page,/data-filter="uniforms"/);
 assert.match(page,/id="uploadTop"/);
});
test("Prototype never sends selected files to a backend",()=>{
 assert.match(page,/URL\.createObjectURL\(f\)/);
 assert.match(page,/Nothing has been uploaded/);
 assert.doesNotMatch(page,/\bfetch\s*\(/);
 assert.doesNotMatch(page,/\bXMLHttpRequest\b/);
 assert.doesNotMatch(page,/\bsupabase\.storage\b/);
});
test("All sample portrait media exists in the repository",()=>{
 const assets=[...page.matchAll(/assets\/maf\/[a-z-]+\.png/g)].map(m=>m[0]);
 assert.ok(assets.length>=5);
 for(const name of assets)assert.ok(fs.existsSync(path.join(root,name)),name+" is missing");
});
test("OS preview app uses existing server-side catalog authorization",()=>{
 assert.match(os,/blackcellmen:\{title:'BLACKCELL MEN · Prototype'/);
 assert.match(os,/url:'blackcell-men-prototype\.html\?v=/);
 assert.match(os,/if\(!storeRules\.has\(id\)\)continue/);
 assert.match(os,/function authorizedApp\(id\)/);
});


test("Gallery carousel and mobile navigation are implemented",()=>{
 assert.match(page,/id="featuredGallery"/);
 assert.match(page,/id="galleryRail"/);
 assert.match(page,/id="galleryPrev"/);
 assert.match(page,/id="galleryNext"/);
 assert.match(page,/function moveGallery\(dir\)/);
 assert.match(page,/scroll-snap-type:x mandatory/);
 assert.match(page,/class="mobile-dock"/);
 assert.match(page,/data-mobile="forums"/);
 assert.match(page,/function mobileNavigate\(to\)/);
});
test("Forum and new topic interactions are local-only demo",()=>{
 assert.match(page,/id="communityForums"/);
 assert.match(page,/id="forumGrid"/);
 assert.match(page,/id="newTopic"/);
 assert.match(page,/id="toggleForum"/);
 assert.match(page,/function renderForums\(\)/);
 assert.match(page,/function newTopic\(\)/);
 assert.match(page,/draftTopics\.unshift/);
 assert.match(page,/No message has been published/);
 assert.match(page,/fictional demonstration topics/);
});
