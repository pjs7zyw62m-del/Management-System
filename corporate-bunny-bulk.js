/* BLACKCELL / Bunny Storage: owner-only bounded batch uploader.
   File bytes go to authenticated Supabase Edge Function, never with the Bunny
   AccessKey in the browser. Phase 1 supports files up to 32 MiB each. */
export function setupBlackcellBunnyBulk({client}){
 const $=id=>document.getElementById(id);
 const input=$('bcBunnyFiles'),folderInput=$('bcBunnyFolder');
 const choose=$('bcBunnyChoose'),chooseFolder=$('bcBunnyChooseFolder');
 const start=$('bcBunnyStart'),pause=$('bcBunnyPause');
 const queue=$('bcBunnyQueue'),stats=$('bcBunnyUploadStats'),note=$('bcBunnyUploadNote'),meter=$('bcBunnyMeter');
 if(!input||!choose||!start||!pause||!queue)return;
 const MAX=32*1024*1024;
 const pattern=/\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?|bmp|mp4|mov|m4v|webm|avi|mkv|3gp)$/i;
 const jobs=[];let running=false,paused=false,active=null;
 const fmt=b=>b>=1024*1024?(b/(1024*1024)).toFixed(1)+' MB':(b/1024).toFixed(0)+' KB';
 const complete=j=>j.state==='verified'||j.state==='duplicate';
 const current=()=>jobs.find(j=>j.state==='queued'||j.state==='failed');
 function announce(text,isError=false){
  if(!note)return;note.textContent=text;note.dataset.level=isError?'error':'normal';
 }
 function add(files){
  let added=0;
  for(const file of files){
   if(!file||!file.size)continue;
   if(jobs.some(j=>j.file===file))continue;
   const unsupported=file.size>MAX||!pattern.test(file.name||'');
   jobs.push({file,state:unsupported?'unsupported':'queued',progress:0,error:unsupported?
     'This initial Bunny website uploader accepts supported photos/videos up to 32 MiB each. Larger videos need the separate large-file method.':''});
   added++;
  }
  if(added)announce(added+' file(s) added. Nothing uploads until START is selected. Bunny stores accepted files privately.');
  render();
 }
 function render(){
  const verified=jobs.filter(j=>j.state==='verified').length;
  const duplicate=jobs.filter(j=>j.state==='duplicate').length;
  const failed=jobs.filter(j=>j.state==='failed').length;
  const unsupported=jobs.filter(j=>j.state==='unsupported').length;
  const totalSupported=jobs.filter(j=>j.state!=='unsupported');
  const allBytes=totalSupported.reduce((a,j)=>a+j.file.size,0);
  const completeBytes=totalSupported.reduce((a,j)=>a+(complete(j)?j.file.size:(j.state==='uploading'?j.progress/100*j.file.size:0)),0);
  const percentage=allBytes?Math.round(100*completeBytes/allBytes):0;
  stats.textContent=jobs.length+' selected · '+verified+' verified · '+duplicate+' duplicates · '+failed+' failed · '+unsupported+' too large/unsupported · '+fmt(completeBytes)+' / '+fmt(allBytes);
  if(meter)meter.style.width=percentage+'%';
  start.disabled=running||!jobs.some(j=>j.state==='queued'||j.state==='failed');
  pause.disabled=!running;
  pause.textContent=paused?'PAUSING…':'PAUSE AFTER FILE';
  queue.replaceChildren();
  for(const j of jobs.slice(0,200)){
   const line=document.createElement('div');line.className='bc-bunny-file';
   line.dataset.state=j.state;
   const title=document.createElement('span');title.textContent=(j.file.webkitRelativePath||j.file.name||'Unnamed file').slice(0,160);
   title.title=j.file.name||'';
   const info=document.createElement('small');
   const labels={queued:'Queued',hashing:'Checking SHA-256',uploading:'Uploading',verifying:'Verifying in Bunny',verified:'✓ Verified',duplicate:'✓ Exact duplicate skipped',failed:'✕ Failed',unsupported:'Not supported yet'};
   info.textContent=fmt(j.file.size)+' · '+(labels[j.state]||j.state)+(j.progress&&j.state==='uploading'?' '+j.progress+'%':'');
   line.append(title,info);
   if(j.error){const detail=document.createElement('p');detail.textContent=j.error.slice(0,300);line.append(detail)}
   queue.append(line);
  }
  if(jobs.length>200){const extra=document.createElement('p');extra.textContent='Showing the first 200 queue items; '+(jobs.length-200)+' more are included in the selected batch.';queue.append(extra)}
 }
 async function digest(file){
  const bytes=await file.arrayBuffer();
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 function send(file,hash,onProgress){
  return new Promise(async(resolve,reject)=>{
   let session;
   try{
    const result=await client.auth.getSession();
    session=result.data?.session;
    if(!session?.access_token)throw new Error('Your owner session expired. Sign in again.');
   }catch(e){reject(e);return}
   const conf=window.BLACKCELL_CORP_CONFIG||{};
   if(!conf.url||!conf.publishableKey){reject(new Error('BLACKCELL Supabase configuration unavailable.'));return}
   const xhr=new XMLHttpRequest();
   active=xhr;
   xhr.open('POST',conf.url.replace(/\/$/,'')+'/functions/v1/blackcell-bunny-upload');
   xhr.timeout=125000;
   xhr.setRequestHeader('Authorization','Bearer '+session.access_token);
   xhr.setRequestHeader('apikey',conf.publishableKey);
   xhr.setRequestHeader('Content-Type','application/octet-stream');
   xhr.setRequestHeader('x-bc-sha256',hash);
   xhr.setRequestHeader('x-bc-size',String(file.size));
   xhr.setRequestHeader('x-bc-name',encodeURIComponent(file.name));
   xhr.setRequestHeader('x-bc-mime',file.type||'application/octet-stream');
   xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.min(99,Math.round(e.loaded/e.total*100)))};
   xhr.onerror=()=>reject(new Error('The protected upload was interrupted. Check your connection, then retry the same file.'));
   xhr.ontimeout=()=>reject(new Error('Timed out. Retry the file; Bunny duplicate detection will prevent a second stored copy.'));
   xhr.onabort=()=>reject(new Error('Upload interrupted.'));
   xhr.onload=()=>{
    let result={};
    try{result=JSON.parse(xhr.responseText||'{}')}catch(_){}
    if(xhr.status>=200&&xhr.status<300&&result.ok===true){
     resolve(result);return;
    }
    reject(new Error(result.detail||result.code||'Bunny secure upload failed (HTTP '+xhr.status+').'));
   };
   xhr.send(file);
  });
 }
 async function run(){
  if(running)return;
  running=true;paused=false;render();
  while(!paused){
   const job=current();
   if(!job)break;
   job.state='hashing';job.progress=0;job.error='';render();
   try{
    const hash=await digest(job.file);
    if(paused){job.state='queued';render();break}
    job.state='uploading';render();
    const response=await send(job.file,hash,p=>{job.progress=p;render()});
    job.state='verifying';render();
    if(!response.stored||!response.verified){
     throw new Error(response.detail||'Bunny did not confirm the stored file yet. Retry this file to check whether it saved.');
    }
    job.state=response.duplicate?'duplicate':'verified';
    job.progress=100;
    render();
   }catch(e){
    job.state='failed';job.error=String(e?.message||e||'Upload failed');
    announce('Upload stopped after an error in '+job.file.name+'. Check its message and select START to retry. Previous verified files remain untouched.',true);
    paused=true;render();break;
   }
  }
  running=false;active=null;
  render();
  if(!jobs.some(j=>j.state==='queued'||j.state==='failed')&&jobs.some(j=>complete(j))){
   announce('Completed: '+jobs.filter(j=>complete(j)).length+' verified or skipped as exact duplicates. Files remain private in Bunny staging.');
  }else if(paused&&!jobs.some(j=>j.state==='failed')){
   announce('Paused between files. Select START to continue with the remaining queue.');
  }
 }
 choose.addEventListener('click',()=>input.click()); // synchronous for iOS
 input.addEventListener('change',()=>{add([...input.files||[]]);input.value=''});
 chooseFolder?.addEventListener('click',()=>folderInput?.click());
 folderInput?.addEventListener('change',()=>{add([...folderInput.files||[]]);folderInput.value=''});
 start.addEventListener('click',()=>void run());
 pause.addEventListener('click',()=>{paused=true;pause.textContent='PAUSING…';announce('Finishing the current file, then pausing.');});
 render();
 announce('Select photographs or short videos (up to 32 MiB per file) to test Bunny storage. Private staging only; nothing is published.');
}
