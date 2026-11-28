// Pin a conversation to its newest message until the reader intentionally scrolls away.
export function createChatScroll(box,{observe=globalThis.ResizeObserver,frame=globalThis.requestAnimationFrame}={}){
 let pinned=true,lastTop=box.scrollTop,pending=false,reading=false;
 const near=()=>box.scrollHeight-box.scrollTop-box.clientHeight<80;
 const bottom=()=>{box.scrollTop=box.scrollHeight;lastTop=box.scrollTop};
 const settle=()=>{if(pinned&&box.clientHeight>0)bottom()};
 const schedule=()=>{if(pending)return;pending=true;(frame||((fn)=>setTimeout(fn,0)))(()=>{pending=false;settle()})};
 const observer=observe?new observe(()=>{settle();schedule()}):null;
 observer?.observe(box);
 const onScroll=()=>{const top=box.scrollTop;if(near()){pinned=true;reading=false}else if(top<lastTop-1||reading&&Math.abs(top-lastTop)>1){pinned=false;reading=true}lastTop=top};
 box.addEventListener('scroll',onScroll,{passive:true});
 box.addEventListener('wheel',e=>{if(e.deltaY<0){pinned=false;reading=true}},{passive:true});
 function beforeRender(force=false){
  if(force){pinned=true;reading=false}
  const anchor=!pinned?[...box.querySelectorAll('[data-message-id]')].find(n=>n.getBoundingClientRect().bottom>box.getBoundingClientRect().top):null;
  return {id:anchor?.dataset.messageId,offset:anchor?anchor.getBoundingClientRect().top-box.getBoundingClientRect().top:0,top:box.scrollTop};
 }
 function afterRender(saved){
  observer?.disconnect();observer?.observe(box);for(const child of box.children)observer?.observe(child);
  if(pinned){settle();schedule();return}
  const anchor=saved?.id&&[...box.querySelectorAll('[data-message-id]')].find(n=>n.dataset.messageId===saved.id);
  box.scrollTop=anchor?box.scrollTop+anchor.getBoundingClientRect().top-box.getBoundingClientRect().top-saved.offset:saved?.top??box.scrollTop;
  lastTop=box.scrollTop;
 }
 return {beforeRender,afterRender,open(){pinned=true;reading=false;settle();schedule()},settle,schedule};
}
