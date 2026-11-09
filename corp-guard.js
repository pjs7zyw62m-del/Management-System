import {corporateClient,corporateAuthorize} from './corp-auth.js';
const msg=document.getElementById('corp-lock-msg'),link=document.getElementById('corp-lock-link');
function deny(t){msg.textContent=t;link.hidden=false;}
try{
const s=corporateClient();
const result=await corporateAuthorize(s);
if(!result.ok){
if(result.reason==='signed-out')location.replace('login.html');
else{if(result.reason==='not-approved')await s.auth.signOut();deny(result.reason==='verification-error'?'Unable to verify employee authorization. Access blocked.':'This account is not authorized for Blackcell Corporate Access.');}
}else{
document.documentElement.classList.add('corp-ok');
document.getElementById('corp-lock').hidden=true;
const h=document.querySelector('.header-end');
if(h){const b=document.createElement('button');b.textContent='SIGN OUT';b.className='icon-button';b.style.width='auto';b.style.padding='0 14px';b.addEventListener('click',async()=>{await s.auth.signOut({scope:'local'});location.replace('login.html')});h.prepend(b);}
const script=document.createElement('script');script.src='admin.js';document.body.append(script);
}
}catch(e){deny('Corporate authentication is unavailable. Access blocked.');}