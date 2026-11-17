/* BLACKCELL Upload Queue — consent-based reverse image search. */
import {corporateClient} from './corp-auth.js?v=20261114-transport-classification';
const client=corporateClient(),$=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let dialog,photo,selected,caption,status,go,engines,resultBody,resultsHead,bingLink;
let current={id:'',image:'',asset:null,area:null,drag:null,engine:'all',google:null,yandex:null,results:[],working:false,version:0,abort:null};
const escapeUrl=s=>{try{const u=new URL(s);const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');if(u.protocol!=='https:'||u.username||u.password||h.includes(':')||h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||/^(?:0|10|127|192\.168|169\.254)\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h))return '';u.hash='';return u.href}catch{return ''}};
const el=(tag,cls,t)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(t!==undefined)x.textContent=t;return x};
const base=name=>String(window.BLACKCELL_CORP_CONFIG?.url||'').replace(/\/$/,'')+'/functions/v1/'+name;
const bound=n=>Math.min(1,Math.max(0,n));
const point=(ev,r)=>({x:bound((ev.clientX-r.left)/Math.max(r.width,1)),y:bound((ev.clientY-r.top)/Math.max(r.height,1))});
const rect=(a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)});
async function auth(){const {data,error}=await client.auth.getSession();if(error||!data.session?.access_token)throw Error('BLACKCELL session expired. Sign in again.');return data.session}
async function invoke(service,method,body,signal){
 const s=await auth(),c=window.BLACKCELL_CORP_CONFIG;
 if(!c?.url||!c?.publishableKey)throw Error('Search backend is not configured.');
 const response=await fetch(base(service),{method,signal,headers:{authorization:'Bearer '+s.access_token,apikey:c.publishableKey,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok||data.ok===false)throw Error(String(data.error||data.code||'Search provider error '+response.status).slice(0,200));
 return data;
}
function build(){
 if(dialog)return;
 dialog=el('dialog','bc-vs-dialog');dialog.id='bcReverseSearchDialog';dialog.setAttribute('aria-labelledby','bcVsTitle');
 const shell=el('div','bc-vs-shell');
 const top=el('header','bc-vs-top'),head=el('div');head.append(el('small','','BLACKCELL OS / EXTERNAL VISUAL SEARCH'),el('h2','','Visual Search'));head.querySelector('h2').id='bcVsTitle';
 const exit=el('button','bc-vs-exit','×');exit.type='button';exit.title='Close';exit.setAttribute('aria-label','Close visual search');exit.onclick=()=>dialog.close();top.append(head,exit);
 const note=el('p','bc-vs-notice','Search the web for similar or matching photographs. Your original remains private; a resized JPEG is shared with search providers only after confirmation.');
 const main=el('div','bc-vs-columns'),left=el('section','bc-vs-photo-col'),right=el('section','bc-vs-control-col');
 left.append(el('h3','','Selected photograph'));
 const viewport=el('div','bc-vs-photo-viewport'),stage=el('div','bc-vs-stage');photo=el('img','bc-vs-preview');photo.alt='Private photo. Drag to select an area to search.';photo.draggable=false;
 selected=el('div','bc-vs-selected');selected.hidden=true;stage.append(photo,selected);viewport.append(stage);left.append(viewport);
 caption=el('p','bc-vs-caption','Drag to select a detail, or search the whole image.');
 const full=el('button','bc-vs-reset','Use Entire Image');full.type='button';full.onclick=()=>{current.area=null;drawSelection();};
 left.append(caption,full);
 right.append(el('h3','','Choose search engines'));
 engines=el('div','bc-vs-engines');engines.setAttribute('role','group');engines.setAttribute('aria-label','Search engines');
 for(const [id,label] of [['all','All'],['google','Google'],['yandex','Yandex'],['bing','Bing']]){
  const b=el('button','bc-vs-engine',label);b.dataset.engine=id;b.type='button';b.onclick=()=>{current.engine=id;showEngine();};engines.append(b);
 }right.append(engines);
 const providerSummary=el('div','bc-vs-providers');providerSummary.id='bcVsProviderSummary';right.append(providerSummary);
 go=el('button','bc-vs-search','Search Similar Images');go.type='button';go.onclick=()=>void search();
 bingLink=el('a','bc-vs-bing','Open Bing Visual Search');bingLink.href='https://www.bing.com/visualsearch';bingLink.target='_blank';bingLink.rel='noopener noreferrer';bingLink.hidden=true;
 status=el('p','bc-vs-status','Choose an uploaded photo.');status.setAttribute('role','status');
 right.append(go,bingLink,status,el('p','bc-vs-privacy','External search can incur usage charges. Google is Cloud Vision, not Google Lens. Bing requires uploading the image on its own website.'));
 main.append(left,right);
 const label=el('div','bc-vs-result-top');label.append(el('h3','','Image matches'));
 resultsHead=el('p','','Results will appear here after you authorize a search.');label.append(resultsHead);
 resultBody=el('div','bc-vs-results');shell.append(top,note,main,label,resultBody);dialog.append(shell);document.body.append(dialog);
 dialog.addEventListener('close',cleanup);
 photo.addEventListener('pointerdown',ev=>{
  if(!photo.naturalWidth||(ev.pointerType!=='touch'&&ev.button!==0))return;
  const p=point(ev,photo.getBoundingClientRect());current.drag={id:ev.pointerId,start:p,last:p};photo.setPointerCapture(ev.pointerId);ev.preventDefault();
 });
 photo.addEventListener('pointermove',ev=>{
  if(!current.drag||ev.pointerId!==current.drag.id)return;
  current.drag.last=point(ev,photo.getBoundingClientRect());
  const r=rect(current.drag.start,current.drag.last);
  if(r.w>.02&&r.h>.02){current.area=r;drawSelection()}
 });
 const end=ev=>{
  if(!current.drag||ev.pointerId!==current.drag.id)return;
  const r=rect(current.drag.start,point(ev,photo.getBoundingClientRect()));
  current.drag=null;current.area=r.w>.04&&r.h>.04?r:null;drawSelection();
  try{photo.releasePointerCapture(ev.pointerId)}catch{}
 };
 photo.addEventListener('pointerup',end);photo.addEventListener('pointercancel',end);
 showEngine();
}
function drawSelection(){
 const r=current.area;selected.hidden=!r;
 if(r)for(const key of ['left','top','width','height'])selected.style[key]=(100*({'left':r.x,'top':r.y,'width':r.w,'height':r.h}[key]))+'%';
 caption.textContent=r?'Searching selected area · '+Math.round(r.w*100)+'% width × '+Math.round(r.h*100)+'% height':'Drag to select a detail, or search the entire image.';
}
function showEngine(){
 if(!dialog)return;
 for(const b of engines.children)b.setAttribute('aria-pressed',String(b.dataset.engine===current.engine));
 go.hidden=current.engine==='bing';bingLink.hidden=current.engine!=='bing';
 if(current.engine==='bing')setStatus('Bing opens its own image search page. Select the original file there; BLACKCELL will not publish your photo.');
 else if(!current.working)setStatus(current.asset?'Ready for a consent-based search.':'Loading private photo…');
}
function setStatus(s,error=false){status.textContent=s;status.dataset.error=String(error)}
function cleanup(){
 current.version++;current.abort?.abort();current.abort=null;
 if(current.image)URL.revokeObjectURL(current.image);
 current={id:'',image:'',asset:null,area:null,drag:null,engine:'all',google:null,yandex:null,results:[],working:false,version:current.version,abort:null};
 if(photo){photo.removeAttribute('src');photo.onload=photo.onerror=null}
 if(resultBody)resultBody.replaceChildren();
}
async function serviceStatus(v){
 const [g,y]=await Promise.allSettled([invoke('blackcell-visual-ai','GET',null,current.abort?.signal),invoke('blackcell-reverse-image','GET',null,current.abort?.signal)]);
 if(v!==current.version)return;
 current.google=g.status==='fulfilled'&&g.value?.capabilities?.web_discovery===true;
 current.yandex=y.status==='fulfilled'&&y.value?.configured===true;
 const container=$('bcVsProviderSummary');container.replaceChildren();
 for(const [label,ready] of [['Google',current.google],['Yandex',current.yandex]]){
  container.append(el('span',ready?'bc-vs-online':'bc-vs-offline',label+' · '+(ready?'Connected':'Setup required')));
 }
}
async function open(id){
 build();
 if(!UUID.test(id))return;
 if(dialog.open)dialog.close();
 current.version++;const version=current.version;
 current.id=id;current.asset=null;current.area=null;current.google=null;current.yandex=null;current.working=true;current.results=[];
 current.abort=new AbortController();resultBody.replaceChildren();resultsHead.textContent='Results appear after your approval.';
 go.disabled=true;drawSelection();showEngine();setStatus('Loading private photograph…');dialog.showModal();
 try{
  const s=await auth();
  const {data,error}=await client.from('corp_social_assets')
   .select('id,owner_id,kind,purpose,review_status,source_provider,filename')
   .eq('id',id).eq('owner_id',s.user.id).maybeSingle();
  if(error||!data||data.kind!=='photo'||data.purpose!=='library'||data.source_provider!=='world-bunny-v1'||!['pending','approved'].includes(data.review_status))
   throw Error('This photo is not available for visual search.');
  current.asset=data;const cfg=window.BLACKCELL_CORP_CONFIG||{};
  const response=await fetch(base('blackcell-world-media')+'?action=read',{method:'POST',signal:current.abort.signal,
   headers:{authorization:'Bearer '+s.access_token,apikey:cfg.publishableKey,'content-type':'application/json'},body:JSON.stringify({id})});
  if(!response.ok)throw Error('Private photograph could not be loaded ('+response.status+').');
  const blob=await response.blob();
  if(!blob.type.startsWith('image/')||blob.size>45*1048576)throw Error('Unsupported or oversized photo.');
  const url=URL.createObjectURL(blob);current.image=url;photo.src=url;
  await new Promise((resolve,reject)=>{if(photo.complete&&photo.naturalWidth)return resolve();photo.onload=resolve;photo.onerror=()=>reject(Error('Your browser could not decode this photo.'))});
  if(version!==current.version||!dialog.open)return;
  current.working=false;go.disabled=false;setStatus('Ready. Choose a provider or select a smaller area.');
  void serviceStatus(version);
 }catch(e){if(version!==current.version)return;current.working=false;go.disabled=true;setStatus(String(e.message||e),true)}
}
function jpeg(){
 if(!photo?.naturalWidth)throw Error('Photo preview has not loaded.');
 const r=current.area||{x:0,y:0,w:1,h:1},w=photo.naturalWidth,h=photo.naturalHeight,
  sx=Math.round(r.x*w),sy=Math.round(r.y*h),sw=Math.max(1,Math.round(r.w*w)),sh=Math.max(1,Math.round(r.h*h));
 const canvas=document.createElement('canvas');let limit=1100;
 for(let i=0;i<5;i++){
  const scale=Math.min(1,limit/Math.max(sw,sh));canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas unavailable.');
  ctx.drawImage(photo,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  const encoded=canvas.toDataURL('image/jpeg',i<2?.75:.55);
  if(encoded.length<1500000){canvas.width=1;canvas.height=1;return encoded}
  limit=Math.round(limit*.72);
 }
 throw Error('Selected photo too large to search safely.');
}
function accept(provider,raw){
 const url=escapeUrl(provider==='Google'?raw?.url:raw?.image_url);
 if(!url)return null;
 return {provider,image:url,source:escapeUrl(raw.source_url)||url,title:String(raw.title||provider+' similar image').slice(0,150)};
}
function showResults(){
 resultBody.replaceChildren();resultsHead.textContent=current.results.length+' results from available providers. Image previews are loaded from external websites.';
 for(const provider of ['Google','Yandex']){
  const rows=current.results.filter(r=>r.provider===provider);
  if(!rows.length)continue;resultBody.append(el('h4','bc-vs-provider-head',provider+' · '+rows.length+' results'));
  const grid=el('div','bc-vs-grid');
  for(const r of rows){
   const card=el('article','bc-vs-card'),link=el('a','bc-vs-image-link');
   link.href=r.source;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';
   const img=el('img');img.src=r.image;img.alt=r.title;img.loading='lazy';img.referrerPolicy='no-referrer';
   img.onerror=()=>{img.hidden=true;link.textContent='Image preview unavailable · Open source'};
   link.append(img);card.append(link,el('p','',r.title));
   const source=el('a','bc-vs-source','Open source');source.href=r.source;source.target='_blank';source.rel='noopener noreferrer';source.referrerPolicy='no-referrer';card.append(source);grid.append(card);
  }
  resultBody.append(grid);
 }
 if(!current.results.length)resultBody.append(el('p','bc-vs-empty','No online results returned. Try another crop or search engine.'));
}
async function search(){
 if(current.working||!current.asset||!dialog.open||current.engine==='bing')return;
 const options=current.engine==='all'?['Google','Yandex']:[current.engine==='google'?'Google':'Yandex'];
 const enabled=options.filter(p=>current[p.toLowerCase()]!==false);
 if(!enabled.length){setStatus('The selected API provider is not configured. You can still use Bing for manual image uploads.',true);return}
 if(!confirm('Send a resized JPEG '+(current.area?'selection':'copy')+' to '+enabled.join(' and ')+' for online reverse-image search? '+enabled.length+' provider request(s) may incur charges. The original BLACKCELL image remains private.'))return;
 const version=current.version;
 let preview;try{preview=jpeg()}catch(e){setStatus(String(e.message||e),true);return}
 current.working=true;go.disabled=true;current.results=[];resultBody.replaceChildren();
 const problems=[];
 for(const p of enabled){
  if(version!==current.version||!dialog.open)return;
  setStatus('Searching '+p+' for similar photographs…');
  try{
   const data=await invoke(p==='Google'?'blackcell-visual-ai':'blackcell-reverse-image','POST',{action:p==='Google'?'web':'search',asset_id:current.id,preview},current.abort?.signal);
   if(version!==current.version||!dialog.open)return;
   const seen=new Set(current.results.map(r=>r.image));
   for(const raw of data.results||[]){const item=accept(p,raw);if(item&&!seen.has(item.image)){current.results.push(item);seen.add(item.image)}}
  }catch(e){problems.push(p+': '+String(e.message||e))}
 }
 if(version!==current.version||!dialog.open)return;
 current.working=false;go.disabled=false;showResults();
 setStatus(current.results.length+' result(s) found. '+(problems.length?problems.join(' · '):'Nothing was saved or published.'),problems.length>0&&current.results.length===0);
}
window.BLACKCELL_VISUAL_SEARCH=Object.freeze({open});
window.addEventListener('pagehide',()=>{if(dialog?.open)dialog.close()});
