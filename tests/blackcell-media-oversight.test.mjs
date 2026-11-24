import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
const edge=read('supabase/functions/blackcell-media-oversight/index.ts');
const html=read('blackcell-media-oversight.html');
const ui=read('blackcell-media-oversight.js');
const admin=read('blackcell-administration-app.html');
const schema=read('supabase/migrations/20261122230000_blackcell_media_oversight_audit.sql');
const rpcs=read('supabase/migrations/20261122231000_blackcell_media_oversight_rpc.sql');
test('Level 7 only: authenticated, active owner, and verified corporate session on every request',()=>{
 assert.match(edge,/memberClient\.auth\.getUser\(jwt\)/);
 assert.match(edge,/\.eq\("user_id",actor\)\.maybeSingle\(\)/);
 assert.match(edge,/membership\.role!=="owner"/);
 assert.match(edge,/Number\(membership\.clearance_level\)!==7/);
 assert.match(edge,/membership\.active!==true/);
 assert.match(edge,/memberClient\.rpc\("corp_code_status"\)/);
 assert.match(edge,/verification\.verified!==true/);
 assert.doesNotMatch(edge,/user_metadata|raw_user_meta_data/);
 assert.match(ui,/access\.member\?\.role!=='owner'/);
 assert.match(ui,/Number\(access\.member\?\.clearance_level\)!==7/);
 assert.match(ui,/client\.rpc\('corp_code_status'\)/);
 assert.match(html,/<div id="workspace" hidden>/);
});
test('Scoped entirely to private Bunny Photos owned by selected member, never REDLINE',()=>{
 assert.match(edge,/ZONE="https:\/\/la\.storage\.bunnycdn\.com\/blackcell-media-vault\/blackcell-os-private-v1\/"/);
 assert.match(edge,/const isMedia=\(path:string\)=>\/\^Photos\\\//);
 assert.match(edge,/\.eq\("user_id",target\)\.like\("path","Photos\/%"\)/);
 assert.match(edge,/\.eq\("id",fileId\)\.eq\("user_id",target\)\.like\("path","Photos\/%"\)/);
 assert.doesNotMatch(edge,/corp_private_photo_messages|corp_private_photo_entries|corp_private_photo_rooms/);
 assert.doesNotMatch(ui,/BLACKCELL_BUNNY_STORAGE_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(html,/Not private REDLINE messages/);
});
test('Encrypted media decrypted on server only; thumbnails and full files require owner permission',()=>{
 assert.match(edge,/crypto\.subtle\.decrypt/);
 assert.match(edge,/new TextEncoder\(\)\s*\.encode\("blackcell-os-private-v1:"\+fileId\+":thumbnail-v1"\)/);
 assert.match(edge,/additionalData:aad\(fileId,index\)/);
 assert.match(edge,/if\(index===0\)await log\("read"/);
 assert.match(edge,/await log\("preview"/);
 assert.match(ui,/invoke\('preview'/);
 assert.match(ui,/invoke\('read'/);
 assert.match(ui,/for\(let i=0;i<pieces\.length;i\+=3\)/);
 assert.match(ui,/clearViewer/);
});
test('Permanent deletion requires explicit user intent and audit',()=>{
 assert.match(edge,/confirmation!=="DELETE"\|\|reason\.length<8\|\|reason\.length>500/);
 assert.match(edge,/await log\("delete_requested"/);
 assert.match(edge,/\.update\(\{state:"deleting"\}\)/);
 assert.match(edge,/bunny\("DELETE",fileId\+"\/"\)/);
 assert.match(edge,/\.delete\(\)\.eq\("id",fileId\)\.eq\("user_id",target\)/);
 assert.match(edge,/await log\("deleted"/);
 assert.match(edge,/await log\("delete_failed"/);
 assert.match(ui,/confirm:'DELETE'/);
 assert.match(html,/id="deleteReason"/);
 assert.match(html,/id="deleteConfirm"/);
 assert.match(html,/id="confirmDelete" disabled/);
 assert.match(html,/This permanently deletes/);
});
test('Private audit table and service-only RPC cannot be called by normal clients',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS corp_private\.blackcell_media_oversight_audit/);
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/);
 assert.match(schema,/REVOKE ALL ON corp_private\.blackcell_media_oversight_audit FROM PUBLIC,anon,authenticated/);
 assert.match(rpcs,/REVOKE ALL ON FUNCTION public\.corp_blackcell_media_oversight_record/);
 assert.match(rpcs,/GRANT EXECUTE ON FUNCTION public\.corp_blackcell_media_oversight_record/);
 assert.match(rpcs,/TO service_role/);
 assert.match(rpcs,/GRANT EXECUTE ON FUNCTION public\.corp_blackcell_media_oversight_recent\(\) TO service_role/);
 assert.match(ui,/loadAudit/);
});
test('Owner Administration is the only navigation link and member content is loaded on demand',()=>{
 assert.match(admin, /href="blackcell-media-oversight\.html"/);
 assert.match(admin,/OWNER ONLY · LEVEL 7/);
 assert.match(ui,/addEventListener\('change',\(\)=>void loadFiles\(\)\)/);
 assert.match(ui,/addEventListener\('click',\(\)=>void loadFiles\(true\)\)/);
 assert.doesNotMatch(ui,/setInterval/);
 assert.match(html,/id="gallery"/);
 assert.match(html,/id="auditRows"/);
});

test('Native BLACKCELL Administration sidebar exposes owner Media Oversight, not just hidden legacy cards',()=>{
 const native=read('blackcell-administration-os.js');
 const host=read('blackcell-administration-app.html');
 assert.match(native,/id:'oversight',label:'Media Oversight'/);
 assert.match(native,/id:'media'.*?\['Media Oversight'/);
 assert.match(native,/id:'overview'.*?\['Media Oversight'/);
 assert.match(native,/'blackcell-media-oversight\.html':'oversight'/);
 assert.match(native,/const allowed=new Set\(sections/);
 assert.match(host,/blackcell-administration-os\.js\?v=20261122-media-oversight-nav1/);
 const desktop=read('blackcell-os.js');
 assert.match(desktop,/blackcell-media-oversight/);
 const osHost=read('blackcell-os.html');
 assert.match(osHost,/adminMediaOversight=20261122-native-nav1/);
});

test('photo transfer requires source-owner permission and creates a reference, not another upload',()=>{assert.match(edge,/p_action:"transfer"/);assert.match(ui,/invoke\('transfer'/);assert.match(html,/id="transferPhoto"/);assert.match(ui,/blackcell-photo-permission.html/);});

test('authorized reference shares bytes but deleting a reference never deletes the Bunny original',()=>{
 const migration=read('supabase/migrations/20261124114514_blackcell_media_oversight_photo_permission.sql');
 const drive=read('supabase/functions/blackcell-os-private-drive/index.ts');
 assert.match(migration,/granted_by=p_target/);
 assert.match(migration,/source_object_id=src.id,state='ready'/);
 assert.match(migration,/ON DELETE CASCADE/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public.bc_os_photo_permission/);
 assert.match(drive,/mediaId=source.id;mediaKey=source.key_hex/);
 assert.match(drive,/bunny\("GET",mediaId,i\)/);
 assert.match(drive,/if\(row.source_object_id\)\{\s*if\(action==="delete"\)/);
});
