/* BLACKCELL / WORLD FORCES EXPLORER
   Uses only authenticated Blackcell archive media and owner-scoped preferences.
   No third-party recommendation service, no cross-member preference exposure. */
export function createWorldForces({client,state,meta,toast,archiveAssets,mediaUrl,openViewer,render}){
 const $=id=>document.getElementById(id);
 const codes=[...new Set(('US CN GB CA AU FR DE IN JP KR BR RU UA IT ES MX ZA EG NG KE TR IL PK ID PH TH VN NZ SE NO FI DK NL BE PL CZ GR RO CH AT SG MY AR CL CO PE AE SA QA JO IQ IR AF BD LK NP MM KH LA TW KP MN KZ UZ GE AM AZ LT LV EE RS HR SI SK HU BG PT IE IS MA DZ TN LY ET GH CM CI SN UG TZ RW ZW ZM AO MZ NA BW MW MG CD CG GA GQ SO SD SS YE OM KW BH CY MT LU AL BA ME MK MD BY AD AE AG AI AO AQ AS AW AX BB BF BI BJ BL BM BN BO BQ BS BT BV BZ CC CD CF CG CI CK CL CM CO CR CU CV CW CX CY DJ DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO GA GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT ID IE IM IO IS JE JM JO KE KG KH KI KM KN KP KW KY KZ LA LB LC LI LR LS LT LU LV LY MA MC MD ME MF MG MH ML MM MO MP MQ MR MS MT MU MV MX MY MZ NC NE NF NG NI NL NO NP NR NU OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UG UM UY UZ VA VC VE VG VI VU WF WS YT ZA ZM ZW').split(/\s+/))];
 const preferred=['US','CN','GB','CA','AU','FR','DE','IN','JP','KR','BR','RU','UA'];
 const countryList=[...preferred,...codes.filter(c=>!preferred.includes(c))];
 const names=typeof Intl.DisplayNames==='function'?new Intl.DisplayNames(['en'],{type:'region'}):null;
 const name=c=>c?(names?.of(c)||({US:'United States',CN:'China',GB:'United Kingdom'}[c])||c):'Unclassified';
 const flag=c=>/^[A-Z]{2}$/.test(c)?String.fromCodePoint(...[...c].map(v=>v.charCodeAt(0)+127397)):'🌐';
 const ownId=()=>state.user?.id;
 const country=a=>String(a?.military_country_code||'').toUpperCase();
 const branch=a=>String(a?.military_branch||'Unspecified');
 const category=a=>String(a?.military_category||'Unsorted');
 const branchType=a=>{
  const b=branch(a).toLowerCase();
  if(/marine|naval infantry|amphibious/.test(b))return 'Marines';
  if(/special|commando|elite/.test(b))return 'Special Operations';
  if(/air force|airborne|aviation/.test(b))return 'Air Force';
  if(/navy|naval|coast guard/.test(b))return 'Navy';
  if(/army|ground|national guard/.test(b))return 'Army';
  return 'Other';
 };
 const matchBranch=(a,b)=>b==='All'||branchType(a)===b;
 const matchFocus=(a,f)=>{
  if(f==='All')return true;
  const t=[category(a),a.caption,a.filename,...(a.military_tags||[])].filter(Boolean).join(' ').toLowerCase();
  if(f==='Dress')return category(a)==='Uniforms'||/dress|formal|ceremonial|parade/.test(t);
  if(f==='Portraits')return category(a)==='Personnel'||/portrait/.test(t);
  if(f==='Training')return category(a)==='Training'||/training|fitness|drill|exercise/.test(t);
  if(f==='Operations')return category(a)==='Operations'||/battle|operation|deployment/.test(t);
  if(f==='Tactical')return /tactical|combat|field uniform|battle dress/.test(t);
  return true;
 };
 const make=(tag,cls='',val)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(val!==undefined)n.textContent=String(val);return n};
 const button=(cls,txt,fn)=>{const n=make('button',cls,txt);n.type='button';n.addEventListener('click',fn);return n};
 const status=txt=>{if($('wfStatus'))$('wfStatus').textContent=txt};
 const gotoGallery=()=>{$('applePhotosGallery')?.scrollIntoView({behavior:'smooth',block:'start'})};
 const avail=()=>archiveAssets(); // Supabase RLS has already filtered this list to authorized members.
 let countries=[],wantedBranch='All',wantedFocus='All';
 let savedCountries=[],savedBranch='All',savedFocus='All';
 let active=false,filterReady=false;
 const favAssets=()=>{const own=ownId();const fav=new Set(meta.favorites.filter(x=>x.user_id===own).map(x=>x.asset_id));return avail().filter(x=>fav.has(x.id))};
 const favSet=()=>new Set(meta.favorites.filter(x=>x.user_id===ownId()).map(x=>x.asset_id));
 const applyFilter=arr=>active?arr.filter(a=>(!countries.length||countries.includes(country(a)))&&matchBranch(a,wantedBranch)&&matchFocus(a,wantedFocus)):arr;
 function rank(assets){
  const favs=favAssets(),isFav=favSet(),types=new Map(),regions=new Map(),subjects=new Map();
  for(const a of favs){
   types.set(branchType(a),(types.get(branchType(a))||0)+1);
   if(country(a))regions.set(country(a),(regions.get(country(a))||0)+1);
   subjects.set(category(a),(subjects.get(category(a))||0)+1);
  }
  const score=a=>(savedCountries.includes(country(a))?22:0)
   +(savedBranch!=='All'&&matchBranch(a,savedBranch)?15:0)
   +(savedFocus!=='All'&&matchFocus(a,savedFocus)?10:0)
   +(regions.get(country(a))||0)*4+(types.get(branchType(a))||0)*3
   +(subjects.get(category(a))||0)*3+(isFav.has(a.id)?6:0);
  return [...assets].sort((a,b)=>score(b)-score(a)||Date.parse(b.created_at)-Date.parse(a.created_at));
 }
 function refreshChips(){
  const root=$('wfCountries');if(!root)return;
  const query=$('wfCountrySearch').value.trim().toLowerCase();
  const list=[...new Set([...countries,...countryList])].filter(c=>!query||name(c).toLowerCase().includes(query)||c.toLowerCase().includes(query));
  root.replaceChildren();
  if(!list.length)root.append(make('p','wf-empty','No countries match this search.'));
  for(const c of list){
   const on=countries.includes(c);
   const n=button('wf-country','',()=>{
    countries=on?countries.filter(x=>x!==c):[...countries,c];refreshChips();
   });
   n.setAttribute('aria-pressed',String(on));n.setAttribute('aria-label',name(c)+(on?' selected':' not selected'));
   n.append(make('span','wf-flag',flag(c)),make('span','',name(c)));
   if(on)n.append(make('span','wf-tick','✓'));
   root.append(n);
  }
  $('wfCountryCount').textContent=countries.length?countries.length+' selected':'All countries';
 }
 const viewViewer=(items,a)=>{const index=items.findIndex(x=>x.id===a.id);void openViewer(items,Math.max(index,0))};
 function renderSpotlight(){
  const root=$('wfSpotlightGrid');if(!root)return;
  const list=applyFilter([...avail()].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))).slice(0,3);
  root.replaceChildren();
  if(!list.length){
   const e=make('div','wf-empty');e.append(make('strong','',active?'No matching media yet':'No military media uploaded yet'),
   make('span','','Classify uploaded images with a country and branch. Previously uploaded media is still accessible in your regular library.'));root.append(e);return;
  }
  list.forEach((a,i)=>{
   const b=button('wf-spotlight','',()=>viewViewer(list,a));
   const url=mediaUrl(a);
   if(a.kind==='photo'&&url){const img=make('img','wf-photo');img.src=url;img.alt=a.caption||a.filename;img.loading='lazy';b.append(img)}
   const content=make('span','wf-spotlight-content');
   content.append(make('span','wf-num',('0'+(i+1)).slice(-2)+' / '+(a.kind==='video'?'VIDEO':'PHOTO')),
     make('strong','',flag(country(a))+' '+(country(a)?name(country(a)):'Worldwide Military')),
     make('small','',category(a)+' · '+branch(a)));
   b.append(content);root.append(b);
  });
 }
 function renderPersonal(){
  const root=$('wfForYouGrid');if(!root)return;
  const list=rank(avail()).slice(0,8);root.replaceChildren();
  if(!list.length){
   const e=make('div','wf-empty');e.append(make('strong','','Your personalized gallery begins with your first upload'),
     make('span','','Save the military forces you like and favorite photographs. Matching media will appear here.'));root.append(e);return;
  }
  for(const a of list){
   const tile=make('article','wf-personal-tile');
   const btn=button('wf-personal-open','',()=>viewViewer(list,a));
   const src=mediaUrl(a);
   if(a.kind==='photo'&&src){const img=make('img');img.src=src;img.alt=a.caption||a.filename;img.loading='lazy';btn.append(img)}
   else btn.append(make('span','wf-play',a.kind==='video'?'▶':'▧'));
   const line=make('div','wf-personal-info'),desc=make('div');
   desc.style.minWidth='0';
   desc.append(make('strong','',flag(country(a))+' '+(country(a)?name(country(a)):'Worldwide')),
     make('small','',branch(a)+' · '+category(a)));
   const more=button('wf-more','↗',()=>{
    countries=country(a)?[country(a)]:[];
    wantedBranch=branchType(a);wantedFocus='All';
    $('wfBranch').value=wantedBranch;$('wfFocus').value='All';
    refreshChips();apply();
   });more.title='Show more like this';more.setAttribute('aria-label','Show more like this');
   line.append(desc,more);tile.append(btn,line);root.append(tile);
  }
 }
 function renderWorld(){refreshChips();renderSpotlight();renderPersonal()}
 function clearExistingFilters(){
  meta.activeAlbum=null;meta.category='';meta.branch='';meta.era='';meta.query='';
  $('militaryFilterCategory').value='';$('militaryFilterBranch').value='';$('militaryFilterEra').value='';$('photosSearch').value='';
 }
 function apply(){
  active=true;clearExistingFilters();meta.scope='network';meta.filter='all';render();
  const matches=applyFilter(avail()).length;
  status(matches+' authorized media item'+(matches===1?'':'s')+' match. '+(matches?'Open the gallery below or choose a featured photograph.':'Try another country or classify your uploads.'));
  gotoGallery();
 }
 async function save(){
  const b=$('wfSave');b.disabled=true;b.textContent='SAVING…';
  try{
   const record={user_id:ownId(),countries:countries.slice(0,30),military_branch:wantedBranch,focus:wantedFocus,updated_at:new Date().toISOString()};
   const {error}=await client.from('corp_social_discovery_preferences').upsert(record,{onConflict:'user_id'});
   if(error)throw error;
   savedCountries=[...record.countries];savedBranch=record.military_branch;savedFocus=record.focus;
   renderPersonal();status('Your interests are saved privately to your Blackcell account. For You now prioritizes these forces.');
  }catch(e){status('Could not save preferences: '+(e.message||'Network error'));toast('Could not save World Forces interests.')}
  finally{b.disabled=false;b.textContent='♡ SAVE MY INTERESTS'}
 }
 async function load(){
  if(!ownId())return;
  const {data,error}=await client.from('corp_social_discovery_preferences')
    .select('countries,military_branch,focus').eq('user_id',ownId()).maybeSingle();
  if(error){console.warn('World Forces preferences not available:',error.message);return}
  if(data){
   savedCountries=Array.isArray(data.countries)?data.countries.filter(x=>/^[A-Z]{2}$/.test(x)):[];
   savedBranch=String(data.military_branch||'All');savedFocus=String(data.focus||'All');
   countries=[...savedCountries];wantedBranch=savedBranch;wantedFocus=savedFocus;
   if($('wfBranch'))$('wfBranch').value=wantedBranch;
   if($('wfFocus'))$('wfFocus').value=wantedFocus;
   refreshChips();
  }
 }
 function countryOptions(){
  for(const id of ['militaryUploadCountry','appleAlbumCountry','militaryAssetCountry']){
   const s=$(id);if(!s)continue;
   s.replaceChildren(new Option('Not specified',''));
   for(const c of countryList)s.add(new Option(flag(c)+' '+name(c),c));
  }
 }
 function setup(){
  countryOptions();
  if(!$('wfExplorer'))return;
  $('wfCountrySearch').addEventListener('input',refreshChips);
  $('wfBranch').addEventListener('change',e=>{wantedBranch=e.target.value});
  $('wfFocus').addEventListener('change',e=>{wantedFocus=e.target.value});
  $('wfExplore').addEventListener('click',apply);
  $('wfSave').addEventListener('click',()=>void save());
  $('wfMarinesCombo').addEventListener('click',()=>{
   countries=['US','CN'];wantedBranch='Marines';wantedFocus='All';
   $('wfBranch').value='Marines';$('wfFocus').value='All';refreshChips();apply();
  });
  $('wfShowAll').addEventListener('click',()=>{
   active=false;clearExistingFilters();meta.scope='network';meta.filter='for-you';render();gotoGallery();
  });
  $('wfReset').addEventListener('click',()=>{
   countries=[];wantedBranch='All';wantedFocus='All';active=false;
   $('wfCountrySearch').value='';$('wfBranch').value='All';$('wfFocus').value='All';
   clearExistingFilters();meta.filter='all';render();status('Filters cleared. Saved interests stay in your For You gallery.');
  });
  $('wfSurprise').addEventListener('click',()=>{
   const list=applyFilter(avail());
   if(!list.length){status('No matching media to surprise you with yet.');return}
   viewViewer(list,list[Math.floor(Math.random()*list.length)]);
  });
  refreshChips();
 }
 return {setup,load,renderWorld,applyFilter,rank,active:()=>active,deactivate:()=>{active=false},countryName:name};
}
