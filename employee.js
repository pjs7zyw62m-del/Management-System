import qrcode from './vendor/blackcell-qrcode.js';
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261112-ledger-access1';

const recoveryHint=new URLSearchParams(location.hash.replace(/^#/,'' )).get('type')==='recovery';
const employeeCardRequested=new URLSearchParams(location.search).get('card')==='1';
const client=corporateClient();
const $=id=>document.getElementById(id);
let recoveryFlow=recoveryHint;
let verified=false, lastActivity=Date.now(),lastTouch=0,logoutRunning=false;
let employeeDockLoading=false;
function syncEmployeeMessenger(permitted){
 if(!permitted){
  window.dispatchEvent(new Event('blackcell-suspend-imessage'));
  return;
 }
 window.BLACKCELL_CORPORATE_NETWORK_CLIENT=client;
 if(!employeeDockLoading){
  employeeDockLoading=true;
  const script=document.createElement('script');
  script.src='corporate-chat-dock.js?v=20261113-imessage6';
  script.addEventListener('error',()=>employeeDockLoading=false);
  document.body.append(script);
 }else window.dispatchEvent(new Event('blackcell-resume-imessage'));
}
const IDLE_MS=60*60*1000;

function renderEmployeeQr(member){
 const container=$('credentialQr'),link=$('credentialRecordLink'),message=$('credentialQrMessage');
 container.replaceChildren();link.hidden=true;link.removeAttribute('href');
 const id=member.user_id||'Not assigned';
 for(const key of ['credentialEmployeeId','credentialFrontId']){$(key).textContent=id;$(key).title=id;}
 try{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(member.user_id||''))throw new Error('Missing employee identifier');
  const url=new URL('corporate-network.html',location.href);
  url.searchParams.set('user',member.user_id);
  const qr=qrcode(0,'M');
  qr.addData(url.href,'Byte');qr.make();
  container.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
  const svg=container.querySelector('svg');
  svg.setAttribute('role','img');svg.setAttribute('aria-label','QR code for employee Network profile');
  link.href=url.href;link.hidden=false;message.hidden=true;
 }catch(_){
  message.textContent='QR code unavailable. Please reload your card.';message.hidden=false;
 }
}

let photoRequest=0;
async function renderCredentialPhoto(member,allowed){
 const request=++photoRequest,img=$('credentialPhoto');
 img.hidden=true;img.removeAttribute('src');$('credentialInitials').hidden=false;
 if(!allowed||member.access_scope==='ledger_only')return;
 try{
  const p=await client.from('corp_social_profiles').select('avatar_asset_id').eq('user_id',member.user_id).maybeSingle();
  if(p.error||!p.data?.avatar_asset_id)return;
  const a=await client.from('corp_social_assets').select('storage_path').eq('id',p.data.avatar_asset_id).eq('owner_id',member.user_id).maybeSingle();
  if(a.error||!a.data?.storage_path)return;
  const out=await client.storage.from('corp-social-media').createSignedUrl(a.data.storage_path,1800);
  if(request!==photoRequest||!verified||out.error||!out.data?.signedUrl)return;
  img.onload=()=>{if(request===photoRequest&&verified){img.hidden=false;$('credentialInitials').hidden=true;}};
  img.onerror=()=>{if(request===photoRequest){img.hidden=true;$('credentialInitials').hidden=false;}};
  img.src=out.data.signedUrl;
 }catch(_){/* keep initials if photo unavailable */}
}
function syncCredentialReverse(){
 $('credentialSignature').textContent=$('employeeName').textContent;
 $('credentialSignature').title=$('employeeName').textContent;
 $('employeeName').title=$('employeeName').textContent;
 $('credentialFooterLevel').textContent=$('employeeLevel').textContent;
 $('credentialFrontStatus').textContent=verified?'ACTIVE':'PENDING';
 $('credentialBackName').textContent=$('employeeName').textContent;
 $('credentialBackUsername').textContent=$('employeeUsername').textContent.replace(/^USERNAME · /,'');
 $('credentialBackLevel').textContent=$('employeeLevel').textContent;
 $('credentialBackStatus').textContent=$('employeeAccess').textContent;
}
$('credentialFlip').addEventListener('click',()=>{
 const flipped=$('employeeCard').classList.toggle('is-flipped');
 $('credentialFlip').textContent=flipped?'VIEW FRONT ↻':'VIEW BACK ↻';
 $('credentialFlip').setAttribute('aria-pressed',String(flipped));
 $('credentialFront').setAttribute('aria-hidden',String(flipped));
 $('credentialFront').inert=flipped;
 $('credentialBack').setAttribute('aria-hidden',String(!flipped));
 $('credentialBack').inert=!flipped;
 $('credentialSide').textContent=flipped?'BACK · 2 / 2':'FRONT · 1 / 2';
});
function showPanel(id){
 for(const name of ['employeeLogin','employeeActivation','employeeHome'])$(name).hidden=name!==id;
}
function showError(id,message){$(id).textContent=message;$(id).hidden=false}
function clearError(id){$(id).hidden=true;$(id).textContent=''}
async function expireSession(){
 if(logoutRunning)return;
 window.dispatchEvent(new Event('blackcell-suspend-imessage'));
 logoutRunning=true;
 if(verified)try{await client.rpc('corp_employee_end_session')}catch(_){}
 try{await client.auth.signOut({scope:'local'})}catch(_){}
 location.replace('employee.html');
}
function noteActivity(){
 if(!verified||logoutRunning)return;
 if(Date.now()-lastActivity>=IDLE_MS){void expireSession();return;}
 lastActivity=Date.now();
 if(Date.now()-lastTouch>60000){
  lastTouch=Date.now();
  void client.rpc('corp_employee_touch_session').then(({data,error})=>{
   if(error||data?.ok!==true)void expireSession();
  }).catch(()=>void expireSession());
 }
}
function setVerified(isVerified,m){
 verified=isVerified;
 $('employeeCard').classList.toggle('codes-verified',isVerified);
 $('chatLink').hidden=!isVerified||m.can_chat!==true||m.access_scope==='ledger_only';
 $('networkLink').hidden=!isVerified||m.access_scope==='ledger_only';
 syncEmployeeMessenger(isVerified&&m.can_chat===true&&m.access_scope!=='ledger_only');
 $('employeeAccess').textContent=isVerified
   ?(m.access_scope==='ledger_only'?'ACCOUNT ACTIVE · PRIVATE LEDGER ONLY':
     m.can_chat?'ACCOUNT ACTIVE · CHAT AUTHORIZED':'ACCOUNT ACTIVE · CHAT RESTRICTED')
   :'ACCOUNT ACTIVATION REQUIRED';
 syncCredentialReverse();
 void renderCredentialPhoto(m,isVerified);
 if(isVerified){lastActivity=Date.now();lastTouch=Date.now();}
}
async function load(reveal=false){
 try{
  await client.auth.getSession();
  const result=await corporateAuthorize(client,{allowLedgerOnly:true});
  if(!result.ok){verified=false;showPanel('employeeLogin');return;}
  const member=result.member;
  if(member.role==='owner'){location.replace('dashboard.html');return;}
  if(member.role!=='employee'){
   showPanel('employeeLogin');
   showError('loginError','This account is not authorized for Employee Access.');
   return;
  }
  if(!member.password_activated_at||recoveryFlow){
   verified=false;configurePasswordPanel(member);showPanel('employeeActivation');
   return;
  }
  // Verified employees land on their own social profile by default.
  // ?card=1 is an explicit employee-only route to view the access pass.
  // No redirect occurs until corporateAuthorize and employee code status pass.
  const {data,error}=await client.rpc('corp_employee_code_status');
  if(!error&&data?.ok===true&&data.verified===true&&member.access_scope==='ledger_only'){
   location.replace('private-photo-ledger.html');
   return;
  }
  if(!error&&data?.ok===true&&data.verified===true&&!employeeCardRequested){
   location.replace('corporate-network.html?view=profile');
   return;
  }
  showPanel('employeeHome');
  $('employeeLevel').textContent='LEVEL '+String(member.clearance_level??'—').padStart(2,'0');
  $('employeeName').textContent=member.display_name||'BLACKCELL USER';
  const initials=(member.display_name||member.username||'Blackcell').trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]||'').join('').toUpperCase();
  $('credentialInitials').textContent=initials||'BC';
  $('employeeUsername').textContent='USERNAME · '+(member.username||'Not assigned');
  renderEmployeeQr(member);
  if(reveal){
   $('employeeCard').classList.remove('reveal');
   void $('employeeCard').offsetWidth;
   $('employeeCard').classList.add('reveal');
  }
  if(error||data?.ok!==true){
   setVerified(false,member);
   showError('employeeStatus','Employee authorization is temporarily unavailable.');
   return;
  }
  setVerified(data.verified===true,member);
 }catch(_){
  showPanel('employeeLogin');
  showError('loginError','Could not check your employee login. Check your connection.');
 }
}

