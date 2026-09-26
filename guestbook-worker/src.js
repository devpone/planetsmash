const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}
});
const error = (code, status = 400) => json({error:code},status);
function cors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = [env.ALLOWED_ORIGIN, 'https://www.planetsmashburger.de'];
  return origin && allowed.includes(origin) ? {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Vary':'Origin'
  } : {'Vary':'Origin'};
}
function validOrigin(request, env) {
  return [env.ALLOWED_ORIGIN,'https://www.planetsmashburger.de'].includes(request.headers.get('Origin'));
}
async function hash(value, secret) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function rateLimit(env, request, action, limit, seconds) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const key = await hash(`${action}:${bucket}:${ip}`,env.RATE_SECRET);
  const result = await env.DB.prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ?').bind(key,(bucket+2)*seconds,limit).run();
  // Delete old buckets occasionally. No raw IP addresses are stored.
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(Math.floor(Date.now()/1000)).run();
  return result.meta.changes > 0;
}
async function verifyTurnstile(token, request, env) {
  const body = new FormData();
  body.append('secret',env.TURNSTILE_SECRET);
  body.append('response',token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip',ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body});
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true && [env.SITE_HOSTNAME,'www.'+env.SITE_HOSTNAME].includes(result.hostname);
}
function authorized(request, env) {
  return !!env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`;
}
export default {
  async fetch(request, env) {
    const headers = cors(request,env);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    const url = new URL(request.url);
    const wrap = response => { for (const [key,value] of Object.entries(headers)) response.headers.set(key,value); return response; };
    try {
      if (url.pathname === '/messages' && request.method === 'GET') {
        const before = url.searchParams.get('before');
        if (before && (!/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(before) || before.length > 35)) return wrap(error('bad_cursor'));
        const rows = await env.DB.prepare('SELECT id,name,message,created_at FROM messages WHERE visible=1 AND created_at < ? ORDER BY created_at DESC LIMIT 9').bind(before || '9999-12-31T23:59:59.999Z').all();
        const messages = rows.results.slice(0,8);
        const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE visible=1').first();
        return wrap(json({messages,total:count.n,next:rows.results.length > 8 ? messages[7].created_at : null}));
      }
      if (url.pathname === '/messages' && request.method === 'POST') {
        if (!validOrigin(request,env)) return wrap(error('forbidden',403));
        if (Number(request.headers.get('Content-Length')) > 4096) return wrap(error('too_large',413));
        const body = await request.json();
        const name = String(body.name || '').trim().replace(/\s+/g,' ');
        const message = String(body.message || '').trim();
        if (name.length < 1 || name.length > 30 || message.length < 3 || message.length > 280 || /[<>]/.test(name+message)) return wrap(error('invalid_text'));
        if (/https?:\/\/|www\.|\b[a-z0-9.-]+\.(?:com|de|net|org)\b/i.test(message)) return wrap(error('invalid_text'));
        if (!body.token || !await verifyTurnstile(body.token,request,env)) return wrap(error('verification_failed',403));
        if (!await rateLimit(env,request,'post',4,3600)) return wrap(error('rate_limit',429));
        const item = {id:crypto.randomUUID(),name,message,created_at:new Date().toISOString()};
        await env.DB.prepare('INSERT INTO messages (id,name,message,created_at) VALUES (?,?,?,?)').bind(item.id,item.name,item.message,item.created_at).run();
        return wrap(json(item,201));
      }
      const report = url.pathname.match(/^\/messages\/([0-9a-f-]{36})\/report$/);
      if (report && request.method === 'POST') {
        if (!validOrigin(request,env)) return wrap(error('forbidden',403));
        if (!await rateLimit(env,request,'report',10,3600)) return wrap(error('rate_limit',429));
        const reporter = await hash(`report:${report[1]}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`,env.RATE_SECRET);
        const result = await env.DB.prepare('INSERT OR IGNORE INTO reports (message_id,reporter) SELECT id,? FROM messages WHERE id=? AND visible=1').bind(reporter,report[1]).run();
        if (result.meta.changes) await env.DB.prepare('UPDATE messages SET reports=reports+1 WHERE id=?').bind(report[1]).run();
        return wrap(json({ok:true}));
      }
      if (url.pathname === '/admin/messages' && request.method === 'GET') {
        if (!authorized(request,env)) return wrap(error('unauthorized',401));
        const rows = await env.DB.prepare('SELECT id,name,message,created_at,reports FROM messages WHERE visible=1 ORDER BY reports DESC,created_at DESC LIMIT 100').all();
        return wrap(json({messages:rows.results}));
      }
      const del = url.pathname.match(/^\/admin\/messages\/([0-9a-f-]{36})$/);
      if (del && request.method === 'DELETE') {
        if (!validOrigin(request,env) || !authorized(request,env)) return wrap(error('unauthorized',401));
        await env.DB.prepare('UPDATE messages SET visible=0 WHERE id=?').bind(del[1]).run();
        return wrap(json({ok:true}));
      }
      return wrap(error('not_found',404));
    } catch (caught) {
      console.error('Guestbook request failed',caught);
      return wrap(error('server_error',500));
    }
  }
};
