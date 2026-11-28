import {mountPopoutActions} from './corporate-chat-popout-actions.js?v=20261128-attached-reactions2';
import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261112-access2';
import {setupCorporateMedia} from './corporate-chat-media.js?v=20261122-contact-bootstrap2';
import {setupCorporateChatLive} from './corporate-chat-live.js?v=20261128-unread1';
import {installAndroidChatCaretGuard} from './corporate-chat-android-caret.js?v=20261122-return-keyboard10';
import {createChatTubeCards,parseTubeReference} from './blackcell-chat-tube-cards.js?v=1';
import {createChatPulseCards,parsePulseShare} from './blackcell-chat-pulse-cards.js?v=1';
const client=corporateClient(),$=id=>document.getElementById(id);
const embedParams=new URLSearchParams(location.search);
const popoutId=embedParams.get('popout')==='1'?embedParams.get('peer'):null;
const popout=typeof popoutId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(popoutId);
if(embedParams.get('popout')==='1')document.documentElement.classList.add('bc-chat-popout');
const mediaPanelMode=['share','library'].includes(embedParams.get('mediaPanel'))?embedParams.get('mediaPanel'):null;
const osChat=!mediaPanelMode&&(embedParams.get('osApp')==='chat'||(()=>{try{return window.parent!==window&&window.parent.location.origin===location.origin&&/\/blackcell-os(?:-preview)?\.html$/.test(window.parent.location.pathname)}catch(_){return false}})());
if(embedParams.get('embed')==='1')document.documentElement.classList.add('bc-embedded');
if(osChat)document.documentElement.classList.add('bc-os-chat');
if(/Android/i.test(navigator.userAgent||''))document.documentElement.classList.add('bc-chat-android');
const physicallySmallPhone=/iPhone|iPod/i.test(navigator.userAgent||'')||
 (navigator.maxTouchPoints>0&&Math.min(screen.width||Infinity,screen.height||Infinity)<=650);
const smallWindow=window.matchMedia(osChat?'(max-width: 550px)':'(max-width: 680px)');
const isCompact=()=>!mediaPanelMode&&(popout||embedParams.get('embed')==='1'||physicallySmallPhone||smallWindow.matches);
let compactChat=isCompact();
function syncChatLayout(){
 const desktop=!compactChat&&!mediaPanelMode&&!popout;
 document.documentElement.classList.toggle('bc-compact-chat',compactChat);
 document.documentElement.classList.toggle('bc-desktop-messages',desktop);
 document.documentElement.classList.toggle('bc-desktop-messages-page',desktop&&window.parent===window&&!osChat&&embedParams.get('embed')!=='1');
}
syncChatLayout();
if(mediaPanelMode)document.documentElement.classList.add('bc-media-panel','bc-media-'+mediaPanelMode);
if(!mediaPanelMode&&window.parent===window&&window.BlackcellMediaBubbleHost)
 window.BlackcellMediaBubbleHostController=window.BlackcellMediaBubbleHost({mode:'standalone'});
let self=null,peer=null,contacts=[],isLoading=false,firstLoad=true,ready=false;
const tubeCards=createChatTubeCards(client,()=>ready&&!!self&&!!peer),pulseCards=createChatPulseCards(client,()=>ready&&!!self&&!!peer);client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){tubeCards.clear();pulseCards.clear()}});
let chatBlocked=false,blockKnown=false,blockBusy=false,blockGeneration=0,blockReadSerial=0,sendingMessage=false;
const popButton=$('popoutChat');
if(popout){document.querySelector('.chat').classList.add('bc-thread-active');$('backToInbox').hidden=true;popButton.hidden=true;}
function openChatPopout(){
 if(!ready||!peer||popout||mediaPanelMode)return;
 let parentOS=false;try{parentOS=window.parent!==window&&window.parent.location.origin===location.origin&&/\/blackcell-os(?:-preview)?\.html$/.test(window.parent.location.pathname)}catch(_){}
 if(parentOS){window.parent.postMessage({type:'blackcell-chat-popout',peerId:peer.user_id,name:peer.display_name||'Employee'},location.origin);return;}
 const url=new URL(location.pathname,location.origin);url.searchParams.set('popout','1');url.searchParams.set('peer',peer.user_id);url.searchParams.set('v','20261115-contact-axis1');window.open(url.href,'_blank','noopener,noreferrer,width=440,height=720');
}
popButton?.addEventListener('click',openChatPopout);
window.BLACKCELL_OS_BEFORE_CLOSE=()=>({ok:true,retain:!!$('messageInput').value.trim()||!!document.querySelector('[aria-busy=true],.is-uploading,[data-busy=true]')});
let inboxSummaries=new Map(),inboxUnread=new Set(),inboxUnreadCounts=new Map(),inboxFilter='all',inboxEditing=false,inboxComposing=false,inboxRefreshing=false,inboxSelection=new Set(),inboxMarking=false,inboxUnreadAvailable=false;
let sidebarClosed=false,inboxPins=[],pinMenuId=null;
const inboxPinKey=()=>self?'bc.imessage.pins.v1:'+self:null;
const normalizePins=value=>Array.isArray(value)?[...new Set(value.filter(id=>typeof id==='string'&&contacts.some(c=>c.user_id===id)))]:[];
function readInboxPins(){
 const key=inboxPinKey();if(!key)return [];
 try{return normalizePins(JSON.parse(localStorage.getItem(key)||'[]'))}catch(_){return []}
}
function toggleInboxPin(id){
 if(!ready||!self||popout||mediaPanelMode||!contacts.some(c=>c.user_id===id))return;
 // Read the newest browser-scoped account preference before changing it.
 let current=inboxPins;
 try{const saved=localStorage.getItem(inboxPinKey());if(saved!==null)current=normalizePins(JSON.parse(saved))}catch(_){}
 const next=current.includes(id)?current.filter(x=>x!==id):[...current,id];
 try{localStorage.setItem(inboxPinKey(),JSON.stringify(next))}catch(_){status('Pins could not be saved on this device.')}
 inboxPins=next;closePinMenu();renderPeers();
}
window.addEventListener('storage',event=>{
 if(ready&&self&&event.key===inboxPinKey()){inboxPins=readInboxPins();renderPeers()}
});
function closePinMenu(){const menu=$('inboxPinMenu');if(menu)menu.hidden=true;pinMenuId=null}
function openPinMenu(event,id,anchor){
 if(!ready||!contacts.some(c=>c.user_id===id)||inboxEditing||inboxComposing)return;
 event.preventDefault();event.stopPropagation();closeInboxFilter();
 const menu=$('inboxPinMenu'),action=$('inboxPinMenuAction');pinMenuId=id;
 action.textContent=inboxPins.includes(id)?'Unpin conversation':'Pin conversation';
 menu.hidden=false;
 const rect=anchor.getBoundingClientRect(),x=event.clientX||rect.left,y=event.clientY||rect.bottom;
 menu.style.left=Math.max(6,Math.min(x,innerWidth-menu.offsetWidth-6))+'px';
 menu.style.top=Math.max(6,Math.min(y,innerHeight-menu.offsetHeight-6))+'px';
 action.focus();
}
function pinButton(c){
 const pinned=inboxPins.includes(c.user_id),button=document.createElement('button');button.type='button';
 const label=(pinned?'Unpin ':'Pin ')+(c.display_name||'conversation');
 button.className='inbox-pin-action'+(pinned?' is-pinned':'');button.title=label;button.setAttribute('aria-label',label);
 button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 4 6 6-3 1-3 5-3 1-2-2-5 5 5-5-2-2 1-3 5-3 1-3Z"/>'+(pinned?'<path d="M3 3l18 18"/>':'')+'</svg>';
 button.addEventListener('click',event=>{event.stopPropagation();toggleInboxPin(c.user_id)});
 return button;
}
const sidebarKey=()=>self?'bc.imessage.sidebar.v1:'+self:null;
function readSidebarPreference(){
 const key=sidebarKey();if(!key)return false;
 const records=[];
 for(const name of ['localStorage','sessionStorage'])try{const v=JSON.parse(window[name].getItem(key)||'null');if(typeof v?.closed==='boolean')records.push(v)}catch(_){}
 records.sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0));
 return records[0]?.closed===true;
}
function applySidebarPreference(){
 if(!osChat)return;
 const toggle=$('osSidebarToggle'),sidebar=$('osChatSidebar'),chat=document.querySelector('.chat');
 if(!toggle||!sidebar||!chat)return;
 const closed=!compactChat&&sidebarClosed&&!!peer;
 chat.classList.toggle('os-sidebar-closed',closed);
 sidebar.inert=closed;
 toggle.hidden=compactChat||popout;
 toggle.disabled=!peer;
 toggle.setAttribute('aria-expanded',String(!closed));
 toggle.setAttribute('aria-label',closed?'Show conversations':'Hide conversations');
 toggle.title=closed?'Show conversations':'Hide conversations';
}
function changeSidebarPreference(){
 if(!osChat||compactChat||!peer)return;
 sidebarClosed=!sidebarClosed;
 const key=sidebarKey();if(key){const value=JSON.stringify({closed:sidebarClosed,at:Date.now()});for(const name of ['localStorage','sessionStorage'])try{window[name].setItem(key,value)}catch(_){}}
 applySidebarPreference();
}
if(osChat)$('osSidebarToggle')?.addEventListener('click',changeSidebarPreference);
let employeeSession=false,sessionEnded=false,lastActivity=Date.now(),lastTouch=Date.now();
let chatVerificationPaused=false,chatVerificationChecking=false;
const IDLE_LIMIT_MS=60*60*1000;
async function endChatAccess(reason){
 if(sessionEnded)return;
 sessionEnded=true;ready=false;tubeCards.clear();pulseCards.clear();employeeSession=false;inboxPins=[];closePinMenu();syncInboxControls();$('inboxRecent').hidden=true;
 $('messageInput').disabled=true;$('sendButton').disabled=true;
 status(reason);
 live.dispose();
 // This embedded app must never revoke the OS-wide auth token. The parent
 // BLACKCELL OS and Employee portal enforce the server authorization/idle
 // policy independently. Chat is locked locally on confirmed expiry.
 $('returnLink').href='blackcell-os.html';$('returnLink').textContent='RETURN TO BLACKCELL OS';
}
function pauseChatForNetwork(){
 if(sessionEnded||!employeeSession)return;
 chatVerificationPaused=true;ready=false;blockKnown=false;
 syncInboxControls();syncBlockControls();sharedMedia.closeMediaTray();
 status('Connection interrupted. Your BLACKCELL sign-in is preserved. Chat will resume after verification.');
}
async function reverifyChatOnReturn(){
 if(sessionEnded||!employeeSession||chatVerificationChecking||document.hidden)return;
 chatVerificationChecking=true;
 try{
  const {data,error}=await client.rpc('corp_employee_code_status');
  if(error){pauseChatForNetwork();return}
  if(data?.ok!==true||data?.verified!==true){
   await endChatAccess('Employee chat authorization expired. Return to BLACKCELL OS to verify access.');
   return;
  }
  if(chatVerificationPaused){
   chatVerificationPaused=false;ready=true;blockKnown=false;lastTouch=Date.now();
   syncInboxControls();syncBlockControls();status('');
   if(peer)void refreshCurrentBlock();
  }
  if(ready)void loadMessages();
 }catch(_){pauseChatForNetwork()}
 finally{chatVerificationChecking=false}
}
function chatActivity(){
 if(sessionEnded)return;
 if(window.parent!==window)
  window.parent.postMessage({type:'blackcell-chat-activity'},location.origin);
 if(!employeeSession)return;
 if(Date.now()-lastActivity>=IDLE_LIMIT_MS){
  void endChatAccess('Chat locked after 60 minutes of inactivity. Return to BLACKCELL OS to verify access.');return;
 }
 lastActivity=Date.now();
 if(Date.now()-lastTouch>60000){
  lastTouch=Date.now();
  void client.rpc('corp_employee_touch_session').then(({data,error})=>{
   if(error){pauseChatForNetwork();return}
   if(data?.ok!==true){void endChatAccess('Employee authorization expired. Return to BLACKCELL OS.');return}
   if(chatVerificationPaused)void reverifyChatOnReturn();
  }).catch(()=>pauseChatForNetwork());
 }
}

