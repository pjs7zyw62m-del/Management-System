/* BLACKCELL OS wallpaper preferences. User uploads are not sent until Apply. */
export function mountWallpaperControls(panel,{api,prefs,el,btn,row}){
 const report=el('p','bc-wallpaper-feedback','Choose a BLACKCELL wallpaper or upload your own.');
 report.setAttribute('role','status');report.setAttribute('aria-live','polite');
 const current=()=>api.preferences();
 function inform(message,ok=true){report.textContent=message;report.style.color=ok?'#b2d5c2':'#ff9cad'}
 function choice(label,value,options,detail){
  const select=el('select','bc-settings-button');
  select.setAttribute('aria-label',label);
  for(const [v,title] of options){const opt=el('option','',title);opt.value=v;select.append(opt)}
  select.value=String(value);
  row(panel,label,select,detail);
  return select;
 }
 const cards=el('div','bc-wallpaper-gallery');cards.setAttribute('role','group');cards.setAttribute('aria-label','BLACKCELL wallpapers');
 for(const [id,title,note] of [
  ['midnight','Midnight Silk','Pitch black · macOS glass'],
  ['obsidian','Obsidian Arc','BLACKCELL crimson'],
  ['skyline','Cinematic Skyline','Classic BLACKCELL']]){
  const b=btn(title,()=>{
   const result=api.setPreference('wallpaper',id);
   for(const x of cards.querySelectorAll('button'))x.setAttribute('aria-pressed',String(x.dataset.wallpaper===id));
   inform(result.message,result.ok!==false);
  },'bc-wallpaper-card');
  b.dataset.wallpaper=id;b.setAttribute('aria-pressed',String(prefs.wallpaper===id));
  const label=el('strong','',title),small=el('small','',note);b.replaceChildren(label,small);cards.append(b);
 }
 panel.append(cards);
 const mode=choice('Wallpaper devices',prefs.wallpaperMode||'all',[['all','Same on every device'],['separate','Different on phone, tablet and desktop']],
  'Choose one wallpaper everywhere or personalize each device independently.');
 mode.onchange=()=>{const r=api.setPreference('wallpaperMode',mode.value);inform(r.message,r.ok!==false)};
 const dest=choice('Apply personal image to',prefs.wallpaperMode==='separate'?api.wallpaper.device():'all',
  [['all','All devices'],['phone','iPhone / Phone'],['tablet','iPad / Tablet'],['desktop','Mac / Desktop']],
  'A device-specific image is private to your account, not published to the network.');
 const fit=choice('Image framing',prefs.wallpaperFit||'cover',
  [['cover','Fill screen'],['contain','Fit whole image'],['center','Original size / center']],
  'Fit shows the whole photo. Fill avoids empty edges.');
 fit.onchange=()=>{const r=api.setPreference('wallpaperFit',fit.value);inform(r.message,r.ok!==false)};
 const position=choice('Image position',prefs.wallpaperPosition||'center',
  [['center','Centered'],['top','Top'],['bottom','Bottom']],
  'Choose where the photo is anchored.');
 position.onchange=()=>{const r=api.setPreference('wallpaperPosition',position.value);inform(r.message,r.ok!==false)};
 function slider(label,key,max,unit){
  const input=el('input','bc-wallpaper-slider');input.type='range';input.min='0';input.max=String(max);input.step='1';input.value=String(prefs[key]??0);
  input.setAttribute('aria-label',label);
  const currentValue=el('span','bc-settings-value',String(prefs[key]??0)+unit);
  const wrap=el('div','bc-wallpaper-slider-wrap');wrap.append(input,currentValue);
  input.oninput=()=>{currentValue.textContent=input.value+unit;api.setPreference(key,Number(input.value))};
  row(panel,label,wrap);
 }
 slider('Wallpaper dimming','wallpaperDim',75,'%');
 slider('Wallpaper blur','wallpaperBlur',14,'px');
 const input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif';input.hidden=true;input.setAttribute('aria-label','Choose your personal wallpaper');
 const previewBox=el('div','bc-wallpaper-upload-preview');previewBox.hidden=true;
 const previewImage=el('img');previewImage.alt='Preview of your selected wallpaper';
 const details=el('p','bc-settings-muted');
 const actions=el('div','bc-wallpaper-preview-actions');
 let previewUrl='',selected=null;
 function clearPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';selected=null;input.value='';previewBox.hidden=true;previewImage.removeAttribute('src')}
 const apply=btn('Apply Wallpaper',async()=>{
  if(!selected)return;
  apply.disabled=true;cancel.disabled=true;inform('Saving your private wallpaper…');
  const result=await api.wallpaper.upload(selected,dest.value);
  inform(result.message,result.ok!==false);
  if(result.ok){clearPreview();for(const b of cards.querySelectorAll('button'))b.setAttribute('aria-pressed','false')}
  apply.disabled=false;cancel.disabled=false;
 });
 const cancel=btn('Cancel',clearPreview,'bc-settings-button');
 actions.append(apply,cancel);previewBox.append(previewImage,details,actions);
 input.onchange=()=>{
  clearPreview();
  const file=input.files?.[0];if(!file)return;
  if(!api.wallpaper.validImage(file)){inform('Use a JPG, PNG, WebP, GIF, AVIF or supported HEIC image under 8 MB.',false);return}
  selected=file;previewUrl=URL.createObjectURL(file);previewImage.src=previewUrl;
  details.textContent=file.name+' · '+(file.size/1048576).toFixed(1)+' MB · '+(dest.selectedOptions[0]?.textContent||'');
  previewBox.hidden=false;inform('Preview your picture, then select Apply Wallpaper.');
 };
 const pick=btn('Choose Photo…',()=>input.click(),'bc-settings-button bc-wallpaper-pick');
 pick.disabled=api.preview;
 const upload=el('div','bc-wallpaper-upload');upload.append(pick,input,previewBox);
 panel.append(upload);
 const recent=Array.isArray(prefs.wallpaperHistory)?prefs.wallpaperHistory.slice(0,6):[];
 if(recent.length){
  const recentTitle=el('h3','bc-wallpaper-recent-title','Recent personal wallpapers');
  const recentGrid=el('div','bc-wallpaper-recents');
  for(const r of recent){
   const b=btn(r.name||'Previous wallpaper',()=>{
    const result=api.wallpaper.useRecent(r.path,dest.value);
    inform(result.message,result.ok!==false);
   },'bc-wallpaper-recent');
   b.title=(r.name||'Wallpaper')+' · '+(r.target||'all');
   recentGrid.append(b);
  }
  panel.append(recentTitle,recentGrid);
 }
 const reset=btn('Restore Midnight Silk',()=>{
  const result=api.setPreference('wallpaper','midnight');inform(result.message,result.ok!==false);
  for(const b of cards.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.wallpaper==='midnight'));
 });
 panel.append(reset,report);
 // Closing Settings replaces the panel; release temporary previews on page teardown.
 const obs=new MutationObserver(()=>{if(!panel.isConnected){clearPreview();obs.disconnect()}});
 obs.observe(panel.closest('.os-window')||panel.parentNode,{childList:true,subtree:true});
}
