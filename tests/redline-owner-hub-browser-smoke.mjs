import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {basename} from 'node:path';
const original=readFileSync('private-photo-ledger.html','utf8');
const styles=[...original.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[0]+'>').join('\n');
const controls=[
 '<section id="ownerSetup" class="panel owner-setup"><div class="section-top"><div>',
 '<div class="eyebrow">OWNER ONLY / INVITATION CONTROL</div><h2>Choose an employee</h2>',
 '<p>Select the person who can submit photos.</p></div><span class="mini-tag">LEVEL 7</span></div>',
 '<form class="setup-form"><label>ASSIGNED EMPLOYEE<select id="employeeChoice"><option>Employee</option></select></label>',
 '<label>ROOM TITLE<input id="roomLabel" value="Private Photo Arrangement"></label>',
 '<button class="button-main" id="createRoom">CREATE PRIVATE ROOM</button></form>',
 '<button id="redlineSetupPreviewButton" class="bc-redline-open-sender-preview">PREVIEW SENDER VIEW</button></section>',
 '<section id="activeRoom"><div class="room-body"><aside class="side-column">',
 '<section id="ownerUploadInfo" class="panel owner-upload-info">',
 '<div class="card-title"><span class="card-icon">▧</span><div><div class="eyebrow">PHOTO UPLOAD</div><h3>Employee Upload Access</h3></div></div>',
 '<p id="ownerUploadDescription">The employee can upload private photos.</p>',
 '<button id="ownerUploadShare" class="button-outline full">COPY EMPLOYEE UPLOAD LINK</button>',
 '<button id="redlineOwnerPreviewButton" class="bc-redline-open-sender-preview">PREVIEW SENDER VIEW</button>',
 '<button class="redline-owner-open-messages">MESSAGE SENDER</button></section>',
 '<section id="ownerLedgerScope" class="panel ledger-scope-card">',
 '<div class="card-title"><span class="card-icon">♢</span><div><div class="eyebrow">OWNER PERMISSIONS</div><h3>Employee Access Scope</h3></div></div>',
 '<div class="ledger-scope-state"><strong id="ledgerScopeStatus">STANDARD CORPORATE ACCESS</strong><span id="ledgerScopeIndicator">STANDARD ACCESS</span></div>',
 '<p id="ledgerScopeDescription">Restrict to REDLINE only or restore corporate access.</p>',
 '<button id="ledgerScopeToggle" class="button-outline full">SET REDLINE ONLY ACCESS</button></section>',
 '<section class="panel link-card"><div class="eyebrow">PRIVATE ROOM LINK</div>',
 '<h3>Send access to the selected person</h3><p>Verified sign-in required. A link alone never grants access.</p>',
 '<button id="copyRoomLink" class="button-outline full">COPY PRIVATE LINK</button><p id="linkFeedback"></p>',
 '</section></aside></div></section>'
].join('');
const measure=[
 'setTimeout(function(){',
 ' const q=s=>document.querySelector(s),r=s=>q(s).getBoundingClientRect();',
 ' const box=r("#ownerUploadInfo"),scope=r("#ownerLedgerScope"),link=r(".link-card"),setup=r("#ownerSetup");',
 ' const share=r("#ownerUploadShare"),preview=r("#redlineOwnerPreviewButton"),message=r(".redline-owner-open-messages");',
 ' const visible=s=>getComputedStyle(q(s)).display!=="none";',
 ' const narrow=innerWidth<1141;',
 ' const checks={',
 '  "single-preview":!visible("#redlineSetupPreviewButton")&&visible("#redlineOwnerPreviewButton"),',
 '  "controls-visible":[share,preview,message].every(x=>x.height>=30&&x.width>45),',
 '  "compact-room":setup.height<250&&r("#createRoom").height<47,',
 '  "compact-cards":box.height<295&&scope.height<295&&link.height<170,',
 '  "button-alignment":Math.abs(share.top-preview.top)<9&&(narrow?message.top>share.top:Math.abs(message.top-preview.top)<9),',
 '  "button-bounds":[share,preview,message].every(x=>x.left>=box.left-2&&x.right<=box.right+2),',
 '  "link-visible":r("#copyRoomLink").height>=30&&r("#copyRoomLink").right<=link.right+2',
 ' };',
 ' Object.entries(checks).forEach(([k,v])=>document.body.setAttribute("data-"+k,String(v)));',
 ' document.body.setAttribute("data-layout",JSON.stringify({width:innerWidth,setup:setup.height,upload:box.height,scope:scope.height,link:link.height,shareY:share.top,previewY:preview.top,messageY:message.top}));',
 '},650);'
].join('\n');
const server=createServer((req,res)=>{
 const path=(req.url||'').split('?')[0];
 if(path==='/owner.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+
  '<style>html,body{margin:0!important;background:#000!important} #ledgerApp.shell{box-sizing:border-box!important;width:100%!important;max-width:none!important;padding:16px!important} #activeRoom .room-body{display:block!important} #activeRoom .room-body .side-column{width:100%!important}</style>'+
  '</head><body class="bc-redline-receiver bc-ledger-desktop bc-redline-apple-mode">'+
  '<main id="ledgerApp" class="shell">'+controls+'</main><script>'+measure+'</script></body></html>');
  return;
 }
 if(!/^\/[\w-]+\.css$/.test(path)){res.writeHead(404).end();return}
 try{res.writeHead(200,{'content-type':'text/css'});res.end(readFileSync(basename(path)))}
 catch{res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
try{
 for(const width of [1600,900]){
  const url='http://127.0.0.1:'+server.address().port+'/owner.html';
  const child=spawn(process.env.CHROME||'chromium',
   ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--window-size='+width+',900','--virtual-time-budget=2500','--dump-dom',url]);
  let stdout='',stderr='';
  child.stdout.on('data',d=>stdout+=d.toString());
  child.stderr.on('data',d=>stderr+=d.toString());
  const status=await new Promise(done=>{
   const timeout=setTimeout(()=>{child.kill('SIGKILL');done(124)},30000);
   child.on('exit',code=>{clearTimeout(timeout);done(code??1)});
   child.on('error',()=>{clearTimeout(timeout);done(1)});
  });
  assert.equal(status,0,stderr.slice(-700));
  for(const name of ['single-preview','controls-visible','compact-room',
   'compact-cards','button-alignment','button-bounds','link-visible']){
    assert.match(stdout,new RegExp('data-'+name+'="true"'),width+'px failed '+name+' '+(stdout.match(/data-layout="[^"]*"/)||[])[0]);
  }
  console.log('Owner hub '+width+'px: compact, non-overlapping and single preview');
 }
}finally{await new Promise(done=>server.close(done))}
