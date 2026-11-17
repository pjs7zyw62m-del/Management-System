import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBehavioralAffinity,rankWithDiversity} from '../blackcell-adaptive-ranker.js';
const asset=(id,category,branch,era='Modern')=>({
 id,kind:'photo',review_status:'approved',adult_restricted:false,
 military_category:category,military_branch:branch,military_era:era,
 military_country_code:'US'
});
test('strong explicit preferences teach the recommendation engine',()=>{
 const a=asset('a','Uniforms','Marines'),b=asset('b','Training','Army');
 const engine=buildBehavioralAffinity([a,b],[{asset_id:'a',reaction:'more',rating:5}],new Set(['a']),new Map());
 assert.ok(engine(a)>engine(b),'More and favorite should strongly favor linked labels');
});
test('explicit dislike outweighs passive long viewing',()=>{
 const a=asset('a','Uniforms','Marines'),b=asset('b','Training','Army');
 const engine=buildBehavioralAffinity([a,b],[{asset_id:'a',reaction:'less',rating:1}],new Set(),
  new Map([['a',{engaged_views:3,zoom_engaged_views:3,rediscovery_feedback:'dislike'}]]));
 assert.ok(engine(a)<engine(b));
});
test('passive engagement is evidence, not a vote, and is bounded',()=>{
 const a=asset('a','Uniforms','Marines'),b=asset('b','Training','Army');
 const engine=buildBehavioralAffinity([a,b],[],new Set(),
  new Map([['a',{engaged_views:100000,zoom_engaged_views:100000}]]));
 assert.ok(engine(a)>engine(b));assert.ok(engine(a)<=100);
});
test('unapproved and adult-restricted media do not train shared interests',()=>{
 const a=asset('a','Uniforms','Marines'),b=asset('b','Uniforms','Marines');
 a.review_status='pending';b.adult_restricted=true;
 const engine=buildBehavioralAffinity([a,b],[{asset_id:'a',reaction:'more'},{asset_id:'b',reaction:'more'}],new Set(),new Map());
 assert.equal(engine(asset('c','Uniforms','Marines')),0);
});
test('ranked results are stable, complete and not mutated',()=>{
 const source=[asset('a','Uniforms','Marines'),asset('b','Uniforms','Marines'),asset('c','Uniforms','Army'),asset('d','Uniforms','Navy')];
 const before=source.map(x=>x.id);
 const first=rankWithDiversity(source,()=>30);
 const second=rankWithDiversity(source,()=>30);
 assert.deepEqual(first.map(x=>x.id),second.map(x=>x.id));
 assert.deepEqual(source.map(x=>x.id),before);
 assert.equal(new Set(first.map(x=>x.id)).size,source.length);
 assert.ok(first[1].military_branch!=='Marines','Avoid adjacent repeated branch for ties');
});
test('algorithm updates only after confirmed feedback writes',()=>{
 const files=['corporate-photo-taste.js','corporate-photo-votes.js','corporate-network-photos.js',
  'corporate-photo-rediscovery.js','corporate-visual-discovery.js'];
 for(const file of files)assert.match(readFileSync(file,'utf8'),/bc:algorithm-signal/,file);
 const main=readFileSync('corporate-network-personalization.js','utf8');
 assert.match(main,/addEventListener\('bc:algorithm-signal'/);
 assert.match(main,/signalRefreshTimer=setTimeout/);
 assert.match(main,/rankWithDiversity/);
 assert.match(main,/if\(!state\.user\?\.id\|\|!enabled\(\)\)/);
});
test('no new autonomous AI billing or privacy bypass',()=>{
 const core=readFileSync('blackcell-adaptive-ranker.js','utf8');
 assert.doesNotMatch(core,/fetch\(|functions\.invoke\(|createSignedUrl\(/);
 assert.doesNotMatch(core,/facial|biometric|sexuality/i);
 const source=readFileSync('corporate-photo-rediscovery.js','utf8');
 assert.match(source,/const consent=\(\)=>/);
 assert.match(source,/const on=\(\)=>!paused/);
 assert.match(source,/document\.hidden/);
});
