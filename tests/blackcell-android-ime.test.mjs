/* BLACKCELL iMessage Android editor regression.
 * REDLINE works with a plain LTR composer; test the same editing baseline
 * even when an Android browser inherits a right-to-left page direction.
 * This browser emulation does not replace testing on a physical Gboard device.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

const html=readFileSync('corporate-chat.html','utf8');
const css=readFileSync('corporate-chat-obsidian.css','utf8');
const label=readFileSync('blackcell-os-device-label.js','utf8');
const redline=readFileSync('private-photo-ledger-simple-sender.js','utf8');
const input=html.match(/<textarea id="messageInput"[^>]*><\/textarea>/)?.[0];

test('iMessage uses REDLINE-like LTR editing, without plaintext bidi override',()=>{
 assert.ok(input,'Existing authenticated message composer must still be present');
 assert.match(input,/\sdir="ltr"/);
 assert.match(input,/\sinputmode="text"/);
 assert.match(input,/\senterkeyhint="send"/);
 assert.match(css,/body\.bc-chat \.composer \.composer-input-wrap #messageInput\{/);
 assert.match(css,/direction:ltr!important/);
 assert.match(css,/unicode-bidi:normal!important/);
 assert.match(css,/text-align:left!important/);
 assert.doesNotMatch(css,/unicode-bidi:plaintext!important/);
 assert.doesNotMatch(input,/\sdir="auto"/);
 assert.match(html,/corporate-chat-obsidian\.css\?v=20261122-android-ime-ltr2/);
 assert.match(redline,/make\('textarea','redline-message-entry'\)/);
 assert.match(label,/bc-os-android/);
});

test('Android Chrome editor keeps normal English order, cursor position, and LTR alignment',async()=>{
 const fixture=[
  '<!doctype html><html lang="en" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<style>',css,'</style></head><body class="bc-chat"><form class="composer"><div class="composer-input-wrap">',
  input,'</div></form><script>',
  "const box=document.getElementById('messageInput');box.disabled=false;box.focus();",
  "const start={dir:getComputedStyle(box).direction,align:getComputedStyle(box).textAlign,bidi:getComputedStyle(box).unicodeBidi};",
  "for(const char of 'hello android'){box.setRangeText(char,box.selectionStart,box.selectionEnd,'end');box.dispatchEvent(new Event('input',{bubbles:true}));}",
  "const typed={value:box.value,caret:box.selectionStart,end:box.selectionEnd,dir:getComputedStyle(box).direction,align:getComputedStyle(box).textAlign};",
  "box.value='';box.setSelectionRange(0,0);",
  "box.dispatchEvent(new CompositionEvent('compositionstart',{data:''}));",
  "box.setRangeText('hi there',box.selectionStart,box.selectionEnd,'end');",
  "box.dispatchEvent(new CompositionEvent('compositionend',{data:'hi there'}));",
  "const composed={value:box.value,caret:box.selectionStart};",
  "document.body.dataset.androidLtr=String(start.dir==='ltr'&&typed.dir==='ltr'&&start.align==='left'&&typed.align==='left'&&start.bidi==='normal');",
  "document.body.dataset.androidOrder=String(typed.value==='hello android'&&typed.caret===13&&typed.end===13);",
  "document.body.dataset.androidComposition=String(composed.value==='hi there'&&composed.caret===8);",
  '</script></body></html>'
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
   '--virtual-time-budget=1500','--window-size=390,844',
   '--user-agent=Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
   '--dump-dom',url
  ]);
  let output='',errors='';
  child.stdout.on('data',d=>{output+=d.toString()});
  child.stderr.on('data',d=>{errors+=d.toString()});
  const exit=await new Promise(resolve=>{
   const kill=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},20000);
   child.once('exit',code=>{clearTimeout(kill);resolve(code??1)});
   child.once('error',()=>{clearTimeout(kill);resolve(1)});
  });
  assert.equal(exit,0,'Chromium failed: '+errors.slice(-900));
  for(const flag of ['android-ltr','android-order','android-composition']){
   assert.match(output,new RegExp('data-'+flag+'="true"'),
    'Android iMessage input failed: '+flag);
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});


const chatCode=readFileSync('corporate-chat.js','utf8');
test('Android native composing handler has no textarea reflow and protects IME enter',()=>{
 assert.match(html,/corporate-chat\.js\?v=20261122-android-caret-recovery4/);
 assert.match(chatCode,/const androidNativeComposer=\/Android\/i\.test\(navigator\.userAgent\|\|''\)/);
 assert.match(chatCode,/if\(androidNativeComposer\|\|composerCompositionActive\)return/);
 assert.match(chatCode,/composerText\.addEventListener\('compositionstart'/);
 assert.match(chatCode,/composerText\.addEventListener\('compositionend'/);
 assert.match(chatCode,/!e\.isComposing&&!composerCompositionActive/);
 assert.match(chatCode,/if\(!composerCompositionActive&&!chatBlocked/);
 assert.doesNotMatch(chatCode,/composerText\.value\s*=\s*composerText\.value\.split\(''\)\.reverse/);
});
test('Android Chrome preserves active editing geometry through typing and composition events',async()=>{
 const start=chatCode.indexOf("const composerText=$('messageInput');");
 const end=chatCode.indexOf('\nlet messageMutationBusy=',start);
 const events=chatCode.indexOf("composerText.addEventListener('compositionstart',()=>",end);
 const after=chatCode.indexOf('\nfunction text(',events);
 assert.ok(start>=0&&end>start&&events>end&&after>events,'Actual live editor handlers must be loaded in the fixture');
 const script=[
  "const $=id=>document.getElementById(id);",
  "const liveCalls=[];const live={onInput:s=>liveCalls.push(s),stopTyping:()=>{}};",
  "let chatBlocked=false,blockKnown=true,blockBusy=false;",
  chatCode.slice(start,end),chatCode.slice(events,after),
  "const box=$('messageInput');box.disabled=false;box.focus();",
  "const add=(c)=>{box.setRangeText(c,box.selectionStart,box.selectionEnd,'end');box.dispatchEvent(new InputEvent('input',{bubbles:true,data:c,inputType:'insertText'}))};",
  "for(const c of 'Hello Android')add(c);",
  "document.body.dataset.nativeValue=String(box.value==='Hello Android'&&box.selectionStart===13);",
  "document.body.dataset.noReflow=String(box.style.height==='');",
  "const prior=liveCalls.length;",
  "box.dispatchEvent(new CompositionEvent('compositionstart',{data:''}));",
  "add('!');",
  "document.body.dataset.imeQuiet=String(liveCalls.length===prior&&box.style.height==='');",
  "box.dispatchEvent(new CompositionEvent('compositionend',{data:'!'}));",
  "document.body.dataset.imeResumed=String(liveCalls.length===prior+1&&liveCalls.at(-1)==='Hello Android!');",
  "document.body.dataset.nativeStill=String(box.value==='Hello Android!'&&box.style.height==='');"
 ].join('\n');
 const fixture='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bc-chat"><form id="sendForm" class="composer"><div class="composer-input-wrap">'+
 input+'</div></form><script>'+script+'</script></body></html>';
 const server=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(fixture);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const child=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--virtual-time-budget=1500','--window-size=390,844',
   '--user-agent=Mozilla/5.0 (Linux; Android 13; Neon Smarta 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
   '--dump-dom','http://127.0.0.1:'+server.address().port+'/'
  ]);
  let output='',err='';
  child.stdout.on('data',d=>output+=d.toString());
  child.stderr.on('data',d=>err+=d.toString());
  const exit=await new Promise(resolve=>{
   const watchdog=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},20000);
   child.once('exit',code=>{clearTimeout(watchdog);resolve(code??1)});
   child.once('error',()=>{clearTimeout(watchdog);resolve(1)});
  });
  assert.equal(exit,0,'Chromium failed: '+err.slice(-500));
  for(const flag of ['native-value','no-reflow','ime-quiet','ime-resumed','native-still'])
   assert.match(output,new RegExp('data-'+flag+'="true"'),'Android IME regression: '+flag);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
