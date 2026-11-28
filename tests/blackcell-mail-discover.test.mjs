import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const store=readFileSync('blackcell-app-store.js','utf8'),os=readFileSync('blackcell-os.js','utf8');
test('Mail is featured in both desktop and mobile Discover editorial feeds',()=>{
 assert.equal([...store.matchAll(/const preferred=\['photoledger','mail','personalphotos'/g)].length,2);
 assert.match(store,/\['photoledger','mail'\].includes\(a.id\)/);
 assert.match(os,/"title":"BLACKCELL Mail","sub":"Private corporate email"/);
});
test('Mail is not a fake planned entry and existing authorized catalog actions remain',()=>{
 assert.doesNotMatch(store,/\["mail","Mail","Connected email"/);
 assert.match(store,/a.allowed&&a.enabled!==false&&!a.planned&&!a.catalogUnavailable&&!isBeta\(a\)/);
 assert.match(store,/await perform\(\(\)=>api.install\(app.id,true\)/);
 assert.match(os,/blackcell-app-store.js\?v=20261128-uniform-category2/);
});
