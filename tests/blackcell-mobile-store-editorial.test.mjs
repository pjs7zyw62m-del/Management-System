import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const html=readFileSync('blackcell-os.html','utf8');
const styles=[...html.matchAll(/href="([^"?]+\.css)(?:\?[^"]*)?"/g)].map(m=>m[1]);
test('Mobile editorial store uses actual module, authorized featured cards and responsive layout',async()=>{
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/test'){
   const w=Number(url.searchParams.get('w')),h=Number(url.searchParams.get('h')),phone=url.searchParams.get('phone');
   res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><body><iframe style="border:0" width="'+w+'" height="'+h+'" src="/fixture?phone='+phone+'"></iframe></body></html>');return;
  }
  if(url.pathname==='/fixture'){
   const phone=url.searchParams.get('phone')==='1';
   const head=styles.map(p=>'<link rel="stylesheet" href="/'+p+'">').join('');
   const body='<!doctype html><html class="'+(phone?'bc-os-phone':'bc-os-desktop')+'"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+head+'<style>body{margin:0}#desktop{height:100dvh;position:relative;display:block}#host{height:100%}</style></head><body><div id="desktop"><div id="host"></div></div><script type="module">'+
   'import {mountStore} from "/blackcell-app-store.js";'+
   'const make=(id,title,allowed,installed=false)=>({id,title,allowed,installed,enabled:true,optional:true,removable:true,sub:"Private workspace",desc:"Application description",color:"#456",glyph:"B",minLevel:1});'+
   'const catalog=[make("photoledger","BLACKCELL REDLINE",true),make("personalphotos","BLACKCELL Photos",true,true),make("chat","iMessage",false),make("film","Cinema",true)];let installs=0,opened="";'+
   'const host=document.querySelector("#host");mountStore(host,{catalog:()=>catalog,info:()=>({owner:false}),install:async(id,yes)=>{installs++;catalog.find(a=>a.id===id).installed=yes;return {ok:true}},open:id=>opened=id,onState(){}});'+
   'const mark=(key,value)=>parent.document.body.dataset[key]=String(value);'+
   'const phone='+phone+';const nav=host.querySelector(".bc-store-mobile-nav"),feed=host.querySelector(".bc-store-editorial"),cards=[...feed.children];'+
   'const rect=e=>e.getBoundingClientRect();mark("features",cards.length===2&&cards.every(x=>x.dataset.appId!=="chat"));'+
   'if(phone){mark("layout",innerWidth>innerHeight?Math.abs(rect(cards[0]).top-rect(cards[1]).top)<2&&rect(cards[1]).left>rect(cards[0]).left:rect(cards[1]).top>=rect(cards[0]).bottom);mark("nav",getComputedStyle(nav).display==="flex"&&rect(nav).bottom<=rect(host).bottom+.5&&rect(nav).width<=rect(host).width);'+
   'cards[0].querySelector(".bc-store-get").click();await new Promise(r=>setTimeout(r,30));mark("install",installs===1&&catalog[0].installed);host.querySelector(".bc-store-story .bc-store-get").click();mark("open",opened==="photoledger");'+
   'const tab=label=>[...nav.querySelectorAll("button")].find(b=>b.textContent===label);tab("Search").click();const input=host.querySelector(".bc-store-search");input.value="Photos";input.dispatchEvent(new Event("input"));mark("search",host.querySelector(".bc-store-mobile-title").textContent==="Search"&&host.querySelectorAll(".bc-store-grid .bc-store-app").length===1);'+
   'tab("Today").click();host.querySelector(".bc-store-mobile-account").click();mark("tools",host.classList.contains("bc-store-tools-open")&&[...host.querySelectorAll(".bc-store-mobile-tool")].find(b=>b.textContent==="Unavailable").hidden);'+
   '}else{mark("desktop",getComputedStyle(nav).display==="none"&&getComputedStyle(feed).display==="none"&&getComputedStyle(host.querySelector(".bc-store-desktop-editorial")).display!=="none"&&getComputedStyle(host.querySelector(".bc-store-desktop-rail")).display!=="none");const desktopTab=label=>[...host.querySelectorAll(".bc-store-desktop-nav")].find(b=>b.textContent===label);desktopTab("Creative").click();mark("category",host.querySelectorAll(".bc-store-grid .bc-store-app").length>0&&!!host.querySelector(".bc-store-grid [data-app-id=personalphotos]")&&!host.querySelector(".bc-store-grid [data-app-id=photoledger]"));const ds=host.querySelector(".bc-store-desktop-search");ds.value="Photos";ds.dispatchEvent(new Event("input"));mark("desktopsearch",host.querySelectorAll(".bc-store-grid .bc-store-app").length===1);desktopTab("Updates").click();mark("updates",!!host.querySelector(".bc-store-desktop-update"));}'+
   '</script></body></html>';
   res.writeHead(200,{'content-type':'text/html'});res.end(body);return;
  }
  const p=url.pathname.slice(1);
  if(styles.includes(p)||p==='blackcell-app-store.js'){res.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript':'text/css'});res.end(readFileSync(p));return}
  res.writeHead(404);res.end();
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  for(const [w,h,phone] of [[390,700,true],[844,330,true],[1100,700,false]]){
   const url='http://127.0.0.1:'+server.address().port+'/test?w='+w+'&h='+h+'&phone='+(phone?'1':'0');
   const child=spawn(process.env.CHROME||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size=1280,900','--virtual-time-budget=1500','--dump-dom',url]);
   let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
   const exit=await new Promise(ok=>{const t=setTimeout(()=>{child.kill('SIGKILL');ok(124)},25000);child.once('exit',c=>{clearTimeout(t);ok(c??1)});child.once('error',()=>{clearTimeout(t);ok(1)})});
   assert.equal(exit,0,err.slice(-500));for(const key of phone?['features','layout','nav','install','open','search','tools']:['features','desktop','category','desktopsearch','updates'])assert.match(out,new RegExp('data-'+key+'="true"'),w+'x'+h+' '+key+' '+out.slice(-700));
  }
 }finally{await new Promise(ok=>server.close(ok))}
});
test('Store assets and OS build version are current',()=>{
 assert.match(html,/blackcell-app-store-grid\.css\?[^"]*editorialStore=20261127-1/);
 assert.match(html,/content="20261127-editorial-store1-gesture1-desktop1-windowdrag1-inbox1-memberpreview1"/);
 assert.match(readFileSync('blackcell-os.js','utf8'),/blackcell-app-store\.js\?v=20261127-editorial-store1/);
 assert.match(readFileSync('blackcell-site-version.json','utf8'),/"fallback":"20261127-editorial-store1-gesture1-desktop1-windowdrag1-inbox1-memberpreview1"/);
});
