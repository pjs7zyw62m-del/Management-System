// Invitation credentials arrive only in the URL fragment (never in an HTTP request).
// Do not consume a one-time token on page load or expose it to logs.
export function readInvitation(fragment){
 const p=new URLSearchParams(String(fragment).replace(/^#/,''));
 if(p.getAll('token_hash').length!==1||p.getAll('type').length!==1||p.get('type')!=='invite')return null;
 const token=p.get('token_hash');
 return /^[A-Za-z0-9_-]{32,256}$/.test(token||'')?token:null;
}
export async function exchangeInvitation(client,token){
 const result=await client.auth.verifyOtp({token_hash:token,type:'invite'});
 if(result.error||!result.data?.session||!result.data?.user?.id)return false;
 // The regular employee portal independently rechecks account authorization.
 return true;
}
async function init(){
 const button=document.getElementById('continue'),status=document.getElementById('status'),recover=document.getElementById('recover');
 let token=readInvitation(location.hash),busy=false;
 // Remove the credential from the address bar immediately; keep it only in memory.
 history.replaceState(null,'',location.pathname);
 if(!token){status.textContent='This invitation is missing or invalid. Request a fresh activation link.';recover.hidden=false;return}
 status.textContent='Your secure invitation is ready. Select Verify Invitation to continue.';
 button.disabled=false;
 button.addEventListener('click',async()=>{
  if(busy||!token)return;busy=true;button.disabled=true;status.textContent='Verifying securely…';
  try{
   const {corporateClient}=await import('./corp-auth.js?v=20261114-transport-classification');
   if(await exchangeInvitation(corporateClient(),token)){
    token=null;location.replace('employee.html');return;
   }
   token=null;status.textContent='This invitation is invalid, expired or has already been used. Request a fresh activation link.';recover.hidden=false;
  }catch(_){status.textContent='Verification could not be completed. Try again or request a fresh activation link.';button.disabled=false;recover.hidden=false}
  finally{busy=false}
 });
}
if(typeof document!=='undefined')void init();
