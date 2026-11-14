/* BLACKCELL OS workspace lock — UI privacy; never substitutes for API authorization. */
export function createWorkspaceLock({host,account,verify,onLock,onUnlock,onSignOut,usable,preview=false}){
 const E=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n};
 const screen=E('section','bc-lock-screen');screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-labelledby','bcLockHeading');
 const card=E('div','bc-lock-card'),brand=E('div','bc-lock-brand','BLACKCELL OS'),clock=E('time','bc-lock-clock'),date=E('p','bc-lock-date'),avatar=E('div','bc-lock-avatar'),name=E('h2','',''),label=E('h1','bc-lock-heading','Session locked');label.id='bcLockHeading';
 const form=E('form','bc-lock-form'),password=E('input','bc-lock-password');password.type='password';password.autocomplete='current-password';password.placeholder='Corporate password';password.required=!preview;password.maxLength=1024;password.setAttribute('aria-label','Corporate password');
 const action=E('button','bc-lock-unlock','Unlock');action.type='submit';const status=E('p','bc-lock-status','');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const exit=E('button','bc-lock-exit','Sign Out');exit.type='button';exit.onclick=()=>{if(!busy)onSignOut()};
 form.append(password,action);card.append(brand,clock,date,avatar,name,label,form,status,exit,E('small','bc-lock-note','CONTROL IS EVERYTHING.'));screen.append(card);document.body.append(screen);
 let locked=false,busy=false,mode='lock',generation=0,failed=0,retryAt=0;
 function key(){const uid=account().id;return uid?'bc.os.lock.v1:'+uid:null}
 function read(){const k=key();if(!k||preview)return null;for(const name of ['localStorage','sessionStorage'])try{const value=JSON.parse(window[name].getItem(k)||'null');if(value?.mode==='lock'||value?.mode==='logoff')return value.mode}catch(_){}return null}
 function save(value){const k=key();if(!k||preview)return;for(const name of ['localStorage','sessionStorage'])try{if(value)window[name].setItem(k,JSON.stringify({mode:value}));else window[name].removeItem(k)}catch(_){}}
 function tick(){const d=new Date();clock.textContent=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});date.textContent=d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})}
 function lock(which='lock',persist=true){if(!usable())return false;generation++;locked=true;busy=false;mode=which;failed=0;retryAt=0;password.value='';password.disabled=false;action.disabled=false;exit.disabled=false;const a=account();avatar.textContent=a.initials||'BC';name.textContent=a.name||'Corporate account';label.textContent=which==='logoff'?'Logged off':'Session locked';action.textContent=which==='logoff'?'Log in':'Unlock';status.textContent=preview?'Design preview — no authentication performed.':'Your corporate session remains active until it expires or you sign out.';password.hidden=preview;screen.hidden=false;host.inert=true;host.hidden=true;tick();if(persist)save(mode);onLock(mode);(preview?action:password).focus();return true}
 function dismiss(){generation++;locked=false;busy=false;password.value='';screen.hidden=true;host.inert=false}
 function clear(){save(null);dismiss()}
 form.onsubmit=async e=>{e.preventDefault();if(!locked||busy||!usable())return;if(Date.now()<retryAt){status.textContent='Too many attempts. Try again in '+Math.ceil((retryAt-Date.now())/1000)+' seconds.';return}const seq=generation;const secret=password.value;password.value='';busy=true;password.disabled=true;action.disabled=true;exit.disabled=true;status.textContent='Verifying your identity…';
  try{const result=preview?{ok:true}:await verify(secret);if(seq!==generation||!locked||!usable())return;if(!result?.ok){failed++;retryAt=Date.now()+Math.min(30000,1000*2**Math.min(failed,5));status.textContent=result?.message||'Verification failed. Try again.';return}failed=0;retryAt=0;clear();onUnlock()}
  catch(_){if(seq===generation)status.textContent='Unable to verify your identity. Try again.'}
  finally{if(seq===generation&&locked){busy=false;password.disabled=false;action.disabled=false;exit.disabled=false;password.focus()}}
 };
 screen.addEventListener('keydown',e=>{if(e.key==='Tab'){const a=[password,action,exit].filter(n=>!n.hidden&&!n.disabled);if(a.length){e.preventDefault();const i=a.indexOf(document.activeElement);a[(i+(e.shiftKey?-1:1)+a.length)%a.length].focus()}}});
 const interval=setInterval(()=>{if(locked)tick()},15000);
 const storageEvent=e=>{if(e.key===key()&&e.newValue&&!locked&&usable()){const saved=read();if(saved)lock(saved,false)}};window.addEventListener('storage',storageEvent);
 return {lock,read,clear,dismiss,isLocked:()=>locked,dispose(){clearInterval(interval);window.removeEventListener('storage',storageEvent);dismiss();screen.remove()}};
}
/* Password verification gets a temporary, isolated auth session. Never save the password,
   overwrite the workspace client session or revoke all of a user's sessions. */
export async function verifyWorkspacePassword(client,expectedUser,password){
 if(!password||!expectedUser)return {ok:false,message:'Enter your corporate password.'};
 const {data:current,error:currentError}=await client.auth.getUser();const user=current?.user;
 if(currentError||!user||user.id!==expectedUser||!user.email)return {ok:false,message:'Your session needs full Corporate Access verification. Sign Out and sign in again.'};
 const cfg=window.BLACKCELL_CORP_CONFIG;if(!cfg?.url||!cfg?.publishableKey)return {ok:false,message:'Authentication is unavailable.'};
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
 const verifier=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'bc-os-unlock-'+crypto.randomUUID()}});
 let accepted=false;
 try{const {data,error}=await verifier.auth.signInWithPassword({email:user.email,password});accepted=!error&&data?.user?.id===expectedUser&&!!data?.session;if(!accepted)return {ok:false,message:'Password was not accepted. Try again.'}}
 finally{if(accepted)try{await verifier.auth.signOut({scope:'local'})}catch(_){}}
 return {ok:true};
}
