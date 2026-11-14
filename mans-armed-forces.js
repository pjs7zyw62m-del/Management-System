/* BLACKCELL / MAN'S ARMED FORCES
 * Independent authenticated landing page preceding the existing Military Library.
 * Renders ONLY approved, non-adult-restricted photos using short-lived URLs.
 * Does not register, modify, share, or publish any member or Bunny media.
 */
import {authorizeUniformHub,corporate} from './uniform-hub-auth.js?v=20261112-access2';
import {createPhotoDedupe} from './corporate-photo-dedupe.js?v=20261111-phonecheck2';

const $=id=>document.getElementById(id);
let approved=[],shown=[],filterBranch='all',filterStyle='all',filterCategory='all',lastSigned=0,authorized=null;
let authBusy=false;
const sizeLimit=48;
const MAX_BATCH=1000;
const allowedPhotos=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic']);
let page=0,renderToken=0,uploading=false,queuePaused=false,viewerAsset=null;
const uploadState={user:null,assets:[]};
const dedupe=createPhotoDedupe({client:corporate,state:uploadState,mediaUrl:a=>a.signedUrl||'',toast:console.info});
const bucket=corporate.storage.from('corp-social-media');
const owner=()=>authorized?.member?.role==='owner'&&Number(authorized.member.clearance_level)===7;
const signedMs=25*60*1000;
const words={
 dress:['dress','service','formal','blues','suit','coat','tailored','insignia','ribbon','tie','ceremonial'],
 field:['field','combat','training','camouflage','fatigue','tactical','exercise','patrol','acu','bdus','battle'],
 naval:['navy','naval','sailor','maritime','sea','coast','ship','whites','seaman'],
 ceremonial:['ceremony','ceremonial','honor','parade','guard','dress','formation','color','march','tribute']
};

const categories={
 military:{label:'Military',pattern:/\b(army|military|marine corps|marines|navy|naval|air force|airman|soldier|sailor|coast guard|national guard|special ops|special operations|armed forces)\b/i},
 police:{label:'Law Enforcement',pattern:/\b(police|sheriff|deputy|state trooper|highway patrol|law enforcement|swat|constable|policeman)\b/i},
 fire:{label:'Fire & Rescue',pattern:/\b(firefighter|firefighters|fireman|firehouse|fire department|fire brigade|wildland fire|turnout gear|fire rescue)\b/i},
 medical:{label:'Emergency Medical',pattern:/\b(paramedic|emt|emergency medical|ambulance|first responder|rescue medic)\b/i},
 security:{label:'Corrections & Security',pattern:/\b(correctional|corrections|prison guard|security guard|security officer|protective service|detention officer|custody officer)\b/i},
 professional:{label:'Professional Uniforms',pattern:/\b(pilot|airline|flight crew|merchant marine|maritime|ship crew|train conductor|transit|transportation|aviation|seafarer)\b/i}
};
function inferCategory(a){
 const tags=Array.isArray(a.military_tags)?a.military_tags:[];
 const explicit=tags.filter(t=>/^maf:(military|police|fire|medical|security|professional|unsorted)$/.test(t));
 if(explicit.length)return explicit[0].slice(4);
 const t=searchable(a).replace(/[_-]+/g,' ');
 const hits=Object.entries(categories).filter(([key,v])=>v.pattern.test(t)).map(([key])=>key);
 if(['Army','Marine Corps','Navy','Air Force','Coast Guard','Space Force','National Guard','Special Operations','Naval Infantry'].includes(branchOf(a))&&!hits.includes('military'))hits.push('military');
 // Conflicting evidence must not be silently filed into the wrong service.
 return hits.length===1?hits[0]:'unsorted';
}
function matchesCategory(a,category){return category==='all'||inferCategory(a)===category}
function displayCategory(category){return category==='unsorted'?'Unsorted':categories[category]?.label||'All Uniforms'}

