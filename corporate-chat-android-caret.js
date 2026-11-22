/* BLACKCELL iMessage · Android caret-placement recovery.
   Some Android Chrome IMEs insert successive Latin characters at index 0,
   producing "olleh" instead of "hello". This is NOT a direction/CSS issue.
   Unlike formatting changes, this guard observes the actual native insertion
   position and repairs only unambiguous prepends while the user was typing
   at the end. It does not touch drafts, selections or RLS/chat transport.
*/
export function installAndroidChatCaretGuard(field,{userAgent=typeof navigator!=='undefined'?navigator.userAgent:''}={}){
 if(!field||!(/Android/i).test(String(userAgent||'')))return {enabled:false,reset(){}};
 let previous=String(field.value||'');
 const atEnd=()=>field.selectionStart===field.value.length&&field.selectionEnd===field.value.length;
 let tail=atEnd(),composing=false,compositionBaseline='',compositionTail=false,corrections=0;
 let pendingChange=false;
 const setEnd=()=>{
  try{field.setSelectionRange(field.value.length,field.value.length)}catch(_){}
 };
 const repairPrepend=(before,after)=>{
  if(!before||!after||after.length<=before.length||!after.endsWith(before))return false;
  // Only small plain-Latin character inserts are unambiguously a flipped
  // caret. IME replacements, paste, emoji and non-Latin input stay native.
  const inserted=after.slice(0,after.length-before.length);
  if(!inserted||inserted.length>3||!(/^[\x20-\x7e]+$/).test(inserted))return false;
  field.value=before+inserted;
  setEnd();
  corrections++;
  field.dataset.bcAndroidCaretRepair=String(corrections);
  return true;
 };
 const reset=()=>{previous=String(field.value||'');tail=atEnd()};
 field.addEventListener('focus',reset);
 // Intentional caret moves (tapping / arrow navigation) must remain editable.
 field.addEventListener('pointerup',reset);
 field.addEventListener('keyup',event=>{
  if(/^(?:ArrowLeft|ArrowRight|Home|End)$/.test(event.key))reset();
 });
 field.addEventListener('compositionstart',()=>{
  composing=true;compositionBaseline=String(field.value||'');compositionTail=tail;
 });
 field.addEventListener('compositionend',()=>{
  composing=false;
  const value=String(field.value||'');
  if(compositionTail&&repairPrepend(compositionBaseline,value)){}
  else if(compositionTail&&(/^[\x20-\x7e]*$/).test(value)&&value.length>compositionBaseline.length&&field.selectionStart===0){
   setEnd();corrections++;field.dataset.bcAndroidCaretRepair=String(corrections);
  }
  reset();
 });
 field.addEventListener('beforeinput',event=>{
  if(composing||event.isComposing||event.inputType!=='insertText')return;
  // If the keyboard reset the caret between input events, put it back
  // *before* the next character is inserted.
  if(tail&&previous===field.value&&previous.length>0&&field.selectionStart===0&&
   (/^[\x20-\x7e]*$/).test(previous)){
   setEnd();corrections++;field.dataset.bcAndroidCaretRepair=String(corrections);
  }
  pendingChange=true;
 });
 // Register before iMessage's typing-indicator handler so the corrected
 // value is what gets used by the existing chat composer.
 field.addEventListener('input',event=>{
  if(composing||event.isComposing||event.inputType==='insertCompositionText')return;
  const current=String(field.value||'');
  const insert=event.inputType==='insertText'||event.inputType==='insertReplacementText';
  if(insert&&tail&&previous!==current){
   if(!repairPrepend(previous,current)){
    const plainLatin=(/^[\x20-\x7e]*$/).test(current);
    const expectedAppend=current.length>previous.length&&current.startsWith(previous);
    if(plainLatin&&expectedAppend&&field.selectionStart<current.length){
     setEnd();corrections++;field.dataset.bcAndroidCaretRepair=String(corrections);
    }else if(plainLatin&&previous===''&&current.length===1&&field.selectionStart===0){
     setEnd();corrections++;field.dataset.bcAndroidCaretRepair=String(corrections);
    }
   }
  }
  // Sending clears the value without an input event; the next input will
  // start a fresh baseline, not reconstruct the preceding sent message.
  if(!pendingChange&&previous.length>current.length&&current.length===1&&insert){
   // No source text must ever be reused in a fresh message.
   previous='';
  }
  pendingChange=false;
  previous=String(field.value||'');
  tail=atEnd();
 });
 return {enabled:true,reset,get correctionCount(){return corrections}};
}
