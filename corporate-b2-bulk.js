/* BLACKCELL Level 7 owner-only direct-to-Backblaze bulk media staging.
   Invoked only after the parent page verifies the corporate owner + codes.
   Presigned uploads never expose B2 application credentials. */
export function setupBlackcellBulk({client,toast}){
 const $=id=>document.getElementById(id);
 const input=$('bcBulkFiles'),choose=$('bcBulkChoose'),start=$('bcBulkStart');
 const pause=$('bcBulkPause'),retry=$('bcBulkRetry'),queue=$('bcBulkQueue');
 const note=$('bcBulkNote'),stats=$('bcBulkStats'),meter=$('bcBulkMeter');
 const corsButton=$('bcBulkCorsCheck'),corsStatus=$('bcBulkCorsResult');
 if(!input||!choose||!start||!pause||!queue)return;
 const jobs=[];let running=false,stopAfterFile=false,active=null;
 const MAX_FILE=50*1024**3;
 const accepted=/\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?|bmp|mp4|mov|m4v|webm|avi|mkv|3gp)$/i;
 const pretty=n=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':n>=1024**2?(n/1024**2).toFixed(1)+' MB':(n/1024).toFixed(0)+' KB';
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const done=j=>j.state==='complete'||j.state==='duplicate';
 async function invoke(body){
  const {data,error}=await client.functions.invoke('blackcell-b2-storage',{body});
  let result=data;
  if(error){
   try{result=await error.context?.json?.()}catch(_){}
   throw new Error(result?.detail||error.message||'Private storage request failed');
  }
  if(!result?.ok)throw new Error(result?.detail||'Private storage operation failed');
  return result;
 }
 async function checkCors(){
  if(!corsButton||!corsStatus)return;
  corsButton.disabled=true;
  corsStatus.textContent='Checking Backblaze browser upload permissions…';
  corsStatus.dataset.cors='checking';
  try{
   const result=await invoke({action:'bulk-cors-check'});
   if(result.cors_ok===true){
    corsStatus.dataset.cors='pass';
    corsStatus.textContent='✓ Browser PUT permission appears enabled. If an upload fails, send the exact file error.';
   }else if(result.cors_ok===false){
    corsStatus.dataset.cors='fail';
    corsStatus.textContent='✕ Backblaze has not approved browser PUT uploads for blackcellcorp.com. A bucket admin must configure S3 CORS: origin https://blackcellcorp.com, method PUT, allowed header Content-Type, exposed header ETag. No new BLACKCELL storage key is needed.';
    report('Bucket CORS is missing or incomplete. Avoid starting a large upload until this is corrected.','error');
   }else{
    corsStatus.dataset.cors='unknown';
    corsStatus.textContent='Could not verify the CORS rule automatically. Try one file and read its detailed error.';
   }
  }catch(e){
   corsStatus.dataset.cors='unknown';
   corsStatus.textContent='Browser permission check unavailable: '+String(e?.message||e).slice(0,180);
  }finally{corsButton.disabled=false;}
 }
 corsButton?.addEventListener('click',()=>void checkCors());

 // Hash each small chunk, then hash a size-bound manifest of chunk digests.
 // Deterministic over full bytes, with fixed 8 MiB chunking, without ever
 // allocating the entire video in memory. Named CHUNKED-SHA256-v1, not plain SHA256.
 async function fingerprint(file,onProgress){
  const unit=8*1024*1024,count=Math.ceil(file.size/unit);
  const marks=new Uint8Array(32+count*32);
  const prefix=new TextEncoder().encode('BC-CHUNK-SHA256-v1');
  marks.set(prefix,0);
  new DataView(marks.buffer).setBigUint64(24,BigInt(file.size),false);
  for(let i=0;i<count;i++){
   const data=await file.slice(i*unit,Math.min(file.size,(i+1)*unit)).arrayBuffer();
   const hash=await crypto.subtle.digest('SHA-256',data);
   marks.set(new Uint8Array(hash),32+i*32);
   onProgress(Math.round((i+1)/count*100));
   if(i%4===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',marks))]
   .map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 // Upload directly to B2; no photo/video bytes transit Supabase.
 function send(url,blob,mime,progress){
  return new Promise((resolve,reject)=>{
   const xhr=new XMLHttpRequest();
   xhr.open('PUT',url,true);xhr.timeout=0;
   if(mime)xhr.setRequestHeader('Content-Type',mime);
   xhr.upload.onprogress=e=>{if(e.lengthComputable)progress(e.loaded,e.total)};
   xhr.onerror=()=>reject(new Error('Browser upload blocked or interrupted. Confirm the Backblaze bucket CORS rule allows PUT from https://blackcellcorp.com and exposes ETag.'));
   xhr.onabort=()=>reject(new Error('Upload was interrupted.'));
   xhr.onload=()=>{
    if(xhr.status>=200&&xhr.status<300)return resolve(xhr.getResponseHeader('ETag'));
    reject(new Error('Backblaze rejected the upload (HTTP '+xhr.status+'). Confirm the restricted application key permits writing to blackcell-intake/.'));
   };
   xhr.send(blob);
  });
 }
 function render(){
  const completed=jobs.filter(j=>j.state==='complete').length;
  const duplicates=jobs.filter(j=>j.state==='duplicate').length;
  const errors=jobs.filter(j=>j.state==='failed').length;
  const pending=jobs.filter(j=>!done(j)&&j.state!=='failed').length;
  const totalBytes=jobs.reduce((a,j)=>a+j.file.size,0);
  const verifiedBytes=jobs.reduce((a,j)=>a+(done(j)?j.file.size:0),0);
  stats.textContent=jobs.length?jobs.length+' selected · '+completed+' verified · '+duplicates+' duplicates skipped · '+errors+' failed · '+pretty(totalBytes)+' selected':'No media selected yet';
  meter.max=Math.max(1,totalBytes);
  meter.value=jobs.reduce((a,j)=>a+(done(j)?j.file.size:j.state==='uploading'?j.progress*j.file.size/100:0),0);
  const rows=jobs.slice(-120).map((j,i)=>{
   const pct=Math.round(j.progress);
   return '<div class="bc-bulk-file bc-bulk-'+escape(j.state)+'"><div class="bc-bulk-file-top"><strong title="'+escape(j.file.name)+'">'+escape(j.file.name)+'</strong><small>'+pretty(j.file.size)+' · '+escape(j.state).toUpperCase()+'</small></div>'+
    '<progress value="'+(done(j)?100:pct)+'" max="100"></progress>'+
    (j.error?'<small class="bc-bulk-error">'+escape(j.error)+'</small>':'')+'</div>';
  }).join('');
  queue.innerHTML=rows||'<div class="bc-bulk-empty">Your selected photographs and videos will appear here.</div>';
  choose.disabled=running;
  start.disabled=running||!pending;
  start.textContent=running?'UPLOADING…':'↑ START PRIVATE UPLOAD';
  pause.disabled=!running;
  pause.textContent=stopAfterFile?'PAUSING AFTER CURRENT FILE':'Ⅱ PAUSE AFTER CURRENT FILE';
  retry.disabled=running||!errors;
 }
 function report(message,type='info'){note.dataset.state=type;note.textContent=message;}
 async function uploadOne(job){
  job.state='hashing';job.progress=0;render();
  const digest=await fingerprint(job.file,percent=>{
   job.progress=Math.min(20,percent*.2);if(percent%10===0)render();
  });
  job.progress=20;job.state='preparing';render();
  const planned=await invoke({action:'bulk-plan',name:job.file.name,
   bytes:job.file.size,fingerprint:digest});
  if(planned.duplicate){job.state='duplicate';job.progress=100;render();return;}
  let ticket=planned.ticket,multipart=planned.mode==='multipart';
  try{
   const mime=planned.mime||job.file.type||undefined;
   job.state='uploading';job.progress=20;render();
   if(!multipart){
    await send(planned.url,job.file,mime,(current,total)=>{
     job.progress=20+Math.round(75*current/Math.max(1,total));render();
    });
    await invoke({action:'bulk-verify',ticket});
   }else{
    const parts=[];
    for(let part=1;part<=planned.parts;part++){
     const presigned=await invoke({action:'bulk-part',ticket,part});
     const from=(part-1)*planned.part_size,to=Math.min(job.file.size,part*planned.part_size);
     const receipt=await send(presigned.url,job.file.slice(from,to),null,(sent,total)=>{
      job.progress=20+Math.round(75*(from+sent)/job.file.size);
      if(Math.round(sent/total*100)%5===0)render();
     });
     if(!receipt)throw new Error('Backblaze did not expose the ETag response header. Configure bucket CORS to expose ETag before uploading videos.');
     parts.push({part,etag:receipt});
     job.progress=20+Math.round(75*to/job.file.size);render();
    }
    job.state='verifying';render();
    await invoke({action:'bulk-complete',ticket,parts});
   }
   job.state='complete';job.progress=100;render();
  }catch(e){
   // Do not retain abandoned multipart uploads when a browser or CORS issue occurs.
   // A failed cleanup is harmless to existing files but may leave billable parts.
   if(multipart){try{await invoke({action:'bulk-abort',ticket})}catch(_){}}
   throw e;
  }
 }
 async function run(){
  if(running)return;
  running=true;stopAfterFile=false;render();
  report('Uploading directly to your private Backblaze staging storage. Keep this tab open.');
  try{
   for(const job of jobs){
    if(stopAfterFile)break;
    if(job.state==='failed'||done(job))continue;
    active=job;
    try{await uploadOne(job)}
    catch(e){
     job.state='failed';job.error=String(e?.message||'Upload failed').slice(0,300);
     job.progress=0;
     if(/Browser upload blocked or interrupted|did not expose the ETag/i.test(job.error)){
      stopAfterFile=true;
      report('Batch stopped after a browser upload permission/network error. Check B2 CORS before retrying; other files remain queued.','error');
     }
     render();
    }
   }
   const remaining=jobs.filter(j=>!done(j)&&j.state!=='failed');
   const failures=jobs.filter(j=>j.state==='failed').length;
   const allFinished=jobs.length>0&&jobs.every(j=>done(j));
   if(stopAfterFile&&!jobs.some(j=>j.state==='failed'))report('Paused between files. Your verified uploads are already saved. Select START to continue.');
   else if(stopAfterFile&&jobs.some(j=>j.state==='failed'))report('Stopped after the first browser upload error instead of failing the whole batch. Check B2 CORS and then retry.','error');
   else if(allFinished)report('✓ All selected media verified in Backblaze private storage. Nothing is published to your website.','success');
   else if(failures)report('Some files failed. Review errors below and select RETRY FAILED; your successful uploads remain saved.','error');
   else if(remaining.length)report('Ready to continue your selected batch.');
  }finally{active=null;running=false;stopAfterFile=false;render();}
 }
 choose.addEventListener('click',()=>input.click());
 input.addEventListener('change',()=>{
  let added=0,skipped=0;
  for(const file of Array.from(input.files||[])){
   if(!file||file.size<=0||file.size>MAX_FILE||!accepted.test(file.name)){skipped++;continue;}
   if(jobs.some(j=>j.file.name===file.name&&j.file.size===file.size&&j.file.lastModified===file.lastModified)){
    skipped++;continue;
   }
   jobs.push({file,state:'queued',progress:0,error:''});added++;
  }
  input.value='';
  report(added?added+' files added. Start the batch when ready. All uploads stay private.':skipped?'No new supported files selected.':'Choose one or more photos or videos.');
  if(skipped&&added)report(added+' added; '+skipped+' invalid or already queued files skipped.');
  render();
 });
 start.addEventListener('click',()=>void run());
 pause.addEventListener('click',()=>{stopAfterFile=true;report('Pausing after the current file completes…');render();});
 retry.addEventListener('click',()=>{
  jobs.forEach(j=>{if(j.state==='failed'){j.state='queued';j.error='';j.progress=0}});
  report('Failed files requeued. Select START PRIVATE UPLOAD.');
  render();
 });
 window.addEventListener('beforeunload',e=>{
  if(!running)return;
  e.preventDefault();e.returnValue='';
 });
 render();
 void checkCors();
}