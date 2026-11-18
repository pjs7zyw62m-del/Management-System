import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createWorldVideoPreviews,readWorldVideoPoster,saveWorldVideoPoster} from "../blackcell-world-video-catalog.js";
const base=process.cwd();
const edge=readFileSync(base+"/supabase/functions/blackcell-world-media/index.ts","utf8");
const jpg=new Blob([new Uint8Array([255,216,255,...Array(110).fill(32),255,217])],{type:"image/jpeg"});
function harness(id="abc"){
 const originalWindow=globalThis.window;
 const originalFetch=globalThis.fetch;
 const calls=[];
 globalThis.window={BLACKCELL_CORP_CONFIG:{url:"https://test.supabase.co",publishableKey:"sb_publishable_test"},addEventListener(){}};
 const client={auth:{getSession:async()=>({data:{session:{access_token:"private-test",user:{id}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
 return {client,calls,patch(fn){globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return fn(url,opts)}},restore(){globalThis.window=originalWindow;globalThis.fetch=originalFetch}};
}
test("saved JPEG preview requires authentication and returns small binary",async()=>{
 const h=harness();
 try{
  h.patch(()=>new Response(jpg,{status:200,headers:{"Content-Type":"image/jpeg"}}));
  const image=await readWorldVideoPoster(h.client,"123e4567-e89b-12d3-a456-426614174000");
  assert.equal(image.size,jpg.size);
  assert.equal(h.calls.length,1);
  assert.match(h.calls[0].url,/action=poster$/);
  assert.equal(h.calls[0].opts.headers.Authorization,"Bearer private-test");
  assert.equal(h.calls[0].opts.cache,"no-store");
 }finally{h.restore()}
});
test("missing poster is recognized without downloading a video",async()=>{
 const h=harness("viewer");
 try{
  h.patch(()=>new Response(JSON.stringify({ok:false,code:"POSTER_MISSING"}),{status:404,headers:{"Content-Type":"application/json"}}));
  const image=await readWorldVideoPoster(h.client,"123e4567-e89b-12d3-a456-426614174000");
  assert.equal(image,null);
  const previews=createWorldVideoPreviews(h.client);
  const item={id:"123e4567-e89b-12d3-a456-426614174000",owner_id:"another-user",kind:"video"};
  await assert.rejects(previews.get(item),/Poster pending owner generation/);
  assert.equal(h.calls.length,2);
  assert.ok(h.calls.every(c=>c.url.includes("action=poster")));
  previews.clear();
 }finally{h.restore()}
});
test("cached posters deduplicate requests within a session",async()=>{
 const h=harness("owner");
 try{
  h.patch(()=>new Response(jpg,{status:200,headers:{"Content-Type":"image/jpeg"}}));
  const preview=createWorldVideoPreviews(h.client),a={id:"123e4567-e89b-12d3-a456-426614174000",owner_id:"owner",kind:"video"};
  const [x,y]=await Promise.all([preview.get(a),preview.get(a)]);
  assert.equal(x,y);
  assert.equal(await preview.get(a),x);
  assert.equal(h.calls.length,1);
  preview.clear();
 }finally{h.restore()}
});
test("poster upload uses private path and rejects invalid user input",async()=>{
 const h=harness("owner");
 try{
  h.patch(()=>new Response(JSON.stringify({ok:true,saved:true}),{status:200,headers:{"Content-Type":"application/json"}}));
  const id="123e4567-e89b-12d3-a456-426614174000";
  assert.equal(await saveWorldVideoPoster(h.client,id,jpg),true);
  assert.match(h.calls[0].url,/action=poster-write$/);
  assert.equal(h.calls[0].opts.headers["x-bc-media-id"],id);
  assert.equal(h.calls[0].opts.body,jpg);
  await assert.rejects(saveWorldVideoPoster(h.client,"../escape",jpg));
  await assert.rejects(saveWorldVideoPoster(h.client,id,new Blob(["bad"],{type:"image/jpeg"})));
 }finally{h.restore()}
});
test("edge poster routes enforce verified membership and owner-only private write",()=>{
 for(const pattern of [
  /if\(verify\.error\|\|verify\.data\?\.verified!==true\)/,
  /if\(asset\.owner_id!==uid\)return send\(403/,
  /asset\.review_status==="rejected"/,
  /x-bc-media-id/,
  /posterMax=512\*1024/,
  /Content-Type":posterType/,
  /response\.body/
 ])assert.match(edge,pattern);
});
test("Tube render prioritizes saved covers and no longer transcodes World videos repeatedly",()=>{
 const tube=readFileSync(base+"/corporate-network-videos.js","utf8");
 const queue=readFileSync(base+"/blackcell-upload-queue.html","utf8");
 assert.match(tube,/if\(cover\)\{/);
 assert.match(tube,/mountWorldPoster\(a,thumbnail\)/);
 assert.match(queue,/await createWorldVideoPoster\(j\.file\)/);
 assert.match(queue,/await saveWorldVideoPoster\(db,j\.asset_id,jpeg\)/);
});

test("watch sidebar can fetch a saved private JPEG while full-video previews are paused",async()=>{
 const h=harness("viewer");
 try{
  h.patch(()=>new Response(jpg,{status:200,headers:{"Content-Type":"image/jpeg"}}));
  const previews=createWorldVideoPreviews(h.client);
  const a={id:"123e4567-e89b-12d3-a456-426614174000",owner_id:"different-account",kind:"video"};
  previews.setPaused(true);
  await assert.rejects(previews.get(a),/Preview paused for playback/);
  const poster=await previews.get(a,{posterOnly:true});
  assert.ok(typeof poster==="string"&&poster.startsWith("blob:"));
  assert.equal(h.calls.length,1);
  assert.ok(h.calls[0].url.endsWith("action=poster"));
  assert.equal(previews.get(a) instanceof Promise,true);
  previews.clear();
 }finally{h.restore()}
});
test("missing saved poster in watch sidebar does not download full original",async()=>{
 const h=harness("owner");
 try{
  h.patch(()=>new Response(JSON.stringify({ok:false,code:"POSTER_MISSING"}),{status:404,headers:{"Content-Type":"application/json"}}));
  const previews=createWorldVideoPreviews(h.client);
  previews.setPaused(true);
  const a={id:"123e4567-e89b-12d3-a456-426614174000",owner_id:"owner",kind:"video"};
  await assert.rejects(previews.get(a,{posterOnly:true}),/Poster not generated yet/);
  assert.equal(h.calls.length,1);
  assert.ok(h.calls.every(c=>c.url.endsWith("action=poster")));
  previews.clear();
 }finally{h.restore()}
});
test("watch recommendations mount private posters without triggering legacy video downloads",()=>{
 const tube=readFileSync(base+"/corporate-network-videos.js","utf8");
 assert.match(tube,/function renderWatchRecommendations/);
 assert.match(tube,/else if\(isWorldVideo\(item\)\)/);
 assert.match(tube,/worldVideoPreviews\.mount\(item,img,\{posterOnly:true\}\)/);
 assert.match(tube,/function suspendBrowsePreviews\(\)/);
});
