// REDLINE regression: price negotiation must show a genuinely large photograph
// and clicking it must open a separate zoomable viewer, without changing bids.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

const html=String.raw `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/private-photo-ledger-consent-negotiation.css">
</head><body style="margin:0;background:#030305">
<dialog id="redlinePriceNegotiation" class="redline-consent-dialog redline-negotiation-ui" aria-label="Private photograph price negotiation">
 <div class="redline-negotiation-heading"><div class="redline-negotiation-brand">
 <small>BLACKCELL / PRIVATE AGREEMENT</small><h2>PRICE NEGOTIATION</h2></div>
 <span class="redline-negotiation-progress">2 OF 3 · COUNTEROFFERS</span></div>
 <div class="redline-negotiation-prices">
  <div class="redline-negotiation-price is-original"><span>YOUR ORIGINAL PRICE</span><strong>$0.25</strong></div>
  <div class="redline-negotiation-price is-proposed"><span>SENDER COUNTEROFFER</span><strong>$0.50</strong></div>
 </div>
 <div class="redline-negotiation-photo">
  <button class="redline-negotiation-photo-open" type="button" aria-label="Enlarge negotiated photograph to zoom">
   <img alt="Private photograph being reviewed" class="redline-consent-photo"></button>
  <span class="redline-negotiation-photo-caption">⤢ VIEW FULL PHOTOGRAPH · ZOOM AVAILABLE</span>
 </div>
 <p class="redline-negotiation-explain">Accept the sender's price, keep your original, or send a custom counteroffer.</p>
 <div class="redline-negotiation-actions redline-consent-actions">
  <button class="redline-consent-action redline-negotiation-primary" type="button">ACCEPT $0.50</button>
  <button class="redline-consent-action redline-negotiation-secondary" type="button">KEEP MY ORIGINAL PRICE</button>
  <button class="redline-consent-action redline-negotiation-tertiary" type="button">REJECT COUNTER</button>
 </div>
 <div class="redline-negotiation-custom"><h3>SEND YOUR CUSTOM COUNTEROFFER</h3>
  <p>Set the amount without accepting the sender's counteroffer.</p>
  <div class="redline-negotiation-custom-row">
   <input class="redline-consent-amount" placeholder="Your counteroffer · USD">
   <button class="redline-consent-action redline-negotiation-primary" type="button">SEND TO SENDER</button>
  </div>
 </div>
 <p class="redline-negotiation-feedback"></p>
</dialog>
<script src="/private-photo-ledger-negotiation-photo-viewer.js" defer></script>
<script>
window.addEventListener('error',e=>document.body.dataset.viewerError=String(e.message||'Unknown').slice(0,160));
document.addEventListener('DOMContentLoaded',()=>{
 const pic=document.querySelector('.redline-negotiation-photo img');
 const art='<svg xmlns="http://www.w3.org/2000/svg" width="450" height="800" viewBox="0 0 450 800"><rect width="450" height="800" fill="#26333e"/><rect x="52" y="80" width="346" height="650" rx="32" fill="#3e5666"/><circle cx="225" cy="240" r="85" fill="#d3b59b"/><path d="M125 400Q225 330 325 400L350 720H100Z" fill="#253550"/></svg>';
 pic.src=URL.createObjectURL(new Blob([art],{type:'image/svg+xml'}));
 document.getElementById('redlinePriceNegotiation').showModal();
 setTimeout(()=>{
  const dialog=document.getElementById('redlinePriceNegotiation');
  const photo=document.querySelector('.redline-negotiation-photo');
  const bounds=photo.getBoundingClientRect();
  const imBounds=pic.getBoundingClientRect();
  const buttons=[...dialog.querySelectorAll('.redline-negotiation-actions button')];
  const largeEnough=bounds.height>=285&&imBounds.height>=250&&
    pic.complete&&pic.naturalWidth===450;
  document.body.dataset.photoBig=String(largeEnough);
  document.body.dataset.priceControls=String(buttons.length===3&&buttons[0].textContent.includes('ACCEPT $0.50')&&
   dialog.querySelector('.redline-negotiation-custom input'));
  document.querySelector('.redline-negotiation-photo-open').click();
  const viewer=document.getElementById('redlineNegotiationPhotoViewer');
  const img=viewer?.querySelector('.rn-view-image');
  document.body.dataset.viewerOpen=String(Boolean(viewer?.open&&img?.src===pic.src));
  img?.click();
  document.body.dataset.clickZoom=String(Number(img?.dataset.zoomLevel||1)>1.2);
  img?.dispatchEvent(new WheelEvent('wheel',{deltaY:-230,clientX:400,clientY:300,bubbles:true,cancelable:true}));
  document.body.dataset.wheelZoom=String(Number(img?.dataset.zoomLevel||1)>1.6);
  viewer?.querySelector('.rn-view-zoom-value')?.click();
  document.body.dataset.zoomReset=String(img?.dataset.zoomLevel==='1.00');
  viewer?.querySelector('.rn-view-close')?.click();
  document.body.dataset.viewerClose=String(viewer?.open===false&&dialog.open===true);
  document.body.dataset.noBidTriggered=String(buttons.every(x=>!x.disabled));
  document.body.dataset.viewerLayout=JSON.stringify({viewport:innerWidth,photoHeight:bounds.height,imageHeight:imBounds.height,originalHeight:pic.naturalHeight,dialogWidth:dialog.getBoundingClientRect().width});
 },620);
});
</script></body></html>`;
const server=createServer((req,res)=>{
 const path=(req.url||'').split('?')[0];
 if(path==='/test.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(html);return;
 }
 if(path==='/private-photo-ledger-consent-negotiation.css'){
  res.writeHead(200,{'content-type':'text/css'});
  res.end(readFileSync('private-photo-ledger-consent-negotiation.css'));return;
 }
 if(path==='/private-photo-ledger-negotiation-photo-viewer.js'){
  res.writeHead(200,{'content-type':'text/javascript'});
  res.end(readFileSync('private-photo-ledger-negotiation-photo-viewer.js'));return;
 }
 res.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 for(const width of [1200,560]){
  let stdout='',stderr='';
  const child=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--window-size='+width+',860','--virtual-time-budget=2800','--dump-dom',
   'http://127.0.0.1:'+server.address().port+'/test.html'
  ]);
  child.stdout.on('data',d=>stdout+=d.toString());
  child.stderr.on('data',d=>stderr+=d.toString());
  const status=await new Promise(resolve=>{
   const timeout=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},30000);
   child.once('close',code=>{clearTimeout(timeout);resolve(code??1)});
   child.once('error',()=>{clearTimeout(timeout);resolve(1)});
  });
  assert.equal(status,0,'Chrome failed '+stderr.slice(-750));
  for(const name of ['photo-big','price-controls','viewer-open','click-zoom',
   'wheel-zoom','zoom-reset','viewer-close','no-bid-triggered']){
   assert.match(stdout,new RegExp('data-'+name+'="true"'),
    width+'px failed '+name+': '+(stdout.match(/data-viewer-layout="[^"]*"/)||[])[0]+
    ' / '+(stdout.match(/data-viewer-error="[^"]*"/)||[])[0]);
  }
  console.log('Price negotiation '+width+'px: full photograph, zoom and unchanged bid buttons verified');
 }
}finally{await new Promise(resolve=>server.close(resolve))}
