// REDLINE: real browser tests for two-person read receipts and typing signals.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

let page=readFileSync('private-photo-ledger.html','utf8');
page=page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
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
 {id:'00000000-0000-4000-8000-000000000011',sender_id:senderId,body:'Here is the photo.',created_at:sentAt},
 {id:'00000000-0000-4000-8000-000000000012',sender_id:ownerId,body:'I saw it.',created_at:replyAt}
];
let actions=[];
window.BLACKCELL_REDLINE_API={
 snapshot:()=>({roomId,userId:owner?ownerId:senderId,isOwner:owner,roomActive:true,
  peerName:owner?'Sender':'Receiver',archiveMode:false,resetAt:null,
  pending:0,owed:'$0.00',paid:'$0.00',assigned:'$0.00',
  entries:[],ratingEvents:[],topPicks:[],fiveStarPhotos:[],photoHistory:[]}),
 loadMessages:async()=>messages,
 chatStatus:async()=>({peerReadAt:replyAt,peerTyping:true}),
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
   'chat-typing-sent','chat-read-sent','chat-typing-stopped']){
   assert.match(stdout,new RegExp('data-'+flag+'="true"'),role+' '+flag+' missing');
  }
  assert.doesNotMatch(stdout,/data-chat-js-error="[^"]+"/,role+' uncaught error');
  console.log(role+': private read receipt and typing indicator visible, room-scoped signals sent');
 }
}finally{await new Promise(resolve=>server.close(resolve))}
