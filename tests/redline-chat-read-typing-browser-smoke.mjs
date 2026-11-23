// REDLINE: real browser tests for two-person read receipts and typing signals.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

let page=readFileSync('private-photo-ledger.html','utf8');
page=page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
// Fixed-height feed makes repeated scroll checks deterministic in headless
// Chrome even though this smoke harness does not load production CSS files.
page=page.replace('</head>',`<style>
.redline-message-card .redline-message-feed{
height:220px!important;max-height:220px!important;min-height:220px!important;
overflow-y:auto!important;display:flex!important;flex-direction:column!important;gap:4px!important;
}
.redline-message-feed>*{flex-shrink:0!important;min-height:28px!important}
</style></head>`);
const script=String.raw`<script>
window.addEventListener('error',e=>{document.body.dataset.chatJsError=String(e.message||'error').slice(0,150)});
const owner=new URLSearchParams(location.search).get('role')==='owner';
const roomId='00000000-0000-4000-8000-000000000003';
const senderId='00000000-0000-4000-8000-000000000005';
const ownerId='00000000-0000-4000-8000-000000000004';
const first=Date.now();
const sentAt=new Date(first-8000).toISOString();
const replyAt=new Date(first-7000).toISOString();
const messages=[
 ...Array.from({length:65},(_,i)=>({
  id:'historic-'+i,sender_id:i%2?senderId:ownerId,
  body:'Historic private photo conversation item '+i,
  created_at:new Date(first-4200000+i*30000).toISOString()
 })),
 {id:'00000000-0000-4000-8000-000000000011',sender_id:senderId,body:'Here is the photo.',created_at:sentAt},
 {id:'00000000-0000-4000-8000-000000000012',sender_id:ownerId,body:'I saw it.',created_at:replyAt}
];
let actions=[],currentReadAt=replyAt,savedAnchor=null,savedScrollTop=0;
let temporarySnapshotUnavailable=false;
window.BLACKCELL_REDLINE_API={
 snapshot:()=>temporarySnapshotUnavailable?null:({roomId,userId:owner?ownerId:senderId,isOwner:owner,roomActive:true,
  peerName:owner?'Sender':'Receiver',archiveMode:false,resetAt:null,
  pending:0,owed:'$0.00',paid:'$0.00',assigned:'$0.00',
  entries:[],ratingEvents:[],topPicks:[],fiveStarPhotos:[],photoHistory:[]}),
 loadMessages:async()=>messages,
 chatStatus:async()=>({peerReadAt:currentReadAt,peerTyping:true}),
 chatSignal:async(id,action,message)=>{actions.push({id,action,message});return true},
 timerStatus:async()=>({ok:true,server_now:new Date().toISOString(),active:null,recent:[]})
};
document.addEventListener('DOMContentLoaded',()=>{
 for(const id of ['ledgerApp','activeRoom','employeeUpload'])document.getElementById(id).hidden=false;
 document.getElementById('ownerSetup').hidden=!owner;
 if(owner){
  const chat=document.createElement('section');chat.id='redlineReceiverChat';
  const mount=document.createElement('div');mount.id='redlineReceiverChatMount';
  chat.append(mount);document.getElementById('activeRoom').append(chat);
 }
 window.dispatchEvent(new Event('blackcell:redline:bridge'));
 window.dispatchEvent(new Event('blackcell:redline:state'));
 setTimeout(()=>{
  const feed=document.querySelector('.redline-message-feed');
  const notice=document.querySelector('.redline-peer-typing');
  const read=feed?.querySelector('.redline-chat-bubble.is-mine .redline-chat-read-receipt');
  document.body.dataset.chatReadReceipt=String(Boolean(read&&read.textContent.includes('Read')));
  document.body.dataset.chatTypingIndicator=String(Boolean(notice&&!notice.hidden&&notice.textContent.includes('typing')));
  const visibleMount=owner?document.getElementById('redlineReceiverChatMount'):
   document.getElementById('redlineSimpleSender');
  document.body.dataset.chatCorrectMount=String(Boolean(feed&&visibleMount?.contains(feed)));
  const entry=document.querySelector('.redline-message-entry');
  entry.value='Writing a private reply';
  entry.dispatchEvent(new Event('input',{bubbles:true}));
 },2700);
 setTimeout(()=>{
  document.body.dataset.chatTypingSent=String(actions.some(a=>a.action==='typing'&&a.id===roomId));
  document.body.dataset.chatReadSent=String(actions.some(a=>a.action==='read'&&a.id===roomId));
  document.querySelector('.redline-message-entry').dispatchEvent(new Event('blur'));
 },3400);
 setTimeout(()=>{
  document.body.dataset.chatTypingStopped=String(actions.some(a=>a.action==='stopped'&&a.id===roomId));
 },4000);
 // User has scrolled into history. Simulate a newer message and receipt
 // update; neither may reset the scroller or replace the old message DOM.
 setTimeout(()=>{
  const feed=document.querySelector('.redline-message-feed');
  if(!feed)return;
  document.body.dataset.chatLongThread=String(feed.scrollHeight>feed.clientHeight+400);
  // Real reading gesture (instead of a test-only programmatic scroll)
  // activates the durable anchor across hidden-panel and size changes.
  feed.dispatchEvent(new WheelEvent('wheel',{deltaY:-180,bubbles:true}));
  feed.scrollTop=142;
  feed.dispatchEvent(new Event('scroll'));
  savedScrollTop=feed.scrollTop;
  savedAnchor=feed.querySelector('[data-redline-item-key="message:historic-10#0"]');
  currentReadAt=new Date(first+1000).toISOString();
  // Simulate the owner chat temporarily losing its verified room snapshot.
  if(owner){
   temporarySnapshotUnavailable=true;
   document.getElementById('redlineReceiverChat').hidden=true;
   window.dispatchEvent(new Event('blackcell:redline:state'));
   // Chrome may discard the feed scroll offset while flex box is hidden.
   feed.scrollTop=0;
   setTimeout(()=>{
    temporarySnapshotUnavailable=false;
    document.getElementById('redlineReceiverChat').hidden=false;
    window.dispatchEvent(new Event('blackcell:redline:state'));
   },150);
  }
  messages.push({id:'follow-up-'+(owner?'sender':'owner'),
   sender_id:owner?senderId:ownerId,
   body:'Newest private message arrived while reading history',
   created_at:new Date(first+1400).toISOString()});
  window.dispatchEvent(new Event('blackcell:redline:messages-changed'));
 },4400);
 setTimeout(()=>{
  const feed=document.querySelector('.redline-message-feed');
  document.body.dataset.chatScrollStable=String(Boolean(feed&&
   Math.abs(feed.scrollTop-savedScrollTop)<3));
  document.body.dataset.chatDomStable=String(Boolean(savedAnchor&&savedAnchor.isConnected&&
   feed.contains(savedAnchor)));
  document.body.dataset.chatNewMessage=String(Boolean(feed?.textContent?.includes(
   'Newest private message arrived while reading history')));
  document.body.dataset.chatStableMount=String(Boolean(!owner||
   document.getElementById('redlineReceiverChatMount')?.contains(feed)));
 },5600);
});
</script>
<script src="/private-photo-ledger-simple-sender.js" defer></script>`;
page=page.replace('</head>',script+'</head>');
const server=createServer((req,res)=>{
 if(req.url?.startsWith('/test.html')){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;
 }
 if(req.url?.startsWith('/private-photo-ledger-simple-sender.js')){
  res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
  res.end(readFileSync('private-photo-ledger-simple-sender.js'));return;
 }
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 for(const role of ['owner','sender']){
  const chrome=process.env.CHROME||'chromium';
  let stdout='',stderr='';
  const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',
   '--disable-dev-shm-usage','--virtual-time-budget=6500','--window-size=1100,800',
   '--dump-dom','http://127.0.0.1:'+server.address().port+'/test.html?role='+role]);
  child.stdout.on('data',data=>{stdout+=String(data)});
  child.stderr.on('data',data=>{stderr+=String(data)});
  const exit=await new Promise(resolve=>{
   const timer=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},35000);
   child.once('exit',code=>{clearTimeout(timer);resolve(code??1)});
   child.once('error',()=>{clearTimeout(timer);resolve(1)});
  });
  assert.equal(exit,0,role+' browser failed: '+stderr.slice(-1000));
  for(const flag of ['chat-read-receipt','chat-typing-indicator','chat-correct-mount',
   'chat-typing-sent','chat-read-sent','chat-typing-stopped',
   'chat-long-thread','chat-scroll-stable','chat-dom-stable','chat-new-message','chat-stable-mount']){
   assert.match(stdout,new RegExp('data-'+flag+'="true"'),role+' '+flag+' missing');
  }
  assert.doesNotMatch(stdout,/data-chat-js-error="[^"]+"/,role+' uncaught error');
  console.log(role+': read/typing verified and history scroll retained across incoming message');
 }
}finally{await new Promise(resolve=>server.close(resolve))}
