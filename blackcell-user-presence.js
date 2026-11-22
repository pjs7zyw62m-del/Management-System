import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-clearance5';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const dt=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():'Unknown time'};
const ago=value=>{
 const delta=Date.now()-new Date(value).getTime();
 if(!Number.isFinite(delta)||delta<0)return dt(value);
 if(delta<60000)return 'Less than a minute ago';
 if(delta<3600000)return Math.floor(delta/60000)+' min ago';
 if(delta<86400000)return Math.floor(delta/3600000)+' hr ago';
 return dt(value)
};
const status=s=>s==='online'?'ONLINE':s==='left'?'LEFT WEBSITE':'OFFLINE';
let client=null,loading=false,ready=false;
async function refresh(){
 if(!ready||loading||document.hidden)return;
 loading=true;$('refresh').disabled=true;$('notice').textContent='Updating live connections…';
 try{
  const {data,error}=await client.rpc('corp_site_presence_overview');
  if(error||data?.ok!==true)throw Error('Presence records are unavailable or administrator verification expired.');
  const members=Array.isArray(data.members)?data.members:[];
  const all=members.flatMap(m=>Array.isArray(m.sessions)?m.sessions:[]);
  $('online').textContent=String(members.filter(m=>m.sessions?.some(s=>s.status==='online')).length);
  $('left').textContent=String(members.filter(m=>m.sessions?.length&&!m.sessions.some(s=>s.status==='online')).length);
  $('total').textContent=String(members.length);
  const membersRoot=$('members');membersRoot.replaceChildren();
  if(!members.length)membersRoot.append(el('p','muted','No active members found.'));
  for(const member of members){
   const sessions=Array.isArray(member.sessions)?member.sessions:[];
   const online=sessions.find(s=>s.status==='online');
   const selected=online||sessions[0];
   const state=online?'online':selected?.status||'offline';
   const row=el('div','entry'),info=el('div','entry-main'),copy=el('div');
   info.append(el('span','dot '+state),copy);
   copy.append(el('div','name',member.name||'Member'));
   if(selected){
    const labels=sessions.slice(0,8).map(s=>s.device+' · '+status(s.status)+' · '+ago(s.last_seen));
    copy.append(el('div','detail',labels.join('  |  ')));
   }else copy.append(el('div','detail','No visits recorded since tracking was enabled.'));
   row.append(info,el('span','status '+state,status(state)));membersRoot.append(row);
  }
  const log=$('history');log.replaceChildren();
  const events=Array.isArray(data.events)?data.events:[];
  if(!events.length)log.append(el('p','muted','No site arrival, departure or return records yet.'));
  for(const item of events){
   const row=el('div','entry'),head=el('div','entry-main'),copy=el('div');
   const labels={arrived:'Entered BLACKCELL',left:'Left BLACKCELL',returned:'Returned to BLACKCELL'};
   const state=item.event==='left'?'left':'online';
   head.append(el('span','dot '+state),copy);
   copy.append(el('div','name',(item.name||'Member')+' — '+(labels[item.event]||'Site activity')));
   copy.append(el('div','detail',(item.device||'Device')+(item.estimated?' · Estimated after connection timeout':'')));
   row.append(head,el('time','',dt(item.at)));log.append(row);
  }
  $('notice').textContent='Last checked '+new Date().toLocaleTimeString()+' · Automatic refresh every 15 seconds';
 }catch(error){
  $('notice').textContent=error?.message||'Unable to verify online presence.';
 }finally{loading=false;$('refresh').disabled=false}
}
$('refresh').addEventListener('click',()=>void refresh());
window.addEventListener('focus',()=>void refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
try{
 client=corporateClient();
 const authorized=await corporateAuthorize(client);
 if(!authorized.ok||authorized.member?.role!=='owner'||Number(authorized.member?.clearance_level)!==7){
  $('notice').textContent='Owner Level 7 access required.';
 }else{
  const {data,error}=await client.rpc('corp_code_status');
  if(error||data?.ok!==true||data.verified!==true){
   $('notice').textContent='Verify your administrator security session before viewing site presence.';
  }else{ready=true;await refresh();setInterval(()=>void refresh(),15000)}
 }
}catch(_){$('notice').textContent='Unable to verify your BLACKCELL administrator session.'}
