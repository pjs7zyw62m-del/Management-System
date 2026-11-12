/* BLACKCELL / AUTHORIZED ADMIN MEDIA PROCESSOR
 * Independent Level-7 corporate access checks; no secret keys in public code.
 * The same existing photo/video intake controller is mounted on an admin-only page.
 */
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-clearance5';
import {createBlackcellMediaProcessor} from './corporate-media-processor.js?v=20261111-adminmove1';
import {setupBlackcellBulk} from './corporate-b2-bulk.js?v=20261111-cors2';

const $=id=>document.getElementById(id);
const state={user:null,member:null,assets:[]};
const client=corporateClient();
const bucket=client.storage.from('corp-social-media');
let processor=null,verifying=false,expires=false,toastTimeout=0;
const regionCodes=[...new Set("US CN GB CA AU FR DE IN JP KR BR RU UA IT ES MX ZA EG NG KE TR IL PK ID PH TH VN NZ SE NO FI DK NL BE PL CZ GR RO CH AT SG MY AR CL CO PE AE SA QA JO IQ IR AF BD LK NP MM KH LA TW KP MN KZ UZ GE AM AZ LT LV EE RS HR SI SK HU BG PT IE IS MA DZ TN LY ET GH CM CI SN UG TZ RW ZW ZM AO MZ NA BW MW MG CD CG GA GQ SO SD SS YE OM KW BH CY MT LU AL BA ME MK MD BY AD AE AG AI AO AQ AS AW AX BB BF BI BJ BL BM BN BO BQ BS BT BV BZ CC CD CF CG CI CK CL CM CO CR CU CV CW CX CY DJ DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO GA GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT ID IE IM IO IS JE JM JO KE KG KH KI KM KN KP KW KY KZ LA LB LC LI LR LS LT LU LV LY MA MC MD ME MF MG MH ML MM MO MP MQ MR MS MT MU MV MX MY MZ NC NE NF NG NI NL NO NP NR NU OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UG UM UY UZ VA VC VE VG VI VU WF WS YT ZA ZM ZW".split(/\s+/))];
const regions=typeof Intl.DisplayNames==='function'?new Intl.DisplayNames(['en'],{type:'region'}):null;

