/* BLACKCELL Photo Battle — personal head-to-head photo preferences. No uploads or publication. */
export function mountPhotoBattle(host,{client,userId,preview,alive}){
 const E=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const B=(text,fn,cls='pb-btn')=>{const b=E('button',cls,text);b.type='button';b.onclick=fn;return b};
 host.classList.add('pb-app');const rail=E('aside','pb-rail'),main=E('main','pb-main'),toolbar=E('header','pb-toolbar'),body=E('div','pb-body');host.append(rail,main);main.append(toolbar,body);
 const title=E('div','pb-title');title.append(E('strong','','Photo Battle'),E('small','','BLACKCELL / MEDIA ARENA'));rail.append(title);
 const nav=E('nav','pb-nav');rail.append(nav);const note=E('p','pb-note','PRIVATE VOTING · YOUR RANKINGS');rail.append(note);
 let photos=[],stats={},seen=new Set(),pair=null,tab='battle',round=0,closed=false,loading=false,sequence=0,pairGeneration=0,rankRenderToken=0,saving='',failed=false;
 const key='bc.photobattle.v1:'+String(userId||'preview');const valid=()=>!closed&&alive();
 if(!preview)try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&saved.stats&&typeof saved.stats==='object'){for(const [id,v] of Object.entries(saved.stats))if(/^[0-9a-f-]{36}$/i.test(id)&&Number.isSafeInteger(v?.wins)&&Number.isSafeInteger(v?.losses)&&v.wins>=0&&v.losses>=0)stats[id]={wins:Math.min(v.wins,1000000),losses:Math.min(v.losses,1000000)};round=Object.values(stats).reduce((sum,v)=>sum+v.wins,0)}}catch(_){}
 function save(){if(preview)return;try{localStorage.setItem(key,JSON.stringify({stats}));saving='Votes saved to this browser.'}catch(_){saving='Browser storage unavailable. Votes are saved only in this session.'}}
 const tabs=[['battle','⚔','Battle Arena'],['rankings','▥','My Rankings']];const buttons=new Map();
 for(const [id,icon,name] of tabs){const b=B(icon+'  '+name,()=>{tab=id;render()},'pb-nav-btn');nav.append(b);buttons.set(id,b)}
 function choose(){if(photos.length<2)return null;const first=photos[Math.floor(Math.random()*photos.length)];const rest=photos.filter(x=>x.id!==first.id);const second=rest[Math.floor(Math.random()*rest.length)];return [first,second]}
 function describe(a){const country=a.military_country_code||'';const branch=a.military_branch||'';return [country,branch].filter(Boolean).join(' · ')||'Approved library photo'}
 function toolbarRender(){toolbar.replaceChildren();const copy=E('div');copy.append(E('h1','',tab==='battle'?'Battle Arena':'My Rankings'),E('small','','Compare photography. Choose your favorite.'));toolbar.append(copy,B('↻ Refresh library',()=>void load()));}
 async function load(){
  if(loading||!valid())return;loading=true;failed=false;pair=null;photos=[];seen.clear();render();const seq=++sequence;
  try{
   if(preview){saving='Sign in to access approved library photographs.';return}
   const {data,error}=await client.from('corp_social_assets').select('id,storage_path,military_country_code,military_branch').eq('review_status','approved').eq('adult_restricted',false).eq('rights_confirmed',true).eq('purpose','library').eq('kind','photo').order('id').limit(600);
   if(error)throw error;if(!valid()||seq!==sequence)return;
   photos=(data||[]).filter(a=>a.id&&a.storage_path);await nextPair();
  }catch(_){failed=true;saving='Could not read the approved photo library. Refresh to retry.'}finally{if(valid()&&seq===sequence){loading=false;render()}}
 }
 async function nextPair(){
  if(!valid())return;const pairToken=++pairGeneration;pair=null;const selected=choose();if(!selected){render();return}
  for(let i=0;i<8;i++){const ids=selected.map(a=>a.id).sort().join(':');if(!seen.has(ids)){seen.add(ids);break}const next=choose();if(next)selected.splice(0,2,...next);if(i===7)seen.clear()}
  const seq=sequence;try{
   const results=await Promise.all(selected.map(async a=>{const {data,error}=await client.storage.from('corp-social-media').createSignedUrl(a.storage_path,300);if(error||!data?.signedUrl)throw Error('Photo inaccessible');return {...a,url:data.signedUrl}}));
   if(valid()&&seq===sequence&&pairToken===pairGeneration){pair=results;render()}
  }catch(_){if(valid()&&seq===sequence&&pairToken===pairGeneration){saving='A photo could not be loaded. Skip to another battle.';render()}}
 }
 function vote(winner){if(!pair||!valid()||tab!=='battle')return;const a=pair[winner],b=pair[1-winner];pair=null;const get=id=>stats[id]??(stats[id]={wins:0,losses:0});get(a.id).wins++;get(b.id).losses++;round++;save();render();void nextPair()}
 function render(){
  if(!valid())return;toolbarRender();for(const [id,b] of buttons){b.classList.toggle('selected',id===tab);b.setAttribute('aria-current',id===tab?'page':'false')}body.replaceChildren();
  const metrics=E('div','pb-metrics');for(const [label,value] of [['Votes cast',round],['Eligible photos',photos.length],['Ranked photos',photos.filter(a=>stats[a.id]).length]]){const m=E('div','pb-stat');m.append(E('small','',label),E('strong','',String(value)));metrics.append(m)}body.append(metrics);
  if(tab==='rankings'){
   const ranked=photos.filter(a=>stats[a.id]).sort((a,b)=>stats[b.id].wins-stats[a.id].wins||stats[a.id].losses-stats[b.id].losses);
   const list=E('section','pb-rank');list.append(E('h2','','Your personal leaderboard'));const galleryToken=++rankRenderToken;if(!ranked.length)list.append(E('p','pb-note','Vote in the arena to build your rankings.'));
   for(const [i,a] of ranked.slice(0,50).entries()){const row=E('div','pb-rank-row'),thumb=E('img','pb-rank-thumb');thumb.alt='Ranked photograph '+(i+1);thumb.style.cssText='width:52px;height:58px;object-fit:contain;background:#101014;border-radius:6px;flex:none';thumb.hidden=true;row.append(E('strong','',String(i+1).padStart(2,'0')),thumb,E('span','',describe(a)),E('small','',stats[a.id].wins+' wins · '+stats[a.id].losses+' losses'));list.append(row);if(i<25)void client.storage.from('corp-social-media').createSignedUrl(a.storage_path,300).then(({data,error})=>{if(valid()&&tab==='rankings'&&galleryToken===rankRenderToken&&!error&&data?.signedUrl){thumb.referrerPolicy='no-referrer';thumb.src=data.signedUrl;thumb.hidden=false}}).catch(()=>{})}body.append(list);
  }else if(pair){const grid=E('div','pb-pair');pair.forEach((a,i)=>{const card=E('article','pb-photo'),frame=E('div','pb-image'),img=E('img');img.alt='Approved library photograph '+(i+1);img.referrerPolicy='no-referrer';img.src=a.url;const button=B('Vote for '+(i===0?'A':'B'),()=>vote(i),'pb-btn pb-vote');button.disabled=true;img.onload=()=>{if(pair?.[i]?.id===a.id)button.disabled=false};if(img.complete&&img.naturalWidth)button.disabled=false;img.onerror=()=>{button.disabled=true;frame.append(E('span','pb-note','Photo unavailable'))};frame.append(img);card.append(E('span','pb-letter',i===0?'A':'B'),frame,E('small','pb-caption',describe(a)),button);grid.append(card)});body.append(grid,B('Skip battle',()=>{pair=null;render();void nextPair()},'pb-btn pb-skip'));
  }else{const empty=E('section','pb-empty');empty.append(E('h2','',preview?'Preview only':failed?'Library unavailable':loading?'Loading approved photos…':photos.length<2?'Two approved photos needed':'Preparing next matchup…'),E('p','pb-note',preview?'Sign in and install Photo Battle to vote on your private library.':photos.length<2?'Add approved, rights-confirmed, non-adult photographs to the Military Library.':'Only eligible photos are used.'));if(!loading&&photos.length>=2)empty.append(B('Try another matchup',()=>void nextPair()));body.append(empty)}
  const status=E('p','pb-status',saving||'Votes are personal and stored in this browser, not shared across accounts.');status.setAttribute('role','status');body.append(status)
 }
 render();void load();return {dispose(){closed=true;sequence++;pair=null;photos=[];host.replaceChildren()}};
}
