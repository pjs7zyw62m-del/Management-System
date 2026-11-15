/* BLACKCELL / Independent iMessage Media Share + Shared Media bubble host.
   Works outside the messenger iframe. No direct media data crosses window boundaries. */
(function(){
  'use strict';
  if(window.BlackcellMediaBubbleHost)return;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const canUseMedia=()=>window.BlackcellChatMedia?.enabled()===true;
  function create({mode='standalone',mainFrame=null,mainPane=null}={}){
    if(document.getElementById('bcMediaBubbleHost'))return window.BlackcellMediaBubbleHostController;
    const root=document.createElement('div');
    root.className='bc-media-bubble-host bc-bubble-host-'+mode;
    root.id='bcMediaBubbleHost';
    root.hidden=true;
    root.setAttribute('aria-label','Blackcell independent media bubbles');
    document.body.append(root);
    const tabs=document.createElement('div');
    tabs.className='bc-media-bubble-tabs';
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','Switch between media bubbles');
    const track=document.createElement('div');
    track.className='bc-media-bubble-track';
    root.append(tabs,track);
    // iPhone Safari can sometimes lay out a page using a desktop-sized
    // CSS viewport. Detect the physical touchscreen, not viewport width alone.
    function syncPhysicalScreen(){
      const sw=window.screen?.width||Infinity,sh=window.screen?.height||Infinity;
      const shortest=Math.min(sw,sh);
      const touch=navigator.maxTouchPoints>0||window.matchMedia('(pointer:coarse)').matches;
      const iphone=/iPhone|iPod/i.test(navigator.userAgent||'');
      const narrowTouch=iphone||(shortest<=699&&touch);
      // Respect the physical phone orientation when Safari requests a
      // desktop layout viewport wider than the actual screen.
      const portrait=narrowTouch&&sw!==Infinity?sh>=sw:
       window.matchMedia('(orientation:portrait)').matches;
      document.body.classList.toggle('bc-handset-portrait',narrowTouch&&portrait);
      document.body.classList.toggle('bc-handset-landscape',narrowTouch&&!portrait);
    }
    syncPhysicalScreen();
    window.addEventListener('resize',syncPhysicalScreen,{passive:true});
    window.addEventListener('orientationchange',syncPhysicalScreen,{passive:true});
    const panes=new Map();
    let flipping=false;
    function updateBubbleTabs(){
      tabs.replaceChildren();
      const both=panes.size===2;
      tabs.hidden=!both;
      if(!both)return;
      for(const [type,entry] of panes){
        const button=document.createElement('button');
        button.type='button';
        button.textContent=type==='share'?'＋ Media Share':'▧ Shared Media';
        button.dataset.panel=type;
        button.setAttribute('role','tab');
        button.setAttribute('aria-controls',entry.card.id);
        button.addEventListener('click',()=>{
          const x=entry.card.offsetLeft;
          track.scrollTo({left:x,behavior:'smooth'});
          for(const tab of tabs.querySelectorAll('button')){
            const selected=tab.dataset.panel===type;
            tab.classList.toggle('selected',selected);
            tab.setAttribute('aria-selected',String(selected));
          }
        });
        tabs.append(button);
      }
      updateSelectedTab();
    }
    function updateSelectedTab(){
      if(panes.size!==2)return;
      let nearest=null,distance=Infinity;
      for(const [type,entry] of panes){
        const next=Math.abs(track.scrollLeft-entry.card.offsetLeft);
        if(next<distance){nearest=type;distance=next}
      }
      for(const tab of tabs.querySelectorAll('button')){
        const selected=tab.dataset.panel===nearest;
        tab.classList.toggle('selected',selected);
        tab.setAttribute('aria-selected',String(selected));
      }
    }
    track.addEventListener('scroll',updateSelectedTab,{passive:true});
    function safePeer(value){
      return typeof value==='string'&&UUID.test(value)?value:null;
    }
    function sync(){
      const count=panes.size;
      root.hidden=!count;
      root.dataset.count=String(count);
      document.body.classList.toggle('bc-has-media-bubbles',count>0);
      if(mainPane){
       mainPane.classList.toggle('bc-chat-split',count>0);
       // Keep the messenger anchored on the right while media bubbles are open.
       if(count>0){
        mainPane.style.left='';
        mainPane.style.top='';
        mainPane.style.right='';
        mainPane.style.bottom='';
       }
      }
      root.style.setProperty('--bc-media-panels',String(count));
      updateBubbleTabs();
    }
    function close(type){
      if(!['share','library'].includes(type))return;
      const p=panes.get(type);if(!p)return;
      p.iframe.src='about:blank';
      p.card.remove();
      panes.delete(type);
      if(type==='library')document.body.classList.remove('bc-media-spotlight');
      sync();
      try{mainFrame?.contentWindow?.postMessage({type:'blackcell-media-bubble-state',panel:type,open:false},location.origin)}catch(_){}
    }
    function closeAll(){for(const type of Array.from(panes.keys()))close(type)}
    function open(type,peerId,{batchId=null,pick=null}={}){
      if(!canUseMedia())return;
      if(!['share','library'].includes(type)||!safePeer(peerId))return;
      const batch=safePeer(batchId);
      const existing=panes.get(type);
      if(existing&&existing.peerId===peerId&&existing.batchId===(batch||null)){
        existing.card.classList.remove('bc-media-bubble-highlight');
        void existing.card.offsetWidth;
        existing.card.classList.add('bc-media-bubble-highlight');
        existing.card.querySelector('.bc-media-bubble-close')?.focus({preventScroll:true});
        return;
      }
      if(existing)close(type);
      const card=document.createElement('section');
      card.className='bc-media-bubble-card bc-media-bubble-'+type;
      card.id='bc-media-panel-'+type;
      card.setAttribute('role','region');
      card.setAttribute('aria-label',type==='share'?'Media Share bubble':'Shared Media bubble');
      const head=document.createElement('header');head.className='bc-media-bubble-heading';
      const brand=document.createElement('div');brand.className='bc-media-bubble-name';
      const insignia=document.createElement('span');insignia.className='bc-media-bubble-icon';
      insignia.textContent=type==='share'?'＋':'▧';
      const words=document.createElement('span');
      const title=document.createElement('strong');
      title.textContent=type==='share'?'MEDIA SHARE':'SHARED MEDIA';
      const subtitle=document.createElement('small');
      subtitle.textContent=type==='share'?'PREPARE & SEND · PRIVATE':'BROWSE & VIEW · PRIVATE';
      words.append(title,subtitle);brand.append(insignia,words);
      const actions=document.createElement('div');actions.className='bc-media-bubble-heading-actions';
      const flipBtn=document.createElement('button');
      flipBtn.type='button';
      flipBtn.className='bc-media-bubble-flip';
      flipBtn.textContent='↻';
      flipBtn.title=type==='share'?'Flip to Shared Media':'Flip to Media Share';
      flipBtn.setAttribute('aria-label',flipBtn.title);
      flipBtn.addEventListener('click',()=>flip(type==='share'?'library':'share',peerId));
      const closeBtn=document.createElement('button');
      closeBtn.type='button';closeBtn.className='bc-media-bubble-close';
      closeBtn.title='Close '+title.textContent;
      closeBtn.setAttribute('aria-label','Close '+title.textContent+' bubble');
      closeBtn.textContent='✕';closeBtn.addEventListener('click',()=>close(type));
      actions.append(flipBtn,closeBtn);head.append(brand,actions);
      const frame=document.createElement('iframe');frame.className='bc-media-bubble-iframe';
      frame.title=title.textContent+' · Blackcell private conversation';
      frame.setAttribute('allow','clipboard-read; clipboard-write');
      frame.setAttribute('loading','eager');
      const url=new URL('corporate-chat.html',location.href);
      // A new iframe URL makes Safari reload the latest responsive media CSS.
      url.searchParams.set('ui','adaptive-media-20261109-v3');
      url.searchParams.set('embed','1');
      url.searchParams.set('mediaPanel',type);
      url.searchParams.set('peer',peerId);
      if(batch)url.searchParams.set('batch',batch);
      // No session tokens or sensitive data are put into the URL.
      frame.src=url.href;
      card.append(head,frame);
      track.append(card);
      panes.set(type,{card,iframe:frame,peerId,batchId:batch||null,pick});
      sync();
      if(type==='share'&&pick)card.dataset.pick=pick;
      // On phone portrait, newly opened media is shown as a separate swipeable
      // card below the pinned messenger, with accessible Share/Library tabs.
      if(window.matchMedia('(max-width:699px) and (orientation:portrait)').matches){
        requestAnimationFrame(()=>{
          track.scrollTo({left:card.offsetLeft,behavior:'smooth'});
          updateSelectedTab();
        });
      }
    }
    function flip(type,peerId,{batchId=null,force=false}={}){
      if(!canUseMedia())return;
      if(!['share','library'].includes(type)||!safePeer(peerId)||flipping)return;
      const from=type==='library'?'share':'library';
      const previous=panes.get(from);
      if(!previous||previous.peerId!==peerId){
        open(type,peerId,{batchId});
        return;
      }
      if(previous.uploading&&!force)return;
      flipping=true;
      const oldCard=previous.card;
      oldCard.classList.add('bc-media-card-turn-out');
      // Perform the switch at the edge of the 3D rotation.
      window.setTimeout(()=>{
        close(from);
        open(type,peerId,{batchId});
        const next=panes.get(type);
        if(next){
          next.card.classList.add('bc-media-card-turn-in');
          window.setTimeout(()=>next.card.classList.remove('bc-media-card-turn-in'),340);
        }
        flipping=false;
      },210);
    }
    function allowedSource(event){
      if(event.origin!==location.origin)return false;
      if(mainFrame?.contentWindow===event.source)return true;
      return [...panes.values()].some(p=>p.iframe.contentWindow===event.source);
    }
    function handleMessage(event){
      if(!allowedSource(event))return;
      const data=event.data||{};
      if(data.type==='blackcell-media-bubble-open'){
        open(data.panel,data.peerId,{batchId:data.batchId,pick:data.pick});
      }else if(data.type==='blackcell-media-bubble-close'){
        close(data.panel);
      }else if(data.type==='blackcell-media-focus-state'){
        const library=panes.get('library');
        if(library&&library.iframe.contentWindow===event.source&&library.peerId===data.peerId)
          document.body.classList.toggle('bc-media-spotlight',data.focused===true);
      }else if(data.type==='blackcell-media-upload-state'){
        const share=panes.get('share');
        if(share&&share.iframe.contentWindow===event.source&&share.peerId===data.peerId){
          share.uploading=data.uploading===true;
          const b=share.card.querySelector('.bc-media-bubble-flip');
          if(b)b.disabled=share.uploading;
        }
      }else if(data.type==='blackcell-media-bubble-flip'){
        const sender=[...panes.values()].find(p=>p.iframe.contentWindow===event.source);
        if(sender&&sender.peerId===data.peerId)flip(data.panel,data.peerId);
        else if(mainFrame?.contentWindow===event.source)open(data.panel,data.peerId);
      }else if(data.type==='blackcell-media-upload-finished'){
        const share=panes.get('share');
        if(safePeer(data.peerId)&&share&&share.peerId===data.peerId
          &&share.iframe.contentWindow===event.source){
          flip('library',data.peerId,{batchId:data.batchId,force:true});
        }
      }else if(data.type==='blackcell-media-bubble-peer-changed'
        &&mainFrame?.contentWindow===event.source){
        closeAll();
      }
    }
    window.addEventListener('message',handleMessage);
    window.addEventListener('pagehide',closeAll);
    window.addEventListener('blackcell-chat-media-capability-change',e=>{if(!e.detail?.enabled)closeAll()});
    const api={open,flip,close,closeAll,handles:(source)=>[...panes.values()].some(p=>p.iframe.contentWindow===source)};
    if(mode==='standalone')window.BlackcellMediaBubbleHostController=api;
    return api;
  }
  window.BlackcellMediaBubbleHost=create;
})();