function status(text){$('systemStatus').textContent=text;$('systemStatus').hidden=!text}
const sharedMedia=setupCorporateMedia({client,context:()=>({self,peer,ready,blocked:chatBlocked||!blockKnown||blockBusy}),reloadMessages:loadMessages,status});
window.BLACKCELL_OS_PAUSE_MEDIA=()=>sharedMedia.pause();
const live=setupCorporateChatLive({
 client,context:()=>({self,peer,ready}),
 typingLabel:$('typingIndicator'),typingName:$('typingName')
});
const mediaToggle=$('mediaToggleButton');
const canShowFullMedia=()=>window.BlackcellChatMedia?.enabled()===true;
mediaToggle.hidden=false;mediaToggle.title='Attachments';
mediaToggle.setAttribute('aria-label','Attachment options');
mediaToggle.addEventListener('click',event=>{
 event.preventDefault();
 event.stopPropagation();
 sharedMedia.toggleMediaTray();
});
window.addEventListener('blackcell-chat-media-capability-change',()=>sharedMedia.closeMediaTray());
const inboxEdit=$('inboxEdit'),inboxCompose=$('inboxCompose'),inboxMenu=$('inboxFilterMenu'),inboxFilterButton=$('inboxFilter'),inboxMarkRead=$('inboxMarkRead');
/* Conversation-scoped message search and local starred-message IDs.
   Never save message text, media URLs or credentials in browser storage. */
const finder=$('bcMessageFinder'),finderResults=$('bcFinderResults'),finderStatus=$('bcFinderStatus');
let finderMode='search',finderGeneration=0;
const starsKey=()=>self&&peer?'bc.imessage.stars.v1:'+self+':'+peer.user_id:null;
function readStars(){
 const key=starsKey();if(!key)return [];
 try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?[...new Set(data.filter(v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)))].slice(0,500):[]}catch(_){return []}
}
function updateStarControl(b,id){const starred=readStars().includes(id);b.textContent=starred?'★':'☆';b.setAttribute('aria-pressed',String(starred));b.title=starred?'Remove star':'Star message';b.setAttribute('aria-label',b.title)}
function toggleMessageStar(id,button){
 if(!ready||!self||!peer||sessionEnded)return;
 const key=starsKey();if(!key)return;
 const ids=readStars(),next=ids.includes(id)?ids.filter(x=>x!==id):[id,...ids].slice(0,500);
 try{localStorage.setItem(key,JSON.stringify(next));for(const b of document.querySelectorAll('[data-bc-star-id]'))updateStarControl(b,b.dataset.bcStarId);if(finder.open&&finderMode==='starred')void runFinder()}catch(_){status('Star could not be saved on this device.')}
}
function makeStarControl(id){
 const b=text('button','bc-message-star','');b.type='button';b.dataset.bcStarId=id;updateStarControl(b,id);b.addEventListener('click',e=>{e.stopPropagation();toggleMessageStar(id,b)});return b;
}
function closeMessageFinder(){finderGeneration++;finderResults.replaceChildren();finderStatus.textContent='';$('bcFinderQuery').value='';if(finder.open)finder.close()}
const mobileTools=$('bcMobileChatTools'),headerActions=$('bcChatHeaderActions');
const mobileHeaderQuery=window.matchMedia('(max-width: 600px)');
function closeMobileTools(restore=false){
 mobileTools.setAttribute('aria-expanded','false');headerActions.classList.remove('bc-mobile-tools-open');
 if(restore&&mobileTools.getClientRects().length)mobileTools.focus({preventScroll:true});
}
mobileTools.addEventListener('click',()=>{
 if(mobileTools.disabled)return;
 const open=mobileTools.getAttribute('aria-expanded')!=='true';
 mobileTools.setAttribute('aria-expanded',String(open));headerActions.classList.toggle('bc-mobile-tools-open',open);
});
headerActions.addEventListener('click',e=>{
 if(e.target.closest('button,a')&&!e.target.closest('#bcAndroidAttachmentShortcut'))closeMobileTools();
});
document.addEventListener('pointerdown',e=>{
 if(!headerActions.contains(e.target)&&!mobileTools.contains(e.target))closeMobileTools();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobileTools.getAttribute('aria-expanded')==='true')closeMobileTools(true)});
