import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-clearance5';

const stage=document.getElementById('stageWindow');
const loginPanel=document.getElementById('loginPanel');
const passPanel=document.getElementById('passPanel');
const loginCard=document.getElementById('loginCard');
const loginHeading=document.getElementById('loginHeading');
const executivePass=document.getElementById('executivePass');
const clearanceLevel=document.getElementById('clearanceLevel');
const changeAccount=document.getElementById('accountChange');
const emailInput=document.getElementById('email');
const passwordToggle=document.getElementById('toggle');
const form=document.getElementById('login');
const formCode=document.getElementById('codeForm');
const status=document.getElementById('status');
const codeStatus=document.getElementById('codeStatus');
const loginButton=document.getElementById('submit');
const authButton=document.getElementById('authenticate');
const password=document.getElementById('password');
const access=document.getElementById('accessCode');
const security=document.getElementById('securityCode');
const launch=document.getElementById('launchScreen');
const continueVerified=document.getElementById('continueVerified');
const codeSupport=document.getElementById('codeSupport');
const originalSupport=codeSupport.textContent;
window.BLACKCELL_LOGIN_BOOTED=true;
const LOGIN_DEADLINE_MS=16000;
let loginInProgress=false;
let approvalPending=false;

function timed(promise, description, timeout=LOGIN_DEADLINE_MS){
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(description+' timed out. Check your connection and try again.')),timeout);
    })
  ]).finally(()=>clearTimeout(timer));
}
function explain(error, fallback){
  const text=String(error?.message||'');
  if(/timed out/i.test(text))return 'The login server is taking too long to respond. Check your internet connection and try again.';
  return fallback;
}

let client;

function message(element,text){element.hidden=false;element.textContent=text;}
function clearMessage(element){element.hidden=true;element.textContent='';}

function applyClearance(member){
  const level=Number(member?.clearance_level);
  if(!Number.isInteger(level)||level<1||level>7)return false;
  clearanceLevel.textContent='LEVEL '+String(level);
  executivePass.setAttribute('aria-label','Blackcell Level '+level+' employee access pass');
  return true;
}

function showPass(){
  formCode.hidden=false;
  continueVerified.hidden=true;
  codeSupport.textContent=originalSupport;
  clearMessage(codeStatus);
  stage.classList.add('show-pass');
  loginPanel.setAttribute('aria-hidden','false');
  passPanel.setAttribute('aria-hidden','false');
  loginCard.classList.add('signed-in');
  loginHeading.textContent='Identity Verified';
  emailInput.disabled=true;
  password.value='';
  password.disabled=true;
  passwordToggle.disabled=true;
  loginButton.disabled=true;
  loginButton.textContent='IDENTITY VERIFIED ✓';
  changeAccount.hidden=false;
  message(status,'✓ EMAIL & PASSWORD ACCEPTED');
  window.setTimeout(()=>{
    if(stage.classList.contains('show-pass'))access.focus({preventScroll:true});
  },750);
}

function verifiedResume(){
  showPass();
  formCode.hidden=true;
  continueVerified.hidden=false;
  codeSupport.textContent='Your corporate security session is already verified. Continue to Administration.';
  window.setTimeout(()=>continueVerified.focus({preventScroll:true}),750);
}

function showLogin(){
  stage.classList.remove('show-pass');
  loginPanel.setAttribute('aria-hidden','false');
  passPanel.setAttribute('aria-hidden','true');
  loginCard.classList.remove('signed-in');
  loginHeading.textContent='Sign In';
  executivePass.classList.remove('authorized','pass-verified','pass-condensed','merge-source');
  loginCard.classList.remove('merge-source');
  document.getElementById('accessMergeScene')?.classList.remove('active','converging','approved');
  changeAccount.disabled=false;
  approvalPending=false;
  emailInput.disabled=false;
  password.disabled=false;
  passwordToggle.disabled=false;
  loginButton.disabled=false;
  loginButton.textContent='SIGN IN TO BLACKCELL ↗';
  changeAccount.hidden=true;
  access.value='';
  security.value='';
  password.value='';
  clearMessage(status);
  clearMessage(codeStatus);
  window.setTimeout(()=>emailInput.focus({preventScroll:true}),400);
}

function approvalAndLaunch(){
  // This visual sequence only runs after server-side second-factor
  // verification and Corporate Session authorization both succeeded.
  if(approvalPending)return;
  approvalPending=true;
  access.value='';
  security.value='';
  authButton.disabled=true;
  continueVerified.disabled=true;
  changeAccount.disabled=true;
  clearMessage(codeStatus);
  executivePass.classList.add('pass-verified');
  window.setTimeout(()=>{
    executivePass.classList.add('pass-condensed');
    window.setTimeout(mergeVerifiedBubbles,890);
  },630);
}

