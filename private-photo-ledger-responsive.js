/* BLACKCELL // REDLINE responsive OS shell.
 * Visual navigation only: existing corporate auth, photo submissions, review
 * decisions, settlement records, and private-room access stay authoritative.
 */
(()=>{
  'use strict';
  const $=(q,root=document)=>root.querySelector(q);
  const isShown=(el)=>Boolean(el&&!el.hidden);
  const node=(tag,className,text)=>{
    const el=document.createElement(tag);if(className)el.className=className;
    if(text!==undefined)el.textContent=text;return el;
  };
  const shapes={
    summary:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    review:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 17v4h16v-4"/>',
    photos:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
    room:'<path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M2 21h20"/><path d="M11 9h2"/>'
  };
  const svg=(type)=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+shapes[type]+'</svg>';
  // REDLINE is often displayed inside the maximized BLACKCELL OS iframe.
  // Its own innerWidth can be under 1180px even on a desktop monitor. Use
  // the verified same-origin OS host dimensions to select the desktop deck
  // without misclassifying standalone tablets or phones.
  function desktopOsFrame(){
    try{
      const frame=window.frameElement;
      if(frame?.id!=='bcOsPhotoLedgerFrame')return false;
      const host=window.parent;
      const agent=navigator.userAgent||'',touch=navigator.maxTouchPoints||0;
      const tablet=/iPad/i.test(agent)||(/Macintosh|MacIntel/i.test(agent)&&touch>1)||(/Android/i.test(agent)&&!/Mobile/i.test(agent));
      const phone=/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(agent);
      return !phone&&!tablet&&host?.innerWidth>=1180&&window.innerWidth>=720;
    }catch(_){return false}
  }
  // Platform comes from the current browser, never the account's usual device.
  function nativePlatform(){
    const ua=navigator.userAgent||'',touch=navigator.maxTouchPoints||0;
    const preview=location.href==='about:srcdoc'&&window.REDLINE_DEV_CONFIG;
    if(preview?.preset==='neon-smarta-2')return 'android';
    if(/iPhone|iPod|iPad/i.test(ua)||(/Macintosh|MacIntel/i.test(ua)&&touch>1))return 'apple';
    if(/Android/i.test(ua)||navigator.userAgentData?.platform==='Android')return 'android';
    if(/Macintosh|Mac OS X/i.test(ua))return 'apple';
    return 'standard';
  }
  function nativeDeviceMode(){
    const preview=location.href==='about:srcdoc'&&window.REDLINE_DEV_CONFIG?.device;
    if(preview==='mobile'||preview==='tablet')return preview;
    if(preview==='desktop')return'os';
    const agent=navigator.userAgent||'',touch=navigator.maxTouchPoints||0;
    const short=Math.min(screen.width||Infinity,screen.height||Infinity);
    const tablet=/iPad/i.test(agent)||(/Macintosh|MacIntel/i.test(agent)&&touch>1)||(/Android/i.test(agent)&&!/Mobile/i.test(agent));
    const phone=/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(agent)||(!tablet&&touch>0&&short<650);
    if(phone||innerWidth<=650)return'mobile';
    return tablet||innerWidth<1180?'tablet':'os';
  }
  // Desktop receiver parity is presentation-only. Use the existing verified
  // role snapshot; never change account permissions or the sender layout.
  // Preview keeps its own isolated device selection.
  function receiverDesktopParity(native){
    if(location.href==='about:srcdoc')return false;
    if(native==='mobile')return false;
    const receiver=window.BLACKCELL_REDLINE_API?.snapshot?.({light:true})?.isOwner===true;
    return receiver&&(native==='os'||native==='tablet'||desktopOsFrame());
  }
  function deviceMode(){
    const native=nativeDeviceMode();
    return receiverDesktopParity(native)?'mobile':native;
  }
  const labels={os:'BLACKCELL REDLINE',tablet:'BLACKCELL REDLINE',mobile:'BLACKCELL REDLINE'};
  const captions={os:'PRIVATE EXCHANGE',tablet:'PRIVATE EXCHANGE',mobile:'PRIVATE EXCHANGE'};
  let current='summary';
  const app=$('#ledgerApp'),room=$('#activeRoom'),heading=$('.page-heading',app);
  if(!app||!room||!heading)return;
  const rail=node('aside','bc-ledger-rail');
  rail.setAttribute('aria-label','BLACKCELL REDLINE navigation');
  const railHead=node('div','bc-ledger-rail-brand');
  const emblem=node('span','bc-ledger-rail-emblem','B');
  const railTitles=node('div','bc-ledger-rail-titles');
  railTitles.append(node('strong','', 'BLACKCELL'),node('small','', 'REDLINE'));
  railHead.append(emblem,railTitles);
  const railCaption=node('div','bc-ledger-rail-caption','PRIVATE WORKSPACE');
  const railItems=node('nav','bc-ledger-rail-items');
  const railFooter=node('div','bc-ledger-rail-footer','RESTRICTED · TWO-PERSON ACCESS');
  rail.append(railHead,railCaption,railItems,railFooter);
  app.insertBefore(rail,heading);
  const version=node('span','bc-ledger-edition');
  const headingEyebrow=heading.querySelector('.eyebrow');
  if(headingEyebrow)headingEyebrow.after(version);
  const topLabel=node('span','bc-ledger-top-edition');
  const brandLabels=$('#ledgerBrand .brand-label');
  if(brandLabels)brandLabels.append(topLabel);
  const nav=node('nav','bc-ledger-phone-nav');
  nav.setAttribute('aria-label','BLACKCELL REDLINE mobile sections');
  room.append(nav);
  // A visible, lightweight section heading keeps the selected action
  // understandable even when the owner/employee sees different permissions.
  const sectionHeading=node('h2','bc-ledger-mobile-view-heading','Overview');
  sectionHeading.id='ledgerMobileViewHeading';
  sectionHeading.tabIndex=-1;
  room.insertBefore(sectionHeading,room.querySelector('.room-toolbar'));
  nav.setAttribute('aria-label','BLACKCELL REDLINE mobile sections');
  const buttons=new Map();
  const ids=[
    ['summary','Summary'],
    ['review','Review'],
    ['upload','Upload'],
    ['photos','Photos'],
    ['room','Room']
  ];
  function makeButton(key,label,klass){
    const b=node('button',klass);
    b.type='button';b.dataset.ledgerNavigate=key;
    b.innerHTML=svg(key);
    b.append(node('span','',label));
    b.addEventListener('click',()=>activate(key,{scroll:true}));
    return b;
  }
  for(const [key,label]of ids){
    const railButton=makeButton(key,label,'bc-ledger-rail-button');
    const mobileButton=makeButton(key,label,'bc-ledger-phone-tab');
    railItems.append(railButton);nav.append(mobileButton);
    buttons.set(key,[railButton,mobileButton]);
  }
  const summaryAnchor=$('#activeRoom .metrics')||room;
  const targets={
    summary:summaryAnchor,
    review:$('#ownerReviewQueue'),
    upload:$('#employeeUpload'),
    photos:$('#photoEntries'),
    room:$('#ownerSetup')||$('.side-column')
  };
  const sectionNames={
    summary:'Overview',review:'Review Pending Photos',upload:'Upload a Photo',
    photos:'Photo History',room:'Private Room'
  };
  function isAvailable(key){
    if(key==='summary')return true;
    if(key==='review')return isShown(room)&&isShown($('#ownerReviewQueue'));
    if(key==='upload')return isShown(room)&&isShown($('#employeeUpload'));
    if(key==='photos')return isShown(room);
    if(key==='room')return isShown(room)||isShown($('#ownerSetup'));
    return false;
  }
  function reflect(){
    const mode=deviceMode(),isMobile=mode==='mobile',previous=document.body.dataset.ledgerDevice;
    document.body.classList.toggle('bc-ledger-mobile',isMobile);
    document.body.classList.toggle('bc-ledger-tablet',mode==='tablet');
    document.body.classList.toggle('bc-ledger-desktop',mode==='os');
    document.body.classList.toggle('bc-os-frame-redline',desktopOsFrame()&&!receiverDesktopParity(nativeDeviceMode()));
    document.body.dataset.ledgerDevice=mode;
    const platform=nativePlatform();
    if(document.body.dataset.ledgerPlatform!==platform)document.body.dataset.ledgerPlatform=platform;
    if(!isAvailable(current))current='summary';
    const edition=captions[mode];
    sectionHeading.textContent=sectionNames[current]||'Overview';
    version.textContent=edition;
    topLabel.textContent='REDLINE';
    const title=labels[mode]+' · PRIVATE EXCHANGE';
    if(document.title!==title)document.title=title;
    for(const[key,pair]of buttons){
      for(const button of pair){
        button.hidden=!isAvailable(key);
        button.classList.toggle('is-current',key===current);
        if(key===current)button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      }
    }
    document.body.dataset.ledgerView=current;
    // The mobile tab bar is meaningful only after room access is verified.
    nav.hidden=!isShown(app)||!isShown(room)||!isMobile;
    nav.style.setProperty('--ledger-visible-tabs',String([...buttons.keys()].filter(isAvailable).length));
    if(previous!==mode)window.dispatchEvent(new CustomEvent('blackcell:redline:device-mode',{detail:{mode}}));
  }
  function activate(key,{scroll=true}={}){
    if(!isAvailable(key))return;
    if((location.href!=='about:srcdoc'||window.REDLINE_DEV_CONFIG?.role==='receiver')&&window.BLACKCELL_REDLINE_API?.snapshot?.({light:true})?.isOwner===true){
      current='summary';reflect();
      if(key!=='summary')window.dispatchEvent(new CustomEvent('blackcell:redline:popup-section',{detail:{key}}));
      return;
    }
    current=key;reflect();
    const mobile=document.body.classList.contains('bc-ledger-mobile');
    // Sender first opens the authorized submission header on a phone.
    const senderHero=$('#redlineSenderHero');
    const destination=mobile?(
      key==='summary'?(document.body.classList.contains('bc-redline-receiver')?$('#redlineReceiverCommand'):($('.room-toolbar',room)||summaryAnchor)):
      key==='upload'&&senderHero&&!senderHero.hidden?senderHero:
      key==='room'?($('.room-toolbar',room)||$('.side-column',room)):
      key==='photos'?($('#photoEntries')||$('.timeline-toolbar',room)):targets[key]
    ):(key==='room'?(isShown($('#ownerSetup'))?$('#ownerSetup'):$('.side-column')):targets[key]);
    if(destination&&scroll){
      requestAnimationFrame(()=>{
        if(!isShown(app)||!isShown(room)||!isAvailable(key))return;
        destination.scrollIntoView({behavior:mobile?'auto':'smooth',block:'start'});
      });
    }
  }
  // Owner and employee upload permissions are preserved by the original
  // ledger code; this handler only opens the Upload tab before the file picker.
  $('#uploadAccessAction')?.addEventListener('click',()=>{
    if(document.body.classList.contains('bc-ledger-mobile')&&isAvailable('upload'))activate('upload');
  },{capture:true});
  // The owner review queue's "View Reviewed Photos" control is rendered
  // dynamically by the real ledger. On phones switch to the Photos view
  // first; otherwise the original click moves to history while CSS hides it.
  $('#ownerReviewQueue')?.addEventListener('click',(event)=>{
    if(!document.body.classList.contains('bc-ledger-mobile'))return;
    const btn=event.target.closest?.('button');
    if(!btn||!btn.textContent?.trim().toUpperCase().includes('VIEW REVIEWED PHOTOS'))return;
    if(isAvailable('photos'))activate('photos');
  },true);
  // Do not let a fixed navigation bar overlap the on-screen keyboard, photo
  // caption input, payment amount, or select controls on mobile Safari.
  app.addEventListener('focusin',(event)=>{
    if(event.target.matches?.('input:not([type=button]),textarea,select,[contenteditable=true]')){
      document.body.classList.add('bc-ledger-keyboard-active');
    }
  });
  app.addEventListener('focusout',()=>{
    requestAnimationFrame(()=>{
      if(!app.contains(document.activeElement)||!document.activeElement.matches?.('input:not([type=button]),textarea,select,[contenteditable=true]')){
        document.body.classList.remove('bc-ledger-keyboard-active');
      }
    });
  });
  // A room assignment, room closure, or owner/employee role switch can
  // reveal/hide sections. Refresh navigation without leaking hidden panels.
  const observer=new MutationObserver(()=>requestAnimationFrame(reflect));
  for(const el of [app,room,$('#ownerReviewQueue'),$('#employeeUpload'),$('#ownerSetup')]){
    if(el)observer.observe(el,{attributes:true,attributeFilter:['hidden']});
  }
  window.addEventListener('resize',()=>requestAnimationFrame(reflect),{passive:true});
  window.addEventListener('orientationchange',()=>requestAnimationFrame(reflect),{passive:true});
  window.addEventListener('pageshow',reflect);
  // The authenticated role arrives asynchronously after the initial layout.
  // Recompute only when its effective device mode changes, not on each chat update.
  const refreshRoleLayout=()=>{
    if(document.body.dataset.ledgerDevice!==deviceMode())requestAnimationFrame(reflect);
  };
  window.addEventListener('blackcell:redline:bridge',refreshRoleLayout);
  window.addEventListener('blackcell:redline:state',refreshRoleLayout);
  if(location.href==='about:srcdoc'&&window.REDLINE_DEV_CONFIG)window.addEventListener('blackcell:redline:preview-device',reflect);
  reflect();
})();