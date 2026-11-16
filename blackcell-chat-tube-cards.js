/* Internal video references, not URLs. All resolution uses the current chat session. */
import {isWorldVideo,worldVideoTitle} from './blackcell-world-video-catalog.js?v=2-native-playback';
const idPart='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const refPattern=new RegExp('(?:^|\\n|\\s)(blackcell:video/('+idPart+'))\\s*$','i');
export function parseTubeReference(body){
 const value=String(body||''),m=refPattern.exec(value);
 return m?{id:m[2].toLowerCase(),caption:value.slice(0,m.index).trim()}:null;
}
const make=(tag,cls='',value='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value)n.textContent=value;return n};
const paid=a=>['movie','movies','series','tv','tv show','tv shows','tv series','documentary','documentaries','film','films','episode','episodes','television','television series'].includes(String(a.video_category||'').toLowerCase().trim())||a.paid_content===true||a.is_paid===true;
export function createChatTubeCards(client,alive){
 const bucket=client.storage.from('corp-social-media'),cards=new Set();let active=null;
 async function asset(id){
  const {data,error}=await client.from('corp_social_assets').select('*').eq('id',id).eq('kind','video').eq('review_status','approved').eq('adult_restricted',false).maybeSingle();
  if(error||!data||!['post','library'].includes(data.purpose)||paid(data))throw Error('Unavailable');
  return data;
 }
 async function signed(path){const {data,error}=await bucket.createSignedUrl(path,900);if(error||!data?.signedUrl)throw Error('Unavailable');return data.signedUrl}
 function stop(card){const v=card.video;v.pause();v.removeAttribute('src');v.load();v.hidden=true;card.cover.hidden=false;card.play.hidden=false;card.expand.disabled=true;card.stage.classList.remove('is-expanded');card.expand.textContent='Expand';if(active===card)active=null}
 function clear(){for(const c of cards){c.observer?.disconnect();stop(c)}cards.clear()}
 function render(ref){
  const root=make('div','bubble bc-chat-tube-card');if(ref.caption)root.append(make('p','bc-chat-tube-caption',ref.caption));
  const stage=make('div','bc-chat-tube-stage'),cover=make('div','bc-chat-tube-cover'),img=make('img');img.alt='';img.decoding='async';img.hidden=true;cover.append(img);
  const play=make('button','bc-chat-tube-play','▶');play.type='button';play.setAttribute('aria-label','Play video in message');play.disabled=true;cover.append(play);
  const v=make('video');v.controls=true;v.playsInline=true;v.preload='none';v.hidden=true;stage.append(cover,v);
  const title=make('strong','bc-chat-tube-title','BLACKCELL Tube'),note=make('small','bc-chat-tube-note','Checking private video…');
  const expand=make('button','bc-chat-tube-expand','Expand');expand.type='button';expand.disabled=true;stage.append(expand);
  root.append(stage,title,note);
  const card={root,video:v,cover,play,stage,expand,observer:null};cards.add(card);
  const valid=()=>alive()&&cards.has(card)&&root.isConnected;
  let loading=false;
  async function hydrate(){
   try{const a=await asset(ref.id);if(!valid())return;title.textContent=isWorldVideo(a)?worldVideoTitle(a):String(a.title||a.caption||a.filename||'Video').slice(0,160);note.textContent='Private BLACKCELL Tube video';play.disabled=false;expand.disabled=false;if(a.video_poster_path){try{const url=await signed(a.video_poster_path);if(valid()){img.src=url;img.hidden=false}}catch{}}}
   catch{if(valid())note.textContent='Video unavailable to your account.'}
  }
  play.addEventListener('click',async e=>{
   e.stopPropagation();if(!valid()||loading)return;loading=true;play.disabled=true;note.textContent='Authorizing private playback…';
   try{const a=await asset(ref.id);if(!valid())return;let src;
    if(isWorldVideo(a)){const mod=await import('./blackcell-world-video-catalog.js?v=2-native-playback');if(typeof mod.worldPlaybackUrl!=='function')throw Error('Streaming unavailable');src=await mod.worldPlaybackUrl(client,a)}
    else{if(!a.storage_path||a.source_provider==='world-bunny-v1')throw Error('Unavailable');src=await signed(a.storage_path)}
    if(!valid())return;if(active&&active!==card)stop(active);active=card;cover.hidden=true;v.hidden=false;v.src=src;v.load();expand.disabled=false;note.textContent='Private BLACKCELL Tube video';try{await v.play()}catch{}
   }catch{if(valid())note.textContent='Video could not start. Tap play to retry.'}
   finally{loading=false;if(valid())play.disabled=false}
  });
  expand.addEventListener('click',e=>{e.stopPropagation();if(!valid())return;if(v.hidden&&!loading&&!play.disabled)play.click();if(stage.classList.contains('is-expanded')){stage.classList.remove('is-expanded');expand.textContent='Expand';return}if(document.fullscreenElement===stage){void document.exitFullscreen().catch(()=>{});return}const fallback=()=>{if(valid()){stage.classList.add('is-expanded');expand.textContent='Reduce'}};if(stage.requestFullscreen)void stage.requestFullscreen().catch(fallback);else fallback()});
  v.addEventListener('error',()=>{if(valid()&&!v.hidden){stop(card);note.textContent='Playback interrupted. Tap play to retry.'}});
  root.addEventListener('click',e=>e.stopPropagation());
  if(typeof IntersectionObserver==='function'){card.observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){card.observer.disconnect();void hydrate()}},{rootMargin:'100px'});card.observer.observe(root)}
  else queueMicrotask(()=>void hydrate());
  return root;
 }
 window.addEventListener('pagehide',clear);
 return {render,clear,stopActive:()=>{if(active)stop(active)},async canShare(ref){try{await asset(ref.id);return true}catch{return false}}};
}
