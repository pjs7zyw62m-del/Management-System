import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const parent=readFileSync(new URL('../private-photo-ledger-developer-preview.js',import.meta.url),'utf8');
const frame=readFileSync(new URL('../private-photo-ledger-developer-frame.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../private-photo-ledger.html',import.meta.url),'utf8');
test('preview picker requests authorized room history directly',()=>{
 assert.match(frame,/action:'open-library'/);
 assert.match(parent,/a==='open-library'&&role==='sender'/);
 assert.match(parent,/await api.previousPreviewPhotos\(\)/);
 assert.match(parent,/snapshot\(\)\?\.roomId!==libraryRoom/);
 assert.match(parent,/setLibraryStatus\('empty'/);
 assert.doesNotMatch(frame,/const palettes=/);
});
test('reset clears temporary library and pending imports',()=>{
 assert.match(parent,/clearLibrary\(\);model=fresh\(\);broadcast\(\)/);
 assert.match(parent,/libraryRevision\+\+;testLibrary=\[\]/);
 assert.match(html,/developer-preview\.js\?v=20261124-preview-archive2/);
});