function mergeVerifiedBubbles(){
  const scene=document.getElementById('accessMergeScene');
  const identity=document.getElementById('mergeIdentity');
  const pass=document.getElementById('mergePass');
  const passLevel=document.getElementById('mergePassLevel');
  const leftBeam=document.getElementById('mergeBeamIdentity');
  const rightBeam=document.getElementById('mergeBeamPass');
  if(!scene||!identity||!pass||!leftBeam||!rightBeam){
    // Do not strand an authorized user if an optional animation element
    // fails to load. The protected dashboard still checks authorization.
    displayLaunch();
    return;
  }
  passLevel.textContent=clearanceLevel.textContent;
  const w=window.innerWidth,h=window.innerHeight;
  const compact=w<=950;
  const midX=w/2,midY=h/2;
  const makeRect=(left,top,width,height)=>({left,top,width,height,
    cx:left+width/2,cy:top+height/2});
  function fromElement(element){
    const r=element.getBoundingClientRect();
    return makeRect(r.left,r.top,r.width,r.height);
  }
  let identityRect=fromElement(loginCard);
  let passRect=fromElement(executivePass);
  if(compact){
    // On small screens the verified identity is hidden behind the card;
    // position both compact summaries visibly before they converge.
    const pw=Math.min(175,Math.max(130,(w-42)/2));
    const ph=154;
    identityRect=makeRect(12,midY-ph/2,pw,ph);
    passRect=makeRect(w-pw-12,midY-ph/2,pw,ph);
  }
  for(const [element,r] of [[identity,identityRect],[pass,passRect]]){
    element.style.left=r.left+'px';
    element.style.top=r.top+'px';
    element.style.width=r.width+'px';
    element.style.height=r.height+'px';
    element.style.transform='translate(0,0) scale(1)';
    element.classList.remove('merging');
  }
  // Luminous paths show the two verified credentials converging.
  const trail=(r)=>'M '+r.cx+' '+r.cy+
    ' C '+(r.cx+(midX-r.cx)*.46)+' '+(r.cy-40)+
    ' '+(midX+(r.cx-midX)*.20)+' '+(midY-65)+
    ' '+midX+' '+midY;
  leftBeam.setAttribute('d',trail(identityRect));
  rightBeam.setAttribute('d',trail(passRect));
  scene.classList.remove('converging','approved');
  scene.classList.add('active');
  requestAnimationFrame(()=>{
    // Replace the source surfaces only after the identical green bubbles
    // are drawn over their original positions.
    requestAnimationFrame(()=>{
      loginCard.classList.add('merge-source');
      executivePass.classList.add('merge-source');
      scene.classList.add('converging');
      for(const [element,r] of [[identity,identityRect],[pass,passRect]]){
        element.style.transform=
          'translate('+(midX-r.cx)+'px,'+(midY-r.cy)+'px) scale(.42)';
        element.classList.add('merging');
      }
    });
  });
  window.setTimeout(()=>scene.classList.add('approved'),850);
  window.setTimeout(displayLaunch,2420);
}

function displayLaunch(){
  access.value='';
  security.value='';
  launch.classList.add('active');
  launch.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  const fill=document.getElementById('launchFill');
  const percent=document.getElementById('launchPercent');
  const note=document.getElementById('launchNote');
  const start=performance.now();
  const duration=3400;
  function frame(now){
    const p=Math.min(1,(now-start)/duration);
    const smoothed=1-Math.pow(1-p,2.3);
    const number=Math.round(smoothed*100);
    fill.style.width=number+'%';
    percent.textContent=number+'%';
    note.textContent=p<.33?'VERIFYING CORPORATE SESSION':p<.77?'INITIALIZING COMMAND CENTER':'LAUNCHING ADMINISTRATION';
    if(p<1)requestAnimationFrame(frame);
    else location.replace('dashboard.html');
  }
  requestAnimationFrame(frame);
}

async function initialState(){
  const state=await timed(corporateAuthorize(client),'Saved session check');
  if(!state.ok){
    if(state.reason==='not-approved'){
      await client.auth.signOut({scope:'local'});
      message(status,'This account is not approved for Corporate Access.');
    }else if(state.reason==='verification-error'){
      message(status,'Unable to verify employee authorization.');
    }
    return;
  }
  if(state.member?.role!=='owner'||Number(state.member?.clearance_level)!==7||!applyClearance(state.member)){
    message(status,'This account does not have Level 7 administrator clearance.');
    return;
  }
  emailInput.value=state.user?.email||emailInput.value;
  const {data,error}=await timed(client.rpc('corp_code_status'),'Saved code status check');
  if(error||data?.ok!==true){
    message(status,'Unable to verify the security session. Please try again.');
    return;
  }
  if(data.verified===true){verifiedResume();return;}
  if(data.expired===true){
    await client.auth.signOut({scope:'local'});
    message(status,'Signed out after 60 minutes of inactivity. Please sign in again.');
    return;
  }
  showPass();
}


