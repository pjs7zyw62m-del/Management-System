/* Read-only bridge for the standalone owner test lab. No live room actions. */
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261114-transport-classification';
import {isBunnyPath,readBunnyPhoto} from './private-photo-ledger-bunny.js?v=20261121-redline-bunny1';
const db=corporateClient(),app=document.getElementById('developerPreviewApp'),status=document.getElementById('developerPreviewStatus'),picker=document.getElementById('developerPreviewRoom');
let uid=null,authorized=false,rooms=[],room=null,epoch=0,checking=false;
const signal=()=>window.dispatchEvent(new Event('blackcell:redline:state'));
function deny(message){authorized=false;uid=null;room=null;rooms=[];epoch++;app.hidden=true;status.hidden=false;status.textContent=message;signal()}
async function verify(){
 const auth=await corporateAuthorize(db);
 if(!auth.ok||auth.member?.role!=='owner'||Number(auth.member?.clearance_level)!==7||(uid&&auth.user.id!==uid))throw Error('Verified Level 7 owner access required.');
 const check=await db.rpc('corp_code_status');
 if(check.error||check.data?.ok!==true||check.data?.verified!==true)throw Error('Your corporate security verification expired.');
 return auth.user.id;
}
window.BLACKCELL_REDLINE_API=Object.freeze({
 snapshot:()=>({isOwner:authorized,roomId:room?.id||null}),
 async previousPreviewPhotos({onBatch=null,isCurrent=()=>true}={}){
  if(!authorized||!uid||!room)throw Error('Choose a verified REDLINE room first.');
  const selected=room,rev=epoch,account=uid;
  const allowed=()=>authorized&&epoch===rev&&uid===account&&room?.id===selected.id&&isCurrent();
  await verify();if(!allowed())throw Error('Selected room changed.');
  const result=await db.from('corp_private_photo_rooms').select('id,owner_id,member_id,current_session_started_at').eq('owner_id',uid).eq('id',selected.id).single();
  if(result.error||!result.data||!allowed())throw Error('Selected room unavailable.');
  const source=result.data;
  let query=db.from('corp_private_photo_entries').select('id,room_id,uploaded_by,image_path,created_at').eq('room_id',source.id).eq('uploaded_by',source.member_id);
  if(source.current_session_started_at)query=query.lt('created_at',source.current_session_started_at);
  const records=await query.order('created_at',{ascending:false}).limit(48);
  if(records.error||!allowed())throw Error('Previous room photos unavailable.');
  const removals=await db.rpc('corp_redline_photo_removal_status',{p_room_id:source.id});
  if(removals.error||removals.data?.ok!==true||!allowed())throw Error('Unable to verify removed photos.');
  const removed=new Set((removals.data.photos||[]).map(x=>x.photo_id));
  const rows=(records.data||[]).filter(e=>!removed.has(e.id)&&isBunnyPath(e.image_path)),blobs=[];
  for(let i=0;i<rows.length&&blobs.length<24;i+=3){
   if(!allowed())throw Error('Selected room changed.');
   const batch=await Promise.all(rows.slice(i,i+Math.min(3,24-blobs.length)).map(async e=>{try{const blob=await readBunnyPhoto(db,source.id,e.id);return allowed()&&blob instanceof Blob&&blob.size>0&&blob.size<=12*1024*1024?blob:null}catch(_){return null}}));
   if(!allowed())throw Error('Selected room changed.');
   const valid=batch.filter(Boolean);blobs.push(...valid);if(valid.length&&typeof onBatch==='function')await onBatch(valid);
  }
  if(!allowed())throw Error('Selected room changed.');return {roomId:source.id,blobs};
 }
});
picker.addEventListener('change',()=>{epoch++;room=rooms.find(x=>x.id===picker.value)||null;signal()});
async function init(){
 try{uid=await verify();const r=await db.from('corp_private_photo_rooms').select('id,title,member_id,created_at').eq('owner_id',uid).order('created_at',{ascending:false}).limit(100);
 if(r.error)throw Error('Unable to load your REDLINE rooms.');
 rooms=r.data||[];for(const row of rooms)picker.add(new Option(row.title||'REDLINE room',row.id));
 authorized=true;status.hidden=true;app.hidden=false;signal();
 }catch(e){deny(e.message)}
}
async function recheck(){if(!authorized||checking)return;checking=true;try{await verify()}catch(e){deny(e.message)}finally{checking=false}}
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')deny('Signed out. Return to BLACKCELL OS.')});
window.addEventListener('focus',()=>void recheck());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void recheck()});setInterval(()=>void recheck(),60000);
void init();
