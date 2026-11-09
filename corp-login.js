import {corporateClient,corporateAuthorize} from './corp-auth.js';
const form=document.getElementById('login'),status=document.getElementById('status'),btn=document.getElementById('submit'),toggle=document.getElementById('toggle');
function say(s){status.textContent=s;status.hidden=false}
let s;try{s=corporateClient();const x=await corporateAuthorize(s);if(x.ok)location.replace('dashboard.html')}catch(e){say('Login is temporarily unavailable.');btn.disabled=true}
toggle.addEventListener('click',()=>{const p=document.getElementById('password');p.type=p.type==='password'?'text':'password';toggle.textContent=p.type==='text'?'HIDE':'SHOW'});
form.addEventListener('submit',async e=>{e.preventDefault();if(!s)return;btn.disabled=true;status.hidden=true;try{
const {error}=await s.auth.signInWithPassword({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value});
if(error){say('Invalid email, password, or unavailable account.');return}
const x=await corporateAuthorize(s);if(!x.ok){await s.auth.signOut();say(x.reason==='verification-error'?'Unable to verify access. Try again later.':'This account has not been approved for Corporate Access.');return}
location.replace('dashboard.html');
}catch(e){say('Sign-in unavailable. Check your connection.')}finally{btn.disabled=false}});
document.getElementById('reset').addEventListener('click',async()=>{const email=document.getElementById('email').value.trim();if(!email){say('Enter your email first.');return}try{await s?.auth.resetPasswordForEmail(email,{redirectTo:new URL('login.html',location.href).href});say('If the email is registered, a password-reset link has been requested.')}catch(e){say('Password reset unavailable.')}});