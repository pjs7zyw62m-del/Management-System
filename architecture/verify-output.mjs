import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const map=JSON.parse(await fs.readFile('architecture/file-map.json','utf8'));
const pages=new Set(['corporate-network.html','dashboard.html','corporate-chat.html','login.html','usa-page.html','military-country.html']);
for(const [file,source] of Object.entries(map)){
 const before=await fs.readFile(path.join('dist-plain',file));
 assert.ok(before.equals(await fs.readFile(source)),file+' original copy mismatch');
 const after=await fs.readFile(path.join('dist',file));
 if(!pages.has(file))assert.ok(before.equals(after),file+' unexpected bundle change');
 else{
  const html=after.toString('utf8');
  const original=before.toString('utf8');
  const scripts=s=>[...s.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m=>m[0]);
  const styles=s=>[...s.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(m=>m[0]);
  assert.deepEqual(scripts(html),scripts(original),file+' scripts changed');
  assert.deepEqual(styles(html),styles(original),file+' inline styles changed');
  for(const m of html.matchAll(/<link\s+rel=["']stylesheet["']\s+href=["']([a-zA-Z0-9_.-]+\.css)(?:\?[^"']*)?["']/gi))await fs.access(path.join('dist',m[1]));
 }
}
console.log('All '+Object.keys(map).length+' original paths available; script and inline-style order preserved in bundle variants.');
