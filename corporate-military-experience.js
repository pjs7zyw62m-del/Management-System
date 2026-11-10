/* BLACKCELL / MANSARMEDFORCES immersive controls.
 * Presentation-only extension: the authenticated photo engine continues
 * to own uploads, database reads, collection scope, favorites and media.
 */
(() => {
 "use strict";
 const root=document.getElementById("photosView");
 if(!root)return;
 const $=id=>document.getElementById(id);
 const flag=(name,on)=>document.body.classList.toggle(name,!!on);
 const page=()=>root.hidden===false;
 const gallery=()=>document.querySelector("#photosView .apple-gallery-section");
 const goTo=node=>{if(node)node.scrollIntoView({behavior:document.body.classList.contains("mx-reduced")?"instant":"smooth",block:"start"})};
 const modal=id=>{const e=$(id);if(e){e.hidden=false; e.querySelector("input,button")?.focus()}};
 const close=id=>{if($(id))$(id).hidden=true};
 const hint=message=>{const e=$("mxLiveMessage");if(e)e.textContent=message};
 const setFilter=(field,value)=>{
  const n=$(field);
  if(!n)return;
  n.value=value;
  n.dispatchEvent(new Event("change",{bubbles:true}));
 };
 function filterCategory(category){
  setFilter("militaryFilterCategory",category);
  goTo(gallery());
  hint("Showing your authorized "+category.toLowerCase()+" media.");
 }
 function sync(){flag("mx-open",page())}
 new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:["hidden"]});
 sync();
 $("mxHeroExplore")?.addEventListener("click",()=>goTo($("mxDiscovery")));
 $("mxHeroWatch")?.addEventListener("click",()=>modal("mxCinematicModal"));
 $("mxHeroMen")?.addEventListener("click",()=>goTo($("mxMen")));
 $("mxSurprise")?.addEventListener("click",()=>{
  const choices=["Personnel","Uniforms","Ground Vehicles","Aircraft","Naval Vessels","Training","Historical","Operations"];
  filterCategory(choices[Math.floor(Math.random()*choices.length)]);
 });
 document.querySelectorAll("#photosView [data-mx-cat]").forEach(b=>b.addEventListener("click",()=>{
  const c=b.getAttribute("data-mx-cat");
  if(c)filterCategory(c);
 }));
 let current="discover";
 function setMode(mode){
  current=mode;
  flag("mx-unwind",mode==="unwind");
  flag("mx-cinematic",mode==="cinematic");
  document.querySelectorAll("#photosView [data-mx-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mxMode===mode)));
  hint(mode==="unwind"?"Unwind mode enabled.":mode==="cinematic"?"Cinematic mode enabled.":"Discovery mode enabled.");
 }
 document.querySelectorAll("#photosView [data-mx-mode]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mxMode)));
 const prefs=[
  ["mxDiscreet","mx-discreet","Discreet viewing"],
  ["mxMotion","mx-reduced","Reduced motion"],
  ["mxText","mx-large","Larger text"],
  ["mxPause","mx-paused","Paused effects"]
 ];
 for(const [id,cls,label] of prefs){
  const b=$(id);
  if(!b)continue;
  if(id==="mxMotion"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)flag(cls,true);
  const syncBtn=()=>{
   const active=document.body.classList.contains(cls);
   b.setAttribute("aria-pressed",String(active));
   b.textContent=(active?"✓ ":"")+(id==="mxDiscreet"?"DISCREET VIEW":id==="mxMotion"?"REDUCE MOTION":id==="mxText"?"LARGER TEXT":"PAUSE EFFECTS");
  };
  b.addEventListener("click",()=>{flag(cls,!document.body.classList.contains(cls));syncBtn();hint(label+" updated.")});
  syncBtn();
 }
 function allowAdult(){
  // This confirmation is an interface preference, not identity/age verification.
  try{sessionStorage.setItem("mx_adult_session","confirmed")}catch(_){}
  $("mxMenLock").hidden=true;
  $("mxMenBrowse").hidden=false;
  close("mxAgeModal");
  hint("Men in Uniform collection is ready. Browse categorized authorized media.");
  goTo($("mxMenBrowse"));
 }
 let ageOK=false;
 function requestAdult(category){
  const unlocked=(()=>{try{return sessionStorage.getItem("mx_adult_session")==="confirmed"}catch(_){return false}})();
  if(unlocked){allowAdult();if(category)filterCategory(category);return}
  $("mxAgeCheck").checked=false;
  $("mxAgeConfirm").disabled=true;
  $("mxAgeModal").dataset.openCategory=category||"";
  modal("mxAgeModal");
 }
 $("mxMenEnter")?.addEventListener("click",()=>requestAdult(""));
 $("mxAgeCheck")?.addEventListener("change",e=>{$("mxAgeConfirm").disabled=!e.target.checked});
 $("mxAgeConfirm")?.addEventListener("click",()=>{
  const category=$("mxAgeModal").dataset.openCategory;
  allowAdult();if(category)filterCategory(category);
 });
 $("mxAgeCancel")?.addEventListener("click",()=>close("mxAgeModal"));
 $("mxAgeClose")?.addEventListener("click",()=>close("mxAgeModal"));
 $("mxCinematicClose")?.addEventListener("click",()=>close("mxCinematicModal"));
 $("mxCinematicPause")?.addEventListener("click",()=>{
  const b=$("mxCinematicPause");
  const paused=$("mxCinematicFrame").classList.toggle("still");
  b.textContent=paused?"PLAY MOTION":"PAUSE MOTION";
 });
 document.querySelectorAll("#photosView [data-mx-men]").forEach(b=>{
  b.addEventListener("click",()=>requestAdult(b.getAttribute("data-mx-men")));
 });
 $("mxMenFavorites")?.addEventListener("click",()=>{
  const b=document.querySelector("#photosFilters [data-photo-filter=favorites]");
  b?.click();goTo(gallery());hint("Showing favorites in your authorized media collection.");
 });
 $("mxMenMyUploads")?.addEventListener("click",()=>{
  const b=document.querySelector("#photosFilters [data-photo-filter=mine]");
  b?.click();goTo(gallery());
 });
 for(const id of ["mxAgeModal","mxCinematicModal"]){
  $(id)?.addEventListener("click",e=>{if(e.target===$(id))close(id)});
 }
 document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){close("mxAgeModal");close("mxCinematicModal")}
 });
 // Do not expose demo assets as other members' actual uploads.
 if((()=>{try{return sessionStorage.getItem("mx_adult_session")==="confirmed"}catch(_){return false}})()){
  $("mxMenLock").hidden=true;$("mxMenBrowse").hidden=false;
 }
})();