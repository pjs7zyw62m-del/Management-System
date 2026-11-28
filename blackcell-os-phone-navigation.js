// Phone-only BLACKCELL shell gestures; native browser/OS gestures remain untouched.
export function classifyPhoneGesture(dx,dy,held=false){
 if(Math.abs(dx)>=52&&Math.abs(dx)>Math.abs(dy)*1.25)return dx<0?'next':'previous';
 if(dy<=-45&&Math.abs(dy)>Math.abs(dx)*1.25)return held?'switcher':'home';
 return null;
}
export function mountPhoneNavigation({host,allowed,apps,home,open,close,activeId}){
 const make=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el};
 const rail=make('div','bc-phone-gesture-rail');
 const indicator=make('button','bc-phone-home-indicator');indicator.type='button';
 indicator.setAttribute('aria-label','Return home. Swipe up and hold for recent apps.');
 indicator.title='Tap or swipe up for Home · Swipe up and hold for recent apps';
 const recent=make('button','bc-phone-recent-button','▢');recent.type='button';recent.setAttribute('aria-label','Open recent apps');
 rail.append(indicator,recent);host.append(rail);
 const dialog=make('dialog','bc-phone-switcher');dialog.setAttribute('aria-label','Recent BLACKCELL apps');
 const heading=make('h2','','Recent apps'),done=make('button','bc-phone-switcher-done','Done');done.type='button';
 const header=make('header','bc-phone-switcher-header');header.append(heading,done);
 const cards=make('div','bc-phone-switcher-cards'),hint=make('p','bc-phone-switcher-hint','Swipe a card up to close. Tap to return to an app.');
 dialog.append(header,cards,hint);host.append(dialog);
 let drag=null,timer=null,skipClick=false;
 const cancel=()=>{clearTimeout(timer);timer=null;drag=null};
 function dismiss(){cancel();if(dialog.open)dialog.close();cards.replaceChildren()}
 function goHome(){if(!allowed())return;dismiss();home()}
 function refresh(){
  cards.replaceChildren();
  for(const a of apps()){
   const card=make('article','bc-phone-recent-card'),launch=make('button','bc-phone-recent-launch'),label=make('strong','',a.title),symbol=make('span','bc-phone-recent-symbol','▣');
   launch.type='button';launch.append(symbol,label,make('small','',a.retained?'Saved in memory · tap to resume':'Tap to resume'));
   const remove=make('button','bc-phone-recent-close','Close');remove.type='button';remove.setAttribute('aria-label','Close '+a.title);
   let p=null,closing=false;
   const finish=async()=>{if(closing||!allowed()||!dialog.open)return;closing=true;remove.disabled=true;remove.textContent='Closing…';try{await close(a.id)}finally{if(dialog.open&&allowed())refresh()}};
   launch.onclick=()=>{if(!allowed()||closing)return;dismiss();open(a.id)};
   remove.onclick=()=>void finish();
   launch.addEventListener('pointerdown',e=>{if(e.button!==0)return;p={id:e.pointerId,x:e.clientX,y:e.clientY};try{launch.setPointerCapture(e.pointerId)}catch(_){p=null}});
   launch.addEventListener('pointermove',e=>{if(p?.id!==e.pointerId)return;const dy=e.clientY-p.y;if(dy<0)card.style.transform='translateY('+Math.max(-90,dy*.6)+'px)'});
   launch.addEventListener('pointerup',e=>{if(p?.id!==e.pointerId)return;const dy=e.clientY-p.y,dx=e.clientX-p.x;p=null;card.style.transform='';if(dy<-55&&Math.abs(dy)>Math.abs(dx)*1.25){e.preventDefault();launch.onclick=null;void finish()}});
   for(const type of ['pointercancel','lostpointercapture'])launch.addEventListener(type,()=>{p=null;card.style.transform=''});
   card.append(launch,remove);cards.append(card);
  }
  if(!cards.children.length)cards.append(make('p','bc-phone-switcher-empty','No recent apps'));
 }
 function showSwitcher(){if(!allowed())return;cancel();refresh();if(!dialog.open)dialog.showModal()}
 function cycle(direction){
  if(!allowed())return;const list=apps();if(!list.length)return;
  const i=list.findIndex(a=>a.id===activeId());if(i<0){open(list[0].id);return}
  if(list.length<2)return;open(list[(i+(direction==='next'?1:list.length-1))%list.length].id);
 }
 done.onclick=()=>dismiss();recent.onclick=()=>showSwitcher();dialog.addEventListener('close',()=>{if(!dialog.open)cards.replaceChildren()});
 indicator.addEventListener('pointerdown',e=>{
  if(!allowed()||e.button!==0)return;cancel();skipClick=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,held:false};
  try{indicator.setPointerCapture(e.pointerId)}catch(_){cancel()}
 });
 indicator.addEventListener('pointermove',e=>{
  if(drag?.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y,action=classifyPhoneGesture(dx,dy);
  if(action==='home'){if(timer===null)timer=setTimeout(()=>{if(drag&&allowed()){drag.held=true;skipClick=true;showSwitcher()}},350)}
  else{clearTimeout(timer);timer=null}
 });
 indicator.addEventListener('pointerup',e=>{
  if(drag?.id!==e.pointerId)return;
  const action=classifyPhoneGesture(e.clientX-drag.x,e.clientY-drag.y,drag.held);cancel();
  if(!action||!allowed())return;skipClick=true;e.preventDefault();
  if(action==='home')goHome();else if(action==='switcher')showSwitcher();else cycle(action);
 });
 for(const type of ['pointercancel','lostpointercapture'])indicator.addEventListener(type,cancel);
 indicator.onclick=e=>{if(skipClick&&e.detail!==0){skipClick=false;return}skipClick=false;goHome()};
 window.addEventListener('resize',()=>{if(!allowed())dismiss()},{passive:true});
 return {dismiss};
}
