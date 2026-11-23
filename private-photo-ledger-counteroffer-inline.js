/* BLACKCELL REDLINE sender: optional inline price negotiation.
 * No modal, no auto-popup. The sender chooses COUNTEROFFER beside the
 * APPROVED PRICE. Room permissions, price finality and 3-attempt cap are
 * enforced by the existing Supabase price negotiation RPC. */
(()=>{
 'use strict';
 const make=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  return el;
 };
 const money=cents=>{
  const n=Number(cents);
  return '$'+(Number.isFinite(n)?(n/100).toFixed(2):'0.00');
 };
 function control(photo,snap){
  const wrapper=make('section','redline-inline-price-control');
  wrapper.dataset.photoId=String(photo?.id||'');
  const row=make('div','redline-inline-price-row');
  row.append(make('strong','redline-inline-price-heading',
   'APPROVED PRICE '+money(photo?.amount_cents)));
  const service=window.BLACKCELL_REDLINE_NEGOTIATION_INLINE;
  const offer=service?.offer?.(photo?.id);
  const knownStatus=service?.status?.(photo?.id);
  const sender=Boolean(snap&&!snap.isOwner&&snap.roomActive&&!snap.archiveMode
   &&!photo?.removal_status&&!photo?.settled_at&&
   !photo?.auto_timer_session_id);
  const canRespond=Boolean(sender&&offer&&
   ['awaiting_sender','awaiting_sender_owner'].includes(offer.status));
  // Eligible approved photos without any negotiation record can open their
  // first negotiation on demand. Previously agreed/finalized prices cannot.
  const canOpen=Boolean(sender&&!knownStatus&&!offer&&
   Array.isArray(snap.paymentHistory)&&snap.paymentHistory.length===0);
  const canCounter=Boolean((canRespond&&Number(offer.offer_count)<3)||canOpen);
  const counter=make('button','redline-inline-counteroffer-button','↗ COUNTEROFFER');
  counter.type='button';
  counter.disabled=!canCounter;
  counter.title=canCounter
   ?'Enter your price here. The receiver can accept or reject it.'
   :'This price is final or counteroffers are unavailable.';
  row.append(counter);
  wrapper.append(row);
  if(!canRespond&&!canOpen)return wrapper;

  const feedback=make('small','redline-inline-counteroffer-feedback');
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const editor=make('form','redline-inline-counteroffer-editor');
  editor.hidden=true;
  const input=make('input','redline-inline-counteroffer-input');
  input.type='text';input.inputMode='decimal';input.autocomplete='off';
  input.maxLength=16;input.placeholder='Propose $0.00';
  input.setAttribute('aria-label','Sender counteroffer in US dollars');
  const submit=make('button','redline-inline-counteroffer-send','SEND OFFER');
  submit.type='submit';
  const cancel=make('button','redline-inline-counteroffer-cancel','CANCEL');
  cancel.type='button';cancel.addEventListener('click',()=>{
   editor.hidden=true;input.value='';feedback.textContent='';
  });
  editor.append(input,submit,cancel);
  const actions=make('div','redline-inline-counteroffer-actions');
  async function act(action,amount){
   if(wrapper.dataset.busy==='1')return;
   wrapper.dataset.busy='1';counter.disabled=true;submit.disabled=true;
   for(const b of actions.querySelectorAll('button'))b.disabled=true;
   feedback.textContent='Submitting your response…';
   try{
    if(canOpen&&action==='counter'){
     // User-initiated: start a new negotiation ONLY if the server confirms
     // there has never been a finalized negotiation or recorded room payment.
     const api=window.BLACKCELL_REDLINE_API;
     if(!api?.priceNegotiationOpen||!api?.priceNegotiationAction)
      throw Error('Counteroffers are unavailable in this version of REDLINE.');
     await api.priceNegotiationOpen(photo.id);
     await api.priceNegotiationAction(photo.id,'counter',amount??null);
     await service?.refresh?.();
    }else await service.respond(photo.id,action,amount??null);
    editor.hidden=true;
    feedback.textContent='Response recorded for the receiver.';
    window.dispatchEvent(new Event('blackcell:redline:negotiation-changed'));
   }catch(e){
    feedback.textContent=String(e?.message||'Counteroffer unavailable.').slice(0,180);
   }finally{
    wrapper.dataset.busy='0';counter.disabled=!canCounter;submit.disabled=false;
    for(const b of actions.querySelectorAll('button'))b.disabled=false;
   }
  }
  const action=(label,kind)=>{
   const b=make('button','redline-inline-counteroffer-choice',label);
   b.type='button';b.addEventListener('click',()=>{void act(kind)});
   return b;
  };
  if(offer?.status==='awaiting_sender_owner'&&offer.owner_offer_cents!=null){
   actions.append(
    make('small','redline-inline-receiver-offer',
     'RECEIVER COUNTEROFFER '+money(offer.owner_offer_cents)),
    action('ACCEPT '+money(offer.owner_offer_cents),'accept_owner_offer'),
    action('DECLINE OFFER','reject_owner_offer')
   );
  }else if(canRespond)actions.append(action('KEEP APPROVED PRICE','accept_original'));
  if(!canCounter)counter.title='Three sender counteroffers used.';
  counter.addEventListener('click',()=>{
   editor.hidden=!editor.hidden;
   if(!editor.hidden)input.focus();
  });
  editor.addEventListener('submit',e=>{
   e.preventDefault();
   const raw=input.value.trim().replace(/[$,]/g,'');
   if(!/^\d+(?:\.\d{1,2})?$/.test(raw)){
    feedback.textContent='Enter a price such as 0.25 or 5.00.';
    return;
   }
   const [whole,fraction='']=raw.split('.');
   const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
   if(cents>BigInt(Number.MAX_SAFE_INTEGER)||
      cents===BigInt(offer?.original_cents??photo.amount_cents)){
    feedback.textContent='Enter an amount different from the approved price.';
    return;
   }
   void act('counter',Number(cents));
  });
  wrapper.append(editor,actions,feedback);
  return wrapper;
 }
 window.BLACKCELL_REDLINE_COUNTEROFFER_INLINE=Object.freeze({control});
})();
