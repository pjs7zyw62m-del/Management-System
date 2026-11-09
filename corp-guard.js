import { corporateClient, corporateAuthorize } from './corp-auth.js?v=20261109-clearance5';

const lock = document.getElementById('corp-lock');
const message = document.getElementById('corp-lock-msg');
const loginLink = document.getElementById('corp-lock-link');
const IDLE_LIMIT_MS = 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;
let client;
let lastActivity = Date.now();
let lastTouch = Date.now();
let touching = false;
let exiting = false;

function locked(text) {
  document.documentElement.classList.remove('corp-ok');
  lock.hidden = false;
  message.textContent = text;
  loginLink.hidden = false;
}

async function leave(reason = 'Corporate session ended.') {
  if (exiting) return;
  exiting = true;
  locked(reason);
  try { await client?.rpc('corp_end_session'); } catch (_) {}
  try { await client?.auth.signOut({ scope:'local' }); } catch (_) {}
  location.replace('login.html');
}

function expiredLocally() {
  return Date.now() - lastActivity >= IDLE_LIMIT_MS;
}

async function extendOnActivity() {
  if (exiting || touching || Date.now()-lastTouch < TOUCH_INTERVAL_MS) return;
  if (expiredLocally()) { await leave('Signed out after 60 minutes of inactivity.'); return; }
  touching = true;
  try {
    const {data,error} = await client.rpc('corp_touch_session');
    if (error || data?.ok !== true) {
      await leave('Your security session has expired.');
      return;
    }
    lastTouch = Date.now();
  } catch (_) {
    await leave('Unable to verify your active session.');
  } finally {
    touching = false;
  }
}

function interacted() {
  if (exiting) return;
  if (expiredLocally()) { void leave('Signed out after 60 minutes of inactivity.'); return; }
  lastActivity = Date.now();
  void extendOnActivity();
}

async function checkOnReturn() {
  if (exiting) return;
  if (expiredLocally()) { await leave('Signed out after 60 minutes of inactivity.'); return; }
  try {
    const {data,error} = await client.rpc('corp_code_status');
    if (error || data?.ok !== true || data?.verified !== true) await leave('Corporate access verification expired.');
  } catch (_) { await leave('Unable to reverify corporate access.'); }
}

try {
  client = corporateClient();
  const authorized = await corporateAuthorize(client);
  if (!authorized.ok) {
    if (authorized.reason === 'not-approved') {
      await client.auth.signOut({scope:'local'});
      locked('This account is not approved for Corporate Access.');
    } else if (authorized.reason === 'verification-error') {
      locked('Corporate authorization is unavailable.');
    } else {
      locked('Sign in is required to enter the Blackcell Corporate Dashboard.');
    }
  } else if (authorized.member?.role !== 'owner' ||
             Number(authorized.member?.clearance_level) !== 7) {
    locked('This account does not have Level 7 access to Administration.');
  } else {
    const {data:status,error} = await client.rpc('corp_code_status');
    if (error || status?.ok !== true || status?.verified !== true) {
      if (!error && status?.expired) await client.auth.signOut({scope:'local'});
      locked(error ? 'Could not confirm your security session. Access blocked.' :
        (status?.expired ? 'Your session expired after inactivity. Sign in again.' :
         'Your security codes must be verified before entering the dashboard.'));
    } else {
      document.documentElement.classList.add('corp-ok');
      lock.hidden = true;
      const header = document.querySelector('.header-end');
      if (header) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-button';
        btn.style.width = 'auto';
        btn.style.padding = '0 14px';
        btn.textContent = 'SIGN OUT';
        btn.addEventListener('click', () => { void leave('Signing out…'); });
        header.prepend(btn);
      }
      for (const name of ['pointerdown','keydown','touchstart','wheel','scroll','pointermove']) {
        window.addEventListener(name,interacted,{passive:true});
      }
      window.addEventListener('focus', () => { void checkOnReturn(); });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void checkOnReturn();
      });
      setInterval(() => {
        if (expiredLocally()) void leave('Signed out after 60 minutes of inactivity.');
      }, 15000);
      // Recheck session expiry even without a browser focus event. Never
      // extend a server-side session merely because this timer fires.
      setInterval(() => {
        if (!exiting && !document.hidden) void checkOnReturn();
      }, 60000);
      window.BLACKCELL_CORPORATE_ADMIN_API=Object.freeze({client});
      window.addEventListener('message',event=>{
        if(event.origin!==location.origin || event.data?.type!=='blackcell-chat-activity')return;
        const valid=[...document.querySelectorAll('iframe')].some(frame=>{
          try{
            const url=new URL(frame.src,location.href);
            return url.origin===location.origin&&url.pathname.endsWith('/corporate-chat.html')&&
              frame.contentWindow===event.source;
          }catch(_){return false;}
        });
        if(valid)interacted();
      });
      // The previous admin.js URL briefly served invalid JavaScript.
      // A new version query forces browsers/CDNs to fetch the repaired file.
      window.BLACKCELL_ADMIN_READY=false;
      const script=document.createElement('script');
      script.src='admin.js?v=20261109-email-limit11';
      script.defer=true;
      const showAdminLoadError=()=>{
        if(document.getElementById('adminControlsReload'))return;
        const bar=document.createElement('div');
        bar.id='adminControlsReload';
        bar.setAttribute('role','alert');
        bar.style.cssText='position:fixed;left:16px;right:16px;top:74px;z-index:900000;background:#25151d;color:#fae7ec;border:1px solid #b76683;border-radius:13px;padding:14px 17px;font:12px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 15px 50px #000b;display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap';
        const explanation=document.createElement('span');
        explanation.textContent='Administration controls did not finish loading. Reload to fetch the corrected page.';
        const retry=document.createElement('button');
        retry.type='button';retry.textContent='RELOAD ADMINISTRATION';
        retry.style.cssText='border:1px solid #c8879b;color:#fff;background:#643145;border-radius:9px;padding:9px 13px;cursor:pointer';
        retry.addEventListener('click',()=>location.reload());
        bar.append(explanation,retry);document.body.append(bar);
      };
      script.addEventListener('error',showAdminLoadError);
      script.addEventListener('load',()=>{
        if(window.BLACKCELL_ADMIN_READY!==true)showAdminLoadError();
      });
      document.body.append(script);
      const dockScript=document.createElement('script');
      dockScript.src='corporate-chat-dock.js?v=20261109-inline-attach3';
      dockScript.addEventListener('error',()=>{
        // Keep all ordinary Administration controls working even if chat fails.
      });
      document.body.append(dockScript);
    }
  }
} catch (_) {
  locked('Corporate access verification is unavailable. Access blocked.');
}
