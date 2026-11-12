'use strict';
(()=>{
const $=id=>document.getElementById(id), modal=$('modalBackdrop'), content=$('modalContent'), pane=modal.querySelector('.admin-modal');
let lastTrigger=null,activeModal='',activeTab='',searchTerm='',period='all',selectedEvent=null,selectedSystem=null;
let pendingReinvite=null;
const state={appearance:'glass',animations:true,notify:true,confirm:true,securityNotify:true,deviceAlerts:true,autoBackup:false,restoreConfirm:true};
const systems=[{id:'nexus',name:'NEXUS Management',kind:'Corporate application',provider:'GitHub Pages · Supabase',desc:'Inmate profiles, financial management, records, communications and analysis.',href:'https://www.blackcellcorp.com',icon:'▦'},{id:'maf',name:"Man's Armed Forces",kind:'Media collection',provider:'GitHub Pages · Browser storage',desc:'Uniforms photo library, albums, folders, ratings and collections.',href:'https://blackcellcorp.com/mans-armed-forces.html',icon:'◇'},{id:'gunner',name:'Gunner Thompson AI',kind:'AI application',provider:'AI inference services',desc:'Character AI service; account-level connectivity not monitored.',href:null,icon:'✳'},{id:'corporate',name:'Blackcell Corporate Portal',kind:'Administrative interface',provider:'GitHub Pages',desc:'Corporate dashboard and administration preview.',href:null,icon:'▤'}];
const demoEvents=[{id:'EX-01',type:'security',title:'Example: Unrecognized sign-in attempt',description:'Fictional sample alert; no actual sign-in event was retrieved.',date:'2026-11-08',display:'Nov 8, 2026 · 9:42 AM'},{id:'EX-02',type:'admin',title:'Example: Corporate settings updated',description:'Fictional sample administrative change.',date:'2026-11-08',display:'Nov 8, 2026 · 8:15 AM'},{id:'EX-03',type:'access',title:'Example: Administrator signed in',description:'Fictional sample access event.',date:'2026-11-07',display:'Nov 7, 2026 · 7:30 PM'},{id:'EX-04',type:'admin',title:'Example: Division configuration viewed',description:'Fictional sample division activity.',date:'2026-11-07',display:'Nov 7, 2026 · 6:05 PM'},{id:'EX-05',type:'security',title:'Example: Password verification failed',description:'Fictional sample credential event.',date:'2026-11-06',display:'Nov 6, 2026 · 4:20 PM'}];
const names={nexus:'NEXUS Management',mans:"Man's Armed Forces",users:'User Management',chat:'Employee Chat',security:'Security Center',settings:'System Settings',logs:'Activity Logs',backups:'Backup & Recovery',systems:'Corporate Systems',account:'My Account',notifications:'Corporate Notifications',signout:'Global Secure Sign Out',restricted:'Restricted Infrastructure'};
const tabs={users:[['accounts','Accounts'],['profiles','Profiles'],['roles','Roles'],['access','Access']],security:[['overview','Overview'],['sessions','Sessions'],['settings','Settings']],settings:[['general','General'],['appearance','Appearance'],['divisions','Divisions'],['preferences','Preferences']],logs:[['all','All'],['admin','Admin'],['security','Security'],['access','Access']],backups:[['overview','Overview'],['history','History'],['settings','Settings']],systems:[['systems','Systems'],['infrastructure','Infrastructure'],['monitoring','Monitoring']]};
const el=(tag,cls='',txt)=>{let n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
const add=(parent,...children)=>{children.forEach(c=>parent.append(c));return parent};
const p=(s)=>el('p','muted',s);
const block=(title)=>{let n=el('section','content-block');if(title)n.append(el('h3','',title));return n};
const row=(name,desc,right)=>{let r=el('div','list-row'),left=el('div');add(left,el('b','',name),el('small','',desc));add(r,left,typeof right==='string'?el('span','mock-state',right):right||el('span','mock-state','Planned'));return r};
const grid=()=>el('div','grid-two');
const card=(label,value)=>{let n=el('div','info-card');add(n,el('small','',label),el('strong','',value));return n};
const action=(label,fn,disabled=false,emphasis=false)=>{let b=el('button','text-action'+(emphasis?' emphasis':''),label);b.type='button';b.disabled=disabled;if(fn)b.addEventListener('click',fn);return b};
const choice=(name,desc,key)=>{const label=el('label','check-row'),copy=el('div');copy.append(el('b','',name),el('small','',desc));const check=el('input');check.type='checkbox';check.checked=state[key];check.addEventListener('change',()=>{state[key]=check.checked});label.append(copy,check);return label};
const note=(message)=>el('div','disabled-callout',message);
const select=(options,value,handler)=>{const s=el('select');for(let [v,title] of options){const o=new Option(title,v);s.add(o)}s.value=value;s.addEventListener('change',()=>handler(s.value));return s};
function open(id,trigger){closeDrawer();lastTrigger=trigger||document.activeElement;activeModal=id;activeTab=(tabs[id]||[['overview']])[0][0];searchTerm='';period='all';selectedEvent=null;selectedSystem=null;modal.hidden=false;document.body.style.overflow='hidden';render();$('closeModal').focus();}
function close(){modal.hidden=true;document.body.style.overflow='';activeModal='';content.replaceChildren();if(lastTrigger&&lastTrigger.isConnected)lastTrigger.focus();}
function render(){ pane.classList.toggle('user-management-v2',activeModal==='users');$('modalTitle').textContent=names[activeModal]||'Corporate System'; $('modalEyebrow').textContent=activeModal==='nexus'||activeModal==='mans'?'BLACKCELL CORPORATION / DIVISION CONTROL':'BLACKCELL CORPORATION / ADMINISTRATION'; const disclaimer=document.querySelector('.preview-disclaimer');if(disclaimer)disclaimer.textContent=activeModal==='users'?'SECURE CORPORATE MANAGEMENT · ACTIONS REQUIRE VERIFIED OWNER AUTHORIZATION':'INTERACTIVE DESIGN PREVIEW · NO LIVE ADMINISTRATIVE CHANGES'; content.replaceChildren(); if(activeModal==='users')renderUserManagementHeader();if(tabs[activeModal]){let bar=el('div','modal-tabbar');for(const [id,label] of tabs[activeModal]){let b=action(label,()=>{activeTab=id;render();});b.className=id===activeTab?'active':'';bar.append(b)}content.append(bar)}switch(activeModal){case 'users':users();break;case 'chat':chat();break;case 'security':security();break;case 'settings':settings();break;case 'logs':logs();break;case 'backups':backups();break;case 'systems':corporateSystems();break;case 'nexus':case 'mans':division();break;case 'notifications':notifications();break;case 'account':account();break;case 'signout':signout();break;case 'restricted':restricted();break;}}



/* BLACKCELL 2.0 user-management dashboard, reading only verified owner-accessible directory data. */
function renderUserManagementHeader(){
 const wrap=el('section','um2-header');
 const lead=el('div','um2-lead');
 lead.append(el('span','um2-eyebrow','BLACKCELL CORPORATION  /  PERSONNEL COMMAND'),
   el('h3','','One place for your entire network.'),
   el('p','','Manage invitations, review employee identities, control clearance, and secure access without leaving Administration.'));
 const actions=el('div','um2-shortcuts');
 actions.append(action('＋  INVITE EMPLOYEE',()=>{activeTab='accounts';render();},false,true),
   action('♙  VIEW PERSONNEL',()=>{activeTab='profiles';render();}));
 const upper=el('div','um2-upper'); upper.append(lead,actions);wrap.append(upper);
 const cards=el('div','um2-stats');
 const metrics=[['ALL PERSONNEL','total','Includes corporate owner'],['ACTIVE ACCOUNTS','active','Activated & enabled'],['AWAITING ACTIVATION','pending','Invited accounts'],['DISABLED ACCOUNTS','disabled','Access turned off']];
 const values={};
 for(const [label,key,description] of metrics){
   const box=el('div','um2-stat');
   box.append(el('small','',label));const value=el('strong','','—');
   box.append(value,el('span','',description));cards.append(box);values[key]=value;
 }
 wrap.append(cards);content.append(wrap);
 const api=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
 if(!api)return;
 void (async()=>{
   try{
     const {data,error}=await api.rpc('corp_admin_members');
     if(!wrap.isConnected||error||data?.ok!==true||!Array.isArray(data.members))return;
     const members=data.members;
     values.total.textContent=String(members.length);
     values.active.textContent=String(members.filter(m=>m.active===true&&(m.role==='owner'||m.password_activated===true)).length);
     values.pending.textContent=String(members.filter(m=>m.active===true&&m.role!=='owner'&&!m.password_activated).length);
     values.disabled.textContent=String(members.filter(m=>m.active===false).length);
   }catch(_){}
 })();
}

function chat(){
  content.append(p('Private Blackcell messaging. Only verified corporate accounts with Chat access can send and receive messages.'));
  const frame=el('iframe');
  frame.src='corporate-chat.html';
  frame.title='Private Blackcell Employee Chat';
  frame.style.cssText='width:100%;height:min(67vh,690px);border:1px solid #4a3a47;border-radius:16px;background:#030305;display:block;margin-top:14px';
  content.append(frame);
}
// Generate staff credentials locally with browser CSPRNG. Never persist plain-text codes.
function corporateRandomDigits(n){
 const out=[];const bytes=new Uint8Array(Math.max(16,n*2));
 while(out.length<n){
  crypto.getRandomValues(bytes);
  for(const b of bytes){
   if(b<250)out.push(String(b%10));
   if(out.length===n)break;
  }
 }
 return out.join('');
}
function corporateUsername(name){
 const cleaned=String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
 return ('bc_'+(cleaned||'employee').slice(0,17)+'_'+corporateRandomDigits(5)).slice(0,32);
}

function employeeCardView(member,sample=false){
  const blockEl=el('div','employee-profile-layout');
  const card=el('article','employee-profile-pass');
  card.setAttribute('aria-label',sample?'Sample employee card':'Employee card for '+(member.display_name||'employee'));
  card.append(el('div','employee-profile-crest','B'),
    el('div','employee-profile-corporate','BLACKCELL'),
    el('div','employee-profile-corporate','CORPORATION'),
    el('div','employee-profile-network','NETWORK'),
    el('div','employee-profile-stripe',''));
  const pass=el('div','employee-profile-clearance');
  pass.append(el('strong','','LEVEL '+(member.clearance_level||1)),el('span','','ACCESS PASS'));
  card.append(pass,el('div','employee-profile-name',member.display_name||'Sample Employee'),
    el('div','employee-profile-username',(member.username||'USERNAME NOT ASSIGNED').toUpperCase()));
  if(sample)card.append(el('div','employee-profile-watermark','PREVIEW ONLY'));
  const details=el('section','employee-profile-fields');
  details.append(el('div','employee-profile-fields-heading','CORPORATE ACCOUNT PROFILE'));
  function field(title,value){
    const item=el('div','employee-profile-field');
    item.append(el('small','',title),el('strong','',String(value)));
    details.append(item);
  }
  field('FULL NAME',member.display_name||'Sample Employee');
  field('USERNAME',member.username||'Not assigned');
  field('EMAIL',member.email||'Not assigned');
  field('ACCOUNT TYPE',member.role==='owner'?'Corporate Owner':'Employee');
  field('CLEARANCE LEVEL','Level '+(member.clearance_level||1));
  field('ACCOUNT STATUS',sample?'Preview / not registered':
    !member.active?'Disabled':member.role==='owner'?'Owner account':
    member.password_activated?'Activated':'Pending employee activation');
  field('EMPLOYEE CHAT',sample?'Not activated':member.can_chat?'Enabled':'Disabled');
  field('ACCESS CODE','4 digits — never displayed');
  field('SECURITY CODE','12 digits — never displayed');
  const noteEl=p(sample?
    'This is a visual demonstration. No account or invitation has been created.':
    'This is an administrative profile preview, not a sign-in as this employee. Secrets and passwords cannot be viewed here.');
  details.append(noteEl);
  blockEl.append(card,details);
  return blockEl;
}

function confirmEmployeeDelete(member,returnTab='profiles'){
  if(!member||member.role!=='employee'||!member.user_id||!member.email)return;
  const targetId=String(member.user_id);
  const targetEmail=String(member.email).trim().toLowerCase();
  const targetName=String(member.display_name||'Employee');
  const container=el('div','employee-delete-dialog');
  const warning=block('Permanently Delete Employee Profile');
  warning.classList.add('employee-delete-warning');
  warning.append(
    p('This permanently removes the employee account, their access pass, assigned codes, active verification sessions, and associated corporate chat messages. The existing invitation link will no longer work.'),
    row('NAME',targetName,'EMPLOYEE'),
    row('EMAIL',targetEmail,'DELETE TARGET')
  );
  const label=el('label','field','TYPE EMPLOYEE EMAIL TO CONFIRM');
  const typed=el('input');
  typed.type='email';
  typed.placeholder=targetEmail;
  typed.autocomplete='off';
  typed.spellcheck=false;
  typed.autocapitalize='none';
  typed.setAttribute('aria-label','Type employee email to confirm permanent deletion');
  label.append(typed);
  const status=el('p','muted','This cannot be undone. You can send a completely new invitation to the same email after deletion.');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const buttons=el('div','employee-delete-actions');
  const cancel=action('CANCEL — KEEP EMPLOYEE',()=>{
    activeTab=returnTab;render();
  });
  const erase=action('PERMANENTLY DELETE PROFILE',null,true);
  erase.classList.add('delete-employee-button');
  typed.addEventListener('input',()=>{
    erase.disabled=typed.value.trim().toLowerCase()!==targetEmail;
  });
  erase.addEventListener('click',async()=>{
    if(typed.value.trim().toLowerCase()!==targetEmail)return;
    const api=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
    if(!api){status.textContent='Your Level 7 owner session is unavailable. Sign in again.';return;}
    erase.disabled=true;cancel.disabled=true;typed.disabled=true;
    status.textContent='Checking owner authorization and removing employee account…';
    try{
      const {data,error}=await api.functions.invoke('blackcell-delete-employee',{
        body:{action:'delete_employee',employee_id:targetId,confirm_email:typed.value.trim()}
      });
      let response=data;
      if(error?.context && typeof error.context.clone==='function'){
        try{response=await error.context.clone().json()}catch(_){}
      }
      if(error||response?.ok!==true||response?.status!=='employee_deleted'){
        const reasons={
          verified_level7_owner_required:'Your Level 7 security verification expired. Reauthorize and try again.',
          invalid_owner_session:'Your administrator session expired. Sign in again.',
          cannot_delete_owner:'The corporate owner account is protected from deletion.',
          employee_email_does_not_match:'The email confirmation did not match the account.',
          employee_not_found:'This employee record no longer exists. Refresh the directory.',
          employee_auth_lookup_failed:'Supabase could not locate the employee login. Nothing was deleted.',
          employee_delete_failed:'Supabase could not permanently remove the user.',
          employee_lookup_failed:'The employee record lookup failed.',
          delete_service_unavailable:'The deletion service is currently unavailable.',
          owner_verification_unavailable:'The owner authorization check is temporarily unavailable.'
        };
        const reason=response?.reason||'request_failed';
        throw new Error((error?.context?.status?'HTTP '+error.context.status+' — ':'')+
          (reasons[reason]||error?.message||'Deletion was not completed')+' ['+reason+']');
      }
      pendingReinvite={name:targetName,email:targetEmail};
      $('modalTitle').textContent='Employee Profile Deleted';
      $('modalEyebrow').textContent='BLACKCELL CORPORATION / USER MANAGEMENT';
      const success=block('Employee Account Removed');
      success.append(
        p('The Blackcell corporate employee account was deleted successfully. The old invitation and codes are no longer usable.'),
        row('EMPLOYEE',targetName,'DELETED'),
        row('EMAIL',targetEmail,'READY TO INVITE')
      );
      const actions=el('div','employee-delete-actions');
      const reinvite=action('CREATE NEW INVITATION',()=>{activeTab='accounts';render()},false,true);
      const back=action('VIEW EMPLOYEE PROFILES',()=>{activeTab='profiles';render()});
      actions.append(reinvite,back);
      content.replaceChildren(success,actions);
    }catch(err){
      status.textContent='Employee was not deleted: '+String(err?.message||err);
      erase.disabled=false;cancel.disabled=false;typed.disabled=false;
    }
  });
  buttons.append(cancel,erase);
  container.append(warning,label,status,buttons);
  $('modalTitle').textContent='Delete Employee Profile';
  $('modalEyebrow').textContent='BLACKCELL / RESTRICTED ADMINISTRATOR ACTION';
  content.replaceChildren(container);
  typed.focus();
}

function showEmployeeProfile(member,sample=false){
  $('modalTitle').textContent=sample?'Sample Employee Profile':'Employee Profile';
  $('modalEyebrow').textContent='BLACKCELL CORPORATION / USER MANAGEMENT';
  content.replaceChildren();
  const back=action('← BACK TO PROFILES',()=>{activeTab='profiles';render();});
  back.classList.add('profile-back-button');
  content.append(back,employeeCardView(member,sample));
  if(!sample && member.role==='employee'){
    const side=el('div','disabled-callout','Profile details are read-only here. Use the Roles and Access tabs to update clearance and account permissions.');
    const controls=el('div','employee-delete-actions');
    const deleteButton=action('DELETE EMPLOYEE PROFILE',()=>confirmEmployeeDelete(member,'profiles'));
    deleteButton.classList.add('delete-employee-button');
    controls.append(deleteButton);
    content.append(side,controls);
  }
}
async function employeeProfiles(){
  const container=block('Employee Profiles & Access Passes');
  container.append(p('Review any registered Blackcell employee account and its digital credential. Access and Security Codes are never shown.'));
  const preview=action('PREVIEW SAMPLE EMPLOYEE CARD',()=>{
    showEmployeeProfile({display_name:'Sample Employee',username:'bc_sample_48271',
      email:'sample@example.com',clearance_level:3,role:'employee',
      active:false,can_chat:false,password_activated:false},true);
  });
  preview.classList.add('profile-demo-button');
  container.append(preview);
  const tools=el('div','um2-directory-tools');
  const search=el('input','um2-search');search.type='search';search.placeholder='Search employee name, email or username';search.setAttribute('aria-label','Search employee profiles');
  const filter=el('select','um2-directory-filter');filter.setAttribute('aria-label','Filter employee accounts by status');
  for(const [value,label] of [['all','All statuses'],['active','Active'],['pending','Pending'],['disabled','Disabled']])filter.add(new Option(label,value));
  tools.append(search,filter);container.append(tools);
  const list=el('div','employee-profile-list');
  list.append(p('Loading profiles…'));
  container.append(list);
  content.append(container);
  const api=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
  if(!api){list.replaceChildren(p('Unable to verify your administrative session.'));return;}
  try{
    const {data,error}=await api.rpc('corp_admin_members');
    if(!list.isConnected)return;
    if(error||data?.ok!==true||!Array.isArray(data.members)){
      list.replaceChildren(p('Could not load authorized employee profiles.'));return;
    }
    const members=data.members;
    const paint=()=>{
      list.replaceChildren();
      const needle=search.value.trim().toLowerCase(),status=filter.value;
      const filtered=members.filter(m=>{
        const label=!m.active?'disabled':(m.role==='owner'||m.password_activated)?'active':'pending';
        const text=[m.display_name,m.email,m.username].join(' ').toLowerCase();
        return (status==='all'||label===status)&&(!needle||text.includes(needle));
      });
      if(!filtered.length){list.append(p('No employees match the current filters.'));return;}
      for(const member of filtered){
      const item=el('div','employee-profile-listitem');
      const info=el('div');
      info.append(el('strong','',member.display_name||'Employee'),
        el('small','',String(member.username||'No username')+
          ' · Level '+member.clearance_level+' · '+(member.role==='owner'?'Corporate Owner':'Employee')));
      const show=action('VIEW PROFILE / CARD',()=>showEmployeeProfile(member));
      info.classList.add('employee-profile-listcopy');
      const actions=el('div','employee-profile-actions');
      actions.append(show);
      if(member.role==='employee'){
        const del=action('DELETE PROFILE',()=>confirmEmployeeDelete(member,'profiles'));
        del.classList.add('delete-employee-button');
        actions.append(del);
      }
      item.append(info,actions);
      list.append(item);
      }
    };
    search.addEventListener('input',paint);
    filter.addEventListener('change',paint);
    paint();
  }catch(_){if(list.isConnected)list.replaceChildren(p('Unable to load employee profile list.'))}
}
function showInvitationPreview(form,inputs){
  const {name,email,username,level}=inputs;
  const existing=form.parentElement.querySelector('.invitation-preview');
  if(existing)existing.remove();

  const wrapper=el('section','invitation-preview');
  wrapper.setAttribute('aria-label','Blackcell corporate invitation concept preview — not sent');

  const top=el('div','invitation-preview-top');
  top.append(
    el('strong','invitation-preview-eyebrow','BLACKCELL CORPORATION / EXECUTIVE NETWORK'),
    el('span','invitation-preview-status','PREVIEW ONLY · NOT SENT')
  );
  wrapper.append(top);

  const address=el('div','invitation-preview-address');
  address.append(
    el('div','','TO: '+(email.value.trim()||'employee@example.com')),
    el('div','','SUBJECT: Blackcell Corporation — Employee Access Invitation (concept)')
  );
  wrapper.append(address);

  const card=el('div','invitation-preview-card');
  const brand=el('div','invitation-preview-brand');
  brand.append(el('div','invitation-preview-mark','B'));
  const brandText=el('div','invitation-preview-brandtext');
  brandText.append(
    el('strong','','BLACKCELL CORPORATION'),
    el('span','','EMPLOYEE ACCESS INVITATION')
  );
  brand.append(brandText);
  card.append(brand);

  const body=el('div','invitation-preview-body');
  body.append(
    el('div','invitation-preview-kicker','BLACKCELL / CORPORATE ONBOARDING'),
    el('h3','','Your corporate invitation'),
    el('p','', 'You are invited to activate a private Blackcell Corporation employee account.')
  );

  const grid=el('div','invitation-preview-grid');
  function detail(label,value){
    const item=el('div','invitation-preview-item');
    item.append(el('small','',label),el('strong','',value));
    return item;
  }
  grid.append(
    detail('NAME',name.value.trim()||'Sample Employee'),
    detail('EMAIL RECIPIENT',email.value.trim()||'employee@example.com'),
    detail('USERNAME',username.value.trim()||'bc_sample_48271'),
    detail('CLEARANCE LEVEL','LEVEL '+level.value),
    detail('ACCESS CODE','4 DIGITS · EMAILED AFTER ACTIVATION'),
    detail('SECURITY CODE','12 DIGITS · EMAILED AFTER ACTIVATION')
  );
  body.append(grid);

  const flow=el('div','invitation-preview-summary');
  flow.append(el('strong','invitation-preview-summary-title','EMPLOYEE ACTIVATION PROCESS'));
  const steps=el('ol','invitation-preview-steps');
  for(const message of [
    'Receive the secure employee invitation.',
    'Verify your email address and create a private password.',
    'Reveal your personalized Blackcell employee access card.',
    'Sign in securely using your activated email and password.',
    'Access only the employee features approved for your account.'
  ])steps.append(el('li','',message));
  flow.append(steps);
  body.append(flow);

  body.append(el('div','invitation-preview-actionrow',
    'ACTIVATE EMPLOYEE ACCESS  ↗'));

  const caution=el('div','invitation-preview-warning');
  caution.append(
    el('strong','','SECURITY NOTICE'),
    el('p','','Access and Security Codes are automatically emailed after password activation. No security codes are included in the first invitation.')
  );
  body.append(caution);
  card.append(body);
  wrapper.append(card);

  wrapper.append(el('p','invitation-preview-bottomnote',
    'Visual concept preview only. No invitation has been sent. The real invitation is generated using the email template configured in Supabase and may have different wording or styling.'));
  const closeButton=action('CLOSE PREVIEW',()=>wrapper.remove());
  closeButton.type='button';
  closeButton.classList.add('invitation-preview-close');
  wrapper.append(closeButton);
  form.after(wrapper);
  wrapper.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function showSecurityCodeCardPreview(form,inputs){
  const container=form.closest('.content-block');
  if(!container)return;
  container.querySelector('.security-credential-preview')?.remove();
  const {name,username,level,accessCode,securityCode}=inputs;
  const panel=el('section','security-credential-preview');
  panel.setAttribute('aria-label','Private Access and Security Code preview — not issued');
  const indicator=el('div','security-credential-preview-status');
  indicator.append(el('strong','','BLACKCELL / CREDENTIAL ISSUANCE'),
    el('span','','PREVIEW ONLY · NOT ISSUED'));
  panel.append(indicator);
  const card=el('article','security-credential-card');
  const header=el('div','security-credential-head');
  header.append(el('div','security-credential-mark','B'));
  const brand=el('div','security-credential-brand');
  brand.append(el('strong','','BLACKCELL CORPORATION'),
    el('small','','NETWORK / AUTHORIZED CREDENTIALS'));
  header.append(brand);
  card.append(header,el('div','security-credential-stripe',''));
  const body=el('div','security-credential-body');
  body.append(el('div','security-credential-kicker','PERSONAL SECURITY CREDENTIALS'),
    el('h3','','Access & Security Codes'));
  const fields=el('div','security-credential-fields');
  for(const item of [
    ['NAME',name.value.trim()||'Sample Employee'],
    ['USERNAME',username.value.trim()||'Generate username first'],
    ['CLEARANCE','LEVEL '+level.value]
  ]){
    const cell=el('div','security-credential-field');
    cell.append(el('small','',item[0]),el('strong','',item[1]));
    fields.append(cell);
  }
  body.append(fields);
  const codes=el('div','security-credential-code-grid');
  for(const cfg of [
    {label:'ACCESS CODE',digits:4,input:accessCode},
    {label:'SECURITY CODE',digits:12,input:securityCode}
  ]){
    const value=String(cfg.input.value||'');
    const valid=(new RegExp('^[0-9]{'+cfg.digits+'}$')).test(value);
    const slot=el('div','security-credential-code-slot');
    slot.append(el('small','',cfg.label+' · '+cfg.digits+' DIGITS'));
    const display=el('strong','security-credential-code-value',valid?'•'.repeat(cfg.digits):'NOT GENERATED');
    slot.append(display);
    const controls=el('div','security-credential-code-controls');
    controls.append(el('small','',valid?'CODE GENERATED · MASKED':'GENERATE CODE ABOVE'));
    if(valid){
      let open=false;
      const reveal=action('REVEAL',()=>{
        open=!open;
        display.textContent=open?value:'•'.repeat(cfg.digits);
        reveal.textContent=open?'HIDE':'REVEAL';
      });
      reveal.type='button';
      controls.append(reveal);
    }
    slot.append(controls);
    codes.append(slot);
  }
  body.append(codes);
  const warning=el('div','security-credential-caution');
  warning.append(el('strong','','PRIVATE / DO NOT SEND IN ORDINARY EMAIL'),
    el('p','','Only you can preview the generated codes here. Their values are stored as salted hashes after registration and must be delivered to the employee through a trusted separate channel.'));
  body.append(warning);
  card.append(body);
  panel.append(card,el('p','muted','Preview only. Nothing has been issued or sent. Codes are masked until you choose Reveal.'));
  const closeButton=action('CLOSE CODE CARD',()=>panel.remove());
  closeButton.type='button';
  panel.append(closeButton);
  container.append(panel);
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function users(){
  if(activeTab==='accounts'){
    const section=block('Register New Employee');
    section.append(p('Send a private activation invitation. The employee sets their own password and receives a Blackcell digital access card. New employees cannot enter Level 7 Administration or NEXUS.'));
    const form=el('form','');
    form.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:13px;align-items:end;margin-top:15px';
    const field=(label,type,placeholder)=>{
      const wrap=el('label');wrap.style.cssText='display:flex;flex-direction:column;gap:7px;font-size:10px;letter-spacing:.12em;color:#bab0bc';
      wrap.append(el('span','',label));
      const input=el('input');input.type=type;input.required=true;input.placeholder=placeholder;input.style.width='100%';
      wrap.append(input);form.append(wrap);return input;
    };
    const name=field('NAME','text','Full name');
    name.minLength=2;name.maxLength=80;
    const email=field('EMPLOYEE EMAIL','email','name@example.com');

    const uniqueUser=field('GENERATED USERNAME','text','bc_employee_12345');
    uniqueUser.pattern='[a-z][a-z0-9_]{5,31}';
    uniqueUser.maxLength=32;uniqueUser.autocapitalize='off';uniqueUser.spellcheck=false;
    const usernameButton=action('GENERATE USERNAME',()=>{
      uniqueUser.value=corporateUsername(name.value);
    },false);
    usernameButton.type='button';usernameButton.style.cssText='min-height:44px';
    form.append(usernameButton);

    function codeGenerator(label,count){
      const wrap=el('div');
      wrap.style.cssText='display:flex;flex-direction:column;gap:8px';
      const caption=el('label','',label);
      caption.style.cssText='font-size:10px;letter-spacing:.12em;color:#bcb2bf';
      const input=el('input');
      input.type='password';input.readOnly=true;input.required=true;
      input.autocomplete='off';input.inputMode='numeric';
      input.maxLength=count;input.minLength=count;
      input.placeholder=count+' random digits';input.style.width='100%';
      const buttons=el('div');buttons.style.cssText='display:flex;gap:6px';
      const gen=action('GENERATE',()=>{input.value=corporateRandomDigits(count);},false);
      gen.type='button';
      const reveal=action('REVEAL',()=>{
        input.type=input.type==='password'?'text':'password';
        reveal.textContent=input.type==='text'?'HIDE':'REVEAL';
      },false);
      reveal.type='button';
      const copy=action('COPY',()=>{
        if(input.value)navigator.clipboard?.writeText(input.value).then(()=>{
          copy.textContent='COPIED ✓';
        }).catch(()=>{copy.textContent='SELECT TO COPY';input.type='text';input.select();});
      },false);
      copy.type='button';
      buttons.append(gen,reveal,copy);
      wrap.append(caption,input,buttons);form.append(wrap);
      return input;
    }
    const accessCode=codeGenerator('ACCESS CODE · 4 DIGITS',4);
    const securityCode=codeGenerator('SECURITY CODE · 12 DIGITS',12);
    if(pendingReinvite){
      name.value=pendingReinvite.name;
      email.value=pendingReinvite.email;
      uniqueUser.value=corporateUsername(pendingReinvite.name);
      accessCode.value=corporateRandomDigits(4);
      securityCode.value=corporateRandomDigits(12);
      pendingReinvite=null;
    }
    const levelLabel=el('label');levelLabel.style.cssText='display:flex;flex-direction:column;gap:7px;font-size:10px;letter-spacing:.12em;color:#bab0bc';
    levelLabel.append(el('span','','CLEARANCE'));
    const level=el('select');for(let i=1;i<=6;i++)level.add(new Option('Level '+i,i));
    level.value='1';levelLabel.append(level);form.append(levelLabel);
    const previewInvite=action('PREVIEW INVITATION',()=>{
      showInvitationPreview(form,{name,email,username:uniqueUser,level});
    });
    previewInvite.type='button';
    previewInvite.style.cssText='width:100%;min-height:44px';
    form.append(previewInvite);
    const previewCard=action('PREVIEW EMPLOYEE CARD',()=>{
      section.querySelector('.employee-card-inline-preview')?.remove();
      const preview=el('div','employee-card-inline-preview');
      preview.append(el('h3','','SAMPLE EMPLOYEE CARD · NOT REGISTERED'));
      preview.append(employeeCardView({
        display_name:name.value.trim()||'Sample Employee',
        username:uniqueUser.value.trim()||'bc_sample_48271',
        email:email.value.trim()||'sample@example.com',
        clearance_level:Number(level.value),role:'employee',active:false,
        can_chat:true,password_activated:false
      },true));
      preview.append(action('CLOSE CARD PREVIEW',()=>preview.remove()));
      section.append(preview);
      preview.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    previewCard.type='button';previewCard.style.cssText='width:100%;min-height:44px';
    form.append(previewCard);
    const previewCodes=action('PREVIEW ACCESS & SECURITY CARD',()=>{
      showSecurityCodeCardPreview(form,{name,username:uniqueUser,level,accessCode,securityCode});
    });
    previewCodes.type='button';
    previewCodes.style.cssText='width:100%;min-height:44px';
    form.append(previewCodes);
    const testConnection=action('CHECK CONNECTION — NO EMAIL',null,false);
    testConnection.type='button';
    testConnection.style.cssText='width:100%;min-height:44px;border-color:#7c6470';
    form.append(testConnection);
    const submit=action('SEND EMPLOYEE INVITATION',null,false,true);
    submit.type='submit';submit.style.cssText='width:100%;min-height:44px';
    form.append(submit);
    const feedback=el('p','muted','');
    feedback.setAttribute('role','status');
    feedback.setAttribute('aria-live','polite');
    const inviteReasons={
      verified_level7_owner_required:'Your Level 7 owner verification has expired. Sign in and verify your master codes again.',
      sign_in_required:'Sign in to the corporate network again.',
      username_check_unavailable:'Supabase could not check existing usernames. The invitation was not sent.',
      invite_limit_check_failed:'Supabase could not check the hourly invitation limit.',
      invitation_backend_not_ready:'The secure Supabase invitation backend is not ready.',
      invitation_service_not_configured:'Supabase employee invitation configuration is incomplete.',
      invitation_service_unavailable:'The employee invitation service is unavailable.',
      invalid_employee_credentials:'Check the email, name, username, 4-digit Access Code, and 12-digit Security Code.',
      username_already_used:'This username is already in use. Generate a different one.',
      cannot_invite_owner:'You cannot invite your own owner email as an employee.',
      invitation_failed:'Supabase could not send the invitation. Check Authentication → Email settings.',
      supabase_email_rate_limit:'Supabase has temporarily reached its built-in email sending limit. The employee was not invited. Try again after the quota resets, or configure custom SMTP for larger volumes.',
      employee_email_already_registered:'An Auth user with this email already exists. Check User Management → Profiles before creating another invitation.',
      email_recipient_not_authorized:'Supabase built-in email sending is restricted to authorized recipients. Set up custom SMTP to invite other addresses.',
      registration_not_completed:'The account could not be provisioned; employee access was not activated.',
      hourly_invitation_limit:'The hourly employee invitation limit has been reached.'
    };
    async function inviteOutcome(data,error){
      let detail=data;
      let status=Number(error?.context?.status)||0;
      if(error?.context && typeof error.context.clone==='function'){
        try{
          const raw=await error.context.clone().text();
          if(raw)detail=JSON.parse(raw);
        }catch(_){}
      }
      if(!error && detail?.ok===true)return {ok:true,detail,status};
      const reason=typeof detail?.reason==='string'?detail.reason:'request_error';
      const message=inviteReasons[reason]||(typeof detail?.detail==='string'&&detail.detail)||error?.message||'The request was rejected.';
      return {ok:false,detail,status,reason,message:(status?'HTTP '+status+' — ':'')+message+' ['+reason+']'};
    }
    testConnection.addEventListener('click',async()=>{
      const api=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
      if(!api){feedback.textContent='Corporate owner authentication is not available. Please sign in again.';return;}
      testConnection.disabled=true;
      testConnection.textContent='CHECKING SECURE CONNECTION…';
      feedback.textContent='Checking Level 7 authorization, employee database access, and invitation administration. No email will be sent.';
      try{
        const {data,error}=await api.functions.invoke('blackcell-invite-employee',{body:{action:'check'}});
        const result=await inviteOutcome(data,error);
        if(!result.ok){feedback.textContent='Connection check failed: '+result.message;return;}
        if(result.detail?.status!=='backend_ready'){feedback.textContent='Connection check returned an unexpected result. No email was sent.';return;}
        feedback.textContent='✓ CONNECTION VERIFIED — owner authorization, employee database, and Auth administration are reachable. No invitation was sent.';
      }catch(err){
        feedback.textContent='Connection check failed: '+String(err?.message||'Network unavailable');
      }finally{
        testConnection.disabled=false;
        testConnection.textContent='CHECK CONNECTION — NO EMAIL';
      }
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      if(!name.value.trim()||!email.value.trim())return;
      if(!/^[a-z][a-z0-9_]{5,31}$/.test(uniqueUser.value)){
        feedback.textContent='Generate a valid unique employee username first.';return;
      }
      if(!/^[0-9]{4}$/.test(accessCode.value)||!/^[0-9]{12}$/.test(securityCode.value)){
        feedback.textContent='Generate both codes: 4 digits for Access Code and 12 for Security Code.';return;
      }
      const api=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
      if(!api){feedback.textContent='Corporate administrator authentication is unavailable.';return}
      submit.disabled=true;submit.textContent='SENDING INVITATION…';
      feedback.textContent='Requesting a secure employee invitation…';
      try{
        const {data,error}=await api.functions.invoke('blackcell-invite-employee',{
          body:{email:email.value.trim(),display_name:name.value.trim(),clearance_level:Number(level.value),
            username:uniqueUser.value,access_code:accessCode.value,security_code:securityCode.value}
        });
        const outcome=await inviteOutcome(data,error);
        if(!outcome.ok){
          feedback.textContent='Invitation not sent: '+outcome.message;
          return;
        }
        feedback.textContent='Invitation created. Codes are encrypted for automatic delivery in a second email after password activation. Keep a backup until the credential email service is verified.';
        const receipt=el('div','content-block');
        receipt.dataset.blackcellReceipt='true';
        receipt.style.cssText='border:1px solid #648774;border-radius:14px;padding:16px;margin-top:15px';
        receipt.append(el('h3','','EMPLOYEE CREDENTIALS · ADMIN BACKUP'));
        const textReceipt='Blackcell Employee: '+name.value.trim()+
          '\nUsername: '+uniqueUser.value+'\nAccess Code (4 digits): '+accessCode.value+
          '\nSecurity Code (12 digits): '+securityCode.value+
          '\nEmployee activation: https://blackcellcorp.com/employee.html';
        const pre=el('pre','',textReceipt);
        pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';
        const copyReceipt=action('COPY CREDENTIALS',()=>{
          navigator.clipboard?.writeText(textReceipt).then(()=>{
            copyReceipt.textContent='COPIED ✓';
          }).catch(()=>{pre.tabIndex=0;pre.focus();});
        },false);
        copyReceipt.type='button';
        const dismiss=action('HIDE CREDENTIALS',()=>{
          receipt.remove();
          accessCode.value='';securityCode.value='';uniqueUser.value='';
        },false);
        dismiss.type='button';
        receipt.append(pre,copyReceipt,dismiss);
        feedback.after(receipt);
        name.value='';email.value='';accessCode.value='';securityCode.value='';uniqueUser.value='';
        void displayCorporateAccounts(list);
      }catch(err){feedback.textContent='Invitation not sent: '+String(err?.message||'Check the network and email service.')}
      finally{submit.disabled=false;submit.textContent='SEND EMPLOYEE INVITATION';}
    });
    section.append(form,feedback);
    section.classList.add('um2-invite-panel');
    const list=block('Approved & Invited Accounts');
    list.classList.add('um2-account-panel');
    list.append(p('Loading corporate accounts…'));
    const workspace=el('div','um2-workspace');workspace.append(section,list);
    content.append(workspace);
    void displayCorporateAccounts(list);
  }else if(activeTab==='profiles'){
    void employeeProfiles();
  }else if(activeTab==='roles'){
    const section=block('Security Clearance Levels');
    section.append(p('Level 7 is reserved for the corporate owner. Levels 1–6 are for employees. An employee clearance level alone does not grant access to this Administration dashboard or NEXUS.'));
    content.append(section);
    void loadClearanceLevels(section);
  }else{
    const section=block('Employee Access Permissions');
    section.append(p('Enable or disable employee chat and corporate access. Divisions remain separately protected; these controls do not grant NEXUS or MansArmedForces permissions.'));
    content.append(section);
    void displayEmployeeAccess(section);
  }
}
async function displayCorporateAccounts(container){
  const api=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
  if(!api)return;
  try{
    const {data,error}=await api.rpc('corp_admin_members');
    if(!container.isConnected)return;
    if(error||data?.ok!==true||!Array.isArray(data.members)){
      container.append(p('Accounts could not be loaded. Please verify your Level 7 session.'));return;
    }
    container.replaceChildren(el('h3','','Approved & Invited Accounts'));
    for(const member of data.members){
      const right=member.role==='owner'?'LEVEL 7 · OWNER':
        (member.active?(member.password_activated?'ACTIVE':'INVITED · PASSWORD PENDING'):'DISABLED');
      const view=el('div','employee-profile-actions');
      view.append(el('span','mock-state',right),
        action('VIEW PROFILE',()=>showEmployeeProfile(member)));
      if(member.role==='employee'){
        const deleteAction=action('DELETE PROFILE',()=>confirmEmployeeDelete(member,'accounts'));
        deleteAction.classList.add('delete-employee-button');
        view.append(deleteAction);
      }
      container.append(row(member.display_name||'Employee',
        (member.email||'')+' · '+(member.username||'No username')+' · Level '+member.clearance_level,view));
    }
  }catch(_){if(container.isConnected)container.append(p('Unable to load accounts.'))}
}
async function displayEmployeeAccess(container){
  const api=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
  if(!api)return;
  const status=el('p','muted','Loading employee permissions…');container.append(status);
  try{
    const {data,error}=await api.rpc('corp_admin_members');
    if(!container.isConnected)return;
    if(error||data?.ok!==true||!Array.isArray(data.members)){
      status.textContent='Unable to verify permissions.';return;
    }
    status.remove();
    const employees=data.members.filter(m=>m.role!=='owner');
    if(!employees.length){container.append(p('No employee accounts yet. Start from the Accounts tab.'));return;}
    for(const member of employees){
      const section=el('div','content-block');
      section.append(el('h3','',member.display_name||'Employee'),p(member.email||''));
      const controls=el('div');controls.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap';
      const check=(labelText,checked)=>{
        const label=el('label');label.style.cssText='display:flex;gap:8px;align-items:center';
        const input=el('input');input.type='checkbox';input.checked=checked;
        label.append(input,document.createTextNode(labelText));return {label,input};
      };
      const enabled=check('Account enabled',member.active),chat=check('Employee Chat',member.can_chat);
      controls.append(enabled.label,chat.label);
      const save=action('SAVE PERMISSIONS',async()=>{
        save.disabled=true;save.textContent='SAVING…';
        try{
          const {data:updated,error:updateError}=await api.rpc('corp_admin_update_employee',{
            p_user_id:member.user_id,p_level:member.clearance_level,
            p_can_chat:chat.input.checked,p_active:enabled.input.checked
          });
          save.textContent=updateError||updated?.ok!==true?'NOT SAVED':'SAVED ✓';
        }catch(_){save.textContent='NOT SAVED'}
        finally{save.disabled=false}
      },false,true);
      controls.append(save);section.append(controls);container.append(section);
    }
  }catch(_){status.textContent='Could not load employee access permissions.'}
}
async function loadClearanceLevels(container){
  const api=window.BLACKCELL_CORPORATE_ADMIN_API?.client;
  const status=el('p','muted','Loading approved corporate members…');
  container.append(status);
  if(!api){status.textContent='Corporate session is unavailable.';return}
  try{
    const {data,error}=await api.rpc('corp_list_clearance');
    if(!container.isConnected)return;
    if(error||data?.ok!==true||!Array.isArray(data.members)){
      status.textContent='Could not verify administrator clearance. No changes are allowed.';
      return;
    }
    status.remove();
    if(!data.members.length){
      container.append(p('No approved accounts were found.'));
      return;
    }
    for(const member of data.members){
      const entry=el('div','list-row');
      const details=el('div');
      details.append(el('b','',member.display_name||'Corporate Member'),
        el('small','',String(member.role||'employee').toUpperCase()+
          ' · Current Level '+String(member.clearance_level)));
      entry.append(details);
      if(member.role==='owner'){
        entry.append(el('span','mock-state','LEVEL 7 · OWNER'));
      }else{
        const controls=el('div');
        controls.style.cssText='display:flex;gap:7px;align-items:center;flex-wrap:wrap';
        const dropdown=el('select');
        dropdown.setAttribute('aria-label','Clearance level for '+(member.display_name||'employee'));
        for(let level=1;level<=6;level++){
          const option=new Option('Level '+level,String(level));
          dropdown.add(option);
        }
        dropdown.value=String(member.clearance_level);
        const save=action('SAVE LEVEL',async()=>{
          save.disabled=true;
          save.textContent='SAVING…';
          try{
            const {data:changed,error:changeError}=await api.rpc('corp_set_clearance_level',{
              p_user_id:member.user_id,p_level:Number(dropdown.value)
            });
            if(changeError||changed?.ok!==true){
              save.textContent='NOT SAVED';
            }else{
              member.clearance_level=Number(dropdown.value);
              save.textContent='SAVED ✓';
              details.querySelector('small').textContent=
                String(member.role).toUpperCase()+' · Current Level '+member.clearance_level;
            }
          }catch(_){save.textContent='NOT SAVED'}
          finally{save.disabled=false}
        });
        controls.append(dropdown,save);
        entry.append(controls);
      }
      container.append(entry);
    }
  }catch(_){if(container.isConnected)status.textContent='Clearance levels could not be loaded.'}
}

/* Corporate operations. All privileged functions below execute with an owner-
   validated Supabase session. No admin-side changes rely on client-only role flags. */
const defaultCorpPreferences=Object.freeze({theme:'glass',animations:true,notifications:true,confirm_actions:true});
let corporatePreferences={...defaultCorpPreferences};
function corporateApi(){return window.BLACKCELL_CORPORATE_ADMIN_API?.client||null;}
async function corporateRpc(name,params={}){
  const client=corporateApi();
  if(!client)throw new Error('Administrator session not available. Sign in with your Level 7 account.');
  const {data,error}=await client.rpc(name,params);
  if(error)throw new Error(error.message||'Secure operation failed');
  if(!data||data.ok!==true)throw new Error(data?.reason==='owner_verification_required'?
    'Level 7 owner verification has expired. Please sign in again.':data?.reason||'Secure operation was not accepted.');
  return data;
}
function corpDate(value){
  if(!value)return 'Not recorded';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'Not recorded':d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function corpStatus(container,text,error=false){
  container.textContent=text;
  container.setAttribute('role','status');
  container.classList.toggle('corp-error',error);
}
function corpDownload(filename,obj){
  const bytes=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(bytes),link=document.createElement('a');
  link.href=url;link.download=filename;link.style.display='none';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function applyCorporatePreferences(value){
  corporatePreferences={...defaultCorpPreferences,...value};
  const theme=corporatePreferences.theme;
  document.body.dataset.appearance=['glass','black','silver'].includes(theme)?theme:'glass';
  document.body.classList.toggle('corp-motion-reduced',!corporatePreferences.animations);
  const icon=document.querySelector('.header-end [data-open="notifications"]');
  if(icon)icon.hidden=!corporatePreferences.notifications;
}
async function loadCorporatePreferences(){
  try{
    const data=await corporateRpc('corp_admin_console_preferences',{p_action:'get'});
    applyCorporatePreferences(data.preferences);
  }catch(_){ /* owner authorization will block in other workflows */ }
}
function corporatePanel(title,intro){
  const shell=el('section','content-block corp-live-panel');
  shell.append(el('div','corp-panel-overline','BLACKCELL / OWNER OPERATIONS'),
    el('h3','',title),p(intro));
  content.append(shell);return shell;
}
function security(){
  if(activeTab==='overview'){
    const shell=corporatePanel('Corporate Security Overview','Live verification, employee status, and identity activity from the secured corporate database.');
    const result=el('div','corp-live-result');result.append(p('Loading corporate security information…'));shell.append(result);
    const control=el('div','actions');
    control.append(action('⟳ REFRESH SECURITY CHECK',()=>{activeTab='overview';render();}));
    shell.append(control);
    void (async()=>{
      try{
        const info=await corporateRpc('corp_admin_security_overview');
        if(!result.isConnected||activeModal!=='security')return;
        result.replaceChildren();
        const g=grid();
        [['Owner verified',info.owner_verified?'YES':'NO'],
         ['Owner sessions',String(info.owner_sessions?.length||0)],
         ['Active employees',String(info.active_employees??0)],
         ['Employee sessions',String(info.active_employee_verifications??0)],
         ['Failed master-code attempts',String(info.master_code_failed_attempts??0)],
         ['Disabled employees',String(info.disabled_employees??0)]].forEach(x=>g.append(card(...x)));
        result.append(g);
        const notes=block('Verification details');
        notes.append(row('Master code lock','Applies only if the existing gateway has enforced a lock',
          info.owner_master_code_locked_until&&new Date(info.owner_master_code_locked_until)>new Date()?
          'LOCKED UNTIL '+corpDate(info.owner_master_code_locked_until):'NO ACTIVE LOCK'));
        notes.append(row('Security read time','Supabase database time',corpDate(info.read_at)));
        result.append(notes);
        if(info.master_code_failed_attempts>0)
          result.append(note('Master-code failure count is cumulative in the current gateway record, not a count of unique login events.'));
      }catch(err){if(result.isConnected)result.replaceChildren(note('Security check unavailable: '+String(err.message||err)));}
    })();
  }else if(activeTab==='sessions'){
    const shell=corporatePanel('Corporate Verification Sessions',
      'Review Level 7 owner verification sessions. Revoke other corporate verification grants without deleting user accounts.');
    const result=el('div');result.append(p('Loading secure session list…'));shell.append(result);
    void (async()=>{
      try{
        const data=await corporateRpc('corp_admin_security_overview');
        if(!result.isConnected||activeModal!=='security')return;
        result.replaceChildren();
        const sessions=data.owner_sessions||[];
        if(!sessions.length)result.append(note('No unexpired corporate verification grants found.'));
        for(const item of sessions){
          result.append(row(item.current?'Current owner session':'Another owner session',
            'Verified '+corpDate(item.verified_at),
            item.current?'THIS DEVICE':'Expires '+corpDate(item.expires_at)));
        }
        const feedback=el('p','muted','');feedback.setAttribute('role','status');
        const actions=el('div','actions');
        const revoke=action('REVOKE OTHER CORPORATE SESSIONS',async()=>{
          if(!confirm('Revoke all other Level 7 corporate verification grants? Those sessions will need to reverify. This does not revoke Supabase Auth tokens or sessions in other applications.'))return;
          revoke.disabled=true;corpStatus(feedback,'Revoking other corporate verification grants…');
          try{
            const response=await corporateRpc('corp_admin_revoke_other_verified_sessions');
            corpStatus(feedback,'Revoked '+response.revoked+' other corporate verification grant(s). Your current session remains active.');
            setTimeout(()=>{if(activeModal==='security'&&activeTab==='sessions')render()},1000);
          }catch(err){corpStatus(feedback,String(err.message||err),true);revoke.disabled=false;}
        });
        actions.append(revoke);result.append(actions,feedback);
        result.append(note('This action revokes corporate code verification grants only. It does not log users out of NEXUS, Supabase Auth, or other independent applications.'));
      }catch(err){if(result.isConnected)result.replaceChildren(note('Unable to inspect verified sessions: '+String(err.message||err)));}
    })();
  }else{
    const shell=corporatePanel('Security Notifications & Controls','Only configured capabilities are available. Server alerts are not silently enabled by a cosmetic switch.');
    const status=el('p','muted','Loading your preferences…');shell.append(status);
    const goto=action('OPEN CONFIGURED PREFERENCES',()=>{activeModal='settings';activeTab='preferences';render()});
    shell.append(goto);
    shell.append(note('Live checks and recorded security events are available. Automatic new-device email/SMS alerts require a separate server-side notification pipeline and are not enabled here.'));
    void loadCorporatePreferences().then(()=>{if(status.isConnected)status.textContent='Saved Administration preferences loaded. You can change them in System Settings.'});
  }
}
function settings(){
  if(activeTab==='general'){
    const shell=corporatePanel('Corporate Identity','Verified account details and the connected corporate application—not an editable fake profile.');
    const body=el('div');body.append(p('Loading administrator account…'));shell.append(body);
    void (async()=>{
      try{
        const client=corporateApi();
        if(!client)throw new Error('Administrator session unavailable');
        const {data,error}=await client.auth.getUser();
        if(error||!data?.user)throw new Error('Account authentication failed');
        const members=await corporateRpc('corp_admin_members');
        if(!body.isConnected||activeModal!=='settings')return;
        const owner=members.members?.find(m=>m.user_id===data.user.id);
        body.replaceChildren();
        body.append(row('Corporation','Official network name','BLACKCELL CORPORATION'),
          row('Owner name','From the secured personnel directory',owner?.display_name||'Verified owner'),
          row('Administrator email','Supabase Authentication',data.user.email||'Not available'),
          row('Clearance','Server-enforced permissions','LEVEL 7 / OWNER'));
      }catch(err){if(body.isConnected)body.replaceChildren(note('Identity unavailable: '+String(err.message||err)));}
    })();
  }else if(activeTab==='appearance'||activeTab==='preferences'){
    const shell=corporatePanel(activeTab==='appearance'?'Appearance & Layout':'Administration Preferences',
      'Saved to your Level 7 owner profile in Supabase. These controls affect this Administration interface, not other BLACKCELL applications.');
    const form=el('form','corp-settings-form');
    const theme=el('label','field','ADMINISTRATION THEME');
    const chooser=select([['glass','Ultra-Dark Apple Glass'],['black','Pure Black'],['silver','Charcoal & Silver']],corporatePreferences.theme,()=>{});
    theme.append(chooser);form.append(theme);
    function toggle(title,description,key){
      const label=el('label','corp-pref-toggle'),copy=el('div');
      copy.append(el('b','',title),el('small','',description));
      const input=el('input');input.type='checkbox';input.checked=!!corporatePreferences[key];
      label.append(copy,input);form.append(label);return input;
    }
    const animation=toggle('Interface animations','Control dashboard motion and transitions','animations');
    const notifications=toggle('Show notification shortcut','Show or hide the Administration notification icon','notifications');
    const confirmActions=toggle('Confirm routine actions','Ask before creating configuration snapshots','confirm_actions');
    const feedback=el('p','muted','');
    const save=action('SAVE ADMINISTRATION SETTINGS',null,false,true);save.type='submit';
    form.append(save,feedback);shell.append(form);
    form.addEventListener('submit',async event=>{
      event.preventDefault();save.disabled=true;corpStatus(feedback,'Saving settings securely…');
      const updated={theme:chooser.value,animations:animation.checked,notifications:notifications.checked,confirm_actions:confirmActions.checked};
      try{
        const resp=await corporateRpc('corp_admin_console_preferences',{p_action:'set',p_value:updated});
        applyCorporatePreferences(resp.preferences);
        corpStatus(feedback,'Settings saved to your verified owner profile.');
      }catch(err){corpStatus(feedback,'Save failed: '+String(err.message||err),true)}
      finally{save.disabled=false}
    });
    void (async()=>{try{
      const result=await corporateRpc('corp_admin_console_preferences',{p_action:'get'});
      if(!form.isConnected)return;
      applyCorporatePreferences(result.preferences);
      chooser.value=corporatePreferences.theme;animation.checked=corporatePreferences.animations;
      notifications.checked=corporatePreferences.notifications;
      confirmActions.checked=corporatePreferences.confirm_actions;
    }catch(err){if(feedback.isConnected)corpStatus(feedback,'Settings could not be loaded: '+String(err.message||err),true)}})();
  }else{
    const shell=corporatePanel('Corporate Divisions','Direct links to connected BLACKCELL applications. Access continues to require each application’s own permissions.');
    for(const item of systems.filter(x=>['nexus','maf','corporate'].includes(x.id))){
      const link=el('a','btn outline','OPEN '+item.name.toUpperCase()+'  ↗');
      link.href=item.href||'dashboard.html';
      link.rel='noopener noreferrer';link.target='_blank';
      shell.append(row(item.name,item.desc,link));
    }
  }
}
function logRows(container,events,query='',category='all',range='all'){
  container.replaceChildren();
  const now=Date.now(),periodMs={day:86400000,week:604800000,month:2592000000}[range]||0;
  const rows=events.filter(e=>(category==='all'||e.category===category)
    &&(!query||[e.name,e.description,e.source].join(' ').toLowerCase().includes(query.toLowerCase()))
    &&(!periodMs||now-new Date(e.at).getTime()<=periodMs));
  container.append(el('p','muted',rows.length+' recorded event(s) match these filters.'));
  if(!rows.length){container.append(el('div','empty-state','No recorded events for these filters.'));return rows;}
  rows.forEach(e=>{
    const item=el('div','corp-activity-row');
    item.append(el('span','corp-event-kind',String(e.category||'EVENT').toUpperCase()));
    const body=el('div');
    body.append(el('strong','',String(e.description||e.name)),el('small','',corpDate(e.at)+' · '+String(e.source||'database record')));
    item.append(body);container.append(item);
  });
  return rows;
}
function logs(){
  const shell=corporatePanel('Recorded Corporate Activity',
    'Actual events from owner verification sessions, employee invitations, account activation, and logged administrator actions. Not fabricated sample events.');
  const toolbar=el('div','corp-log-toolbar');
  const search=el('input');search.type='search';search.placeholder='Search recorded activity…';search.setAttribute('aria-label','Search recorded events');
  const category=select([['all','All categories'],['security','Security'],['access','Employee access'],['admin','Administration']],'all',()=>{});
  const range=select([['all','All available'],['day','Past 24 hours'],['week','Past 7 days'],['month','Past 30 days']],'all',()=>{});
  toolbar.append(search,category,range);shell.append(toolbar);
  const result=el('div','corp-activity');result.append(p('Loading recorded corporate events…'));shell.append(result);
  const actions=el('div','actions'),feedback=el('p','muted','');
  const refresh=action('⟳ REFRESH ACTIVITY',()=>{render()});
  const exportButton=action('EXPORT FILTERED EVENTS',()=>{},true);
  actions.append(refresh,exportButton);shell.append(actions,feedback);
  void (async()=>{
    try{
      const response=await corporateRpc('corp_admin_console_activity',{p_limit:200});
      if(!result.isConnected||activeModal!=='logs')return;
      const events=response.items||[];
      const draw=()=>logRows(result,events,search.value,category.value,range.value);
      search.addEventListener('input',draw);category.addEventListener('change',draw);range.addEventListener('change',draw);
      exportButton.disabled=false;
      exportButton.addEventListener('click',()=>{
        const filtered=draw();
        corpDownload('blackcell-admin-activity-'+new Date().toISOString().slice(0,10)+'.json',
          {type:'blackcell-administration-event-export',exported_at:new Date().toISOString(),source:'verified corporate database',events:filtered});
        corpStatus(feedback,filtered.length+' recorded event(s) exported as JSON.');
      });
      draw();
      shell.append(note('Coverage is limited to recorded event sources. This is not a complete log of every HTTP request, network packet, failed login, or action in an independent division.'));
    }catch(err){if(result.isConnected)result.replaceChildren(note('Activity unavailable: '+String(err.message||err)));}
  })();
}
function backups(){
  if(activeTab==='overview'){
    const shell=corporatePanel('Configuration Snapshot Center',
      'Create a checksummed snapshot of owner UI preferences and personnel totals, saved in Supabase. This is NOT a full database, employee credential, or media backup.');
    const stats=el('div');stats.append(p('Loading snapshot status…'));shell.append(stats);
    const label=el('label','field','SNAPSHOT NAME'),input=el('input');input.type='text';input.maxLength=75;input.placeholder='e.g. Before settings changes';
    label.append(input);shell.append(label);
    const feedback=el('p','muted','');
    const actions=el('div','actions');
    const create=action('CREATE VERIFIED CONFIGURATION SNAPSHOT',async()=>{
      if(corporatePreferences.confirm_actions&&!confirm('Save a configuration snapshot to the secured database? This captures only owner interface preferences and aggregate personnel counts.'))return;
      create.disabled=true;corpStatus(feedback,'Creating checksum-verified snapshot…');
      try{
        const v=await corporateRpc('corp_admin_config_snapshot',{p_action:'create',p_title:input.value.trim()||'Manual configuration snapshot'});
        corpStatus(feedback,'Snapshot saved: '+v.title+' · SHA-256 '+v.checksum.slice(0,18)+'…');
        input.value='';
        void drawStats();
      }catch(err){corpStatus(feedback,'Snapshot not saved: '+String(err.message||err),true)}
      finally{create.disabled=false}
    },false,true);
    actions.append(create,action('OPEN SNAPSHOT HISTORY',()=>{activeTab='history';render()}));
    shell.append(actions,feedback,note('Snapshots restore only the owner Administration preferences. They do not restore users, passwords, Supabase database tables, Bunny files, chats or NEXUS records.'));
    async function drawStats(){
      try{
        const r=await corporateRpc('corp_admin_config_snapshot',{p_action:'list'});
        if(!stats.isConnected)return;
        stats.replaceChildren();
        const g=grid();g.append(card('Saved snapshots',String(r.items.length)),card('Most recent',r.items.length?corpDate(r.items[0].created_at):'None yet'));stats.append(g);
      }catch(err){if(stats.isConnected)stats.replaceChildren(note('Snapshot records unavailable: '+String(err.message||err)));}
    }
    void drawStats();
  }else if(activeTab==='history'){
    const shell=corporatePanel('Configuration Snapshot History','Review, download, verify, restore owner preferences, or delete individual snapshots. Every operation is owner-authorized.');
    const result=el('div');result.append(p('Loading saved snapshots…'));shell.append(result);
    const footer=el('p','muted','');shell.append(footer);
    void (async()=>{
      try{
        const r=await corporateRpc('corp_admin_config_snapshot',{p_action:'list'});
        if(!result.isConnected||activeModal!=='backups')return;
        result.replaceChildren();
        if(!r.items.length){result.append(note('No configuration snapshots exist. Create one in Overview.'));return;}
        for(const record of r.items){
          const item=el('div','corp-backup-record'),heading=el('div');
          heading.append(el('strong','',record.title),el('small','',corpDate(record.created_at)+' · SHA-256 '+record.checksum.slice(0,15)+'…'));
          item.append(heading);
          const buttons=el('div','corp-backup-actions');
          const inspect=action('VERIFY & VIEW',async()=>{
            try{
              const v=await corporateRpc('corp_admin_config_snapshot',{p_action:'get',p_id:record.id});
              const pre=el('pre','corp-json-view',JSON.stringify(v.payload,null,2));
              item.querySelector('.corp-json-view')?.remove();item.append(pre);
              corpStatus(footer,'Checksum verified by the secure database for '+v.title+'.');
            }catch(err){corpStatus(footer,'Unable to verify: '+String(err.message||err),true)}
          });
          const download=action('DOWNLOAD',async()=>{
            try{
              const v=await corporateRpc('corp_admin_config_snapshot',{p_action:'get',p_id:record.id});
              corpDownload('blackcell-config-'+record.id.slice(0,8)+'.json',
                {title:v.title,checksum:v.checksum,checksum_verified:v.checksum_verified,payload:v.payload});
              corpStatus(footer,'Verified snapshot exported. Store it securely.');
            }catch(err){corpStatus(footer,'Export failed: '+String(err.message||err),true)}
          });
          const restore=action('RESTORE UI SETTINGS',async()=>{
            if(!confirm('Restore Administration appearance and preference settings from this snapshot? Employee accounts, chat, databases and storage will NOT be restored or modified.'))return;
            try{
              const v=await corporateRpc('corp_admin_config_snapshot',{p_action:'restore_preferences',p_id:record.id});
              applyCorporatePreferences(v.preferences);
              corpStatus(footer,'Owner Administration preferences restored. Other systems were not modified.');
            }catch(err){corpStatus(footer,'Restore rejected: '+String(err.message||err),true)}
          });
          const erase=action('DELETE',async()=>{
            if(!confirm('Permanently delete this single configuration snapshot?'))return;
            try{await corporateRpc('corp_admin_config_snapshot',{p_action:'delete',p_id:record.id});
              item.remove();corpStatus(footer,'Snapshot deleted.');}
            catch(err){corpStatus(footer,'Delete failed: '+String(err.message||err),true)}
          });
          erase.classList.add('delete-employee-button');
          buttons.append(inspect,download,restore,erase);item.append(buttons);result.append(item);
        }
      }catch(err){if(result.isConnected)result.replaceChildren(note('Unable to load saved snapshots: '+String(err.message||err)));}
    })();
  }else{
    const shell=corporatePanel('Recovery Scope & Limitations',
      'Only configuration snapshots are supported here. Full storage/database disaster recovery remains a separate infrastructure project.');
    shell.append(row('Administration preferences','Create, inspect and restore from checksummed snapshots','AVAILABLE'),
      row('Personnel identity recovery','Requires secured Auth and database backups','NOT CONFIGURED'),
      row('NEXUS data recovery','Requires verified full database and storage backups','NOT CONFIGURED'),
      row('Bunny Storage recovery','Requires independent protected file replication','NOT CONFIGURED'),
      note('Scheduled off-site backups, complete restore testing, and point-in-time recovery cannot be activated from this interface until the relevant backend systems are configured.'));
  }
}
function systemResults(container){
  container.replaceChildren();
  const data=systems.filter(x=>[x.name,x.kind,x.provider].join(' ').toLowerCase().includes(searchTerm.toLowerCase()));
  container.append(p(data.length+' configured corporate service entries.'));
  if(!data.length)container.append(el('div','empty-state','No matching services.'));
  const health=window.BLACKCELL_HEALTH?.snapshot?.()||[];
  const map={nexus:'database',maf:'web',gunner:'ai',corporate:'web'};
  data.forEach(item=>{
    const svc=health.find(v=>v.id===map[item.id]),label=svc?.state||'unknown';
    const section=el('div','corp-service-entry'),left=el('div');
    left.append(el('strong','',item.name),el('small','',item.kind+' · '+item.provider));
    const right=el('div','corp-service-actions');
    const stateLabel=el('span','corp-service-status',label==='online'?'● RESPONDING':label==='attention'?'● REVIEW':label==='offline'?'● UNREACHABLE':'● NOT VERIFIED');
    stateLabel.dataset.state=label;right.append(stateLabel);
    if(item.href){const link=el('a','btn outline','OPEN ↗');link.href=item.href;link.rel='noopener noreferrer';link.target='_blank';right.append(link)}
    section.append(left,right);container.append(section);
  });
  container.append(note('A successful network check does not prove that every feature in an application is healthy. Independent service checks have their own coverage.'));
}
function corporateSystems(){
  if(activeTab==='infrastructure'||activeTab==='monitoring'){
    const shell=corporatePanel(activeTab==='monitoring'?'Verified Live Health Checks':'Connected Infrastructure',
      'Service responses are collected by the authenticated system monitor. Green means a recent successful check, not guaranteed continuous uptime.');
    if(window.BLACKCELL_HEALTH){
      window.BLACKCELL_HEALTH.renderInto(shell);
      shell.append(action('RUN CURRENT SYSTEM CHECKS',()=>{void window.BLACKCELL_HEALTH.refresh()}));
    }else shell.append(note('Monitor not initialized. Reload the Administration dashboard to load diagnostics.'));
    return;
  }
  const shell=corporatePanel('Corporate Application Directory','Launch approved divisions and review verified system health in one place.');
  const bar=el('label','field','SEARCH SERVICES'),q=el('input');q.type='search';q.placeholder='Search connected systems…';q.value=searchTerm;
  bar.append(q);shell.append(bar);
  const list=el('div');shell.append(list);
  q.addEventListener('input',()=>{searchTerm=q.value;systemResults(list)});
  systemResults(list);
  shell.append(action('VIEW SERVER HEALTH MONITOR',()=>{
    close();document.getElementById('systemHealth')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}
function division(){let nexus=activeModal==='nexus',name=names[activeModal];let b=block('Division Overview');b.append(p(nexus?'Private management operations, records, communications and financial systems.':'Photo collections, review workflows, album organization, and AI-related projects.'));let g=grid();(nexus?[['Records','Profiles and activity'],['Communications','Messaging and analysis'],['Financial','Budget and transactions'],['System Health','Not connected']]:[['Uniforms','Photo library and albums'],['Collections','Inmate and media collections'],['Gunner AI','Separate AI project'],['System Health','Not connected']]).forEach(x=>{let c=card(x[0],x[1]);g.append(c)});b.append(g);content.append(b);let a=el('a','btn primary full',`Open ${name} Website ↗`);a.href=nexus?'https://www.blackcellcorp.com':'mans-armed-forces.html';a.target='_blank';a.rel='noopener noreferrer';content.append(a,note('This opens the independent website. Existing authentication, permissions, and policies still apply. Corporate preview access does not sign you in.'));}
function notifications(){let b=block('Notifications');b.append(p('No live corporate notifications are connected. Future authenticated events can include new-device alerts, failed sign-ins, system incidents, and administrator updates.'));content.append(b);}
function account(){let b=block('Administrator Profile');b.append(row('Corporate role','Proposed primary administrator','Owner'),row('Account identity','No authenticated corporate account','Not connected'));content.append(b,note('The corporate login is a preview; account credentials and roles must be confirmed by a secure backend.'));}
function signout(){content.append(note('This preview cannot revoke GitHub Pages, Supabase, or other application sessions. Global sign-out requires separately authorized server integrations.'));let b=el('div','actions');b.append(action('Cancel',close));let a=el('a','btn outline','Return to Login Preview');a.href='index.html';b.append(a);content.append(b);}
function restricted(){content.append(note('Service identifiers are placeholders. A production operator would require server-side authorization before service details could be unlocked.'),action('Verify & Unlock — Not Connected',null,true));}
const openDrawer=()=>{$('drawer').classList.add('open');$('drawer').setAttribute('aria-hidden','false');$('drawerShade').hidden=false;$('menuButton').setAttribute('aria-expanded','true');};
const closeDrawer=()=>{$('drawer').classList.remove('open');$('drawer').setAttribute('aria-hidden','true');$('drawerShade').hidden=true;$('menuButton').setAttribute('aria-expanded','false');};
$('menuButton').addEventListener('click',openDrawer);$('closeDrawer').addEventListener('click',closeDrawer);$('drawerShade').addEventListener('click',closeDrawer);$('navHome').addEventListener('click',()=>{closeDrawer();scrollTo({top:0,behavior:'smooth'})});$('closeModal').addEventListener('click',close);modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!modal.hidden)close();else closeDrawer()}if(e.key==='Tab'&&!modal.hidden){let controls=[...pane.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(x=>x.getClientRects().length);if(!controls.length)return;let first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.open==='chat'){closeDrawer();window.dispatchEvent(new Event('blackcell-open-imessage'));return}open(btn.dataset.open,btn)}));
// Retired fabricated infrastructure IDs. Real, authenticated server checks live in Corporate System Monitor.
// Set only after the navigation, modal, and button event handlers initialize.
window.BLACKCELL_ADMIN_READY=true;
document.documentElement.dataset.adminControls='ready';
})();
