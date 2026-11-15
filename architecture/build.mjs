import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {bundlePage} from './bundle.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'dist');
const map=JSON.parse(await fs.readFile(path.join(root,'architecture/file-map.json'),'utf8'));
const safe=p=>typeof p==='string'&&p.length>0&&!path.isAbsolute(p)&&!p.includes('\\')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
if(Object.entries(map).some(([dst,src])=>!safe(dst)||!safe(src))||new Set(Object.values(map)).size!==Object.keys(map).length)throw Error('Invalid build mapping');
await fs.mkdir(out,{recursive:true});
if((await fs.readdir(out)).length)throw Error('dist not empty; move previous generated output first.');
for(const [dst,src] of Object.entries(map)){
 const file=path.join(root,src),target=path.join(out,dst);
 if(!(await fs.lstat(file)).isFile())throw Error('Not a regular source file: '+src);
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(file,target);
 if(!(await fs.readFile(file)).equals(await fs.readFile(target)))throw Error('Copy mismatch: '+dst);
}
console.log('Verified '+Object.keys(map).length+' output paths against source.');
if(process.argv.includes('--bundle-css')){
 const hash=b=>createHash('sha256').update(b).digest('hex').slice(0,16);
 for(const page of ['corporate-network.html','dashboard.html','corporate-chat.html','login.html','usa-page.html','military-country.html']){
  const target=path.join(out,page),html=await fs.readFile(target,'utf8');
  const result=await bundlePage(html,page,name=>fs.readFile(path.join(out,name),'utf8'),hash);
  for(const [name,data] of result.assets)await fs.writeFile(path.join(out,name),data,{flag:'wx'});
  await fs.writeFile(target,result.html);
  console.log(page+': '+result.before+' to '+result.after+' eligible stylesheet links');
 }
}
console.log('Build created at '+out+'. Deploy dist only after testing.');
