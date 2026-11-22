/* Simulated Android keyboard: no live REDLINE accounts or private messages. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const read=p=>readFileSync(p,'utf8');
const html=read('private-photo-ledger.html');
const css=read('private-photo-ledger-sender-messenger.css');
const script=read('private-photo-ledger-sender-messenger.js');
test('Android REDLINE uses the visual viewport for the keyboard and keeps editor geometry intact',()=>{
 assert.match(html,/interactive-widget=resizes-content/);
 assert.match(html,/private-photo-ledger-sender-messenger\.js\?v=20261122-android-visible-keyboard1/);
 assert.match(script,/window\.visualViewport/);
 assert.match(script,/redline-android-keyboard-open/);
 assert.match(script,/--redline-visible-height/);
 assert.match(script,/visual\?\.addEventListener\('resize',queueKeyboard\)/);
 assert.match(css,/body\.redline-chat-immersive\.redline-android-keyboard-open/);
 assert.match(css,/height:var\(--redline-visible-height\)!important/);
 assert.doesNotMatch(script,/textEntry\.value\s*=/);
});
test('Android keyboard open and close keeps the REDLINE composer above the bottom edge',async()=>{
 const base=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'');
 const styles=['private-photo-ledger.css','private-photo-ledger-responsive.css',
  'private-photo-ledger-simple-sender.css','private-photo-ledger-sender-messenger.css']
  .map(read).join('\n');
 const code=[
 "window.addEventListener('error',e=>document.body.dataset.probeError=String(e.message).slice(0,130));",
 "const mockView=new EventTarget();mockView.height=770;mockView.offsetTop=0;",
 "Object.defineProperty(window,'visualViewport',{configurable:true,value:mockView});",
 "const roomId='00000000-0000-4000-8000-000000000111';",
 "window.BLACKCELL_REDLINE_API={",
 "snapshot:()=>({roomId,userId:'00000000-0000-4000-8000-000000000112',peerName:'Test User',isOwner:false,roomActive:true,photoSendingPaused:false,archiveMode:false,resetAt:null,pending:0,owed:'$0.00',paid:'$0.00',assigned:'$0.00',entries:[],photoHistory:[],paymentHistory:[],ratingEvents:[],fiveStarPhotos:[],topPicks:[]}),",
 "loadMessages:async()=>[],chatStatus:async()=>({peerTyping:false,peerReadAt:null}),",
 "chatSignal:async()=>true,timerStatus:async()=>({ok:true,server_now:new Date().toISOString(),recent:[],active:null}),",
 "currentlyViewingStatus:async()=>({active:false,photoId:null})};",
 "document.addEventListener('DOMContentLoaded',()=>{",
 "['ledgerApp','activeRoom','employeeUpload'].forEach(id=>document.getElementById(id).hidden=false);",
 "document.getElementById('ownerSetup').hidden=true;",
 "window.dispatchEvent(new Event('blackcell:redline:bridge'));",
 "window.dispatchEvent(new Event('blackcell:redline:state'));",
 "setTimeout(()=>{const entry=document.querySelector('#redlineSimpleSender .redline-message-entry');",
 "document.body.dataset.probeFound=String(Boolean(entry));if(!entry)return;",
 "entry.focus();mockView.height=370;mockView.dispatchEvent(new Event('resize'));},1100);",
 "setTimeout(()=>{const entry=document.querySelector('#redlineSimpleSender .redline-message-entry');",
 "const form=document.querySelector('#redlineMessageComposer');const box=form?.getBoundingClientRect();",
 "document.body.dataset.probeKeyboard=String(document.body.classList.contains('redline-android-keyboard-open'));",
 "document.body.dataset.probeHeight=String(getComputedStyle(document.body).height==='370px'&&document.documentElement.style.getPropertyValue('--redline-visible-height')==='370px');",
 "document.body.dataset.probeComposer=String(Boolean(box&&box.height>=35&&box.bottom<=374));",
 "entry.blur();mockView.height=770;mockView.dispatchEvent(new Event('resize'));},2700);",
 "setTimeout(()=>{document.body.dataset.probeRestored=String(!document.body.classList.contains('redline-android-keyboard-open')&&document.documentElement.style.getPropertyValue('--redline-visible-height')==='');},3700);",
 "});"
 ].join('\n');
 const fixture=base.replace('</head>','<style>'+styles+'</style><script>'+code+
  '</script><script src="/private-photo-ledger-simple-sender.js" defer></script>'+
  '<script src="/private-photo-ledger-sender-messenger.js" defer></script></head>');
 const server=createServer((req,res)=>{
  const file=req.url?.split('?')[0];
  if(file==='/test.html'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture);return;
  }
  if(file==='/private-photo-ledger-simple-sender.js'||file==='/private-photo-ledger-sender-messenger.js'){
   res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(read(file.slice(1)));return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const proc=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--virtual-time-budget=5200','--window-size=390,770',
   '--user-agent=Mozilla/5.0 (Linux; Android 11; Neon Smarta 2) AppleWebKit/537.36 Chrome/110.0.0.0 Mobile Safari/537.36',
   '--dump-dom','http://127.0.0.1:'+server.address().port+'/test.html'
  ]);
  let out='',err='';
  proc.stdout.on('data',d=>out+=String(d));
  proc.stderr.on('data',d=>err+=String(d));
  const exit=await new Promise(resolve=>{
   const t=setTimeout(()=>{proc.kill('SIGKILL');resolve(124)},25000);
   proc.once('exit',code=>{clearTimeout(t);resolve(code??1)});
   proc.once('error',()=>{clearTimeout(t);resolve(1)});
  });
  assert.equal(exit,0,'Chromium failure: '+err.slice(-700));
  for(const flag of ['found','keyboard','height','composer','restored'])
   assert.match(out,new RegExp('data-probe-'+flag+'="true"'),'Android '+flag+' regression');
  assert.doesNotMatch(out,/data-probe-error="[^"]+"/);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
