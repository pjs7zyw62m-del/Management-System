import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORLDS,eligibleOmegaAsset,assetWorld,buildWorldDesk,makeChannel,proposeMissions,evidenceSummary} from '../blackcell-omega-core.js';
const sample=(id,fields={})=>({id,kind:'photo',purpose:'library',review_status:'approved',rights_confirmed:true,adult_restricted:false,
 caption:'Uniform detail',military_branch:'Marine Corps',military_category:'Military',military_country_code:'US',military_era:'1990s',
 created_at:'2026-11-16T19:00:00Z',...fields});
test('Seven named intelligence desks including overarching Uniform World',()=>{
 assert.equal(WORLDS.length,7);
 assert.deepEqual(WORLDS.map(w=>w.id),['all','military','police','fire','medical','security','professional']);
});
test('Screens unapproved media, missing rights, restricted content and paid film/TV',()=>{
 const safe=sample('safe');assert.equal(eligibleOmegaAsset(safe),true);
 for(const item of [
  {review_status:'pending'},{rights_confirmed:false},{adult_restricted:true},
  {kind:'video',video_category:'movie'},{kind:'video',video_category:'series'},
  {kind:'video',video_category:'tv'},{kind:'audio'},{purpose:'avatar'}
 ])assert.equal(eligibleOmegaAsset({...safe,...item}),false,JSON.stringify(item));
 assert.deepEqual(makeChannel([sample('safe'),sample('pending',{review_status:'pending'})]).map(a=>a.id),['safe']);
});
test('Correctly distinguishes the six uniform professions',()=>{
 const examples=[
  ['US Marines deployed','military'],
  ['Sheriff deputy uniform','police'],
  ['Firefighter turnout gear','fire'],
  ['EMS paramedic uniform','medical'],
  ['Corrections detention officer','security'],
  ['Commercial airline pilot uniform','professional']
 ];
 for(const [caption,world] of examples){const a=sample(world,{caption,military_category:'Unsorted',military_branch:null});assert.equal(assetWorld(a),world,caption)}
});
test('Atlas aggregates only eligible approved records without duplication',()=>{
 const a=[sample('a'),sample('b',{kind:'video',caption:'Police patrol',military_category:'Law Enforcement',military_branch:'Sheriff'}),
  sample('blocked',{review_status:'pending'})];
 const d=buildWorldDesk(a);assert.equal(d[0].count,2);assert.equal(d.find(w=>w.id==='military').photos,1);
 assert.equal(d.find(w=>w.id==='police').videos,1);
});
test('Mission suggestions are grounded in genuine counts and missing fields',()=>{
 const plan=proposeMissions([sample('a'),sample('b',{military_era:null}),sample('pending',{review_status:'pending',rights_confirmed:false})],null);
 assert.ok(plan.missions.some(m=>m.id==='rights'&&m.reason.includes('1 pending')));
 assert.ok(plan.missions.some(m=>m.id==='verify'&&m.reason.includes('1 approved')));
 assert.ok(plan.missions.some(m=>m.id==='video'));
 assert.equal(plan.desks.length,6);
});
test('Channel selection respects world and allows member-specific relevance',()=>{
 const a=sample('marines'),b=sample('fire',{military_category:'Firefighter',military_branch:null,caption:'Firefighter'});
 assert.deepEqual(makeChannel([a,b],'fire','photos',()=>0).map(x=>x.id),['fire']);
 assert.deepEqual(makeChannel([a,b],'all','mix',x=>x.id==='fire'?9:0).map(x=>x.id),['fire','marines']);
 assert.equal(evidenceSummary(sample('unknown',{military_era:null,military_branch:null,military_country_code:null})),'Classification needs review');
});
test('OMEGA authorization and private media access are mandatory',()=>{
 const ui=readFileSync('blackcell-omega.js','utf8');
 const sql=readFileSync('supabase/migrations/20261117111000_omega_live_private_cases.sql','utf8');
 const os=readFileSync('blackcell-os.js','utf8');
 assert.match(ui,/corporateAuthorize\(client\)/);
 assert.match(ui,/corp_code_status/);
 assert.match(ui,/corp_employee_code_status/);
 assert.match(ui,/corp_app_store/);
 assert.match(ui,/omega\?\.allowed\|\|!omega\?\.installed/);
 assert.match(ui,/createSignedUrls\(/);
 assert.match(ui,/rights_confirmed/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/i);
 assert.match(sql,/corp_private\.social_verified\(\)/);
 assert.match(sql,/rights_confirmed=true/);
 assert.match(sql,/adult_restricted=false/);
 assert.match(sql,/revoke all .* public,anon,authenticated/i);
 assert.match(os,/omega:\{title:'BLACKCELL OMEGA'/);
});
test('No paid inference, background scraping, or automatic media publication introduced',()=>{
 const src=readFileSync('blackcell-omega.js','utf8');
 assert.doesNotMatch(src,/functions\.invoke\(|edge_function|service_role|scrape\(|publish\(/i);
 assert.match(src,/signVideo\(/);
 assert.match(src,/stopPlayback\(/);
 assert.match(src,/screenWatch/);
 assert.match(src,/corp_omega_cases/);
});
