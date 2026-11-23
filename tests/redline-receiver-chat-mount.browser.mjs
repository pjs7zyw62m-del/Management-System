import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';
let page=readFileSync('private-photo-ledger.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const fixture="<script>\nwindow.addEventListener('error',e=>{document.body.dataset.chatError=String(e.message||'unknown').slice(0,160)});\nconst roomId='00000000-0000-4000-8000-000000000003';\nwindow.BLACKCELL_REDLINE_API={\n snapshot:()=>({roomId,isOwner:true,roomActive:true,archiveMode:false,resetAt:null,\n  userId:'00000000-0000-4000-8000-000000000004',peerName:'Sender',\n  pending:0,owed:'$0.20',paid:'$0.00',assigned:'$0.20',\n  entries:[],photoHistory:[],paymentSummary:{},photoSendingPaused:false})\n};\nfor(const id of ['ledgerApp','ownerSetup','activeRoom']){\n const el=document.getElementById(id);if(el)el.hidden=false;\n}\n</script>\n<script src=\"/private-photo-ledger-receiver.js\"></script><script>\nwindow.addEventListener('error',e=>{document.body.dataset.chatError=String(e.message||'unknown').slice(0,160)});\nsetTimeout(()=>{\n const panel=document.getElementById('redlineReceiverChat');\n const workspace=document.getElementById('redlineReceiverLiveWorkspace');\n const right=document.getElementById('rrAppleRight');\n const mount=document.getElementById('redlineReceiverChatMount');\n const card=document.createElement('section');card.className='redline-message-card';\n const feed=document.createElement('div');feed.className='redline-message-feed';\n for(let i=0;i<75;i++){\n  const item=document.createElement('article');\n  item.className='redline-chat-event';\n  item.textContent='REDLINE history message '+i+' keeping my place during live refreshes';\n  item.style.cssText='flex-shrink:0;min-height:39px;padding:10px';\n  feed.append(item);\n }\n card.append(feed);mount?.append(card);\n if(!panel||!workspace||!right||!mount||panel.parentNode!==right){\n  document.body.dataset.chatReady='false';\n  document.body.dataset.chatDetails=JSON.stringify({panel:!!panel,workspace:!!workspace,right:!!right,\n   mount:!!mount,parent:panel?.parentNode?.id||'',width:innerWidth});return;\n }\n feed.style.cssText='height:260px!important;min-height:260px!important;max-height:260px!important;overflow-y:auto!important;display:flex;flex-direction:column';\n feed.scrollTop=240;\n document.body.dataset.chatReady=String(feed.scrollTop>200);\n const initial=feed.scrollTop;\n let moves=0,removals=0;\n const mutation=new MutationObserver(records=>{\n  for(const entry of records){\n   if([...entry.addedNodes].includes(panel))moves++;\n   if([...entry.removedNodes].includes(panel))removals++;\n  }\n });\n mutation.observe(workspace,{childList:true});mutation.observe(right,{childList:true});\n let polls=0;\n const interval=setInterval(()=>{\n  window.dispatchEvent(new Event('blackcell:redline:state'));\n  window.dispatchEvent(new Event('blackcell:redline:session-mode'));\n  if(++polls>=24){\n   clearInterval(interval);\n   setTimeout(()=>{\n    mutation.disconnect();\n    document.body.dataset.chatNoDetach=String(removals===0&&moves===0&&panel.parentNode===right);\n    document.body.dataset.chatPositionStable=String(Math.abs(feed.scrollTop-initial)<4);\n    document.body.dataset.chatDetails=JSON.stringify({\n     width:innerWidth,removals,moves,initial,final:feed.scrollTop,polls,parent:panel.parentNode?.id||''\n    });\n   },220);\n  }\n },105);\n},1500);\n</script>";
page=page.replace('</body>',fixture+'</body>');
const server=createServer((req,res)=>{
 const pathname=(req.url||'').split('?')[0];
 if(pathname==='/test.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;
 }
 if(!/^\/[\w.-]+\.(css|js)$/.test(pathname)){res.writeHead(404).end();return}
 try{
  res.writeHead(200,{'content-type':pathname.endsWith('.css')?'text/css':'text/javascript'});
  res.end(readFileSync(basename(pathname)));
 }catch{res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
try{
 for(const width of [1500,920]){
  let stdout='',stderr='';
  const child=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--window-size='+width+',900','--virtual-time-budget=6700','--dump-dom',
   'http://127.0.0.1:'+server.address().port+'/test.html'
  ]);
  child.stdout.on('data',d=>stdout+=d.toString());child.stderr.on('data',d=>stderr+=d.toString());
  const code=await new Promise(done=>{
   const timeout=setTimeout(()=>{child.kill('SIGKILL');done(124)},30000);
   child.on('exit',v=>{clearTimeout(timeout);done(v??1)});
   child.on('error',()=>{clearTimeout(timeout);done(1)});
  });
  assert.equal(code,0,'Chrome failed: '+stderr.slice(-900));
  for(const key of ['chat-ready','chat-no-detach','chat-position-stable'])
   assert.match(stdout,new RegExp('data-'+key+'="true"'),
    width+'px failed '+key+' details '+(stdout.match(/data-chat-details="[^"]*"/)||[])[0]);
  assert.doesNotMatch(stdout,/data-chat-error="[^"]+"/,width+'px browser error');
  console.log('REDLINE '+width+'px: 24 live updates kept same chat parent and preserved scroll');
 }
}finally{await new Promise(done=>server.close(done))}