const onMobileHeaderResize=()=>closeMobileTools();
if(mobileHeaderQuery.addEventListener)mobileHeaderQuery.addEventListener('change',onMobileHeaderResize);else mobileHeaderQuery.addListener(onMobileHeaderResize);
function syncMessageTools(){
 const available=!!(ready&&self&&peer&&!sessionEnded&&!mediaPanelMode);
 for(const id of ['bcFindMessages','bcStarredMessages']){const b=$(id);b.disabled=!available;b.hidden=!!mediaPanelMode;}
 mobileTools.disabled=!available;if(!available)closeMobileTools();
 if(!available&&finder.open)closeMessageFinder();
}
function openFinder(mode){
 if(!ready||!self||!peer||sessionEnded||mediaPanelMode)return;
 finderMode=mode;finderGeneration++;finderResults.replaceChildren();$('bcFinderTitle').textContent=mode==='starred'?'Starred messages':'Search messages';$('bcFinderForm').hidden=mode==='starred';$('bcFinderQuery').value='';
 finderStatus.textContent=mode==='starred'?'Stars are private to your account on this browser.':'Search the text history of this conversation.';
 if(!finder.open)finder.showModal();
 if(mode==='starred')void runFinder();else $('bcFinderQuery').focus();
}
async function runFinder(){
 if(!ready||!self||!peer||sessionEnded||!finder.open)return;
 const owner=self,pid=peer.user_id,g=++finderGeneration,mode=finderMode,query=$('bcFinderQuery').value.trim();
 const current=()=>ready&&self===owner&&peer?.user_id===pid&&finder.open&&finderGeneration===g&&!sessionEnded;
 finderResults.replaceChildren();
 if(mode==='search'&&!query){finderStatus.textContent='Enter words to search.';return}
 const ids=mode==='starred'?readStars():[];
 if(mode==='starred'&&!ids.length){finderStatus.textContent='No starred messages. Select the star beside a text message.';return}
 finderStatus.textContent='Searching…';
 try{
  const pair='and(sender_id.eq.'+owner+',recipient_id.eq.'+pid+'),and(sender_id.eq.'+pid+',recipient_id.eq.'+owner+')';
  let request=client.from('corp_chat_messages').select('id,sender_id,body,created_at').or(pair).is('deleted_at',null).is('media_batch_id',null).order('created_at',{ascending:false}).limit(50);
  if(mode==='starred')request=request.in('id',ids.slice(0,100));else request=request.ilike('body','%'+query.replace(/[\\%_*]/g,ch=>'\\'+ch)+'%');
  const {data,error}=await request;if(!current())return;if(error)throw error;
  const rows=data||[];finderStatus.textContent=rows.length?rows.length+' result'+(rows.length===1?'':'s')+(rows.length===50?' · showing up to 50':''):'No matching messages.';
  for(const m of rows){const row=document.createElement('article');row.className='bc-finder-result';const top=document.createElement('div');top.className='bc-finder-result-head';top.append(text('strong','',m.sender_id===owner?'You':peer.display_name||'Contact'),text('time','',new Date(m.created_at).toLocaleString()),makeStarControl(m.id));row.append(top,text('p','',m.body||''));finderResults.append(row)}
 }catch(_){if(current())finderStatus.textContent='Messages could not be loaded. Try again.'}
}
$('bcFindMessages').addEventListener('click',()=>openFinder('search'));$('bcStarredMessages').addEventListener('click',()=>openFinder('starred'));
$('bcFinderClose').addEventListener('click',closeMessageFinder);
$('bcFinderForm').addEventListener('submit',e=>{e.preventDefault();void runFinder()});
finder.addEventListener('close',()=>{finderGeneration++;finderResults.replaceChildren();finderStatus.textContent='';$('bcFinderQuery').value=''});
function closeInboxFilter(){inboxMenu.hidden=true;inboxFilterButton.setAttribute('aria-expanded','false')}
function syncInboxControls(){
 syncMessageTools();
 const quickDisabled=!ready||inboxEditing||inboxComposing;
 for(const b of document.querySelectorAll('[data-rail-filter]')){b.disabled=quickDisabled;b.setAttribute('aria-pressed',String(b.dataset.railFilter===inboxFilter));}
 const railCompose=$('bcRailCompose');if(railCompose)railCompose.disabled=quickDisabled;
 const railMedia=$('bcRailMedia');if(railMedia)railMedia.disabled=!ready||!peer;
 for(const b of document.querySelectorAll('[data-quick-filter]')){b.disabled=quickDisabled;b.setAttribute('aria-pressed',String(b.dataset.quickFilter===inboxFilter));}
 const unreadCount=$('bcUnreadCount');if(unreadCount){unreadCount.hidden=!ready||!inboxUnreadAvailable||!inboxUnread.size;unreadCount.textContent=String([...inboxUnreadCounts.values()].reduce((a,b)=>a+b,0));}
 for(const b of inboxMenu.querySelectorAll('[data-inbox-filter]'))b.setAttribute('aria-pressed',String(b.dataset.inboxFilter===inboxFilter));
 inboxEdit.textContent=inboxComposing?'Cancel':inboxEditing?'Done':'Edit';
 inboxEdit.setAttribute('aria-pressed',String(inboxEditing));
 inboxEdit.disabled=!ready||inboxMarking;
 inboxCompose.disabled=!ready||inboxComposing||inboxEditing;
 inboxCompose.hidden=inboxEditing;
 inboxMarkRead.hidden=!inboxEditing;
 inboxMarkRead.disabled=!ready||!inboxSelection.size||inboxMarking;
 inboxFilterButton.disabled=inboxEditing||inboxComposing;
 $('inboxHeading').textContent=inboxComposing?'New Message':inboxFilter==='all'?'iMessage':inboxFilter==='unread'?'Unread Messages':inboxFilter==='known'?'Known Senders':inboxFilter==='pinned'?'Pinned Conversations':'Unknown Senders';
}
function exitInboxMode(){inboxEditing=false;inboxComposing=false;inboxSelection.clear();syncInboxControls()}
inboxFilterButton.addEventListener('click',()=>{if(!inboxMenu.hidden){closeInboxFilter();return}inboxMenu.hidden=false;inboxFilterButton.setAttribute('aria-expanded','true');inboxMenu.querySelector('[aria-pressed=true]')?.focus()});
function selectInboxFilter(value){
 if(!ready||inboxEditing||inboxComposing||!['all','unread','pinned','known','unknown'].includes(value))return;
 inboxFilter=value;closeInboxFilter();closePinMenu();renderPeers();if(value==='unread')void refreshInboxSummaries();
}
inboxMenu.addEventListener('click',e=>{const b=e.target.closest('[data-inbox-filter]');if(!b)return;selectInboxFilter(b.dataset.inboxFilter);inboxFilterButton.focus()});
for(const b of document.querySelectorAll('[data-quick-filter]'))b.addEventListener('click',()=>selectInboxFilter(b.dataset.quickFilter));
for(const b of document.querySelectorAll('[data-rail-filter]'))b.addEventListener('click',()=>selectInboxFilter(b.dataset.railFilter));
$('bcRailCompose')?.addEventListener('click',()=>{if(ready&&!inboxComposing&&!inboxEditing)inboxCompose.click()});
$('bcRailMedia')?.addEventListener('click',()=>{if(ready&&peer)void sharedMedia.openLibrary()});
document.addEventListener('pointerdown',e=>{if(!inboxMenu.hidden&&!e.target.closest('.apple-filter-anchor'))closeInboxFilter()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!inboxMenu.hidden){closeInboxFilter();inboxFilterButton.focus()}});
inboxEdit.addEventListener('click',()=>{closeInboxFilter();if(inboxComposing||inboxEditing){exitInboxMode();$('peerSearch').value=''}else{inboxEditing=true;inboxSelection.clear()}renderPeers()});
inboxCompose.addEventListener('click',()=>{closeInboxFilter();inboxComposing=true;inboxEditing=false;inboxSelection.clear();$('peerSearch').value='';renderPeers();$('peerSearch').focus()});
inboxMarkRead.addEventListener('click',async()=>{
 if(!ready||!self||inboxMarking||!inboxSelection.size)return;
 inboxMarking=true;syncInboxControls();
 const selected=[...inboxSelection].filter(id=>contacts.some(c=>c.user_id===id));
 try{
  if(selected.length){const {error}=await client.from('corp_chat_messages').update({read_at:new Date().toISOString()}).eq('recipient_id',self).in('sender_id',selected).is('read_at',null);if(error)throw error}
  for(const id of selected)inboxUnread.delete(id);
  exitInboxMode();await refreshInboxSummaries();renderPeers();
 }catch(_){status('Could not mark selected conversations as read. Try again.')}
 finally{inboxMarking=false;syncInboxControls()}
});
$('inboxPinMenuAction').addEventListener('click',()=>{if(pinMenuId)toggleInboxPin(pinMenuId)});
document.addEventListener('pointerdown',e=>{if(!$('inboxPinMenu').hidden&&!e.target.closest('#inboxPinMenu'))closePinMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('inboxPinMenu').hidden){closePinMenu();e.preventDefault()}});
window.addEventListener('resize',closePinMenu);
$('peerSearch').addEventListener('input',()=>{closePinMenu();renderPeers()});
syncInboxControls();
$('backToInbox').addEventListener('click',()=>{
 if(!compactChat||popout)return;
 live.setThreadOpen(false);
 document.querySelector('.chat').classList.remove('bc-thread-active');
 sharedMedia.closeMediaTray();
 if(window.parent!==window)window.parent.postMessage({type:'blackcell-chat-inbox-open'},location.origin);
 void refreshInboxSummaries();
});
smallWindow.addEventListener('change',()=>{
 const next=isCompact();if(next===compactChat)return;compactChat=next;
 syncChatLayout();
 document.querySelector('.chat').classList.toggle('bc-thread-active',compactChat&&!!peer);
 live.setThreadOpen(!!peer&&!mediaPanelMode);
 // Resizing the window must never select a contact or mark a thread read.
 applySidebarPreference();renderPeers();
});
const composerText=$('messageInput');
const androidChatCaretGuard=installAndroidChatCaretGuard(composerText);
// REDLINE intentionally leaves its Android textarea height alone during typing.
// Reflowing the iMessage textarea on every keystroke can move the caret during
// Android Chrome/Gboard composition on some devices (including low-end phones).
// Keep the native editor in control; all message/typing actions stay unchanged.
const androidNativeComposer=/Android/i.test(navigator.userAgent||'');
let composerCompositionActive=false;
function resizeComposer(){
 if(androidNativeComposer||composerCompositionActive)return;
 composerText.style.height='auto';
 composerText.style.height=Math.min(composerText.scrollHeight,112)+'px';
}

