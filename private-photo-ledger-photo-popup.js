/* Independent presentation layer. Never moves the authenticated review queue,
   timer, dashboard, or conversation. All decisions use the existing controls. */
(()=>{
'use strict';
const q=(s,root=document)=>root.querySelector(s);
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
const btn=(label,action,cls='')=>{const el=make('button',cls,label);el.type='button';el.addEventListener('click',action);return el};
const snapshot=()=>window.BLACKCELL_REDLINE_API?.snapshot?.();
const popup=make('section','rd-ir-popup');popup.id='rdIndependentReview';popup.hidden=true;popup.setAttribute('role','region');popup.setAttribute('aria-label','Incoming photo review');
const header=make('header','rd-ir-head'),heading=make('div','rd-ir-title'),count=make('small','','');heading.append(make('strong','','Incoming photograph'),count);
const close=btn('×',()=>minimize(),'rd-ir-close'),minus=btn('−',()=>minimize(),'rd-ir-close');close.setAttribute('aria-label','Close photo review');minus.setAttribute('aria-label','Minimize photo review');const layoutButton=btn('▣',()=>openLayoutSettings(),'rd-ir-close');layoutButton.setAttribute('aria-label','Photo layout settings');layoutButton.title='Photo Layout';const fitButton=btn('Fit photo',()=>{fillPhoto=!fillPhoto;reflectFocusControls()},'rd-ir-fit-toggle');fitButton.hidden=true;fitButton.setAttribute('aria-label','Show the complete photograph without cropping');
header.append(heading,fitButton,layoutButton,minus,close);
const scroll=make('div','rd-ir-scroll'),imageWrap=btn('',()=>original(),'rd-ir-image');imageWrap.setAttribute('aria-label','View full photo and zoom');const image=make('img');image.alt='Incoming private photograph';const placeholder=make('span','','Loading photo…');imageWrap.append(image,placeholder);
const zoom=make('span','rd-ir-zoom','⤢');zoom.setAttribute('aria-hidden','true');imageWrap.append(zoom);
const stars=make('div','rd-ir-stars');const starButtons=[];
for(let n=1;n<=5;n++){const b=btn('★',()=>{const c=canonical();const b=c?.panel.querySelectorAll('.rr-photo-rating-star')[n-1];if(b&&!b.disabled)b.click()},'rd-ir-star');b.setAttribute('aria-label','Rate '+n+' of 5 stars');starButtons.push(b);stars.append(b)}
const priceRow=make('div','rd-ir-price-row'),label=make('label','rd-ir-price','Photo price · USD'),price=make('input');price.type='text';price.inputMode='decimal';price.placeholder='0.00';price.setAttribute('aria-label','Photo price in USD');label.append(price);
const timerToggle=btn('◷ Timer',()=>{timerBox.hidden=!timerBox.hidden;timerToggle.setAttribute('aria-expanded',String(!timerBox.hidden));syncTimer()},'rd-ir-timer-toggle');timerToggle.setAttribute('aria-expanded','false');priceRow.append(label,timerToggle);
const timerBox=make('div','rd-ir-timer');timerBox.hidden=true;const rate=make('input');rate.type='text';rate.inputMode='decimal';rate.setAttribute('aria-label','Timer rate per minute');rate.placeholder='0.50';const timerStatus=make('small','');
const timerStart=btn('Start',()=>timerAction(true)),timerStop=btn('Stop',()=>timerAction(false));timerBox.append(rate,timerStart,timerStop,timerStatus);
const liveHud=make('div','rd-ir-live-hud');liveHud.hidden=true;liveHud.setAttribute('aria-label','Live timed photo');
const liveTime=make('div','rd-ir-live-time'),liveClock=make('strong','','00:00');
liveTime.append(liveClock,make('small','','LIVE TIMER'));
const liveRate=make('strong','','—'),liveEarned=make('strong','','—');
const rateTile=make('div','rd-ir-live-stat'),earnedTile=make('div','rd-ir-live-stat rd-ir-live-earned');
rateTile.append(make('small','','RATE / MIN'),liveRate);earnedTile.append(make('small','','EARNINGS'),liveEarned);
liveHud.append(liveTime,rateTile,earnedTile);
const liveActions=make('div','rd-ir-live-actions'),liveStop=btn('■ Stop timer',()=>timerAction(false),'rd-ir-live-stop'),liveMin=btn('Exit focus',()=>minimize(),'rd-ir-live-min');
const liveNote=make('small','rd-ir-live-note');liveActions.hidden=true;liveActions.append(liveStop,liveMin,liveNote);
const liveDock=make('div','rd-ir-live-dock');liveDock.hidden=true;liveDock.append(liveHud,liveActions);
const focusRating=make('section','rd-ir-focus-rating'),focusRatingTitle=make('strong','','RATE THIS PHOTO'),focusRatingStars=make('div','rd-ir-focus-rating-stars'),focusRatingNote=make('small','rd-ir-focus-rating-note');
focusRatingStars.setAttribute('role','group');focusRatingStars.setAttribute('aria-label','Rate the active timed photograph');focusRatingNote.setAttribute('role','status');
let focusRatingBusy=false,focusRatingPhoto='',focusRatingValue=0;
const focusStarButtons=[];
for(let i=1;i<=5;i++){const b=btn('☆',()=>void rateTimedPhoto(i),'rd-ir-focus-star');b.setAttribute('aria-label','Rate timed photograph '+i+' of 5 stars');b.setAttribute('aria-pressed','false');focusStarButtons.push(b);focusRatingStars.append(b)}
focusRating.append(focusRatingTitle,focusRatingStars,focusRatingNote);liveDock.append(focusRating);
function paintFocusRating(value,disabled){
 focusStarButtons.forEach((b,i)=>{b.textContent=i<value?'★':'☆';b.classList.toggle('is-filled',i<value);b.setAttribute('aria-pressed',String(i+1===value));b.disabled=disabled});
}
async function rateTimedPhoto(value){
 const s=snapshot(),a=activeTimer(s),id=current?.id,api=window.BLACKCELL_REDLINE_API;
 if(focusRatingBusy||!a||a.photo_id!==id||!api?.rateTimedPhoto)return;
 focusRatingBusy=true;paintFocusRating(focusRatingValue,true);focusRatingNote.textContent='Saving rating…';
 try{
  const result=await api.rateTimedPhoto(id,value);
  if(current?.id!==id||focusRatingPhoto!==id)return;
  focusRatingValue=Number(result?.stars)||value;focusRatingNote.textContent=value===5?'Saved · 5 STARS · TOP PICK':'Saved · '+value+' of 5 stars';
 }catch(e){if(focusRatingPhoto===id)focusRatingNote.textContent='Rating not saved: '+String(e?.message||e).slice(0,100)}
 finally{focusRatingBusy=false;if(focusRatingPhoto===id)paintFocusRating(focusRatingValue,!activeTimer(snapshot())||activeTimer(snapshot())?.photo_id!==id);schedule()}
}
const accept=btn('Submit & Next',()=>decision('accept'),'rd-ir-submit'),reject=btn('Reject photo',()=>decision('reject'),'rd-ir-reject'),feedback=make('small','rd-ir-feedback');feedback.setAttribute('role','status');
const controls=make('div','rd-ir-controls');const actions=make('div','rd-ir-actions');actions.append(accept,reject);controls.append(stars,priceRow,timerBox,actions,feedback);scroll.append(imageWrap);popup.append(header,scroll,liveDock,controls);
const grip=make('div','rd-ir-grip');grip.setAttribute('role','separator');grip.setAttribute('aria-label','Resize photo review and chat');grip.setAttribute('aria-orientation','horizontal');grip.tabIndex=0;popup.append(grip);
const resume=btn('Photo waiting · Review',()=>{opened=true;schedule()},'rd-ir-resume');resume.hidden=true;resume.setAttribute('aria-controls',popup.id);
document.body.append(popup,resume);
let scope='',known=new Set(),opened=false,current=null,queued=false,share=.90,pointer=null,expandedHost=null;
let timedStatus=null,seenTimer='',focusHost=null,fillPhoto=false,chatMode='mini';
function activeTimer(s){const a=timedStatus?.status?.active;return s?.isOwner&&s.roomActive&&!s.archiveMode&&timedStatus?.roomId===s.roomId&&a?.running===true?a:null}
function selectPhoto(history,pending,canonicalId,active){return active?history.find(p=>p.id===active.photo_id&&!p.removal_status)||null:pending.find(p=>p.id===canonicalId)||pending[0]||null}
// Only presentation nodes are inserted. Keep the authenticated message feed,
 // composer, typing indicator and send handler in their existing parent.
const miniHead=make('div','rd-ir-mini-chat-head');miniHead.hidden=true;
const miniTitle=make('strong','','Private chat');
 const miniLabel=make('span','rd-ir-chat-label','LIVE CHAT');miniLabel.setAttribute('aria-hidden','true');
const expandChat=btn('⤢',()=>{chatMode=chatMode==='expanded'?'mini':'expanded';reflectFocusControls()},'rd-ir-chat-expand');
const toggleChat=btn('−',()=>{chatMode=chatMode==='collapsed'?'mini':'collapsed';reflectFocusControls()},'rd-ir-chat-toggle');
expandChat.setAttribute('aria-label','Expand chat');
toggleChat.setAttribute('aria-label','Minimize chat');
miniHead.append(miniTitle,miniLabel,expandChat,toggleChat);
function reflectFocusControls(){
 const active=!!focusHost;
 popup.classList.toggle('rd-ir-fill-photo',active&&fillPhoto);
 fitButton.hidden=!active;
 fitButton.textContent=fillPhoto?'Show full photo':'Fill screen';
 fitButton.setAttribute('aria-pressed',String(fillPhoto));
 fitButton.setAttribute('aria-label',fillPhoto?'Show complete photograph without cropping':'Fill the screen with the photograph');
 if(!active)return;
 const side=innerWidth>=650;
 focusHost.classList.toggle('rd-ir-stationary-focus',side);
 if(side){if(liveDock.parentNode!==focusHost)focusHost.append(liveDock)}else if(liveDock.parentNode!==popup)popup.insertBefore(liveDock,controls);
 focusHost.classList.toggle('rd-ir-chat-collapsed',chatMode==='collapsed');
 focusHost.classList.toggle('rd-ir-chat-expanded',chatMode==='expanded');
 expandChat.hidden=chatMode==='collapsed';
 expandChat.textContent=chatMode==='expanded'?'↙':'⤢';
 expandChat.setAttribute('aria-label',chatMode==='expanded'?'Restore mini chat':'Expand chat');
 miniLabel.hidden=chatMode==='collapsed';
 toggleChat.textContent=chatMode==='collapsed'?'Open':'−';
 toggleChat.setAttribute('aria-expanded',String(chatMode!=='collapsed'));
 toggleChat.setAttribute('aria-label',chatMode==='collapsed'?'Open chat':'Minimize chat');
}
function focusBounds(viewport,barBottom){
 const top=Math.max(viewport.top,Math.min(viewport.bottom,barBottom));
 return {top:Math.round(top),height:Math.max(0,Math.floor(viewport.bottom-top))};
}
function fitFocus(){
 if(!focusHost)return;
 const v=window.BLACKCELL_REDLINE_VISIBLE_VIEWPORT?.()||{top:window.visualViewport?.offsetTop||0,bottom:(window.visualViewport?.offsetTop||0)+(window.visualViewport?.height||innerHeight)};
 const topbar=q('.topbar'),bottom=topbar?.getBoundingClientRect().bottom;
 const b=focusBounds(v,Number.isFinite(bottom)?bottom:v.top);
 focusHost.style.setProperty('--rd-full-top',b.top+'px');
 focusHost.style.setProperty('--rd-full-height',b.height+'px');
}
function setFocusHost(host){
 if(focusHost!==host){
  if(focusHost){
   focusHost.classList.remove('rd-ir-timer-focus','rd-ir-chat-collapsed','rd-ir-chat-expanded','rd-ir-stationary-focus');
   if(liveDock.parentNode!==popup)popup.insertBefore(liveDock,controls);
   focusHost.style.removeProperty('--rd-full-top');focusHost.style.removeProperty('--rd-full-height');
  }
  focusHost=host;
  miniHead.hidden=!host;
  document.body.classList.toggle('rd-ir-fullscreen',!!host);
  if(host){
   host.classList.add('rd-ir-timer-focus');
   if(miniHead.parentNode!==host)host.append(miniHead);
  }
 }
 reflectFocusControls();fitFocus();
}
window.addEventListener('blackcell:redline:timer-status',event=>{if(event.detail?.roomId===snapshot()?.roomId){timedStatus=event.detail;schedule()}});
// Presentation preferences are local to the verified owner and this device.
const preview=location.href==='about:srcdoc';
const defaults={mode:'top',auto:true,side:'right',width:44,height:82,anchor:'center'};
let settings={...defaults},settingsOwner='',settingsDialog=null;
function clean(v){return {mode:['top','floating','side','focus','custom'].includes(v?.mode)?v.mode:defaults.mode,auto:v?.auto!==false,side:v?.side==='left'?'left':'right',width:Math.max(28,Math.min(90,Number(v?.width)||44)),height:Math.max(40,Math.min(94,Number(v?.height)||82)),anchor:['center','left','right','top'].includes(v?.anchor)?v.anchor:'center'}}
function loadSettings(s){
 const uid=s?.isOwner?String(s.userId||''):'';
 if(uid===settingsOwner)return;settingsOwner=uid;settings={...defaults};
 if(uid&&!preview)try{settings=clean(JSON.parse(localStorage.getItem('bc-redline-photo-layout-v1:'+uid)||'null'))}catch(_){}
}
function applySettings(v){settings=clean(v);if(!preview&&settingsOwner)try{localStorage.setItem('bc-redline-photo-layout-v1:'+settingsOwner,JSON.stringify(settings))}catch(_){}schedule()}
function openLayoutSettings(){
 const s=snapshot();if(!s?.isOwner||!s.roomId)return;loadSettings(s);
 if(settingsDialog?.open)return;
 settingsDialog?.remove();const dialog=make('dialog','rd-layout-dialog');settingsDialog=dialog;
 const title=make('header','rd-layout-header');title.append(make('h2','','Photo Layout'),btn('×',()=>dialog.close(),'rd-layout-close'));
 const form=make('form','rd-layout-form');const description=make('p','','Choose how incoming photographs open. All ratings, prices and timer controls remain the same.');
 let draft={...settings};
 const options=make('div','rd-layout-options');
 const choices=[['top','Photo above chat','Full-width panel above the conversation.'],['floating','Floating pop-up','Centered review window.'],['side','Slide-out panel','Review from the left or right edge.'],['focus','Focus view','Large photo review with controls below.'],['custom','Create your layout','Choose placement, width and height.']];
 for(const [value,name,desc] of choices){const l=make('label','rd-layout-choice');const input=make('input');input.type='radio';input.name='layout';input.value=value;input.checked=draft.mode===value;const copy=make('span');copy.append(make('strong','',name),make('small','',desc));l.append(input,copy);options.append(l);input.addEventListener('change',()=>{draft.mode=value;reflect()})}
 const autoLabel=make('label','rd-layout-auto');const auto=make('input');auto.type='checkbox';auto.checked=draft.auto;auto.addEventListener('change',()=>{draft.auto=auto.checked});autoLabel.append(auto,make('span','','Automatically open incoming photos'));
 const custom=make('div','rd-layout-custom'),sideLabel=make('label','','Panel side'),side=make('select');for(const val of ['right','left']){const o=make('option','',val==='right'?'Right':'Left');o.value=val;side.append(o)}side.value=draft.side;side.addEventListener('change',()=>{draft.side=side.value;reflect()});sideLabel.append(side);
 const anchorLabel=make('label','','Custom placement'),anchor=make('select');for(const val of ['center','left','right','top']){const o=make('option','',val.charAt(0).toUpperCase()+val.slice(1));o.value=val;anchor.append(o)}anchor.value=draft.anchor;anchor.addEventListener('change',()=>{draft.anchor=anchor.value;reflect()});anchorLabel.append(anchor);
 function range(label,key,min,max){const l=make('label','rd-layout-range'),value=make('span','',draft[key]+'%'),line=make('div');line.append(make('span','',label),value);const input=make('input');input.type='range';input.min=min;input.max=max;input.step=1;input.value=draft[key];input.addEventListener('input',()=>{draft[key]=Number(input.value);value.textContent=draft[key]+'%';reflect()});l.append(line,input);return l}
 const width=range('Width','width',28,90),height=range('Height','height',40,94);custom.append(sideLabel,anchorLabel,width,height);
 const diagram=make('div','rd-layout-diagram');diagram.setAttribute('aria-label','Layout preview');const bubble=make('div','rd-layout-diagram-chat','CHAT'),photo=make('div','rd-layout-diagram-photo','PHOTO');diagram.append(bubble,photo);
 const note=make('small','rd-layout-note','Side panels use the top layout on narrow phones. Preferences are saved on this device; Developer Preview is temporary.');
 function reflect(){custom.hidden=!['side','custom'].includes(draft.mode);sideLabel.hidden=draft.mode!=='side';anchorLabel.hidden=width.hidden=height.hidden=draft.mode!=='custom';diagram.dataset.mode=draft.mode;diagram.dataset.anchor=draft.mode==='side'?draft.side:draft.anchor;diagram.style.setProperty('--layout-w',draft.width+'%');diagram.style.setProperty('--layout-h',draft.height+'%')}
 const footer=make('div','rd-layout-footer');footer.append(btn('Restore default',()=>{applySettings(defaults);dialog.close()},'rd-layout-secondary'));const save=make('button','rd-layout-save','Save layout');save.type='submit';footer.append(save);
 form.append(description,options,autoLabel,custom,diagram,note,footer);dialog.append(title,form);document.body.append(dialog);reflect();
 form.addEventListener('submit',e=>{e.preventDefault();const now=snapshot();if(!now?.isOwner||now.userId!==s.userId||now.roomId!==s.roomId){dialog.close();return}applySettings(draft);dialog.close()});
 dialog.addEventListener('close',()=>{dialog.remove();if(settingsDialog===dialog)settingsDialog=null});dialog.showModal();
}
window.addEventListener('blackcell:redline:open-photo-layout',openLayoutSettings);
function setPreviewExpanded(host){if(expandedHost===host)return;expandedHost?.classList.remove('rd-ir-preview-expanded');expandedHost=host;expandedHost?.classList.add('rd-ir-preview-expanded')}
function minimize(){opened=false;popup.hidden=true;setFocusHost(null);setPreviewExpanded(null);popup.removeAttribute('data-preview-top');schedule()}
function canonical(){
 const s=snapshot(),card=q('#reviewQueueCurrent .photo-entry[data-redline-photo-id]'),panel=q('#redlineLightboxReview');
 if(!s?.isOwner||!s.roomActive||s.archiveMode||!current||card?.dataset.redlinePhotoId!==current.id||!panel||panel.hidden)return null;
 if(panel.dataset.redlinePhotoId&&panel.dataset.redlinePhotoId!==current.id)return null;
 return {card,panel};
}
function original(){const a=activeTimer(snapshot());if(a&&a.photo_id===current?.id){const match=[...document.querySelectorAll('.photo-entry[data-redline-photo-id]')].find(el=>el.dataset.redlinePhotoId===current.id&&el.querySelector('.photo-image-btn'));if(match){match.querySelector('.photo-image-btn').click();return}}canonical()?.card.querySelector('.photo-image-btn')?.click()}
function decision(kind){
 if(activeTimer(snapshot())){feedback.textContent='Stop the active timer before reviewing another price.';return}
 const c=canonical();if(!c){feedback.textContent='Photo controls are still loading.';return}
 const action=c.panel.querySelector(kind==='reject'?'.redline-review-actions .reject-photo':'.redline-review-actions .button-main');
 if(!action||action.disabled){feedback.textContent='Wait for the current decision to finish.';return}
 if(kind==='accept'){
  const value=price.value.trim();
  if(!/^(?:\d+|\d*\.\d{1,2})$/.test(value)){feedback.textContent='Enter a valid price, such as 0.25.';return}
  const target=c.panel.querySelector('.redline-review-amount');if(!target)return;target.value=value.startsWith('.')?'0'+value:value;
 }
 feedback.textContent='';action.click();schedule();
}
rate.addEventListener('change',()=>{const originalRate=q('.rr-timer-rate',q('#redlinePhotoTimerPanel')||document);if(originalRate){originalRate.value=rate.value;originalRate.dispatchEvent(new Event('input',{bubbles:true}))}});
function syncTimer(){
 const timer=q('#redlinePhotoTimerPanel'),c=canonical();
 timerToggle.disabled=!!activeTimer(snapshot());
 if(!timer){timerStart.disabled=timerStop.disabled=liveStop.disabled=true;timerStatus.textContent='Timer unavailable in this view.';return}
 const originalRate=q('.rr-timer-rate',timer),start=q('.rr-timer-start',timer),stop=q('.rr-timer-stop',timer);
 if(document.activeElement!==rate&&originalRate)rate.value=originalRate.value;
 timerStart.disabled=!c||!start||start.disabled;timerStop.disabled=!stop||stop.disabled;
 const clock=q('.rr-timer-clock',timer)?.textContent||'00:00',earned=q('.rr-timer-money',timer)?.textContent||'—';
 timerStatus.textContent=[clock,earned].join(' · ');
 const a=activeTimer(snapshot());
 if(a&&a.photo_id===current?.id){
  liveClock.textContent=clock;liveEarned.textContent=earned;
  liveRate.textContent='$'+(Number(a.rate_cents)/100).toFixed(2);
  liveStop.disabled=!stop||stop.disabled;
  liveNote.textContent=timedStatus?.status?.stop_prompt?.status==='pending'?(q('.rr-timer-note',timer)?.textContent||'Waiting for stop confirmation…'):'';
 }
}
function timerAction(starting){
 const timer=q('#redlinePhotoTimerPanel');if(!timer||(starting?!canonical():!activeTimer(snapshot())))return;
 if(starting){
  // Select exactly the canonical pending photograph before starting.
  const select=q('.rr-timer-select-incoming',timer);select?.click();
  const originalRate=q('.rr-timer-rate',timer);if(originalRate){originalRate.value=rate.value;originalRate.dispatchEvent(new Event('input',{bubbles:true}))}
 }
 const action=q(starting?'.rr-timer-start':'.rr-timer-stop',timer);if(action&&!action.disabled)action.click();
}
function resize(value){share=Math.max(.42,Math.min(.90,value));popup.style.setProperty('--rd-ir-share',(share*100).toFixed(1)+'%');grip.setAttribute('aria-valuenow',String(Math.round(share*100)));if(popup.hasAttribute('data-preview-top'))schedule()}
resize(share);
grip.addEventListener('pointerdown',e=>{pointer=e.pointerId;grip.setPointerCapture(pointer);e.preventDefault()});
grip.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const rect=popup.getBoundingClientRect();resize((e.clientY-rect.top)/Math.max(1,popup.hasAttribute('data-preview-top')?(window.visualViewport?.height||innerHeight):popup.parentElement.clientHeight))});
for(const event of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(event,()=>{pointer=null});
grip.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();resize(share+(e.key==='ArrowDown'?.05:-.05))});
function sync(){
 queued=false;
 const s=snapshot(),chat=q('#redlineReceiverChat'),dashboard=q('#redlineReceiverCommand');
 loadSettings(s);
 const valid=Boolean(s?.isOwner&&s.roomActive&&!s.archiveMode&&s.roomId&&chat&&!chat.hidden&&dashboard&&!dashboard.hidden&&!q('#ledgerApp')?.hidden);
 if(!valid){if(settingsDialog?.open)settingsDialog.close();opened=false;scope='';known.clear();current=null;popup.hidden=resume.hidden=true;setPreviewExpanded(null);setFocusHost(null);seenTimer='';timedStatus=null;popup.removeAttribute('data-preview-top');image.removeAttribute('src');return}
 const room=s.roomId+'|'+String(s.resetAt||'');
 if(room!==scope){scope=room;known.clear();opened=false;current=null;price.value='';timerBox.hidden=true}
 const pending=(s.photoHistory||[]).filter(p=>p.decision_status==='pending'&&!p.removal_status).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||String(a.id).localeCompare(String(b.id)));
 const fresh=pending.some(p=>!known.has(p.id));known=new Set(pending.map(p=>p.id));
 const card=q('#reviewQueueCurrent .photo-entry[data-redline-photo-id]');
 const active=activeTimer(s),next=selectPhoto(s.photoHistory||[],pending,card?.dataset.redlinePhotoId,active);
 const timed=Boolean(active&&next?.id===active.photo_id);
 if(active&&active.id!==seenTimer){seenTimer=active.id;opened=true;fillPhoto=false;chatMode=innerWidth<650?'collapsed':'mini';}
 if(!active)seenTimer='';
 popup.classList.toggle('rd-ir-timing',timed);
 liveDock.hidden=liveHud.hidden=liveActions.hidden=!timed;
 if(timed){timerBox.hidden=true;timerToggle.setAttribute('aria-expanded','false')}
 const mobile=document.body.classList.contains('bc-ledger-mobile');
 const summary=!mobile||document.body.dataset.ledgerView==='summary';
 if(!active&&fresh&&settings.auto&&summary&&!document.activeElement?.matches('.redline-message-entry'))opened=true;
 if(!next)opened=false;
 if(current?.id!==next?.id){price.value='';feedback.textContent='';scroll.scrollTop=0}
 current=next;
 popup.dataset.keypadPhoto=next?.id||'';
 const visible=Boolean(opened&&next&&summary);
 // Mount the new presentation only. The original chat and controls stay put.
 const conversation=q('.redline-message-card',chat),feed=conversation?.querySelector('.redline-message-feed');
 const narrow=innerWidth<650;
 const effective=timed?'top':(settings.mode==='side'&&narrow)||(settings.mode==='custom'&&narrow&&['left','right'].includes(settings.anchor))?'top':settings.mode;
 popup.dataset.layout=effective;popup.dataset.anchor=effective==='side'?settings.side:settings.anchor;
 popup.style.setProperty('--rd-layout-width',settings.width+'vw');popup.style.setProperty('--rd-layout-height',settings.height+'dvh');
 const inlineTimer=Boolean(timed&&conversation&&feed?.parentNode===conversation);
 const topPreview=Boolean(!inlineTimer&&valid&&effective==='top'&&visible&&conversation&&feed?.parentNode===conversation);
 if(topPreview){
  // Fixed overlay starts at the phone viewport's top, including the branding.
  // Do not move or hide the original header, counters, or conversation.
  if(popup.parentNode!==document.body)document.body.append(popup);
  if(resume.parentNode!==conversation)conversation.insertBefore(resume,feed);
  popup.setAttribute('data-preview-top','');
 }else if(inlineTimer||(effective==='top'&&mobile&&conversation&&feed?.parentNode===conversation)){
  popup.removeAttribute('data-preview-top');
  // The finance header, PAY control and pinned timer precede the feed.
  // Insert only our two new nodes, directly before the conversation feed.
  if(popup.parentNode!==conversation||popup.nextElementSibling!==feed)conversation.insertBefore(popup,feed);
  if(resume.parentNode!==conversation||resume.nextElementSibling!==popup)conversation.insertBefore(resume,popup);
 }else{
  popup.removeAttribute('data-preview-top');
  if(popup.parentNode!==document.body)document.body.append(popup);
  if(resume.parentNode!==document.body)document.body.append(resume);
 }
 const mobileReady=effective!=='top'||!mobile||Boolean(conversation&&feed?.parentNode===conversation);
 setFocusHost(inlineTimer&&visible?conversation:null);
 // Approved mobile receiver overlay: original financial header and chat stay mounted.
 setPreviewExpanded(null);
 if(topPreview){
  const viewport=window.visualViewport,visible=window.BLACKCELL_REDLINE_VISIBLE_VIEWPORT?.(),top=visible?.top??(viewport?.offsetTop||0),height=visible?.height??(viewport?.height||innerHeight);
  const composer=q('.redline-message-composer',conversation),composerTop=composer?.getBoundingClientRect().top;
  const bottom=Number.isFinite(composerTop)&&composerTop>top?Math.min(top+height,composerTop):top+height-42;
  const available=Math.max(0,bottom-top-48);
  popup.style.setProperty('--rd-ir-top',top+'px');
  popup.style.setProperty('--rd-ir-top-height',Math.min(available,height*share)+'px');
 }else if(mobileReady&&mobile&&visible){const composer=q('.redline-message-composer',conversation);const available=Math.max(0,conversation.clientHeight-[...conversation.children].filter(el=>el!==popup&&el!==resume&&el!==feed&&!el.hidden&&getComputedStyle(el).display!=='none').reduce((n,el)=>n+el.getBoundingClientRect().height,0)-(expandedHost?40:48));popup.style.setProperty('--rd-ir-available',available+'px');}else popup.style.removeProperty('--rd-ir-available');
 popup.hidden=!visible||!mobileReady;resume.hidden=!next||visible||!summary||!mobileReady;
 const resumeText=timed?'◷ Timer running · Return to photo':pending.length+' photo'+(pending.length===1?'':'s')+' waiting · Review';if(resume.textContent!==resumeText)resume.textContent=resumeText;
 if(!next){image.removeAttribute('src');image.hidden=true;placeholder.hidden=false;return;}
 const countText=timed?'Timed photograph · Live session':'1 of '+pending.length+' awaiting review';if(count.textContent!==countText)count.textContent=countText;
 const src=next.image_url;
 if(src&&/^(blob:|https:\/\/|data:image\/)/.test(src)){if(image.getAttribute('src')!==src)image.src=src;image.hidden=false;placeholder.hidden=true}
 else{image.removeAttribute('src');image.hidden=true;placeholder.hidden=false}
 const c=canonical(),rating=Number(next.stars)||0;
 if(focusRatingPhoto!==next.id){focusRatingPhoto=next.id;focusRatingNote.textContent='';focusRatingValue=rating;}
 if(!focusRatingBusy)focusRatingValue=rating;
 paintFocusRating(focusRatingValue,focusRatingBusy||!timed||!window.BLACKCELL_REDLINE_API?.rateTimedPhoto);
 starButtons.forEach((b,i)=>{b.classList.toggle('is-filled',i<rating);b.disabled=!c||!!c.panel.querySelectorAll('.rr-photo-rating-star')[i]?.disabled});
 accept.disabled=timed||!c||!!c.panel.querySelector('.redline-review-actions .button-main')?.disabled;
 reject.disabled=timed||!c||!!c.panel.querySelector('.redline-review-actions .reject-photo')?.disabled;
 const note=c?.panel.querySelector('.redline-review-status')?.textContent;if(note)feedback.textContent=note;
 syncTimer();
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(sync)}}
for(const event of ['blackcell:redline:state','blackcell:redline:receiver-ready','blackcell:redline:review-photo','blackcell:redline:review-empty','blackcell:redline:photo-decided','blackcell:redline:device-mode','blackcell:redline:session-mode','blackcell:redline:keyboard-viewport','pageshow','resize'])window.addEventListener(event,schedule);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popup.hidden&&q('#photoLightbox')?.hidden&&!q('dialog[open]'))minimize()});
new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class','data-ledger-view']});
window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
window.addEventListener('scroll',fitFocus,{passive:true});
if(window.ResizeObserver){const bar=q('.topbar');if(bar)new ResizeObserver(fitFocus).observe(bar)}
setInterval(()=>{if(!popup.hidden)syncTimer()},500);
schedule();
})();
