import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const store=readFileSync('blackcell-app-store.js','utf8');
const ids=['usa','care','innovations','awards','omega','uploadqueue','photos','shorts'];
test('Uniform & Military uses existing catalog permissions and separates discovery',()=>{
 assert.match(store,/const uniformIds=\['usa','care','innovations','awards','omega','uploadqueue','photos','shorts'\]/);
 assert.match(store,/if\(category==='uniform'\)filtered=filtered.filter\(a=>isUniform\(a\)&&a.enabled!==false&&a.allowed&&!a.planned\)/);
 assert.match(store,/category==='discover'\)filtered=filtered.filter\(a=>!a.planned&&!isBeta\(a\)&&a.enabled!==false&&!isUniform\(a\)\)/);
 assert.match(store,/uniformEntry\(live\)/);
});
test('Uniform collection works in desktop, tablet and phone Store views',async()=>{
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/blackcell-app-store.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(store);return}
  const mode=url.searchParams.get('mode')||'desktop';
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><html class="bc-os-'+mode+'"><body><div id="host"></div><script type="module">'+
   'import {mountStore} from "/blackcell-app-store.js";'+
   'const ids='+JSON.stringify(ids)+';const make=(id,allowed=true)=>({id,title:id,sub:"Released",desc:"Test",allowed,installed:false,enabled:true,optional:true,removable:true,color:"#444",glyph:"U",minLevel:1});'+
   'const catalog=[...ids.map(id=>make(id,id!=="omega")),make("mail")];let installs=0;'+
   'const host=document.querySelector("#host"),app=mountStore(host,{catalog:()=>catalog,info:()=>({owner:false}),install:async()=>{installs++;return {ok:true}},open(){}});'+
   'const cards=()=>[...host.querySelectorAll(".bc-store-grid .bc-store-app")].map(x=>x.dataset.appId);'+
   'const mark=(key,v)=>document.body.dataset[key]=String(v);mark("discover",!cards().some(id=>ids.includes(id)));'+
   'const mode='+JSON.stringify(mode)+';if(mode==="desktop"){[...host.querySelectorAll(".bc-store-desktop-nav")].find(b=>b.textContent==="Uniform & Military").click()}else{host.querySelector(".bc-store-uniform-entry").click()}'+
   'mark("collection",cards().includes("shorts")&&cards().length===7&&cards().every(id=>ids.includes(id)&&id!=="omega"));mark("noinstall",installs===0);'+
   'app.selectCategory("optional");mark("addons",!cards().some(id=>ids.includes(id))&&!!host.querySelector(".bc-store-uniform-entry"));'+
   'app.selectCategory("uniform");mark("restore",cards().length===7);'+
   '</script></body></html>');
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{for(const mode of ['desktop','tablet','phone']){
 const child=spawn(process.env.CHROME||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--virtual-time-budget=1200','--dump-dom','http://127.0.0.1:'+server.address().port+'/?mode='+mode]);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
 const code=await new Promise(ok=>{const timer=setTimeout(()=>{child.kill('SIGKILL');ok(124)},20000);child.once('exit',c=>{clearTimeout(timer);ok(c??1)});child.once('error',()=>{clearTimeout(timer);ok(1)})});
 assert.equal(code,0,err.slice(-500));for(const key of ['discover','collection','noinstall','addons','restore'])assert.match(out,new RegExp('data-'+key+'="true"'),mode+' '+key);
 }}finally{await new Promise(ok=>server.close(ok))}
});
