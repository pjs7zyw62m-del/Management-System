'use strict';
(()=>{
const $=id=>document.getElementById(id), modal=$('modalBackdrop'), content=$('modalContent'), pane=modal.querySelector('.admin-modal');
let lastTrigger=null,activeModal='',activeTab='',searchTerm='',period='all',selectedEvent=null,selectedSystem=null;
const state={appearance:'glass',animations:true,notify:true,confirm:true,securityNotify:true,deviceAlerts:true,autoBackup:false,restoreConfirm:true};
const systems=[{id:'nexus',name:'NEXUS Management',kind:'Corporate application',provider:'GitHub Pages · Supabase',desc:'Inmate profiles, financial management, records, communications and analysis.',href:'https://www.blackcellcorp.com',icon:'▦'},{id:'maf',name:'MansArmedForces',kind:'Media collection',provider:'GitHub Pages · Browser storage',desc:'Uniforms photo library, albums, folders, ratings and collections.',href:'https://pjs7zyw62m-del.github.io/Gunner-Collection-Portal/uniforms.html',icon:'◇'},{id:'gunner',name:'Gunner Thompson AI',kind:'AI application',provider:'AI inference services',desc:'Character AI service; account-level connectivity not monitored.',href:null,icon:'✳'},{id:'corporate',name:'Blackcell Corporate Portal',kind:'Administrative interface',provider:'GitHub Pages',desc:'Corporate dashboard and administration preview.',href:null,icon:'▤'}];
const demoEvents=[{id:'EX-01',type:'security',title:'Example: Unrecognized sign-in attempt',description:'Fictional sample alert; no actual sign-in event was retrieved.',date:'2026-11-08',display:'Nov 8, 2026 · 9:42 AM'},{id:'EX-02',type:'admin',title:'Example: Corporate settings updated',description:'Fictional sample administrative change.',date:'2026-11-08',display:'Nov 8, 2026 · 8:15 AM'},{id:'EX-03',type:'access',title:'Example: Administrator signed in',description:'Fictional sample access event.',date:'2026-11-07',display:'Nov 7, 2026 · 7:30 PM'},{id:'EX-04',type:'admin',title:'Example: Division configuration viewed',description:'Fictional sample division activity.',date:'2026-11-07',display:'Nov 7, 2026 · 6:05 PM'},{id:'EX-05',type:'security',title:'Example: Password verification failed',description:'Fictional sample credential event.',date:'2026-11-06',display:'Nov 6, 2026 · 4:20 PM'}];
const names={nexus:'NEXUS Management',mans:'MansArmedForces',users:'User Management',chat:'Employee Chat',security:'Security Center',settings:'System Settings',logs:'Activity Logs',backups:'Backup & Recovery',systems:'Corporate Systems',account:'My Account',notifications:'Corporate Notifications',signout:'Global Secure Sign Out',restricted:'Restricted Infrastructure'};
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
function render(){ $('modalTitle').textContent=names[activeModal]||'Corporate System'; $('modalEyebrow').textContent=activeModal==='nexus'||activeModal==='mans'?'BLACKCELL CORPORATION / DIVISION CONTROL':'BLACKCELL CORPORATION / ADMINISTRATION';content.replaceChildren();if(tabs[activeModal]){let bar=el('div','modal-tabbar');for(const [id,label] of tabs[activeModal]){let b=action(label,()=>{activeTab=id;render();});b.className=id===activeTab?'active':'';bar.append(b)}content.append(bar)}switch(activeModal){case 'users':users();break;case 'chat':chat();break;case 'security':security();break;case 'settings':settings();break;case 'logs':logs();break;case 'backups':backups();break;case 'systems':corporateSystems();break;case 'nexus':case 'mans':division();break;case 'notifications':notifications();break;case 'account':account();break;case 'signout':signout();break;case 'restricted':restricted();break;}}


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
    el('div','employee-profile-network','EMPLOYEE NETWORK'),
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
function showEmployeeProfile(member,sample=false){
  $('modalTitle').textContent=sample?'Sample Employee Profile':'Employee Profile';
  $('modalEyebrow').textContent='BLACKCELL CORPORATION / USER MANAGEMENT';
  content.replaceChildren();
  const back=action('← BACK TO PROFILES',()=>{activeTab='profiles';render();});
  back.classList.add('profile-back-button');
  content.append(back,employeeCardView(member,sample));
  if(!sample && member.role!=='owner'){
    const side=el('div','disabled-callout','Profile details are read-only here. Use the Roles and Access tabs to update clearance and account permissions.');
    content.append(side);
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
    list.replaceChildren();
    for(const member of data.members){
      const item=el('div','employee-profile-listitem');
      const info=el('div');
      info.append(el('strong','',member.display_name||'Employee'),
        el('small','',String(member.username||'No username')+
          ' · Level '+member.clearance_level+' · '+(member.role==='owner'?'Corporate Owner':'Employee')));
      const show=action('VIEW PROFILE / CARD',()=>showEmployeeProfile(member));
      info.classList.add('employee-profile-listcopy');
      item.append(info,show);
      list.append(item);
    }
  }catch(_){if(list.isConnected)list.replaceChildren(p('Unable to load employee profile list.'))}
}
function showInvitationPreview(form,inputs){
  const {name,email,username,level}=inputs;
  const old=form.parentElement.querySelector('.invitation-preview');
  if(old)old.remove();
  const wrapper=el('section','invitation-preview');
  wrapper.setAttribute('aria-label','Invitation email visual preview — not sent');
  const header=el('div','invitation-preview-top');
  header.append(el('strong','','INVITATION PREVIEW'),el('span','','NOT SENT'));
  wrapper.append(header);
  const detail=el('div','invitation-preview-address');
  detail.append(el('div','','To: '+(email.value.trim()||'employee@example.com')),
    el('div','','Subject: Blackcell Corporation Employee Invitation (concept preview)'));
  wrapper.append(detail);
  const paper=el('div','invitation-preview-paper');
  paper.append(el('div','invitation-preview-mark','B'),
    el('div','invitation-preview-brand','BLACKCELL CORPORATION'),
    el('div','invitation-preview-kicker','EMPLOYEE ACCESS INVITATION'),
    el('h3','','You are invited to Blackcell.'));
  paper.append(el('p','','Hello '+(name.value.trim()||'Employee')+','));
  paper.append(el('p','','You have been invited to activate a private Blackcell Corporation employee account. Your employee username will be '+(username.value.trim()||'generated when registered')+' and your assigned clearance will be Level '+level.value+'.'));
  paper.append(el('p','','Use the invitation activation link from your email to verify your email address and create your own password. Your digital employee access card will be revealed after activation.'));
  const button=el('div','invitation-preview-button','ACTIVATE EMPLOYEE ACCESS');
  paper.append(button,el('p','invitation-preview-foot','Your Access Code and Security Code are issued separately. Never share them by replying to this email.'));
  wrapper.append(paper);
  wrapper.append(p('Concept preview only. Supabase currently sends its configured invitation email template, which may have different text or styling. Nothing is sent until you click Send Employee Invitation.'));
  const dismiss=action('CLOSE PREVIEW',()=>wrapper.remove());
  wrapper.append(dismiss);
  form.after(wrapper);
  wrapper.scrollIntoView({behavior:'smooth',block:'nearest'});
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
    const name=field('EMPLOYEE NAME','text','Full name');
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
      showEmployeeProfile({display_name:name.value.trim()||'Sample Employee',
        username:uniqueUser.value.trim()||'bc_sample_48271',
        email:email.value.trim()||'sample@example.com',
        clearance_level:Number(level.value),role:'employee',active:false,
        can_chat:true,password_activated:false},true);
    });
    previewCard.type='button';previewCard.style.cssText='width:100%;min-height:44px';
    form.append(previewCard);
    const submit=action('SEND EMPLOYEE INVITATION',null,false,true);
    submit.type='submit';submit.style.cssText='width:100%;min-height:44px';
    form.append(submit);
    const feedback=el('p','muted','');
    feedback.setAttribute('role','status');
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
        if(error||data?.ok!==true){
          feedback.textContent=data?.detail||('Invitation not sent: '+(data?.reason||error?.message||'service unavailable'));
          return;
        }
        feedback.textContent='Invitation created. The email activates the employee account, not the codes. Share these generated codes separately through a trusted channel; they cannot be retrieved later.';
        const receipt=el('div','content-block');
        receipt.dataset.blackcellReceipt='true';
        receipt.style.cssText='border:1px solid #648774;border-radius:14px;padding:16px;margin-top:15px';
        receipt.append(el('h3','','EMPLOYEE CREDENTIALS · COPY ONCE'));
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
      }catch(err){feedback.textContent='Invitation not sent. Check the network and email service.'}
      finally{submit.disabled=false;submit.textContent='SEND EMPLOYEE INVITATION';}
    });
    section.append(form,feedback);
    const list=block('Approved & Invited Accounts');
    list.append(p('Loading corporate accounts…'));
    content.append(section,list);
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
        (member.active?(member.activated?'ACTIVE':'INVITED'):'DISABLED');
      const view=el('div','employee-profile-actions');
      view.append(el('span','mock-state',right),
        action('VIEW PROFILE',()=>showEmployeeProfile(member)));
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
function security(){if(activeTab==='overview'){let g=grid();[['Security status','Not connected'],['Active sessions','—'],['Failed attempts','—'],['Security events','—']].forEach(x=>g.append(card(...x)));content.append(g);let b=block('Recent Security Activity');b.append(p('No real corporate login or security event monitoring is connected.'));content.append(b);}else if(activeTab==='sessions'){let b=block('Authorized Devices & Sessions');b.append(p('Current sessions, device recognition, expiration, and session revocation will appear here after backend integration.'));content.append(b,action('Sign Out Other Sessions — Not Connected',null,true));}else{content.append(el('h3','','Security Preferences'),choice('Security Notifications','Proposed alerts for important corporate events','securityNotify'),choice('New Device Login Alerts','Proposed alerts for unfamiliar sign-ins','deviceAlerts'),note('These are local preview switches and do not activate security monitoring.'));}}
function field(name,value,readOnly=true){let l=el('label','field',name),i=el('input');i.value=value;i.readOnly=readOnly;l.append(i);return l;}
function settings(){if(activeTab==='general'){let b=block('Corporate Identity');b.append(field('Corporation Name','Blackcell Corporation'),field('Portal Title','Command & Administration Center'),row('Administrator Access','Protected role; not editable here','Owner'));content.append(b);}else if(activeTab==='appearance'){let b=block('Interface Appearance');b.append(el('label','field','Visual theme'));b.append(select([['glass','Ultra-Dark Apple Glass'],['black','Pure Black — Minimal'],['silver','Charcoal & Silver Glass']],state.appearance,v=>{state.appearance=v;document.body.dataset.appearance=v}));content.append(b,choice('Interface Animations','Smooth popup and navigation transitions','animations'));}else if(activeTab==='divisions'){let b=block('Configured Divisions');b.append(row('NEXUS Management','Management System','Separate application'),row('MansArmedForces','Media Collection','Separate application'));content.append(b,note('Division configuration is illustrative. Changing it here does not change independent applications.'));}else{content.append(choice('Corporate Notifications','Show proposed administrative notifications','notify'),choice('Confirm Important Actions','Proposed confirmation before critical changes','confirm'));}}
function logRows(container){container.replaceChildren();let data=demoEvents.filter(x=>(activeTab==='all'||x.type===activeTab)&&`${x.title} ${x.description}`.toLowerCase().includes(searchTerm.toLowerCase())&&(period==='all'||(period==='today'&&x.date==='2026-11-08')||(period==='recent'&&x.date>='2026-11-07')));container.append(el('p','muted',`${data.length} fictional demonstration events`));if(!data.length)container.append(el('div','empty-state','No matching events'));for(let e of data){let b=el('button','item-button');b.append(el('strong','',e.title),el('small','',e.display));b.addEventListener('click',()=>{selectedEvent=selectedEvent===e.id?null:e.id;logRows(container)});container.append(b);if(selectedEvent===e.id)container.append(el('div','event-details',`${e.description} · Category: ${e.type} · Event ID: ${e.id}`));}}
function logs(){let bar=el('div','search-row'),a=el('label','field','Search events'),q=el('input');q.placeholder='Search activity…';q.value=searchTerm;a.append(q);let t=el('label','field','Date range'),picker=select([['all','All Time'],['today','Today (sample)'],['recent','Recent (sample)']],period,v=>{period=v;logRows(list)});t.append(picker);bar.append(a,t);content.append(bar);let list=el('div');content.append(list);q.addEventListener('input',()=>{searchTerm=q.value;logRows(list)});logRows(list);content.append(note('All entries are fictional examples. No corporate audit data is stored or retrieved.'),action('Export Actual Logs — Not Connected',null,true));}
function backups(){if(activeTab==='overview'){let g=grid();g.append(card('Last Backup','Not connected'),card('Recovery Status','Not verified'));content.append(g);let b=block('Choose Backup Scope');let selector=select([['portal','Corporate Portal Configuration'],['nexus','NEXUS Management — future'],['mans','MansArmedForces — future']],'portal',()=>{});b.append(selector,el('div','actions'));b.querySelector('.actions').append(action('Create Backup — Not Connected',null,true));content.append(b,note('A backup must be written to secured storage and verified before it can be reported as successful. No backup was created.'));}else if(activeTab==='history'){content.append(el('div','empty-state','No connected backup history. Completed, verified backup records will appear here.'),action('Choose Recovery Point — Not Connected',null,true));}else{content.append(choice('Automatic Backups','Future recurring backup scheduling','autoBackup'),choice('Require Restore Confirmation','Additional confirmation before overwriting data','restoreConfirm'),note('These switches are preview-only. Automatic backups are not running.'));}}
function systemResults(container){container.replaceChildren();let data=systems.filter(x=>(x.name+' '+x.kind+' '+x.provider).toLowerCase().includes(searchTerm.toLowerCase()));container.append(el('p','muted',`${data.length} systems in the design directory`));if(!data.length)container.append(el('div','empty-state','No matching systems'));data.forEach(s=>{let b=el('button','item-button');b.append(el('strong','',`${s.icon}  ${s.name}`),el('small','',s.kind));b.addEventListener('click',()=>{selectedSystem=selectedSystem===s.id?null:s.id;systemResults(container)});container.append(b);if(selectedSystem===s.id){let n=block('Directory Details');n.append(p(s.desc),row('Technology',s.provider,'Not monitored'));if(s.href){let a=el('a','btn outline',`Open ${s.name} ↗`);a.href=s.href;a.target='_blank';a.rel='noopener noreferrer';n.append(a)}container.append(n)}});}
function corporateSystems(){if(activeTab==='systems'){let a=el('label','field','Search corporate systems'),q=el('input');q.placeholder='Search corporate systems…';q.value=searchTerm;a.append(q);content.append(a);let list=el('div');content.append(list);q.addEventListener('input',()=>{searchTerm=q.value;systemResults(list)});systemResults(list);}else if(activeTab==='infrastructure'){let b=block('Infrastructure Directory');b.append(row('GitHub Pages','Corporate website hosting and deployments','Directory only'),row('Supabase','Authentication, storage, database APIs','Directory only'),row('AI Infrastructure','Inference endpoints and model operations','Directory only'));content.append(b,note('No service credentials, status data, or infrastructure access is exposed.'));}else{let g=grid();[['Website availability','Not monitored'],['API connectivity','Not monitored'],['Database health','Not monitored'],['AI service status','Not monitored']].forEach(x=>g.append(card(...x)));content.append(g,note('Green status will appear only after authenticated and verified health checks are implemented.'),action('Configure Monitoring — Coming Later',null,true));}}
function division(){let nexus=activeModal==='nexus',name=names[activeModal];let b=block('Division Overview');b.append(p(nexus?'Private management operations, records, communications and financial systems.':'Photo collections, review workflows, album organization, and AI-related projects.'));let g=grid();(nexus?[['Records','Profiles and activity'],['Communications','Messaging and analysis'],['Financial','Budget and transactions'],['System Health','Not connected']]:[['Uniforms','Photo library and albums'],['Collections','Inmate and media collections'],['Gunner AI','Separate AI project'],['System Health','Not connected']]).forEach(x=>{let c=card(x[0],x[1]);g.append(c)});b.append(g);content.append(b);let a=el('a','btn primary full',`Open ${name} Website ↗`);a.href=nexus?'https://www.blackcellcorp.com':'https://pjs7zyw62m-del.github.io/Gunner-Collection-Portal/';a.target='_blank';a.rel='noopener noreferrer';content.append(a,note('This opens the independent website. Existing authentication, permissions, and policies still apply. Corporate preview access does not sign you in.'));}
function notifications(){let b=block('Notifications');b.append(p('No live corporate notifications are connected. Future authenticated events can include new-device alerts, failed sign-ins, system incidents, and administrator updates.'));content.append(b);}
function account(){let b=block('Administrator Profile');b.append(row('Corporate role','Proposed primary administrator','Owner'),row('Account identity','No authenticated corporate account','Not connected'));content.append(b,note('The corporate login is a preview; account credentials and roles must be confirmed by a secure backend.'));}
function signout(){content.append(note('This preview cannot revoke GitHub Pages, Supabase, or other application sessions. Global sign-out requires separately authorized server integrations.'));let b=el('div','actions');b.append(action('Cancel',close));let a=el('a','btn outline','Return to Login Preview');a.href='index.html';b.append(a);content.append(b);}
function restricted(){content.append(note('Service identifiers are placeholders. A production operator would require server-side authorization before service details could be unlocked.'),action('Verify & Unlock — Not Connected',null,true));}
const openDrawer=()=>{$('drawer').classList.add('open');$('drawer').setAttribute('aria-hidden','false');$('drawerShade').hidden=false;$('menuButton').setAttribute('aria-expanded','true');};
const closeDrawer=()=>{$('drawer').classList.remove('open');$('drawer').setAttribute('aria-hidden','true');$('drawerShade').hidden=true;$('menuButton').setAttribute('aria-expanded','false');};
$('menuButton').addEventListener('click',openDrawer);$('closeDrawer').addEventListener('click',closeDrawer);$('drawerShade').addEventListener('click',closeDrawer);$('navHome').addEventListener('click',()=>{closeDrawer();scrollTo({top:0,behavior:'smooth'})});$('closeModal').addEventListener('click',close);modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!modal.hidden)close();else closeDrawer()}if(e.key==='Tab'&&!modal.hidden){let controls=[...pane.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(x=>x.getClientRects().length);if(!controls.length)return;let first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.open==='chat'){closeDrawer();window.dispatchEvent(new Event('blackcell-open-imessage'));return}open(btn.dataset.open,btn)}));
const codes={systems:['BC-SYS-001','BC-SYS-002','BC-SYS-003','BC-SYS-004','BC-SYS-005','BC-SYS-006'],servers:['BC-SRV-001','BC-SRV-002','BC-SRV-003','BC-SRV-004']};for(let [name,target] of [['systems','systemsList'],['servers','serversList']]){codes[name].forEach(code=>{let b=el('button','service-row');let dot=el('i','indicator gray'),c=el('span','service-code',code),s=el('span','service-caption','NOT CHECKED  🔒');b.append(dot,c,s);b.addEventListener('click',()=>open('restricted',b));$(target).append(b)})}
})();
