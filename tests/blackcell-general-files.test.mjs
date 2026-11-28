import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPrivateDrive} from '../blackcell-private-drive.js';
import {filesPathAllowed,visibleDriveRows} from '../blackcell-files.js';
import {privateFiles} from '../blackcell-private-media.js';

test('Files hides the reserved root library, keeps ordinary images and documents',()=>{
 const rows=['Photos','Documents','vacation.jpg','report.pdf','budget.xlsx','Pictures','.blackcell-folder'].map(name=>({name}));
 assert.deepEqual(visibleDriveRows(rows,[]).map(x=>x.name),['Documents','vacation.jpg','report.pdf','budget.xlsx','Pictures']);
 assert.equal(filesPathAllowed(['Photos','Albums']),false);
 assert.equal(filesPathAllowed(['Documents','Photos']),true);
 assert.equal(filesPathAllowed([]),true);
 assert.ok(visibleDriveRows([{name:'Photos'}],['Documents']).length);
 const code=readFileSync('blackcell-files.js','utf8');
 assert.doesNotMatch(code,/Download photographs from BLACKCELL Photos|Move this photograph into the Photos folder/);
 assert.match(code,/controls.append\(btn\('Download',\(\)=>void download\(row\)\)\)/);
});

test('Photos scans only its dedicated directory, including member albums',async()=>{
 const seen=[];
 const rows={'member/Photos':[{name:'photo.jpg',id:'1',metadata:{size:42}},{name:'Members',id:null},{name:'.blackcell-folder',id:'marker'}],'member/Photos/Members':[{name:'video.mp4',id:'2',metadata:{size:12}}]};
 const storage={async list(path){seen.push(path);return {data:rows[path]||[],error:null}}};
 const result=await privateFiles(storage,'member');
 assert.deepEqual(seen,['member/Photos','member/Photos/Members']);
 assert.deepEqual(result.rows.map(x=>x.name),['photo.jpg','video.mp4']);
});

test('Empty folders persist through the private cloud adapter with no legacy bucket',async()=>{
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
 const rows=new Map();let seq=0;
 globalThis.window={BLACKCELL_CORP_CONFIG:{url:'https://example.invalid',publishableKey:'test'}};
 const client={storage:{from:()=>({list:async()=>({error:{message:'Bucket not found'}}),upload:async()=>{throw Error('Legacy upload must not run')},remove:async()=>{throw Error('Legacy removal must not run')}})},auth:{getSession:async()=>({data:{session:{user:{id:'member'},access_token:'test'}},error:null})}};
 const respond=data=>new Response(JSON.stringify({ok:true,...data}),{status:200,headers:{'content-type':'application/json'}});
 globalThis.fetch=async(url,options)=>{
  const action=new URL(url).searchParams.get('action');
  const body=typeof options.body==='string'?JSON.parse(options.body):{};
  if(action==='list')return respond({rows:[...rows.values()].filter(x=>x.state==='ready')});
  if(action==='start'){const id='file-'+(++seq);rows.set(id,{id,path:body.path,size_bytes:body.size,state:'uploading'});return respond({id,chunkBytes:4194304})}
  if(action==='chunk')return respond({});
  if(action==='finish'){rows.get(body.id).state='ready';return respond({})}
  if(action==='lookup')return respond({row:[...rows.values()].find(x=>x.path===body.path)||null});
  if(action==='delete'){rows.delete(body.id);return respond({})}
  throw Error(action);
 };
 try{
  const drive=createPrivateDrive(client,'member');
  assert.equal((await drive.upload('member/Documents/.blackcell-folder',new Blob(['folder']))).error,null);
  assert.equal([...rows.values()][0].path,'Documents/.__blackcell_files_folder__');
  assert.deepEqual((await drive.list('member')).data.map(r=>r.name),['Documents']);
  assert.deepEqual((await drive.list('member/Documents')).data.map(r=>r.name),['.blackcell-folder']);
  assert.equal((await drive.upload('member/Documents/report.pdf',new Blob(['PDF']))).error,null);
  assert.ok((await drive.remove(['member/Documents/.blackcell-folder'])).error);
  assert.equal((await drive.remove(['member/Documents/report.pdf'])).error,null);
  assert.equal((await drive.remove(['member/Documents/.blackcell-folder'])).error,null);
  assert.deepEqual((await drive.list('member')).data,[]);
 }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow}
});
