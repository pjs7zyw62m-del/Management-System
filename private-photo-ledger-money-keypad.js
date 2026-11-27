/* BLACKCELL REDLINE touch amount keypad. No transaction is submitted here. */
(()=>{
 'use strict';
 const agent=navigator.userAgent||'',touch=navigator.maxTouchPoints||0;
 if(!(/iPhone|iPad|iPod|Android|Windows Phone/i.test(agent)||(/Macintosh|MacIntel/i.test(agent)&&touch>1)||(touch>0&&matchMedia('(pointer:coarse)').matches)))return;
 const selector='input[inputmode="decimal"],input[data-rd-keypad]';
 function clean(value){
  const v=String(value??'').trim().replace(/[$,]/g,'');
  return /^(?:\d+\.?\d{0,2}|\.\d{0,2})$/.test(v)?(v.startsWith('.')?'0'+v:v):'';
 }
 function appendDigit(value,key,limit=22){
  if(key==='clear')return '';
  if(key==='back')return value.slice(0,-1);
  if(key==='.')return value.includes('.')?value:(value||'0')+'.';
  if(!/^\d$/.test(key))return value;
  if(value.includes('.')&&value.split('.')[1].length>=2)return value;
  const next=value==='0'?key:value+key;
  return next.length<=limit?next:value;
 }
 function format(value){
  const v=clean(value);
  if(!v)return '';
  const [whole,fraction='']=v.split('.');
  return (whole.replace(/^0+(?=\d)/,'')||'0')+'.'+fraction.padEnd(2,'0');
 }
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const dlg=node('dialog','rd-money-keypad');dlg.id='rdMoneyKeypad';dlg.setAttribute('aria-labelledby','rdMoneyTitle');
 const title=node('h2','rd-money-title','ENTER AMOUNT');title.id='rdMoneyTitle';
 const display=node('output','rd-money-display');display.setAttribute('aria-live','polite');
 const caption=node('p','rd-money-caption','USD · Edit amount only');
 const presets=node('div','rd-money-presets'),keys=node('div','rd-money-keys'),actions=node('div','rd-money-actions');
 const feedback=node('p','rd-money-feedback');feedback.setAttribute('role','status');
 const makeButton=(text,fn,cls='')=>{const b=node('button',cls,text);b.type='button';b.addEventListener('click',fn);return b};
 let target=null,draft='',scope='',replaceOnDigit=true;
 function context(input){
  const s=window.BLACKCELL_REDLINE_API?.snapshot?.();
  return [s?.roomId||'',s?.resetAt||'',input.closest('#rdIndependentReview')?.dataset.keypadPhoto||'',input.closest('[data-redline-photo-id]')?.dataset.redlinePhotoId||''].join('|');
 }
 function usable(input){return input?.isConnected&&!input.disabled&&!input.readOnly&&input.getClientRects().length>0&&!input.closest('[hidden]')}
 function update(){display.textContent='$'+(draft||'0.00');feedback.textContent=''}
 function choose(key){
  if(key==='clear'){draft='';replaceOnDigit=false}
  else if(key==='back'){draft=appendDigit(draft,key);replaceOnDigit=false}
  else{draft=appendDigit(replaceOnDigit?'':draft,key,target?.maxLength>0?target.maxLength:22);replaceOnDigit=false}
  update();
 }
 for(const p of ['0.10','0.25','0.50','1.00','2.00','5.00']){
  const b=makeButton('$'+p,()=>{draft=p;replaceOnDigit=false;update()});
  b.dataset.amount=p;presets.append(b);
 }
 for(const k of ['1','2','3','4','5','6','7','8','9','.','0','back']){
  const b=makeButton(k==='back'?'⌫':k,()=>choose(k));
  if(k==='back')b.setAttribute('aria-label','Delete last digit');
  keys.append(b);
 }
 const cancel=makeButton('Cancel',()=>dlg.close('cancel'),'rd-money-cancel');
 const clear=makeButton('Clear',()=>choose('clear'),'rd-money-clear');
 const done=makeButton('Done',()=>{
  if(!usable(target)||context(target)!==scope){dlg.close('cancel');return}
  const value=format(draft);
  if(!value){feedback.textContent='Enter an amount or cancel.';return}
  const min=target.min!==''?Number(target.min):null,max=target.max!==''?Number(target.max):null;
  if((min!==null&&Number(value)<min)||(max!==null&&Number(value)>max)){
   feedback.textContent='Enter an amount within the allowed range.';return;
  }
  if(target.maxLength>0&&value.length>target.maxLength){feedback.textContent='Amount is too long.';return}
  target.value=value;
  target.dispatchEvent(new Event('input',{bubbles:true}));
  target.dispatchEvent(new Event('change',{bubbles:true}));
  dlg.close('done');
 },'rd-money-done');
 actions.append(cancel,clear,done);dlg.append(title,caption,display,presets,keys,feedback,actions);
 document.body.append(dlg);
 function prepare(el){
  if(!el.matches?.(selector))return;
  if(el.dataset.rdKeypad!=='true'){el.dataset.rdKeypad='true';el.inputMode='none';el.setAttribute('aria-haspopup','dialog');}
 }
 function scan(root){if(root.nodeType!==1)return;prepare(root);root.querySelectorAll(selector).forEach(prepare)}
 document.querySelectorAll(selector).forEach(prepare);
 new MutationObserver(records=>{for(const rec of records)for(const added of rec.addedNodes)scan(added)}).observe(document.body,{childList:true,subtree:true});
 function open(input){
  if(dlg.open||!usable(input))return;
  prepare(input);target=input;scope=context(input);draft=clean(input.value);replaceOnDigit=true;
  const label=input.getAttribute('aria-label')||'Enter amount';
  title.textContent=/timer|rate/i.test(label)?'TIMER RATE / MIN':/partial payment/i.test(label)?'PARTIAL PAYMENT':/counteroffer/i.test(label)?'COUNTEROFFER':/matching|trigger/i.test(label)?'TRIGGER WORD PRICE':'PHOTO PRICE';
  for(const b of presets.children){
   const n=Number(b.dataset.amount);b.hidden=(input.min!==''&&n<Number(input.min))||(input.max!==''&&n>Number(input.max));
  }
  update();dlg.showModal();
 }
 document.addEventListener('pointerdown',e=>{
  const input=e.target.closest?.(selector);
  if(!input||!usable(input)||e.button!==0)return;
  e.preventDefault();open(input);
 },true);
 document.addEventListener('click',e=>{
  const input=e.target.closest?.(selector);
  if(input&&usable(input)){e.preventDefault();open(input)}
 },true);
 document.addEventListener('focusin',e=>{if(e.target.matches?.(selector))prepare(e.target)},true);
 document.addEventListener('keydown',e=>{
  const input=e.target.closest?.(selector);
  if(input&&usable(input)&&['Enter',' '].includes(e.key)){e.preventDefault();open(input)}
 },true);
 dlg.addEventListener('keydown',e=>{
  if(/^\d$/.test(e.key)||e.key==='.'||e.key==='Backspace'){e.preventDefault();choose(e.key==='Backspace'?'back':e.key)}
 });
 dlg.addEventListener('close',()=>{target=null;scope='';draft=''});
 // Prevent a price intended for one photograph from being applied to another.
 window.addEventListener('blackcell:redline:state',()=>{if(dlg.open&&(!usable(target)||context(target)!==scope))dlg.close('cancel')});
})();
