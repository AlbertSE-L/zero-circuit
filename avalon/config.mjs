// Role vocabulary and mission sizes adapted from indie-avalon (MIT).
// Add roles here, implement their vision/action in engine.mjs, then add a preset.
export const roles = {
  MERLIN: {name:'梅林', side:'GOOD', description:'看见除莫德雷德外的邪恶玩家，隐藏自己以躲避刺杀。'},
  PERCIVAL: {name:'派西维尔', side:'GOOD', description:'看见梅林与莫甘娜的候选位置，无法区分两者。'},
  LOYAL_SERVANT: {name:'忠臣', side:'GOOD', description:'没有额外视野，通过组队和投票推理。'},
  ASSASSIN: {name:'刺客', side:'EVIL', description:'认识除奥伯伦外的邪恶同伴，善方三胜后可刺杀梅林。'},
  MORGANA: {name:'莫甘娜', side:'EVIL', description:'在派西维尔眼中与梅林相同，认识除奥伯伦外的邪恶同伴。'},
  MORDRED: {name:'莫德雷德', side:'EVIL', description:'梅林看不见你，认识除奥伯伦外的邪恶同伴。'},
  OBERON: {name:'奥伯伦', side:'EVIL', description:'不认识邪恶同伴，同伴也不认识你，但梅林能看见你。'},
  MINION: {name:'爪牙', side:'EVIL', description:'认识除奥伯伦外的邪恶同伴。'}
};
export const playerRules = {
  5: {evil:2, missions:[2,3,2,3,3]},
  6: {evil:2, missions:[2,3,4,3,4]},
  7: {evil:3, missions:[2,3,3,4,4]},
  8: {evil:3, missions:[3,4,4,5,5]},
  9: {evil:3, missions:[3,4,4,5,5]},
  10: {evil:4, missions:[3,4,4,5,5]}
};
export const presets = [
  {id:'basic', name:'基础局', min:5, special:['MERLIN','ASSASSIN'], description:'梅林、刺客，其余补齐忠臣和爪牙。'},
  {id:'classic', name:'梅派经典局', min:5, special:['MERLIN','PERCIVAL','ASSASSIN','MORGANA'], description:'梅林、派西维尔、刺客、莫甘娜。'},
  {id:'mordred', name:'莫德雷德局', min:7, special:['MERLIN','PERCIVAL','ASSASSIN','MORGANA','MORDRED'], description:'经典局加入梅林无法看见的莫德雷德。'},
  {id:'oberon', name:'奥伯伦局', min:7, special:['MERLIN','PERCIVAL','ASSASSIN','MORGANA','OBERON'], description:'经典局加入不与邪恶同伴互认的奥伯伦。'},
  {id:'custom', name:'自定义角色', min:5, special:[], description:'选择角色数量，总人数和阵营比例必须符合所选人数。'}
];
export function configure(capacity, presetId, custom){
  if(!Number.isInteger(capacity) || !playerRules[capacity])throw Error('人数请选择 5–10 人');
  const preset=presets.find(p=>p.id===presetId);
  if(!preset || capacity<preset.min)throw Error('该版型不适用于当前人数');
  let pool;
  if(preset.id==='custom'){
    if(!Array.isArray(custom) || custom.some(key=>!Object.hasOwn(roles,key)))throw Error('自定义角色无效');
    pool=[...custom];
  }else{
    pool=[...preset.special];
    const evil=pool.filter(key=>roles[key].side==='EVIL').length;
    const good=pool.length-evil;
    pool.push(...Array(playerRules[capacity].evil-evil).fill('MINION'));
    pool.push(...Array(capacity-playerRules[capacity].evil-good).fill('LOYAL_SERVANT'));
  }
  if(pool.length!==capacity || pool.filter(key=>roles[key].side==='EVIL').length!==playerRules[capacity].evil)throw Error('角色总数或好坏阵营人数不匹配');
  for(const key of Object.keys(roles)){
    const count=pool.filter(role=>role===key).length;
    if(!['MINION','LOYAL_SERVANT'].includes(key) && count>1)throw Error('特殊角色不可重复');
  }
  if(!pool.includes('MERLIN') || !pool.includes('ASSASSIN'))throw Error('当前规则需要一名梅林和一名刺客');
  return {capacity,preset:preset.id,pool};
}
export const catalog = {roles,playerRules,presets};
