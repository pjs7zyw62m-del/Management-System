/* Movable BLACKCELL widgets. Storage uses authenticated per-user OS layout preferences. */
(()=>{
 "use strict";
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),ids=["identity","storage","worlds"];
 const fresh=()=>({version:1,visible:true,positions:{},order:[...ids]});
 function init(){
  const shell=document.getElementById("desktop"),work=shell?.querySelector(".workspace"),panel=document.getElementById("bcSystemOverview"),toggle=document.getElementById("bcWidgetsToggle");
  if(!shell||!work||!panel||!toggle)return;
  const items=[
   ["identity","Corporate Identity",panel.querySelector(".bc-identity-card")],
   ["storage","BLACKCELL Storage",document.getElementById("bcStorageWidget")],
   ["worlds","World Media Monitor",document.getElementById("bcWorldMonitor")]
  ].filter(x=>x[2]).map(([id,name,el])=>({id,name,el}));
  let state=fresh(),account="",drag=null,raf=0;
  const reset=document.createElement("button");reset.type="button";reset.className="bc-widget-reset";reset.textContent="Reset";reset.title="Reset widget positions";toggle.after(reset);
  const cloud=()=>window.BLACKCELL_OS_WIDGET_LAYOUT;
  const wide=()=>matchMedia("(min-width:901px)").matches&&!document.documentElement.classList.contains("bc-os-tablet");
  const updateIcons=()=>requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")));
  const save=()=>{if(account)cloud()?.save?.({version:1,visible:state.visible,positions:state.positions,order:state.order})};
  function visible(){
   shell.classList.toggle("bc-widgets-hidden",!state.visible);
   toggle.setAttribute("aria-expanded",String(state.visible));
   toggle.setAttribute("aria-label",state.visible?"Hide overview widgets":"Show overview widgets");
   toggle.title=state.visible?"Hide overview widgets":"Show overview widgets";reset.hidden=!state.visible;
  }
  function reorder(){
   const heading=panel.querySelector(".bc-panel-heading"),footer=panel.querySelector(".release");
   for(const id of state.order){const it=items.find(it=>it.id===id);if(it)panel.append(it.el)}
   if(heading)panel.prepend(heading);if(footer)panel.append(footer);
  }
  function load(){
   if(drag)return;
   const name=String(cloud()?.account?.()||(document.body.dataset.preview==="true"?"preview":""));
   if(!name)return;
   const raw=cloud()?.read?.()||{},next=fresh();account=name;
   next.visible=raw.visible!==false;
   if(Array.isArray(raw.order))next.order=[...new Set([...raw.order.filter(id=>ids.includes(id)),...ids])];
   for(const id of ids){const p=raw.positions?.[id];if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))next.positions[id]={x:clamp(p.x,0,1),y:clamp(p.y,0,1)}}
   state=next;visible();reorder();schedule();
  }
  function place(it,x,y){
   const maxX=Math.max(0,work.clientWidth-it.el.offsetWidth-12),maxY=Math.max(0,work.clientHeight-it.el.offsetHeight-12);
   it.el.style.left=Math.round(clamp(x,0,maxX))+"px";it.el.style.top=Math.round(clamp(y,0,maxY))+"px";
  }
  function remember(it){
   const maxX=Math.max(1,work.clientWidth-it.el.offsetWidth-12),maxY=Math.max(1,work.clientHeight-it.el.offsetHeight-12);
   state.positions[it.id]={x:clamp((parseFloat(it.el.style.left)||0)/maxX,0,1),y:clamp((parseFloat(it.el.style.top)||0)/maxY,0,1)};save();
  }
  function layout(){
   if(drag||shell.hidden||!work.clientWidth)return;
   const free=wide();work.classList.toggle("bc-widget-free-mode",free);
   if(!free){for(const it of items){it.el.style.left="";it.el.style.top=""}return}
   let x=(work.clientWidth>=1180?16:Math.max(12,work.clientWidth-265)),y=24;
   for(const it of items){
    if(it.el.hidden||getComputedStyle(it.el).display==="none")continue;
    const h=it.el.offsetHeight;
    if(!state.positions[it.id]&&y+h>work.clientHeight-12&&y>24){x=Math.max(12,x-it.el.offsetWidth-12);y=24}
    const p=state.positions[it.id],maxX=Math.max(0,work.clientWidth-it.el.offsetWidth-12),maxY=Math.max(0,work.clientHeight-h-12);
    place(it,p?p.x*maxX:x,p?p.y*maxY:y);y+=h+12;
   }
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;layout()})}
  function start(e,it){
   if(e.button!==0||drag||shell.hidden||!state.visible)return;
   drag={it,id:e.pointerId,x:e.clientX,y:e.clientY,left:parseFloat(it.el.style.left)||0,top:parseFloat(it.el.style.top)||0,free:wide(),moved:false};
   it.handle.setPointerCapture(e.pointerId);it.el.classList.add("bc-widget-dragging");e.preventDefault();
  }
  function move(e){
   if(!drag||drag.id!==e.pointerId)return;
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
   if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<5)return;
   drag.moved=true;
   if(drag.free)place(drag.it,drag.left+dx,drag.top+dy);
   else{
    items.forEach(it=>it.el.classList.remove("bc-widget-target"));
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(".bc-draggable-widget");
    if(target&&target!==drag.it.el&&panel.contains(target))target.classList.add("bc-widget-target");
   }
  }
  function end(e){
   if(!drag||drag.id!==e.pointerId)return;
   const d=drag;drag=null;d.it.el.classList.remove("bc-widget-dragging");
   try{d.it.handle.releasePointerCapture(d.id)}catch(_){}
   if(d.moved){
    if(d.free)remember(d.it);
    else{
     const target=items.find(it=>it.el.classList.contains("bc-widget-target"));
     if(target){const order=state.order.filter(id=>id!==d.it.id);order.splice(order.indexOf(target.id),0,d.it.id);state.order=order;reorder();save()}
    }
   }
   items.forEach(it=>it.el.classList.remove("bc-widget-target"));schedule();updateIcons();
  }
  function key(e,it){
   if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;
   e.preventDefault();
   if(wide()){
    const step=e.shiftKey?25:10,x=(parseFloat(it.el.style.left)||0)+(e.key==="ArrowRight"?step:e.key==="ArrowLeft"?-step:0),
      y=(parseFloat(it.el.style.top)||0)+(e.key==="ArrowDown"?step:e.key==="ArrowUp"?-step:0);
    place(it,x,y);remember(it);updateIcons();
   }else{
    const order=[...state.order],i=order.indexOf(it.id),j=clamp(i+(e.key==="ArrowDown"||e.key==="ArrowRight"?1:-1),0,order.length-1);
    if(i!==j){[order[i],order[j]]=[order[j],order[i]];state.order=order;reorder();save();it.handle.focus()}
   }
  }
  for(const it of items){
   it.el.classList.add("bc-draggable-widget");it.el.dataset.bcWidget=it.id;
   const b=document.createElement("button");b.type="button";b.className="bc-widget-handle";b.textContent="⋮⋮  Move "+it.name;
   b.setAttribute("aria-label","Move "+it.name+" widget. Drag or use arrow keys.");b.title="Drag to move · Arrow keys for adjustment";
   it.el.prepend(b);it.handle=b;b.addEventListener("pointerdown",e=>start(e,it));b.addEventListener("keydown",e=>key(e,it));
  }
  toggle.addEventListener("click",()=>{state.visible=!state.visible;visible();save();schedule();updateIcons()});
  reset.addEventListener("click",()=>{state.positions={};state.order=[...ids];reorder();save();schedule();updateIcons()});
  document.addEventListener("pointermove",move,{passive:true});document.addEventListener("pointerup",end);document.addEventListener("pointercancel",end);
  window.addEventListener("blackcell:widget-sync",load);window.addEventListener("resize",schedule,{passive:true});
  if(typeof ResizeObserver==="function"){const ro=new ResizeObserver(schedule);ro.observe(work);for(const it of items)ro.observe(it.el)}
  if(typeof MutationObserver==="function"){
   new MutationObserver(schedule).observe(shell,{attributes:true,attributeFilter:["hidden"]});
   const world=items.find(it=>it.id==="worlds")?.el;
   if(world){let last="";new MutationObserver(()=>{const now=world.hidden+"|"+world.style.display;if(now!==last){last=now;schedule()}})
    .observe(world,{attributes:true,attributeFilter:["hidden","style"]})}
  }
  load();schedule();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();