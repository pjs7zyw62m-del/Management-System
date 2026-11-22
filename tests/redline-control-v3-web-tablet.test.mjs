/* BLACKCELL REDLINE Control V3 visual regression for web and tablet.
 * This uses the real CSS in Chromium. It is presentation-only: never mock
 * authenticated financial decisions or modify REDLINE API/data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

const css=readFileSync('private-photo-ledger-control-v3.css','utf8');
const html=readFileSync('private-photo-ledger.html','utf8');
const receiver=readFileSync('private-photo-ledger-receiver.js','utf8');
test('V3 loads after existing REDLINE styles without changing payment and security logic',()=>{
 const newStyle='private-photo-ledger-control-v3.css?v=20261122-web-tablet1';
 const finalSheet=html.indexOf(newStyle);
 assert.ok(finalSheet>0,'REDLINE Control V3 stylesheet must load');
 assert.ok(finalSheet>html.indexOf('private-photo-ledger-imessage-workspace.css'));
 assert.ok(finalSheet>html.indexOf('private-photo-ledger-sender-messenger.css'));
 assert.match(css,/@media \(min-width:720px\)/);
 assert.match(css,/body\.bc-redline-receiver:not\(\.bc-ledger-mobile\)/);
 assert.doesNotMatch(css,/\bvisibility\s*:\s*hidden|\bdisplay\s*:\s*none\s*!important/);
 assert.match(receiver,/recordPaidInFull/);
 assert.match(receiver,/openPartialPayment/);
 assert.match(receiver,/ownerAccessMembers/);
 assert.match(receiver,/redlineReceiverLiveWorkspace/);
});
const fixture=(view)=>{
 const cls=view==='mobile'?'bc-redline-receiver bc-ledger-mobile':
  view==='tablet'?'bc-redline-receiver bc-ledger-tablet':'bc-redline-receiver bc-ledger-desktop';
 return '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<style>body{margin:0;background:#000;color:white} .rr-stat{display:block} .rr-stats{display:block}</style><style>'+css+'</style></head><body class="'+cls+'">'+
 '<main id="ledgerApp" class="shell"><section class="redline-receiver-command">'+
 '<header class="rr-command-header"><div class="rr-command-intro"><h2 class="rr-title">REDLINE <span>CONTROL</span></h2><span class="rr-room-summary">Room 01 / Verified participant</span></div><span class="rr-status">RECEIVER VERIFIED</span></header>'+
 '<div class="rr-stats">'+['AWAITING YOUR REVIEW','OUTSTANDING AMOUNTS','RECORDED PAID','TOTAL ASSIGNED'].map((name,i)=>
 '<article class="rr-stat'+(i===0?' rr-stat-pending':'')+'"><span class="rr-stat-name">'+name+'</span><strong class="rr-stat-value">0</strong></article>').join('')+'</div>'+
 '<nav class="rr-nav"><div class="rr-nav-dropdown"><button type="button" class="rr-menu-toggle">MENU</button><div class="rr-nav-menu-items" hidden><button type="button" class="rr-nav-button">Open Photos</button></div></div><div class="rr-pay-column"><button type="button" class="rr-pay-full">PAY IN FULL</button><button type="button" class="rr-pay-partial">PARTIAL PAYMENT</button></div></nav>'+
 '</section></main>'+
 '<script>'+
 'const cs=s=>getComputedStyle(document.querySelector(s));'+
 'const grid=cs(".rr-stats");'+
 'const stat=cs(".rr-stat");'+
 'const hero=cs(".redline-receiver-command");'+
 'const pay=cs(".rr-pay-full");'+
 'const tracks=grid.gridTemplateColumns.split(" ").filter(Boolean).length;'+
 'document.body.dataset.isMobileView=String(document.body.classList.contains("bc-ledger-mobile"));'+
 'document.body.dataset.hasHero=String(hero.borderTopWidth==="3px"&&hero.borderTopColor==="rgb(235, 33, 69)");'+
 'document.body.dataset.hasCards=String(stat.display==="flex"&&stat.flexDirection==="column"&&parseFloat(stat.minHeight)>=100);'+
 'document.body.dataset.cardColumns=String(tracks);'+
 'document.body.dataset.controlsLarge=String(parseFloat(pay.minHeight)>=49);'+
 'document.body.dataset.mobileUntouched=String(stat.display==="block"&&hero.borderTopWidth==="0px");'+
 '</script></body></html>';
};
test('desktop and tablet compute spacious real metric cards; phone layout stays untouched',async()=>{
 const server=createServer((req,res)=>{
  const view=new URL(req.url,'http://localhost').searchParams.get('view')||'desktop';
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(fixture(view));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const profiles=[
   {view:'desktop',size:'1440,900',cols:4},
   {view:'tablet',size:'820,1180',cols:2},
   {view:'mobile',size:'390,844',cols:null}
  ];
  for(const profile of profiles){
   const url='http://127.0.0.1:'+server.address().port+'/?view='+profile.view;
   const child=spawn(process.env.CHROME||'chromium',[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--virtual-time-budget=1100','--window-size='+profile.size,'--dump-dom',url
   ]);
   let output='',error='';
   child.stdout.on('data',d=>output+=d.toString());
   child.stderr.on('data',d=>error+=d.toString());
   const exit=await new Promise(resolve=>{
    const deadline=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},20000);
    child.once('exit',code=>{clearTimeout(deadline);resolve(code??1)});
    child.once('error',()=>{clearTimeout(deadline);resolve(1)});
   });
   assert.equal(exit,0,profile.view+': Chrome exited with error '+error.slice(-500));
   if(profile.cols===null){
    assert.match(output,/data-mobile-untouched="true"/,'Mobile receiver must retain previous look');
   }else{
    assert.match(output,/data-has-hero="true"/,profile.view+' hero missing');
    assert.match(output,/data-has-cards="true"/,profile.view+' cards are cramped');
    assert.match(output,/data-controls-large="true"/,profile.view+' payment action too small');
    assert.match(output,new RegExp('data-card-columns="'+profile.cols+'"'),profile.view+' metric columns incorrect');
   }
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});
