import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-clearance5';

const gate=document.getElementById('opGate');
const gateMessage=document.getElementById('opGateMessage');
const loginLink=document.getElementById('opLogin');
const app=document.getElementById('opApp');
let client,closed=false,lastActivity=Date.now(),lastTouch=0,touching=false;
const idleLimit=60*60*1000;
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
  location.replace('login.html');
}
async function verifySession(){
  if(closed||!client)return;
  if(Date.now()-lastActivity>=idleLimit){await signOut();return;}
  try{
    const {data,error}=await client.rpc('corp_code_status');
    if(error||data?.ok!==true||data?.verified!==true){await signOut();}
  }catch(_){await signOut();}
}
async function extendSession(){
  if(closed||touching||Date.now()-lastTouch<60000)return;
  if(Date.now()-lastActivity>=idleLimit){await signOut();return;}
  touching=true;lastTouch=Date.now();
  try{
    const {data,error}=await client.rpc('corp_touch_session');
    if(error||data?.ok!==true)await signOut();
  }catch(_){await signOut()}
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
  const {initWorkspace}=await import('./corporate-workspace-app.js?v=20261112-ws1');
  if(typeof initWorkspace!=='function')throw new Error('Workspace initialization is unavailable.');
  await initWorkspace(client);
  gate.hidden=true;app.hidden=false;
  const dot=document.getElementById('opSessionDot');if(dot)dot.dataset.state='online';
  document.getElementById('opSignOut')?.addEventListener('click',()=>{void signOut()});
  for(const name of ['pointerdown','keydown','touchstart']){
    window.addEventListener(name,()=>{
      lastActivity=Date.now();void extendSession();
    },{passive:true});
  }
  window.addEventListener('focus',()=>{void verifySession()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void verifySession()});
  setInterval(()=>{if(Date.now()-lastActivity>=idleLimit)void signOut()},15000);
  setInterval(()=>{if(!document.hidden)void verifySession()},60000);
}catch(error){
  deny(error?.message||'Could not verify corporate session. Return to sign in.');
}
