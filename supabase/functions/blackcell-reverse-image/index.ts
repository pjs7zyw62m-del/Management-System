import {createClient} from "npm:@supabase/supabase-js@2.119.0";

/* BLACKCELL reverse-image search — authenticated, private, opt-in.
 * Searches only user-owned, already uploaded private World photos.
 * Yandex API credentials remain in Supabase secrets, never in browser code.
 * JPEG search previews are transient and not stored in BLACKCELL.
 */
const ORIGINS=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY=Deno.env.get("YANDEX_SEARCH_API_KEY")||"";
const FOLDER=Deno.env.get("YANDEX_SEARCH_FOLDER_ID")||"";
function cors(origin){
 return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://blackcellcorp.com",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Cache-Control":"private,no-store","Vary":"Origin","X-Content-Type-Options":"nosniff"};
}
function answer(body,code,origin){return new Response(JSON.stringify(body),{
 status:code,headers:{"Content-Type":"application/json",...cors(origin)}
});}
function safeHttps(value){
 if(typeof value!=="string"||value.length>2000)return "";
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password)return "";
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.includes(":")||
     /^(?:0|10|127|169\.254|192\.168)\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)||
     /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host))return "";
  u.hash="";return u.href;
 }catch{return ""}
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(!["GET","POST"].includes(req.method))return answer({ok:false,error:"Method not allowed"},405,origin);
 if(origin&&!ORIGINS.has(origin))return answer({ok:false,error:"Origin not permitted"},403,origin);
 const bearer=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(bearer))return answer({ok:false,error:"Sign in required"},401,origin);
 const jwt=bearer.replace(/^Bearer\s+/i,"");
 const base=Deno.env.get("SUPABASE_URL")||"";
 let pub=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!pub)try{pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{}
 if(!base||!pub)return answer({ok:false,error:"Authentication service unavailable"},503,origin);
 const client=createClient(base,pub,{global:{headers:{Authorization:"Bearer "+jwt}},
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const identity=await client.auth.getUser(jwt);
 const uid=identity.data.user?.id;
 if(identity.error||!uid)return answer({ok:false,error:"Session expired"},401,origin);
 const {data:member,error:memberError}=await client.from("corp_access_members")
  .select("role,active,clearance_level").eq("user_id",uid).eq("active",true).maybeSingle();
 if(memberError||!member||!["owner","employee"].includes(member.role)||member.role==="owner"&&Number(member.clearance_level)!==7)
  return answer({ok:false,error:"Corporate member required"},403,origin);
 const check=await client.rpc(member.role==="owner"?"corp_code_status":"corp_employee_code_status");
 if(check.error||check.data?.verified!==true||check.data?.ok!==true)
  return answer({ok:false,error:"Verify corporate access first"},403,origin);
 if(req.method==="GET")return answer({ok:true,provider:"Yandex",configured:!!KEY&&!!FOLDER,
  requires:["YANDEX_SEARCH_API_KEY","YANDEX_SEARCH_FOLDER_ID"],max_per_24h:10},200,origin);
 if(!KEY||!FOLDER)return answer({ok:false,code:"YANDEX_NOT_CONFIGURED",
   error:"Yandex API key and folder ID must be configured in Supabase Edge Function secrets."},503,origin);
 if(Number(req.headers.get("content-length")||0)>1900000)return answer({ok:false,error:"Preview too large"},413,origin);
 let body;
 try{
  const raw=await req.text();
  if(raw.length>1900000)throw Error("Preview too large");
  body=JSON.parse(raw);
 }catch{return answer({ok:false,error:"Invalid or oversize request"},400,origin)}
 if(body?.action!=="search"||!UUID.test(String(body.asset_id||"")))
  return answer({ok:false,error:"Select an uploaded photo"},400,origin);
 const preview=body.preview;
 if(typeof preview!=="string"||preview.length>1700000||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(preview))
  return answer({ok:false,error:"Select a valid JPEG crop smaller than 1.3 MB"},422,origin);
 const assetId=String(body.asset_id);
 const {data:asset,error:assetError}=await client.from("corp_social_assets")
  .select("id,owner_id,kind,purpose,source_provider,review_status")
  .eq("id",assetId).eq("owner_id",uid).maybeSingle();
 if(assetError||!asset||asset.kind!=="photo"||asset.purpose!=="library"||
    asset.source_provider!=="world-bunny-v1"||!["pending","approved"].includes(asset.review_status))
  return answer({ok:false,error:"Uploaded photo unavailable for this account"},403,origin);
 // Limit combined Google/Yandex web API activity to the preexisting 10/day budget.
 const since=new Date(Date.now()-86400000).toISOString();
 const {count,error:countError}=await client.from("corp_social_visual_ai_requests")
  .select("id",{count:"exact",head:true}).eq("user_id",uid).eq("action","web").gte("created_at",since);
 if(countError)return answer({ok:false,error:"Cannot verify visual-search quota"},503,origin);
 if((count||0)>=10)return answer({ok:false,code:"DAILY_LIMIT",error:"Daily online visual-search limit reached (10 requests per 24 hours)."},429,origin);
 const record=await client.from("corp_social_visual_ai_requests")
  .insert({user_id:uid,asset_id:assetId,action:"web"});
 if(record.error)return answer({ok:false,error:"Could not record search usage; request cancelled"},503,origin);
 try{
  const response=await fetch("https://searchapi.api.cloud.yandex.net/v2/image/search_by_image",{
   method:"POST",signal:AbortSignal.timeout(40000),
   headers:{"Authorization":"Api-Key "+KEY,"Content-Type":"application/json"},
   body:JSON.stringify({folderId:FOLDER,data:preview.slice("data:image/jpeg;base64,".length),
     page:"0",familyMode:"FAMILY_MODE_MODERATE"})
  });
  if(!response.ok)return answer({ok:false,code:"YANDEX_PROVIDER_ERROR",
   error:"Yandex search request failed ("+response.status+"). Check the API subscription and permissions."},502,origin);
  const result=await response.json();
  if(!Array.isArray(result.images))return answer({ok:false,code:"YANDEX_INVALID_RESPONSE",
   error:"Yandex returned an unexpected search response."},502,origin);
  const images=[],seen=new Set();
  for(const item of result.images){
   const imageUrl=safeHttps(item?.url);if(!imageUrl||seen.has(imageUrl))continue;
   seen.add(imageUrl);
   images.push({image_url:imageUrl,source_url:safeHttps(item?.pageUrl),
     title:String(item?.pageTitle||item?.host||"Yandex image result").slice(0,180),
     provider:"Yandex",kind:"similar"});
   if(images.length>=35)break;
  }
  return answer({ok:true,provider:"Yandex",results:images},200,origin);
 }catch{
  return answer({ok:false,code:"YANDEX_UNAVAILABLE",error:"Yandex image search temporarily unavailable."},502,origin);
 }
});