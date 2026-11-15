/* Isolated visual rehearsal. Does not invoke any security operation or modify sessions. */
export function omegaStage(elapsed){
 const t=Math.max(0,Number(elapsed)||0);
 if(t<650)return {phase:'blackout',percent:0};
 if(t<10000)return {phase:'initializing',percent:Math.min(99,Math.floor(100*(t-650)/9350))};
 return {phase:'warning',percent:100};
}
export function mountOmegaRehearsal({authorized,returnFocus,mode='user'}){
 if(typeof authorized!=='function'||!authorized()||document.querySelector('.bc-omega-rehearsal'))return;
 const create=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const layer=create('section','bc-omega-rehearsal');layer.dataset.phase=mode==='landing'?'warning':'blackout';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label',mode==='landing'?'OMEGA public landing page rehearsal':'OMEGA lockdown visual rehearsal');
 const demo=create('div','bc-omega-demo-label','ADMINISTRATOR REHEARSAL · NO LIVE LOCKDOWN');
 const stage=create('div','bc-omega-rehearsal-stage');
 const init=create('div','bc-omega-init'),warning=create('div','bc-omega-warning');
 const mark=create('div','bc-omega-screen-mark','Ω');
 const progress=create('div','bc-omega-progress'),fill=create('i');progress.append(fill);progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Initializing lockdown display');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');progress.setAttribute('aria-valuenow','0');
 const pct=create('div','bc-omega-percent','00%'),note=create('div','bc-omega-stage-note','INITIALIZING SECURITY PROTOCOL');
 init.append(create('div','bc-omega-screen-brand','BLACKCELL CORPORATION'),mark,create('h2','','INITIALIZING LOCKDOWN'),note,progress,pct);
 const wm=create('div','bc-omega-warning-mark','!');wm.setAttribute('aria-hidden','true');
 warning.append(create('div','bc-omega-screen-brand','BLACKCELL CORPORATION'),wm,create('div','bc-omega-warning-code','OMEGA PROTOCOL / SECURITY DIRECTIVE'),create('h2','','CORPORATE LOCKDOWN'),create('p','bc-omega-warning-main','BLACKCELL CORPORATION IS UNDER LOCKDOWN.'),create('p','','All user access and corporate communications are suspended until further notice.'),create('p','bc-omega-warning-footer','AWAITING EXECUTIVE AUTHORIZATION'));
 stage.append(init,warning);
 const exit=create('button','bc-omega-rehearsal-exit','Exit rehearsal');exit.type='button';
 layer.append(demo,stage,exit);document.body.append(layer);
 const previous=[...document.body.children].filter(x=>x!==layer).map(x=>({node:x,inert:x.inert}));for(const x of previous)x.node.inert=true;
 let handle=0,closed=false,lastPhase='';const started=performance.now();
 const close=()=>{if(closed)return;closed=true;cancelAnimationFrame(handle);document.removeEventListener('keydown',keys,true);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);layer.remove();for(const x of previous)x.node.inert=x.inert;if(authorized())returnFocus?.focus()};
 const keys=e=>{if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Tab'){e.preventDefault();exit.focus()}};
 const visibility=()=>{if(document.hidden||!authorized())close()};
 exit.onclick=close;document.addEventListener('keydown',keys,true);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',close,{once:true});
 function frame(now){
  if(closed)return;if(!authorized()){close();return}
  const state=mode==='landing'?{phase:'warning',percent:100}:omegaStage(now-started);layer.dataset.phase=state.phase;
  if(state.phase==='initializing'){
   fill.style.width=state.percent+'%';pct.textContent=String(state.percent).padStart(2,'0')+'%';progress.setAttribute('aria-valuenow',String(state.percent));
   note.textContent=state.percent<35?'INITIALIZING SECURITY PROTOCOL':state.percent<70?'APPLYING RESTRICTED ACCESS':'FINALIZING LOCKDOWN DISPLAY';
  }
  if(state.phase!==lastPhase){lastPhase=state.phase;if(state.phase==='warning'){progress.setAttribute('aria-valuenow','100');warning.setAttribute('role','status');exit.focus({preventScroll:true})}}
  // Keep the rehearsal open on the warning; continue checking the existing owner gate.
  handle=requestAnimationFrame(frame);
 }
 handle=requestAnimationFrame(frame);
 return close;
}
