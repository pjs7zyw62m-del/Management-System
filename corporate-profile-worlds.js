/* Profile-only World discovery. Preferences are self-editable presentation
   metadata, never authorization claims. All media reads use existing RLS. */
export const WORLDS=[
 ['uniform','Uniform','◈','e8860999-4f93-4af3-97e4-4fe7ed1a9bcc.png','#b0b0bd'],
 ['military','Military','⬡','assets/maf/portrait-military.png','#91a47a'],
 ['police','Law Enforcement','★','assets/maf/portrait-law-enforcement.png','#7ba8ec'],
 ['fire','Fire & Rescue','♨','assets/maf/portrait-fire-rescue.png','#ed7861'],
 ['security','Corrections','▣','assets/maf/portrait-corrections.png','#bcb19e'],
 ['medical','EMS','✚','assets/maf/portrait-ems.png','#7ec1da'],
 ['professional','Aviation','✈','assets/maf/portrait-airline-captain.png','#d8ba83']
];
export function normalizeWorlds(raw){return WORLDS.map(w=>w[0]).filter(id=>Array.isArray(raw)&&raw.includes(id))}
const labels=new Map(WORLDS.map(w=>[w[0],w]));
export function createProfileWorlds({client,state,previews,title,render,toast}){
 const root=()=>document.getElementById('profileWorlds');
 let selected=[],active='',filter='all',open=false,draft=[],saving=false,ready=false,uid='',generation=0,urls=new Set();
 const make=(tag,cls,txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el};
 const button=(txt,fn,cls)=>{const b=make('button',cls,txt);b.type='button';b.onclick=fn;return b};
 function clear(){generation++;for(const url of urls)URL.revokeObjectURL(url);urls.clear()}
 window.addEventListener('pagehide',clear);
 client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){clear();selected=[];active='';uid='';ready=false;open=false}});
 async function load(){
  const resp=await client.auth.getUser();
  if(resp.error||!resp.data?.user||resp.data.user.id!==state.user?.id){ready=false;return}
  uid=resp.data.user.id;selected=normalizeWorlds(resp.data.user.user_metadata?.blackcell_profile_worlds_v1);active=selected[0]||'';ready=true;
 }
 function choose(){draft=[...selected];open=true;render()}
 async function save(){
  if(saving||!ready||uid!==state.user?.id)return;
  saving=true;render();const next=normalizeWorlds(draft);
  try{const out=await client.auth.updateUser({data:{blackcell_profile_worlds_v1:next}});
   if(out.error||out.data?.user?.id!==uid||uid!==state.user?.id)throw Error(out.error?.message||'Account save not confirmed');
   selected=normalizeWorlds(out.data.user.user_metadata?.blackcell_profile_worlds_v1);
   if(!selected.includes(active))active=selected[0]||'';
   open=false;state.profileTab='worldfeed';toast('My Worlds saved to your account.');
  }catch(e){toast('World selection not saved: '+e.message)}finally{saving=false;render()}
 }
 function header(isMine){
  const box=root();if(!box)return;box.hidden=!isMine;box.replaceChildren();
  if(!isMine){open=false;return}
  const row=make('div','bc-pw-heading');row.append(make('h2','','My Worlds'));
  if(selected.length)row.append(button('Edit Worlds',choose,'bc-pw-quiet'));
  box.append(row);
  const w=labels.get(active),cover=document.getElementById('profileCover');
  if(w&&cover){cover.style.setProperty('background-image','linear-gradient(90deg,#0707087a,#0707081a),url("'+w[3]+'")','important');cover.classList.add('bc-custom-member-cover');cover.dataset.worldCover=w[0]}else if(cover)delete cover.dataset.worldCover;
  if(open){
   const panel=make('div','bc-pw-picker');panel.append(make('h3','','Select Your Worlds'),make('p','','Choose one or more.'));
   for(const [id,name,icon,art,color] of WORLDS){
    const label=make('label','bc-pw-choice');const symbol=make('span','bc-pw-symbol',icon);symbol.style.color=color;const input=make('input');input.type='checkbox';input.checked=draft.includes(id);input.disabled=saving;
    input.onchange=()=>{draft=input.checked?[...draft,id]:draft.filter(x=>x!==id);count.textContent=draft.length+' of 7 Worlds selected'};
    label.append(symbol,make('span','',name+' World'),input);panel.append(label)
   }
   const count=make('p','bc-pw-caption',draft.length+' of 7 Worlds selected');panel.append(count);
   const actions=make('div','bc-pw-buttons');const b=button(saving?'Saving…':'Save My Worlds',()=>void save(),'bc-pw-primary');b.disabled=saving;const cancel=button('Cancel',()=>{open=false;render()},'bc-pw-quiet');cancel.disabled=saving;actions.append(b,cancel);panel.append(actions);box.append(panel);
  }else if(!selected.length){
   const empty=make('div','bc-pw-empty');empty.append(make('strong','','Build your own experience'),make('p','','Choose the Worlds you want to follow.'));const b=button('＋ Select Your Worlds',choose,'bc-pw-primary');b.disabled=!ready;empty.append(b);
   if(!ready)empty.append(button('Retry account connection',async()=>{await load();render()},'bc-pw-quiet'));box.append(empty);
  }
  if(selected.length){const bubbles=make('div','bc-pw-bubbles');for(const id of selected){const [_,name,icon,art,color]=labels.get(id);const b=button('',()=>{active=id;filter='all';state.profileTab='worldfeed';render()},'bc-pw-bubble');b.setAttribute('aria-pressed',String(id===active));b.style.setProperty('--world-color',color);const image=make('span','bc-pw-circle',icon);image.style.backgroundImage='linear-gradient(#0003,#0007),url("'+art+'")';b.append(image,make('span','',name));bubbles.append(b)}box.append(bubbles)}
 }
 async function photoUrl(a){
  if(a.source_provider!=='world-bunny-v1'){const x=await client.storage.from('corp-social-media').createSignedUrl(a.storage_path,1800);if(x.error||!x.data?.signedUrl)throw Error('Private image unavailable');return {url:x.data.signedUrl,object:false}}
  const session=(await client.auth.getSession()).data?.session,config=window.BLACKCELL_CORP_CONFIG||{};
  if(!session?.access_token||session.user.id!==uid||!config.url||!config.publishableKey)throw Error('Sign in again');
  const res=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/blackcell-world-media?action=read',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({id:a.id})});
  if(!res.ok)throw Error('Private image unavailable');const blob=await res.blob();if(blob.size>45*1048576||!blob.type.startsWith('image/'))throw Error('Unsupported preview');return {url:URL.createObjectURL(blob),object:true};
 }
 function mountPhoto(a,img,gen){const run=async()=>{if(!img.isConnected||gen!==generation)return;try{const entry=await photoUrl(a);if(!img.isConnected||gen!==generation){if(entry.object)URL.revokeObjectURL(entry.url);return}if(entry.object)urls.add(entry.url);img.src=entry.url;img.hidden=false;img.parentElement.querySelector('.bc-pw-placeholder').hidden=true}catch{if(img.isConnected)img.parentElement.querySelector('.bc-pw-placeholder').textContent='Preview unavailable'}};
  if(!window.IntersectionObserver){void run();return}const ob=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){ob.disconnect();void run()}},{rootMargin:'80px'});ob.observe(img.parentElement);setTimeout(()=>ob.disconnect(),60000);
 }
 function showPhoto(img){if(!img.src||img.hidden)return;const d=make('dialog','bc-pw-viewer');const close=button('Close ×',()=>d.close(),'bc-pw-quiet');const full=make('img');full.src=img.src;full.alt=img.alt;d.append(close,full);d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal()}
 function feed(box){
  clear();const gen=generation,id=active;
  if(!id){box.append(make('p','bc-pw-empty','Select your Worlds above to start your personalized feed.'));return}
  const top=make('div','bc-pw-heading');top.append(make('h3','',labels.get(id)[1]+' World'));
  const controls=make('div','bc-pw-filter');for(const [key,label] of [['all','All'],['photo','Photos'],['video','Videos']]){const b=button(label,()=>{filter=key;render()});b.setAttribute('aria-pressed',String(filter===key));controls.append(b)}top.append(controls);box.append(top);
  const grid=make('div','bc-pw-feed'),status=make('p','bc-pw-caption','Loading World media…');box.append(grid,status);
  let offset=0;async function next(){
   status.textContent='Loading World media…';
   let q=client.from('corp_social_assets').select('*').eq('purpose','library').or('and(review_status.eq.approved,adult_restricted.eq.false),and(review_status.eq.pending,owner_id.eq.'+uid+')');
   if(id==='uniform')q=q.or('source_provider.eq.world-bunny-v1,military_tags.cs.{maf:military},military_tags.cs.{maf:police},military_tags.cs.{maf:fire},military_tags.cs.{maf:security},military_tags.cs.{maf:medical},military_tags.cs.{maf:professional},military_tags.cs.{maf:unsorted}');else q=q.contains('military_tags',['maf:'+id]);
   q=filter==='all'?q.in('kind',['photo','video']):q.eq('kind',filter);
   const result=await q.order('created_at',{ascending:false}).order('id').range(offset,offset+23);
   if(gen!==generation||!box.isConnected)return;
   if(result.error){status.textContent='World media could not load.';status.append(button('Retry',()=>void next(),'bc-pw-quiet'));return}
   const list=result.data||[];offset+=list.length;status.textContent=!offset?'No media in this World yet.':'';
   for(const a of list){
    const card=make('article','bc-pw-card'),frame=make('div','bc-pw-frame');const placeholder=make('span','bc-pw-placeholder',a.kind==='video'?'▶':'Loading photograph…');const img=make('img');img.hidden=true;img.alt=a.caption||labels.get(id)[1]+' media';img.loading='lazy';frame.append(placeholder,img);
    const open=button('',()=>{if(a.kind==='photo')showPhoto(img);else{const u=new URL('corporate-network.html',location.href);u.searchParams.set('view','videos');u.searchParams.set('video',a.id);location.assign(u.href)}},'bc-pw-media');open.append(frame);
    card.append(open,make('strong','',a.kind==='video'?title(a):a.caption||labels.get(id)[1]+' photograph'),make('small','',a.review_status==='pending'?'Private · pending review':a.kind==='video'?'BLACKCELL TUBE':'WORLD PHOTO'));grid.append(card);
    if(a.kind==='photo')mountPhoto(a,img,gen);else if(a.source_provider==='world-bunny-v1')previews.mount(a,img);
   }
   if(list.length===24)status.append(button('Load more',()=>void next(),'bc-pw-quiet'))
  }
  void next().catch(()=>{if(gen===generation)status.textContent='Unable to load World media. Try again.'});
 }
 return {load,header,feed,clear,busy:()=>open||saving};
}
