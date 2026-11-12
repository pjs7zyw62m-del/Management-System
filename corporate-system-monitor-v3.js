/* BLACKCELL Corporate Systems Monitor
   Owner-session diagnostics. This is an on-demand client-side check, not
   an independent uptime SLA or 24/7 external monitoring service.
   No credentials are persisted, no mutations or invitations are issued. */
(()=>{
  'use strict';
  const one=(selector,root=document)=>root.querySelector(selector);
  const all=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const monitored=['web','assets','auth','database','employees','edge','storage'];
  const unmonitored=['bunny','ai'];
  const entries=[
    ['web','Corporate Website','GitHub Pages / HTTPS'],
    ['assets','Admin Application','Static JavaScript delivery'],
    ['auth','Identity Service','Supabase Auth'],
    ['database','Corporate Database','Supabase PostgreSQL / RPC'],
    ['employees','Personnel API','Verified employee directory'],
    ['edge','Invitation Service','Supabase Edge Function'],
    ['storage','Private Media Storage','Supabase Storage API'],
    ['bunny','Bunny Storage Vault','Private object storage'],
    ['ai','AI Runtime','RunPod inference']
  ];
  const store=Object.fromEntries(entries.map(([id,name,provider])=>[id,{id,name,provider,state:'unknown',latency:null,checked:null,reason:unmonitored.includes(id)?'No safe live probe configured.':'Not checked yet.'}]));
  let running=false, started=false, timer=0, latest=0;
  const statusText={unknown:'NOT MONITORED',checking:'CHECKING',online:'ONLINE',attention:'REVIEW',offline:'UNREACHABLE'};
  const genericReason={
    web:'Website availability check failed.',
    assets:'Administration asset check failed.',
    auth:'Authenticated identity request failed.',
    database:'Corporate verification database check failed.',
    employees:'Authorized personnel directory check failed.',
    edge:'Secure invitation backend check failed. No email was sent.',
    storage:'Private storage API check failed; check bucket permissions.'
  };
  const elapsed=(t)=>Math.max(0,Math.round(performance.now()-t));
  const timeText=(date)=>new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',second:'2-digit'}).format(date);
  const authorized=()=>!!window.BLACKCELL_CORPORATE_ADMIN_API?.client&&document.documentElement.classList.contains('corp-ok');
  const update=(id,state,reason,ms)=>{
    const entry=store[id];if(!entry)return;
    entry.state=state;entry.reason=reason;entry.latency=Number.isFinite(ms)?ms:null;
    entry.checked=state==='unknown'||state==='checking'?null:new Date();
    const card=one('[data-ops-service="'+id+'"]');
    if(card){
      card.dataset.state=state;
      const dot=one('.ops-dot',card);if(dot)dot.dataset.state=state;
      const badge=one('.ops-status',card);if(badge)badge.textContent=statusText[state];
      const detail=one('.ops-detail',card);if(detail)detail.textContent=reason;
      const meta=one('[data-ops-latency]',card);if(meta)meta.textContent=entry.latency===null?'No latency data':entry.latency+' ms';
      const age=one('[data-ops-checked]',card);if(age)age.textContent=entry.checked?'Checked '+timeText(entry.checked):'Not checked';
    }
    totals();
  };
  const totals=()=>{
    const responding=monitored.filter(id=>store[id].state==='online').length;
    const needs=monitored.filter(id=>['offline','attention'].includes(store[id].state)).length;
    const unknown=entries.length-responding-needs;
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
    set('ops-online',String(responding));
    set('ops-attention',String(needs));
    set('ops-unchecked',String(unknown));
    set('ops-last-check',latest?timeText(new Date(latest)):'—');
    set('dash-services-online',responding+' / '+monitored.length);
    set('dash-service-attention',String(needs));
    set('dash-service-unmonitored',String(unknown));
    const overall=document.getElementById('ops-global-state');
    const dot=document.getElementById('ops-global-dot');
    if(overall&&dot){
      let label='AWAITING VERIFICATION',state='unknown';
      if(running){label='SYSTEM CHECKS IN PROGRESS';state='checking'}
      else if(needs){label='SOME CHECKS NEED ATTENTION';state='attention'}
      else if(responding===monitored.length){label='ALL MONITORED CHECKS PASSING';state='online'}
      else if(responding){label='PARTIAL CHECK RESULTS';state='attention'}
      overall.textContent=label;dot.dataset.state=state;
    }
    const time=document.getElementById('ops-timestamp');
    if(time)time.textContent=latest?'Last checked '+timeText(new Date(latest)):'No completed live checks';
    const report=document.getElementById('ops-report');
    if(report){
      if(running)report.textContent='Checking the corporate services using your verified owner session…';
      else if(!latest)report.textContent='Live checks have not started. Green indicators are reserved for checks that have returned successfully.';
      else report.textContent=responding+' of '+monitored.length+' monitored services responded successfully; '+needs+' need review. '+unmonitored.length+' external systems are not monitored. This is a point-in-time browser check, not 24/7 uptime tracking.';
    }
  };
  const hardTimeout=async(promise,ms=10500)=>{
    let timerId;
    try{
      return await Promise.race([
        promise,
        new Promise((_,reject)=>{timerId=setTimeout(()=>reject(new Error('check_timeout')),ms)})
      ]);
    }finally{clearTimeout(timerId)}
  };
  const checkStatic=async(file,signature)=>{
    const controller=new AbortController();
    const abort=setTimeout(()=>controller.abort(),9000);
    try{
      const u=new URL(file,location.href);u.searchParams.set('ops_check',String(Date.now()));
      const resp=await fetch(u.toString(),{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      if(!resp.ok)throw new Error('http_error');
      const text=await resp.text();
      if(!text.includes(signature))throw new Error('content_mismatch');
      return true;
    }finally{clearTimeout(abort)}
  };
  const tasks={
    web:async()=>{await checkStatic('dashboard.html','BLACKCELL CORPORATION');return 'Website HTML and HTTPS request succeeded.'},
    assets:async()=>{await checkStatic('admin.js','BLACKCELL_ADMIN_READY');return 'Administration JavaScript was delivered and validated.'},
    auth:async(client)=>{
      const {data,error}=await hardTimeout(client.auth.getUser());
      if(error||!data?.user?.id)throw new Error('auth_failed');
      return 'Authenticated identity confirmed with Supabase Auth.';
    },
    database:async(client)=>{
      const {data,error}=await hardTimeout(client.rpc('corp_code_status'));
      if(error||data?.ok!==true)throw new Error('db_response');
      if(data?.verified!==true)throw new Error('owner_session_expired');
      return 'Database RPC responded and owner verification is active.';
    },
    employees:async(client)=>{
      const {data,error}=await hardTimeout(client.rpc('corp_admin_members'));
      if(error||data?.ok!==true||!Array.isArray(data.members))throw new Error('staff_error');
      return 'Owner-protected directory API returned successfully. User details stay private.';
    },
    edge:async(client)=>{
      const {data,error}=await hardTimeout(client.functions.invoke('blackcell-invite-employee',{body:{action:'check'}}),13000);
      if(error||data?.ok!==true||data?.status!=='backend_ready')throw new Error('edge_error');
      return 'Owner-authorized Edge Function readiness check passed. No email was sent.';
    },
    storage:async(client)=>{
      const {data,error}=await hardTimeout(client.storage.from('corp-social-media').list('',{limit:1,offset:0}));
      if(error||!Array.isArray(data))throw new Error('storage_error');
      return 'Private Supabase Storage bucket listing responded. File downloads were not tested.';
    }
  };
  const runCheck=async(id,client)=>{
    update(id,'checking','Checking service…',null);
    const start=performance.now();
    try{
      const response=await hardTimeout(Promise.resolve().then(()=>tasks[id](client)),16000);
      update(id,'online',response,elapsed(start));
    }catch(error){
      const code=String(error?.message||'');
      const failedNetwork=/fetch|network|timeout|abort|load failed/i.test(code)||error?.name==='AbortError';
      const label=code==='owner_session_expired'
        ?'Owner verification is no longer valid. Reauthorize to continue checking.'
        :genericReason[id];
      update(id,failedNetwork?'offline':'attention',label,elapsed(start));
    }
  };
  const refresh=async()=>{
    if(running)return;
    if(!authorized()){
      const report=document.getElementById('ops-report');if(report)report.textContent='Sign in as a verified Level 7 owner to run checks.';
      return;
    }
    running=true;totals();
    const button=document.getElementById('ops-refresh');
    if(button){button.disabled=true;button.textContent='CHECKING SYSTEMS…'}
    const client=window.BLACKCELL_CORPORATE_ADMIN_API.client;
    try{
      await Promise.all(monitored.map(id=>runCheck(id,client)));
      latest=Date.now();
    }finally{
      running=false;
      if(button){button.disabled=false;button.textContent='⟳  RUN SYSTEM CHECKS'}
      totals();
    }
  };
  const snapshot=()=>entries.map(([id])=>({...store[id]}));
  const renderInto=(target)=>{
    if(!target)return;
    const wrap=document.createElement('div');
    wrap.className='ops-modal-health';
    const title=document.createElement('h3');title.textContent='Live Infrastructure Diagnostics';
    const desc=document.createElement('p');desc.className='muted';
    desc.textContent='Checked from your authorized browser session. A green dot means a successful recent response, not guaranteed 24/7 availability.';
    wrap.append(title,desc);
    for(const item of snapshot()){
      const row=document.createElement('div');
      row.className='list-row';
      const left=document.createElement('div');
      const label=document.createElement('b');label.textContent=item.name;
      const more=document.createElement('small');more.textContent=item.provider+' · '+item.reason;
      left.append(label,more);
      const right=document.createElement('span');right.className='mock-state';
      right.style.color=item.state==='online'?'#80e4bb':item.state==='offline'?'#f1a4af':item.state==='attention'?'#f0cb8d':'#aaa';
      right.textContent=statusText[item.state]+(item.latency!==null?' · '+item.latency+'ms':'');
      row.append(left,right);wrap.append(row);
    }
    const btn=document.createElement('button');btn.type='button';btn.className='text-action emphasis';
    btn.textContent='OPEN SYSTEM MONITOR';
    btn.addEventListener('click',()=>{
      document.getElementById('closeModal')?.click();
      document.getElementById('systemHealth')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    wrap.append(btn);
    target.append(wrap);
  };
  window.BLACKCELL_HEALTH=Object.freeze({refresh,snapshot,renderInto});
  const onReady=()=>{
    if(started||!authorized())return;
    started=true;
    for(const id of unmonitored){update(id,'unknown',id==='bunny'
      ?'Private Bunny Storage API health is not configured; deployment of an owner-only status endpoint is needed.'
      :'An authenticated health endpoint for the AI runtime has not been configured.',null)}
    const jump=()=>{
      const close=document.getElementById('closeDrawer');if(close)close.click();
      const target=document.getElementById('systemHealth');
      if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
    };
    document.getElementById('ops-monitor-link')?.addEventListener('click',jump);
    document.getElementById('ops-nav-health')?.addEventListener('click',jump);
    const refreshButton=document.getElementById('ops-refresh');
    if(refreshButton)refreshButton.addEventListener('click',()=>{void refresh()});
    const auto=document.getElementById('ops-autocheck');
    const schedule=()=>{
      if(timer){clearInterval(timer);timer=0}
      if(auto?.checked){
        timer=setInterval(()=>{
          if(!document.hidden&&authorized()&&!running)void refresh();
        },150000);
      }
    };
    auto?.addEventListener('change',schedule);
    schedule();
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&auto?.checked&&Date.now()-latest>150000)void refresh();
    });
    void refresh();
  };
  window.addEventListener('blackcell-corporate-authorized',onReady);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady,{once:true});
  else onReady();
})();
