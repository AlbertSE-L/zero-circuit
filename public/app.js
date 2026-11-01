import {bindMusic} from './music.js';
let musicHost=null;
function syncMusic(host){if(musicHost!==host){bindMusic(host);musicHost=host;}}
const root=document.querySelector('#app'),notice=document.querySelector('#notice');
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog,session=null,view=null,poll,busy=false,reading=false,ownId=null,targetId=null,revealed=false,privateShown=false;
const storageKey='zero-circuit-session-v1';
async function api(path,method='GET',body,credential=session?.token){const res=await fetch('/api'+path,{method,headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),...(credential?{Authorization:'Bearer '+credential}:{})},...(method==='POST'?{body:JSON.stringify(body||{})}:{})});const data=await res.json();if(!res.ok){const error=new Error(data.error||'请求失败');error.status=res.status;throw error;}return data;}
function errorMessage(err){notice.textContent=err.message||String(err);}
function rules(){return `<details><summary>行动手册 · 一分钟了解规则</summary><ol class="rulelist"><li>自己的线路按数值升序排列。队友只看到背面、位置及公开提示；<strong>不允许直接报出未公开数字或用约定暗号编码</strong>。</li><li>轮到你时，选择自己一条可修复线路，再选队友一个位置。蓝线数字相同则两条一起拆除；琥珀线只需颜色相同，不要求排序数字相同。</li><li>普通配对错误会消耗一格容错，并公开目标线路的数字或琥珀颜色。目标是红线则立即失败，绝缘技能也不能保护。</li><li>某种蓝色数字或琥珀类型的全部剩余线路都在你手上时，可执行<strong>本地自检</strong>一次清除；必须至少两条且数量为偶数。</li><li>每人每局可免费公开自己一条蓝线的数字，不消耗行动。技能、自检、配对和暂缓各消耗一次行动。</li><li>红线不需要拆。清除其余全部线路即获胜；容错耗尽或触碰红线即失败。</li></ol><p class="subtle">观察顺序、公开信息和讨论推理是核心。琥珀及红线的数值仅用于排序，网页会显示颜色。每张关卡有独立参数，技能也是独立模块。</p></details>`;}
function options(selected){return catalog.challenges.map(c=>`<option value="${e(c.id)}" ${selected===c.id?'selected':''}>${e(c.name)} · ${e(c.tag)}</option>`).join('');}
function countOptions(value){return [2,3,4,5].map(n=>`<option value="${n}" ${Number(value)===n?'selected':''}>${n} 人</option>`).join('');}
function home(){syncMusic(false);clearInterval(poll);root.innerHTML=`<section class="hero"><div><div class="eyebrow">Cooperate / Deduce / Reconnect</div><h1>一条线索，<br>让整座城市<em>重新亮起。</em></h1><p>你能看到自己的线路，却需要队友的另一半。共享线索、推断位置，在容错耗尽之前接通每一段回路。</p><span class="pill">2–5 人 · 面对面合作 · 每人一部手机</span></div><div class="circuit" aria-hidden="true"><div class="sample dashed">04</div><div class="linkline"></div><div class="sample back">?</div><div class="linkline"></div><div class="sample">04</div></div></section><div class="grid"><section class="panel"><div class="tag">01 / START A SESSION</div><h2>主持一场行动</h2><p class="subtle">主持人同时占一个玩家席位，负责开局和选择关卡。</p><form id="create-form"><label class="label" for="host-name">你的昵称</label><input id="host-name" maxlength="16" placeholder="例如：灯塔守望者" required><div class="split"><div><label class="label" for="capacity">行动人数</label><select id="capacity">${countOptions(3)}</select></div><div><label class="label" for="mission">任务关卡</label><select id="mission">${options('first-light')}</select></div></div><p class="subtle" id="mission-description"></p><button class="full">创建行动房间 →</button></form></section><section class="panel light"><div class="tag">02 / JOIN YOUR TEAM</div><h2>队友在等你</h2><p class="subtle">连接同一 Wi-Fi，打开主持电脑的 IP 地址，输入房间号。</p><form id="join-form"><label class="label" for="room-code">六位房间号</label><input id="room-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="例如 482193" required><label class="label" for="player-name">你的昵称</label><input id="player-name" maxlength="16" placeholder="让队友认出你" required><button class="full">领取座位 →</button></form></section></div><section class="panel"><h3>线下讨论，手机只负责秘密与记录。</h3><p>不需要账号或互联网服务。每台手机只收到自己的完整线路；主机控制者仍有能力查看本地数据，请与信任的朋友游玩。</p>${rules()}</section>`;
const mission=document.querySelector('#mission');const describe=()=>document.querySelector('#mission-description').textContent=catalog.challenges.find(c=>c.id===mission.value).description;mission.onchange=describe;describe();
document.querySelector('#room-code').value=new URLSearchParams(location.search).get('room')||'';
document.querySelector('#create-form').onsubmit=ev=>perform(ev,async()=>{const result=await api('/rooms','POST',{name:document.querySelector('#host-name').value,capacity:Number(document.querySelector('#capacity').value),challengeId:mission.value},null);enter(result);});
document.querySelector('#join-form').onsubmit=ev=>perform(ev,async()=>{const code=document.querySelector('#room-code').value.trim();if(!/^\d{6}$/.test(code))throw new Error('请输入六位房间号');const result=await api(`/rooms/${code}/join`,'POST',{name:document.querySelector('#player-name').value},null);enter(result);});}
function enter(result){session={token:result.token,code:result.room.code};localStorage.setItem(storageKey,JSON.stringify(session));view=result.room;ownId=targetId=null;revealed=privateShown=false;history.replaceState(null,'','/?room='+view.code);render();clearInterval(poll);poll=setInterval(refresh,2200);}
async function refresh(){if(!session||reading)return;reading=true;try{const next=await api('/rooms/'+session.code);if(!view||next.version!==view.version){if(!next.game||!view?.game){revealed=privateShown=false;}view=next;const all=view.players.flatMap(p=>p.hand);if(!all.some(t=>t.id===ownId&&!t.removed))ownId=null;if(!all.some(t=>t.id===targetId&&!t.removed))targetId=null;render();}if(notice.textContent.startsWith('连接中断'))notice.textContent='';}catch(err){if(err.status===403||err.status===404){forget();errorMessage(err);}else notice.textContent='连接中断，正在自动重连。请保持电脑服务运行并检查 Wi-Fi。';}finally{reading=false;}}
async function perform(event,fn){event?.preventDefault();if(busy)return;busy=true;notice.textContent='';try{await fn();}catch(err){if(err.status===409)await refresh();errorMessage(err);}finally{busy=false;}}
let feedbackTimer;
function showPairResult(room, targetId) {
  const target = room.players.flatMap(player => player.hand).find(tile => tile.id === targetId);
  if (!target) return;
  const banner = document.getElementById('pair-result');
  let state, message;
  if (room.game.status === 'lost') {
    state = 'failure';
    message = '× 行动失败 · ' + room.game.reason;
  } else if (target.removed) {
    state = 'success';
    message = room.game.status === 'won' ? '✓ 配对成功 · 全部回路已接通' : '✓ 配对成功 · 两条线路已接通';
  } else {
    state = 'warning';
    message = '！配对失误 · 剩余容错 ' + room.game.fuse + ' 格';
  }
  clearTimeout(feedbackTimer);
  const stamp = document.createElement('strong');
  stamp.className = 'pair-stamp ' + state;
  // Original ink-panel illustration. Geometry is shared; the connector pose tells the outcome.
  const poses = {
    success: ['translate(157 46)', 'M-9 -11 l7 9 16 -19'],
    warning: ['translate(173 28)', 'M1 -12 v12 m0 5 v1'],
    failure: ['translate(187 29) rotate(-18)', 'M6 -16 l-12 16 h8 l-8 15']
  };
  const [pose, signal] = poses[state];
  stamp.innerHTML = `<svg viewBox="0 0 320 85" aria-hidden="true" focusable="false">
    <defs><pattern id="ink-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="currentColor"/></pattern></defs>
    <path fill="currentColor" opacity=".14" d="M0 10L320 0 300 66 0 85Z"/>
    <path fill="url(#ink-dots)" opacity=".45" d="M0 14L107 5 60 69 0 80ZM258 7L320 0 320 60 224 79Z"/>
    <path stroke="currentColor" stroke-width="2" d="M2 31l88-12M12 42l72-8m142 25l84-15m-70 24l75-12"/>
    <g transform="rotate(-8 160 43)" stroke="#100e16" stroke-width="3" stroke-linejoin="bevel">
      <path fill="currentColor" d="M0 46h61l17-15h33v18H84L66 62H0Z"/>
      <path fill="#fff3db" d="M93 26h40l9 8h16v7h-17v7h17v7h-27l-8 7H93Z"/>
      <path fill="#24202a" d="M99 29h9v30h-9zm14 0h5v30h-5z"/>
      <g transform="${pose}"><path fill="currentColor" d="M0-17h34l9 9h25l20-12h75v13H92L72 6H43l-9 10H0Z"/>
      <path fill="#24202a" d="M5-11h7v20H5zm12 0h5v20h-5z"/></g>
    </g>
    <g transform="translate(158 22)"><path fill="#17141c" stroke="currentColor" d="M-19-15l16 4 9-10 3 11 16-3-9 13 8 8-17-1-7 8-5-10-13 1 7-10Z"/>
    <path d="${signal}" fill="none" stroke="currentColor" stroke-width="3.5"/></g>
  </svg>`;
  const caption = document.createElement('span');
  caption.textContent = message;
  stamp.append(caption);
  banner.replaceChildren(stamp);
  feedbackTimer = setTimeout(() => banner.replaceChildren(), 2600);
}
async function mutate(action,body={}){if(!session||!view)return;const next=await api(`/rooms/${view.code}/${action}`,'POST',{...body,version:view.version});view=next;ownId=targetId=null;render();if(body.action?.type==="pair" && next.game?.status==="playing")showPairResult(next,body.action.targetId);}
function forget(){session=view=null;revealed=privateShown=false;localStorage.removeItem(storageKey);history.replaceState(null,'','/');home();}
function me(){return view.players.find(p=>p.id===view.viewerId);}
function button(id,fn){const el=document.getElementById(id);if(el)el.onclick=ev=>perform(ev,fn);}
function header(challenge){return `<div class="room-head"><div><div class="eyebrow">${e(challenge.tag)} / ${e(challenge.name)}</div><h1>行动编号 <span class="room-code">${e(view.code)}</span></h1><span class="connection">自动重连 · 进度已保存至主持电脑</span></div><div class="actions"><button id="copy-invite" class="ghost">复制邀请</button><button id="switch-room" class="secondary">切换房间</button></div></div>`;}
function bindCommon(){button('copy-invite',async()=>{const address=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?catalog.addresses[0]?.url:location.origin;if(!address)throw new Error('未找到局域网地址，请查看启动窗口');const url=address+'/?room='+view.code;if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);notice.textContent='邀请链接已复制：'+url;}else{notice.textContent='请长按复制此邀请链接：'+url;}});button('switch-room',async()=>{if(confirm('离开当前界面？你的席位仍保留；重新加入原房间需要保留原浏览器凭据。')){const old=session;session=null;view=null;clearInterval(poll);history.replaceState(null,'','/');home();const resume=document.createElement('button');resume.className='ghost';resume.textContent='恢复上一个房间 '+old.code;resume.onclick=()=>{session=old;refresh();poll=setInterval(refresh,2200);};root.prepend(resume);}});}
const rimToggle = document.querySelector('#rim-toggle');
function setRim(off) {
  document.body.classList.toggle('rim-off', off);
  rimToggle.checked = !off;
}
setRim(localStorage.getItem('zero-circuit-rim') === 'off');
rimToggle.onchange = () => {
  const off = !rimToggle.checked;
  setRim(off);
  localStorage.setItem('zero-circuit-rim', off ? 'off' : 'on');
};
const victory = document.querySelector('#victory');
let lastEnding = '', victoryTimer;
function hideVictory() { clearTimeout(victoryTimer); victory.hidden = true; }
document.querySelector('#skip-victory').onclick = hideVictory;
let previousSkills = null;
function present(kind, label, artwork, title, detail, duration) {
  clearTimeout(victoryTimer);
  victory.dataset.scene = kind;
  const panel = victory.querySelector('.final-panel');
  panel.querySelector('small').textContent = label;
  panel.querySelector('.skyline').textContent = artwork;
  panel.querySelector('h2').textContent = title;
  panel.querySelector('p').textContent = detail;
  document.querySelector('#skip-victory').textContent = kind === 'skill' ? '继续行动' : '查看结算';
  victory.hidden = false;
  victoryTimer = setTimeout(hideVictory, duration);
}
function syncScenes() {
  const game = view.game;
  if (!game) { previousSkills = null; lastEnding = ''; hideVictory(); return; }
  const key = view.code + ':' + view.viewerId;
  const used = new Set(view.players.filter(player => player.skillUsed).map(player => player.id));
  const actor = previousSkills?.key === key && view.players.find(player => used.has(player.id) && !previousSkills.used.has(player.id));
  previousSkills = {key, used};
  if (game.status === 'playing') {
    lastEnding = '';
    if (actor) {
      const skill = catalog.skills.find(item => item.id === actor.skill);
      present('skill','SIGNAL / ABILITY','◇ ━━━ ◎ ━━━ ◇',skill.name,actor.name + ' 发动了技能。',2000);
    }
    return;
  }
  if (lastEnding === key) return;
  lastEnding = key;
  if (game.status === 'won') present('won','ZERO CIRCUIT / SIGNAL RESTORED','▂ ▅ ▃ ▇ ▄ ▆ ▂ ▅ ▃ ▇','全城来电','最后一道回路接通了。',4200);
  else if (game.fuse === 0) present('drain','SYSTEM / POWER DOWN','▇ ▆ ▅ ▄ ▃ ▂ ▁','容错耗尽','最后一格容错用尽，系统进入保护停机。',3300);
  else present('red','DANGER / LINE BREAK','━━━ ╱╲ ϟ ╱╲ ━━━','红线断裂','触碰危险线路，系统紧急停机。',3300);
}
function render(){syncScenes();const c=catalog.challenges.find(c=>c.id===view.challengeId),host=view.hostId===view.viewerId;syncMusic(host);const toggle=host?'<button id="referee" class="ghost">'+(view.refereeActive?'退出超级玩家':'成为超级玩家')+'</button>':'';
const log=view.debug?'<section class="panel"><h2>法官日志</h2><p>最近 200 次成功行动，最新在前。升级前的私人探测保留在下方。</p><ol>'+view.debug.events.slice().reverse().map(event=>'<li>'+e(new Date(event.time).toLocaleTimeString())+' · '+e(event.text)+'</li>').join('')+'</ol><h3>私人探测记录</h3><ul>'+view.debug.notes.map(note=>'<li>'+e(note)+'</li>').join('')+'</ul></section>':'';
root.innerHTML=header(c)+toggle+(view.refereeActive?'<p class="pill">房主已开启超级玩家模式，可查看私人探测结果</p>':'')+log+(view.game?board(c,host):lobby(c,host));bindCommon();button('referee',async()=>{if(view.refereeActive||confirm('开启后你将看到玩家秘密，所有人都能看到模式提示。继续？'))await mutate('referee',{enabled:!view.refereeActive});});if(view.game)bindBoard(host);else bindLobby(host);}
function lobby(c,host){const joinBase=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?catalog.addresses[0]?.url:location.origin;
return `<div class="grid"><section class="panel"><div class="tag">TEAM / 等待队友</div><h2>已入座 ${view.players.length} / ${view.capacity}</h2>${view.players.map((p,i)=>`<div class="player"><span class="avatar">${i+1}</span><div><b>${e(p.name)}</b> ${p.id===view.viewerId?'<span class="pill">你</span>':''} ${p.id===view.hostId?'<span class="pill">房主</span>':''}</div>${host&&p.id!==view.hostId?`<div class="player-actions"><button class="secondary" data-transfer="${p.id}">交接</button><button class="danger" data-kick="${p.id}">移除</button></div>`:''}</div>`).join('')}<div class="joinlink">${e(joinBase||location.origin)}/?room=${e(view.code)}</div><p class="subtle">手机不用 localhost；需要打开电脑实际的 Wi-Fi 地址。每位玩家使用自己的浏览器加入。</p>${host?`<button id="start" class="full" ${view.players.length!==view.capacity?'disabled':''}>${view.players.length===view.capacity?'全员就位，分配线路 →':'等待队友到齐'}</button>`:'<p class="pill">座位已保留，等待房主开始。</p>'}</section><section class="panel light"><div class="tag">MISSION / 本局设置</div><h2>${e(c.name)}</h2><p>${e(c.description)}</p><div class="stats"><div class="stat"><small>蓝线数字</small><b>1–${c.maxValue}</b></div><div class="stat warn"><small>琥珀 / 红线</small><b>${c.amber} / ${c.red}</b></div><div class="stat"><small>容错</small><b>${c.fuse} 格</b></div></div>${host?`<label class="label" for="lobby-mission">更换关卡</label><select id="lobby-mission">${options(view.challengeId)}</select><label class="label" for="lobby-count">房间人数</label><select id="lobby-count">${countOptions(view.capacity)}</select><button id="configure" class="secondary full">保存设置</button>`:''}${rules()}</section></div>`;}
function bindLobby(host){button('start',()=>mutate('start'));button('configure',()=>mutate('configure',{capacity:Number(document.querySelector('#lobby-count').value),challengeId:document.querySelector('#lobby-mission').value}));root.querySelectorAll('[data-kick]').forEach(el=>el.onclick=ev=>perform(ev,async()=>{if(confirm('移除这个座位？原玩家将无法继续访问。'))await mutate('kick',{playerId:el.dataset.kick});}));root.querySelectorAll('[data-transfer]').forEach(el=>el.onclick=ev=>perform(ev,async()=>{if(confirm('将房主权限交给这位玩家？'))await mutate('transfer',{playerId:el.dataset.transfer});}));}
function tileMarkup(t,p,own,ended){const known=own&&revealed||t.removed;const selected=t.id===ownId?' selected':t.id===targetId?' target':'';const kind=known?t.kind:'hidden';const value=known?(t.kind==='blue'?String(t.value).padStart(2,'0'):t.kind==='amber'?t.value:'!'):'?';const label=known?(t.kind==='blue'?`数字 ${t.value}`:t.kind==='amber'?`琥珀线，排序值 ${t.value}`:'红色危险线'):'隐藏线路';return `<button class="wire ${kind}${t.removed?' removed':''}${selected}" data-tile="${e(t.id)}" data-owner="${e(p.id)}" ${t.removed||ended?'disabled':''} aria-label="${e(p.name)} ${t.slot} 号位：${label}${t.hint?'，公开提示 '+e(t.hint):''}${t.removed?'，已拆除':''}" aria-pressed="${!!selected}"><span class="slot">${String(t.slot).padStart(2,'0')} 号位</span><span class="value">${e(value)}</span><span class="hint">${t.removed?'已接通':t.hint?'提示 '+e(t.hint):known&&t.kind==='amber'?'琥珀':''}</span></button>`;}
function board(c,host){const g=view.game,player=me(),active=view.players[g.turn],ended=g.status!=='playing',skill=catalog.skills.find(s=>s.id===player.skill),own=player.hand.find(t=>t.id===ownId);let target,owner;for(const p of view.players){const t=p.hand.find(t=>t.id===targetId);if(t){target=t;owner=p;}}
const done=view.players.flatMap(p=>p.hand).filter(t=>t.removed).length,total=c.maxValue*c.copies+c.amber;
return `${ended?`<div class="end ${g.status==='lost'?'lost':''}"><div class="eyebrow">MISSION ${g.status==='won'?'COMPLETE':'STOPPED'}</div><h2>${g.status==='won'?'城市重新亮起。':'行动暂时中止。'}</h2><p>${e(g.reason)}</p><p class="subtle">队友未拆的私人线路仍然隐藏，不会因结束而自动泄露。</p>${host?'<button id="reset">返回准备室 / 再来一局</button>':'等待房主返回准备室。'}</div>`:''}<div class="stats"><div class="stat ${g.fuse<=2?'warn':''}"><small>剩余容错</small><b>${g.fuse} / ${g.maxFuse}</b></div><div class="stat"><small>接通线路</small><b>${done} / ${total}</b></div><div class="stat"><small>行动次数</small><b>${g.moves}</b></div><div class="stat"><small>绝缘防护</small><b>${g.shield?'已启用':'无'}</b></div></div><p class="subtle">${c.maxValue} 种蓝线各 ${c.copies} 条 · ${c.amber} 条琥珀线 · ${c.red} 条红色危险线（无需拆除）</p><div class="workbench"><section><div class="turnbar ${active.id===view.viewerId?'':'wait'}">${ended?'本局已结束':active.id===view.viewerId?'轮到你了。先选自己的线路，再选一条队友的背面。':`等待 ${e(active.name)} 行动。你可以观察线路，或公开自己的初始提示。`}</div>${view.players.map((p,i)=>`<section class="rack ${active.id===p.id&&!ended?'active':''}"><div class="rackhead"><div><h3>${i+1}. ${e(p.name)} ${p.id===view.viewerId?'<span class="pill">你</span>':''}</h3><small>${p.id===view.viewerId?'你的私人数字 · 按升序排列':'队友线束 · 数字从左到右递增，位置固定'}</small></div>${p.id===view.viewerId?`<button id="toggle-hand" class="secondary">${revealed?'隐藏我的数字':'显示我的数字'}</button>`:''}</div><div class="tiles">${p.hand.map(t=>tileMarkup(t,p,p.id===view.viewerId,ended)).join('')}</div></section>`).join('')}<section class="panel">${rules()}<details><summary>行动记录</summary><ol class="logs">${[...g.logs].reverse().map(l=>`<li>${e(l)}</li>`).join('')}</ol></details></section></section><aside class="panel controls"><div class="tag">CONTROL / ${e(player.name)}</div><h3>本次操作</h3><div class="selection">自己的位置：<b>${own?own.slot+' 号位':'尚未选择'}</b><br>队友的位置：<b>${target?e(owner.name)+' · '+target.slot+' 号位':'尚未选择'}</b></div><button id="pair" class="full" ${ended||active.id!==view.viewerId||!own||!target||!revealed?'disabled':''}>确认配对 →</button><div class="actions"><button id="beacon" class="ghost" ${ended||player.beaconUsed||!own||own.kind!=='blue'||!revealed?'disabled':''}>${player.beaconUsed?'初始提示已用':'公开所选蓝线'}</button><button id="solo" class="secondary" ${ended||active.id!==view.viewerId||!own||!revealed?'disabled':''}>本地自检</button><button id="pass" class="secondary" ${ended||active.id!==view.viewerId?'disabled':''}>暂缓 / 过回合</button></div><p class="subtle">公开提示每人一次，不消耗行动。其余操作消耗一次行动。先显示自己的数字才能配对。</p><div class="skill"><strong>${e(skill.name)} ${player.skillUsed?'· 已用':''}</strong><p>${e(skill.description)}</p><button id="skill" class="secondary" ${ended||active.id!==view.viewerId||player.skillUsed||skill.target&&!target?'disabled':''}>${skill.target?'对所选位置使用技能':'使用技能'}</button></div><details><summary>私人探测记录（仅你可见）</summary><button id="notes" class="ghost">${privateShown?'隐藏私人记录':'显示私人记录'}</button>${privateShown?`<ul class="notes">${view.notes.map(n=>`<li>${e(n.text)}</li>`).join('')||'<li>尚无私人记录。</li>'}</ul>`:'<p class="subtle">请确认周围无人窥屏后查看。</p>'}</details>${host&&!ended?'<details><summary>房主管理</summary><button id="abort" class="danger">中止本局并返回准备室</button></details>':''}</aside></div>`;}
function bindBoard(host){root.querySelectorAll('[data-tile]').forEach(el=>el.onclick=()=>{const id=el.dataset.tile;if(el.dataset.owner===view.viewerId){if(!revealed){notice.textContent='请先点击“显示我的数字”，再选择自己的线路。';return;}ownId=ownId===id?null:id;}else targetId=targetId===id?null:id;render();});button('toggle-hand',async()=>{revealed=!revealed;if(!revealed)ownId=null;render();});button('notes',async()=>{privateShown=!privateShown;render();});
const act=type=>mutate('action',{action:{type,ownId,targetId}});button('pair',()=>act('pair'));button('beacon',()=>act('beacon'));button('solo',()=>act('solo'));button('skill',()=>act('skill'));button('pass',()=>act('pass'));button('reset',()=>mutate('reset'));button('abort',async()=>{if(confirm('确定中止？本局线路和进度将被清除，玩家保留。'))await mutate('reset');});}
function hideSecrets(){if(revealed||privateShown){revealed=privateShown=false;ownId=null;if(view?.game)render();}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)hideSecrets();});window.addEventListener('blur',hideSecrets);
try{catalog=await api('/catalog','GET',null,null);const invitation=new URLSearchParams(location.search).get('room');let saved;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{localStorage.removeItem(storageKey);}if(saved?.token&&saved?.code&&(!invitation||invitation===saved.code)){session=saved;await refresh();if(session)poll=setInterval(refresh,2200);}else home();}catch(err){root.innerHTML='<section class="panel"><h2>暂时无法连接行动台</h2><p>请确认主持电脑的服务正在运行，再刷新页面。</p></section>';errorMessage(err);}
