/* BLACKCELL critical regression:
 * A missing/early attachment-toggle binding must NOT prevent iMessage startup.
 * Test invokes the actual media initializer, not only JS syntax checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

const media=readFileSync('corporate-chat-media.js','utf8');
const chat=readFileSync('corporate-chat.js','utf8');
const html=readFileSync('corporate-chat.html','utf8');
const stripped=media.replace(/^import\s+[^\n]+\n/gm,'').replace('export function setupCorporateMedia','function setupCorporateMedia');

test('iMessage initializes attachment reference only after the DOM attachment button exists',()=>{
 const first=media.indexOf("const attachmentToggle=document.getElementById('mediaToggleButton')");
 const next=media.indexOf('let activeAttachmentAnchor=attachmentToggle');
 assert.ok(first>0&&next>first,'Attachment anchor must never enter temporal-dead-zone on startup');
 assert.match(chat,/const sharedMedia=setupCorporateMedia\(/);
 assert.match(chat,/void boot\(\)/);
 assert.match(html,/id="peers"/);
});

test('Actual media initializer runs to completion in Chromium so contacts boot may proceed',async()=>{
 assert.ok(!stripped.includes('</script>'));
 const body='<div class="chat"><main class="chat-main"><div class="chat-title"><span class="imessage-title-actions"></span></div>'+
  '<div id="messages"></div><form id="sendForm"><button type="button" id="mediaToggleButton">＋</button></form></main></div>';
 const stub=[
  'const createChatBunnyTransport=()=>({});',
  'const attachPhotoTransfer=()=>()=>{};',
  'const mountChatFilmstrip=()=>({root:document.createElement("div"),clear(){},refresh(){},follow(){},resume(){},pause(){}});',
  'const makeChatThumbnail=async()=>null;',
  stripped,
  'try { const api=setupCorporateMedia({client:{},context:()=>({ready:false}),reloadMessages:()=>{},status:()=>{}});',
  '  document.body.dataset.chatBoot=String(typeof api.toggleMediaTray==="function");',
  '  document.body.dataset.plusAvailable=String(!!document.getElementById("mediaToggleButton")&&!!document.getElementById("bcAttachmentMenu"));',
  '  document.body.dataset.headerAvailable=String(!!document.getElementById("bcAndroidAttachmentShortcut"));',
  '} catch(error){ document.body.dataset.chatBoot="false"; document.body.dataset.startupError=String(error.stack||error.message); }'
 ].join('\n');
 const fixture='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+
 body+'<script>'+stub+'</script></body></html>';
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  // UA/device-size emulation exercises BLACKCELL's Android branches. It is
  // not a substitute for testing a physical Android 11 Chrome/WebView engine.
  const profiles=[
   {name:'Desktop',size:'1040,760',ua:null},
   {name:'Android 11 (Neon Smarta 2)',size:'360,740',ua:'Mozilla/5.0 (Linux; Android 11; Neon Smarta 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36'},
   {name:'Android 15 (modern phone)',size:'390,844',ua:'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36'}
  ];
  for(const profile of profiles){
   const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--virtual-time-budget=1200','--window-size='+profile.size];
   if(profile.ua)args.push('--user-agent='+profile.ua);
   args.push('--dump-dom','http://127.0.0.1:'+server.address().port+'/');
   const child=spawn(process.env.CHROME||'chromium',args);
   let output='',err='';
   child.stdout.on('data',d=>{output+=d.toString()});
   child.stderr.on('data',d=>{err+=d.toString()});
   const exit=await new Promise(resolve=>{const watchdog=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},20000);child.once('exit',code=>{clearTimeout(watchdog);resolve(code??1)});child.once('error',()=>{clearTimeout(watchdog);resolve(1)})});
   assert.equal(exit,0,profile.name+' Chromium failed: '+err.slice(-650));
   assert.match(output,/data-chat-boot="true"/,profile.name+' media startup failed: '+output.match(/data-startup-error="[^"]*/)?.[0]);
   assert.match(output,/data-plus-available="true"/,profile.name+' missing bottom attachment');
   assert.match(output,/data-header-available="true"/,profile.name+' missing header attachment');
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});
