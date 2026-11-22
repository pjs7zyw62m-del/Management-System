/* BLACKCELL iMessage Android + button and no-navigation attachment UX. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const html=readFileSync('corporate-chat.html','utf8');
const chat=readFileSync('corporate-chat.js','utf8');
const media=readFileSync('corporate-chat-media.js','utf8');
const cssFiles=['corporate-chat-bubbles.css','corporate-chat-compact.css','corporate-chat-compact-media.css','corporate-chat-obsidian.css','corporate-chat-media-workspace.css'];
const css=cssFiles.map(f=>readFileSync(f,'utf8')).join('\n');
test('Android composer + exists and never submits or navigates',()=>{
 const plus=html.match(/<button id="mediaToggleButton"[^>]*>/)?.[0];
 assert.ok(plus);
 assert.match(plus,/class="composer-add"/);
 assert.match(plus,/type="button"/);
 assert.match(chat,/mediaToggle\.addEventListener\('click',event=>\{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*sharedMedia\.toggleMediaTray\(\)/);
 assert.match(chat,/bc-chat-android/);
 assert.match(chat,/corporate-chat-media\.js\?v=20261122-contact-bootstrap2/);
 assert.match(html,/corporate-chat-compact-media\.css\?v=20261122-android-attachment-visibility1/);
 assert.match(html,/corporate-chat\.js\?v=20261122-android-keyboard-return10/);
});
test('Android photo menu exposes BLACKCELL Photos and uploader without navigation',()=>{
 assert.match(media,/button\('BLACKCELL Photos'/);
 assert.match(media,/button\('Upload Photo or Video'/);
 assert.match(media,/controls\.append\(choosePhotos,chooseBlackcellPhotos,uploadDevice,mediaLibrary\)/);
 assert.match(media,/const headerAttachment=button\('＋',\(\)=>toggleMediaTray\(headerAttachment\)/);
 assert.match(media,/headerAttachment\.id='bcAndroidAttachmentShortcut'/);
 assert.match(media,/const uploadDevice=button\('Upload Photo or Video',\(\)=>\{[\s\S]*?openShare\(\);\s*\},/);
 const start=media.indexOf("const uploadDevice=button('Upload Photo or Video'"),end=media.indexOf("uploadDevice.title=",start);
 assert.doesNotMatch(media.slice(start,end),/fileInput\.click|chooseFiles|window\.open|location\./);
 const toggle=media.slice(media.indexOf('function toggleMediaTray('),media.indexOf('function routeBubble('));
 assert.doesNotMatch(toggle,/location\.|window\.open|fileInput\.click/);
 assert.match(css,/html\.bc-chat-android\.bc-compact-chat \.composer #mediaToggleButton/);
 assert.match(css,/html\.bc-chat-android\.bc-compact-chat \.bc-android-attachment-shortcut/);
});
test('Android Chrome narrow-screen: both + controls visible, menu opens without leaving page',async()=>{
 const plus=html.match(/<button id="mediaToggleButton"[^>]*>[\s\S]*?<\/button>/)?.[0];
 assert.ok(plus,'production composer button missing');
 const fixture='<!doctype html><html class="bc-chat-android bc-chat-lite bc-compact-chat" lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<style>body{margin:0}.chat{height:100dvh!important}.chat-title{height:54px;display:flex;justify-content:flex-end}.imessage-title-actions{display:flex;align-items:center}.conversation{flex:1}.bc-attachment-menu{min-height:45px}</style><style>'+
  css+'</style></head><body class="bc-chat"><main class="chat bc-thread-active"><div class="chat-main"><div class="chat-title"><span class="imessage-title-actions">'+
  '<button type="button" id="bcAndroidAttachmentShortcut" class="bc-android-attachment-shortcut" aria-label="Add attachments">＋</button>'+
  '</span></div><div class="conversation"></div><form class="composer" id="sendForm">'+plus+
  '<div class="composer-input-wrap"><textarea id="messageInput"></textarea></div><button class="composer-send" type="submit">↑</button></form></div></main>'+
  '<div id="bcAttachmentMenu" class="bc-attachment-menu" hidden><button type="button" class="bc-attachment-item bc-attachment-mobile-action">BLACKCELL Photos</button><button type="button" class="bc-attachment-item bc-attachment-mobile-action">Upload Photo or Video</button></div>'+
  '<script>'+
  'const plus=document.getElementById("mediaToggleButton"),header=document.getElementById("bcAndroidAttachmentShortcut"),menu=document.getElementById("bcAttachmentMenu");'+
  'const before=location.href;let submissions=0;document.getElementById("sendForm").addEventListener("submit",e=>{e.preventDefault();submissions++});'+
  'const open=()=>{menu.hidden=false;};plus.addEventListener("click",open);header.addEventListener("click",open);'+
  'const check=b=>{const r=b.getBoundingClientRect(),st=getComputedStyle(b);return !b.hidden&&st.visibility==="visible"&&st.display!=="none"&&r.width>=32&&r.height>=32};'+
  'document.body.dataset.bottomVisible=String(check(plus));document.body.dataset.headerVisible=String(check(header));'+
  'plus.click();document.body.dataset.plusOpens=String(!menu.hidden&&getComputedStyle(menu).display!=="none"&&menu.querySelectorAll(".bc-attachment-mobile-action").length===2);'+
  'document.body.dataset.plusInPage=String(location.href===before&&submissions===0);'+
  'menu.hidden=true;header.click();document.body.dataset.headerOpens=String(!menu.hidden&&location.href===before&&submissions===0);'+
  '</script></body></html>';
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const child=spawn(process.env.CHROME||'chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--virtual-time-budget=1500','--window-size=360,740',
  '--user-agent=Mozilla/5.0 (Linux; Android 13; Neon Smarta 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36','--dump-dom','http://127.0.0.1:'+server.address().port+'/']);
  let out='',err='';child.stdout.on('data',d=>out+=d.toString());child.stderr.on('data',d=>err+=d.toString());
  const code=await new Promise(resolve=>{const watchdog=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},20000);child.once('exit',c=>{clearTimeout(watchdog);resolve(c??1)});child.once('error',()=>{clearTimeout(watchdog);resolve(1)})});
  assert.equal(code,0,err.slice(-500));
  for(const flag of ['bottom-visible','header-visible','plus-opens','plus-in-page','header-opens'])
   assert.match(out,new RegExp('data-'+flag+'="true"'),'Android attachment regression: '+flag);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
