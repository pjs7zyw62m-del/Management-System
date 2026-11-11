/* BLACKCELL Media Intake Processor: owner-only pre-publication review.
 * Photos and videos must be approved before other members can see them.
 * Adult/restricted media is NEVER published into shared albums or network feeds.
 * A cloud-to-cloud worker is a separate integration: this reviews registered assets.
 */
export function createBlackcellMediaProcessor({client,bucket,state,refresh,mediaUrl,toast,openAIReview}){
 const $=id=>document.getElementById(id),owner=()=>state.member?.role==='owner';
 const active=()=>owner()&&state.user?.id;
 const el=(tag,cls,text)=>{
  const node=document.createElement(tag);if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;return node;
 };
 let queue=[],albums=[],current=null,busy=false;
 const status=text=>{if($('bcProcessStatus'))$('bcProcessStatus').textContent=text};
 const errText=e=>e?.message||'Unknown error';
 const setBusy=v=>{busy=v;for(const name of ['bcMediaReset','bcProcessRefresh','bcReviewApprove','bcReviewReject','bcReviewAI'])
  {const node=$(name);if(node)node.disabled=v}};
 function options(targetId,sourceId){
  const target=$(targetId),source=$(sourceId);if(!target||!source)return;
  target.replaceChildren(...[...source.options].map(x=>new Option(x.textContent,x.value)));
 }
 function resetEditor(){
  current=null;$('bcReviewEditor').hidden=true;
  const host=$('bcReviewPreview');host.replaceChildren();
 }
 function updateCards(){
  const pending=queue.filter(a=>a.review_status==='pending');
  $('bcProcessCount').textContent=String(pending.length);
  const host=$('bcProcessQueue');host.replaceChildren();
  if(!pending.length){
   host.append(el('p','bc-proc-empty','No photographs or videos waiting for review. Imports will enter this private queue before becoming part of BLACKCELL.'));
   return;
  }
  for(const item of pending){
   const btn=el('button','bc-proc-item');btn.type='button';
   btn.append(el('strong','',item.filename||'Untitled media'),
    el('span','',item.kind.toUpperCase()+' · '+(item.source_provider||'manual')+' · '+(item.military_country_code||'COUNTRY UNCONFIRMED')));
   btn.addEventListener('click',()=>void open(item));
   host.append(btn);
  }
 }
 async function reload(force=false){
  if(!active()||(busy&&!force))return;
  status('Loading pending private photographs and videos…');
  try{
   const [a,b]=await Promise.all([
    client.from('corp_social_assets').select('*').eq('review_status','pending')
     .in('kind',['photo','video']).order('created_at',{ascending:true}).limit(1000),
    client.from('corp_social_albums').select('id,title,owner_id,military_country_code,military_branch,military_category')
     .eq('owner_id',state.user.id).limit(1000)
   ]);
   if(a.error||b.error)throw a.error||b.error;
   queue=a.data||[];albums=b.data||[];updateCards();
   status(queue.length+' waiting for approval · adult or uncertain media stays owner-only · country and albums are never guessed from appearance.');
  }catch(e){status('Could not load import queue: '+errText(e))}
 }
 function fillChoose(){
  const album=$('bcReviewAlbum');album.replaceChildren();
  album.add(new Option('AUTO CREATE / MATCH COUNTRY + BRANCH + SUBJECT','auto'));
  album.add(new Option('LEAVE UNFILED (OWNER-ONLY QUEUE)','unfiled'));
  for(const a of albums)album.add(new Option(a.title,a.id));
 }
 async function open(item){
  if(!active()||busy)return;
  current=item;
  const host=$('bcReviewPreview');host.replaceChildren();
  $('bcReviewName').textContent=(item.kind==='video'?'VIDEO · ':'PHOTO · ')+(item.filename||'Untitled');
  const asset=state.assets.find(a=>a.id===item.id);
  let url=asset?mediaUrl(asset):'';
  if(!url){
   const {data,error}=await bucket.createSignedUrl(item.storage_path,1200);
   if(error||!data?.signedUrl){status('Preview unavailable: '+(error?.message||'No private file link'));return}
   url=data.signedUrl;
  }
  const preview=el(item.kind==='video'?'video':'img');
  preview.src=url;
  if(item.kind==='video'){preview.controls=true;preview.playsInline=true;preview.preload='metadata'}
  else preview.alt=item.filename||'Pending photograph';
  host.append(preview);
  $('bcReviewCountry').value=item.military_country_code||'';
  $('bcReviewBranch').value=item.military_branch||'Unspecified';
  $('bcReviewCategory').value=item.military_category||'Unsorted';
  $('bcReviewEra').value=item.military_era||'';
  $('bcReviewUnit').value=item.military_unit||'';
  $('bcReviewTags').value=Array.isArray(item.military_tags)?item.military_tags.join(', '):'';
  $('bcReviewAdult').checked=Boolean(item.adult_restricted);
  $('bcReviewRights').checked=false;$('bcReviewAges').checked=false;
  fillChoose();$('bcReviewAlbum').value=item.adult_restricted?'unfiled':'auto';
  $('bcReviewAI').disabled=item.kind!=='photo';
  $('bcReviewAI').title=item.kind==='video'?'Video frame classification is not enabled yet; manually review this video':
   'Photo AI is optional and uses provider credits. Never submit explicit photos to an unapproved model.';
  $('bcReviewEditor').hidden=false;
  status('Review the actual '+item.kind+'. Verify country, branch, subject and adult restrictions before approving.');
  $('bcReviewEditor').scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function applyAI(){
  if(!active()||!current||busy||current.kind!=='photo')return;
  if($('bcReviewAdult').checked){
   status('Explicit or adult-restricted photographs must be classified manually. No external AI provider was called.');
   return;
  }
  if(!confirm('AI analysis is OPTIONAL and uses provider credits. Confirm this photograph contains NO sexually explicit content and that you authorize sending a reduced copy to the configured AI provider. Proceed?'))return;
  const a=state.assets.find(x=>x.id===current.id)||current;
  if(!a||!openAIReview){status('Photo AI review is not available from this queue.');return}
  openAIReview(a);
  status('AI review opened. Approve corrected suggestions there; then return to this queue to publish. AI labels alone do NOT release the photo.');
 }
 async function createAlbum(country,branch,subject){
  const name=$('bcReviewCountry').selectedOptions?.[0]?.textContent?.trim()||country;
  let match=albums.find(a=>a.owner_id===state.user.id&&a.military_country_code===country&&
   a.military_branch===branch&&a.military_category===subject);
  if(match)return match.id;
  const title=(name+' / '+branch+' / '+subject).slice(0,100);
  const {data,error}=await client.from('corp_social_albums').insert({
   owner_id:state.user.id,title,description:'Verified by BLACKCELL Media Import Processor',
   military_country_code:country,military_branch:branch,military_category:subject
  }).select('id,title,owner_id,military_country_code,military_branch,military_category').single();
  if(error||!data)throw Error('Could not create sorted album: '+errText(error));
  albums.push(data);return data.id;
 }
 async function approve(){
  if(!active()||!current||busy)return;
  const id=current.id;
  const country=$('bcReviewCountry').value,branch=$('bcReviewBranch').value;
  const subject=$('bcReviewCategory').value,era=$('bcReviewEra').value;
  const adult=$('bcReviewAdult').checked,rights=$('bcReviewRights').checked,ages=$('bcReviewAges').checked;
  const choice=$('bcReviewAlbum').value;
  if(!rights){status('Approval blocked: confirm you have the rights and consent needed to store and display the media.');return}
  if(adult&&!ages){status('Approval blocked: confirm every depicted person is an adult and your authority to hold this explicit media.');return}
  if(!adult&&(!country||branch==='Unspecified'||subject==='Unsorted')){
   status('Accurate sorting requires a confirmed country, branch and subject. Leave it pending when unknown; never guess.');return;
  }
  if(adult&&choice!=='unfiled'){
   status('Adult-restricted media cannot be placed in shared albums. Choose LEAVE UNFILED; it remains owner-only.');return;
  }
  const tags=[...new Set($('bcReviewTags').value.split(',').map(x=>x.trim().slice(0,40)).filter(Boolean))].slice(0,15);
  const chosenAlbum=albums.find(a=>a.id===choice);
  if(chosenAlbum&&!adult&&
   ((chosenAlbum.military_country_code&&chosenAlbum.military_country_code!==country)||
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
    ?await createAlbum(country,branch,subject):choice;
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
   resetEditor();await refresh();await reload(true);
   toast(adult?'Approved to OWNER-ONLY private media archive.':'Media approved and filed in the military album.');
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
  if(!confirm('PERMANENT FRESH START: Remove ALL BLACKCELL Network photos and videos from the private media bucket, including library, post attachments and profile images? This does not affect NEXUS, iCloud originals or private chat. All media-linked votes, favorites and AI indexes will be deleted. Continue?'))return;
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
   resetEditor();queue=[];albums=[];
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
  options('bcReviewCategory','militaryUploadCategory');
  options('bcReviewEra','militaryUploadEra');
  $('bcProcessRefresh').addEventListener('click',()=>void reload());
  document.addEventListener('bc:media-updated',()=>void reload());
  $('bcMediaReset').addEventListener('click',()=>void resetMedia());
  $('bcReviewApprove').addEventListener('click',()=>void approve());
  $('bcReviewReject').addEventListener('click',()=>void reject());
  $('bcReviewAI').addEventListener('click',()=>void applyAI());
  $('bcReviewCancel').addEventListener('click',resetEditor);
  $('bcReviewAdult').addEventListener('change',e=>{
   if(e.target.checked){$('bcReviewAlbum').value='unfiled';status('Adult-restricted media stays owner-only and cannot be filed in shared albums.')}
  });
  void reload();
 }
 return {setup,refresh:reload};
}
