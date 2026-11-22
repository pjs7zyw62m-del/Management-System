import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const chat=readFileSync('corporate-chat.js','utf8');
const employee=readFileSync('employee.js','utf8');
const chatHtml=readFileSync('corporate-chat.html','utf8');
const employeeHtml=readFileSync('employee.html','utf8');

test('Android attachment foregrounding never globally logs out iMessage',()=>{
 const a=chat.indexOf('async function endChatAccess(');
 const b=chat.indexOf('\nfunction status(',a);
 assert.ok(a>0&&b>a);
 const block=chat.slice(a,b);
 assert.doesNotMatch(block,/client\.auth\.signOut/);
 assert.doesNotMatch(block,/corp_employee_end_session/);
 assert.match(block,/function pauseChatForNetwork\(\)/);
 assert.match(block,/ready=false;blockKnown=false/);
 assert.match(block,/async function reverifyChatOnReturn\(\)/);
 assert.match(block,/if\(error\)\{pauseChatForNetwork\(\);return\}/);
 assert.match(block,/if\(data\?\.ok!==true\|\|data\?\.verified!==true\)/);
 assert.match(block,/if\(chatVerificationPaused\)void reverifyChatOnReturn\(\)/);
 assert.match(chat,/window\.addEventListener\('online',\(\)=>\{if\(chatVerificationPaused\)void reverifyChatOnReturn\(\)\}\)/);
});
test('Android chat disables protected actions until server verification resumes',async()=>{
 const a=chat.indexOf('function pauseChatForNetwork(){');
 const b=chat.indexOf('\nfunction chatActivity(){',a);
 assert.ok(a>=0&&b>a);
 const source=chat.slice(a,b);
 const status={message:'',closed:0,ended:0,loads:0};
 let reply={error:new Error('temporary mobile network loss')};
 const factory=new Function('state','getReply',[
  'let employeeSession=true,sessionEnded=false,ready=true,blockKnown=true,chatVerificationPaused=false,chatVerificationChecking=false,lastTouch=0;',
  "const peer={user_id:'peer1'},document={hidden:false},client={rpc:async()=>getReply()};",
  'const sharedMedia={closeMediaTray(){state.closed++}};',
  'function syncInboxControls(){} function syncBlockControls(){}',
  'function status(message){state.message=message} function refreshCurrentBlock(){}',
  'function loadMessages(){state.loads++}',
  'async function endChatAccess(message){state.ended++;sessionEnded=true;ready=false;state.message=message}',
  source,
  'return {pauseChatForNetwork,reverifyChatOnReturn,read:()=>({ready,blockKnown,chatVerificationPaused,sessionEnded})};'
 ].join('\n'));
 const sample=factory(status,()=>reply);
 await sample.reverifyChatOnReturn();
 assert.deepEqual(sample.read(),{ready:false,blockKnown:false,chatVerificationPaused:true,sessionEnded:false});
 assert.equal(status.ended,0);
 assert.match(status.message,/sign-in is preserved/);
 reply={data:{ok:true,verified:true},error:null};
 await sample.reverifyChatOnReturn();
 assert.equal(sample.read().ready,true);
 assert.equal(sample.read().chatVerificationPaused,false);
 assert.equal(status.loads,1);
 reply={data:{ok:true,verified:false},error:null};
 await sample.reverifyChatOnReturn();
 assert.equal(status.ended,1);
 assert.equal(sample.read().sessionEnded,true);
});
test('Employee access portal preserves token on temporary errors, expires revoked sessions',()=>{
 const a=employee.indexOf("void client.rpc('corp_employee_touch_session')");
 const b=employee.indexOf('function setVerified(',a);
 const touch=employee.slice(a,b);
 assert.ok(touch.length>0);
 assert.match(touch,/if\(error\)\{/);
 assert.match(touch,/syncEmployeeMessenger\(false\)/);
 assert.match(touch,/sign-in is preserved/);
 assert.doesNotMatch(touch,/if\(error\|\|data\?\.ok!==true\)void expireSession/);
 assert.match(employee,/if\(data\?\.verified!==true\|\|data\?\.ok!==true\)\{void expireSession\(\);return\}/);
 assert.match(employee,/window\.addEventListener\('online'/);
 assert.match(employee,/async function expireSession\(\)/);
 assert.match(employee,/await client\.auth\.signOut\(\{scope:'local'\}\)/);
 assert.match(chatHtml,/corporate-chat\.js\?v=20261122-android11-resume-caret9/);
 assert.match(employeeHtml,/employee\.js\?v=20261122-android-session-preserve1/);
});
