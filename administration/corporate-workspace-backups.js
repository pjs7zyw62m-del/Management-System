export function setup(client,u){
 const {root,E,add,button,panel,info,rpc,status,toolbar,date,download}=u;
 const top=panel('Configuration Snapshot Controls',
  'These are SHA-256 checksummed snapshots of owner interface preferences and aggregate personnel counts. They are not database, media, or credential backups.');
 const form=E('div','formline'),field=E('label','field','SNAPSHOT NAME'),input=E('input');
 input.type='text';input.maxLength=75;input.placeholder='e.g. Before changing settings';
 field.append(input);
 const create=button('CREATE CONFIGURATION SNAPSHOT',async()=>{
   if(!confirm('Create a configuration snapshot? This includes owner preferences and personnel totals, not employee credentials, media, or the NEXUS database.'))return;
   create.disabled=true;status('Creating database snapshot…');
   try{
     const result=await rpc('corp_admin_config_snapshot',{p_action:'create',p_title:input.value.trim()||'Manual configuration snapshot'});
     status('Created verified configuration snapshot: '+result.title,'success');
     input.value='';void refresh();
   }catch(e){status('Snapshot creation failed: '+e.message,'error')}
   finally{create.disabled=false}
 },'primary');
 add(form,field,create);top.append(form);root.append(top);
 const tools=toolbar();
 const refreshButton=button('⟳ LOAD SNAPSHOT HISTORY',()=>{void refresh()},'primary');
 tools.append(add(E('div','toolbar-left'),refreshButton));
 const history=panel('Saved Configuration Snapshots',
  'Each saved snapshot can be verified, reviewed, downloaded, or used to restore owner Administration preferences.');
 const list=E('div','item-list');history.append(list);root.append(history);
 const limits=panel('Recovery Coverage');
 const entries=[
   ['Administration preferences','Owner theme, animations, and display settings','SUPPORTED'],
   ['Personnel counts','Aggregate numbers at snapshot time (informational only)','CAPTURED'],
   ['Entire NEXUS database','Requires separate full database backups','NOT CONFIGURED'],
   ['Employee passwords and codes','Not included in configuration snapshots','NOT INCLUDED'],
   ['Bunny and Supabase media files','Requires independent protected object backup','NOT CONFIGURED']
 ];
 for(const [name,description,state] of entries)limits.append(info(name,description,state));
 root.append(limits);
 root.append(E('div','notice','Restoring a snapshot affects only saved Administration preferences. It never recreates deleted employees, resets passwords, restores conversations, or recovers a media vault.'));
 list.append(E('p','','Click LOAD SNAPSHOT HISTORY to view saved configuration snapshots.'));
 async function refresh(){
   refreshButton.disabled=true;status('Loading verified configuration snapshots…');
   try{
     const data=await rpc('corp_admin_config_snapshot',{p_action:'list'});
     list.replaceChildren();
     if(!data.items?.length){list.append(E('p','','No configuration snapshots yet.'));status('No saved snapshots found.');return;}
     for(const record of data.items){
       const item=E('div','item'),body=E('div','item-main');
       add(body,E('strong','',record.title),
         E('small','',date(record.created_at)+' · SHA-256 '+String(record.checksum||'').slice(0,18)+'…'));
       const actions=E('div','item-controls');
       const view=button('VERIFY / REVIEW',async()=>{
         try{
           const d=await rpc('corp_admin_config_snapshot',{p_action:'get',p_id:record.id});
           item.querySelector('pre.preview')?.remove();
           const snippet=E('pre','preview',JSON.stringify(d.payload,null,2));
           snippet.style.width='100%';item.append(snippet);
           status('Checksum verified by the database for '+d.title+'.','success');
         }catch(e){status('Verification failed: '+e.message,'error')}
       });
       const exportBtn=button('DOWNLOAD',async()=>{
         try{
           const d=await rpc('corp_admin_config_snapshot',{p_action:'get',p_id:record.id});
           download('blackcell-config-'+record.id.slice(0,8)+'.json',
             {title:d.title,checksum:d.checksum,checksum_verified:d.checksum_verified,payload:d.payload});
           status('Verified snapshot downloaded.','success');
         }catch(e){status('Download failed: '+e.message,'error')}
       });
       const restore=button('RESTORE PREFERENCES',async()=>{
         if(!confirm('Restore Administration interface preferences only? Other databases, employee accounts, files, and chat will NOT be changed.'))return;
         restore.disabled=true;
         try{
           await rpc('corp_admin_config_snapshot',{p_action:'restore_preferences',p_id:record.id});
           status('Owner Administration preferences restored. No other systems were changed.','success');
         }catch(e){status('Restore failed: '+e.message,'error')}
         finally{restore.disabled=false}
       });
       const del=button('DELETE',async()=>{
         if(!confirm('Permanently delete this single configuration snapshot?'))return;
         del.disabled=true;
         try{
           await rpc('corp_admin_config_snapshot',{p_action:'delete',p_id:record.id});
           item.remove();status('Snapshot deleted.','success');
         }catch(e){del.disabled=false;status('Deletion failed: '+e.message,'error')}
       },'danger');
       add(actions,view,exportBtn,restore,del);
       add(item,body,actions);list.append(item);
     }
     status('Loaded '+data.items.length+' saved configuration snapshot(s).','success');
   }catch(e){status('Snapshot history unavailable: '+e.message,'error')}
   finally{refreshButton.disabled=false}
 }
}
