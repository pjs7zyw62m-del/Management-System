import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const parent=readFileSync(new URL('../private-photo-ledger-developer-preview.js',import.meta.url),'utf8');
const frame=readFileSync(new URL('../private-photo-ledger-developer-frame.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../blackcell-developer-preview.html',import.meta.url),'utf8');
test('preview picker requests authorized room history directly',()=>{
 assert.match(frame,/action:'open-library'/);
 assert.match(parent,/a==='open-library'&&role==='sender'/);
 assert.match(parent,/await api.previousPreviewPhotos\(\{onBatch:publishBatch,isCurrent:current\}\)/);
 assert.match(parent,/snapshot\(\)\?\.roomId!==libraryRoom/);
 assert.match(parent,/setLibraryStatus\('empty'/);
 assert.doesNotMatch(frame,/const palettes=/);
});
test('reset clears temporary library and pending imports',()=>{
 assert.match(parent,/clearLibrary\(\);model=fresh\(\);broadcast\(\)/);
 assert.match(parent,/libraryRevision\+\+;testLibrary=\[\]/);
 assert.match(html,/developer-preview\.js\?v=20261124-desktop1/);
});

test('archive picker progressively renders batches without clearing existing selections',()=>{
 assert.match(frame,/samePrefix/);
 assert.match(parent,/setLibraryStatus\('loading',images.length/);
 const core=readFileSync(new URL('../private-photo-ledger.js',import.meta.url),'utf8');
 assert.match(core,/fetch\(cached.url\)/);
 assert.match(core,/Promise.all\(rows.slice/);
 assert.match(core,/await onBatch\(valid\)/);
});

test('owner-only desktop preview is separate from live ledger and loads a read-only archive bridge',()=>{const os=readFileSync(new URL('../blackcell-os.js',import.meta.url),'utf8'),ledger=readFileSync(new URL('../private-photo-ledger.html',import.meta.url),'utf8'),bridge=readFileSync(new URL('../blackcell-developer-preview-access.js',import.meta.url),'utf8');assert.match(os,/id==='developerpreview'\)return !preview&&active&&owner&&!leaving/);assert.doesNotMatch(ledger,/src="private-photo-ledger-developer-preview.js/);assert.match(bridge,/corp_code_status/);assert.match(bridge,/\.eq\('owner_id',uid\)/);assert.doesNotMatch(bridge,/\.insert\(|\.update\(|\.delete\(/);});

test('Developer Preview is a built-in owner-only desktop and dock shortcut even when App Store catalog is unavailable',()=>{const os=readFileSync(new URL('../blackcell-os.js',import.meta.url),'utf8'),html=readFileSync(new URL('../blackcell-os.html',import.meta.url),'utf8');assert.match(html,/data-app="developerpreview" data-admin-only="true"/);assert.match(html,/data-open="developerpreview" data-admin-only="true"/);assert.match(os,/active=true;syncStore\(\);last=/);assert.match(os,/if\(id==='developerpreview'\)return !preview&&active&&owner&&!leaving/);});