function text(el,value){if(el)el.textContent=String(value??'')}
function safe(x){return String(x||'').trim().slice(0,180)}
function branchOf(a){return safe(a.military_branch)||'Unspecified'}
function searchable(a){
 return [a.filename,a.caption,a.military_branch,a.military_category,a.military_era,...(Array.isArray(a.military_tags)?a.military_tags:[])]
 .filter(Boolean).join(' ').toLowerCase();
}
function matches(a){
 if(!matchesCategory(a,filterCategory))return false;
 if(filterBranch!=='all'&&branchOf(a)!==filterBranch)return false;
 if(filterStyle==='all')return true;
 const str=searchable(a);
 return (words[filterStyle]||[]).some(word=>str.includes(word));
}
function placeholder(title,body){
 const div=document.createElement('div');div.className='mf-photo-empty';
 const heading=document.createElement('strong');heading.textContent=title;
 const desc=document.createElement('p');desc.textContent=body;
 div.append(heading,desc);return div;
}
function setFilter({branch='all',style='all',category='all'}={}){
 filterBranch=branch;filterStyle=style;filterCategory=category;page=0;
 document.querySelectorAll('[data-category-filter]').forEach(btn=>{
  const selected=btn.dataset.categoryFilter===category;
  btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-filter]').forEach(btn=>{
  const selected=category==='military'&&btn.dataset.filter===branch;
  btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-branch]').forEach(btn=>btn.classList.toggle('active',category==='military'&&btn.dataset.branch===branch));
 document.querySelectorAll('[data-category]').forEach(btn=>btn.classList.toggle('active',btn.dataset.category===category));
 render();
 $('collection')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function formatMetadata(a){
 return [displayCategory(inferCategory(a)),inferCategory(a)==='military'&&branchOf(a)!=='Unspecified'?branchOf(a):'',safe(a.military_era)]
 .filter(Boolean).join(' · ')||'MILITARY LIBRARY';
}
function openViewer(a){
 if(!authorized||!a||!a.signedUrl)return;
 const dialog=$('mfLightbox');
 if(!dialog?.showModal)return;
 $('mfViewerImage').src=a.signedUrl;
 $('mfViewerImage').alt=safe(a.caption)||safe(a.filename)||'Approved military photograph';
 text($('mfViewerTitle'),safe(a.caption)||safe(a.filename)||'Military photograph');
 text($('mfViewerMeta'),formatMetadata(a));
 viewerAsset=a;
 $('mfMoveWrap').hidden=!(owner()||a.owner_id===authorized.user.id);
 $('mfMoveCategory').value=inferCategory(a);
 dialog.showModal();
}
async function render(){
 const token=++renderToken,grid=$('mfPhotoGrid');if(!grid)return;
 shown=approved.filter(matches);
 const pages=Math.max(1,Math.ceil(shown.length/sizeLimit));
 page=Math.max(0,Math.min(page,pages-1));
 const visible=shown.slice(page*sizeLimit,(page+1)*sizeLimit);
 text($('mfImageCount'),approved.length);
 for(const b of document.querySelectorAll('[data-category-filter]')){
  if(!b.dataset.originalLabel)b.dataset.originalLabel=b.textContent.trim();
  const count=b.dataset.categoryFilter==='all'?approved.length:approved.filter(a=>inferCategory(a)===b.dataset.categoryFilter).length;
  b.textContent=b.dataset.originalLabel+' ('+count+')';
 }
 $('mfPagination').hidden=pages<=1;
 $('mfPreviousPage').disabled=page===0;
 $('mfNextPage').disabled=page>=pages-1;
 text($('mfPageLabel'),'PAGE '+(page+1)+' / '+pages);
 grid.replaceChildren();
 if(!visible.length){
  grid.append(placeholder(approved.length?'NO MATCHES FOR THIS SELECTION':'YOUR COLLECTION IS READY','Upload photographs or choose another uniform collection. Pending and restricted uploads stay private.'));
  text($('mfCollectionStatus'),'No approved '+displayCategory(filterCategory).toLowerCase()+' photographs.');
  return;
 }
 text($('mfCollectionStatus'),'Loading '+visible.length+' of '+shown.length+' photographs…');
 for(let i=0;i<visible.length;i+=20){
  const group=visible.slice(i,i+20).filter(a=>!a.signedUrl||Date.now()-(a.signedAt||0)>signedMs);
  if(!group.length)continue;
  const out=await bucket.createSignedUrls(group.map(a=>a.storage_path),1800);
  if(token!==renderToken)return;
  for(let j=0;j<group.length;j++){
   if(out.data?.[j]?.signedUrl){group[j].signedUrl=out.data[j].signedUrl;group[j].signedAt=Date.now()}
  }
 }
 if(token!==renderToken)return;
 let unavailable=0;
 for(const a of visible){
  if(!a.signedUrl){unavailable++;continue}
  const card=document.createElement('button');card.type='button';card.className='mf-photo-card';
  const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=a.signedUrl;img.alt=safe(a.caption)||safe(a.filename)||'Uniform photograph';
  const details=document.createElement('div');details.className='mf-photo-info';
  const title=document.createElement('strong');title.textContent=(safe(a.caption)||safe(a.filename)||'Uniform photograph').slice(0,85);
  const subtitle=document.createElement('small');subtitle.textContent=formatMetadata(a).slice(0,100);
  details.append(title,subtitle);card.append(img,details);card.addEventListener('click',()=>openViewer(a));grid.append(card);
 }
 text($('mfCollectionStatus'),shown.length+' photographs · '+displayCategory(filterCategory)+(filterBranch!=='all'?' · '+filterBranch:'')+(unavailable?' · '+unavailable+' previews unavailable':'')+'. Tap a photo to view it in full.');
}
function categoryTags(a,category){
 const old=Array.isArray(a?.military_tags)?a.military_tags.filter(t=>!String(t).startsWith('maf:')):[];
 return ['maf:'+category,...old].slice(0,15);
}
async function movePhoto(a,category){
 if(!authorized||!a||!(owner()||a.owner_id===authorized.user.id))return;
 const tags=categoryTags(a,category);
 const {error}=await corporate.from('corp_social_assets').update({military_tags:tags}).eq('id',a.id).eq('owner_id',a.owner_id);
 if(error)throw Error(error.message);
 a.military_tags=tags;
 text($('mfViewerMeta'),formatMetadata(a));
 void render();
}
function filenameBranch(name){
 const n=String(name||'').replace(/[_-]/g,' ');
 for(const [rx,branch] of [[/\b(USMC|marine corps|marines)\b/i,'Marine Corps'],[/\barmy\b/i,'Army'],[/\bnavy\b/i,'Navy'],[/\bair force\b/i,'Air Force'],[/\bcoast guard\b/i,'Coast Guard'],[/\bspace force\b/i,'Space Force'],[/\bnational guard\b/i,'National Guard']])if(rx.test(n))return branch;
 return 'Unspecified';
}
async function aiPreview(file){
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Image cannot be previewed on this device'));image.src=url});
  const scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.78);
 }finally{URL.revokeObjectURL(url)}
}
async function uploadUniforms(files){
 if(uploading||!authorized)return;
 const selected=Array.from(files||[]),picked=selected.slice(0,MAX_BATCH);
 const good=picked.filter(f=>allowedPhotos.has(f.type)&&f.size>0&&f.size<=45*1048576);
 if(!good.length){text($('mfUploadStatus'),'Choose supported photographs up to 45 MB each.');return}
 const category=$('mfUploadCategory').value;
 const direct=owner()&&$('mfUploadDirect').checked;
 let useAI=direct&&category==='auto'&&$('mfUploadAi').checked;
 if(useAI&&!confirm('Use the paid visual AI service for up to 60 photos in this batch, subject to your remaining daily allowance? The rest will use filenames or remain Unsorted. Original files are preserved.'))useAI=false;
 let aiRemaining=useAI?60:0,aiSkipped=0,aiFailures=0,done=0,saved=0,duplicates=0,failed=0,unsorted=0;
 const uid=authorized.user.id;
 uploading=true;queuePaused=false;
 const progress=$('mfUploadProgress');progress.hidden=false;progress.max=good.length;progress.value=0;
 $('mfUploadChoose').disabled=true;$('mfUploadClose').disabled=true;$('mfUploadCategory').disabled=true;$('mfUploadAi').disabled=true;$('mfUploadDirect').disabled=true;$('mfUploadPause').hidden=false;
 try{
  for(const file of good){
   while(queuePaused&&authorized?.user?.id===uid){await new Promise(res=>setTimeout(res,300))}
   if(authorized?.user?.id!==uid)break;
   text($('mfUploadStatus'),'Uploading '+(done+1)+' / '+good.length+' · '+file.name.slice(0,65));
   try{
    const check=await dedupe.preflight(file);
    const hit=check.matches[0];
    if(hit?.type==='exact'){duplicates++;continue}
    if(hit?.type==='possible'&&!confirm('Possible duplicate: '+file.name+'. Keep both copies?')){duplicates++;continue}
    let target=category==='auto'?inferCategory({filename:file.name}):category;
    if(!['military','police','fire','medical','security','professional','unsorted'].includes(target))target='unsorted';
    const id=crypto.randomUUID(),ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'jpg';
    const path=uid+'/'+id+'.'+ext;
    const asset={id,owner_id:uid,purpose:'library',kind:'photo',mime_type:file.type,filename:file.name.slice(0,180),storage_path:path,bytes:file.size,
      military_category:target==='unsorted'?'Unsorted':'Uniforms',military_branch:target==='military'?filenameBranch(file.name):'Unspecified',military_tags:['maf:'+target]};
    if(direct)Object.assign(asset,{review_status:'approved',rights_confirmed:true,adult_restricted:false});
    const up=await bucket.upload(path,file,{contentType:file.type,cacheControl:'1800',upsert:false});
    if(up.error)throw Error(up.error.message);
    const added=await corporate.from('corp_social_assets').insert(asset).select('id,review_status').single();
    if(added.error){await bucket.remove([path]).catch(()=>{});throw Error(added.error.message)}
    saved++;
    uploadState.assets.push(asset);
    await dedupe.record(asset,check.fingerprint).catch(()=>false);
    if(useAI&&aiRemaining>0&&added.data?.review_status==='approved'){
     aiRemaining--;
     try{
      text($('mfUploadStatus'),'Identifying uniform with AI · '+(done+1)+' / '+good.length);
      const preview=await aiPreview(file);
      const result=await corporate.functions.invoke('blackcell-military-ai',{body:{action:'analyze_uniform',asset_id:id,preview_image:preview}});
      let data=result.data;if(result.error?.context?.json)try{data=await result.error.context.json()}catch(_){}
      if(result.error||!data?.ok) {
       if(['AI_DAILY_CAP','AI_CREDITS_EXHAUSTED','AI_SPEND_LIMIT','AI_NOT_CONFIGURED'].includes(data?.code))aiRemaining=0;
       throw Error(data?.error||result.error?.message||'AI classification unavailable');
      }
      const a=data.analysis;
      const tag=(a?.tags||[]).find(t=>/^maf:(military|police|fire|medical|security|professional|unsorted)$/.test(t));
      const suggested=tag&&['high','medium'].includes(a.confidence)&&a.nudity_level==='none'?tag.slice(4):'unsorted';
      if(suggested!=='unsorted'){
       const updates={military_tags:categoryTags(asset,suggested),military_category:'Uniforms',military_branch:suggested==='military'?(a.military_branch||'Unspecified'):'Unspecified'};
       if(suggested==='military'&&/^[A-Z]{2}$/.test(a.country_code||''))updates.military_country_code=a.country_code;
       const update=await corporate.from('corp_social_assets').update(updates).eq('id',id).eq('owner_id',uid);
       if(update.error)throw Error(update.error.message);
       Object.assign(asset,updates);target=suggested;
      }
     }catch(e){aiFailures++;console.warn('Uniform AI unavailable:',e?.message)}
    }else if(useAI)aiSkipped++;
    if(target==='unsorted')unsorted++;
   }catch(e){failed++;console.warn('Uniform upload failed:',e?.message)}
   finally{done++;progress.value=done}
  }
  await loadApproved();
  text($('mfUploadStatus'),saved+' saved · '+duplicates+' duplicates skipped · '+failed+' failed · '+unsorted+' unsorted'+(useAI?' · '+aiFailures+' AI errors · '+aiSkipped+' not visually analyzed':'')+(selected.length>picked.length?' · '+(selected.length-picked.length)+' over batch limit':'')+(picked.length>good.length?' · '+(picked.length-good.length)+' unsupported':'')+(direct?' · eligible owner photos available directly':' · uploads pending review')+'.');
 }finally{
  uploading=false;queuePaused=false;$('mfUploadChoose').disabled=false;$('mfUploadClose').disabled=false;$('mfUploadCategory').disabled=false;$('mfUploadAi').disabled=false;$('mfUploadDirect').disabled=false;$('mfUploadPause').hidden=true;
 }
}

