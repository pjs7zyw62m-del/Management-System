import test from "node:test";
import assert from "node:assert/strict";
import {createPrivateDrive} from "../blackcell-private-drive.js";

const CHUNK=4*1024*1024;
const UID="owner-example";
const ID="test-object";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function fakeClient(){
 return {
  auth:{async getSession(){return {data:{session:{access_token:"test-token",user:{id:UID}}},error:null}}},
  storage:{from(){return {async download(){throw Error("legacy storage should not be contacted")}}}}
 };
}

async function runDownload({brokenIndex=null}={}){
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
 globalThis.window={BLACKCELL_CORP_CONFIG:{url:"https://private-example.supabase.co",publishableKey:"public-test-key"}};
 let active=0,peak=0,reads=[];
 const size=3*CHUNK+7;
 globalThis.fetch=async(url,opts)=>{
  const action=new URL(url).searchParams.get("action");
  if(action==="lookup")return {ok:true,async json(){return {ok:true,row:{id:ID,state:"ready",size_bytes:size}}}};
  assert.equal(action,"read","only expected encrypted chunk reads");
  const req=JSON.parse(opts.body),i=Number(req.index);
  assert.ok(Number.isInteger(i)&&i>=0&&i<4);
  active++;peak=Math.max(peak,active);reads.push(i);
  await sleep(10);
  active--;
  const expected=Math.min(CHUNK,size-i*CHUNK);
  const actual=brokenIndex===i?expected-1:expected;
  const bytes=new Uint8Array(actual);bytes.fill(40+i);
  return {ok:true,async blob(){return new Blob([bytes])}};
 };
 try{
  const drive=createPrivateDrive(fakeClient(),UID);
  const response=await drive.download(UID+"/video-test.bin");
  return {response,peak,reads,size};
 }finally{
  globalThis.fetch=previousFetch;globalThis.window=previousWindow;
 }
}

test("private OS downloads read at most 3 chunks concurrently and reassemble in order",async()=>{
 const {response,peak,reads,size}=await runDownload();
 assert.equal(response.error,null);
 assert.equal(response.data.size,size);
 assert.ok(peak>1,"reads should overlap");
 assert.ok(peak<=3,"server load must remain bounded");
 assert.equal(reads.length,4);
 for(let i=0;i<4;i++){
  const b=new Uint8Array(await response.data.slice(i*CHUNK,i*CHUNK+1).arrayBuffer());
  assert.equal(b[0],40+i,"original byte order must be preserved");
 }
});

test("a corrupt chunk fails closed instead of returning a partial private file",async()=>{
 const {response}=await runDownload({brokenIndex:1});
 assert.equal(response.data,null);
 assert.match(response.error.message,/Incomplete file download/);
});
