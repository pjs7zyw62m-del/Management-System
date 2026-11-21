/* BLACKCELL REDLINE sender workspace — UI only.
   Existing verified room, role permissions and photo upload process are unchanged. */
(()=>{
'use strict';
const $=(q,root=document)=>root.querySelector(q);
const app=$('#ledgerApp'),room=$('#activeRoom'),upload=$('#employeeUpload'),file=$('#uploadPhoto'),feedback=$('#uploadFeedback');
if(!app||!room||!upload||!file)return;
function make(tag,cls,text){
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(text!==undefined)el.textContent=text;return el;
}
const hero=make('section','bc-sender-hero');hero.id='redlineSenderHero';hero.hidden=true;
hero.setAttribute('aria-label','Sender private room overview');
const eyebrow=make('div','bc-sender-eyebrow','●  BLACKCELL / SECURE CHANNEL');
const stats=make('div','bc-sender-facts');
const pending=make('div','bc-sender-fact'),owed=make('div','bc-sender-fact');
const pendingValue=make('strong','','0'),owedValue=make('strong','','$0.00');
pending.append(make('span','','AWAITING REVIEW'),pendingValue);
owed.append(make('span','','BALANCE'),owedValue);
stats.append(pending,owed);
const actions=make('div','bc-sender-hero-actions');
const choose=make('button','bc-sender-primary','+ ADD PHOTO');choose.type='button';choose.id='redlineSenderChoose';
const history=make('button','bc-sender-secondary','VIEW HISTORY');history.type='button';history.id='redlineSenderHistory';
actions.append(choose,history);
const roomLine=make('div','bc-sender-room-line');
const roomName=make('span','bc-sender-room-name','PRIVATE ROOM');
roomLine.append(make('span','bc-sender-dot',''),roomName,make('span','bc-sender-restricted','TWO-PERSON ACCESS'));
hero.append(eyebrow,stats,actions,roomLine);
room.insertBefore(hero,$('.room-toolbar',room));
// Selecting a file starts the existing verified room upload immediately.
const form=$('#uploadPhotoForm');
let landed=false;
const active=()=>!app.hidden&&!room.hidden&&!upload.hidden;
const mobile=()=>document.body.classList.contains('bc-ledger-mobile');
const tab=key=>$('.bc-ledger-phone-tab[data-ledger-navigate="'+key+'"]');
const liveText=selector=>$(selector)?.textContent?.trim()||'0';
function refreshStats(){
 pendingValue.textContent=liveText('#pendingCount');
 owedValue.textContent=liveText('#totalOwed');
 roomName.textContent=liveText('#activeRoomTitle');
}
function refresh(){
 const sender=active();
 document.body.classList.toggle('bc-ledger-sender',sender);
 hero.hidden=!sender;
 if(sender)refreshStats();
 if(sender&&mobile()&&!landed){
   const button=tab('upload');
   if(button&&!button.hidden){
     landed=true;
     requestAnimationFrame(()=>{if(active()&&mobile())button.click()});
   }
 }
 if(!sender)landed=false;
}
function sendSelectedPhoto(){
 if(!active()||!form||file.disabled||!file.files?.length)return;
 // requestSubmit fires the existing form submit event with its validation,
 // authorization and private Storage controls. form.submit() would bypass it.
 if(typeof form.requestSubmit==='function')form.requestSubmit();
 else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
}
function navigate(key){
 if(!active())return;
 const button=tab(key);
 if(mobile()&&button&&!button.hidden){button.click();return}
 (key==='photos'?$('#photoEntries'):upload)?.scrollIntoView({block:'start',behavior:'smooth'});
}
choose.addEventListener('click',()=>{
 if(!active())return;
 if(mobile()&&document.body.dataset.ledgerView!=='upload')navigate('upload');
 file.click();
});
history.addEventListener('click',()=>navigate('photos'));
file.addEventListener('change',sendSelectedPhoto);
for(const id of ['#pendingCount','#totalOwed','#activeRoomTitle']){
 const el=$(id);if(el)new MutationObserver(refreshStats).observe(el,{childList:true,characterData:true,subtree:true});
}
const observer=new MutationObserver(()=>requestAnimationFrame(refresh));
for(const el of [app,room,upload])observer.observe(el,{attributes:true,attributeFilter:['hidden']});
window.addEventListener('resize',refresh,{passive:true});
window.addEventListener('pageshow',refresh);
refresh();
})();