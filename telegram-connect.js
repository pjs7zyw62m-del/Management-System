import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261112-access2';

const $=id=>document.getElementById(id);
let client=null,access=null,connected=false,configured=false,loading=false,statusUnknown=false;
const callbackUrl='https://eeddazzwqokqlzvzjlxz.supabase.co/functions/v1/blackcell-telegram-login';

function message(text,error=false){
 $('feedback').textContent=text||'';
 $('feedback').classList.toggle('error',error);
}
function badge(text,style=''){
 $('statusBadge').textContent=text;
 $('statusBadge').className='state '+style;
}
function render(account=null){
 connected=Boolean(account);
 $('glass').classList.toggle('connected',connected);
 $('heading').textContent=connected?
  (account?.display_name||'Telegram Connected'):'Personal Telegram';
 $('description').textContent=connected
  ?('Connected as '+(account?.username?'@'+account.username:'your verified Telegram identity')+'.')
  :'Secure Telegram identity sign-in. Personal chats remain private.';
 $('connect').hidden=connected;
 $('disconnect').hidden=!connected;
 $('testBot').hidden=!connected;
 $('botTestHint').hidden=!connected;
 if(access?.member?.role==='owner'&&access?.member?.clearance_level===7)
  $('ownerHelp').hidden=connected;
 // Keep the button usable even before administrator setup: explain what is missing.
 $('connect').disabled=loading||!access;
 $('disconnect').disabled=loading;
 $('syncBadge').textContent='NOT ENABLED';
 $('step1').className='step '+(connected?'done':'active');
 $('step2').className='step '+(connected?'active':'');
 $('step3').className='step';
 badge(connected?'● CONNECTED':configured?'READY TO CONNECT':'NOT CONFIGURED',connected?'connected':configured?'':'pending');
 if(!configured&&!connected&&access){
  message(access.member?.role==='owner'
   ?'One-time administrator setup is required. Follow the secure setup instructions below.'
   :'Telegram connection is not yet available. Contact your BLACKCELL administrator.');
 }
}
async function invoke(action){
 const {data,error}=await client.functions.invoke('blackcell-telegram-login',{body:{action}});
 if(error){
  let detail=null;
  try{detail=await error.context?.json?.()}catch{}
  throw new Error(String(detail?.error||data?.error||error.message||'Connection unavailable'));
 }
 if(!data?.ok)throw new Error(String(data?.error||'Connection unavailable'));
 return data;
}
async function status(){
 const d=await invoke('status');
 statusUnknown=false;
 configured=Boolean(d.configured);
 render(d.connected?d.account:null);
 $('callback').textContent=d.callback_url||callbackUrl;
}
async function init(){
 const params=new URLSearchParams(location.search);
 const result=params.get('telegram');
 if(result){
  history.replaceState(null,'',location.pathname);
  const messages={
   linked:'Telegram identity linked successfully. Personal chat syncing remains optional and inactive.',
   failed:'Telegram authorization could not be completed. Try connecting again.',
   expired:'Your Telegram approval expired. Please start again.',
   in_use:'This Telegram account is already connected to another BLACKCELL user.',
   not_allowed:'Your BLACKCELL messaging access is not authorized.'
  };
  if(messages[result])message(messages[result],result!=='linked');
 }
 $('callback').textContent=callbackUrl;
 try{
  client=corporateClient();
  access=await corporateAuthorize(client);
  if(!access?.ok){
   $('heading').textContent='BLACKCELL sign-in required';
   $('description').textContent='Sign in to your approved BLACKCELL account before connecting Telegram.';
   badge('NOT AUTHORIZED','pending');
   $('connect').disabled=true;
   message('BLACKCELL chat access is required. Return to iMessage and sign in.',true);
   return;
  }
  $('ownerHelp').hidden=!(access.member?.role==='owner'&&access.member.clearance_level===7);
  await status();
  if(result==='linked')message('Telegram identity connected securely. Your personal chats were not imported.');
 }catch(err){
  statusUnknown=true;
  badge('RETRY AVAILABLE','pending');
  $('heading').textContent='Personal Telegram';
  $('description').textContent='Your BLACKCELL session is available. Telegram connection check needs another attempt.';
  message('Telegram connection check failed. Tap Continue with Telegram to retry the authorization securely. '+String(err.message||err).slice(0,90),true);
  $('connect').disabled=!access;
 }
}
$('connect').addEventListener('click',async()=>{
 if(loading||!client||!access)return;
 if(!configured&&!statusUnknown){
  message(access.member?.role==='owner'
   ?'Telegram Login needs one-time setup. Follow the Administrator Setup instructions below, then try again.'
   :'Telegram Login has not been activated by your BLACKCELL administrator yet.',true);
  if(access.member?.role==='owner')$('ownerHelp').scrollIntoView({behavior:'smooth',block:'center'});
  return;
 }
 loading=true;$('connect').disabled=true;message('Opening Telegram authorization securely…');
 try{
  const data=await invoke('begin');
  const url=new URL(data.url);
  if(url.origin!=='https://oauth.telegram.org'||url.pathname!=='/auth')throw Error('Invalid authorization URL');
  location.assign(url.href);
 }catch(err){
  loading=false;
  message('Telegram sign-in could not start: '+String(err.message||err).slice(0,160),true);
  $('connect').disabled=false;
 }
});
$('disconnect').addEventListener('click',async()=>{
 if(loading||!connected||!client)return;
 if(!confirm('Disconnect your Telegram identity from BLACKCELL? BLACKCELL iMessage messages will not be deleted.'))return;
 loading=true;render({display_name:$('heading').textContent});
 try{
  await invoke('disconnect');
  loading=false;connected=false;render(null);
  message('Telegram identity disconnected. Your BLACKCELL messages are unchanged.');
 }catch(err){
  loading=false;message('Unable to disconnect: '+String(err.message||err).slice(0,160),true);
  await status().catch(()=>{});
 }
});
$('skip').addEventListener('click',()=>{location.assign('corporate-chat.html')});
$('chatSync').addEventListener('click',()=>{
 message('Personal chat syncing is not available yet. A separate Telegram TDLib client and individual authorization are required. Your Telegram Login only connects your identity.');
 document.querySelector('#ownerHelp')?.scrollIntoView({behavior:'smooth',block:'nearest'});
});
void init();
