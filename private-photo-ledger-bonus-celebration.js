/* BLACKCELL REDLINE: verified repeat-photo bonus status and celebration.
   All award amounts and payout status originate from the server-side ledger.
   No popup action can create, change, or settle an award. */
(()=>{
 'use strict';
 const $=(selector,root=document)=>root.querySelector(selector);
 const el=(tag,cls,content)=>{
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(content!==undefined)n.textContent=String(content);
  return n;
 };
 const api=()=>window.BLACKCELL_REDLINE_API;
 const snap=()=>api()?.snapshot?.()||null;
 const money=value=>{
  try{
   const n=BigInt(String(value??0));
   const sign=n<0n?'-':'';
   const abs=n<0n?-n:n;
   return sign+'$'+(abs/100n).toLocaleString('en-US')+'.'+String(abs%100n).padStart(2,'0');
  }catch{return '$0.00'}
 };
 const keyFor=userId=>'blackcell:redline:celebrated-repeat-bonuses-v1:'+userId;
 const memorySeen=new Map();
 function readSeen(userId){
  let ids=memorySeen.get(userId);
  if(ids)return ids;
  let raw='[]';
  try{raw=window.localStorage.getItem(keyFor(userId))||'[]'}catch{}
  try{
   const parsed=JSON.parse(raw);
   ids=new Set(Array.isArray(parsed)?parsed.filter(v=>typeof v==='string').slice(-160):[]);
  }catch{ids=new Set()}
  memorySeen.set(userId,ids);
  return ids;
 }
 function markSeen(userId,items){
  const set=readSeen(userId);
  for(const item of items)set.add(item.id);
  const stored=[...set].slice(-160);
  memorySeen.set(userId,new Set(stored));
  try{window.localStorage.setItem(keyFor(userId),JSON.stringify(stored))}catch{}
 }
 let roomId=null,signature='',busy=false,lastPoll=0,shown=null,autoClose=null;
 let popup=null,confetti=null,card=null;
 let senderLedger=null,receiverLedger=null,ledgerSignature='';
 function ensureLedger(){
  const sender=$('#redlineSimpleSender .redline-earnings-box');
  if(sender&&!senderLedger){
   senderLedger=el('section','redline-repeat-bonus-ledger');
   senderLedger.setAttribute('aria-label','Repeat-photo bonus awards and balance');
   sender.append(senderLedger);
  }
  // The receiver's real owed/paid totals already live above the chat.
  // Never add a second bonus panel inside the chat rail; it shrinks messages.
  // The small-screen receiver command also keeps a compact bonus line.
  if(!$('#redlineReceiverCommand #redlineRepeatBonusMobile')){
   const stats=$('#redlineReceiverCommand .rr-stats');
   if(stats){
    const line=el('section','redline-repeat-bonus-ledger');
    line.id='redlineRepeatBonusMobile';line.hidden=true;
    stats.after(line);
   }
  }
 }
 function actualPhoto(photoId,current=snap()){
  const row=(current?.photoHistory||[]).find(p=>p.id===photoId&&!p.removal_status);
  return row?.image_url&&
    (row.image_url.startsWith('https://')||row.image_url.startsWith('blob:'))
    ?row.image_url:'';
 }
 function makePhotoPreview(photoId,current){
  const wrap=el('div','redline-repeat-bonus-photo');
  const url=actualPhoto(photoId,current);
  if(!url){
   wrap.append(el('span','redline-repeat-bonus-no-image',
    'PHOTO LOADING'));
   return wrap;
  }
  const img=el('img');
  img.loading='lazy';img.decoding='async';
  img.alt='Private photograph for this bonus';
  img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>{
   wrap.replaceChildren(el('span','redline-repeat-bonus-no-image',
    'PHOTO UNAVAILABLE'));
  });
  img.src=url;wrap.append(img);
  return wrap;
 }
 function meter(count){
  const track=el('div','redline-repeat-bonus-meter');
  const fill=el('span');
  fill.style.setProperty('--redline-bonus-progress',
   Math.min(3,Math.max(0,Number(count)||0))/3*100+'%');
  track.append(fill);
  return track;
 }
 function drawLedger(host,status,owner,current=snap()){
  if(!host)return;
  const awarded=Array.isArray(status.bonuses)?status.bonuses:[];
  const progress=Array.isArray(status.progress)?status.progress:[];
  host.hidden=awarded.length===0&&progress.length===0;
  host.replaceChildren();
  if(host.hidden)return;
  const heading=el('div','redline-repeat-bonus-heading');
  heading.append(el('span','',owner?'BONUSES AWARDED TO SENDER':'YOUR BONUS AWARDS'),
   el('strong','redline-repeat-bonus-total',money(status.bonus_assigned_cents)));
  host.append(heading);
  host.append(el('p','redline-repeat-bonus-note',
   'Outstanding '+money(status.bonus_owed_cents)+' · Recorded paid '+
   money(status.bonus_paid_cents)+'. External payments are recorded by the receiver.'));
  for(const b of awarded.slice(0,4)){
   const row=el('div','redline-repeat-bonus-award-card');
   const details=el('div','redline-repeat-bonus-card-body');
   details.append(
    el('strong','',money(b.bonus_cents)+' BONUS AWARDED'),
    el('small','',b.settled_at?'Recorded paid':'Added to outstanding balance')
   );
   row.append(makePhotoPreview(b.photo_id,current),details);
   host.append(row);
  }
  const next=progress.filter(p=>!awarded.some(b=>b.photo_id===p.photo_id))
   .slice(0,2);
  if(next.length){
   const tracks=el('div','redline-repeat-bonus-tracks');
   for(const p of next){
    const row=el('div','redline-repeat-bonus-progress-card');
    const details=el('div','redline-repeat-bonus-card-body');
    details.append(
      el('strong','', '★ '+String(p.five_star_prices)+'/3 · Priced 5-star reviews'),
      meter(p.five_star_prices),
      el('small','', '◷ '+String(p.completed_timers)+'/3 · Finished timers'),
      meter(p.completed_timers)
    );
    row.append(makePhotoPreview(p.photo_id,current),details);
    tracks.append(row);
   }
   host.append(tracks);
  }
 }
 function renderLedgers(status,current){
  ensureLedger();
  const sig=JSON.stringify([
   current.isOwner,status.bonuses,status.progress,
   (status.progress||[]).map(p=>[p.photo_id,actualPhoto(p.photo_id,current)]),
   (status.bonuses||[]).map(b=>[b.photo_id,actualPhoto(b.photo_id,current)]),
   status.bonus_assigned_cents,status.bonus_owed_cents,status.bonus_paid_cents
  ]);
  if(sig===ledgerSignature)return;
  ledgerSignature=sig;
  drawLedger(senderLedger,status,false,current);
  const commandBonus=$('#redlineRepeatBonusMobile');
  if(commandBonus){
   if(Array.isArray(status.bonuses)&&status.bonuses.length)drawLedger(commandBonus,status,true,current);
   else commandBonus.hidden=true;
  }
 }
 function ensurePopup(){
  if(popup)return;
  popup=el('div');popup.id='redlineBonusCelebration';popup.hidden=true;
  popup.setAttribute('role','dialog');
  popup.setAttribute('aria-modal','true');
  popup.setAttribute('aria-labelledby','redlineBonusHeading');
  card=el('section','redline-bonus-celebration-card');
  const close=el('button','redline-bonus-celebration-close','×');
  close.type='button';close.setAttribute('aria-label','Dismiss bonus celebration');
  close.addEventListener('click',closePopup);
  card.append(close);popup.append(card);
  popup.addEventListener('click',event=>{if(event.target===popup)closePopup()});
  document.body.append(popup);
  confetti=el('div');confetti.id='redlineBonusConfetti';confetti.hidden=true;
  confetti.setAttribute('aria-hidden','true');document.body.append(confetti);
  document.addEventListener('keydown',event=>{
   if(!popup.hidden&&event.key==='Escape'){event.preventDefault();closePopup()}
  });
 }
 function closePopup(){
  if(autoClose){clearTimeout(autoClose);autoClose=null}
  if(popup)popup.hidden=true;
  if(confetti){confetti.hidden=true;confetti.replaceChildren()}
  shown=null;
 }
 function shower(){
  if(!confetti)return;
  confetti.replaceChildren();confetti.hidden=false;
  const palette=['#ff3057','#f692af','#ffffff','#edb95c','#b21f43','#f5d2de'];
  for(let i=0;i<58;i++){
   const piece=el('i','redline-bonus-confetti-piece');
   piece.style.setProperty('--x',(i*71%101)+'%');
   piece.style.setProperty('--w',(5+i%6)+'px');
   piece.style.setProperty('--h',(7+i%9)+'px');
   piece.style.setProperty('--c',palette[i%palette.length]);
   piece.style.setProperty('--delay',((i*17%80)/100)+'s');
   piece.style.setProperty('--d',(3+i%4*.42)+'s');
   piece.style.setProperty('--r',((i*61)%360)+'deg');
   piece.style.setProperty('--wind',((i*41%151)-75)+'px');
   confetti.append(piece);
  }
 }
 function showBonus(award,current){
  if(shown||document.hidden)return;
  ensurePopup();
  shown=award.id;
  card.replaceChildren();
  const close=el('button','redline-bonus-celebration-close','×');
  close.type='button';close.setAttribute('aria-label','Close bonus celebration');
  close.addEventListener('click',closePopup);
  card.append(close,
   el('div','redline-bonus-celebration-kicker','BLACKCELL REDLINE'),
   el('div','redline-bonus-celebration-heading',current.isOwner?
    'BONUS AWARDED!':'YOU EARNED A BONUS!'),
   el('div','redline-bonus-celebration-subtitle',
    current.isOwner?'Your sender unlocked a new repeat-photo reward.':
    'Your photograph earned a special repeat-review reward.'));
  card.querySelector('.redline-bonus-celebration-heading').id='redlineBonusHeading';
  const imageWrap=el('div','redline-bonus-celebration-image-wrap');
  const image=el('img','redline-bonus-celebration-image');
  const placeholder=el('div','redline-bonus-celebration-no-image','Private awarded photograph');
  image.alt='Original photograph that earned this bonus';
  const fillImage=()=>{
   if(shown!==award.id)return;
   const latest=snap();
   if(!latest||latest.roomId!==current.roomId)return;
   const photo=(latest.photoHistory||[]).find(p=>p.id===award.photo_id);
   const url=photo?.image_url||'';
   if(url&&(url.startsWith('https://')||url.startsWith('blob:'))){
    image.src=url;imageWrap.replaceChildren(image);
   }
  };
  image.addEventListener('error',()=>{imageWrap.replaceChildren(placeholder)});
  imageWrap.append(placeholder);
  card.append(imageWrap,
   el('div','redline-bonus-celebration-money',money(award.bonus_cents)),
   el('div','redline-bonus-celebration-to',current.isOwner?
    'AWARDED TO SENDER · ADDED TO AMOUNT OWED':
    'AWARDED TO YOU · ADDED TO YOUR BALANCE'),
   el('div','redline-bonus-celebration-math',
    '3 priced 5-star reviews + 3 completed timers · Average of all 6 values'));
  const dismiss=el('button','redline-bonus-celebration-dismiss','CONTINUE REDLINE');
  dismiss.type='button';dismiss.addEventListener('click',closePopup);
  card.append(dismiss);
  popup.hidden=false;shower();fillImage();
  // Signed Bunny thumbnails may still be resolving on a newly loaded room.
  setTimeout(fillImage,1200);
  setTimeout(fillImage,3800);
  // Celebration clears on its own so it never blocks conversation indefinitely.
  autoClose=setTimeout(closePopup,8500);
 }
 async function poll(force=false){
  const current=snap();
  if(!current||current.archiveMode||!current.roomId||!current.userId||document.hidden)return;
  const now=Date.now();
  if(busy||(!force&&now-lastPoll<5500)||!api()?.repeatBonusStatus)return;
  if(roomId!==current.roomId){
   roomId=current.roomId;signature='';ledgerSignature='';
   closePopup();lastPoll=0;
  }
  busy=true;lastPoll=now;
  try{
   const status=await api().repeatBonusStatus(current.roomId);
   const latest=snap();
   if(!latest||latest.roomId!==current.roomId||latest.archiveMode||status?.ok!==true)return;
   renderLedgers(status,latest);
   const awarded=Array.isArray(status.bonuses)?status.bonuses:[];
   const nextSignature=awarded.map(b=>b.id+':'+b.settled_at).join('|');
   if(nextSignature!==signature){
    signature=nextSignature;
    // Re-fetch authoritative total assigned/owed/paid after award creation.
    try{await api().roomPaymentStatus(current.roomId,false)}catch{}
   }
   const alreadySeen=readSeen(latest.userId);
   const unseen=awarded.filter(b=>!alreadySeen.has(b.id));
   if(unseen.length){
    markSeen(latest.userId,unseen);
    const latestAward=unseen[0];
    showBonus(latestAward,latest);
   }
  }catch(error){
   // A failed poll never creates a fake bonus or resets a verified balance.
   console.warn('REDLINE repeat bonus check:',String(error?.message||error));
  }finally{busy=false}
 }
 window.addEventListener('blackcell:redline:state',()=>{void poll()});
 window.addEventListener('blackcell:redline:reset',()=>{closePopup();roomId=null;signature='';ledgerSignature=''});
 window.addEventListener('pageshow',()=>{void poll(true)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll(true)});
 window.setInterval(()=>{void poll()},5500);
 void poll(true);
})();
