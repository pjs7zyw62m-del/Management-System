/* BLACKCELL REDLINE · sender-defined trigger words, receiver-authorized.
   Setup is a deliberate sender action in Earnings / Photo History.
   Receiver switch lives in the existing owner-only REDLINE Settings.
   Server exclusively decides if a new receiver chat message earns a credit. */
(()=>{
 'use strict';
 const $=(q,root=document)=>root.querySelector(q);
 const api=()=>window.BLACKCELL_REDLINE_API;
 const snapshot=()=>api()?.snapshot?.()||null;
 const node=(tag,cls,text)=>{
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(text!==undefined)e.textContent=String(text);
  return e;
 };
 const money=value=>{
  const amount=Number(value)||0;
  return '$'+(amount/100).toFixed(2);
 };
 const senderReady=()=>{
  const s=snapshot();
  return Boolean(s?.roomId&&!s.isOwner&&!s.archiveMode&&s.roomActive);
 };
 const dialog=node('dialog','redline-trigger-dialog');
 dialog.setAttribute('aria-label','REDLINE trigger words explanation and setup');
 const heading=node('div','redline-trigger-head');
 const title=node('div');
 title.append(node('span','redline-trigger-kicker','BLACKCELL REDLINE · SENDER CONTROL'),
  node('h2','','⚡ TRIGGER WORDS'));
 const close=node('button','redline-trigger-close','✕');
 close.type='button';close.setAttribute('aria-label','Close Trigger Words');
 close.addEventListener('click',()=>dialog.close());
 heading.append(title,close);
 const intro=node('div','redline-trigger-walkthrough');
 intro.append(node('strong','','HOW IT WORKS'));
 const steps=[
  ['1','Choose a word','Add one word, 2–24 letters or digits, and set $0.10–$0.25. Up to 10 words.'],
  ['2','Receiver must enable it','Your words do nothing until the receiver reviews the prices and enables Trigger Words in REDLINE Settings.'],
  ['3','Only new receiver messages count','If the receiver SENDS a message containing your whole word, one matching word can add a credit. Your own messages cannot.'],
  ['4','Charges are capped','At most $0.25 per message and $5/day per private room. There is NO cooldown: the same word can earn again in the very next receiver message. Editing words turns the switch OFF until reapproved.']
 ];
 for(const [number,step,desc] of steps){
  const row=node('div','redline-trigger-step');
  row.append(node('span','redline-trigger-step-count',number));
  const detail=node('div');
  detail.append(node('strong','',step),node('small','',desc));row.append(detail);
  intro.append(row);
 }
 const toggleStatus=node('p','redline-trigger-enable-status');
 toggleStatus.setAttribute('role','status');
 const addForm=node('form','redline-trigger-form');
 const wordLabel=node('label','redline-trigger-field');
 wordLabel.append(node('span','','TRIGGER WORD'));
 const wordInput=node('input','redline-trigger-input');
 wordInput.type='text';wordInput.maxLength=24;
 wordInput.autocomplete='off';wordInput.autocapitalize='none';
 wordInput.spellcheck=false;
 wordInput.placeholder='e.g. excellent';
 wordInput.setAttribute('aria-label','One trigger word, 2 to 24 letters or digits');
 wordLabel.append(wordInput);
 const priceLabel=node('label','redline-trigger-field');
 priceLabel.append(node('span','','PRICE · USD'));
 const priceInput=node('input','redline-trigger-input');
 priceInput.type='number';priceInput.inputMode='decimal';
 priceInput.min='0.10';priceInput.max='0.25';priceInput.step='0.01';
 priceInput.value='0.10';
 priceInput.setAttribute('aria-label','Price from 10 cents to 25 cents per matching message');
 priceLabel.append(priceInput);
 const save=node('button','redline-trigger-save','＋ SAVE TRIGGER WORD');
 save.type='submit';
 addForm.append(wordLabel,priceLabel,save);
 const listHead=node('div','redline-trigger-list-head');
 listHead.append(node('h3','','YOUR WORDS'),node('span','redline-trigger-counter','0 / 10'));
 const list=node('div','redline-trigger-list');
 const totals=node('div','redline-trigger-totals');
 const lastHits=node('div','redline-trigger-hits');
 const feedback=node('p','redline-trigger-feedback');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const foot=node('p','redline-trigger-fineprint',
  'REDLINE records ledger amounts only. It does not transfer money or charge a card. Your receiver can turn this feature OFF at any time.');
 dialog.append(heading,intro,toggleStatus,addForm,listHead,list,
  totals,lastHits,feedback,foot);
 document.body.append(dialog);
 let status=null,room=null,lastPoll=0,busy=false,firstOpen=false;
 let lastActive=null;
 const button=label=>{
  const b=node('button','redline-trigger-open',label);b.type='button';
  b.setAttribute('aria-label','Open trigger word tutorial and price settings');
  b.addEventListener('click',()=>void open());
  return b;
 };
 const earningsButton=button('⚡ TRIGGER WORDS · SET PRICES');
 const historyButton=button('⚡ TRIGGER WORDS');
 function mount(){
  const home=$('#redlineSimpleSender');
  if(!home)return;
  const earnings=$('[data-redline-pane="earnings"]',home);
  const history=$('[data-redline-pane="history"]',home);
  if(earnings&&earningsButton.parentNode!==earnings)
   earnings.insertBefore(earningsButton,earnings.firstChild);
  if(history&&historyButton.parentNode!==history)
   history.insertBefore(historyButton,history.firstChild);
  const show=senderReady();
  earningsButton.hidden=!show;historyButton.hidden=!show;
 }
 function render(data){
  if(!data)return;
  const s=snapshot();if(!s||s.roomId!==data.room_id)return;
  status=data;
  const words=Array.isArray(data.words)?data.words:[];
  toggleStatus.textContent=data.enabled
   ?'● RECEIVER ENABLED · Qualified new messages can earn a trigger credit.'
   :'○ WAITING FOR RECEIVER · No trigger charges while disabled.';
  toggleStatus.classList.toggle('is-enabled',data.enabled===true);
  listHead.querySelector('.redline-trigger-counter').textContent=words.length+' / 10';
  list.replaceChildren();
  if(!words.length)
   list.append(node('p','redline-trigger-empty',
    'No trigger words yet. Add your first word and choose a price.'));
  for(const word of words){
   const row=node('div','redline-trigger-item');
   const name=node('strong','',word.word);
   const price=node('span','redline-trigger-price',money(word.price_cents));
   const edit=node('button','redline-trigger-small','EDIT');
   const remove=node('button','redline-trigger-small is-remove','REMOVE');
   edit.type='button';remove.type='button';
   edit.addEventListener('click',()=>{
    wordInput.value=word.word;
    priceInput.value=(Number(word.price_cents)/100).toFixed(2);
    save.textContent='UPDATE WORD';
    wordInput.focus({preventScroll:true});
   });
   remove.addEventListener('click',async()=>{
    if(busy||!senderReady()||!window.confirm(
     'Remove "'+word.word+'"? Any enabled trigger charging will switch OFF until the receiver approves the changed list.'))return;
    await persist(word.word,0,true);
   });
   row.append(name,price,edit,remove);list.append(row);
  }
  totals.replaceChildren();
  totals.append(node('strong','','RECORDED TRIGGER TOTAL · '+money(data.session_total_cents)),
   node('small','','Current session · Receiver-controlled · '+
    (data.enabled?'Active':'Not enabled')));
  lastHits.replaceChildren();
  const hits=Array.isArray(data.recent)?data.recent:[];
  if(hits.length){
   lastHits.append(node('strong','','RECENT QUALIFYING MESSAGES'));
   for(const hit of hits.slice(0,6)){
    const row=node('div','redline-trigger-hit');
    row.append(node('span','','“'+hit.word+'”'),
     node('strong','',money(hit.price_cents)));
    lastHits.append(row);
   }
  }
 }
 async function fetchStatus(force=false){
  const s=snapshot();
  if(!senderReady()||!api()?.triggerWordStatus||busy)return;
  if(!force&&Date.now()-lastPoll<11000)return;
  busy=true;const id=s.roomId;lastPoll=Date.now();
  try{
   const result=await api().triggerWordStatus(id);
   if(snapshot()?.roomId===id){room=id;render(result)}
  }catch(err){
   if(dialog.open)feedback.textContent='Unable to load: '+String(err?.message||err).slice(0,160);
  }finally{busy=false}
 }
 async function persist(word,price,remove=false){
  const s=snapshot();
  if(!senderReady()||busy||!api()?.triggerWordSave)return;
  busy=true;
  save.disabled=true;
  feedback.textContent=remove?'Removing word…':'Saving word privately…';
  try{
   const result=await api().triggerWordSave(s.roomId,word,price,remove);
   if(snapshot()?.roomId!==s.roomId)return;
   room=s.roomId;render(result);
   wordInput.value='';priceInput.value='0.10';
   save.textContent='＋ SAVE TRIGGER WORD';
   feedback.textContent=(remove?'Removed.':'Saved.')+
    ' The receiver must enable the latest word list before charges can occur.';
   window.dispatchEvent(new Event('blackcell:redline:trigger-words-changed'));
  }catch(err){feedback.textContent=String(err?.message||err).slice(0,180)}
  finally{busy=false;save.disabled=false}
 }
 addForm.addEventListener('submit',event=>{
  event.preventDefault();
  const word=wordInput.value.trim().toLowerCase();
  const amount=Number(priceInput.value),cents=Math.round(amount*100);
  if(!/^[a-z][a-z0-9]{1,23}$/.test(word)){
   feedback.textContent='Enter one word using 2–24 letters or digits, beginning with a letter.';
   return;
  }
  if(!Number.isFinite(amount)||cents<10||cents>25||
   Math.abs(amount*100-cents)>0.000001){
   feedback.textContent='Choose a price between $0.10 and $0.25, in one-cent steps.';
   return;
  }
  void persist(word,cents);
 });
 async function open(){
  if(!senderReady())return;
  mount();feedback.textContent='';
  if(!dialog.open)try{dialog.showModal()}catch(_){return}
  firstOpen=true;
  await fetchStatus(true);
 }
 function tick(){
  mount();
  const s=snapshot();
  const key=senderReady()?s.roomId:null;
  if(key!==lastActive){
   lastActive=key;room=null;status=null;lastPoll=0;firstOpen=false;
   if(dialog.open)dialog.close();
   list.replaceChildren();totals.replaceChildren();lastHits.replaceChildren();
  }
  if(key&&dialog.open)void fetchStatus();
 }
 dialog.addEventListener('close',()=>{
  wordInput.value='';priceInput.value='0.10';
  save.textContent='＋ SAVE TRIGGER WORD';
 });
 window.addEventListener('blackcell:redline:bridge',tick);
 window.addEventListener('blackcell:redline:state',tick);
 window.addEventListener('blackcell:redline:reset',tick);
 window.addEventListener('pageshow',tick);
 window.addEventListener('blackcell:redline:trigger-words-changed',()=>{
  if(dialog.open)void fetchStatus(true);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
 window.setInterval(tick,11000);
 tick();
})();
