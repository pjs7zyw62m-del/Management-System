/* BLACKCELL // Private Photo Ledger responsive OS shell.
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
  function deviceMode(){
    const agent=navigator.userAgent||'',touch=navigator.maxTouchPoints||0;
    const short=Math.min(screen.width||Infinity,screen.height||Infinity);
    const tablet=/iPad/i.test(agent)||(/Macintosh|MacIntel/i.test(agent)&&touch>1)||(/Android/i.test(agent)&&!/Mobile/i.test(agent));
    const phone=/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(agent)||(!tablet&&touch>0&&short<650);
    if(phone||innerWidth<=650)return'mobile';
    return tablet||innerWidth<1180?'tablet':'os';
  }
  const labels={os:'BLACKCELL OS',tablet:'BLACKCELL OS Tablet',mobile:'BLACKCELL OS Mobile'};
  const captions={os:'DESKTOP EDITION',tablet:'TABLET EDITION',mobile:'MOBILE EDITION'};
  let current='summary',first=true;
  const app=$('#ledgerApp'),room=$('#activeRoom'),heading=$('.page-heading',app);
  if(!app||!room||!heading)return;
  const rail=node('aside','bc-ledger-rail');
  rail.setAttribute('aria-label','Private Photo Ledger navigation');
  const railHead=node('div','bc-ledger-rail-brand');
  const emblem=node('span','bc-ledger-rail-emblem','B');
  const railTitles=node('div','bc-ledger-rail-titles');
  railTitles.append(node('strong','', 'BLACKCELL'),node('small','', 'PHOTO LEDGER'));
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
  nav.setAttribute('aria-label','Private Photo Ledger mobile sections');
  room.append(nav);
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
  function isAvailable(key){
    if(key==='summary')return true;
    if(key==='review')return isShown(room)&&isShown($('#ownerReviewQueue'));
    if(key==='upload')return isShown(room)&&isShown($('#employeeUpload'));
    if(key==='photos')return isShown(room);
    if(key==='room')return isShown(room)||isShown($('#ownerSetup'));
    return false;
  }
  function reflect(){
    const mode=deviceMode(),isMobile=mode==='mobile';
    document.body.classList.toggle('bc-ledger-mobile',isMobile);
    document.body.classList.toggle('bc-ledger-tablet',mode==='tablet');
    document.body.classList.toggle('bc-ledger-desktop',mode==='os');
    document.body.dataset.ledgerDevice=mode;
    const edition=captions[mode];
    version.textContent=edition;
    topLabel.textContent=mode==='os'?'OS':mode==='tablet'?'OS TABLET':'OS MOBILE';
    const title=labels[mode]+' · Private Photo Ledger';
    if(document.title!==title)document.title=title;
    for(const[key,pair]of buttons){
      for(const button of pair){
        button.hidden=!isAvailable(key);
        button.classList.toggle('is-current',key===current);
        if(key===current)button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      }
    }
    if(!isAvailable(current))current='summary';
    document.body.dataset.ledgerView=current;
    // The mobile tab bar is meaningful only after room access is verified.
    nav.hidden=!isShown(app)||!isShown(room)||!isMobile;
    if(first){first=false;current='summary';document.body.dataset.ledgerView=current}
  }
  function activate(key,{scroll=true}={}){
    if(!isAvailable(key))return;
    current=key;reflect();
    const mobile=document.body.classList.contains('bc-ledger-mobile');
    if(mobile){
      window.scrollTo({top:0,behavior:'instant'});
      return;
    }
    const destination=key==='room'?(isShown($('#ownerSetup'))?$('#ownerSetup'):$('.side-column')):targets[key];
    if(destination&&scroll)destination.scrollIntoView({behavior:'smooth',block:'start'});
  }
  // Owner and employee upload permissions are preserved by the original
  // ledger code; this handler only opens the Upload tab before the file picker.
  $('#uploadAccessAction')?.addEventListener('click',()=>{
    if(document.body.classList.contains('bc-ledger-mobile')&&isAvailable('upload'))activate('upload');
  },{capture:true});
  // A room assignment, room closure, or owner/employee role switch can
  // reveal/hide sections. Refresh navigation without leaking hidden panels.
  const observer=new MutationObserver(()=>requestAnimationFrame(reflect));
  for(const el of [app,room,$('#ownerReviewQueue'),$('#employeeUpload'),$('#ownerSetup')]){
    if(el)observer.observe(el,{attributes:true,attributeFilter:['hidden']});
  }
  window.addEventListener('resize',()=>requestAnimationFrame(reflect),{passive:true});
  window.addEventListener('orientationchange',()=>requestAnimationFrame(reflect),{passive:true});
  window.addEventListener('pageshow',reflect);
  reflect();
})();