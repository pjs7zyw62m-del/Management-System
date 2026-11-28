import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readInvitation,exchangeInvitation} from '../blackcell-invitation-activate.js';
const token='a'.repeat(56);
test('only a single correctly typed invitation token is accepted',()=>{
 assert.equal(readInvitation('#type=invite&token_hash='+token),token);
 for(const fragment of ['', '#type=recovery&token_hash='+token,'#type=invite&token_hash=x','#type=invite&type=invite&token_hash='+token,'#type=invite&token_hash='+token+'&token_hash='+token,'#type=invite&token_hash=https://evil.test'])assert.equal(readInvitation(fragment),null);
});
test('OTP exchange requires both session and user, never redirects via provider',async()=>{
 let args; const client={auth:{verifyOtp:async a=>{args=a;return {data:{session:{},user:{id:'test'}}}}}};
 assert.equal(await exchangeInvitation(client,token),true);
 assert.deepEqual(args,{token_hash:token,type:'invite'});
 for(const result of [{error:new Error('expired')},{data:{session:{}}},{data:{user:{id:'test'}}}])assert.equal(await exchangeInvitation({auth:{verifyOtp:async()=>result}},token),false);
});
test('link is stripped, explicit click required, target remains first party',()=>{
 const js=readFileSync('blackcell-invitation-activate.js','utf8'),html=readFileSync('blackcell-invitation-activate.html','utf8');
 assert.match(js,/history\.replaceState\(null,'',location\.pathname\)/);
 assert.ok(js.indexOf("button.addEventListener('click'")<js.indexOf('await exchangeInvitation(corporateClient(),token)'));
 assert.match(js,/location\.replace\('employee\.html'\)/);
 assert.doesNotMatch(js,/console\.|localhost|localStorage|sessionStorage/);
 assert.match(html,/name="referrer" content="no-referrer"/);
 assert.match(html,/id="continue" disabled/);
 assert.match(readFileSync('docs/blackcell-invitation-activation.md','utf8'),/https:\/\/blackcellcorp\.com\/blackcell-invitation-activate\.html#type=invite&amp;token_hash=\{\{ \.TokenHash \}\}/);
});
