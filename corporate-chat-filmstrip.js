/* Private iMessage filmstrip. Virtual rows, one preview decoder, memory-only small image cache. */
const ROW=70,MAX_CACHE=48;
export function mountChatFilmstrip({getItems,getActive,canLoadMore,loadMore,select,thumbnail}){
 const root=document.createElement('aside');root.className='bc-chat-filmstrip';root.setAttribute('aria-label','Shared media filmstrip');
 const scroller=document.createElement('div');scroller.className='bc-filmstrip-scroll';scroller.tabIndex=0;scroller.setAttribute('aria-label','Scroll through shared media');
 const content=document.createElement('div');content.className='bc-filmstrip-track';scroller.append(content);root.append(scroller);
 const nodes=new Map(),cache=new Map(),failed=new Set();
 let epoch=0,frame=0,follow=false,paused=false,running=null;
 function clear(){
  epoch++;if(frame)cancelAnimationFrame(frame);frame=0;running?.abort();follow=false;
  for(const u of cache.values())URL.revokeObjectURL(u);cache.clear();failed.clear();nodes.clear();content.replaceChildren();content.style.height='0px';scroller.scrollTop=0;
 }
 function schedule(f=false){
  follow=follow||f;if(paused||frame)return;
  frame=requestAnimationFrame(()=>{frame=0;render()});
 }
 function paint(tile,url){
  const img=document.createElement('img');img.alt='';img.decoding='async';img.src=url;tile.replaceChildren(img);
 }
 function placeholder(tile,item){tile.textContent=item.kind==='video'?'▶':'▧'}
 function trim(){
  const keep=new Set([...nodes.values()].map(n=>n.item?.id));
  for(const [id,u] of cache){if(cache.size<=MAX_CACHE)break;if(keep.has(id))continue;URL.revokeObjectURL(u);cache.delete(id)}
 }
 async function pump(){
  if(paused||running)return;
  const item=[...nodes.values()].map(n=>n.item).find(x=>x?.kind==='photo'&&!cache.has(x.id)&&!failed.has(x.id));
  if(!item)return;
  const g=epoch,ctrl=new AbortController();running=ctrl;
  try{
   const blob=await thumbnail(item,ctrl.signal);
   if(g!==epoch||ctrl.signal.aborted)return;
   if(!blob){failed.add(item.id);return}
   const u=URL.createObjectURL(blob);cache.set(item.id,u);
   if(!paused)for(const {tile,item:it} of nodes.values())if(it?.id===item.id)paint(tile,u);
   trim();
  }catch(_){if(g===epoch&&!ctrl.signal.aborted)failed.add(item.id)}
  finally{if(running===ctrl)running=null;if(!paused)schedule()}
 }
 function render(){
  if(paused||!root.isConnected)return;
  const items=getItems(),active=getActive(),more=canLoadMore();
  content.style.height=((items.length+(more?1:0))*ROW)+'px';
  if(follow&&items.length){
   const y=active*ROW,h=scroller.clientHeight;
   if(y<scroller.scrollTop)scroller.scrollTop=y;else if(y+ROW>scroller.scrollTop+h)scroller.scrollTop=Math.max(0,y+ROW-h);
  }
  follow=false;
  const h=scroller.clientHeight;if(!h)return;
  const start=Math.max(0,Math.floor(scroller.scrollTop/ROW)-1),end=Math.min(items.length+(more?1:0),Math.ceil((scroller.scrollTop+h)/ROW)+1);
  for(const [i,n] of nodes){if(i<start||i>=end||n.item!==items[i]){n.tile.remove();nodes.delete(i)}}
  for(let i=start;i<end;i++){
   const item=items[i];let n=nodes.get(i);
   if(!n){
    const tile=document.createElement('button');tile.type='button';tile.className='bc-filmstrip-tile';tile.style.top=(i*ROW+3)+'px';
    if(item){tile.title=item.filename;tile.setAttribute('aria-label',(item.kind==='video'?'Video ':'Photo ')+(i+1)+': '+item.filename);placeholder(tile,item);tile.onclick=()=>select(i)}
    else{tile.classList.add('bc-filmstrip-more');tile.textContent='More';tile.setAttribute('aria-label','Load more shared media');tile.onclick=()=>void loadMore()}
    n={tile,item};nodes.set(i,n);content.append(tile);
   }
   if(item){const selected=i===active;n.tile.classList.toggle('selected',selected);n.tile.setAttribute('aria-current',selected?'true':'false');const u=cache.get(item.id);if(u&&n.tile.firstElementChild?.getAttribute('src')!==u)paint(n.tile,u)}
  }
  trim();void pump();
 }
 scroller.addEventListener('scroll',()=>{schedule();if(!paused&&canLoadMore()&&scroller.scrollTop+scroller.clientHeight>=getItems().length*ROW-ROW*2)void loadMore()},{passive:true});
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>schedule()):null;observer?.observe(scroller);
 return {root,refresh:()=>schedule(),follow:()=>schedule(true),clear,pause(){paused=true;if(frame)cancelAnimationFrame(frame);frame=0;running?.abort()},resume(){paused=false;schedule()},dispose(){clear();observer?.disconnect()}};
}
/* Always retain only a tiny local JPEG, even if the storage transform returns an original. */
export async function makeChatThumbnail(url,signal){
 const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error('Thumbnail unavailable');
 const blob=await response.blob();if(signal.aborted)throw Error('Canceled');
 let bitmap=null,objectURL=null;
 try{
  if(typeof createImageBitmap==='function'){try{bitmap=await createImageBitmap(blob,{resizeWidth:144,resizeQuality:'low'})}catch(_){}}
  if(!bitmap){
   objectURL=URL.createObjectURL(blob);
   const img=new Image();img.decoding='async';img.src=objectURL;
   await img.decode();bitmap=img;
  }
  if(signal.aborted)throw Error('Canceled');
  const w=bitmap.width,h=bitmap.height;if(!w||!h)throw Error('Unsupported preview');
  const canvas=document.createElement('canvas');canvas.width=120;canvas.height=120;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Preview unavailable');ctx.fillStyle='#17171b';ctx.fillRect(0,0,120,120);
  const scale=Math.min(120/w,120/h),dw=w*scale,dh=h*scale;ctx.drawImage(bitmap,(120-dw)/2,(120-dh)/2,dw,dh);
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.76));
 }finally{bitmap?.close?.();if(objectURL)URL.revokeObjectURL(objectURL)}
}
