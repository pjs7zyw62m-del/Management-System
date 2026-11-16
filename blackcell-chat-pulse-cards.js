/* Private PULSE shares in BLACKCELL iMessage. Resolve canonical IDs under the
 viewer's session; no external preview crawler and no copied signed URLs. */
import {readWorldMedia,isWorldMedia,createWorldVideoPreviews} from './blackcell-world-video-catalog.js?v=3-playback-priority';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parsePulseShare(body,base=location.href){
 const refs=[],seen=new Set();let caption=String(body||'');
 for(const m of caption.matchAll(/https:\/\/[^\s<>"']+/gi)){
  const raw=m[0].replace(/[.,!?;)\]}]+$/g,'');let u;
  try{u=new URL(raw)}catch{continue}
  if(![new URL(base).origin,'https://blackcellcorp.com','https://www.blackcellcorp.com'].includes(u.origin)||u.username||u.password||!/(?:^|\/)corporate-network\.html$/.test(u.pathname))continue;
  const p=u.searchParams.get('post'),parts=(u.searchParams.get('media')||'').split(':');
  const ref=uuid.test(p||'')?{kind:'post',id:p.toLowerCase()}:parts.length===2&&['asset','stream'].includes(parts[0])&&uuid.test(parts[1])?{kind:parts[0],id:parts[1].toLowerCase()}:null;
  if(!ref)continue;const key=ref.kind+':'+ref.id;
  if(!seen.has(key)){seen.add(key);refs.push(ref)}if(refs.length===3)break;
 }
 if(!refs.length)return null;
 for(const m of [...caption.matchAll(/https:\/\/[^\s<>"']+/gi)]){
  const raw=m[0].replace(/[.,!?;)\]}]+$/g,'');try{const u=new URL(raw);if(![new URL(base).origin,'https://blackcellcorp.com','https://www.blackcellcorp.com'].includes(u.origin)||u.username||u.password||!/(?:^|\/)corporate-network\.html$/.test(u.pathname))continue;const p=u.searchParams.get('post'),media=u.searchParams.get('media');if(refs.some(r=>r.kind==='post'?p?.toLowerCase()===r.id:media?.toLowerCase()===r.kind+':'+r.id))caption=caption.split(raw).join('')}catch{}
 }
 return {refs,caption:caption.trim()};
}
const make=(tag,cls='',value='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value)n.textContent=value;return n};
const button=(label,fn,cls='')=>{const b=make('button',cls,label);b.type='button';b.addEventListener('click',fn);return b};
const paid=a=>a.paid_content===true||a.is_paid===true||['movie','movies','series','tv','tv show','tv shows','tv series','tv_show','documentary','documentaries','film','films','episode','episodes','television','television series'].includes(String(a.video_category||'').toLowerCase().trim());
const eligible=a=>a&&a.review_status==='approved'&&a.adult_restricted===false&&['post','library'].includes(a.purpose)&&['photo','video'].includes(a.kind)&&!paid(a);
function original(ref){const u=new URL('corporate-network.html',location.href);if(ref.kind==='post')u.searchParams.set('post',ref.id);else{u.searchParams.set('view','pulse');u.searchParams.set('media',ref.kind+':'+ref.id)}return u.href}
export function createChatPulseCards(client,alive){
 const bucket=client.storage.from('corp-social-media'),cards=new Set(),previews=createWorldVideoPreviews(client);let active=null;
 async function resolve(ref,depth=0,seen=new Set()){
  const key=ref.kind+':'+ref.id;if(depth>2||seen.has(key))return null;seen.add(key);
  if(ref.kind==='post'){
   const {data:p,error}=await client.from('corp_social_posts').select('id,body,author_id').eq('id',ref.id).maybeSingle();if(error||!p)return null;
   const {data:files,error:e}=await client.from('corp_social_assets').select('*').eq('post_id',ref.id).eq('purpose','post').eq('review_status','approved').eq('adult_restricted',false).in('kind',['photo','video']).order('created_at').limit(6);
   if(e)return null;const media=(files||[]).filter(eligible);
   const nested=String(p.body||'').match(/(?:^|\n)BLACKCELL (?:MEDIA: (asset|stream):|REBLOG: |VIDEO: )([0-9a-f-]{36})\s*$/i);
   if(!media.length){const next=nested&&uuid.test(nested[2])?{kind:nested[1]||(/BLACKCELL REBLOG:/.test(nested[0])?'post':'asset'),id:nested[2].toLowerCase()}:parsePulseShare(p.body)?.refs[0];if(next){const result=await resolve(next,depth+1,seen);if(result)return result}}
   return {media,caption:nested?'':parsePulseShare(p.body)?.caption??p.body};
  }
  const stream=ref.kind==='stream';
  const {data,error}=await client.from(stream?'corp_stream_videos':'corp_social_assets').select('*').eq('id',ref.id).eq('review_status','approved').eq('adult_restricted',false).maybeSingle();
  if(error||!data)return null;
  if(stream&&!['uploaded','processing','ready'].includes(data.upload_status))return null;
  const a=stream?{...data,kind:'video',purpose:'post',bunny_stream:true,video_poster_path:data.poster_path}:data;
  return eligible(a)?{media:[a],caption:a.caption||a.title||''}:null;
 }
 async function signed(path){if(!path)throw Error('Not available');const {data,error}=await bucket.createSignedUrl(path,900);if(error||!data?.signedUrl)throw Error('Not available');return data.signedUrl}
 function stopActive(){if(active){active();active=null}}
 function clear(){stopActive();for(const card of cards){card.observer?.disconnect();card.abort.abort();for(const url of card.urls)URL.revokeObjectURL(url);card.urls.clear()}cards.clear();previews.clear()}
 function render(parsed){
  const root=make('div','bubble bc-chat-pulse-card');if(parsed.caption)root.append(make('p','bc-chat-pulse-caption',parsed.caption));
  const card={root,urls:new Set(),abort:new AbortController(),observer:null};cards.add(card);
  const valid=()=>alive()&&cards.has(card)&&root.isConnected&&!card.abort.signal.aborted;
  async function file(a){if(isWorldMedia(a)){const blob=await readWorldMedia(client,a,{signal:card.abort.signal});if(!valid())throw Error('Session changed');const url=URL.createObjectURL(blob);card.urls.add(url);return url}return signed(a.storage_path)}
  function tile(a,ref){
   const frame=make('div','bc-chat-pulse-frame'),img=make('img'),hint=make('span','bc-chat-pulse-hint',a.kind==='photo'?'Loading photo…':'Video');img.hidden=true;img.alt=a.kind==='photo'?'Shared photograph':'Video preview';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';frame.append(hint,img);
   const note=make('small','bc-chat-pulse-note','');
   if(a.kind==='photo'){
    const open=button('',()=>{if(!valid()||img.hidden)return;const dialog=make('dialog','bc-chat-pulse-full'),large=make('img');large.src=img.src;large.alt=img.alt;dialog.append(large,button('Close',()=>dialog.close(),'bc-chat-pulse-close'));dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal()},'bc-chat-pulse-picture');open.setAttribute('aria-label','Open shared photograph');open.append(frame);void file(a).then(src=>{if(valid()){img.src=src;img.hidden=false;hint.hidden=true}}).catch(()=>{if(valid())hint.textContent='Photo unavailable'});return open
   }
   const play=button('▶',async()=>{
    if(!valid()||play.disabled)return;play.disabled=true;note.textContent='Connecting…';stopActive();
    try{
     const current=await resolve({kind:a.bunny_stream?'stream':'asset',id:a.id});if(!valid()||!current?.media.length)throw Error('Unavailable');
     const media=current.media[0];let player;
     if(media.bunny_stream){
      const {data,error}=await client.functions.invoke('blackcell-video-stream-api',{body:{action:'play',catalogId:media.id}});if(error||data?.ok!==true||!data.url)throw Error('Unavailable');
      const url=new URL(data.url);if(url.protocol!=='https:'||url.hostname!=='iframe.mediadelivery.net')throw Error('Unavailable');
      player=make('iframe');player.src=url.href;player.title='Private BLACKCELL video';player.allow='autoplay; fullscreen; picture-in-picture';player.allowFullscreen=true;player.referrerPolicy='no-referrer';
     }else{const src=await file(media);player=make('video');player.controls=true;player.playsInline=true;player.preload='none';player.src=src}
     if(!valid())return;stopActive();frame.hidden=true;play.hidden=true;wrapper.insertBefore(player,note);note.textContent='';
     active=()=>{if(player.tagName==='VIDEO'){player.pause();player.removeAttribute('src');player.load()}else player.src='about:blank';player.remove();frame.hidden=false;play.hidden=false;play.disabled=false};
     if(player.tagName==='VIDEO')void player.play().catch(()=>{});
    }catch{if(valid()){note.textContent='Video unavailable. Open original to retry.';play.disabled=false}}
   },'bc-chat-pulse-play');play.setAttribute('aria-label','Play shared video');
   const wrapper=make('div','bc-chat-pulse-video');frame.append(play);wrapper.append(frame,note);
   const path=a.video_poster_path||a.poster_path;if(path)void signed(path).then(src=>{if(valid()){img.src=src;img.hidden=false;hint.hidden=true}}).catch(()=>{});else if(isWorldMedia(a))previews.mount(a,img);
   return wrapper;
  }
  for(const ref of parsed.refs){
   const section=make('section','bc-chat-pulse-share'),header=make('div','bc-chat-pulse-header','BLACKCELL PULSE'),status=make('p','bc-chat-pulse-note','Loading shared media…'),link=make('a','bc-chat-pulse-original','Open original ↗');link.href=original(ref);link.target='_blank';link.rel='noopener noreferrer';section.append(header,status,link);root.append(section);
   const run=async()=>{if(!valid())return;try{const result=await resolve(ref);if(!valid())return;if(!result){status.textContent='Shared media is unavailable to your account.';return}status.remove();if(result.caption)section.insertBefore(make('p','bc-chat-pulse-caption',String(result.caption).slice(0,500)),link);const grid=make('div','bc-chat-pulse-grid'+(result.media.length===1?' single':''));for(const a of result.media)grid.append(tile(a,ref));if(result.media.length)section.insertBefore(grid,link);else section.insertBefore(make('p','bc-chat-pulse-note','Shared post · no available media'),link)}catch{if(valid())status.textContent='Preview unavailable.'}};
   if(typeof IntersectionObserver==='function'){const o=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){o.disconnect();void run()}},{rootMargin:'100px'});o.observe(section);card.abort.signal.addEventListener('abort',()=>o.disconnect(),{once:true})}else queueMicrotask(run);
  }
  return root;
 }
 window.addEventListener('pagehide',clear);
 return {render,clear,stopActive};
}
