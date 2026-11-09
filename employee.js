import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-employee4';

const recoveryHint=new URLSearchParams(location.hash.replace(/^#/,'' )).get('type')==='recovery';
const client=corporateClient();
const $=id=>document.getElementById(id);
let recoveryFlow=recoveryHint;
let verified=false, lastActivity=Date.now(),lastTouch=0,logoutRunning=false;
const IDLE_MS=60*60*1000;
function showPanel(id){
 for(const name of ['employeeLogin','employeeActivation','employeeHome'])$(name).hidden=name!==id;
}
function showError(id,message){$(id).textContent=message;$(id).hidden=false}
function clearError(id){$(id).hidden=true;$(id).textContent=''}
async function expireSession(){
 if(logoutRunning)return;
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
 $('employeeCodePanel').hidden=isVerified;
 $('employeeCard').classList.toggle('codes-verified',isVerified);
 $('chatLink').hidden=!isVerified||m.can_chat!==true;
 $('employeeAccess').textContent=isVerified
   ?(m.can_chat?'SECURITY VERIFIED · CHAT AUTHORIZED':'SECURITY VERIFIED · CHAT RESTRICTED')
   :'IDENTITY ACTIVATED · CODE VERIFICATION REQUIRED';
 if(isVerified){lastActivity=Date.now();lastTouch=Date.now();}
}
async function load(reveal=false){
 try{
  await client.auth.getSession();
  const result=await corporateAuthorize(client);
  if(!result.ok){verified=false;showPanel('employeeLogin');return;}
  const member=result.member;
  if(member.role==='owner'){location.replace('dashboard.html');return;}
  if(member.role!=='employee'){
   showPanel('employeeLogin');
   showError('loginError','This account is not authorized for Employee Access.');
   return;
  }
  if(!member.password_activated_at||recoveryFlow){
   verified=false;showPanel('employeeActivation');
   return;
  }
  showPanel('employeeHome');
  $('employeeLevel').textContent='LEVEL '+member.clearance_level;
  $('employeeName').textContent=member.display_name||'BLACKCELL EMPLOYEE';
  $('employeeUsername').textContent='USERNAME · '+(member.username||'Not assigned');
  if(reveal){
   $('employeeCard').classList.remove('reveal');
   void $('employeeCard').offsetWidth;
   $('employeeCard').classList.add('reveal');
  }
  const {data,statusError,error}=await client.rpc('corp_employee_code_status');
  if(error||statusError||data?.ok!==true){
   setVerified(false,member);
   showError('employeeStatus','Employee security verification is temporarily unavailable.');
   return;
  }
  setVerified(data.verified===true,member);
 }catch(_){
  showPanel('employeeLogin');
  showError('loginError','Could not check your employee login. Check your connection.');
 }
}

$('recoverAccessButton').addEventListener('click',async()=>{
 const address=$('email').value.trim().toLowerCase();
 clearError('recoveryFeedback');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){
   showError('recoveryFeedback','Enter your invited email address above first.');
   return;
 }
 const button=$('recoverAccessButton');
 button.disabled=true;button.textContent='SENDING SECURE LINK…';
 try{
   const {error}=await client.auth.resetPasswordForEmail(address,{
     redirectTo:'https://blackcellcorp.com/employee.html'
   });
   if(error){
     showError('recoveryFeedback','Could not request the email: '+error.message);
     return;
   }
   showError('recoveryFeedback','If this email has a Blackcell account, a secure link has been requested. Check that inbox and follow its link to create your password. No new account was created.');
 }catch(err){
   showError('recoveryFeedback','Could not request the link: '+String(err?.message||'Network unavailable.'));
 }finally{
   button.disabled=false;
   button.textContent='RESUME ACTIVATION / RESET PASSWORD';
 }
});
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
 finally{btn.disabled=false;btn.textContent='SIGN IN ↗'}
});
$('activateButton').addEventListener('click',async()=>{
 const pwd=$('activationPassword').value;
 const confirmation=$('confirmPassword').value;
 clearError('activationError');
 if(pwd.length<12){showError('activationError','Choose a password containing at least 12 characters.');return}
 if(pwd!==confirmation){showError('activationError','The passwords do not match.');return}
 const btn=$('activateButton');btn.disabled=true;btn.textContent='ACTIVATING…';
 try{
  const {error}=await client.auth.updateUser({password:pwd});
  if(error){showError('activationError','Password activation failed: '+error.message);return}
  const {data,error:rpcError}=await client.rpc('corp_employee_activate');
  if(rpcError||data?.ok!==true){
   showError('activationError','Password saved but employee activation is incomplete. Contact your administrator.');
   return;
  }
  $('activationPassword').value='';$('confirmPassword').value='';
  recoveryFlow=false;
  await load(true);
 }catch(_){showError('activationError','Activation unavailable. Check your connection.')}
 finally{btn.disabled=false;btn.textContent='ACTIVATE & REVEAL MY EMPLOYEE CARD'}
});
$('employeeCodeForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const access=$('employeeAccessCode').value,security=$('employeeSecurityCode').value;
 clearError('employeeStatus');
 if(!/^[0-9]{4}$/.test(access)||!/^[0-9]{12}$/.test(security)){
  showError('employeeStatus','Enter a 4-digit Access Code and a 12-digit Security Code.');
  return;
 }
 const btn=$('verifyCodes');btn.disabled=true;btn.textContent='AUTHENTICATING…';
 try{
  const {data,error}=await client.rpc('corp_employee_verify_codes',{p_access:access,p_security:security});
  $('employeeAccessCode').value='';$('employeeSecurityCode').value='';
  if(error||data?.ok!==true){
   showError('employeeStatus',data?.reason==='temporarily_locked'
    ?'Too many attempts. Security verification is locked for 15 minutes.'
    :'Codes were not accepted. Check both codes with your administrator.');
   return;
  }
  await load(false);
  showError('employeeStatus','Security approved. Your employee chat is now available.');
 }catch(_){showError('employeeStatus','Security verification unavailable. Try again later.')}
 finally{btn.disabled=false;btn.textContent='AUTHENTICATE EMPLOYEE ACCESS ↗'}
});
for(const e of ['pointerdown','keydown','wheel','touchstart'])window.addEventListener(e,noteActivity,{passive:true});
setInterval(()=>{if(verified&&Date.now()-lastActivity>=IDLE_MS)void expireSession();},15000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&verified){
  if(Date.now()-lastActivity>=IDLE_MS)void expireSession();
  else void client.rpc('corp_employee_code_status').then(({data,error})=>{
   if(error||data?.verified!==true)void expireSession();
  }).catch(()=>void expireSession());
 }
});
for(const id of ['signout','activationSignout'])$(id).addEventListener('click',()=>{void expireSession()});
void load(true);