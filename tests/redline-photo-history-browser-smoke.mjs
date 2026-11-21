// Real REDLINE receiver browser smoke: photo history must open in its
// own scrollable overlay and close without resizing or replacing the photo.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';

let page=readFileSync('private-photo-ledger.html','utf8')
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const scripts='<script src="/private-photo-ledger-receiver.js" defer></script>';
const fixture="<script>\nwindow.addEventListener('error',e=>{document.body.dataset.historyError=String(e.message||'error').slice(0,150)});\nsetTimeout(()=>{\n const app=document.getElementById('ledgerApp'),owner=document.getElementById('ownerSetup'),\n  room=document.getElementById('activeRoom'),gate=document.getElementById('accessGate');\n gate.hidden=true;app.hidden=false;owner.hidden=false;room.hidden=false;\n const list=document.getElementById('photoEntries');\n list.replaceChildren();\n for(let i=0;i<8;i++){\n  const card=document.createElement('article');card.className='photo-entry';\n  const photo=document.createElement('button');photo.className='photo-image-btn';\n  const img=document.createElement('img');img.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2240%22%20height%3D%2260%22%3E%3Crect%20width%3D%2240%22%20height%3D%2260%22%20fill%3D%22black%22/%3E%3C/svg%3E';\n  photo.append(img);card.append(photo);\n  const amount=document.createElement('strong');amount.textContent=';
page=page.replace('</head>',scripts+fixture+'</head>');
const server=createServer((req,res)=>{
 const file=(req.url||'').split('?')[0];
 if(file==='/history.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;
 }
 if(!/^\/[a-zA-Z0-9-]+\.(?:css|js)$/.test(file)){res.writeHead(404);res.end();return}
 try{
  const name=basename(file),bytes=readFileSync(name);
  res.writeHead(200,{'content-type':name.endsWith('.css')?'text/css':'text/javascript'});res.end(bytes);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/history.html';
const chrome=process.env.CHROME||'chromium';
let stdout='',stderr='';
try{
 const child=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--virtual-time-budget=6100','--window-size=1200,950','--dump-dom',url
 ]);
 child.stdout.on('data',d=>{stdout+=d.toString()});
 child.stderr.on('data',d=>{stderr+=d.toString()});
 const exit=await new Promise(resolve=>{
  const tm=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},25000);
  child.once('exit',code=>{clearTimeout(tm);resolve(code??1)});
  child.once('error',()=>{clearTimeout(tm);resolve(1)});
 });
 assert.equal(exit,0,'Browser exit failed: '+stderr.slice(-1100));
 for(const flag of ['history-toggle-visible','history-collapsed','history-opened','history-items',
  'history-scrollable','history-no-photo-resize','history-still-within-workspace','history-can-close']){
  assert.match(stdout,new RegExp('data-'+flag+'="true"'),
   flag+' failed — Photo History may be hidden or not scrollable');
 }
 assert.doesNotMatch(stdout,/data-history-error="[^"]+"/,'Receiver JS runtime exception');
 console.log('REDLINE photo history: visible button, scrollable history, unchanged photo size, close/reopen all passed.');
}finally{
 await new Promise(resolve=>server.close(resolve));
}
+(i+1)+'.00';\n  card.append(amount);list.append(card);\n }\n const current=document.getElementById('reviewQueueCurrent');current.replaceChildren();\n const card=document.createElement('article');card.className='photo-entry';\n const b=document.createElement('button');b.className='photo-image-btn';\n const image=document.createElement('img');image.alt='Incoming photo';\n image.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22150%22%20height%3D%22300%22%3E%3Crect%20width%3D%22150%22%20height%3D%22300%22%20fill%3D%22black%22/%3E%3C/svg%3E';\n b.append(image);card.append(b);current.append(card);\n document.dispatchEvent(new Event('blackcell:redline:state'));\n window.dispatchEvent(new Event('blackcell:redline:state'));\n setTimeout(()=>{\n  const toggle=document.getElementById('redlinePhotoHistoryToggle');\n  const stage=document.getElementById('redlineReceiverPricedStage');\n  const review=document.getElementById('redlineReceiverReviewStage');\n  document.body.dataset.historyToggleVisible=String(Boolean(toggle&&!toggle.hidden&&\n   getComputedStyle(toggle).display!=='none'));\n  document.body.dataset.historyCollapsed=String(getComputedStyle(stage).display==='none');\n  const before=review?.getBoundingClientRect().height;\n  toggle?.click();\n  setTimeout(()=>{\n   document.body.dataset.historyOpened=String(getComputedStyle(stage).display!=='none'&&\n    toggle.getAttribute('aria-expanded')==='true');\n   document.body.dataset.historyItems=String(\n    stage.querySelectorAll('#photoEntries>.photo-entry').length===8);\n   document.body.dataset.historyScrollable=String(\n    getComputedStyle(list).overflowY==='auto'&&\n    list.scrollHeight>=list.clientHeight);\n   document.body.dataset.historyNoPhotoResize=String(\n    Math.abs(review?.getBoundingClientRect().height-before)<3);\n   document.body.dataset.historyStillWithinWorkspace=String(\n    stage.getBoundingClientRect().height>150&&\n    stage.getBoundingClientRect().height<window.innerHeight);\n   toggle.click();\n   setTimeout(()=>{\n    document.body.dataset.historyCanClose=String(getComputedStyle(stage).display==='none'&&\n     toggle.getAttribute('aria-expanded')==='false');\n   },300);\n  },400);\n },400);\n},1500);\n</script>";
page=page.replace('</head>',scripts+fixture+'</head>');
const server=createServer((req,res)=>{
 const file=(req.url||'').split('?')[0];
 if(file==='/history.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;
 }
 if(!/^\/[a-zA-Z0-9-]+\.(?:css|js)$/.test(file)){res.writeHead(404);res.end();return}
 try{
  const name=basename(file),bytes=readFileSync(name);
  res.writeHead(200,{'content-type':name.endsWith('.css')?'text/css':'text/javascript'});res.end(bytes);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/history.html';
const chrome=process.env.CHROME||'chromium';
let stdout='',stderr='';
try{
 const child=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--virtual-time-budget=6100','--window-size=1200,950','--dump-dom',url
 ]);
 child.stdout.on('data',d=>{stdout+=d.toString()});
 child.stderr.on('data',d=>{stderr+=d.toString()});
 const exit=await new Promise(resolve=>{
  const tm=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},25000);
  child.once('exit',code=>{clearTimeout(tm);resolve(code??1)});
  child.once('error',()=>{clearTimeout(tm);resolve(1)});
 });
 assert.equal(exit,0,'Browser exit failed: '+stderr.slice(-1100));
 for(const flag of ['history-toggle-visible','history-collapsed','history-opened','history-items',
  'history-scrollable','history-no-photo-resize','history-still-within-workspace','history-can-close']){
  assert.match(stdout,new RegExp('data-'+flag+'="true"'),
   flag+' failed — Photo History may be hidden or not scrollable');
 }
 assert.doesNotMatch(stdout,/data-history-error="[^"]+"/,'Receiver JS runtime exception');
 console.log('REDLINE photo history: visible button, scrollable history, unchanged photo size, close/reopen all passed.');
}finally{
 await new Promise(resolve=>server.close(resolve));
}
