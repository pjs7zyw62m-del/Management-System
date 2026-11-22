/* REDLINE sender Android 11: two photo sources, unlimited selection, Bunny queue.
 * This test does not contact production, alter user media, or bypass RLS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

const html=readFileSync('private-photo-ledger.html','utf8');
const core=readFileSync('private-photo-ledger.js','utf8');
const sender=readFileSync('private-photo-ledger-sender.js','utf8');
const simple=readFileSync('private-photo-ledger-simple-sender.js','utf8');
const messenger=readFileSync('private-photo-ledger-sender-messenger.js','utf8');
const library=readFileSync('blackcell-private-media.js','utf8');
const style=readFileSync('private-photo-ledger-upload-choices.css','utf8');

test('REDLINE Android native picker selects multiple photos and auto-queues every file',()=>{
 assert.match(html,/id="uploadPhoto"[^>]*\bmultiple\b/);
 assert.match(core,/Array\.from\(\$\('uploadPhoto'\)\.files\|\|\[\]\)/);
 assert.match(core,/enqueueRedlineFiles\(files\.map\(file=>\(\{file,label:file\.name\}\)\)\)/);
 assert.doesNotMatch(sender,/file\.addEventListener\('change',sendSelectedPhoto\)/);
 assert.match(html,/private-photo-ledger\.js\?v=20261122-redline-android-multisource1/);
 assert.match(html,/private-photo-ledger-upload-choices\.css\?v=20261122-redline-android-chooser1/);
});
test('REDLINE chat plus, hero plus and dropzone reach same two-source chooser',()=>{
 assert.match(simple,/window\.BLACKCELL_REDLINE_UPLOAD_UI\?\.open\?\.\(\)/);
 assert.match(sender,/window\.BLACKCELL_REDLINE_UPLOAD_UI\?\.open/);
 assert.doesNotMatch(messenger,/uploadDrawer\.open=!uploadDrawer\.open/);
 assert.match(core,/const dropLabel=document\.querySelector\('#employeeUpload label\[for="uploadPhoto"\]'\)/);
 assert.match(core,/function openRedlinePhotoChooser\(\)/);
 assert.match(core,/button\('＋  Upload from Phone'/);
 assert.match(core,/button\('▣  BLACKCELL Photos'/);
 assert.match(core,/picker\.multiple=true;picker\.tabIndex=-1/);
 assert.match(core,/document\.body\.append\(picker\)/);
 assert.match(core,/function openRedlinePhonePicker\(\)/);
 assert.match(style,/\.redline-photo-source-overlay\[hidden\]/);
});
test('No arbitrary file count limit; media from Photos is streamed one-by-one',()=>{
 assert.match(core,/max:Number\.POSITIVE_INFINITY/);
 assert.match(core,/onSelectRows:async\(rows,readFile\)=>/);
 assert.match(library,/onSelectRows=null/);
 assert.match(library,/onDeviceUpload=null/);
 assert.match(library,/No BLACKCELL Photos found for this account/);
 assert.match(core,/onDeviceUpload:\(\)=>\{/);
 assert.match(library,/if\(typeof onSelectRows==='function'\)/);
 assert.match(core,/if\(!file&&typeof item\.readFile==='function'\)file=await item\.readFile\(\)/);
 assert.match(core,/const success=await uploadPhoto\(\{preventDefault\(\)\{\},detail:\{file\}\}\)/);
 assert.match(core,/path=await uploadBunnyPhoto\(db,room\.id,state\.user\.id,id,file,info\.mime\)/);
 assert.match(core,/const r=await db\.from\(ENTRIES\)\.insert\(\{/);
 assert.match(core,/if\(permission\.error\|\|!permission\.data\)/);
});

function harness({onUpload=async()=>true}={}){
 const start=core.indexOf('const redlinePhotoQueue=[];');
 const end=core.indexOf('async function uploadPhoto(...args)',start);
 assert.ok(start>0&&end>start);
 const source=core.slice(start,end);
 class Element {
  constructor(id=''){this.id=id;this.children=[];this.textContent='';this.hidden=false;this.attributes=new Map();}
  append(...items){this.children.push(...items);}
  setAttribute(k,v){this.attributes.set(k,v);}
  addEventListener(){}
 }
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,new Element(id));
  return elements.get(id);
 };
 const state={closed:false,isOwner:false,user:{id:'sender'},room:{id:'room-1',active:true,photo_sending_paused:false},showArchive:false,busy:false};
 const sent=[],feedback=[];
 const factory=new Function('env',[
  'const state=env.state,MAX_IMAGE_BYTES=12*1024*1024,window={};',
  'const $=env.get,node=(_tag,cls,txt)=>{const n=new env.Element();n.className=cls;n.textContent=txt||"";return n};',
  'const button=(label,fn,cls)=>{const n=new env.Element();n.textContent=label;n.className=cls;n.onClick=fn;return n};',
  'const show=(id,value)=>{env.feedback.push({id,value})};',
  'const imageType=file=>{if(!/\\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name))throw Error("unsupported photo");return {mime:"image/jpeg"}};',
  'const uploadPhoto=async event=>env.onUpload(event.detail.file,env.state);',
  'const fail=error=>String(error?.message||error);',
  source,
  'return {enqueueRedlineFiles,openRedlinePhotoChooser,queue:()=>redlinePhotoQueue.length,busy:()=>redlineQueueRunning,status:()=>env.get("redlineUploadBatchStatus").textContent};'
 ].join('\n'));
 const api=factory({Element,get,state,feedback,onUpload:async(file,st)=>{
  sent.push(file.name);
  return await onUpload(file,st);
 }});
 return {api,state,sent,feedback};
}
const file=name=>({name,size:1024,type:'image/jpeg'});
async function drain(api,timeout=1000){
 const deadline=Date.now()+timeout;
 while(api.busy()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,3));
 assert.equal(api.busy(),false,'Upload batch failed to finish');
}
test('5 Android photos selected together all automatically upload in order',async()=>{
 const {api,sent}=harness();
 assert.equal(api.enqueueRedlineFiles(['a.jpg','b.png','c.webp','d.heic','e.jpg'].map(x=>({file:file(x),label:x}))),true);
 await drain(api);
 assert.deepEqual(sent,['a.jpg','b.png','c.webp','d.heic','e.jpg']);
 assert.equal(api.queue(),0);
 assert.match(api.status(),/5 photos sent privately/);
});
test('BLACKCELL Photos reads each selected original only when its turn arrives',async()=>{
 const {api,sent}=harness();
 let reads=0,maxInProgress=0,current=0;
 const rows=Array.from({length:9},(_,i)=>({label:'library-'+i+'.jpg',
  async readFile(){reads++;current++;maxInProgress=Math.max(maxInProgress,current);await new Promise(r=>setTimeout(r,1));current--;return file('library-'+i+'.jpg')}}));
 api.enqueueRedlineFiles(rows);
 await drain(api);
 assert.equal(reads,9);
 assert.equal(maxInProgress,1);
 assert.equal(sent.length,9);
});
test('Server-authorized room pause stops remaining uploads and keeps queued items out of other rooms',async()=>{
 const {api,state,sent}=harness({onUpload:async()=>{state.room.photo_sending_paused=true;return true}});
 api.enqueueRedlineFiles(Array.from({length:4},(_,i)=>({file:file('private-'+i+'.jpg')})));
 await drain(api);
 assert.equal(sent.length,1);
 assert.equal(api.queue(),0);
 assert.match(api.status(),/photo sending/i);
});
test('Rejected large/unsupported files cannot block good files in a batch',async()=>{
 const {api,sent}=harness();
 api.enqueueRedlineFiles([{file:file('good.jpg')},{file:{name:'huge.jpg',size:13*1024*1024}},{file:file('bad.exe')},{file:file('also-good.webp')}]);
 await drain(api);
 assert.deepEqual(sent,['good.jpg','also-good.webp']);
 assert.match(api.status(),/2 not sent/);
});


test('Android 11 Chrome: actual REDLINE + menu shows both choices and phone picker stays on-site',async()=>{
 const start=core.indexOf('const redlinePhotoQueue=[];'),end=core.indexOf('async function uploadPhoto(...args)',start);
 assert.ok(start>0&&end>start);
 const actions=core.slice(start,end);
 const boot=[
  'const state={closed:false,isOwner:false,user:{id:"verified-sender"},room:{id:"room-1",active:true,photo_sending_paused:false},showArchive:false,busy:false};',
  'const MAX_IMAGE_BYTES=12*1024*1024;',
  'const $=id=>document.getElementById(id);',
  'const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};',
  'const button=(label,fn,cls)=>{const el=node("button",cls,label);el.type="button";el.onclick=fn;return el};',
  'const show=(id,msg)=>{const el=$(id);if(el)el.textContent=msg};',
  'const fail=err=>String(err?.message||err),imageType=()=>({mime:"image/jpeg"});',
  'const uploadPhoto=async()=>true;',
  'HTMLInputElement.prototype.click=function(){this.dataset.nativePickerOpened="true"};',
  'const before=location.href;',
  actions,
  'window.BLACKCELL_REDLINE_UPLOAD_UI.open();',
  'const overlay=$("redlinePhotoSourceOverlay"),phone=$("redlineSourceDevice"),photos=$("redlineSourceLibrary");',
  'document.body.dataset.chooserVisible=String(!!overlay&&!overlay.hidden&&!!phone&&!!photos&&getComputedStyle(phone).display!=="none");',
  'document.body.dataset.choices=String(overlay?.querySelectorAll(".redline-source-actions button").length===2);',
  'phone.click();',
  'const picker=$("redlineDevicePicker");',
  'document.body.dataset.pickerReady=String(picker?.parentNode===document.body&&picker.multiple===true&&picker.dataset.nativePickerOpened==="true");',
  'document.body.dataset.inPage=String(location.href===before);'
 ].join('\n');
 const fixture='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+style+'</style></head>'+
  '<body><section id="employeeUpload"><p id="uploadFeedback"></p><span id="selectedPhotoName"></span></section><script>'+boot+'</script></body></html>';
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const child=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--virtual-time-budget=1300','--window-size=360,740',
   '--user-agent=Mozilla/5.0 (Linux; Android 11; Neon Smarta 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36',
   '--dump-dom','http://127.0.0.1:'+server.address().port+'/'
  ]);
  let output='',stderr='';
  child.stdout.on('data',d=>output+=d.toString());
  child.stderr.on('data',d=>stderr+=d.toString());
  const exit=await new Promise(resolve=>{
   const cutoff=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},20000);
   child.once('exit',code=>{clearTimeout(cutoff);resolve(code??1)});
   child.once('error',()=>{clearTimeout(cutoff);resolve(1)});
  });
  assert.equal(exit,0,stderr.slice(-700));
  for(const key of ['chooser-visible','choices','picker-ready','in-page']){
   assert.match(output,new RegExp('data-'+key+'="true"'),'REDLINE Android + problem: '+key);
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('REDLINE private-library picker uses Bunny catalog when the deleted legacy bucket returns HTTP 404',async()=>{
 const adapter=readFileSync('blackcell-private-drive.js','utf8');
 const {createPrivateDrive}=await import('data:text/javascript;base64,'+Buffer.from(adapter).toString('base64'));
 const id='00000000-0000-4000-8000-000000000101';
 const photos=['photo-a.jpg','photo-b.png','photo-c.webp','photo-d.heic','photo-e.jpg'];
 const objects=photos.map((name,i)=>({
  id:'00000000-0000-4000-8000-'+String(i+200).padStart(12,'0'),
  path:'Photos/'+name,size_bytes:5,updated_at:'2026-11-22T05:00:00Z',state:'ready'
 }));
 let legacyCalls=0,reads=0;
 const client={
  storage:{from:bucket=>{
   assert.equal(bucket,'blackcell-os-files');
   return {
    list:async()=>{legacyCalls++;return {data:null,error:{message:'The resource was not found',statusCode:'404'}}},
    download:async()=>{throw Error('Deleted Supabase Storage must not be used for Bunny photos')}
   };
  }},
  auth:{getSession:async()=>({data:{session:{access_token:'fake-jwt',user:{id}}},error:null})}
 };
 const savedWindow=globalThis.window,savedFetch=globalThis.fetch;
 try{
  globalThis.window={BLACKCELL_CORP_CONFIG:{url:'https://example.supabase.co',publishableKey:'public-test'}};
  globalThis.fetch=async(url,opts)=>{
   const action=new URL(url).searchParams.get('action');
   assert.match(opts.headers.Authorization,/^Bearer fake-jwt$/);
   if(action==='list')return Response.json({ok:true,rows:objects});
   if(action==='lookup'){
    const body=JSON.parse(opts.body);
    const row=objects.find(e=>e.path===body.path);
    return Response.json({ok:true,row:row||null});
   }
   if(action==='read'){reads++;return new Response(new Blob(['HELLO']),{status:200})}
   throw Error('Unexpected private drive action: '+action);
  };
  const storage=createPrivateDrive(client,id);
  const root=await storage.list(id,{limit:100});
  assert.equal(root.error,null);
  assert.equal(root.data.find(x=>x.name==='Photos')?.id,null,'Folder present from Bunny catalog');
  const items=await storage.list(id+'/Photos',{limit:100});
  assert.equal(items.error,null);
  assert.deepEqual(items.data.map(x=>x.name),photos);
  assert.equal(legacyCalls,1,'Missing bucket is only queried once, then Bunny is authoritative');
  const picture=await storage.download(id+'/Photos/photo-a.jpg');
  assert.equal(picture.error,null);
  assert.equal(picture.data.size,5);
  assert.equal(reads,1);
 }finally{globalThis.window=savedWindow;globalThis.fetch=savedFetch}
});
test('REDLINE Photos chooser lists images, excludes videos, shows counts and uses small Bunny thumbnails',()=>{
 const adapter=readFileSync('blackcell-private-drive.js','utf8');
 assert.match(adapter,/absentLegacyBucket/);
 assert.match(adapter,/legacyBucketMissing=true;break/);
 assert.match(adapter,/const rows=localRows|rows=localRows/);
 assert.match(core,/photoOnly:true/);
 assert.match(core,/redline-bunny-library1/);
 assert.match(library,/const frame=await cloudFrame\(storage,row\)/);
 assert.match(library,/rows=photoOnly\?result.rows.filter/);
 assert.match(library,/rows.length\+' photo'/);
 assert.match(html,/private-photo-ledger\.js\?v=20261122-redline-android-multisource1/);
});

test('REDLINE loads a correctly styled BLACKCELL Photos picker on Android rather than hiding it offscreen',()=>{
 assert.match(style,/body \.bc-pm-picker\{/);
 assert.match(style,/position:fixed!important/);
 assert.match(style,/z-index:2147483070!important/);
 assert.match(style,/body \.bc-pm-picker \.bc-pm-picker-panel\{/);
 assert.match(style,/max-height:calc\(100dvh - 20px\)!important/);
 assert.match(style,/body \.bc-pm-picker \.bc-pm-pick-list\{/);
 assert.match(style,/overflow:auto!important/);
 assert.match(style,/body \.bc-pm-picker .bc-pm-picker-panel>.bc-pm-button/);
 assert.match(core,/photoOnly:true/);
 assert.match(library,/SEND SELECTED|actionLabel/);
});
