/* Sender REDLINE messenger works alongside the original verified-room chat. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
let html=readFileSync('private-photo-ledger.html','utf8')
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
 .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'');
const css=readFileSync('private-photo-ledger-sender-messenger.css','utf8');
const fixture=`<script>
window.addEventListener('error',e=>{
 document.body.dataset.senderMessengerError=String(e?.message||'unknown').slice(0,130);
});
const now=Date.now(),roomId='00000000-0000-4000-8000-000000000003',
 senderId='00000000-0000-4000-8000-000000000004',
 photoId='00000000-0000-4000-8000-000000000001';
const messages=[];
const timer={
 ok:true,server_now:new Date(now).toISOString(),recent:[],
 active:{id:'00000000-0000-4000-8000-000000000002',photo_id:photoId,
  rate_cents:60,started_at:new Date(now-15000).toISOString(),
  heartbeat_at:new Date(now).toISOString(),running:true,earned_cents:15}
};
window.BLACKCELL_REDLINE_UPLOAD_UI={open:()=>{document.body.dataset.senderMessengerSourceRequested='true'}};
window.BLACKCELL_REDLINE_API={
 snapshot:()=>({
  roomId,userId:senderId,peerName:'Chadwick',isOwner:false,
  roomActive:true,photoSendingPaused:false,archiveMode:false,resetAt:null,
  pending:1,owed:'$18.00',paid:'$7.00',assigned:'$25.00',
  entries:[],photoHistory:[],paymentHistory:[],ratingEvents:[],fiveStarPhotos:[],topPicks:[]
 }),
 loadMessages:async()=>messages.slice(),
 sendMessage:async body=>{
  messages.push({id:String(messages.length+1),sender_id:senderId,
   body,created_at:new Date().toISOString()});return true;
 },
 chatStatus:async()=>({peerTyping:false,peerReadAt:null}),
 chatSignal:async()=>true,
 timerStatus:async()=>({...timer,server_now:new Date().toISOString()}),
 currentlyViewingStatus:async()=>({active:false,photoId:null})
};
document.addEventListener('DOMContentLoaded',()=>{
 for(const id of ['ledgerApp','activeRoom','employeeUpload'])
  document.getElementById(id).hidden=false;
 document.getElementById('ownerSetup').hidden=true;
 window.dispatchEvent(new Event('blackcell:redline:bridge'));
 window.dispatchEvent(new Event('blackcell:redline:state'));
 setTimeout(()=>{
  const chat=document.querySelector('#redlineSimpleSender .redline-message-card');
  const pane=document.querySelector('[data-redline-pane="upload"]');
  const live=document.querySelector('#redlineSenderLiveSession');
  const entry=chat?.querySelector('.redline-message-entry');
  document.body.dataset.senderMessengerChatFirst=String(pane?.firstElementChild===chat);
  document.body.dataset.senderMessengerComposer=String(Boolean(entry&&!entry.disabled));
  document.body.dataset.senderMessengerApproved=String(
   live?.querySelector('.is-approved strong')?.textContent==='$25.00');
  document.body.dataset.senderMessengerOwed=String(Boolean(
   live?.textContent.includes('Outstanding $18.00')&&live?.textContent.includes('Recorded paid $7.00')));
  document.body.dataset.senderMessengerTimer=String(Boolean(
   live?.querySelector('.is-timer strong')?.textContent.startsWith('$0.')&&
   !live?.querySelector('.is-timer strong')?.textContent.includes('$0.0000')));
  document.body.dataset.senderMessengerPhotoPinned=String(Boolean(
   chat?.querySelector('.redline-chat-timer-slot [data-timer-phase="active"]')));
  const plus=chat?.querySelector('.redline-chat-photo');
  plus?.click();
  document.body.dataset.senderMessengerUpload=String(document.body.dataset.senderMessengerSourceRequested==='true');
  // The REDLINE + opens the new source chooser, not the legacy upload drawer.
  document.body.dataset.senderMessengerUploadClosed=String(Boolean(
   !document.querySelector('#redlineSenderMessengerUpload')?.open));
  if(entry){
   entry.value='Chat while the timer runs';
   chat.querySelector('.redline-message-composer')?.requestSubmit();
  }
 },1700);
 setTimeout(()=>{
  document.body.dataset.senderMessengerSent=String(Boolean(
   document.querySelector('.redline-message-feed .redline-chat-bubble.is-mine')
    ?.textContent.includes('Chat while the timer runs')));
 },3200);
});
</script>
<script src="/private-photo-ledger-simple-sender.js" defer></script>
<script src="/private-photo-ledger-sender-messenger.js" defer></script>`;
html=html.replace('</head>','<style>'+css+'</style>'+fixture+'</head>');
const server=createServer((req,res)=>{
 const file=req.url?.split('?')[0];
 if(file==='/test.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;
 }
 if(file==='/private-photo-ledger-simple-sender.js'||file==='/private-photo-ledger-sender-messenger.js'){
  res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
  res.end(readFileSync(file.slice(1)));return;
 }
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let output='',errors='';
try{
 const child=spawn(process.env.CHROME||'chromium',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--virtual-time-budget=4800','--window-size=440,956','--dump-dom',
  'http://127.0.0.1:'+server.address().port+'/test.html'
 ]);
 child.stdout.on('data',d=>{output+=d.toString()});
 child.stderr.on('data',d=>{errors+=d.toString()});
 const exit=await new Promise(resolve=>{
  const watchdog=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},25000);
  child.once('exit',code=>{clearTimeout(watchdog);resolve(code??1)});
  child.once('error',()=>{clearTimeout(watchdog);resolve(1)});
 });
 assert.equal(exit,0,'Headless Chrome failed: '+errors.slice(-1200));
 for(const flag of ['chat-first','composer','approved','owed','timer',
  'photo-pinned','upload','upload-closed','sent']){
  assert.match(output,new RegExp('data-sender-messenger-'+flag+'="true"'),
   'Sender chat integration failed: '+flag);
 }
 const browserError=output.match(/data-sender-messenger-error="([^"]+)"/);
 if(browserError)console.error('REDLINE browser runtime error: '+browserError[1]);
 assert.equal(browserError,null,'Unexpected browser JS exception');
 console.log('Sender REDLINE: messenger, live timer, earnings, photo upload and chat verified.');
}finally{
 await new Promise(resolve=>server.close(resolve));
}
