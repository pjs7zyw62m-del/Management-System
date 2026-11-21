// Browser regression: an old timed photo must never cover the next pending image.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';

let page=readFileSync('private-photo-ledger.html','utf8')
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const fixture="<script>\nwindow.addEventListener('error',e=>{document.body.dataset.photoRuntimeError=String(e.message||'error').slice(0,160)});\nconst roomId='00000000-0000-4000-8000-000000000014';\nconst first='00000000-0000-4000-8000-000000000011';\nconst second='00000000-0000-4000-8000-000000000012';\nconst reviewed='00000000-0000-4000-8000-000000000013';\nconst old={id:reviewed,decision_status:'accepted',amount_cents:25};\nconst pending={id:first,decision_status:'pending',amount_cents:null};\nwindow.BLACKCELL_REDLINE_API={\n snapshot:()=>({roomId,userId:'00000000-0000-4000-8000-000000000015',\n  isOwner:true,roomActive:true,archiveMode:false,\n  entries:[pending,old,{id:second,decision_status:'pending',amount_cents:null}]}),\n timerStatus:async()=>({ok:true,server_now:new Date().toISOString(),\n  active:null,recent:[],assigned_cents:0,paid_cents:0,owed_cents:0,photo_totals:[]})\n};\nfunction photoCard(id){\n const el=document.createElement('article');el.className='photo-entry';el.dataset.redlinePhotoId=id;\n const b=document.createElement('button');b.className='photo-image-btn';\n const img=document.createElement('img');img.src='https://example.com/test.jpg';\n b.append(img);el.append(b);return el;\n}\ndocument.addEventListener('DOMContentLoaded',()=>{\n document.body.classList.add('bc-redline-receiver','rr-imessage-mode');\n const app=document.getElementById('ledgerApp'),room=document.getElementById('activeRoom');\n app.hidden=false;room.hidden=false;\n const ws=document.createElement('section');ws.id='redlineReceiverLiveWorkspace';\n const photos=document.createElement('section');photos.id='redlineReceiverIncomingPhotos';\n const stage=document.createElement('div');stage.id='redlineReceiverReviewStage';stage.className='rr-review-stage';\n const queue=document.getElementById('ownerReviewQueue');queue.hidden=false;\n const sidebar=document.getElementById('redlineLightboxReview');sidebar.hidden=false;\n const feed=document.getElementById('reviewQueueCurrent');feed.replaceChildren(photoCard(first));\n stage.append(queue,sidebar);photos.append(stage);ws.append(photos);document.body.append(ws);\n document.getElementById('photoEntries').replaceChildren(photoCard(reviewed));\n window.dispatchEvent(new Event('blackcell:redline:state'));\n setTimeout(()=>{\n  window.dispatchEvent(new CustomEvent('blackcell:redline:photo-selected',{detail:{photoId:reviewed}}));\n },850);\n setTimeout(()=>{\n  const preview=document.querySelector('.rr-timer-selected-preview');\n  document.body.dataset.pendingVisibleBefore=String(getComputedStyle(queue).display!=='none');\n  document.body.dataset.oldPreviewHidden=String(Boolean(preview?.hidden));\n  document.body.dataset.noOldPhotoMode=String(!document.body.classList.contains('rr-timing-priced-photo'));\n  pending.decision_status='accepted';pending.amount_cents=10;\n  feed.replaceChildren(photoCard(second));\n  window.dispatchEvent(new CustomEvent('blackcell:redline:review-photo',{detail:{photoId:second}}));\n },1850);\n setTimeout(()=>{\n  const img=document.querySelector('#reviewQueueCurrent .photo-entry');\n  const preview=document.querySelector('.rr-timer-selected-preview');\n  const visible=getComputedStyle(queue).display!=='none';\n  document.body.dataset.nextPhotoIdVisible=String(img?.dataset.redlinePhotoId===second&&visible);\n  document.body.dataset.previewCannotHideNext=String(preview?.hidden===true&&\n   !document.body.classList.contains('rr-timing-priced-photo'));\n  document.body.dataset.sidebarStillVisible=String(getComputedStyle(sidebar).display!=='none');\n },3650);\n});\n</script>\n<script src=\"/private-photo-ledger-timers.js\" defer></script>";
page=page.replace('</head>',fixture+'</head>');
const server=createServer((req,res)=>{
 const file=(req.url||'').split('?')[0];
 if(file==='/smoke.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;
 }
 if(!/^\/[a-zA-Z0-9-]+\.(?:css|js)$/.test(file)){res.writeHead(404);res.end();return}
 try{
  const name=basename(file),bytes=readFileSync(name);
  res.writeHead(200,{'content-type':name.endsWith('.css')?'text/css':'text/javascript'});res.end(bytes);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/smoke.html';
const chrome=process.env.CHROME||'chromium';
let stdout='',stderr='';
try{
 const child=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--virtual-time-budget=6200','--window-size=1200,950','--dump-dom',url
 ]);
 child.stdout.on('data',d=>{stdout+=d.toString()});
 child.stderr.on('data',d=>{stderr+=d.toString()});
 const exit=await new Promise(resolve=>{
  const tm=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},25000);
  child.once('exit',code=>{clearTimeout(tm);resolve(code??1)});
  child.once('error',()=>{clearTimeout(tm);resolve(1)});
 });
 assert.equal(exit,0,'Chrome run failed: '+stderr.slice(-1300));
 for(const flag of [
  'pending-visible-before','old-preview-hidden','no-old-photo-mode',
  'next-photo-id-visible','preview-cannot-hide-next','sidebar-still-visible'
 ]){
  assert.match(stdout,new RegExp('data-'+flag+'="true"'),
   flag+' failed: old timed photo may cover pending image');
 }
 assert.doesNotMatch(stdout,/data-photo-runtime-error="[^"]+"/,'Browser runtime exception');
 console.log('REDLINE: timed-photo overlay cannot hide NEXT pending image or sidebar.');
}finally{
 await new Promise(resolve=>server.close(resolve));
}
