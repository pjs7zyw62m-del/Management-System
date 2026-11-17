/* BLACKCELL Media Intake Processor: owner-only pre-publication review.
 * Photos and videos must be approved before other members can see them.
 * Adult/restricted media is NEVER published into shared albums or network feeds.
 * A cloud-to-cloud worker is a separate integration: this reviews registered assets.
 */
import {isWorldMedia,readWorldMedia} from './blackcell-world-video-catalog.js?v=4-world-media-review';
export function createBlackcellMediaProcessor({client,bucket,state,refresh,mediaUrl,toast,openAIReview}){
 const $=id=>document.getElementById(id),owner=()=>state.member?.role==='owner';
 const active=()=>owner()&&state.user?.id;
 const el=(tag,cls,text)=>{
  const node=document.createElement(tag);if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;return node;
 };
 let queue=[],albums=[],current=null,busy=false,page=0,totalPending=0,bunnyWaiting=0,previewEpoch=0,previewReady=false,firstReview=true;
 let previewObject='',previewAbort=null;
 function releasePreview(){
  previewAbort?.abort();previewAbort=null;
  const host=$('bcReviewPreview');for(const v of host?.querySelectorAll('video')||[]){v.pause();v.removeAttribute('src');v.load()}
  if(previewObject){URL.revokeObjectURL(previewObject);previewObject=''}
 }
 window.addEventListener('pagehide',()=>{previewEpoch++;releasePreview()});
 client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){previewEpoch++;releasePreview();$('bcReviewPreview')?.replaceChildren()}});
 const native=()=>!!$('bcProcessorPanel')?.classList.contains('bc-native-review');
 const worlds={unsorted:'Uniform World',military:'Military World',police:'Law Enforcement World',fire:'Fire & Rescue World',medical:'Emergency Medical World',security:'Corrections & Security World',professional:'Aviation & Professional Uniforms World'};
 const worldFrom=item=>{const tags=Array.isArray(item?.military_tags)?item.military_tags:[];const tagged=tags.find(t=>typeof t==='string'&&t.startsWith('maf:')&&Object.hasOwn(worlds,t.slice(4)));return tagged?tagged.slice(4):item?.military_branch&&item.military_branch!=='Unspecified'?'military':'unsorted'};
 const currentWorld=()=>Object.hasOwn(worlds,$('bcReviewWorld').value)?$('bcReviewWorld').value:'unsorted';
 function syncWorld(){const military=currentWorld()==='military';$('bcReviewBranch').disabled=!military;$('bcReviewBranchLabel').hidden=!military;if(!military)$('bcReviewBranch').value='Unspecified';$('bcReviewUnitLabel').firstChild.textContent=military?'UNIT / FORMATION ':'AGENCY / ORGANIZATION ';fillChoose();}
 const pageSize=40;
 const status=text=>{if($('bcProcessStatus'))$('bcProcessStatus').textContent=text;if($('bcReviewStatus')&&current)$('bcReviewStatus').textContent=text};
 const errText=e=>e?.message||'Unknown error';
 const setBusy=v=>{busy=v;$('bcProcessorPanel')?.setAttribute('aria-busy',String(v));for(const name of ['bcMediaReset','bcProcessRefresh','bcReviewApprove','bcReviewReject','bcReviewAI'])
  {const node=$(name);if(node)node.disabled=v||name==='bcReviewApprove'&&!previewReady||name==='bcReviewAI'&&(!previewReady||current?.kind!=='photo')}
  const cancel=$('bcReviewCancel');if(cancel)cancel.disabled=v;};
 function options(targetId,sourceId){
  const target=$(targetId),source=$(sourceId);if(!target||!source)return;
  target.replaceChildren(...[...source.options].map(x=>new Option(x.textContent,x.value)));
 }
 function resetEditor(){
  if(busy&&current===null)return;previewEpoch++;releasePreview();previewReady=false;current=null;$('bcReviewEditor').hidden=true;
  const host=$('bcReviewPreview');for(const video of host.querySelectorAll('video')){video.pause();video.removeAttribute('src');video.load()}host.replaceChildren();updateCards();
 }
 function updateCards(){
  const pending=queue.filter(a=>a.review_status==='pending');
  $('bcProcessCount').textContent=String(totalPending+bunnyWaiting);
  $('bcQueuePage').textContent=(page+1)+' / '+Math.max(1,Math.ceil(totalPending/pageSize));
  $('bcQueuePrev').disabled=page===0;
  $('bcQueueNext').disabled=(page+1)*pageSize>=totalPending;
  const host=$('bcProcessQueue');host.replaceChildren();
  if(!pending.length){
   host.append(el('p','bc-proc-empty','No prepared media waiting for approval. Open Bunny incoming to prepare staged originals.'));
   return;
  }
  for(const item of pending){
   const btn=el('button','bc-proc-item');btn.type='button';
   const copy=el('div','bc-review-queue-copy');copy.append(el('strong','',item.filename||'Untitled media'),el('span','',item.kind.toUpperCase()+' · '+(item.source_provider||'manual')+' · '+(item.military_country_code||'COUNTRY UNCONFIRMED')));
   if(native())btn.append(el('span','bc-review-queue-icon',item.kind==='video'?'▷':'▧'),copy);else btn.append(...copy.children);btn.classList.toggle('selected',current?.id===item.id);btn.setAttribute('aria-pressed',String(current?.id===item.id));
   btn.addEventListener('click',()=>void open(item));
   host.append(btn);
  }
 }
 async function reload(force=false){
  if(!active()||(busy&&!force))return;
  status('Loading pending private photographs and videos…');
  try{
   const [a,b]=await Promise.all([
    client.from('corp_social_assets').select('*',{count:'exact'}).eq('review_status','pending')
     .in('kind',['photo','video']).order('created_at',{ascending:true})
     .range(page*pageSize,(page+1)*pageSize-1),
    client.from('corp_social_albums').select('id,title,owner_id,military_country_code,military_branch,military_category,military_tags')
     .eq('owner_id',state.user.id).limit(1000)
   ]);
   if(a.error||b.error)throw a.error||b.error;
   totalPending=Number(a.count||0);
   if(page>0&&page*pageSize>=totalPending){page=Math.max(0,page-1);return await reload(true)}
   queue=a.data||[];albums=b.data||[];updateCards();
   status(totalPending+' prepared for approval · '+bunnyWaiting+' Bunny originals awaiting preparation.');
   if(native()&&firstReview&&queue.length&&!$('bcProcessorPanel').closest('[hidden]')&&!current&&!busy){firstReview=false;void open(queue[0])}
  }catch(e){status('Could not load import queue: '+errText(e))}
 }
 function fillChoose(){
  const album=$('bcReviewAlbum');album.replaceChildren();
  album.add(new Option('AUTO CREATE / MATCH '+worlds[currentWorld()].toUpperCase(),'auto'));
  album.add(new Option('LEAVE UNFILED (OWNER-ONLY QUEUE)','unfiled'));
  for(const a of albums.filter(a=>worldFrom(a)===currentWorld()))album.add(new Option(a.title,a.id));
 }
 async function open(item){
  if(!active()||busy)return;
  const seq=++previewEpoch;releasePreview();previewReady=false;current=item;
  const host=$('bcReviewPreview');for(const video of host.querySelectorAll('video')){video.pause();video.removeAttribute('src');video.load()}host.replaceChildren(el('p','bc-review-preview-message','Loading private media…'));
  $('bcReviewName').textContent=(item.kind==='video'?'VIDEO · ':'PHOTO · ')+(item.filename||'Untitled');
  $('bcReviewCountry').value=item.military_country_code||'';
  $('bcReviewWorld').value=worldFrom(item);
  $('bcReviewBranch').value=item.military_branch||'Unspecified';
  $('bcReviewCategory').value=item.military_category||'Unsorted';
  $('bcReviewEra').value=item.military_era||'';
  $('bcReviewUnit').value=item.military_unit||'';
  $('bcReviewTags').value=Array.isArray(item.military_tags)?item.military_tags.join(', '):'';
  $('bcReviewAdult').checked=Boolean(item.adult_restricted);
  $('bcReviewRights').checked=false;$('bcReviewAges').checked=false;
  syncWorld();$('bcReviewAlbum').value=item.adult_restricted?'unfiled':'auto';
  $('bcReviewAI').disabled=item.kind!=='photo';
  $('bcReviewAI').title=item.kind==='video'?'Video frame classification is not enabled yet; manually review this video':
   'Photo AI is optional and uses provider credits. Never submit explicit photos to an unapproved model.';

  $('bcReviewEditor').hidden=false;setBusy(false);updateCards();
  status('Loading secure preview…');
  // Auto-sort suggestions are private drafts. Load them without auto-approval.
  if(item.kind==='photo'){
   void (async()=>{
    try{
     const {data:hint,error:hintError}=await client.from('corp_social_ai_analysis')
      .select('status,country_code,military_branch,military_category,uniform_type,camouflage_pattern,confidence,nudity_level,tags,notes')
      .eq('asset_id',item.id).eq('owner_id',item.owner_id).maybeSingle();
     if(hintError||!hint||hint.status!=='suggested'||seq!==previewEpoch||current?.id!==item.id)return;
     const tags=Array.isArray(hint.tags)?hint.tags:[];
     const taggedWorld=worldFrom({military_tags:tags,military_branch:hint.military_branch});
     const pick=(id,v)=>{const select=$(id);if(select&&[...select.options].some(o=>o.value===v))select.value=v};
     pick('bcReviewWorld',taggedWorld);
     pick('bcReviewCountry',hint.country_code);
     pick('bcReviewBranch',hint.military_branch);
     pick('bcReviewCategory',hint.military_category);
     $('bcReviewTags').value=tags.join(', ');
     syncWorld();
     status('Private AI suggestion loaded ('+String(hint.confidence||'unknown')+' confidence). Confirm country, uniform, rights and age before approval.');
    }catch(_){/* manual review remains available */}
   })();
  }
  if(!native())$('bcReviewEditor').scrollIntoView({behavior:'smooth',block:'start'});
  const valid=()=>active()&&seq===previewEpoch&&current?.id===item.id;
  let failed=false;const fail=(reason)=>{if(!valid()||failed)return;failed=true;releasePreview();previewReady=false;if(!busy)setBusy(false);const retry=el('button','bc-review-retry','Retry preview');retry.type='button';retry.onclick=()=>void open(item);host.replaceChildren(el('p','bc-review-preview-message','Private preview unavailable. This item remains pending.'+(typeof reason==='string'?' '+reason:'')),retry);status('Preview is required before approval. '+(typeof reason==='string'?reason:'Retry the preview.'))};
  try{
   const asset=state.assets.find(a=>a.id===item.id);let url='';
   if(isWorldMedia(item)){
    const controller=new AbortController();previewAbort=controller;
    const blob=await readWorldMedia(client,item,{signal:controller.signal});
    if(!valid()||controller.signal.aborted)return;
    previewAbort=null;previewObject=URL.createObjectURL(blob);url=previewObject;
   }else url=asset?mediaUrl(asset):'';
   if(!url&&!isWorldMedia(item)){const {data,error}=await bucket.createSignedUrl(item.storage_path,1200);if(!valid())return;if(error||!data?.signedUrl){fail();return}url=data.signedUrl}
   if(!valid())return;
   const preview=el(item.kind==='video'?'video':'img');
   if(item.kind==='video'){preview.controls=true;preview.playsInline=true;preview.preload='auto'}else preview.alt=item.filename||'Pending photograph';
   const loaded=()=>{if(!valid())return;previewReady=true;if(!busy)setBusy(false);status('Review the actual '+item.kind+'. Verify country, branch, subject and applicable restrictions before approving.')};
   preview.addEventListener(item.kind==='video'?'loadeddata':'load',loaded,{once:true});preview.addEventListener('error',()=>fail(item.kind==='video'?'Video decode failed (code '+(preview.error?.code||0)+').':'Image decode failed.'),{once:true});
   host.replaceChildren(preview);preview.src=url;
  }catch(e){const match=String(e?.message||'').match(/Private (?:video|photo) unavailable \((\d{3})\)/);fail(match?'Storage request failed (HTTP '+match[1]+').':'Private preview request failed. Retry after refreshing.')}
 }
 async function applyAI(){
  if(!active()||!current||busy||!previewReady||current.kind!=='photo')return;
  if($('bcReviewAdult').checked){
   status('Explicit or adult-restricted photographs must be classified manually. No external AI provider was called.');
   return;
  }
  if(!confirm('AI analysis is OPTIONAL and uses provider credits. Confirm this photograph contains NO sexually explicit content and that you authorize sending a reduced copy to the configured AI provider. Proceed?'))return;
  const a=state.assets.find(x=>x.id===current.id)||current;
  if(!a||!openAIReview){status('Photo AI review is not available from this queue.');return}
  setBusy(true);
  status('Requesting optional AI suggestions for this non-explicit photograph…');
  try{
   const result=await openAIReview(a);
   if(!result||current?.id!==a.id)throw new Error('No suggestions returned.');
   const selections=[
    ['bcReviewCountry',result.country_code],
    ['bcReviewBranch',result.military_branch],
    ['bcReviewCategory',result.military_category]
   ];
   for(const [name,value] of selections){
    const node=$(name);
    if(value&&[...node.options].some(opt=>opt.value===value))node.value=value;
   }
   if(Array.isArray(result.tags)){
    $('bcReviewTags').value=[...new Set(result.tags.map(t=>String(t).trim()).filter(Boolean))].slice(0,15).join(', ');
   }
   status('AI suggestions loaded for review. Verify country, branch, tags and adult status YOURSELF before approving. No media was published.');
  }catch(error){
   status('AI unavailable; classify manually. '+(error?.message||'Unknown error'));
  }finally{setBusy(false)}
 }
 async function createAlbum(country,branch,subject,world){
  const name=$('bcReviewCountry').selectedOptions?.[0]?.textContent?.trim()||country;
  let match=albums.find(a=>a.owner_id===state.user.id&&worldFrom(a)===world&&a.military_country_code===country&&
   a.military_branch===branch&&a.military_category===subject);
  if(match)return match.id;
  const title=(worlds[world]+' / '+(country?name:'Country unconfirmed')+(world==='military'?' / '+branch:'')+' / '+subject).slice(0,100);
  const {data,error}=await client.from('corp_social_albums').insert({
   owner_id:state.user.id,title,description:'Verified by BLACKCELL Media Import Processor',
   military_country_code:country,military_branch:branch,military_category:subject,military_tags:['maf:'+world]
  }).select('id,title,owner_id,military_country_code,military_branch,military_category,military_tags').single();
  if(error||!data)throw Error('Could not create sorted album: '+errText(error));
  albums.push(data);return data.id;
 }
 async function approve(){
  if(!active()||!current||busy||!previewReady)return;
  const id=current.id;
  const world=currentWorld(),country=$('bcReviewCountry').value,branch=world==='military'?$('bcReviewBranch').value:'Unspecified';
  const subject=$('bcReviewCategory').value,era=$('bcReviewEra').value;
  const adult=$('bcReviewAdult').checked,rights=$('bcReviewRights').checked,ages=$('bcReviewAges').checked;
  const choice=$('bcReviewAlbum').value;
  if(!rights){status('Approval blocked: confirm you have the rights and consent needed to store and display the media.');return}
  if(adult&&!ages){status('Approval blocked: confirm every depicted person is an adult and your authority to hold this explicit media.');return}
  if(!adult&&((world==='military'&&(!country||branch==='Unspecified'))||subject==='Unsorted')){
   status('Choose a subject. Military World also requires confirmed country and branch; other Worlds do not require a military branch.');return;
  }
  if(!adult&&choice==='unfiled'){
   status('To publish regular media, file it into an accurately labeled album. Choose AUTO CREATE or a matching album.');return;
  }
  if(adult&&choice!=='unfiled'){
   status('Adult-restricted media cannot be placed in shared albums. Choose LEAVE UNFILED; it remains owner-only.');return;
  }
  const tags=['maf:'+world,...new Set($('bcReviewTags').value.split(',').map(x=>x.trim().slice(0,40)).filter(x=>x&&!/^maf:/i.test(x)))].slice(0,15);
  const chosenAlbum=albums.find(a=>a.id===choice);
  if(chosenAlbum&&!adult&&
   (worldFrom(chosenAlbum)!==world||(chosenAlbum.military_country_code&&chosenAlbum.military_country_code!==country)||
    (chosenAlbum.military_branch&&chosenAlbum.military_branch!==branch)||
    (chosenAlbum.military_category&&chosenAlbum.military_category!==subject))){
   status('Album mismatch: choose an album with the SAME country, branch and subject, or AUTO CREATE.');return;
  }
  if(!confirm('Approve this '+current.kind+'? '+(adult?
   'It will remain restricted to the verified BLACKCELL owner and never enter shared albums.':
   'It will become visible to authorized Network members and be sorted into the approved album.')+
   ' You can reclassify it later.'))return;
  setBusy(true);
  try{
   // Prepare album association BEFORE releasing the asset from quarantine.
   let albumId=adult||choice==='unfiled'?null:choice==='auto'
    ?await createAlbum(country,branch,subject,world):choice;
   if(albumId){
    const {error:linkError}=await client.from('corp_social_album_items').upsert({
     album_id:albumId,asset_id:id,added_by:state.user.id
    },{onConflict:'album_id,asset_id',ignoreDuplicates:true});
    if(linkError)throw Error('Album filing failed: '+linkError.message);
   }
   const update={
    military_country_code:country,military_branch:branch,
    military_category:subject,military_era:era,
    military_unit:$('bcReviewUnit').value.trim().slice(0,120),
    military_tags:tags,adult_restricted:adult,rights_confirmed:rights,
    ages_confirmed:adult?ages:false,review_status:'approved'
   };
   const {data,error}=await client.from('corp_social_assets').update(update).eq('id',id)
    .eq('review_status','pending').select('id').single();
   if(error||!data)throw Error('Media approval failed: '+errText(error));
   // New approved Military Library photos are archived to Bunny automatically.
   // Archiving is separate from approval: an archive error must never undo or
   // misrepresent the already-approved asset. The owner can retry from the
   // "Connect Existing Military Library Photos" panel.
   let archivePending=false;
   if(current.kind==='photo'&&['library','post'].includes(current.purpose)&&!['bunny-private','world-bunny-v1'].includes(current.source_provider)){
    try{
     const {data:archive,error:archiveError}=await client.functions.invoke(
      'blackcell-bunny-library-sync',{body:{action:'sync-one',asset_id:id}});
     archivePending=!!archiveError||archive?.ok!==true||archive?.verified!==true;
    }catch(_){archivePending=true}
   }
   resetEditor();await refresh();await reload(true);
   if(archivePending)
    status('Photo approved and filed. Bunny copy not yet verified; use Connect Existing Military Library Photos to finish archival.');
   toast(adult?'Approved to OWNER-ONLY private media archive.':'Media approved and filed in the selected World album.');
  }catch(e){status('Media remains pending: '+errText(e))}
  finally{setBusy(false)}
 }
 async function reject(){
  if(!active()||!current||busy)return;
  if(!confirm('Reject this media from the import queue? The original remains stored privately for later deletion or reconsideration.'))return;
  setBusy(true);
  try{
   const {error}=await client.from('corp_social_assets').update({review_status:'rejected'})
    .eq('id',current.id).eq('review_status','pending');
   if(error)throw error;
   resetEditor();await refresh();await reload(true);
   status('Media rejected and hidden. It has NOT been physically deleted.');
  }catch(e){status('Could not reject media: '+errText(e))}
  finally{setBusy(false)}
 }
 async function resetMedia(){
  if(!active()||busy)return;
  if(!confirm('PERMANENT FRESH START: Remove ALL BLACKCELL Network photos and videos from the private media bucket, including library, post attachments and profile images? This does not affect Bunny Storage originals, NEXUS, iCloud originals or private chat. All media-linked votes, favorites and AI indexes will be deleted. Continue?'))return;
  const check=prompt('FINAL CONFIRMATION: type DELETE ALL BLACKCELL MEDIA to permanently erase the BLACKCELL Network photo/video files.');
  if(check!=='DELETE ALL BLACKCELL MEDIA'){status('Reset canceled. No files were removed.');return}
  setBusy(true);
  let removed=0;
  try{
   // Obtain real file paths from the authenticated database, not untrusted user input.
   const {data,error}=await client.from('corp_social_assets').select('id,storage_path,kind,filename')
    .in('kind',['photo','video']).limit(5000);
   if(error)throw Error('Could not list media: '+error.message);
   const files=data||[];
   if(files.length===5000)throw Error('More than 4,999 media files exist; use a paginated reset tool instead of deleting a partial library.');
   if(!files.length){status('No media assets are registered. Checking saved albums and pages…')}
   for(let i=0;i<files.length;i+=25){
    const part=files.slice(i,i+25);
    status('Deleting original media files '+(i+1)+'–'+Math.min(i+25,files.length)+' / '+files.length+'…');
    const {error:storageError}=await bucket.remove(part.map(x=>x.storage_path));
    if(storageError)throw Error('Storage removal stopped: '+storageError.message);
    // Remove metadata AFTER Storage API confirms original object removal.
    const {data:deleted,error:rowError}=await client.from('corp_social_assets')
     .delete().in('id',part.map(x=>x.id)).select('id');
    if(rowError||deleted?.length!==part.length)
     throw Error('File metadata cleanup incomplete: '+(rowError?.message||'Unexpected row count'));
    removed+=part.length;
   }
   // Remove empty media-only social posts whose original attachments were
   // purged, keeping genuine text posts and other users' records untouched.
   const {data:oldPosts,error:postsReadError}=await client.from('corp_social_posts')
    .select('id,kind,body,author_id').eq('author_id',state.user.id)
    .in('kind',['photo','video']).limit(1000);
   if(postsReadError)throw postsReadError;
   const emptyIds=(oldPosts||[]).filter(p=>!String(p.body||'').trim()).map(p=>p.id);
   if(emptyIds.length){
    const {error:emptyPostError}=await client.from('corp_social_posts').delete()
     .in('id',emptyIds).eq('author_id',state.user.id);
    if(emptyPostError)throw Error('Empty media-post cleanup failed: '+emptyPostError.message);
   }
   // Album pages and country selections no longer refer to an old library.
   const [albumRes,countryRes]=await Promise.all([
    client.from('corp_social_albums').delete().eq('owner_id',state.user.id),
    client.from('corp_social_country_collections').delete().eq('user_id',state.user.id)
   ]);
   if(albumRes.error||countryRes.error)throw albumRes.error||countryRes.error;
   const {count:remaining,error:checkError}=await client.from('corp_social_assets')
    .select('id',{count:'exact',head:true}).in('kind',['photo','video']);
   if(checkError||remaining!==0)
    throw Error('Final database verification did not reach zero: '+(checkError?.message||remaining+' rows remain'));
   resetEditor();queue=[];albums=[];page=0;totalPending=0;
   await refresh();await reload(true);
   document.dispatchEvent(new CustomEvent('bc:media-updated'));
   status('FRESH START COMPLETE · '+removed+' photo/video originals removed from BLACKCELL storage and database. Private chat, NEXUS and iCloud sources unchanged.');
   toast('BLACKCELL photo/video library reset. Ready for new verified imports.');
  }catch(e){
   status('RESET INCOMPLETE after '+removed+' assets: '+errText(e)+
    '. Do not start reimporting until Storage and database counts are reconciled.');
  }finally{setBusy(false)}
 }
 function setup(){
  const panel=$('bcProcessorPanel');if(!panel)return;
  panel.hidden=!owner();
  if(!owner())return;
  options('bcReviewCountry','militaryUploadCountry');
  options('bcReviewBranch','militaryUploadBranch');
  $('bcReviewWorld').replaceChildren(...Object.entries(worlds).map(([value,label])=>new Option(label,value)));
  $('bcReviewWorld').addEventListener('change',()=>{const prior=$('bcReviewAdult').checked;syncWorld();$('bcReviewAlbum').value=prior?'unfiled':'auto';status('World selected: '+worlds[currentWorld()]+'. Verify category before approving.');});
  options('bcReviewCategory','militaryUploadCategory');
  options('bcReviewEra','militaryUploadEra');
  $('bcProcessRefresh').addEventListener('click',()=>void reload());
  $('bcQueuePrev').addEventListener('click',()=>{if(!busy&&page>0){resetEditor();page--;void reload()}});
  $('bcQueueNext').addEventListener('click',()=>{if(!busy&&(page+1)*pageSize<totalPending){resetEditor();page++;void reload()}});
  document.addEventListener('bc:media-updated',()=>void reload());
  document.addEventListener('bc:bunny-staged-count',event=>{
    bunnyWaiting=Math.max(0,Number(event.detail?.count)||0);
    updateCards();
  });
  $('bcMediaReset').addEventListener('click',()=>void resetMedia());
  $('bcReviewApprove').addEventListener('click',()=>void approve());
  $('bcReviewReject').addEventListener('click',()=>void reject());
  $('bcReviewAI').addEventListener('click',()=>void applyAI());
  $('bcReviewCancel').addEventListener('click',()=>{if(!busy)resetEditor()});
  $('bcReviewAdult').addEventListener('change',e=>{
   if(e.target.checked){$('bcReviewAlbum').value='unfiled';status('Adult-restricted media stays owner-only and cannot be filed in shared albums.')}
  });
  void reload();
 }
 return {setup,refresh:reload};
}
