/* BLACKCELL private media player: native video decoding, custom inline controls. */
const icons={
 play:'<path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none"/>',
 pause:'<path d="M8 5v14M16 5v14" stroke-width="3.5"/>',
 back:'<path d="M3 9V3m0 6h6M4 8a8 8 0 1 1-1 7"/><path d="M11 10v5m3-5h2v5h-2z" stroke-width="1.4"/>',
 forward:'<path d="M21 9V3m0 6h-6m5-1a8 8 0 1 0 1 7"/><path d="M11 10v5m3-5h2v5h-2z" stroke-width="1.4"/>',
 sound:'<path d="M3 9h4l5-4v14l-5-4H3zM16 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
 mute:'<path d="M3 9h4l5-4v14l-5-4H3zm13 1 5 5m0-5-5 5"/>',
 expand:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
 shrink:'<path d="M3 9h6V3m12 6h-6V3M9 21v-6H3m12 6v-6h6"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="m10 2-1 3-3 1-3-1-2 4 3 2v3l-2 2 2 4 3-1 3 1 1 2h4l1-3 3-1 3 1 2-4-3-2v-3l2-2-2-4-3 1-3-1-1-2z" transform="translate(1 1) scale(.92)"/>',
 theater:'<rect x="2" y="5" width="20" height="14" rx="1.5"/>'
};
const svg=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
const time=n=>{n=Number.isFinite(n)?Math.max(0,Math.floor(n)):0;const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=String(n%60).padStart(2,'0');return h?h+':'+String(m).padStart(2,'0')+':'+s:m+':'+s};
export function installWorldPlayer(video,dialog){
 if(!video||!dialog)return null;
 if(video._blackcellPlayer)return video._blackcellPlayer;
 const stage=document.createElement('div');stage.className='bc-world-player';stage.hidden=true;video.before(stage);stage.append(video);
 video.controls=false;video.playsInline=true;video.setAttribute('playsinline','');
 const center=document.createElement('button');center.type='button';center.className='bc-player-center';center.setAttribute('aria-label','Play video');center.innerHTML=svg('play');stage.append(center);
 const status=document.createElement('div');status.className='bc-player-status';status.setAttribute('role','status');stage.append(status);
 const panel=document.createElement('div');panel.className='bc-player-panel';
 panel.innerHTML='<div class="bc-player-timeline"><input data-el="seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Playback position"></div><div class="bc-player-actions"><div class="bc-player-transport"><button data-act="play" type="button" aria-label="Play">'+svg('play')+'</button><button data-act="back" type="button" aria-label="Back ten seconds">'+svg('back')+'</button><button data-act="forward" type="button" aria-label="Forward ten seconds">'+svg('forward')+'</button><button data-act="mute" type="button" aria-label="Mute"></button><input data-el="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"><div class="bc-player-clock"><span data-el="elapsed">0:00</span> / <span data-el="duration">0:00</span></div></div><div class="bc-player-secondary bc-player-right"><button data-act="settings" type="button" aria-label="Settings" aria-expanded="false">'+svg('settings')+'</button><button data-act="expand" type="button" aria-label="Theater mode" aria-pressed="false">'+svg('theater')+'</button><button data-act="fullscreen" type="button" aria-label="Full screen">'+svg('expand')+'</button></div></div>';
 const menu=document.createElement('div');menu.className='bc-player-menu';menu.hidden=true;menu.innerHTML='<strong>Playback speed</strong><div class="bc-player-rates"></div><div class="bc-player-quality">Quality <span>Original</span></div>';stage.append(menu);
 stage.append(panel);
 const el=k=>panel.querySelector('[data-el="'+k+'"]'),act=k=>panel.querySelector('[data-act="'+k+'"]');
 const seek=el('seek'),volume=el('volume');let seeking=false,active=false,expanded=false,hideTimer=0;
 const rates=[0.5,0.75,1,1.25,1.5,2];
 for(const rate of rates){const b=document.createElement('button');b.type='button';b.dataset.rate=String(rate);b.textContent=rate===1?'Normal':rate+'×';b.onclick=()=>{video.playbackRate=rate;setMenu(false);refresh()};menu.querySelector('.bc-player-rates').append(b)}
 function setMenu(on){menu.hidden=!on;act('settings').setAttribute('aria-expanded',String(on));reveal()}
 function reveal(){clearTimeout(hideTimer);stage.classList.remove('bc-player-idle');if(active&&!video.paused&&menu.hidden&&!seeking)hideTimer=setTimeout(()=>{if(!video.paused&&menu.hidden&&!seeking&&!panel.contains(document.activeElement))stage.classList.add('bc-player-idle')},2800)}
 function refresh(){
  const d=Number.isFinite(video.duration)?video.duration:0,t=video.currentTime||0,p=d?Math.min(100,t/d*100):0;
  if(!seeking){seek.max=String(d||1);seek.value=String(t)}
  seek.style.setProperty('--bc-played',p+'%');seek.disabled=!d;
  el('elapsed').textContent=time(t);el('duration').textContent=time(d);
  const paused=video.paused||video.ended;
  act('play').innerHTML=svg(paused?'play':'pause');act('play').setAttribute('aria-label',paused?'Play':'Pause');
  center.hidden=!paused||!video.getAttribute('src');center.disabled=!d;
  center.setAttribute('aria-label',video.ended?'Replay video':'Play video');
  act('mute').innerHTML=svg(video.muted?'mute':'sound');act('mute').setAttribute('aria-label',video.muted?'Unmute':'Mute');
  volume.value=String(video.muted?0:video.volume);for(const b of menu.querySelectorAll('[data-rate]'))b.setAttribute('aria-pressed',String(Number(b.dataset.rate)===video.playbackRate));
 }
 function message(text){status.textContent=text||'';status.hidden=!text}
 function toggle(){if(!active||!video.getAttribute('src'))return;if(video.paused||video.ended){if(video.ended)video.currentTime=0;video.play().catch(()=>message('Unable to start playback. Tap Play to retry.'));}else video.pause()}
 function jump(delta){if(Number.isFinite(video.duration))video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+delta))}
 function expand(on){expanded=on;dialog.classList.toggle('bc-player-expanded',on);act('expand').setAttribute('aria-pressed',String(on));act('expand').setAttribute('aria-label',on?'Exit theater mode':'Theater mode');reveal()}
 async function fullscreen(){try{if(document.fullscreenElement===stage){await document.exitFullscreen();return}if(stage.requestFullscreen){await stage.requestFullscreen();return}if(typeof video.webkitEnterFullscreen==='function'){video.webkitEnterFullscreen();return}}catch(_){}expand(!expanded)}
 act('play').onclick=toggle;center.onclick=toggle;video.addEventListener('click',()=>{if(stage.classList.contains('bc-player-idle'))reveal();else toggle()});
 stage.addEventListener('pointermove',reveal);stage.addEventListener('pointerdown',reveal);panel.addEventListener('focusin',reveal);panel.addEventListener('focusout',reveal);
 video.addEventListener('play',reveal);video.addEventListener('pause',reveal);video.addEventListener('ended',reveal);
 act('back').onclick=()=>jump(-10);act('forward').onclick=()=>jump(10);
 act('mute').onclick=()=>{video.muted=!video.muted;refresh()};
 act('settings').onclick=()=>setMenu(menu.hidden);
 volume.addEventListener('input',()=>{video.volume=Number(volume.value);video.muted=video.volume===0;refresh()});
 act('fullscreen').onclick=fullscreen;
 document.addEventListener('fullscreenchange',()=>{const on=document.fullscreenElement===stage;act('fullscreen').innerHTML=svg(on?'shrink':'expand');act('fullscreen').setAttribute('aria-label',on?'Exit full screen':'Full screen');reveal()});
 act('expand').onclick=()=>expand(!expanded);
 seek.addEventListener('input',()=>{seeking=true;reveal();const t=Number(seek.value);if(Number.isFinite(video.duration))video.currentTime=t;el('elapsed').textContent=time(t);seek.style.setProperty('--bc-played',(video.duration?100*t/video.duration:0)+'%')});
 for(const e of ['change','pointerup','pointercancel','blur'])seek.addEventListener(e,()=>{seeking=false;refresh();reveal()});
 for(const e of ['loadedmetadata','durationchange','timeupdate','play','pause','ended','volumechange','ratechange','emptied'])video.addEventListener(e,refresh);
 video.addEventListener('playing',()=>message(''));video.addEventListener('canplay',()=>message(''));video.addEventListener('waiting',()=>{if(active&&!video.paused)message('Buffering…')});
 video.addEventListener('error',()=>{if(active&&video.getAttribute('src'))message('Playback unavailable on this device.')});
 dialog.addEventListener('keydown',e=>{if(!active||e.target.closest('button,input,select,a,textarea'))return;if(e.key===' '||e.key.toLowerCase()==='k'){e.preventDefault();toggle()}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();jump(e.key==='ArrowLeft'?-10:10)}});
 const api={show(on){active=on;clearTimeout(hideTimer);stage.classList.remove('bc-player-idle');setMenu(false);if(!on&&document.fullscreenElement===stage)document.exitFullscreen().catch(()=>{});stage.hidden=!on;dialog.classList.toggle('bc-video-mode',on);video.controls=false;video.hidden=!on;expand(false);message(on?'Loading private video…':'');refresh()},message,refresh};
 video._blackcellPlayer=api;refresh();return api;
}
const style=document.createElement('style');style.id='bc-world-player-style';style.textContent=String.raw`
#mfLightbox.bc-video-mode[open]{width:min(1120px,96vw);max-width:96vw;height:auto;max-height:94vh;min-height:0;border:1px solid #ffffff20;border-radius:20px;padding:0;background:#09090b;gap:0;box-shadow:0 30px 100px #000c;overflow:auto}
#mfLightbox.bc-video-mode .mf-lightbox-top{padding:14px 18px;min-height:56px;background:#111114;border-bottom:1px solid #ffffff0d}
#mfLightbox.bc-video-mode .mf-lightbox-top strong{font-size:14px;max-width:min(76vw,920px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
#mfLightbox.bc-video-mode .mf-lightbox-top small{font-size:9px;color:#92939b;letter-spacing:.16em}
#mfLightbox.bc-video-mode .mf-lightbox-bottom{padding:8px 18px 14px;min-height:0;gap:12px;justify-content:space-between}
#mfLightbox.bc-video-mode .mf-lightbox-bottom>a,#mfLightbox.bc-video-mode #mfTransferStatus{display:none!important}
.bc-world-player{position:relative;display:flex;flex-direction:column;background:#000;min-height:0;flex:0 0 auto;width:100%;overflow:hidden}
.bc-world-player[hidden],.bc-player-center[hidden],.bc-player-status[hidden]{display:none!important}
#mfLightbox.bc-video-mode #mfViewerVideo{display:block;width:100%;height:auto;max-height:min(62vh,650px);min-height:0;aspect-ratio:auto;object-fit:contain;flex:none;background:#000}
.bc-player-center{position:absolute;left:50%;top:calc((100% - 88px)/2);transform:translate(-50%,-50%);width:66px;height:66px;border:1px solid #ffffff35;border-radius:50%;background:#22252b9c;backdrop-filter:blur(18px);color:white;display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 30px #0005}
.bc-player-center svg{width:30px;height:30px}
.bc-player-center:disabled{opacity:.35}
.bc-player-status{position:absolute;top:14px;left:50%;transform:translateX(-50%);max-width:90%;background:#1f2025eb;border:1px solid #ffffff20;border-radius:20px;padding:9px 16px;color:#ddd;font-size:12px;text-align:center;pointer-events:none}
.bc-player-panel{padding:11px 18px 9px;background:linear-gradient(180deg,#1c1d22,#111216);border-top:1px solid #ffffff12;color:#f5f5f7}
.bc-player-timeline{display:flex;align-items:center;gap:12px;font-size:11px;font-variant-numeric:tabular-nums;color:#c7c7cf}
.bc-player-timeline input{--bc-played:0%;flex:1;min-width:0;appearance:none;-webkit-appearance:none;height:5px;border-radius:6px;background:linear-gradient(to right,#c7c9d0 0%,#c7c9d0 var(--bc-played),#4b4c53 var(--bc-played),#4b4c53 100%);outline:none;margin:12px 0}
.bc-player-timeline input::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 4px #0006}
.bc-player-timeline input::-moz-range-thumb{width:13px;height:13px;border:0;border-radius:50%;background:#fff}
.bc-player-actions{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:5px}
.bc-player-transport,.bc-player-secondary{display:flex;align-items:center;gap:6px}
.bc-player-right{justify-content:flex-end}
.bc-player-actions button{display:grid;place-items:center;min-width:40px;height:40px;padding:0 8px;background:transparent;border:0;border-radius:12px;color:#e9e9ef;cursor:pointer;font:600 12px system-ui}
.bc-player-actions button:hover,.bc-player-actions button:focus-visible{background:#ffffff12;outline:1px solid #ffffff30}
.bc-player-actions button svg{width:21px;height:21px}
.bc-player-actions [data-act="play"]{width:47px;height:47px;background:#ffffff12;border-radius:50%}
.bc-player-actions [data-act="play"] svg{width:25px;height:25px}
#mfLightbox.bc-video-mode.bc-player-expanded[open]{width:98vw;max-width:98vw;max-height:98vh}
#mfLightbox.bc-player-expanded #mfViewerVideo{max-height:calc(96vh - 190px)}
@media(max-width:600px){#mfLightbox.bc-video-mode[open]{width:98vw;max-width:98vw;border-radius:14px}#mfLightbox.bc-video-mode .mf-lightbox-top{padding:11px 12px}#mfLightbox.bc-video-mode .mf-lightbox-bottom{padding:8px 12px 12px}.bc-player-panel{padding:8px 10px}.bc-player-actions button{min-width:34px;padding:0 5px}.bc-player-transport,.bc-player-secondary{gap:2px}.bc-player-center{width:52px;height:52px}}

/* Theater-style controls overlay, not a separate toolbar. */
.bc-world-player{display:block;aspect-ratio:16/9;max-height:72vh;isolation:isolate}
#mfLightbox.bc-video-mode #mfViewerVideo{width:100%;height:100%;max-height:none;aspect-ratio:auto;object-fit:contain}
.bc-player-center{top:50%;width:68px;height:48px;border-radius:13px;background:#c51c27;border:0;backdrop-filter:none}
.bc-player-panel{position:absolute;left:0;right:0;bottom:0;padding:25px 12px 4px;background:linear-gradient(transparent,#000c 48%,#000e);border:0;transition:opacity .22s;z-index:3}
.bc-player-idle .bc-player-panel{opacity:0;pointer-events:none}
.bc-player-timeline{display:block;padding:0 5px}
.bc-player-timeline input{display:block;width:100%;height:4px;margin:6px 0;--bc-played:0%;background:linear-gradient(to right,#e22632 0%,#e22632 var(--bc-played),#ffffff57 var(--bc-played),#ffffff57 100%)}
.bc-player-timeline input::-webkit-slider-thumb{background:#f02b36;width:13px;height:13px}
.bc-player-timeline input::-moz-range-thumb{background:#f02b36}
.bc-player-actions{display:flex;justify-content:space-between;align-items:center;gap:3px}
.bc-player-transport,.bc-player-right{gap:1px;min-width:0}
.bc-player-actions button{height:40px;min-width:36px;padding:0 6px;border-radius:5px}
.bc-player-actions [data-act="play"]{background:none;width:38px;height:40px;border-radius:5px}
.bc-player-actions [data-act="expand"][aria-pressed="true"]{background:#ffffff25}
.bc-player-clock{white-space:nowrap;font:500 11px system-ui;color:#fff;font-variant-numeric:tabular-nums;margin-left:6px}
.bc-player-actions [data-el="volume"]{width:56px;accent-color:#eee;flex-shrink:0}
.bc-player-menu{position:absolute;right:14px;bottom:65px;z-index:5;width:min(230px,calc(100% - 28px));padding:14px;background:#202023eb;backdrop-filter:blur(16px);border:1px solid #ffffff22;border-radius:11px;color:#fff;font:12px system-ui}
.bc-player-menu[hidden]{display:none!important}
.bc-player-rates{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0}
.bc-player-rates button{background:#ffffff10;color:#fff;border:1px solid transparent;border-radius:6px;padding:9px 3px;cursor:pointer}
.bc-player-rates button[aria-pressed="true"]{background:#ffffff24;border-color:#e22632}
.bc-player-quality{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #ffffff20;padding-top:12px;color:#ccc}
#mfLightbox.bc-player-expanded .bc-world-player{max-height:calc(98vh - 125px)}
#mfLightbox.bc-video-mode.bc-player-expanded #mfViewerVideo{max-height:none}
.bc-world-player:fullscreen{width:100vw;height:100vh;max-height:none;aspect-ratio:auto;background:#000}
#mfLightbox .bc-world-player:fullscreen #mfViewerVideo{height:100%;width:100%;max-height:none}
@media(max-width:600px){.bc-world-player{max-height:65vh}.bc-player-panel{padding:15px 5px 3px}.bc-player-actions button{min-width:30px;height:34px;padding:0 3px}.bc-player-actions [data-act="play"]{width:31px;height:34px}.bc-player-actions button svg{width:18px;height:18px}.bc-player-actions [data-el="volume"]{display:none}.bc-player-clock{font-size:10px;margin-left:3px}.bc-player-center{width:58px;height:42px}}
`;document.head.append(style);
