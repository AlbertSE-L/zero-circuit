import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from '../server.mjs';
import {startGame,applyAction,playerView} from '../modules/rules.mjs';
import challenges from '../modules/challenges.mjs';

function fixture(){
  const t=(id,owner,value,kind='blue',slot=1)=>({id,owner,ownerName:owner,value,kind,slot,removed:false,hint:null});
  const players=[{id:'a',name:'a',hand:[t('a1','a',1),t('a2','a',2,'blue',2)],notes:[],skill:'spectrum',skillUsed:false,beaconUsed:false},
    {id:'b',name:'b',hand:[t('b1','b',1),t('b3','b',3,'blue',2),t('red','b',3.25,'red',3)],notes:[],skill:'insulate',skillUsed:false,beaconUsed:false}];
  return {players,game:{status:'playing',turn:0,fuse:3,maxFuse:4,shield:false,moves:0,logs:[],reason:''}};
}
test('数字配对、错误提示、红线失败及回合限制',()=>{
  let {players,game}=fixture();applyAction(game,players,'a',{type:'pair',ownId:'a1',targetId:'b1'});assert.ok(players[0].hand[0].removed);assert.equal(game.turn,1);assert.equal(game.fuse,3);
  assert.throws(()=>applyAction(game,players,'a',{type:'pass'}),/还没有轮到/);
  ({players,game}=fixture());applyAction(game,players,'a',{type:'pair',ownId:'a1',targetId:'b3'});assert.equal(game.fuse,2);assert.equal(players[1].hand[1].hint,'3');assert.equal(players[0].hand[0].removed,false);
  ({players,game}=fixture());game.shield=true;applyAction(game,players,'a',{type:'pair',ownId:'a1',targetId:'red'});assert.equal(game.status,'lost');
});
test('绝缘、初始提示、私人探测及一次性技能',()=>{
  let {players,game}=fixture();applyAction(game,players,'b',{type:'beacon',ownId:'b3'});assert.equal(game.turn,0);assert.equal(game.moves,0);assert.equal(players[1].hand[1].hint,'3');assert.throws(()=>applyAction(game,players,'b',{type:'beacon',ownId:'b1'}));
  applyAction(game,players,'a',{type:'skill',targetId:'red'});assert.equal(players[0].notes[0].kind,'red');assert.equal(players[0].skillUsed,true);
  const room={players,game,code:'123456',hostId:'a',version:1};const bView=playerView(room,'b');assert.equal(bView.notes.length,0);assert.equal(bView.players[0].hand[0].value,undefined);assert.equal(bView.players[0].hand[0].kind,undefined);assert.equal(JSON.stringify(bView).includes('tileId'),false);
  applyAction(game,players,'b',{type:'skill'});assert.equal(game.shield,true);
  applyAction(game,players,'a',{type:'pair',ownId:'a1',targetId:'b3'});assert.equal(game.fuse,3);assert.equal(game.shield,false);
  applyAction(game,players,'b',{type:'pass'});assert.throws(()=>applyAction(game,players,'a',{type:'skill',targetId:'b3'}),/已使用/);
});
test('本地自检仅限全部剩余同类型在本人手中；正确结束',()=>{
  const {players,game}=fixture();assert.throws(()=>applyAction(game,players,'a',{type:'solo',ownId:'a1'}),/所有剩余/);
  players[0].hand=[{...players[0].hand[0],id:'a1'},{...players[0].hand[0],id:'a11',slot:2}];players[1].hand=players[1].hand.filter(t=>t.kind==='red');
  applyAction(game,players,'a',{type:'solo',ownId:'a1'});assert.equal(game.status,'won');assert.equal(game.moves,1);
});
test('琥珀按类型匹配；容错归零失败；稳压不超过上限',()=>{
  let {players,game}=fixture();players[0].hand[0].kind='amber';players[1].hand[0].kind='amber';players[1].hand[0].value=4.5;applyAction(game,players,'a',{type:'pair',ownId:'a1',targetId:'b1'});assert.equal(players[1].hand[0].removed,true);
  ({players,game}=fixture());game.fuse=1;applyAction(game,players,'a',{type:'pair',ownId:'a1',targetId:'b3'});assert.equal(game.status,'lost');
  ({players,game}=fixture());players[0].skill='recharge';applyAction(game,players,'a',{type:'skill'});assert.equal(game.fuse,4);
  ({players,game}=fixture());players[0].skill='recharge';game.fuse=4;assert.throws(()=>applyAction(game,players,'a',{type:'skill'}));assert.equal(players[0].skillUsed,false);
});
test('各关卡在 2–5 人时发牌守恒、排序正确、蓝线各四份',()=>{
  for(const c of challenges)for(let count=2;count<=5;count++){
    const players=Array.from({length:count},(_,i)=>({id:String(i),name:'P'+i}));startGame(players,c,'0');const all=players.flatMap(p=>p.hand);
    assert.equal(all.length,c.maxValue*c.copies+c.amber+c.red);assert.equal(new Set(all.map(t=>t.id)).size,all.length);
    for(let v=1;v<=c.maxValue;v++)assert.equal(all.filter(t=>t.kind==='blue'&&t.value===v).length,4);
    for(const p of players)assert.deepEqual(p.hand.map(t=>t.sort),p.hand.map(t=>t.sort).toSorted((a,b)=>a-b));
  }
});

