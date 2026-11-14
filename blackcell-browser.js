import {mountCloudPilot} from './blackcell-cloud-browser.js?v=1';
/* BLACKCELL Browser: web-based viewer, not a proxy or native browser. */
export function mountBrowser(host,record,external,activity){
 const container=document.createElement('div');mountCloudPilot(host,record,container);
 container.classList.add('bc-browser');
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n};
 const button=(label,text,fn)=>{const n=el('button','bc-browser-btn',text);n.type='button';n.title=label;n.setAttribute('aria-label',label);n.onclick=fn;return n};
 const tabs=el('div','bc-browser-tabs'),toolbar=el('div','bc-browser-toolbar'),form=el('form','bc-browser-address'),address=el('input');
 address.type='text';address.placeholder='Search or enter website address';address.autocomplete='off';address.spellcheck=false;address.setAttribute('aria-label','Search or enter website address');
 const hint=el('div','bc-browser-hint'),pages=el('div','bc-browser-pages');
 const open=el('a','bc-browser-external','Open in browser ↗');open.target='_blank';open.rel='noopener noreferrer';open.hidden=true;
 const list=[];let current=null,sequence=0;
 const prev=button('Back','‹',()=>move(-1)),next=button('Forward','›',()=>move(1)),reload=button('Reload','↻',()=>{if(current?.history[current.index])load(current,current.history[current.index]);});
 const home=button('Start page','⌂',()=>navigate(''));
 const go=button('Go','↵',()=>form.requestSubmit());
 form.append(address,go);toolbar.append(prev,next,reload,home,form,open);container.append(tabs,toolbar,hint,pages);
 external.hidden=true;
 function newTab(){
  const t={id:++sequence,index:0,history:[''],page:el('div','bc-browser-page'),frame:null};list.push(t);pages.append(t.page);load(t,'');activate(t);
 }
 function activate(t){current=t;for(const item of list)item.page.hidden=item!==t;sync()}
 function remove(t){t.page.remove();const i=list.indexOf(t);list.splice(i,1);if(!list.length)newTab();else if(current===t)activate(list[Math.max(0,i-1)]);else sync()}
 function label(u){if(!u)return 'Start Page';try{return new URL(u).hostname}catch(_){return 'Website'}}
 function sync(){
  if(!current)return;const u=current.history[current.index];address.value=u||'';prev.disabled=current.index<=0;next.disabled=current.index>=current.history.length-1;reload.disabled=!u;open.hidden=!u;if(u)open.href=u;
  hint.textContent=u?'Embedded view · Some sites block frames or sign-in. Use Open in browser to visit the requested address.':'BLACKCELL Browser · Search the web or enter an HTTPS address.';
  tabs.replaceChildren();for(const t of list){const group=el('div','bc-browser-tab');group.classList.toggle('selected',t===current);const tab=button('Switch to '+label(t.history[t.index]),label(t.history[t.index]),()=>activate(t));const close=button('Close tab','×',()=>remove(t));group.append(tab,close);tabs.append(group)}tabs.append(button('New tab','+',newTab));
 }
 function start(t){
  t.frame=null;t.page.replaceChildren();const center=el('div','bc-browser-start'),wrap=el('div','bc-browser-start-inner');
  const emblem=el('div','bc-browser-emblem','✧');const h=el('h2','','BLACKCELL Browser');const p=el('p','','Explore beyond the network.');
  const search=el('form','bc-browser-search'),field=el('input');field.placeholder='Search the web';field.type='search';field.autocomplete='off';field.setAttribute('aria-label','Search the web');const submit=el('button','bc-browser-btn','Search');submit.type='submit';search.append(field,submit);
  search.onsubmit=e=>{e.preventDefault();activate(t);submitAddress(field.value)};
  const fav=el('div','bc-browser-favorites');
  for(const [name,url,icon] of [['Google','https://www.google.com/','G'],['Wikipedia','https://en.wikipedia.org/','W'],['DuckDuckGo','https://duckduckgo.com/','D']]){
   const a=el('a','bc-browser-favorite');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.append(el('span','',icon),el('small','',name));fav.append(a)
  }
  const note=el('p','bc-browser-small','External websites may open in your normal browser. This viewer does not proxy websites.');
  wrap.append(emblem,h,p,search,fav,note);center.append(wrap);t.page.append(center);
 }
 function load(t,u){
  if(!u){start(t);return}t.page.replaceChildren();const frame=el('iframe','bc-browser-frame');frame.title='Embedded website: '+label(u);frame.setAttribute('sandbox','allow-scripts allow-forms');frame.referrerPolicy='no-referrer';frame.src=u;t.frame=frame;t.page.append(frame);
 }
 function navigate(u){if(!current)return;current.history.splice(current.index+1);current.history.push(u);current.index=current.history.length-1;load(current,u);sync()}
 function move(step){const i=current.index+step;if(i<0||i>=current.history.length)return;current.index=i;load(current,current.history[i]);sync()}
 function submitAddress(raw){
  const value=raw.trim();if(!value)return;
  let u=null;
  try{
   const candidate=/^[a-z][a-z0-9+.-]*:/i.test(value)?value:(!/\s/.test(value)&&value.includes('.')?'https://'+value:null);
   if(candidate){const parsed=new URL(candidate);if(parsed.protocol!=='https:'||parsed.username||parsed.password){hint.textContent='Only HTTPS website addresses without embedded credentials are supported.';return}if(parsed.origin===location.origin){hint.textContent='Use the dedicated BLACKCELL OS apps for internal pages.';return}u=parsed.href}
  }catch(_){hint.textContent='Enter a valid HTTPS address or a search phrase.';return}
  if(!u){
   const target='https://www.google.com/search?q='+encodeURIComponent(value);navigate(target);
   // Search providers typically prohibit embedded result pages. Open directly from this gesture.
   window.open(target,'_blank','noopener,noreferrer');return;
  }
  navigate(u);
 }
 form.onsubmit=e=>{e.preventDefault();submitAddress(address.value)};
 container.addEventListener('pointerdown',()=>activity?.(),{passive:true});
 newTab();
}