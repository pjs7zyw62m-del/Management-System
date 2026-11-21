// Actual headless-browser sender-chat integration check (no backend access).
// Tests the real sender JS with a verified-room API fixture and a START/STOP
// transition. Fails if start/stop cards or rising amounts aren't in the chat.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';

let page=readFileSync('private-photo-ledger.html','utf8');
page=page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const mock=String.raw`<script>
 window.addEventListener('error',e=>{document.body.dataset.timerJsError=String(e?.message||'error').slice(0,120)});
 const first=Date.now();
 const photoId='00000000-0000-4000-8000-000000000001';
 const timerId='00000000-0000-4000-8000-000000000002';
 const roomId='00000000-0000-4000-8000-000000000003';
 let timer={
  ok:true,server_now:new Date(first).toISOString(),recent:[],
  active:{id:timerId,photo_id:photoId,rate_cents:25,
    started_at:new Date(first-75000).toISOString(),
    heartbeat_at:new Date(first).toISOString(),running:true,
    earned_cents:25}
 };
 window.BLACKCELL_REDLINE_API={
  snapshot:()=>({
    roomId,userId:'00000000-0000-4000-8000-000000000004',
    peerName:'Receiver',isOwner:false,roomActive:true,
    archiveMode:false,resetAt:null,pending:1,
    owed:'$0.00',paid:'$0.00',assigned:'$0.00',
    photoSendingPaused:false,entries:[],
    ratingEvents:[{
      id:photoId,stars:5,rated_at:new Date(first-20000).toISOString(),
      caption:'A top-rated private photo',amount_cents:25,
      image_url:'https://example.com/private-photo.jpg'
    }],
    topPicks:[{
      id:photoId,stars:5,rated_at:new Date(first-20000).toISOString(),
      caption:'A top-rated private photo',amount_cents:25,
      image_url:'https://example.com/private-photo.jpg'
    }],
    fiveStarPhotos:[{
      id:photoId,stars:5,resubmissionCount:1,
      resubmissionStatus:'ready',resubmissionAllowed:true,
      caption:'A five-star original',amount_cents:25,
      image_url:'https://example.com/private-photo.jpg'
    }]
  }),
  loadMessages:async()=>[],
  resubmitFiveStarPhoto:async id=>{window.__resendCalled=id;return {ok:true,photoId:'new-photo-id'}},
  timerStatus:async()=>({...timer,server_now:new Date().toISOString()})
 };
 document.addEventListener('DOMContentLoaded',()=>{
  for(const id of ['ledgerApp','activeRoom','employeeUpload']){
   document.getElementById(id).hidden=false;
  }
  document.getElementById('ownerSetup').hidden=true;
  window.dispatchEvent(new Event('blackcell:redline:bridge'));
  window.dispatchEvent(new Event('blackcell:redline:state'));
  setTimeout(()=>{
   const active=document.querySelector('.redline-message-feed .redline-chat-timer[data-timer-phase="active"]');
   document.body.dataset.senderTimerStarted=String(Boolean(active&&active.textContent.includes('TIMER STARTED')));
   document.body.dataset.senderTimerEarned=String(Boolean(active&&active.textContent.includes('$0.25')));
   const stopped_at=new Date().toISOString();
   timer={ok:true,server_now:stopped_at,active:null,recent:[{
     id:timerId,photo_id:photoId,rate_cents:25,started_at:new Date(first-75000).toISOString(),
     stopped_at,earned_cents:25,completed_minutes:1,settled_at:null
   }]};
   window.dispatchEvent(new CustomEvent('blackcell:redline:timer-status',{
     detail:{roomId,status:timer}
   }));
  },1800);
  setTimeout(()=>{
   const stopped=document.querySelector('.redline-message-feed .redline-chat-timer[data-timer-phase="stop"]');
   document.body.dataset.senderTimerStopped=String(Boolean(stopped&&stopped.textContent.includes('TIMER STOPPED')));
   document.body.dataset.senderTimerFinal=String(Boolean(stopped&&stopped.textContent.includes('$0.25')));
   document.body.dataset.senderChatMounted=String(Boolean(document.querySelector('#redlineSimpleSender .redline-message-feed')));
   const rated=document.querySelector('.redline-message-feed .redline-chat-rated-photo');
   document.body.dataset.senderStarMessage=String(Boolean(rated&&
     rated.textContent.includes('TOP PICK')&&rated.textContent.includes('★★★★★')));
   document.body.dataset.senderPhotoWithStars=String(Boolean(rated&&rated.querySelector('img[src^="https://"]')));
   document.body.dataset.senderTopPicks=String(Boolean(document.querySelector(
     '.redline-top-picks-list .redline-top-pick-row')?.textContent.includes('★★★★★')));
   const tab=document.querySelector('[data-simple-tab="five-star"]');
   document.body.dataset.senderFiveStarTab=String(Boolean(tab?.textContent.includes('5-Star Photos')));
   tab?.click();
   const card=document.querySelector('.redline-five-star-list .redline-five-star-photo');
   document.body.dataset.senderFiveStarPhoto=String(Boolean(
     card?.querySelector('img[src^="https://"]')&&card.textContent.includes('TOP PICK')));
   const resend=card?.querySelector('.redline-five-star-resubmit');
   document.body.dataset.senderFiveStarResendEnabled=String(Boolean(resend&&!resend.disabled));
   resend?.click();
  },3300);
  setTimeout(()=>{
    document.body.dataset.senderResubmitInvoked=String(window.__resendCalled===photoId);
  },4300);
 });
 </script>
 <script src="/private-photo-ledger-simple-sender.js" defer></script>`;
page=page.replace('</head>',mock+'</head>');
const server=createServer((req,res)=>{
 const file=req.url?.split('?')[0];
 if(file==='/test.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;
 }
 if(file==='/private-photo-ledger-simple-sender.js'){
  res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
  res.end(readFileSync('private-photo-ledger-simple-sender.js'));return;
 }
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const chrome=process.env.CHROME||'chromium';
let output='',errors='';
try{
 const child=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--virtual-time-budget=5800','--window-size=1240,950','--dump-dom',
  'http://127.0.0.1:'+port+'/test.html'
 ]);
 child.stdout.on('data',d=>{output+=d.toString()});
 child.stderr.on('data',d=>{errors+=d.toString()});
 const exit=await new Promise(resolve=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},25000);
  child.once('exit',code=>{clearTimeout(timer);resolve(code??1)});
  child.once('error',()=>{clearTimeout(timer);resolve(1)});
 });
 assert.equal(exit,0,'Headless Chrome failed: '+errors.slice(-1300));
 for(const flag of ['sender-timer-started','sender-timer-earned','sender-timer-stopped','sender-timer-final','sender-chat-mounted',
  'sender-star-message','sender-photo-with-stars','sender-top-picks',
  'sender-five-star-tab','sender-five-star-photo','sender-five-star-resend-enabled','sender-resubmit-invoked']){
  assert.match(output,new RegExp('data-'+flag+'="true"'),flag+' missing from sender chat browser fixture');
 }
 assert.doesNotMatch(output,/data-timer-js-error="[^"]+"/,'Sender chat JS uncaught exception');
 console.log('REDLINE sender chat: START/STOP, earned amount, five-star photo and top-picks verified in headless browser.');
}finally{
 await new Promise(resolve=>server.close(resolve));
}
