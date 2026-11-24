import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261114-transport-classification';
const q=id=>document.getElementById(id),params=new URLSearchParams(location.search),id=params.get('id'),recipient=params.get('recipient');
let client,uid;
async function request(action){
 const {data,error}=await client.auth.getSession();
 if(error||!data?.session?.access_token||data.session.user.id!==uid)throw Error('Verify your BLACKCELL account first.');
 const cfg=window.BLACKCELL_CORP_CONFIG;
 const url=new URL(cfg.url+'/functions/v1/blackcell-os-private-drive');url.searchParams.set('action',action);
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({id,recipient}),cache:'no-store'});
 const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'Photo permission unavailable.');return result;
}
async function init(){
 try{client=corporateClient();const auth=await corporateAuthorize(client);if(!auth.ok)throw Error('Sign in and verify your BLACKCELL account, then reopen this link.');uid=auth.user.id;
 const data=await request('photo-permission-info');q('photo').textContent='Photograph: '+data.name;q('recipient').textContent='Recipient: '+data.recipient;q('details').hidden=false;q('status').textContent=data.approved?'Permission already granted.':'Sharing is optional.';q('allow').disabled=!!data.approved;
 }catch(e){q('status').textContent=e.message}
}
q('allow').addEventListener('click',async()=>{q('allow').disabled=true;try{await request('photo-permission-approve');q('status').textContent='Permission granted. The recipient can now transfer this photo.';}catch(e){q('status').textContent=e.message;q('allow').disabled=false}});void init();
