/* BLACKCELL OS // Three-device concept implementation
 * Adds real desktop launch cards and a touch-sized iPhone launcher.
 * Never bypasses the existing app's installed/hidden/access checks.
 */
(()=>{
  'use strict';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const icon=(name)=>({
    home:'<path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-7h6v7"/>',
    apps:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    workspace:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    network:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c6 5 6 13 0 18M12 3c-6 5-6 13 0 18"/>',
    more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    close:'<path d="M6 6l12 12M18 6 6 18"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>',
    photo:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m4 19 6-6 3 3 3-4 4 7"/>',
    play:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    browser:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
    chat:'<path d="M20 11a8 8 0 0 1-8 8H6l1.5-3A8 8 0 1 1 20 11Z"/>',
    forces:'<path d="M12 2 21 6v6c0 5-4 8-9 10-5-2-9-5-9-10V6z"/><path d="m12 7 1.4 3 3.4.5-2.5 2.5.6 3.4-2.9-1.5-2.9 1.5.6-3.4-2.5-2.5 3.4-.5z"/>'
  }[name]||'');
  const svg=(name)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icon(name)+'</svg>';
  const mk=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
  let initialized=false,priorFocus=null;
  function init(){
    if(initialized)return;
    const shell=$('#desktop'),work=shell?.querySelector('.workspace'),stage=work?.querySelector('.bc-exec-stage');
    const tiles=work?.querySelector('.apps');
    if(!shell||!work||!stage||!tiles)return;
    initialized=true;
    shell.classList.add('bc-three-device-os');
    // Position the hero relative to the OS workspace, not the right-hand app panel.
    // The former placement silently pushed the desktop emblem offscreen.
    if(stage.parentElement!==work)work.prepend(stage);
    const launch=(id)=>{
      const tile=$('.workspace .apps>.app[data-app="'+id+'"]',shell);
      if(!tile||tile.hidden||tile.disabled||!tile.isConnected||getComputedStyle(tile).display==='none')return false;
      tile.click();return true;
    };
    const installed=()=>$$('.workspace .apps>.app[data-app]',shell).filter(tile=>!tile.hidden&&!tile.disabled&&getComputedStyle(tile).display!=='none'&&!tile.classList.contains('bc-recycled-shortcut'));
    // Live application shortcuts; all clicks go through the real OS launcher.
    const quick=mk('section','bc-concept-quick');quick.setAttribute('aria-label','Quick applications');
    const line=mk('div','bc-concept-quick-head');
    const label=mk('span','', 'WORKSPACE / QUICK ACCESS'),live=mk('small','bc-concept-live','LIVE APPLICATIONS');
    line.append(label,live);
    const links=mk('div','bc-concept-quick-links');
    const candidates=[
      ['files','Files','folder'],['personalphotos','Photos','photo'],['film','Cinema','play'],
      ['browser','Browser','browser'],['chat','Messages','chat'],['forces','Armed Forces','forces']
    ];
    const buttons=candidates.map(([id,name,glyph])=>{
      const b=mk('button','bc-concept-quick-btn');b.type='button';b.dataset.launch=id;
      b.innerHTML=svg(glyph);b.append(mk('span','',name));b.addEventListener('click',()=>launch(id));
      links.append(b);return b;
    });
    quick.append(line,links);stage.append(quick);
    // Reuse existing authenticated values; never invent CPU, quota or media numbers.
    const overview=mk('section','bc-concept-overview');
    overview.setAttribute('aria-label','BLACKCELL workspace status');
    const access=mk('div','bc-concept-metric'),count=mk('div','bc-concept-metric'),storage=mk('div','bc-concept-metric');
    const metric=(box,name)=>{box.append(mk('small','',name),mk('strong','', '—'));return $('strong',box)};
    const accessValue=metric(access,'NETWORK STATUS'),countValue=metric(count,'INSTALLED APPS'),storageValue=metric(storage,'PRIVATE STORAGE');
    overview.append(access,count,storage);
    tiles.after(overview);
    const refresh=()=>{
      const apps=installed();
      countValue.textContent=String(apps.length);
      accessValue.textContent=($('#topStatus',shell)?.textContent||'Secure session').trim().slice(0,28)||'Secure session';
      const used=($('#bcStorageUsed',shell)?.textContent||'').trim();
      storageValue.textContent=used&&used!=='—'?used:'Checking…';
      for(const b of buttons)b.hidden=!apps.some(t=>t.dataset.app===b.dataset.launch);
      live.textContent=apps.length+' AVAILABLE';
    };
    // Accessible five-item iPhone navigation with working application switcher.
    const nav=mk('nav','bc-concept-mobile-nav');nav.setAttribute('aria-label','BLACKCELL mobile navigation');
    const overlay=mk('div','bc-concept-overlay');overlay.hidden=true;
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Applications and workspaces');
    const sheet=mk('div','bc-concept-sheet');
    const shead=mk('header','bc-concept-sheet-head'),heading=mk('h2','', 'APPLICATIONS'),close=mk('button','bc-concept-sheet-close');
    close.type='button';close.setAttribute('aria-label','Close menu');close.innerHTML=svg('close');
    const shelf=mk('div','bc-concept-sheet-content');
    shead.append(heading,close);sheet.append(shead,shelf);overlay.append(sheet);
    shell.append(nav,overlay);
    const topActions=mk('div','bc-phone-toolbar');
    const searchButton=mk('button','bc-phone-toolbar-btn');
    searchButton.type='button';searchButton.setAttribute('aria-label','Search BLACKCELL applications');
    searchButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.7 4.7"/></svg>';
    searchButton.addEventListener('click',()=>{hideOverlay();$('.bc-exec-search input',stage)?.focus({preventScroll:false})});
    const accountButton=mk('button','bc-phone-toolbar-btn');accountButton.type='button';
    accountButton.setAttribute('aria-label','Open my profile');
    accountButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>';
    accountButton.addEventListener('click',()=>{hideOverlay();if(!launch('person'))showOverlay('apps',accountButton)});
    topActions.append(searchButton,accountButton);
    shell.querySelector('.topbar')?.append(topActions);
    function hideOverlay(){if(overlay.hidden)return;overlay.hidden=true;document.body.classList.remove('bc-concept-menu-open');priorFocus?.focus?.({preventScroll:true});priorFocus=null}
    function addMenuTile(tile){
      const b=mk('button','bc-concept-menu-tile');b.type='button';
      const iconNode=$('.app-icon',tile);
      if(iconNode)b.append(iconNode.cloneNode(true));
      b.append(mk('span','', $('.app-name',tile)?.textContent||tile.dataset.title||tile.dataset.app));
      b.addEventListener('click',()=>{hideOverlay();launch(tile.dataset.app)});
      shelf.append(b);
    }
    function showOverlay(kind,trigger){
      if(shell.hidden)return;
      priorFocus=trigger;
      shelf.replaceChildren();heading.textContent=kind==='workspace'?'OPEN WORKSPACES':kind==='more'?'MORE APPLICATIONS':'APPLICATIONS';
      let entries=installed();
      if(kind==='workspace'){
        const win=$$('section.os-window[data-os-app]',shell).filter(w=>!w.hidden);
        entries=win.map(w=>$('.workspace .apps>.app[data-app="'+w.dataset.osApp+'"]',shell)).filter(Boolean);
        if(!entries.length)shelf.append(mk('p','bc-concept-sheet-empty','No application windows are currently open. Choose Apps to start one.'));
      }
      if(kind==='more')entries=entries.filter(t=>!['files','personalphotos','film','network','chat'].includes(t.dataset.app));
      for(const tile of entries)addMenuTile(tile);
      if(!entries.length&&kind!=='workspace')shelf.append(mk('p','bc-concept-sheet-empty','No additional installed applications are available.'));
      overlay.hidden=false;document.body.classList.add('bc-concept-menu-open');close.focus({preventScroll:true});
    }
    const commands=[
      ['Home','home',()=>{hideOverlay();$('#showDesktop',shell)?.click();work.scrollTo?.({top:0,behavior:'smooth'})}],
      ['Apps','apps',trigger=>showOverlay('apps',trigger)],
      ['Workspace','workspace',trigger=>showOverlay('workspace',trigger)],
      ['Network','network',trigger=>{hideOverlay();if(!launch('network'))showOverlay('apps',trigger)}],
      ['More','more',trigger=>showOverlay('more',trigger)]
    ];
    for(const [name,glyph,fn] of commands){
      const button=mk('button','bc-concept-nav-item');button.type='button';
      if(name==='Home'){button.dataset.active='true';button.setAttribute('aria-current','page')}
      button.innerHTML=svg(glyph);button.append(mk('span','',name));
      button.addEventListener('click',()=>{
        for(const b of $$('.bc-concept-nav-item',nav)){b.removeAttribute('aria-current');delete b.dataset.active}
        button.dataset.active='true';button.setAttribute('aria-current','page');fn(button);
      });
      nav.append(button);
    }
    close.addEventListener('click',hideOverlay);
    overlay.addEventListener('click',e=>{if(e.target===overlay)hideOverlay()});
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();hideOverlay()}
      if(e.key==='Tab'){
        const items=$$('button:not([disabled])',sheet).filter(x=>!x.hidden);
        if(!items.length)return;const first=items[0],last=items.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)hideOverlay()});
    const observer=new MutationObserver(refresh);
    observer.observe(tiles,{subtree:false,childList:true});
    for(const t of $$('.app[data-app]',tiles))observer.observe(t,{attributes:true,attributeFilter:['hidden','disabled','class']});
    const storageText=$('#bcStorageUsed',shell);if(storageText)observer.observe(storageText,{characterData:true,subtree:true,childList:true});
    const statusText=$('#topStatus',shell);if(statusText)observer.observe(statusText,{characterData:true,subtree:true,childList:true});
    refresh();
    window.addEventListener('blackcell:app-catalog-updated',refresh);
    window.addEventListener('pageshow',refresh);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
