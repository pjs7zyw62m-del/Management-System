/* BLACKCELL Visual Memory v1: protected browser-derived dHash for near-duplicate photos.
 * Does not identify uniforms, users, or grant publication rights.
 * No original or thumbnail is persisted to this table; only a 64-bit visual signature. */
const ALGORITHM="dhash-64-v1";
const MAX_PHOTO=45*1048576;
const $=id=>document.getElementById(id);
const status=(value)=>{const el=$("bcVisualMemoryStatus");if(el)el.textContent=String(value)};
const eligible=item=>item&&item.type==="asset"&&item.kind==="photo"&&item.owner&&!item.adult&&["pending","approved"].includes(item.status)&&["worlds","library","network"].includes(item.source);
const matching=(x,y)=>{let z=BigInt("0x"+x)^BigInt("0x"+y),n=0;while(z){z&=z-1n;n++}return n};
const matchClass=d=>d===0?"Identical fingerprint":d<=5?"Likely near-duplicate":"Visually similar (unverified)";
function makeRow(label,value,cls=""){
 const row=document.createElement("div");row.className="bc-visual-memory-pair"+(cls?" "+cls:"");
 const a=document.createElement("strong");a.textContent=label;
 const b=document.createElement("span");b.textContent=value;row.append(a,b);return row;
}
async function loadImage(blob){
 let width=0,height=0,image=null,release=()=>{};
 if(typeof createImageBitmap==="function"){
  image=await createImageBitmap(blob);width=image.width;height=image.height;release=()=>image.close();
 }else{
  const url=URL.createObjectURL(blob),img=new Image();img.src=url;
  try{await img.decode()}catch(err){URL.revokeObjectURL(url);throw err}
  image=img;width=img.naturalWidth;height=img.naturalHeight;release=()=>URL.revokeObjectURL(url);
 }
 try{
  if(!width||!height||width>100000||height>100000)throw Error("Unsupported dimensions");
  const canvas=document.createElement("canvas");canvas.width=9;canvas.height=8;
  const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});
  if(!ctx)throw Error("Canvas unsupported");
  ctx.drawImage(image,0,0,9,8);
  const raw=ctx.getImageData(0,0,9,8).data;let bits=0n;
  const lum=(x,y)=>{const j=(y*9+x)*4;return Math.round(raw[j]*.299+raw[j+1]*.587+raw[j+2]*.114)};
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   bits=(bits<<1n)|(lum(x,y)>lum(x+1,y)?1n:0n);
  }
  canvas.width=canvas.height=1;
  return {hash64:bits.toString(16).padStart(16,"0"),image_width:width,image_height:height};
 }finally{release()}
}
async function protectedPhoto(client,item,ownerId){
 if(!eligible(item)||item.owner!==ownerId)throw Error("Only your own non-restricted photos can be fingerprinted");
 let blob;
 if(item.provider==="world-bunny-v1"){
  const session=(await client.auth.getSession()).data?.session;
  const cfg=window.BLACKCELL_CORP_CONFIG||{};
  if(!session?.access_token||!cfg.url||!cfg.publishableKey)throw Error("Refresh corporate login");
  const response=await fetch(new URL("/functions/v1/blackcell-world-media?action=read",cfg.url),{
   method:"POST",headers:{authorization:"Bearer "+session.access_token,apikey:cfg.publishableKey,"content-type":"application/json"},
   body:JSON.stringify({id:item.id})
  });
  if(!response.ok)throw Error("Protected Bunny read HTTP "+response.status);
  if(Number(response.headers.get("content-length")||0)>MAX_PHOTO){await response.body?.cancel();throw Error("Original exceeds 45 MB limit")}
  blob=await response.blob();
 }else{
  if(!item.path)throw Error("Missing private storage path");
  const r=await client.storage.from("corp-social-media").download(item.path);
  if(r.error||!r.data)throw Error("Protected legacy photo unavailable");
  blob=r.data;
 }
 if(!blob.size||blob.size>MAX_PHOTO)throw Error("Photo is outside the safe fingerprint size limit");
 if(blob.type&&!blob.type.startsWith("image/"))throw Error("Not an image");
 return blob;
}
export function mountBlackcellVisualMemory({client,getUser,getItems,onChoose}){
 let current=[],loading=false,busy=false,lastResult=[];
 const count=$("bcVisualMemoryCount"),indexButton=$("bcIndexVisualBatch"),findButton=$("bcFindVisualPairs"),list=$("bcVisualMemoryPairs");
 function sync(){
  if(count)count.textContent=current.length+" INDEXED";
  if(indexButton)indexButton.disabled=busy||loading||!getUser();
  if(findButton)findButton.disabled=busy||loading||current.length<2;
 }
 async function refresh(){
  if(loading||busy||!getUser())return;
  loading=true;sync();
  try{
   const userId=getUser();
   const r=await client.from("corp_uniform_visual_fingerprints").select("asset_id,hash64,algorithm,updated_at")
    .eq("owner_id",userId).eq("algorithm",ALGORITHM).order("updated_at",{ascending:false}).limit(5000);
   if(r.error)throw r.error;
   current=r.data||[];sync();
   const eligibleCount=getItems().filter(item=>eligible(item)&&item.owner===userId).length;
   status("Stored signatures: "+current.length+" · Eligible loaded photos: "+eligibleCount+". Select Index Next 10 to add more. Originals remain in their existing protected storage.");
  }catch(err){status("Visual memory unavailable: "+String(err?.message||err).slice(0,180))}
  finally{loading=false;sync()}
 }
 async function buildBatch(){
  if(busy||loading)return;
  const userId=getUser();if(!userId)return;
  const indexed=new Set(current.map(x=>x.asset_id));
  const candidates=getItems().filter(item=>eligible(item)&&item.owner===userId&&!indexed.has(item.id)).slice(0,10);
  if(!candidates.length){status("All loaded eligible photos are indexed. More records may be accessible through Load more.");return}
  busy=true;sync();let saved=0,failed=0;
  try{
   for(let i=0;i<candidates.length;i++){
    const item=candidates[i];
    status("Indexing "+(i+1)+"/"+candidates.length+" private photos · "+saved+" saved · "+failed+" skipped");
    try{
     const blob=await protectedPhoto(client,item,userId);
     const sign=await loadImage(blob);
     const r=await client.from("corp_uniform_visual_fingerprints").upsert({
      owner_id:userId,asset_id:item.id,algorithm:ALGORITHM,...sign,updated_at:new Date().toISOString()
     },{onConflict:"owner_id,asset_id,algorithm"}).select("asset_id,hash64,algorithm,updated_at").single();
     if(r.error)throw r.error;
     current=current.filter(x=>x.asset_id!==item.id);current.push(r.data);saved++;
    }catch(err){failed++;if(failed<=2)status("Skipped "+item.title+": "+String(err?.message||err).slice(0,110))}
   }
   status("Visual memory indexed "+saved+" photo"+(saved===1?"":"s")+(failed?" · "+failed+" skipped.":" · All requests successful.")+" Photos are not moved or modified.");
   if(lastResult.length)findPairs();
  }finally{busy=false;sync()}
 }
 function findPairs(){
  list.replaceChildren();lastResult=[];
  const loaded=new Map(getItems().filter(x=>eligible(x)).map(item=>[item.id,item]));
  const indexed=current.filter(x=>loaded.has(x.asset_id)&&/^[a-f0-9]{16}$/.test(x.hash64));
  // Brute-force capped to 1000 loaded signatures; this is not a semantic vector search.
  const pool=indexed.slice(0,1000);
  for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){
   const d=matching(pool[i].hash64,pool[j].hash64);
   if(d<=10)lastResult.push({first:loaded.get(pool[i].asset_id),second:loaded.get(pool[j].asset_id),distance:d});
  }
  lastResult.sort((a,b)=>a.distance-b.distance);
  if(!lastResult.length){
   list.append(makeRow("No likely near-duplicates","Indexed photos compared: "+pool.length+". dHash won't detect every crop or all visually similar uniforms."));
  }else for(const pair of lastResult.slice(0,18)){
   const row=makeRow(matchClass(pair.distance)+" · distance "+pair.distance+"/64",
    pair.first.title+"  /  "+pair.second.title);
   const actions=document.createElement("div");actions.className="bc-visual-pair-actions";
   for(const item of [pair.first,pair.second]){
    const button=document.createElement("button");button.type="button";button.className="bc-btn bc-btn-outline";
    button.textContent="Inspect "+item.title.slice(0,35);
    button.onclick=()=>onChoose(item);
    actions.append(button);
   }
   row.append(actions);list.append(row);
  }
  status(lastResult.length+" candidate near-duplicate pairs out of "+pool.length+" loaded indexed photos. These are suggestions, not automatic deletion or verified identity.");
 }
 if(indexButton)indexButton.onclick=()=>void buildBatch();
 if(findButton)findButton.onclick=findPairs;
 sync();
 return {refresh,findPairs};
}
