export function setup(client,u){
 const {root,E,add,button,metrics,panel,info,rpc,status,toolbar,date}=u;
 const values=metrics([
   ['verified','OWNER VERIFIED','Level 7 grant'],
   ['sessions','OWNER SESSIONS','Active grants'],
   ['employees','ACTIVE EMPLOYEES','Activated staff'],
   ['failures','CODE FAILURES','Current gateway record']
 ]);
 const bar=toolbar(),left=E('div','toolbar-left');
 const run=button('⟳ RUN SECURITY CHECK',()=>{void load()},'primary');
 const goto=button('REVIEW SESSIONS',()=>{document.getElementById('sessionList')?.scrollIntoView({behavior:'smooth',block:'start'})});
 add(left,run,goto);bar.append(left);
 const overview=panel('Verified Security Overview','Owner-authorized results from the real corporate database, not example alerts.');
 const details=E('div','info-list');overview.append(details);root.append(overview);
 const sessions=panel('Corporate Verification Sessions',
  'These are code-verification grants only, not a complete list of browser devices or Supabase Auth tokens.');
 const sessionList=E('div','info-list');sessionList.id='sessionList';sessions.append(sessionList);
 const revoke=button('REVOKE OTHER CORPORATE VERIFICATION GRANTS',async()=>{
   if(!confirm('Revoke other corporate Level 7 code-verification grants? They will need to reverify. This does not revoke sessions in other independent apps.'))return;
   revoke.disabled=true;status('Revoking other corporate grants…');
   try{
     const res=await rpc('corp_admin_revoke_other_verified_sessions');
     status('Revoked '+res.revoked+' other verification grant(s).','success');
     void load();
   }catch(e){status('Could not revoke grants: '+e.message,'error')}
   finally{revoke.disabled=false}
 },'danger');
 sessions.append(revoke);root.append(sessions);
 root.append(E('div','notice',
   'This page cannot prove that every device is safe, revoke every Supabase JWT, or enable new-device email alerts. Those features require additional secure infrastructure.'));
 details.append(E('p','','Run the security check to fetch live records.'));
 sessionList.append(E('p','','No sessions loaded.'));
 async function load(){
   run.disabled=true;status('Verifying owner security state…');
   try{
     const d=await rpc('corp_admin_security_overview');
     values.verified.textContent=d.owner_verified?'YES':'NO';
     values.sessions.textContent=String(d.owner_sessions?.length||0);
     values.employees.textContent=String(d.active_employees??0);
     values.failures.textContent=String(d.master_code_failed_attempts??0);
     details.replaceChildren();
     details.append(info('Active employee verification grants','Employees with active verification sessions',
       String(d.active_employee_verifications??0)));
     details.append(info('Pending employee activations','Accounts awaiting password activation',String(d.pending_employees??0)));
     details.append(info('Disabled employee accounts','Accounts no longer active',String(d.disabled_employees??0)));
     details.append(info('Master-code lock','Existing gateway lockout state',
       d.owner_master_code_locked_until&&new Date(d.owner_master_code_locked_until)>new Date()?
        'LOCKED UNTIL '+date(d.owner_master_code_locked_until):'NO ACTIVE LOCK'));
     details.append(info('Database response time','Last security read',date(d.read_at)));
     sessionList.replaceChildren();
     if(!d.owner_sessions?.length)sessionList.append(E('p','','No unexpired verified corporate sessions.'));
     else d.owner_sessions.forEach(session=>{
       sessionList.append(info(session.current?'Current owner session':'Other owner session',
         'Verified '+date(session.verified_at),'Expires '+date(session.expires_at)));
     });
     status('Security check completed successfully.','success');
   }catch(e){status('Security check failed: '+e.message,'error')}
   finally{run.disabled=false}
 }
}