function lock(message){
 expires=true;
 $('bcMediaAdminApp').hidden=true;
 $('bcAdminGate').hidden=false;
 $('bcAdminGateTitle').textContent='Administration Access Required';
 $('bcAdminGateText').textContent=message;
}
async function validOwner(){
 const auth=await corporateAuthorize(client);
 if(!auth.ok||!auth.user||auth.member?.role!=='owner'||Number(auth.member?.clearance_level)!==7)
  return null;
 const {data,statusError,error}=await client.rpc('corp_code_status');
 if(error||statusError||data?.ok!==true||data?.verified!==true)return null;
 return auth;
}
function toast(message){
 const el=$('bcMediaAdminToast');el.textContent=String(message||'');
 el.hidden=false;clearTimeout(toastTimeout);
 toastTimeout=setTimeout(()=>el.hidden=true,7000);
}
function countries(){
 const picker=$('militaryUploadCountry');
 if(!picker)return;
 const list=[...regionCodes].sort((a,b)=>{
  const an=regions?.of(a)||a,bn=regions?.of(b)||b;
  return an.localeCompare(bn);
 });
 for(const code of list){
  let label=code;
  try{label=(regions?.of(code)||code)+' ('+code+')'}catch(_){}
  picker.add(new Option(label,code));
 }
}
async function loadAssets(){
 const {data,error}=await client.from('corp_social_assets')
  .select('*').order('created_at',{ascending:false}).limit(1000);
 if(error)throw new Error('Admin media catalog unavailable: '+error.message);
 state.assets=data||[];
 await refreshCounts();
}
async function refreshCounts(){
 const [all,pending]=await Promise.all([
  client.from('corp_social_assets').select('id',{head:true,count:'exact'}).in('kind',['photo','video']),
  client.from('corp_social_assets').select('id',{head:true,count:'exact'}).eq('review_status','pending')
 ]);
 if(all.error||pending.error)throw new Error(all.error?.message||pending.error?.message);
 $('bcAdminAssetsCount').textContent=String(all.count??'—');
 $('bcAdminPendingCount').textContent=String(pending.count??'—');
}
async function makePreview(a){
 if(a.kind!=='photo')throw new Error('Video AI classification is not available; review videos manually.');
 if(a.owner_id!==state.user?.id)throw new Error('AI analysis requires the photograph uploader. You can manually review employee uploads.');
 const request={action:'analyze',asset_id:a.id};
 const maxDirect=10*1024*1024,allowed=new Set(['image/jpeg','image/png','image/webp','image/gif']);
 if(Number(a.bytes)>maxDirect||!allowed.has(a.mime_type)){
  const {data:signed,error}=await bucket.createSignedUrl(a.storage_path,120);
  if(error||!signed?.signedUrl)throw new Error('Could not access photo to create an AI preview.');
  const img=new Image();img.crossOrigin='anonymous';
  await new Promise((resolve,reject)=>{
   img.onload=resolve;img.onerror=()=>reject(new Error('This browser cannot decode the photo. Use manual classification.'));
   img.src=signed.signedUrl;
  });
  const width=img.naturalWidth,height=img.naturalHeight,scale=Math.min(1,1600/Math.max(width,height));
  if(!width||!height)throw new Error('Original image has no readable dimensions.');
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Could not create AI preview in this browser.');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  request.preview_image=canvas.toDataURL('image/jpeg',0.72);
  canvas.width=canvas.height=1;
 }
 const {data,error}=await client.functions.invoke('blackcell-military-ai',{body:request});
 if(error)throw new Error('Photo AI suggestions unavailable: '+error.message);
 if(!data?.ok||!data.analysis)throw new Error(data?.error||'No suggestions were produced; use manual classification.');
 return data.analysis;
}
async function checkBunny(){
 const button=$('bcBunnyCheck'),badge=$('bcBunnyStatus'),message=$('bcBunnyMessage');
 if(!button||!badge||!message)return;
 button.disabled=true;badge.dataset.health='checking';badge.textContent='CHECKING';
 message.textContent='Verifying the private Bunny Storage zone securely through your Supabase backend…';
 try{
  const {data,error}=await client.functions.invoke('blackcell-bunny-storage',{body:{action:'status'}});
  let result=data;
  if(error){
   try{result=await error.context?.json?.()}catch(_){}
   throw new Error(result?.detail||error.message||'Bunny connection check failed.');
  }
  if(result?.connected===true){
   badge.dataset.health='connected';badge.textContent='CONNECTED';
   message.textContent='✓ Bunny Storage zone verified in Los Angeles. Only private read access has been tested; bulk uploading is not enabled yet.';
  }else{
   badge.dataset.health='not-configured';badge.textContent='NOT CONNECTED';
   message.textContent=result?.detail||'Save BLACKCELL_BUNNY_STORAGE_ACCESS_KEY as a Supabase Edge Function Secret, then check again.';
  }
 }catch(e){
  badge.dataset.health='error';badge.textContent='CONNECTION ERROR';
  message.textContent=String(e?.message||e||'Unknown error').slice(0,300);
 }finally{button.disabled=false}
}
async function checkBackblaze(){
 const button=$('bcB2Check'),badge=$('bcB2Status'),message=$('bcB2Message');
 if(!button||!badge||!message)return;
 button.disabled=true;
 badge.dataset.health='checking';
 badge.textContent='CHECKING';
 message.textContent='Verifying your private Backblaze connection through a secured Supabase Edge Function…';
 try{
  const {data,error}=await client.functions.invoke('blackcell-b2-storage',{body:{action:'status'}});
  let body=data;
  if(error){
   try{body=await error.context?.json?.()}catch(_){}
   if(body?.code==='B2_NOT_CONFIGURED'){body={ok:true,connected:false,code:'B2_NOT_CONFIGURED'}}
   else throw new Error(body?.detail||error.message||'Connection check failed.');
  }
  if(body?.connected===true){
   badge.dataset.health='connected';badge.textContent='CONNECTED';
   message.textContent='Private Backblaze B2 connection verified. Your bucket is accessible through the restricted staging prefix. The media upload/import pipeline is a separate step.';
  }else{
   badge.dataset.health='not-configured';badge.textContent='NOT CONNECTED';
   message.textContent=body?.detail||'Enter all four BLACKCELL_B2_* secrets in Supabase Edge Function Secrets, then check again.';
  }
 }catch(e){
  badge.dataset.health='error';badge.textContent='CONNECTION ERROR';
  message.textContent=String(e?.message||e||'Unrecognized error').slice(0,260);
 }finally{button.disabled=false}
}

