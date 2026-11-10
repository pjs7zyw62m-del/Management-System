/* BLACKCELL / Gunner Thompson – military-only floating assistant */
export function mountMilitaryGunner({client,getContext,mount=document.body,visible=true}){
 if(!mount)return {open:()=>{},setVisible:()=>{}};
 if(!document.getElementById('militaryGunnerStyle')){
  const tag=document.createElement('link');tag.id='militaryGunnerStyle';
  tag.rel='stylesheet';tag.href='military-gunner.css?v=20261110-gunner1';document.head.append(tag);
 }
 const $=id=>document.getElementById(id);
 const root=document.createElement('aside');root.id='bcGunner';root.hidden=!visible;
 root.setAttribute('aria-label','Gunner Thompson Military Library companion');
 const launcher=document.createElement('button');launcher.type='button';launcher.id='bcGunnerLauncher';
 const badge=document.createElement('span');badge.className='gunner-avatar';badge.textContent='G';
 const label=document.createElement('span');label.textContent='GUNNER THOMPSON  ✦';
 launcher.append(badge,label);
 const panel=document.createElement('section');panel.id='bcGunnerPanel';panel.hidden=true;
 panel.setAttribute('aria-label','Gunner Thompson Military Library chat');
 panel.innerHTML='<div class="gunner-head"><div class="gunner-badge">G</div><div><strong>Gunner Thompson</strong><small>BLACKCELL / MILITARY COMPANION</small></div><button type="button" id="bcGunnerClose" aria-label="Close Gunner chat">✕</button></div><div class="gunner-intro">Keep browsing military pages while we talk. Gunner can discuss saved photo classifications and your country collection. AI credits are used only when you send a message.</div><div id="bcGunnerMessages" class="gunner-messages" role="log" aria-live="polite"></div><form id="bcGunnerForm" class="gunner-input"><textarea id="bcGunnerText" maxlength="1600" placeholder="Ask Gunner something…" aria-label="Message Gunner"></textarea><div class="gunner-actions"><small id="bcGunnerStatus">PRIVATE CHAT · READY</small><button id="bcGunnerSend" type="submit">SEND ↗</button></div></form>';
 root.append(launcher,panel);mount.append(root);
 let loaded=false,busy=false;
 const messages=$('bcGunnerMessages'),input=$('bcGunnerText'),status=$('bcGunnerStatus');
 function append(role,text){
  const node=document.createElement('div');node.className='gunner-message '+role;node.textContent=String(text);
  messages.append(node);messages.scrollTop=messages.scrollHeight;return node;
 }
 function setStatus(text){status.textContent=text}
 async function loadMessages(){
  if(loaded)return;loaded=true;
  const {data,error}=await client.from('corp_social_gunner_messages')
   .select('id,role,content').order('id',{ascending:false}).limit(25);
  if(error){append('system','Private chat history is unavailable: '+error.message);return}
  if(data?.length)for(const row of [...data].reverse())append(row.role,row.content);
  else append('assistant',"Hey. Gunner here. What do you want to know about the Military Library?");
 }
 function open(){root.hidden=false;panel.hidden=false;void loadMessages();input.focus()}
 function close(){panel.hidden=true}
 launcher.addEventListener('click',()=>panel.hidden?open():close());
 $('bcGunnerClose').addEventListener('click',close);
 $('bcGunnerForm').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const value=input.value.trim();if(!value||value.length>1600)return;
  busy=true;$('bcGunnerSend').disabled=true;input.value='';
  append('user',value);setStatus('GUNNER IS REPLYING…');
  const placeholder=append('assistant','Thinking…');
  try{
   const ctx=typeof getContext==='function'?getContext()||{}:{};
   const {data,error}=await client.functions.invoke('blackcell-military-gunner',{
    body:{action:'chat',message:value,
     page_title:String(ctx.page_title||'Military Library').slice(0,75),
     countries:Array.isArray(ctx.countries)?ctx.countries.slice(0,12):[],
     photo_id:ctx.photo_id||null}
   });
   if(error){
    let detail=error.message||'Could not reach Gunner';
    try{const payload=await error.context?.json?.();if(payload?.error)detail=payload.error}catch(_){}
    throw Error(detail);
   }
   if(!data?.ok||!data?.answer)throw Error(data?.error||'No chat reply returned');
   placeholder.textContent=data.answer;
   setStatus('PRIVATE CHAT · '+(data.provider||'ONLINE'));
  }catch(error){
   placeholder.textContent='Could not answer: '+String(error?.message||'Chat service unavailable');
   setStatus('MESSAGE DELIVERY FAILED');
  }finally{busy=false;$('bcGunnerSend').disabled=false;messages.scrollTop=messages.scrollHeight}
 });
 function setVisible(v){root.hidden=!v;if(!v)close()}
 const api={open,close,setVisible,setPrompt:text=>{input.value=String(text||'').slice(0,1600);open()}};
 window.BLACKCELL_GUNNER=api;
 return api;
}
