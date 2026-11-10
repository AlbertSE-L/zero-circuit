import {randomBytes,randomInt} from 'node:crypto';
import {mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {record} from '../analytics.mjs';
import {catalog,configure} from './config.mjs';
import {start,act,view} from './engine.mjs';

export function createAvalonHandler(dataDir){
  const saves=new URL('./avalon/',dataDir),rooms=new Map(),rates=new Map();
  mkdirSync(saves,{recursive:true});
  for(const file of readdirSync(saves)){
    if(!/^\d{6}\.json$/.test(file))continue;
    try{
      const room=JSON.parse(readFileSync(new URL(file,saves),'utf8'));
      if(room.code+'.json'===file && Date.now()-room.updated<7*86400_000)rooms.set(room.code,room);
    }catch{console.warn('跳过无法读取的阿瓦隆存档')}
  }
  function commit(room){
    room.updated=Date.now();
    const temporary=new URL(room.code+'.tmp',saves);
    writeFileSync(temporary,JSON.stringify(room),{mode:0o600});
    renameSync(temporary,new URL(room.code+'.json',saves));
    rooms.set(room.code,room);
  }
  return async function handleAvalon(req,res,path){
    function json(status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
    try{
      const assets={'/avalon/':['index.html','text/html'],'/avalon/app.js':['app.js','text/javascript'],'/avalon/style.css':['style.css','text/css'],'/avalon/license':['LICENSE.indie-avalon','text/plain']};
      if(req.method==='GET' && assets[path]){
        const [file,type]=assets[path];
        if(file==='index.html')record(req,res,'visit','avalon');
        res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"});
        return res.end(readFileSync(new URL(file,import.meta.url)));
      }
      if(path==='/avalon/catalog' && req.method==='GET')return json(200,catalog);
      if(path!=='/avalon/room' || req.method!=='POST')return json(404,{error:'页面不存在'});
      if(req.headers.origin && req.headers.origin!==(process.env.RENDER_EXTERNAL_URL||'http://'+req.headers.host))return json(403,{error:'拒绝跨站请求'});
      const now=Date.now();
      for(const [ip,limit] of rates)if(now-limit.at>60000)rates.delete(ip);
      const ip=req.socket.remoteAddress;
      if(!rates.has(ip))rates.set(ip,{at:now,count:0});
      if(++rates.get(ip).count>1200)return json(429,{error:'操作过于频繁'});
      let raw='';for await(const part of req){raw+=part;if(raw.length>8192)throw Error('请求过大')}
      const body=JSON.parse(raw);
      if(!body || typeof body!=='object' || Array.isArray(body))throw Error('请求格式错误');
      const newPlayer=()=>{
        const name=typeof body.name==='string'?body.name.trim():'';
        if(!name || name.length>16)throw Error('昵称需要 1–16 个字符');
        return {id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),name,role:null};
      };
      let room,player;
      if(body.cmd==='create'){
        if(rooms.size>=100)throw Error('房间数已达上限');
        let code;do{code=String(randomInt(100000,1000000))}while(rooms.has(code));
        player=newPlayer();
        room={code,v:0,phase:'lobby',players:[player],hostId:player.id,game:null,config:configure(body.capacity,body.preset,body.roles)};
      }else{
        const stored=rooms.get(body.code);
        if(!stored)throw Error('房间不存在');
        if(body.cmd==='join'){
          if(stored.phase!=='lobby' || stored.players.length>=stored.config.capacity)throw Error('本桌已满或已经开局');
          room=structuredClone(stored);player=newPlayer();
          if(room.players.some(p=>p.name===player.name))throw Error('昵称重复');
          room.players.push(player);
        }else{
          player=stored.players.find(p=>p.token===body.token);
          if(!player)return json(403,{error:'席位无效'});
          if(body.cmd==='read'){
            if(body.v===stored.v){res.writeHead(204,{'Cache-Control':'no-store'});return res.end()}
            return json(200,view(stored,player.id));
          }
          if(body.v!==stored.v)return json(409,{error:'桌面刚有变化，请查看最新状态后再操作'});
          room=structuredClone(stored);
          if(['configure','start','reset','transfer'].includes(body.cmd) && player.id!==room.hostId)return json(403,{error:'只有房主可以操作'});
          if(body.cmd==='configure'){
            if(room.phase!=='lobby')throw Error('请先结束当前对局');
            const config=configure(body.capacity,body.preset,body.roles);
            if(config.capacity<room.players.length)throw Error('人数不能少于已加入玩家');
            room.config=config;
          }else if(body.cmd==='start')start(room);
          else if(body.cmd==='reset'){
            if(room.phase!=='finished')throw Error('请等待当前对局结束');
            room.phase='lobby';room.game=null;room.players.forEach(p=>p.role=null);
          }else if(body.cmd==='transfer'){
            if(!room.players.some(p=>p.id===body.value))throw Error('玩家不存在');
            room.hostId=body.value;
          }else act(room,player.id,body.cmd,body.value);
        }
      }
      room.v++;commit(room);
      if(['create','join','start'].includes(body.cmd))record(req,res,body.cmd,'avalon',room.code,player.name);
      return json(200,{...view(room,player.id),...(['create','join'].includes(body.cmd)?{token:player.token}:{})});
    }catch(error){return json(error.code?500:400,{error:error.code?'房间保存失败，操作未提交':error.message})}
  };
}
