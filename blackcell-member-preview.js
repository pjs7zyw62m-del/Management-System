import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261114-transport-classification';
import {mountStore} from './blackcell-app-store.js?v=20261128-uniform-category2';
const $=id=>document.getElementById(id),db=corporateClient(),frame=$('preview');
let owner=null,verified=false,checking=false,rules=[],metadata=[],styles='',channel='',frameReady=false;
const notice=s=>$('notice').textContent=s;
async function verify(){
 const a=await corporateAuthorize(db);
 if(!a.ok||a.member?.role!=='owner'||Number(a.member.clearance_level)!==7||(owner&&owner!==a.user.id))throw Error('Verified Level 7 owner access required.');
 const r=await db.rpc('corp_code_status');
 if(r.error||!r.data?.ok||!r.data?.verified)throw Error('Corporate security verification required.');
 owner=a.user.id;
}
function deny(e){verified=false;owner=null;frameReady=false;frame.removeAttribute('srcdoc');$('workspace').hidden=true;notice(e?.message||String(e));}
const labels={omega:'OMEGA',uploadqueue:'Uniform Intelligence',community:'Community',notes:'Notes',calendar:'Calendar',reminders:'Reminders',contacts:'Contacts',mail:'BLACKCELL Mail',gunner:'Gunner AI',music:'Music',cinema:'Cinema',wallet:'Wallet',journal:'Journal',vault:'Vault',terminal:'Terminal',voicememos:'Voice Memos',documents:'Documents',spreadsheets:'Spreadsheets',creativestudio:'Creative Studio',worldclock:'World Clock',presentations:'Presentations',calculator:'Calculator'};
async function readCatalog(){
 const result=await db.rpc('corp_app_store',{p_action:'catalog',p_app:null,p_level:null,p_enabled:null});
 if(result.error||!result.data?.ok||result.data.owner!==true||!Array.isArray(result.data.apps))throw Error('Authorized application catalog unavailable.');
 // Only application metadata and distribution rules are passed into the sandbox.
 rules=result.data.apps.map(a=>({id:String(a.id),allowed:a.allowed===true,enabled:a.enabled!==false,minLevel:Number(a.minLevel),core:a.core===true})).filter(a=>/^[a-z]{1,40}$/.test(a.id));
 // Employee Card is intentionally omitted from the owner's catalog; add the member-only core rule unless network-disabled.
 if(!rules.some(a=>a.id==='card')){const blocked=Array.isArray(result.data.networkBlocked)&&result.data.networkBlocked.includes('card');rules.push({id:'card',allowed:!blocked,enabled:!blocked,minLevel:1,core:true})}
}
async function readAssets(){
 const response=await fetch('blackcell-os.html',{cache:'no-store'});if(!response.ok)throw Error('OS metadata unavailable.');
 const doc=new DOMParser().parseFromString(await response.text(),'text/html');
 metadata=Array.from(doc.querySelectorAll('button.app[data-app]')).map(t=>({id:t.dataset.app,title:t.dataset.title,sub:t.dataset.sub,desc:t.dataset.desc,optional:t.dataset.optional==='true',svg:t.querySelector('svg')?.outerHTML||''})).filter(a=>/^[a-z]{1,40}$/.test(a.id));
 const artwork=await fetch('blackcell-mail-icon.svg?v=20261128-1',{cache:'no-store'});
 if(artwork.ok){const markup=await artwork.text();const data=markup.match(/data:image\/webp;base64,[A-Za-z0-9+/=]+/)?.[0];if(data){metadata.push({id:'mail',title:'BLACKCELL Mail',sub:'Private corporate email',desc:'Internal mail for authorized members.',optional:true,svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="bc-mail-approved-art"><image href="'+data+'" width="24" height="24"/></svg>'})}}
 const files=['blackcell-os.css','blackcell-os-app-store-aurora.css','blackcell-app-store-grid.css','blackcell-app-store-desktop.css','blackcell-redline-icon.css','blackcell-mail-icon.css'];
 const sheets=await Promise.all(files.map(async name=>{const r=await fetch(name,{cache:'no-store'});if(!r.ok)throw Error('Store stylesheet unavailable: '+name);return r.text()}));
 styles=sheets.join('\n');
}
function dimensions(){const d=$('device').value,o=$('orientation').value;return d==='desktop'?[1280,800]:d==='tablet'?(o==='portrait'?[820,1180]:[1180,820]):o==='portrait'?[390,844]:[844,390]}
function resize(){
 if(!verified)return;
 const [w,h]=dimensions(),width=Math.max(100,$('deviceStage').clientWidth-26),scale=Math.min(1,width/w,900/h);
 frame.style.width=w+'px';frame.style.height=h+'px';frame.style.transform='scale('+scale+')';
 $('deviceFrame').style.width=Math.ceil(w*scale)+2+'px';$('deviceFrame').style.height=Math.ceil(h*scale)+2+'px';
 $('viewportLabel').textContent=w+' × '+h+' · '+Math.round(scale*100)+'% preview scale';
}
function send(type){
 if(!verified||!frameReady)return;
 frame.contentWindow.postMessage({channel,type,device:$('device').value,level:Number($('level').value),chat:$('chat').checked,rules},'*');
}
function sandboxRuntime(config){
 const {channel,metadata,labels}=config;
 let rules=config.rules,device=config.device,level=config.level,chat=config.chat;
 let installed=new Set(),store=null,active=null;
 const $=id=>document.getElementById(id),desktop=$('desktop'),home=$('home'),appWindow=$('appWindow'),host=$('storeHost'),mock=$('mock');
 const node=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
 const meta=id=>metadata.find(a=>a.id===id)||{id,title:labels[id]||id,sub:'BLACKCELL application',desc:'Registered BLACKCELL application.',optional:true};
 function iconFor(a){
  if(!a.svg)return null;
  const d=new DOMParser().parseFromString(a.svg,'image/svg+xml');
  return d.documentElement.localName==='svg'?document.importNode(d.documentElement,true):null;
 }
 function catalog(){
  return level===0?[]:rules.filter(r=>r.enabled&&r.allowed&&r.minLevel<=level&&r.minLevel<7&&!['administration','developerpreview','store'].includes(r.id)&&(r.id!=='chat'||chat)).map(r=>{
   const a=meta(r.id);return {...a,icon:iconFor(a),color:'#4f617c',glyph:(a.title||r.id).charAt(0),optional:!r.core,allowed:true,enabled:true,minLevel:r.minLevel,installed:installed.has(r.id),removable:true,url:''};
  });
 }
 function visible(){return level===0?['photoledger']:['store',...catalog().filter(a=>a.installed).map(a=>a.id)]}
 function report(){parent.postMessage({channel,type:'count',count:visible().length},'*')}
 function badge(id){
  const a=meta(id),b=node('button','sim-app'),art=node('span','sim-art'),svg=iconFor(a);b.type='button';b.dataset.app=id;
  if(svg)art.append(svg);else art.textContent=(a.title||id).charAt(0);
  b.append(art,node('span','sim-name',a.title||id));b.onclick=()=>open(id);return b;
 }
 function drawHome(){
  home.replaceChildren();for(const id of visible())home.append(badge(id));
  $('dock').replaceChildren();for(const id of visible().slice(0,6))$('dock').append(badge(id));
  $('edition').textContent='BLACKCELL '+(device==='phone'?'MOBILE':device==='tablet'?'TABLET':'OS');
  $('clearance').textContent='LEVEL '+level+' · PREVIEW';report();
 }
 function close(){store?.dispose();store=null;active=null;host.replaceChildren();mock.replaceChildren();appWindow.hidden=true;drawHome()}
 function open(id){
  if(!visible().includes(id))return;close();active=id;appWindow.hidden=false;$('appTitle').textContent=meta(id).title||id;
  host.hidden=id!=='store';mock.hidden=id==='store';
  if(id==='store'){
   store=mountStore(host,{
    catalog,worldCatalog:()=>[],info:()=>({owner:false,level,registered:catalog().length,ledger:catalog().some(a=>a.id==='photoledger')?'Available':'Restricted',networkBlocked:rules.filter(r=>!r.enabled||!r.allowed||r.minLevel>level||r.minLevel===7||r.id==='chat'&&!chat).map(r=>r.id)}),
    install:async(id,on)=>{if(!catalog().some(a=>a.id===id))return {ok:false,error:'Not authorized in this preview.'};if(on)installed.add(id);else installed.delete(id);drawHome();return {ok:true}},
    removeAll:async()=>{installed.clear();drawHome();return {ok:true}},open,refreshCatalog:async()=>({ok:true}),checkRelease:()=>{},onState:()=>{},onBusy:()=>{}
   });
  }else{
   const a=meta(id);mock.append(node('h1','',a.title||id),node('p','',level===0?'Restricted REDLINE-only member experience.':'Application opened successfully in the simulated workspace.'),node('p','','This is a safe preview. No member files, conversations, photos, payments or external services are connected.'));
   if(level!==0){const uninstall=node('button','sim-action','Uninstall from preview');uninstall.onclick=()=>{installed.delete(id);close()};mock.append(uninstall)}
  }
 }
 function layout(){
  document.documentElement.classList.toggle('bc-os-phone',device==='phone');document.documentElement.classList.toggle('bc-os-tablet',device==='tablet');
  desktop.dataset.device=device;
  if(active==='store'){open('store')}else drawHome();
 }
 $('closeWindow').onclick=close;$('homeButton').onclick=close;
 window.addEventListener('message',e=>{
  if(e.source!==parent||e.data?.channel!==channel)return;const m=e.data;
  if(!['configure','reset'].includes(m.type))return;
  const newLevel=Number(m.level);if(!Number.isInteger(newLevel)||newLevel<0||newLevel>6||!['desktop','tablet','phone'].includes(m.device))return;
  if(newLevel!==level||m.type==='reset'){installed.clear();close()}
  level=newLevel;chat=m.chat===true;device=m.device;rules=Array.isArray(m.rules)?m.rules:rules;
  const available=new Set(catalog().map(a=>a.id));for(const id of installed)if(!available.has(id))installed.delete(id);
  if(active&&!visible().includes(active))close();layout();
 });
 layout();parent.postMessage({channel,type:'ready'},'*');
}
const shellCss=String.raw`
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font:14px system-ui,sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}#desktop{position:relative;width:100%;height:100%;background:#000;isolation:isolate;overflow:hidden}#status{height:35px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;background:#151518;font-size:11px;color:#eee}#home{display:grid;grid-template-columns:repeat(auto-fill,88px);grid-auto-rows:96px;gap:14px;padding:25px;align-content:start;position:absolute;inset:35px 0 90px;overflow:auto;scrollbar-width:none}.sim-app{display:flex;align-items:center;flex-direction:column;justify-content:flex-start;gap:7px;background:none;border:0;color:#eee;padding:4px;cursor:pointer;min-width:0}.sim-art{width:56px;height:56px;border-radius:15px;background:linear-gradient(145deg,#59657a,#20232d);display:grid;place-items:center;font-weight:750;font-size:26px;border:1px solid #ffffff30}.sim-art svg{width:32px;height:32px}.sim-app[data-app=store] .sim-art{background:radial-gradient(ellipse at 14% 4%,#52e8fc 0%,transparent 48%),radial-gradient(ellipse at 96% 96%,#ff735f 0%,#ee4da5 25%,transparent 57%),linear-gradient(145deg,#149bfa,#4655ee,#9628d6)}.sim-app[data-app=photoledger] .sim-art{background:linear-gradient(145deg,#d83950,#550b1c)}.sim-name{font-size:11px;line-height:1.2;text-align:center;max-width:88px;overflow-wrap:anywhere}#dock{position:absolute;bottom:15px;left:50%;transform:translateX(-50%);display:flex;gap:9px;background:#28282bd9;border:1px solid #ffffff2a;padding:6px 10px;border-radius:18px;max-width:95%;overflow:hidden}#dock .sim-art{width:43px;height:43px;border-radius:11px}#dock .sim-art svg{width:26px;height:26px}#dock .sim-name{display:none}#appWindow{position:absolute;left:5%;right:5%;top:7%;bottom:10%;z-index:20;border:1px solid #55555c;border-radius:13px;overflow:hidden;display:grid;grid-template-rows:38px minmax(0,1fr);background:#101012}#appHeader{display:flex;align-items:center;justify-content:space-between;background:#202025;padding:0 10px;color:#ddd;font-size:12px}#closeWindow,#homeButton{border:0;background:#34343a;color:#eee;padding:5px 10px;border-radius:6px;cursor:pointer}#storeHost{height:100%;min-height:0;min-width:0;overflow:hidden}#mock{padding:30px;overflow:auto;color:#ddd}#mock p{color:#aaa;max-width:500px}.sim-action{border:1px solid #666;border-radius:9px;background:#25252a;padding:10px;color:#eee}html.bc-os-phone #status{height:54px;background:#000;padding-top:12px}html.bc-os-phone #home{inset:54px 0 80px;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:16px}html.bc-os-phone #appWindow{inset:54px 0 24px;border-radius:0;border:0}html.bc-os-tablet #appWindow{inset:44px 12px 76px}html.bc-os-phone #dock{bottom:22px}html.bc-os-phone #homeButton{position:absolute;z-index:30;bottom:5px;left:50%;transform:translateX(-50%);height:5px;width:116px;padding:0;background:#e8e8eb;border-radius:9px;font-size:0}html:not(.bc-os-phone) #homeButton{display:none}#desktop .bc-store-release-controls button{white-space:nowrap}#desktop .bc-store-release-controls button:not(.bc-store-search){display:none!important}
`;
const safeJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c');
function startFrame(){
 channel=crypto.randomUUID();frameReady=false;
 const config={channel,metadata,labels,rules,device:$('device').value,level:Number($('level').value),chat:$('chat').checked};
 const script='const mountStore='+mountStore.toString()+';('+sandboxRuntime.toString()+')('+safeJSON(config)+');';
 const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'";
 frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><style>'+styles.replace(/<\/style/gi,'<\\/style')+'</style><style>'+shellCss+'</style></head><body><div id="desktop"><header id="status"><strong id="edition"></strong><span id="clearance"></span></header><section id="home"></section><nav id="dock"></nav><section id="appWindow" hidden><header id="appHeader"><button id="closeWindow" aria-label="Return to home">‹ Home</button><strong id="appTitle"></strong><span>PREVIEW</span></header><div id="storeHost"></div><div id="mock" hidden></div></section><button id="homeButton" aria-label="Home">Home</button></div><script>'+script.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
 resize();
}
window.addEventListener('message',e=>{
 if(!verified||e.source!==frame.contentWindow||e.origin!=='null'||e.data?.channel!==channel)return;
 if(e.data.type==='ready'){frameReady=true;send('configure')}
 if(e.data.type==='count'&&Number.isInteger(e.data.count)&&e.data.count>=1&&e.data.count<=100)$('installedLabel').textContent=e.data.count+' installed app'+(e.data.count===1?'':'s');
});
function change(){if(!verified)return;$('orientation').disabled=$('device').value==='desktop';$('chat').disabled=$('level').value==='0';resize();send('configure')}
for(const id of ['device','orientation','level','chat'])$(id).onchange=change;
$('reset').onclick=()=>send('reset');
$('reload').onclick=async()=>{if(!verified||checking)return;checking=true;$('reload').disabled=true;try{await verify();await readCatalog();send('configure');notice('Distribution rules refreshed. Preview only.')}catch(e){deny(e)}finally{checking=false;$('reload').disabled=false}};
new ResizeObserver(resize).observe($('deviceStage'));
async function recheck(){if(!verified||checking)return;checking=true;try{await verify()}catch(e){deny(e)}finally{checking=false}}
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')deny('Signed out. Return to Administration.')});
window.addEventListener('focus',()=>void recheck());setInterval(()=>void recheck(),60000);
try{await verify();await Promise.all([readCatalog(),readAssets()]);verified=true;$('workspace').hidden=false;notice('Verified owner · current application rules · isolated simulation');startFrame();change()}catch(e){deny(e)}
