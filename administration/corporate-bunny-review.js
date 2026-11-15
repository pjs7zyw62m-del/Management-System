/* BLACKCELL / Bunny -> Military Library private intake.
 * List-only access to Bunny for pending-count and file names. The owner
 * explicitly selects items to prepare; preparing creates a private Supabase
 * review copy and never publishes the Bunny original. */
export function setupBlackcellBunnyReview({client,state,refresh,toast}){
 const $=id=>document.getElementById(id);
 const host=$('bcBunnyStagingQueue'),count=$('bcBunnyStagingCount');
 const status=$('bcBunnyStagingStatus'),reloadButton=$('bcBunnyStagingRefresh');
 const allButton=$('bcBunnyPrepareBatch');
 if(!host||!count||!status||!reloadButton||!allButton)return;
 let items=[],busy=false,loading=false,truncated=false;
 const pretty=b=>b>=1024**3?(b/1024**3).toFixed(2)+' GB':b>=1024**2?(b/1024**2).toFixed(1)+' MB':(b/1024).toFixed(0)+' KB';
 const detail=e=>String(e?.message||e||'Unknown error').slice(0,220);
 async function invoke(body){
  const {data,error}=await client.functions.invoke('blackcell-bunny-review',{body});
  if(error){
   let reason=error.message||'Private Bunny review service failed';
   try{const details=await error.context?.json?.();reason=details?.detail||details?.code||reason}catch(_){}
   throw new Error(reason);
  }
  if(!data?.ok)throw new Error(data?.detail||data?.code||'Private Bunny review service unavailable');
  return data;
 }
 function publishCount(){
  const n=items.length;
  state.bunnyWaitingCount=n;
  document.dispatchEvent(new CustomEvent('bc:bunny-staged-count',{detail:{count:n}}));
 }
 function paint(){
  count.textContent=String(items.length)+(truncated?'+':'');
  reloadButton.disabled=busy||loading;
  allButton.disabled=busy||loading||!items.some(item=>item.supported);
  host.replaceChildren();
  if(!items.length){
   const line=document.createElement('p');line.className='bc-bunny-review-empty';
   line.textContent='No unregistered Bunny photos or videos found. New uploads will appear here after the Bunny uploader finishes.';
   host.append(line);
   return;
  }
  for(const item of items.slice(0,180)){
   const row=document.createElement('div');row.className='bc-bunny-stage-item';
   const info=document.createElement('div');info.className='bc-bunny-stage-meta';
   const name=document.createElement('strong');name.textContent=item.filename||'Unnamed Bunny media';
   const meta=document.createElement('small');
   meta.textContent=(item.kind||'media').toUpperCase()+' · '+pretty(Number(item.bytes)||0)+' · '+(item.supported?'READY TO PREPARE':'SAVED IN BUNNY · NOT YET SUPPORTED');
   info.append(name,meta);
   const btn=document.createElement('button');btn.type='button';btn.textContent=item.supported?'PREPARE FOR REVIEW':'LARGE / OTHER FORMAT';
   btn.disabled=busy||loading||!item.supported;
   btn.addEventListener('click',()=>void prepareOne(item.key));
   row.append(info,btn);host.append(row);
  }
  if(truncated){
   const note=document.createElement('p');note.textContent='More Bunny media may exist beyond this first group. The current staging viewer is limited; existing originals are not lost.';host.append(note);
  }
 }
 async function load(){
  if(loading||busy)return;
  loading=true;paint();status.textContent='Reading private Bunny staging filenames and checking which ones are already in Military Library review…';
  try{
   const result=await invoke({action:'list'});
   items=Array.isArray(result.items)?result.items:[];
   truncated=Boolean(result.truncated);
   publishCount();paint();
   const eligible=items.filter(x=>x.supported).length;
   status.textContent=items.length
    ?items.length+(truncated?'+':'')+' saved privately in Bunny, not yet prepared for Military Library review · '+eligible+' can be prepared now. Choose individual items or prepare up to 10 per batch.'
    :'All discovered Bunny originals have already been registered, or there are no photos or videos in staging.';
  }catch(e){
   status.textContent='Could not check Bunny staging: '+detail(e)+' · Your Bunny files remain unchanged.';
   paint();
  }finally{loading=false;paint()}
 }
 async function prepareOne(key){
  if(busy||loading)return;
  const item=items.find(x=>x.key===key&&x.supported);
  if(!item)return;
  busy=true;paint();
  status.textContent='Preparing '+item.filename+' in the PRIVATE Military Library review queue. The Bunny original stays untouched…';
  try{
   const result=await invoke({action:'prepare',key});
   if(!result.registered)throw Error(result.detail||'Review registration not verified');
   items=items.filter(x=>x.key!==key);
   publishCount();paint();
   document.dispatchEvent(new CustomEvent('bc:media-updated'));
   await refresh();
   status.textContent='✓ '+item.filename+' is now in the private Military Library review queue. Use the existing Review panel below to inspect, classify and approve it. It has not been posted.';
   toast?.('Bunny photo prepared for private Military Library review.');
  }catch(e){
   status.textContent='PREPARE FAILED — '+detail(e)+'. Original remains safe in Bunny.';
  }finally{busy=false;paint()}
 }
 async function prepareBatch(){
  if(busy||loading)return;
  const selection=items.filter(x=>x.supported).slice(0,10);
  if(!selection.length)return;
  busy=true;paint();
  let prepared=0;
  for(const item of selection){
   status.textContent='Preparing '+(prepared+1)+' / '+selection.length+': '+item.filename+'…';
   try{
    const result=await invoke({action:'prepare',key:item.key});
    if(!result.registered)throw Error('Review registration not verified');
    items=items.filter(x=>x.key!==item.key);prepared++;
    publishCount();paint();
   }catch(e){
    status.textContent='Stopped after '+prepared+' prepared. '+item.filename+' failed: '+detail(e)+'. Retry after checking the issue.';
    break;
   }
  }
  if(prepared){
   document.dispatchEvent(new CustomEvent('bc:media-updated'));
   try{await refresh()}catch(_){}
   if(prepared===selection.length)status.textContent='✓ '+prepared+' Bunny file(s) now waiting in the PRIVATE Military Library review queue; nothing was posted.';
  }
  busy=false;paint();
 }
 reloadButton.addEventListener('click',()=>void load());
 allButton.addEventListener('click',()=>void prepareBatch());
 document.addEventListener('bc:bunny-uploaded',()=>void load());
 void load();
}