let messageMutationBusy=false;
function ownEditableMessage(m){return ready&&!!self&&peer?.user_id===m.recipient_id&&m.sender_id===self&&!m.media_batch_id&&!m.deleted_at}
async function mutateSentMessage(m,{body,remove=false}){
 if(!ownEditableMessage(m)||messageMutationBusy)return false;
 if(!remove&&(chatBlocked||!blockKnown||blockBusy)){status('Unblock this conversation before editing.');return false}
 const uid=self,pid=peer.user_id;messageMutationBusy=true;
 try{
  const content=String(body||'').trim();
  if(!remove&&(!content||content.length>2000)){status('Enter a message of up to 2,000 characters.');return false}
  if(!remove){const ref=parseTubeReference(content);if(ref&&!(await tubeCards.canShare(ref))){status('That private video cannot be shared.');return false}}
  if(!ownEditableMessage(m)||self!==uid||peer?.user_id!==pid)return false;
  const patch=remove?{deleted_at:new Date().toISOString()}:{body:content};
  let query=client.from('corp_chat_messages').update(patch).eq('id',m.id).eq('sender_id',uid).eq('recipient_id',pid).is('deleted_at',null).eq('body',m.body);
  const {data,error}=await query.select('id,edited_at,deleted_at').maybeSingle();
  if(error||!data){status('Message was not changed. It may have been updated elsewhere or the conversation is unavailable.');return false}
  if(self===uid&&peer?.user_id===pid){$('messages').dataset.readSignature='';await loadMessages();if(!popout&&!mediaPanelMode)void refreshInboxSummaries();status(remove?'Message deleted for everyone.':'Message edited.')}
  return true;
 }catch(e){status('Unable to update the message. Check your connection.');return false}
 finally{messageMutationBusy=false}
}
function editSentMessage(m){
 if(!ownEditableMessage(m)||messageMutationBusy||document.querySelector('.bc-message-edit-dialog[open]'))return;
 const d=document.createElement('dialog');d.className='bc-message-edit-dialog';d.setAttribute('aria-label','Edit sent message');
 const form=document.createElement('form'),area=document.createElement('textarea');area.value=m.body;area.required=true;area.maxLength=2000;area.rows=5;area.setAttribute('aria-label','Edited message');
 const actions=document.createElement('div');actions.className='bc-message-edit-buttons';
 const cancel=text('button','','Cancel');cancel.type='button';cancel.addEventListener('click',()=>d.close());
 const save=text('button','bc-message-edit-save','Save changes');save.type='submit';
 const note=text('p','bc-message-edit-note','The recipient will see your updated message marked Edited.');
 form.append(text('h2','','Edit message'),area,note,actions);actions.append(cancel,save);d.append(form);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});
 form.addEventListener('submit',async e=>{e.preventDefault();if(!area.value.trim()||!ownEditableMessage(m))return;if(area.value.trim()===m.body){d.close();return}save.disabled=cancel.disabled=true;d.dataset.busy='true';const ok=await mutateSentMessage(m,{body:area.value});delete d.dataset.busy;if(ok)d.close();else{save.disabled=cancel.disabled=false;note.textContent='Unable to save. The message may have changed or this conversation is unavailable.'}});
 d.addEventListener('cancel',e=>{if(messageMutationBusy)e.preventDefault()});
 d.showModal();area.focus();area.setSelectionRange(area.value.length,area.value.length);
}
async function deleteSentMessage(m){
 if(!ownEditableMessage(m)||messageMutationBusy)return;
 if(!confirm('Delete this message for everyone in this conversation? The message text will be removed and replaced with a deleted notice. This cannot be undone.'))return;
 await mutateSentMessage(m,{remove:true});
}

 const reactionPending=new Set();
 const popoutActions=!mediaPanelMode?mountPopoutActions({
  canAct:()=>ready&&!!self&&!!peer,
  composer:composerText,resizeComposer,status,editMessage:editSentMessage,deleteMessage:deleteSentMessage,
  sendReaction:async (message,glyph)=>{
   if(!ready||!self||!peer||chatBlocked||!blockKnown||blockBusy){status('Unblock this conversation before reacting.');return;}
   const target=peer.user_id,uid=self;
   if(message.deleted_at||message.media_batch_id||!((message.sender_id===uid&&message.recipient_id===target)||(message.recipient_id===uid&&message.sender_id===target)))return;
   if(!['❤️','👍','👎','😂','‼️','❓'].includes(glyph)||reactionPending.has(message.id))return;
   reactionPending.add(message.id);
   try{
    const existing=(message.corp_chat_reactions||[]).find(r=>r.reactor_id===uid);
    const result=existing?.reaction===glyph
     ?await client.from('corp_chat_reactions').delete().eq('message_id',message.id).eq('reactor_id',uid)
     :await client.from('corp_chat_reactions').upsert({message_id:message.id,reactor_id:uid,reaction:glyph},{onConflict:'message_id,reactor_id'});
    if(result.error)throw result.error;
    if(self===uid&&peer?.user_id===target){await loadMessages();status('')}
   }catch(_){status('Reaction could not be saved. Try again.')}
   finally{reactionPending.delete(message.id)}

  }
 }):null;
 if(popout&&popoutActions){
  const header=document.querySelector('.chat-title');
  const back=document.createElement('button');back.type='button';back.className='bc-pop-nav bc-pop-back';back.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';back.setAttribute('aria-label','Close pop-out and return to messages');
  back.addEventListener('click',()=>{
   if(window.parent!==window&&osChat){window.parent.postMessage({type:'blackcell-chat-popout-close'},location.origin);return}
   if($('messageInput').value.trim()&&!confirm('Close this conversation? Your unsent draft may be lost.'))return;
   window.close();
   if(!window.closed)location.assign('corporate-chat.html?v=20261115-contact-axis1');
  });
  const camera=document.createElement('button');camera.type='button';camera.id='popoutCamera';camera.className='bc-pop-nav bc-pop-camera';camera.hidden=true;camera.title='Video calling — not connected yet';camera.setAttribute('aria-label','Video calling, not available yet');camera.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6.5" width="12" height="11" rx="2.8" stroke="currentColor" stroke-width="1.7"/><path d="m15 10 4.6-2.8a.9.9 0 0 1 1.4.8v8a.9.9 0 0 1-1.4.8L15 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';camera.addEventListener('click',()=>{closeInfoMenu();status('Video calling is not available yet.');});
  const info=document.createElement('button');info.type='button';info.id='popoutInfo';info.className='bc-pop-nav bc-pop-profile';info.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="6" r="1.5" fill="currentColor"/><path d="M12 10v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';info.hidden=true;info.setAttribute('aria-label','Contact options');info.setAttribute('aria-expanded','false');info.setAttribute('aria-controls','popoutInfoMenu');
  const menu=document.createElement('div');menu.id='popoutInfoMenu';menu.className='bc-pop-info-menu';menu.hidden=true;
  const profile=document.createElement('a');profile.id='popoutProfile';profile.href='corporate-network.html';profile.target='_blank';profile.rel='noopener';profile.textContent='View Profile';
  const block=document.createElement('button');block.type='button';block.id='popoutBlock';block.className='bc-pop-block-action';block.textContent='Block';
  block.addEventListener('click',()=>{closeInfoMenu();void toggleCurrentBlock()});
  profile.addEventListener('click',closeInfoMenu);
  menu.append(profile,block);
  info.addEventListener('click',()=>{if(!ready||!peer)return;const open=menu.hidden;menu.hidden=!open;info.setAttribute('aria-expanded',String(open));if(open){syncBlockControls();void refreshCurrentBlock();}});
  document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!info.contains(e.target))closeInfoMenu()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){closeInfoMenu();info.focus()}});
  header.append(back,camera,info,menu);
 }
