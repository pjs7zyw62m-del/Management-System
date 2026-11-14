/* Administration: compact Settings-style navigation, using existing guarded controls. */
(()=> {
 let embedded=false;try{embedded=parent!==window&&new URLSearchParams(location.search).get('osApp')==='administration'&&parent.location.origin===location.origin&&parent.location.pathname.endsWith('/blackcell-os.html')&&parent.document.getElementById('bcOsAdministrationFrame')?.contentWindow===window}catch(_){}
 const dedicated=document.body.classList.contains('bc-admin-os-dedicated');
 if(!embedded&&!dedicated)return;
 const retry=document.getElementById('bcAdminOsRetry');if(retry)retry.onclick=()=>location.reload();
 const sections=[
 {id:'overview',label:'Overview',glyph:'▦',desc:'Your executive command center.',items:[['User Management','Manage employee accounts, roles, invitations and access.','modal','users'],['Media Import Processor','Review, classify and approve shared-library content.','link','corporate-media-admin.html'],['System Diagnostics','Run real service and server checks.','link','corporate-diagnostics.html'],['Costs & Revenue','Review financial plans and service costs.','link','corporate-costs-revenue.html']]},
 {id:'personnel',label:'Personnel',glyph:'♙',desc:'Corporate identity, employees and account permissions.',items:[['User Management','Accounts, profiles, roles and clearance.','modal','users'],['Employee Chat','Open your existing secure communications interface.','modal','chat'],['Private Photo Ledger','Review authorized private submissions and the shared balance.','link','private-photo-ledger.html']]},
 {id:'divisions',label:'Divisions',glyph:'◇',desc:'Independent corporate applications and division controls.',items:[['NEXUS Management','Records, communications and financial management.','modal','nexus'],["Man’s Armed Forces",'Uniform collections and media operations.','modal','mans']]},
 {id:'media',label:'Media',glyph:'▧',desc:'Shared media administration and the network.',items:[['Media Import Processor','Review, classify and approve photographs and videos.','link','corporate-media-admin.html'],['BLACKCELL Network','Social profiles, updates and video channels.','link','corporate-network.html'],['Private Photo Ledger','Access the existing restricted ledger.','link','private-photo-ledger.html']]},
 {id:'finance',label:'Finance',glyph:'◈',desc:'Corporate expense planning and revenue modeling.',items:[['Costs & Revenue','Service expenses, budgets and future forecasts.','link','corporate-costs-revenue.html'],['Private Photo Ledger','Manage the existing shared balance.','link','private-photo-ledger.html']]},
 {id:'security',label:'Security',glyph:'♢',desc:'Verified identities, security sessions and recorded activity.',items:[['Security Checks','Review owner authorization and session checks.','link','corporate-security-checks.html'],['Activity Logs','Review and export recorded activity.','link','corporate-activity-logs.html'],['My Account','Review the current administrator account.','modal','account']]},
 {id:'infrastructure',label:'Infrastructure',glyph:'◉',desc:'Service checks, applications and configuration recovery.',items:[['System Diagnostics','Run on-demand infrastructure checks.','link','corporate-diagnostics.html'],['Corporate Systems','Application directory and division links.','link','corporate-systems.html'],['Backup & Recovery','Review and restore configuration snapshots, not full data backups.','link','corporate-backups.html']]},
 {id:'intelligence',label:'Intelligence',glyph:'✧',desc:'Analyze content and plan improvements.',items:[['Content Intelligence','Review content gaps, AI suggestions and the roadmap.','link','corporate-content-intelligence.html']]},
 {id:'settings',label:'Administration Settings',glyph:'⚙',desc:'Owner preferences and corporate configuration.',items:[['System Settings','Existing owner settings, appearance, divisions and preferences.','modal','settings'],['Corporate Notifications','Review your notifications.','modal','notifications']]},
 {id:'account',label:'Account',glyph:'◉',desc:'Current executive identity and session.',items:[['My Account','Administrator account information.','modal','account'],['Sign Out','End the current corporate session using the existing secure control.','modal','signout']]}
 ];
 const make=(tag,cls,t)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(t!==undefined)n.textContent=t;return n};
 const btn=(label,fn,cls='bc-admin-os-button')=>{const n=make('button',cls,label);n.type='button';n.onclick=fn;return n};
 function start(){
  if(!document.documentElement.classList.contains('corp-ok')||window.BLACKCELL_ADMIN_READY!==true||document.querySelector('.bc-admin-os'))return false;
  const old=document.querySelector('main.admin-dashboard');if(!old)return false;
  const modal=document.getElementById('modalBackdrop'),shell=make('section','bc-admin-os'),rail=make('nav','bc-admin-os-rail'),body=make('main','bc-admin-os-body');rail.setAttribute('aria-label','Administration sections');
  const label=make('div','bc-admin-os-brand');label.append(make('div','bc-admin-os-emblem','B'),make('strong','','Administration'),make('small','','EXECUTIVE / LEVEL 7'));rail.append(label);
  const nav=new Map();let selected='overview';try{const saved=sessionStorage.getItem('bc.admin.os.section');if(sections.some(s=>s.id===saved))selected=saved}catch(_){}
  const select=id=>{selected=id;try{sessionStorage.setItem('bc.admin.os.section',id)}catch(_){}render();body.scrollTop=0};
  for(const s of sections){const button=btn('',()=>select(s.id),'bc-admin-os-nav');button.append(make('span','bc-admin-os-glyph',s.glyph),make('span','',s.label));rail.append(button);nav.set(s.id,button)}
  rail.append(make('div','bc-admin-os-note','CONTROL IS EVERYTHING.'));
  function render(){
   const current=sections.find(x=>x.id===selected)||sections[0];for(const [id,button] of nav){button.classList.toggle('selected',id===current.id);button.setAttribute('aria-current',id===current.id?'page':'false')}
   body.replaceChildren();const header=make('header','bc-admin-os-heading');header.append(make('div','bc-admin-os-kicker','BLACKCELL CORPORATION / ADMINISTRATION'),make('h1','',current.label),make('p','',current.desc));body.append(header);
   if(current.id==='overview'){
    const cards=make('div','bc-admin-os-metrics');for(const [title,value,desc] of [['Corporate Access','Level 7','Verified owner'],['Divisions','2','Independent applications'],['Service health','On demand','Use Diagnostics']]){const item=make('section','bc-admin-os-metric');item.append(make('small','',title),make('strong','',value),make('span','',desc));cards.append(item)}body.append(cards)
   }
   const panel=make('section','bc-admin-os-panel');panel.append(make('h2','',current.id==='overview'?'Quick access':current.label+' controls'));
   for(const [name,desc,kind,target] of current.items){
    const r=make('div','bc-admin-os-row'),icon=make('span','bc-admin-os-row-icon',current.glyph),copy=make('div','bc-admin-os-copy');copy.append(make('strong','',name),make('small','',desc));r.append(icon,copy);
    if(kind==='modal'){const trigger=document.querySelector('[data-open="'+target+'"]');const action=btn('Open ›',()=>{if(window.BLACKCELL_ADMIN_READY!==true||!document.documentElement.classList.contains('corp-ok'))return;trigger?.click()});action.disabled=!trigger;r.append(action)}
    else{const link=make('a','bc-admin-os-button','Open ›');link.href=target;link.target='_self';r.append(link)}
    panel.append(r)
   }
   body.append(panel);
   if(current.id==='overview'){const note=make('section','bc-admin-os-panel');note.append(make('h2','','Executive workspace'),make('p','bc-admin-os-muted','All administration actions use the existing verified corporate account. Service checks are manual; no unverified uptime or visitor totals are displayed.'));body.append(note)}
  }
  shell.append(rail,body);old.insertAdjacentElement('afterend',shell);render();document.body.classList.add('bc-admin-os-mode');document.getElementById('bcAdminOsLoading')?.remove();
  // Preserve all original admin controls and their handlers, including the existing modals.
  // Refocus the current sidebar after a modal closes rather than a hidden legacy tile.
  if(modal)new MutationObserver(()=>{if(modal.hidden&&document.activeElement?.closest('main.admin-dashboard,#drawer'))nav.get(selected)?.focus()}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  return true
 }
 function attempt(){if(start())return true;return !!document.querySelector('.bc-admin-os')}
 if(!attempt()){const observer=new MutationObserver(()=>{if(attempt())observer.disconnect()});observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-admin-controls']});window.addEventListener('blackcell-corporate-authorized',attempt);let tries=0;const timer=setInterval(()=>{if(attempt()){clearInterval(timer);observer.disconnect()}else if(++tries===120){const label=document.getElementById('bcAdminOsLoadingText');if(label)label.textContent='Administration controls have not finished loading. Reload to retry.';if(retry)retry.hidden=false}else if(tries>=600){clearInterval(timer);observer.disconnect()}},250)}
})();
