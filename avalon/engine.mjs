// Adapted from indie-avalon game-engine.ts and game-handler.ts, MIT.
// Transport, validation, reveal phase and safe public views are modified here.
import {randomInt} from 'node:crypto';
import {roles,playerRules,configure} from './config.mjs';

export function shuffle(array){
  const result=[...array];
  for(let i=result.length-1;i>0;i--){
    const j=randomInt(i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
export const isMissionFailed=(count,round,fails)=>fails>=(count>=7 && round===4?2:1);
export function start(room){
  if(room.phase!=='lobby' || room.players.length!==room.config.capacity)throw Error('请等所选人数全部到齐');
  room.config=configure(room.config.capacity,room.config.preset,room.config.pool);
  const pool=shuffle(room.config.pool);
  room.players.forEach((p,i)=>{p.role=pool[i]});
  room.phase='reveal';
  room.game={round:1,leader:randomInt(pool.length),team:[],teamVotes:{},missionVotes:{},revealed:[],rejects:0,history:[],proposals:[],winner:null,reason:''};
}
function finish(room,winner,reason){room.phase='finished';room.game.winner=winner;room.game.reason=reason}
export function act(room,id,cmd,value){
  const player=room.players.find(p=>p.id===id),g=room.game;
  if(!player || !g)throw Error('对局尚未开始');
  if(cmd==='reveal'){
    if(room.phase!=='reveal' || g.revealed.includes(id))throw Error('当前无法确认身份');
    g.revealed.push(id);
    if(g.revealed.length===room.players.length)room.phase='proposal';
    return;
  }
  if(cmd==='propose'){
    if(room.phase!=='proposal' || room.players[g.leader].id!==id)throw Error('只有本轮队长可提议');
    const need=playerRules[room.config.capacity].missions[g.round-1];
    if(!Array.isArray(value) || value.length!==need || new Set(value).size!==need || value.some(v=>!room.players.some(p=>p.id===v)))throw Error('请选择正确人数且不重复的队伍');
    g.team=[...value];g.teamVotes={};g.missionVotes={};room.phase='teamVote';return;
  }
  if(cmd==='vote'){
    if(room.phase!=='teamVote' || Object.hasOwn(g.teamVotes,id) || !['approve','reject'].includes(value))throw Error('当前无法提交该组队票');
    g.teamVotes[id]=value;
    if(Object.keys(g.teamVotes).length<room.players.length)return;
    const approves=Object.values(g.teamVotes).filter(v=>v==='approve').length;
    const passed=approves>room.players.length/2;
    g.proposals.push({round:g.round,leader:g.leader,team:[...g.team],votes:{...g.teamVotes},passed});
    if(passed){g.rejects=0;room.phase='mission'}
    else{
      g.rejects++;
      if(g.rejects>=5)finish(room,'EVIL','连续五次组队被否决');
      else{g.leader=(g.leader+1)%room.players.length;g.team=[];room.phase='proposal'}
    }
    g.teamVotes={};return;
  }
  if(cmd==='mission'){
    if(room.phase!=='mission' || !g.team.includes(id) || Object.hasOwn(g.missionVotes,id) || !['success','fail'].includes(value))throw Error('当前无法提交该任务票');
    if(roles[player.role].side==='GOOD' && value==='fail')throw Error('正义阵营只能出成功票');
    g.missionVotes[id]=value;
    if(Object.keys(g.missionVotes).length<g.team.length)return;
    const fails=Object.values(g.missionVotes).filter(v=>v==='fail').length;
    const passed=!isMissionFailed(room.config.capacity,g.round,fails);
    g.history.push({round:g.round,team:[...g.team],fails,passed});
    g.missionVotes={};
    const wins=g.history.filter(h=>h.passed).length;
    if(wins>=3)room.phase='assassination';
    else if(g.history.length-wins>=3)finish(room,'EVIL','三次任务失败');
    else{g.round++;g.leader=(g.leader+1)%room.players.length;g.team=[];room.phase='proposal'}
    return;
  }
  if(cmd==='assassinate'){
    if(room.phase!=='assassination' || player.role!=='ASSASSIN')throw Error('只有刺客可执行刺杀');
    const target=room.players.find(p=>p.id===value);
    if(!target || target.id===id)throw Error('请选择另一名玩家');
    g.assassinated=target.id;
    finish(room,target.role==='MERLIN'?'EVIL':'GOOD',target.role==='MERLIN'?'刺客命中梅林':'三次任务成功，刺客未命中梅林');return;
  }
  throw Error('操作无效');
}
// Build explicit per-player views. Never serialize room state or secret votes.
export function view(room,id){
  const me=room.players.find(p=>p.id===id),g=room.game;
  if(!me)throw Error('席位无效');
  const vision=[];
  if(g)for(const p of room.players){
    if(p.id===id)continue;
    let cue=null;
    if(me.role==='MERLIN' && roles[p.role].side==='EVIL' && p.role!=='MORDRED')cue='邪恶阵营';
    else if(me.role==='PERCIVAL' && ['MERLIN','MORGANA'].includes(p.role))cue='梅林 / 莫甘娜候选';
    else if(roles[me.role].side==='EVIL' && me.role!=='OBERON' && roles[p.role].side==='EVIL' && p.role!=='OBERON')cue='邪恶同伴';
    if(cue)vision.push({id:p.id,cue});
  }
  return {
    code:room.code,v:room.v,hostId:room.hostId,phase:room.phase,config:room.config,me:id,
    players:room.players.map(p=>({id:p.id,name:p.name,role:room.phase==='finished'||p.id===id?p.role:null})),
    vision,
    game:g?{round:g.round,leader:g.leader,team:g.team,revealed:g.revealed,rejects:g.rejects,history:g.history,proposals:g.proposals,winner:g.winner,reason:g.reason,assassinated:g.assassinated,
      submitted:room.phase==='teamVote'?Object.keys(g.teamVotes):room.phase==='mission'?Object.keys(g.missionVotes):[]}:null
  };
}
