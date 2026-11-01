import {randomInt,randomBytes} from 'node:crypto';
import skillModules from './skills.mjs';
export const rulesInfo={id:'ordered-pairs-v1',name:'有序回路',version:'1.0',minPlayers:2,maxPlayers:5};
const uid=()=>randomBytes(8).toString('hex');
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function startGame(players,challenge,firstPlayerId) {
  if(players.length<2 || players.length>5)throw new Error('需要 2–5 名玩家');
  const deck=[];
  for(let value=1;value<=challenge.maxValue;value++)for(let n=0;n<challenge.copies;n++)deck.push({id:uid(),kind:'blue',value,sort:value});
  const specials=[];
  for(let i=0;i<challenge.amber+challenge.red;i++)specials.push(i+1);
  shuffle(specials);
  for(let i=0;i<challenge.amber;i++)deck.push({id:uid(),kind:'amber',value:Math.min(challenge.maxValue-.5,specials[i]+.5),sort:Math.min(challenge.maxValue-.5,specials[i]+.5)});
  for(let i=0;i<challenge.red;i++)deck.push({id:uid(),kind:'red',value:Math.min(challenge.maxValue-.25,specials[challenge.amber+i]+.25),sort:Math.min(challenge.maxValue-.25,specials[challenge.amber+i]+.25)});
  const skillPool=challenge.id==="full-grid"?shuffle([...skillModules]):skillModules;shuffle(deck);players.forEach((p,i)=>{p.hand=[];p.notes=[];p.beaconUsed=false;p.skill=skillPool[i%skillPool.length].id;p.skillUsed=false;});
  deck.forEach((tile,i)=>players[i%players.length].hand.push(tile));
  for(const p of players){p.hand.sort((a,b)=>a.sort-b.sort);p.hand.forEach((tile,i)=>Object.assign(tile,{owner:p.id,ownerName:p.name,slot:i+1,removed:false,hint:null}));}
  return {challengeId:challenge.id,fuse:challenge.fuse,maxFuse:challenge.fuse,shield:false,status:'playing',turn:Math.max(0,players.findIndex(p=>p.id===firstPlayerId)),moves:0,logs:['回路已分配。每人可免费公开一条蓝线的数字，然后开始合作。'],reason:''};
}
const match=(a,b)=>a.kind==='amber'&&b.kind==='amber'||a.kind==='blue'&&b.kind==='blue'&&a.value===b.value;
export function tilesOf(players){return players.flatMap(p=>p.hand);}
function assess(game,players){
  if(game.status!=='playing')return;
  if(tilesOf(players).every(t=>t.removed||t.kind==='red')){game.status='won';game.reason='所有可修复回路已接通，设备重新上线！';game.logs.push(game.reason);}
  else if(game.fuse<=0){game.status='lost';game.reason='容错耗尽，系统进入保护停机。';game.logs.push(game.reason);}
}
function advance(game,players){game.moves++;assess(game,players);if(game.status==='playing')game.turn=(game.turn+1)%players.length;game.logs=game.logs.slice(-60);}
export function applyAction(game,players,playerId,action) {
  const player=players.find(p=>p.id===playerId);if(!player)throw new Error('玩家不存在');
  if(game.status!=='playing')throw new Error('本局已经结束');
  const all=tilesOf(players),find=id=>all.find(t=>t.id===id);
  if(action.type==='beacon'){
    if(player.beaconUsed)throw new Error('每人每局只能公开一次初始提示');
    const t=find(action.ownId);if(!t||t.owner!==player.id||t.removed||t.kind!=='blue')throw new Error('请选择自己尚未拆除的一条蓝色数字线');
    t.hint=String(t.value);player.beaconUsed=true;game.logs.push(`${player.name} 公开了自己 ${t.slot} 号位的数字 ${t.value}。`);return;
  }
  if(players[game.turn].id!==playerId)throw new Error('还没有轮到你');
  if(action.type==='pair') {
    const own=find(action.ownId),target=find(action.targetId);
    if(!own||own.owner!==player.id||own.removed||own.kind==='red')throw new Error('请选择自己尚未拆除的蓝线或琥珀线');
    if(!target||target.owner===player.id||target.removed)throw new Error('请选择一条队友尚未拆除的线路');
    if(target.kind==='red'){target.hint='危险';game.status='lost';game.reason='触碰红色危险线路，系统紧急停机。';game.logs.push(`${player.name} 触碰了 ${target.ownerName} 的 ${target.slot} 号危险线。`);}
    else if(match(own,target)){own.removed=target.removed=true;game.logs.push(`${player.name} 成功接通 ${own.kind==='amber'?'琥珀':own.value} 回路（${target.ownerName} ${target.slot} 号位）。`);}
    else {target.hint=target.kind==='amber'?'琥珀':String(target.value);if(game.shield){game.shield=false;game.logs.push(`${player.name} 配对失误，绝缘层抵消了本次容错损失。`);}else{game.fuse--;game.logs.push(`${player.name} 配对失误，消耗 1 格容错。`);}}
  } else if(action.type==='solo') {
    const own=find(action.ownId);if(!own||own.owner!==player.id||own.removed||own.kind==='red')throw new Error('请选择自己的可修复线路');
    const remaining=all.filter(t=>!t.removed&&match(own,t));
    if(remaining.length<2||remaining.length%2||remaining.some(t=>t.owner!==player.id))throw new Error('只有该类型所有剩余线路都在你手上时，才能执行本地自检');
    remaining.forEach(t=>t.removed=true);game.logs.push(`${player.name} 本地自检，接通 ${remaining.length} 条${own.kind==='amber'?'琥珀':own.value}线。`);
  } else if(action.type==='skill') {
    if(player.skillUsed)throw new Error('本局技能已使用');
    const skill=skillModules.find(s=>s.id===player.skill);if(!skill)throw new Error('技能不存在');
    skill.apply({game,player,target:find(action.targetId),players});player.skillUsed=true;
  } else if(action.type==='pass'){game.logs.push(`${player.name} 暂缓操作，将行动交给队友。`);}
  else throw new Error('不支持的操作');
  advance(game,players);
}
export function playerView(room,viewerId) {
  const viewer=room.players.find(p=>p.id===viewerId);if(!viewer)throw new Error('无权访问房间');
  return {code:room.code,version:room.version,hostId:room.hostId,capacity:room.capacity,challengeId:room.challengeId,viewerId,
    players:room.players.map(p=>({id:p.id,name:p.name,skill:p.skill,skillUsed:p.skillUsed,beaconUsed:p.beaconUsed,hand:(p.hand||[]).map(t=>({id:t.id,slot:t.slot,removed:t.removed,hint:t.hint,...(p.id===viewerId||t.removed?{kind:t.kind,value:t.value}:{})}))})),
    notes:viewer.notes||[],game:room.game?{...room.game}:null};
}
