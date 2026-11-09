/* BLACKCELL / Independent iMessage Media Share + Shared Media bubble host.
   Works outside the messenger iframe. No direct media data crosses window boundaries. */
(function(){
  'use strict';
  if(window.BlackcellMediaBubbleHost)return;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function create({mode='standalone',mainFrame=null,mainPane=null}={}){
    if(document.getElementById('bcMediaBubbleHost'))return window.BlackcellMediaBubbleHostController;
    const root=document.createElement('div');
    root.className='bc-media-bubble-host bc-bubble-host-'+mode;
    root.id='bcMediaBubbleHost';
    root.hidden=true;
    root.setAttribute('aria-label','Blackcell independent media bubbles');
    document.body.append(root);
    const panes=new Map();
    function safePeer(value){
      return typeof value==='string'&&UUID.test(value)?value:null;
    }
    function sync(){
      const count=panes.size;
      root.hidden=!count;
      root.dataset.count=String(count);
      document.body.classList.toggle('bc-has-media-bubbles',count>0);
      if(mainPane)mainPane.classList.toggle('bc-chat-split',count>0);
      root.style.setProperty('--bc-media-panels',String(count));
    }
    function close(type){
      if(!['share','library'].includes(type))return;
      const p=panes.get(type);if(!p)return;
      p.iframe.src='about:blank';
      p.card.remove();
      panes.delete(type);
      sync();
      try{mainFrame?.contentWindow?.postMessage({type:'blackcell-media-bubble-state',panel:type,open:false},location.origin)}catch(_){}
    }
    function closeAll(){for(const type of Array.from(panes.keys()))close(type)}
    function open(type,peerId,{batchId=null,pick=null}={}){
      if(!['share','library'].includes(type)||!safePeer(peerId))return;
      const batch=safePeer(batchId);
      const existing=panes.get(type);
      if(existing&&existing.peerId===peerId&&(!batch||existing.batchId===batch)){
        existing.card.classList.remove('bc-media-bubble-highlight');
        void existing.card.offsetWidth;
        existing.card.classList.add('bc-media-bubble-highlight');
        existing.card.querySelector('.bc-media-bubble-close')?.focus({preventScroll:true});
        return;
      }
      if(existing)close(type);
      const card=document.createElement('section');
      card.className='bc-media-bubble-card bc-media-bubble-'+type;
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
      const closeBtn=document.createElement('button');
      closeBtn.type='button';closeBtn.className='bc-media-bubble-close';
      closeBtn.title='Close '+title.textContent;
      closeBtn.setAttribute('aria-label','Close '+title.textContent+' bubble');
      closeBtn.textContent='✕';closeBtn.addEventListener('click',()=>close(type));
      actions.append(closeBtn);head.append(brand,actions);
      const frame=document.createElement('iframe');frame.className='bc-media-bubble-iframe';
      frame.title=title.textContent+' · Blackcell private conversation';
      frame.setAttribute('allow','clipboard-read; clipboard-write');
      frame.setAttribute('loading','eager');
      const url=new URL('corporate-chat.html',location.href);
      url.searchParams.set('embed','1');
      url.searchParams.set('mediaPanel',type);
      url.searchParams.set('peer',peerId);
      if(batch)url.searchParams.set('batch',batch);
      // No session tokens or sensitive data are put into the URL.
      frame.src=url.href;
      card.append(head,frame);
      root.append(card);
      panes.set(type,{card,iframe:frame,peerId,batchId:batch||null,pick});
      sync();
      if(type==='share'&&pick)card.dataset.pick=pick;
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
      }else if(data.type==='blackcell-media-upload-finished'){
        if(safePeer(data.peerId)){
          open('library',data.peerId,{batchId:data.batchId});
          close('share');
        }
      }else if(data.type==='blackcell-media-bubble-peer-changed'
        &&mainFrame?.contentWindow===event.source){
        closeAll();
      }
    }
    window.addEventListener('message',handleMessage);
    window.addEventListener('pagehide',closeAll);
    const api={open,close,closeAll,handles:(source)=>[...panes.values()].some(p=>p.iframe.contentWindow===source)};
    if(mode==='standalone')window.BlackcellMediaBubbleHostController=api;
    return api;
  }
  window.BlackcellMediaBubbleHost=create;
})();