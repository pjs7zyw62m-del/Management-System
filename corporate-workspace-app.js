/* Shared owner-authorized BLACKCELL Administration workspace UI. */
export async function initWorkspace(client){
 const root=document.getElementById('opContent');
 const E=(tag,cls='',value)=>{
   const node=document.createElement(tag);
   if(cls)node.className=cls;
   if(value!==undefined)node.textContent=String(value);
   return node;
 };
 const add=(parent,...children)=>{children.forEach(x=>parent.append(x));return parent};
 const button=(label,callback,style='')=>{
   const node=E('button','btn'+(style?' '+style:''),label);
   node.type='button';if(callback)node.addEventListener('click',callback);return node;
 };
 const panel=(title,desc='')=>{
   const node=E('section','panel');node.append(E('h2','',title));
   if(desc)node.append(E('p','',desc));return node;
 };
 const info=(label,desc,value)=>{
   const row=E('div','info-row'),left=E('div');
   add(left,E('b','',label),E('small','',desc));
   add(row,left,E('span','value',value));return row;
 };
 const metrics=(items)=>{
   const grid=E('div','metrics'),results={};
   for(const [key,label,desc] of items){
     const card=E('div','metric');
     const value=E('strong','','—');
     add(card,E('small','',label),value,E('span','',desc));grid.append(card);results[key]=value;
   }
   root.append(grid);return results;
 };
 const date=(value)=>{
   if(!value)return 'Not recorded';
   const d=new Date(value);
   return Number.isNaN(d.getTime())?'Not recorded':d.toLocaleString();
 };
 const rpc=async(name,params={})=>{
   const {data,error}=await client.rpc(name,params);
   if(error)throw new Error(error.message||'Secure request failed.');
   if(!data||data.ok!==true)throw new Error(data?.reason==='owner_verification_required'?
     'Level 7 verification expired. Sign in again.':data?.reason||'Request rejected.');
   return data;
 };
 const download=(file,obj)=>{
   const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=file;document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
 };
 const status=(message,type='')=>{
   let node=document.getElementById('opStatus');
   if(!node){
     node=E('div');node.id='opStatus';node.setAttribute('role','status');
     node.setAttribute('aria-live','polite');root.prepend(node);
   }
   node.textContent=message;node.className=type==='error'?'is-error':type==='success'?'is-success':'';
 };
 const timeout=async(promise,ms)=>{
   let timer;
   try{return await Promise.race([promise,new Promise((_,reject)=>{
     timer=setTimeout(()=>reject(new Error('timeout')),ms)})])}
   finally{clearTimeout(timer)}
 };
 const toolbar=()=>{const bar=E('div','toolbar');root.append(bar);return bar};
 const section=(text)=>{root.append(E('div','section-heading',text))};
 const ui={root,E,add,button,panel,info,metrics,date,rpc,download,status,timeout,toolbar,section};
 const map={
   diagnostics:'corporate-workspace-diagnostics.js',
   security:'corporate-workspace-security.js',
   activity:'corporate-workspace-activity.js',
   backups:'corporate-workspace-backups.js'
 };
 const path=map[document.body.dataset.workspace];
 if(!path){root.append(panel('Unavailable workspace','Return to Administration.'));return}
 const page=await import('./'+path+'?v=20261112-ws1');
 if(typeof page.setup!=='function')throw new Error('Workspace module is invalid.');
 await page.setup(client,ui);
}