function wire(){
 $('mfUploadOpen').addEventListener('click',()=>{$('mfUploadForm').hidden=false});
 $('mfUploadClose').addEventListener('click',()=>{if(!uploading)$('mfUploadForm').hidden=true});
 $('mfUploadChoose').addEventListener('click',()=>{$('mfUploadFiles').value='';$('mfUploadFiles').click()});
 $('mfUploadFiles').addEventListener('change',()=>{const input=$('mfUploadFiles'),files=Array.from(input.files||[]);input.value='';void uploadUniforms(files)});
 $('mfUploadPause').addEventListener('click',()=>{queuePaused=!queuePaused;$('mfUploadPause').textContent=queuePaused?'▶ RESUME QUEUE':'Ⅱ PAUSE QUEUE';if(queuePaused)text($('mfUploadStatus'),'Paused after the current item finishes.');});
 $('mfPreviousPage').addEventListener('click',()=>{page--;void render()});
 $('mfNextPage').addEventListener('click',()=>{page++;void render()});
 $('mfMoveCategory').addEventListener('change',async()=>{try{await movePhoto(viewerAsset,$('mfMoveCategory').value)}catch(e){alert('Category update failed: '+e.message);$('mfMoveCategory').value=inferCategory(viewerAsset)}});
 document.querySelectorAll('[data-category-filter]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({category:btn.dataset.categoryFilter})));
 document.querySelectorAll('[data-category]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({category:btn.dataset.category})));
 document.querySelectorAll('[data-filter]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({branch:btn.dataset.filter,category:'military'})));
 document.querySelectorAll('[data-branch]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({branch:btn.dataset.branch,category:'military'})));
 const dialog=$('mfLightbox');
 $('mfCloseViewer')?.addEventListener('click',()=>dialog?.close());
 dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 dialog?.addEventListener('close',()=>{$('mfViewerImage').removeAttribute('src')});
 document.querySelectorAll('.mf-portrait img').forEach(image=>{
  image.addEventListener('error',()=>{
   image.style.opacity='0';
   image.closest('figure')?.classList.add('mf-image-fallback');
  });
 });
}
async function loadApproved(){
 text($('mfCollectionStatus'),'Loading the private uniform collection…');
 try{
  const candidates=[];
  for(let offset=0;authorized;offset+=500){
   const {data,error}=await corporate.from('corp_social_assets')
    .select('id,owner_id,filename,caption,storage_path,military_branch,military_category,military_era,military_tags,review_status,adult_restricted,purpose,kind,created_at')
    .eq('review_status','approved').eq('adult_restricted',false).eq('purpose','library').eq('kind','photo')
    .order('created_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+499);
   if(error)throw Error(error.message);
   candidates.push(...(data||[]).filter(a=>a.storage_path&&a.id));
   if(!data||data.length<500)break;
  }
  approved=candidates;uploadState.assets=approved.slice();lastSigned=Date.now();
  await render();
 }catch(e){text($('mfCollectionStatus'),'Uniform collection unavailable: '+safe(e?.message||'Connection error'))}
}
async function securityCheck(){
 if(!authorized||authBusy||document.hidden)return;
 authBusy=true;
 try{
  const result=await corporate.auth.getUser();
  if(result.error||result.data.user?.id!==authorized.user.id)throw Error('Session ended.');
  const fn=authorized.member.role==='owner'?'corp_code_status':'corp_employee_code_status';
  const check=await corporate.rpc(fn);
  if(check.error||check.data?.verified!==true)throw Error('Corporate verification expired.');
  if(Date.now()-lastSigned>signedMs)await loadApproved();
 }catch(_){
  authorized=null;
  $('uMain').hidden=true;$('uGate').hidden=false;
  text($('uGateText'),'Your corporate session has expired. Sign in and verify your access again.');
  $('mfLightbox')?.close();
 }finally{authBusy=false}
}
async function boot(){
 wire();
 authorized=await authorizeUniformHub();
 if(!authorized)return;
 $('mfPortal').href=authorized.member.role==='owner'?'dashboard.html':'employee.html';
 uploadState.user=authorized.user;
 $('mfAiOption').hidden=!owner();$('mfDirectOption').hidden=!owner();
 await loadApproved();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void securityCheck()});
 window.addEventListener('focus',()=>void securityCheck());
 corporate.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'&&authorized){
   authorized=null;$('uMain').hidden=true;$('uGate').hidden=false;
   text($('uGateText'),'Signed out. Return to the corporate portal to sign in.');
  }
 });
 window.setInterval(()=>{if(!document.hidden)void securityCheck()},60000);
}
void boot();
