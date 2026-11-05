import {randomUUID} from 'node:crypto';

const query = 'INSERT OR IGNORE INTO events (id,at_utc,event,game,browser_id,room,nickname,is_test,ip,user_agent,language,referer,path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)';
const {D1_ACCOUNT_ID, D1_DATABASE_ID, D1_API_TOKEN} = process.env;
const enabled = Boolean(D1_ACCOUNT_ID && D1_DATABASE_ID && D1_API_TOKEN);

export function record(req,res,event,game,room=null,nickname=null) {
  if (!enabled || /^Render\/1\.0/i.test(req.headers['user-agent'] || '')) return;
  const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)zc_browser=([a-f0-9-]{36})(?:;|$)/i);
  const browser = cookie?.[1] || randomUUID();
  if (!cookie) res.setHeader('Set-Cookie','zc_browser='+browser+'; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax'+(process.env.RENDER_EXTERNAL_URL?'; Secure':''));
  const params = [randomUUID(),new Date().toISOString(),event,game,browser,room,nickname,Number(Boolean(process.env.ANALYTICS_TEST_KEY && req.headers['x-test-key']===process.env.ANALYTICS_TEST_KEY))];
  const header = name => String(req.headers[name] || '').slice(0,1024);
  const ip = process.env.RENDER_EXTERNAL_URL ? header('x-forwarded-for').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  // Save device/browser evidence without collecting cookies or authentication headers.
  const path = new URL(req.url,'http://local').pathname;
  params.push(ip || null,header('user-agent'),header('accept-language'),header('referer').split('?')[0].split('#')[0],path);
  void write(params);
}

async function write(params) {
  const url = 'https://api.cloudflare.com/client/v4/accounts/'+D1_ACCOUNT_ID+'/d1/database/'+D1_DATABASE_ID+'/query';
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+D1_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql:query,params}),signal:AbortSignal.timeout(5000)});
      if(response.ok && (await response.json()).success)return;
    }catch{}
  }
  console.warn('D1 event write failed');
}
