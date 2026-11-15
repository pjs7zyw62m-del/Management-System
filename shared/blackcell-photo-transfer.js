/* Shared control for the approved Military Library photo saving action. */
import {createPrivateDrive,PRIVATE_FILE_LIMIT} from './blackcell-private-drive.js?v=1';
import {uploadPrivateFile,mediaType,privateUploadError} from './blackcell-private-media.js?v=8-transfer';
import {corporateAuthorize} from './corp-auth.js?v=20261114-transport-classification';
const transferUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function transferName(asset){
 const raw=String(asset.filename||'').normalize('NFKD').replace(/[^a-zA-Z0-9_. -]/g,'_').replace(/^\.+/,'');
 const ext=raw.split('.').pop().toLowerCase();
 if(!['jpg','jpeg','png','webp','gif','heic','heif'].includes(ext)||!mediaType(raw))throw Error('Unsupported original photo format.');
 const base=raw.slice(0,-ext.length-1).slice(0,48).trim()||'photo';
 return 'MAF-'+asset.id+'-'+base+'.'+ext;
}

export function attachPhotoTransfer(button,{client,getPhoto,notify}){
 let busy=false;
 function sync(){const a=getPhoto();button.hidden=!a||a.kind==='video'||a.review_status==='pending'||a.adult_restricted===true;button.disabled=busy||button.hidden;}
 button.onclick=async()=>{
  const a=getPhoto();if(busy||!a||!transferUUID.test(a.id)||a.kind==='video')return;
  const report=msg=>{if(getPhoto()?.id===a.id)notify(msg)};
  busy=true;button.disabled=true;button.dataset.busy='true';button.textContent='TRANSFERRING…';
  let release;try{release=window.top.BLACKCELL_LIVE_UPDATE?.hold('Transfer to private Photos',window)}catch(_){}
  try{
   const auth=await corporateAuthorize(client,{classifyTransport:true});
   if(!auth.ok)throw Error('Verify corporate access.');
   const uid=auth.user.id;
   const check=await client.rpc(auth.member.role==='owner'?'corp_code_status':'corp_employee_code_status');
   if(check.error||check.data?.verified!==true)throw Error('Corporate verification required.');
   const source=await client.from('corp_social_assets').select('id,owner_id,filename,storage_path,bytes').eq('id',a.id).eq('review_status','approved').eq('adult_restricted',false).eq('kind','photo').in('purpose',['library','post']).maybeSingle();
   if(source.error||!source.data?.storage_path)throw Error('This photograph is not eligible for saving.');
   const record=source.data,name=transferName(record),storage=createPrivateDrive(client,uid),folder=uid+'/Photos',path=folder+'/'+name;
   const exists=async()=>{storage.invalidate?.();const result=await storage.list(folder,{search:'MAF-'+record.id+'-',limit:100});if(result.error)throw result.error;return (result.data||[]).some(row=>row.id&&(!row.state||row.state==='ready')&&row.name.startsWith('MAF-'+record.id+'-'))};
   if(await exists()){report('Already in your Photos library.');return}
   if(record.owner_id!==uid&&!confirm('Confirm that you have permission to keep a private copy of this photograph.'))return;
   if(Number(record.bytes)>PRIVATE_FILE_LIMIT)throw Error('Original exceeds private Photos file limit.');
   report('Copying original photograph…');
   const original=await client.storage.from('corp-social-media').download(record.storage_path);
   if(original.error||!original.data?.size||original.data.size>PRIVATE_FILE_LIMIT)throw Error('Original photo unavailable.');
   const fresh=await corporateAuthorize(client,{classifyTransport:true});
   if(!fresh.ok||fresh.user.id!==uid)throw Error('Corporate session changed.');
   const secure=await client.rpc(fresh.member.role==='owner'?'corp_code_status':'corp_employee_code_status');
   if(secure.error||secure.data?.verified!==true)throw Error('Corporate verification required.');
   const file=new File([original.data],name,{type:mediaType(name)});
   try{await uploadPrivateFile(storage,path,file,(sent,total)=>{if(total>0)report('Saving to Photos · '+Math.min(99,Math.round(sent/total*100))+'%')})}
   catch(e){if(await exists()){report('Already in your Photos library.');return}throw e}
   report('Transferred to your private Photos library.');
   try{const channel=new BroadcastChannel('bc-private-photos-transfer');channel.postMessage({type:'photos-changed',uid});channel.close()}catch(_){}
  }catch(e){report('Transfer unavailable: '+privateUploadError(e))}
  finally{release?.();busy=false;delete button.dataset.busy;button.textContent='TRANSFER TO PHOTOS';sync()}
 };
 sync();return sync;
}

export function placePhotoTransfer(anchor,options){
 const b=document.createElement('button');b.type='button';b.textContent='TRANSFER TO PHOTOS';b.className='bc-transfer-photo';b.style.cssText='min-height:44px;background:#792237;color:white;border:1px solid #b14c5f;border-radius:8px;padding:9px 14px;font:600 11px system-ui;cursor:pointer';
 const status=document.createElement('span');status.setAttribute('role','status');status.style.cssText='font-size:12px;color:#e7cbd1;max-width:260px;overflow-wrap:anywhere';anchor.after(b,status);
 const sync=attachPhotoTransfer(b,{...options,notify:message=>{status.textContent=message;options.notify?.(message)}});
 let last;return ()=>{const id=options.getPhoto()?.id;if(id!==last){status.textContent='';last=id}sync()};
}