const blockNotice=document.createElement('div');blockNotice.className='bc-chat-block-notice';blockNotice.hidden=true;blockNotice.setAttribute('role','status');
const blockNoticeText=document.createElement('span');blockNoticeText.textContent='You blocked this contact. New messages and attachments are disabled.';
const unblockButton=document.createElement('button');unblockButton.type='button';unblockButton.textContent='Unblock';unblockButton.addEventListener('click',()=>void toggleCurrentBlock());blockNotice.append(blockNoticeText,unblockButton);
$('sendForm').before(blockNotice);
function closeInfoMenu(){const menu=$('popoutInfoMenu'),info=$('popoutInfo');if(menu)menu.hidden=true;if(info)info.setAttribute('aria-expanded','false')}
function syncBlockControls(){
 syncMessageTools();
 const disabled=!ready||!peer||!blockKnown||chatBlocked||blockBusy;
 $('messageInput').disabled=disabled;$('sendButton').disabled=disabled||sendingMessage;
 blockNotice.hidden=!chatBlocked||!ready||!peer;unblockButton.disabled=blockBusy;
 const action=$('popoutBlock');if(action){action.textContent=chatBlocked?'Unblock':'Block';action.classList.toggle('bc-pop-block-action',!chatBlocked);action.disabled=!blockKnown||blockBusy||!ready}
 if(chatBlocked)sharedMedia.closeMediaTray();
}
async function refreshCurrentBlock(){
 if(!ready||!self||!peer||blockBusy)return;
 const pid=peer.user_id,generation=blockGeneration,serial=++blockReadSerial;
 try{
  const {data,error}=await client.from('corp_chat_blocks').select('blocked_id').eq('blocker_id',self).eq('blocked_id',pid).maybeSingle();
  if(generation!==blockGeneration||serial!==blockReadSerial||blockBusy||!ready)return;
  if(error)throw error;
  chatBlocked=!!data;blockKnown=true;syncBlockControls();
 }catch(_){if(generation===blockGeneration&&serial===blockReadSerial&&!blockKnown)status('Could not check contact blocking. Try again shortly.')}
}
async function toggleCurrentBlock(){
 if(!ready||!self||!peer||!blockKnown||blockBusy)return;
 const pid=peer.user_id,generation=blockGeneration,willBlock=!chatBlocked,name=peer.display_name||'this contact';
 if(willBlock&&!confirm('Block '+name+'? New messages and attachments between you will be disabled. Previous messages will remain.'))return;
 blockBusy=true;blockReadSerial++;syncBlockControls();
 try{
  const request=willBlock?client.from('corp_chat_blocks').insert({blocker_id:self,blocked_id:pid}):client.from('corp_chat_blocks').delete().eq('blocker_id',self).eq('blocked_id',pid);
  const {error}=await request;
  if(error&&!(willBlock&&error.code==='23505'))throw error;
  if(generation===blockGeneration&&ready){chatBlocked=willBlock;blockKnown=true;status(willBlock?'Contact blocked.':'Contact unblocked.');}
  try{localStorage.setItem('bc.chat.block.changed.'+self,String(Date.now()))}catch(_){}
 }catch(_){if(generation===blockGeneration)status('Could not change blocking. No change confirmed.')}
 finally{blockBusy=false;syncBlockControls();void refreshCurrentBlock()}
}
window.addEventListener('storage',e=>{if(ready&&self&&e.key==='bc.chat.block.changed.'+self)void refreshCurrentBlock()});
setInterval(()=>{if(ready&&peer&&!document.hidden)void refreshCurrentBlock()},20000);
composerText.addEventListener('compositionstart',()=>{composerCompositionActive=true});
composerText.addEventListener('compositionend',()=>{
 composerCompositionActive=false;
 if(!chatBlocked&&blockKnown&&!blockBusy)live.onInput(composerText.value);
});
composerText.addEventListener('input',()=>{
 // Android IMEs own the live caret and composition range. Avoid changing
 // textarea geometry or reprocessing typing state mid-composition.
 resizeComposer();
 if(!composerCompositionActive&&!chatBlocked&&blockKnown&&!blockBusy)live.onInput(composerText.value);
});
composerText.addEventListener('blur',()=>{composerCompositionActive=false;live.stopTyping()});
composerText.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!composerCompositionActive){
  e.preventDefault();if(!composerText.disabled)$('sendForm').requestSubmit();
 }
});
function text(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=value;return el}
let bootRunning=false,bootAttempt=0,bootRetryTimer=null;
function showInboxStartupProblem(message,{retry=false,link=null}={}){
 if(ready)return;
 const note=String(message||'iMessage contacts are unavailable.');
 $('peers').replaceChildren(text('p','empty',note));
 const panel=$('chatStartupRecovery');
 const messageElement=$('chatStartupRecoveryMessage');
 if(messageElement)messageElement.textContent=note;
 if(panel)panel.hidden=false;
 if($('retryContacts'))$('retryContacts').hidden=!retry;
 if(link){
  $('returnLink').href=link;
  $('returnLink').textContent=link==='dashboard.html'?'ADMINISTRATION':'EMPLOYEE ACCESS';
 }
 status(note);
 if(retry&&bootAttempt<4&&!bootRetryTimer){
  const delay=Math.min(18000,3500*bootAttempt);
  bootRetryTimer=setTimeout(()=>{
   bootRetryTimer=null;
   if(!ready&&!bootRunning&&!document.hidden)void boot();
  },delay);
 }
}
function startInboxCheck(){
 if(ready)return;
 $('peers').replaceChildren(text('p','empty','Checking authorized contacts…'));
 const panel=$('chatStartupRecovery');if(panel)panel.hidden=true;
 status('');
}
function withInboxDeadline(promise,ms=18000){
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('BLACKCELL contact verification timed out')),ms);
  Promise.resolve(promise).then(value=>{clearTimeout(timeout);resolve(value)},error=>{clearTimeout(timeout);reject(error)});
 });
}
async function boot(){
 if(ready||bootRunning)return;
 bootRunning=true;bootAttempt++;
 startInboxCheck();
 try{
  // Do not alter local auth state or clear any messages on transport failure.
  const session=await withInboxDeadline(client.auth.getSession());
  if(session.error)throw session.error;
  const member=await withInboxDeadline(corporateAuthorize(client,{classifyTransport:true}));
  if(!member.ok&&member.reason==='ledger-only'){location.replace('private-photo-ledger.html');return}
  if(!member.ok){
   if(member.reason==='verification-error')throw Error('BLACKCELL authentication service could not be reached.');
   if(member.reason==='signed-out'){
    showInboxStartupProblem('This browser is not signed in to BLACKCELL. Open Employee Access to sign in; your saved messages have not been deleted.',{link:'employee.html'});return;
   }
   showInboxStartupProblem('This account is not authorized for BLACKCELL iMessage. Return to your access portal.',{link:'employee.html'});return;
  }
  self=member.user.id;
  const m=member.member;
  if(m.role==='owner'){
   $('returnLink').href='dashboard.html';$('returnLink').textContent='ADMINISTRATION';
   const {data,error}=await withInboxDeadline(client.rpc('corp_code_status'));
   if(error)throw error;
   if(data?.ok!==true||data?.verified!==true){
    showInboxStartupProblem('Level 7 security verification is required. Return to Administration and verify your session.',{link:'dashboard.html'});return;
   }
  }else if(m.role==='employee'){
   if(m.can_chat!==true){
    showInboxStartupProblem('Chat is not enabled for this employee account.',{link:'employee.html'});return;
   }
   const {data:employeeStatus,error:employeeError}=await withInboxDeadline(client.rpc('corp_employee_code_status'));
   if(employeeError)throw employeeError;
   if(employeeStatus?.ok!==true||employeeStatus?.verified!==true){
    showInboxStartupProblem('BLACKCELL employee authorization needs verification. Return to Employee Access; your messages are still stored.',{link:'employee.html'});return;
   }
   employeeSession=true;lastActivity=Date.now();lastTouch=Date.now();
  }else{
   showInboxStartupProblem('This account cannot access BLACKCELL iMessage.',{link:'employee.html'});return;
  }
  const {data,error}=await withInboxDeadline(client.rpc('corp_chat_peers'));
  if(error)throw error;
  if(data?.ok!==true||!Array.isArray(data.peers)){
   showInboxStartupProblem('The secure contact service did not authorize this session. Return to BLACKCELL Access to verify it.',{link:m.role==='owner'?'dashboard.html':'employee.html'});return;
  }
  contacts=data.peers;ready=true;inboxPins=readInboxPins();
  clearTimeout(bootRetryTimer);bootRetryTimer=null;
  $('chatStartupRecovery').hidden=true;
  status('');
  if(osChat){sidebarClosed=readSidebarPreference();applySidebarPreference()}
  // Display the authenticated contact list FIRST. An Android 11 WebSocket or
  // Realtime startup failure must never erase / delay stored conversations.
  renderPeers();
  void refreshInboxSummaries();
  try{
   client.channel('blackcell-chat-'+self)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'corp_chat_messages'},payload=>{
     const m=payload.new;
     if(m&&(m.sender_id===self||m.recipient_id===self)){
      void loadMessages();
      if(!popout&&!mediaPanelMode)void refreshInboxSummaries();
     }
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'corp_chat_messages'},payload=>{
     const m=payload.new;
     if(m&&(m.sender_id===self||m.recipient_id===self)){
      void loadMessages();
      if(!popout&&!mediaPanelMode)void refreshInboxSummaries();
     }
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'corp_chat_typing'},payload=>{
     live.onTypingChange(payload);
    })
    .subscribe();
  }catch(_){
   // Realtime is optional for initial contact and history retrieval.
   status('Contacts loaded. Live updates are temporarily unavailable; conversations remain accessible.');
  }
  if(embedParams.get('popout')==='1'&&(!popout||!contacts.some(x=>x.user_id===popoutId))){
   ready=false;status('This conversation is no longer authorized.');
   $('messages').replaceChildren(text('p','empty','Conversation unavailable.'));return;
  }
  if(contacts.length){
   const requested=embedParams.get('peer');
   // A normal launch always opens the inbox with no selected recipient.
   // Only explicit, authorized conversation links may open a thread.
   if(requested&&contacts.some(x=>x.user_id===requested))choose(requested);
   else if(mediaPanelMode&&!requested)choose(contacts[0].user_id);
   if(mediaPanelMode==='share'&&canShowFullMedia())sharedMedia.openShare();
   else if(mediaPanelMode==='library'&&canShowFullMedia()){
    const batch=embedParams.get('batch');
    if(batch&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batch))
     void sharedMedia.openBatch(batch);
    else void sharedMedia.openLibrary();
   }
  }else $('messages').replaceChildren(text('p','empty',m.role==='owner'?'No employees yet. Invite your first employee from User Management → Accounts.':'Your administrator is not available for chat.'));
 }catch(error){
  if(!ready){
   // The sidebar must never remain stuck on "Checking contacts…" after
   // a mobile network, auth server, or browser startup error.
   const message='Unable to load BLACKCELL contacts on this device. Check the connection and tap Retry Contacts. Your messages have not been deleted.';
   console.warn('[BLACKCELL iMessage] contact startup',String(error?.message||error).slice(0,150));
   showInboxStartupProblem(message,{retry:true});
  }
 }finally{bootRunning=false}
}
window.BLACKCELL_CHAT_RETRY=()=>{
 if(ready)return;
 clearTimeout(bootRetryTimer);bootRetryTimer=null;
 if(bootRunning){location.reload();return}
 bootAttempt=0;
 void boot();
};
window.addEventListener('online',()=>{if(!ready&&!bootRunning&&bootAttempt>0)void boot()});
window.addEventListener('pageshow',event=>{
 if(event.persisted&&!ready&&!bootRunning)void boot();
});
function formatChatDay(date){
 const today=new Date(),yesterday=new Date();
 yesterday.setDate(today.getDate()-1);
 if(date.toDateString()===today.toDateString())return 'TODAY';
 if(date.toDateString()===yesterday.toDateString())return 'YESTERDAY';
 return date.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
}
function isBubbleNeighbor(first,second){
 if(!first||!second)return false;
 if(first.sender_id!==second.sender_id||first.media_batch_id||second.media_batch_id||first.deleted_at||second.deleted_at)return false;
 const a=new Date(first.created_at),b=new Date(second.created_at);
 return a.toDateString()===b.toDateString()&&(b.getTime()-a.getTime())<=5*60*1000;
}
async function refreshInboxSummaries(){
 if(!ready||!self||popout||mediaPanelMode||inboxRefreshing)return;
 inboxRefreshing=true;
 try{
  const {data,error}=await client.from('corp_chat_messages')
   .select('sender_id,recipient_id,body,media_batch_id,created_at')
   .or('sender_id.eq.'+self+',recipient_id.eq.'+self)
   .order('created_at',{ascending:false}).limit(180);
  if(!error){
   const summaries=new Map();
   for(const message of data||[]){
    const other=message.sender_id===self?message.recipient_id:message.sender_id;
    if(other===self||summaries.has(other))continue;
    summaries.set(other,{preview:message.media_batch_id?'Photo or video attachment':String(message.body||'').slice(0,120),when:message.created_at});
   }
   inboxSummaries=summaries;
  }
  // Unread is independently queried, not inferred from the truncated preview history.
  const unread=new Set(),counts=new Map();let offset=0;
  while(ready){
   const result=await client.from('corp_chat_messages').select('id,sender_id') .eq('recipient_id',self).is('read_at',null).is('deleted_at',null).order('id',{ascending:true}).range(offset,offset+499);
   if(result.error)throw result.error;
   for(const row of result.data||[]){unread.add(row.sender_id);counts.set(row.sender_id,(counts.get(row.sender_id)||0)+1)}
   if((result.data||[]).length<500)break;
   offset+=500;
  }
  if(ready){inboxUnread=unread;inboxUnreadCounts=counts;inboxUnreadAvailable=true;renderPeers()}
 }catch(_){renderPeers()}finally{inboxRefreshing=false}
}
function inboxTime(value){
 const date=new Date(value),now=new Date(),yesterday=new Date(now);yesterday.setDate(yesterday.getDate()-1);
 if(date.toDateString()===now.toDateString())return date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 if(date.toDateString()===yesterday.toDateString())return 'Yesterday';
 return date.toLocaleDateString([],{month:'short',day:'numeric'});
}
function renderPinnedConversations(){
 const box=$('inboxRecent');box.replaceChildren();
 const list=inboxPins.map(id=>contacts.find(c=>c.user_id===id)).filter(Boolean);
 box.hidden=!!mediaPanelMode||popout||!ready||inboxEditing||inboxComposing||inboxFilter!=='all'||!!$('peerSearch').value.trim()||!list.length;
 if(box.hidden)return false;
 for(const c of list){
  const cell=document.createElement('div');cell.className='inbox-pinned-cell';
  const b=document.createElement('button');b.type='button';b.className='desktop-recent-person'+(inboxUnread.has(c.user_id)?' is-unread':'');
  const name=String(c.display_name||'Employee').trim()||'Employee';
  b.setAttribute('aria-label','Open pinned conversation with '+name);b.title=name;
  const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  b.append(text('span','avatar',initials),text('span','desktop-recent-name',name.split(/\s+/)[0]));
  b.addEventListener('click',()=>choose(c.user_id));
  b.addEventListener('contextmenu',event=>openPinMenu(event,c.user_id,b));
  cell.append(b,pinButton(c));box.append(cell);
 }
 return true;
}
function renderPeers(){
 const box=$('peers');box.replaceChildren();syncInboxControls();const pinsVisible=renderPinnedConversations();
 const query=$('peerSearch').value.trim().toLowerCase();
 // Every contact is a server-authorized known sender. Unknown external senders are not admitted.
 const visible=contacts.filter(c=>(String(c.display_name||'')+' '+String(c.role||'')).toLowerCase().includes(query))
  .filter(c=>inboxComposing||inboxFilter==='all'||inboxFilter==='known'||(inboxFilter==='unread'&&inboxUnread.has(c.user_id))||(inboxFilter==='pinned'&&inboxPins.includes(c.user_id)))
  .sort((a,b)=>new Date(inboxSummaries.get(b.user_id)?.when||0)-new Date(inboxSummaries.get(a.user_id)?.when||0)||String(a.display_name||'').localeCompare(String(b.display_name||'')));
 const unpinned=pinsVisible?visible.filter(c=>!inboxPins.includes(c.user_id)):visible;
 $('contactCount').textContent=String(visible.length);
 if(!unpinned.length&&pinsVisible)return;
 if(!visible.length){box.append(text('p','empty',!ready?'Checking contacts…':query?'No matching contacts.':inboxFilter==='unknown'?'Only authorized BLACKCELL contacts can send messages.':inboxFilter==='unread'?(inboxUnreadAvailable?'No unread messages.':'Unread status unavailable. Retrying…'):inboxFilter==='pinned'?'No pinned conversations. Right-click a conversation to pin it.':'No authorized contacts.'));return}
 for(const c of unpinned){
   const button=document.createElement('button');button.type='button';const unread=inboxUnread.has(c.user_id);
   button.className='peer'+(peer?.user_id===c.user_id?' active':'')+(unread?' is-unread':'');
   if(inboxEditing){const checked=inboxSelection.has(c.user_id);button.setAttribute('aria-pressed',String(checked));button.append(text('span','apple-select-dot',checked?'✓':''))}
   const initial=String(c.display_name||'B').trim().slice(0,1).toUpperCase();
   button.append(text('span','avatar',initial));
   const wrap=document.createElement('span');wrap.className='peer-copy';
   const summary=inboxSummaries.get(c.user_id);
   wrap.append(text('strong','',c.display_name||'Employee'),text('span','peer-preview',summary?.preview||'Start a private conversation'));
   button.append(wrap);
   const trailing=document.createElement('span');trailing.className='apple-peer-trailing';
   if(summary?.when){const time=document.createElement('time');time.className='peer-meta';time.dateTime=summary.when;time.textContent=inboxTime(summary.when);trailing.append(time)}
   if(!inboxEditing){if(unread)trailing.append(text('span','bc-inbox-unread-mark',String(inboxUnreadCounts.get(c.user_id)||1)));trailing.append(text('span','apple-chevron','›'));}
   button.append(trailing);
   if(unread)button.setAttribute('aria-label',(c.display_name||'Employee')+', unread messages');
   button.onclick=()=>{if(inboxEditing){if(inboxSelection.has(c.user_id))inboxSelection.delete(c.user_id);else inboxSelection.add(c.user_id);renderPeers();return}if(inboxComposing){exitInboxMode();$('peerSearch').value=''}choose(c.user_id)};
   const row=document.createElement('div');row.className='inbox-peer-row'+(!inboxEditing&&!inboxComposing?' has-pin-action':'');
   row.append(button);
   if(!inboxEditing&&!inboxComposing){row.append(pinButton(c));button.addEventListener('contextmenu',event=>openPinMenu(event,c.user_id,button))}
   box.append(row);
 }
}
// Opening a normal desktop inbox again is safe only if no draft or
// active send/edit/upload would be interrupted. A dedicated pop-out never resets.
function returnToDesktopInbox(){
 if(!ready||popout||mediaPanelMode||physicallySmallPhone||!peer)return false;
 if(sendingMessage||messageMutationBusy||blockBusy||composerCompositionActive||$('messageInput').value.trim()||document.querySelector('[aria-busy=true],.is-uploading,[data-busy=true],dialog[open],.chat.media-open')||Array.from(document.querySelectorAll('input[type=file]')).some(input=>input.files?.length))return false;
 const previous=peer.user_id;
 live.setThreadOpen(false);live.onPeerChange(previous,null);
 peer=null;blockGeneration++;blockKnown=false;chatBlocked=false;
 closeMessageFinder();closeInfoMenu();popoutActions?.close();tubeCards.clear();pulseCards.clear();sharedMedia.onPeerChange(null);
 document.querySelector('.chat').classList.remove('bc-thread-active');
 $('peerName').textContent='Select a contact';$('peerDetail').textContent='Secure employee communication';
 $('imessagePortrait').textContent='B';$('peerProfileLink').hidden=true;
 popButton.hidden=true;popButton.disabled=true;
 const box=$('messages');delete box.dataset.newest;delete box.dataset.readSignature;box.replaceChildren(text('p','empty','Select an authorized person to begin messaging.'));
 firstLoad=true;applySidebarPreference();syncBlockControls();renderPeers();void refreshInboxSummaries();
 if(window.parent!==window)window.parent.postMessage({type:'blackcell-chat-inbox-open'},location.origin);
 return true;
}
function choose(userId){
 const selected=contacts.find(x=>x.user_id===userId);if(!selected||!ready||(popout&&userId!==popoutId))return;
 const previousPeer=peer?.user_id;
 if(previousPeer!==userId)closeMessageFinder();
 if(previousPeer!==userId){tubeCards.clear();pulseCards.clear()}
 live.onPeerChange(previousPeer,userId);
 closeMobileTools();peer=selected;blockGeneration++;blockKnown=false;chatBlocked=false;closeInfoMenu();sharedMedia.onPeerChange(userId);firstLoad=true;applySidebarPreference();
 live.setThreadOpen(!mediaPanelMode);
 if(compactChat)document.querySelector('.chat').classList.add('bc-thread-active');
 if(window.parent!==window&&!popout)window.parent.postMessage({type:'blackcell-chat-conversation',peerId:userId,name:peer.display_name||'Employee'},location.origin);$('peerName').textContent=peer.display_name||'Employee';$('peerDetail').textContent=peer.role==='owner'?'LEVEL 7 · OWNER':'LEVEL '+peer.clearance_level;
 $('imessagePortrait').textContent=String(peer.display_name||'B').trim().slice(0,1).toUpperCase();
 $('peerProfileLink').href='corporate-network.html?user='+encodeURIComponent(userId);
 $('peerProfileLink').hidden=false;
 if(popout&&popoutActions){const profile=$('popoutProfile');profile.href=$('peerProfileLink').href;$('popoutInfo').hidden=false;$('popoutCamera').hidden=false;}
 if(popButton){popButton.hidden=popout||!!mediaPanelMode;popButton.disabled=false;}
 syncBlockControls();renderPeers();void refreshCurrentBlock();void loadMessages();
}
async function loadMessages(){
 if(!ready||!peer||isLoading||document.hidden)return;
 isLoading=true;
 try{
  const pid=peer.user_id;
  const filter='and(sender_id.eq.'+self+',recipient_id.eq.'+pid+'),and(sender_id.eq.'+pid+',recipient_id.eq.'+self+')';
  const {data,error}=await client.from('corp_chat_messages').select('id,sender_id,recipient_id,body,created_at,media_batch_id,read_at,edited_at,deleted_at,corp_chat_reactions(reactor_id,reaction)').or(filter).order('created_at',{ascending:false}).limit(100);
  if(error){status('Messages could not be loaded.');return}
  // Ignore an old request when the user has switched conversations.
  if(peer?.user_id!==pid)return;
  const box=$('messages'),atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  const ordered=(data||[]).slice().reverse();
  const newest=ordered.at(-1)?.id||'empty',oldNewest=box.dataset.newest;
  const signature=ordered.map(m=>m.id+':'+(m.read_at||'')+':'+(m.edited_at||'')+':'+(m.deleted_at||'')+':'+JSON.stringify((m.corp_chat_reactions||[]).map(r=>[r.reactor_id,r.reaction]).sort())).join('|');
  if(box.dataset.readSignature===signature&&!firstLoad){
   void live.markRead(ordered);
   return;
  }
  box.dataset.newest=newest;box.dataset.readSignature=signature;popoutActions?.close();tubeCards.clear();pulseCards.clear();box.replaceChildren();
  let currentDay='';
  for(let i=0;i<ordered.length;i++){
   const m=ordered[i],previous=ordered[i-1],next=ordered[i+1];
   const own=m.sender_id===self,when=new Date(m.created_at);
   const day=when.toDateString();
   if(day!==currentDay){
    currentDay=day;
    const separator=text('div','chat-day-separator',formatChatDay(when));
    separator.setAttribute('role','separator');box.append(separator);
   }
   const pairedBefore=isBubbleNeighbor(previous,m),pairedAfter=isBubbleNeighbor(m,next);
   const group=pairedBefore?(pairedAfter?'group-middle':'group-end'):(pairedAfter?'group-start':'group-single');
   const item=document.createElement('div');
   item.className='message '+group+(own?' mine':'')+(m.media_batch_id?' message-media':'');
   if(!firstLoad&&oldNewest!==newest&&m.id===newest)item.classList.add('message-fresh');
   const tubeRef=!m.deleted_at&&!m.media_batch_id&&parseTubeReference(m.body),pulseRef=!m.deleted_at&&!m.media_batch_id&&!tubeRef&&parsePulseShare(m.body);
   const bubble=m.deleted_at?text('div','bubble bc-message-deleted',own?'You deleted a message':'Message deleted'):m.media_batch_id?sharedMedia.renderMediaBubble(m,own):tubeRef?tubeCards.render(tubeRef):pulseRef?pulseCards.render(pulseRef):text('div','bubble',m.body);
   if(!m.deleted_at&&!m.media_batch_id&&!tubeRef&&!pulseRef){
    popoutActions?.attach(bubble,m,own);
    bubble.tabIndex=0;
    bubble.title='Sent '+when.toLocaleString()+' · Tap to show the time';
    const reveal=()=>{
     const opening=!item.classList.contains('show-time');
     // Only one message may expose its toolbar; ordinary chat remains compact.
     for(const other of box.querySelectorAll('.bc-glass-message.show-time'))if(other!==item){other.classList.remove('show-time');other.querySelector('.bubble')?.setAttribute('aria-expanded','false')}
     item.classList.toggle('show-time',opening);
     if(item.classList.contains('bc-glass-message'))bubble.setAttribute('aria-expanded',String(opening));
    };
    bubble.addEventListener('click',reveal);
    bubble.addEventListener('keydown',e=>{if(e.target===bubble&&(e.key==='Enter'||e.key===' ')){e.preventDefault();reveal()}});
   }
   item.append(bubble);
   const plainText=!m.deleted_at&&!m.media_batch_id&&!tubeRef&&!pulseRef&&!mediaPanelMode;
   if(plainText){
    item.classList.add('bc-glass-message');
    const reactions=(m.corp_chat_reactions||[]).filter(r=>['❤️','👍','👎','😂','‼️','❓'].includes(r.reaction));
    if(reactions.length){
     const badges=text('div','bc-attached-reactions','');badges.setAttribute('role','group');badges.setAttribute('aria-label','Message reactions');
     for(const r of reactions.sort((a,b)=>Number(b.reactor_id===self)-Number(a.reactor_id===self))){
      const badge=text('button','bc-attached-reaction',r.reaction);badge.type='button';
      badge.setAttribute('aria-label',(r.reactor_id===self?'Your':'Contact')+' reaction '+r.reaction+' · Open message actions');
      badge.addEventListener('click',e=>{e.stopPropagation();popoutActions?.open(bubble,m,own)});
      badges.append(badge);
     }
     item.classList.add('bc-has-attached-reactions');
     if(!bubble.querySelector('.bc-pop-original')){const body=text('span','bc-message-body',bubble.textContent);bubble.replaceChildren(body)}
     bubble.dataset.reactionCount=String(reactions.length);
     bubble.append(badges);
    }
    bubble.setAttribute('aria-expanded','false');
    bubble.title='Sent '+when.toLocaleString()+' · Select for message actions';
    const controls=document.createElement('div');controls.className='bc-glass-message-actions';controls.setAttribute('role','group');controls.setAttribute('aria-label','Message actions');
    if(popoutActions){
     const react=text('button','bc-message-react','♡');react.type='button';react.title='Choose a reaction';react.setAttribute('aria-label',react.title);
     react.addEventListener('click',e=>{e.stopPropagation();popoutActions.open(bubble,m,own)});controls.append(react);
    }
    controls.append(makeStarControl(m.id));
    if(popoutActions){
     const action=text('button','bc-message-options','⋯');action.type='button';action.title='More message actions';action.setAttribute('aria-label',action.title);
     action.addEventListener('click',e=>{e.stopPropagation();popoutActions.open(bubble,m,own)});controls.append(action);
    }
    item.append(controls);
   }else if(own&&!m.deleted_at&&!m.media_batch_id&&popoutActions){
    const action=text('button','bc-message-options','⋯');action.type='button';action.title='Edit or delete this message';action.setAttribute('aria-label','Edit or delete this message');action.addEventListener('click',e=>{e.stopPropagation();popoutActions.open(bubble,m,true)});item.append(action);
   }
   if(m.edited_at&&!m.deleted_at){const edited=text('span','bc-message-edited','Edited');edited.title='Edited '+new Date(m.edited_at).toLocaleString();item.append(edited)}
   const t=document.createElement('time');
   t.dateTime=m.created_at;t.textContent=when.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
   t.title=when.toLocaleString();
   if(pairedAfter&&!m.media_batch_id)t.classList.add('group-time');
   const meta=plainText?text('div','bc-glass-message-meta',''):item;
   meta.append(t);
   if(own&&!pairedAfter&&!m.deleted_at){
    const receipt=text('span','message-receipt'+(m.read_at?' read':''),'');
    const tick=text('span','receipt-ticks',m.read_at?(plainText?'✓':'✓✓'):'✓');
    tick.setAttribute('aria-hidden','true');
    const label=text('span','',m.read_at
      ?'Read '+new Date(m.read_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})
      :'Sent');
    receipt.setAttribute('aria-label',m.read_at?'Read by recipient':'Message sent');
    receipt.append(tick,label);
    meta.append(receipt);
   }
   if(plainText)item.append(meta);
   box.append(item);
  }
  if(!ordered.length){if(osChat){const empty=document.createElement('div');empty.className='os-chat-empty';const symbol=text('span','os-chat-empty-icon','');symbol.setAttribute('aria-hidden','true');empty.append(symbol,text('h2','', 'Start a conversation'),text('p','','Send your first iMessage to '+(peer.display_name||'this contact')+'.'));box.append(empty)}else box.append(text('p','empty','Private conversation started. Send the first message.'));}
  sharedMedia.syncInlineUpload();
  if(atBottom||firstLoad)box.scrollTop=box.scrollHeight;
  firstLoad=false;status('');
  void live.markRead(ordered);
 }catch(_){status('Chat connection interrupted. Retrying…')}
 finally{isLoading=false}
}
$('sendForm').addEventListener('submit',async e=>{
 e.preventDefault();const body=$('messageInput').value.trim();if(!ready||!peer||!body||chatBlocked||!blockKnown||blockBusy||sendingMessage)return;
 live.stopTyping(peer.user_id);
 const btn=$('sendButton');sendingMessage=true;btn.disabled=true;status('');
 try{
  const ref=parseTubeReference(body),target=peer.user_id;
  if(ref&&!(await tubeCards.canShare(ref))){status('That private video cannot be shared.');return}
  if(!ready||peer?.user_id!==target)return;
  const {error}=await client.from('corp_chat_messages').insert({sender_id:self,recipient_id:target,body});
  if(error){status('Message not sent. The contact may be blocked or unavailable.');void refreshCurrentBlock();return}
  $('messageInput').value='';androidChatCaretGuard.reset();resizeComposer();await loadMessages();
 }catch(_){status('Message not sent. Check your connection.')}
 finally{sendingMessage=false;syncBlockControls();if(!$('messageInput').disabled)$('messageInput').focus()}
});
// Only actual user input extends security sessions. Polling does not.
for(const evt of ['pointerdown','keydown','wheel','touchstart']){
 document.addEventListener(evt,chatActivity,{passive:true});
}
setInterval(()=>{if(ready&&live.visible())void loadMessages()},5000);
setInterval(()=>{if(ready&&!mediaPanelMode&&!popout&&!document.hidden&&(inboxFilter==='unread'||!compactChat||!document.querySelector('.chat').classList.contains('bc-thread-active')))void refreshInboxSummaries()},8000);
setInterval(()=>{
 if(employeeSession&&!sessionEnded&&Date.now()-lastActivity>=IDLE_LIMIT_MS)
  void endChatAccess('Chat locked after 60 minutes of inactivity. Return to BLACKCELL OS to verify access.');
},15000);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden||sessionEnded)return;
 if(employeeSession){
  if(Date.now()-lastActivity>=IDLE_LIMIT_MS){
   void endChatAccess('Chat locked after 60 minutes of inactivity. Return to BLACKCELL OS to verify access.');return
  }
  void reverifyChatOnReturn();
 }else if(ready)void loadMessages();
});
window.addEventListener('online',()=>{if(chatVerificationPaused)void reverifyChatOnReturn()});
setInterval(()=>{if(chatVerificationPaused&&!document.hidden)void reverifyChatOnReturn()},12000);

