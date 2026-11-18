import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {tubeCommentTarget} from "../blackcell-tube-comments.js";
const UUID1="123e4567-e89b-12d3-a456-426614174000";
const UUID2="223e4567-e89b-12d3-a456-426614174001";
test("World videos without posts have their own secure comment thread",()=>{
 assert.deepEqual(tubeCommentTarget({id:UUID1,kind:"video",purpose:"library",source_provider:"world-bunny-v1"}),
  {table:"corp_tube_video_comments",field:"asset_id",id:UUID1});
});
test("Stream movies and series have a unique thread keyed by Stream id",()=>{
 assert.deepEqual(tubeCommentTarget({id:UUID2,kind:"video",bunny_stream:true}),
  {table:"corp_tube_video_comments",field:"stream_video_id",id:UUID2});
});
test("Existing post-linked videos keep existing Network comments",()=>{
 assert.deepEqual(tubeCommentTarget({id:UUID1,kind:"video",post_id:UUID2}),
  {table:"corp_social_comments",field:"post_id",id:UUID2});
});
test("Video-only routing does not assign threads to photographs or invalid records",()=>{
 assert.equal(tubeCommentTarget({id:UUID1,kind:"photo"}),null);
 assert.equal(tubeCommentTarget({id:"../escape",kind:"video"}),null);
 assert.equal(tubeCommentTarget(null),null);
});
test("Tube comments are enabled on standalone video playback",()=>{
 const vid=readFileSync("corporate-network-videos.js","utf8");
 const net=readFileSync("corporate-network.js","utf8");
 assert.match(vid,/const available=Boolean\(a\?\.id&&loadVideoComments&&addVideoComment\)/);
 assert.match(vid,/field\.disabled=!available;submit\.disabled=!available/);
 assert.match(vid,/if\(!a\?\.id\|\|!body\|\|commentBusy\|\|!addVideoComment\)return/);
 assert.doesNotMatch(vid,/if\(!a\.post_id\|\|!loadVideoComments\)/);
 assert.match(net,/const target=tubeCommentTarget\(a\)/);
 assert.match(net,/\.eq\(target\.field,target\.id\)/);
 assert.match(net,/\.insert\(\{\[target\.field\]:target\.id,user_id:state\.user\.id,body:body\.trim\(\)\}\)/);
});
