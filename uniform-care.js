import {corporateClient,corporateAuthorize} from "./corp-auth.js?v=20261112-access2";
const byId=id=>document.getElementById(id);
const state={category:"all",search:""};
const guides=[...document.querySelectorAll(".uc-guide")];
function updateResults(){
 let shown=0;
 for(const guide of guides){
   const cat=guide.dataset.category||"",indexed=(guide.dataset.search||"")+" "+(guide.textContent||"");
   const matchCat=state.category==="all"||cat===state.category;
   const matchText=!state.search||indexed.toLowerCase().includes(state.search);
   guide.hidden=!(matchCat&&matchText);
   if(!guide.hidden)shown++;
 }
 byId("careResults").textContent=shown+" "+(shown===1?"guide":"guides")+" available";
 byId("careEmpty").hidden=shown!==0;
}
function updateProgress(guide){
 const checks=[...guide.querySelectorAll('input[type="checkbox"]')];
 const count=checks.filter(input=>input.checked).length;
 const progress=guide.querySelector(".uc-progress");
 if(progress)progress.textContent=count+" / "+checks.length+" DONE";
}
function addActions(){
 const search=byId("careSearch");
 search.addEventListener("input",()=>{state.search=search.value.trim().toLowerCase();updateResults()});
 for(const button of document.querySelectorAll(".uc-filters button")){
  button.addEventListener("click",()=>{
   state.category=button.dataset.filter||"all";
   for(const other of document.querySelectorAll(".uc-filters button")){
    const active=other===button;
    other.classList.toggle("is-active",active);
    other.setAttribute("aria-pressed",String(active));
   }
   updateResults();
  });
 }
 for(const guide of guides){
   guide.addEventListener("change",e=>{if(e.target.matches('input[type="checkbox"]'))updateProgress(guide)});
   guide.querySelector("[data-reset]")?.addEventListener("click",()=>{
    guide.querySelectorAll('input[type="checkbox"]').forEach(input=>input.checked=false);
    updateProgress(guide);
   });
 }
 const lightbox=byId("careLightbox"),big=byId("careLightboxImage"),caption=byId("careLightboxCaption"),close=byId("closeCareLightbox");
 let returnFocus=null;
 const shut=()=>{lightbox.hidden=true;big.removeAttribute("src");if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;};
 for(const button of document.querySelectorAll("[data-zoom]")){
   button.addEventListener("click",()=>{
    const img=button.querySelector("img");
    if(!img?.getAttribute("src"))return;
    big.src=img.src;
    big.alt=img.alt;
    caption.textContent=img.alt;
    lightbox.hidden=false;
    returnFocus=button;
    close.focus();
   });
 }
 close.addEventListener("click",shut);
 lightbox.addEventListener("click",e=>{if(e.target===lightbox)shut()});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!lightbox.hidden)shut()});
 updateResults();
}
async function verify(){
 const client=corporateClient();
 const {data:{session},error}=await client.auth.getSession();
 if(error||!session)throw Error("Sign in to your Blackcell corporate account to open Uniform Care.");
 const auth=await corporateAuthorize(client);
 if(!auth.ok)throw Error("Your account is not authorized for the corporate network.");
 const fn=auth.member.role==="owner"?"corp_code_status":"corp_employee_code_status";
 const {data:status,error:gateError}=await client.rpc(fn);
 if(gateError||status?.verified!==true)throw Error("Your corporate account is not authorized to open Uniform Care.");
}
async function start(){
 try{
  await verify();
  addActions();
  byId("careApp").hidden=false;
  byId("careGate").hidden=true;
 }catch(e){
  byId("careGateMessage").textContent=e?.message||"Unable to verify authorized access. Please sign in again.";
  console.warn("Uniform Care access verification failed:",e?.message||e);
 }
}
start();