// Real Chrome sender/receiver popup checks without any live accounts or billing.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
let html=readFileSync('private-photo-ledger.html','utf8')
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const setup=String.raw`<script>
window.addEventListener('error',e=>{document.body.dataset.consentJsError=String(e.message||'unknown')});
const owner=new URLSearchParams(location.search).get('role')==='owner';
const room='00000000-0000-4000-8000-000000000013';
const photo='00000000-0000-4000-8000-000000000014';
const request='00000000-0000-4000-8000-000000000015';
let senderStop=false,negEnabled=true,timerEnabled=true,responses=0,counters=0,rejections=0,toggles=0;
let timerStatus={id:request,photo_id:photo,rate_cents:60,
 status:'started',expires_at:new Date(Date.now()+30000).toISOString()};
let offerStatus=owner?{photo_id:photo,original_cents:900,offer_cents:400,
 offer_count:3,status:'awaiting_owner',updated_at:new Date().toISOString()}:null;
window.confirm=()=>true;
window.BLACKCELL_REDLINE_API={
 snapshot:()=>({roomId:room,isOwner:owner,archiveMode:false,roomActive:true,
  userId:owner?'00000000-0000-4000-8000-000000000016':'00000000-0000-4000-8000-000000000017',
  photoHistory:[{id:photo,image_url:'https://example.com/private.jpg',caption:'Test'}]}),
 roomFeatureStatus:async()=>({ok:true,timer_requests_enabled:timerEnabled,
  negotiation_enabled:negEnabled,sender_can_stop_timer:senderStop}),
 setRoomFeature:async(id,key,val)=>{
  toggles++;if(key==='sender_can_stop_timer')senderStop=val;
  if(key==='timer_requests_enabled')timerEnabled=val;
  if(key==='negotiation_enabled')negEnabled=val;
  return {ok:true,timer_requests_enabled:timerEnabled,
   negotiation_enabled:negEnabled,sender_can_stop_timer:senderStop};
 },
 timerRequestStatus:async()=>({ok:true,server_now:new Date().toISOString(),
  request:timerStatus,sender_can_stop_timer:senderStop,timer_requests_enabled:timerEnabled}),
 timerRequestRespond:async(id,accept)=>{if(id===request&&!accept){
  responses++;timerStatus={...timerStatus,status:'declined'};
 }return {ok:true}},
 priceNegotiationStatus:async()=>({ok:true,enabled:negEnabled,
  offers:offerStatus?[offerStatus]:[]}),
 priceNegotiationAction:async(id,action,cents)=>{
  if(action==='counter'){counters++;offerStatus={...offerStatus,
   status:'awaiting_owner',offer_count:1,offer_cents:cents};}
  if(action==='reject_counter'){rejections++;offerStatus={
   ...offerStatus,status:'original_final'};}
  return {ok:true}
 }
};
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('ledgerApp').hidden=false;
 document.getElementById('activeRoom').hidden=false;
 window.dispatchEvent(new Event('blackcell:redline:bridge'));
 if(owner){
  setTimeout(()=>{
   const dialog=document.getElementById('redlinePriceNegotiation');
   document.body.dataset.ownerNegotiation=String(Boolean(dialog?.open&&
    dialog.textContent.includes('3/3 COUNTEROFFERS')));
   const b=[...dialog.querySelectorAll('button')]
    .find(x=>x.textContent.includes('REJECT · YOUR PRICE FINAL'));
   b?.click();
  },2500);
  setTimeout(()=>{
   document.body.dataset.ownerRejectedFinal=String(rejections===1&&
    offerStatus?.status==='original_final');
   document.getElementById('redlineConsentSettingsOpen')?.click();
  },3700);
  setTimeout(()=>{
   const switches=[...document.querySelectorAll('.redline-feature-toggle')];
   document.body.dataset.ownerToggles=String(switches.length===2&&
    switches.some(x=>x.dataset.feature==='sender_can_stop_timer'&&!x.checked));
   switches.find(x=>x.dataset.feature==='sender_can_stop_timer')?.click();
   switches.find(x=>x.dataset.feature==='negotiation_enabled')?.click();
  },4600);
  setTimeout(()=>{
   document.body.dataset.ownerDisabled=String(negEnabled===false&&senderStop===true&&toggles>=2);
  },6800);
 }else{
  setTimeout(()=>{
   const dialog=document.getElementById('redlineSenderTimerApproval');
   document.body.dataset.senderNoTimerPrompt=String(!dialog?.open);
  },1600);
  setTimeout(()=>{
   document.body.dataset.senderNoApproval=String(responses===0);
   offerStatus={photo_id:photo,original_cents:900,offer_cents:null,
    offer_count:0,status:'awaiting_sender',updated_at:new Date().toISOString()};
   window.dispatchEvent(new Event('blackcell:redline:negotiation-changed'));
  },2800);
  setTimeout(()=>{
   document.body.dataset.senderNoOwnerSettings=String(Boolean(
    document.getElementById('redlineConsentSettingsOpen')?.hidden));
  },5200);
  setTimeout(()=>{
   window.dispatchEvent(new Event('blackcell:redline:negotiation-changed'));
  },6600);
  setTimeout(()=>{
   const dlg=document.getElementById('redlinePriceNegotiation');
   document.body.dataset.senderNegDebug=String(Boolean(dlg))+'_'+String(dlg?.open)+'_'+
    String(offerStatus?.status)+'_'+String(dlg?.textContent?.slice(0,80));
   document.body.dataset.senderNegotiation=String(Boolean(dlg?.open&&
    dlg.textContent.includes('RECEIVER ORIGINAL PRICE')));
   const input=dlg?.querySelector('.redline-consent-amount');
   if(input){input.value='2.00';dlg.querySelectorAll('.redline-consent-action')[1]?.click();}
  },7900);
  setTimeout(()=>{
   document.body.dataset.senderCounter=String(counters===1&&offerStatus?.offer_cents===200);
  },9300);
 }
});
</script>
<script src="/private-photo-ledger-consent-negotiation.js" defer></script>`;
html=html.replace('</head>',setup+'</head>');
const server=createServer((req,res)=>{
 if(req.url?.startsWith('/test.html')){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;
 }
 if(req.url?.startsWith('/private-photo-ledger-consent-negotiation.js')){
  res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
  res.end(readFileSync('private-photo-ledger-consent-negotiation.js'));return;
 }
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 for(const role of ['sender','owner']){
  const child=spawn(process.env.CHROME||'chromium',[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--virtual-time-budget=11600','--window-size=390,844','--dump-dom',
   'http://127.0.0.1:'+server.address().port+'/test.html?role='+role
  ]);
  let stdout='',stderr='';
  child.stdout.on('data',d=>stdout+=String(d));
  child.stderr.on('data',d=>stderr+=String(d));
  const exit=await new Promise(resolve=>{
   const t=setTimeout(()=>{child.kill('SIGKILL');resolve(124)},35000);
   child.once('exit',code=>{clearTimeout(t);resolve(code??1)});
   child.once('error',()=>{clearTimeout(t);resolve(1)});
  });
  assert.equal(exit,0,role+' browser failure '+stderr.slice(-800));
  const checks=role==='owner'
   ?['owner-negotiation','owner-rejected-final','owner-toggles','owner-disabled']
   :['sender-no-timer-prompt','sender-no-approval','sender-negotiation',
      'sender-counter','sender-no-owner-settings'];
  for(const flag of checks)
   assert.match(stdout,new RegExp('data-'+flag+'="true"'),role+' '+flag+' missing');
  assert.doesNotMatch(stdout,/data-consent-js-error="[^"]+"/,role+' runtime JS error');
  console.log(role+': immediate timer, owner stop setting and counteroffers passed');
 }
}finally{await new Promise(resolve=>server.close(resolve))}
