import {placePhotoTransfer} from './blackcell-photo-transfer.js?v=1';
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-staff1';
import {isWorldMedia,createOmegaMediaReader} from './blackcell-omega-media.js?v=20261118-branded-media1';
const client=corporateClient(),storage=client.storage.from('corp-social-media');
// Authenticated media stays in private Supabase or Bunny storage; this page only gives it a branded viewer address.
const bunnyReader=createOmegaMediaReader(client);
let transientSource='',showGeneration=0;
function releaseSource(){if(transientSource){URL.revokeObjectURL(transientSource);transientSource=''}}
window.addEventListener('pagehide',releaseSource);
const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let items=[],index=0;
function status(s){$('status').textContent=s;$('status').hidden=!s}
let syncTransfer;
async function show(){
 const a=items[index];if(!a)return;
 const generation=++showGeneration;
 releaseSource();
 syncTransfer??=placePhotoTransfer($('downloadOriginal'),{client,getPhoto:()=>items[index]});syncTransfer();
 const stage=$('mediaStage');stage.replaceChildren();
 $('imageCounter').textContent=(index+1)+' / '+items.length;
 $('mediaPrevious').disabled=items.length<=1;$('mediaNext').disabled=items.length<=1;
 $('downloadOriginal').disabled=true;$('downloadOriginal').style.display=a.kind==='photo'?'none':'';$('viewOriginal').hidden=true;$('viewOriginal').style.display=a.kind==='photo'?'none':'';$('viewOriginal').removeAttribute('href');
 $('name').textContent=a.caption||a.filename;
 history.replaceState(null,'','?id='+encodeURIComponent(a.id));
 status('Loading original media…');
 try{
  let src;
  if(isWorldMedia(a)){
   // World originals must pass the existing Edge Function member/review/age-access checks.
   src=await bunnyReader.original(a);
   if(generation!==showGeneration){URL.revokeObjectURL(src);return}
   transientSource=src;
  }else{
   const {data,error}=await storage.createSignedUrl(a.storage_path,300);
   if(error||!data?.signedUrl)throw Error('Original media is not accessible to this session.');
   if(generation!==showGeneration)return;
   src=data.signedUrl;
  }
  if(a.kind!=='photo'){$('viewOriginal').href=src;$('viewOriginal').hidden=false;}
  if(a.kind==='video'){
   const vid=document.createElement('video');vid.src=src;vid.controls=true;vid.playsInline=true;vid.preload='metadata';
   vid.addEventListener('loadedmetadata',()=>{
    $('imageDetails').textContent='Original video · '+vid.videoWidth+' × '+vid.videoHeight+' pixels · '+(a.bytes/1048576).toFixed(1)+' MB';
   });
   stage.append(vid);
  }else{
   const img=document.createElement('img');img.src=src;img.alt=a.caption||a.filename;
   img.addEventListener('load',()=>{
    $('imageDetails').textContent='Original photo · '+img.naturalWidth+' × '+img.naturalHeight+' pixels · '+(a.bytes/1048576).toFixed(1)+' MB · Save via Transfer to Photos';
   });
   img.addEventListener('error',()=>status('Could not load original photo. Try opening Photos again.'));
   stage.append(img);
  }
  $('downloadOriginal').disabled=false;status('');
 }catch(e){if(generation===showGeneration)status(e?.message||'Original media temporarily unavailable')}
}
function move(n){if(items.length>1){index=(index+n+items.length)%items.length;void show()}}
$('mediaPrevious').addEventListener('click',()=>move(-1));
$('mediaNext').addEventListener('click',()=>move(1));
document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')move(-1);if(e.key==='ArrowRight')move(1)});
let touchStart=0;
$('mediaStage').addEventListener('touchstart',e=>{touchStart=e.touches[0]?.clientX||0},{passive:true});
$('mediaStage').addEventListener('touchend',e=>{const diff=(e.changedTouches[0]?.clientX||0)-touchStart;if(Math.abs(diff)>80)move(diff<0?1:-1)},{passive:true});
$('downloadOriginal').addEventListener('click',async()=>{
 const a=items[index];if(!a)return;if(a.kind==='photo'){status('Use Transfer to Photos, then download from BLACKCELL Photos.');return}
 const button=$('downloadOriginal');button.disabled=true;button.textContent='PREPARING…';
 try{
  let data;
  if(isWorldMedia(a)){
   if(!transientSource)throw Error('Original is still loading.');
   const response=await fetch(transientSource);
   if(!response.ok)throw Error('Original download unavailable');
   data=await response.blob();
  }else{
   const result=await storage.download(a.storage_path);
   if(result.error||!result.data)throw result.error||Error('Download unavailable');
   data=result.data;
  }
  const url=URL.createObjectURL(data),link=document.createElement('a');
  link.href=url;link.download=a.filename||'blackcell-photo-original';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),50000);
  status('Original download requested. On iPad, View Raw Image and long-press may be useful.');
 }catch(e){status('Download unavailable: '+(e?.message||'Try again'))}
 finally{button.disabled=false;button.textContent='↓ DOWNLOAD ORIGINAL'}
});
(async function boot(){
 const id=new URLSearchParams(location.search).get('id');
 if(!UUID.test(id||'')){status('Invalid private photo link.');return}
 try{
  const {data:{session}}=await client.auth.getSession();
  if(!session){status('Sign in to Blackcell Network before opening private media.');return}
  const auth=await corporateAuthorize(client);
  if(!auth.ok)throw Error('Corporate network access not authorized.');
  let approved=false;
  if(auth.member.role==='owner'){
   const {data,error}=await client.rpc('corp_code_status');approved=!error&&data?.verified===true;
  }else if(auth.member.role==='employee'){
   const {data,error}=await client.rpc('corp_employee_code_status');approved=!error&&data?.verified===true;
  }
  if(!approved)throw Error('Your corporate session is not authorized to view original media.');
  const {data:current,error}=await client.from('corp_social_assets').select('*').eq('id',id).maybeSingle();
  if(error||!current)throw Error('This media is unavailable or outside your authorized network.');
  const {data:group,error:groupErr}=await client.from('corp_social_assets')
   .select('*').eq('owner_id',current.owner_id).in('purpose',['library','post'])
   .order('created_at',{ascending:false}).limit(300);
  if(groupErr)throw Error('The media library cannot be loaded.');
  items=group||[];
  if(!items.some(a=>a.id===id))items.unshift(current);
  index=Math.max(0,items.findIndex(x=>x.id===id));
  await show();
 }catch(e){status(e?.message||'Cannot open this original photo')}
})();
