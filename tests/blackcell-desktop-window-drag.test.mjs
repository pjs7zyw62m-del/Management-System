import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const os=readFileSync('blackcell-os.js','utf8'),css=readFileSync('blackcell-os-macos-workspaces.css','utf8');
const block=os.slice(os.indexOf('// Desktop titlebar drag:'),os.indexOf('\n}\nlet appContext=',os.indexOf('// Desktop titlebar drag:')));
const helpers=os.match(/function desktopWindowLeft\([^\n]+/)[0];
test('Desktop geometry permits both side edges and keeps a titlebar grip',()=>{
 const bound=new Function(helpers+';return desktopWindowLeft')();
 assert.equal(bound(-900,700,1200),-440);
 assert.equal(bound(2000,700,1200),940);
 assert.equal(bound(300,700,1200),300);
 assert.match(os,/left=safePixels\(saved.left,true\)/);
 assert.match(css,/html:is\(\.bc-os-phone,\.bc-os-tablet\) #desktop\.bc-stage-manager>\.os-window/);
});
test('Chromium verifies real titlebar drag in Stage Manager and restores maximized windows',async()=>{
 const server=createServer((req,res)=>{
  if(req.url==='/styles.css'){res.writeHead(200,{'Content-Type':'text/css'});res.end(css);return}
  if(req.url==='/os.css'){res.writeHead(200,{'Content-Type':'text/css'});res.end(readFileSync('blackcell-os.css'));return}
  if(req.url==='/fixture'){
   res.writeHead(200,{'Content-Type':'text/html'});
   res.end('<!doctype html><html><head><link rel="stylesheet" href="/os.css"><link rel="stylesheet" href="/styles.css"><style>body{margin:0}#desktop{position:relative;width:100vw;height:100vh}.os-window{width:700px;height:480px;left:300px;top:80px;z-index:30}.os-window-head{height:44px}</style></head><body><div id="desktop" class="shell bc-stage-manager"><header class="topbar"></header><nav class="bc-mac-stage-rail"><button class="bc-mac-stage-thumb">App</button></nav><section class="os-window"><div class="os-window-head"><span>App</span><button>Close</button></div><iframe></iframe></section></div><script>const $=id=>document.getElementById(id),w=document.querySelector(".os-window"),bar=w.querySelector(".os-window-head");const touchOS=()=>document.documentElement.classList.contains("bc-os-tablet");let saves=0,workspaceLock=null;const syncFullscreenShell=()=>{},dockReveal=()=>{},saveWorkspace=()=>saves++;'+helpers+';'+block+';const send=(target,type,x,y,buttons=1)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,button:0,buttons,clientX:x,clientY:y}));const mark=(k,v)=>document.body.dataset[k]=String(v);const base=w.getBoundingClientRect();mark("stage",Math.abs(base.left-300)<2);send(bar,"pointerdown",base.left+350,base.top+20);send(window,"pointermove",1,base.top+20);mark("left",w.getBoundingClientRect().left<0);mark("shield",getComputedStyle(w.querySelector("iframe")).pointerEvents==="none");send(window,"pointermove",1199,base.top+20);mark("right",w.getBoundingClientRect().right>innerWidth);send(window,"pointerup",1199,base.top+20,0);mark("cleanup",!w.classList.contains("bc-window-dragging")&&saves===1);w.classList.add("is-max");const max=w.getBoundingClientRect();send(bar,"pointerdown",max.left+400,max.top+20);send(window,"pointerup",max.left+400,max.top+20,0);mark("click",w.classList.contains("is-max"));send(bar,"pointerdown",max.left+400,max.top+20);send(window,"pointermove",max.left+500,max.top+80);mark("restore",!w.classList.contains("is-max"));send(window,"pointerup",500,100,0);document.documentElement.classList.add("bc-os-tablet");send(bar,"pointerdown",500,100);send(window,"pointermove",700,200);mark("tablet",!w.classList.contains("bc-window-dragging"));</script></body></html>');return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const child=spawn(process.env.CHROME||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size=1200,900','--virtual-time-budget=1200','--dump-dom','http://127.0.0.1:'+server.address().port+'/fixture']);
  let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const code=await new Promise(ok=>{const timer=setTimeout(()=>{child.kill('SIGKILL');ok(124)},25000);child.once('exit',c=>{clearTimeout(timer);ok(c??1)});child.once('error',()=>{clearTimeout(timer);ok(1)})});
  assert.equal(code,0,err.slice(-500));
  for(const key of ['stage','left','right','shield','cleanup','click','restore','tablet'])assert.match(out,new RegExp('data-'+key+'="true"'),key+' '+out.slice(0,1000));
 }finally{await new Promise(ok=>server.close(ok))}
});
