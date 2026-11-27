// Node 18+; run with --write to regenerate the ordered CSS bundles, or
// without arguments to fail if a source changed without regeneration.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const bundles=[
 ['private-photo-ledger.html','private-photo-ledger-core-base.css',38],
 ['private-photo-ledger.html','private-photo-ledger-core-features.css',12],
 ['blackcell-os.html','blackcell-os-core.css',14],
 ['corporate-chat.html','corporate-chat-core.css',12]
];
const write=process.argv.includes('--write');
for(const [page,bundle,count] of bundles){
 const previous=readFileSync(bundle,'utf8');
 const sources=[...previous.matchAll(/\/\* Source: (.*?) \*\//g)].map(m=>m[1]);
 assert.equal(sources.length,count,bundle+' source count');
 assert.equal(new Set(sources).size,count,bundle+' duplicate source');
 const html=readFileSync(page,'utf8');
 assert.ok(html.includes('href="'+bundle+'?'),bundle+' is not loaded');
 for(const source of sources){
  const path=source.split('?')[0];
  assert.match(path,/^[a-z0-9-]+\.css$/);
  assert.ok(!html.includes('href="'+path+'?'),path+' is loaded twice');
  assert.doesNotMatch(readFileSync(path,'utf8'),/@(?:import|namespace|charset)\b/i);
 }
 const generated=sources.map(source=>'/* Source: '+source+' */\n'+readFileSync(source.split('?')[0],'utf8')).join('\n\n')+'\n';
 // Previous bundle batches may contain additional blank lines between source
 // boundaries. They are semantically identical; only normalize those boundaries.
 const normalize=s=>s.replace(/\n{3,}(?=\/\* Source: )/g,'\n\n').replace(/\n+$/,'\n');
 if(write)writeFileSync(bundle,generated);
 else assert.equal(normalize(previous),normalize(generated),bundle+' has stale source content');
 console.log(bundle+': '+count+' ordered sources verified');
}
