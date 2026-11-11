/* BLACKCELL VISUAL DISCOVERY — in-browser, non-biometric visual comparison.
   No remote vision API, object/identity recognition or tracking service.
   A selected photo region is compared against patches in other private photos.
 */
export function signatureFromImage(image,region={x:0,y:0,w:1,h:1}){
 const width=image.naturalWidth||image.width;
 const height=image.naturalHeight||image.height;
 if(!width||!height)throw Error('Image dimensions unavailable');
 const w=Math.max(1,Math.round(Math.min(1,region.w)*width));
 const h=Math.max(1,Math.round(Math.min(1,region.h)*height));
 const x=Math.max(0,Math.min(width-w,Math.round((region.x||0)*width)));
 const y=Math.max(0,Math.min(height-h,Math.round((region.y||0)*height)));
 const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('Canvas unavailable');
 ctx.drawImage(image,x,y,w,h,0,0,32,32);
 const raw=ctx.getImageData(0,0,32,32).data;
 const hist=new Float32Array(64),gray=new Float32Array(1024);
 let sumR=0,sumG=0,sumB=0,sat=0,bright=0,edges=0;
 for(let i=0,j=0;i<raw.length;i+=4,j++){
  const r=raw[i]/255,g=raw[i+1]/255,b=raw[i+2]/255;
  hist[(Math.min(3,Math.floor(r*4))*16)+(Math.min(3,Math.floor(g*4))*4)+Math.min(3,Math.floor(b*4))]++;
  sumR+=r;sumG+=g;sumB+=b;
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  sat+=hi-lo;bright+=(r+g+b)/3;
  gray[j]=.2126*r+.7152*g+.0722*b;
 }
 for(let i=0;i<hist.length;i++)hist[i]/=1024;
 // Preserve WHERE colors and edges occur inside the selected detail, rather
 // than merely comparing the same overall beige/green histogram everywhere.
 const cells=new Float32Array(4*4*3);
 const contours=new Float32Array(4*4*2);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const p=y*32+x,k=p*4;
  const cell=(Math.floor(y/8)*4+Math.floor(x/8));
  cells[cell*3]+=raw[k]/(255*64);
  cells[cell*3+1]+=raw[k+1]/(255*64);
  cells[cell*3+2]+=raw[k+2]/(255*64);
  const gx=x<31?Math.abs(gray[p]-gray[p+1]):0;
  const gy=y<31?Math.abs(gray[p]-gray[p+32]):0;
  contours[cell*2]+=gx/64;
  contours[cell*2+1]+=gy/64;
  edges+=gx+gy;
 }
 return {hist:Array.from(hist),cells:Array.from(cells),contours:Array.from(contours),
  avg:[sumR/1024,sumG/1024,sumB/1024],
  saturation:sat/1024,brightness:bright/1024,edge:edges/2048};
}
export function visualSimilarity(a,b){
 let dif=0;
 for(let i=0;i<64;i++)dif+=Math.abs(a.hist[i]-b.hist[i]);
 dif=Math.min(1,dif/2);
 const avg=(Math.abs(a.avg[0]-b.avg[0])+Math.abs(a.avg[1]-b.avg[1])+
  Math.abs(a.avg[2]-b.avg[2]))/3;
 const texture=Math.min(1,Math.abs(a.edge-b.edge)*3.8);
 const saturation=Math.abs(a.saturation-b.saturation);
 const luminance=Math.abs(a.brightness-b.brightness);
 let layout=0,shape=0;
 if(a.cells?.length===48&&b.cells?.length===48){
  for(let i=0;i<48;i++)layout+=Math.abs(a.cells[i]-b.cells[i]);
  layout=Math.min(1,layout/48*2.8);
 }
 if(a.contours?.length===32&&b.contours?.length===32){
  for(let i=0;i<32;i++)shape+=Math.abs(a.contours[i]-b.contours[i]);
  shape=Math.min(1,shape/32*5);
 }
 // These are visual descriptors, not object or person recognition.
 return Math.max(0,Math.min(1,1-(.30*dif+.12*avg+.28*layout+.18*shape+
  .05*texture+.04*saturation+.03*luminance)));
}
export function metadataSimilarity(a,b){
 const known=x=>!!x&&!['unsorted','unspecified','unknown','other','none','all'].includes(String(x).trim().toLowerCase());
 const same=(k)=>known(a?.[k])&&String(a[k]).toLowerCase()===String(b?.[k]||'').toLowerCase();
 let score=0;
 if(same('military_category'))score+=.38;
 if(same('military_branch'))score+=.23;
 if(same('military_era'))score+=.13;
 if(same('military_country_code'))score+=.07;
 if(same('military_unit'))score+=.07;
 const tags=new Set((a?.military_tags||[]).map(s=>String(s).toLowerCase().trim()).filter(Boolean));
 const matches=(b?.military_tags||[]).filter(s=>tags.has(String(s).toLowerCase().trim())).length;
 score+=Math.min(.12,matches*.04);
 return Math.max(0,Math.min(1,score));
}
export function candidateRegions(selection){
 // Search multiple areas and scales; a similar detail can be larger or
 // smaller, or appear in another position within a military photograph.
 const out=[],seen=new Set();
 const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
 for(const size of [.75,1,1.3]){
  const w=clamp((selection?.w||.28)*size,.1,.68);
  const h=clamp((selection?.h||.28)*size,.1,.68);
  for(const cy of [.18,.5,.82])for(const cx of [.18,.5,.82]){
   const x=clamp(cx-w/2,0,1-w),y=clamp(cy-h/2,0,1-h);
   const key=[x,y,w,h].map(v=>Math.round(v*100)).join(':');
   if(seen.has(key))continue;
   seen.add(key);out.push({x,y,w,h});
  }
 }
 return out;
}
export function labelReasons(a,b,pixelAvailable){
 const parts=[];
 if(a?.military_category&&a.military_category===b?.military_category&&a.military_category!=='Unsorted')
  parts.push(a.military_category);
 if(a?.military_branch&&a.military_branch===b?.military_branch&&a.military_branch!=='Unspecified')
  parts.push(a.military_branch);
 if(a?.military_era&&a.military_era===b?.military_era)parts.push(a.military_era);
 if(pixelAvailable)parts.unshift('Visual appearance');
 return parts.slice(0,3).join(' · ')||'Closest available match';
}
