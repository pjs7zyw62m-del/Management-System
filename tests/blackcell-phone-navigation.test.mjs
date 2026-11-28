import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhoneGesture} from '../blackcell-os-phone-navigation.js';
import {readFileSync} from 'node:fs';
test('Phone gesture thresholds avoid interpreting taps and diagonal movements as gestures',()=>{
 assert.equal(classifyPhoneGesture(0,-8),null);
 assert.equal(classifyPhoneGesture(12,-70),'home');
 assert.equal(classifyPhoneGesture(12,-70,true),'switcher');
 assert.equal(classifyPhoneGesture(-70,8),'next');
 assert.equal(classifyPhoneGesture(70,8),'previous');
 assert.equal(classifyPhoneGesture(70,-70),null);
 assert.equal(classifyPhoneGesture(0,70),null);
});
test('Gesture rail delegates to existing lifecycle and remains phone scoped',()=>{
 const os=readFileSync('blackcell-os.js','utf8'),css=readFileSync('blackcell-os-phone-navigation.css','utf8');
 assert.match(os,/home:\(\)=>\{closeMenu\(\);showDesktop\(\)\}/);
 assert.match(os,/close:id=>requestClose\(windows.get\(id\)\)/);
 assert.match(os,/onLock:\(\)=>\{phoneNavigation.dismiss\(\)/);
 assert.match(css,/html\.bc-os-phone #desktop>\.os-window\[data-os-app\]:not\(\[hidden\]\)>\.os-window-head>\.traffic\{display:none!important\}/);
 assert.match(css,/safe-area-inset-left/);
 assert.match(css,/safe-area-inset-right/);
});

import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
test('Real Chromium checks phone window geometry and recent-app actions',async()=>{
 const html=readFileSync('blackcell-os.html','utf8');
 const styles=[...html.matchAll(/href="([^"?]+\.css)(?:\?[^"]*)?"/g)].map(m=>m[1]);
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture'){
   const mode=url.searchParams.get('mode')||'phone';
   res.writeHead(200,{'content-type':'text/html'});
   res.end('<!doctype html><html class="bc-os-'+mode+'"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+styles.map(p=>'<link rel="stylesheet" href="/'+p+'">').join('')+'<style>body{margin:0}#desktop{position:relative;width:100vw;height:100dvh;--bc-phone-native-inset:54px}</style></head><body><div id="desktop" class="shell"><section class="os-window is-max" data-os-app="photoledger"><div class="os-window-head"><div class="traffic"><button class="os-traffic-control">x</button></div><span>REDLINE</span></div><div class="os-window-body"></div></section></div><script type="module">import {mountPhoneNavigation} from "/blackcell-os-phone-navigation.js"; const host=document.querySelector("#desktop"),win=host.querySelector(".os-window"),traffic=host.querySelector(".traffic");let list=[{id:"a",title:"App A"}],home=0,opened="",closed="";const nav=mountPhoneNavigation({host,allowed:()=>'+(mode==='phone')+',apps:()=>list,activeId:()=>"a",home:()=>home++,open:id=>opened=id,close:async id=>{closed=id;list=[]}}); const rail=host.querySelector(".bc-phone-gesture-rail"),dialog=host.querySelector(".bc-phone-switcher");const m=(key,val)=>document.body.dataset[key]=String(val);if("'+mode+'"==="phone"){const r=win.getBoundingClientRect(),q=rail.getBoundingClientRect();m("layout",r.top>=53&&r.bottom<=q.top+1&&r.width<=innerWidth&&r.height>100);m("traffic",getComputedStyle(traffic).display==="none");rail.querySelector(".bc-phone-home-indicator").click();m("home",home===1);rail.querySelector(".bc-phone-recent-button").click();m("switcher",dialog.open);dialog.querySelector(".bc-phone-recent-launch").click();m("open",opened==="a"&&!dialog.open);rail.querySelector(".bc-phone-recent-button").click();dialog.querySelector(".bc-phone-recent-close").click();await new Promise(r=>setTimeout(r,25));m("close",closed==="a"&&!!dialog.querySelector(".bc-phone-switcher-empty"));nav.dismiss();m("dismiss",!dialog.open)}else{m("desktop",getComputedStyle(rail).display==="none"&&getComputedStyle(traffic).display!=="none")}</script></body></html>');
   return;
  }
  const p=url.pathname.slice(1);
  if(styles.includes(p)||p==='blackcell-os-phone-navigation.js'){res.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript':'text/css'});res.end(readFileSync(p));return}
  res.writeHead(404);res.end();
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  for(const [mode,w,h] of [['phone',390,844],['phone',844,390],['tablet',820,1180],['desktop',1280,900]]){
   const child=spawn(process.env.CHROME||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size='+w+','+h,'--virtual-time-budget=1800','--dump-dom','http://127.0.0.1:'+server.address().port+'/fixture?mode='+mode]);
   let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
   const exit=await new Promise(ok=>{const timer=setTimeout(()=>{child.kill('SIGKILL');ok(124)},25000);child.once('exit',c=>{clearTimeout(timer);ok(c??1)});child.once('error',()=>{clearTimeout(timer);ok(1)})});
   assert.equal(exit,0,err.slice(-500));for(const key of mode==='phone'?['layout','traffic','home','switcher','open','close','dismiss']:['desktop'])assert.match(out,new RegExp('data-'+key+'="true"'),mode+' '+key+' '+out.slice(0,1200));
  }
 }finally{await new Promise(ok=>server.close(ok))}
});
