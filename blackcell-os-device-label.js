/* BLACKCELL OS // Automatic device naming.
   Presentation only. Uses the same phone/tablet/desktop mode chosen by
   the authenticated BLACKCELL OS layout engine.
*/
(()=>{
  'use strict';
  const root=document.documentElement;
  const names={desktop:'BLACKCELL OS',tablet:'BLACKCELL OS Tablet',phone:'BLACKCELL OS Mobile'};
  const android=/(?:^|[^a-z])Android(?:[^a-z]|$)/i.test(navigator.userAgent||'')||
    navigator.userAgentData?.platform==='Android';
  function mode(){
    return root.classList.contains('bc-os-phone')?'phone':
      root.classList.contains('bc-os-tablet')?'tablet':'desktop';
  }
  function setText(element,value){
    if(element&&element.textContent!==value)element.textContent=value;
  }
  function update(){
    const current=mode();
    const mobileAndroid=android&&(current==='phone'||current==='tablet');
    const label=mobileAndroid?names[current]+' · Android':names[current];
    root.classList.toggle('bc-os-android',mobileAndroid);
    root.dataset.blackcellOsPlatform=mobileAndroid?'android':'standard';
    root.dataset.blackcellDevice=current;
    root.dataset.blackcellOsName=label;
    if(document.title!==label)document.title=label;
    const gate=document.querySelector('#gate h1');
    setText(gate,label);
    const top=document.querySelector('#desktop .bc-topbrand');
    if(top){
      let suffix=top.querySelector('.bc-device-suffix');
      if(!suffix){suffix=document.createElement('span');suffix.className='bc-device-suffix';top.append(suffix)}
      setText(suffix,current==='desktop'?'':(current==='phone'?' Mobile':' Tablet')+(mobileAndroid?' · Android':''));
      top.setAttribute('aria-label',label+' system menu');
    }
    const brand=document.querySelector('#desktop .bc-exec-brand');
    if(brand){
      let identifier=brand.querySelector('.bc-device-label');
      if(!identifier){
        identifier=document.createElement('div');
        identifier.className='bc-device-label';
        (brand.querySelector('.bc-exec-company')||brand).after(identifier);
      }
      setText(identifier,label.toUpperCase());
    }
    setText(document.querySelector('#desktop .bc-sb-status-brand'),label.toUpperCase());
    const screen=document.querySelector('#desktop .bc-sb');
    if(screen)screen.setAttribute('aria-label',label+' Home Screen');
    let meta=document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(!meta){meta=document.createElement('meta');meta.setAttribute('name','apple-mobile-web-app-title');document.head.append(meta)}
    if(meta.content!==label)meta.content=label;
  }
  function init(){
    update();
    // The OS imports its device detection and renders authenticated UI
    // asynchronously. Watch only device class and newly inserted UI.
    new MutationObserver(update).observe(root,{attributes:true,attributeFilter:['class']});
    const desktop=document.getElementById('desktop');
    if(desktop)new MutationObserver(mutations=>{
      if(mutations.some(m=>Array.from(m.addedNodes).some(n=>n.nodeType===1&&(n.matches?.('.bc-exec-brand,.bc-exec-stage,.bc-sb,.bc-sb-status-brand')||n.querySelector?.('.bc-exec-brand,.bc-sb-status-brand')))))update();
    }).observe(desktop,{subtree:true,childList:true});
    window.addEventListener('pageshow',update);
    window.addEventListener('orientationchange',()=>requestAnimationFrame(update),{passive:true});
    window.addEventListener('resize',()=>requestAnimationFrame(update),{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
