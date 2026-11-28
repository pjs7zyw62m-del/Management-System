import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const os=readFileSync('blackcell-os.js','utf8');
const html=readFileSync('blackcell-os.html','utf8');
const css=readFileSync('blackcell-os-window-controls.css','utf8');

test('OS binds red, yellow, green to close, minimize and visible maximize/restore',()=>{
 assert.match(os,/\['Close','×',\(\)=>void requestClose\(r\)\]/);
 assert.match(os,/\['Minimize','−',\(\)=>suspend\(r\)\]/);
 assert.match(os,/\['Maximize or restore','\+',\(\)=>toggleOSWindowSize\(r\)\]/);
 assert.match(os,/btn\.addEventListener\('click',event=>/);
 assert.match(os,/btn\.setAttribute\('aria-label',label\+' '\+r\.title\)/);
 assert.match(os,/btn\.addEventListener\('pointerdown',event=>event\.stopPropagation\(\)\)/);
 assert.match(os,/if\(event\.target\.closest\('\.traffic button'\)\)return/);
 assert.match(os,/w\.classList\.toggle\('bc-os-window-compact',compact\)/);
 assert.match(os,/w\.classList\.toggle\('is-max',!compact\)/);
 assert.match(os,/w\.classList\.toggle\('is-max'\)/);
});
test('OS uses hidden-window CSS and fresh build instead of stale PWA resources',()=>{
 assert.match(css,/#desktop > \.os-window\[hidden\]\s*\{[\s\S]*display:none!important/);
 assert.match(css,/pointer-events:none!important/);
 assert.match(css,/os-traffic-maximize[\s\S]*display:grid!important/);
 assert.match(css,/bc-os-window-compact/);
 assert.match(css,/os-chat-park-button::before/);
 assert.match(css,/background:#0a84ff!important/);
 assert.match(html,/blackcell-os-window-controls\.css\?[^"']*v=20261121-traffic-controls1/);
 assert.match(html,/blackcell-os\.js\?v=[^"']+/);
});
test('touch and desktop green toggle real sizing and update workspace',()=>{
 const a=os.indexOf('function toggleOSWindowSize(r){');
 const b=os.indexOf('\nfunction showApp(',a);
 assert.ok(a>=0&&b>a);
 const code=os.slice(a,b);
 const run=touch=>{
  const classes=new Set(['is-max']);
  const w={hidden:false,classList:{
   contains:k=>classes.has(k),
   add:k=>classes.add(k),
   remove:(...keys)=>keys.forEach(k=>classes.delete(k)),
   toggle:(k,force)=>{
    const value=force===undefined?!classes.has(k):!!force;
    if(value)classes.add(k);else classes.delete(k);
    return value;
   }
  }};
  const r={id:'photoledger',el:w},windows=new Map([['photoledger',r]]);
  let raised=0,saved=0;
  const fn=new Function('windows','touchOS','innerWidth','$','raise','syncFullscreenShell','saveWorkspace','clearTabletSplit',
   code+'\nreturn toggleOSWindowSize;')(
    windows,()=>touch,1280,()=>({classList:{remove(){}}}),
    ()=>{raised++},()=>{},()=>{saved++},()=>{}
  );
  fn(r);
  assert.equal(classes.has('is-max'),false);
  assert.equal(classes.has('bc-os-window-compact'),touch);
  fn(r);
  assert.equal(classes.has('is-max'),true);
  assert.equal(classes.has('bc-os-window-compact'),false);
  assert.equal(raised,2);
  assert.equal(saved,2);
 };
 run(false);run(true);
});
test('real browser: hidden windows are actually hidden and green phone restore resizes',async()=>{
 const body=String.raw`<!doctype html><html><head>
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <style>body{margin:0}#desktop{position:relative;width:100vw;height:100dvh}</style>
 <link rel="stylesheet" href="/blackcell-os.css">
 <link rel="stylesheet" href="/blackcell-os-obsidian-v2.css">
 <link rel="stylesheet" href="/blackcell-os-window-controls.css">
 </head><body><div id="desktop">
 <section class="os-window is-max"><div class="os-window-head"><div class="traffic">
 <button class="os-traffic-control os-traffic-close" type="button">×</button>
 <button class="os-traffic-control os-traffic-minimize" type="button">−</button>
 <button class="os-traffic-control os-traffic-maximize" type="button">+</button>
 </div><span>REDLINE</span></div><div class="os-window-body"></div></section>
 <section class="os-window os-chat-popout" style="top:120px;left:20px">
 <div class="os-window-head"><div class="traffic">
 <button class="os-traffic-control os-traffic-close" type="button">×</button>
 <button class="os-traffic-control os-traffic-minimize" type="button">−</button>
 <button class="os-traffic-control os-traffic-maximize" type="button">+</button>
 <button class="os-chat-park-button" type="button" aria-label="Park chat as bubble">•</button>
 </div><span>iMessage</span></div><div class="os-window-body"></div></section></div>
 <script>
 const w=document.querySelector('.os-window');
 const b=[...document.querySelectorAll('.traffic button')];
 const phone=new URLSearchParams(location.search).get('mobile')==='1';
 if(phone)document.documentElement.classList.add('bc-os-phone');
 b[0].onclick=()=>w.hidden=true;b[1].onclick=()=>w.hidden=true;
 b[2].onclick=()=>{
   if(phone){
     const compact=!w.classList.contains('bc-os-window-compact');
     w.classList.toggle('bc-os-window-compact',compact);
     w.classList.toggle('is-max',!compact);
   }else w.classList.toggle('is-max');
 };
 window.addEventListener('load',()=>{
  setTimeout(()=>{
   const original=w.getBoundingClientRect().width;
   document.body.dataset.greenVisible=String(getComputedStyle(b[2]).display!=='none');
   b[2].click();
   const restored=w.getBoundingClientRect().width;
   document.body.dataset.greenRestore=String(restored<original*.99);
   b[2].click();
   document.body.dataset.greenMax=String(w.getBoundingClientRect().width>restored);
   b[1].click();
   document.body.dataset.yellowHide=String(w.hidden&&getComputedStyle(w).display==='none');
   w.hidden=false;b[0].click();
   document.body.dataset.redHide=String(w.hidden&&getComputedStyle(w).display==='none');
   const pop=document.querySelector('.os-chat-popout');
   const dots=pop.querySelectorAll('.traffic button');
   const first=getComputedStyle(dots[0],'::before');
   const blue=getComputedStyle(dots[3],'::before');
   document.body.dataset.blueDotSize=String(
    first.width===blue.width&&first.height===blue.height&&first.width==='19px');
   const redHit=dots[0].getBoundingClientRect(),blueHit=dots[3].getBoundingClientRect();
   document.body.dataset.blueHitArea=String(
    Math.abs(redHit.width-blueHit.width)<.5&&Math.abs(redHit.height-blueHit.height)<.5);
   document.body.dataset.blueColor=String(blue.backgroundColor==='rgb(10, 132, 255)');
   dots[3].addEventListener('click',()=>document.body.dataset.blueClick='true');
   dots[3].click();
  },120);
 });
 </script></body></html>`;
 const server=createServer((req,res)=>{
  if(req.url?.startsWith('/test.html')){
   res.writeHead(200,{'content-type':'text/html'});res.end(body);return;
  }
  if(['/blackcell-os.css','/blackcell-os-obsidian-v2.css','/blackcell-os-window-controls.css'].includes(req.url)){
   res.writeHead(200,{'content-type':'text/css'});res.end(readFileSync(req.url.slice(1)));return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  for(const width of [1250,390]){
   const isPhone=width===390;
   const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--virtual-time-budget=1200','--window-size='+width+',820','--dump-dom',
    'http://127.0.0.1:'+server.address().port+'/test.html?mobile='+(isPhone?'1':'0')];
   const child=spawn(process.env.CHROME||'chromium',args);
   let out='',err='';
   child.stdout.on('data',d=>out+=String(d));
   child.stderr.on('data',d=>err+=String(d));
   const exit=await new Promise(ok=>{
    const t=setTimeout(()=>{child.kill('SIGKILL');ok(124)},25000);
    child.once('exit',c=>{clearTimeout(t);ok(c??1)});
    child.once('error',()=>{clearTimeout(t);ok(1)});
   });
   assert.equal(exit,0,'Chromium failed: '+err.slice(-450));
   for(const key of ['green-visible','green-restore','green-max','yellow-hide','red-hide',
    'blue-dot-size','blue-hit-area','blue-color','blue-click'])
    assert.match(out,new RegExp('data-'+key+'="true"'),(isPhone?'phone':'desktop')+' '+key);
  }
 }finally{await new Promise(ok=>server.close(ok))}
});

test('BLACKCELL OS REDLINE can refresh a stale negotiation window safely',()=>{
 assert.match(os,/url\.searchParams\.set\('_bc_release',String\(Date\.now\(\)\)\)/);
 assert.match(os,/networkWindow\|\|id==='administration'\|\|id==='photoledger'/);
 assert.match(os,/if\(\(networkWindow\|\|id==='administration'\|\|id==='photoledger'\)&&!chatPopout\)/);
 assert.match(os,/id==='photoledger'&&next\.pathname\.endsWith\('\/private-photo-ledger\.html'\)/);
 assert.match(os,/doc\?\.querySelector\('\.redline-message-entry'\)\?\.value\?\.trim\(\)/);
 assert.match(os,/doc\?\.querySelector\('#redlinePriceNegotiation\[open\] input\.redline-consent-amount'\)/);
 assert.match(html,/redlinePriceRefresh=20261122-stop-next-photo4&redlineLibrary=20261122-bunny1/);
 assert.match(html,/blackcell-os-client-build" content="[^"]+"/);
});
