import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const js=read('private-photo-ledger.js');
const transport=read('private-photo-ledger-bunny.js');
const server=read('supabase/functions/blackcell-redline-bunny/index.ts');
const policy=read('supabase/migrations/20261122014500_redline_bunny_private_photo_path.sql');
const html=read('private-photo-ledger.html');
const sender=read('private-photo-ledger-simple-sender.js');
const preview=read('private-photo-ledger-owner-preview.js');
const consent=read('private-photo-ledger-consent-negotiation.js');
const room='00000000-0000-4000-8000-000000000001';
const member='00000000-0000-4000-8000-000000000002';
const photo='00000000-0000-4000-8000-000000000003';

function instrument(mockFetch,session={access_token:'verified-user-jwt'}){
 const state={calls:[]};
 const env={
  window:{BLACKCELL_CORP_CONFIG:{url:'https://example.supabase.co',
   publishableKey:'test-public-key'}},
  URL,Blob,
  fetch:async(url,options)=>{
   state.calls.push({url,options});
   return await mockFetch(url,options);
  }
 };
 const transform=transport.replace(/^export /gm,'')+
  '\n({isBunnyPath,uploadBunnyPhoto,readBunnyPhoto,cleanupUnpostedBunny})';
 const api=runInNewContext(transform,env);
 const db={supabaseUrl:'https://example.supabase.co',supabaseKey:'test-public-key',
  auth:{getSession:async()=>({data:{session},error:null})}};
 return {...api,db,state};
}
function success(obj){
 return {ok:true,json:async()=>obj,
  blob:async()=>new Blob(['ABC'],{type:'image/jpeg'})};
}
test('REDLINE fresh uploads no longer send any bytes to Supabase Storage',()=>{
 assert.match(js,/await uploadBunnyPhoto\(db,room.id,state.user.id,id,file,info.mime\)/);
 assert.match(js,/await uploadBunnyPhoto\(db,room.id,state.user.id,id,blob,mime\)/);
 assert.match(js,/image_path:path,decision_status:'pending'/);
 assert.match(js,/image_path:newPath/);
 assert.doesNotMatch(js,/\.storage\.from\(BUCKET\)\.upload\(/);
 assert.doesNotMatch(js,/\.storage\.from\(BUCKET\)\.remove\(/);
 assert.match(js,/await cleanupUnpostedBunny\(db,room.id,id\)/);
 assert.match(js,/await cleanupUnpostedBunny\(db,room.id,resubmitId\)/);
});
test('verified user uploads 3-byte private Bunny file, with correct path and no server secret',async()=>{
 const path='redline/v1/'+room+'/'+member+'/'+photo+'.jpg';
 const x=instrument(async()=>success({ok:true,photo_id:photo,path,bytes:3,
  provider:'bunny-redline-v1'}));
 const b=new Blob(['XYZ'],{type:'image/jpeg'});
 const uploaded=await x.uploadBunnyPhoto(x.db,room,member,photo,b,'image/jpeg');
 assert.equal(uploaded,path);
 assert.equal(x.state.calls.length,1);
 const request=x.state.calls[0];
 assert.equal(new URL(request.url).pathname,'/functions/v1/blackcell-redline-bunny');
 assert.equal(new URL(request.url).searchParams.get('action'),'upload');
 assert.equal(request.options.headers.Authorization,'Bearer verified-user-jwt');
 assert.equal(request.options.headers.apikey,'test-public-key');
 assert.equal(request.options.headers['x-bc-room'],room);
 assert.equal(request.options.headers['x-bc-photo-id'],photo);
 assert.equal(request.options.headers['Content-Type'],'image/jpeg');
 assert.equal(request.options.body,b);
 assert.equal(JSON.stringify(request.options).includes('AccessKey'),false);
 assert.equal(JSON.stringify(request.options).includes('la.storage.bunnycdn.com'),false);
});
test('client rejects untrusted Bunny path, wrong byte count and unavailable user JWT',async()=>{
 for(const data of [
  {ok:true,path:'redline/v1/'+room+'/'+member+'/WRONG.jpg',photo_id:photo,bytes:3},
  {ok:true,path:'redline/v1/'+room+'/'+member+'/'+photo+'.jpg',photo_id:photo,bytes:2}
 ]){
  const x=instrument(async()=>success(data));
  await assert.rejects(x.uploadBunnyPhoto(x.db,room,member,photo,
   new Blob(['ABC'],{type:'image/jpeg'}),'image/jpeg'),/Bunny did not confirm/);
 }
 const y=instrument(async()=>{throw Error('should not reach network')},null);
 await assert.rejects(y.readBunnyPhoto(y.db,room,photo),/Sign in/);
 assert.equal(y.state.calls.length,0);
});
test('private reads return blob for display; no public Bunny CDN download URL',async()=>{
 const x=instrument(async()=>success({ok:true}));
 const data=await x.readBunnyPhoto(x.db,room,photo);
 assert.equal(data.size,3);
 assert.equal(x.state.calls.length,1);
 assert.equal(new URL(x.state.calls[0].url).searchParams.get('action'),'read');
 assert.equal(JSON.parse(x.state.calls[0].options.body).photo_id,photo);
 assert.match(js,/URL\.createObjectURL\(data\)/);
 assert.match(js,/URL\.revokeObjectURL\(image.url\)/);
 assert.match(js,/isBunnyPath\(e.image_path\)/);
 assert.match(js,/const legacy=needed.filter\(e=>!isBunnyPath\(e.image_path\)\)/);
});
test('backend restricts Bunny reads to verified two-party room members, writes to sender',()=>{
 assert.match(server,/verify_jwt|authorization/i);
 assert.match(server,/db\.auth\.getUser\(jwt\)/);
 assert.match(server,/room\.owner_id!==uid&&room\.member_id!==uid/);
 assert.match(server,/corp_code_status/);
 assert.match(server,/corp_employee_code_status/);
 assert.match(server,/uid!==room\.member_id\|\|!room\.active\|\|room\.photo_sending_paused/);
 assert.match(server,/db\.from\("corp_private_photo_entries"\)/);
 assert.match(server,/\.eq\("id",photoId\)\.eq\("room_id",roomId\)/);
 assert.match(server,/return reply\(origin,404,"PRIVATE_PHOTO_NOT_FOUND"\)/);
 assert.match(server,/if\(entry\)return reply\(origin,409,"PHOTO_ALREADY_RECORDED"\)/);
 assert.match(server,/const prefix="redline\/v1\/"/);
 assert.match(server,/req\.headers\.get\("content-type"\)/);
 assert.match(server,/hasPhotoMagic\(bytes,mime\)/);
 assert.match(server,/const maxBytes=12\*1024\*1024/);
 assert.match(server,/Cache-Control":"private, no-store/);
 assert.doesNotMatch(server,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(server,/ACCESS_KEY=["']/);
});
test('REDLINE sender, timer, top picks and receiver owner preview accept private blob URLs',()=>{
 assert.match(sender,/photo\.image_url\.startsWith\('blob:'\)/);
 assert.match(sender,/url\.startsWith\('blob:'\)/);
 assert.match(preview,/photo\.image_url\.startsWith\('blob:'\)/);
 assert.match(preview,/p\.image_url\.startsWith\('blob:'\)/);
 assert.match(consent,/p\.image_url\.startsWith\('blob:'\)/);
});
test('HTML loads versioned fresh Bunny cutover and private helper module',()=>{
 assert.match(html,/private-photo-ledger\.js\?v=[^"]+bunny-cutover1/);
 assert.match(js,/from '\.\/private-photo-ledger-bunny\.js\?v=20261121-redline-bunny1'/);
 assert.match(transport,/blackcell-redline-bunny/);
 assert.doesNotMatch(transport,/https:\/\/la\.storage\.bunnycdn\.com/);
});

test('Bunny image metadata is accepted by row security only for assigned verified senders',()=>{
 assert.match(policy,/ADD CONSTRAINT corp_photo_path_format CHECK/);
 assert.match(policy,/CREATE POLICY corp_photo_entries_member_bunny_upload/);
 assert.match(policy,/corp_private\.photo_ledger_verified\(\)/);
 assert.match(policy,/uploaded_by = \(SELECT auth\.uid\(\)\)/);
 assert.match(policy,/r\.member_id = \(SELECT auth\.uid\(\)\)/);
 assert.match(policy,/r\.photo_sending_paused IS NOT TRUE/);
 assert.match(policy,/image_path ~ \(/);
 assert.match(policy,/redline\/v1\//);
 assert.match(policy,/decision_status = 'pending'/);
 assert.ok(policy.includes("id::text || '[.](jpg|png|webp|heic|heif)
 assert.match(policy,/No archived photos are deleted or altered/);
});
"));
 assert.match(policy,/No archived photos are deleted or altered/);
});
