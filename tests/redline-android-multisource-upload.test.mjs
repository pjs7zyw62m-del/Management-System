/* REDLINE sender Android 11: two photo sources, unlimited selection, Bunny queue.
 * This test does not contact production, alter user media, or bypass RLS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
 assert.match(core,/picker\.multiple=true;picker\.value=''/);
 assert.match(style,/\.redline-photo-source-overlay\[hidden\]/);
});
test('No arbitrary file count limit; media from Photos is streamed one-by-one',()=>{
 assert.match(core,/max:Number\.POSITIVE_INFINITY/);
 assert.match(core,/onSelectRows:async\(rows,readFile\)=>/);
 assert.match(library,/onSelectRows=null/);
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
