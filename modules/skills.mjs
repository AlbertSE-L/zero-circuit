// Each ability owns its validation/effect. No public view may contain another player's notes.
export default [
  {id:'spectrum',name:'光谱探针',description:'私下探测一条队友未拆线路的颜色。消耗本次行动。',target:true,
    apply({game,player,target}) {
      if(!target || target.owner===player.id || target.removed)throw new Error('请选择一条队友尚未拆除的线路');
      const kind={blue:'蓝色数字线',amber:'琥珀线',red:'红色危险线'}[target.kind];
      player.notes.push({text:`光谱探针：${target.ownerName} 的 ${target.slot} 号位是${kind}。`,tileId:target.id,kind:target.kind});
      game.logs.push(`${player.name} 使用了光谱探针，结果仅本人可见。`);
    }},
  {id:'insulate',name:'绝缘涂层',description:'团队下一次普通配对失误不消耗容错。无法防护红线。消耗本次行动。',target:false,
    apply({game,player}) {if(game.shield)throw new Error('团队已有一层绝缘防护');game.shield=true;game.logs.push(`${player.name} 为团队加上了一层绝缘防护。`);}},
  {id:'recharge',name:'应急稳压',description:'恢复 1 格容错，不能超过初始上限。消耗本次行动。',target:false,
    apply({game,player}) {if(game.fuse>=game.maxFuse)throw new Error('当前容错已满，暂不需要恢复');game.fuse++;game.logs.push(`${player.name} 恢复了 1 格容错。`);}}
  ,{id:'phase',name:'相位采样',description:'私下获知选定线路的蓝线数字奇偶，特殊线只显示非数字。',target:true,
    apply({player,target,game}) {
      if(!target||target.owner===player.id||target.removed) throw new Error('请选择队友未拆线路');
      const hint=target.kind==='blue'?(target.value%2?'奇数':'偶数'):'非数字';
      player.notes.push({text:target.ownerName+' 的 '+target.slot+' 号位：'+hint});
      game.logs.push(player.name+' 完成相位采样。');
    }},
  {id:'relay',name:'信标复位',description:'重新启用自己已使用的公开提示。',target:false,
    apply({player,game}) {
      if(!player.beaconUsed) throw new Error('请先使用初始公开提示');
      player.beaconUsed=false;
      game.logs.push(player.name+' 的信标已经复位。');
    }}
];
