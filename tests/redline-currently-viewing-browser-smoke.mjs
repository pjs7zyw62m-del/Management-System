import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
let html=readFileSync('private-photo-ledger.html','utf8')
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const fixture=String.raw`<script>
window.addEventListener('error',e=>{document.body.dataset.liveError=String(e.message||'error')});
const roomId='00000000-0000-4000-8000-000000000031',a='00000000-0000-4000-8000-000000000032',b='00000000-0000-4000-8000-000000000033';
let selected=a,polls=0;
const history=[{id:a,caption:'Photo A',image_url:'https://example.com/redline-a.jpg',decision_status:'pending'},
{id:b,caption:'Photo B',image_url:'https://example.com/redline-b.jpg',decision_status:'pending'}];
window.BLACKCELL_REDLINE_API={
 snapshot:()=>({roomId,isOwner:false,userId:'00000000-0000-4000-8000-000000000035',peerName:'Receiver',
 roomActive:true,archiveMode:false,resetAt:null,pending:2,owed:'$0.00',paid:'$0.00',assigned:'$0.00',
 entries:[],ratingEvents:[],topPicks:[],fiveStarPhotos:[],photoHistory:history}),
 loadMessages:async()=>[],timerStatus:async()=>({ok:true,server_now:new Date().toISOString(),active:null,recent:[]}),
 currentlyViewingStatus:async(id)=>{if(id===roomId)polls++;return {photoId:selected,active:true}}
};
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('ledgerApp').hidden=false;
 document.getElementById('activeRoom').hidden=false;
 document.getElementById('employeeUpload').hidden=false;
 window.dispatchEvent(new Event('blackcell:redline:state'));
 setTimeout(()=>{document.querySelector('[data-simple-tab="viewing"]')?.click()},650);
 setTimeout(()=>{
  const p=document.querySelector('[data-redline-pane="viewing"]');
  document.body.dataset.firstPhoto=String(Boolean(
   p&&!p.hidden&&p.querySelector('.redline-current-viewing-image')?.src===history[0].image_url));
  document.body.dataset.fiveTabs=String(document.querySelectorAll('#redlineSimpleSender [data-simple-tab]').length===5);
 },2200);
 setTimeout(()=>{selected=b},3100);
 setTimeout(()=>{
  const p=document.querySelector('[data-redline-pane="viewing"]');
  document.body.dataset.nextPhoto=String(Boolean(
   p?.querySelector('.redline-current-viewing-image')?.src===history[1].image_url));
  document.body.dataset.roomPolls=String(polls>=2);
 },6700);
});
</script><script src="/private-photo-ledger-simple-sender.js" defer></script>`;
html=html.replace('</head>',fixture+'</head>');
const server=createServer((req,res)=>{
 const p=(req.url||'').split('?')[0];
 if(p==='/test.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}
 if(p==='/private-photo-ledger-simple-sender.js'){
  res.writeHead(200,{'content-type':'text/javascript'});
  res.end(readFileSync('private-photo-ledger-simple-sender.js'));return;
 }
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let stdout='',stderr='';
try{
 const chrome=process.env.CHROME||'chromium';
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--virtual-time-budget=8500','--window-size=1200,900','--dump-dom',
  'http://127.0.0.1:'+server.address().port+'/test.html']);
 child.stdout.on('data',d=>{stdout+=d.toString()});
 child.stderr.on('data',d=>{stderr+=d.toString()});
 const code=await new Promise(resolve=>{
  const tm=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},35000);
  child.once('exit',status=>{clearTimeout(tm);resolve(status??1)});
  child.once('error',()=>{clearTimeout(tm);resolve(1)});
 });
 assert.equal(code,0,'Chromium browser failed: '+stderr.slice(-1200));
 for(const key of ['first-photo','five-tabs','next-photo','room-polls'])
  assert.match(stdout,new RegExp('data-'+key+'="true"'),key+' sender viewing test failed');
 assert.doesNotMatch(stdout,/data-live-error="[^"]+"/,'Sender JavaScript error');
 console.log('REDLINE Currently Viewing: five tabs and two live receiver-selected photographs passed.');
}finally{await new Promise(resolve=>server.close(resolve))}
