import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('BLACKCELL media has a same-domain static entrypoint',()=>{
 const page=text('media/index.html');
 assert.match(page, /\.\.\/corp-config\.js/);
 assert.match(page, /\.\.\/corporate-photos-original\.js/);
 assert.match(page, /noindex,nofollow,noarchive/);
 assert.match(page, /no-referrer/);
 assert.match(page, /\.\.\/corporate-network\.html/);
});
test('Photos opens private branded media route rather than raw storage',()=>{
 const photos=text('corporate-network-photos.js');
 assert.match(photos, /anchor\.href='media\/\?id='\+encodeURIComponent\(a\.id\)/);
 assert.doesNotMatch(photos, /anchor\.href='https?:\/\//);
});
test('Viewer authenticates and supports private World Bunny and Supabase originals',()=>{
 const viewer=text('corporate-photos-original.js');
 assert.match(viewer,/corporateAuthorize\(client\)/);
 assert.match(viewer,/corp_employee_code_status/);
 assert.match(viewer,/corp_code_status/);
 assert.match(viewer,/bunnyReader\.original\(a\)/);
 assert.match(viewer,/storage\.createSignedUrl\(a\.storage_path,300\)/);
 assert.match(viewer,/if\(generation!==showGeneration\)\{URL\.revokeObjectURL\(src\);return\}/);
 assert.match(viewer,/window\.addEventListener\('pagehide',releaseSource\)/);
 assert.doesNotMatch(viewer,/la\.storage\.bunnycdn\.com/);
});
test('Versioned imports load the updated viewer and Photos link',()=>{
 assert.match(text('corporate-network.html'),/corporate-network\.js\?v=20261118-branded-media1/);
 assert.match(text('corporate-network.js'),/corporate-network-photos\.js\?v=20261118-branded-media1/);
 assert.match(text('corporate-photos-original.html'),/corporate-photos-original\.js\?v=20261118-branded-media1/);
});
