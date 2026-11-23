import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';
const realHtml=readFileSync('private-photo-ledger.html','utf8');
const cssLinks=[...realHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
 .map(match=>match[0]+'>').join('\n');
let html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+cssLinks+
 '</head><body class="bc-redline-receiver rr-imessage-mode">'+
 '<section id="ownerReviewQueue"><div id="reviewQueueCurrent"></div></section>'+
 '<div id="photoLightbox" class="lightbox" hidden role="dialog">'+
 '<button id="closeLightbox" type="button">✕ CLOSE</button>'+
 '<div class="redline-review-lightbox-layout"><div class="redline-review-large-image">'+
 '<img id="lightboxImage" alt="Full original photograph"></div></div></div>'+
 '</body></html>';
const injected="<style>\n#redlineReceiverReviewStage{display:flex!important;width:95vw!important;height:420px!important;overflow:hidden!important;margin:10px auto!important}\n#redlineReceiverReviewStage #reviewQueueCurrent{display:flex!important;width:100%!important;height:100%!important}\n#redlineReceiverReviewStage .photo-entry{display:flex!important;position:relative!important;width:100%!important;height:100%!important;min-height:320px!important}\n#redlineReceiverReviewStage .photo-image-btn{display:block!important;width:100%!important;height:100%!important;padding:0!important}\n#redlineReceiverReviewStage .photo-image-btn img{display:block!important;width:100%!important;height:100%!important;object-fit:contain!important}\n#photoLightbox:not([hidden]){position:fixed!important;inset:0!important;display:flex!important;z-index:10000!important}\n#photoLightbox:not([hidden]) .redline-review-lightbox-layout{display:flex!important;width:100vw!important;height:100dvh!important}\n#photoLightbox:not([hidden]) .redline-review-large-image{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;height:100%!important}\n#photoLightbox:not([hidden]) #lightboxImage{width:100%!important;height:100%!important;object-fit:contain!important}\n</style>\n<script>\nwindow.addEventListener('error',e=>document.body.dataset.photoZoomError=String(e.message||'error'));\nwindow.addEventListener('unhandledrejection',e=>document.body.dataset.photoZoomRejection=String(e.reason?.stack||e.reason).slice(0,220));\ndocument.body.classList.add('bc-redline-receiver','rr-imessage-mode');\nconst imgSource='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';\nconst stage=document.createElement('div');stage.id='redlineReceiverReviewStage';\nconst queue=document.getElementById('reviewQueueCurrent');queue.hidden=false;\nconst review=document.getElementById('ownerReviewQueue');review.hidden=false;\nstage.append(review);document.body.append(stage);\nconst lightbox=document.getElementById('photoLightbox');\nconst full=document.getElementById('lightboxImage');\nconst close=document.getElementById('closeLightbox');\nclose.addEventListener('click',()=>{lightbox.hidden=true;full.removeAttribute('src')});\nfunction photo(id){\n const card=document.createElement('article');card.className='photo-entry';card.dataset.redlinePhotoId=id;\n const button=document.createElement('button');button.type='button';button.className='photo-image-btn';\n const img=document.createElement('img');img.src=imgSource;img.alt='Test photograph '+id;\n button.append(img);card.append(button);\n button.addEventListener('click',()=>{full.src=img.src;lightbox.hidden=false});\n return {card,img,button};\n}\nconst first=photo('photo-1');queue.replaceChildren(first.card);\n</script>\n<script src=\"/private-photo-ledger-photo-zoom.js\" defer></script>\n<script>\nasync function check(){\n document.body.dataset.zoomStarted='true';\n const sleep=ms=>new Promise(done=>setTimeout(done,ms));\n await sleep(800);\n document.body.dataset.zoomAwake='true';\n const q=s=>document.querySelector(s),data={};\n const inline=first.img,toolbar=first.card.querySelector('.bc-photo-zoom-controls');\n data.inlineControls=Boolean(toolbar&&toolbar.querySelectorAll('button').length===3);\n inline.dispatchEvent(new WheelEvent('wheel',{deltaY:-300,clientX:260,clientY:180,bubbles:true,cancelable:true}));\n data.inlineWheel=Number(inline.dataset.redlineZoom||0)>1.1&&inline.style.transform.includes('scale(');\n toolbar?.querySelector('[data-redline-zoom=\"reset\"]')?.click();\n data.inlineReset=inline.dataset.redlineZoom==='1.00';\n toolbar?.querySelector('[data-redline-zoom=\"in\"]')?.click();\n data.inlinePlus=Number(inline.dataset.redlineZoom||0)>1.2;\n first.button.click();\n await sleep(50);\n data.fullOpens=lightbox.hidden===false&&full.src===inline.src;\n const fullControls=q('#photoLightbox .bc-photo-zoom-controls');\n data.fullControls=Boolean(fullControls?.querySelectorAll('button').length===3);\n full.click();\n const s1=Number(full.dataset.redlineZoom||0);\n data.fullClickMagnifies=s1>1.2&&lightbox.hidden===false;\n full.dispatchEvent(new WheelEvent('wheel',{deltaY:-280,bubbles:true,cancelable:true,clientX:500,clientY:250}));\n const s2=Number(full.dataset.redlineZoom||0);\n data.fullWheel=s2>s1&&lightbox.hidden===false;\n const down=(id,x,y)=>full.dispatchEvent(new PointerEvent('pointerdown',{\n  pointerId:id,pointerType:'touch',isPrimary:id===11,clientX:x,clientY:y,bubbles:true}));\n const move=(id,x,y)=>full.dispatchEvent(new PointerEvent('pointermove',{\n  pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}));\n const up=(id,x,y)=>full.dispatchEvent(new PointerEvent('pointerup',{\n  pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));\n down(11,300,260);down(12,400,260);move(12,460,260);\n const s3=Number(full.dataset.redlineZoom||0);\n data.fullPinch=s3>s2;\n up(11,300,260);up(12,460,260);\n data.closeVisible=getComputedStyle(close).display!=='none'&&getComputedStyle(close).visibility!=='hidden';\n fullControls?.querySelector('[data-redline-zoom=\"reset\"]')?.click();\n data.fullReset=full.dataset.redlineZoom==='1.00'&&lightbox.hidden===false;\n close.click();\n data.closeWorks=lightbox.hidden===true;\n first.button.click();\n await sleep(60);\n data.reopenReset=full.dataset.redlineZoom==='1.00';\n const second=photo('photo-2');queue.replaceChildren(second.card);\n await sleep(100);\n data.newPhotoReset=second.img.dataset.redlineZoom==='1.00'&&\n  Boolean(second.card.querySelector('.bc-photo-zoom-controls'));\n document.body.dataset.zoomFinished='true';\n for(const [name,value]of Object.entries(data))document.body.setAttribute('data-zoom-'+name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),String(value));\n document.body.dataset.zoomMetrics=JSON.stringify(data);\n}\ncheck();\n</script>";
html=html.replace('</body>',injected+'</body>');
const server=createServer((req,res)=>{
 const path=(req.url||'').split('?')[0];
 if(path==='/test.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;
 }
 if(!/^\/[\w.-]+\.(js|css)$/.test(path)){res.writeHead(404).end();return}
 try{
  res.writeHead(200,{'content-type':path.endsWith('.css')?'text/css':'text/javascript'});
  res.end(readFileSync(basename(path)));
 }catch{res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
try{
 for(const width of [1480,900]){
  let out='',err='';
  const proc=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--window-size='+width+',900','--virtual-time-budget=5000','--dump-dom',
   'http://127.0.0.1:'+server.address().port+'/test.html'
  ]);
  proc.stdout.on('data',d=>out+=d.toString());proc.stderr.on('data',d=>err+=d.toString());
  const code=await new Promise(done=>{
   const timeout=setTimeout(()=>{proc.kill('SIGKILL');done(124)},30000);
   // `close` waits for stdout to drain; `exit` can truncate large
   // production HTML before the data-zoom test markers are received.
   proc.once('close',c=>{clearTimeout(timeout);done(c??1)});
   proc.once('error',()=>{clearTimeout(timeout);done(1)});
  });
  assert.equal(code,0,'Chrome failed '+err.slice(-900));
  console.log('ZOOM_PHASE',JSON.stringify({start:out.match(/data-zoom-started="[^"]*"/)?.[0],awake:out.match(/data-zoom-awake="[^"]*"/)?.[0],finished:out.match(/data-zoom-finished="[^"]*"/)?.[0],error:out.match(/data-photo-zoom-error="[^"]*"/)?.[0],rejection:out.match(/data-photo-zoom-rejection="[^"]*"/)?.[0],end:out.slice(-120)}));


  for(const key of [
   'inlineControls','inlineWheel','inlineReset','inlinePlus','fullOpens',
   'fullControls','fullClickMagnifies','fullWheel','fullPinch','closeVisible',
   'fullReset','closeWorks','reopenReset','newPhotoReset']){
   assert.match(out,new RegExp('data-zoom-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+'="true"'),
    width+'px failed '+key+' / '+(out.match(/data-zoom-metrics="[^"]*"/)||[])[0]);
  }
  assert.doesNotMatch(out,/data-photo-zoom-error="[^"]+"/);
  console.log('REDLINE Web OS '+width+'px: inline and full zoom, wheel, pinch, reset and close passed');
 }
}finally{await new Promise(done=>server.close(done));}
