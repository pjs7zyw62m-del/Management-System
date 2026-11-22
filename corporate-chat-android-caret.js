/* BLACKCELL iMessage · Android caret recovery
 * Android Chrome may resume from another app with the composer selection at
 * the beginning. A native IME can then prepend letters ('olleh') even though
 * the chat is LTR. Preserve the intent to append across app/page switches.
 *
 * No changes to stored messages, draft persistence, auth or chat transport.
 * Intentional cursor taps and keyboard navigation always win.
 */
export function installAndroidChatCaretGuard(field,{userAgent=typeof navigator!=='undefined'?navigator.userAgent:''}={}){
 if(!field||!/Android/i.test(String(userAgent||'')))return {enabled:false,reset(){}};
 const doc=field.ownerDocument||(typeof document!=='undefined'?document:null);
 const view=doc?.defaultView||(typeof window!=='undefined'?window:null);
 let previous=String(field.value||'');
 const atEnd=()=>field.selectionStart===field.value.length&&field.selectionEnd===field.value.length;
 let tail=atEnd(),composing=false,compositionBaseline='',compositionTail=false,corrections=0;
 let pendingChange=false,resumeDraft=null,resumePending=false;
 const setEnd=()=>{try{field.setSelectionRange(field.value.length,field.value.length)}catch(_){}};
 const mark=()=>{corrections++;field.dataset.bcAndroidCaretRepair=String(corrections)};
 const clearResume=()=>{resumeDraft=null;resumePending=false};
 const reset=()=>{previous=String(field.value||'');tail=atEnd()};
 const rememberBackground=()=>{
  // Android sometimes changes selection while backgrounding. Use the last
  // known user editing intent, rather than the background caret position.
  if(!composing&&previous===String(field.value||'')&&(tail||atEnd())&&previous.length>0){
   resumeDraft=previous;resumePending=true;
  }
 };
 const onForeground=()=>{
  if(!resumePending)return;
  if(resumeDraft!==String(field.value||'')){clearResume();reset();return}
  // Do not reposition on focus itself. A user might intentionally tap the
  // start of the draft. Repair only on actual input / beforeinput.
  previous=resumeDraft;tail=true;
 };
 const repairPrepend=(before,after)=>{
  if(!before||!after||after.length<=before.length||!after.endsWith(before))return false;
  const inserted=after.slice(0,after.length-before.length);
  // Never reorder emoji, pasted paragraphs or non-Latin composition.
  if(!inserted||inserted.length>3||!(/^[\x20-\x7e]+$/).test(inserted))return false;
  field.value=before+inserted;setEnd();mark();return true;
 };
 doc?.addEventListener('visibilitychange',()=>{
  if(doc.hidden)rememberBackground();else onForeground();
 });
 view?.addEventListener('pagehide',rememberBackground);
 view?.addEventListener('pageshow',onForeground);
 view?.addEventListener('focus',onForeground);
 field.addEventListener('blur',rememberBackground);
 field.addEventListener('focus',()=>{if(resumePending)onForeground();else reset()});
 // A conscious tap or arrow movement cancels append-intent recovery.
 field.addEventListener('pointerup',()=>{clearResume();reset()});
 field.addEventListener('keyup',event=>{
  if(/^(?:ArrowLeft|ArrowRight|Home|End)$/.test(event.key)){
   clearResume();reset();
  }
 });
 field.addEventListener('compositionstart',()=>{
  composing=true;compositionBaseline=String(field.value||'');
  compositionTail=tail||(resumePending&&resumeDraft===compositionBaseline);
 });
 field.addEventListener('compositionend',()=>{
  composing=false;
  const value=String(field.value||'');
  if(compositionTail&&repairPrepend(compositionBaseline,value)){}
  else if(compositionTail&&(/^[\x20-\x7e]*$/).test(value)&&value.length>compositionBaseline.length&&
   field.selectionStart===0){
   setEnd();mark();
  }
  clearResume();reset();
 });
 field.addEventListener('beforeinput',event=>{
  if(composing||event.isComposing||event.inputType!=='insertText')return;
  if((tail||(resumePending&&resumeDraft===previous))&&
   previous===field.value&&previous.length>0&&
   field.selectionStart===0&&field.selectionEnd===0&&
   (/^[\x20-\x7e]*$/).test(previous)){
   setEnd();mark();
  }
  pendingChange=true;
 });
 // Registered before iMessage typing-indicator logic so it sees corrected text.
 field.addEventListener('input',event=>{
  if(composing||event.isComposing)return;
  // Android keyboards can report a final insertCompositionText after their
  // compositionend event. Only treat this as an insert on a known resume.
  if(event.inputType==='insertCompositionText'&&!resumePending)return;
  const current=String(field.value||'');
  const insert=event.inputType==='insertText'||event.inputType==='insertReplacementText'||
   (resumePending&&(event.inputType==='insertCompositionText'||!event.inputType));
  const expectedTail=tail||(resumePending&&resumeDraft===previous);
  if(insert&&expectedTail&&previous!==current){
   if(!repairPrepend(previous,current)){
    const plainLatin=(/^[\x20-\x7e]*$/).test(current);
    const appended=current.length>previous.length&&current.startsWith(previous);
    if(plainLatin&&appended&&field.selectionStart<current.length){
     setEnd();mark();
    }else if(plainLatin&&previous===''&&current.length===1&&field.selectionStart===0){
     setEnd();mark();
    }
   }
  }
  if(!pendingChange&&previous.length>current.length&&current.length===1&&insert)previous='';
  pendingChange=false;
  clearResume();
  previous=String(field.value||'');tail=atEnd();
 });
 return {enabled:true,reset(){clearResume();reset()},get correctionCount(){return corrections}};
}