let recoveryMode='activation',recoverySending=false,needsActivation=true;
const recoveryCopy={
 activation:{title:'Resume Activation',description:'Enter the email address from your employee invitation. We will send a secure link so you can finish setting up your account.',action:'SEND ACTIVATION LINK'},
 reset:{title:'Reset Password',description:'Enter your registered employee email address to request a secure password reset link.',action:'SEND RESET LINK'}
};
function showRecovery(mode){
 if(recoverySending)return;
 recoveryMode=mode;const copy=recoveryCopy[mode];
 clearError('recoveryFeedback');
 $('bcRecoveryTitle').textContent=copy.title;
 $('bcRecoveryDescription').textContent=copy.description;
 $('bcRecoverySubmit').textContent=copy.action;
 $('bcRecoveryEmail').value=$('email').value.trim()||$('bcRecoveryEmail').value;
 $('bcRecoveryPanel').hidden=false;
 $('recoverAccessButton').setAttribute('aria-expanded',String(mode==='activation'));
 $('resetPasswordButton').setAttribute('aria-expanded',String(mode==='reset'));
 $('bcRecoveryEmail').focus();
}
$('recoverAccessButton').addEventListener('click',()=>showRecovery('activation'));
$('resetPasswordButton').addEventListener('click',()=>showRecovery('reset'));
$('bcRecoveryCancel').addEventListener('click',()=>{
 if(recoverySending)return;
 $('bcRecoveryPanel').hidden=true;clearError('recoveryFeedback');
 $('recoverAccessButton').setAttribute('aria-expanded','false');
 $('resetPasswordButton').setAttribute('aria-expanded','false');
 $(recoveryMode==='activation'?'recoverAccessButton':'resetPasswordButton').focus();
});
$('bcTogglePassword').addEventListener('click',()=>{
 const show=$('password').type==='password';$('password').type=show?'text':'password';
 $('bcTogglePassword').textContent=show?'HIDE':'SHOW';$('bcTogglePassword').setAttribute('aria-pressed',String(show));
 $('bcTogglePassword').setAttribute('aria-label',show?'Hide password':'Show password');
});
$('bcRecoveryForm').addEventListener('submit',async e=>{
 e.preventDefault();if(recoverySending)return;
 const address=$('bcRecoveryEmail').value.trim().toLowerCase();
 clearError('recoveryFeedback');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){showError('recoveryFeedback','Enter a valid registered email address.');return;}
 const button=$('bcRecoverySubmit'),mode=recoveryMode;
 recoverySending=true;
 for(const id of ['bcRecoverySubmit','bcRecoveryCancel','recoverAccessButton','resetPasswordButton'])$(id).disabled=true;
 button.textContent='SENDING SECURE LINK…';
 try{
  const {error}=await client.auth.resetPasswordForEmail(address,{redirectTo:'https://blackcellcorp.com/employee.html'});
  if(error){showError('recoveryFeedback','Unable to request the link right now. Please try again shortly.');return;}
  showError('recoveryFeedback',mode==='activation'?'If this email has an eligible Blackcell account, a secure link has been requested. Check your inbox to complete account setup.':'If this email has an eligible Blackcell account, a secure link has been requested. Check your inbox to set a new password.');
 }catch(_){showError('recoveryFeedback','Unable to request the link. Check your connection and try again.');}
 finally{recoverySending=false;for(const id of ['bcRecoverySubmit','bcRecoveryCancel','recoverAccessButton','resetPasswordButton'])$(id).disabled=false;button.textContent=recoveryCopy[mode].action;}
});
function configurePasswordPanel(member){
 needsActivation=!member.password_activated_at;
 $('bcActivationEyebrow').textContent=needsActivation?'EMPLOYEE CREDENTIAL ACTIVATION':'SECURE ACCOUNT RECOVERY';
 $('bcActivationTitle').textContent=needsActivation?'Activate Your Account':'Reset Your Password';
 $('bcActivationDescription').textContent=needsActivation?'Create a private password to activate your employee card.':'Choose a new private password for your existing employee account.';
 $('activateButton').textContent=needsActivation?'ACTIVATE & REVEAL MY EMPLOYEE CARD':'SAVE NEW PASSWORD';
}
client.auth.onAuthStateChange((event)=>{
 if(event==='PASSWORD_RECOVERY'){
   recoveryFlow=true;
   // Do not make additional Auth requests within the synchronous Auth event.
   setTimeout(()=>{void load(true)},0);
 }
});

