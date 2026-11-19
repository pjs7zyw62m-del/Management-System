/* BLACKCELL OS Executive Desktop. Hooks into existing launchers; no mock windows. */
(()=>{
 'use strict';
 function init(){
  const shell=document.getElementById('desktop'),work=shell?.querySelector('.workspace');
  if(!shell||!work||work.querySelector('.bc-exec-stage'))return;
  const stage=document.createElement('div');stage.className='bc-exec-stage';stage.dataset.version='2';stage.setAttribute('aria-label','Executive desktop search and branding');
  const search=document.createElement('div');search.className='bc-exec-search';
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.8');icon.innerHTML='<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 5 5"/>';
  const input=document.createElement('input');input.type='search';input.autocomplete='off';input.spellcheck=false;input.placeholder='Search BLACKCELL or open an application…';input.setAttribute('aria-label','Search installed BLACKCELL applications');
  const shortcut=document.createElement('span');shortcut.className='bc-exec-shortcut';shortcut.textContent='/';
  const results=document.createElement('div');results.className='bc-exec-results';results.setAttribute('role','listbox');
  search.append(icon,input,shortcut,results);
  const brand=document.createElement('div');brand.className='bc-exec-brand';brand.setAttribute('aria-hidden','true');
  brand.innerHTML=`<svg class="bc-exec-mark" viewBox="0 0 220 220" aria-label="BLACKCELL corporate emblem" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bcExecMetal2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7f7f8"/><stop offset=".25" stop-color="#83838c"/><stop offset=".5" stop-color="#e6e6ec"/><stop offset=".72" stop-color="#4c4e57"/><stop offset="1" stop-color="#d1d0d8"/></linearGradient><linearGradient id="bcExecBlood2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fa4560"/><stop offset=".55" stop-color="#b31635"/><stop offset="1" stop-color="#550713"/></linearGradient></defs><path d="M110 9 210 110 110 211 10 110Z" fill="#0a0b0e" stroke="url(#bcExecMetal2)" stroke-width="9"/><path d="M110 28 189 110 110 193 31 110Z" fill="url(#bcExecBlood2)" opacity=".9"/><path d="M68 55h58c52 0 57 52 20 60 42 10 39 56-11 56H68V55Zm26 23v30h30c20 0 20-30 0-30H94Zm0 49v24h35c16 0 17-24 0-24H94Z" fill="url(#bcExecMetal2)"/><path d="m44 175 127-130" stroke="#1e2026" stroke-width="5" opacity=".6"/></svg><div class="bc-exec-name">BLACKCELL</div><div class="bc-exec-company">CORPORATION</div><div class="bc-exec-tagline">CONTROL IS EVERYTHING.</div>`;
  stage.append(search,brand);(work.querySelector(':scope > section')||work).prepend(stage);
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
  document.addEventListener('keydown',e=>{if((e.key==='/'||(e.key.toLowerCase()==='k'&&(e.ctrlKey||e.metaKey)))&&e.target instanceof Element&&!e.target.closest('input,textarea,[contenteditable]')&&getComputedStyle(stage).display!=='none'&&!shell.hidden){e.preventDefault();input.focus()}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
