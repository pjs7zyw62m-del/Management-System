import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const file=n=>readFileSync(n,'utf8');
const js=file('private-photo-ledger.js');
const transport=file('private-photo-ledger-bunny.js');
const server=file('supabase/functions/blackcell-redline-bunny/index.ts');
const sql=file('supabase/migrations/20261122050000_redline_owner_permanent_media_removal.sql');
const html=file('private-photo-ledger.html');
const css=file('private-photo-ledger-delete.css');
const room='00000000-0000-4000-8000-000000000001';
const photo='00000000-0000-4000-8000-000000000002';

test('receiver has separate permanent-delete controls in active review and photo history',()=>{
 assert.match(js,/function confirmPermanentPhotoDeletion\(entry\)/);
 assert.match(js,/async function deletePhotoPermanently\(entry\)/);
 assert.match(js,/const card=node\('article','photo-entry'\)/);
 assert.match(js,/DELETE PHOTO PERMANENTLY/);
 assert.match(js,/rr-permanent-delete-button/);
 assert.match(js,/redline-photo-delete-button/);
 assert.match(js,/state\.isOwner/);
 assert.match(js,/if\(!await confirmPermanentPhotoDeletion\(entry\)\)return null/);
 assert.match(html,/redlinePurgeConfirm/);
 assert.match(html,/DELETE FROM SERVER/);
 assert.match(html,/Type <strong>DELETE<\/strong>/);
 assert.match(js,/input\.value\.trim\(\)==='DELETE'/);
 assert.match(css,/redline-purge-confirm/);
 assert.match(html,/private-photo-ledger-delete\.css\?v=20261122-permanent-delete1/);
});

test('authenticated delete request targets private function, never Bunny Storage API',async()=>{
 const calls=[];
 const mock={
  window:{BLACKCELL_CORP_CONFIG:{}},
  URL,Blob,
  fetch:async(url,options)=>{
   calls.push({url,options});
   return {ok:true,json:async()=>({ok:true,status:'removed',photo_id:photo})};
  }
 };
 const exposed=runInNewContext(transport.replace(/^export /gm,'')+
  '\n({deleteRedlinePhotoFile})',mock);
 const client={supabaseUrl:'https://project.supabase.co',supabaseKey:'publishable-test',
  auth:{getSession:async()=>({data:{session:{access_token:'signed-in-test'}},error:null})}};
 assert.deepEqual(JSON.parse(JSON.stringify(await exposed.deleteRedlinePhotoFile(client,room,photo))),
  {ok:true,status:'removed',photo_id:photo});
 assert.equal(calls.length,1);
 assert.equal(new URL(calls[0].url).pathname,'/functions/v1/blackcell-redline-bunny');
 assert.equal(new URL(calls[0].url).searchParams.get('action'),'delete');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-in-test');
 assert.equal(JSON.parse(calls[0].options.body).photo_id,photo);
 assert.doesNotMatch(JSON.stringify(calls),/AccessKey|la\.storage\.bunnycdn\.com/);
});

test('no unsigned user can trigger a permanent deletion',async()=>{
 let reached=false;
 const vm=runInNewContext(transport.replace(/^export /gm,'')+'\n({deleteRedlinePhotoFile})',{
  window:{BLACKCELL_CORP_CONFIG:{}},URL,Blob,
  fetch:async()=>{reached=true;throw Error('network should not be used')}
 });
 const db={auth:{getSession:async()=>({data:{session:null},error:null})}};
 await assert.rejects(vm.deleteRedlinePhotoFile(db,room,photo),/Sign in/);
 assert.equal(reached,false);
});

test('server enforces verified receiver, Bunny DELETE and read-blocking tombstone',()=>{
 assert.match(server,/if\(uid!==room\.owner_id\)return reply\(origin,403,"RECEIVER_ONLY_DELETE"\)/);
 assert.match(server,/corp_redline_photo_remove_begin/);
 assert.match(server,/const removed=await bunny\(path,accessKey,"DELETE"\)/);
 assert.match(server,/BUNNY_DELETE_NOT_CONFIRMED_RETRY/);
 assert.match(server,/corp_redline_photo_remove_finish/);
 assert.match(server,/corp_redline_photo_removal_check/);
 assert.match(server,/if\(guard\.data\.blocked===true\)return reply\(origin,410,"PHOTO_PERMANENTLY_REMOVED"\)/);
 assert.ok(server.indexOf('corp_redline_photo_remove_begin')<
   server.indexOf('const removed=await bunny(path,accessKey,"DELETE")'));
 assert.ok(server.indexOf('const removed=await bunny(path,accessKey,"DELETE")')<
   server.indexOf('corp_redline_photo_remove_finish'));
 assert.ok(server.indexOf('corp_redline_photo_removal_check')<
   server.indexOf('const file=await bunny(entry.image_path,accessKey,"GET")'));
});

test('owner tombstones and background payment records survive media removal',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS corp_private\.redline_photo_removals/);
 assert.match(sql,/ALTER TABLE corp_private\.redline_photo_removals ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON corp_private\.redline_photo_removals FROM public,anon,authenticated/);
 assert.match(sql,/corp_private\.photo_ledger_verified\(\)/);
 assert.match(sql,/corp_private\.is_owner\(v_user\)/);
 assert.match(sql,/v_room\.owner_id<>v_user/);
 assert.match(sql,/stop_running_timer_before_deleting/);
 assert.match(sql,/SET removed_at=COALESCE\(removed_at,clock_timestamp\(\)\)/);
 assert.match(sql,/IF v_entry\.decision_status='pending' THEN/);
 assert.match(sql,/decision_status='rejected'/);
 assert.match(sql,/This private photograph has been permanently removed/);
 assert.match(sql,/CREATE TRIGGER redline_no_removed_timer/);
 assert.match(sql,/CREATE TRIGGER redline_no_removed_timer_request/);
 assert.match(sql,/CREATE TRIGGER redline_no_removed_resubmission/);
 assert.doesNotMatch(sql,/DELETE FROM (?:public\.)?corp_private_photo_entries/i);
 assert.match(js,/Financial history retained/);
 assert.match(js,/deleteRedlinePhotoFile\(db,roomId,photoId\)/);
 assert.match(js,/RETRY SERVER DELETION/);
});

test('both participants stop rendering removed files, captions, ratings and photo previews',()=>{
 assert.match(js,/corp_redline_photo_removal_status/);
 assert.match(js,/e\.photo_removal_status=removals\.get\(e\.id\)\|\|null/);
 assert.match(js,/URL\.revokeObjectURL\(previous\.url\)/);
 assert.match(js,/const needed=items\.filter\(e=>!e\.photo_removal_status/);
 assert.match(js,/if\(e\.photo_removal_status\)/);
 assert.match(js,/PERMANENTLY REMOVED/);
 assert.match(js,/image_url:e\.photo_removal_status\?'':/);
 assert.match(js,/resubmissionStatus=e\.photo_removal_status\?'removed'/);
 assert.match(js,/topPicks:state\.entries\.filter\(e=>!e\.photo_removal_status/);
 assert.match(js,/ratingEvents:state\.entries\.filter\(e=>!e\.photo_removal_status/);
});
