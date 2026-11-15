// Keep script and inline style boundaries; original CSS remains available.
export async function bundlePage(html,page,read,hash){
 const links=[...html.matchAll(/<link\s+rel=["']stylesheet["']\s+href=["']([a-zA-Z0-9_.-]+\.css)(?:\?[^"']*)?["']\s*\/?>/gi)].filter(m=>m.index<html.toLowerCase().indexOf('</head>'));
 const groups=[];for(const item of links){
  const prev=groups.at(-1),last=prev?.at(-1);
  if(last&&/^\s*$/.test(html.slice(last.index+last[0].length,item.index)))prev.push(item);else groups.push([item]);
 }
 const assets=new Map(),edits=[];let removed=0;
 for(const group of groups){
  if(group.length<2)continue;
  const texts=await Promise.all(group.map(m=>read(m[1])));
  if(texts.some(css=>/@(?:import|namespace|charset|layer)\b/i.test(css)||/sourceMappingURL\s*=/.test(css)))continue;
  const merged=texts.map((css,i)=>'/* BLACKCELL SOURCE: '+group[i][1]+' */\n'+css+'\n').join('\n');
  const name='bc-bundle-'+page.replace(/\.html$/,'')+'-'+hash(merged)+'.css';
  assets.set(name,merged);
  edits.push([group[0].index,group.at(-1).index+group.at(-1)[0].length,'<link rel="stylesheet" href="'+name+'">']);
  removed+=group.length-1;
 }
 for(const [a,b,replacement] of edits.reverse())html=html.slice(0,a)+replacement+html.slice(b);
 return {html,assets,before:links.length,after:links.length-removed};
}
