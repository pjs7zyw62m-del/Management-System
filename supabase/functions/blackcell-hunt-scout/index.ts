import {createClient} from "npm:@supabase/supabase-js@2.80.0";

/* BLACKCELL THE HUNT / Source Scout: bounded, owner-only, read-only.
 * Uses public Wikimedia Commons file metadata. Never imports, uploads,
 * publishes, edits a collection, invokes a paid model, or schedules jobs. */
const ORIGINS=new Set([
  "https://blackcellcorp.com",
  "https://www.blackcellcorp.com",
  "https://pjs7zyw62m-del.github.io"
]);
const clean=(value:unknown,max=180)=>String(value??"").replace(/<[^>]*>/g," ")
  .replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
  .replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim().slice(0,max);
function headers(origin:string){
  const allowed=ORIGINS.has(origin)?origin:"https://blackcellcorp.com";
  return {"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store",
    "Access-Control-Allow-Origin":allowed,"Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
    "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
}
const response=(value:unknown,status:number,origin:string)=>new Response(JSON.stringify(value),{status,headers:headers(origin)});
function httpsFrom(url:unknown,hosts:string[]){
  if(typeof url!=="string"||url.length>1300)return "";
  try{
    const u=new URL(url);
    return u.protocol==="https:"&&hosts.some(h=>u.hostname===h||u.hostname.endsWith("."+h))?u.href:"";
  }catch{return ""}
}
async function auth(req:Request){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token||token.length>6000)throw Error("NO_TOKEN");
  const url=Deno.env.get("SUPABASE_URL");
  let publishable=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if(!publishable){
    try{publishable=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default}catch{}
  }
  if(!url||!publishable)throw Error("CONFIG");
  const client=createClient(url,publishable,{global:{headers:{Authorization:"Bearer "+token}},
    auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await client.auth.getUser(token);
  if(authError||!user)throw Error("NO_AUTH");
  const {data:member,error:memberError}=await client.from("corp_access_members")
    .select("role,clearance_level,active").eq("user_id",user.id).eq("active",true).maybeSingle();
  if(memberError||member?.role!=="owner"||Number(member.clearance_level)!==7)throw Error("NO_OWNER");
  const {data:verified,error:verifyError}=await client.rpc("corp_code_status");
  if(verifyError||verified?.ok!==true||verified?.verified!==true)throw Error("NO_PASS");
  return user.id;
}
const mediaHost=["wikimedia.org","wikipedia.org"];
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=="POST")return response({error:"POST required"},405,origin);
  if(origin&&!ORIGINS.has(origin))return response({error:"Origin not permitted"},403,origin);
  try{await auth(req)}catch(err){
    const code=err instanceof Error?err.message:"NO_AUTH";
    if(code==="CONFIG")return response({error:"Source Scout configuration unavailable"},503,origin);
    return response({error:"Verified BLACKCELL Level 7 owner access required"},code==="NO_TOKEN"||code==="NO_AUTH"?401:403,origin);
  }
  let payload:unknown;
  try{payload=await req.json()}catch{return response({error:"Invalid request body"},400,origin)}
  const request=payload&&typeof payload==="object"?payload as Record<string,unknown>:{};
  const phrase=clean(request.query,110);
  if(phrase.length<3||phrase.length>110||/[{}\[\]<>]/.test(phrase))
    return response({error:"Enter 3–110 characters of public uniform research terms"},422,origin);
  // Never forward the owner's private media, filenames, history or JWT to Wikimedia.
  const search=new URL("https://commons.wikimedia.org/w/api.php");
  for(const [key,value] of Object.entries({
    action:"query",generator:"search",gsrnamespace:"6",gsrsearch:phrase,gsrlimit:"16",
    prop:"imageinfo",iiprop:"url|extmetadata|mime",iiurlwidth:"480",
    format:"json",formatversion:"2"
  }))search.searchParams.set(key,value);
  let upstream:Response;
  try{
    upstream=await fetch(search,{headers:{
      "Accept":"application/json",
      "User-Agent":"BLACKCELL-Uniform-Research-Bot/1.0 (https://blackcellcorp.com)",
      "Api-User-Agent":"BLACKCELL-Uniform-Research-Bot/1.0 (https://blackcellcorp.com)"
    },signal:AbortSignal.timeout(12000)});
  }catch{return response({error:"Public archive did not respond; retry manually later"},503,origin)}
  if(!upstream.ok)return response({error:upstream.status===429?
    "Wikimedia rate limit reached; try later":"Public archive search temporarily unavailable"},503,origin);
  let data:any;
  try{data=await upstream.json()}catch{return response({error:"Public archive returned invalid data"},502,origin)}
  const rows=Array.isArray(data?.query?.pages)?data.query.pages:[];
  const found=[];
  for(const item of rows){
    const info=item?.imageinfo?.[0];
    if(!info||!/^image\/(jpeg|png|webp)$/.test(String(info.mime||"")))continue;
    const page=httpsFrom(info.descriptionurl,["commons.wikimedia.org"]);
    const thumb=httpsFrom(info.thumburl,mediaHost);
    if(!page||!thumb)continue;
    const ext=info.extmetadata||{};
    const license=clean(ext.LicenseShortName?.value,90);
    // Do not imply license certainty. Records lacking source license metadata
    // are not presented as actionable candidates.
    if(!license)continue;
    found.push({
      title:clean(item.title,160).replace(/^File:/,""),
      source_url:page,thumbnail_url:thumb,
      license,license_url:httpsFrom(ext.LicenseUrl?.value,["creativecommons.org","wikimedia.org"]),
      author:clean(ext.Artist?.value,140)||"See Commons file page",
      credit:clean(ext.Credit?.value,180),
      rights_status:"REVIEW REQUIRED"
    });
    if(found.length>=8)break;
  }
  return response({ok:true,provider:"Wikimedia Commons",query:phrase,
    count:found.length,results:found,
    note:"Source-supplied licensing may be incomplete or mistaken. Check license, attribution, subjects' permissions, and any use restrictions before downloading or publishing. No media was imported."},200,origin);
});