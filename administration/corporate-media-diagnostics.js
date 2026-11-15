/* BLACKCELL / Owner-only, read-only media performance diagnostics.
 * Runs in the verified Media Administration session on the owner's device.
 * Checks database/edge/storage response times and browser image delivery.
 * No writes, uploads, deletes, public media links, external analytics, or secrets.
 */
export function setupBlackcellMediaDiagnostics({client,bucket,initialLoadMs=0}){
 const $=id=>document.getElementById(id);
 const panel=$('bcMediaDiagnostics'),start=$('bcDiagRun'),copy=$('bcDiagCopy');
 const status=$('bcDiagStatus'),badge=$('bcDiagBadge'),meter=$('bcDiagMeter');
 const results=$('bcDiagResults'),summary=$('bcDiagSummary'),reportBox=$('bcDiagReport');
 if(!panel||!start||!copy||!status||!badge||!meter||!results||!summary||!reportBox)return;

 const MAX=9;
 let running=false,report='',records=[],sample=null,originalURL='',catalog=[];
 const now=()=>performance.now();
 const ms=n=>Math.round(n)+' ms';
 const mib=n=>(Number(n||0)/1048576).toFixed(2)+' MiB';
 const short=e=>String(e?.message||e||'Unknown error')
   .replace(/https?:\/\/\S+/gi,'[private URL]')
   .replace(/Bearer\s+\S+/gi,'[redacted]')
   .replace(/[A-Za-z0-9_-]{90,}/g,'[redacted]')
   .slice(0,170);
 const timeout=(promise,wait=14000)=>new Promise((resolve,reject)=>{
   const handle=setTimeout(()=>reject(Error('Timed out after '+Math.round(wait/1000)+' seconds')),wait);
   Promise.resolve(promise).then(v=>{clearTimeout(handle);resolve(v)},e=>{clearTimeout(handle);reject(e)});
 });
 const row=(name,state,detail,duration)=>{
   const li=document.createElement('li');
   const mark=document.createElement('span');mark.className='bc-diag-mark';
   mark.textContent=state==='pass'?'✓':state==='warn'?'!':state==='fail'?'×':'·';
   const body=document.createElement('div');body.className='bc-diag-row-text';
   const heading=document.createElement('strong');heading.textContent=name;
   const desc=document.createElement('p');desc.textContent=detail;
   body.append(heading,desc);
   const timing=document.createElement('small');timing.textContent=Number.isFinite(duration)?ms(duration):'';
   li.dataset.result=state;
   li.append(mark,body,timing);results.append(li);
 };
 async function step(name,run){
  status.textContent='TEST '+(records.length+1)+' / '+MAX+' · '+name;
  const started=now(),deadline=15000;
  let item;
  try{
   const result=await timeout(Promise.resolve().then(run),deadline);
   item={name,state:result?.state||'pass',detail:String(result?.detail||'Completed'),duration:now()-started};
  }catch(e){
   item={name,state:'fail',detail:short(e),duration:now()-started};
  }
  records.push(item);
  meter.value=records.length;
  row(item.name,item.state,item.detail,item.duration);
  return item;
 }
 const pass=(detail,duration,threshold=2200)=>({state:duration>threshold?'warn':'pass',detail});
 const access=async(name,payload)=>{
  const {data,error}=await client.functions.invoke(name,{body:payload});
  if(error){
   let detail=error.message||'Function failed';
   try{const r=await error.context?.json?.();detail=r?.detail||r?.code||detail}catch(_){}
   throw Error(short(detail));
  }
  return data;
 };
 function loadImage(url,wait=12000){
  return new Promise((resolve,reject)=>{
   if(!url)return reject(Error('Private image URL unavailable'));
   const img=new Image();
   let closed=false,timer;
   const started=now();
   const finish=(error)=>{
    if(closed)return;closed=true;clearTimeout(timer);
    img.onload=null;img.onerror=null;
    const duration=now()-started;
    if(error){img.src='';reject(error)}
    else resolve({duration,width:img.naturalWidth,height:img.naturalHeight});
   };
   timer=setTimeout(()=>finish(Error('Image response/decode exceeded '+Math.round(wait/1000)+' seconds')),wait);
   img.onload=()=>finish(null);
   img.onerror=()=>finish(Error('Image did not load or image transformation is unavailable'));
   img.decoding='async';img.src=url;
  });
 }
 function connection(){
  const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const hints=[];
  if(c?.effectiveType)hints.push('network '+c.effectiveType);
  if(c?.rtt)hints.push('estimated RTT '+c.rtt+' ms');
  if(c?.saveData)hints.push('Data Saver enabled');
  if(navigator.onLine===false)hints.push('browser reports offline');
  return hints.join(' · ')||'Browser does not expose a network-quality estimate';
 }
 function readTime(){
  const n=performance.getEntriesByType('navigation')?.[0];
  return Number.isFinite(initialLoadMs)&&initialLoadMs>0
   ?'Media Admin initialization '+ms(initialLoadMs)
   :n?.domContentLoadedEventEnd?'Document ready '+ms(n.domContentLoadedEventEnd):'Initialization timing unavailable';
 }
 function makeReport(){
  const warnings=records.filter(x=>x.state==='warn');
  const failed=records.filter(x=>x.state==='fail');
  const topics=records.filter(x=>x.state==='warn'||x.state==='fail').map(x=>x.name);
  const count=records.filter(x=>x.state==='pass').length;
  if(failed.length){
   badge.textContent=failed.length+' NEED ATTENTION';badge.dataset.result='fail';
   summary.textContent='Some checks failed. Use the results below to identify the exact connection or image-delivery problem.';
  }else if(warnings.length){
   badge.textContent=warnings.length+' PERFORMANCE WARNING'+(warnings.length===1?'':'S');
   badge.dataset.result='warn';
   summary.textContent='All essential checks responded, but some operations are slower than expected or need optimization.';
  }else{
   badge.textContent='ALL CHECKS PASSED';badge.dataset.result='pass';
   summary.textContent='All '+count+' checks passed on this device. If scrolling is still slow, the likely issue is rendering or network conditions outside these sampled checks.';
  }
  const network=connection();
  const lines=[
   'BLACKCELL MEDIA ADMINISTRATION · READ-ONLY DIAGNOSTIC',
   'Ran: '+new Date().toLocaleString(),
   'Location: private owner browser · No credentials, filenames or URLs included',
   'Initialization: '+readTime(),
   'Browser network hint: '+network,
   'Checks: '+records.length+' · passes '+count+' · warnings '+warnings.length+' · failures '+failed.length,
   '',
   ...records.map(x=>'['+x.state.toUpperCase()+'] '+x.name+' · '+ms(x.duration)+' · '+x.detail),
   '',
   topics.length?'Areas to investigate: '+topics.join(', '):'Areas to investigate: none detected in these samples',
   'Notes: Browser timings are sampled, not continuous monitoring. Bunny archive copies are not yet the gallery image-delivery source.',
   'All checks are read-only; originals, permissions and review status are unchanged.'
  ];
  report=lines.join('\n');
  reportBox.value=report;reportBox.hidden=false;copy.disabled=false;
 }
 async function run(){
  if(running)return;
  running=true;start.disabled=true;copy.disabled=true;
  start.textContent='RUNNING CHECKS…';badge.textContent='TESTING';badge.dataset.result='busy';
  meter.max=MAX;meter.value=0;results.replaceChildren();summary.textContent='';
  reportBox.value='';reportBox.hidden=true;records=[];sample=null;originalURL='';catalog=[];

  await step('Level 7 authorization & security session',async()=>{
   const t=now();
   const [user,status]=await Promise.all([client.auth.getUser(),client.rpc('corp_code_status')]);
   if(user.error||!user.data?.user||status.error||!status.data?.ok||!status.data?.verified)
    throw Error('Owner session invalid or two-code verification has expired; sign in again.');
   const duration=now()-t;
   return pass('Authenticated security session verified · '+ms(duration),duration,2500);
  });

  await step('Supabase private media catalog',async()=>{
   const t=now();
   const {data,error}=await client.from('corp_social_assets')
    .select('id,kind,bytes,mime_type,storage_path,review_status,source_provider,bunny_storage_path,purpose')
    .in('purpose',['library','post']).order('created_at',{ascending:false}).limit(500);
   if(error)throw Error('Catalog query: '+error.message);
   catalog=data||[];
   const duration=now()-t;
   return pass(catalog.length+' accessible media records · '+ms(duration)+
      (catalog.length===500?' · reached diagnostic sample limit':''),duration,1800);
  });

  await step('Photo sizes & mobile load risk',async()=>{
   const photos=catalog.filter(a=>a.kind==='photo'&&a.review_status==='approved');
   const total=photos.reduce((n,a)=>n+Number(a.bytes||0),0);
   const heavy=photos.filter(a=>Number(a.bytes||0)>=4*1048576).length;
   const huge=photos.filter(a=>Number(a.bytes||0)>=8*1048576).length;
   const candidates=photos.filter(a=>a.storage_path&&['image/jpeg','image/png','image/webp'].includes(a.mime_type));
   sample=candidates.sort((a,b)=>Math.abs(Number(a.bytes||0)-1500000)-Math.abs(Number(b.bytes||0)-1500000))[0]||null;
   if(!photos.length)return {state:'info',detail:'No approved photos in the diagnostic catalog sample.'};
   const detail=photos.length+' approved photos · '+mib(total)+' total originals · '+heavy+
     ' at least 4 MiB · '+huge+' at least 8 MiB. Large originals can stall mobile decoding.';
   return {state:heavy?'warn':'pass',detail};
  });

  await step('Bunny verified library index',async()=>{
   const t=now(),data=await access('blackcell-bunny-library-sync',{action:'status'});
   if(!data?.ok)throw Error('Archive index did not return healthy status');
   const duration=now()-t;
   const text=data.archived+'/'+data.approved_to_archive+' verified mirrors · '+data.remaining+
     ' remaining · '+ms(duration);
   return {state:data.remaining>0?'warn':duration>3500?'warn':'pass',detail:text};
  });

  await step('Bunny private Storage API connection',async()=>{
   const t=now(),data=await access('blackcell-bunny-storage',{action:'status'});
   if(data?.connected!==true)throw Error(data?.detail||'Bunny Storage connection not verified');
   const duration=now()-t;
   return pass('Private Los Angeles storage responds · '+ms(duration),duration,3500);
  });

  await step('Import review queue database',async()=>{
   const t=now();
   const {count,error}=await client.from('corp_social_assets').select('id',{head:true,count:'exact'})
    .eq('review_status','pending');
   if(error)throw Error('Review queue: '+error.message);
   const duration=now()-t;
   return pass((count??0)+' prepared media records pending review · '+ms(duration),duration,1800);
  });

  await step('Secure original image signing',async()=>{
   if(!sample)return {state:'info',detail:'No supported approved JPEG, PNG or WebP image for a private test'};
   const t=now();
   const {data,error}=await bucket.createSignedUrl(sample.storage_path,120);
   if(error||!data?.signedUrl)throw Error('Could not sign an approved private original');
   originalURL=data.signedUrl;
   const duration=now()-t;
   return pass('Private signed link issued · '+ms(duration),duration,1800);
  });

  await step('Optimized thumbnail signing and display',async()=>{
   if(!sample)return {state:'info',detail:'Skipped: no eligible private photo'};
   const t=now();
   const {data,error}=await bucket.createSignedUrl(sample.storage_path,120,{
    transform:{width:320,height:320,resize:'contain',quality:65}
   });
   if(error||!data?.signedUrl)return {state:'warn',detail:'Private image transformations could not be signed; gallery may fall back to large originals'};
   try{
    const image=await loadImage(data.signedUrl);
    const duration=now()-t;
    if(image.width>384||image.height>384){
     return {state:'warn',detail:'IMAGE RESIZING NOT APPLIED — requested 320 × 320 but received '+
      image.width+' × '+image.height+' after '+ms(duration)+
      '. Your private image links work, but large originals are being sent instead of thumbnails. Check Supabase Storage → Settings → Enable Image Transformations (requires supported Supabase plan).'};
    }
    return {state:duration>3200?'warn':'pass',
     detail:'Verified resized '+image.width+' × '+image.height+' private thumbnail delivered and decoded · '+ms(duration)};
   }catch(e){
    return {state:'warn',detail:'Optimized preview unavailable: '+short(e)+'. Existing gallery may need original-image fallback.'};
   }
  });

  await step('Original image delivery and decode',async()=>{
   if(!sample||!originalURL)return {state:'info',detail:'Skipped: private original could not be signed'};
   const t=now();
   const image=await loadImage(originalURL);
   const duration=now()-t;
   return {state:duration>3500?'warn':'pass',
    detail:'One protected original ('+mib(sample.bytes)+') delivered · '+ms(duration)+
     ' · image '+image.width+' × '+image.height};
  });

  makeReport();
  running=false;start.disabled=false;start.textContent='↻ RUN DIAGNOSTIC AGAIN';
  status.textContent='FINISHED · '+records.length+' READ-ONLY CHECKS · '+readTime()+' · '+connection();
 }
 start.addEventListener('click',()=>void run());
 copy.addEventListener('click',async()=>{
  if(!report)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard API not available');
   await navigator.clipboard.writeText(report);
   status.textContent='DIAGNOSTIC REPORT COPIED · Safe to share: no original links, private IDs or passwords included.';
  }catch(_){
   reportBox.hidden=false;reportBox.focus();reportBox.select();
   status.textContent='Select and copy the report text below. It contains no file paths, passwords or signed links.';
  }
 });
 status.textContent='Ready. Press RUN FULL DIAGNOSTIC to measure live performance on this device. No files will change.';
}
