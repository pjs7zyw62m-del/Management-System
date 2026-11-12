/* BLACKCELL Military Library → Bunny Storage.
   Owner-triggered, resumable migration of approved photos only.
   Each success means Bunny returned identical bytes; Supabase originals are retained. */
export function setupBlackcellLibraryBunnySync({client,toast}){
 const $=id=>document.getElementById(id);
 const count=$('bcLibraryBunnyCount'),detail=$('bcLibraryBunnyDetail');
 const button=$('bcLibraryBunnyStart'),pause=$('bcLibraryBunnyPause');
 const progress=$('bcLibraryBunnyProgress'),badge=$('bcLibraryBunnyBadge');
 if(!count||!detail||!button||!pause||!progress||!badge)return;
 let running=false,stopRequested=false,current=null;
 const bytes=n=>n>=1048576?(n/1048576).toFixed(1)+' MiB':Math.round(n/1024)+' KiB';
 const issue=e=>String(e?.message||e||'Unknown error').slice(0,180);
 async function invoke(payload){
  const {data,error}=await client.functions.invoke('blackcell-bunny-library-sync',{body:payload});
  if(error){
   let description=error.message||'Bunny archive service unavailable';
   try{const parsed=await error.context?.json?.();description=parsed?.detail||parsed?.code||description}catch(_){}
   throw Error(description);
  }
  if(!data?.ok)throw Error(data?.detail||data?.code||'Bunny archive operation failed');
  return data;
 }
 function repaint(){
  button.disabled=running||!current?.remaining;
  pause.disabled=!running;
  button.textContent=running?'SYNC IN PROGRESS…':current?.remaining?
   '↑ SYNC '+current.remaining+' PHOTOS TO BUNNY':'✓ LIBRARY BACKED UP TO BUNNY';
  count.textContent=current?
    current.archived+' / '+current.approved_to_archive+' VERIFIED':'—';
  badge.textContent=current?.remaining===0?'ARCHIVED':running?'SYNCING':'READY TO SYNC';
  badge.dataset.mode=current?.remaining===0?'complete':running?'busy':'ready';
 }
 async function refresh(){
  const info=await invoke({action:'status'});
  current=info;
  repaint();
  if(!running){
   detail.textContent=info.remaining?
    info.remaining+' approved Military Library photos ('+bytes(info.remaining_bytes)+') still need a verified Bunny copy. '+info.existing_bunny_files+' other media records are already Bunny-sourced.':'Every approved legacy Military Library photo now has a verified Bunny copy. '+info.existing_bunny_files+' existing Bunny-sourced records are unchanged. Existing Supabase previews remain available.';
   progress.max=Math.max(1,info.approved_to_archive);
   progress.value=info.archived;
  }
  return info;
 }
 async function run(){
  if(running)return;
  let info;
  try{info=await refresh()}catch(e){detail.textContent='Archive status unavailable: '+issue(e);return}
  if(!info.remaining)return;
  running=true;stopRequested=false;repaint();
  progress.max=Math.max(1,info.approved_to_archive);
  progress.value=info.archived;
  let verified=0, failure="";
  for(const file of info.items){
   if(stopRequested)break;
   detail.textContent='Copying and verifying '+(verified+1)+' of '+info.remaining+': '+file.filename+
    '. Originals remain in the current private library.';
   try{
    const result=await invoke({action:'sync-one',asset_id:file.id});
    if(!result.verified)throw Error('Bunny did not verify this photo');
    verified++;
    progress.value=Math.min(progress.max,info.archived+verified);
   }catch(e){
    failure='Stopped at '+file.filename+': '+issue(e)+
      '. Completed files are safe in Bunny. Select SYNC again to retry the remaining files.';
    detail.textContent=failure;
    break;
   }
  }
  const wasStopped=stopRequested;
  running=false;repaint();
  try{
   const latest=await refresh();
   if(latest.remaining===0){
    detail.textContent='✓ ALL '+latest.approved_to_archive+
      ' APPROVED LEGACY LIBRARY PHOTOS VERIFIED IN BUNNY. Originals, albums, metadata and publishing permissions are unchanged.';
    toast?.('Military Library photo archive verified in Bunny Storage.');
   }else if(wasStopped){
    detail.textContent='Paused. '+latest.archived+' verified in Bunny; '+latest.remaining+
      ' remaining. Select SYNC to resume.';
   }else if(failure){
    detail.textContent=failure+' '+latest.remaining+' photo(s) remain.';
   }else if(verified===info.items.length){
    detail.textContent=latest.remaining+' photos remain; select SYNC to continue the next group.';
   }
  }catch(e){detail.textContent+=' Archive refresh unavailable: '+issue(e)}
  repaint();
 }
 button.addEventListener('click',()=>void run());
 pause.addEventListener('click',()=>{
  if(!running)return;
  stopRequested=true;
  pause.disabled=true;
  detail.textContent='Pausing after the current file finishes verification…';
 });
 void refresh().catch(e=>{
  detail.textContent='Could not read Military Library Bunny archive status: '+issue(e);
  count.textContent='UNAVAILABLE';badge.textContent='CHECK CONNECTION';
  repaint();
 });
}