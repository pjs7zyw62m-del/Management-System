import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

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
 assert.match(ledger,/await cleanupUnpostedBunny\(db,room\.id,id\)/);
 assert.doesNotMatch(ledger,/db\.storage\.from\(BUCKET\)\.remove\(/);
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
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261122-settings-visible1/);
 assert.match(html,/private-photo-ledger\.js\?v=20261122-redline-android-multisource1/);
 assert.match(html,/private-photo-ledger-responsive\.js\?v=20261123-os-frame-responsive3/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261122-android-keyboard-return1/);
 assert.match(ledger,/corporateAuthorize\(db,\{allowLedgerOnly:true\}\)/);
 assert.match(ledger,/const BUCKET='corp-private-photo-ledger'/);
 assert.match(ledger,/await uploadBunnyPhoto\(db,room\.id,state\.user\.id,id,file,info\.mime\)/);
 assert.doesNotMatch(ledger,/db\.storage\.from\(BUCKET\)\.upload/);
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
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261122-settings-visible1/);
});

test('Owner can inspect large photo and set price while viewing it',()=>{
 assert.match(ledger,/function preparePhotoReviewLightbox\(entry\)/);
 assert.match(ledger,/ACCEPT FOR AMOUNT/);
 assert.match(ledger,/ACCEPT \$0\.00/);
 assert.match(ledger,/REJECT PHOTO/);
 assert.match(ledger,/await assignAmount\(entry,input,accept\)/);
 assert.match(ledger,/const review=state\.isOwner&&entry\?\.decision_status==='pending'/);
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
  assert.match(ledger.slice(ledger.indexOf('async function confirmRejectPhoto('),ledger.indexOf('async function settle(')),/dialog[.]showModal[(][)]/);
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
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261122-settings-visible1/);
});


