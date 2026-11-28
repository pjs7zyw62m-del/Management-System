import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('REDLINE LIVE preview is sandboxed and has no production data or camera access',()=>{
 const html=read('blackcell-redline-live-preview.html'),js=read('blackcell-redline-live-preview.js'),host=read('private-photo-ledger-developer-preview.js');
 assert.match(html,/connect-src 'none'; media-src 'none'/);
 assert.match(host,/if\(!authorized\(\)\|\|!dialog.open\)return;liveFrame/);
 assert.match(host,/liveFrame.setAttribute\('sandbox','allow-scripts'\)/);
 assert.match(host,/camera 'none'; microphone 'none'/);
 assert.doesNotMatch(js,/getUserMedia|RTCPeerConnection|fetch\(|\.rpc\(|localStorage|sessionStorage/);
});
test('preview retains free live duration and independent per-sender photo balances',()=>{
 const html=read('blackcell-redline-live-preview.html'),js=read('blackcell-redline-live-preview.js'),css=read('blackcell-redline-live-preview.css');
 for(const id of ['single','group','cameras','photoCanvas','stars','price','submit','queue','groupChat','privateChat','balances','duration','photoTimer'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/Free session · \$0\.00/);assert.match(js,/group\?4:1/);assert.match(js,/balances\[p.person\]\+=p.cents/);assert.match(js,/m.to===privateTo/);
 assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/@media\(max-width:600px\)/);
});
