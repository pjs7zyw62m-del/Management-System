/* BLACKCELL / Gunner Thompson – military-only floating assistant */
export function mountMilitaryGunner({client,getContext,mount=document.body,visible=true}){
 if(!mount)return {open:()=>{},setVisible:()=>{}};
 if(!document.getElementById('militaryGunnerStyle')){
  const tag=document.createElement('link');tag.id='militaryGunnerStyle';
  tag.rel='stylesheet';tag.href='military-gunner.css?v=20261110-fast4';document.head.append(tag);
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
 panel.innerHTML='<div class="gunner-head"><div class="gunner-badge">G</div><div><strong>Gunner Thompson</strong><small>ORIGINAL GUNNER / DOLPHIN 3.0</small></div><button type="button" id="bcGunnerClose" aria-label="Close Gunner chat">✕</button></div><div class="gunner-intro">The original Gunner Thompson from your Dolphin/RunPod project. His personality and memory vault are preserved. His thoughts about the Military Library are proposals for your approval, not automatic changes.</div><div id="bcGunnerMessages" class="gunner-messages" role="log" aria-live="polite"></div><form id="bcGunnerForm" class="gunner-input"><textarea id="bcGunnerText" maxlength="1600" placeholder="Ask Gunner something…" aria-label="Message Gunner"></textarea><div class="gunner-actions"><button id="bcGunnerVision" type="button">✦ GUNNER\'S VISION</button><button id="bcGunnerCheck" type="button" hidden>↻ CHECK REPLY</button><small id="bcGunnerStatus">DOLPHIN 3.0 · READY</small><button id="bcGunnerSend" type="submit">SEND ↗</button></div></form>';
 root.append(launcher,panel);mount.append(root);
 let loaded=false,busy=false,activeJob=null,pendingPlaceholder=null;
 const messages=$('bcGunnerMessages'),input=$('bcGunnerText'),status=$('bcGunnerStatus');
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function append(role,text){
  const node=document.createElement('div');node.className='gunner-message '+role;node.textContent=String(text);
  messages.append(node);messages.scrollTop=messages.scrollHeight;return node;
 }
 function setStatus(text){status.textContent=text}
 function setBusy(next){busy=next;$('bcGunnerSend').disabled=next;$('bcGunnerVision').disabled=next;$('bcGunnerCheck').disabled=next}
 function errorText(error){
  return String(error?.message||error||'Dolphin service unavailable').slice(0,300)
 }
 async function callGunner(body){
  const {data,error}=await client.functions.invoke('blackcell-military-gunner',{body});
  if(error){
   let detail=error.message||'Cannot reach the original Gunner';
   try{const payload=await error.context?.json?.();if(payload?.error)detail=payload.error}catch(_){}
   throw Error(detail);
  }
  if(!data?.ok)throw Error(data?.error||'Dolphin did not return a valid response');
  return data;
 }
 async function pollJob(id,placeholder){
  if(busy&&activeJob)return;
  activeJob=id;pendingPlaceholder=placeholder;
  $('bcGunnerCheck').hidden=true;
  setBusy(true);
  const begun=Date.now();
  let finished=false,failed=false;
  try{
   for(let attempt=0;attempt<180;attempt++){
    // Rapid checking for a warm worker; fewer checks during expensive cold starts.
    if(attempt>0)await pause(attempt<10?1600:attempt<26?3300:6000);
    const result=await callGunner({action:'status',bridge_job_id:id});
    const secs=Number.isFinite(result.elapsed_seconds)?Math.max(0,Math.round(result.elapsed_seconds)):Math.max(0,Math.round((Date.now()-begun)/1000));
    if(result.status==='completed'&&result.answer){
     placeholder.textContent=result.answer;
     setStatus('✓ ORIGINAL GUNNER · DOLPHIN 3.0');
     finished=true;activeJob=null;pendingPlaceholder=null;
     return;
    }
    if(result.status!=='pending')throw Error('Unexpected Dolphin job status');
    const stage=String(result.runpod_status||'IN_QUEUE').toUpperCase();
    if(stage==='IN_QUEUE'||stage==='QUEUED'){
     placeholder.textContent='RunPod is queuing or starting Dolphin. This can take longer when your worker has scaled to zero.';
     setStatus('DOLPHIN · QUEUED · '+secs+'s');
    }else if(stage==='IN_PROGRESS'||stage==='RUNNING'){
     placeholder.textContent='Dolphin is generating Gunner’s reply…';
     setStatus('DOLPHIN · GENERATING · '+secs+'s');
    }else{
     placeholder.textContent='RunPod status: '+stage.replace(/_/g,' ')+' · Checking the same job.';
     setStatus('DOLPHIN · '+stage.replace(/_/g,' ')+' · '+secs+'s');
    }
   }
   placeholder.textContent='Gunner is still processing at RunPod. Use CHECK REPLY to resume this same job; do not send another message.';
   setStatus('DOLPHIN · CHECK AGAIN WITHOUT PAYING');
  }catch(error){
   const message=errorText(error);
   failed=/job (?:failed|cancelled|timed out)|Dolphin job (?:failed|cancelled|timed out)/i.test(message);
   placeholder.textContent=failed?
    'That Dolphin request failed: '+message:
    'Could not check the pending reply: '+message+'. You can use CHECK REPLY; it does not start a new paid job.';
   setStatus(failed?'DOLPHIN JOB FAILED':'DOLPHIN · RETRY CHECK');
  }finally{
   if(finished||failed){activeJob=null;pendingPlaceholder=null;}
   $('bcGunnerCheck').hidden=!activeJob;
   setBusy(false);messages.scrollTop=messages.scrollHeight;
  }
 }
 async function loadMessages(){
  if(loaded)return;loaded=true;
  const {data,error}=await client.from('corp_social_gunner_messages')
   .select('id,role,content,bridge_job_id,created_at').not('bridge_job_id','is',null).order('id',{ascending:false}).limit(30);
  if(error){append('system','Private chat history is unavailable: '+error.message);return}
  if(data?.length)for(const row of [...data].reverse())append(row.role,row.content);
  else append('assistant',"Hey. It's Gunner. I'm here on the military side. Ask me what I'd change about this place.");
  const latest=(data||[])[0];
  if(latest?.role==='user'&&latest.bridge_job_id&&
    Date.now()-Date.parse(latest.created_at)<24*60*60*1000){
   append('system','An earlier Dolphin reply may still be processing. Checking the same job without a new paid request.');
   const placeholder=append('assistant','Checking original Gunner…');
   void pollJob(latest.bridge_job_id,placeholder);
  }
 }
 function open(){root.hidden=false;panel.hidden=false;void loadMessages();input.focus()}
 function close(){panel.hidden=true}
 launcher.addEventListener('click',()=>panel.hidden?open():close());
 $('bcGunnerClose').addEventListener('click',close);
 $('bcGunnerCheck').addEventListener('click',()=>{
  if(busy||!activeJob)return;
  const placeholder=pendingPlaceholder||append('assistant','Checking Dolphin…');
  void pollJob(activeJob,placeholder);
 });
 $('bcGunnerVision').addEventListener('click',()=>{
  const ctx=typeof getContext==='function'?getContext()||{}:{};
  const name=String(ctx.page_title||'Blackcell Military Library');
  input.value=("Gunner, what\'s the first thing YOU would change about "+name+"? Give me your strongest idea in a couple of sentences, like we\'re talking. No long plans. I\'ll approve changes before anything is built.").slice(0,1600);
  input.focus();
  setStatus("GUNNER'S VISION · READY TO SEND");
 });
 $('bcGunnerForm').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const value=input.value.trim();if(!value||value.length>1600)return;
  if(activeJob){setStatus('CHECK THE EXISTING DOLPHIN REPLY FIRST');$('bcGunnerCheck').hidden=false;return}
  setBusy(true);input.value='';
  append('user',value);setStatus('SENDING TO ORIGINAL GUNNER…');
  const placeholder=append('assistant','Sending to Dolphin / RunPod…');
  try{
   const ctx=typeof getContext==='function'?getContext()||{}:{};
   const started=await callGunner({
    action:'start',message:value,
    page_title:String(ctx.page_title||'Military Library').slice(0,100),
    countries:Array.isArray(ctx.countries)?ctx.countries.slice(0,12):[],
    photo_id:ctx.photo_id||null
   });
   if(started.status!=='pending'||!started.bridge_job_id)throw Error('Dolphin did not return a processing job.');
   await pollJob(started.bridge_job_id,placeholder);
  }catch(error){
   placeholder.textContent='Original Gunner is unavailable: '+errorText(error)+'. No alternate model was used.';
   setStatus('DOLPHIN SERVICE · NOT AVAILABLE');
  }finally{setBusy(false);messages.scrollTop=messages.scrollHeight}
 });
 function setVisible(v){root.hidden=!v;if(!v)close()}
 const api={open,close,setVisible,setPrompt:text=>{input.value=String(text||'').slice(0,1600);open()}};
 window.BLACKCELL_GUNNER=api;
 return api;
}
