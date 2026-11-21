import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const os=readFileSync('blackcell-os.js','utf8');
const begin=os.indexOf(" // A titlebar drag restores and moves even windows opened maximized");
const end=os.indexOf("\n}\nlet appContext",begin);
assert.ok(begin>=0&&end>begin&&end-begin<4000,'Window drag controller available');

function makeWindow({maximized=true,fullscreen=false,touch=false}={}){
 const handlers=new Map(),classes=new Set([
  ...(maximized?['is-max']:[]),...(fullscreen?['bc-os-fullscreen']:[])
 ]);
 const w={
  hidden:false,style:{},classList:{
   contains:x=>classes.has(x),
   remove:(...items)=>items.forEach(x=>classes.delete(x))
  },
  getBoundingClientRect:()=>({left:0,top:34,width:1280,height:770}),
  get offsetWidth(){return parseFloat(this.style.width)||1280},
  get offsetHeight(){return parseFloat(this.style.height)||770}
 };
 const bar={
  title:'',
  addEventListener:(event,fn)=>handlers.set(event,fn),
  setPointerCapture:()=>{}
 };
 let shellSync=0,saves=0,prevented=0;
 const script=os.slice(begin,end);
 new Function('bar','w','touchOS','innerWidth','innerHeight','syncFullscreenShell','saveWorkspace',script)(
  bar,w,()=>touch,1280,900,()=>{shellSync++},()=>{saves++}
 );
 const evt=(x,y,button=0,target='span')=>({
  pointerId:7,button,clientX:x,clientY:y,
  target:{closest:selector=>target==='button'&&selector==='button,a'?{}:null},
  preventDefault:()=>{prevented++}
 });
 return {handlers,w,classes,evt,get shellSync(){return shellSync},
  get saves(){return saves},get prevented(){return prevented}};
}

test('A maximized REDLINE or Administration window restores under pointer and moves freely',()=>{
 const x=makeWindow({maximized:true});
 const down=x.evt(530,58);
 x.handlers.get('pointerdown')(down);
 assert.ok(!x.classes.has('is-max'),'Maximized class removed to allow free movement');
 assert.ok(Number.parseInt(x.w.style.width)>300);
 assert.ok(Number.parseInt(x.w.style.height)>260);
 assert.equal(x.prevented,1);
 const left=parseInt(x.w.style.left),top=parseInt(x.w.style.top);
 x.handlers.get('pointermove')(x.evt(850,320));
 assert.notEqual(parseInt(x.w.style.left),left);
 assert.notEqual(parseInt(x.w.style.top),top);
 x.handlers.get('pointerup')(x.evt(850,320));
 assert.equal(x.saves,1);
 assert.equal(x.shellSync,1);
});

test('True full-screen window exits full screen before free dragging',()=>{
 const x=makeWindow({fullscreen:true});
 x.handlers.get('pointerdown')(x.evt(380,52));
 assert.ok(!x.classes.has('bc-os-fullscreen'));
 assert.ok(Number.parseInt(x.w.style.width)>0);
 assert.equal(x.shellSync,1);
});

test('Ordinary app windows can be freely repositioned, clamped inside visible desktop',()=>{
 const x=makeWindow({maximized:false});
 x.handlers.get('pointerdown')(x.evt(390,60));
 x.handlers.get('pointermove')(x.evt(9999,9999));
 assert.ok(parseInt(x.w.style.left)>=0);
 assert.ok(parseInt(x.w.style.top)>=34);
 assert.ok(parseInt(x.w.style.left)<=Math.max(0,1280-x.w.offsetWidth));
 assert.ok(parseInt(x.w.style.top)<=Math.max(34,900-x.w.offsetHeight-12));
 x.handlers.get('pointercancel')(x.evt(9999,9999));
 assert.equal(x.saves,1);
});

test('Window buttons, right-clicks, phone/tablet controls do not begin dragging',()=>{
 const button=makeWindow();
 button.handlers.get('pointerdown')(button.evt(530,58,0,'button'));
 assert.ok(button.classes.has('is-max'));
 assert.equal(button.prevented,0);
 const right=makeWindow();
 right.handlers.get('pointerdown')(right.evt(530,58,2));
 assert.ok(right.classes.has('is-max'));
 const mobile=makeWindow({touch:true});
 mobile.handlers.get('pointerdown')(mobile.evt(530,58));
 assert.ok(mobile.classes.has('is-max'));
});
