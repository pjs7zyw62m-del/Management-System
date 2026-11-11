import {corporateClient,corporateAuthorize} from "./corp-auth.js?v=20261109-staff1";
import {mountMilitaryGunner} from "./military-gunner.js?v=20261110-fast4";
import {createUsaPhotoOfDay} from "./usa-photo-of-day.js?v=20261111-bento3";
const $=id=>document.getElementById(id);
const client=corporateClient();
const storage=client.storage.from("corp-social-media");
const state={user:null,member:null,assets:[],urls:new Map(),view:[],discovered:[],saved:[],allCodes:[],current:null,position:0,branch:"all",category:"all",era:"all"};
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
function navCodes(){return ["US"]; /* U.S.-only preview; other country pages stay on the current live route. */}
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
  .select("id,owner_id,kind,purpose,mime_type,filename,caption,created_at,storage_path,military_country_code,military_category,military_branch,military_era,military_year,military_unit,military_tags")
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
function archiveEraSpan(assets){
 const years=assets.map(a=>{
  const year=Number(a.military_year);
  if(Number.isInteger(year)&&year>=1850&&year<=2100)return year;
  const era=String(a.military_era||"").match(/\b(?:18|19|20)\d{2}\b/);
  return era?Number(era[0]):null;
 }).filter(Number.isFinite).sort((x,y)=>x-y);
 if(!years.length)return "NOT SET";
 const first=Math.floor(years[0]/10)*10,last=Math.floor(years[years.length-1]/10)*10;
 return first===last?first+"s":first+"s–"+last+"s";
}
function renderHero(){
 const assets=galleryFor();
 document.body.dataset.pageTheme="usa";
 const title=$("pageTitle");
 title.replaceChildren();
 const lineOne=document.createElement("span"),lineTwo=document.createElement("em");
 lineOne.textContent="UNITED STATES";lineTwo.textContent="ARMED FORCES.";
 title.append(lineOne,lineTwo);
 const eyebrow=$("heroEyebrow");
 eyebrow.replaceChildren();
 const dot=document.createElement("span");
 dot.className="crumb-dot";dot.setAttribute("aria-hidden","true");
 eyebrow.append(dot,document.createTextNode("BLACKCELL // UNITED STATES ARMED FORCES"));
 $("heroDescription").textContent="Explore the uniforms, personnel, training, and history of the U.S. Armed Forces through your existing private photo collection.";
 $("photoCount").textContent=String(assets.length);
 $("branchCount").textContent=String(new Set(assets.map(branchOf).filter(x=>x!=="unclassified")).size);
 $("eraSpan").textContent=archiveEraSpan(assets);
 $("galleryTitle").textContent="MILITARY PHOTO ARCHIVE";
 $("gallerySubtext").textContent=assets.length+" United States photograph"+(assets.length===1?"":"s")+" available in your protected archive.";
 document.title="BLACKCELL — United States Armed Forces | Redesign Preview";
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
/* Branch-specific U.S. browsing. This classifies only existing metadata; no
   new photos are created, imported, or exposed outside the signed-in session. */
const SERVICES=[
 {id:"army",code:"01 / LAND",name:"U.S. ARMY",personnel:"SOLDIERS"},
 {id:"marines",code:"02 / EXPEDITIONARY",name:"MARINE CORPS",personnel:"MARINES"},
 {id:"navy",code:"03 / SEA",name:"U.S. NAVY",personnel:"SAILORS"},
 {id:"air",code:"04 / AIR",name:"AIR FORCE",personnel:"AIRMEN"},
 {id:"space",code:"05 / SPACE",name:"SPACE FORCE",personnel:"GUARDIANS"},
 {id:"coast",code:"06 / MARITIME",name:"COAST GUARD",personnel:"COAST GUARDSMEN"}
];
const branches={...Object.fromEntries(SERVICES.map(x=>[x.id,x.name])),guard:"NATIONAL GUARD"};
const photoCountByService=id=>galleryFor().filter(a=>branchOf(a)===id).length;
function chooseInitialFeatured(){
 // Highest real photo count; use archive order to break ties, never placeholder counts.
 return [...SERVICES].sort((a,b)=>photoCountByService(b.id)-photoCountByService(a.id))[0]?.id||"army";
}
function serviceCover(id){
 return galleryFor().find(a=>branchOf(a)===id&&state.urls.get(a.id))||null;
}
function makeElement(tag,className,textValue){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(textValue!==undefined)el.textContent=textValue;
 return el;
}
function showFeaturedService(){
 const service=SERVICES.find(s=>s.id===state.featuredBranch)||SERVICES[0];
 const count=photoCountByService(service.id);
 $("featuredBranch").dataset.branch=service.id;
 $("featuredBranch").setAttribute("aria-label","View "+service.name+" photo archive");
 $("featuredBranch").setAttribute("aria-pressed",String(state.branch===service.id));
 $("featuredBranch").classList.toggle("active",state.branch===service.id);
 $("featuredBranchCode").textContent=service.code;
 $("featuredBranchPersonnel").textContent=service.personnel;
 $("featuredBranchTitle").textContent=service.name;
 $("featuredBranchCount").textContent=count+" PHOTO"+(count===1?"":"S");
 $("featuredBranchCount").classList.toggle("empty",!count);
 const asset=serviceCover(service.id);
 const image=$("featuredBranchImage");
 if(asset){
  image.src=state.urls.get(asset.id);
  image.alt=service.name+" military photograph";
  image.hidden=false;
 }else{
  image.hidden=true;image.removeAttribute("src");
 }
}
function renderSecondaryServices(){
 const host=$("secondaryBranches");
 host.replaceChildren();
 for(const item of SERVICES.filter(s=>s.id!==state.featuredBranch)){
  const count=photoCountByService(item.id);
  const button=makeElement("button","bento-small");
  button.type="button";
  button.dataset.branch=item.id;
  button.classList.toggle("has-photos",count>0);
  button.setAttribute("aria-pressed",String(state.branch===item.id));
  button.setAttribute("aria-label","Show "+item.name+" photo archive, "+count+" photos");
  const top=makeElement("span","bento-small-top");
  top.append(makeElement("span","",item.code),makeElement("span","","↗"));
  const bottom=makeElement("span","bento-small-bottom");
  bottom.append(makeElement("strong","",item.name));
  const footer=makeElement("span","bento-small-footer");
  footer.append(makeElement("span","",item.personnel),makeElement("span","bento-small-count",count+" PHOTO"+(count===1?"":"S")));
  bottom.append(footer);
  button.append(top,bottom);
  button.addEventListener("click",()=>setBranch(item.id));
  host.append(button);
 }
}
function setBranch(id){
 if(id!=="guard"&&!SERVICES.some(s=>s.id===id))return;
 state.featuredBranch=id==="guard"?state.featuredBranch:id;
 state.branch=id;
 renderBranchCounters();
 renderPhotos();
 if(window.innerWidth<700)$("galleryTitle").scrollIntoView({behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
}

function branchOf(asset){
 const raw=String(asset.military_branch||"").toLowerCase();
 if(/national.guard|\b(?:arng|ang)\b/.test(raw))return "guard";
 if(/coast.guard|\buscg\b/.test(raw))return "coast";
 if(/space.force|spaceforce|guardian|\bussf\b/.test(raw))return "space";
 if(/marine|\busmc\b/.test(raw))return "marines";
 if(/navy|naval|sailor|\busn\b/.test(raw))return "navy";
 if(/air.force|airman|airmen|\busaf\b/.test(raw))return "air";
 if(/army|soldier/.test(raw))return "army";
 return "unclassified";
}
function renderBranchCounters(){
 showFeaturedService();
 renderSecondaryServices();
 const guard=photoCountByService("guard");
 const guardCount=document.querySelector('[data-count="guard"]');
 if(guardCount)guardCount.textContent=guard+" PHOTO"+(guard===1?"":"S");
 document.querySelectorAll('.component-link[data-branch="guard"]').forEach(el=>{
  el.classList.toggle("active",state.branch==="guard");
  el.setAttribute("aria-pressed",String(state.branch==="guard"));
 });
 $("clearBranch").hidden=state.branch==="all";
 $("selectedBranchLabel").textContent=state.branch==="all"?"ALL MILITARY BRANCHES":branches[state.branch]||"UNCLASSIFIED";
}
function renderFilterOptions(){
 const all=galleryFor();
 const data=[
  {id:"categoryFilter",key:"military_category",stateKey:"category"},
  {id:"eraFilter",key:"military_era",stateKey:"era"}
 ];
 for(const {id,key,stateKey} of data){
  const target=$(id),previous=state[stateKey];
  const blank=key==="military_category"?"All categories":"All eras";
  target.replaceChildren(new Option(blank,"all"));
  const vals=[...new Set(all.map(a=>String(a[key]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  for(const value of vals)target.add(new Option(value,value));
  if(!vals.includes(previous))state[stateKey]="all";
  target.value=state[stateKey];
 }
}
function renderPhotos(){
 const holder=$("photoGallery");holder.replaceChildren();
 const query=$("gallerySearch").value.toLowerCase().trim();
 const visible=galleryFor().filter(a=>
  (state.branch==="all"||branchOf(a)===state.branch)&&
  (state.category==="all"||String(a.military_category||"").trim()===state.category)&&
  (state.era==="all"||String(a.military_era||"").trim()===state.era)&&
  (!query||[a.filename,a.caption,a.military_branch,a.military_category,a.military_era,a.military_unit,a.military_tags?.join(" ")].some(x=>String(x||"").toLowerCase().includes(query)))
 );
 $("galleryEmpty").hidden=visible.length!==0;
 $("visibleCount").textContent=visible.length+" PHOTOGRAPH"+(visible.length===1?"":"S");
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
const dailyPhoto=createUsaPhotoOfDay({
 client,
 getUser:()=>state.user,
 getAssets:()=>galleryFor(),
 getSignedUrl:a=>state.urls.get(a.id)||null,
 openAsset:asset=>{
  let index=(state.shown||[]).findIndex(x=>x.id===asset.id);
  if(index<0){
   state.shown=[asset,...galleryFor().filter(a=>a.id!==asset.id)];
   index=0;
  }
  openPhoto(index);
 }
});
function installEvents(){
 dailyPhoto.setup();
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)void dailyPhoto.refreshIfNewDay?.()});
 $("gallerySearch").addEventListener("input",renderPhotos);
 $("categoryFilter").addEventListener("change",e=>{state.category=e.target.value;renderPhotos()});
 $("eraFilter").addEventListener("change",e=>{state.era=e.target.value;renderPhotos()});
 $("featuredBranch").addEventListener("click",()=>setBranch(state.featuredBranch));
 document.querySelectorAll('.component-link[data-branch="guard"]').forEach(el=>
  el.addEventListener("click",()=>setBranch("guard")));
 $("clearBranch").addEventListener("click",()=>{
  state.branch="all";renderBranchCounters();renderPhotos();
 });
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
 try{await loadAssets();await signedImages();if(!state.featuredBranch)state.featuredBranch=chooseInitialFeatured();renderHero();renderDirectory();renderFilterOptions();renderBranchCounters();renderPhotos();await dailyPhoto.refresh();toast("United States military photographs refreshed.")}
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
  state.featuredBranch=chooseInitialFeatured();
  renderHero();renderDirectory();renderTokens();renderSavedHybrids();renderFilterOptions();renderBranchCounters();renderPhotos();
  installEvents();
  $("accessGate").hidden=true;$("countryApp").hidden=false;
  void dailyPhoto.refresh();
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
