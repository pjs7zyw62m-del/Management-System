import {corporateClient,corporateAuthorize} from "./corp-auth.js?v=20261109-staff1";
import {mountMilitaryGunner} from "./military-gunner.js?v=20261110-fast4";
const $=id=>document.getElementById(id);
const client=corporateClient();
const storage=client.storage.from("corp-social-media");
const state={user:null,member:null,assets:[],urls:new Map(),view:[],discovered:[],saved:[],allCodes:[],current:null,position:0};
const isoName=new Intl.DisplayNames(["en"],{type:"region"});
const CODE=/^[A-Z]{2}$/;
const safeCodes=(input)=>[...new Set((input||[]).map(x=>String(x).toUpperCase().trim()).filter(x=>CODE.test(x)))].slice(0,12);
const countryName=c=>{try{const value=isoName.of(c);return value&&value!==c?value:c}catch(_){return c}};
const flag=c=>CODE.test(c)?String.fromCodePoint(...[...c].map(ch=>127397+ch.charCodeAt(0))):"🌍";
const titleFor=c=>c==="US"?"UNITED STATES":countryName(c).toUpperCase();
const isPhoto=a=>a.kind==="photo";
const authorizedAssets=()=>state.assets.filter(a=>["library","post"].includes(a.purpose)&&isPhoto(a));
const galleryFor=()=>authorizedAssets().filter(a=>state.view.includes(String(a.military_country_code||"").toUpperCase()));
const field=(key,elt,value)=>{if(elt)elt[key]=value};
function toast(msg){$("siteToast").textContent=String(msg);$("siteToast").hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("siteToast").hidden=true,5000)}
function pageFor(codes){
 const list=safeCodes(codes);
 return "military-country.html?countries="+encodeURIComponent(list.join(","));
}
function prettyCountry(a){return countryName(String(a.military_country_code||"").toUpperCase())}
function nameSort(a,b){return a==="US"?-1:b==="US"?1:countryName(a).localeCompare(countryName(b))}
function pageUrl(codes){return pageFor(codes)}
function viewTitle(){return state.view.length===1?titleFor(state.view[0]):state.view.map(titleFor).join(" + ")}
function navCodes(){
 const params=new URLSearchParams(location.search);
 const list=params.get("countries")||params.get("country")||"US";
 return safeCodes(list.split(","));
}
async function verify(){
 const {data:{session},error}=await client.auth.getSession();
 if(error||!session)throw Error("Sign in to your corporate account before opening country pages.");
 const auth=await corporateAuthorize(client);
 if(!auth.ok)throw Error("Your account is not authorized to view the Military Library.");
 const rpc=auth.member.role==="owner"?"corp_code_status":"corp_employee_code_status";
 const {data:status,error:gateError}=await client.rpc(rpc);
 if(gateError||status?.verified!==true)throw Error("Verify your Blackcell access pass, then reopen this country page.");
 state.user=auth.user;state.member=auth.member;
}
async function loadPages(){
 const {data,error}=await client.from("corp_social_country_collections")
  .select("id,title,country_codes").eq("user_id",state.user.id).limit(100);
 if(error){console.warn("Country favorites not available",error.message);state.saved=[];return}
 state.saved=data||[];
}
async function loadAssets(){
 const {data,error}=await client.from("corp_social_assets")
  .select("id,owner_id,kind,purpose,mime_type,filename,caption,created_at,storage_path,military_country_code,military_category,military_branch,military_era,military_unit,military_tags")
  .in("purpose",["post","library"]).order("created_at",{ascending:false}).limit(2500);
 if(error)throw Error("Authorized military photographs could not be loaded: "+error.message);
 state.assets=data||[];
 const map=new Map();
 for(const a of authorizedAssets()){
  const code=String(a.military_country_code||"").toUpperCase();
  if(CODE.test(code))map.set(code,(map.get(code)||0)+1);
 }
 state.discovered=[...map.keys()].sort(nameSort);
 state.counts=map;
 state.allCodes=[...new Set(["US",...state.discovered])].sort(nameSort);
}
async function signedImages(){
 state.urls.clear();
 const photos=galleryFor().filter(a=>a.storage_path);
 const batch=25;
 for(let i=0;i<photos.length;i+=batch){
  const chunk=photos.slice(i,i+batch);
  const {data,error}=await storage.createSignedUrls(chunk.map(x=>x.storage_path),1800);
  if(error){console.warn("Some private media URLs unavailable",error.message);continue}
  chunk.forEach((a,j)=>{if(data?.[j]?.signedUrl)state.urls.set(a.id,data[j].signedUrl)});
 }
}
function renderHero(){
 const mode=state.view.length===1&&state.view[0]==="US"?"usa":state.view.length>1?"hybrid":"nation";
 document.body.dataset.pageTheme=mode;
 const title=state.view.length===1?titleFor(state.view[0]):state.view.map(titleFor).join(" + ");
 const isUs=mode==="usa";
 $("heroFlags").textContent=state.view.map(flag).join("  ");
 $("heroEyebrow").textContent=state.view.length>1?"BLACKCELL / "+state.view.length+"-NATION HYBRID ARCHIVE":
  isUs?"BLACKCELL / UNITED STATES ARMED FORCES":"BLACKCELL / "+title+" MILITARY ARCHIVE";
 $("pageTitle").textContent=state.view.length>1?title+" HYBRID MILITARY":title+" MILITARY";
 $("heroDescription").textContent=state.view.length>1?
  "A dedicated hybrid military page combining "+state.view.map(countryName).join(" and ")+". Photographs appear automatically as their country classifications are approved.":
  "A dedicated "+countryName(state.view[0])+" military archive, separate from the Global Military Library. Newly approved photos with this country automatically appear here.";
 $("heroSeal").textContent=isUs?"US":state.view.length>1?"HX":state.view[0];
 const visible=galleryFor();
 $("photoCount").textContent=String(visible.length);
 $("countryCount").textContent=String(state.view.length);
 $("branchCount").textContent=String(new Set(visible.map(x=>x.military_branch).filter(x=>x&&x!=="Unspecified")).size);
 $("galleryTitle").textContent=state.view.length>1?"HYBRID MILITARY PHOTOGRAPHS":title+" MILITARY PHOTOGRAPHS";
 $("gallerySubtext").textContent=visible.length+" photograph"+(visible.length===1?"":"s")+" in this dedicated "+(state.view.length>1?"hybrid":"country")+" collection.";
 document.title="BLACKCELL — "+title+(state.view.length>1?" Hybrid":" Military");
}
function renderDirectory(){
 const root=$("countryCards"),select=$("addCountry");
 root.replaceChildren();select.replaceChildren(new Option("Select another country…",""));
 const codes=[...state.allCodes];
 // One native auto-generated page for every country with a classified photo.
 for(const code of codes){
  const n=state.counts?.get(code)||0;
  const entry=document.createElement("a");
  entry.href=pageFor([code]);entry.className="country-card";
  entry.classList.toggle("selected",state.view.length===1&&state.view[0]===code);
  const f=document.createElement("span");f.className="flag";f.textContent=flag(code);
  const title=document.createElement("strong");title.textContent=countryName(code);
  const count=document.createElement("small");count.textContent=n+" classified photo"+(n===1?"":"s");
  const type=document.createElement("span");type.className="country-id";
  type.textContent=code==="US"?"USA DEDICATED PAGE":n?"AUTO-DISCOVERED COUNTRY":"STARTER COUNTRY PAGE";
  entry.append(f,title,count,type);root.append(entry);
  select.add(new Option(flag(code)+" "+countryName(code),code));
 }
}
function renderTokens(){
 const host=$("selectedCountries");host.replaceChildren();
 for(const code of state.builder){
  const button=document.createElement("button");button.type="button";
  button.textContent=flag(code)+" "+countryName(code)+" ×";
  button.title="Remove "+countryName(code);
  button.addEventListener("click",()=>{
   state.builder=state.builder.filter(x=>x!==code);renderTokens();
  });host.append(button);
 }
 $("hybridStatus").textContent=state.builder.length>1?
  "Ready: "+state.builder.map(countryName).join(" + ")+" will open as its own hybrid military page.":
  "Choose at least two countries for a hybrid page.";
}
function renderSavedHybrids(){
 const host=$("savedHybridPages");host.replaceChildren();
 for(const page of state.saved.filter(x=>Array.isArray(x.country_codes)&&x.country_codes.length>1)){
  const a=document.createElement("a");a.href=pageFor(page.country_codes);
  a.textContent=page.country_codes.map(flag).join(" ")+" "+page.title;
  host.append(a);
 }
}
function renderPhotos(){
 const holder=$("photoGallery");holder.replaceChildren();
 const query=$("gallerySearch").value.toLowerCase().trim();
 const visible=galleryFor().filter(a=>!query||[a.filename,a.caption,a.military_branch,a.military_category,a.military_tags?.join(" ")].some(x=>String(x||"").toLowerCase().includes(query)));
 $("galleryEmpty").hidden=visible.length!==0;
 state.shown=visible;
 visible.forEach((asset,i)=>{
  const button=document.createElement("button");button.type="button";button.className="photo-card";
  const img=document.createElement("img");img.loading="lazy";img.alt=asset.filename||"Military photo";
  const url=state.urls.get(asset.id);
  if(url)img.src=url;
  const info=document.createElement("span");info.className="photo-info";
  const label=document.createElement("span");label.className="country-chip";
  label.textContent=flag(asset.military_country_code)+" "+prettyCountry(asset);
  const title=document.createElement("strong");title.textContent=asset.filename||"Military photograph";
  const sub=document.createElement("small");
  sub.textContent=[asset.military_branch&&asset.military_branch!=="Unspecified"?asset.military_branch:null,asset.military_category].filter(Boolean).join(" / ")||"Country classification saved";
  info.append(label,title,sub);button.append(img,info);
  button.addEventListener("click",()=>openPhoto(i));holder.append(button);
 });
}
function openPhoto(index){
 if(!state.shown?.length)return;
 state.position=(index+state.shown.length)%state.shown.length;
 const a=state.shown[state.position],url=state.urls.get(a.id);
 state.current=a;
 $("photoLightbox").hidden=false;
 $("lightboxTitle").textContent=a.filename||"MILITARY PHOTOGRAPH";
 $("lightboxImage").alt=a.filename||"Selected military photograph";
 if(url)$("lightboxImage").src=url;else $("lightboxImage").removeAttribute("src");
 $("openFullPhoto").href=url||"#";
 $("openFullPhoto").hidden=!url;
 $("lightboxMeta").textContent=[
  prettyCountry(a),a.military_branch,a.military_category,a.military_era
 ].filter(Boolean).join(" · ");
}
function closePhoto(){$("photoLightbox").hidden=true;state.current=null}
async function navigate(codes,{saveHybrid=false}={}){
 const valid=safeCodes(codes);
 if(!valid.length){toast("Select at least one country.");return}
 if(saveHybrid&&valid.length>1){
  const normalized=[...valid].sort();
  let found=state.saved.find(p=>Array.isArray(p.country_codes)&&[...p.country_codes].sort().join(",")===normalized.join(","));
  if(!found){
   const title=valid.map(c=>c==="US"?"USA":countryName(c)).join(" + ")+" Hybrid";
   const {data,error}=await client.from("corp_social_country_collections")
    .insert({user_id:state.user.id,country_codes:normalized,title:title.slice(0,80)})
    .select("id,title,country_codes").single();
   if(error)toast("Hybrid page can open, but the saved shortcut failed: "+error.message);
   else{state.saved.push(data);renderSavedHybrids()}
  }
 }
 location.assign(pageFor(valid));
}
function installEvents(){
 $("gallerySearch").addEventListener("input",renderPhotos);
 $("reloadPhotos").addEventListener("click",()=>void reload());
 $("addCountryButton").addEventListener("click",()=>{
  const code=$("addCountry").value;if(!CODE.test(code))return;
  if(state.builder.includes(code)){toast("Country already selected.");return}
  if(state.builder.length>=12){toast("Select up to 12 countries.");return}
  state.builder.push(code);renderTokens();$("addCountry").value="";
 });
 $("openHybrid").addEventListener("click",()=>void navigate(state.builder,{saveHybrid:true}));
 $("closeLightbox").addEventListener("click",closePhoto);
 $("photoLightbox").addEventListener("click",e=>{if(e.target===$("photoLightbox"))closePhoto()});
 $("lightboxPrevious").addEventListener("click",()=>openPhoto(state.position-1));
 $("lightboxNext").addEventListener("click",()=>openPhoto(state.position+1));
 $("askGunnerPhoto").addEventListener("click",()=>{
  $("photoLightbox").hidden=true;
  window.BLACKCELL_GUNNER?.open?.();
  window.BLACKCELL_GUNNER?.setPrompt?.("Gunner, what can you tell me about the currently selected photograph?");
 });
 document.addEventListener("keydown",e=>{
  if($("photoLightbox").hidden)return;
  if(e.key==="Escape")closePhoto();
  if(e.key==="ArrowRight")openPhoto(state.position+1);
  if(e.key==="ArrowLeft")openPhoto(state.position-1);
 });
}
async function reload(){
 $("reloadPhotos").disabled=true;
 try{await loadAssets();await signedImages();renderHero();renderDirectory();renderPhotos();toast("Country archive refreshed. Newly classified countries appear automatically.")}
 catch(err){toast(err.message||"Refresh failed")}finally{$("reloadPhotos").disabled=false}
}
async function boot(){
 try{
  await verify();
  await Promise.all([loadAssets(),loadPages()]);
  state.view=navCodes();
  if(!state.view.length)state.view=["US"];
  state.builder=[...state.view];
  await signedImages();
  renderHero();renderDirectory();renderTokens();renderSavedHybrids();renderPhotos();
  installEvents();
  $("accessGate").hidden=true;$("countryApp").hidden=false;
  mountMilitaryGunner({client,getContext:()=>({
   page_title:document.title.replace(/^BLACKCELL — /,""),
   countries:state.view,
   photo_id:state.current?.id||null
  }),mount:$("gunnerMount")});
 }catch(error){
  $("accessMessage").textContent=String(error?.message||"Unable to open this country page");
  console.error("Country archive access problem",error?.message);
 }
}
void boot();
