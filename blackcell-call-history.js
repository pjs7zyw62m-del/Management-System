/* BLACKCELL Connect Recents — participant-only call metadata. */
export function callHistoryLabel(c){
 const kind=c.mode==='video'?'video call':'voice call';
 const direction=c.direction==='incoming'?'Incoming':'Outgoing';
 if(c.outcome==='missed')return 'Missed '+kind;
 if(c.outcome==='declined')return direction+' '+kind+' · Declined';
 if(c.outcome==='unanswered')return direction+' '+kind+' · Unanswered';
 if(c.outcome==='connected'&&Number.isFinite(c.seconds)){
  const s=Math.max(0,Math.floor(c.seconds));return direction+' '+kind+' · '+Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s';
 }
 return direction+' '+kind+' · Answered, connection unconfirmed';
}
export function mountCallHistory({client,context,callback,onOpen=()=>{},onClose=()=>{}}){
 const $=id=>document.getElementById(id),panel=$('bcCallsPanel'),entry=$('bcCallsOpen'),badge=$('bcCallsBadge'),list=$('bcCallsList'),notice=$('bcCallsStatus');
 if(!panel||!entry)return null;
 const make=(tag,cls,t)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(t!==undefined)n.textContent=t;return n};
 const button=(label,fn,cls='bc-calls-action')=>{const n=make('button',cls,label);n.type='button';n.onclick=fn;return n};
 let rows=[],filter='all',busy=false,visible=true,epoch=0,disposed=false,missed=0;
 const allowed=()=>!disposed&&context().ready&&!!context().self;
 const active=()=>allowed()&&visible&&!document.hidden;
 const opened=()=>!panel.hidden;
 async function rpc(p_action,params={}){const {data,error}=await client.rpc('corp_connect_history',{p_action,...params});if(error||data?.ok!==true)throw Error('Call history is unavailable. Verify your access or try again.');return data}
 function sync(){entry.hidden=!allowed();badge.hidden=!allowed()||missed<1;badge.textContent=String(Math.min(missed,999));entry.setAttribute('aria-label','Calls'+(missed?' · '+missed+' unread missed calls':''))}
 function paint(){
  list.replaceChildren();$('bcCallsAll').setAttribute('aria-pressed',String(filter==='all'));$('bcCallsMissed').setAttribute('aria-pressed',String(filter==='missed'));
  const filtered=rows.filter(c=>filter==='all'||c.outcome==='missed');
  if(!filtered.length){list.append(make('p','bc-calls-empty',filter==='missed'?'No missed calls.':'No recent calls.'));return}
  for(const c of filtered){
   const row=make('article','bc-calls-row'+(c.outcome==='missed'?' is-missed':''));
   const glyph=make('span','bc-calls-avatar',String(c.name||'B').trim().slice(0,1).toUpperCase());
   const copy=make('div','bc-calls-copy');copy.append(make('strong','',c.name||'BLACKCELL Member'),make('small','',callHistoryLabel(c)));
   const time=make('time','',new Date(c.created_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}));
   copy.append(time);const actions=make('div','bc-calls-actions');
   const back=button(c.mode==='video'?'Video':'Call',()=>{if(!active())return;close();callback(c)});back.setAttribute('aria-label','Call '+c.name+' back');
   const remove=button('Delete',async()=>{if(!active()||!confirm('Remove this call from your own history?'))return;remove.disabled=true;try{await rpc('hide',{p_call:c.id});rows=rows.filter(x=>x.id!==c.id);paint();void refresh()}catch(e){notice.textContent=e.message;remove.disabled=false}},'bc-calls-action bc-calls-delete');actions.append(back,remove);row.append(glyph,copy,actions);list.append(row)
  }
 }
 async function refresh(){
  if(!active()||busy)return;busy=true;const token=epoch,uid=context().self,open=opened();
  try{const d=await rpc(open?'list':'count');if(token!==epoch||!active()||uid!==context().self)return;missed=Number(d.missed)||0;sync();
   if(open&&opened()){rows=Array.isArray(d.calls)?d.calls:[];paint();notice.textContent='Last 30 days · Call details only';
    const unread=rows.filter(c=>c.unseen);if(unread.length){const results=await Promise.allSettled(unread.map(c=>rpc('seen',{p_call:c.id})));if(token===epoch&&active()){missed=Math.max(0,missed-results.filter(r=>r.status==='fulfilled').length);sync()}}
   }
  }catch(e){if(token===epoch&&opened())notice.textContent=e.message}finally{busy=false;if(token!==epoch&&active())void refresh()}
 }
 function close(){epoch++;panel.hidden=true;rows=[];list.replaceChildren();onClose();entry.focus();void refresh()}
 function open(){if(!active())return;epoch++;filter='all';panel.hidden=false;onOpen();notice.textContent='Loading recent calls…';paint();$('bcCallsClose').focus();void refresh()}
 entry.onclick=open;$('bcCallsClose').onclick=close;$('bcCallsAll').onclick=()=>{filter='all';paint()};$('bcCallsMissed').onclick=()=>{filter='missed';paint()};$('bcCallsRefresh').onclick=()=>void refresh();
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close()}});
 const timer=setInterval(()=>{if(!allowed()){if(opened())close();missed=0;sync();return}if(active())void refresh()},20000);
 return {sync,refresh,close,isOpen:opened,setVisible(v){visible=!!v;if(visible)void refresh()},dispose(){disposed=true;clearInterval(timer);epoch++;panel.hidden=true;rows=[];list.replaceChildren();missed=0;sync()}};
}