window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent)return;
 if(event.data?.type==='blackcell-chat-visibility'){
  live.setVisible(event.data.visible===true);if(event.data.visible!==true){tubeCards.stopActive();pulseCards.stopActive()}
  if(event.data.visible===true&&ready&&peer)void loadMessages();
 }else if(event.data?.type==='blackcell-chat-shared-activity'&&employeeSession&&!sessionEnded){
  lastActivity=Date.now();
 }else if(event.data?.type==='blackcell-chat-open-inbox'){returnToDesktopInbox();
 }else if(event.data?.type==='blackcell-select-peer'&&ready&&!popout){
  const id=event.data.peerId;
  if(typeof id==='string'&&contacts.some(x=>x.user_id===id))choose(id);
 }
});
let chatScopeChecking=false;
async function verifyChatScope(){
 if(!employeeSession||sessionEnded||!ready||document.hidden||chatScopeChecking)return;
 chatScopeChecking=true;
 try{
  const {data,error}=await client.from('corp_access_members')
   .select('access_scope').eq('user_id',self).single();
  if(!error&&data?.access_scope==='ledger_only'){
   ready=false;
   location.replace('private-photo-ledger.html');
  }
 }catch(_){}
 finally{chatScopeChecking=false}
}
setInterval(()=>void verifyChatScope(),20000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)void verifyChatScope()
});
void boot();