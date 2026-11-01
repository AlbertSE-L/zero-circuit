import http from 'node:http';
import {handleGang} from './gang/handler.mjs';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {randomBytes,randomInt} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import challenges from './modules/challenges.mjs';
import skills from './modules/skills.mjs';
import {rulesInfo,startGame,applyAction,playerView} from './modules/rules.mjs';
const base=new URL('./',import.meta.url),secret=()=>randomBytes(24).toString('hex'),id=()=>randomBytes(8).toString('hex');
export function createServer({dataDir=new URL('./.data/',base)}={}) {
  mkdirSync(dataDir,{recursive:true});const rooms=new Map(),rate=new Map();
  for(const file of readdirSync(dataDir))if(/^\d{6}\.json$/.test(file)) {
    try{const room=JSON.parse(readFileSync(new URL(file,dataDir),'utf8'));if(room.schema===1&&Date.now()-room.updated<7*86400_000)rooms.set(room.code,room);}catch{console.warn('跳过无法读取的房间文件：'+file);}
  }
  const persist=r=>{r.updated=Date.now();const tmp=new URL(r.code+'.tmp',dataDir),dest=new URL(r.code+'.json',dataDir);writeFileSync(tmp,JSON.stringify(r),{mode:0o600});renameSync(tmp,dest);rooms.set(r.code,r);};
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://local');
      if(url.pathname.startsWith('/gang/'))return handleGang(req,res,url.pathname);
      if(!url.pathname.startsWith('/api/')){
        const paths={'/':[url.searchParams.has('room')?'public/index.html':'public/hub.html','text/html'],'/circuit':['public/index.html','text/html'],'/music.js':['public/music.js','text/javascript'],'/app.js':['public/app.js','text/javascript'],'/style.css':['public/style.css','text/css']};
        const item=paths[url.pathname];if(req.method!=='GET'||!item)return send(res,404,{error:'页面不存在'});
        res.writeHead(200,{'Content-Type':item[1]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"});return res.end(readFileSync(new URL(item[0],base)));
      }
      const expectedOrigin=process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
      if(req.headers.origin && req.headers.origin!==expectedOrigin)return send(res,403,{error:'拒绝跨站请求'});
      const now=Date.now(),ip=req.socket.remoteAddress;let limit=rate.get(ip);if(!limit||now-limit.time>60000)rate.set(ip,limit={time:now,n:0});if(++limit.n>1200)return send(res,429,{error:'请求过多，稍后再试'});
      if(req.method==='GET'&&url.pathname==='/api/catalog')return send(res,200,{rules:rulesInfo,challenges,skills:skills.map(({id,name,description,target})=>({id,name,description,target})),addresses:process.env.RENDER_EXTERNAL_URL?[]:addresses(server.address()?.port||8790)});
      let body={};if(req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'需要 JSON 请求'});
        let text='';for await(const chunk of req){text+=chunk;if(text.length>10000)return send(res,413,{error:'请求过大'});}
        try{body=JSON.parse(text||'{}');}catch{return send(res,400,{error:'请求格式错误'});}
        if(!body||Array.isArray(body)||typeof body!=='object')return send(res,400,{error:'请求格式错误'});
      }
      const nameOf=x=>{if(typeof x!=='string'||!x.trim()||x.trim().length>16)throw new Error('昵称需要 1–16 个字符');return x.trim();};
      function configure(r){const c=challenges.find(c=>c.id===body.challengeId);if(!c)throw new Error('关卡不存在');const n=Number(body.capacity);if(!Number.isInteger(n)||n<2||n>5||n<r.players.length)throw new Error('房间人数需为 2–5，且不能小于已加入人数');r.capacity=n;r.challengeId=c.id;}
      if(req.method==='POST'&&url.pathname==='/api/rooms'){
        if(rooms.size>=100)throw new Error('房间数已达上限');let code;do{code=String(randomInt(100000,1000000));}while(rooms.has(code));
        const player={id:id(),token:secret(),name:nameOf(body.name)},room={schema:1,code,hostId:player.id,players:[player],game:null,version:1};configure(room);persist(room);return send(res,201,{token:player.token,room:playerView(room,player.id)});
      }
      const m=url.pathname.match(/^\/api\/rooms\/(\d{6})(?:\/(join|start|action|reset|configure|kick|transfer|referee))?$/);if(!m)return send(res,404,{error:'接口不存在'});
      const stored=rooms.get(m[1]);if(!stored)return send(res,404,{error:'房间不存在，请检查房间号'});const action=m[2];
      const r=structuredClone(stored);
      if(req.method==='POST'&&action==='join'){
        if(r.game)throw new Error('本局已开始。原玩家请使用原浏览器恢复，而不是重新加入');
        if(r.players.length>=r.capacity)throw new Error('房间已满');const name=nameOf(body.name);if(r.players.some(p=>p.name===name))throw new Error('昵称已被使用');const p={id:id(),token:secret(),name};r.players.push(p);r.version++;persist(r);return send(res,201,{token:p.token,room:playerView(r,p.id)});
      }
      const auth=req.headers.authorization?.replace(/^Bearer /,'');const p=r.players.find(p=>p.token===auth);if(!p)return send(res,403,{error:'身份凭据失效，请重新加入'});
      if(req.method==='GET'&&!action)return send(res,200,playerView(r,p.id));
      if(req.method!=='POST')return send(res,405,{error:'不支持此方法'});
      if(body.version!==r.version)return send(res,409,{error:'房间状态刚刚变化，已刷新，请确认后重试'});
      if(action!=='action'&&p.id!==r.hostId)return send(res,403,{error:'只有房主可以进行此操作'});
      if(action==='start'){
        if(r.game)throw new Error('已经开始，不能重复发牌');if(r.players.length!==r.capacity)throw new Error('请等待所有玩家到齐');r.game=startGame(r.players,challenges.find(c=>c.id===r.challengeId),r.hostId);
      }else if(action==='action'){if(!r.game)throw new Error('还未开始');const beforeNotes=p.notes.length;
        const choice=body.action||{};
        const selected=r.players.flatMap(member=>member.hand).filter(tile=>tile.id===choice.ownId||tile.id===choice.targetId);
        const labels={blue:'蓝线',amber:'琥珀线',red:'危险线'};
        applyAction(r.game,r.players,p.id,choice);
        r.audit??=[];
        r.audit.push({time:Date.now(),text:[p.name,choice.type,...selected.map(tile=>tile.ownerName+' '+tile.slot+'号位 '+labels[tile.kind]+' '+tile.value),...p.notes.slice(beforeNotes).map(note=>note.text),r.game.logs.at(-1)].join(' · ')});
        r.audit=r.audit.slice(-200);}
      else if(action==='referee'){if(typeof body.enabled!=='boolean')throw new Error('开关无效');r.referee=body.enabled;}
      else if(action==='reset'){r.game=null;r.audit=[];r.referee=false;r.players.forEach(p=>{delete p.hand;delete p.notes;delete p.skill;delete p.skillUsed;delete p.beaconUsed;});}
      else if(action==='configure'){if(r.game)throw new Error('先返回准备室再修改');configure(r);}
      else if(action==='kick'){if(r.game)throw new Error('只能在准备室移除玩家');if(body.playerId===r.hostId)throw new Error('不能移除房主');r.players=r.players.filter(p=>p.id!==body.playerId);}
      else if(action==='transfer'){if(!r.players.some(p=>p.id===body.playerId))throw new Error('玩家不存在');r.hostId=body.playerId;r.referee=false;}
      else return send(res,404,{error:'操作不存在'});
      r.version++;persist(r);return send(res,200,playerView(r,p.id));
    }catch(e){console.error(e.code?e.message:'');send(res,e.code?500:400,{error:e.code?'本机保存失败，操作未提交，请检查磁盘权限与空间':e.message});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  const timer=setInterval(()=>{for(const[k,v]of rate)if(Date.now()-v.time>60000)rate.delete(k);},60000);timer.unref();server.on('close',()=>clearInterval(timer));return server;
}
function addresses(port){return Object.entries(networkInterfaces()).flatMap(([name,items])=>items.filter(i=>i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.')&&!/vmware|virtualbox|vEthernet|loopback|tap|wintun/i.test(name)).map(i=>({name,url:`http://${i.address}:${port}`})));}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8790),server=createServer();server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，请先停止旧服务或使用其他端口。`:e.message);process.exitCode=1;});
  server.listen(port,'0.0.0.0',()=>{console.log(`零点回路 · 本地合作推理\n电脑打开：http://localhost:${port}`);for(const a of addresses(port))console.log(`手机访问（${a.name}）：${a.url}`);console.log('仅供可信局域网使用。请勿映射公网端口。按 Ctrl+C 停止，房间保存在 .data 中。');});
}
