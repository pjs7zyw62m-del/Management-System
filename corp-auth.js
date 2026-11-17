import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
let client;
const concurrentAuthorizations=new WeakMap();
export function corporateClient(){
if(client)return client;
const c=window.BLACKCELL_CORP_CONFIG;
if(!c?.url||!c?.publishableKey)throw Error('Corporate login not configured');
return client=createClient(c.url,c.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'blackcell-corporate-login'}});
}
// Share only simultaneous authorization requests. We deliberately do NOT cache
// successful grants: every later operation may observe revocation or sign-out.
export async function corporateAuthorize(s,{allowLedgerOnly=false,classifyTransport=false}={}){
 const key=(allowLedgerOnly?'ledger':'general')+':'+(classifyTransport?'classify':'standard');
 let requests=concurrentAuthorizations.get(s);
 if(!requests){requests=new Map();concurrentAuthorizations.set(s,requests)}
 if(requests.has(key))return requests.get(key);
 const pending=authorizeOnce(s,{allowLedgerOnly,classifyTransport});
 requests.set(key,pending);
 try{return await pending}finally{
  if(requests.get(key)===pending)requests.delete(key);
 }
}
async function authorizeOnce(s,{allowLedgerOnly=false,classifyTransport=false}={}){
const {data,error}=await s.auth.getUser();
if(error||!data?.user){
 const ended=!error||error.name==='AuthSessionMissingError'||['session_not_found','session_expired','refresh_token_not_found','refresh_token_already_used','user_banned','user_not_found'].includes(error.code);
 return {ok:false,reason:classifyTransport&&!ended?'verification-error':'signed-out'};
}
const {data:member,error:memberError}=await s.from('corp_access_members').select('user_id,display_name,role,active,clearance_level,can_chat,username,password_activated_at,access_scope').eq('user_id',data.user.id).eq('active',true).maybeSingle();
if(memberError)return {ok:false,reason:'verification-error'};
if(!member)return {ok:false,reason:'not-approved'};
if(member.role==='employee'&&member.access_scope==='ledger_only'&&!allowLedgerOnly)
 return {ok:false,reason:'ledger-only',redirect:'private-photo-ledger.html'};
return {ok:true,user:data.user,member};
}