passwordToggle.addEventListener('click',()=>{
  const show=password.type==='password';
  password.type=show?'text':'password';
  passwordToggle.textContent=show?'HIDE':'SHOW';
});

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(loginInProgress)return;
  if(!client){message(status,'Secure login is still starting. Please try again.');return;}
  loginInProgress=true;
  loginButton.disabled=true;
  loginButton.textContent='SIGNING IN…';
  message(status,'Verifying your email and password…');
  try{
    const {error}=await timed(client.auth.signInWithPassword({
      email:document.getElementById('email').value.trim(),
      password:password.value
    }), 'Email and password sign-in');
    if(error){message(status,'Email or password was not accepted.');return;}
    message(status,'Email and password accepted. Checking corporate authorization…');
    const member=await timed(corporateAuthorize(client),'Corporate employee check');
    if(!member.ok){
      await client.auth.signOut({scope:'local'});
      message(status,member.reason==='verification-error'?'Cannot verify access right now.':'This account is not approved for Corporate Access.');
      return;
    }
    if(member.member?.role!=='owner'||Number(member.member?.clearance_level)!==7||!applyClearance(member.member)){
      message(status,'This account does not have Level 7 administrator clearance.');
      return;
    }
    const {data, error:checkError}=await timed(client.rpc('corp_code_status'),'Corporate code status check');
    if(checkError||data?.ok!==true){
      message(status,'Unable to start code verification.');
      return;
    }
    showPass();
  }catch(error){
    message(status,explain(error,'Sign in could not be completed. Check your connection.'));
  }finally{
    loginInProgress=false;
    if(!stage.classList.contains('show-pass')){
      loginButton.disabled=false;
      loginButton.textContent='SIGN IN TO BLACKCELL ↗';
    }
  }
});

continueVerified.addEventListener('click',async()=>{
  continueVerified.disabled=true;
  clearMessage(codeStatus);
  try{
    const {data,error}=await client.rpc('corp_code_status');
    if(error || data?.ok!==true || data?.verified!==true){
      showPass();
      message(codeStatus,'Your previous authorization has expired. Re-enter both security codes.');
      return;
    }
    approvalAndLaunch();
  }catch(_){
    showPass();
    message(codeStatus,'Could not recheck your authorization. Enter both security codes.');
  }finally{
    continueVerified.disabled=false;
  }
});

formCode.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!client)return;
  authButton.disabled=true;
  authButton.textContent='AUTHENTICATING…';
  clearMessage(codeStatus);
  try{
    const {data:verified,error:verificationError}=await client.functions.invoke('nexus-gateway-verify',{
      body:{accessCode:access.value,securityCode:security.value}
    });
    if(verificationError||verified?.verified!==true){
      message(codeStatus,'Access denied. Recheck both codes. Too many failed attempts may cause a temporary lock.');
      security.value='';
      return;
    }
    const {data:finalized,error:finalizeError}=await client.rpc('corp_finalize_nexus_verification');
    if(finalizeError||finalized?.ok!==true){
      message(codeStatus,'Security verification succeeded, but Corporate Access could not be finalized. Please try again.');
      return;
    }
    approvalAndLaunch();
  }catch(_){
    message(codeStatus,'Authentication is unavailable. Try again later.');
  }finally{
    authButton.disabled=false;
    authButton.textContent='AUTHENTICATE ↗';
  }
});

changeAccount.addEventListener('click',async()=>{
  try{await client?.auth.signOut({scope:'local'});}catch(_){}
  showLogin();
});

document.getElementById('reset').addEventListener('click',async()=>{
  const email=document.getElementById('email').value.trim();
  if(!email){message(status,'Enter your email address first.');return;}
  try{
    await client?.auth.resetPasswordForEmail(email,{redirectTo:new URL('login.html',location.href).href});
    message(status,'If this email has an account, password reset instructions were requested.');
  }catch(_){message(status,'Password reset is unavailable.');}
});

// The login form's event handlers are installed before any async session lookup.
// A stalled saved-session request therefore cannot freeze the Sign In button.
async function initializeLogin(){
  try{
    client=corporateClient();
  }catch(error){
    message(status,'Secure login cannot initialize. Refresh the page.');
    return;
  }
  try{
    await timed(initialState(),'Initial security check');
  }catch(error){
    if(!loginInProgress && !stage.classList.contains('show-pass'))
      message(status,explain(error,'Saved session could not be checked. You may still sign in with your email and password.'));
  }
}
void initializeLogin();
