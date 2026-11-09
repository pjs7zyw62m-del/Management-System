'use strict';
(()=>{
  const client=window.BLACKCELL_CORPORATE_ADMIN_API?.client||window.BLACKCELL_CORPORATE_NETWORK_CLIENT;
  if(!client || document.getElementById('bcChatDock')) return;
  const make=(tag,cls,content)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(content!==undefined)n.textContent=content;
    return n;
  };
  const dock=make('nav','bc-chat-dock');
  dock.id='bcChatDock';
  dock.setAttribute('aria-label','Blackcell corporate communications');
  const people=make('button','','◉ BUDDY LIST');
  people.type='button';
  const imessage=make('button','bc-active-chat','● iMESSAGE');
  imessage.type='button';
  const email=make('button','','✉ BLACKCELL EMAIL');
  email.type='button';email.disabled=true;email.title='Corporate email is not connected yet';
  dock.append(people,imessage,email);
  const orb=make('button','bc-chat-orb');
  orb.type='button';orb.setAttribute('aria-label','Open minimized iMessage chat');
  const icon=make('span','bc-orb-chat-icon');
  icon.setAttribute('aria-hidden','true');
  icon.append(make('span','bc-orb-chat-dots','•••'));
  orb.append(icon);
  const dot=make('span','bc-online');
  const counter=make('span','bc-unread');counter.hidden=true;
  orb.append(dot,counter);
  const pane=make('section','bc-chat-pane');
  pane.setAttribute('role','dialog');pane.setAttribute('aria-label','Blackcell floating iMessage');
  pane.id='bcChatPane';
  pane.hidden=true;
  const header=make('div','bc-chat-pane-header');
  const label=make('div','bc-chat-pane-label');
  const labelIcon=make('span','bc-chat-header-bubble','•••');
  labelIcon.setAttribute('aria-hidden','true');
  const labelContent=make('span','bc-chat-header-label');
  labelContent.append(make('strong','','BLACKCELL / iMESSAGE'),make('small','','PRIVATE CORPORATE COMMUNICATIONS'));
  label.append(labelIcon,labelContent);
  const controls=make('div','bc-chat-pane-controls');
  function button(title,label,klass,fn){
    const b=make('button',klass,label);
    b.type='button';b.title=title;b.setAttribute('aria-label',title);
    b.addEventListener('click',fn);return b;
  }
  const pop=button('Open chat in a separate window','↗','',()=>{
    const link=new URL('corporate-chat.html',location.href).href;
    const win=window.open(link,'blackcell-private-imessage','width=490,height=750,resizable=yes,scrollbars=no');
    if(win){win.focus();minimize();}else{
      toastMessage('Pop-out blocked','Allow pop-ups, or use the floating chat window.',null);
    }
  });
  const minimizeBtn=button('Minimize iMessage','−','',()=>minimize());
  const closeBtn=button('Close iMessage','×','bc-chat-close',()=>closeChat());
  controls.append(pop,minimizeBtn,closeBtn);
  header.append(label,controls);
  const frame=make('iframe','bc-chat-pane-iframe');
  frame.title='Blackcell private messages, photos, videos, and shared media';
  frame.setAttribute('allow','clipboard-read; clipboard-write');
  const footer=make('div','bc-chat-pane-footer');
  footer.append(make('span','','BLACKCELL COMMUNICATIONS'),make('span','','PRIVATE · AUTHORIZED'));
  pane.append(header,frame,footer);
  const toast=make('button','bc-chat-toast');
  toast.type='button';toast.hidden=true;
  toast.setAttribute('aria-label','New private iMessage notification');
  document.body.append(dock,orb,pane,toast);
  const mediaBubbles=window.BlackcellMediaBubbleHost?.({mode:'dock',mainFrame:frame,mainPane:pane});
  let state='minimized',unread=0,peerWanted=null;
  let peers=new Map(),toastQueue=[],toastTimer=null,toastOpen=false;
  let frameLoaded=false;
  function setUnread(number){
    unread=Math.max(0,number);
    counter.hidden=unread===0;counter.textContent=unread>99?'99+':String(unread);
    orb.setAttribute('aria-label','Open minimized iMessage chat'+(unread?' ('+unread+' unread)':''));
    imessage.textContent='● iMESSAGE'+(unread?' ('+unread+')':'');
    orb.classList.toggle('has-unread',unread>0);
    imessage.classList.toggle('has-unread',unread>0);
  }
  function bootFrame(){
    if(frameLoaded)return;
    const url=new URL('corporate-chat.html',location.href);
    url.searchParams.set('embed','1');
    if(peerWanted)url.searchParams.set('peer',peerWanted);
    frame.src=url.href;
    frameLoaded=true;
    frame.addEventListener('load',()=>{
      if(peerWanted)selectInFrame(peerWanted);
    });
  }
  function selectInFrame(peerId){
    if(!peerId)return;
    peerWanted=peerId;
    try{frame.contentWindow?.postMessage({type:'blackcell-select-peer',peerId},location.origin);}catch(_){}
  }
  function openChat(peerId){
    if(peerId)peerWanted=peerId;
    state='open';pane.hidden=false;orb.hidden=true;
    bootFrame();
    if(peerId)selectInFrame(peerId);
    setUnread(0);
  }
  function minimize(){
    state='minimized';pane.hidden=true;orb.hidden=false;
  }
  function closeChat(){
    state='closed';pane.hidden=true;orb.hidden=true;
    frame.removeAttribute('src');frameLoaded=false;
  }
  orb.addEventListener('click',()=>openChat());
  people.addEventListener('click',()=>openChat());
  imessage.addEventListener('click',()=>openChat());
  window.addEventListener('blackcell-open-imessage',ev=>openChat(ev?.detail?.peerId||undefined));
  toast.addEventListener('click',()=>{
    const target=toast.dataset.peerId||undefined;
    closeToast();openChat(target);
  });
  function closeToast(){
    clearTimeout(toastTimer);toast.classList.remove('show');
    setTimeout(()=>{
      toast.hidden=true;toastOpen=false;showNextToast();
    },360);
  }
  function showNextToast(){
    if(toastOpen||!toastQueue.length)return;
    toastOpen=true;
    const msg=toastQueue.shift();
    toast.dataset.peerId=msg.id||'';
    toast.replaceChildren(make('strong','','BLACKCELL / NEW iMESSAGE'),
      make('span','',msg.title),make('small','','Click to open your private conversation'));
    toast.hidden=false;
    requestAnimationFrame(()=>toast.classList.add('show'));
    toastTimer=setTimeout(closeToast,4300);
  }
  function toastMessage(title,subtitle,peerId){
    toastQueue.push({title:subtitle?title+' · '+subtitle:title,id:peerId});
    showNextToast();
  }
  const clamp=(n,min,max)=>Math.min(Math.max(n,min),max);
  let drag=null;
  header.addEventListener('pointerdown',ev=>{
    if(ev.target.closest('button')||window.innerWidth<=620)return;
    ev.preventDefault();
    const r=pane.getBoundingClientRect();
    pane.style.left=r.left+'px';pane.style.top=r.top+'px';
    pane.style.bottom='auto';pane.style.right='auto';
    drag={x:ev.clientX,y:ev.clientY,left:r.left,top:r.top};
    try{header.setPointerCapture(ev.pointerId)}catch(_){}
  });
  header.addEventListener('pointermove',ev=>{
    if(!drag)return;
    const x=clamp(drag.left+ev.clientX-drag.x,5,Math.max(5,innerWidth-pane.offsetWidth-5));
    const y=clamp(drag.top+ev.clientY-drag.y,5,Math.max(5,innerHeight-pane.offsetHeight-5));
    pane.style.left=x+'px';pane.style.top=y+'px';
  });
  const endDrag=()=>{drag=null};
  header.addEventListener('pointerup',endDrag);
  header.addEventListener('pointercancel',endDrag);
  window.addEventListener('resize',()=>{
    if(!pane.style.top||window.innerWidth<=620)return;
    pane.style.left=clamp(parseFloat(pane.style.left)||5,5,Math.max(5,innerWidth-pane.offsetWidth-5))+'px';
    pane.style.top=clamp(parseFloat(pane.style.top)||5,5,Math.max(5,innerHeight-pane.offsetHeight-5))+'px';
  });
  void client.rpc('corp_chat_peers').then(({data,error})=>{
    if(!error&&data?.ok===true&&Array.isArray(data.peers))
      peers=new Map(data.peers.map(p=>[p.user_id,p.display_name||'Employee']));
  }).catch(()=>{});
  void client.auth.getUser().then(({data})=>{
    const self=data?.user?.id;
    if(!self)return;
    client.channel('blackcell-admin-imessage-'+self)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'corp_chat_messages'},payload=>{
        const item=payload.new||{};
        if(item.recipient_id!==self||item.sender_id===self)return;
        if(state!=='open'||document.hidden)setUnread(unread+1);
        toastMessage('New message from '+(peers.get(item.sender_id)||'an employee'),'',item.sender_id);
      }).subscribe();
  }).catch(()=>{});
  // Initially minimized. The owner can work in Administration and open the
  // same authenticated live messaging UI in a floating or separate window.
  minimize();
})();
