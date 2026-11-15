import {getSecuritySnapshot,securityLabels} from './blackcell-soc-client.js?v=1';
/* BLACKCELL SOC — owner-verified, read-only snapshots; no client-generated attack claims. */
export function setup(client,u){
 const {root,E,add,button,metrics,panel,info,rpc,status,toolbar,date,timeout}=u;
 const safeCount=x=>x!==null&&x!==undefined&&Number.isSafeInteger(Number(x))&&Number(x)>=0?Number(x):null;
 const countLabel=x=>x===null?'—':String(x);
 const LEVELS=['Coverage limited','Review recommended','High priority'];
 let running=false,closed=false,lastRead=null,previous=null,auto=true,interval=null,generation=0;
 const seen=new Set();let first=true;
 const hero=E('section','soc-hero');
 const heroTop=E('div','soc-hero-top'),mark=E('div','soc-mark','♢'),copy=E('div','soc-hero-copy');
 add(copy,E('small','','SECURITY OPERATIONS / LEVEL 07'),E('h2','','Executive threat monitoring'),E('p','','Recorded indicators, session grants and administrator activity.'));
 const health=E('span','soc-health','NOT CHECKED');health.dataset.state='unknown';
 add(heroTop,mark,copy,health);hero.append(heroTop);
 const banner=E('div','soc-banner'),headline=E('strong','','Waiting for verified records'),sub=E('p','','No security conclusion can be made until the first check completes.');
 add(banner,headline,sub);hero.append(banner);root.append(hero);
 // Readiness only: no client-side switch, no simulated containment, no live access changes.
 const lockdown=panel('Executive Lockdown Protocol','OMEGA / LEVEL 07 · Emergency isolation readiness');
 const lockdownState=E('div','soc-banner');
 add(lockdownState,E('strong','','NOT ARMED — ENFORCEMENT NOT VERIFIED'),E('p','','This panel cannot isolate the site. Activation is intentionally unavailable until server-side controls and owner recovery are verified.'));
 lockdown.append(lockdownState);
 const readiness=E('div','info-list');
 for(const [name,detail] of [
  ['Owner recovery','Independent emergency authentication and verified recovery access'],
  ['Application isolation','Deny ordinary user access and terminate active application sessions'],
  ['Communications isolation','Suspend corporate messaging, external integrations and ordinary traffic'],
  ['Data isolation','Enforce server-side blocks on application database and media access'],
  ['Recovery review','Keep minimal protected incident telemetry and require explicit owner authorization to restore service']
 ])readiness.append(info(name,detail,'NOT VERIFIED'));
 lockdown.append(readiness);
 lockdown.append(E('p','soc-note','No production permissions or traffic have been changed. No countdown or automatic reopening is planned.'));
 root.append(lockdown);
 const values=metrics([
   ['failures','CODE FAILURES','Current gateway counter'],
   ['sessions','OWNER GRANTS','Verified / unexpired'],
   ['employeeSessions','EMPLOYEE GRANTS','Verified / unexpired'],
   ['changes','PERMISSION CHANGES','Recorded in last 24 hours*']
 ]);
 const bar=toolbar(),left=E('div','toolbar-left');
 const run=button('⟳ REFRESH NOW',()=>void load(true),'primary');
 const toggle=button('AUTO REFRESH: ON',()=>{auto=!auto;toggle.textContent='AUTO REFRESH: '+(auto?'ON':'OFF');toggle.setAttribute('aria-pressed',String(auto));if(auto)void load(false)});
 toggle.setAttribute('aria-pressed','true');
 const check=E('small','soc-check','Not checked');add(left,run,toggle);bar.append(left,check);
 const collectorPanel=panel('Background security collector','Server-side observations continue while the browser is closed. Raw IP addresses, file paths and contents are not stored in this alert feed.');
 const collectorStatus=E('div','soc-check','Checking server heartbeat…'),collectorFeed=E('div','soc-feed');collectorPanel.append(collectorStatus,collectorFeed);root.append(collectorPanel);
 const alertsPanel=panel('Security alerts','Current indicators use actual corporate records. They are not proof of intrusion.');
 const alerts=E('div','soc-alerts');alertsPanel.append(alerts);root.append(alertsPanel);
 const coverage=panel('Monitoring coverage','Sources and limitations — unavailable is not the same as zero.');
 const cov=E('div','soc-coverage');
 const feedPanel=panel('Security activity','Most recent recorded security, access and administrator events. Not a complete authentication log.');
 const feed=E('div','soc-feed');feed.setAttribute('aria-live','off');feedPanel.append(feed);
 const overview=panel('Verified Security Overview','Database-backed owner and employee grant counts.');
 const details=E('div','info-list');overview.append(details);
 const sessions=panel('Corporate Verification Sessions','These are verification grants, not a complete list of devices or Supabase Auth tokens.');
 const sessionList=E('div','info-list');sessionList.id='sessionList';sessions.append(sessionList);
 const revoke=button('REVOKE OTHER CORPORATE VERIFICATION GRANTS',async()=>{
   if(!confirm('Revoke other corporate Level 7 code-verification grants? They will need to reverify. This does not revoke sessions in other independent apps.'))return;
   revoke.disabled=true;
   try{const res=await rpc('corp_admin_revoke_other_verified_sessions');status('Revoked '+res.revoked+' other verification grant(s).','success');void load(true)}
   catch(_){status('Could not revoke grants. Verify your session and retry.','error')}
   finally{revoke.disabled=!lastRead}
 },'danger');revoke.disabled=true;sessions.append(revoke);
 add(root,feedPanel,overview,sessions,coverage);
 coverage.append(cov);
 function covItem(label,description,state){
   const row=E('div','soc-coverage-row'),copy=E('div');add(copy,E('b','',label),E('small','',description));
   const tag=E('span','soc-source',state);tag.dataset.state=state;add(row,copy,tag);cov.append(row)
 }
 function renderCoverage(live,activity,collector){
   cov.replaceChildren();
   covItem('Corporate master-code counter','Current failures and active gateway lock.',live?'Connected':'Unavailable');
   covItem('Verified corporate sessions','Grant counts and other unexpired owner grants.',live?'Connected':'Unavailable');
   covItem('Administrator activity','Recorded permission changes and access actions.',activity?'Connected':'Unavailable');
   covItem('Password sign-in failures / blocked requests','Requires secure provider-log collection; not measured here.','Not connected');
   covItem('Repeated network / new browser signatures','Privacy-preserving session patterns; not IP reputation or verified physical devices.',collector?.healthy?'Connected':collector?'Unavailable':'Not connected');
   covItem('Database and file metadata write signals','Approximate elevated catalog writes and recorded permission changes. Individual reads are not monitored.',collector?.healthy?'Connected':collector?'Unavailable':'Not connected');
   covItem('Continuous background collector','Server-side scheduled scans with retained alerts and heartbeat.',collector?.healthy?'Connected':collector?'Unavailable':'Not connected');
   covItem('OS-wide notification bell','Authenticated OS alerts while the workspace is unlocked. Native device push when closed is not connected.','Connected');
 }
 function alertRow(level,title,description,time){
   const row=E('div','soc-alert'),dot=E('i'),copy=E('div');
   row.dataset.level=String(level);add(copy,E('strong','',title),E('small','',description));add(row,dot,copy,E('span','',time||''));alerts.append(row);
 }
 function setUnknown(message){
   generation++;lastRead=null;previous=null;revoke.disabled=true;
   Object.values(values).forEach(n=>n.textContent='—');health.dataset.state='unknown';health.textContent='UNAVAILABLE';headline.textContent='Security status unavailable';sub.textContent=message;
   check.textContent='Last attempt '+date(new Date().toISOString());alerts.replaceChildren();alertRow(1,'Monitoring interrupted','No conclusion about current security activity can be made.');
   details.replaceChildren(E('p','','Access check unavailable.'));sessionList.replaceChildren();feed.replaceChildren(E('p','','Activity unavailable.'));
   collectorStatus.textContent='Background collector status unavailable.';collectorFeed.replaceChildren();renderCoverage(false,false,null)
 }
 function visible(){
   if(document.hidden||document.getElementById('opApp')?.hidden)return false;
   try{
     let w=window;
     while(w!==w.parent){const f=w.frameElement;if(!f||!f.getClientRects().length||f.closest('[hidden],[inert]'))return false;w=w.parent}
   }catch(_){return false}
   return true;
 }
 async function load(manual=false){
   if(closed||running||(!manual&&!visible()))return;
   running=true;run.disabled=true;const epoch=generation;
   if(!lastRead){health.dataset.state='unknown';health.textContent='CHECKING'}
   try{
     const {data:guard,error}=await timeout(client.rpc('corp_code_status'),20000);
     if(error||guard?.ok!==true||guard?.verified!==true)throw new Error('verification');
     if(closed||epoch!==generation||!visible())return;
     const results=await Promise.allSettled([timeout(rpc('corp_admin_security_overview'),20000),timeout(rpc('corp_admin_console_activity',{p_limit:200}),20000),timeout(getSecuritySnapshot(client),20000)]);
     if(closed||epoch!==generation||!visible())return;
     if(results[0].status!=='fulfilled'||results[0].value.owner_verified!==true)throw new Error('overview');
     const collector=results[2].status==='fulfilled'?results[2].value:null;
     collectorStatus.textContent=collector?(collector.healthy?'BACKGROUND MONITOR ACTIVE · Last scan ':'COLLECTOR DELAYED · Last scan ')+date(collector.lastRun):'Background collector unavailable. No conclusion can be made.';
     collectorFeed.replaceChildren();
     if(!collector)collectorFeed.append(E('p','','Unable to retrieve server-collected alerts.'));
     else if(!collector.alerts.length)collectorFeed.append(E('p','','No recorded alerts in the connected background collector. Coverage remains partial.'));
     else for(const a of collector.alerts.slice(0,30)){const row=E('div','soc-event'),icon=E('span','soc-event-icon',a.severity==='high'?'!':'·'),body=E('div'),label=securityLabels[a.kind];row.dataset.review=String(a.severity==='high');add(body,E('b','',label[0]+' · '+a.event_count),E('small','',label[1]));add(row,icon,body,E('time','',date(a.event_at)));collectorFeed.append(row)}
     const d=results[0].value,records=results[1].status==='fulfilled'&&Array.isArray(results[1].value.items)?results[1].value.items:null;
     const sessionsData=Array.isArray(d.owner_sessions)?d.owner_sessions:null,failures=safeCount(d.master_code_failed_attempts),employees=safeCount(d.active_employee_verifications);
     const lock=d.owner_master_code_locked_until&&new Date(d.owner_master_code_locked_until)>new Date();
     const other=sessionsData?sessionsData.filter(s=>s.current===false).length:null;
     const events=records?.filter(v=>v&&typeof v==='object'&&Number.isFinite(Date.parse(v.at)))||[];
     const recentChanges=events.filter(x=>x.name==='employee_permissions_updated'&&Date.parse(x.at)>=Date.now()-86400000);
     lastRead=d.read_at||new Date().toISOString();
     values.failures.textContent=countLabel(failures);values.sessions.textContent=countLabel(sessionsData?.length??null);values.employeeSessions.textContent=countLabel(employees);
     values.changes.textContent=records?(records.length===200?'≥':'')+recentChanges.length:'—';
     const indicators=[];let level=0;
     if(lock){level=2;indicators.push([2,'Master-code lock active','A recorded gateway lock is active. Verify whether you initiated the failed attempts.',date(d.owner_master_code_locked_until)])}
     if(failures!==null&&failures>0){level=Math.max(level,1);indicators.push([1,'Recorded code failures',failures+' currently recorded failure(s). This is not a complete history.',date(lastRead)])}
     if(other!==null&&other>0){level=Math.max(level,1);indicators.push([1,'Other verified owner grants',other+' other unexpired grant(s). Review whether these are yours.',date(lastRead)])}
     if(previous&&failures!==null&&previous.failures!==null&&failures>previous.failures){level=Math.max(level,1);indicators.unshift([1,'Code failure count increased','Current counter increased since the previous visible check.',date(lastRead)])}
     if(records&&recentChanges.length){level=Math.max(level,1);indicators.push([1,'Recent permission changes',recentChanges.length+' recorded change(s) in the returned activity window. Review expected changes.',date(recentChanges[0].at)])}
     if(!records||failures===null||!sessionsData){indicators.push([1,'Partial data','One or more sources are unavailable. Missing metrics are not zero.']);level=Math.max(level,1)}
     alerts.replaceChildren();
     for(const item of indicators)alertRow(...item);
     if(!indicators.length)alertRow(0,'No current indicators in connected records','Limited coverage; this does not rule out an attack.',date(lastRead));
     headline.textContent=level===2?'High-priority security indicator':level===1?'Review security indicators':'No current indicators in connected records';
     health.dataset.state=level===2?'high':level===1?'review':'limited';health.textContent=LEVELS[level].toUpperCase();
     sub.textContent='Coverage is limited. Password failures, rejected HTTP requests, IP reputation and individual file reads are not connected.';
     check.textContent='Last checked '+date(lastRead);
     details.replaceChildren(info('Active employee accounts','Activated staff',countLabel(safeCount(d.active_employees))),info('Pending activations','Awaiting password activation',countLabel(safeCount(d.pending_employees))),info('Disabled accounts','Inactive personnel',countLabel(safeCount(d.disabled_employees))),info('Master-code lock','Gateway lockout state',lock?'LOCKED UNTIL '+date(d.owner_master_code_locked_until):'NO ACTIVE LOCK'));
     sessionList.replaceChildren();
     if(!sessionsData)sessionList.append(E('p','','Grant data unavailable.'));
     else if(!sessionsData.length)sessionList.append(E('p','','No unexpired owner grants recorded.'));
     else for(const v of sessionsData)sessionList.append(info(v.current?'Current owner grant':'Other owner grant','Verified '+date(v.verified_at),'Expires '+date(v.expires_at)));
     revoke.disabled=false;
     feed.replaceChildren();
     if(records===null)feed.append(E('p','','Recorded activity is unavailable. This is not a zero-event result.'));
     else if(!events.length)feed.append(E('p','','No events returned by the connected activity source.'));
     else{
       if(records.length===200)feed.append(E('p','soc-note','Showing up to 200 most recent records; older activity may not be included.'));
       for(const v of events.slice(0,30)){
         const row=E('div','soc-event'),icon=E('span','soc-event-icon',v.name==='employee_permissions_updated'?'!':'·'),body=E('div');
         const key=String(v.at)+'|'+String(v.name)+'|'+String(v.description);
         const change=v.name==='employee_permissions_updated';if(change)row.dataset.review='true';
         add(body,E('b','',String(v.name||'recorded activity').replace(/_/g,' ')),E('small','',v.description||'Recorded event'));
         add(row,icon,body,E('time','',date(v.at)));feed.append(row);
         if(!first&&!seen.has(key)&&change)row.dataset.new='true';
       }
       for(const v of events)seen.add(String(v.at)+'|'+String(v.name)+'|'+String(v.description));
       if(seen.size>1000){seen.clear();for(const v of events)seen.add(String(v.at)+'|'+String(v.name)+'|'+String(v.description))}
     }
     renderCoverage(true,records!==null,collector);previous={failures};first=false;
     if(manual)status('Security records refreshed.','success');
   }catch(_){if(!closed&&epoch===generation)setUnknown('Unable to verify or retrieve the current records. Refresh or re-enter Corporate Access.')}
   finally{run.disabled=false;running=false}
 }
 setUnknown('Awaiting authenticated security records.');
 // Existing workspace authorization reveals opApp after setup. Poll only when visible.
 const kick=()=>{if(auto&&visible())void load(false)};
 setTimeout(kick,100);interval=setInterval(kick,30000);
 document.addEventListener('visibilitychange',kick);window.addEventListener('focus',kick);
 window.addEventListener('pagehide',e=>{if(e.persisted){setUnknown('Workspace paused.');return}closed=true;clearInterval(interval);document.removeEventListener('visibilitychange',kick);window.removeEventListener('focus',kick);setUnknown('Workspace closed.')});
 window.addEventListener('pageshow',kick);
 if(typeof MutationObserver!=='undefined')new MutationObserver(()=>{if(document.getElementById('opApp')?.hidden){setUnknown('Workspace access is not verified.')}else kick()}).observe(document.getElementById('opApp'),{attributes:true,attributeFilter:['hidden']});
 root.append(E('p','soc-note','* Permission changes are counted only in the returned activity window (maximum 200 events). No accounts are blocked automatically.'));
}
