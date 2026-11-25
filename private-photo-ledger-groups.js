// Separate group chat; no access to individual photo ledgers or balances.
export function mountGroupRooms(db,{isOwner,section}){
 if(section.querySelector('#redlineGroupRooms'))return;
 const make=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
 const button=(txt,fn)=>{const b=make('button','rg-button',txt);b.type='button';b.addEventListener('click',fn);return b};
 const call=async(action,params={})=>{const {data,error}=await db.rpc('corp_redline_group_v1',{p_action:action,...params});if(error)throw Error(error.message);return data};
 const root=make('section','rg-root');root.id='redlineGroupRooms';
 const bar=make('div','rg-bar'),title=make('h2','','Private group rooms'),list=make('div','rg-list'),status=make('p','rg-status');
 status.setAttribute('role','status');
 const create=button('＋ Create group room',()=>void createRoom());create.hidden=!isOwner;
 const refresh=button('Refresh groups',()=>void load());bar.append(title,create,refresh);root.append(bar,list,status);section.append(root);
 const dialog=make('dialog','rg-dialog');document.body.append(dialog);
 let current=null,loading=false,posting=false,poll=null,epoch=0;
 const stop=()=>{current=null;epoch++;clearInterval(poll);poll=null;dialog.replaceChildren()};
 dialog.addEventListener('close',stop);
 const visible=()=>!section.hidden&&!document.getElementById('ledgerApp')?.hidden;
 new MutationObserver(()=>{if(!visible()&&dialog.open)dialog.close()}).observe(document.getElementById('ledgerApp'),{attributes:true,attributeFilter:['hidden']});
 const errorText=e=>String(e?.message||e);
 async function load(){
  if(loading||!visible())return;loading=true;
  try{
   const rows=await call('list');if(!visible())return;
   list.replaceChildren();status.textContent='';create.disabled=false;
   if(!rows.length)list.append(make('p','rg-empty','No private group rooms yet.'));
   for(const r of rows){const card=button('',()=>void openRoom(r.id));card.className='rg-card';card.append(make('strong','',r.title),make('span','',r.participant_count+' participants · Open group →'));list.append(card)}
  }catch(e){list.replaceChildren();create.disabled=true;status.textContent='Group rooms are unavailable: '+errorText(e)}
  finally{loading=false}
 }
 const close=()=>dialog.close();
 function shell(label){dialog.replaceChildren();const h=make('header','rg-dialog-header');h.append(make('h2','',label),button('← All Rooms',close));dialog.append(h);if(!dialog.open)dialog.showModal()}
 async function createRoom(){
  if(!isOwner||!visible()||dialog.open)return;
  shell('Create private group room');const token=++epoch;
  const form=make('form','rg-create-form'),label=make('label','','Room name'),name=make('input');name.required=true;name.maxLength=90;label.append(name);form.append(label,make('h3','','Select at least two participants'));
  const choices=make('div','rg-choices'),feedback=make('p','rg-status','Loading authorized employees…'),submit=make('button','rg-button rg-primary','Create group room');submit.type='submit';submit.disabled=true;form.append(choices,feedback,submit);dialog.append(form);
  try{
   const candidates=await call('candidates');if(token!==epoch||!dialog.open)return;feedback.textContent='';
   for(const person of candidates){const l=make('label','rg-person'),check=make('input');check.type='checkbox';check.value=person.id;l.append(check,make('span','',person.name));choices.append(l)}
   const selected=()=>Array.from(choices.querySelectorAll('input:checked'),x=>x.value);
   choices.addEventListener('change',()=>{submit.disabled=selected().length<2||posting});if(candidates.length<2)feedback.textContent='At least two activated employees are required.';
   form.addEventListener('submit',async e=>{e.preventDefault();if(posting||selected().length<2)return;posting=true;submit.disabled=true;try{const r=await call('create',{p_title:name.value,p_members:selected()});if(token===epoch&&dialog.open){dialog.close();await load();void openRoom(r.id)}}catch(e){feedback.textContent=errorText(e)}finally{posting=false;submit.disabled=selected().length<2}});
  }catch(e){feedback.textContent=errorText(e)}
 }
 async function openRoom(id){
  if(!visible()||dialog.open)return;current=id;shell('Private group chat');const token=++epoch;
  const feed=make('div','rg-feed'),feedback=make('p','rg-status'),form=make('form','rg-composer'),entry=make('textarea');entry.maxLength=2000;entry.rows=1;entry.required=true;entry.placeholder='Message group…';entry.setAttribute('aria-label','Group message');
  const send=make('button','rg-button rg-primary','Send');send.type='submit';send.disabled=true;form.append(entry,send);dialog.append(feed,feedback,form);
  let signature='',reading=false;
  const read=async()=>{if(reading||token!==epoch||!dialog.open||!visible()||document.hidden)return;reading=true;
   try{const result=await call('read',{p_room:id});if(token!==epoch||!dialog.open)return;dialog.querySelector('h2').textContent=result.title;
    const next=JSON.stringify(result.messages);if(next!==signature){const bottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80||!signature;signature=next;feed.replaceChildren();for(const m of result.messages){const b=make('article','rg-message'+(m.mine?' mine':''));b.append(make('strong','',m.sender_name),make('p','',m.body),make('time','',new Date(m.created_at).toLocaleString()));feed.append(b)}if(bottom)feed.scrollTop=feed.scrollHeight}
    feedback.textContent='';send.disabled=posting;
   }catch(e){feed.replaceChildren();signature='';send.disabled=true;feedback.textContent='Group unavailable: '+errorText(e)}finally{reading=false}
  };
  form.addEventListener('submit',async e=>{e.preventDefault();if(posting||send.disabled||!entry.value.trim()||token!==epoch)return;posting=true;send.disabled=true;try{await call('send',{p_room:id,p_body:entry.value});entry.value='';await read()}catch(e){feedback.textContent=errorText(e)}finally{posting=false;await read()}});
  await read();if(token===epoch&&dialog.open)poll=setInterval(()=>void read(),15000);
 }
 void load();
}
