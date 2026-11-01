// Original challenge parameters. The engine does not depend on particular missions.
export default [
  {id:'first-light',name:'01 · 唤醒灯塔',tag:'训练',description:'安静的海岸灯塔等待重启。先熟悉数字、顺序与合作配对。',maxValue:6,copies:4,amber:0,red:0,fuse:4,skills:true},
  {id:'amber-bridge',name:'02 · 琥珀栈桥',tag:'进阶',description:'两段琥珀线路混入码头设备。它们数值不同，却属于同一配对类型。',maxValue:8,copies:4,amber:2,red:0,fuse:4,skills:true},
  {id:'silent-orbit',name:'03 · 静默轨道',tag:'挑战',description:'轨道通信站出现两段红色危险线路。避开它们，修复其余全部回路。',maxValue:9,copies:4,amber:2,red:2,fuse:4,skills:true}
,{id:'full-grid',name:'04 · 十二频段',tag:'专家',description:'在全城十二个频段之间，避开危险并恢复通信。',maxValue:12,copies:4,amber:4,red:3,fuse:4,skills:true}];
