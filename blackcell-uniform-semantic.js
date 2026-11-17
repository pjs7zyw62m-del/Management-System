/* BLACKCELL semantic uniform memory — user-approved, description-based search.
 * Uses prior uniform analysis text. Original image bytes never leave BLACKCELL.
 * Similarity scores are cosine similarities of text vectors, not calibrated confidence. */
const $ = id => document.getElementById(id);
const eligible = i => i && i.type==="asset" && i.kind==="photo" &&
  !i.adult && ["pending","approved"].includes(i.status) &&
  ["worlds","library","network"].includes(i.source);
const trim = (s,n=120) => String(s??"").slice(0,n);
const E = (tag,cls,value) => {
 const x=document.createElement(tag);x.className=cls||"";
 if(value!==undefined)x.textContent=String(value);return x;
};
export function mountBlackcellUniformSemantic({client,getUser,getItems,getReadyIds,onChoose}){
 let indexed=[],busy=false,loading=false;
 const count=$("bcSemanticCount"),status=$("bcSemanticStatus"),source=$("bcSemanticSource");
 const buttonIndex=$("bcSemanticIndex"),buttonFind=$("bcSemanticFind"),matches=$("bcSemanticMatches");
 const update=s=>{if(status)status.textContent=s};
 const candidates=()=>getItems().filter(i=>eligible(i)&&i.owner===getUser()&&getReadyIds().has(i.id));
 const getSourceId=()=>source.value||"";
 const sync=()=>{
  const owner=getUser();
  count.textContent=indexed.length+" INDEXED";
  buttonIndex.disabled=busy||loading||!owner||!candidates().some(i=>!indexed.some(e=>e.asset_id===i.id));
  buttonFind.disabled=busy||loading||!getSourceId()||indexed.length<2;
 };
 const options=()=>{
  const current=source.value;
  source.replaceChildren(new Option("Select indexed photo",""));
  const media=new Map(getItems().filter(eligible).map(i=>[i.id,i]));
  for(const e of indexed){
   const item=media.get(e.asset_id);
   if(!item)continue;
   source.add(new Option(trim(item.title,86),item.id));
  }
  if(indexed.some(i=>i.asset_id===current))source.value=current;
  else if(source.options.length===2)source.selectedIndex=1;
  sync();
 };
 async function refresh(){
  if(loading||busy||!getUser())return;
  loading=true;sync();
  try{
   const {data,error}=await client.from("corp_uniform_semantic_vectors")
    .select("asset_id,uniform_world,updated_at").eq("owner_id",getUser())
    .order("updated_at",{ascending:false}).limit(1000);
   if(error)throw error;
   indexed=data||[];options();
   update(indexed.length+" semantic descriptions indexed. "+candidates().length+" loaded photographs have usable AI or verified reference labels.");
  }catch(err){update("Semantic index unavailable: "+trim(err?.message||err,180))}
  finally{loading=false;sync()}
 }
 async function request(action,assetId){
  const {data,error}=await client.functions.invoke("blackcell-uniform-semantic",{
   body:{action,asset_id:assetId}
  });
  if(error){
   let message=error.message||"Semantic service unavailable";
   try{const detail=await error.context?.json?.();message=detail?.error||message}catch{}
   throw Error(trim(message,190));
  }
  if(!data?.ok)throw Error(trim(data?.error||"Semantic service refused request",190));
  return data;
 }
 async function indexBatch(){
  if(busy||loading||!getUser())return;
  const done=new Set(indexed.map(x=>x.asset_id)),todo=candidates().filter(i=>!done.has(i.id)).slice(0,10);
  if(!todo.length){update("Every loaded photo with a verified or AI description is already indexed. Refresh the catalog for additional photos.");return}
  if(!confirm("Create semantic matching vectors from up to "+todo.length+" previously saved uniform descriptions? Text describing uniforms and visible clothing will be sent to BLACKCELL's external AI embedding provider and may use API credits. Original photos and videos will not be sent or modified. Nothing will be published."))return;
  busy=true;sync();matches.replaceChildren();let saved=0,skipped=0,lastError="";
  try{
   for(let i=0;i<todo.length;i++){
    const item=todo[i];
    update("Indexing uniform "+(i+1)+"/"+todo.length+": "+trim(item.title,50));
    try{
     await request("index",item.id);
     saved++;indexed.push({asset_id:item.id,uniform_world:"unsorted"});
    }catch(err){
     skipped++;lastError=trim(err.message,150);
     // Misconfigured provider, exhausted budget or access errors affect the batch.
     if(/unavailable|limit|rate|credential|forbidden|permission|not configured/i.test(lastError))break;
    }
   }
   update(saved+" semantic descriptions indexed"+(skipped?", "+skipped+" skipped. "+lastError:".")+" You can now select a photograph and search for similar uniform descriptions.");
  }finally{busy=false;sync();await refresh()}
 }
 async function findSimilar(){
  if(busy||loading||!getSourceId())return;
  const id=getSourceId(),selected=getItems().find(i=>i.id===id);
  busy=true;sync();matches.replaceChildren();
  update("Comparing uniforms against the protected semantic index…");
  try{
   const result=await request("neighbors",id);
   const found=result.matches||[];
   if(!found.length){
    matches.append(E("p","bc-semantic-empty","No other indexed uniforms to compare. Index more photos first."));
   }else{
    const all=new Map(getItems().map(i=>[i.id,i]));
    const intro=E("p","bc-semantic-summary","Nearest uniform-description matches for "+trim(selected?.title||"selected media",90)+". Scores measure relative text-vector similarity, NOT identification confidence.");
    matches.append(intro);
    for(const m of found){
     const card=E("article","bc-semantic-result");
     const title=E("strong","",trim(m.filename||"Photograph",100));
     const score=Math.max(-1,Math.min(1,Number(m.similarity)||0));
     const meter=E("span","bc-semantic-score","Similarity "+score.toFixed(3)+" · "+trim(m.uniform_world,30));
     card.append(title,meter);
     const item=all.get(m.asset_id);
     if(item){
      const inspect=E("button","bc-btn bc-btn-outline","Inspect original");
      inspect.type="button";inspect.onclick=()=>onChoose(item);card.append(inspect);
     }else card.append(E("small","bc-semantic-note","Photo is not loaded in the current catalog page."));
     matches.append(card);
    }
   }
   update(found.length+" nearest matches returned. Verify insignia, country and branch independently; similar descriptors are not proof.");
  }catch(err){update("Semantic search failed: "+trim(err?.message||err,180))}
  finally{busy=false;sync()}
 }
 if(buttonIndex)buttonIndex.onclick=()=>void indexBatch();
 if(buttonFind)buttonFind.onclick=()=>void findSimilar();
 if(source)source.onchange=sync;
 sync();return {refresh};
}
