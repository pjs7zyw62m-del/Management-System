import {corporateClient,corporateAuthorize} from './corp-auth.js?v=20261109-clearance5';
const $=id=>document.getElementById(id);
const make=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el};
const names={store:'App Store',administration:'Administration',settings:'System Settings',developerpreview:'Developer Preview',photoledger:'BLACKCELL REDLINE',personalphotos:'BLACKCELL Photos',files:'BLACKCELL Files',browser:'BLACKCELL Browser',network:'BLACKCELL Network',chat:'BLACKCELL iMessage',forces:"Man’s Armed Forces",photos:'Uniform Photos',film:'BLACKCELL Tube',shorts:'Shorts',person:'My Profile',card:'Corporate ID',omega:'BLACKCELL OMEGA',photobattle:'Photo Battle',uploadqueue:'Upload Queue',creativestudio:'Creative Studio',worldclock:'World Clock',voicememos:'Voice Memos',gunner:'Gunner AI'};
const label=id=>names[id]||id.charAt(0).toUpperCase()+id.slice(1);
let client=null,rows=[],verified=false,busy=false,pending=null;
const notice=s=>$('notice').textContent=s;
async function rpc(action,id=null){
 const {data,error}=await client.rpc('corp_app_store',{p_action:action,p_app:id,p_level:null,p_enabled:null});
 if(error||!data?.ok||data.owner!==true||!Array.isArray(data.apps))throw Error(data?.error||error?.message||'Network catalog unavailable.');
 return data;
}
function draw(){
 for(const [id,n] of [['total',rows.length],['active',rows.filter(a=>a.state==='active').length],['suspended',rows.filter(a=>a.state==='suspended').length],['removed',rows.filter(a=>a.state==='removed').length]])$(id).textContent=n;
 const q=$('search').value.trim().toLowerCase(),f=$('filter').value,host=$('apps');host.replaceChildren();
 for(const a of rows.filter(a=>(!q||(label(a.id)+' '+a.id).toLowerCase().includes(q))&&(f==='all'||(f==='protected'?a.protected:a.state===f)))){
  const row=make('article','app'),identity=make('div','identity'),icon=make('span','icon',label(a.id).slice(0,1)),copy=make('div');
  const count=a.installationRecords===null?'Built-in application':a.installationRecords+' installation records';
  copy.append(make('h2','',label(a.id)),make('div','meta',count+' · '+(a.minLevel===7?'Level 7':'Level '+a.minLevel+' and above')));
  const status=make('span','state',a.protected?'PROTECTED · '+a.state.toUpperCase():a.state.toUpperCase());status.dataset.mode=a.protected?'protected':a.state;copy.append(status);identity.append(icon,copy);row.append(identity);
  const actions=make('div','actions');const btn=(name,action,cls)=>{const b=make('button',cls,name);b.type='button';b.disabled=busy;b.onclick=()=>ask(a,action);actions.append(b)};
  if(a.protected)actions.append(make('span','meta','Essential / recovery control'));
  else{if(a.state==='active')btn('Suspend network','network_suspend','');if(a.state!=='removed')btn('Remove from entire network','network_remove','danger');if(a.state!=='active')btn('Restore distribution','network_restore','restore')}
  row.append(actions);host.append(row);
 }
 if(!host.children.length)host.append(make('p','','No applications match this filter.'));
}
function ask(app,action){
 if(!verified||busy||app.protected)return;pending={app,action};const remove=action==='network_remove',restore=action==='network_restore';
 $('confirmTitle').textContent=(remove?'Remove ':restore?'Restore ':'Suspend ')+label(app.id)+'?';
 $('confirmDesc').textContent=remove?'This disables OS distribution for everyone and clears existing installation records. No application content is deleted.':restore?'This restores OS distribution, subject to existing clearance requirements. Removed installations are not automatically restored.':'This temporarily disables distribution and hides the application from connected OS clients. Existing installation records are retained.';
 $('phraseLabel').hidden=$('phrase').hidden=!remove;$('phrase').value='';$('approve').disabled=remove;$('approve').className=remove?'danger':restore?'restore':'';$('approve').textContent=remove?'Remove network-wide':restore?'Restore':'Suspend';
 $('confirm').showModal();
}
$('phrase').oninput=()=>{$('approve').disabled=pending?.action==='network_remove'&&$('phrase').value!=='REMOVE'};
$('confirm').addEventListener('close',()=>{pending=null});
$('approve').onclick=async()=>{
 const request=pending;if(!verified||busy||!request||(request.action==='network_remove'&&$('phrase').value!=='REMOVE'))return;
 $('confirm').close();busy=true;$('reload').disabled=true;draw();notice('Applying verified network policy…');
 try{const data=await rpc(request.action,request.app.id);rows=data.apps;notice(label(request.app.id)+' — network policy saved.'+(request.action==='network_remove'?' '+data.affected+' installation records changed.':''));}
 catch(e){notice('Network change not confirmed: '+e.message)}
 finally{busy=false;$('reload').disabled=false;draw()}
};
async function load(){
 if(!verified||busy)return;busy=true;$('reload').disabled=true;draw();notice('Loading authorized network catalog…');
 try{rows=(await rpc('network_list')).apps;notice('Verified Level 7 owner · '+rows.length+' registered applications.')}
 catch(e){notice('Unable to verify catalog: '+e.message);rows=[]}
 finally{busy=false;$('reload').disabled=false;draw()}
}
$('reload').onclick=load;$('search').oninput=draw;$('filter').onchange=draw;
try{
 client=corporateClient();const auth=await corporateAuthorize(client);if(!auth.ok||auth.member?.role!=='owner'||Number(auth.member.clearance_level)!==7)throw Error('Verified Level 7 owner required.');
 const {data,error}=await client.rpc('corp_code_status');if(error||!data?.ok||!data?.verified)throw Error('Verify your corporate access first.');
 verified=true;$('workspace').hidden=false;await load();
}catch(e){verified=false;$('workspace').hidden=true;notice('Access restricted: '+e.message)}
