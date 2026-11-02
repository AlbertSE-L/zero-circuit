
import {randomBytes,randomInt} from 'node:crypto';
import {readFileSync, mkdirSync, readdirSync, writeFileSync, renameSync} from 'node:fs';
import {record} from '../analytics.mjs';
import {act,deal,view,mods} from './engine.mjs';
const rooms=new Map(), html=readFileSync(new URL('./index.html',import.meta.url));
const saves = new URL('../.data/gang/', import.meta.url);
mkdirSync(saves,{recursive:true});
for (const file of readdirSync(saves)) {
  if (!/^[0-9]{6}[.]json$/.test(file)) continue;
  const room = JSON.parse(readFileSync(new URL(file,saves),'utf8'));
  if (room.code + '.json' !== file) throw Error('帮派存档房号错误');
  rooms.set(room.code, room);
}
function commit(room) {
  const temp = new URL(room.code+'.tmp', saves);
  writeFileSync(temp, JSON.stringify(room), {mode:0o600});
  renameSync(temp,new URL(room.code+'.json',saves));
  rooms.set(room.code,room);
}
export async function handleGang(req,res,path){
 function json(obj,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj))}
 try{
 if(path==='/gang/'&&req.method==='GET'){record(req,res,'visit','gang');res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html)}
 if(path==='/gang/mods')return json(mods);
 if(path!=='/gang/room'||req.method!=='POST')return json({error:'页面不存在'},404);
 if(req.headers.origin&&req.headers.origin!==(process.env.RENDER_EXTERNAL_URL || 'http://'+req.headers.host))throw Error('跨站请求');
 let raw='';for await(const part of req){raw+=part;if(raw.length>4096)throw Error('请求过大')}
 const b=JSON.parse(raw), player=()=>{const name=String(b.name||'').trim().slice(0,16);if(!name)throw Error('请输入昵称');return {name,token:randomBytes(24).toString('hex')}};
 let r=rooms.get(b.code),i=r?.players.findIndex(p=>p.token===b.token)??-1;
 if(r && b.cmd!=='read')r=structuredClone(r);
 if(b.cmd==='create'){let code;do{code=String(randomInt(100000,1000000))}while(rooms.has(code));r={code,v:0,players:[player()],phase:'lobby',wins:0,losses:0,mods:[]};i=0}
 else if(!r)throw Error('房间不存在');
 else if(b.cmd==='join'){if(r.phase!=='lobby'||r.players.length>=6)throw Error('无法入座');const p=player();if(r.players.some(x=>x.name===p.name))throw Error('昵称重复');i=r.players.push(p)-1}
 else {if(i<0)throw Error('席位无效');if(b.cmd==='read'){if(b.v===r.v){res.writeHead(204,{'Cache-Control':'no-store'});return res.end()}return json(view(r,i))}if(b.v!==r.v)throw Error('桌面刚有变化，请重试');
 if(['start','next','mod','random','undo','again'].includes(b.cmd)&&i!==0)throw Error('需要房主操作');
 if(b.cmd==='undo'){if(r.phase!=='lobby'||!r.undo?.length)throw Error('没有可撤销修正');r.mods=r.undo.pop()}
 else if(['mod','random'].includes(b.cmd)){
 if(b.cmd==='random'){const pool=Object.keys(mods).filter(k=>mods[k][0]===b.value&&!r.mods.includes(k));if(!pool.length)throw Error('该组已选满');b.value=pool[randomInt(pool.length)]}
 if(r.phase!=='lobby'||!Object.hasOwn(mods,b.value))throw Error('配置无效');r.undo??=[];r.undo.push([...r.mods]);r.mods=r.mods.includes(b.value)?r.mods.filter(k=>k!==b.value):[...r.mods,b.value]}
 else if(b.cmd==='start'){if(r.phase!=='lobby'||r.players.length<3)throw Error('需要 3–6 人');r.initialMods=[...r.mods];deal(r)}
 else if(b.cmd==='next'){if(r.phase!=='result'||Math.max(r.wins,r.losses)>=3)throw Error('无法继续');deal(r)}
 else if(b.cmd==='again'){if(r.phase!=='result'||Math.max(r.wins,r.losses)!==3)throw Error('比赛未结束');r.mods=r.initialMods||r.mods;r.undo=[];Object.assign(r,{phase:'lobby',wins:0,losses:0,hands:null,board:null,history:[],chips:[],ready:[],stage:0})}
 else act(r,i,b.cmd,b.value)}
 r.v++;commit(r);if(['create','join','start'].includes(b.cmd))record(req,res,b.cmd,'gang',r.code,r.players[i].name);json({...view(r,i),...(['create','join'].includes(b.cmd)?{token:r.players[i].token}:{})})
 }catch(e){json({error:e.message},400)}
}