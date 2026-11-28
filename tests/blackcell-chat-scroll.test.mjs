import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatScroll} from '../blackcell-chat-scroll.js';
function fixture(){
 let height=1000,top=0,resize;
 const listeners={},frames=[];
 const box={clientHeight:300,children:[],get scrollHeight(){return height},get scrollTop(){return top},set scrollTop(v){top=Math.max(0,Math.min(height-this.clientHeight,v))},addEventListener(n,fn){listeners[n]=fn},querySelectorAll(){return this.children},getBoundingClientRect(){return {top:0}}};
 class Observer{constructor(fn){resize=fn}observe(){}disconnect(){}}
 const ctl=createChatScroll(box,{observe:Observer,frame:fn=>frames.push(fn)});
 return {box,ctl,resize:()=>resize(),height:v=>height=v,scroll:v=>{box.scrollTop=v;listeners.scroll()},flush:()=>{while(frames.length)frames.shift()()}};
}
test('opening a conversation snaps to newest and late media layout keeps bottom visible',()=>{
 const f=fixture();f.ctl.afterRender(f.ctl.beforeRender(true));assert.equal(f.box.scrollTop,700);
 f.height(1500);f.resize();f.flush();assert.equal(f.box.scrollTop,1200);
 f.box.clientHeight=200;f.resize();assert.equal(f.box.scrollTop,1300);
});
test('scrolling up preserves reader position across refresh until returning to newest',()=>{
 const f=fixture();f.ctl.open();f.flush();f.scroll(250);const before=f.ctl.beforeRender();
 f.height(1300);f.ctl.afterRender(before);f.resize();f.flush();assert.equal(f.box.scrollTop,250);
 f.scroll(1000);f.height(1500);f.resize();assert.equal(f.box.scrollTop,1200);
});
test('switching contacts resets reader position to bottom',()=>{
 const f=fixture();f.ctl.open();f.flush();f.scroll(100);f.height(2000);
 f.ctl.afterRender(f.ctl.beforeRender(true));f.flush();assert.equal(f.box.scrollTop,1700);
});
