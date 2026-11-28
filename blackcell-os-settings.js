/* BLACKCELL OS – real account settings and storage management. */
import {mountWallpaperControls} from './blackcell-os-wallpaper-settings.js?v=1';
export function mountSettings(host,api){
 const el=(tag,cls,t)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(t!==undefined)n.textContent=t;return n};
 const btn=(t,fn,cls='bc-settings-button')=>{const n=el('button',cls,t);n.type='button';n.onclick=fn;return n};
 host.classList.add('bc-settings');const navigation=el('nav','bc-settings-nav'),body=el('main','bc-settings-content');navigation.setAttribute('aria-label','Settings sections');host.append(navigation,body);
 const groups=[['general','General','⚙'],['account','Account','◉'],['storage','Storage','▱'],['apps','Applications','▦'],['appearance','Appearance','◐'],['sound','Sound','♪'],['security','Privacy & Security','◇'],['updates','Software Update','↻'],['about','About','ⓘ']];
 let section=groups.some(x=>x[0]===api.initialSection)?api.initialSection:'general',closed=false,generation=0,storageData=null,breakdown=null,storageError='',loading=false,buttons=new Map();
 navigation.append(el('div','bc-settings-brand','SYSTEM SETTINGS'));
 for(const [id,label,icon] of groups){const b=btn('','', 'bc-settings-navbtn');b.append(el('span','bc-settings-glyph',icon),el('span','',label));b.onclick=event=>{event.preventDefault();select(id)};navigation.append(b);buttons.set(id,b)}
 function panel(title,subtitle){const p=el('section','bc-settings-panel');if(title)p.append(el('h2','',title));if(subtitle)p.append(el('p','bc-settings-muted',subtitle));body.append(p);return p}
 function row(p,label,value,detail){const r=el('div','bc-settings-row'),copy=el('div','bc-settings-copy');copy.append(el('strong','',label));if(detail)copy.append(el('small','',detail));r.append(copy);if(value instanceof Node)r.append(value);else r.append(el('span','bc-settings-value',String(value??'—')));p.append(r);return r}
 const n=x=>Math.max(0,Number(x)||0);
 function bytes(x){const a=n(x);return a>=1073741824?(a/1073741824).toFixed(2).replace(/\.?0+$/,'')+' GB':a>=1048576?(a/1048576).toFixed(1).replace(/\.0$/,'')+' MB':a>=1024?(a/1024).toFixed(1).replace(/\.0$/,'')+' KB':a+' B'}
 function select(id){
  if(closed||!api.alive()||!groups.some(g=>g[0]===id))return;
  section=id;body.scrollTop=0;
  // Render the requested section before saving its location. A failed
  // workspace persistence operation must never swallow navigation.
  render();try{api.onSection?.(id)}catch(_){}
  if(id==='storage')void loadStorage()
 }
 function refresh(){if(closed)return;render();if(section==='storage')void loadStorage()}
 async function rpc(action){const cfg=window.BLACKCELL_CORP_CONFIG;const {data,error}=await api.client.auth.getSession();if(error||!data?.session?.access_token||!cfg?.url||!cfg?.publishableKey)throw Error('Session unavailable');const r=await fetch(cfg.url+'/functions/v1/blackcell-os-private-drive?action='+action,{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:cfg.publishableKey,'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(35000)});const out=await r.json();if(!r.ok||!out.ok)throw Error(out.error||'Storage unavailable');return out}
 async function loadStorage(){if(closed||loading||!api.alive())return;loading=true;storageError='';if(section==='storage')render();const seq=++generation;try{if(api.preview){storageData={usedBytes:0,quotaBytes:2147483648,maxBytes:268435456,fileCount:0,reservedBytes:0,legacyBytes:0};breakdown={photos:0,videos:0,documents:0,other:0}}else{const [usage,list]=await Promise.all([rpc('usage'),rpc('list')]);if(closed||seq!==generation||!api.alive())return;storageData=usage;breakdown={photos:0,videos:0,documents:0,other:0};for(const file of list.rows||[]){if(file.state!=='ready')continue;const ext=String(file.path).split('.').at(-1).toLowerCase();const type=/^(jpe?g|png|gif|webp|heic|heif|avif|tiff?|bmp)$/.test(ext)?'photos':/^(mp4|mov|m4v|webm|avi|mkv|3gp)$/.test(ext)?'videos':/^(pdf|txt|docx?|xlsx?|pptx?|csv|rtf|pages|numbers|key|md|json)$/.test(ext)?'documents':'other';breakdown[type]+=n(file.size_bytes)}}}catch(e){if(!closed&&seq===generation){storageData=null;breakdown=null;storageError='Storage usage is unavailable. Refresh to retry.'}}finally{loading=false;if(!closed&&seq===generation&&section==='storage'&&api.alive())render()}}
 function render(){
  if(closed||!api.alive())return;const previous=body.scrollTop;body.replaceChildren();for(const [id,b] of buttons){b.classList.toggle('selected',id===section);b.setAttribute('aria-current',id===section?'page':'false')}
  const title=groups.find(g=>g[0]===section)[1],head=el('header','bc-settings-header');head.append(el('div','bc-settings-kicker','BLACKCELL OS / SYSTEM SETTINGS'),el('h1','',title));body.append(head);
  const account=api.account(),prefs=api.preferences();
  if(section==='general'){
   const p=panel('Your BLACKCELL OS','Manage your personal workspace.');row(p,'Storage',btn('Manage ›',()=>select('storage')));row(p,'Applications',btn('Manage ›',()=>select('apps')));row(p,'Appearance',btn('Customize ›',()=>select('appearance')));row(p,'Sound',btn('Adjust ›',()=>select('sound')));row(p,'Corporate account',btn('View ›',()=>select('account')));row(p,'Privacy & security',btn('View ›',()=>select('security')));row(p,'Software Update',btn('Check ›',()=>select('updates')),'Check for published BLACKCELL OS releases.');
  }else if(section==='account'){
   const p=panel('Corporate identity','Your verified identity and access level.');row(p,'Display name',account.name);row(p,'Account',account.username);row(p,'Access',account.access);row(p,'Clearance',account.clearance);
   const q=panel('Profile');row(q,'Personal profile',btn('Open profile ›',()=>api.openOrStore('person')),'Manage your profile using the existing profile app.');
  }else if(section==='storage'){
   const p=panel('BLACKCELL Storage',api.preview?'Design preview · No account data':'Private cloud drive · Account-specific usage');
   if(!storageData){p.append(el('p','bc-settings-muted',loading?'Loading storage usage…':storageError||'Storage usage not loaded.'))}
   else{
    const used=n(storageData.usedBytes),reserved=n(storageData.reservedBytes),quota=n(storageData.quotaBytes),free=Math.max(0,quota-used-reserved);p.append(el('div','bc-settings-storage-total',bytes(used)+' of '+bytes(quota)+' used'));const track=el('div','bc-settings-storage-bar');track.setAttribute('role','img');track.setAttribute('aria-label',bytes(used)+' stored, '+bytes(reserved)+' reserved, '+bytes(free)+' available');const values=breakdown?[['Photos',breakdown.photos,'#efa654'],['Videos',breakdown.videos,'#538bda'],['Documents',breakdown.documents,'#a577d1'],['Other files',breakdown.other,'#9c9eaf']]:[['Private files',used,'#d94c62']];
    for(const [label,value,color] of [...values,['Reserved uploads',reserved,'#b88654']]){if(value<=0)continue;const segment=el('span');segment.style.width=(quota?Math.min(100,value/quota*100):0)+'%';segment.style.background=color;track.append(segment)}
    p.append(track);for(const [label,value,color] of values){const r=row(p,label,bytes(value));const dot=el('span','bc-settings-dot');dot.style.background=color;r.querySelector('.bc-settings-copy').prepend(dot)}
    row(p,'Available',bytes(free));row(p,'Upload limit',bytes(storageData.maxBytes));row(p,'Private files',String(n(storageData.fileCount)));if(reserved)row(p,'Reserved uploads',bytes(reserved),'Incomplete uploads count toward your allowance.');if(n(storageData.legacyBytes))row(p,'Legacy storage',bytes(storageData.legacyBytes),'Older private files, tracked separately.');
   }
   p.append(btn(loading?'Refreshing…':'Refresh storage',()=>void loadStorage()));const q=panel('Manage storage');row(q,'Files',btn('Open Files ›',()=>api.openOrStore('files')));row(q,'Photos and videos',btn('Open Photos ›',()=>api.openOrStore('personalphotos')));row(q,'Applications',btn('View apps ›',()=>select('apps')),'Installed web apps do not reserve native package space.');
  }else if(section==='apps'){
   const apps=api.catalog(),installed=apps.filter(a=>a.installed),p=panel('Installed applications',api.preview?'Design preview':(installed.length+1)+' installed, including the App Store');
   row(p,'App Store','Protected','Always installed.');for(const a of installed){const action=btn('Open',()=>api.openOrStore(a.id));row(p,a.title,action,'Installed · Cloud application')}
   const q=panel('App management','Reinstall or uninstall available apps. Saved account data is not removed.');q.append(btn('Manage in App Store ›',()=>api.openStore('installed')));
  }else if(section==='appearance'){
   const p=panel('Wallpaper & appearance','Make BLACKCELL feel like your own device. Preferences sync across your devices where cloud workspace sync is available.');const savedStatus=el('p','bc-settings-muted');savedStatus.setAttribute('role','status');savedStatus.setAttribute('aria-live','polite');for(const [key,label,detail] of [['reduceMotion','Reduce motion','Disable decorative interface transitions. Install and uninstall timing stays unchanged.'],['dockLabels','Dock labels','Show labels beneath dock icons.'],['dockAutoHide','Automatically hide the Dock','Dock hides when idle. On iPhone tap Show Dock or swipe up from the bottom; on iPad and desktop reveal from the bottom edge. Turn off to keep it visible.']]){const toggle=el('input','bc-settings-toggle');toggle.type='checkbox';toggle.checked=!!prefs[key];toggle.setAttribute('aria-label',label);toggle.onchange=()=>{const result=api.setPreference(key,toggle.checked);toggle.checked=!!api.preferences()[key];savedStatus.textContent=result?.message||'Preference changed.';savedStatus.style.color=result?.ok===false?'#ef9aa8':'#8bd6ad'};const control=row(p,label,toggle,detail);control.querySelector('.bc-settings-copy').addEventListener('click',()=>toggle.click())}const clear=el('input','bc-settings-toggle');clear.type='checkbox';clear.checked=prefs.desktopClean!==false;
   clear.setAttribute('aria-label','Clean macOS-style desktop');
   clear.onchange=()=>{const r=api.setPreference('desktopClean',clear.checked);clear.checked=api.preferences().desktopClean!==false;savedStatus.textContent=r.message||'Desktop appearance updated.'};
   row(p,'Clean macOS-style desktop',clear,'Show a quiet wallpaper-first desktop; open apps from the Dock, search or Applications. Disable to restore the full classic dashboard.');
   const dockPosition=el('select','bc-settings-button');dockPosition.setAttribute('aria-label','Dock position');
   for(const [value,label] of [['bottom','Bottom'],['left','Left side'],['right','Right side']]){const o=el('option','',label);o.value=value;dockPosition.append(o)}
   dockPosition.value=['bottom','left','right'].includes(prefs.dockPosition)?prefs.dockPosition:'bottom';
   dockPosition.onchange=()=>{
    const r=api.setPreference('dockPosition',dockPosition.value);dockPosition.value=api.preferences().dockPosition||'bottom';
    savedStatus.textContent=r.message||'Dock position updated.';
   };
   row(p,'Dock position',dockPosition,'Place the Dock at the bottom, left or right on desktop and tablet. Phones keep the bottom Dock.');
      row(p,'Glass appearance','BLACKCELL Midnight','Dark translucent windows, a floating Dock, and silver typography.');
   p.append(savedStatus);
   const wallpapers=panel('Wallpaper Studio','Choose a BLACKCELL wallpaper or use your own photograph. Pictures remain private to your account.');
   mountWallpaperControls(wallpapers,{api,prefs,el,btn,row});
   }else if(section==='sound'){
   const system=window.BLACKCELL_SYSTEM_SOUNDS;
   const p=panel('System sounds','Original BLACKCELL tones inspired by the restraint of a desktop operating system. These preferences apply to this browser and do not change media playback volume.');
   const current=system?.preferences?.()||{enabled:false,volume:.35,available:false};
   const toggle=el('input','bc-settings-toggle');toggle.type='checkbox';toggle.checked=current.enabled;toggle.disabled=!current.available;toggle.setAttribute('aria-label','Enable system sounds');
   const volume=el('input','bc-settings-button');volume.type='range';volume.min='0';volume.max='100';volume.step='5';volume.value=String(Math.round(current.volume*100));volume.setAttribute('aria-label','System sound volume');volume.disabled=!current.available;
   const notice=el('p','bc-settings-muted','');notice.setAttribute('role','status');
   const playbackButtons=[];let playbackSerial=0;
   const stop=btn('Stop playback',()=>{++playbackSerial;system?.stop?.();notice.textContent='Playback stopped.';for(const b of playbackButtons)b.disabled=!system?.preferences?.().enabled;stop.disabled=true});
   stop.disabled=true;
   function previewButton(id,label){
    const button=btn('Play',()=>{});button.setAttribute('aria-label','Play '+label);button.disabled=!current.available||!current.enabled;
    playbackButtons.push(button);
    button.onclick=async event=>{
     const serial=++playbackSerial;stop.disabled=false;notice.textContent='Playing '+label+'…';
     try{
      const result=await system?.preview?.(event,id);
      if(serial!==playbackSerial)return;
      notice.textContent=result?.ok?'Playback completed: '+label+'.':({muted:'Enable system sounds and raise volume above zero.',announcement:'Startup announcement is still playing. Try again when it finishes.',blocked:'Browser denied audio playback. Tap Play again.',timeout:'Playback did not finish. Try again.',busy:'Another sound is playing.',gesture:'Tap Play directly.',stopped:'Playback stopped.'}[result?.reason]||'The audio player could not play this sample.');
     }catch(_){if(serial===playbackSerial)notice.textContent='Audio playback failed. Try again.'}
     finally{if(serial===playbackSerial)stop.disabled=true}
    };return button;
   }
   toggle.onchange=()=>{const prefs=system.setPreference({enabled:toggle.checked});for(const b of playbackButtons)b.disabled=!prefs.enabled;if(!prefs.enabled){++playbackSerial;stop.disabled=true}notice.textContent=prefs.enabled?'System sounds enabled.':'System sounds muted.'};
   volume.oninput=()=>{system.setPreference({volume:Number(volume.value)/100});notice.textContent='System sound volume: '+volume.value+'%'};
   row(p,'System sounds',toggle,'Startup, opening apps, window controls, security lock, incoming iMessage and system notices.');
   row(p,'Volume',volume,'Controls system sound previews, not music or video playback.');
   row(p,'Playback',stop,'Choose any sound below to hear it. Only one preview plays at a time.');
   if(!current.available)notice.textContent='Audio playback is not available in this browser.';
   p.append(notice);
   const library=system?.library?.()||[{id:'test',label:'Classic sample',group:'System'}];
   for(const group of ['System','New tones','Voice recordings']){
    const entries=library.filter(x=>x.group===group);if(!entries.length)continue;
    const collection=panel(group,group==='Voice recordings'?'Original BLACKCELL sign-in and startup audio files. Previewing them does not initiate authentication.':group==='New tones'?'Original BLACKCELL sound designs for auditioning.':'Sounds used by BLACKCELL OS.');
    for(const item of entries)row(collection,item.label,previewButton(item.id,item.label));
   }
   }else if(section==='security'){
   const p=panel('Session & screen lock','Choose your preferred BLACKCELL OS idle-lock interval. Your account setting synchronizes across devices where cloud preferences are available.');row(p,'Status',api.preview?'Preview':'Verified');row(p,'Corporate session inactivity limit','60 minutes','The corporate session signs out after 60 minutes of inactivity. This is separate from the adjustable screen lock.');const auto=el('select','bc-settings-button');auto.setAttribute('aria-label','Automatically lock workspace');for(const minutes of [1,5,10,15,30,60,0]){const o=el('option','',minutes===0?'Never':minutes+' minute'+(minutes===1?'':'s'));o.value=String(minutes);auto.append(o)}auto.value=String(prefs.autoLockMinutes??5);const saved=el('p','bc-settings-muted');saved.setAttribute('role','status');auto.onchange=()=>{const result=api.setPreference('autoLockMinutes',Number(auto.value));auto.value=String(api.preferences().autoLockMinutes);saved.textContent=result?.message||'Updated.'};row(p,'Lock workspace after',auto,'Choose 30 or 60 minutes, or another interval. Never disables the workspace lock only; corporate sign-out at 60 minutes still applies.');row(p,'Lock Screen',btn('Lock',api.lock),'Require your account password to resume the desktop.');row(p,'Log Off',btn('Log Off',api.logOff),'Return to OS login while keeping the corporate session and open apps.');row(p,'Restart',btn('Restart',api.restart),'Reload the desktop and restore saved window layout.');p.append(saved);row(p,'Private storage','Encrypted');row(p,'Sign out',btn('Sign out',api.signOut,'bc-settings-button danger'),'End the current corporate session.');if(api.preview){const buttons=p.querySelectorAll('button');if(buttons.length)buttons[buttons.length-1].disabled=true;}
  }else if(section==='updates'){
    const p=panel('BLACKCELL OS Software Update','Published releases update the web-app interface and catalog. Your account, photos, videos and files are preserved.');
    const notice=el('p','bc-settings-muted');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
    const auto=el('input','bc-settings-autoupdate');
    auto.type='checkbox';auto.checked=window.BLACKCELL_LIVE_UPDATE?.autoEnabled?.()??true;
    auto.setAttribute('aria-label','Automatically save the OS workspace and install updates when idle');
    auto.onchange=()=>{
      auto.checked=window.BLACKCELL_LIVE_UPDATE?.setAutoEnabled?.(auto.checked)??auto.checked;
      notice.textContent=auto.checked?'Automatic updates enabled. BLACKCELL installs when idle and saves your workspace first.':'Automatic updates disabled. You can still install updates manually.';
    };
    const check=btn('Check for updates',async()=>{
      check.disabled=true;notice.textContent='Checking the published release…';
      try{
       const result=await window.BLACKCELL_LIVE_UPDATE?.show?.();
       notice.textContent=result?.available
        ?result.automatic?(result.blockedBy?'An update is waiting safely: '+result.blockedBy:'An update will install automatically when the workspace is idle.'):'An update is available. Choose Update Now.'
        :'Your BLACKCELL OS is up to date.';
      }catch(_){notice.textContent='Unable to check for updates. Retry.'}
      finally{check.disabled=false}
    });
    row(p,'Platform','BLACKCELL OS web app','Updates are for the BLACKCELL interface, not Apple iOS.');
    row(p,'Automatic updates',auto,'On by default. Saves desktop positions, open windows and settings before updating without extra prompts. Real uploads and unsaved app forms are not interrupted.');
    const build=document.querySelector('meta[name="blackcell-os-client-build"]')?.content||'Legacy interface';
    row(p,'Installed interface build',build,'This is the exact interface code loaded on this device. If it differs from your computer, the device may still be showing an older cached version.');
    row(p,'Published release',check,'Check for a new version.');
    p.append(notice);
   }else{const p=panel('BLACKCELL OS','Obsidian Edition');row(p,'Platform','Cloud workspace');row(p,'Version',document.querySelector('meta[name="blackcell-os-client-build"]')?.content||'Obsidian');row(p,'Storage','BLACKCELL Storage');p.append(el('p','bc-settings-motto','CONTROL IS EVERYTHING.'))}
  body.scrollTop=previous;
 }
 const change=()=>{if(section==='storage')void loadStorage()};window.addEventListener('bc-private-files-changed',change);try{api.onSection?.(section)}catch(_){}render();if(section==='storage')void loadStorage();
 return {select,refresh:()=>{if(!closed&&section==='apps')render()},dispose(){closed=true;generation++;window.removeEventListener('bc-private-files-changed',change)}};
}
