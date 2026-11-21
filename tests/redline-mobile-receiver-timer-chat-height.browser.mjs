// REDLINE actual mobile receiver layout smoke: running timer + long conversation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';

let html=readFileSync('private-photo-ledger.html','utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const fixture=String.raw`<script>
window.addEventListener('error',e=>{
 document.body.dataset.mobileError=String(e.message||'error').replace(/[^a-z0-9]/gi,'_').slice(0,80);
});
const room='00000000-0000-4000-8000-000000000003';
const owner='00000000-0000-4000-8000-000000000004';
const member='00000000-0000-4000-8000-000000000005';
const photo='00000000-0000-4000-8000-000000000006';
const t0=Date.now();
const messages=Array.from({length:48},(_,i)=>({
 id:'00000000-0000-4000-8000-'+String(i+50).padStart(12,'0'),
 sender_id:i%2?owner:member,
 created_at:new Date(t0-(48-i)*30000).toISOString(),
 body:'REDLINE private conversation message '+String(i+1)+' with readable text.'
}));
let status={ok:true,server_now:new Date().toISOString(),active:null,recent:[]};
window.BLACKCELL_REDLINE_API={
 snapshot:()=>({roomId:room,userId:owner,peerName:'Sender',isOwner:true,
  roomActive:true,archiveMode:false,resetAt:null,photoSendingPaused:false,
  pending:1,owed:'$0.15',paid:'$0.00',assigned:'$0.15',entries:[],
  photoHistory:[{id:photo,caption:'Timed photo',image_url:'https://example.com/private-photo.jpg'}],
  ratingEvents:[],topPicks:[],fiveStarPhotos:[]}),
 loadMessages:async()=>messages,
 timerStatus:async()=>({...status,server_now:new Date().toISOString()})
};
function inspect(){
 const card=document.querySelector('#redlineReceiverChatMount .redline-message-card');
 const feed=card?.querySelector('.redline-message-feed');
 const slot=card?.querySelector('.redline-chat-timer-slot');
 const composer=card?.querySelector('.redline-message-composer');
 const timer=slot?.querySelector('.redline-chat-timer-pinned');
 const timerImage=timer?.querySelector('.redline-chat-timer-image');
 const cardRect=card?.getBoundingClientRect();
 const feedRect=feed?.getBoundingClientRect(),slotRect=slot?.getBoundingClientRect();
 const composerRect=composer?.getBoundingClientRect();
 document.body.dataset.mobileTall=String(Boolean(card&&card.clientHeight>=680&&feed.clientHeight>=180));
 document.body.dataset.mobileTimer=String(Boolean(timer&&timerImage&&
  timerImage.src==='https://example.com/private-photo.jpg'&&timer.textContent.includes('TIMER STARTED')));
 document.body.dataset.mobileSeparated=String(Boolean(timer&&!feed.contains(timer)&&
  slotRect.bottom<=feedRect.top+3&&slotRect.height<=240));
 document.body.dataset.mobileHistory=String(Boolean(feed&&feed.scrollHeight>feed.clientHeight&&
  feed.querySelectorAll('.redline-chat-bubble').length>=40&&
  feed.textContent.includes('message 1')&&feed.textContent.includes('message 48')));
 document.body.dataset.mobileComposer=String(Boolean(composerRect&&cardRect&&feedRect&&
  composerRect.top>=feedRect.bottom-3&&composerRect.bottom<=cardRect.bottom+3));
 document.body.dataset.mobileScroll=String(Boolean(feed&&getComputedStyle(feed).overflowY==='auto'));
 document.body.dataset.mobileCardHeight=String(card?.clientHeight||0);
 document.body.dataset.mobileFeedHeight=String(feed?.clientHeight||0);
}
document.addEventListener('DOMContentLoaded',()=>{
 const app=document.getElementById('ledgerApp');
 document.getElementById('accessGate').hidden=true;
 app.hidden=false;
 document.getElementById('ownerSetup').hidden=false;
 document.getElementById('activeRoom').hidden=false;
 document.getElementById('employeeUpload').hidden=true;
 window.dispatchEvent(new Event('blackcell:redline:bridge'));
 window.dispatchEvent(new Event('blackcell:redline:state'));
 setTimeout(()=>{
  status={ok:true,server_now:new Date().toISOString(),recent:[],
   active:{id:'00000000-0000-4000-8000-000000000007',
    photo_id:photo,rate_cents:60,started_at:new Date(t0-15000).toISOString(),
    heartbeat_at:new Date(t0+16000).toISOString(),running:true,earned_cents:15}};
  window.dispatchEvent(new CustomEvent('blackcell:redline:timer-status',{
   detail:{roomId:room,status}
  }));
 },1500);
 setTimeout(inspect,4800);
});
</script>
<script src="/private-photo-ledger-responsive.js" defer></script>
<script src="/private-photo-ledger-receiver.js" defer></script>
<script src="/private-photo-ledger-simple-sender.js" defer></script>`;
html=html.replace('</head>',fixture+'</head>');
const server=createServer((req,res)=>{
 const route=(req.url||'').split('?')[0];
 if(route==='/test.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;
 }
 if(!/^\/[a-zA-Z0-9-]+\.(?:css|js)$/.test(route)){
  res.writeHead(404);res.end();return;
 }
 try{
  const content=readFileSync(basename(route));
  res.writeHead(200,{'content-type':route.endsWith('.css')?'text/css':'text/javascript'});
  res.end(content);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 for(const [w,h] of [[390,844],[440,956]]){
  let stdout='',stderr='';
  const child=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--virtual-time-budget=7600','--window-size='+w+','+h,'--dump-dom',
   'http://127.0.0.1:'+server.address().port+'/test.html'
  ]);
  child.stdout.on('data',d=>{stdout+=d.toString()});
  child.stderr.on('data',d=>{stderr+=d.toString()});
  const exit=await new Promise(resolve=>{
   const tm=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},35000);
   child.once('exit',code=>{clearTimeout(tm);resolve(code??1)});
   child.once('error',()=>{clearTimeout(tm);resolve(1)});
  });
  assert.equal(exit,0,w+'px Chrome error: '+stderr.slice(-700));
  for(const flag of ['mobile-tall','mobile-timer','mobile-separated',
   'mobile-history','mobile-composer','mobile-scroll']){
   assert.match(stdout,new RegExp('data-'+flag+'="true"'),w+'px '+flag+
    ' failed: '+(stdout.match(/data-mobile-(?:card|feed)-height="[^"]*"/g)||[]).join(' '));
  }
  assert.doesNotMatch(stdout,/data-mobile-error="[^"]+"/,w+'px uncaught error');
  console.log('REDLINE receiver '+w+'px: tall chat, pinned timer, scrollable 48 messages and composer passed');
 }
}finally{await new Promise(resolve=>server.close(resolve))}
