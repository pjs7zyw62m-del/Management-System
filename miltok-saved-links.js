/* Blackcell MilTok — private TikTok link organizer.
   Does not download/extract, scrape, strip watermarks or proxy video media. */
import {authorizeUniformHub} from './uniform-hub-auth.js?v=20261111-i1';
const $=id=>document.getElementById(id);
let session=null,busy=false,alreadyLoaded=false,lastFocus=null;
function normalize(raw){
 try{
  const value=String(raw||'').trim().replace(/[),;.!]+$/g,'');
  const url=new URL(value);
  const domain=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||!['tiktok.com','www.tiktok.com','m.tiktok.com','vm.tiktok.com','vt.tiktok.com'].includes(domain))return null;
  if(url.username||url.password)return null;
  // Preserve the share path, drop tracking / campaign query parameters.
  url.search='';url.hash='';
  if(url.pathname==='/'||url.pathname.length<2)return null;
  return url.toString();
 }catch(_){return null}
}
function listFromInput(){
 const text=[$('mtSavedOne').value,$('mtSavedBatch').value].filter(Boolean).join('\n');
 const candidates=text.match(/https:\/\/[^\s<>"']+/gi)||[];
 const valid=[],invalid=[];
 for(const candidate of candidates){
  const url=normalize(candidate);
  if(!url)invalid.push(candidate);
  else if(!valid.includes(url))valid.push(url);
 }
 return {valid,invalid};
}
function note(text){$('mtSavedMessage').textContent=text}
function item(tag,className,text){
 const x=document.createElement(tag);if(className)x.className=className;
 if(text!==undefined)x.textContent=String(text);
 return x;
}
function close(){
 if(busy)return;
 $('mtSavedOverlay').hidden=true;
 if(lastFocus?.isConnected)lastFocus.focus();
 lastFocus=null;
}
function show(){
 if(busy)return;
 lastFocus=document.activeElement;
 $('mtSavedOverlay').hidden=false;
 $('mtSavedClose').focus();
 if(!alreadyLoaded)void load();
}
async function ensure(){
 if(session)return true;
 session=await authorizeUniformHub();
 return !!session;
}
async function load(){
 if(!await ensure())return;
 const {data,error}=await session.client.from('corp_social_tiktok_saves')
  .select('id,video_url,creator_handle,title,military_branch,saved_at')
  .eq('user_id',session.user.id).order('saved_at',{ascending:false}).limit(500);
 if(error){note('Unable to load saved links: '+error.message);return}
 alreadyLoaded=true;
 const host=$('mtSavedList');host.replaceChildren();
 $('mtSavedCount').textContent=(data||[]).length+' SAVED';
 if(!data?.length){host.append(item('p','mt-saved-empty','No links saved yet. Paste a military TikTok URL above to start your private collection.'));return}
 for(const row of data){
  const card=item('article','mt-saved-card');
  const info=item('div','mt-saved-card-copy');
  info.append(item('span','mt-saved-card-branch',row.military_branch||'MILITARY CLIP'));
  const title=item('strong','',row.title||row.creator_handle||'Military TikTok video');
  info.append(title);
  const url=item('small','',row.video_url);
  info.append(url);
  const actions=item('div','mt-saved-card-actions');
  const open=item('a','','OPEN IN TIKTOK ↗');
  open.href=row.video_url;open.target='_blank';open.rel='noopener noreferrer';
  const remove=item('button','','REMOVE');
  remove.type='button';remove.setAttribute('aria-label','Remove saved TikTok link '+(row.title||row.video_url));
  remove.addEventListener('click',async()=>{
   if(busy)return;busy=true;remove.disabled=true;
   try{
    const {data:deleted,error:deleteError}=await session.client.from('corp_social_tiktok_saves')
      .delete().eq('id',row.id).eq('user_id',session.user.id).select('id');
    if(deleteError||deleted?.length!==1)throw Error(deleteError?.message||'Link was not removed');
    note('Saved TikTok reference removed.');await load();
   }catch(error){note('Unable to remove link: '+error.message)}
   finally{busy=false;remove.disabled=false}
  });
  actions.append(open,remove);card.append(info,actions);host.append(card);
 }
}
async function save(event){
 event.preventDefault();
 if(busy)return;
 const {valid,invalid}=listFromInput();
 if(!valid.length){note('Paste at least one valid HTTPS TikTok video link.');return}
 if(valid.length>50){note('Save up to 50 TikTok links at a time.');return}
 if(!await ensure())return;
 busy=true;
 const submit=$('mtSavedSubmit');submit.disabled=true;submit.textContent='SAVING LINKS…';
 try{
  const branch=$('mtSavedBranch').value;
  const title=$('mtSavedTitleInput').value.trim().slice(0,200);
  const records=valid.map(video_url=>({
   user_id:session.user.id,video_url,creator_handle:'',
   title:valid.length===1?title:'',military_branch:branch,
   note:''
  }));
  const {error}=await session.client.from('corp_social_tiktok_saves')
    .upsert(records,{onConflict:'user_id,video_url',ignoreDuplicates:true});
  if(error)throw error;
  $('mtSavedOne').value='';$('mtSavedBatch').value='';
  note(valid.length+' '+(valid.length===1?'link':'links')+' processed'+
    (invalid.length?' · '+invalid.length+' invalid link(s) skipped':'')+
    '. Existing saved links were not duplicated.');
  await load();
 }catch(error){note('Unable to save TikTok links: '+(error.message||'Connection problem'))}
 finally{busy=false;submit.disabled=false;submit.textContent='＋ SAVE TIKTOK LINKS'}
}
function boot(){
 $('mtOpenSaved')?.addEventListener('click',show);
 $('mtSavedClose')?.addEventListener('click',close);
 $('mtSavedOverlay')?.addEventListener('click',e=>{if(e.target===$('mtSavedOverlay'))close()});
 $('mtSavedForm')?.addEventListener('submit',e=>void save(e));
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('mtSavedOverlay').hidden)close();
 });
}
boot();