import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261112-access2';
const db=corporateClient();
const $=id=>document.getElementById(id);
const state={channel:'imessage',user:null,owner:false,authorized:false,
 ready:false,username:'',linked:false,telegramUsername:'',
 working:false,lastSnapshot:'',subscription:null,accountChannel:null,
 initialized:false,refreshing:false,botTokenConfigured:false,webhookSecretConfigured:false};
const note=value=>{ $('bcTgFeedback').textContent=String(value||'')};
const explain=err=>String(err?.message||err||'Connection unavailable').replace(/\s+/g,' ').slice(0,210);
const span=(tag,className,value)=>{
 const el=document.createElement(tag);
 if(className)el.className=className;
 el.textContent=String(value===undefined?'':value);return el;
};
async function requireChat(){
 const a=await corporateAuthorize(db);
 if(!a.ok)return false;
 const method=a.member.role==='owner'?'corp_code_status':'corp_employee_code_status';
 if(a.member.role==='employee'&&a.member.can_chat!==true)return false;
 const v=await db.rpc(method);
 if(v.error||v.data?.ok!==true||v.data.verified!==true)return false;
 state.user=a.user;
 state.owner=a.member.role==='owner'&&a.member.clearance_level===7;
 state.authorized=true;
 return true;
}
function setChannel(channel){
 if(!['imessage','bot','personal'].includes(channel))return;
 state.channel=channel;
 const list={
  imessage:$('bcChannelImessage'),bot:$('bcChannelBot'),
  personal:$('bcChannelPersonal')
 };
 for(const [key,button] of Object.entries(list)){
  button.classList.toggle('active',channel===key);
  button.setAttribute('aria-pressed',String(channel===key));
 }
 document.body.classList.toggle('bc-channel-hide-chat',channel!=='imessage');
 // Some legacy chat styles force the original pane visible on mobile.
 // Apply an explicit channel visibility rule so Telegram never stacks on top of iMessage.
 const originalPane=document.querySelector('body > .chat');
 if(originalPane){
  originalPane.hidden=channel!=='imessage';
  if(channel!=='imessage')originalPane.style.setProperty('display','none','important');
  else originalPane.style.removeProperty('display');
 }
 $('bcTelegramWorkspace').hidden=channel==='imessage';
 $('bcTgBotPane').hidden=channel!=='bot';
 $('bcTgPersonalPane').hidden=channel!=='personal';
 if(channel==='personal'){
  $('bcTgHeading').textContent='Connect Telegram';
  $('bcTgIntro').textContent='Sign in with your Telegram identity. Personal chat syncing is separate and optional.';
  $('bcTgStatus').textContent='CHECKING';
  $('bcTgStatus').classList.remove('connected');
  void refreshPersonalIdentity();
 }else if(channel==='bot'){
  $('bcTgHeading').textContent='Telegram Bot';
  $('bcTgIntro').textContent='Messages with your BLACKCELL Telegram bot, separate from your personal conversations.';
  if(!state.initialized)void initializeTelegram();
  else{renderStatus();void refreshTelegram()}
 }
}
async function refreshPersonalIdentity(){
 const statusEl=$('bcTgPersonalLinkStatus');
 if(!statusEl)return;
 statusEl.textContent='CHECKING CONNECTION';
 try{
  const {data,error}=await db.functions.invoke('blackcell-telegram-login',{body:{action:'status'}});
  if(error||data?.ok!==true){
   statusEl.textContent='BLACKCELL VERIFIED SIGN-IN REQUIRED';
   $('bcTgStatus').textContent='NOT VERIFIED';
   return;
  }
  const connected=Boolean(data.connected);
  const connectLink=$('bcTgPersonalConnectLink');
  const tryBot=$('bcTgTryBot');
  if(connected){
   connectLink.textContent='MANAGE CONNECTED IDENTITY ↗';
   tryBot.hidden=false;
   const username=String(data.account?.username||'').trim();
   statusEl.textContent=username?'CONNECTED AS @'+username:'TELEGRAM IDENTITY CONNECTED';
   $('bcTgStatus').textContent='IDENTITY CONNECTED';
   $('bcTgStatus').classList.add('connected');
  }else{
   connectLink.textContent='✈ CONNECT TELEGRAM IDENTITY ↗';
   tryBot.hidden=false;
   statusEl.textContent=data.configured?'READY TO CONNECT':'ADMIN SETUP REQUIRED';
   $('bcTgStatus').textContent=data.configured?'NOT CONNECTED':'NOT CONFIGURED';
   $('bcTgStatus').classList.remove('connected');
  }
 }catch{
  statusEl.textContent='SIGN-IN STATUS TEMPORARILY UNAVAILABLE';
  $('bcTgStatus').textContent='UNAVAILABLE';
 }
}
function renderStatus(){
 const badge=$('bcTgStatus');
 badge.classList.toggle('connected',state.linked&&state.ready);
 badge.textContent=state.linked&&state.ready?'● LINKED & ACTIVE':
  state.linked?'LINKED · BOT SETUP NEEDED':
   state.ready?'BOT READY · NOT LINKED':'BOT NOT CONFIGURED';
 $('bcTgBotName').textContent=state.username?'@'+state.username:'BLACKCELL Telegram Bot';
 $('bcTgThreadName').textContent=state.username?'@'+state.username:'Telegram Bot';
 $('bcTgGenerateLink').hidden=state.linked;
 $('bcTgGenerateLink').disabled=!state.ready||state.working;
 $('bcTgDisconnect').hidden=!state.linked;
 $('bcTgDisconnect').disabled=state.working;
 $('bcTgMessageInput').disabled=!(state.linked&&state.ready)||state.working;
 $('bcTgSend').disabled=!(state.linked&&state.ready)||state.working;
 $('bcTgOwnerSettings').hidden=!state.owner;
 if(state.owner&&document.activeElement!==$('bcTgUsername'))$('bcTgUsername').value=state.username;
 if(!state.ready)$('bcTgLinkDetails').textContent=
  'A verified administrator must register the BLACKCELL bot and configure its server-side token and webhook secret first.';
 else if(state.linked)$('bcTgLinkDetails').textContent=
  state.telegramUsername?'Linked Telegram account: @'+state.telegramUsername:'Your Telegram account is linked. Only this bot chat is synchronized.';
 else if(!$('bcTgConnectLink').hidden)$('bcTgLinkDetails').textContent=
  'Your private link expires after 15 minutes. Open Telegram and tap Start.';
 else $('bcTgLinkDetails').textContent=
  'Tap Generate Private Link. Only your own corporate account can receive messages from this linked bot.';
}
async function api(body){
 const {data,error}=await db.functions.invoke('blackcell-telegram-api',{body});
 if(error)throw error;
 if(!data?.ok)throw Error(data?.error||'telegram_service_unavailable');
 return data;
}
async function refreshTelegram(){
 if(!state.authorized||state.refreshing)return;
 state.refreshing=true;
 try{
  const [status,account,messages]=await Promise.all([
   api({action:'status'}),
   db.from('corp_telegram_bot_accounts').select('user_id,username,linked_at').eq('user_id',state.user.id).maybeSingle(),
   db.from('corp_telegram_bot_messages').select('id,direction,body,created_at')
    .eq('user_id',state.user.id).order('created_at',{ascending:true}).limit(500)
  ]);
  if(account.error)throw account.error;
  if(messages.error)throw messages.error;
  state.ready=Boolean(status.ready);
  state.username=String(status.bot_username||'');
  state.botTokenConfigured=Boolean(status.bot_token_configured);
  state.webhookSecretConfigured=Boolean(status.webhook_secret_configured);
  if(state.owner){
   $('bcTgOwnerHelp').textContent=!state.botTokenConfigured||!state.webhookSecretConfigured
    ?'Owner setup: add BLACKCELL_TELEGRAM_BOT_TOKEN and BLACKCELL_TELEGRAM_WEBHOOK_SECRET in Supabase Edge Function Secrets. Do not paste these secrets into BLACKCELL.'
    :'Server credentials are present. Tap ACTIVATE WEBHOOK to verify the bot, save its public username automatically, and enable messaging.';
  }
  state.linked=Boolean(account.data);
  state.telegramUsername=String(account.data?.username||'');
  renderStatus();
  const data=messages.data||[];
  const snapshot=JSON.stringify(data.map(m=>[m.id,m.direction,m.body,m.created_at]));
  if(state.lastSnapshot!==snapshot){
   state.lastSnapshot=snapshot;renderMessages(data);
  }
  if(state.channel==='bot')note('');
 }catch(err){
  if(state.channel==='bot')note('Telegram sync: '+explain(err));
 }finally{state.refreshing=false}
}
function renderMessages(messages){
 const box=$('bcTgMessages');
 const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100;
 box.replaceChildren();
 if(!messages.length){
  box.append(span('p','bc-tg-empty',state.linked
   ?'No Telegram bot messages yet. Send your first message to the BLACKCELL bot.'
   :'Connect the BLACKCELL Telegram bot to see your private messages here.'));
  return;
 }
 for(const msg of messages){
  const article=span('article','bc-tg-message '+(msg.direction==='outgoing'?'outgoing':'incoming'),'');
  article.append(span('div','bc-tg-bubble',msg.body));
  const d=new Date(msg.created_at);
  article.append(span('small','',Number.isNaN(d.valueOf())?'':d.toLocaleString([],{
   month:'short',day:'numeric',hour:'numeric',minute:'2-digit'
  })));
  box.append(article);
 }
 if(nearBottom)box.scrollTop=box.scrollHeight;
}
async function initializeTelegram(){
 if(state.initialized)return;
 state.initialized=true;
 note('Verifying your corporate messaging permissions…');
 if(!await requireChat()){
  state.initialized=false;
  note('BLACKCELL chat access must be verified before Telegram can be used.');
  $('bcTgStatus').textContent='NOT AUTHORIZED';
  return;
 }
 note('');
 await refreshTelegram();
 const id=state.user.id;
 state.subscription=db.channel('bc-telegram-user-messages-'+id)
  .on('postgres_changes',{
   event:'*',schema:'public',table:'corp_telegram_bot_messages',filter:'user_id=eq.'+id
  },()=>{if(state.channel==='bot')void refreshTelegram()}).subscribe();
 state.accountChannel=db.channel('bc-telegram-user-link-'+id)
  .on('postgres_changes',{
   event:'*',schema:'public',table:'corp_telegram_bot_accounts',filter:'user_id=eq.'+id
  },()=>{if(state.channel==='bot')void refreshTelegram()}).subscribe();
 window.setInterval(()=>{
  if(!document.hidden&&state.channel==='bot')void refreshTelegram();
 },15000);
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&state.channel==='bot')void refreshTelegram();
 });
}
async function generateLink(){
 if(state.working||!state.authorized||!state.ready)return;
 state.working=true;renderStatus();
 try{
  const {data,error}=await db.rpc('corp_telegram_begin_bot_link');
  if(error||!data?.ok)throw Error(error?.message||data?.reason||'Could not create link');
  const url=String(data.url||'');
  if(!/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{1,28}bot\?start=[a-f0-9-]+$/i.test(url))
   throw Error('Invalid Telegram link from server');
  const link=$('bcTgConnectLink');
  link.href=url;link.hidden=false;
  $('bcTgLinkDetails').textContent='Tap Open Telegram and press Start in the bot conversation. The link expires in 15 minutes.';
  note('Secure private Telegram link generated. Tap Open Telegram to continue.');
 }catch(e){note('Unable to generate link: '+explain(e))}
 finally{state.working=false;renderStatus()}
}
async function disconnect(){
 if(!state.linked||state.working)return;
 if(!window.confirm('Disconnect your Telegram bot? Your stored BLACKCELL chat history remains private.'))return;
 state.working=true;renderStatus();
 try{
  const {data,error}=await db.rpc('corp_telegram_disconnect_bot');
  if(error||data?.ok!==true)throw Error(error?.message||data?.reason||'Disconnect failed');
  state.linked=false;state.telegramUsername='';
  $('bcTgConnectLink').hidden=true;
  note('Telegram bot disconnected.');
  await refreshTelegram();
 }catch(e){note('Could not disconnect: '+explain(e))}
 finally{state.working=false;renderStatus()}
}
async function saveName(){
 if(!state.owner||state.working)return;
 const name=$('bcTgUsername').value.trim();
 state.working=true;
 try{
  const {data,error}=await db.rpc('corp_telegram_owner_set_bot_name',{p_username:name});
  if(error||data?.ok!==true)throw Error(error?.message||data?.reason||'Save failed');
  state.username=data.bot_username;
  note('Public bot username saved. Server-side Telegram secrets are also required.');
  await refreshTelegram();
 }catch(e){note('Bot username could not be saved: '+explain(e))}
 finally{state.working=false;renderStatus()}
}
async function activate(){
 if(!state.owner||state.working)return;
 state.working=true;renderStatus();
 try{
  const data=await api({action:'activate_webhook'});
  note(data.registered?'Telegram bot @'+String(data.bot_username||'')+' activated. Next tap GENERATE PRIVATE LINK, open Telegram, and press Start.':'Telegram webhook activation was not confirmed.');
 }catch(e){note('Webhook not activated: '+explain(e))}
 finally{state.working=false;await refreshTelegram()}
}
async function sendMessage(event){
 event.preventDefault();
 if(!state.authorized||!state.linked||!state.ready||state.working)return;
 const body=$('bcTgMessageInput').value.trim();
 if(!body)return;
 state.working=true;renderStatus();
 try{
  await api({action:'send',body});
  $('bcTgMessageInput').value='';
  note('');
  state.lastSnapshot='';
  await refreshTelegram();
 }catch(e){note('Could not send Telegram bot message: '+explain(e))}
 finally{state.working=false;renderStatus()}
}
$('bcChannelImessage').addEventListener('click',()=>setChannel('imessage'));
$('bcChannelBot').addEventListener('click',()=>setChannel('bot'));
$('bcChannelPersonal').addEventListener('click',()=>setChannel('personal'));
$('bcTgGenerateLink').addEventListener('click',()=>void generateLink());
$('bcTgTryBot').addEventListener('click',()=>setChannel('bot'));
$('bcTgRefresh').addEventListener('click',()=>void refreshTelegram());
$('bcTgDisconnect').addEventListener('click',()=>void disconnect());
$('bcTgSaveName').addEventListener('click',()=>void saveName());
$('bcTgActivateWebhook').addEventListener('click',()=>void activate());
$('bcTgComposer').addEventListener('submit',e=>void sendMessage(e));
setChannel('imessage');
