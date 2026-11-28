import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const assets=['blackcell-os.css','blackcell-os-springboard.css','blackcell-os-obsidian-v2.css','blackcell-os-unified-home.css'];
const critical=readFileSync('blackcell-os.html','utf8').match(/<style id="bc-phone-header-safe-area">[\s\S]*?<\/style>/)?.[0];
assert.ok(critical,'Inline geometry is present in the delivered document');
test('Installed phone home controls clear opaque top edge and remain hit-testable',async()=>{
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/test'){
   const edge=Number(url.searchParams.get('edge'))||0;
   const inset=Math.max(0,edge-28);
   const content='<!doctype html><html class="bc-os-phone'+(edge?' bc-os-installed':'')+'" style="--bc-installed-edge:'+edge+'px;--bc-phone-native-inset:'+inset+'px"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+assets.map(p=>'<link rel="stylesheet" href="/'+p+'">').join('')+'<style>body{margin:0}#desktop{position:relative;width:100vw;height:100dvh}.bc-installed-top-edge{display:block!important;position:absolute!important;top:0;left:0;right:0;height:'+edge+'px;background:black;z-index:61;pointer-events:none}</style>'+critical+'</head><body><div id="desktop" class="bc-springboard-ready"><div class="bc-installed-top-edge"></div><section class="bc-sb"><header class="bc-sb-status"><time class="bc-sb-time">8:16 PM</time><span class="bc-sb-status-brand">BLACKCELL OS MOBILE</span><div class="bc-sb-status-actions"><button class="bc-home-phone-widget-picker">Widgets</button><button class="bc-sb-status-button">⌕</button><button class="bc-sb-status-button">▣</button></div></header><main class="bc-sb-home"></main></section></div><script>window.addEventListener("load",()=>{const edge='+inset+';const items=[...document.querySelectorAll(".bc-sb-time,.bc-sb-status-brand,.bc-sb-status-actions button")];document.body.dataset.maskRemoved=String(getComputedStyle(document.querySelector(".bc-installed-top-edge")).display==="none");document.body.dataset.visible=String(items.every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=edge&&r.left>=0&&r.right<=innerWidth+.5}));document.body.dataset.compact=String(items[2].getBoundingClientRect().top<=Math.max(edge,32)+12);document.body.dataset.clickable=String(items.slice(2).every(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}));});</script></body></html>';
   res.writeHead(200,{'content-type':'text/html'});res.end(content);return;
  }
  const p=url.pathname.slice(1);
  if(assets.includes(p)){res.writeHead(200,{'content-type':'text/css'});res.end(readFileSync(p));return}
  res.writeHead(404);res.end();
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  for(const [width,height,edge] of [[320,740,74],[390,844,74],[430,932,90],[844,390,28],[390,844,0]]){
   const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--force-device-scale-factor=1','--virtual-time-budget=800','--window-size='+width+','+height,'--dump-dom','http://127.0.0.1:'+server.address().port+'/test?edge='+edge];
   const child=spawn(process.env.CHROME||'google-chrome',args);
   let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
   const exit=await new Promise(ok=>{const t=setTimeout(()=>{child.kill('SIGKILL');ok(124)},20000);child.once('exit',c=>{clearTimeout(t);ok(c??1)});child.once('error',()=>{clearTimeout(t);ok(1)})});
   assert.equal(exit,0,err.slice(-400));
   assert.match(out,/data-mask-removed="true"/,'mask removed '+width+'x'+height);
   assert.match(out,/data-visible="true"/,'visible '+width+'x'+height+' edge '+edge);
   assert.match(out,/data-compact="true"/,'compact '+width+'x'+height);
   assert.match(out,/data-clickable="true"/,'clickable '+width+'x'+height+' edge '+edge);
  }
 }finally{await new Promise(ok=>server.close(ok))}
});
test('Phone header reserves clearance in its layout, removes overlapping mask and includes release marker',()=>{
 const css=readFileSync('blackcell-os-obsidian-v2.css','utf8');
 assert.match(css,/--bc-sb-safe-top:var\(--bc-installed-edge,env\(safe-area-inset-top,0px\)\)/);
 assert.match(css,/padding:calc\(var\(--bc-sb-safe-top\) \+ 5px\)/);
 assert.match(readFileSync('blackcell-os.html','utf8'),/blackcell-os-obsidian-v2\.css\?[^"]*safeArea=20261127-1/);
});

test('Critical inline style uses safe area fallback and is versioned',()=>{
 assert.match(critical,/bc-installed-top-edge\{display:none!important\}/);
 assert.match(critical,/padding-top:var\(--bc-phone-header-clearance\)!important/);
 assert.match(critical,/content:" · R3"/);
 assert.equal(readFileSync('blackcell-os.html','utf8').match(/name="blackcell-os-client-build" content="([^"]+)"/)?.[1],readFileSync('blackcell-site-version.json','utf8').match(/"fallback":"([^"]+)"/)?.[1]);
});

test('Compact header does not reuse window-only edge or oversized portrait floor',()=>{
 assert.match(critical,/--bc-phone-header-clearance:var\(--bc-phone-native-inset,env\(safe-area-inset-top,0px\)\)/);
 assert.match(critical,/--bc-phone-header-clearance:max\(32px,/);
 assert.doesNotMatch(critical,/--bc-phone-header-clearance:(?:max\(84px|var\(--bc-installed-edge)/);
});
