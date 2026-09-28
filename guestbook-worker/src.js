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
      if (url.pathname === '/visitors' && request.method === 'GET') {
        const row = await env.DB.prepare("SELECT value FROM counters WHERE key='visitors'").first();
        return wrap(json({value:Number(row?.value || 0)}));
      }
      if (url.pathname === '/visitors/land' && request.method === 'POST') {
        if (!validOrigin(request,env)) return wrap(error('forbidden',403));
        if (!await rateLimit(env,request,'visitor',20,3600)) return wrap(error('rate_limit',429));
        await env.DB.prepare("INSERT OR IGNORE INTO counters (key,value) VALUES ('visitors',0)").run();
        await env.DB.prepare("UPDATE counters SET value=value+1 WHERE key='visitors'").run();
        const row = await env.DB.prepare("SELECT value FROM counters WHERE key='visitors'").first();
        return wrap(json({value:Number(row?.value || 0)}));
      }
      if (url.pathname === '/survey/menu-feedback' && request.method === 'GET') {
        await env.DB.prepare('SELECT id FROM menu_feedback LIMIT 1').first();
        return wrap(json({ok:true}));
      }
      if (url.pathname === '/survey/menu-feedback' && request.method === 'POST') {
        if (!validOrigin(request,env)) return wrap(error('forbidden',403));
        if (Number(request.headers.get('Content-Length')) > 2048) return wrap(error('too_large',413));
        const body = await request.json();
        if (typeof body.missing !== 'boolean') return wrap(error('invalid_response'));
        const answer = String(body.answer || '').trim().replace(/\s+/g,' ');
        if (body.missing && (answer.length < 2 || answer.length > 240)) return wrap(error('invalid_text'));
        if (!body.missing && answer.length) return wrap(error('invalid_text'));
        if (/[<>]/.test(answer) || /https?:\/\/|www\.|\b[a-z0-9.-]+\.(?:com|de|net|org)\b/i.test(answer)) return wrap(error('invalid_text'));
        if (!await rateLimit(env,request,'menu-survey',20,3600)) return wrap(error('rate_limit',429));
        const item = {id:crypto.randomUUID(),missing:body.missing ? 1 : 0,answer:body.missing ? answer : '',created_at:new Date().toISOString()};
        await env.DB.prepare('INSERT INTO menu_feedback (id,missing,answer,created_at) VALUES (?,?,?,?)').bind(item.id,item.missing,item.answer,item.created_at).run();
        return wrap(json({ok:true,id:item.id},201));
      }
      if (url.pathname === '/admin/survey/menu-feedback' && request.method === 'GET') {
        if (!authorized(request,env)) return wrap(error('unauthorized',401));
        const rows = await env.DB.prepare('SELECT id,missing,answer,created_at FROM menu_feedback ORDER BY created_at DESC LIMIT 250').all();
        const summary = await env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN missing=1 THEN 1 ELSE 0 END) AS missing_yes, SUM(CASE WHEN missing=0 THEN 1 ELSE 0 END) AS missing_no FROM menu_feedback').first();
        return wrap(json({responses:rows.results,summary:{total:Number(summary?.total || 0),missing_yes:Number(summary?.missing_yes || 0),missing_no:Number(summary?.missing_no || 0)}}));
      }
      if (url.pathname === '/game/highscores' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT name,score,created_at FROM game_highscores ORDER BY score DESC, created_at ASC LIMIT 10'
        ).all();
        return wrap(json({scores:rows.results}));
      }
      if (url.pathname === '/game/highscores' && request.method === 'POST') {
        if (!validOrigin(request,env)) return wrap(error('forbidden',403));
        if (Number(request.headers.get('Content-Length')) > 2048) return wrap(error('too_large',413));

        const body = await request.json();
        const name = String(body.name || '').trim().replace(/\s+/g,' ');
        const score = Number(body.score);
        const suppliedCreatedAt = String(body.created_at || '').trim();

        if (
          name.length < 1 ||
          name.length > 24 ||
          /[<>]/.test(name) ||
          /https?:\/\/|www\.|\b[a-z0-9.-]+\.(?:com|de|net|org)\b/i.test(name)
        ) return wrap(error('invalid_name'));

        if (
          !Number.isInteger(score) ||
          score < 0 ||
          score > 10000000 ||
          score % 100 !== 0
        ) return wrap(error('invalid_score'));

        let createdAt = new Date().toISOString();
        if (suppliedCreatedAt) {
          const parsed = Date.parse(suppliedCreatedAt);
          const nowMs = Date.now();
          if (
            suppliedCreatedAt.length > 35 ||
            !Number.isFinite(parsed) ||
            parsed > nowMs + 5 * 60 * 1000 ||
            parsed < nowMs - 366 * 24 * 60 * 60 * 1000
          ) return wrap(error('invalid_created_at'));
          createdAt = new Date(parsed).toISOString();
        }

        if (!await rateLimit(env,request,'game-score',30,3600)) return wrap(error('rate_limit',429));

        const item = {
          id:crypto.randomUUID(),
          name,
          score,
          created_at:createdAt
        };

        const result = await env.DB.prepare(
          'INSERT OR IGNORE INTO game_highscores (id,name,score,created_at) VALUES (?,?,?,?)'
        ).bind(item.id,item.name,item.score,item.created_at).run();

        await env.DB.prepare(
          'DELETE FROM game_highscores WHERE id NOT IN (SELECT id FROM game_highscores ORDER BY score DESC, created_at ASC LIMIT 100)'
        ).run();

        return wrap(json({
          ok:true,
          duplicate:result.meta.changes === 0,
          score:{name:item.name,score:item.score,created_at:item.created_at}
        }, result.meta.changes === 0 ? 200 : 201));
      }
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
