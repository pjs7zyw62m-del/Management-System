import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';

const html=readFileSync('private-photo-ledger.html','utf8');
const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
  .map(m=>m[0]+'>').join('\n');

function fixture(width){
 return [
 '<!doctype html><html><head><meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1">',
 styles,
 '<style>html,body{margin:0!important;padding:0!important;background:#030304!important}',
 '#ledgerApp{width:100%!important;max-width:none!important;box-sizing:border-box!important}',
 '.redline-receiver-command{box-sizing:border-box!important}',
 '</style></head>',
 '<body class="bc-redline-receiver bc-ledger-desktop bc-redline-apple-mode rr-imessage-mode">',
 '<main id="ledgerApp" class="shell">',
 '<section id="redlineReceiverCommand" class="redline-receiver-command">',
 '<header class="rr-command-header">',
 '<div class="rr-command-intro"><h2 class="rr-title">REDLINE <span>CONTROL</span></h2>',
 '<span class="rr-room-summary">Private Photo Arrangement · You ↔ Sender · Only these two accounts · ACTIVE</span></div>',
 '<span class="rr-status">RECEIVER VERIFIED</span>',
 '<button id="redlineConsentSettingsOpen" class="redline-settings-launch">⚙ REDLINE SETTINGS</button>',
 '<section class="rr-receiver-photo-pause" id="redlineReceiverPauseHeader">',
 '<button id="redlineReceiverSendingPause">⏸ PAUSE SENDING</button></section>',
 '<div class="workspace-actions"><button id="refreshLedger" class="button-outline">↻ REFRESH</button>',
 '<span class="verified-mark"><span class="status-dot"></span> VERIFIED SESSION</span>',
 '<span id="ledgerLiveStatus" class="live-ledger-status">● LIVE UPDATES CONNECTED</span>',
 '</div></header></section></main>',
 '<script>',
 'setTimeout(()=>{',
 ' const find=s=>document.querySelector(s)?.getBoundingClientRect();',
 ' const intro=find(".rr-command-intro"),settings=find("#redlineConsentSettingsOpen"),',
 '  pause=find("#redlineReceiverSendingPause"),actions=find(".workspace-actions"),',
 '  verified=find(".verified-mark"),live=find("#ledgerLiveStatus"),',
 '  header=find(".rr-command-header"),bar=find("#redlineReceiverCommand");',
 ' const narrow=window.innerWidth<=900;',
 ' const results={',
 '  "header-constrained":header.width<=bar.width+2&&header.width>500,',
 '  "brand-removed":intro.width===0&&intro.height===0,',
 '  "settings-on-left":settings.left>=bar.left&&settings.left<=bar.left+32,',
 '  "pause-adjacent":Math.abs(pause.left-settings.right)<=16&&Math.abs(pause.top-settings.top)<7,',
 '  "status-readable":verified.width>60&&live.width>130,',
 '  "status-in-bounds":live.right<=bar.right+2&&actions.right<=bar.right+2,',
 '  "header-compact":header.height<90&&bar.height<110,',
 '  "actions-separate":actions.left>=pause.right-2,',
 ' };',
 ' for(const [k,v] of Object.entries(results))document.body.setAttribute("data-"+k,String(v));',
 ' document.body.setAttribute("data-header-metrics",JSON.stringify({',
 '  width:window.innerWidth,header:header.width,bar:bar.width,',
 '  titleRight:intro.right,settingsLeft:settings.left,settingsTop:settings.top,',
 '  pauseLeft:pause.left,actionsRight:actions.right,liveRight:live.right,',
 '  titleBottom:intro.bottom,headerHeight:header.height,barHeight:bar.height',
 ' }));',
 '},500);',
 '</script></body></html>'
 ].join('\n');
}

const server=createServer((req,res)=>{
 const path=(req.url||'').split('?')[0];
 if(path==='/header.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(fixture(1600));return;
 }
 if(!/^\/[a-zA-Z0-9-]+\.css$/.test(path)){res.writeHead(404);res.end();return}
 try{res.writeHead(200,{'content-type':'text/css'});res.end(readFileSync(basename(path)));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 for(const width of [1600,1100]){
  const url='http://127.0.0.1:'+server.address().port+'/header.html';
  const browser=process.env.CHROME||'chromium';
  const child=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu',
   '--disable-dev-shm-usage','--window-size='+width+',880',
   '--virtual-time-budget=2500','--dump-dom',url]);
  let stdout='',stderr='';
  child.stdout.on('data',x=>stdout+=x.toString());
  child.stderr.on('data',x=>stderr+=x.toString());
  const code=await new Promise(resolve=>{
   const timer=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},30000);
   child.on('exit',x=>{clearTimeout(timer);resolve(x??1)});
   child.on('error',()=>{clearTimeout(timer);resolve(1)});
  });
  assert.equal(code,0,'Browser failed: '+stderr.slice(-700));
  for(const name of ['header-constrained','brand-removed','settings-on-left',
   'pause-adjacent','status-readable','status-in-bounds','header-compact',
   'actions-separate']){
   assert.match(stdout,new RegExp('data-'+name+'="true"'),
    width+'px header failed '+name+' '+(stdout.match(/data-header-metrics="[^"]*"/)||[])[0]);
  }
  console.log('REDLINE Option 2 '+width+'px: no title, slim actions and statuses.');
 }
}finally{await new Promise(resolve=>server.close(resolve));}
