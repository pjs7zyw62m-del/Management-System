import {mountRedlineGroupLive} from './private-photo-ledger-group-live.js?v=1';
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
 let current=null,loading=false,posting=false,poll=null,epoch=0,live=null,photoFrame=null,closeGuard=null;
 const stop=()=>{live?.dispose();live=null;photoFrame=null;closeGuard=null;current=null;epoch++;clearInterval(poll);poll=null;dialog.classList.remove('rg-live-room');dialog.replaceChildren()};
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
 const close=()=>{if(closeGuard)void closeGuard();else dialog.close()};
 dialog.addEventListener('cancel',e=>{if(closeGuard){e.preventDefault();void closeGuard()}});
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
  if(!visible()||dialog.open)return;current=id;shell('REDLINE LIVE');dialog.classList.add('rg-live-room');const token=++epoch;
  const feed=make('div','rg-feed'),feedback=make('p','rg-status'),form=make('form','rg-composer'),entry=make('textarea');entry.maxLength=2000;entry.rows=1;entry.required=true;entry.placeholder='Message group…';entry.setAttribute('aria-label','Group message');
  const send=make('button','rg-button rg-primary','Send');send.type='submit';send.disabled=true;form.append(entry,send);
  const workspace=make('div','rg-live-workspace'),webcams=make('div','rg-live-column'),photo=make('section','rg-photo-column'),chat=make('section','rg-chat-column');
  const chatHeader=make('header','rg-section-head');chatHeader.append(make('h3','','Group Chat'),make('span','rg-live-free','Private room'));chat.append(chatHeader,feed,feedback,form);
  const photoHead=make('header','rg-section-head');photoHead.append(make('h3','','Photos & sender balances'));
  const rosterBox=make('div','rg-photo-roster'),photoNotice=make('p','rg-status','Choose a participant to open their private REDLINE photo room.'),photoHost=make('div','rg-photo-host'),photoTools=make('div','rg-live-controls');
  photo.append(photoHead,rosterBox,photoTools,photoNotice,photoHost);workspace.append(webcams,photo,chat);
  const tabs=make('nav','rg-live-tabs');for(const [key,label] of [['live','Webcams'],['photos','Photos'],['chat','Chat']]){const b=button(label,()=>{workspace.dataset.view=key;for(const n of tabs.children)n.setAttribute('aria-pressed',String(n===b))});b.setAttribute('aria-pressed',String(key==='live'));tabs.append(b)}workspace.dataset.view='live';dialog.append(tabs,workspace);
  const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const stillOpen=()=>token===epoch&&dialog.open&&visible();
  live=mountRedlineGroupLive({db,roomId:id,isOwner,container:webcams,visible:stillOpen,notice:t=>{feedback.textContent=t}});
  let selectedRoom=null,roster=[],rosterSignature='',rosterRefresh=0,photoBusy=false;
  async function safePhotoClose(){
   if(!photoFrame)return true;
   try{const check=photoFrame.contentWindow.BLACKCELL_REDLINE_GROUP_SAFE_CLOSE;if(typeof check==='function'){const r=await check();if(r?.ok===true)return true;photoNotice.textContent=r?.reason||'Finish the current photo operation before switching rooms.';return false}
    photoNotice.textContent='The photo room is still loading. Wait for it to finish before switching.';return false
   }catch(_){photoNotice.textContent='Cannot verify the photo room state. Open its own tab before continuing.';return false}
  }
  closeGuard=async()=>{if(photoBusy||!await safePhotoClose())return;if(entry.value.trim()&&!confirm('Close this group with an unsent message?'))return;if(live?.isBroadcasting()&&!confirm('Close this group and stop your webcam connections?'))return;dialog.close()};
  async function openPhoto(member){
   if(!stillOpen()||photoBusy||!validId(member.room_id)||(!isOwner&&!member.mine))return;
   if(selectedRoom===member.room_id&&photoFrame)return;photoBusy=true;
   try{if(!await safePhotoClose()||!stillOpen())return;
    const url=new URL('private-photo-ledger.html',location.href);url.searchParams.set('room',member.room_id);url.searchParams.set('rdGroupEmbed','1');url.searchParams.set('_bc_release',String(Date.now()));
    const frame=make('iframe','rg-photo-frame');frame.title=member.name+' · Private REDLINE photo room';frame.setAttribute('allow','fullscreen');frame.src=url.href;photoHost.replaceChildren(frame);photoFrame=frame;selectedRoom=member.room_id;
    photoTools.replaceChildren(button('Open full photo room ↗',()=>window.open(url.href,'_blank','noopener,noreferrer')),button('Close photo panel',async()=>{if(await safePhotoClose()&&stillOpen()){photoHost.replaceChildren();photoFrame=null;selectedRoom=null;photoTools.replaceChildren();photoNotice.textContent='Choose a participant to open their private photo room.'}}));
    photoNotice.textContent=member.name+' · Existing private photo review and earnings';
    workspace.dataset.view='photos';for(const [i,b] of Array.from(tabs.children).entries())b.setAttribute('aria-pressed',String(i===1));
   }finally{photoBusy=false}
  }
  async function createPhoto(member){
   if(!isOwner||!stillOpen()||photoBusy||!validId(member.id))return;
   if(!confirm('Create a private REDLINE photo room for '+member.name+'? This does not start a paid timer or charge anyone.'))return;
   photoBusy=true;try{
    const {data:user,error:authError}=await db.auth.getUser();if(authError||!user?.user?.id||!stillOpen())throw Error('Verify owner access again.');
    const existing=await db.from('corp_private_photo_rooms').select('id,active').eq('owner_id',user.user.id).eq('member_id',member.id).order('created_at',{ascending:false}).limit(1);
    if(existing.error)throw existing.error;
    if(!existing.data?.length){const r=await db.from('corp_private_photo_rooms').insert({owner_id:user.user.id,member_id:member.id,title:(member.name+' · REDLINE').slice(0,90),active:true}).select('id').single();if(r.error)throw r.error}
    if(stillOpen()){rosterSignature='';await loadRoster();photoNotice.textContent='Photo room ready. Select the sender to open it.'}
   }catch(e){if(stillOpen())photoNotice.textContent='Photo room unavailable: '+errorText(e)}finally{photoBusy=false}
  }
  async function invite(){
   if(!isOwner||!stillOpen())return;
   try{const people=await call('candidates');if(!stillOpen())return;
    const picker=make('dialog','rg-invite-dialog'),title=make('h3','','Add participants'),choices=make('div','rg-choices'),status=make('p','rg-status'),actions=make('div','rg-live-controls');
    for(const p of people.filter(x=>!roster.some(m=>m.id===x.id))){const l=make('label','rg-person'),c=make('input');c.type='checkbox';c.value=p.id;l.append(c,make('span','',p.name));choices.append(l)}
    if(!choices.children.length)status.textContent='All eligible participants are already invited.';
    const submit=button('Invite selected',async()=>{const ids=Array.from(choices.querySelectorAll('input:checked'),x=>x.value);if(!ids.length)return;submit.disabled=true;try{await live.invite(ids);if(stillOpen()){rosterSignature='';await loadRoster();picker.close();void read()}}catch(e){status.textContent=errorText(e);submit.disabled=false}});
    actions.append(submit,button('Cancel',()=>picker.close()));picker.append(title,choices,status,actions);picker.addEventListener('close',()=>picker.remove());dialog.append(picker);picker.showModal()
   }catch(e){feedback.textContent=errorText(e)}
  }
  if(isOwner)photoHead.append(button('＋ Add participant',()=>void invite()));
  async function loadRoster(){
   if(!stillOpen()||!live)return;try{const rows=await live.refreshRoster();if(!stillOpen())return;roster=rows;const sig=JSON.stringify(rows);if(sig===rosterSignature)return;rosterSignature=sig;
    rosterBox.replaceChildren();for(const m of rows){const row=make('div','rg-photo-person');const copy=make('div','rg-person-copy');copy.append(make('strong','',m.name+(m.mine?' · You':'')),make('small','',''+(m.room_id?(m.room_active?'Private photo room ready':'Photo records available'):'No linked photo room')));row.append(copy);
     if(validId(m.room_id)&&(isOwner||m.mine))row.append(button(isOwner?'Review photos':'Send photos',()=>void openPhoto(m)));else if(isOwner)row.append(button('Create photo room',()=>void createPhoto(m)));rosterBox.append(row)
    }if(!rows.length)rosterBox.append(make('p','rg-status','No active invited streamers.'));photoNotice.textContent=selectedRoom?photoNotice.textContent:rows.length+' invited streamer'+(rows.length===1?'':'s')+' · Owner watches free.';
   }catch(e){if(stillOpen())photoNotice.textContent='Participant list unavailable: '+errorText(e)}
  }
  void loadRoster();void live.poll();
  let signature='',reading=false;
  const read=async()=>{if(reading||token!==epoch||!dialog.open||!visible()||document.hidden)return;reading=true;
   try{const result=await call('read',{p_room:id});if(token!==epoch||!dialog.open)return;dialog.querySelector('h2').textContent=result.title;
    const next=JSON.stringify(result.messages);if(next!==signature){const bottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80||!signature;signature=next;feed.replaceChildren();for(const m of result.messages){const b=make('article','rg-message'+(m.mine?' mine':''));b.append(make('strong','',m.sender_name),make('p','',m.body),make('time','',new Date(m.created_at).toLocaleString()));feed.append(b)}if(bottom)feed.scrollTop=feed.scrollHeight}
    feedback.textContent='';send.disabled=posting;
   }catch(e){feed.replaceChildren();signature='';send.disabled=true;feedback.textContent='Group unavailable: '+errorText(e)}finally{reading=false}
  };
  form.addEventListener('submit',async e=>{e.preventDefault();if(posting||send.disabled||!entry.value.trim()||token!==epoch)return;posting=true;send.disabled=true;try{await call('send',{p_room:id,p_body:entry.value});entry.value='';await read()}catch(e){feedback.textContent=errorText(e)}finally{posting=false;await read()}});
  await read();if(token===epoch&&dialog.open)poll=setInterval(()=>{void read();if(Date.now()-rosterRefresh>20000){rosterRefresh=Date.now();void loadRoster()}},4000);
 }
 void load();
}
