import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(p,'utf8');
const html=read('private-photo-ledger.html');
const ledger=read('private-photo-ledger.js');
const responsive=read('private-photo-ledger-responsive.js');
const receiver=read('private-photo-ledger-receiver.js');
const css=read('private-photo-ledger-receiver.css');
const sender=read('private-photo-ledger-simple-sender.js');
const sql=read('supabase/sql/blackcell_redline_start_fresh_archive.sql');

test('REDLINE branding remains constant regardless of window width',()=>{
 assert.match(responsive,/const labels=\{os:'BLACKCELL REDLINE',tablet:'BLACKCELL REDLINE',mobile:'BLACKCELL REDLINE'\}/);
 assert.match(responsive,/const captions=\{os:'PRIVATE EXCHANGE',tablet:'PRIVATE EXCHANGE',mobile:'PRIVATE EXCHANGE'\}/);
 assert.match(responsive,/topLabel\.textContent='REDLINE'/);
 assert.doesNotMatch(responsive,/topLabel\.textContent=mode==='os'/);
 assert.match(html,/BLACKCELL REDLINE \| Private Exchange/);
});
test('Receiver has a redesigned and owner-gated command dashboard',()=>{
 assert.match(receiver,/const visible=!app\.hidden&&!owner\.hidden/);
 assert.match(receiver,/document\.body\.classList\.toggle\('bc-redline-receiver',visible\)/);
 assert.match(receiver,/rr-stat-.*key/);
 assert.match(css,/rr-stat-pending/);
 assert.match(receiver,/AWAITING YOUR REVIEW/);
 assert.match(receiver,/OUTSTANDING AMOUNTS/);
 assert.match(receiver,/RECORDED PAID/);
 assert.match(receiver,/Chat with your sender/);
 assert.match(receiver,/Rooms & Access/);
 assert.match(receiver,/document\.getElementById\(source\)/);
 assert.match(css,/body\.bc-redline-receiver\{/);
 assert.match(css,/background:#000!important/);
 assert.match(css,/rr-stats/);
 assert.match(css,/rr-nav-button/);
 assert.match(css,/object-fit:contain!important/);
 assert.match(css,/body\.bc-redline-receiver\.bc-ledger-tablet/);
 assert.match(css,/@media\(max-width:490px\)/);
});
test('Master Reset archives rather than deletes original photos, chat or financial amounts',()=>{
 assert.match(sql,/current_session_started_at timestamptz/);
 assert.match(sql,/corp_owner_redline_start_fresh/);
 assert.match(sql,/public\.corp_owner_validated\(\)/);
 assert.match(sql,/p_confirmation <> 'RESET REDLINE'/);
 assert.match(sql,/p_confirmation <> 'START FRESH'/);
 assert.match(sql,/where owner_id=v_owner/);
 assert.match(sql,/revoke all.*from anon/i);
 assert.match(sql,/archived_only',true/);
 assert.ok(!/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/i.test(sql));
 assert.match(ledger,/if\(r\.error\)\{\s*\/\/ The cleanup policy allows deleting an uploaded file only if no ledger entry references it\.\s*await db\.storage\.from\(BUCKET\)\.remove\(\[path\]\)/);
 assert.ok(!/db\.from\(ENTRIES\)\.delete/i.test(ledger));
});
test('Only the verified REDLINE owner can trigger resets with two confirmations',()=>{
 assert.match(ledger,/if\(!state\.isOwner\|\|!state\.room\|\|state\.busy\)return/);
 assert.match(ledger,/window\.prompt\(/);
 assert.match(ledger,/window\.confirm\(/);
 assert.match(ledger,/await verify\(\)/);
 assert.match(ledger,/db\.rpc\('corp_owner_redline_start_fresh'/);
 assert.match(ledger,/p_room_id:all\?null:state\.room\.id/);
 assert.match(ledger,/data\.rooms_reset!==1/);
 assert.match(html,/id="redlineResetActions" hidden/);
 assert.match(html,/id="redlineMasterReset"/);
 assert.match(html,/id="redlineStartFreshRoom"/);
 assert.match(html,/id="redlineResetStatus" role="status"/);
});
test('Current and Archive use server timestamps rather than cached or invented fake data',()=>{
 assert.match(ledger,/current_session_started_at/);
 assert.match(ledger,/state\.showArchive/);
 assert.match(ledger,/query\.lt\('created_at',selectedRoom\.current_session_started_at\)/);
 assert.match(ledger,/query\.gte\('created_at',selectedRoom\.current_session_started_at\)/);
 assert.match(ledger,/query\.lt\('created_at',cutoff\)/);
 assert.match(ledger,/query\.gte\('created_at',cutoff\)/);
 assert.match(ledger,/archiveMode:state\.showArchive/);
 assert.match(ledger,/resetAt:state\.room\.current_session_started_at/);
 assert.match(ledger,/state\.entryFingerprint=''/);
 assert.match(ledger,/state\.images\.clear\(\)/);
 assert.match(ledger,/No archived photos/);
 assert.match(html,/id="redlineArchiveToggle"[^>]*hidden/);
});
test('Sender gets archived earnings and chat without permission to upload while browsing history',()=>{
 assert.match(sender,/VIEW PREVIOUS RECORDS/);
 assert.match(sender,/bridge\(\)\?\.toggleArchive\?\.\(\)/);
 assert.match(sender,/archiveButton\.hidden=!snap\.resetAt/);
 assert.match(sender,/sessionKey=snap\.roomId/);
 assert.match(sender,/Return to the current session before sending a message/);
 assert.match(sender,/send\.disabled=Boolean\(snap\.archiveMode\)/);
 assert.match(ledger,/if\(state\.showArchive\)\{show\('uploadFeedback'/);
 assert.match(ledger,/state\.showArchive\)throw Error\('Return to the current session/);
});
test('REDLINE receiver resources are versioned and original form and security remain intact',()=>{
 assert.match(html,/private-photo-ledger-receiver\.css\?v=20261121-photo-large-timed1/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261121-photo-sidebar-release3/);
 assert.match(html,/private-photo-ledger\.js\?v=20261121-photo-bid-timer-sidebar3/);
 assert.match(html,/private-photo-ledger-responsive\.js\?v=20261121-stable-brand1/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261121-inline-owner-chat1/);
 assert.match(ledger,/corporateAuthorize\(db,\{allowLedgerOnly:true\}\)/);
 assert.match(ledger,/const BUCKET='corp-private-photo-ledger'/);
 assert.match(ledger,/db\.storage\.from\(BUCKET\)\.upload/);
 assert.match(ledger,/function renderReviewQueue\(/);
 assert.match(ledger,/async function assignAmount\(/);
 assert.match(ledger,/async function settle\(/);
 assert.match(ledger,/async function uploadPhoto\(/);
});

test('Receiver can view and reply in the selected private room without opening a second popup',()=>{
 assert.match(receiver,/chatPanel\.id='redlineReceiverChat'/);
 assert.match(receiver,/chatPanel\.hidden=!hasRoom/);
 assert.match(receiver,/blackcell:redline:receiver-ready/);
 assert.match(sender,/function syncOwnerChat\(snap\)/);
 assert.match(sender,/if\(messageCard\.parentNode!==mount\)mount\.append\(messageCard\)/);
 assert.match(sender,/photoAction\.hidden=true/);
 assert.match(sender,/Message your sender/);
 assert.match(css,/rr-chat-mount/);
});

test('Desktop receiver is compact with photo review beside private chat',()=>{
 assert.match(receiver,/intro\.append\(title,roomSummary\)/);
 assert.match(receiver,/workspace\.append\(chatPanel,photos\)/);
 assert.match(receiver,/photos\.append\(timeline\)/);
 assert.match(receiver,/owner\.append\(access\)/);
 assert.match(css,/REDLINE desktop compact receiver/);
 assert.match(css,/min-height:51px!important/);
 assert.match(css,/min-height:32px!important/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.3fr\) minmax\(320px,1fr\)/);
});

test('REDLINE OS receiver keeps the narrow chat left and the real incoming photo queue right',()=>{
 assert.match(receiver,/workspace\.id='redlineReceiverLiveWorkspace'/);
 assert.match(receiver,/workspace\.append\(chatPanel,photos\)/);
 assert.match(receiver,/photos\.append\(timeline\)/);
 assert.match(receiver,/roomBody\.append\(timeline\)/);
 assert.match(receiver,/window\.innerWidth>=420/);
 assert.match(css,/grid-template-columns:minmax\(300px,370px\) minmax\(0,1fr\)/);
 assert.match(css,/rr-incoming-photos #ownerReviewQueue/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261121-photo-sidebar-release3/);
});

test('Owner can inspect large photo and set price while viewing it',()=>{
 assert.match(ledger,/function preparePhotoReviewLightbox\(entry\)/);
 assert.match(ledger,/ACCEPT FOR AMOUNT/);
 assert.match(ledger,/ACCEPT \$0\.00/);
 assert.match(ledger,/REJECT PHOTO/);
 assert.match(ledger,/await assignAmount\(entry,input,accept\)/);
 assert.match(ledger,/const review=state\.isOwner&&entry\.decision_status==='pending'/);
 assert.match(html,/id="redlineLightboxReview"/);
 assert.match(css,/max-height:none!important;min-height:0!important/);
 assert.match(css,/height:clamp\(560px,76dvh,850px\)!important/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.45fr\) minmax\(260px,1fr\)!important/);
});

test('Owner photo pricing commits immediately without a browser confirm dialog',()=>{
 const approve=ledger.slice(ledger.indexOf('async function assignAmount('),ledger.indexOf('async function acceptZero('));
 assert.ok(approve.includes("parseDollars(input.value)"));
 assert.ok(approve.includes("await verify()"));
 assert.ok(approve.includes(".eq('decision_status','pending')"));
 assert.ok(approve.includes("loadEntries({force:true})"));
 assert.doesNotMatch(approve,/window\.confirm\(/);
 // Distinct high-impact actions still retain their own confirmation controls.
 assert.match(ledger.slice(ledger.indexOf('async function rejectPhoto('),ledger.indexOf('async function settle(')),/window\.confirm/);
});

test('Receiver toolbar is compact, room controls expand on demand and live actions persist',()=>{
 assert.match(receiver,/const roomSummary=make\('span','rr-room-summary'/);
 assert.match(receiver,/const tools=button\('Room Tools'/);
 assert.match(receiver,/rr-room-tools-open/);
 assert.match(receiver,/tools\.setAttribute\('aria-expanded'/);
 assert.match(receiver,/pageHeading\?\.querySelector\('\.workspace-actions'\)/);
 assert.match(receiver,/header\.append\(workspaceActions\)/);
 assert.match(receiver,/pageHeading\.append\(workspaceActions\)/);
 assert.match(receiver,/roomSummary\.textContent=hasRoom/);
 assert.match(receiver,/workspace\.append\(chatPanel,photos\)/);
 assert.match(receiver,/photos\.append\(timeline\)/);
 assert.match(css,/REDLINE compact desktop toolbar/);
 assert.match(css,/body\.bc-redline-receiver #activeRoom>\.room-toolbar/);
 assert.match(css,/body\.bc-redline-receiver\.rr-room-tools-open #redlineSessionTools:not\(\[hidden\]\)/);
 assert.match(css,/min-height:34px!important/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.7fr\) minmax\(465px,1fr\)!important/);
 assert.match(html,/private-photo-ledger-receiver\.css\?v=20261121-photo-large-timed1/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261121-photo-sidebar-release3/);
});


test('REDLINE uses iMessage-style slide-in Photo Review, not resize buttons or a percentage slider',()=>{
 assert.match(receiver,/const review=button\('Open Photos',\(\)=>openMedia\(\)/);
 assert.match(receiver,/const showMedia=button\('▣ Photos',\(\)=>openMedia\(\)/);
 assert.match(receiver,/const photoClose=button\('✕',\(\)=>closeMedia\(\)/);
 assert.match(receiver,/function openMedia\(history=false\)/);
 assert.match(receiver,/function closeMedia\(\)\{mediaOpen=false;showPane\(\)\}/);
 assert.match(receiver,/workspace\.insertBefore\(divider,photos\)/);
 assert.match(receiver,/photos\.append\(timeline\)/);
 assert.match(receiver,/const combined=window\.innerWidth>=420&&\(!handheld\|\|window\.innerWidth>=720\)/);
 assert.match(receiver,/workspace\.classList\.toggle\('rr-media-open',mediaOpen\)/);
 assert.doesNotMatch(receiver,/splitRange|splitControls|splitReadout|smallerChat|largerChat/);
 assert.match(css,/REDLINE Shared Photos — match the in-window BLACKCELL iMessage/);
 assert.match(css,/animation:redlineMediaSlideIn \.25s ease-out both/);
 assert.match(css,/\.rr-photo-close/);
 assert.match(css,/\.rr-chat-open-media/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) 11px minmax\(0,var\(--rr-media-width\)\)!important/);
 assert.match(css,/@media\(min-width:420px\) and \(max-width:699px\)/);
 assert.match(css,/rr-media-open>\.rr-incoming-photos/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261121-photo-sidebar-release3/);
 assert.match(html,/private-photo-ledger-receiver\.css\?v=20261121-photo-large-timed1/);
});

test('Photo Review retains full photo pricing and phone navigation',()=>{
 assert.match(receiver,/window\.localStorage\.setItem\(MEDIA_KEY/);
 assert.match(receiver,/divider\.addEventListener\('pointerdown'/);
 assert.match(receiver,/divider\.addEventListener\('pointermove'/);
 assert.match(receiver,/divider\.addEventListener\('dblclick'/);
 assert.match(receiver,/divider\.addEventListener\('keydown'/);
 assert.match(receiver,/app\.querySelector\('\.bc-ledger-phone-tab\[data-ledger-navigate="/);
 assert.match(receiver,/goTo\(history\?'#photoEntries':'#ownerReviewQueue'\)/);
 assert.match(ledger,/function preparePhotoReviewLightbox\(entry\)/);
 assert.match(ledger,/await assignAmount\(entry,input,accept\)/);
 assert.match(ledger,/await rejectPhoto\(entry,reject\)/);
 assert.match(css,/object-fit:contain!important/);
});


test('One iMessage-style workspace has two independent resizers and a fixed-height shell',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(receiver,/const reviewStage=make\('div','rr-review-stage'\)/);
 assert.match(receiver,/const pricedStage=make\('section','rr-priced-stage'\)/);
 assert.match(receiver,/photos\.append\(reviewStage,heightDivider,pricedStage\)/);
 assert.match(receiver,/heightDivider\.setAttribute\('aria-orientation','horizontal'\)/);
 assert.match(receiver,/divider\.setAttribute\('aria-orientation','vertical'\)/);
 assert.match(receiver,/heightDivider\.addEventListener\('pointerdown'/);
 assert.match(receiver,/heightDivider\.addEventListener\('pointermove'/);
 assert.match(receiver,/heightDivider\.addEventListener\('dblclick'/);
 assert.match(receiver,/heightDivider\.addEventListener\('keydown'/);
 assert.match(receiver,/divider\.addEventListener\('pointermove'/);
 assert.match(receiver,/window\.localStorage\.setItem\(HEIGHT_KEY/);
 assert.match(receiver,/window\.localStorage\.setItem\(MEDIA_KEY/);
 assert.match(layout,/#redlineReceiverLiveWorkspace\{/);
 assert.match(layout,/height:clamp\(420px,calc\(100dvh - 178px\),1080px\)!important/);
 assert.match(layout,/max-height:calc\(100dvh - 105px\)!important/);
 assert.match(layout,/#redlineReceiverHeightEdge/);
 assert.match(layout,/cursor:row-resize!important/);
 assert.match(layout,/cursor:col-resize/);
 assert.match(html,/private-photo-ledger-imessage-workspace\.css\?v=20261121-photo-bid-timer-sidebar3/);
});
test('Incoming photo decisions and priced photo records stay separate and scroll internally',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(receiver,/reviewStage\.append\(originalReview\)/);
 assert.match(receiver,/pricedStage\.append\(element\)/);
 assert.match(receiver,/timeline\.append\(element\)/);
 assert.match(receiver,/timeline\.classList\.add\('rr-source-timeline'\)/);
 assert.match(layout,/#redlineReceiverReviewStage/);
 assert.match(layout,/overflow-y:auto!important/);
 assert.match(layout,/#redlineReceiverPricedStage #photoEntries/);
 assert.match(layout,/height:0!important;min-height:0!important;max-height:none!important/);
 assert.match(layout,/#redlineReceiverPricedStage #photoEntries>\.photo-entry/);
 assert.match(layout,/grid-template-columns:72px minmax\(0,1fr\)!important/);
 assert.match(ledger,/state\.filter=state\.isOwner\?'priced':'all'/);
 assert.match(ledger,/state\.filter==='priced'&&e\.decision_status==='accepted'/);
 assert.match(html,/data-photo-filter="priced"/);
 assert.match(ledger,/async function assignAmount\(/);
 assert.match(ledger,/async function rejectPhoto\(/);
 assert.match(ledger,/async function settle\(/);
});

test('Incoming photo viewer expands without crop and keeps priced records accessible',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(receiver,/const expandPhoto=button\('⤢ EXPAND PHOTO'/);
 assert.match(receiver,/photos\.classList\.toggle\('rr-photo-expanded'\)/);
 assert.match(layout,/height:clamp\(390px,67dvh,920px\)!important/);
 assert.match(layout,/object-fit:contain!important/);
 assert.match(layout,/#redlineReceiverIncomingPhotos\.rr-photo-expanded/);
 assert.match(layout,/height:clamp\(480px,75dvh,1040px\)!important/);
 assert.match(html,/private-photo-ledger-timers\.js\?v=20261121-photo-bid-timer-sidebar3/);
 assert.match(html,/private-photo-ledger-timers\.css\?v=20261121-photo-large-timed1/);
});
test('Per-minute timer selection and secure RPC bridge do not alter original photo decision amounts',()=>{
 const timer=read('private-photo-ledger-timers.js');
 const migration=read('supabase/migrations/20261121162000_blackcell_redline_photo_timed_earnings.sql');
 assert.match(ledger,/card\.dataset\.redlinePhotoId=e\.id/);
 assert.match(ledger,/blackcell:redline:photo-selected/);
 assert.match(ledger,/corp_redline_photo_timer_start/);
 assert.match(ledger,/corp_redline_photo_timer_status/);
 assert.match(ledger,/corp_redline_photo_timer_stop/);
 assert.match(ledger,/corp_redline_photo_timer_heartbeat/);
 assert.match(ledger,/corp_redline_photo_timer_mark_paid/);
 assert.match(timer,/Timer credits are tracked separately/);
 assert.match(timer,/Completed minutes only/);
 assert.match(timer,/bridge\(\)\.timerStart\(selectedId,cents\)/);
 assert.match(timer,/bridge\(\)\.timerHeartbeat\(active\.id\)/);
 assert.match(timer,/bridge\(\)\.timerStop\(id\)/);
 assert.match(timer,/bridge\(\)\.timerMarkPaid\(id\)/);
 assert.match(migration,/redline_timer_one_running_per_room/);
 assert.match(migration,/45 seconds/);
 assert.match(migration,/75 seconds/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/revoke all on public\.corp_private_photo_timers from public,anon,authenticated/);
 assert.match(migration,/v_user<>v_owner/);
 assert.match(migration,/grant execute on function public\.corp_redline_photo_timer_status/);
});

test('Incoming photo is visible above the short pricing footer, not buried under the timer',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 const timer=read('private-photo-ledger-timers.js');
 assert.match(layout,/#redlineReceiverReviewStage #reviewQueueCurrent>\.photo-entry>\.photo-image-btn/);
 assert.match(layout,/#redlineReceiverReviewStage #reviewQueueCurrent>\.photo-entry>\.photo-entry-content/);
 assert.match(layout,/max-height:152px!important/);
 assert.match(layout,/#redlinePhotoTimerPanel:not\(\[open\]\)>:not\(summary\)/);
 assert.match(timer,/const ownerPanel=make\('details','rr-timer-panel'\)/);
 assert.match(timer,/const title=make\('summary','rr-timer-heading'\)/);
 assert.match(timer,/ownerPanel\.append\(title,controls,note\)/);
 assert.doesNotMatch(timer,/ownerPanel\.append\(title,controls,note,preview\)/);
 assert.match(timer,/photoHost&&preview.parentNode!==photoHost/);
 assert.match(ledger,/img\.loading=state\.isOwner&&status==='pending'\?'eager':'lazy'/);
});
test('Photo is wider on load, with an explicit full-screen option and intact pricing',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(receiver,/const DEFAULT_MEDIA=\.78/);
 assert.match(receiver,/const MEDIA_KEY='blackcell:redline:receiver:photo-first-width-v3'/);
 assert.match(receiver,/const DEFAULT_HEIGHT=\.80/);
 assert.match(receiver,/const fullPhoto=button\('⛶ VIEW FULL PHOTO'/);
 assert.match(layout,/var\(--rr-media-width,67%\)/);
 assert.match(ledger,/function preparePhotoReviewLightbox\(entry\)/);
 assert.match(ledger,/await assignAmount\(entry,input,accept\)/);
});

test('Full-screen button can open both a pending photo and a priced-photo preview',()=>{
 assert.match(receiver,/const fullPhoto=button\('⛶ VIEW FULL PHOTO'/);
 assert.match(receiver,/#redlineReceiverReviewStage \.rr-timer-selected-preview \.rr-timer-full/);
 assert.match(receiver,/#reviewQueueCurrent \.photo-image-btn/);
});

test('Step 1: only the uncropped photograph remains in the standalone display',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 const timer=read('private-photo-ledger-timers.js');
 assert.match(layout,/REDLINE STEP 1 — standalone photo-only viewer/);
 assert.match(layout,/#redlineReceiverLiveWorkspace\.rr-media-open>#redlineReceiverIncomingPhotos/);
 assert.match(layout,/#redlineReceiverIncomingPhotos>\.rr-incoming-header/);
 assert.match(layout,/#redlineReceiverIncomingPhotos>#redlineReceiverPricedStage/);
 assert.match(layout,/#redlineReceiverReviewStage #reviewQueueCurrent>\.photo-entry>\.photo-entry-content/);
 assert.match(layout,/#redlineReceiverReviewStage #reviewQueueCurrent>\.photo-entry>\.photo-image-btn>img/);
 assert.match(layout,/object-fit:contain!important/);
 assert.match(layout,/#redlineReceiverReviewStage>#redlinePhotoTimerPanel/);
 assert.match(timer,/workspace\.after\(ownerPanel\)/);
 assert.match(ledger,/preparePhotoReviewLightbox\(e\)/);
});


test('Clicking the single photo opens the full viewport and returns to chat on another click',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(layout,/#photoLightbox:not\(\[hidden\]\)/);
 assert.match(layout,/#photoLightbox #lightboxImage/);
 assert.match(layout,/height:100dvh!important/);
 assert.match(layout,/object-fit:contain!important/);
 assert.match(layout,/#photoLightbox #redlineLightboxReview/);
 assert.match(receiver,/fullSizeImage\?\.addEventListener\('click'/);
 assert.match(receiver,/\$\('#closeLightbox'\)\?\.click\(\)/);
});


test('Full-size REDLINE photo shows receiver bid and the existing authenticated timer side by side',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 const timer=read('private-photo-ledger-timers.js');
 assert.match(ledger,/const receiverActions=state\.isOwner&&!state\.showArchive/);
 assert.match(ledger,/panel\.hidden=!receiverActions/);
 assert.match(ledger,/PLACE YOUR BID/);
 assert.match(ledger,/YOUR BID · USD/);
 assert.match(ledger,/blackcell:redline:lightbox-open/);
 assert.match(ledger,/blackcell:redline:lightbox-close/);
 assert.match(timer,/window\.addEventListener\('blackcell:redline:lightbox-open'/);
 assert.match(timer,/window\.addEventListener\('blackcell:redline:lightbox-close'/);
 assert.match(timer,/insidePhoto&&ownerPanel\.parentNode!==sidebar/);
 assert.match(timer,/sidebar\.append\(ownerPanel\)/);
 assert.match(timer,/ownerPanel\.open=true/);
 assert.match(timer,/await bridge\(\)\.timerStart\(selectedId,cents\)/);
 assert.match(layout,/#photoLightbox #redlineLightboxReview:not\(\[hidden\]\)/);
 assert.match(layout,/flex-direction:row!important/);
 assert.match(layout,/#photoLightbox #redlineLightboxReview \.rr-timer-controls/);
 assert.match(layout,/object-fit:contain!important/);
});

test('BLACKCELL OS loads the REDLINE sidebar release rather than a stale iframe version',()=>{
 const os=read('blackcell-os.html');
 const runtime=read('blackcell-os.js');
 assert.match(os,/receiver-bid-timer-sidebar3-20261121/);
 assert.match(runtime,/receiver-bid-timer-sidebar3-20261121/);
 assert.match(os,/blackcell-os\.js\?v=146-redline-bid-timer-sidebar3/);
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(layout,/body\.bc-redline-receiver:not\(\.rr-imessage-mode\) #photoLightbox/);
});
