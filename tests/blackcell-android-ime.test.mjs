/* Android text direction / composition behavior: no mirrored input or IME reversal. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const html=readFileSync('corporate-chat.html','utf8');
const css=readFileSync('corporate-chat-obsidian.css','utf8');
const label=readFileSync('blackcell-os-device-label.js','utf8');
const input=html.match(/<textarea id="messageInput"[^>]*><\/textarea>/)?.[0];
test('iMessage text direction is automatic; no forced RTL or reversed letters',()=>{
 assert.ok(input,'Existing authenticated message composer must still be present');
 assert.match(input,/\sdir="auto"/);
 assert.match(input,/\sinputmode="text"/);
 assert.match(input,/\senterkeyhint="send"/);
 assert.match(css,/#messageInput\{/);
 assert.match(css,/unicode-bidi:plaintext!important/);
 assert.match(css,/writing-mode:horizontal-tb!important/);
 assert.match(label,/bc-os-android/);
});
test('Android Chromium: English follows LTR and Arabic follows RTL without changing values',async()=>{
 const fixture=[
  '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<style>',css,'</style></head><body class="bc-chat"><form class="composer"><div class="composer-input-wrap">',
  input,'</div></form><script>',
  "const box=document.getElementById('messageInput');box.disabled=false;",
  "function measure(value){box.value=value;box.dispatchEvent(new Event('input',{bubbles:true}));",
  "return {value:box.value,direction:getComputedStyle(box).direction,mode:getComputedStyle(box).writingMode};}",
  "const english=measure('Hello Android');const arabic=measure('مرحبا بك');",
  "document.body.dataset.english=String(english.value==='Hello Android'&&english.direction==='ltr');",
  "document.body.dataset.arabic=String(arabic.value==='مرحبا بك'&&arabic.direction==='rtl');",
  "document.body.dataset.horizontal=String(english.mode==='horizontal-tb');",
  "</script></body></html>"
 ].join('');
 const server=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(fixture);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/';
  const child=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--virtual-time-budget=1200','--window-size=390,844',
   '--user-agent=Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
   '--dump-dom',url
  ]);
  let out='',err='';
  child.stdout.on('data',data=>out+=data);
  child.stderr.on('data',data=>err+=data);
  const exit=await new Promise(resolve=>{
   const watchdog=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},20000);
   child.once('exit',code=>{clearTimeout(watchdog);resolve(code??1)});
   child.once('error',()=>{clearTimeout(watchdog);resolve(1)});
  });
  assert.equal(exit,0,'Chromium exited unexpectedly: '+err.slice(-500));
  for(const signal of ['english','arabic','horizontal'])
   assert.match(out,new RegExp('data-'+signal+'="true"'),'Android '+signal+' input should not be reversed');
 }finally{await new Promise(resolve=>server.close(resolve))}
});
