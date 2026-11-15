import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-staff1';
const client=corporateClient();
const $=id=>document.getElementById(id);
const storage=client.storage.from('corp-chat-media');
const items=[];let current=0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function setStatus(s){$('status').textContent=s;$('status').hidden=!s}
async function render(){
 if(!items.length)return;
 const item=items[current];
 $('previous').disabled=items.length<=1;
 $('next').disabled=items.length<=1;
 $('counter').textContent=(current+1)+' / '+items.length;
 $('filename').textContent=item.filename+' · '+(item.kind==='video'?'VIDEO':'PHOTO');
 $('caption').textContent='Secure original media · '+(item.bytes/(1024*1024)).toFixed(1)+' MB';
 $('stage').replaceChildren();
 $('download').disabled=true;
 $('viewOriginal').hidden=true;
 history.replaceState(null,'','?id='+encodeURIComponent(item.id));
 setStatus('Loading original media…');
 try{
  const {data,error}=await storage.createSignedUrl(item.storage_path,300);
  if(error||!data?.signedUrl)throw Error('Could not authorize original media. Sign in again if your session expired.');
  if(item.kind==='video'){
   const video=document.createElement('video');
   video.controls=true;video.playsInline=true;video.preload='metadata';video.src=data.signedUrl;
   video.addEventListener('loadedmetadata',()=>{
    $('caption').textContent='Original video · '+video.videoWidth+' × '+video.videoHeight+' pixels · '+(item.bytes/(1024*1024)).toFixed(1)+' MB';
   });
   $('stage').append(video);
  }else{
   const img=document.createElement('img');
   img.alt=item.filename;img.src=data.signedUrl;
   img.addEventListener('load',()=>{
    $('caption').textContent='Original photo · '+img.naturalWidth+' × '+img.naturalHeight+' pixels · '+(item.bytes/(1024*1024)).toFixed(1)+' MB · Long-press to save';
   });
   img.addEventListener('error',()=>setStatus('Could not load this photo. Try returning to Shared Media.'));
   $('stage').append(img);
  }
  $('viewOriginal').href=data.signedUrl;$('viewOriginal').hidden=false;
  $('download').disabled=false;
  setStatus('');
 }catch(e){setStatus(e.message||'Media unavailable')}
}
function change(step){if(items.length>1){current=(current+step+items.length)%items.length;void render()}}
$('previous').addEventListener('click',()=>change(-1));
$('next').addEventListener('click',()=>change(1));
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')change(1);if(e.key==='ArrowLeft')change(-1)});
let touchX=0;
$('stage').addEventListener('touchstart',e=>{touchX=e.touches[0]?.clientX||0},{passive:true});
$('stage').addEventListener('touchend',e=>{const x=e.changedTouches[0]?.clientX||touchX;const diff=x-touchX;if(Math.abs(diff)>80)change(diff<0?1:-1)},{passive:true});
$('download').addEventListener('click',async()=>{
 const item=items[current];if(!item)return;
 const btn=$('download');btn.disabled=true;btn.textContent='PREPARING DOWNLOAD…';
 try{
  const {data,error}=await storage.download(item.storage_path);
  if(error||!data)throw Error('Download is unavailable. Try View Original in New Tab.');
  const objectUrl=URL.createObjectURL(data);
  const link=document.createElement('a');
  link.href=objectUrl;link.download=item.filename||'blackcell-original';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
  setStatus('Original file download requested. On iPad, use View Original in New Tab if the browser blocks saving.');
 }catch(e){setStatus(e.message||'Download unsuccessful')}
 finally{btn.disabled=false;btn.textContent='DOWNLOAD ORIGINAL'}
});
(async function boot(){
 const id=new URLSearchParams(location.search).get('id');
 if(!id||!uuid.test(id)){setStatus('A valid shared media link is required.');return}
 try{
  const {data:{session}}=await client.auth.getSession();
  if(!session){setStatus('Sign in to the corporate network to view private media.');return}
  const authorized=await corporateAuthorize(client);
  if(!authorized.ok){setStatus('Your Blackcell employee session must be verified first.');return}
  if(authorized.member.role==='owner'){
   const {data,error}=await client.rpc('corp_code_status');
   if(error||data?.verified!==true){setStatus('Level 7 verification is required for this media.');return}
  }else if(authorized.member.role==='employee'){
   const {data,error}=await client.rpc('corp_employee_code_status');
   if(error||data?.verified!==true){setStatus('Sign in with an active employee account to view this media.');return}
  }else{setStatus('Unauthorized account.');return}
  const {data:item,error:itemError}=await client.from('corp_chat_media_items')
   .select('id,batch_id,kind,filename,storage_path,bytes').eq('id',id).maybeSingle();
  if(itemError||!item){setStatus('This media is unavailable or you do not have access.');return}
  const {data:all,error:batchError}=await client.from('corp_chat_media_items')
   .select('id,batch_id,kind,filename,storage_path,bytes,item_order').eq('batch_id',item.batch_id)
   .order('item_order',{ascending:true}).limit(100);
  if(batchError||!all?.length){setStatus('The private media collection cannot be loaded.');return}
  items.push(...all);current=Math.max(0,items.findIndex(it=>it.id===id));
  await render();
 }catch(e){setStatus('Could not open private original media: '+(e?.message||'Network error'))}
})();