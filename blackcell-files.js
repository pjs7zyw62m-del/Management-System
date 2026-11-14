import {createPrivateDrive} from './blackcell-private-drive.js?v=1';
import {mediaType,createPrivateViewer,PRIVATE_FILE_LIMIT,uploadPrivateFile,privateUploadError} from './blackcell-private-media.js?v=4';
const BUCKET='blackcell-os-files',MARK='.blackcell-folder',LIMIT=PRIVATE_FILE_LIMIT;
export function mountFiles(host,{client,userId,preview,onBusy,alive,initialState=null,onState=()=>{},onPin=()=>{},onFolderDrag=()=>{},onFolderDragEnd=()=>{}}){
 host.classList.add('bc-files');
 const el=(tag,cls,txt)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=txt;return node};
 const btn=(label,fn,cls='bc-files-button')=>{const x=el('button',cls,label);x.type='button';x.onclick=fn;return x};
 const sidebar=el('aside','bc-files-sidebar'),view=el('main','bc-files-main'),toolbar=el('div','bc-files-toolbar'),bread=el('div','bc-files-bread'),items=el('div','bc-files-items'),status=el('div','bc-files-status','Opening private drive…');
 status.setAttribute('role','status');
 const search=el('input','bc-files-search');search.placeholder='Search this folder';search.type='search';search.setAttribute('aria-label','Search this folder');
 const fileInput=el('input');fileInput.type='file';fileInput.multiple=true;fileInput.hidden=true;
 const editor=el('form','bc-files-editor');editor.hidden=true;const field=el('input');field.maxLength=100;field.required=true;const save=el('button','bc-files-button primary','Save');save.type='submit';editor.append(field,save,btn('Cancel',()=>{editor.hidden=true}));
 host.append(sidebar,view);view.append(toolbar,bread,editor,items,status,fileInput);
 const validPath=parts=>Array.isArray(parts)&&parts.length<=50&&parts.every(p=>typeof p==='string'&&p.length>0&&p.length<=255&&p!=='.'&&p!=='..'&&!p.includes('/')&&!p.includes('\\')&&!p.includes('\u0000'));
 let path=validPath(initialState?.path)?[...initialState.path]:[],entries=[],working=false,sequence=0,action=null,disposed=false,layout=initialState?.layout==='list'?'list':'grid';
 function persistLocation(){onState({path:[...path],layout})}
 const memory=new Map([['Documents',[]],['Pictures',[]],['Downloads',[]]]);
 const storage=createPrivateDrive(client,userId);const viewer=createPrivateViewer(host,storage,()=>usable());
 const root=()=>[userId,...path].join('/');
 const key=name=>root()+'/'+name;
 const report=t=>{if(!disposed)status.textContent=t};
 const clean=s=>String(s).trim().normalize('NFKD').replace(/[^\x20-\x7e]/g,'_').replace(/[\\/:*?"<>|#%]/g,'_').replace(/^\.+/,'').slice(0,100).trim();
 const usable=()=>!disposed&&alive();
  let selected=new Set(),dragNames=null,moveOverlay=null,moveGeneration=0,loading=false;
 const folderPath=parts=>[userId,...parts].join('/');
 const samePath=(a,b)=>a.length===b.length&&a.every((part,i)=>part===b[i]);
 function closeMove(){moveGeneration++;moveOverlay?.remove();moveOverlay=null;dragNames=null}
 function selectedFiles(){return entries.filter(r=>!r.folder&&selected.has(r.name))}
 function updateSelection(){moveSelected.disabled=working||loading||!selectedFiles().length;moveSelected.textContent='Move'+(selectedFiles().length?' ('+selectedFiles().length+')':'')+' to…';selectAll.disabled=working||loading||!entries.some(r=>!r.folder);selectAll.textContent=entries.some(r=>!r.folder&&!selected.has(r.name))?'Select files':'Clear selection';}
 async function listFolder(parts){
  if(preview){const prefix=parts.join('/'),start=prefix?prefix+'/':'';const dirs=[...memory.keys()].filter(k=>k.startsWith(start)&&k!==prefix).map(k=>k.slice(start.length)).filter(k=>!k.includes('/'));return [...dirs.map(name=>({name,folder:true})),...(memory.get(prefix)||[])]}
  const rows=[];for(let offset=0;offset<5000;offset+=100){const data=check(await storage.list(folderPath(parts),{limit:100,offset,sortBy:{column:'name',order:'asc'}}))||[];rows.push(...data.filter(x=>x.name!==MARK).map(x=>({name:x.name,folder:!x.id})));if(data.length<100)return rows}throw Error('Folder is too large to check safely. Choose another destination.');
 }
 function moveFiles(names,dest){
  if(working||loading||!usable())return;
  const source=[...path],eligible=[...new Set(names)].filter(name=>entries.some(r=>!r.folder&&r.name===name));
  if(!eligible.length||samePath(source,dest))return;
  // Same bucket, same authenticated user prefix, never overwrite and never publish.
  closeMove();void run(async()=>{
   const targetRows=await listFolder(dest),used=new Set(targetRows.map(r=>r.name));let moved=0,conflicts=0,failed=0;
   for(const name of eligible){
    if(!usable())break;
    if(used.has(name)){conflicts++;continue}
    report('Moving '+name+'…');
    try{
     if(preview){const src=source.join('/'),dst=dest.join('/'),rows=memory.get(src)||[],row=rows.find(r=>r.name===name&&!r.folder);if(!row)throw Error('Source not found');memory.set(src,rows.filter(r=>r!==row));memory.set(dst,[...(memory.get(dst)||[]),row])}
     else check(await storage.move(folderPath(source)+'/'+name,folderPath(dest)+'/'+name));
     moved++;used.add(name);selected.delete(name);
    }catch(_){failed++}
   }
   await refresh();
   if(moved&&!preview)window.dispatchEvent(new Event('bc-private-files-changed'));
   report(moved+' moved to '+(dest.join(' / ')||'My Cloud Drive')+(conflicts?' · '+conflicts+' name conflicts skipped':'')+(failed?' · '+failed+' could not be moved':'')+'.');
  })
 }
 function openMove(names){
  if(working||loading||!usable()||!names.length)return;
  closeMove();const original=[...path],overlay=el('div','bc-files-move-overlay');moveOverlay=overlay;
  const panel=el('section','bc-files-move-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Move to folder');
  const head=el('div','bc-files-move-head');head.append(el('strong','','Move '+names.length+' item'+(names.length===1?'':'s')),btn('×',closeMove));const note=el('p','','Choose a destination in your private Cloud Drive. Existing files will never be replaced.');
  const crumb=el('div','bc-files-move-crumb'),list=el('div','bc-files-move-list'),foot=el('div','bc-files-move-foot'),feedback=el('small','','');
  let dest=[];const move=btn('Move here',()=>moveFiles(names,[...dest]),'bc-files-button primary');move.disabled=true;foot.append(feedback,btn('Cancel',closeMove),move);panel.append(head,note,crumb,list,foot);overlay.append(panel);host.append(overlay);
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeMove()}});overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)closeMove()});
  async function browse(parts){
   dest=[...parts];const seq=++moveGeneration;move.disabled=true;list.replaceChildren(el('p','','Loading folders…'));feedback.textContent='';
   crumb.replaceChildren(btn('My Cloud Drive',()=>void browse([]),'bc-files-crumb'));parts.forEach((n,i)=>crumb.append(el('span','','›'),btn(n,()=>void browse(parts.slice(0,i+1)),'bc-files-crumb')));
   try{const rows=await listFolder(parts);if(moveOverlay!==overlay||seq!==moveGeneration||!usable())return;list.replaceChildren();if(parts.length)list.append(btn('‹  Parent folder',()=>void browse(parts.slice(0,-1)),'bc-files-destination'));const folders=rows.filter(r=>r.folder).sort((a,b)=>a.name.localeCompare(b.name));for(const row of folders){const item=btn('',()=>void browse([...parts,row.name]),'bc-files-destination');item.append(glyph(true),el('span','',row.name),el('span','','›'));list.append(item)}if(!folders.length)list.append(el('p','','No subfolders here.'));move.disabled=samePath(original,dest);feedback.textContent=move.disabled?'Already in this folder.':''}
   catch(e){if(moveOverlay===overlay&&seq===moveGeneration){list.textContent='Unable to list folders.';feedback.textContent=String(e.message||e).slice(0,130);move.disabled=true}}
  }
  void browse([]);head.querySelector('button').focus()
 }
 function dropTarget(node,dest){
  node.addEventListener('dragover',e=>{if(!dragNames||working||loading)return;e.preventDefault();e.dataTransfer.dropEffect='move';node.classList.add('bc-files-drop-target')});
  node.addEventListener('dragleave',e=>{if(!node.contains(e.relatedTarget))node.classList.remove('bc-files-drop-target')});
  node.addEventListener('drop',e=>{node.classList.remove('bc-files-drop-target');if(!dragNames||working||loading)return;e.preventDefault();e.stopPropagation();const names=[...dragNames];dragNames=null;moveFiles(names,dest)});
 }

 const formatSize=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':(n||0)+' B';
 const glyph=(folder)=>{const s=el('span',folder?'bc-files-folder':'bc-files-paper');s.setAttribute('aria-hidden','true');if(!folder)s.textContent='▤';return s};
 async function run(fn){if(working||!usable())return;working=true;host.setAttribute('aria-busy','true');onBusy(true);render();try{await fn()}catch(e){report(String(e?.message||'File operation failed.').slice(0,200))}finally{working=false;host.removeAttribute('aria-busy');onBusy(false);if(usable())render()}}
 function check(r){if(r.error)throw Error(r.error.message);return r.data}
 async function refresh(){storage?.invalidate?.();const seq=++sequence;if(!usable())return;loading=true;report('Loading files…');render();try{
  let rows=[];
  if(preview){const p=path.join('/');const folders=[...memory.keys()].filter(k=>k.startsWith(p?p+'/':'')&&k!==p).map(k=>k.slice(p?p.length+1:0)).filter(k=>!k.includes('/'));rows=folders.map(name=>({name,folder:true}));for(const f of memory.get(p)||[])rows.push(f)}
  else{if(!storage||!userId)throw Error('Corporate access required.');for(let offset=0;offset<5000;offset+=100){const page=check(await storage.list(root(),{limit:100,offset,sortBy:{column:'name',order:'asc'}}))||[];rows.push(...page.filter(x=>x.name!==MARK).map(x=>({name:x.name,folder:!x.id,size:x.metadata?.size||0,date:x.updated_at||x.created_at})));if(page.length<100)break}}
  if(seq!==sequence||!usable())return;entries=rows.sort((a,b)=>Number(b.folder)-Number(a.folder)||a.name.localeCompare(b.name));selected=new Set([...selected].filter(name=>entries.some(r=>!r.folder&&r.name===name)));loading=false;report((preview?'Design preview · ':'Private cloud drive · ')+entries.length+' item'+(entries.length===1?'':'s'));render();
 }catch(e){if(seq===sequence){entries=[];selected.clear();loading=false;render();report('Could not load files: '+String(e.message||e).slice(0,160))}}}
 function navigate(next){if(working)return;path=next;persistLocation();selected.clear();entries=[];search.value='';editor.hidden=true;closeMove();void refresh()}
 function edit(label,initial,fn){if(working)return;action=fn;field.placeholder=label;field.value=initial;editor.hidden=false;field.focus();field.select()}
 editor.onsubmit=e=>{e.preventDefault();const name=clean(field.value);if(!name||name===MARK){report('Enter a valid file or folder name.');return}if(entries.some(x=>x.name===name)){report('That name already exists in this folder.');return}const fn=action;editor.hidden=true;void run(()=>fn(name))};
 const create=()=>edit('New folder name','',async name=>{if(preview){memory.set([...path,name].join('/'),[])}else check(await storage.upload(key(name)+'/'+MARK,new Blob(['folder'],{type:'text/plain'}),{upsert:false,contentType:'text/plain'}));await refresh()});
 async function download(row){if(preview){report('Preview only. Sign in to download your private files.');return}await run(async()=>{const blob=check(await storage.download(key(row.name)));if(!usable())return;const u=URL.createObjectURL(new Blob([blob],{type:'application/octet-stream'}));const a=el('a');a.href=u;a.download=row.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);report('Download requested: '+row.name)})}
 function rename(row){if(row.folder){report('Folder renaming is not available yet.');return}edit('New file name',row.name,async name=>{if(preview){row.name=name}else check(await storage.move(key(row.name),key(name)));await refresh()})}
 function remove(row){if(working)return;const panel=el('div','bc-files-delete');panel.append(el('span','',row.folder?'Delete empty folder “'+row.name+'”?':'Permanently delete “'+row.name+'”?'),btn('Cancel',()=>panel.remove()),btn('Delete',()=>{panel.remove();void run(async()=>{if(preview){if(row.folder)memory.delete([...path,row.name].join('/'));else{const a=memory.get(path.join('/'))||[];memory.set(path.join('/'),a.filter(x=>x!==row))}}else{let target=key(row.name);if(row.folder){const list=check(await storage.list(target,{limit:2}))||[];if(list.some(x=>x.name!==MARK))throw Error('Only empty folders can be deleted.');target+='/'+MARK}check(await storage.remove([target]))}await refresh()})},'bc-files-button danger'));editor.hidden=true;view.insertBefore(panel,items)}
 fileInput.onchange=()=>{const files=[...fileInput.files];fileInput.value='';if(!files.length)return;if(preview){report('Preview only. Sign in to upload your files.');return}void run(async()=>{let count=0,failed=[];const target=root();for(const [i,f] of files.entries()){if(!usable())break;const name=clean(f.name);if(!name){failed.push(f.name+': Invalid file name.');continue}if(!f.size||f.size>LIMIT){failed.push(name+': '+(!f.size?'Empty file.':'Exceeds 256 MB ('+formatSize(f.size)+').'));continue}if(entries.some(x=>x.name===name)){failed.push(name+': Already exists.');continue}report('Uploading '+(i+1)+' of '+files.length+' · '+name+' ('+formatSize(f.size)+')…');try{await uploadPrivateFile(storage,target+'/'+name,f,(sent,total)=>report('Uploading '+name+' · '+Math.round(sent/total*100)+'%'));count++}catch(e){failed.push(name+': '+privateUploadError(e))}}await refresh();if(count)window.dispatchEvent(new Event('bc-private-files-changed'));report(count+' uploaded privately'+(failed.length?' · '+failed.length+' failed · '+failed.slice(0,3).join(' | '):''));})};
 const upload=btn('↑ Upload',()=>fileInput.click(),'bc-files-button primary');
 const newFolder=btn('+ New folder',create),back=btn('‹',()=>navigate(path.slice(0,-1))),reload=btn('↻',()=>void refresh()),toggle=btn(layout==='grid'?'▤ List':'▦ Grid',()=>{layout=layout==='grid'?'list':'grid';toggle.textContent=layout==='grid'?'▤ List':'▦ Grid';persistLocation();render()});
 const selectAll=btn('Select files',()=>{if(entries.some(r=>!r.folder&&!selected.has(r.name)))selected=new Set(entries.filter(r=>!r.folder).map(r=>r.name));else selected.clear();render()});const moveSelected=btn('Move to…',()=>openMove(selectedFiles().map(r=>r.name)));toolbar.append(back,newFolder,upload,reload,toggle,selectAll,moveSelected,search);
 sidebar.append(el('strong','','Files'),el('small','','LOCATIONS'),btn('☁  My Cloud Drive',()=>navigate([]),'bc-files-location selected'),el('small','','PRIVATE WORKSPACE'),el('p','','Files are visible to your own authorized account.'),el('p','','256 MB per item · private storage'));
 function render(){if(disposed)return;updateSelection();back.disabled=working||!path.length;for(const b of [upload,newFolder,reload,toggle])b.disabled=working;bread.replaceChildren(btn('My Cloud Drive',()=>navigate([]),'bc-files-crumb'));dropTarget(bread.firstElementChild,[]);path.forEach((n,i)=>{const crumb=btn(n,()=>navigate(path.slice(0,i+1)),'bc-files-crumb');bread.append(el('span','','›'),crumb);dropTarget(crumb,path.slice(0,i+1))});items.className='bc-files-items '+layout;items.replaceChildren();const q=search.value.toLowerCase();const filtered=entries.filter(x=>x.name.toLowerCase().includes(q));
  if(!filtered.length){items.append(el('div','bc-files-empty',q?'No matching files.':'This folder is empty. Create a folder or upload files.'));return}
  for(const row of filtered){const card=el('article','bc-files-item'),open=btn('',()=>{});open.className='bc-files-open';open.onclick=()=>row.folder?navigate([...path,row.name]):mediaType(row.name)&&!preview?void viewer.open({name:row.name,path:key(row.name),type:mediaType(row.name)}):void download(row);open.append(glyph(row.folder),el('strong','',row.name),el('small','',row.folder?'Folder':formatSize(row.size)));const controls=el('div','bc-files-actions');if(!row.folder){const mark=el('input','bc-files-select');mark.type='checkbox';mark.setAttribute('aria-label','Select '+row.name);mark.checked=selected.has(row.name);mark.disabled=working||loading;mark.onchange=()=>{if(mark.checked)selected.add(row.name);else selected.delete(row.name);card.classList.toggle('is-selected',mark.checked);updateSelection()};card.classList.toggle('is-selected',mark.checked);card.append(mark);card.draggable=!working&&!loading;card.addEventListener('dragstart',e=>{if(e.target.closest('button,input')){e.preventDefault();return}dragNames=selected.has(row.name)?selectedFiles().map(r=>r.name):[row.name];e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragNames.length+' private BLACKCELL files')});card.addEventListener('dragend',()=>{dragNames=null;host.querySelectorAll('.bc-files-drop-target').forEach(n=>n.classList.remove('bc-files-drop-target'))});controls.append(btn('Move',()=>openMove([row.name])),btn('Download',()=>void download(row)),btn('Rename',()=>rename(row)))}else{const parts=[...path,row.name];dropTarget(card,parts);card.draggable=!working&&!loading;open.draggable=!working&&!loading;card.addEventListener('dragstart',e=>{if(working||loading||e.target.closest('.bc-files-actions')){e.preventDefault();return}onFolderDrag(parts,e)});card.addEventListener('dragend',onFolderDragEnd);controls.append(btn('Add to Desktop',()=>onPin(parts)))}controls.append(btn('Delete',()=>remove(row)));for(const b of controls.querySelectorAll('button'))b.disabled=working||loading;open.disabled=working||loading;card.append(open,controls);items.append(card)}
 }
 search.oninput=render;persistLocation();void refresh();return {dispose(){disposed=true;sequence++;closeMove();viewer.close();onFolderDragEnd()},busy:()=>working,refresh,openFolder(parts){if(working||!validPath(parts))return false;viewer.close();navigate([...parts]);return true}};
}