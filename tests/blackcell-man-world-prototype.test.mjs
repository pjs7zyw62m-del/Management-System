import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync("blackcell-man-world-prototype.html","utf8");

test("BLACKCELL approved HTML is an isolated self-contained preview",()=>{
 assert.match(html,/<title>BLACKCELL Corporation — MAN WORLD · Design Preview<\/title>/);
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/BLACKCELL Corporation hexagonal emblem/);
 assert.match(html,/data:image\/webp;base64,/);
 assert.match(html,/EXPLORE THE WORLDS/);
 assert.match(html,/RESTRICTED LEVEL 04/);
 assert.doesNotMatch(html,/\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(|\bXMLHttpRequest\b/);
 assert.doesNotMatch(html,/service_role|process\.env/i);
});

test("Seven screenshot-approved uniform-world bubbles in exact order",()=>{
 const names=[...html.matchAll(/"id":"(?:military|law|fire|ems|corrections|pilot|uniform)","name":"([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(names,[
  "Military World","Law Enforcement World","Firefighter World",
  "Paramedic World","Corrections World","Airline Pilot World","Uniform World"
 ]);
 assert.equal(names.length,7);
 assert.match(html,/class="world-grid" id="worldGrid"/);
 assert.match(html,/const portrait=node\('span','world-portrait'\)/);
 assert.match(html,/\.world-portrait\{/);
 assert.match(html,/aspect-ratio:1/);
 assert.match(html,/border-radius:50%/);
 assert.match(html,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
});

test("Bubble selection uses a crimson ring and no checkmark",()=>{
 assert.match(html,/setAttribute\('aria-pressed',String\(selected\.has\(w\.id\)\)\)/);
 assert.match(html,/selected\.has\(w\.id\)\?selected\.delete\(w\.id\):selected\.add\(w\.id\)/);
 assert.match(html,/\.world\[aria-pressed=true\] \.world-portrait\{/);
 assert.match(html,/selected\.size/);
 assert.doesNotMatch(html,/const check=create\(|const check=node\(/);
});

test("Navigation, responsive worlds and meaningful preview controls",()=>{
 for(const id of ["enterTop","exploreTop","worldSearch","searchBtn","worldGrid","selectStrip","continueBtn","clearBtn","overlay","modalSelection","closeModal"]){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/function render\(\)/);
 assert.match(html,/function showHome\(\)/);
 assert.match(html,/function close\(\)/);
 assert.match(html,/@media\(max-width:1320px\)/);
 assert.match(html,/@media\(max-width:860px\)/);
 assert.match(html,/@media\(max-width:630px\)/);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(html,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/This prototype does not connect to live data/);
});

test("Embedded JavaScript parses",()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1]));
});


test("MAN WORLD silver/crimson headline preserves full italic N and D glyphs",()=>{
 assert.match(html,/HEADLINE GLYPH SAFETY FIX/);
 assert.match(html,/<h1><span class="silver">MAN<\/span> <span class="crimson">WORLD<\/span><\/h1>/);
 assert.match(html,/\.hero h1 \.silver,\.hero h1 \.crimson\{/);
 assert.match(html,/display:inline-block;/);
 assert.match(html,/padding:\.10em \.115em \.10em \.115em;/);
 assert.match(html,/letter-spacing:-\.036em!important;/);
 assert.match(html,/@media\(max-width:365px\)\{\.hero h1\{font-size:clamp\(34px,11vw,43px\)!important\}\}/);
});


test("MAN WORLD 8.0 title uses non-italic skewed words with unclipped N and D",()=>{
 assert.match(html,/MAN WORLD 8\.0 \/ FULL GLYPH FIX/);
 assert.match(html,/\.hero-words h1\{/);
 assert.match(html,/font-style:normal!important;letter-spacing:0!important;/);
 assert.match(html,/\.hero-words h1 \.silver,\.hero-words h1 \.crimson\{/);
 assert.match(html,/transform:skewX\(-8deg\)/);
 assert.match(html,/padding:\.055em \.13em \.065em \.13em!important;/);
 assert.match(html,/overflow:visible!important;/);
 assert.match(html,/@media\(max-width:630px\)\{\.hero-words h1\{/);
});