$('signin').addEventListener('submit',async e=>{
 e.preventDefault();
 const btn=$('signinButton');
 btn.disabled=true;btn.textContent='VERIFYING…';clearError('loginError');
 try{
  const {error}=await client.auth.signInWithPassword({
   email:$('email').value.trim(),password:$('password').value
  });
  if(error){showError('loginError','Email or password was not accepted.');return;}
  $('password').value='';
  await load(true);
 }catch(_){showError('loginError','Sign in unavailable. Check your connection.')}
 finally{btn.disabled=false;btn.textContent='SIGN IN'}
});

$('activateButton').addEventListener('click',async()=>{
 const pwd=$('activationPassword').value;
 const confirmation=$('confirmPassword').value;
 clearError('activationError');
 if(pwd.length<12){showError('activationError','Choose a password containing at least 12 characters.');return}
 if(pwd!==confirmation){showError('activationError','The passwords do not match.');return}
 const btn=$('activateButton');btn.disabled=true;btn.textContent=needsActivation?'ACTIVATING…':'SAVING PASSWORD…';
 try{
  const {error}=await client.auth.updateUser({password:pwd});
  if(error){showError('activationError','Password activation failed: '+error.message);return}
  if(needsActivation){
  const {data,error:rpcError}=await client.rpc('corp_employee_activate');
  if(rpcError||data?.ok!==true){
   showError('activationError','Password saved but employee activation is incomplete. Contact your administrator.');
   return;
  }
  }
  $('activationPassword').value='';$('confirmPassword').value='';
  recoveryFlow=false;
  await load(true);
  // Email/password activation is complete; no second security-code email is sent.
 }catch(_){showError('activationError','Activation unavailable. Check your connection.')}
 finally{btn.disabled=false;btn.textContent=needsActivation?'ACTIVATE & REVEAL MY EMPLOYEE CARD':'SAVE NEW PASSWORD'}
});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.data?.type!=='blackcell-chat-activity')return;
 const valid=Array.from(document.querySelectorAll('iframe')).some(frame=>{
  try{
   const url=new URL(frame.src,location.href);
   return url.origin===location.origin&&url.pathname.endsWith('/corporate-chat.html')
     &&frame.contentWindow===event.source;
  }catch(_){return false}
 });
 if(valid)noteActivity();
});
for(const e of ['pointerdown','keydown','wheel','touchstart'])window.addEventListener(e,noteActivity,{passive:true});
setInterval(()=>{if(verified&&Date.now()-lastActivity>=IDLE_MS)void expireSession();},15000);
let ledgerScopeChecking=false;
async function checkLedgerOnlyStatus(){
 if(!verified||logoutRunning||document.hidden||ledgerScopeChecking)return;
 ledgerScopeChecking=true;
 try{
  const {data,error}=await client.from('corp_access_members')
   .select('access_scope').eq('user_id',(await client.auth.getUser()).data?.user?.id).maybeSingle();
  if(!error&&data?.access_scope==='ledger_only')
   location.replace('private-photo-ledger.html');
 }catch(_){}
 finally{ledgerScopeChecking=false}
}
setInterval(()=>void checkLedgerOnlyStatus(),20000);

document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)void checkLedgerOnlyStatus();
 if(!document.hidden&&verified){
  if(Date.now()-lastActivity>=IDLE_MS)void expireSession();
  else void client.rpc('corp_employee_code_status').then(({data,error})=>{
   if(error||data?.verified!==true)void expireSession();
  }).catch(()=>void expireSession());
 }
});
for(const id of ['signout','activationSignout'])$(id).addEventListener('click',()=>{void expireSession()});
void load(true);