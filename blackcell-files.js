const BUCKET='blackcell-os-files',MARK='.blackcell-folder',LIMIT=10*1024*1024;
export function mountFiles(host,{client,userId,preview,onBusy,alive}){
 host.classList.add('bc-files');
 const el=(tag,cls,txt)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=txt;return node};
 const btn=(label,fn,cls='bc-files-button')=>{const x=el('button',cls,label);x.type='button';x.onclick=fn;return x};
 const sidebar=el('aside','bc-files-sidebar'),view=el('main','bc-files-main'),toolbar=el('div','bc-files-toolbar'),bread=el('div','bc-files-bread'),items=el('div','bc-files-items'),status=el('div','bc-files-status','Opening private drive…');
 status.setAttribute('role','status');
 const search=el('input','bc-files-search');search.placeholder='Search this folder';search.type='search';search.setAttribute('aria-label','Search this folder');
 const fileInput=el('input');fileInput.type='file';fileInput.multiple=true;fileInput.hidden=true;
 const editor=el('form','bc-files-editor');editor.hidden=true;const field=el('input');field.maxLength=100;field.required=true;const save=el('button','bc-files-button primary','Save');save.type='submit';editor.append(field,save,btn('Cancel',()=>{editor.hidden=true}));
 host.append(sidebar,view);view.append(toolbar,bread,editor,items,status,fileInput);
 let path=[],entries=[],working=false,sequence=0,action=null,disposed=false,layout='grid';
 const memory=new Map([['Documents',[]],['Pictures',[]],['Downloads',[]]]);
 const storage=client?.storage.from(BUCKET);
 const root=()=>[userId,...path].join('/');
 const key=name=>root()+'/'+name;
 const report=t=>{if(!disposed)status.textContent=t};
 const clean=s=>String(s).trim().normalize('NFKD').replace(/[^\x20-\x7e]/g,'_').replace(/[\\/:*?"<>|#%]/g,'_').replace(/^\.+/,'').slice(0,100).trim();
 const usable=()=>!disposed&&alive();
 const formatSize=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':(n||0)+' B';
 const glyph=(folder)=>{const s=el('span',folder?'bc-files-folder':'bc-files-paper');s.setAttribute('aria-hidden','true');if(!folder)s.textContent='▤';return s};
 async function run(fn){if(working||!usable())return;working=true;host.setAttribute('aria-busy','true');onBusy(true);render();try{await fn()}catch(e){report(String(e?.message||'File operation failed.').slice(0,200))}finally{working=false;host.removeAttribute('aria-busy');onBusy(false);if(usable())render()}}
 function check(r){if(r.error)throw Error(r.error.message);return r.data}
 async function refresh(){const seq=++sequence;if(!usable())return;report('Loading files…');try{
  let rows=[];
  if(preview){const p=path.join('/');const folders=[...memory.keys()].filter(k=>k.startsWith(p?p+'/':'')&&k!==p).map(k=>k.slice(p?p.length+1:0)).filter(k=>!k.includes('/'));rows=folders.map(name=>({name,folder:true}));for(const f of memory.get(p)||[])rows.push(f)}
  else{if(!storage||!userId)throw Error('Corporate access required.');for(let offset=0;offset<5000;offset+=100){const page=check(await storage.list(root(),{limit:100,offset,sortBy:{column:'name',order:'asc'}}))||[];rows.push(...page.filter(x=>x.name!==MARK).map(x=>({name:x.name,folder:!x.id,size:x.metadata?.size||0,date:x.updated_at||x.created_at})));if(page.length<100)break}}
  if(seq!==sequence||!usable())return;entries=rows.sort((a,b)=>Number(b.folder)-Number(a.folder)||a.name.localeCompare(b.name));report((preview?'Design preview · ':'Private cloud drive · ')+entries.length+' item'+(entries.length===1?'':'s'));render();
 }catch(e){if(seq===sequence){entries=[];render();report('Could not load files: '+String(e.message||e).slice(0,160))}}}
 function navigate(next){if(working)return;path=next;search.value='';editor.hidden=true;void refresh()}
 function edit(label,initial,fn){if(working)return;action=fn;field.placeholder=label;field.value=initial;editor.hidden=false;field.focus();field.select()}
 editor.onsubmit=e=>{e.preventDefault();const name=clean(field.value);if(!name||name===MARK){report('Enter a valid file or folder name.');return}if(entries.some(x=>x.name===name)){report('That name already exists in this folder.');return}const fn=action;editor.hidden=true;void run(()=>fn(name))};
 const create=()=>edit('New folder name','',async name=>{if(preview){memory.set([...path,name].join('/'),[])}else check(await storage.upload(key(name)+'/'+MARK,new Blob(['folder'],{type:'text/plain'}),{upsert:false,contentType:'text/plain'}));await refresh()});
 async function download(row){if(preview){report('Preview only. Sign in to download your private files.');return}await run(async()=>{const blob=check(await storage.download(key(row.name)));if(!usable())return;const u=URL.createObjectURL(new Blob([blob],{type:'application/octet-stream'}));const a=el('a');a.href=u;a.download=row.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);report('Download requested: '+row.name)})}
 function rename(row){if(row.folder){report('Folder renaming is not available yet.');return}edit('New file name',row.name,async name=>{if(preview){row.name=name}else check(await storage.move(key(row.name),key(name)));await refresh()})}
 function remove(row){if(working)return;const panel=el('div','bc-files-delete');panel.append(el('span','',row.folder?'Delete empty folder “'+row.name+'”?':'Permanently delete “'+row.name+'”?'),btn('Cancel',()=>panel.remove()),btn('Delete',()=>{panel.remove();void run(async()=>{if(preview){if(row.folder)memory.delete([...path,row.name].join('/'));else{const a=memory.get(path.join('/'))||[];memory.set(path.join('/'),a.filter(x=>x!==row))}}else{let target=key(row.name);if(row.folder){const list=check(await storage.list(target,{limit:2}))||[];if(list.some(x=>x.name!==MARK))throw Error('Only empty folders can be deleted.');target+='/'+MARK}check(await storage.remove([target]))}await refresh()})},'bc-files-button danger'));editor.hidden=true;view.insertBefore(panel,items)}
 fileInput.onchange=()=>{const files=[...fileInput.files];fileInput.value='';if(!files.length)return;if(preview){report('Preview only. Sign in to upload your files.');return}void run(async()=>{let count=0,skipped=0;for(const f of files){if(!usable())break;const name=clean(f.name);if(!name||f.size>LIMIT||entries.some(x=>x.name===name)){skipped++;continue}report('Uploading '+f.name+'…');const r=await storage.upload(key(name),f,{upsert:false,contentType:'application/octet-stream',cacheControl:'0'});if(r.error){skipped++;continue}count++}await refresh();report(count+' uploaded'+(skipped?' · '+skipped+' skipped (duplicate, limit or upload error)':''))})};
 const upload=btn('↑ Upload',()=>fileInput.click(),'bc-files-button primary');
 const newFolder=btn('+ New folder',create),back=btn('‹',()=>navigate(path.slice(0,-1))),reload=btn('↻',()=>void refresh()),toggle=btn('▤ List',()=>{layout=layout==='grid'?'list':'grid';toggle.textContent=layout==='grid'?'▤ List':'▦ Grid';render()});
 toolbar.append(back,newFolder,upload,reload,toggle,search);
 sidebar.append(el('strong','','Files'),el('small','','LOCATIONS'),btn('☁  My Cloud Drive',()=>navigate([]),'bc-files-location selected'),el('small','','PRIVATE WORKSPACE'),el('p','','Files are visible to your own authorized account.'),el('p','','10 MB per item · cloud storage'));
 function render(){if(disposed)return;back.disabled=working||!path.length;for(const b of [upload,newFolder,reload,toggle])b.disabled=working;bread.replaceChildren(btn('My Cloud Drive',()=>navigate([]),'bc-files-crumb'));path.forEach((n,i)=>bread.append(el('span','','›'),btn(n,()=>navigate(path.slice(0,i+1)),'bc-files-crumb')));items.className='bc-files-items '+layout;items.replaceChildren();const q=search.value.toLowerCase();const filtered=entries.filter(x=>x.name.toLowerCase().includes(q));
  if(!filtered.length){items.append(el('div','bc-files-empty',q?'No matching files.':'This folder is empty. Create a folder or upload files.'));return}
  for(const row of filtered){const card=el('article','bc-files-item'),open=btn('',()=>{});open.className='bc-files-open';open.onclick=()=>row.folder?navigate([...path,row.name]):void download(row);open.append(glyph(row.folder),el('strong','',row.name),el('small','',row.folder?'Folder':formatSize(row.size)));const controls=el('div','bc-files-actions');if(!row.folder)controls.append(btn('Rename',()=>rename(row)));controls.append(btn('Delete',()=>remove(row)));for(const b of controls.querySelectorAll('button'))b.disabled=working;open.disabled=working;card.append(open,controls);items.append(card)}
 }
 search.oninput=render;void refresh();return {dispose(){disposed=true;sequence++},busy:()=>working,refresh};
}