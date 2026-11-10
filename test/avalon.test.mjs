import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {configure,roles,playerRules,presets} from '../avalon/config.mjs';
import {act,start,view,isMissionFailed} from '../avalon/engine.mjs';
import {createServer} from '../server.mjs';

function room(count=5){
  const r={code:'123456',v:1,phase:'lobby',hostId:'0',players:Array.from({length:count},(_,i)=>({id:String(i),name:'玩家'+i,token:'secret-'+i,role:null})),config:configure(count,'classic')};
  start(r);
  for(const p of r.players)act(r,p.id,'reveal');
  return r;
}
test('阿瓦隆：5–10 人版型、阵营数量、自定义角色、第四任务门槛',()=>{
  for(let n=5;n<=10;n++)for(const preset of presets.filter(p=>p.id!=='custom'&&p.min<=n)){
    const c=configure(n,preset.id);
    assert.equal(c.pool.length,n);
    assert.equal(c.pool.filter(key=>roles[key].side==='EVIL').length,playerRules[n].evil);
    assert.equal(c.pool.filter(key=>key==='ASSASSIN').length,1);
    assert.equal(c.pool.filter(key=>key==='MERLIN').length,1);
    assert.equal(isMissionFailed(n,4,1),n<7);
    assert.equal(isMissionFailed(n,4,2),true);
  }
  const c=configure(7,'oberon');assert.deepEqual(configure(7,'custom',c.pool).pool,c.pool);
  assert.throws(()=>configure(5,'mordred'));
  assert.throws(()=>configure(5,'custom',Array(5).fill('MERLIN')));
  assert.throws(()=>configure(11,'classic'));
});
test('阿瓦隆：角色视野、身份令牌及秘密任务票隔离',()=>{
  const r=room(10);
  r.players.forEach((p,i)=>p.role=['MERLIN','PERCIVAL','LOYAL_SERVANT','LOYAL_SERVANT','LOYAL_SERVANT','LOYAL_SERVANT','ASSASSIN','MORGANA','MORDRED','OBERON'][i]);
  const seen=id=>view(r,id).vision.map(v=>v.id);
  assert.deepEqual(seen('0'),['6','7','9']);assert.deepEqual(seen('1'),['0','7']);
  assert.deepEqual(seen('6'),['7','8']);assert.deepEqual(seen('9'),[]);assert.deepEqual(seen('2'),[]);
  r.game.teamVotes={'0':'approve'};r.game.missionVotes={'6':'fail'};
  for(const p of r.players){
    const v=view(r,p.id);
    assert.ok(!JSON.stringify(v).includes('secret-'));
    assert.equal(v.game.teamVotes,undefined);assert.equal(v.game.missionVotes,undefined);
    assert.ok(v.players.filter(x=>x.id!==p.id).every(x=>x.role===null));
  }
  r.phase='finished';assert.ok(view(r,'0').players.every(p=>p.role));assert.equal(view(r,'0').game.missionVotes,undefined);
});
test('阿瓦隆：五次否决、三胜刺杀、刺客权限及好人任务票校验',()=>{
  let r=room();
  for(let attempt=0;attempt<5;attempt++){
    assert.throws(()=>act(r,String((r.game.leader+1)%5),'propose',['0','1']));
    act(r,String(r.game.leader),'propose',['0','1']);
    assert.throws(()=>act(r,'0','vote','invalid'));
    for(const p of r.players)act(r,p.id,'vote','reject');
  }
  assert.equal(r.game.winner,'EVIL');assert.equal(r.phase,'finished');
  for(const hit of [true,false]){
    r=room();
    for(let round=0;round<3;round++){
      const team=r.players.slice(0,playerRules[5].missions[round]).map(p=>p.id);
      act(r,String(r.game.leader),'propose',team);
      for(const p of r.players)act(r,p.id,'vote','approve');
      const good=r.players.find(p=>team.includes(p.id)&&roles[p.role].side==='GOOD');
      // A random 2-player team can contain both evil players.
      if(good)assert.throws(()=>act(r,good.id,'mission','fail'));
      for(const id of team)act(r,id,'mission','success');
    }
    assert.equal(r.phase,'assassination');
    const assassin=r.players.find(p=>p.role==='ASSASSIN'),merlin=r.players.find(p=>p.role==='MERLIN');
    assert.throws(()=>act(r,merlin.id,'assassinate',assassin.id));
    act(r,assassin.id,'assassinate',hit?merlin.id:r.players.find(p=>p.id!==assassin.id&&p.id!==merlin.id).id);
    assert.equal(r.game.winner,hit?'EVIL':'GOOD');
  }
});
test('阿瓦隆 API：多人、版本冲突、重启恢复、非法操作和身份隔离',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'avalon-test-')),dataDir=pathToFileURL(directory+'/');
  let server,base;
  async function boot(){server=createServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port}
  t.after(async()=>{if(server?.listening)await new Promise(r=>server.close(r));rmSync(directory,{recursive:true,force:true})});
  await boot();
  async function request(cmd,extra={}){
    const response=await fetch(base+'/avalon/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cmd,...extra})});
    return {status:response.status,data:response.status===204?null:await response.json()};
  }
  assert.equal((await fetch(base+'/avalon/')).status,200);
  assert.equal((await fetch(base+'/avalon/app.js')).status,200);
  let result=await request('create',{name:'Host',capacity:5,preset:'classic'});
  const code=result.data.code,seats=[result.data.token];
  for(let i=1;i<5;i++){result=await request('join',{code,name:'Guest'+i});seats.push(result.data.token)}
  assert.equal((await request('start',{code,token:seats[1],v:result.data.v})).status,403);
  assert.equal((await request('start',{code,token:seats[0],v:1})).status,409);
  result=await request('start',{code,token:seats[0],v:result.data.v});assert.equal(result.data.phase,'reveal');
  for(const token of seats){
    const read=await request('read',{code,token});assert.equal(read.status,200);
    assert.equal(read.data.players.filter(p=>p.role).length,1);
    result=await request('reveal',{code,token,v:read.data.v});assert.equal(result.status,200);
  }
  assert.equal(result.data.phase,'proposal');
  const v=result.data.v,leaderSeat=seats[result.data.game.leader],team=result.data.players.slice(0,2).map(p=>p.id);
  assert.equal((await request('propose',{code,token:leaderSeat,v,value:[team[0],team[0]]})).status,400);
  result=await request('propose',{code,token:leaderSeat,v,value:team});assert.equal(result.status,200);
  result=await request('vote',{code,token:seats[0],v:result.data.v,value:'approve'});assert.equal(result.status,200);
  assert.equal(JSON.stringify(result.data).includes('approve'),false);
  assert.equal((await request('vote',{code,token:seats[0],v:result.data.v,value:'reject'})).status,400);
  const version=result.data.v;
  await new Promise(r=>server.close(r));await boot();
  const restored=await request('read',{code,token:seats[0]});assert.equal(restored.data.v,version);assert.equal(restored.data.game.submitted.length,1);
  const other=await request('read',{code,token:seats[1]});assert.ok(other.data.players.filter(p=>p.id!==other.data.me).every(p=>p.role===null));
  assert.equal((await request('read',{code,token:'bad'})).status,403);
  const cross=await fetch(base+'/avalon/room',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:JSON.stringify({cmd:'read',code,token:seats[0]})});assert.equal(cross.status,403);
});
