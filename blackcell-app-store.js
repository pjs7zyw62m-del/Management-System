/* Curated BLACKCELL desktop app catalog. Installation adds a shortcut, not a native executable. */
export function mountStore(host,api){
 host.classList.add('bc-store');
 const make=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e};
 const button=(text,cls,fn)=>{const e=make('button',cls,text);e.type='button';e.onclick=fn;return e};
 const rail=make('nav','bc-store-rail');rail.setAttribute('aria-label','App Store sections');
 const brand=make('div','bc-store-brand','App Store');rail.append(brand);
 const body=make('div','bc-store-body'),header=make('header','bc-store-header'),headline=make('h1','','Discover'),search=make('input','bc-store-search');
 search.type='search';search.placeholder='Search apps';search.setAttribute('aria-label','Search apps');search.autocomplete='off';
 const results=make('div','bc-store-results'),banner=make('div','bc-store-feedback');banner.setAttribute('role','status');header.append(headline,search);body.append(header,banner,results);host.append(rail,body);
 let category='discover',detail=null;
 const categories=[['discover','Discover','✦'],['installed','Installed','▦'],['optional','All add-ons','⊕']];
 const navButtons=categories.map(([id,name,icon])=>{const b=button(icon+'  '+name,'bc-store-nav',()=>{category=id;detail=null;render()});rail.append(b);return [id,b]});
 rail.append(make('p','bc-store-railnote','BLACKCELL CORPORATION\nCurated applications'));
 function card(app){const c=make('article','bc-store-app'),icon=make('div','bc-store-icon');icon.append(app.icon.cloneNode(true));const copy=make('div','bc-store-copy'),name=button(app.title,'bc-store-link',()=>{detail=app.id;render()});copy.append(name,make('p','',app.sub));
 const action=button(app.installed?'OPEN':'GET','bc-store-get',()=>{if(app.installed){api.open(app.id);return}const result=api.install(app.id,true);banner.textContent=result.ok?'Added '+app.title+' to your desktop.':result.error;render()});
 c.append(icon,copy,action);return c}
 function group(title,apps){if(!apps.length)return;const section=make('section','bc-store-group');section.append(make('h2','',title));const grid=make('div','bc-store-grid');for(const app of apps)grid.append(card(app));section.append(grid);results.append(section)}
 function render(){
  const all=api.catalog();for(const [id,b] of navButtons)b.classList.toggle('selected',category===id);
  headline.textContent=detail?'App Details':categories.find(c=>c[0]===category)[1];results.replaceChildren();
  if(detail){const a=all.find(x=>x.id===detail);if(!a){detail=null;render();return}results.append(button('‹ Back','bc-store-back',()=>{detail=null;render()}));const hero=make('article','bc-store-detail'),ico=make('div','bc-store-icon large');ico.append(a.icon.cloneNode(true));const copy=make('div');copy.append(make('h2','',a.title),make('p','',a.desc),make('p','bc-store-muted',a.optional?'Free · BLACKCELL desktop shortcut':'Included with BLACKCELL OS'));const action=button(a.installed?'OPEN':'GET','bc-store-get',()=>{if(a.installed){api.open(a.id);return}const result=api.install(a.id,true);banner.textContent=result.ok?'Added '+a.title+' to your desktop.':result.error;render()});copy.append(action);
   if(a.optional&&a.installed)copy.append(button('Remove from desktop','bc-store-remove',()=>{const result=api.install(a.id,false);banner.textContent=result.ok?'Shortcut removed. Your app data is unchanged.':result.error;render()}));hero.append(ico,copy);results.append(hero);return}
  const q=search.value.trim().toLowerCase();let filtered=all.filter(a=>!q||[a.title,a.sub,a.desc].join(' ').toLowerCase().includes(q));if(category==='installed')filtered=filtered.filter(a=>a.installed);if(category==='optional')filtered=filtered.filter(a=>a.optional);
  if(!q&&category==='discover'){const hero=make('div','bc-store-feature'),copy=make('div');copy.append(make('div','bc-store-kicker','BLACKCELL OS  /  DISCOVER'),make('h2','','Make it yours.'),make('p','','Expand your desktop with curated BLACKCELL applications.'));const symbol=make('div','bc-store-feature-symbol','✧');hero.append(copy,symbol);results.append(hero)}
  if(!filtered.length){results.append(make('p','bc-store-empty','No applications match your selection.'));return}
  if(category==='discover'&&!q){group('Featured add-ons',filtered.filter(a=>a.optional));group('Included with BLACKCELL OS',filtered.filter(a=>!a.optional))}else group(category==='installed'?'Your applications':'Applications',filtered);
 }
 search.addEventListener('input',()=>{detail=null;render()});render();return render;
}