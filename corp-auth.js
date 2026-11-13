import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
let client;
export function corporateClient(){
if(client)return client;
const c=window.BLACKCELL_CORP_CONFIG;
if(!c?.url||!c?.publishableKey)throw Error('Corporate login not configured');
return client=createClient(c.url,c.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'blackcell-corporate-login'}});
}
export async function corporateAuthorize(s,{allowLedgerOnly=false}={}){
const {data,error}=await s.auth.getUser();
if(error||!data?.user)return {ok:false,reason:'signed-out'};
const {data:member,error:memberError}=await s.from('corp_access_members').select('user_id,display_name,role,active,clearance_level,can_chat,username,password_activated_at,access_scope').eq('user_id',data.user.id).eq('active',true).maybeSingle();
if(memberError)return {ok:false,reason:'verification-error'};
if(!member)return {ok:false,reason:'not-approved'};
if(member.role==='employee'&&member.access_scope==='ledger_only'&&!allowLedgerOnly)
 return {ok:false,reason:'ledger-only',redirect:'private-photo-ledger.html'};
return {ok:true,user:data.user,member};
}