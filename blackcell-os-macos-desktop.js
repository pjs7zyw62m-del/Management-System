/* BLACKCELL OS / quieter Mac-inspired desktop. Presentation-only.
   Authorized application buttons, windows, and the account-scoped layout remain in place. */
(()=>{
 'use strict';
 function start(){
  const shell=document.getElementById('desktop'),stage=shell?.querySelector('.bc-exec-stage');
  if(!shell||!stage||stage.querySelector('.bc-macos-actions'))return;
  const group=document.createElement('nav');group.className='bc-macos-actions';group.setAttribute('aria-label','Desktop controls');
  const button=(text,title,handler)=>{
   const b=document.createElement('button');b.type='button';b.className='bc-macos-action';
   b.textContent=text;b.title=title;b.addEventListener('click',handler);group.append(b);return b;
  };
  const update=()=>{
   const clean=shell.classList.contains('bc-macos-desktop');
   group.hidden=!clean;
   apps.setAttribute('aria-pressed',String(shell.classList.contains('bc-macos-apps-open')));
   widgets.setAttribute('aria-pressed',String(shell.classList.contains('bc-macos-widgets-open')));
  };
  const close=()=>{shell.classList.remove('bc-macos-apps-open','bc-macos-widgets-open');update()};
  const apps=button('Applications','Show or hide desktop application shortcuts',()=>{
   const active=!shell.classList.contains('bc-macos-apps-open');close();shell.classList.toggle('bc-macos-apps-open',active);
   if(active)window.dispatchEvent(new Event('resize'));update();
  });
  const widgets=button('Widgets','Show or hide your desktop widgets',()=>{
   const active=!shell.classList.contains('bc-macos-widgets-open');close();shell.classList.toggle('bc-macos-widgets-open',active);update();
  });
  button('Wallpaper','Change your wallpaper in BLACKCELL Settings',()=>{
   close();const tile=shell.querySelector('.workspace .app[data-app="settings"]');
   if(tile&&!tile.hidden&&!tile.disabled)tile.click();
  });
  stage.append(group);update();
  const observer=new MutationObserver(update);observer.observe(shell,{attributes:true,attributeFilter:['class']});
  const appsGroup=shell.querySelector('.workspace .apps');
  appsGroup?.addEventListener('click',e=>{if(e.target.closest('.app[data-app]'))close()});
  document.addEventListener('keydown',e=>{
   if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='a'&&!e.target.closest('input,textarea,[contenteditable]')&&!shell.hidden&&shell.classList.contains('bc-macos-desktop')){
    e.preventDefault();apps.click();
   }else if(e.key==='Escape'&&(shell.classList.contains('bc-macos-apps-open')||shell.classList.contains('bc-macos-widgets-open')))close();
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
