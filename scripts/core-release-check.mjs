import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const base=process.env.RELEASE_BASE;
const sha=process.env.RELEASE_HEAD||'HEAD';
const tracked=new Set(files);
const publicFile=p=>/\.(html|js|css|json|svg)$/i.test(p)&&!/(^|\/)(?:tests|scripts|supabase|node_modules|\.github|fixtures|docs)(\/|$)/.test(p)&&!p.startsWith('.');
const changed=base&&/^[0-9a-f]{40}$/i.test(base)&&!/^0+$/.test(base)?execFileSync('git',['diff','--name-only','--diff-filter=AM','-z',base,sha],{encoding:'utf8'}).split('\0').filter(Boolean):files;
const selected=changed.filter(publicFile).filter(p=>tracked.has(p));
const digest=b=>createHash('sha256').update(b).digest('hex');
const entryRefs=/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*(["'])([^"']+\.(?:js|css)(?:\?[^"'#]*)?(?:#[^"']*)?)\1/gi;
const resolveRef=(page,value)=>{
 if(/^(?:[a-z]+:|\/\/|#)/i.test(value))return null;
 const pathname=value.split(/[?#]/)[0];
 const local=path.posix.normalize(pathname.startsWith('/')?pathname.slice(1):path.posix.join(path.posix.dirname(page),pathname));
 return tracked.has(local)?local:null;
};
if(process.argv.includes('--stamp')){
 const token=process.env.RELEASE_TOKEN;
 if(!token||!/^[a-zA-Z0-9_-]{8,80}$/.test(token))throw Error('Set RELEASE_TOKEN to a new unique release identifier.');
 const modified=new Set(selected.filter(p=>/\.(js|css)$/.test(p)));
 for(const page of files.filter(p=>publicFile(p)&&p.endsWith('.html'))){
  const old=readFileSync(page,'utf8');
  let next=old.replace(entryRefs,(tag,quote,ref)=>{
   const target=resolveRef(page,ref);
   if(!target||!modified.has(target))return tag;
   const [raw,hash='']=ref.split('#',2);
   const [pathname,query='']=raw.split('?',2);
   const params=new URLSearchParams(query.replace(/&amp;/g,'&'));params.set('bc_release',token);
   return tag.replace(ref,()=>pathname+'?'+params.toString().replace(/&/g,'&amp;')+(hash?'#'+hash:''));
  });
  if(next!==old){
   if(page==='blackcell-os.html')next=next.replace(/name="blackcell-os-client-build" content="[^"]+"/,'name="blackcell-os-client-build" content="'+token+'"');
   writeFileSync(page,next);console.log('Stamped '+page);
  }
 }
 const manifest='blackcell-site-version.json';
 const original=readFileSync(manifest,'utf8');
 writeFileSync(manifest,original.replace(/"fallback":"[^"]+"/,'"fallback":"'+token+'"'));
 console.log('Review and commit stamped files. Dynamic imports still need matching versions.');
}else if(process.argv.includes('--live')){
 const root='https://blackcellcorp.com/';
 const eligible=selected.filter(p=>!readFileSync(p,'utf8').startsWith('---\n'));
 // Jekyll transforms files with front matter; verify the version endpoint separately.
 let remaining=eligible;
 for(let attempt=0;attempt<8;attempt++){
  const next=[];
  for(let i=0;i<remaining.length;i+=4)await Promise.all(remaining.slice(i,i+4).map(async p=>{
   try{
    const u=new URL(p.split('/').map(encodeURIComponent).join('/'),root);
    u.searchParams.set('_bc_verify',sha.slice(0,12)+'-'+attempt);
    const response=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(15000),redirect:'follow'});
    if(!response.ok||new URL(response.url).origin!==new URL(root).origin||digest(Buffer.from(await response.arrayBuffer()))!==digest(readFileSync(p)))next.push(p);
    else console.log('LIVE VERIFIED '+p);
   }catch{next.push(p)}
  }));
  remaining=next;if(!remaining.length)break;
  console.log('Not yet matching production: '+remaining.join(', '));
  if(attempt<7)await new Promise(r=>setTimeout(r,30000));
 }
 const manifest=await fetch(root+'blackcell-site-version.json?_bc_verify='+sha,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!manifest.ok)throw Error('Production release manifest unavailable');
 const raw=await manifest.text();
 const published=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));
 const source=readFileSync('blackcell-site-version.json','utf8');
 const fallback=source.match(/"fallback":"([^"]+)"/)?.[1];
 if(!published.revision&&!published.built&&!published.fallback)throw Error('No release identity');
 if(published.fallback!==fallback)throw Error('Production release fallback differs from repository');
 if(remaining.length)throw Error('Production does not match repository: '+remaining.join(', '));
 console.log('Verified '+eligible.length+' changed static files and published release manifest.');
}else{
 let failures=[];
 const changedAssets=new Set(selected.filter(p=>/\.(js|css)$/.test(p)));
 for(const page of files.filter(p=>publicFile(p)&&p.endsWith('.html')&&!/site-update-test/.test(p))){
  const html=readFileSync(page,'utf8');
  const refs=[...html.matchAll(entryRefs)];
  for(const m of refs){
   const target=resolveRef(page,m[2]);if(!target||!changedAssets.has(target))continue;
   // For a changed direct asset, existing entry pages must not reuse the old URL.
   if(base&&/^[0-9a-f]{40}$/i.test(base)&&!/^0+$/.test(base)){
    let prior='';try{prior=execFileSync('git',['show',base+':'+page],{encoding:'utf8',stdio:['ignore','pipe','ignore']})}catch{}
    if(prior&&[...prior.matchAll(entryRefs)].some(x=>x[2]===m[2]))failures.push(page+' retains old URL '+m[2]);
   }
  }
 }
 if(failures.length)throw Error('Stale direct asset references:\n'+failures.join('\n'));
 console.log('Direct entry asset version checks passed ('+selected.length+' changed public files). Dynamic imports and browser behavior require separate tests.');
}
