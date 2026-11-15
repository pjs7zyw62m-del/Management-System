export function setup(client,u){
 const {root,E,add,button,panel,rpc,status,toolbar,date,download}=u;
 let events=[];
 const bar=toolbar(),left=E('div','toolbar-left');
 const load=button('⟳ LOAD RECORDED EVENTS',()=>{void fetchEvents()},'primary');
 const exportButton=button('EXPORT FILTERED EVENTS',()=>{
   const rows=filtered();
   download('blackcell-corporate-activity-'+new Date().toISOString().slice(0,10)+'.json',
     {source:'verified corporate database',exported_at:new Date().toISOString(),events:rows});
   status(rows.length+' recorded event(s) exported.','success');
 });
 exportButton.disabled=true;add(left,load,exportButton);bar.append(left);
 const filters=E('div','filters'),query=E('input');query.type='search';
 query.placeholder='Search recorded activity…';query.setAttribute('aria-label','Search event records');
 const category=E('select'),range=E('select');
 for(const [v,label] of [['all','All categories'],['security','Security'],['access','Employee Access'],['admin','Administration']]){
   category.append(new Option(label,v));
 }
 for(const [v,label] of [['all','All available'],['day','Last 24 hours'],['week','Past week'],['month','Past month']]){
   range.append(new Option(label,v));
 }
 add(filters,query,category,range);root.append(filters);
 const container=panel('Recorded Corporate Events',
  'Owner verification, employee invitation and activation, settings changes, snapshots, and recorded permission updates.');
 const list=E('div','item-list');container.append(list);root.append(container);
 const getTime=(value)=>{const d=new Date(value).getTime();return Number.isFinite(d)?d:0};
 function filtered(){
   const duration={day:86400000,week:604800000,month:2592000000}[range.value]||0;
   const now=Date.now();
   return events.filter(e=>(category.value==='all'||e.category===category.value)
     &&[e.name,e.description,e.source].join(' ').toLowerCase().includes(query.value.toLowerCase())
     &&(!duration||now-getTime(e.at)<=duration));
 }
 function paint(){
   const shown=filtered();list.replaceChildren();
   list.append(E('p','',shown.length+' recorded event(s) match your filters.'));
   if(!shown.length){list.append(E('p','','No matching recorded events.'));return}
   for(const e of shown){
     const row=E('div','item'),body=E('div','item-main');
     add(body,E('span','pill',(e.category||'event').toUpperCase()),
       E('strong','',e.description||e.name),
       E('small','',date(e.at)+' · '+String(e.source||'Corporate database')));
     row.append(body);list.append(row);
   }
 }
 query.addEventListener('input',paint);
 category.addEventListener('change',paint);
 range.addEventListener('change',paint);
 async function fetchEvents(){
   load.disabled=true;status('Loading recorded corporate activity…');
   try{
     const data=await rpc('corp_admin_console_activity',{p_limit:200});
     events=data.items||[];exportButton.disabled=false;paint();
     status('Loaded '+events.length+' actual recorded event(s).','success');
   }catch(e){status('Activity retrieval failed: '+e.message,'error')}
   finally{load.disabled=false}
 }
 root.append(E('div','notice',
   'This is a database-backed activity record, not a complete server audit trail. It does not log every HTTP request, every failed login, or every action inside independent divisions.'));
 list.append(E('p','','Click LOAD RECORDED EVENTS to query corporate activity.'));
}
