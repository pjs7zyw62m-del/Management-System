import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBehavioralAffinity} from '../blackcell-adaptive-ranker.js';
import {createWorldAlgorithm} from '../blackcell-world-algorithm.js';

const video=(id,branch)=>({id,kind:'video',purpose:'library',
 review_status:'approved',adult_restricted:false,military_category:'Uniforms',
 military_branch:branch,military_era:'Modern',military_country_code:'US'});

test('video reactions and playback boost same-service recommendations',()=>{
 const a=video('a','Marines'),b=video('b','Army');
 const positive=buildBehavioralAffinity([a,b],[],new Set(),new Map(),
  new Map([['a',{reaction:'more',engaged_views:2}]]));
 assert.ok(positive(a)>positive(b));
 const negative=buildBehavioralAffinity([a,b],[],new Set(),new Map(),
  new Map([['a',{reaction:'less',engaged_views:3}]]));
 assert.ok(negative(a)<negative(b));
});

test('video feedback from unapproved media is excluded from learning',()=>{
 const a=video('a','Marines');a.review_status='pending';
 const affinity=buildBehavioralAffinity([a],[],new Set(),new Map(),new Map([['a',{reaction:'more'}]]));
 assert.equal(affinity(video('other','Marines')),0);
});

test('Seven Worlds ranking honors private preferences and remains deterministic',async()=>{
 const contents={
  corp_social_photo_tastes:[],
  corp_social_photo_favorites:[],
  corp_social_photo_rediscovery:[],
  corp_social_video_interest:[{asset_id:'video-1',reaction:'more',engaged_views:2}]
 };
 const client={from:name=>({
  select(){return this},eq(){return this},
  maybeSingle:async()=>({data:{enabled:true,rediscovery_enabled:true},error:null}),
  limit:async()=>({data:contents[name]||[],error:null})
 })};
 const algorithm=createWorldAlgorithm({client,getUser:()=>({id:'member-1'}),
  getCurrent:()=>null,dialog:null,image:null,video:null});
 await algorithm.load();
 const assets=[video('video-2','Army'),video('video-1','Marines'),video('video-3','Air Force')];
 const first=algorithm.rank(assets),second=algorithm.rank(assets);
 assert.equal(first[0].id,'video-1');
 assert.deepEqual(first.map(x=>x.id),second.map(x=>x.id));
 assert.deepEqual(assets.map(x=>x.id),['video-2','video-1','video-3']);
});

test('without explicit member opt-in, World sorting remains unchanged',async()=>{
 const client={from:()=>({
  select(){return this},eq(){return this},
  maybeSingle:async()=>({data:{enabled:false,rediscovery_enabled:false},error:null})
 })};
 const algorithm=createWorldAlgorithm({client,getUser:()=>({id:'member-1'}),
  getCurrent:()=>null,dialog:null,image:null,video:null});
 await algorithm.load();
 const a=video('a','Army'),b=video('b','Marines');
 assert.deepEqual(algorithm.rank([a,b]),[a,b]);
 assert.equal(algorithm.enabled(),false);
});

test('camera/gallery integration records only authorized, actively viewed media',()=>{
 const source=readFileSync('blackcell-world-algorithm.js','utf8');
 assert.match(source,/corp_record_photo_rediscovery_view/);
 assert.match(source,/corp_record_photo_rediscovery_engagement/);
 assert.match(source,/corp_record_video_engagement/);
 assert.match(source,/video\.paused\|\|video\.seeking/);
 assert.match(source,/if\(delta<=0\|\|delta>2\)return/);
 assert.match(source,/if\(!allowed\(a\)\|\|!passiveOn\(\)\)return/);
 assert.match(source,/photoTimer=setInterval/);
 assert.match(source,/if\(row\?\.reaction==='less'\)/);
 assert.doesNotMatch(source,/functions\.invoke\(|OPENAI_API_KEY|payment|fetch\(/);
});

test('RLS protects new video interest records and no anonymous mutation is possible',()=>{
 const sql=readFileSync('supabase/migrations/20261117_seven_worlds_video_interest.sql','utf8');
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/revoke all on table .* public,anon,authenticated/i);
 assert.match(sql,/grant select,insert,update,delete .* authenticated/i);
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/corp_private\.social_verified\(\)/);
 assert.match(sql,/a\.review_status='approved'/);
 assert.match(sql,/a\.adult_restricted=false/);
 assert.match(sql,/security invoker/i);
 assert.match(sql,/revoke all on function .* from public,anon/i);
});

test('Every Seven Worlds page loads the updated signed-in algorithm',()=>{
 const pages=['mans-armed-forces.html','military-world.html','law-enforcement-world.html',
  'fire-rescue-world.html','ems-world.html','corrections-world.html',
  'aviation-world.html','uniform-world.html'];
 for(const page of pages){
  assert.match(readFileSync(page,'utf8'),/mans-armed-forces\.js\?v=20261117-sevenworlds-r1/,page);
 }
 const src=readFileSync('mans-armed-forces.js','utf8');
 assert.match(src,/worldAlgorithm\.mount\(\)/);
 assert.match(src,/worldAlgorithm\.open\(a\)/);
 assert.match(src,/worldAlgorithm\.close\(\)/);
 assert.match(src,/worldAlgorithm\.rank\(approved\.filter\(matches\)\)/);
 const personal=readFileSync('corporate-network-personalization.js','utf8');
 assert.match(personal,/corp_social_video_interest/);
 assert.match(personal,/videoSignals/);
});
