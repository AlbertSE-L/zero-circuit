import {randomInt} from 'node:crypto';
export const types=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
export const mods={
  suited:['增益','同色电报','公开每人的两张底牌是否同花色'],
  pair:['增益','对子信号','公开每人的底牌是否成对'],
  face:['增益','人像扫描','公开每人底牌中 J/Q/K 的数量'],
  ace:['增益','王牌雷达','公开每人是否持有 A'],
  gap:['增益','邻位暗号','公开每人的底牌点数是否相邻（A 算高）'],
  oracle:['增益','掌上分析仪','翻牌后私下显示自己当前最佳牌型'],
  peek:['增益','先遣侦察','翻牌前先公开第一张公共牌'],
  color:['增益','双色印记','公开每人底牌中红色牌的张数'],
  fog:['减益','雾中足迹','隐藏前几轮的筹码分配历史'],
  lock:['减益','单向保险','已被领取的筹码不能抢，只能由持有者主动退回'],
  blind:['减益','遮蔽河道','河牌轮隐藏最后一张公共牌，验牌时公开'],
  turn:['减益','静默转角','转牌轮暂不展示第四张公共牌'],
  mute:['减益','无声筹码','选筹码时隐藏其他持有人姓名，只显示是否被占用'],
  fixed:['减益','落子无悔','每人每轮只能领取一次，且不能退回或抢夺'],
  late:['减益','延迟开箱','第一轮隐藏自己的第二张底牌'],
  suitfog:['减益','花色干扰','行动中公共牌只显示点数，验牌时恢复花色']
};
const ranks='23456789TJQKA', suits='♠♥♦♣';
export const label=c=>ranks[c%13].replace('T','10')+suits[Math.floor(c/13)];
export function strength(cards){
 if(cards.length>5){let best=-1;for(let i=0;i<cards.length;i++)best=Math.max(best,strength(cards.filter((_,j)=>i!==j)));return best}
 const rs=cards.map(c=>c%13+2).sort((a,b)=>b-a), groups=[...new Set(rs)].sort((a,b)=>rs.filter(x=>x===b).length-rs.filter(x=>x===a).length||b-a);
 const counts=groups.map(v=>rs.filter(x=>x===v).length);
 const flush=cards.every(c=>Math.floor(c/13)===Math.floor(cards[0]/13));
 const straight=groups.length===5?(rs[0]-rs[4]===4?rs[0]:rs.join()==='14,5,4,3,2'?5:0):0;
 const cat=flush&&straight?8:counts[0]===4?7:counts[0]===3&&counts[1]===2?6:flush?5:straight?4:counts[0]===3?3:counts[0]===2&&counts[1]===2?2:counts[0]===2?1:0;
 const kick=straight&&[4,8].includes(cat)?[straight]:groups;
 return [0,1,2,3,4].reduce((n,i)=>n*15+(kick[i]||0),cat)
}
export function deal(r){
 const deck=Array.from({length:52},(_,i)=>i);
 for(let i=51;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]]}
 r.hands=r.players.map(()=>deck.splice(0,2));r.board=deck.splice(0,5);const dealt=[...r.hands.flat(),...r.board];if(new Set(dealt).size!==dealt.length)throw Error('牌堆重复，取消发牌');r.events=[];r.stage=0;r.phase='play';r.chips=r.players.map(()=>0);r.history=[];r.ready=[];
}
export function act(r,i,cmd,value){
 if(r.phase!=='play')throw Error('当前不在选筹阶段');
 if(cmd==='chip'){
 if(!Number.isInteger(value)||value<0||value>r.players.length)throw Error('筹码无效');
 const owner=r.chips.indexOf(value), old=r.chips[i];
 if(value===old)throw Error('牌力强度未改变');
 if(r.mods.includes('fixed')&&(r.chips[i]||!value||owner>=0))throw Error('本轮只能领取空闲筹码一次');
 if(value&&owner>=0&&owner!==i){if(r.mods.includes('lock'))throw Error('请等待持有人退回');r.chips[owner]=0}
  r.events??=[];
 const who=r.players[i].name, action=!value?'退回了 '+old:value&&owner>=0?'从 '+r.players[owner].name+' 手中抢走了 '+value:'从桌面拿起了 '+value;
 r.events.push({stage:r.stage,text:who+' '+action+' 号牌力筹码'+(old&&value?'，原 '+old+' 号退回桌面':'')});
 r.chips[i]=value;r.ready=[];return;
 } else
 if(cmd!=='ready'||r.chips.includes(0))throw Error('全员各持一枚筹码才能确认');

 if(!r.ready.includes(i))r.ready.push(i);
 if(r.ready.length<r.players.length)return;
 r.history.push([...r.chips]);r.ready=[];
 if(r.stage<3){r.stage++;r.chips.fill(0);return}
 const scores=r.hands.map(h=>strength([...h,...r.board]));
 const ordered=r.chips.map((_,j)=>j).sort((a,b)=>r.chips[a]-r.chips[b]);
 r.success=ordered.every((j,k)=>!k||scores[ordered[k-1]]<=scores[j]);
 r.success?r.wins++:r.losses++;r.phase='result'
}
export function view(r,i){
 const end=r.phase==='result', has=k=>r.mods.includes(k), visible=[has('peek')?1:0,3,has('turn')?3:4,has('blind')?4:5][r.stage]||0;
 const board=(r.board||[]).slice(0,end?5:visible);
 return {events:(r.events||[]).filter(event=>end||!has('mute')&&(!has('fog')||event.stage===r.stage)),canUndo:i===0 && !!r.undo?.length,code:r.code,v:r.v,me:i,phase:r.phase,stage:r.stage,mods:r.mods,wins:r.wins,losses:r.losses,success:r.success,ready:r.ready||[],history:has('fog')&&!end?[]:r.history||[],occupied:(r.chips||[]).filter(Boolean),board:board.map(c=>has('suitfog')&&!end?label(c).slice(0,-1)+'？':label(c)),players:r.players.map((p,j)=>{
 const h=r.hands?.[j]||[],[a,b]=h, hints=[];
 if(h.length){for(const [key,text] of Object.entries({suited:'同花色 '+(Math.floor(a/13)===Math.floor(b/13)?'是':'否'),pair:'口袋对子 '+(a%13===b%13?'是':'否'),ace:'持 A '+(h.some(c=>c%13===12)?'是':'否'),gap:'相邻 '+(Math.abs(a%13-b%13)===1?'是':'否'),face:'人像 '+h.filter(c=>c%13>=9&&c%13<=11).length,color:'红牌 '+h.filter(c=>[1,2].includes(Math.floor(c/13))).length}))if(has(key))hints.push(text)}
 const score=end||j===i&&has('oracle')&&board.length>=3&&!has('suitfog')?strength([...h,...board]):null;
 return {name:p.name,chip:!end&&has('mute')&&i!==j?null:r.chips?.[j],hand:end||j===i?h.slice(0,!end&&has('late')&&r.stage===0?1:2).map(label):[],hints,category:score===null?'':types[Math.floor(score/15**5)],score:end?score:null}
 })}
}