test('REDLINE uses iMessage-style slide-in Photo Review, not resize buttons or a percentage slider',()=>{
 assert.match(receiver,/const review=button\('Open Photos',\(\)=>openMedia\(\)/);
 assert.match(receiver,/const showMedia=button\('▣ Photos',\(\)=>openMedia\(\)/);
 assert.match(receiver,/const photoClose=button\('✕',\(\)=>closeMedia\(\)/);
 assert.match(receiver,/function openMedia\(history=false\)/);
 assert.match(receiver,/function closeMedia\(\)\{setHistoryOpen\(false\);mediaOpen=false;showPane\(\)\}/);
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
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261122-settings-visible1/);
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
 assert.match(receiver,/photos\.append\(reviewStage,heightDivider,pricedStage,historyToggle\)/);
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
 assert.match(html,/private-photo-ledger-imessage-workspace\.css\?v=20261121-history-visible1/);
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
 assert.match(html,/private-photo-ledger-timers\.js\?v=20261121-per-second1/);
 assert.match(html,/private-photo-ledger-timers\.css\?v=20261121-sender-live-chat-timer1/);
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
 assert.match(timer,/Rate ÷ 60 every second/);
 assert.match(timer,/Every second counts/);
 assert.match(timer,/bridge\(\)\.timerStart\(selectedId,cents\)/);
 assert.doesNotMatch(timer,/timer-consent-approved/);
 assert.match(timer,/bridge\(\)\.timerHeartbeat\(active\.id\)/);
 assert.match(timer,/bridge\(\)\.timerStop\(id,\{keepPhotoSelected\}\)/);
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
 assert.match(layout,/var\(--rr-media-width,78%\)/);
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
 assert.match(layout,/#redlineReceiverReviewStage>#redlineLightboxReview/);
 assert.match(timer,/sidebar\.append\(ownerPanel\)/);
 assert.match(ledger,/preparePhotoReviewLightbox\(shown\)/);
});


test('Clicking a photo opens the original and leaves zoom available inside the viewer',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(layout,/#photoLightbox:not\(\[hidden\]\)/);
 assert.match(layout,/#photoLightbox #lightboxImage/);
 assert.match(layout,/height:100dvh!important/);
 assert.match(layout,/object-fit:contain!important/);
 assert.match(read('private-photo-ledger-photo-zoom.css'),/#photoLightbox #closeLightbox/);
 assert.match(read('private-photo-ledger-photo-zoom.css'),/display:inline-flex!important/);
 assert.match(receiver,/fullSizeImage\.tabIndex=0/);
 assert.doesNotMatch(receiver,/fullSizeImage\?\.addEventListener\('click',leaveFullPhoto\)/);
 assert.match(read('private-photo-ledger-photo-zoom.js'),/if\(e\.target===fullImg\)/);
 assert.match(html,/id="closeLightbox"/);
});


test('Bid and timed-photo controls share verified right deck on Apple layouts; fullscreen remains photo only',()=>{
 const layout=read('private-photo-ledger-imessage-workspace.css');
 const timer=read('private-photo-ledger-timers.js');
 const fullPhoto=html.slice(html.indexOf('<div id="photoLightbox"'),html.indexOf('<!-- The existing verified bid/timer sidebar'));
 assert.match(ledger,/const receiverActions=state\.isOwner&&!state\.showArchive/);
 assert.match(ledger,/panel\.hidden=!receiverActions/);
 assert.doesNotMatch(ledger,/PLACE YOUR BID|Examine the full photograph before making your final decision/);
 assert.match(ledger,/YOUR BID · USD/);
 assert.match(ledger,/const liveTimer=\$\('redlinePhotoTimerPanel'\)/);
 assert.match(ledger,/restoreTimer\(\)/);
 assert.match(receiver,/const reviewControlsHost=appleMode\?appleTimer:reviewStage/);
 assert.match(receiver,/reviewControlsHost\.append\(bidTimerPanel\)/);
 assert.match(timer,/besidePhoto&&ownerPanel\.parentNode!==sidebar/);
 assert.match(timer,/sidebar\.append\(ownerPanel\)/);
 assert.match(timer,/ownerPanel\.open=true/);
 assert.match(timer,/await bridge\(\)\.timerStart\(selectedId,cents\)/);
 assert.match(timer,/senderDeclineStop\(\)/);
 assert.match(layout,/#redlineReceiverReviewStage>#redlineLightboxReview:not\(\[hidden\]\)/);
 assert.match(layout,/#photoLightbox #lightboxImage/);
 assert.match(layout,/#photoLightbox #closeLightbox\{display:none!important\}/);
 assert.match(layout,/object-fit:contain!important/);
 assert.doesNotMatch(fullPhoto,/redlineLightboxReview|redlinePhotoTimerPanel|redline-review-actions/);
 assert.match(fullPhoto,/id="lightboxImage"/);
 assert.match(html,/id="redlineLightboxReview" class="redline-review-lightbox-controls"/);
 assert.doesNotMatch(ledger,/blackcell:redline:lightbox-open/);
 assert.doesNotMatch(timer,/window\.addEventListener\('blackcell:redline:lightbox-open'/);
});

test('BLACKCELL OS loads the REDLINE sidebar release rather than a stale iframe version',()=>{
 const os=read('blackcell-os.html');
 const runtime=read('blackcell-os.js');
 assert.match(os,/receiver-photo-history-visible1-20261121/);
 assert.match(runtime,/receiver-photo-history-visible1-20261121/);
 assert.match(os,/blackcell-os\.js\?v=\d+-redline-[a-z0-9-]+/);
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(layout,/body\.bc-redline-receiver:not\(\.rr-imessage-mode\) #photoLightbox/);
});


test('Sender chat receives verified start and stop messages with a live clock and earned amount',()=>{
 const timer=read('private-photo-ledger-timers.js');
 const sender=read('private-photo-ledger-simple-sender.js');
 const style=read('private-photo-ledger-simple-sender.css');
 assert.match(timer,/blackcell:redline:timer-status/);
 assert.match(timer,/detail:\{roomId,status:latest\}/);
 assert.match(timer,/const pollMs=pendingStop\?1200:/);
 assert.doesNotMatch(timer,/chat\.insertBefore\(senderPanel,feed\)/);
 assert.match(sender,/window\.addEventListener\('blackcell:redline:timer-status'/);
 assert.match(sender,/\.\.\.timedEvents\(snap\)/);
 assert.match(sender,/if\(e\.kind==='timer'\)/);
 assert.match(sender,/TIMER STARTED/);
 assert.match(sender,/TIMER STOPPED/);
 assert.match(sender,/redline-chat-timer-amount/);
 assert.match(sender,/window\.setInterval\(\(\)=>\{/);
 assert.match(sender,/BigInt\(seconds\)\*BigInt\(row\.rate_cents\|\|0\)/);
 assert.match(style,/\.redline-chat-timer/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261122-android-keyboard-return1/);
});

test('Auto leading zero, verified timed price, and reject confirmation are supported',()=>{
 const timer=read('private-photo-ledger-timers.js');
 const sender=read('private-photo-ledger-simple-sender.js');
 const migration=read('supabase/migrations/20261121123200_redline_photo_timed_price_summary.sql');
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(ledger,/function attachCurrencyLeadingZero\(input\)/);
 assert.match(ledger,/input\.value='0'\+input\.value/);
 assert.match(ledger,/attachCurrencyLeadingZero\(input\)/);
 assert.match(timer,/rate\.value='0'\+rate\.value/);
 assert.match(ledger,/blackcell:redline:timed-photo-summary/);
 assert.match(timer,/blackcell:redline:timed-photo-summary/);
 assert.match(ledger,/const combinedPrice=baseCents\+extraTimedCents/);
 assert.match(ledger,/Automatic timed price/);
 assert.match(migration,/photo_totals/);
 assert.match(migration,/t\.stopped_at is not null/);
 assert.match(html,/id="redlineRejectPhotoConfirm"/);
 assert.match(html,/value="cancel"/);
 assert.match(html,/value="reject"/);
 assert.match(ledger,/dialog\.showModal\(\)/);
 assert.match(ledger,/if\(!await confirmRejectPhoto\(entry\)\)return null/);
 assert.doesNotMatch(ledger,/window\.confirm\('Reject this photo/);
 assert.match(layout,/#redlineRejectPhotoConfirm/);
 assert.match(sender,/\.\.\.timedEvents\(snap\)/);
});
test('REDLINE pause belongs only to verified receiver and applies across devices',()=>{
 const sender=read('private-photo-ledger-sender.js');
 const style=read('private-photo-ledger-imessage-workspace.css');
 const migration=read('supabase/migrations/20261121123000_redline_receiver_photo_pause.sql');
 assert.doesNotMatch(sender,/redlineSenderUploadPause|sessionStorage\.setItem|pause\.addEventListener/);
 assert.match(sender,/const receiverPaused=/);
 assert.match(sender,/if\(receiverPaused\(\)\)/);
 assert.match(ledger,/function appendReceiverPauseControl\(panel\)/);
 assert.match(ledger,/action\.id='redlineReceiverSendingPause'/);
 assert.match(ledger,/appendReceiverPauseControl\(panel\)/);
 assert.match(ledger,/photoSendingPaused:state\.room\.photo_sending_paused===true/);
 assert.match(ledger,/\.update\(\{photo_sending_paused:target\}\)/);
 assert.match(ledger,/\.eq\('owner_id',state\.user\.id\)/);
 assert.match(ledger,/\.select\('id,active,photo_sending_paused'\)/);
 assert.match(ledger,/if\(state\.room\.photo_sending_paused\)/);
 assert.match(ledger,/picker\.disabled=Boolean\(state\.room\?\.photo_sending_paused\)/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS photo_sending_paused boolean NOT NULL DEFAULT false/);
 assert.match(migration,/BEFORE INSERT ON public\.corp_private_photo_entries/);
 assert.match(migration,/NOT r\.photo_sending_paused/g);
 assert.match(style,/#redlineReceiverSendingPause|rr-receiver-pause-button/);
 assert.match(html,/private-photo-ledger-sender\.js\?v=20261122-redline-multi-chooser1/);
 assert.match(html,/private-photo-ledger-simple-sender\.css\?v=20261122-android-keyboard-return1/);
});

test('Selected reviewed photo stays beside sidebar instead of caught-up queue',()=>{
 const queue=ledger.slice(ledger.indexOf('function renderReviewQueue(){'),ledger.indexOf('function renderEntries(){'));
 const layout=read('private-photo-ledger-imessage-workspace.css');
 assert.match(queue,/parent\.append\(renderEntry\(reviewed\)\)/);
 assert.match(queue,/preparePhotoReviewLightbox\(reviewed\|\|null\)/);
 assert.doesNotMatch(queue,/ALL CAUGHT UP/);
 assert.match(layout,/REDLINE reviewed-photo viewport/);
 assert.match(layout,/#redlineReceiverReviewStage:has/);
 assert.match(layout,/#redlineReceiverReviewStage>#redlineLightboxReview/);
});

test('Stop Timer atomically submits one priced photo; other timed earnings never double charge',()=>{
 const migration=read('supabase/migrations/20261121125900_redline_auto_submit_timed_photo.sql');
 const controller=read('private-photo-ledger-timers.js');
 const chat=read('private-photo-ledger-simple-sender.js');
 const os=read('blackcell-os.html');
 assert.match(migration,/v_amount>0/);
 assert.match(migration,/set amount_cents=v_amount,decision_status='accepted',auto_timer_session_id=v_timer.id/);
 assert.match(migration,/e.decision_status='pending' and e.amount_cents is null/);
 assert.match(migration,/photo_auto_submitted/);
 assert.match(migration,/credited_to_photo_cents/);
 assert.match(migration,/additional_timed_cents/);
 assert.match(migration,/redline_timer_photo_link_guard/);
 assert.match(ledger,/auto_timer_session_id/);
 assert.match(ledger,/loadEntries\(\{force:true\}\)/);
 assert.match(ledger,/state.reviewSidebarPhotoId=null/);
 assert.match(ledger,/const combinedPrice=baseCents\+extraTimedCents/);
 assert.match(ledger,/rr-photo-price-amount/);
 assert.match(controller,/committed=await bridge\(\).timerStop\(id,\{keepPhotoSelected\}\)/);
 assert.match(controller,/PHOTO AUTO-SUBMITTED/);
 assert.match(controller,/window.dispatchEvent\(new CustomEvent\('blackcell:redline:photo-selected'/);
 assert.match(chat,/async function pollSenderTimers\(force=false\)/);
 assert.match(chat,/bridge\(\).timerStatus\(id\)/);
 assert.match(chat,/window.setInterval\(\(\)=>\{/);
 assert.match(os,/name="blackcell-os-client-build" content="20\d{6}-[a-z0-9-]+"/);
});

test('Manually accepting a photo always advances to the next pending image',()=>{
 const timer=read('private-photo-ledger-timers.js');
 const approve=ledger.slice(ledger.indexOf('async function assignAmount('),ledger.indexOf('async function acceptZero('));
 const complimentary=ledger.slice(ledger.indexOf('async function acceptZero('),ledger.indexOf('async function confirmRejectPhoto('));
 const reject=ledger.slice(ledger.indexOf('async function rejectPhoto('),ledger.indexOf('async function settle('));
 assert.match(approve,/state\.reviewSidebarPhotoId=null/);
 assert.match(approve,/await loadEntries\(\{force:true\}\)/);
 assert.match(approve,/renderReviewQueue\(\)/);
 assert.match(complimentary,/return await assignAmount\(entry,field,trigger\)/);
 assert.match(reject,/state\.reviewSidebarPhotoId=null/);
 assert.match(reject,/renderReviewQueue\(\)/);
 assert.match(timer,/async function stopTimer\(keepPhotoSelected=false\)/);
 assert.match(timer,/committed\?\.photo_id&&keepPhotoSelected/);
 assert.match(timer,/photo_id===e\.detail\?\.photoId\)void stopTimer\(false\)/);
 assert.match(timer,/selectedId=id;[\s\S]*?void stopTimer\(false\)/);
});

test('Receiver manual price immediately shows next pending photo even if refresh fails',async()=>{
 const begin=ledger.indexOf('async function assignAmount(');
 const end=ledger.indexOf('async function acceptZero(',begin);
 assert.ok(begin>0&&end>begin);
 const source=ledger.slice(begin,end);
 const photos=[
  {id:'first',decision_status:'pending',amount_cents:null},
  {id:'second',decision_status:'pending',amount_cents:null},
  {id:'timed',decision_status:'accepted',amount_cents:25,auto_timer_session_id:'session'}
 ];
 const state={isOwner:true,busy:false,room:{id:'room'},entries:photos,
  reviewSidebarPhotoId:'timed',entryFingerprint:'cached'};
 let shown='timed',renderedBeforeRefresh=false,refreshFailed=false;
 const events=[];
 const context={
  state,ENTRIES:'entries',parseDollars:()=>10,dollars:()=>'$0.10',
  verify:async()=>{},fail:e=>String(e),show:()=>{},
  db:{from:()=>({
   update(value){this.patch=value;return this},
   eq(){return this},
   select(){return this},
   async single(){return {error:null,data:{id:'first',amount_cents:10,decision_status:'accepted'}}}
  })},
  renderReviewQueue(){
   const old=state.reviewSidebarPhotoId==='timed'?'timed':null;
   shown=old||photos.find(p=>p.decision_status==='pending')?.id||null;
   renderedBeforeRefresh=true;
  },
  renderEntries(){},updateTotals(){},
  loadEntries:async({force})=>{
   assert.equal(force,true);
   assert.equal(renderedBeforeRefresh,true);
   assert.equal(shown,'second');
   refreshFailed=true;
   throw Error('simulated transient refresh failure');
  },
  window:{dispatchEvent(e){events.push(e.type)}},
  Event:class{constructor(type){this.type=type}},
  CustomEvent:class{constructor(type,opt){this.type=type;this.detail=opt?.detail}}
 };
 const approve=runInNewContext(source+'; assignAmount',context);
 const button={disabled:false,textContent:'✓ ACCEPT'};
 const result=await approve(photos[0],{value:'0.10'},button);
 assert.equal(result,true);
 assert.equal(shown,'second');
 assert.equal(state.reviewSidebarPhotoId,null);
 assert.equal(photos[0].decision_status,'accepted');
 assert.equal(photos[0].amount_cents,10);
 assert.equal(refreshFailed,true);
 assert.ok(events.includes('blackcell:redline:photo-decided'));
 assert.equal(button.disabled,false);
});

test('End of current-session queue clearly tells receiver why there is no next photo',()=>{
 const ledger=read('private-photo-ledger.js');
 const style=read('private-photo-ledger-imessage-workspace.css');
 const sidebar=ledger.slice(ledger.indexOf('function preparePhotoReviewLightbox(entry){'),ledger.indexOf('async function assignAmount('));
 assert.match(sidebar,/const pendingInCurrent=state\.entries\.some/);
 assert.match(sidebar,/rr-current-session-finished/);
 assert.match(sidebar,/NO NEXT PHOTO/);
 assert.match(sidebar,/All photographs in this current session have been reviewed/);
 assert.match(sidebar,/Waiting for the first photograph in this session/);
 assert.match(style,/rr-current-session-finished/);
 assert.match(ledger,/query\.gte\('created_at',selectedRoom\.current_session_started_at\)/);
});

test('Receiver star ratings are private and sender chat shows rated photo and ranked Top Picks',()=>{
 const migration=read('supabase/migrations/20261121134300_redline_photo_star_ratings.sql');
 const sender=read('private-photo-ledger-simple-sender.js');
 const senderCSS=read('private-photo-ledger-simple-sender.css');
 const workspaceCSS=read('private-photo-ledger-imessage-workspace.css');
 assert.match(migration,/CHECK \(stars BETWEEN 1 AND 5\)/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/REVOKE ALL ON TABLE public\.corp_redline_photo_ratings FROM PUBLIC, anon, authenticated/);
 assert.match(migration,/redline_photo_ratings_room_read/);
 assert.match(migration,/redline_photo_ratings_owner_add/);
 assert.match(migration,/redline_photo_ratings_owner_change/);
 assert.match(ledger,/const RATINGS='corp_redline_photo_ratings'/);
 assert.match(ledger,/async function loadPhotoRatings\(items,roomId\)/);
 assert.match(ledger,/async function saveRating\(stars\)/);
 assert.match(ledger,/onConflict:'photo_id'/);
 assert.match(ledger,/appendPhotoRatingControl\(panel,entry\)/);
 assert.match(ledger,/ratingEvents:state\.entries\.filter/);
 assert.match(ledger,/topPicks:state\.entries\.filter/);
 assert.match(ledger,/image_url:e\.photo_removal_status\?'':state\.images\.get\(e\.image_path\)/);
 assert.match(ledger,/if\(e\.photo_removal_status\)/);
 assert.match(sender,/\.\.\.photoRatingEvents\(snap\)/);
 assert.match(sender,/if\(e\.kind==='rating'\)/);
 assert.match(sender,/★ TOP PICK · 5 STARS/);
 assert.match(sender,/appendRatingImage\(rating,photo\.image_url,photo\.caption\)/);
 assert.match(sender,/function renderTopPicks\(snap\)/);
 assert.match(senderCSS,/\.redline-chat-rated-photo/);
 assert.match(senderCSS,/\.redline-top-picks-box/);
 assert.match(workspaceCSS,/\.rr-photo-rating-star\.is-filled/);
});

test('Rating buttons do not mutate the original financial ledger',()=>{
 const begin=ledger.indexOf('async function saveRating(stars)');
 const end=ledger.indexOf('// Full-screen inspection uses the existing authenticated decision handlers',begin);
 assert.ok(begin>0&&end>begin);
 const rating=ledger.slice(begin,end);
 assert.match(rating,/db\.from\(RATINGS\)\.upsert/);
 assert.match(rating,/stars===5\?'Saved · 5 STARS · TOP PICK'/);
 assert.doesNotMatch(rating,/db\.from\(ENTRIES\)/);
 assert.doesNotMatch(rating,/timerStart|timerStop|amount_cents/);
 const sender=read('private-photo-ledger-simple-sender.js');
 assert.match(sender,/topPicksList\.replaceChildren\(\)/);
 assert.match(sender,/star[s]?Text\(photo\.stars\)/);
});

test('Compact receiver buttons retain stars and every bid decision without heading clutter',()=>{
 const css=read('private-photo-ledger-imessage-workspace.css');
 const review=ledger.slice(ledger.indexOf('function preparePhotoReviewLightbox(entry){'),ledger.indexOf('async function assignAmount('));
 assert.doesNotMatch(review,/PLACE YOUR BID|Examine the full photograph before making your final decision/);
 assert.match(review,/YOUR BID · USD/);
 assert.match(review,/ACCEPT FOR AMOUNT/);
 assert.match(review,/ACCEPT \$0\.00/);
 assert.match(review,/REJECT PHOTO/);
 assert.match(css,/REDLINE receiver compact controls/);
 assert.match(css,/\.rr-receiver-pause-button/);
 assert.match(css,/\.rr-photo-rating-star/);
 assert.match(css,/\.redline-review-actions button/);
 assert.match(css,/min-height:37px!important/);
 assert.match(html,/private-photo-ledger\.js\?v=20261122-redline-android-multisource1/);
 assert.match(html,/private-photo-ledger-imessage-workspace\.css\?v=20261121-history-visible1/);
});

test('Approved originals can be reused privately until the receiver rejects or another copy is pending',()=>{
 const migration=read('supabase/migrations/20261121135000_redline_five_star_resubmissions.sql');
 const reuseMigration=read('supabase/migrations/20261123153000_redline_approved_original_photo_reuse.sql');
 const sender=read('private-photo-ledger-simple-sender.js');
 const style=read('private-photo-ledger-simple-sender.css');
 assert.match(migration,/resubmission_origin_id uuid/);
 assert.match(migration,/redline_resubmission_immutable/);
 assert.match(migration,/redline_validate_five_star_resubmission/);
 assert.match(reuseMigration,/v_source.decision_status IS DISTINCT FROM 'accepted'/);
 assert.doesNotMatch(reuseMigration,/v_rating IS DISTINCT FROM 5/);
 assert.match(reuseMigration,/prior.decision_status IN \('pending','rejected'\)/);
 assert.match(reuseMigration,/pg_advisory_xact_lock/);
 assert.match(reuseMigration,/NOT photo_sending_paused/);
 assert.match(reuseMigration,/redline_no_removed_resubmission/);
 assert.match(ledger,/resubmission_origin_id,decision_status/);
 assert.match(ledger,/async resubmitFiveStarPhoto\(photoId\)/);
 assert.match(ledger,/async reusePhoto\(photoId\)/);
 assert.match(ledger,/db.storage.from\(BUCKET\).download\(source.image_path\)/);
 assert.match(ledger,/resubmission_origin_id:photoId,decision_status:'pending'/);
 assert.match(ledger,/const eligibleOriginal=/);
 assert.match(ledger,/e.decision_status==='accepted'/);
 assert.match(ledger,/const resubmissionStatus=/);
 assert.match(ledger,/if\(options.keepPhotoSelected===true\)/);
 assert.match(sender,/\['five-star','5-Star Photos'\]/);
 assert.match(sender,/function renderFiveStarPhotos\(snap\)/);
 assert.match(sender,/resubmissionStatus==='pending'/);
 assert.match(sender,/resubmissionStatus==='rejected'/);
 assert.match(sender,/BLACKCELL_REDLINE_REUSE_UI\?\.open\(photo.id,action\)/);
 assert.match(style,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(style,/\.redline-five-star-photo/);
 assert.match(html,/private-photo-ledger\.js\?v=20261123-reuse-approved-original1/);
 assert.match(html,/private-photo-ledger-simple-sender\.js\?v=20261123-sender-reuse-popup1/);
 assert.match(html,/private-photo-ledger-sender-reuse\.js\?v=20261123-reuse-popup1/);
});

test('After a server-confirmed price, the next photo is shown before network refresh',()=>{
 const approve=ledger.slice(ledger.indexOf('async function assignAmount('),ledger.indexOf('async function acceptZero('));
 const accept=approve.indexOf("if(r.error)throw r.error;");
 const live=approve.indexOf('renderReviewQueue();',accept);
 const refresh=approve.indexOf('await loadEntries({force:true})',accept);
 assert.ok(accept>=0&&live>accept&&refresh>live);
 assert.match(approve,/Object\.assign\(entry,\{amount_cents:amount,decision_status:'accepted'/);
 assert.match(approve,/state\.reviewSidebarPhotoId=null/);
 assert.match(approve,/try\{await loadEntries\(\{force:true\}\)\}/);
 assert.match(approve,/Photo price saved and next photo displayed/);
});

test('Receiver single photo view never allows stale timer preview to cover a pending photo',()=>{
 const script=read('private-photo-ledger-timers.js');
 const approval=ledger.slice(ledger.indexOf('async function assignAmount('),ledger.indexOf('async function acceptZero('));
 assert.match(script,/preview\.hidden=true;/);
 assert.match(script,/document\.body\.classList\.remove\('rr-timing-priced-photo'\)/);
 assert.doesNotMatch(script,/preview\.hidden=!priced/);
 assert.match(script,/window\.addEventListener\('blackcell:redline:review-photo'/);
 assert.match(ledger,/for\(const stale of document\.querySelectorAll\('\.rr-timer-selected-preview'\)\)/);
 assert.match(approval,/renderReviewQueue\(\)/);
 assert.match(approval,/Object\.assign\(entry,\{amount_cents:amount,decision_status:'accepted'/);
 assert.match(approval,/try\{await loadEntries\(\{force:true\}\)\}/);
 const workflow=read('.github/workflows/blackcell-redline-receiver-rebuild.yml');
 assert.match(workflow,/node tests\/redline-next-photo-visual-smoke\.mjs/);
});

test('Photo History is accessible despite the old photo-only layout rules',()=>{
 const receiver=read('private-photo-ledger-receiver.js');
 const style=read('private-photo-ledger-imessage-workspace.css');
 assert.match(receiver,/historyToggle\.id='redlinePhotoHistoryToggle'/);
 assert.match(receiver,/function setHistoryOpen\(open\)/);
 assert.match(receiver,/historyToggle\.setAttribute\('aria-expanded',String\(historyOpen\)\)/);
 assert.match(receiver,/setHistoryOpen\(history\)/);
 assert.match(receiver,/photos\.classList\.toggle\('rr-history-open',historyOpen\)/);
 assert.match(receiver,/const history=button\('Photo History',\(\)=>openMedia\(true\)/);
 assert.match(style,/REDLINE PHOTO HISTORY RESTORED/);
 assert.match(style,/#redlineReceiverIncomingPhotos\.rr-history-open>#redlineReceiverPricedStage/);
 assert.match(style,/#redlineReceiverPricedStage>#photoEntries/);
 assert.match(style,/overflow-y:auto!important/);
 assert.match(style,/position:absolute!important/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261122-settings-visible1/);
 assert.match(html,/private-photo-ledger-imessage-workspace\.css\?v=20261121-history-visible1/);
 const workflow=read('.github/workflows/blackcell-redline-receiver-rebuild.yml');
 assert.match(workflow,/node tests\/redline-photo-history-browser-smoke\.mjs/);
});


test('REDLINE puts quick actions in a menu with Pay in Full beside it',()=>{
 const sql=read('supabase/migrations/20261121144033_blackcell_redline_record_paid_in_full.sql');
 assert.match(receiver,/menuItems\.append\(review,history,message,manage,tools\)/);
 assert.match(receiver,/nav\.append\(menuShell,payColumn\)/);
 assert.match(receiver,/menuToggle\.setAttribute\('aria-expanded',String\(open\)\)/);
 assert.match(receiver,/menuItems\.hidden=!open/);
 assert.match(receiver,/const payFull=button\('PAY IN FULL'/);
 assert.match(receiver,/api\.recordPaidInFull\(current\.roomId\)/);
 assert.match(receiver,/REDLINE will NOT send or charge any money/);
 assert.match(css,/rr-nav-menu-items\[hidden\]\{display:none!important\}/);
 assert.match(css,/rr-pay-full/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261122-settings-visible1/);
 assert.match(html,/private-photo-ledger-receiver\.css\?v=20261121-photo-large-timed1-menu1/);
 assert.match(html,/private-photo-ledger\.js\?v=20261122-redline-android-multisource1/);
 assert.match(ledger,/async recordPaidInFull\(roomId\)/);
 assert.match(ledger,/db\.rpc\('corp_redline_record_paid_in_full'/);
 assert.match(sql,/v_room\.owner_id IS DISTINCT FROM v_user/);
 assert.match(sql,/v_room\.current_session_started_at/);
 assert.match(sql,/t\.stopped_at IS NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.corp_redline_record_paid_in_full/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.corp_redline_record_paid_in_full/);
});


test('Apple REDLINE keeps full-height incoming photo while verified timer and review controls share right deck',()=>{
 const receiver=read('private-photo-ledger-receiver.js');
 const timer=read('private-photo-ledger-timers.js');
 const ledger=read('private-photo-ledger.js');
 const skin=read('private-photo-ledger-unified-review.css');
 assert.match(receiver,/const reviewControlsHost=appleMode\?appleTimer:reviewStage/);
 assert.match(receiver,/reviewControlsHost\.append\(bidTimerPanel\)/);
 assert.match(timer,/appleTimer\.prepend\(ownerPanel\)/);
 assert.match(skin,/#rrAppleTimerMount > #redlineLightboxReview:not\(\[hidden\]\)/);
 assert.match(skin,/#redlineReceiverReviewStage #ownerReviewQueue:not\(\[hidden\]\)/);
 assert.match(skin,/grid-template-rows:0px minmax\(0,1fr\) 0px 0px/);
 assert.match(skin,/position:absolute!important;z-index:6!important/);
 assert.match(html,/private-photo-ledger-unified-review\.css/);
 assert.match(ledger,/function appendPhotoRatingControl\(panel,entry\)/);
 assert.match(ledger,/async function decision\(kind\)/);
});
test('Pause Sending stays server-authorized and appears next to owner REDLINE Settings',()=>{
 const receiver=read('private-photo-ledger-receiver.js');
 const ledger=read('private-photo-ledger.js');
 const skin=read('private-photo-ledger-unified-review.css');
 assert.match(ledger,/wrapper\.id='redlineReceiverPauseHeader'/);
 assert.match(ledger,/if\(settings\?\.parentNode===commandHeader\)settings\.after\(wrapper\)/);
 assert.match(receiver,/settings\.after\(pause\)/);
 assert.match(ledger,/\.eq\('id',roomId\)\.eq\('owner_id',state\.user\.id\)/);
 assert.match(skin,/#redlineReceiverPauseHeader #redlineReceiverSendingPause/);
 assert.match(ledger,/if\(!receiverActions\)\{/);
});


test('REDLINE widescreen desktop is balanced without changing tablet or mobile layout',()=>{
 const html=read('private-photo-ledger.html');
 const layout=read('private-photo-ledger-desktop-balance.css');
 assert.match(html,/private-photo-ledger-desktop-balance\.css\?v=20261122-balanced-desktop1/);
 assert.match(layout,/@media \(min-width:1281px\)/);
 assert.match(layout,/body\.bc-redline-receiver\.bc-ledger-desktop/);
 assert.match(layout,/max-width:1680px!important/);
 assert.match(layout,/grid-template-columns:156px minmax\(0,\.96fr\) 8px minmax\(0,1\.19fr\)!important/);
 assert.match(layout,/\.rr-sidebar-hidden:not\(\[hidden\]\)/);
 assert.match(layout,/object-fit:contain!important/);
 const responsive=read('private-photo-ledger-responsive.js');
 assert.match(responsive,/document\.body\.classList\.toggle\('bc-ledger-desktop',mode==='os'\)/);
});


test('approved REDLINE desktop controls are three compact sections above growing chat',()=>{
 const html=read('private-photo-ledger.html');
 const style=read('private-photo-ledger-approved-deck.css');
 const receiver=read('private-photo-ledger-receiver.js');
 const ledger=read('private-photo-ledger.js');
 const timer=read('private-photo-ledger-timers.js');
 assert.match(html,/private-photo-ledger-approved-deck\.css\?v=20261123-os-frame-responsive3/);
 assert.match(style,/@media \(min-width:720px\)/);
 assert.match(style,/bc-ledger-desktop/);
 assert.match(style,/#rrAppleTimerMount>\.rr-timer-panel/);
 assert.match(style,/#rrAppleTimerMount>#redlineLightboxReview:not\(\[data-redline-decision="pending"\]\):not\(\[hidden\]\)/);
 assert.match(style,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(style,/#rrAppleRight>\.rr-chat-panel:not\(\[hidden\]\)/);
 assert.match(style,/min-height:0!important/);
 assert.match(style,/data-redline-decision="pending"/);
 assert.match(receiver,/const reviewControlsHost=appleMode\?appleTimer:reviewStage/);
 assert.match(receiver,/reviewControlsHost\.append\(bidTimerPanel\)/);
 assert.match(ledger,/appendPhotoRatingControl\(panel,entry\)/);
 assert.match(ledger,/deletePhotoPermanently\(entry\)/);
 assert.match(timer,/const start=btn\('▶ START TIMER'/);
 assert.match(timer,/const stop=btn\('■ STOP TIMER'/);
});


test('REDLINE desktop timer keeps the title, stopwatch, amount and hide control aligned',()=>{
 const css=read('private-photo-ledger-approved-deck.css');
 assert.match(css,/#redlinePhotoTimerPanel summary\.rr-timer-heading::before\{\s*content:none!important/);
 assert.match(css,/summary\.rr-timer-heading>\.rr-timer-money::before\{\s*content:"⏱"!important/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) max-content!important/);
 assert.match(css,/grid-template-rows:19px 18px!important/);
 assert.match(css,/grid-template-columns:max-content minmax\(0,1fr\)!important/);
 assert.match(css,/min-height:48px!important/);
});


test('desktop REDLINE panel follows BLACKCELL OS host at narrower iframe width without changing standalone tablet',()=>{
 const responsive=read('private-photo-ledger-responsive.js');
 const css=read('private-photo-ledger-approved-deck.css');
 const html=read('private-photo-ledger.html');
 const os=read('blackcell-os.js');
 assert.match(responsive,/frame\?\.id!=='bcOsPhotoLedgerFrame'/);
 assert.match(responsive,/host\?\.innerWidth>=1180&&window\.innerWidth>=720/);
 assert.match(responsive,/classList\.toggle\('bc-os-frame-redline',desktopOsFrame\(\)\)/);
 assert.match(css,/@media \(min-width:720px\)/);
 assert.match(css,/:is\(\.bc-ledger-desktop,\.bc-os-frame-redline\)/);
 assert.match(html,/private-photo-ledger-approved-deck\.css\?v=20261123-os-frame-responsive3/);
 assert.match(os,/redlineRelease=20261123-negotiation-photo-focus1/);
});


test('REDLINE Option 2 removes oversized desktop heading but preserves all four toolbar functions',()=>{
 const html=read('private-photo-ledger.html');
 const css=read('private-photo-ledger-header-refined.css');
 const os=read('blackcell-os.js');
 const receiver=read('private-photo-ledger-receiver.js');
 assert.match(html,/private-photo-ledger-header-refined\.css\?v=20261123-option2-slim1/);
 assert.match(css,/\.rr-command-header>\.rr-command-intro/);
 assert.match(css,/display:none!important/);
 assert.match(css,/#redlineConsentSettingsOpen/);
 assert.match(css,/#redlineReceiverSendingPause/);
 assert.match(css,/#refreshLedger|\.workspace-actions/);
 assert.match(css,/#ledgerLiveStatus/);
 assert.match(css,/\.verified-mark/);
 assert.match(css,/min-height:36px!important/);
 assert.match(css,/@media \(max-width:900px\)/);
 assert.match(receiver,/header\.append\(intro,status\)/);
 assert.match(os,/redlineRelease=20261123-negotiation-photo-focus1/);
});


test('merged REDLINE Web OS photo dock has one outer border, inner divider and preserved actions',()=>{
 const css=read('private-photo-ledger-merged-photo-panel.css');
 const html=read('private-photo-ledger.html');
 const receiver=read('private-photo-ledger-receiver.js');
 assert.match(html,/private-photo-ledger-merged-photo-panel\.css\?v=20261123-merged-photo-webos3/);
 assert.match(css,/#rrAppleRight #rrAppleTimerMount\{/);
 assert.match(css,/border:1px solid #bc2c50!important/);
 assert.match(css,/#rrAppleTimerMount>\.rr-timer-panel\{/);
 assert.match(css,/border:0!important/);
 assert.match(css,/#rrAppleTimerMount>#redlineLightboxReview:not\(\[hidden\]\)\{/);
 assert.match(css,/border-top:1px solid #854054!important/);
 assert.match(css,/#redlineLightboxReview\[data-redline-decision="pending"\]/);
 assert.match(css,/\.rr-permanent-delete-button\{/);
 assert.match(receiver,/const reviewControlsHost=appleMode\?appleTimer:reviewStage/);
});


test('REDLINE Web OS owner permission hub keeps authenticated link, preview and employee actions compact',()=>{
 const html=read('private-photo-ledger.html');
 const style=read('private-photo-ledger-owner-hub.css');
 const preview=read('private-photo-ledger-owner-preview.js');
 const sender=read('private-photo-ledger-simple-sender.js');
 const ledger=read('private-photo-ledger.js');
 const os=read('blackcell-os.js');
 assert.match(html,/private-photo-ledger-owner-hub\.css\?v=20261123-owner-hub1/);
 assert.match(style,/#ownerSetup:not\(\[hidden\]\)/);
 assert.match(style,/#ownerUploadInfo:not\(\[hidden\]\)/);
 assert.match(style,/#ownerLedgerScope:not\(\[hidden\]\)/);
 assert.match(style,/#ledgerApp:has\(#ownerUploadInfo:not\(\[hidden\]\)\) #redlineSetupPreviewButton/);
 assert.match(style,/#ownerUploadInfo>#redlineOwnerPreviewButton/);
 assert.match(style,/#ownerUploadInfo>\.redline-owner-open-messages/);
 assert.match(style,/#activeRoom \.side-column>\.link-card/);
 assert.match(style,/#redlineReceiverAccessPanel/);
 assert.match(style,/@media\(min-width:720px\) and \(max-width:850px\)/);
 assert.match(ledger,/ledgerScopeToggle/);
 assert.match(ledger,/ownerUploadShare/);
 assert.match(ledger,/copyRoomLink/);
 assert.match(preview,/redlineOwnerPreviewButton/);
 assert.match(sender,/redline-owner-open-messages/);
 assert.match(os,/redlineRelease=20261123-negotiation-photo-focus1/);
});


test('REDLINE Web OS authentic photo supports inline and enlarged zoom without click-to-close',()=>{
 const html=read('private-photo-ledger.html');
 const zoom=read('private-photo-ledger-photo-zoom.js');
 const css=read('private-photo-ledger-photo-zoom.css');
 const receiver=read('private-photo-ledger-receiver.js');
 assert.match(html,/private-photo-ledger-photo-zoom\.js\?v=20261123-photo-canvas-v2/);
 assert.match(html,/private-photo-ledger-photo-zoom\.css\?v=20261123-photo-canvas-v2/);
 assert.match(zoom,/const MAX=6,FACTOR=1\.5/);
 assert.match(zoom,/redlineReceiverReviewStage #reviewQueueCurrent/);
 assert.match(zoom,/const fullObserver=new MutationObserver/);
 assert.match(zoom,/pointermove/);
 assert.match(zoom,/wheel/);
 assert.match(zoom,/if\(e\.target===fullImg\)/);
 assert.match(css,/#photoLightbox #closeLightbox/);
 assert.match(css,/display:inline-flex!important/);
 assert.doesNotMatch(receiver,/fullSizeImage\?\.addEventListener\('click',leaveFullPhoto\)/);
});


test('REDLINE gives Web OS photo the entire available canvas and an explicit large view',()=>{
 const css=read('private-photo-ledger-photo-zoom.css');
 const zoom=read('private-photo-ledger-photo-zoom.js');
 assert.match(css,/#redlineReceiverLiveWorkspace #redlineReceiverIncomingPhotos\.rr-incoming-photos/);
 assert.match(css,/#redlineReceiverIncomingPhotos>\.rr-incoming-header/);
 assert.match(css,/height:100%!important/);
 assert.match(css,/#redlineReceiverReviewStage #reviewQueueCurrent>\.photo-entry>\.photo-image-btn>img/);
 assert.match(css,/object-fit:contain!important/);
 assert.match(zoom,/bc-photo-open-large/);
 assert.match(zoom,/photoButton\.click\(\)/);
 assert.match(zoom,/bc-photo-load-message/);
});
