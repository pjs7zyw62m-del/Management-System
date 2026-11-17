/* BLACKCELL OMEGA: read-only, rules-based collection intelligence.
 * Does not infer people/identity, auto-publish, or purchase AI generations. */
export const WORLDS=Object.freeze([
 {id:'all',name:'UNIFORM WORLD',subtitle:'The complete archive',icon:'◈'},
 {id:'military',name:'MILITARY',subtitle:'Armed forces & service history',icon:'✦'},
 {id:'police',name:'LAW ENFORCEMENT',subtitle:'Police, sheriffs & patrol',icon:'⬡'},
 {id:'fire',name:'FIRE & RESCUE',subtitle:'Firefighters & emergency response',icon:'◆'},
 {id:'medical',name:'PARAMEDICS',subtitle:'EMS & medical response',icon:'✚'},
 {id:'security',name:'CORRECTIONS',subtitle:'Corrections & detention',icon:'▣'},
 {id:'professional',name:'AVIATION',subtitle:'Commercial pilots & flight crews',icon:'✈'}
]);
const rules=[
 ['security',/corrections?|correctional|detention|prison|jailer|jail officer|sheriff.?s? jail|brig staff|custodial officer/i],
 ['medical',/paramedic|emergency medical|\bems\b|ambulance|emt\b|medical responder|first responder medic/i],
 ['fire',/firefighter|fire department|fire house|firehouse|turnout gear|fire rescue|fire station/i],
 ['police',/law enforcement|police|sheriff|deputy|patrol|state trooper|constable|swat\b|policing|police academy/i],
 ['professional',/airline pilot|commercial pilot|cockpit|airline|flight attendant|flight crew|civilian aviation/i],
 ['military',/military|marines?|marine corps|army|armed forces|\bnavy\b|naval|\bair force\b|space force|coast guard|national guard|soldier|sailor|airman|airmen|military training|infantry|brigade|\busmc\b|\busaf\b|\busn\b/i]
];
export function eligibleOmegaAsset(a){
 return a&&a.review_status==='approved'&&a.rights_confirmed===true&&
  a.adult_restricted===false&&['photo','video'].includes(a.kind)&&
  ['post','library'].includes(a.purpose)&&
  !['movie','series','tv','television'].includes(String(a.video_category||'').trim().toLowerCase());
}
const text=a=>[a.military_category,a.military_branch,a.military_era,
 a.caption,a.filename,...(Array.isArray(a.military_tags)?a.military_tags:[])]
 .filter(Boolean).join(' ').toLowerCase();
export function assetWorld(a){
 const category=String(a?.military_category||'').trim().toLowerCase();
 const exact={police:'police',law_enforcement:'police',law:'police',
  fire:'fire',firefighter:'fire',medical:'medical',ems:'medical',paramedic:'medical',
  security:'security',corrections:'security',professional:'professional',aviation:'professional',
  military:'military',army:'military',marines:'military',navy:'military',airforce:'military'};
 if(exact[category])return exact[category];
 const words=text(a||{});
 for(const [id,pattern] of rules)if(pattern.test(words))return id;
 return 'all';
}
export const getWorld=(id)=>WORLDS.find(w=>w.id===id)||WORLDS[0];
export function buildWorldDesk(assets){
 const clean=(assets||[]).filter(eligibleOmegaAsset);
 return WORLDS.map(w=>{
  const list=w.id==='all'?clean:clean.filter(a=>assetWorld(a)===w.id);
  const photos=list.filter(a=>a.kind==='photo');
  const videos=list.filter(a=>a.kind==='video');
  const countries=new Set(list.map(a=>a.military_country_code).filter(Boolean));
  const eras=new Set(list.map(a=>a.military_era).filter(v=>v&&!/unspecified|unknown|unsorted/i.test(v)));
  return {...w,count:list.length,photos:photos.length,videos:videos.length,
   countries:countries.size,eras:eras.size,items:list};
 });
}
const newest=(a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0);
export function makeChannel(assets,world='all',mode='mix',affinity=()=>0){
 const items=(assets||[]).filter(a=>eligibleOmegaAsset(a)&&(world==='all'||assetWorld(a)===world));
 const filtered=mode==='photos'?items.filter(a=>a.kind==='photo'):mode==='videos'?items.filter(a=>a.kind==='video'):items;
 return [...filtered].sort((a,b)=>{
  const scoreA=Number(affinity(a))||0,scoreB=Number(affinity(b))||0;
  // Positive explicit interests lead; recent uploads break a tie.
  return scoreB-scoreA||newest(a,b);
 });
}
export function proposeMissions(assets,ownerPulse=null){
 const desks=buildWorldDesk(assets).filter(w=>w.id!=='all');
 const byCount=[...desks].sort((a,b)=>a.count-b.count||a.name.localeCompare(b.name));
 const sparse=byCount[0];
 const video=byCount.slice().sort((a,b)=>a.videos-b.videos||a.count-b.count)[0];
 const incomplete=assets.filter(a=>eligibleOmegaAsset(a)&&
  (!a.military_era||/unknown|unsorted|unspecified/i.test(a.military_era)||
   !a.military_country_code||!a.military_branch));
 const unverified=assets.filter(a=>a.review_status==='pending'&&a.rights_confirmed!==true).length;
 const missions=[
  {id:'gap',category:sparse?.name||'UNIFORM WORLD',title:'Expand an underrepresented world',
   action:sparse?'Research one verified and authorized '+sparse.name.toLowerCase()+
    ' photograph from a category not yet well covered.':'Start with a documented uniform photograph.',
   reason:sparse?sparse.count+' eligible media records currently indexed in this world.':'Start the archive with confirmed references.'},
  {id:'video',category:video?.name||'VIDEO INTELLIGENCE',title:'Strengthen the video archive',
   action:video?'Identify one licensed video featuring '+video.name.toLowerCase()+
    ' uniforms or equipment; avoid full movies and television.':'Find one permitted uniform-related video.',
   reason:video?video.videos+' eligible video records currently indexed in this world.':'No eligible footage is indexed yet.'},
  {id:'verify',category:'EVIDENCE & CLASSIFICATION',title:'Improve collection quality',
   action:incomplete.length?'Review historical era, country and branch metadata on one existing record.':
    'Verify one classification against an original source.',
   reason:incomplete.length+' approved records have at least one missing or uncertain classification field.'}
 ];
 if(unverified)missions.push({id:'rights',category:'PRIVATE INTAKE',title:'Resolve outstanding review',
  action:'Verify ownership, rights and adult-access requirements before publication. No AI label can replace permission.',
  reason:unverified+' pending records have no recorded rights confirmation.'});
 const summary=ownerPulse?.summary||{};
 const quota={photos:Math.max(0,Number(summary.photos_today)||0),videos:Math.max(0,Number(summary.videos_today)||0),
  uploaded14:Math.max(0,Number(summary.photos_14d)||0)+Math.max(0,Number(summary.videos_14d)||0)};
 return {missions,desks,quota};
}
export function safeCaseTitle(a){return String(a?.caption||a?.filename||'Uniform evidence').trim().slice(0,120)}
export function evidenceSummary(a){const parts=[a?.military_country_code,a?.military_branch,a?.military_era].filter(v=>Boolean(v)&&!/unknown|unsorted|unspecified/i.test(v));return parts.length?parts.join(' / '):'Classification needs review'}
