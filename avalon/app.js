const app=document.querySelector('#app'),notice=document.querySelector('#notice');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const button=(cmd,label,value='',disabled=false)=>`<button type="button" data-cmd="${cmd}" data-value="${esc(value)}" ${disabled?'disabled':''}>${esc(label)}</button>`;
function saved(storage,key){try{return JSON.parse(storage.getItem(key)||'null')}catch{return null}}
let catalog,state,seat=saved(sessionStorage,'avalon-seat'),busy=false,reading=false,showRole=false,selected=[],selectionKey='',draft=null;
const invitation=new URLSearchParams(location.search).get('room');
if(invitation && seat?.code!==invitation)seat=null;
const phases={lobby:'准备室',reveal:'确认身份',proposal:'队长组队',teamVote:'全员投票',mission:'秘密任务',assassination:'刺杀梅林',finished:'最终揭晓'};
const name=id=>state.players.find(p=>p.id===id)?.name||'未知玩家';
const seatName=id=>{const i=state.players.findIndex(p=>p.id===id);return `${i+1}号 ${name(id)}`};
function setup(capacity=5,preset='classic',pool=[]){
  const rule=catalog.playerRules[capacity];
  return `<div class="setup">
    <div><label for="capacity">人数</label><select id="capacity">${Object.keys(catalog.playerRules).map(n=>`<option value="${n}" ${Number(n)===capacity?'selected':''}>${n} 人</option>`).join('')}</select></div>
    <div><label for="preset">版型</label><select id="preset">${catalog.presets.filter(p=>p.min<=capacity).map(p=>`<option value="${p.id}" ${p.id===preset?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
    <p class="wide">${capacity-rule.evil} 位正义 / ${rule.evil} 位邪恶 · 任务人数 ${rule.missions.join(' / ')}<br>${esc(catalog.presets.find(p=>p.id===preset)?.description)}</p>
    ${preset==='custom'?`<div class="role-grid wide">${Object.entries(catalog.roles).map(([key,role])=>`<label>${esc(role.name)} · ${role.side==='GOOD'?'正义':'邪恶'}<input type="number" min="0" max="${['MINION','LOYAL_SERVANT'].includes(key)?capacity:1}" data-role="${key}" value="${pool.filter(r=>r===key).length}" aria-label="${esc(role.name)}人数"></label>`).join('')}</div>`:''}
  </div>`;
}
function configValues(){
  const capacity=Number(document.querySelector('#capacity').value),preset=document.querySelector('#preset').value,roles=[];
  for(const input of document.querySelectorAll('[data-role]')){
    const count=Number(input.value);
    if(!Number.isInteger(count)||count<0||count>capacity)throw Error('角色数量无效');
    roles.push(...Array(count).fill(input.dataset.role));
  }
  return {capacity,preset,roles};
}
function home(){
  app.innerHTML=`<div class="intro"><div class="eyebrow">04 / AVALON</div><h1>阿瓦隆 · 圆桌行动</h1><p>身份、组队、投票、任务和刺杀，全程由网页法官主持。</p></div>
    <section class="panel"><label class="label" for="nickname">你的昵称</label><input id="nickname" maxlength="16" autocomplete="nickname">
    <h2>召集圆桌</h2><div id="setup">${setup()}</div>${button('create','创建房间')}
    <details><summary>加入朋友的房间</summary><label class="label" for="room-code">六位房间号</label><input id="room-code" inputmode="numeric" maxlength="6" value="${esc(/^\d{6}$/.test(invitation)?invitation:'')}">${button('join','加入房间')}</details>
    ${saved(localStorage,'avalon-last-seat')?button('resume','恢复最近座位'):''}</section>`;
}
function renderPrivate(){
  const me=state.players.find(p=>p.id===state.me),role=catalog.roles[me.role];
  return `<section class="panel"><div class="split-line"><h2>我的私密身份</h2>${button('show',showRole?'盖住身份':'查看身份与视野')}</div>${showRole?`<div class="private-card ${role.side==='GOOD'?'good':'evil'}"><h3>${esc(role.name)} · ${role.side==='GOOD'?'正义':'邪恶'}</h3><p>${esc(role.description)}</p><h3>你的视野</h3>${state.vision.length?state.vision.map(v=>`<p>${esc(seatName(v.id))} · ${esc(v.cue)}</p>`).join(''):'<p>没有额外身份信息。</p>'}</div>`:'<p class="privacy">仅在自己的手机上查看。切到后台时自动盖住。</p>'}</section>`;
}
function render(){
  const r=state,g=r.game,host=r.hostId===r.me;
  const key=r.code+'-'+g?.round+'-'+g?.proposals.length+'-'+r.phase;
  if(key!==selectionKey){selected=[];selectionKey=key}
  let html=`<div class="room-head"><div><div class="eyebrow">${esc(phases[r.phase])}</div><h1>圆桌 <span class="room-code">${r.code}</span></h1></div>${button('share','分享房间')}</div>
    <section class="panel"><p>${r.config.capacity} 人 · ${esc(catalog.presets.find(p=>p.id===r.config.preset)?.name)} · 房主 ${esc(name(r.hostId))}</p><div class="seats">${r.players.map((p,i)=>`<span class="seat ${p.id===r.me?'me':''} ${g?.leader===i?'captain':''}">${esc(seatName(p.id))}${p.id===r.me?'（我）':''}</span>`).join('')}</div>
    <details><summary>本桌公开角色配置</summary><p>${Object.entries(catalog.roles).filter(([key])=>r.config.pool.includes(key)).map(([key,role])=>esc(role.name)+' × '+r.config.pool.filter(v=>v===key).length).join(' · ')}</p></details></section>`;
  if(r.phase==='lobby'){
    html+=`<section class="panel"><h2>人数与版型</h2>${host?`<div id="setup">${setup(draft?.capacity||r.config.capacity,draft?.preset||r.config.preset,draft?.roles||r.config.pool)}</div>${button('configure','保存版型')}`:'<p>等待房主设置人数与版型。</p>'}<p>已加入 ${r.players.length} / ${r.config.capacity} 人</p>${host?button('start','开始发身份','',r.players.length!==r.config.capacity):'<p>等待房主开局。</p>'}</section>`;
  }else{
    const rule=catalog.playerRules[r.config.capacity];
    html+=`<section class="panel"><div class="mission-track">${rule.missions.map((size,i)=>{const done=g.history[i];return `<div class="mission-stop ${done?(done.passed?'passed':'failed'):i===g.round-1?'current':''}">任务 ${i+1} · ${size} 人<br>${done?(done.passed?'成功':'失败')+' / '+done.fails+' 张失败票':r.config.capacity>=7&&i===3?'需两张失败票':'一张失败票即失败'}</div>`}).join('')}</div><p>正义成功 ${g.history.filter(h=>h.passed).length} / 3 · 任务失败 ${g.history.filter(h=>!h.passed).length} / 3 · 连续否决 ${g.rejects} / 5</p></section>`;
    html+=renderPrivate();
    html+=`<section class="panel"><h2>${esc(phases[r.phase])}</h2>`;
    if(r.phase==='reveal'){
      html+=`<p>查看并记住自己的身份和视野，${g.revealed.length} / ${r.players.length} 人已确认。</p>${button('reveal',g.revealed.includes(r.me)?'已确认，等待队友':'我已记住身份与视野','',g.revealed.includes(r.me))}`;
    }else if(r.phase==='proposal'){
      const need=rule.missions[g.round-1];
      html+=`<p class="status-line">队长 ${esc(seatName(r.players[g.leader].id))}，本次需要 ${need} 人。</p>`;
      if(r.players[g.leader].id===r.me)html+=`<div class="choices">${r.players.map(p=>`<button type="button" data-cmd="select" data-value="${p.id}" class="${selected.includes(p.id)?'selected':''}" aria-pressed="${selected.includes(p.id)}">${esc(seatName(p.id))}</button>`).join('')}</div><p>已选 ${selected.length} / ${need} 人</p>${button('propose','提交队伍','',selected.length!==need)}`;
      else html+='<p>等待队长选择队员。</p>';
    }else if(['teamVote','mission'].includes(r.phase)){
      html+=`<p>本次队伍：${g.team.map(id=>esc(seatName(id))).join('、')}</p>`;
      const participating=r.phase==='teamVote'||g.team.includes(r.me),submitted=g.submitted.includes(r.me),total=r.phase==='teamVote'?r.players.length:g.team.length;
      html+=`<p class="status-line">已提交 ${g.submitted.length} / ${total} 票${submitted?' · 你的票已锁定':''}</p>`;
      if(!participating)html+='<p>你未入队，等待队员秘密提交任务票。</p>';
      else if(!submitted && r.phase==='teamVote')html+=`<div class="actions">${button('vote','赞成队伍','approve')}${button('vote','反对队伍','reject')}</div><p>收齐后公开每位玩家的组队票。</p>`;
      else if(!submitted)html+=`<div class="actions">${button('mission','任务成功','success')}${catalog.roles[r.players.find(p=>p.id===r.me).role].side==='EVIL'?button('mission','任务失败','fail'):''}</div><p>个人任务票保密，提交后不可修改。</p>`;
      else html+='<p>等待其他玩家提交。</p>';
    }else if(r.phase==='assassination'){
      html+='<p>三次任务成功。等待刺客选择梅林。</p>';
      if(r.players.find(p=>p.id===r.me).role==='ASSASSIN')html+=`<div class="choices">${r.players.filter(p=>p.id!==r.me).map(p=>`<button type="button" data-cmd="target" data-value="${p.id}" class="${selected[0]===p.id?'selected':''}" aria-pressed="${selected[0]===p.id}">${esc(seatName(p.id))}</button>`).join('')}</div><div class="actions">${button('assassinate','确认刺杀','',!selected.length)}</div>`;
    }else if(r.phase==='finished'){
      html+=`<h2 class="${g.winner==='GOOD'?'success-text':'failure-text'}">${g.winner==='GOOD'?'正义阵营获胜':'邪恶阵营获胜'}</h2><p>${esc(g.reason)}</p>${g.assassinated?`<p>刺杀目标 ${esc(seatName(g.assassinated))}</p>`:''}${r.players.map(p=>`<p>${esc(seatName(p.id))} · ${esc(catalog.roles[p.role].name)}</p>`).join('')}${host?button('reset','返回准备室再开一局'):'<p>等待房主返回准备室。</p>'}`;
    }
    html+='</section>';
    html+=`<details class="panel"><summary>组队票与任务记录（${g.proposals.length} 次提案）</summary><ol class="log-list">${g.proposals.map(p=>`<li>任务 ${p.round} · 队长 ${esc(seatName(r.players[p.leader].id))} · ${p.passed?'通过':'否决'}<br>队员 ${p.team.map(id=>esc(seatName(id))).join('、')}<br>${Object.entries(p.votes).map(([id,v])=>esc(seatName(id))+' '+(v==='approve'?'赞成':'反对')).join(' / ')}</li>`).join('')}</ol>${g.history.map(h=>`<p>任务 ${h.round} ${h.passed?'成功':'失败'} · ${h.fails} 张失败票</p>`).join('')}</details>`;
  }
  if(host && r.players.length>1)html+=`<details class="panel"><summary>房主管理</summary><div class="seat-controls"><label for="host-target">转交给</label><select id="host-target">${r.players.filter(p=>p.id!==r.me).map(p=>`<option value="${p.id}">${esc(seatName(p.id))}</option>`).join('')}</select>${button('transfer','转交房主')}</div></details>`;
  const opened=[...app.querySelectorAll('details')].map(d=>d.open);
  app.innerHTML=html;
  app.querySelectorAll('details').forEach((d,i)=>d.open=opened[i]||false);
}
async function send(cmd,extra={}){
  const poll=cmd==='read';
  if(busy||reading)return;
  if(poll)reading=true;else busy=true;
  try{
    const response=await fetch('/avalon/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...seat,cmd,v:state?.v,...extra}),signal:AbortSignal.timeout(15000)});
    if(response.status===204){notice.textContent='';return}
    const result=await response.json();
    if(!response.ok){
      if(response.status===409){reading=false;busy=false;await send('read')}
      if(cmd==='read' && ['房间不存在','席位无效'].includes(result.error)){seat=null;state=null;sessionStorage.removeItem('avalon-seat');home()}
      throw Error(result.error||'请求失败');
    }
    if(result.token){seat={code:result.code,token:result.token};sessionStorage.setItem('avalon-seat',JSON.stringify(seat));localStorage.setItem('avalon-last-seat',JSON.stringify(seat));history.replaceState(null,'','?room='+result.code)}
    if(!state||state.v!==result.v||state.code!==result.code){
      if(state?.phase!==result.phase)showRole=false;
      if(state?.config && JSON.stringify(state.config)!==JSON.stringify(result.config))draft=null;
      state=result;render();
    }
    notice.textContent='';
  }catch(error){notice.textContent=error.name==='TimeoutError'||error instanceof TypeError?'连接中断，正在尝试恢复。请保留此页面。':error.message}
  finally{if(poll)reading=false;else busy=false}
}
app.addEventListener('change',event=>{
  if(!['capacity','preset'].includes(event.target.id) && !event.target.dataset.role)return;
  const values=configValues();
  if(!catalog.presets.some(p=>p.id===values.preset&&p.min<=values.capacity))values.preset='classic';
  if(values.preset==='custom'&&!values.roles.length)values.roles=state?.config.pool||['MERLIN','PERCIVAL','ASSASSIN','MORGANA',...Array(values.capacity-4).fill('LOYAL_SERVANT')];
  draft=values;
  if(!event.target.dataset.role)document.querySelector('#setup').innerHTML=setup(values.capacity,values.preset,values.roles);
});
app.addEventListener('click',async event=>{
  const target=event.target.closest('[data-cmd]');if(!target||target.disabled)return;
  const cmd=target.dataset.cmd,value=target.dataset.value;
  try{
    if(cmd==='show'){showRole=!showRole;render();return}
    if(cmd==='select'){selected=selected.includes(value)?selected.filter(id=>id!==value):[...selected,value];render();return}
    if(cmd==='target'){selected=[value];render();return}
    if(cmd==='share'){
      const url=location.origin+'/avalon/?room='+state.code;
      if(navigator.share){try{await navigator.share({title:'阿瓦隆 · 圆桌 '+state.code,url});return}catch(error){if(error.name==='AbortError')return}}
      if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(url);notice.textContent='房间链接已复制';return}catch{}}
      notice.textContent='邀请链接 '+url;return;
    }
    if(cmd==='resume'){seat=saved(localStorage,'avalon-last-seat');await send('read');return}
    if(cmd==='create'||cmd==='join'){
      const name=document.querySelector('#nickname').value.trim();
      if(!name)throw Error('请先填写昵称');
      const extra=cmd==='create'?configValues():{code:document.querySelector('#room-code').value.trim()};
      await send(cmd,{...extra,name});return;
    }
    if(cmd==='configure'){await send(cmd,configValues());draft=null;return}
    if(cmd==='start' && draft)throw Error('请先保存人数和版型');
    await send(cmd,{value:cmd==='propose'?[...selected]:cmd==='assassinate'?selected[0]:cmd==='transfer'?document.querySelector('#host-target').value:value});
  }catch(error){notice.textContent=error.message}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(showRole){showRole=false;render()}}
  else if(seat)send('read');
});
try{
  const response=await fetch('/avalon/catalog');
  if(!response.ok)throw Error('无法读取版型，请刷新重试');
  catalog=await response.json();home();if(seat)await send('read');
  setInterval(()=>{if(seat&&!document.hidden)send('read')},2000);
}catch(error){notice.textContent=error.message}
