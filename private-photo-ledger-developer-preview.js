/* Owner-only preview. Explicitly imported, resized photo copies only; no live credentials or transaction records in the sandbox. */
(()=>{
 'use strict';
 const $=s=>document.querySelector(s),app=$('#developerPreviewApp'),setup=$('#developerPreviewSetup');
 if(!app||!setup)return;
 const authorized=()=>!app.hidden&&!setup.hidden&&window.BLACKCELL_REDLINE_API?.snapshot?.()?.isOwner===true;
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const btn=(text,fn)=>{const b=make('button','rd-dev-button',text);b.type='button';b.addEventListener('click',fn);return b};
 const dialog=make('dialog','rd-dev-dialog');dialog.id='redlineDeveloperPreview';
 const top=make('header','rd-dev-top'),name=make('div','rd-dev-name');
 name.append(make('strong','','REDLINE · DEVELOPER PREVIEW'),make('small','','BUILD 20261127-SENDER-MENU-4 · LOCAL TEST ONLY'));
 const toolbar=make('div','rd-dev-toolbar'),stage=make('div','rd-dev-stage'),notice=make('p','rd-dev-notice','Test chat, Camera Roll or previously shared REDLINE photos, ratings and pricing. No live records or payments.');
 const frameWraps={},frames={},modeButtons={},deviceButtons={};
 let model=null,token='',generation=0,mode='dual',device='desktop',loadedBuild='',reports={},preset='',testLibrary=[],libraryRoom=null,libraryRevision=0,libraryState='idle',libraryMessage='';
 // Receiver desktop inherits the approved mobile presentation in a wide frame.
 // Match the live receiver's chat-first popup shell at all device sizes.
 // The sender retains the requested desktop, tablet or phone layout.
 function layoutDevice(role,requested=device){return role==='receiver'?'mobile':requested}
 function sendDevice(role,frame=frames[role]){frame?.contentWindow?.postMessage({type:'rd-dev-device',token,device:layoutDevice(role),preset:role==='sender'?preset:''},'*')}
 function chooseMode(next){if(next!=='sender'&&preset){preset='';stage.dataset.preset='';phonePreset.setAttribute('aria-pressed','false')}mode=next;stage.dataset.mode=next;for(const [k,b] of Object.entries(modeButtons))b.setAttribute('aria-pressed',String(k===next));for(const role of ['receiver','sender'])frameWraps[role].hidden=next!=='dual'&&role!==next}
 function chooseDevice(next,phone=false){preset=phone?'neon-smarta-2':'';stage.dataset.preset=preset;phonePreset.setAttribute('aria-pressed',String(phone));device=next;stage.dataset.device=next;reports={};for(const [k,b] of Object.entries(deviceButtons))b.setAttribute('aria-pressed',String(k===next&&!phone));for(const role of Object.keys(frames))sendDevice(role);reportStatus()}
 for(const [key,label] of [['receiver','Receiver'],['sender','Sender'],['dual','Dual view']]){modeButtons[key]=btn(label,()=>chooseMode(key));toolbar.append(modeButtons[key])}
 for(const [key,label] of [['desktop','Desktop'],['tablet','Tablet'],['mobile','Mobile']]){deviceButtons[key]=btn(label,()=>chooseDevice(key));toolbar.append(deviceButtons[key])}
 const reload=btn('Reload Preview',()=>void reloadPreview());toolbar.append(reload);
 toolbar.append(btn('Refresh entire Preview app',()=>{const u=new URL(location.href);u.searchParams.set('v','20261127-sender-menu4');u.searchParams.set('_bc_release',String(Date.now()));location.replace(u.href)}));
 toolbar.append(btn('Reset test',()=>{if(authorized()&&confirm('Clear this temporary test session only?')){clearLibrary();model=fresh();broadcast()}}));
 const phonePreset=btn('Sender’s phone · Neon Smarta 2',()=>{chooseMode('sender');chooseDevice('mobile',true)});
 phonePreset.id='rdDevSenderPhone';phonePreset.title='Estimated Android 11 Chrome viewport: 320 × 480 CSS pixels; actual browser size may differ.';
 toolbar.append(phonePreset);
 // Isolated design prototype: no room credentials, imported photos or production RPCs.
 const livePreview=make('dialog','rd-dev-dialog');livePreview.id='rdLiveDesignPreview';
 const liveTop=make('header','rd-dev-top'),liveTitle=make('div','rd-dev-name');
 liveTitle.append(make('strong','','REDLINE LIVE · RESPONSIVE DESIGN'),make('small','','SIMULATED CAMERAS · LOCAL PHOTO AND CHAT TESTS'));
 let liveFrame=null;
 const liveStage=make('div','rd-live-preview-stage'),liveDevices=make('div','rd-dev-toolbar');
 const liveWidths={desktop:'100%',landscape:'1024px',portrait:'768px',mobile:'390px'};
 for(const [key,label] of [['desktop','Desktop'],['landscape','Tablet landscape'],['portrait','Tablet portrait'],['mobile','Mobile']]){
  const b=btn(label,()=>{liveStage.dataset.device=key;for(const child of liveDevices.children)child.setAttribute('aria-pressed',String(child===b));if(liveFrame)liveFrame.style.width=liveWidths[key]});b.setAttribute('aria-pressed',String(key==='desktop'));liveDevices.append(b)
 }
 liveTop.append(liveTitle,btn('Close LIVE preview',()=>livePreview.close()));livePreview.append(liveTop,liveDevices,liveStage);document.body.append(livePreview);
 livePreview.addEventListener('close',()=>{liveFrame?.remove();liveFrame=null});
 dialog.addEventListener('close',()=>{if(livePreview.open)livePreview.close()});
 toolbar.append(btn('REDLINE LIVE · Design preview',()=>{if(!authorized()||!dialog.open)return;liveFrame=make('iframe','rd-dev-frame');liveFrame.title='REDLINE LIVE design simulation';liveFrame.setAttribute('sandbox','allow-scripts');liveFrame.setAttribute('referrerpolicy','no-referrer');liveFrame.setAttribute('allow',"camera 'none'; microphone 'none'");liveFrame.src='blackcell-redline-live-preview.html?v=20261128-live1';liveFrame.style.width='100%';liveStage.dataset.device='desktop';for(const [i,b] of Array.from(liveDevices.children).entries())b.setAttribute('aria-pressed',String(i===0));liveStage.replaceChildren(liveFrame);livePreview.showModal()}));

 toolbar.append(btn('Load 5-star test photos',()=>{
  if(!authorized()||!model?.active)return;
  for(let i=0;i<3;i++){
   const canvas=document.createElement('canvas');canvas.width=480;canvas.height=640;
   const c=canvas.getContext('2d');if(!c)continue;
   c.fillStyle=['#28252e','#17252d','#34212a'][i];c.fillRect(0,0,480,640);
   c.fillStyle='#9b1831';c.fillRect(0,0,480,14);
   c.fillStyle='#fff';c.font='bold 32px system-ui';c.textAlign='center';c.fillText('LOCAL TEST PHOTO',240,290);
   c.font='24px system-ui';c.fillText('★★★★★  ·  '+(i+1),240,338);
   model.photos.push({id:crypto.randomUUID(),image_url:canvas.toDataURL('image/png'),caption:'Synthetic test card (not a live photo)',created_at:new Date().toISOString(),decision_status:'accepted',amount_cents:25+i*25,stars:5});
  }
  broadcast();
  frames.sender?.contentWindow?.postMessage({type:'rd-dev-open-picks',token},'*');
 }));
 const roomPicker=$('#developerPreviewRoom');if(roomPicker)toolbar.append(roomPicker);
 const importPhotos=btn('Use previous REDLINE photos',()=>void importPreviousPhotos());toolbar.append(importPhotos);
 const libraryStatus=make('p','rd-dev-notice','');libraryStatus.setAttribute('role','status');
 top.append(name,btn('Close test',()=>dialog.close()));
 for(const role of ['receiver','sender']){const wrap=make('section','rd-dev-pane');wrap.append(make('h3','',role.toUpperCase()+' · TEST'));frameWraps[role]=wrap;stage.append(wrap)}
 dialog.append(top,toolbar,notice,libraryStatus,stage);document.body.append(dialog);
 chooseMode(mode);chooseDevice(device);
 function fresh(){return {photos:[],messages:[],breakEvents:[],active:true,viewing:null,session:crypto.randomUUID()}}
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
  if(!roomId){libraryStatus.textContent='Select a REDLINE room in the toolbar first.';return}
  const rev=++libraryRevision;
  libraryRoom=roomId;testLibrary=[];importPhotos.disabled=true;
  setLibraryStatus('loading','Loading previously shared REDLINE photos…');
  const current=()=>rev===libraryRevision&&dialog.open&&authorized()&&window.BLACKCELL_REDLINE_API.snapshot()?.roomId===roomId;
  try{
   const api=window.BLACKCELL_REDLINE_API;
   if(typeof api.previousPreviewPhotos!=='function')throw Error('Reload BLACKCELL OS to load the new archive reader.');
   const images=[];
   async function publishBatch(blobs){
    for(const blob of blobs){
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
    testLibrary=images.slice();setLibraryStatus('loading',images.length+' photos ready · loading more…');
   }
   const result=await api.previousPreviewPhotos({onBatch:publishBatch,isCurrent:current});
   if(!current()||result.roomId!==roomId)return;
   // Compatibility with a previously loaded parent bridge.
   if(!images.length&&result.blobs?.length)await publishBatch(result.blobs);
   if(!current())return;
   if(!images.length){setLibraryStatus('empty','No readable photos found in the previous REDLINE session.');return}
   testLibrary=images;setLibraryStatus('ready',images.length+' previously shared photos available for this temporary test.');
  }catch(e){if(current())setLibraryStatus('error','Photo import unavailable: '+String(e.message||e))}
  finally{if(rev===libraryRevision)importPhotos.disabled=false}
 }
 function reportStatus(){
  if(!dialog.open||!loadedBuild)return;
  const r=reports.receiver,s=reports.sender;
  if(preset){notice.textContent='Safaricom Neon Smarta 2 · Android 11 / Chrome · estimated 320 × 480 CSS px'+(s?' · Actual preview '+s.width+' × '+s.height+' · Sender menu '+(s.menu?'OK':'not visible')+' · Smoke Break '+(s.smoke?'IN MENU':'missing')+' · Favorites '+(s.favorites?'IN MENU':'missing')+' · Resubmit '+(s.resubmit?'VISIBLE':'open 5-Star Photos'):' · Checking sender layout…')+' · '+loadedBuild+' · Local test only. No live payments or records.';return}
  const layout=r?' · Receiver '+(device==='desktop'&&r.mode==='mobile'?'Desktop / approved mobile layout':r.mode)+' ('+r.width+'px)'+(r.mode==='mobile'?' · Header menu '+(r.menu?'OK':'not placed')+' · PAY '+(r.pay?'OK':'not visible'):''):' · Checking receiver layout…';
  notice.textContent='Current interface: '+loadedBuild+layout+' · Local test only. No live payments or records.';
 }
 function broadcast(){if(!model||!dialog.open||!authorized())return;for(const f of Object.values(frames))f.contentWindow?.postMessage({type:'rd-dev-state',token,model},'*')}
 function receive(event){
  if(!dialog.open||!authorized()||!model)return;
  const role=Object.keys(frames).find(k=>event.source===frames[k].contentWindow);
  const m=event.data;if(!role||event.origin!=='null'||m?.type!=='rd-dev-action'||m.token!==token)return;
  const a=m.action,p=m.payload||{};let ok=true;
  if(a==='ready'){sendDevice(role);broadcast();if(role==='sender')sendLibrary();return}
  if(a==='open-library'&&role==='sender'){
   if(!model.active)return;
   if(libraryRoom===window.BLACKCELL_REDLINE_API.snapshot()?.roomId&&['loading','ready'].includes(libraryState)){sendLibrary();return}
   void importPreviousPhotos();return;
  }
  if(a==='layout'&&['mobile','tablet','os'].includes(p.mode)){
   reports[role]={mode:p.mode,width:Number(p.width)||0,height:Number(p.height)||0,menu:p.menu===true,pay:p.pay===true,smoke:p.smoke===true,favorites:p.favorites===true,resubmit:p.resubmit===true};reportStatus();return;
  }
  if(!model.active&&a!=='view'){ok=false}
  else if(a==='chat'&&typeof p.body==='string'&&p.body.trim()&&p.body.length<=2000&&model.messages.length<300){
   model.messages.push({id:crypto.randomUUID(),sender_id:role==='receiver'?'00000000-0000-4000-8000-000000000004':'00000000-0000-4000-8000-000000000005',body:p.body.trim(),created_at:new Date().toISOString()});
  }else if(a==='upload'&&role==='sender'&&p.session===model.session&&typeof p.image==='string'&&p.image.length<=2000000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image)){
   model.photos.push({id:crypto.randomUUID(),image_url:p.image,caption:'Local test photograph',file_name:'Test photo',created_at:new Date().toISOString(),decision_status:'pending',amount_cents:0,stars:0});
  }else if(a==='resubmit'&&role==='sender'){
   const original=model.photos.find(x=>x.id===p.id&&!x.resubmission_origin_id&&x.decision_status==='accepted');
   const blocked=model.photos.some(x=>x.resubmission_origin_id===p.id&&['pending','rejected'].includes(x.decision_status));
   if(!original||blocked||model.photos.length>=300)ok=false;
   else model.photos.push({...original,id:crypto.randomUUID(),resubmission_origin_id:original.id,created_at:new Date().toISOString(),decision_status:'pending',amount_cents:0,stars:0,rated_at:null,priced_at:null,decided_at:null});
  }else if(a==='break'){
   const rows=model.breakEvents,req=rows.find(x=>x.id===p.requestId&&x.kind==='request'),ended=rows.some(x=>x.request_id===p.requestId&&x.kind==='end'),acked=rows.some(x=>x.request_id===p.requestId&&x.kind==='ack');
   const open=rows.some(x=>x.kind==='request'&&!rows.some(y=>y.kind==='end'&&y.request_id===x.id)&&Date.now()-Date.parse(x.created_at)<1800000);
   const validPhoto=model.photos.some(x=>x.id===p.photoId&&x.decision_status==='accepted');
   if(p.kind==='request')ok=role==='sender'&&!open;
   else ok=role==='receiver'&&!!req&&!ended&&Date.now()-Date.parse(req.created_at)<1800000&&(p.kind==='ack'&&!acked||p.kind==='end'&&acked||p.kind==='favorite'&&acked&&validPhoto&&!rows.some(x=>x.kind==='favorite'&&x.request_id===p.requestId&&x.photo_id===p.photoId));
   if(ok)rows.unshift({id:crypto.randomUUID(),kind:p.kind,request_id:p.requestId||null,photo_id:p.photoId||null,created_at:new Date().toISOString()});
  }else if(a==='like'&&role==='receiver'&&model.photos.some(x=>x.id===p.id&&x.decision_status!=='pending')&&model.messages.length<300){
   model.messages.push({id:crypto.randomUUID(),sender_id:'00000000-0000-4000-8000-000000000004',body:'REDLINE_PHOTO_SIGNAL:v1:like:'+p.id,created_at:new Date().toISOString()});
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
 const allow=new Set(['private-photo-ledger-responsive.js','private-photo-ledger-solid-red.js','private-photo-ledger-simple-sender.js','private-photo-ledger-receiver.js','private-photo-ledger-photo-zoom.js','private-photo-ledger-sender-messenger.js','private-photo-ledger-sender-android-fit.js','private-photo-ledger-viewport-fit.js','private-photo-ledger-photo-popup.js','private-photo-ledger-break.js','private-photo-ledger-sender-reuse.js','private-photo-ledger-money-keypad.js','private-photo-ledger-keyboard-safe.js']);
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
  if(!sources.some(s=>s.includes('rdIndependentReview'))||!styles.some(s=>s.includes('Independent receiver review')))throw Error('Updated receiver popup assets are unavailable. Refresh REDLINE.');
  if(!sources.some(s=>s.includes('rr-popup-menu-mode')&&s.includes('openReceiverPanel'))||!styles.some(s=>s.includes('#redlineReceiverMenuOverlay'))||!adapter.includes('localRoomDirectory'))throw Error('New REDLINE menu or room preview assets are unavailable. Reload after deployment.');
  if(!sources.some(s=>s.includes('rd-break-toolbar'))||!sources.some(s=>s.includes('BLACKCELL_REDLINE_REUSE_UI=Object.freeze'))||!adapter.includes('breakEvents:async'))throw Error('Smoke break and resubmit preview assets are incomplete. Reload after deployment.');
  return {markup:body.innerHTML,styles,sources,adapter,build:'Sender menu 4 / Session Records moved / Smoke Break / Favorites / Resubmit · Gallery FULLSCREEN 7 · '+[receiver?.searchParams.get('v'),mobile?.searchParams.get('v')].filter(Boolean).join(' / ')};
 }
 function frameDocument(a,role){
  const nonce=crypto.randomUUID(),escapeScript=s=>s.replace(/<\/script/gi,'<\\/script');
  const script=s=>'<script nonce="'+nonce+'">'+escapeScript(s)+'</script>';
  const csp="default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline' "+location.origin+"; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'";
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'">'+a.styles.map(s=>'<style>'+s.replace(/<\/style/gi,'<\\/style')+'</style>').join('')+
   '<style>body{background:#050505!important}#ownerSetup .setup-form,#ownerSetup .rr-access-control,#ownerSetup #ledgerScopeToggle,#ledgerSignOut,#backLink{display:none!important}.rd-dev-local-banner{padding:6px 10px;background:#501524;color:white;font:700 11px system-ui;position:relative;z-index:5}.rd-dev-local-control{width:100%;margin:5px 0;padding:9px;background:#30111a;color:#fff;border:1px solid #ad4059;border-radius:8px}.rd-dev-local-control:disabled{opacity:.5}body[data-rd-dev-preset=neon-smarta-2] .rd-dev-local-banner{display:none!important}</style></head><body>'+a.markup+
   script('window.REDLINE_DEV_CONFIG='+JSON.stringify({role,token,device:layoutDevice(role),preset:role==='sender'?preset:'',origin:location.origin})+';')+script(a.adapter)+a.sources.map(script).join('')+'</body></html>';
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
 const launch=btn('Open Developer Preview',()=>void open());launch.id='redlineDeveloperPreviewLaunch';launch.hidden=true;
 function sync(){
  launch.hidden=!authorized();if(dialog.open&&!authorized())dialog.close();
  else if(dialog.open&&libraryRoom&&window.BLACKCELL_REDLINE_API.snapshot()?.roomId!==libraryRoom){clearLibrary();model=fresh();broadcast()}
  if(authorized()&&!autoOpened){autoOpened=true;void open()}
 }
 let autoOpened=false;
 setup.append(launch);window.addEventListener('blackcell:redline:state',sync);window.addEventListener('blackcell:redline:bridge',sync);
 const observer=new MutationObserver(sync);observer.observe(app,{attributes:true,attributeFilter:['hidden']});observer.observe(setup,{attributes:true,attributeFilter:['hidden']});sync();
})();