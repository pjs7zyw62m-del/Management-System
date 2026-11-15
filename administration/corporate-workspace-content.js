/* BLACKCELL Content Intelligence — verified metrics, optional paid AI ideas, owner idea board. */
export function setup(client,u){
 const {root,E,add,button,panel,metrics,toolbar,info,rpc,status,date}=u;
 const metric=metrics([
  ['catalog','CATALOG RECORDS','Connected catalog entries'],
  ['engagement','INTERACTIONS','Recorded likes, votes, ratings'],
  ['profiles','COMMUNITY PROFILES','Recorded member profiles'],
  ['ideas','SAVED IDEAS','Owner idea board']
 ]);
 const header=E('section','ci-hero');
 const copy=E('div');
 add(copy,E('h2','','Content Intelligence / Growth Lab'),
   E('p','','Discover content gaps, develop better browsing experiences, and turn AI suggestions into reviewed improvements. User retention data must be measured—not guessed.'));
 const quick=button('ANALYZE SITE CONTENT',()=>{activate('overview');void analyze()},'primary');
 add(header,copy,quick);root.append(header);
 const tabbar=E('div','ci-tabline');
 const pages=[
  {id:'overview',name:'Content Analysis'},
  {id:'generate',name:'AI Idea Generator'},
  {id:'library',name:'Idea Library'}
 ];
 const tabs={};
 for(const item of pages){
  const btn=button(item.name,()=>activate(item.id));btn.setAttribute('role','tab');
  btn.setAttribute('aria-controls','ci-'+item.id);tabbar.append(btn);tabs[item.id]=btn;
 }
 tabbar.setAttribute('role','tablist');root.append(tabbar);
 const sections={};
 for(const item of pages){
  const wrap=E('div','ci-tab-panel');wrap.id='ci-'+item.id;
  wrap.setAttribute('role','tabpanel');sections[item.id]=wrap;root.append(wrap);
 }
 function activate(id){
  for(const [key,section] of Object.entries(sections)){
   const active=key===id;section.hidden=!active;
   tabs[key].setAttribute('aria-selected',String(active));
  }
 }
 // Analysis view
 const overview=sections.overview;
 const analysisPanel=panel('Connected Site & Content Data',
  'Read-only owner-authorized summary. The current social engagement tables are the source of truth for these metrics.');
 const analysisControls=E('div','ci-inline'),check=button('⟳ REFRESH ANALYSIS',()=>{void analyze()},'primary');
 analysisControls.append(check);analysisPanel.append(analysisControls);
 const results=E('div');results.append(E('p','','Run Analyze Content to load recorded data.'));
 analysisPanel.append(results);overview.append(analysisPanel);
 const actionsPanel=panel('What to Improve Next',
  'Opportunities are identified from available aggregate signals and missing measurements. No fabricated conversion or retention scores.');
 const opportunities=E('div','ci-steps-list');
 opportunities.append(E('p','','No analysis has been run yet.'));
 actionsPanel.append(opportunities);overview.append(actionsPanel);
 const limitations=E('div','notice','Only connected social engagement tables and selected Supabase media buckets are included. Other Bunny and custom media catalogs might be stored separately. Returning visitor rates, session time and click-through funnels cannot be accurately calculated without dedicated consent-respecting instrumentation.');
 overview.append(limitations);
 let latest=null;
 async function analyze(){
  check.disabled=true;quick.disabled=true;status('Analyzing recorded site data…');
  try{
   const d=await rpc('corp_content_insights');
   latest=d;const m=d.metrics||{};
   metric.catalog.textContent=String(m.catalog_assets??'—');
   metric.engagement.textContent=String((m.likes||0)+(m.photo_votes||0)+(m.ratings||0)+(m.favorites||0));
   metric.profiles.textContent=String(m.community_profiles??'—');
   results.replaceChildren();
   const list=E('div','info-list');
   const stats=[
    ['Approved media records','Approved items in the connected social catalog',m.approved_assets??0],
    ['Pending media','Items waiting for catalog approval',m.pending_assets??0],
    ['Likes','Recorded post likes',m.likes??0],
    ['Photo votes','Recorded photo-voting interactions',m.photo_votes??0],
    ['Favorites','Recorded saved photos',m.favorites??0],
    ['Ratings','Recorded photograph rating actions',m.ratings??0],
    ['Rediscovery records','Recorded photo rediscovery entries, not necessarily distinct viewers',m.photo_view_records??0],
    ['AI visual discovery requests','Recorded assisted discovery requests',m.visual_discovery_requests??0],
    ['Albums','Albums in the connected social catalog',m.albums??0],
    ['Posts','Social posts in the connected database',m.posts??0]
   ];
   for(const [title,desc,n] of stats)list.append(info(title,desc,String(n)));
   results.append(list);
   const categories=Array.isArray(d.category_distribution)?d.category_distribution:[];
   results.append(E('h3','','Approved content by category'));
   if(!categories.length)results.append(E('div','ci-empty','No approved category records are available from this catalog. This does not mean all other BLACKCELL media libraries are empty.'));
   else {
    const chart=E('div','ci-chart'),max=Math.max(...categories.map(x=>Number(x.count)||0),1);
    for(const row of categories){
     const line=E('div','ci-chart-row'),bar=E('div','ci-bar'),fill=E('div','ci-bar-fill');
     fill.style.width=Math.max(2,Math.min(100,(Number(row.count)/max)*100))+'%';
     bar.append(fill);add(line,E('span','',row.category),bar,E('span','',String(row.count)));
     chart.append(line);
    }results.append(chart);
   }
   const totalActivity=(m.likes||0)+(m.photo_votes||0)+(m.ratings||0)+(m.favorites||0);
   opportunities.replaceChildren();
   const steps=[];
   if(!totalActivity)steps.push(['Measurement coverage','The engagement tables have no recorded likes, votes, favorites or ratings. Verify that website interactions are actually being stored before drawing conclusions about visitor preferences.']);
   if(!m.catalog_assets)steps.push(['Catalog connection','The social catalog contains no records in this dataset. Verify whether the approved Bunny/media collection feeds this social catalog or a separate source.']);
   if(!m.albums)steps.push(['Curated collections','Introduce useful category and uniform-type landing collections, and measure voluntary opens and saves.']);
   if(!m.visual_discovery_requests)steps.push(['Visual discovery','Make visually similar photo recommendations easy to find, then measure successful searches and image opens.']);
   if(!m.posts)steps.push(['Fresh editorial updates','Try an opt-in New Additions section and measure whether visitors return for new, relevant content.']);
   if(!steps.length)steps.push(['Measurement before scaling','Examine category performance, photo satisfaction and returning-visitor cohorts to decide which improvements deserve a test.']);
   for(const [title,text] of steps)opportunities.append(info(title,text,'OPPORTUNITY'));
   const inventory=Array.isArray(d.bucket_inventory)?d.bucket_inventory:[];
   if(inventory.length){
    const supply=E('div','ci-result-note');
    supply.textContent='Connected Supabase storage inventory: '+inventory.map(x=>x.bucket+' ('+x.count+' objects)').join(', ')+'. This is storage metadata, not verified published-photo counts.';
    results.append(supply);
   }
   status('Connected metrics refreshed at '+date(d.as_of)+'.','success');
  }catch(err){status('Analysis could not be completed: '+err.message,'error')}
  finally{check.disabled=false;quick.disabled=false}
 }
 // AI-generated content ideas; each request invokes a private server-side model.
 const gen=sections.generate;
 const generator=panel('AI Strategy Generator',
  'Choose a collection and an improvement goal. Generate four varied, actionable options grounded in available aggregate metrics. AI requests may incur API usage costs.');
 const form=E('div','ci-form'),focusField=E('label','','COLLECTION / CATEGORY'),
  goalField=E('label','','IMPROVEMENT GOAL'),
  noteField=E('label','wide','WHAT SHOULD THE AI CONSIDER? (OPTIONAL)');
 const focus=E('select'),goal=E('select'),notes=E('textarea');
 for(const x of ['All Collections','Military','Law Enforcement','Fire & Rescue','Emergency Medical','Corrections & Security','Professional Uniforms']){
  focus.append(new Option(x,x));
 }
 const goals=[
  'Better content quality','Improve image discovery','Encourage voluntary return visits',
  'Build useful collections','Improve mobile browsing','More meaningful engagement',
  'Community participation','New content ideas'
 ];
 for(const x of goals)goal.append(new Option(x,x));
 notes.placeholder='Example: visitors use iPhone; help them find distinct faces, uniforms, and accurate photo matches.';
 notes.maxLength=500;notes.rows=3;
 add(focusField,focus);add(goalField,goal);add(noteField,notes);
 add(form,focusField,goalField,noteField);generator.append(form);
 const controls=E('div','ci-inline'),generate=button('✧ GENERATE FOUR AI IDEAS',()=>{void generateIdeas()},'primary'),
  reload=button('VIEW SAVED IDEAS',()=>{activate('library');void loadBoard()});
 add(controls,generate,reload);generator.append(controls);
 const aiSummary=E('div','ci-result-note');
 aiSummary.textContent='Suggestions are created on demand; no AI ideas have been generated in this session.';
 generator.append(aiSummary);
 gen.append(generator);
 const ideasGrid=E('div','ci-ideas');gen.append(ideasGrid);
 gen.append(E('div','notice','The AI may produce plausible but untested concepts. Review each idea before approving or implementing it. This tool does not edit website code automatically or create misleading engagement metrics.'));
 async function generateIdeas(){
  generate.disabled=true;ideasGrid.replaceChildren();aiSummary.textContent='AI is analyzing the selected focus and writing options…';
  status('Sending an owner-authorized idea request to the private AI service…');
  try{
   const {data,error}=await client.functions.invoke('blackcell-content-advisor',{
    body:{focus:focus.value,goal:goal.value,note:notes.value.trim()}
   });
   if(error||!data||data.ok!==true)
    throw new Error(data?.detail||data?.reason||error?.message||'AI service returned no ideas.');
   aiSummary.textContent=(data.summary||'Ideas generated.')+'\n\nData quality: '+(data.data_quality||'Not assessed.');
   const ideas=Array.isArray(data.ideas)?data.ideas:[];
   if(!ideas.length)throw new Error('No usable ideas were returned');
   for(const idea of ideas)ideasGrid.append(buildIdea(idea,false));
   status(ideas.length+' AI-generated options are ready for review.','success');
  }catch(err){
   aiSummary.textContent='AI generation is unavailable: '+err.message+'. Existing approved ideas remain accessible in the library.';
   status('AI generation failed: '+err.message,'error');
  }finally{generate.disabled=false}
 }
 function buildIdea(idea,saved=false){
  const card=E('article','ci-idea');
  const title=String(idea.title||'Untitled idea'),desc=String(idea.rationale||''),steps=Array.isArray(idea.steps)?idea.steps:[];
  card.append(E('small','',String(idea.area||'All Collections')+(saved?' · SAVED':' · AI OPTION')));
  card.append(E('h3','',title),E('p','',desc));
  if(steps.length){
   const ul=E('ul');for(const step of steps)ul.append(E('li','',String(step)));
   card.append(ul);
  }
  const footer=E('div','ci-footer'),meta=E('div','ci-meta');
  add(meta,E('span','','EFFORT: '+String(idea.effort||'medium').toUpperCase()),
    E('span','',saved?'OWNER LIBRARY':String(idea.confidence||'hypothesis').toUpperCase()));
  footer.append(meta);
  footer.append(E('div','ci-metric','Success measure: '+String(idea.success_metric||'Define a meaningful measure before testing')));
  const actions=E('div','ci-actionbar');
  if(!saved){
   const save=button('SAVE IDEA',async()=>{
    save.disabled=true;status('Saving idea to your protected library…');
    try{
     await rpc('corp_content_idea_board',{p_action:'add',p_idea:{
      title,area:idea.area||'All Collections',rationale:desc,steps,
      success_metric:idea.success_metric||'',effort:idea.effort||'medium',source:'ai'
     }});
     save.textContent='SAVED TO LIBRARY';status('Idea saved.','success');void loadBoard(false);
    }catch(err){save.disabled=false;status('Save failed: '+err.message,'error')}
   },'primary');actions.append(save);
  }else{
   const select=E('select');
   for(const x of ['proposed','approved','testing','live','archived'])select.append(new Option(x[0].toUpperCase()+x.slice(1),x));
   select.value=idea.status||'proposed';
   select.setAttribute('aria-label','Idea status');
   select.addEventListener('change',async()=>{
    select.disabled=true;
    try{await rpc('corp_content_idea_board',{p_action:'set_status',p_id:idea.id,p_idea:{status:select.value}});
      status('Idea status updated to '+select.value+'.','success');
    }catch(err){select.value=idea.status;status('Status update failed: '+err.message,'error')}
    finally{select.disabled=false}
   });
   const remove=button('DELETE',async()=>{
    if(!confirm('Delete this saved idea permanently?'))return;
    remove.disabled=true;
    try{await rpc('corp_content_idea_board',{p_action:'delete',p_id:idea.id});
      card.remove();status('Saved idea deleted.','success');void loadBoard(false);
    }catch(err){remove.disabled=false;status('Delete failed: '+err.message,'error')}
   },'danger');
   actions.append(select,remove);
  }
  footer.append(actions);card.append(footer);return card;
 }
 // Saved owner idea board.
 const lib=sections.library;
 const libraryPanel=panel('Saved Idea Library',
  'Track options from proposed → approved → testing → live. You control the status; ideas are not automatically deployed.');
 const boardTools=E('div','ci-inline'),refresh=button('⟳ REFRESH IDEA BOARD',()=>{void loadBoard()},'primary'),
  openGen=button('GENERATE MORE IDEAS',()=>{activate('generate')});
 add(boardTools,refresh,openGen);libraryPanel.append(boardTools);
 lib.append(libraryPanel);
 const boardGrid=E('div','ci-ideas');lib.append(boardGrid);
 const manualPanel=panel('Add Your Own Content Idea','Keep your own concepts alongside the AI-generated options.');
 const manualForm=E('div','ci-form'),titleLabel=E('label','','IDEA TITLE'),
  areaLabel=E('label','','COLLECTION'),
  reasonLabel=E('label','wide','WHAT SHOULD CHANGE?'),
  metricLabel=E('label','wide','HOW WILL YOU KNOW IT WORKED?');
 const manualTitle=E('input');manualTitle.type='text';manualTitle.maxLength=170;manualTitle.placeholder='Example: Improve law enforcement collection';
 const manualArea=E('select');
 for(const x of ['All Collections','Military','Law Enforcement','Fire & Rescue','Emergency Medical','Corrections & Security','Professional Uniforms'])manualArea.append(new Option(x,x));
 const manualReason=E('textarea');manualReason.maxLength=1500;manualReason.rows=3;manualReason.placeholder='What is the problem and what would the improvement look like?';
 const manualMetric=E('input');manualMetric.type='text';manualMetric.maxLength=230;manualMetric.placeholder='Example: More visitors saving a photo';
 add(titleLabel,manualTitle);add(areaLabel,manualArea);add(reasonLabel,manualReason);add(metricLabel,manualMetric);
 add(manualForm,titleLabel,areaLabel,reasonLabel,metricLabel);manualPanel.append(manualForm);
 const manualSave=button('＋ SAVE MANUAL IDEA',async()=>{
  if(manualTitle.value.trim().length<5||manualReason.value.trim().length<5){
   status('Enter a useful title and explanation before saving.','error');return;
  }
  manualSave.disabled=true;
  try{
   await rpc('corp_content_idea_board',{p_action:'add',p_idea:{
    title:manualTitle.value.trim(),area:manualArea.value,rationale:manualReason.value.trim(),
    success_metric:manualMetric.value.trim(),steps:[],effort:'medium',source:'manual'
   }});
   manualTitle.value='';manualReason.value='';manualMetric.value='';
   status('Manual idea saved.','success');void loadBoard();
  }catch(err){status('Could not save: '+err.message,'error')}
  finally{manualSave.disabled=false}
 },'primary');
 manualPanel.append(manualSave);lib.append(manualPanel);
 async function loadBoard(showStatus=true){
  refresh.disabled=true;
  try{
   const d=await rpc('corp_content_idea_board',{p_action:'list'});
   const list=d.items||[];metric.ideas.textContent=String(list.length);
   boardGrid.replaceChildren();
   if(!list.length)boardGrid.append(E('div','ci-empty','No saved ideas yet. Generate AI suggestions or add a concept of your own.'));
   for(const idea of list)boardGrid.append(buildIdea(idea,true));
   if(showStatus)status('Loaded '+list.length+' saved idea(s).','success');
  }catch(err){
   if(showStatus)status('Idea board unavailable: '+err.message,'error');
  }finally{refresh.disabled=false}
 }
 activate('overview');
 // Only load saved idea count. Do not trigger a paid AI request or a behavioral report automatically.
 void loadBoard(false);
}
