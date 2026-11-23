import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';
const html=readFileSync('private-photo-ledger.html','utf8');
const tags=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[0]+'>').join('\n');
const probe=readFileSync('tests/redline-desktop-deck-probe.js','utf8');
function makePage(width,embedded=false){
 const stars='<button class="rr-photo-rating-star is-filled">★</button>'.repeat(4)+
  '<button class="rr-photo-rating-star">★</button>';
 return [
 '<!doctype html><html'+(embedded?' class="bc-admin-workspace-embedded"':'')+'><head><meta charset="utf-8">',
 tags,
 '<style>html,body{margin:0!important;padding:0!important;background:#050507!important}' +
 '#rrAppleRight{width:'+width+'px!important;height:690px!important;max-width:none!important;margin:8px auto!important;box-sizing:border-box!important}' +
 '#rrAppleTimerMount,#rrAppleFinance{width:100%!important;box-sizing:border-box!important}' +
 '.rr-chat-panel{flex:1 1 0!important;min-height:0!important}</style></head>',
 '<body class="bc-redline-receiver '+(embedded?'bc-ledger-tablet bc-os-frame-redline':'bc-ledger-desktop')+' rr-imessage-mode bc-redline-apple-mode">',
 '<section id="rrAppleRight"><section id="rrAppleTimerMount">',
 '<details id="redlinePhotoTimerPanel" class="rr-timer-panel" open>',
 '<summary class="rr-timer-heading"><strong>TIMED PHOTO EARNINGS</strong><small>Every second counts</small>' +
 '<strong class="rr-timer-clock">00:00</strong><strong class="rr-timer-money">$0.0000</strong></summary>',
 '<div class="rr-timer-controls"><span class="rr-timer-selected">Photo 6EF89915</span>',
 '<label class="rr-timer-rate-label">RATE / MIN<input class="rr-timer-rate" value="0.50"></label>',
 '<button class="rr-timer-start">▶ START TIMER</button><button class="rr-timer-stop" disabled>■ STOP TIMER</button>',
 '<button class="rr-timer-select-incoming">NEXT INCOMING</button></div></details>',
 '<section id="redlineLightboxReview" data-redline-decision="accepted"><section class="rr-photo-rating-panel">',
 '<strong class="rr-photo-rating-title">RATE THIS PHOTOGRAPH</strong>',
 '<div class="rr-photo-rating-buttons">'+stars+'</div><p class="rr-photo-rating-feedback"></p></section>',
 '<span class="rr-photo-price-amount">$0.05</span>',
 '<button class="rr-permanent-delete-button">DELETE PHOTO PERMANENTLY</button></section></section>',
 '<div id="rrAppleFinance"><div class="rr-stats">',
 '<article class="rr-stat rr-stat-pending"><span class="rr-stat-name">AWAITING YOUR REVIEW</span><strong class="rr-stat-value">0</strong></article>',
 '<article class="rr-stat"><span class="rr-stat-name">OUTSTANDING AMOUNTS</span><strong class="rr-stat-value">$0.20</strong></article>',
 '<article class="rr-stat"><span class="rr-stat-name">RECORDED PAID</span><strong class="rr-stat-value">$0.00</strong></article>',
 '<article class="rr-stat"><span class="rr-stat-name">TOTAL ASSIGNED</span><strong class="rr-stat-value">$0.20</strong></article>',
 '</div></div><section class="rr-chat-panel"><header class="rr-chat-heading"><h3>Chat with your sender</h3></header>',
 '<div class="rr-chat-mount"><div class="redline-message-card"><div class="redline-message-feed"></div></div></div>',
 '</section></section><script>',probe,'</script></body></html>'
 ].join('\n');
}
const server=createServer((req,res)=>{
 const path=(req.url||'').split('?')[0];
 if(/^\/deck-(620|820|760)(-embedded)?\.html$/.test(path)){
  const w=Number(path.match(/\d+/)[0]),embedded=path.includes('-embedded');
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(makePage(w,embedded));return;
 }
 if(!/^\/[a-zA-Z0-9-]+\.css$/.test(path)){res.writeHead(404);res.end();return}
 try{res.writeHead(200,{'content-type':'text/css'});res.end(readFileSync(basename(path)));}
 catch{res.writeHead(404);res.end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const chrome=process.env.CHROME||'chromium';
try{
 for(const [width,embedded] of [[620,false],[820,false],[760,true]]){
  const url='http://127.0.0.1:'+server.address().port+'/deck-'+width+(embedded?'-embedded':'')+'.html';
  const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',
   '--disable-dev-shm-usage','--window-size='+(embedded?'960':'1500')+',900','--virtual-time-budget=3000',
   '--dump-dom',url]);
  let stdout='',stderr='';
  child.stdout.on('data',d=>stdout+=d.toString());
  child.stderr.on('data',d=>stderr+=d.toString());
  const code=await new Promise(done=>{
   const timeout=setTimeout(()=>{child.kill('SIGKILL');done(124)},30000);
   child.on('exit',c=>{clearTimeout(timeout);done(c??1)});
   child.on('error',()=>{clearTimeout(timeout);done(1)});
  });
  assert.equal(code,0,'Chrome failed: '+stderr.slice(-900));
  const flags=['no-detached-watch','watch-next-to-money','heading-aligned',
   'rate-aligned','buttons-balanced','rating-inline','compact-controls',
   'equal-stats','chat-grows','no-overflow'];
  for(const flag of flags){
   assert.match(stdout,new RegExp('data-'+flag+'="true"'),
    width+'px failed '+flag+'; '+(stdout.match(/data-metrics="[^"]*"/)||[])[0]);
  }
  console.log('REDLINE '+(embedded?'OS frame ':'desktop ')+width+'px: aligned timer, rating, stats, chat');
 }
}finally{await new Promise(done=>server.close(done));}
