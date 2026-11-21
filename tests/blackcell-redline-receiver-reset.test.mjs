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
 assert.match(html,/private-photo-ledger-receiver\.css\?v=20261121-imessage-photos3/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261121-imessage-photos3/);
 assert.match(html,/private-photo-ledger\.js\?v=20261121-room-presence1/);
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
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261121-imessage-photos3/);
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
 assert.match(html,/private-photo-ledger-receiver\.css\?v=20261121-imessage-photos3/);
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261121-imessage-photos3/);
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
 assert.match(html,/private-photo-ledger-receiver\.js\?v=20261121-imessage-photos3/);
 assert.match(html,/private-photo-ledger-receiver\.css\?v=20261121-imessage-photos3/);
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
