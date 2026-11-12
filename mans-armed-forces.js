/* BLACKCELL / MAN'S ARMED FORCES
 * Independent authenticated landing page preceding the existing Military Library.
 * Renders ONLY approved, non-adult-restricted photos using short-lived URLs.
 * Does not register, modify, share, or publish any member or Bunny media.
 */
import {authorizeUniformHub,corporate} from './uniform-hub-auth.js?v=20261111-mf1';

const $=id=>document.getElementById(id);
let approved=[],shown=[],filterBranch='all',filterStyle='all',lastSigned=0,authorized=null;
let authBusy=false;
const sizeLimit=90;
const signedMs=25*60*1000;
const words={
 dress:['dress','service','formal','blues','suit','coat','tailored','insignia','ribbon','tie','ceremonial'],
 field:['field','combat','training','camouflage','fatigue','tactical','exercise','patrol','acu','bdus','battle'],
 naval:['navy','naval','sailor','maritime','sea','coast','ship','whites','seaman'],
 ceremonial:['ceremony','ceremonial','honor','parade','guard','dress','formation','color','march','tribute']
};
function text(el,value){if(el)el.textContent=String(value??'')}
function safe(x){return String(x||'').trim().slice(0,180)}
function branchOf(a){return safe(a.military_branch)||'Unspecified'}
function searchable(a){
 return [a.filename,a.caption,a.military_branch,a.military_category,a.military_era,...(Array.isArray(a.military_tags)?a.military_tags:[])]
 .filter(Boolean).join(' ').toLowerCase();
}
function matches(a){
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
function setFilter({branch='all',style='all'}={}){
 filterBranch=branch;filterStyle=style;
 document.querySelectorAll('[data-filter]').forEach(btn=>{
  const selected=btn.dataset.filter===branch;
  btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-branch]').forEach(btn=>btn.classList.toggle('active',btn.dataset.branch===branch));
 render();
 $('collection')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function formatMetadata(a){
 return [branchOf(a)!=='Unspecified'?branchOf(a):'',safe(a.military_category)!=='Unsorted'?safe(a.military_category):'',safe(a.military_era)]
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
 dialog.showModal();
}
function render(){
 const grid=$('mfPhotoGrid');if(!grid)return;
 grid.replaceChildren();
 shown=approved.filter(matches);
 if(!shown.length){
  grid.append(placeholder(
   approved.length?'NO MATCHES FOR THIS SELECTION':'YOUR COLLECTION IS READY',
   approved.length?'No approved photographs currently match that uniform or service branch. Select All Uniforms to browse the complete approved collection.':'Once military photographs have been reviewed and approved, they will automatically appear here. Unapproved Bunny originals remain private.'
  ));
 }else{
  for(const a of shown.slice(0,24)){
   const card=document.createElement('button');card.type='button';card.className='mf-photo-card';
   const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=a.signedUrl;
   img.alt=safe(a.caption)||safe(a.filename)||'Approved military photo';
   const details=document.createElement('div');details.className='mf-photo-info';
   const title=document.createElement('strong');title.textContent=(safe(a.caption)||safe(a.filename)||'Military photograph').slice(0,85);
   const subtitle=document.createElement('small');subtitle.textContent=formatMetadata(a).slice(0,100);
   details.append(title,subtitle);card.append(img,details);
   card.addEventListener('click',()=>openViewer(a));
   grid.append(card);
  }
 }
 text($('mfImageCount'),approved.length);
 const msg=shown.length?
   shown.length+' approved photograph'+(shown.length===1?'':'s')+
   (filterBranch!=='all'?' · '+filterBranch:'')+
   (filterStyle!=='all'?' · '+filterStyle.toUpperCase()+' STYLE':'')+
   '. Open a photo to view it in full.':
   'The chosen category has no approved photographs yet. Your private uploads stay in review until approved.';
 text($('mfCollectionStatus'),msg);
}
function wire(){
 document.querySelectorAll('[data-filter]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({branch:btn.dataset.filter,style:'all'})));
 document.querySelectorAll('[data-branch]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({branch:btn.dataset.branch,style:'all'})));
 document.querySelectorAll('[data-style]').forEach(btn=>
  btn.addEventListener('click',()=>setFilter({style:btn.dataset.style,branch:'all'})));
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
 text($('mfCollectionStatus'),'Finding approved photographs in the private Military Library…');
 try{
  const {data,error}=await corporate.from('corp_social_assets')
   .select('id,filename,caption,storage_path,military_branch,military_category,military_era,military_tags,review_status,adult_restricted,purpose,kind')
   .eq('review_status','approved').eq('adult_restricted',false)
   .eq('purpose','library').eq('kind','photo')
   .order('created_at',{ascending:false}).limit(200);
  if(error)throw new Error(error.message||'Media library read failed');
  const candidates=(data||[]).filter(a=>a.storage_path&&a.id).slice(0,sizeLimit);
  const ordered=[...candidates].sort((a,b)=>{
   const rank=x=>{
    const t=searchable(x);
    return (/male|men|man|soldier|sailor|airman|marine|personnel|uniform/.test(t)?2:0)+
      (branchOf(x)!=='Unspecified'?1:0);
   };
   return rank(b)-rank(a);
  });
  const signed=[];
  for(let i=0;i<ordered.length;i+=20){
   const group=ordered.slice(i,i+20);
   const response=await corporate.storage.from('corp-social-media')
    .createSignedUrls(group.map(x=>x.storage_path),1800);
   if(response.error)continue;
   for(let j=0;j<group.length;j++){
    const url=response.data?.[j]?.signedUrl;
    if(typeof url==='string'&&url.startsWith('http'))signed.push({...group[j],signedUrl:url});
   }
  }
  approved=signed;
  lastSigned=Date.now();
  render();
  if(!approved.length&&candidates.length)text($('mfCollectionStatus'),'Your approved Military Library photos could not be opened. Check your corporate session and try refreshing this page.');
 }catch(e){
  approved=[];render();
  text($('mfCollectionStatus'),'Military Library photos unavailable: '+safe(e?.message||'Connection error')+'. Your current library and stored images have not been changed.');
 }
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
