/* BLACKCELL iMessage: Android 11 empty inbox recovery.
 * This tests code paths without accessing private messages or credentials.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const chat=readFileSync('corporate-chat.js','utf8');
const html=readFileSync('corporate-chat.html','utf8');
const watchdog=readFileSync('corporate-chat-inbox-watchdog.js','utf8');

test('authenticated contacts render before realtime or WebSocket connection',()=>{
 const bootStart=chat.indexOf('async function boot(){');
 const paint=chat.indexOf('  renderPeers();\n  void refreshInboxSummaries();',bootStart);
 const subscribe=chat.indexOf("client.channel('blackcell-chat-'+self)",bootStart);
 assert.ok(bootStart>0&&paint>bootStart&&subscribe>paint);
 assert.match(chat,/try\{\s*client\.channel\('blackcell-chat-'\+self\)/);
 assert.match(chat,/catch\(_\)\{\s*\/\/ Realtime is optional for initial contact and history retrieval/);
});
test('network failures are safely retried, not treated as signed-out or wiped messages',()=>{
 const start=chat.indexOf('async function boot(){'),end=chat.indexOf('\nfunction formatChatDay(',start);
 const source=chat.slice(start,end);
 assert.match(source,/corporateAuthorize\(client,\{classifyTransport:true\}\)/);
 assert.match(source,/member\.reason==='verification-error'/);
 assert.match(source,/const \{data,error\}=await withInboxDeadline\(client\.rpc\('corp_chat_peers'\)\)/);
 assert.match(source,/showInboxStartupProblem\(message,\{retry:true\}\)/);
 assert.match(source,/window\.BLACKCELL_CHAT_RETRY=/);
 assert.match(source,/window\.addEventListener\('online'/);
 assert.doesNotMatch(source,/auth\.signOut|corp_employee_end_session|DELETE FROM|\.delete\(/);
});
test('visible Retry Contacts fallback survives ESM startup failure and keeps auth intact',()=>{
 assert.match(html,/id="chatStartupRecovery" class="chat-startup-recovery" role="status" hidden/);
 assert.match(html,/id="retryContacts"/);
 assert.match(html,/corporate-chat-inbox-watchdog\.js\?v=20261122-android11-retry1/);
 assert.match(html,/corporate-chat\.js\?v=20261122-android-keyboard-return10/);
 assert.match(watchdog,/if\(typeof window\.BLACKCELL_CHAT_RETRY==='function'\)/);
 assert.match(watchdog,/location\.reload\(\)/);
 assert.doesNotMatch(watchdog,/auth\.signOut|localStorage\.clear|sessionStorage\.clear|corp_chat_messages/);
});
const fixture=ready=>{
 const peer=ready
  ? '<div id="peers"><button class="peer">Authorized contact</button></div>'
  : '<div id="peers"><p class="empty">Checking contacts…</p></div>';
 return '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>'+
  '<div id="systemStatus" hidden></div>'+peer+
  '<div id="chatStartupRecovery" hidden><p id="chatStartupRecoveryMessage"></p><button type="button" id="retryContacts">RETRY CONTACTS</button></div>'+
  '<script>window.BLACKCELL_CHAT_RETRY=()=>{document.body.dataset.retry="called"}</script>'+
  '<script>'+watchdog+'</script>'+
  '<script>setTimeout(()=>{const p=document.getElementById("chatStartupRecovery");document.body.dataset.visible=String(!p.hidden);if(!p.hidden)document.getElementById("retryContacts").click()},14800)</script>'+
  '</body></html>';
};
test('Android 11 recovery button appears after stalled startup and never overlays working contacts',async()=>{
 const server=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(fixture(req.url.includes('ready')));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  for(const ready of [false,true]){
   const child=spawn(process.env.CHROME||'chromium',[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--virtual-time-budget=16000','--window-size=360,740',
    '--user-agent=Mozilla/5.0 (Linux; Android 11; Neon Smarta 2) AppleWebKit/537.36 Chrome/110.0.0.0 Mobile Safari/537.36',
    '--dump-dom','http://127.0.0.1:'+server.address().port+'/?'+(ready?'ready':'stalled')
   ]);
   let out='',err='';
   child.stdout.on('data',d=>out+=d.toString());
   child.stderr.on('data',d=>err+=d.toString());
   const code=await new Promise(resolve=>{
    const watchdog=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},20000);
    child.once('exit',x=>{clearTimeout(watchdog);resolve(x??1)});
    child.once('error',()=>{clearTimeout(watchdog);resolve(1)});
   });
   assert.equal(code,0,err.slice(-800));
   if(ready){
    assert.match(out,/data-visible="false"/,'Working inbox unexpectedly shows the retry panel');
    assert.doesNotMatch(out,/data-retry="called"/,'Working inbox must never auto-retry');
   }else{
    assert.match(out,/data-visible="true"/,'Stalled inbox must show retry');
    assert.match(out,/data-retry="called"/,'Retry button must call chat recovery');
   }
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});
