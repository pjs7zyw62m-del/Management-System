import assert from "node:assert/strict";
import {test} from "node:test";
import {omegaClueLabels,omegaRelated,omegaSurprise,omegaSourceTerms,omegaPublicUrl} from "../blackcell-omega-unified.js";
const air={id:"air",kind:"photo",military_country_code:"US",military_branch:"Air Force",military_era:"1980s"};
const wing={id:"wing",kind:"photo",military_country_code:"US",military_branch:"Air Force",military_era:"Unspecified"};
const navy={id:"navy",kind:"photo",military_country_code:"GB",military_branch:"Navy",military_era:"2000s"};
test("clues are based only on known catalog fields",()=>{
 assert.deepEqual(omegaClueLabels(air).map(x=>x.label),["Country","Branch","Era"]);
 assert.equal(omegaClueLabels(wing).length,2);
 assert.deepEqual(omegaClueLabels(null),[]);
});
test("related discoveries exclude source and rank verified-label overlap",()=>{
 const found=omegaRelated(air,[air,navy,wing],()=> "military");
 assert.equal(found.length,2);
 assert.equal(found[0].item.id,"wing");
 assert.ok(found[0].shared.includes("Branch"));
 assert.equal(omegaRelated(air,[air],()=> "military").length,0);
});
test("surprise does not choose active item if alternatives exist",()=>{
 assert.equal(omegaSurprise([air,wing],air.id,[air.id])?.id,"wing");
 assert.equal(omegaSurprise([air],air.id)?.id,"air");
 assert.equal(omegaSurprise([],air.id),null);
});
test("public source links are strictly allowlisted",()=>{
 assert.ok(omegaPublicUrl("https://commons.wikimedia.org/wiki/File:Test"));
 assert.equal(omegaPublicUrl("http://commons.wikimedia.org/wiki/File:Test"),null);
 assert.equal(omegaPublicUrl("https://evil.example/image.png"),null);
 assert.equal(omegaPublicUrl("https://commons.wikimedia.org.evil.example/img"),null);
 assert.ok(omegaSourceTerms("professional").includes("pilot"));
});
