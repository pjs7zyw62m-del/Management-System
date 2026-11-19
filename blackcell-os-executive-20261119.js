/* BLACKCELL OS Executive Desktop. Hooks into existing launchers; no mock windows. */
(()=>{
 'use strict';
 function init(){
  const shell=document.getElementById('desktop'),work=shell?.querySelector('.workspace');
  if(!shell||!work||work.querySelector('.bc-exec-stage'))return;
  const stage=document.createElement('div');stage.className='bc-exec-stage';stage.setAttribute('aria-label','Executive desktop search and branding');
  const search=document.createElement('div');search.className='bc-exec-search';
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.8');icon.innerHTML='<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 5 5"/>';
  const input=document.createElement('input');input.type='search';input.autocomplete='off';input.spellcheck=false;input.placeholder='Search BLACKCELL applications';input.setAttribute('aria-label','Search installed BLACKCELL applications');
  const shortcut=document.createElement('span');shortcut.className='bc-exec-shortcut';shortcut.textContent='/';
  const results=document.createElement('div');results.className='bc-exec-results';results.setAttribute('role','listbox');
  search.append(icon,input,shortcut,results);
  const brand=document.createElement('div');brand.className='bc-exec-brand';brand.setAttribute('aria-hidden','true');
  brand.innerHTML='<svg class="bc-exec-mark" viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bcExecSilver" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#FAFBFF"/><stop offset=".4" stop-color="#9195A3"/><stop offset=".8" stop-color="#323642"/><stop offset="1" stop-color="#E4E8F1"/></linearGradient><linearGradient id="bcExecCrimson" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#FF647C"/><stop offset="1" stop-color="#880A25"/></linearGradient></defs><path d="M110 11 203 110 110 209 17 110Z" stroke="#C5C6CF" stroke-width="2" opacity=".35"/><path d="m110 25 79 85-79 84-79-84Z" fill="#14151B" stroke="url(#bcExecSilver)" stroke-width="3"/><path d="m74 58 36 0 35 50-35 53-36 0 36-53Z" stroke="url(#bcExecSilver)" stroke-width="13" stroke-linejoin="miter"/><path d="m121 59 35 0-35 49 35 51-35 0" stroke="url(#bcExecCrimson)" stroke-width="9"/><path d="M34 146 177 74" stroke="#D81E40" stroke-width="2" opacity=".7"/></svg><div class="bc-exec-name">BLACKCELL</div><div class="bc-exec-company">CORPORATION · OS</div><div class="bc-exec-tagline">CONTROL IS EVERYTHING.</div>';
  stage.append(search,brand);work.append(stage);
  const available=()=>[...shell.querySelectorAll('.workspace .apps .app[data-app]')].filter(el=>!el.hidden&&!el.disabled&&getComputedStyle(el).display!=='none').map(el=>({label:el.dataset.title||el.querySelector('.app-name')?.textContent||el.dataset.app,el}));
  function close(){results.replaceChildren();results.dataset.open='false'}
  function run(item){close();input.value='';item?.el?.click()}
  function render(){
   const q=input.value.trim().toLowerCase();results.replaceChildren();
   if(!q){close();return}
   const matches=available().filter(item=>[item.label,item.el.dataset.sub,item.el.dataset.app].some(s=>String(s||'').toLowerCase().includes(q))).slice(0,9);
   if(!matches.length){const empty=document.createElement('p');empty.textContent='No matching installed applications';results.append(empty)}
   else for(const item of matches){const b=document.createElement('button');b.type='button';const title=document.createElement('span');title.textContent=item.label;const note=document.createElement('small');note.textContent='Open app';b.append(title,note);b.onclick=()=>run(item);results.append(b)}
   results.dataset.open='true';
  }
  input.addEventListener('input',render);
  input.addEventListener('keydown',e=>{
   if(e.key==='Escape'){close();input.blur()}
   if(e.key==='Enter'){const q=input.value.trim().toLowerCase();if(!q)return;const match=available().find(x=>[x.label,x.el.dataset.sub,x.el.dataset.app].some(v=>String(v||'').toLowerCase().includes(q)));if(match){e.preventDefault();run(match)}}
  });
  document.addEventListener('pointerdown',e=>{if(!search.contains(e.target))close()});
  document.addEventListener('keydown',e=>{if(e.key==='/'&&e.target instanceof Element&&!e.target.closest('input,textarea,[contenteditable]')&&getComputedStyle(stage).display!=='none'&&!shell.hidden){e.preventDefault();input.focus()}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
