import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-staff1';
export const corporate=corporateClient();
export async function authorizeUniformHub(){
 const gate=document.getElementById('uGate');
 const main=document.getElementById('uMain');
 const message=document.getElementById('uGateText');
 try{
  const {data:{session},error}=await corporate.auth.getSession();
  if(error||!session)throw Error('Sign in with your Blackcell corporate account.');
  const result=await corporateAuthorize(corporate);
  if(!result.ok||!['owner','employee'].includes(result.member?.role))
   throw Error('Your corporate account is not authorized for the Military Library.');
  const check=result.member.role==='owner'?'corp_code_status':'corp_employee_code_status';
  const {data:status,error:accessError}=await corporate.rpc(check);
  if(accessError||status?.verified!==true)
   throw Error(result.member.role==='owner'?
     'Administrator clearance verification is required.':
     'Your employee account must be active. Sign in again.');
  main.hidden=false;gate.hidden=true;
  return {client:corporate,user:result.user,member:result.member};
 }catch(error){
  message.textContent=error?.message||'Access verification unavailable.';
  console.warn('Uniform hub access check:',error?.message||error);
  return null;
 }
}
