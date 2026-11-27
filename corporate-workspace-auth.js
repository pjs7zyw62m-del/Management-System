import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261117-os-perf1';

const gate=document.getElementById('opGate');
const gateMessage=document.getElementById('opGateMessage');
const loginLink=document.getElementById('opLogin');
const app=document.getElementById('opApp');
let client,closed=false,lastActivity=Date.now(),lastTouch=0,touching=false,verifying=false,verificationPaused=false;
const idleLimit=60*60*1000;
let embedded=false;try{embedded=parent!==window&&parent.location.origin===location.origin&&parent.document.documentElement.classList.contains('corp-ok')&&[...parent.document.querySelectorAll('iframe[data-bc-admin-workspace]')].some(f=>f.contentWindow===window)}catch(_){}
const notify=type=>{if(embedded)parent.postMessage({type},location.origin)};
function deny(message){
  if(gateMessage)gateMessage.textContent=message;
  if(gate)gate.hidden=false;
  if(app)app.hidden=true;
  if(loginLink)loginLink.hidden=false;
}
async function signOut(){
  if(closed)return;
  closed=true;
  deny('Ending your corporate verification session…');
  try{await client?.rpc('corp_end_session')}catch(_){}
  try{await client?.auth.signOut({scope:'local'})}catch(_){}
  if(embedded)notify('blackcell-admin-workspace-signed-out');else location.replace('login.html');
}
function isDefiniteRejection(response){
  // A denied/expired credential is different from a disconnected network.
  // Keep explicit server-side denials fail-closed and end the local session.
  const status=Number(response?.status)||0;
  const code=String(response?.error?.code||'');
  return status===401||status===403||code==='42501'||code==='PGRST301';
}
function pauseForTransport(){
  if(closed)return;
  // Fail closed visually, but don't destroy a valid session on a network error.
  verificationPaused=true;
  deny('Secure verification is temporarily unavailable. Your session is preserved while BLACKCELL retries.');
  if(loginLink)loginLink.hidden=true;
}
async function verifySession(){
  if(closed||!client||verifying)return;
  if(!embedded&&Date.now()-lastActivity>=idleLimit){await signOut();return;}
  verifying=true;
  try{
    const result=await client.rpc('corp_code_status');
    const {data,error}=result;
    if(error){if(isDefiniteRejection(result))await signOut();else pauseForTransport();return;}
    if(data?.ok!==true||data?.verified!==true){await signOut();return;}
    if(verificationPaused){verificationPaused=false;gate.hidden=true;app.hidden=false;}
  }catch(_){pauseForTransport();}
  finally{verifying=false;}
}
async function extendSession(){
  if(closed||touching||Date.now()-lastTouch<60000)return;
  if(!embedded&&Date.now()-lastActivity>=idleLimit){await signOut();return;}
  touching=true;lastTouch=Date.now();
  try{
    const result=await client.rpc('corp_touch_session');
    const {data,error}=result;
    if(error){if(isDefiniteRejection(result))await signOut();else pauseForTransport();return;}
    if(data?.ok!==true)await signOut();
  }catch(_){pauseForTransport()}
  finally{touching=false}
}
try{
  client=corporateClient();
  const auth=await corporateAuthorize(client);
  if(!auth.ok)throw new Error('Corporate authorization is unavailable. Sign in again.');
  if(auth.member?.role!=='owner'||Number(auth.member?.clearance_level)!==7)
    throw new Error('This workspace requires Level 7 corporate owner authorization.');
  const status=await client.rpc('corp_code_status');
  if(status.error||status.data?.ok!==true||status.data?.verified!==true)
    throw new Error('Verified corporate security codes are required. Return to secure sign-in.');
  window.BLACKCELL_CORPORATE_ADMIN_API=Object.freeze({client});
  const {initWorkspace}=await import(document.body.dataset.workspace==='diagnostics'?'./corporate-workspace-app.js?v=20261127-core-release1':document.body.dataset.workspace==='security'?'./corporate-workspace-app.js?v=20261114-soc-lockdown-readiness':document.body.dataset.workspace==='systems'?'./corporate-workspace-app.js?v=20261114-systems-panel':'./corporate-workspace-app.js?v=20261113-costs1');
  if(typeof initWorkspace!=='function')throw new Error('Workspace initialization is unavailable.');
  await initWorkspace(client);
  gate.hidden=true;app.hidden=false;
  const dot=document.getElementById('opSessionDot');if(dot)dot.dataset.state='online';
  document.getElementById('opSignOut')?.addEventListener('click',()=>{void signOut()});
  for(const name of ['pointerdown','keydown','touchstart']){
    window.addEventListener(name,()=>{
      lastActivity=Date.now();if(embedded)notify('blackcell-admin-workspace-activity');else void extendSession();
    },{passive:true});
  }
  window.addEventListener('focus',()=>{void verifySession()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void verifySession()});
  setInterval(()=>{if(!embedded&&Date.now()-lastActivity>=idleLimit)void signOut()},15000);
  setInterval(()=>{if(!document.hidden)void verifySession()},60000);
}catch(error){
  deny(error?.message||'Could not verify corporate session. Return to sign in.');
}
