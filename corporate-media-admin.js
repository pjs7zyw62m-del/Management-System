/* BLACKCELL / AUTHORIZED ADMIN MEDIA PROCESSOR
 * Independent Level-7 corporate access checks; no secret keys in public code.
 * The same existing photo/video intake controller is mounted on an admin-only page.
 */
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-clearance5';
import {createBlackcellMediaProcessor} from './corporate-media-processor.js?v=20261111-adminmove1';

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