test('API：持久化恢复、鉴权、状态版本保护、错误回滚和玩家隔离',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'zero-circuit-test-')),dataDir=pathToFileURL(dir+'/');let server;
  t.after(async()=>{if(server?.listening)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
  async function boot(){server=createServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;}
  let base=await boot();
  async function req(path,method='GET',body,token){const res=await fetch(base+'/api'+path,{method,headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};}
  assert.equal((await fetch(base+'/')).status,200);
  const a=(await req('/rooms','POST',{name:'Alpha',capacity:2,challengeId:'first-light'})).data,path='/rooms/'+a.room.code;
  assert.equal((await req(path)).status,403);
  assert.equal((await req(path+'/start','POST',{version:a.room.version},a.token)).status,400);
  const b=(await req(path+'/join','POST',{name:'Beta'})).data;
  assert.equal((await req(path+'/start','POST',{version:b.room.version},b.token)).status,403);
  assert.equal((await req(path+'/start','POST',{version:a.room.version},a.token)).status,409);
  const started=await req(path+'/start','POST',{version:b.room.version},a.token);assert.equal(started.status,200);
  const v=started.data.version;assert.equal(started.data.players[1].hand[0].value,undefined);assert.equal(started.data.players[0].token,undefined);assert.equal(started.data.players[0].hand[0].kind,'blue');
  const before=readFileSync(join(dir,a.room.code+'.json'),'utf8');const invalid=await req(path+'/action','POST',{version:v,action:{type:'pair',ownId:'bad',targetId:'bad'}},a.token);assert.equal(invalid.status,400);assert.equal(readFileSync(join(dir,a.room.code+'.json'),'utf8'),before);
  const pass=await req(path+'/action','POST',{version:v,action:{type:'pass'}},a.token);assert.equal(pass.status,200);
  assert.equal((await req(path+'/action','POST',{version:v,action:{type:'pass'}},a.token)).status,409);
  await new Promise(r=>server.close(r));base=await boot();const restored=await req(path,'GET',null,b.token);assert.equal(restored.status,200);assert.equal(restored.data.game.moves,1);assert.equal(restored.data.players[0].hand[0].value,undefined);
  assert.equal((await req(path+'/reset','POST',{version:restored.data.version},b.token)).status,403);
  const reset=await req(path+'/reset','POST',{version:restored.data.version},a.token);assert.equal(reset.data.game,null);assert.equal(reset.data.players[0].hand.length,0);
  const cross=await fetch(base+'/api'+path+'/reset',{method:'POST',headers:{Origin:'http://other.example','Content-Type':'application/json',Authorization:'Bearer '+a.token},body:JSON.stringify({version:reset.data.version})});assert.equal(cross.status,403);
});
