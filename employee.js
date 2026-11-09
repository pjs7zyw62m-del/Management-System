import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-staff1';
const client=corporateClient();
const $=id=>document.getElementById(id);
const showError=(id,text)=>{$(id).textContent=text;$(id).hidden=false;};
async function load(){
  try{
    await client.auth.getSession();
    const result=await corporateAuthorize(client);
    if(!result.ok){$('employeeHome').hidden=true;$('employeeLogin').hidden=false;return;}
    const m=result.member;
    if(m.role==='owner'){location.replace('dashboard.html');return;}
    if(m.role!=='employee'&&m.role!=='tester'){showError('loginError','This account is not authorized for employee access.');return;}
    $('employeeLogin').hidden=true;$('employeeHome').hidden=false;
    $('employeeLevel').textContent='LEVEL '+m.clearance_level;
    $('employeeName').textContent=m.display_name||'BLACKCELL EMPLOYEE';
    $('employeeAccess').textContent=m.can_chat?'EMPLOYEE · CHAT AUTHORIZED':'EMPLOYEE · CHAT RESTRICTED';
    $('chatLink').hidden=!m.can_chat;
  }catch(_){showError('loginError','Could not verify your employee account. Check your connection.');}
}
$('signin').addEventListener('submit',async e=>{
  e.preventDefault();const btn=$('signinButton');btn.disabled=true;
  $('loginError').hidden=true;btn.textContent='VERIFYING…';
  try{
    const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error){showError('loginError','Email or password was not accepted.');return;}
    await load();
  }catch(_){showError('loginError','Sign in unavailable. Check your connection.');}
  finally{btn.disabled=false;btn.textContent='SIGN IN ↗';}
});
$('savePassword').addEventListener('click',async()=>{
  const pwd=$('newPassword').value;
  if(pwd.length<12){showError('employeeStatus','Choose a password of at least 12 characters.');return;}
  $('savePassword').disabled=true;$('employeeStatus').hidden=true;
  const {error}=await client.auth.updateUser({password:pwd}).catch(()=>({error:true}));
  $('newPassword').value='';$('savePassword').disabled=false;
  showError('employeeStatus',error?'Could not save password. Try again.':'Password saved. Your employee account is ready.');
});
$('signout').addEventListener('click',async()=>{await client.auth.signOut({scope:'local'});location.replace('employee.html');});
void load();