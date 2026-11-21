// Browser regression: both participants see the same verified START/STOP ledger
// event in private chat, without manual refresh or duplicate chat messages.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

let page=readFileSync('private-photo-ledger.html','utf8');
page=page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const setup=String.raw`<script>
 window.addEventListener('error',e=>{document.body.dataset.timerError=String(e.message||'error').slice(0,150)});
 const owner=new URLSearchParams(location.search).get('role')==='owner';
 const roomId='00000000-0000-4000-8000-000000000003';
 const photoId='00000000-0000-4000-8000-000000000001';
 const timerId='00000000-0000-4000-8000-000000000002';
 const first=Date.now();
 const startedAt=new Date(first-15000).toISOString();
 const active={
  id:timerId,photo_id:photoId,rate_cents:60,started_at:startedAt,
  heartbeat_at:new Date(first+4000).toISOString(),running:true,earned_cents:15
 };
 let state={ok:true,server_now:new Date().toISOString(),active:null,recent:[]};
 window.BLACKCELL_REDLINE_API={
  snapshot:()=>({roomId,userId:owner?'00000000-0000-4000-8000-000000000004':'00000000-0000-4000-8000-000000000005',
   peerName:owner?'Sender':'Receiver',isOwner:owner,roomActive:true,
   archiveMode:false,resetAt:null,pending:0,owed:'$0.15',
   paid:'$0.00',assigned:'$0.15',entries:[],ratingEvents:[],topPicks:[],fiveStarPhotos:[]}),
  loadMessages:async()=>[],
  timerStatus:async()=>({...state,server_now:new Date().toISOString()})
 };
 document.addEventListener('DOMContentLoaded',()=>{
  for(const id of ['ledgerApp','activeRoom','employeeUpload']){
   document.getElementById(id).hidden=false;
  }
  document.getElementById('ownerSetup').hidden=!owner;
  if(owner){
   const container=document.createElement('section');
   container.id='redlineReceiverChat';
   const mount=document.createElement('div');
   mount.id='redlineReceiverChatMount';
   container.append(mount);
   document.getElementById('activeRoom').append(container);
  }
  window.dispatchEvent(new Event('blackcell:redline:bridge'));
  window.dispatchEvent(new Event('blackcell:redline:state'));
  setTimeout(()=>{
   state={...state,active};
   // Receiver receives an immediate event from the timer controller.
   // Sender must independently fetch the room's timer state, without this event.
   if(owner)window.dispatchEvent(new CustomEvent('blackcell:redline:timer-status',{
    detail:{roomId,status:{...state,server_now:new Date().toISOString()}}
   }));
  },1000);
  setTimeout(()=>{
   const box=document.querySelector('.redline-message-feed .redline-chat-timer[data-timer-phase="active"]');
   document.body.dataset.timerStartVisible=String(Boolean(box&&box.textContent.includes('TIMER STARTED')&&
    /^\$0\.\d{4} earned$/.test(box.querySelector('.redline-chat-timer-amount')?.textContent||'')&&
    !box.querySelector('.redline-chat-timer-amount')?.textContent.includes('$0.0000')&&
    box.textContent.includes('$0.0100/second')));
   document.body.dataset.timerCorrectRoom=String(Boolean(
    box&&(owner?box.closest('#redlineReceiverChatMount'):box.closest('#redlineSimpleSender'))));
   document.body.dataset.timerPinnedDuring=String(Boolean(box?.classList.contains('redline-chat-timer-pinned')));
  },3800);
  setTimeout(()=>{
   const stoppedAt=new Date().toISOString();
   state={ok:true,server_now:stoppedAt,active:null,recent:[{
    id:timerId,photo_id:photoId,rate_cents:60,started_at:startedAt,
    stopped_at:stoppedAt,earned_cents:15,completed_minutes:0,elapsed_seconds:15,settled_at:null
   }]};
   if(owner)window.dispatchEvent(new CustomEvent('blackcell:redline:timer-status',{
    detail:{roomId,status:state}
   }));
  },4250);
  setTimeout(()=>{
   const box=document.querySelector('.redline-message-feed .redline-chat-timer[data-timer-phase="stop"]');
   document.body.dataset.timerStopVisible=String(Boolean(box&&box.textContent.includes('TIMER STOPPED')&&box.textContent.includes('$0.15 final')));
   document.body.dataset.timerStartPreserved=String(Boolean(document.querySelector('.redline-message-feed .redline-chat-timer[data-timer-phase="start"]')));
   document.body.dataset.timerNoDuplicate=String(document.querySelectorAll('.redline-message-feed .redline-chat-timer[data-timer-phase="stop"]').length===1);
   document.body.dataset.timerUnpinnedAfter=String(!document.querySelector('.redline-message-feed .redline-chat-timer-pinned'));
  },7200);
 });
 </script>
 <script src="/private-photo-ledger-simple-sender.js" defer></script>`;
page=page.replace('</head>',setup+'</head>');
const server=createServer((req,res)=>{
 if(req.url?.startsWith('/test.html')){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(page);return;
 }
 if(req.url?.startsWith('/private-photo-ledger-simple-sender.js')){
  res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
  res.end(readFileSync('private-photo-ledger-simple-sender.js'));return;
 }
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
try{
 for(const role of ['owner','sender']){
  let stdout='',stderr='';
  const chrome=process.env.CHROME||'chromium';
  const child=spawn(chrome,[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--virtual-time-budget=9200','--window-size=1250,900','--dump-dom',
   'http://127.0.0.1:'+port+'/test.html?role='+role
  ]);
  child.stdout.on('data',d=>{stdout+=String(d)});
  child.stderr.on('data',d=>{stderr+=String(d)});
  const exit=await new Promise(resolve=>{
   const timer=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},35000);
   child.once('exit',code=>{clearTimeout(timer);resolve(code??1)});
   child.once('error',()=>{clearTimeout(timer);resolve(1)});
  });
  assert.equal(exit,0,role+' Chrome failed: '+stderr.slice(-950));
  for(const flag of ['timer-start-visible','timer-correct-room','timer-stop-visible',
    'timer-start-preserved','timer-no-duplicate','timer-pinned-during','timer-unpinned-after']){
   assert.match(stdout,new RegExp('data-'+flag+'="true"'),role+' '+flag+' missing');
  }
  assert.doesNotMatch(stdout,/data-timer-error="[^"]+"/,role+' uncaught exception');
  console.log(role+': verified START/STOP ledger events in private chat without refresh');
 }
}finally{await new Promise(resolve=>server.close(resolve))}
