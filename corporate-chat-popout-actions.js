
/* iPhone-inspired pop-out message actions. No third-party message export. */
export function mountPopoutActions({canAct,composer,resizeComposer,sendReaction,status,editMessage,deleteMessage}){
 const make=(tag,cls='',value='')=>{const n=document.createElement(tag);n.className=cls;if(value)n.textContent=value;return n};
 const surface=make('div','bc-pop-action-surface');surface.hidden=true;
 const toolbar=make('div','bc-pop-reactions');toolbar.setAttribute('aria-label','React to this message');
 const menu=make('div','bc-pop-actions');menu.setAttribute('aria-label','Message actions');
 const shade=make('div','bc-pop-action-shade');shade.hidden=true;
 const translated=new Map();let current=null,pressTimer=null,suppressUntil=0,previousFocus=null,translationBusy=false;
 const btn=(label,fn,cls='')=>{const b=make('button',cls,label);b.type='button';b.addEventListener('click',fn);return b};
 function close(restore=false){surface.hidden=true;shade.hidden=true;current?.bubble.classList.remove('bc-pop-action-selected');current=null;if(restore&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true})}
 function place(){if(!current)return;const r=current.bubble.getBoundingClientRect();if(!current.bubble.isConnected){close();return}
  const w=surface.offsetWidth,h=surface.offsetHeight;
  const x=Math.min(Math.max(10,current.own?r.right-w:r.left),Math.max(10,innerWidth-w-10));
  const below=innerHeight-r.bottom-9;const y=below>=h? r.bottom+7 : r.top>=h+12?r.top-h-7:Math.max(8,Math.min(r.top,innerHeight-h-8));
  surface.style.left=x+'px';surface.style.top=y+'px';
 }
 function open(event,bubble,message,own){
  if(!canAct()||!bubble.isConnected)return;
  event?.preventDefault?.();event?.stopPropagation?.();
  close();previousFocus=bubble;current={bubble,message,own};bubble.classList.add('bc-pop-action-selected');
  editAction.hidden=!own||!!message.deleted_at||!!message.media_batch_id;deleteAction.hidden=editAction.hidden;surface.hidden=false;shade.hidden=false;place();
 }
 const valid=entry=>!!entry&&canAct()&&entry.bubble.isConnected;
 const short=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,140);
 for(const [glyph,name] of [['❤️','Love'],['👍','Like'],['👎','Dislike'],['😂','Laugh'],['‼️','Emphasize'],['❓','Question']]){
  const b=btn(glyph,async()=>{const entry=current;if(!valid(entry))return;close(true);await sendReaction(entry.message,glyph);},'bc-pop-reaction');
  b.setAttribute('aria-label','Toggle '+name+' reaction');b.title='Toggle '+name+' reaction';toolbar.append(b);
 }
 const add=(icon,label,action)=>{const b=btn('',async()=>{const entry=current;if(!valid(entry))return;close();await action(entry)});
  const symbol=make('span','bc-pop-action-icon',icon);symbol.setAttribute('aria-hidden','true');b.append(symbol,make('span','',label));menu.append(b);return b};
 const editAction=add('✎','Edit message',entry=>editMessage?.(entry.message));
 const deleteAction=add('⌫','Delete for everyone',entry=>deleteMessage?.(entry.message));deleteAction.classList.add('bc-chat-delete-action');
 add('↩','Reply',entry=>{
  const quote='> '+short(entry.message.body)+'\n\n';const draft=composer.value;
  if(!draft.startsWith(quote))composer.value=(quote+draft).slice(0,2000);
  resizeComposer();composer.focus();composer.setSelectionRange(composer.value.length,composer.value.length);
 });
 add('⎘','Copy',async entry=>{
  try{await navigator.clipboard.writeText(String(entry.message.body||''));status('Message copied.')}catch(_){status('Clipboard unavailable. Use Select to copy the message.')}
 });
 add('文','Translate',async entry=>{
  if(translationBusy)return;
  if(translated.has(entry.message.id)){showTranslation(entry.bubble,entry.message);return}
  const source=String(entry.message.body||'');if(!source)return;
  if(!globalThis.Translator?.create||!globalThis.LanguageDetector?.create){status('Private on-device translation is not available in this browser.');return}
  translationBusy=true;let detector,translator;
  try{
   status('Preparing private translation…');
   detector=await globalThis.LanguageDetector.create();
   const match=(await detector.detect(source))?.[0];const lang=match?.detectedLanguage;
   if(!lang||lang==='und')throw Error('Language could not be detected.');
   const target=(navigator.language||'en').split('-')[0];
   if(lang===target){status('This message is already in your browser language.');return}
   translator=await globalThis.Translator.create({sourceLanguage:lang,targetLanguage:target});
   const output=await translator.translate(source);
   if(!canAct())return;
   let language=lang;try{language=new Intl.DisplayNames([navigator.language||'en'],{type:'language'}).of(lang)||lang}catch(_){}
   translated.set(entry.message.id,{output,language,source});
   if(entry.bubble.isConnected)showTranslation(entry.bubble,entry.message);
   else for(const b of document.querySelectorAll('.bc-pop-text-bubble'))if(b.dataset.messageId===String(entry.message.id))showTranslation(b,entry.message);
   status('');
  }catch(e){status('Translation unavailable: '+String(e?.message||'This language may not be supported.').slice(0,140))}
  finally{translationBusy=false;detector?.destroy?.();translator?.destroy?.()}
 });
 add('▱','Select',entry=>{const sel=window.getSelection();if(!sel)return;const range=document.createRange();range.selectNodeContents(entry.bubble.querySelector('.bc-pop-original,.bc-message-body')||entry.bubble);sel.removeAllRanges();sel.addRange(range)});
 add('◖','Speak',entry=>{
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){status('Speech is unavailable in this browser.');return}
  const voice=window.speechSynthesis.getVoices().find(v=>v.localService&&v.lang.startsWith((navigator.language||'en').split('-')[0]));
  if(!voice){status('No local speech voice is available.');return}
  window.speechSynthesis.cancel();const speech=new SpeechSynthesisUtterance(String(entry.message.body||''));speech.voice=voice;speech.lang=voice.lang;window.speechSynthesis.speak(speech);
 });
 function showTranslation(bubble,message){
  const result=translated.get(message.id);if(!result||result.source!==String(message.body||''))return;
  const existing=bubble.querySelector('.bc-pop-translation');if(existing)return;
  const original=make('span','bc-pop-original',String(message.body||''));
  const resultText=make('span','bc-pop-translation',result.output);
  const label=make('span','bc-pop-translated-label','Translated from '+result.language);
  const badges=bubble.querySelector('.bc-attached-reactions');
  bubble.replaceChildren(original,resultText,label);if(badges)bubble.append(badges);bubble.classList.add('bc-pop-is-translated');
 }
 function attach(bubble,message,own){
  bubble.classList.add('bc-pop-text-bubble');bubble.dataset.messageId=String(message.id);
  showTranslation(bubble,message);
  bubble.addEventListener('contextmenu',e=>{clearTimeout(pressTimer);open(e,bubble,message,own)});
  bubble.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))open(e,bubble,message,own)});
  let start=null;
  bubble.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||!e.isPrimary)return;start={x:e.clientX,y:e.clientY};clearTimeout(pressTimer);pressTimer=setTimeout(()=>{suppressUntil=Date.now()+1200;open(null,bubble,message,own)},500)});
  bubble.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10){clearTimeout(pressTimer);start=null}});
  for(const event of ['pointerup','pointercancel','pointerleave'])bubble.addEventListener(event,()=>{clearTimeout(pressTimer);start=null});
  bubble.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.stopImmediatePropagation();e.preventDefault()}},true);
 }
 shade.addEventListener('click',()=>close(true));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!surface.hidden){e.preventDefault();close(true)}});
 window.addEventListener('resize',()=>{if(!surface.hidden)place()});
 surface.append(toolbar,menu);document.body.append(shade,surface);
 return {attach,close,open:(bubble,message,own)=>open(null,bubble,message,own)};
}
