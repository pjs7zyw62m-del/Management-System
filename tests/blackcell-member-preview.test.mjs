import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mountStore} from '../blackcell-app-store.js';
const js=readFileSync('blackcell-member-preview.js','utf8'),html=readFileSync('blackcell-member-preview.html','utf8');
test('owner verification and sandbox isolation',()=>{
 assert.match(js,/a\.member\?\.role!=='owner'/);assert.match(js,/corp_code_status/);
 assert.match(html,/sandbox="allow-scripts"/);assert.doesNotMatch(html,/allow-same-origin/);
 assert.match(js,/connect-src 'none'/);assert.match(js,/p_action:'catalog'/);
 assert.doesNotMatch(js,/p_action:'(?:install|remove|set_rule)'/);
 assert.match(readFileSync('blackcell-administration-os.js','utf8'),/label:'Personnel Command'/);
});
test('Chromium exercises real storefront, device switch, reset and restricted level',async()=>{
 const runtime=js.slice(js.indexOf('function sandboxRuntime(config)'),js.indexOf('const shellCss='));
 const rules=[{id:'files',enabled:true,allowed:true,minLevel:1,core:true},{id:'chat',enabled:true,allowed:true,minLevel:1,core:true},{id:'vault',enabled:true,allowed:true,minLevel:7,core:false}];
 const config={channel:'test',metadata:[{id:'store',title:'App Store'},{id:'files',title:'BLACKCELL Files',sub:'Files',desc:'Files'},{id:'chat',title:'iMessage'},{id:'photoledger',title:'REDLINE'}],labels:{},rules,level:1,device:'desktop',chat:false};
 const code='window.addEventListener("error",e=>{parent.document.body.dataset.error=e.message});const mountStore='+mountStore.toString()+';'+runtime+';sandboxRuntime('+JSON.stringify(config)+');'+
 'const mark=(k,v)=>parent.document.body.dataset[k]=String(v);const count=()=>document.querySelectorAll("#home .sim-app").length;const cfg=(type,device,level)=>window.dispatchEvent(new MessageEvent("message",{source:parent,data:{channel:"test",type,device,level,chat:false}}));mark("fresh",count()===1);document.querySelector("#home [data-app=store]").click();mark("store",!!document.querySelector(".bc-store-desktop-editorial"));mark("restricted",!document.querySelector(".bc-store-grid [data-app-id=chat]"));document.querySelector(".bc-store-grid [data-app-id=files] .bc-store-get").click();setTimeout(()=>{mark("installed",count()===2);cfg("configure","phone",1);mark("mobile",document.documentElement.classList.contains("bc-os-phone")&&count()===2);cfg("reset","tablet",1);mark("reset",count()===1&&document.documentElement.classList.contains("bc-os-tablet"));cfg("configure","phone",0);mark("levelzero",count()===1&&!!document.querySelector("#home [data-app=photoledger]")&&!document.querySelector("#home [data-app=store]"));},50);';
 const childFixture='<!doctype html><html><body><main id="desktop"><span id="edition"></span><span id="clearance"></span><div id="home"></div><div id="dock"></div><div id="appWindow" hidden><span id="appTitle"></span><div id="storeHost"></div><div id="mock"></div></div><button id="closeWindow"></button><button id="homeButton"></button></main><script>'+code.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
 const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(req.url==='/child'?childFixture:'<!doctype html><html><body><iframe src="/child" style="width:1100px;height:700px"></iframe></body></html>')});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{const child=spawn(process.env.CHROME||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size=1280,800','--disable-background-networking','--virtual-time-budget=3000','--dump-dom','http://127.0.0.1:'+server.address().port]);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const code=await new Promise(ok=>{const timer=setTimeout(()=>{child.kill('SIGKILL');ok(124)},45000);child.once('exit',c=>{clearTimeout(timer);ok(c??1)});child.once('error',()=>{clearTimeout(timer);ok(1)})});assert.equal(code,0,err.slice(-500));for(const key of ['fresh','store','restricted','installed','mobile','reset','levelzero'])assert.match(out,new RegExp('data-'+key+'="true"'),key+' '+out.slice(0,900))}finally{await new Promise(ok=>server.close(ok))}
});
