/* Owner-only preview. Explicitly imported, resized photo copies only; no live credentials or transaction records in the sandbox. */
(()=>{
 'use strict';
 const $=s=>document.querySelector(s),app=$('#ledgerApp'),setup=$('#ownerSetup');
 if(!app||!setup)return;
 const authorized=()=>!app.hidden&&!setup.hidden&&window.BLACKCELL_REDLINE_API?.snapshot?.()?.isOwner===true;
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const btn=(text,fn)=>{const b=make('button','rd-dev-button',text);b.type='button';b.addEventListener('click',fn);return b};
 const dialog=make('dialog','rd-dev-dialog');dialog.id='redlineDeveloperPreview';
 const top=make('header','rd-dev-top'),name=make('div','rd-dev-name');
 name.append(make('strong','','REDLINE · DEVELOPER PREVIEW'),make('small','','LOCAL TEST SESSION · NO LIVE RECORDS OR PAYMENTS'));
 const toolbar=make('div','rd-dev-toolbar'),stage=make('div','rd-dev-stage'),notice=make('p','rd-dev-notice','Test chat, Camera Roll or previously shared REDLINE photos, ratings and pricing. No live records or payments.');
 const frameWraps={},frames={},modeButtons={},deviceButtons={};
 let model=null,token='',generation=0,mode='dual',device='desktop',loadedBuild='',reports={},preset='',testLibrary=[],libraryRoom=null,libraryRevision=0,libraryState='idle',libraryMessage='';
 function chooseMode(next){if(next!=='sender'&&preset){preset='';stage.dataset.preset='';phonePreset.setAttribute('aria-pressed','false')}mode=next;stage.dataset.mode=next;for(const [k,b] of Object.entries(modeButtons))b.setAttribute('aria-pressed',String(k===next));for(const role of ['receiver','sender'])frameWraps[role].hidden=next!=='dual'&&role!==next}
 function chooseDevice(next,phone=false){preset=phone?'neon-smarta-2':'';stage.dataset.preset=preset;phonePreset.setAttribute('aria-pressed',String(phone));device=next;stage.dataset.device=next;reports={};for(const [k,b] of Object.entries(deviceButtons))b.setAttribute('aria-pressed',String(k===next&&!phone));for(const f of Object.values(frames))f.contentWindow?.postMessage({type:'rd-dev-device',token,device,preset},'*');reportStatus()}
 for(const [key,label] of [['receiver','Receiver'],['sender','Sender'],['dual','Dual view']]){modeButtons[key]=btn(label,()=>chooseMode(key));toolbar.append(modeButtons[key])}
 for(const [key,label] of [['desktop','Desktop'],['tablet','Tablet'],['mobile','Mobile']]){deviceButtons[key]=btn(label,()=>chooseDevice(key));toolbar.append(deviceButtons[key])}
 const reload=btn('Reload Preview',()=>void reloadPreview());toolbar.append(reload);
 toolbar.append(btn('Reset test',()=>{if(authorized()&&confirm('Clear this temporary test session only?')){clearLibrary();model=fresh();broadcast()}}));
 const phonePreset=btn('Sender’s phone · Neon Smarta 2',()=>{chooseMode('sender');chooseDevice('mobile',true)});
 phonePreset.id='rdDevSenderPhone';phonePreset.title='Estimated Android 11 Chrome viewport: 320 × 480 CSS pixels; actual browser size may differ.';
 toolbar.append(phonePreset);
 const importPhotos=btn('Use previous REDLINE photos',()=>void importPreviousPhotos());toolbar.append(importPhotos);
 const libraryStatus=make('p','rd-dev-notice','');libraryStatus.setAttribute('role','status');
 top.append(name,btn('Close',()=>dialog.close()));
 for(const role of ['receiver','sender']){const wrap=make('section','rd-dev-pane');wrap.append(make('h3','',role.toUpperCase()+' · TEST'));frameWraps[role]=wrap;stage.append(wrap)}
 dialog.append(top,toolbar,notice,libraryStatus,stage);document.body.append(dialog);
 chooseMode(mode);chooseDevice(device);
 function fresh(){return {photos:[],messages:[],active:true,viewing:null,session:crypto.randomUUID()}}
 function sendLibrary(){
  if(!dialog.open||!authorized()||!frames.sender||!libraryRoom||window.BLACKCELL_REDLINE_API.snapshot()?.roomId!==libraryRoom)return;
  frames.sender.contentWindow?.postMessage({type:'rd-dev-library',token,images:testLibrary,status:libraryState,message:libraryMessage},'*');
 }
 function setLibraryStatus(status,message){
  libraryState=status;libraryMessage=message;libraryStatus.textContent=message;sendLibrary();
 }
 function clearLibrary(){
  libraryRevision++;testLibrary=[];libraryRoom=window.BLACKCELL_REDLINE_API?.snapshot?.()?.roomId||null;
  importPhotos.disabled=false;setLibraryStatus('idle','');
 }
 async function importPreviousPhotos(){
  if(!dialog.open||!authorized()||importPhotos.disabled)return;
  const roomId=window.BLACKCELL_REDLINE_API.snapshot()?.roomId;
  if(!roomId){libraryStatus.textContent='Select the sender’s REDLINE room first.';return}
  const rev=++libraryRevision;
  libraryRoom=roomId;testLibrary=[];importPhotos.disabled=true;
  setLibraryStatus('loading','Loading previously shared REDLINE photos…');
  const current=()=>rev===libraryRevision&&dialog.open&&authorized()&&window.BLACKCELL_REDLINE_API.snapshot()?.roomId===roomId;
  try{
   const api=window.BLACKCELL_REDLINE_API;
   if(typeof api.previousPreviewPhotos!=='function')throw Error('Reload BLACKCELL OS to load the new archive reader.');
   const result=await api.previousPreviewPhotos();
   if(!current()||result.roomId!==roomId)return;
   const images=[];
   for(const blob of result.blobs){
    if(!current())return;
    const url=URL.createObjectURL(blob);
    try{
     const img=new Image();img.src=url;await img.decode();
     const scale=Math.min(1,960/Math.max(img.naturalWidth,img.naturalHeight));
     const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
     canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
     const data=canvas.toDataURL('image/jpeg',.78);
     if(data.length<=2000000&&data.startsWith('data:image/jpeg;base64,'))images.push(data);
    }catch(_){}finally{URL.revokeObjectURL(url)}
   }
   if(!current())return;
   if(!images.length){setLibraryStatus('empty','No readable photos found in the previous REDLINE session.');return}
   testLibrary=images;setLibraryStatus('ready',images.length+' previously shared photos available for this temporary test.');
  }catch(e){if(current())setLibraryStatus('error','Photo import unavailable: '+String(e.message||e))}
  finally{if(rev===libraryRevision)importPhotos.disabled=false}
 }
 function reportStatus(){
  if(!dialog.open||!loadedBuild)return;
  const r=reports.receiver,s=reports.sender;
  if(preset){notice.textContent='Safaricom Neon Smarta 2 · Android 11 / Chrome · estimated 320 × 480 CSS px'+(s?' · Actual preview '+s.width+' × '+s.height+' · Sender menu '+(s.menu?'OK':'not visible'):' · Checking sender layout…')+' · '+loadedBuild+' · Local test only. No live payments or records.';return}
  const layout=r?' · Receiver '+r.mode+' ('+r.width+'px)'+(r.mode==='mobile'?' · Header menu '+(r.menu?'OK':'not placed')+' · PAY '+(r.pay?'OK':'not visible'):''):' · Checking receiver layout…';
  notice.textContent='Current interface: '+loadedBuild+layout+' · Local test only. No live payments or records.';
 }
 function broadcast(){if(!model||!dialog.open||!authorized())return;for(const f of Object.values(frames))f.contentWindow?.postMessage({type:'rd-dev-state',token,model},'*')}
 function receive(event){
  if(!dialog.open||!authorized()||!model)return;
  const role=Object.keys(frames).find(k=>event.source===frames[k].contentWindow);
  const m=event.data;if(!role||event.origin!=='null'||m?.type!=='rd-dev-action'||m.token!==token)return;
  const a=m.action,p=m.payload||{};let ok=true;
  if(a==='ready'){event.source.postMessage({type:'rd-dev-device',token,device,preset},'*');broadcast();if(role==='sender')sendLibrary();return}
  if(a==='open-library'&&role==='sender'){
   if(!model.active)return;
   if(libraryRoom===window.BLACKCELL_REDLINE_API.snapshot()?.roomId&&['loading','ready'].includes(libraryState)){sendLibrary();return}
   void importPreviousPhotos();return;
  }
  if(a==='layout'&&['mobile','tablet','os'].includes(p.mode)){
   reports[role]={mode:p.mode,width:Number(p.width)||0,height:Number(p.height)||0,menu:p.menu===true,pay:p.pay===true};reportStatus();return;
  }
  if(!model.active&&a!=='view'){ok=false}
  else if(a==='chat'&&typeof p.body==='string'&&p.body.trim()&&p.body.length<=2000&&model.messages.length<300){
   model.messages.push({id:crypto.randomUUID(),sender_id:role==='receiver'?'00000000-0000-4000-8000-000000000004':'00000000-0000-4000-8000-000000000005',body:p.body.trim(),created_at:new Date().toISOString()});
  }else if(a==='upload'&&role==='sender'&&p.session===model.session&&typeof p.image==='string'&&p.image.length<=2000000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image)){
   model.photos.push({id:crypto.randomUUID(),image_url:p.image,caption:'Local test photograph',file_name:'Test photo',created_at:new Date().toISOString(),decision_status:'pending',amount_cents:0,stars:0});
  }else if(['rate','price','reject','view'].includes(a)&&role==='receiver'){
   const photo=model.photos.find(x=>x.id===p.id);
   if(a==='view'){model.viewing=photo?.id||null}
   else if(!photo)ok=false;
   else if(a==='rate'&&Number.isInteger(p.stars)&&p.stars>=1&&p.stars<=5){photo.stars=p.stars;photo.rated_at=new Date().toISOString()}
   else if(a==='price'&&photo.decision_status==='pending'&&Number.isInteger(p.cents)&&p.cents>=0&&p.cents<=10000000){photo.amount_cents=p.cents;photo.decision_status='accepted';photo.decided_at=photo.priced_at=new Date().toISOString();model.viewing=null}
   else if(a==='reject'&&photo.decision_status==='pending'){photo.decision_status='rejected';photo.decided_at=new Date().toISOString();model.viewing=null}
   else ok=false;
  }else if(a==='close'&&role==='receiver'){model.active=false;model.viewing=null}
  else ok=false;
  if(ok)broadcast();
  event.source.postMessage({type:'rd-dev-ack',token,id:m.id,ok},'*');
 }
 window.addEventListener('message',receive);
 // Reuse current production markup and explicitly allowlisted UI scripts only.
 // No authentication, storage, live client, or live-update code is loaded.
 const allow=new Set(['private-photo-ledger-responsive.js','private-photo-ledger-solid-red.js','private-photo-ledger-simple-sender.js','private-photo-ledger-receiver.js','private-photo-ledger-photo-zoom.js','private-photo-ledger-sender-messenger.js','private-photo-ledger-sender-android-fit.js','private-photo-ledger-viewport-fit.js']);
 // No persistent asset cache: every open or explicit reload revalidates
 // the deployed HTML, scripts and styles using a unique request URL.
 const get=async(url,revision)=>{
  const fresh=new URL(url,location.href);fresh.searchParams.set('rdPreviewRefresh',revision);
  const r=await fetch(fresh,{credentials:'omit',cache:'no-store'});
  if(!r.ok)throw Error('Preview asset unavailable: '+r.status);
  return r.text();
 };
 async function loadAssets(){
  const revision=crypto.randomUUID();
  const html=await get(new URL('private-photo-ledger.html',location.href),revision);
  const doc=new DOMParser().parseFromString(html,'text/html');
  const scripts=[...doc.querySelectorAll('script[src]')].map(e=>new URL(e.getAttribute('src'),location.href)).filter(u=>u.origin===location.origin&&allow.has(u.pathname.split('/').pop()));
  // Preserve production stylesheet ordering, including inline rules.
  // Fetch CSS in the parent so the opaque-origin iframe cannot reuse old links.
  const styleNodes=[...doc.head.querySelectorAll('link[rel=stylesheet],style')];
  const styles=await Promise.all(styleNodes.map(e=>{
   if(e.tagName==='STYLE')return e.textContent;
   const u=new URL(e.getAttribute('href'),location.href);
   if(u.origin!==location.origin||!/^private-photo-ledger[-\w]*\.css$/.test(u.pathname.split('/').pop()))return '';
   return get(u,revision);
  }));
  const body=doc.body;
  body.querySelectorAll('script,iframe,object,embed,link,meta,base').forEach(e=>e.remove());
  for(const e of body.querySelectorAll('*'))for(const a of [...e.attributes])if(/^on/i.test(a.name)||['src','srcset','href','action','formaction','ping'].includes(a.name.toLowerCase()))e.removeAttribute(a.name);
  const sources=await Promise.all(scripts.map(u=>get(u,revision)));
  const adapter=await get(new URL('private-photo-ledger-developer-frame.js',location.href),revision);
  const receiver=scripts.find(u=>u.pathname.endsWith('/private-photo-ledger-receiver.js'));
  const mobile=[...doc.head.querySelectorAll('link[rel=stylesheet]')].map(e=>new URL(e.getAttribute('href'),location.href)).find(u=>u.pathname.endsWith('/private-photo-ledger-receiver-mobile-compact.css'));
  if(!sources.some(s=>s.includes('blackcell:redline:device-mode')&&s.includes('redlineReceiverMenuItems'))||!styles.some(s=>s.includes('Approved compact Apple-style menu')))throw Error('Deployed REDLINE files are stale or incomplete. Reload BLACKCELL OS after deployment.');
  const gallery=styleNodes.find(e=>e.tagName==='LINK'&&e.getAttribute('href')?.includes('private-photo-ledger-upload-choices.css'));
  const galleryVersion=gallery?new URL(gallery.getAttribute('href'),location.href).searchParams.get('v'):'';
  if(!galleryVersion?.includes('fullscreen')||!styles.some(s=>s.includes('Gallery V6'))||!adapter.includes("action:'open-library'"))throw Error('Old photo gallery assets returned. Refresh the REDLINE app before testing.');
  return {markup:body.innerHTML,styles,sources,adapter,build:'Gallery FULLSCREEN 6 · '+[receiver?.searchParams.get('v'),mobile?.searchParams.get('v')].filter(Boolean).join(' / ')};
 }
 function frameDocument(a,role){
  const nonce=crypto.randomUUID(),escapeScript=s=>s.replace(/<\/script/gi,'<\\/script');
  const script=s=>'<script nonce="'+nonce+'">'+escapeScript(s)+'</script>';
  const csp="default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline' "+location.origin+"; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'";
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'">'+a.styles.map(s=>'<style>'+s.replace(/<\/style/gi,'<\\/style')+'</style>').join('')+
   '<style>body{background:#050505!important}#ownerSetup .setup-form,#ownerSetup .rr-access-control,#ownerSetup #ledgerScopeToggle,#ledgerSignOut,#backLink{display:none!important}.rd-dev-local-banner{padding:6px 10px;background:#501524;color:white;font:700 11px system-ui;position:relative;z-index:5}.rd-dev-local-control{width:100%;margin:5px 0;padding:9px;background:#30111a;color:#fff;border:1px solid #ad4059;border-radius:8px}.rd-dev-local-control:disabled{opacity:.5}body[data-rd-dev-preset=neon-smarta-2] .rd-dev-local-banner{display:none!important}</style></head><body>'+a.markup+
   script('window.REDLINE_DEV_CONFIG='+JSON.stringify({role,token,device,preset,origin:location.origin})+';')+script(a.adapter)+a.sources.map(script).join('')+'</body></html>';
 }
 async function reloadPreview(){
  if(!authorized()||!dialog.open||reload.disabled)return;
  const seq=++generation;
  reload.disabled=true;
  notice.textContent='Loading latest deployed REDLINE interface…';
  try{
   const a=await loadAssets();
   if(seq!==generation||!dialog.open||!authorized())return;
   token=crypto.randomUUID();loadedBuild=a.build||'latest deployed assets';reports={};
   for(const role of ['receiver','sender']){
    frames[role]?.remove();
    const f=make('iframe','rd-dev-frame');f.title='REDLINE '+role+' test view';f.setAttribute('sandbox','allow-scripts allow-modals');f.referrerPolicy='no-referrer';
    frames[role]=f;frameWraps[role].append(f);f.srcdoc=frameDocument(a,role);
   }
   reportStatus();
  }catch(e){if(seq===generation&&dialog.open)notice.textContent='Developer preview could not load: '+String(e.message||e)}
  finally{if(seq===generation)reload.disabled=false}
 }
 async function open(){
  if(!authorized()||dialog.open)return;
  model=fresh();token=crypto.randomUUID();reload.disabled=false;loadedBuild='';reports={};
  dialog.showModal();if(preset){chooseMode('sender');chooseDevice('mobile',true)}await reloadPreview();
 }
 dialog.addEventListener('close',()=>{generation++;for(const [role,f] of Object.entries(frames)){f.remove();delete frames[role]}model=null;token='';libraryRevision++;testLibrary=[];libraryRoom=null;libraryState='idle';libraryMessage='';libraryStatus.textContent='';importPhotos.disabled=false});
 const launch=btn('DEVELOPER PREVIEW',()=>void open());launch.id='redlineDeveloperPreviewLaunch';launch.hidden=true;
 function sync(){
  launch.hidden=!authorized();if(dialog.open&&(!authorized()||(libraryRoom&&window.BLACKCELL_REDLINE_API.snapshot()?.roomId!==libraryRoom)))dialog.close();
  const header=$('#redlineReceiverCommand .rr-command-header');
  const group=$('#redlineReceiverCommand .rr-header-menu-group');
  if(header&&launch.parentNode!==header){if(group?.parentNode===header)group.after(launch);else header.append(launch)}
  else if(!header&&launch.parentNode!==setup)setup.append(launch);
 }
 setup.append(launch);window.addEventListener('blackcell:redline:state',sync);window.addEventListener('blackcell:redline:bridge',sync);
 const observer=new MutationObserver(sync);observer.observe(app,{attributes:true,attributeFilter:['hidden']});observer.observe(setup,{attributes:true,attributeFilter:['hidden']});sync();
})();