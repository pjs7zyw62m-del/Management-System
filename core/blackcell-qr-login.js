import qrcode from './vendor/blackcell-qrcode.js';
const $=id=>document.getElementById(id);
const isApproval=Boolean($('bcQrApprove'));
const isEmployee=Boolean($('employeeLogin'));
let client;
function auth(){return client||(client=import(isEmployee?'./corp-auth.js?v=20261112-ledger-access1':'./corp-auth.js?v=20261109-clearance5').then(m=>m.corporateClient()))}
async function api(body,accessToken){
 const cfg=window.BLACKCELL_CORP_CONFIG;if(!cfg?.url||!cfg?.publishableKey)throw Error('QR login is unavailable.');
 const response=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/blackcell-qr-login',{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
 const result=await response.json();
 if(!response.ok)throw Error(({rate_limited:'Too many QR requests. Wait one minute and try again.',sign_in_required:'Sign in on your phone first.',use_standard_sign_in:'This account requires normal sign-in.',code_mismatch:'The confirmation number does not match.',expired_or_unavailable:'This request expired or is no longer available.'})[result.error]||'Secure QR sign-in is temporarily unavailable.');
 return result;
}
const set=(id,t)=>{$(id).textContent=t};
if(isApproval){
 const parts=location.hash.slice(1).split('.');
 const valid=parts.length===2&&/^[a-f0-9-]{36}$/i.test(parts[0])&&/^[a-f0-9]{64}$/.test(parts[1]);
 // Remove the secret from the visible address and browser history before any auth initialization.
 history.replaceState(null,'',location.pathname);
 let authenticated=false;
 const button=$('bcQrApprove'),input=$('bcQrCode'),hint=$('bcQrPhoneStatus');
 button.disabled=true;
 if(!valid){hint.textContent='This link is invalid or no longer available. Scan a fresh QR code.'}
 else{
  try{
   const c=await auth();
   const {data,error}=await c.auth.getUser();
   if(error||!data.user){hint.textContent='Sign in to BLACKCELL on this phone, then scan a new QR code.';$('bcQrPhoneLogin').hidden=false;}
   else{
    authenticated=true;
    set('bcQrAccount',data.user.email||'Authenticated BLACKCELL account');
    hint.textContent='Enter the six-digit number displayed on the computer in front of you. Never use a number sent by someone else.';
    input.disabled=false;button.disabled=false;
   }
  }catch(_){hint.textContent='Could not verify your phone session. Sign in and try again.';$('bcQrPhoneLogin').hidden=false;}
 }
 $('bcQrPhoneForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!authenticated||!valid||button.disabled)return;
  const code=input.value.trim();if(!/^\d{6}$/.test(code)){hint.textContent='Enter all six digits.';return}
  button.disabled=true;hint.textContent='Verifying approval…';
  try{
   const c=await auth(),{data}=await c.auth.getSession(),token=data.session?.access_token;
   if(!token)throw Error('Your phone session expired. Sign in and scan again.');
   const result=await api({action:'approve',id:parts[0],scan:parts[1],code},token);
   if(result.status!=='approved')throw Error('Approval could not be completed.');
   authenticated=false;input.value='';input.disabled=true;button.textContent='APPROVED';hint.textContent='SIGN-IN APPROVED. Return to your computer. Existing security checks still apply.';
  }catch(e){hint.textContent=e.message;button.disabled=false;}
 });
}else{
 const launch=$('bcQrLaunch'),dialog=$('bcQrDialog'),button=$('bcQrRenew'),close=$('bcQrCancel');
 let request=null,epoch=0,timer=null,release=null,claiming=false;
 function clear(){clearTimeout(timer);timer=null}
 function discard(send=true){epoch++;clear();const old=request;request=null;if(old&&send)void api({action:'cancel',id:old.id,poll:old.poll}).catch(()=>{});release?.();release=null;}
 function fail(message){clear();request=null;set('bcQrStatus',message);set('bcQrCountdown','');$('bcQrImage').replaceChildren();set('bcQrNumber','—');button.hidden=false;release?.();release=null;}
 async function start(){
  if(claiming)return;discard();const id=epoch;
  button.hidden=true;set('bcQrStatus','Preparing a secure sign-in request…');set('bcQrNumber','—');set('bcQrCountdown','');$('bcQrImage').replaceChildren();
  release=window.BLACKCELL_LIVE_UPDATE?.hold('qr sign-in');
  try{
   const r=await api({action:'start'});
   if(id!==epoch||!dialog.open){void api({action:'cancel',id:r.id,poll:r.poll}).catch(()=>{});return}
   if(!r.id||!r.poll||!r.scan||!r.code)throw Error('Invalid sign-in response.');
   request=r;
   const u=new URL('qr-approve.html',location.href);u.hash=r.id+'.'+r.scan;
   const qr=qrcode(0,'M');qr.addData(u.href,'Byte');qr.make();$('bcQrImage').innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
   set('bcQrNumber',r.code);set('bcQrStatus','Scan with your phone and approve using the number below.');
   const expiry=Date.now()+Math.min(120,Number(r.expiresIn)||120)*1000;
   async function poll(){
    if(id!==epoch||!dialog.open||!request)return;
    const left=Math.max(0,Math.ceil((expiry-Date.now())/1000));
    set('bcQrCountdown','EXPIRES IN '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0'));
    if(!left){discard();fail('QR code expired. Generate a new one.');return;}
    try{
     const result=await api({action:'poll',id:r.id,poll:r.poll});
     if(id!==epoch||!dialog.open)return;
     if(result.status==='expired'){discard(false);fail('QR code expired or cancelled.');return}
     if(result.status==='approved'&&result.token_hash){
      claiming=true;close.disabled=true;button.hidden=true;set('bcQrStatus','Identity approved. Establishing your secure session…');set('bcQrCountdown','');
      const c=await auth();const {error}=await c.auth.verifyOtp({token_hash:result.token_hash,type:'email'});
      if(error)throw Error('Could not complete sign-in. Generate a fresh QR code.');
      discard(false);location.reload();return;
     }
     timer=setTimeout(poll,2200);
    }catch(e){claiming=false;close.disabled=false;discard();fail(e.message);}
   }
   void poll();
  }catch(e){if(id===epoch){discard();fail(e.message)}}
 }
 launch.addEventListener('click',()=>{const submit=$('submit')||$('signinButton');if(submit?.disabled||dialog.open)return;dialog.showModal();void start()});
 button.addEventListener('click',()=>void start());
 close.addEventListener('click',()=>{if(!claiming)dialog.close()});
 dialog.addEventListener('cancel',e=>{if(claiming)e.preventDefault()});
 dialog.addEventListener('close',()=>discard());
}
