/* BLACKCELL OS / member wallpaper storage. No public object URLs or service-role credentials.
   All images are private Supabase Storage blobs under the signed-in member's UID folder.
   Preferences only contain object paths and non-sensitive presentation settings. */
export function createWallpaperController({getClient,getAccount,getPrefs,setPreference,isPreview,getCloudReady,awaitSync}){
 const BUCKET='blackcell-os-wallpapers';
 const types=new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/gif','gif'],['image/avif','avif'],['image/heic','heic'],['image/heif','heif']]);
 const MAX_BYTES=8*1024*1024;
 const TARGETS=new Set(['all','phone','tablet','desktop']);
 let currentUrl=null,currentPath='',currentAccount='',sequence=0;
 const device=()=>document.documentElement.classList.contains('bc-os-phone')?'phone':document.documentElement.classList.contains('bc-os-tablet')?'tablet':'desktop';
 function safePath(path){
  const id=getAccount();
  return typeof path==='string'&&typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)
   &&path.startsWith(id+'/')&&new RegExp('^[a-f0-9-]{36}/(all|phone|tablet|desktop)/[a-f0-9-]{36}\\.(jpe?g|png|webp|gif|avif|heic|heif)$','i').test(path);
 }
 function pathFor(prefs){
  const images=prefs.wallpaperImages||{};
  return prefs.wallpaperMode==='separate'?(images[device()]||images.all||''):(images.all||'');
 }
 function revoke(){if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=null;currentPath=''}
 function setVisual(){
  const shell=document.getElementById('desktop');if(!shell)return;
  const prefs=getPrefs();
  shell.style.setProperty('--bc-wallpaper-fit',prefs.wallpaperFit==='contain'?'contain':prefs.wallpaperFit==='center'?'auto':'cover');
  shell.style.setProperty('--bc-wallpaper-position',prefs.wallpaperPosition==='top'?'center top':prefs.wallpaperPosition==='bottom'?'center bottom':'center center');
  shell.style.setProperty('--bc-wallpaper-dim',String(Math.max(0,Math.min(75,Number(prefs.wallpaperDim)||0))/100));
  shell.style.setProperty('--bc-wallpaper-blur',Math.max(0,Math.min(14,Number(prefs.wallpaperBlur)||0))+'px');
  shell.style.setProperty('--bc-user-wallpaper',currentUrl?'url("'+currentUrl+'")':'none');
 }
 async function sync(){
  const account=getAccount();
  if(currentAccount!==account){++sequence;revoke();currentAccount=account||''}
  const prefs=getPrefs(),path=pathFor(prefs);
  setVisual();
  if(prefs.wallpaper!=='custom'||!safePath(path)||isPreview()){
   if(currentUrl){++sequence;revoke();setVisual()}
   return;
  }
  if(currentUrl&&currentPath===path)return;
  const current=++sequence;
  try{
   const client=getClient();if(!client?.storage)return;
   const {data,error}=await client.storage.from(BUCKET).download(path);
   if(error||!data)throw error||new Error('Wallpaper unavailable.');
   if(current!==sequence||account!==getAccount()||getPrefs().wallpaper!=='custom'||path!==pathFor(getPrefs()))return;
   revoke();currentUrl=URL.createObjectURL(data);currentPath=path;setVisual();
  }catch(_){if(current===sequence){revoke();setVisual()}}
 }
 async function upload(file,target='all'){
  if(isPreview())return {ok:false,message:'Sign in to save a personal wallpaper.'};
  if(!TARGETS.has(target))return {ok:false,message:'Choose a valid wallpaper destination.'};
  const uid=getAccount(),client=getClient();
  if(!/^[a-f0-9-]{36}$/i.test(String(uid||''))||!client?.storage)return {ok:false,message:'Verify your BLACKCELL session first.'};
  if(!getCloudReady())return {ok:false,message:'Account synchronization is temporarily unavailable. Please retry when your BLACKCELL workspace reconnects.'};
  if(!(file instanceof Blob)||!types.has(file.type))return {ok:false,message:'Choose a JPG, PNG, WebP, GIF, AVIF or supported HEIC photograph. SVG and executable files are not supported.'};
  if(file.size<1||file.size>MAX_BYTES)return {ok:false,message:'Wallpaper images must be smaller than 8 MB.'};
  const path=uid+'/'+target+'/'+crypto.randomUUID()+'.'+types.get(file.type);
  const release=window.BLACKCELL_LIVE_UPDATE?.hold?.('Saving a personal wallpaper');
  try{
   const {error}=await client.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
   if(error)throw error;
   // Show the uploaded file immediately; metadata is synchronized in the existing account preferences.
   ++sequence;revoke();currentAccount=uid;currentUrl=URL.createObjectURL(file);currentPath=path;
   const prefs=getPrefs();
   const images={all:'',phone:'',tablet:'',desktop:'',...(prefs.wallpaperImages||{}),[target]:path};
   const history=[{path,name:String(file.name||'Wallpaper').slice(0,90),target,createdAt:Date.now()},...(prefs.wallpaperHistory||[]).filter(e=>e?.path!==path)].filter(e=>safePath(e.path)).slice(0,8);
   setPreference('wallpaperImages',images);
   setPreference('wallpaperHistory',history);
   if(target!=='all')setPreference('wallpaperMode','separate');
   setPreference('wallpaper','custom');
   await sync();
   const synchronized=await awaitSync();
   return {ok:true,message:synchronized?'Wallpaper saved privately to your account. Other devices will use it when their workspace preferences refresh.':'Wallpaper image uploaded privately, but account preferences could not synchronize. Retry in Settings on this device.'};
  }catch(e){return {ok:false,message:'Wallpaper upload failed. '+String(e?.message||'Try again.').slice(0,180)}}
  finally{release?.()}
 }
 function useRecent(path,target='all'){
  if(!safePath(path)||!TARGETS.has(target))return {ok:false,message:'Wallpaper unavailable.'};
  const p=getPrefs();
  setPreference('wallpaperImages',{all:'',phone:'',tablet:'',desktop:'',...(p.wallpaperImages||{}),[target]:path});
  if(target!=='all')setPreference('wallpaperMode','separate');
  setPreference('wallpaper','custom');
  return {ok:true,message:'Saved wallpaper restored.'};
 }
 function dispose(){++sequence;revoke();currentAccount='';setVisual()}
 return {upload,sync,dispose,useRecent,device,validImage:file=>file instanceof Blob&&types.has(file.type)&&file.size>0&&file.size<=MAX_BYTES};
}
