/* BLACKCELL / Level 7 Costs and Revenue Planner.
   Estimates only; owner access verified by corporate-workspace-auth.js.
   All figures are editable and stored only in this browser on explicit save. */
const KEY='blackcell:cost-revenue:owner:v1';
const defaults={
 photoGB:1024,photoRegions:1,photoRate:.01,videoGB:500,videoRegions:1,videoRate:.01,
 watchGB:200,watchRate:.005,cdnGB:0,cdnRate:.01,
 supabase:0,cloudflare:0,ai:0,otherCost:0,reserve:10,budget:30,
 supporters:0,supporterPrice:5,premium:0,premiumPrice:10,otherRevenue:0,feePct:2.9,feeFixed:.30,
 actualCost:'',actualIncome:''
};
const presets={
 private:{...defaults},
 growing:{...defaults,photoGB:1500,videoGB:1200,watchGB:1500,supabase:25,ai:10,supporters:10,premium:2,budget:75},
 high:{...defaults,photoGB:3000,videoGB:4000,watchGB:15000,supabase:25,cloudflare:5,ai:25,supporters:40,premium:10,budget:180}
};
const items=[
 ['photoGB','Photo storage (GB)',1],['photoRegions','Photo regions',1],['photoRate','Photo cost ($/GB/region)',.001],
 ['videoGB','Stream processed movies (GB)',1],['videoRegions','Stream regions',1],['videoRate','Stream storage ($/GB/region)',.001],
 ['watchGB','Monthly movie views (GB)',1],['watchRate','Video delivery ($/GB)',.001],
 ['cdnGB','Other CDN bandwidth (GB)',1],['cdnRate','Other CDN cost ($/GB)',.001],
 ['supabase','Supabase plan ($)',.01],['cloudflare','Cloudflare / hosting ($)',.01],
 ['ai','Manual AI poster budget ($)',.01],['otherCost','Other monthly services ($)',.01],
 ['reserve','Cost contingency reserve (%)',1],['budget','Monthly budget goal ($)',1],
 ['supporters','Supporter members',1],['supporterPrice','Supporter price ($)',.01],
 ['premium','Premium members',1],['premiumPrice','Premium price ($)',.01],
 ['otherRevenue','Other net revenue ($)',.01],
 ['feePct','Processing fee (%)',.01],['feeFixed','Processing fee per payment ($)',.01]
];
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number.isFinite(n)?n:0);
const get=id=>document.getElementById(id);
function clamp(v,max=100000000){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(0,n)):0}
function calc(x){
 // Bunny Standard HDD: first 2 regions $0.01 per GB each; further regions half-price.
 const regions=x.photoRegions<=2?x.photoRegions:2+(x.photoRegions-2)*.5;
 const photo=x.photoGB*x.photoRate*regions;
 // Video replication uses simplified per-region assumption; actual tier may vary.
 const video=x.videoGB*x.videoRate*x.videoRegions;
 const watch=x.watchGB*x.watchRate,cdn=x.cdnGB*x.cdnRate;
 const bunnyMinimum=(photo+video+watch+cdn)>0&&photo+video+watch+cdn<1?1-(photo+video+watch+cdn):0;
 const extras=x.supabase+x.cloudflare+x.ai+x.otherCost;
 const base=photo+video+watch+cdn+bunnyMinimum+extras;
 const cushion=base*x.reserve/100,total=base+cushion;
 const regular=x.supporters*x.supporterPrice+x.premium*x.premiumPrice;
 const fees=x.supporters*(x.supporterPrice*x.feePct/100+x.feeFixed)+x.premium*(x.premiumPrice*x.feePct/100+x.feeFixed);
 const gross=regular+x.otherRevenue,net=gross-fees,balance=net-total;
 const premiumNet=x.premium*(x.premiumPrice*(1-x.feePct/100)-x.feeFixed);
 const perSupporter=x.supporterPrice*(1-x.feePct/100)-x.feeFixed;
 const breakeven=perSupporter>0?Math.ceil(Math.max(0,(total-premiumNet-x.otherRevenue)/perSupporter)):null;
 return {photo,video,watch,cdn,bunnyMinimum,extras,base,cushion,total,gross,fees,net,balance,breakeven,
  costs:[['Photo storage',photo],['Processed movie storage',video],['Movie playback traffic',watch],
   ['Other CDN',cdn],['Bunny minimum',bunnyMinimum],['Supabase',x.supabase],
   ['Cloudflare',x.cloudflare],['Manual AI allowance',x.ai],['Other services',x.otherCost]]
 };
}
function field(name){
 const entry=items.find(x=>x[0]===name),limit=name.endsWith('Regions')?'9':'100000000';
 const lower=name.endsWith('Regions')?'1':'0';
 return '<label class="bc-c-field"><span>'+entry[1]+'</span><input data-field="'+name+'" type="number" inputmode="decimal" step="'+entry[2]+'" min="'+lower+'" max="'+limit+'" value="'+defaults[name]+'"></label>';
}
function fields(names){return names.map(field).join('')}
function html(){
 return [
 '<section class="bc-c-presets"><div><b>FORECAST SCENARIO</b><small>Editable planning assumptions · US dollars per month</small></div><div class="bc-c-presets-actions">',
 '<button type="button" data-preset="private" class="active">PRIVATE · 4 PEOPLE</button>',
 '<button type="button" data-preset="growing">GROWING NETWORK</button>',
 '<button type="button" data-preset="high">HIGH USAGE</button></div></section>',
 '<section class="bc-c-metrics" aria-label="Monthly financial forecast">',
 '<article><span>ESTIMATED MONTHLY COST</span><strong id="cTotal">—</strong><small>Includes contingency reserve</small></article>',
 '<article><span>PROJECTED NET REVENUE</span><strong id="cRevenue">—</strong><small>After estimated processing fees</small></article>',
 '<article><span>PROJECTED MONTHLY BALANCE</span><strong id="cBalance">—</strong><small id="cBalanceNote">No payments collected here</small></article>',
 '<article><span>PROJECTED ANNUAL BALANCE</span><strong id="cAnnual">—</strong><small>Same month × 12, not a growth forecast</small></article>',
 '</section>',
 '<div class="bc-c-columns">',
 '<section class="bc-c-panel"><header class="bc-c-panel-title"><span>01 / INFRASTRUCTURE</span><h2>Operating expenses</h2><p>Plan around stored photo size, <em>encoded</em> video size and playback traffic. Actual invoices may vary.</p></header>',
 '<div class="bc-c-inside"><h3>BUNNY STORAGE & STREAM</h3><div class="bc-c-fields">',
 fields(['photoGB','photoRegions','photoRate','videoGB','videoRegions','videoRate','watchGB','watchRate','cdnGB','cdnRate']),
 '</div><h3>OTHER SERVICES</h3><div class="bc-c-fields">',
 fields(['supabase','cloudflare','ai','otherCost','reserve','budget']),
 '</div></div></section>',
 '<section class="bc-c-panel"><header class="bc-c-panel-title"><span>02 / OPTIONAL EARNINGS</span><h2>Revenue projections</h2><p>Supporter and Premium memberships are hypothetical. Four private viewers do not imply paying members.</p></header>',
 '<div class="bc-c-inside"><h3>MEMBERSHIP SCENARIOS</h3><div class="bc-c-fields">',
 fields(['supporters','supporterPrice','premium','premiumPrice','otherRevenue']),
 '</div><h3>PAYMENT PROCESSING</h3><div class="bc-c-fields">',
 fields(['feePct','feeFixed']),
 '</div><div class="bc-c-breakeven"><span>ADDITIONAL SUPPORTERS TO BREAK EVEN</span>',
 '<strong id="cBreakEven">—</strong><small id="cBreakEvenDetail">Based on estimated contribution after payment fees.</small></div></div></section>',
 '</div>',
 '<div class="bc-c-columns bc-c-secondary">',
 '<section class="bc-c-panel"><header class="bc-c-panel-title"><span>03 / COST ALLOCATION</span><h2>Monthly breakdown</h2><p>Detailed costs and estimated fees. This is not live usage data.</p></header>',
 '<div class="bc-c-inside"><div id="cBreakdown" class="bc-c-breakdown"></div><div class="bc-c-totals">',
 '<div><span>Base operating estimate</span><b id="cBase">—</b></div>',
 '<div><span>Contingency reserve</span><b id="cReserve">—</b></div>',
 '<div class="emphasis"><span>Estimated monthly costs</span><b id="cGrand">—</b></div>',
 '<div><span>Gross projected revenue</span><b id="cGross">—</b></div>',
 '<div><span>Payment processing</span><b id="cFees">—</b></div>',
 '<div class="emphasis"><span>Net projected revenue</span><b id="cNet">—</b></div>',
 '</div></div></section>',
 '<section class="bc-c-panel"><header class="bc-c-panel-title"><span>04 / BUDGET CONTROL</span><h2>Spending target</h2><p>Compare your estimate with the amount you want to allow per month.</p></header>',
 '<div class="bc-c-inside"><div class="bc-c-budget"><div class="bc-c-budget-head"><b id="cBudgetLine">—</b><span id="cBudgetGap">—</span></div>',
 '<div id="cBudgetMeter" class="bc-c-meter" role="meter" aria-label="Cost estimate relative to budget" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="cBudgetFill"></span></div>',
 '<p id="cBudgetMessage"></p></div>',
 '<details class="bc-c-actual"><summary>ACTUAL BILL COMPARISON (OPTIONAL)</summary>',
 '<p>Enter figures manually. Blank means unknown—not $0. No vendor billing account is connected.</p>',
 '<div class="bc-c-fields"><label class="bc-c-field"><span>Actual expenses this month ($)</span><input type="number" min="0" step=".01" id="cActualCost" placeholder="Not entered"></label>',
 '<label class="bc-c-field"><span>Actual revenue received ($)</span><input type="number" min="0" step=".01" id="cActualIncome" placeholder="Not entered"></label></div>',
 '<p id="cActualResult" role="status"></p></details>',
 '<div class="bc-c-references"><b>PRICE ASSUMPTIONS & SOURCES</b>',
 '<a href="https://bunny.net/pricing/storage/" rel="noopener noreferrer" target="_blank">Bunny Storage rates ↗</a>',
 '<a href="https://bunny.net/pricing/stream/" rel="noopener noreferrer" target="_blank">Bunny Stream rates ↗</a>',
 '<a href="https://stripe.com/pricing" rel="noopener noreferrer" target="_blank">Card processing rates ↗</a>',
 '<p>Published starting rates; change inputs to match your regions, plan and traffic tier. Bunny minimum modeled where applicable. Tax, premium processing, extra encoded copies and undisclosed service fees may increase actual bills.</p>',
 '</div></div></section>',
 '</div>',
 '<div class="bc-c-actions"><span id="cStatus" role="status">No payment is collected, billed or initiated by this page.</span>',
 '<div><button type="button" id="cReset">RESET</button><button type="button" id="cExport">EXPORT CSV</button>',
 '<button type="button" id="cSave" class="bc-c-primary">SAVE IN THIS BROWSER</button></div></div>'
 ].join('');
}
function makeBar(label,value,total){
 const row=document.createElement('div');row.className='bc-c-cost-row';
 const top=document.createElement('div');const name=document.createElement('span'),amount=document.createElement('b');
 name.textContent=label;amount.textContent=money(value);top.append(name,amount);
 const track=document.createElement('div');track.className='bc-c-cost-track';
 const fill=document.createElement('span');fill.style.width=(total?Math.max(0,Math.min(100,value/total*100)):0)+'%';
 track.append(fill);row.append(top,track);return row;
}
export async function setup(client,ui){
 // No provider API or financial records are accessed. The caller is already
 // authenticated at verified Level 7 in the shared workspace authorization.
 ui.root.innerHTML=html();
 const form=[...ui.root.querySelectorAll('[data-field]')];
 const read=()=>{
  const x={...defaults};
  for(const node of form){
   const key=node.dataset.field;
   x[key]=clamp(node.value,key.endsWith('Regions')?9:100000000);
   if(key.endsWith('Regions'))x[key]=Math.max(1,Math.round(x[key]));
   if(['supporters','premium'].includes(key))x[key]=Math.round(x[key]);
  }
  x.actualCost=get('cActualCost').value;
  x.actualIncome=get('cActualIncome').value;
  return x;
 };
 const write=x=>{
  for(const node of form)node.value=x[node.dataset.field]??defaults[node.dataset.field];
  get('cActualCost').value=x.actualCost??'';
  get('cActualIncome').value=x.actualIncome??'';
  update();
 };
 const setStatus=(message,state='')=>{
  get('cStatus').textContent=message;
  get('cStatus').dataset.state=state;
 };
 const activate=name=>{
  for(const button of ui.root.querySelectorAll('[data-preset]')){
   button.classList.toggle('active',button.dataset.preset===name);
  }
 };
 function update(){
  const x=read(),m=calc(x);
  get('cTotal').textContent=money(m.total);
  get('cRevenue').textContent=money(m.net);
  get('cBalance').textContent=money(m.balance);
  get('cAnnual').textContent=money(m.balance*12);
  get('cBalanceNote').textContent=m.balance>=0?'Projected monthly surplus':'Projected monthly funding gap';
  get('cBalance').dataset.state=m.balance>=0?'positive':'negative';
  get('cAnnual').dataset.state=m.balance>=0?'positive':'negative';
  get('cBreakEven').textContent=m.breakeven===null?'—':String(m.breakeven);
  get('cBreakEvenDetail').textContent=m.breakeven===null?
   'Choose a supporter price higher than payment fees to calculate this.':
   'Additional supporters at the chosen price, assuming other projected income arrives.';
  const box=get('cBreakdown');box.replaceChildren();
  for(const [label,value] of m.costs)if(value>0)box.append(makeBar(label,value,m.base));
  if(!box.children.length){const p=document.createElement('p');p.textContent='Enter expenses to see the breakdown.';box.append(p)}
  for(const [id,value] of [['cBase',m.base],['cReserve',m.cushion],['cGrand',m.total],
    ['cGross',m.gross],['cFees',m.fees],['cNet',m.net]])get(id).textContent=money(value);
  const pct=x.budget>0?m.total/x.budget*100:100;
  get('cBudgetFill').style.width=Math.max(0,Math.min(100,pct))+'%';
  get('cBudgetFill').dataset.state=x.budget>0&&m.total>x.budget?'over':'normal';
  get('cBudgetMeter').setAttribute('aria-valuenow',String(Math.round(Math.max(0,Math.min(100,pct)))));
  get('cBudgetLine').textContent=money(m.total)+' / '+money(x.budget);
  get('cBudgetGap').textContent=m.total>x.budget?money(m.total-x.budget)+' over budget':money(x.budget-m.total)+' available';
  get('cBudgetGap').dataset.state=m.total>x.budget?'negative':'positive';
  get('cBudgetMessage').textContent=x.budget===0?
   'Enter a budget target above zero to measure your spending.':
   m.total>x.budget?'Your projection is above your budget. Review storage, traffic and paid services.':
   'Your projected spending is within the selected monthly target.';
  const ac=x.actualCost.trim()===''?null:clamp(x.actualCost);
  const ar=x.actualIncome.trim()===''?null:clamp(x.actualIncome);
  get('cActualResult').textContent=ac===null&&ar===null?'No actual bills or receipts entered.':
   'Actual expenses: '+(ac===null?'not entered':money(ac))+' · Actual revenue: '+
   (ar===null?'not entered':money(ar))+(ac!==null&&ar!==null?' · Actual balance: '+money(ar-ac):'');
 }
 function onChange(){activate('custom');update();setStatus('Unsaved changes · forecast updated.')}
 for(const node of form)node.addEventListener('input',onChange);
 get('cActualCost').addEventListener('input',onChange);
 get('cActualIncome').addEventListener('input',onChange);
 for(const button of ui.root.querySelectorAll('[data-preset]')){
  button.addEventListener('click',()=>{
   const name=button.dataset.preset;write(presets[name]);activate(name);
   setStatus('Scenario loaded. Select SAVE to keep it in this browser.');
  });
 }
 get('cReset').addEventListener('click',()=>{
  write(defaults);activate('private');setStatus('Private four-person scenario restored.');
 });
 get('cSave').addEventListener('click',()=>{
  try{localStorage.setItem(KEY,JSON.stringify(read()));setStatus('Saved in this browser only. Other devices are not synchronized.','saved')}
  catch(_){setStatus('Unable to save in this browser. Export CSV instead.','error')}
 });
 get('cExport').addEventListener('click',()=>{
  const x=read(),m=calc(x);
  const rows=[['Type','Item','USD'],...m.costs.map(([label,n])=>['Expense',label,n.toFixed(2)]),
   ['Expense','Safety reserve',m.cushion.toFixed(2)],
   ['Total','Monthly estimated expenses',m.total.toFixed(2)],
   ['Revenue','Monthly gross projected revenue',m.gross.toFixed(2)],
   ['Expense','Estimated processing fees',m.fees.toFixed(2)],
   ['Revenue','Monthly net projected revenue',m.net.toFixed(2)],
   ['Balance','Projected monthly balance',m.balance.toFixed(2)],
   ['Balance','Projected annual balance',(m.balance*12).toFixed(2)],
   ['Actual','Manually entered cost',x.actualCost],
   ['Actual','Manually entered income',x.actualIncome],
   ['Note','Estimates only; not actual provider billing or money received',''],
   ['Planning assumptions JSON',JSON.stringify(x),'']];
  const csv='\ufeff'+rows.map(row=>row.map(cell=>'"'+String(cell??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='blackcell-costs-revenue.csv';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  setStatus('Forecast CSV exported. This is not a financial ledger or invoice.','saved');
 });
 let restored=false;
 try{
  const prev=JSON.parse(localStorage.getItem(KEY)||'null');
  if(prev&&typeof prev==='object'&&!Array.isArray(prev)){
   const data={...defaults};
   for(const k of Object.keys(defaults)){
    if(k==='actualCost'||k==='actualIncome')data[k]=typeof prev[k]==='string'?prev[k]:'';
    else if(typeof prev[k]==='number'&&Number.isFinite(prev[k]))data[k]=prev[k];
   }
   write(data);restored=true;
  }
 }catch(_){}
 if(!restored){write(defaults);activate('private')}
 if(restored)setStatus('Previously saved forecast restored from this browser.','saved');
}