let chosenIcloudPhoto=null,icloudPreviewUrl="";
function setupIcloudTest(){
 const picker=$('bcIcloudFile'),choose=$('bcIcloudChoose'),upload=$('bcIcloudImport');
 const status=$('bcIcloudStatus'),preview=$('bcIcloudPreview'),thumb=$('bcIcloudThumb');
 const label=$('bcIcloudName'),size=$('bcIcloudSize');
 if(!picker||!choose||!upload||!status)return;
 // Synchronous .click() keeps iOS Safari's required user gesture.
 choose.addEventListener('click',()=>{if(upload.dataset.busy==='true')return;picker.click()});
 picker.addEventListener('change',()=>{
  const file=picker.files?.[0]||null;
  chosenIcloudPhoto=null;upload.disabled=true;delete status.dataset.result;
  if(icloudPreviewUrl){URL.revokeObjectURL(icloudPreviewUrl);icloudPreviewUrl=""}
  preview.hidden=true;thumb.hidden=true;thumb.removeAttribute('src');
  if(!file){status.textContent='No photo selected yet.';return}
  if(!file.size||file.size>8*1024*1024){
   status.textContent='Choose a photo smaller than 8 MB for this first test.';
   picker.value='';return;
  }
  chosenIcloudPhoto=file;
  label.textContent=file.name||'Selected photo';
  size.textContent=(file.size/1024/1024).toFixed(2)+' MB · Private staging only';
  preview.hidden=false;
  icloudPreviewUrl=URL.createObjectURL(file);
  thumb.src=icloudPreviewUrl;thumb.hidden=false;
  thumb.onerror=()=>{thumb.hidden=true};
  upload.disabled=false;
  status.textContent='Ready to send one photo to your private Backblaze bucket.';
 });
 upload.addEventListener('click',async()=>{
  if(!chosenIcloudPhoto||upload.disabled)return;
  const file=chosenIcloudPhoto;
  upload.disabled=true;upload.dataset.busy='true';choose.disabled=true;
  upload.textContent='UPLOADING & VERIFYING…';
  status.dataset.result='pending';
  status.textContent='Sending the selected photo securely to Backblaze; verifying the stored file…';
  try{
   const payload=new FormData();
   payload.append('action','import-photo-test');
   payload.append('photo',file,file.name||'icloud-photo');
   const {data,error}=await client.functions.invoke('blackcell-b2-storage',{body:payload});
   let body=data;
   if(error){
    try{body=await error.context?.json?.()}catch(_){}
    throw new Error(body?.detail||error.message||'The private import failed.');
   }
   if(!body?.ok||!body?.stored)throw new Error(body?.detail||'Backblaze did not verify the photo.');
   status.dataset.result='success';
   status.textContent=body.duplicate?
    '✓ VERIFIED — This exact photo already exists in Backblaze private staging; no duplicate was saved.':
    '✓ VERIFIED — The photo arrived in Backblaze private staging and its file size was checked. It is not published.';
   toast('BLACKCELL: one iCloud photo verified in private Backblaze staging.');
  }catch(e){
   status.dataset.result='error';
   status.textContent='IMPORT FAILED — '+String(e?.message||e||'Connection error').slice(0,230);
  }finally{
   upload.disabled=!chosenIcloudPhoto;upload.dataset.busy='false';
   choose.disabled=false;upload.textContent='↑ IMPORT ONE PHOTO';
  }
 });
}

async function boot(){
 try{
  const auth=await validOwner();
  if(!auth){
   lock('Your Level 7 owner credentials and current corporate security verification are required. Sign in to Administration first.');
   return;
  }
  state.user=auth.user;state.member=auth.member;
  countries();
  await loadAssets();
  $('bcMediaAdminApp').hidden=false;$('bcAdminGate').hidden=true;
  processor=createBlackcellMediaProcessor({client,bucket,state,refresh:loadAssets,mediaUrl:()=>'',toast,openAIReview:makePreview});
  processor.setup();
  setupIcloudTest();
  setupBlackcellBulk({client,toast});
  $('bcBunnyCheck').addEventListener('click',()=>void checkBunny());
  void checkBunny();
  $('bcB2Check').addEventListener('click',()=>void checkBackblaze());
  void checkBackblaze();
  document.addEventListener('bc:media-updated',()=>void refreshCounts().catch(()=>{}));
  // Require a valid corporate code session throughout an active admin view.
  const recheck=async()=>{
   if(verifying||expires||document.hidden)return;
   verifying=true;
   try{
    const check=await validOwner();
    if(!check||check.user.id!==state.user.id)lock('Your executive session expired. Return to Administration and sign in again.');
   }catch(_){lock('Could not confirm current corporate authorization. Return to Administration.')}
   finally{verifying=false}
  };
  window.addEventListener('focus',()=>void recheck());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void recheck()});
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')lock('Your corporate session has ended.')});
  setInterval(()=>void recheck(),60000);
 }catch(e){lock('Media Administration could not initialize: '+(e?.message||'Unknown error'))}
}
void boot();
