import { createClient } from "npm:@supabase/supabase-js@2.80.0";

/* BLACKCELL Uniform Semantic Memory.
   Embeds previously stored neutral visual descriptions, NOT original image bytes.
   Owner-only, explicit API-credit use, and never changes publication state. */
const ORIGINS = new Set([
  "https://blackcellcorp.com", "https://www.blackcellcorp.com",
  "https://pjs7zyw62m-del.github.io"
]);
const MODEL = "text-embedding-3-small";
const DIMENSIONS = 512;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORLDS = new Set(["military","police","fire","medical","security","professional","unsorted"]);
const KEY = Deno.env.get("OPENAI_API_KEY") || "";

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin || "") ? origin! : "https://blackcellcorp.com",
    "Access-Control-Allow-Headers": "authorization,apikey,x-client-info,content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin"
  };
}
function respond(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors(origin), "Content-Type":"application/json", "Cache-Control":"no-store" }
  });
}
const clean = (x: unknown, max = 140): string =>
  String(x ?? "").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const safeArray = (x: unknown, max = 15): string[] =>
  Array.isArray(x) ? x.filter(t => typeof t === "string" && !t.startsWith("maf:"))
    .map(t => clean(t,55)).filter(Boolean).slice(0,max) : [];

function describe(ai: Record<string,unknown> | null, ref: Record<string,unknown> | null) {
  const tags = safeArray(ai?.tags);
  const worldTag = Array.isArray(ai?.tags) ?
    ai.tags.find(t => typeof t === "string" && /^maf:(military|police|fire|medical|security|professional|unsorted)$/.test(t)) : "";
  const world = clean(ref?.world || (typeof worldTag === "string" ? worldTag.slice(4) : "unsorted"),25);
  const lines: string[] = ["Visible uniform and clothing details in an archived photographic analysis"];
  const add = (name: string, value: unknown, len = 140) => {
    const txt = clean(value,len);
    if(txt && !["unsorted","unspecified","unknown","n/a"].includes(txt.toLowerCase()))
      lines.push(name + ": " + txt);
  };
  add("Uniform World",WORLDS.has(world) ? world : "unsorted");
  add("Uniform designation",ref?.uniform_name || ai?.uniform_type);
  add("Camouflage pattern",ref?.camouflage_pattern || ai?.camouflage_pattern);
  add("Service branch",ref?.branch || ai?.military_branch);
  add("Uniform country code",ref?.country_code || ai?.country_code,2);
  add("Uniform category",ref?.category || ai?.military_category);
  add("Era",ref?.era);
  add("Visible attributes",tags.join(", "),650);
  add("Verified visual evidence",ref?.visual_evidence,320);
  add("Distinctive markings",ref?.distinguishing_features,220);
  add("Observed image details",ai?.notes,550);
  if(lines.length <= 1)throw Error("No usable visual observations found");
  return { world: WORLDS.has(world) ? world : "unsorted",
    description: lines.join(". ").slice(0,2100) };
}
async function digestHex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if (req.method !== "POST" && req.method !== "GET")return respond({error:"Method not allowed"},405,origin);
  const bearer = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(bearer))return respond({error:"Corporate login required"},401,origin);
  const url = Deno.env.get("SUPABASE_URL") || "";
  let pub = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!pub) {
    try { pub = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default || ""; }
    catch { /* no key */ }
  }
  if (!url || !pub)return respond({error:"Supabase configuration unavailable"},503,origin);
  const client = createClient(url,pub,{
    global:{headers:{Authorization:bearer}},
    auth:{autoRefreshToken:false,persistSession:false}
  });
  const {data:{user},error:authError} = await client.auth.getUser();
  if (authError || !user)return respond({error:"Verified session required"},401,origin);
  const [member,gate] = await Promise.all([
    client.from("corp_access_members").select("role,active,clearance_level").eq("user_id",user.id).maybeSingle(),
    client.rpc("corp_code_status")
  ]);
  if (member.error || !member.data?.active || member.data.role !== "owner" ||
      Number(member.data.clearance_level) !== 7 ||
      gate.error || gate.data?.ok !== true || gate.data?.verified !== true)
    return respond({error:"Verified BLACKCELL Level 7 owner required"},403,origin);
  if (req.method === "GET")
    return respond({ok:true,configured:!!KEY,method:"semantic-descriptor-embedding",model:MODEL},200,origin);
  let body: {action?:string,asset_id?:string};
  try { body = await req.json(); } catch { return respond({error:"Invalid JSON"},400,origin); }
  if (!["index","neighbors"].includes(String(body?.action)) || !UUID.test(String(body?.asset_id||"")))
    return respond({error:"Valid action and photo ID required"},422,origin);

  const assetId = String(body.asset_id);
  const {data:asset,error:assetError} = await client.from("corp_social_assets")
    .select("id,owner_id,kind,purpose,review_status,adult_restricted")
    .eq("owner_id",user.id).eq("id",assetId).maybeSingle();
  if (assetError || !asset || asset.kind !== "photo" ||
      !["post","library"].includes(asset.purpose) ||
      !["approved","pending"].includes(asset.review_status) ||
      asset.adult_restricted !== false)
    return respond({error:"Owned, non-restricted library photo required"},403,origin);

  if (body.action === "neighbors") {
    const {data:neighbors,error} = await client.rpc("bc_uniform_semantic_neighbors",{
      p_asset_id:assetId,p_max_results:12
    });
    if (error)return respond({error:"Semantic search unavailable",detail:error.code||""},503,origin);
    return respond({ok:true,matches:(neighbors||[]).map((r:Record<string,unknown>)=>({
      asset_id:r.asset_id,filename:clean(r.filename,130),
      uniform_world:clean(r.uniform_world,30),
      similarity:Number(r.similarity)||0
    })),metric:"cosine_similarity_not_probability"},200,origin);
  }

  if (!KEY)return respond({error:"AI embedding credentials unavailable",code:"AI_NOT_CONFIGURED"},503,origin);
  const [analysis,reference] = await Promise.all([
    client.from("corp_social_ai_analysis")
      .select("country_code,military_branch,military_category,uniform_type,camouflage_pattern,notes,tags")
      .eq("owner_id",user.id).eq("asset_id",assetId).maybeSingle(),
    client.from("corp_uniform_training_references")
      .select("world,country_code,branch,category,uniform_name,camouflage_pattern,era,visual_evidence,distinguishing_features")
      .eq("owner_id",user.id).eq("source_kind","asset")
      .eq("source_id",assetId).eq("reference_status","verified")
      .order("updated_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  if (analysis.error || reference.error)return respond({error:"Private recognition records unavailable"},503,origin);
  if (!analysis.data && !reference.data)
    return respond({error:"Analyze or verify this photo first, then index it",code:"NO_VISUAL_LABELS"},409,origin);

  let descriptor;
  try { descriptor = describe(analysis.data,reference.data); }
  catch {return respond({error:"Insufficient visual evidence for semantic matching"},422,origin)}
  const checksum = await digestHex(descriptor.description);
  const prior = await client.from("corp_uniform_semantic_vectors")
    .select("source_checksum").eq("owner_id",user.id).eq("asset_id",assetId).maybeSingle();
  if (prior.error)return respond({error:"Cannot inspect previous semantic index"},503,origin);
  if (prior.data?.source_checksum === checksum)
    return respond({ok:true,indexed:true,cached:true,source:"existing_visual_description"},200,origin);

  // Pilot cap; avoids unbounded embedding charges on mass uploads.
  const {count, error:limitError} = await client.from("corp_uniform_semantic_vectors")
    .select("asset_id",{count:"exact",head:true}).eq("owner_id",user.id)
    .gte("updated_at",new Date(Date.now()-86400000).toISOString());
  if (limitError)return respond({error:"Cannot verify indexing quota"},503,origin);
  if ((count||0) >= 100)return respond({error:"100 semantic index updates per 24 hours reached; try again later",code:"SEMANTIC_DAILY_CAP"},429,origin);

  let embedding: number[];
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings",{
      method:"POST",signal:AbortSignal.timeout(30000),
      headers:{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"},
      body:JSON.stringify({model:MODEL,dimensions:DIMENSIONS,input:descriptor.description})
    });
    if (!res.ok) {
      if(res.status===429)return respond({error:"AI embedding rate or spending limit reached",code:"AI_RATE_LIMIT"},429,origin);
      return respond({error:"Embedding provider unavailable",code:"AI_PROVIDER_ERROR"},502,origin);
    }
    const result = await res.json();
    embedding = result?.data?.[0]?.embedding;
    if(!Array.isArray(embedding)||embedding.length!==DIMENSIONS||
      !embedding.every(v=>typeof v==="number"&&Number.isFinite(v)))
      throw Error("Invalid embedding dimensions");
  }catch(error) {
    return respond({error:error instanceof Error && error.message==="Invalid embedding dimensions"?
      "Embedding dimensions invalid":"AI semantic embedding request failed"},503,origin);
  }
  const {error:saveError} = await client.from("corp_uniform_semantic_vectors").upsert({
    asset_id:assetId,owner_id:user.id,model:MODEL,
    embedding,source_checksum:checksum,source_summary:descriptor.description,
    uniform_world:descriptor.world,updated_at:new Date().toISOString()
  },{onConflict:"asset_id"});
  if(saveError)return respond({error:"Could not save private semantic vector",code:saveError.code||""},503,origin);
  return respond({ok:true,indexed:true,cached:false,model:MODEL,
    vector_dimensions:DIMENSIONS,source:"existing_visual_description",
    notice:"Semantic vector stored privately. Original photograph and publication status unchanged."},200,origin);
});
