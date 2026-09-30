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

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
function htmlPage(title, body) {
  return new Response(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Planet Smashburger</title><style>body{margin:0;background:#10091b;color:#f7edff;font:16px/1.55 system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:640px;border:1px solid #6f4c8c;background:#160d22;border-radius:18px;padding:32px}h1{margin-top:0}a{color:#dca8ff}</style></head><body><main class="card"><h1>${title}</h1>${body}<p><a href="https://planetsmashburger.de/">Zurück zu Planet Smashburger</a></p></main></body></html>`,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
async function resend(env, path, options = {}) {
  if (!env.RESEND_API_KEY) throw new Error('resend_not_configured');
  const response = await fetch('https://api.resend.com' + path, {
    ...options,
    headers:{
      'Authorization':`Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(()=>'');
    console.error('Resend request failed',response.status,detail);
    throw new Error('resend_failed');
  }
  return response.json().catch(()=>({}));
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
      if (url.pathname === '/newsletter/status' && request.method === 'GET') {
        const configured = !!env.RESEND_API_KEY && !!env.NEWSLETTER_SEGMENT_ID;
        return wrap(json({ok:configured}));
      }
      if (url.pathname === '/newsletter/subscribe' && request.method === 'POST') {
        if (!validOrigin(request,env)) return wrap(error('forbidden',403));
        if (!env.RESEND_API_KEY || !env.NEWSLETTER_SEGMENT_ID) return wrap(error('not_configured',503));
        if (Number(request.headers.get('Content-Length')) > 4096) return wrap(error('too_large',413));
        const body = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const turnstileToken = String(body.token || '').trim();
        if (!validEmail(email)) return wrap(error('invalid_email'));
        if (!turnstileToken || !await verifyTurnstile(turnstileToken,request,env)) return wrap(error('verification_failed',403));
        if (!await rateLimit(env,request,'newsletter-subscribe',5,3600)) return wrap(error('rate_limit',429));

        const existing = await env.DB.prepare('SELECT status FROM newsletter_subscribers WHERE email=?').bind(email).first();
        if (existing?.status === 'confirmed') return wrap(json({ok:true}));

        const rawToken = crypto.randomUUID() + crypto.randomUUID();
        const tokenHash = await sha256(rawToken);
        const now = new Date();
        const expires = new Date(now.getTime() + 24*60*60*1000).toISOString();
        await env.DB.prepare(`INSERT INTO newsletter_subscribers
          (email,status,token_hash,token_expires_at,consent_at,source,form_version,resend_synced,updated_at)
          VALUES (?,'pending',?,?,?,'website','2026-09-29-v1',0,?)
          ON CONFLICT(email) DO UPDATE SET
            status='pending', token_hash=excluded.token_hash, token_expires_at=excluded.token_expires_at,
            consent_at=excluded.consent_at, source='website', form_version='2026-09-29-v1',
            resend_synced=0, updated_at=excluded.updated_at`)
          .bind(email,tokenHash,expires,now.toISOString(),now.toISOString()).run();

        const confirmUrl = `https://planet-funksprueche.devpone.workers.dev/newsletter/confirm?token=${encodeURIComponent(rawToken)}`;
        await resend(env,'/emails',{
          method:'POST',
          body:JSON.stringify({
            from:'Planet Smashburger <daniel@planetsmashburger.de>',
            to:[email],
            subject:'The Smashington Post – Anmeldung bestätigen',
            html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#1c1025">
              <h1>The Smashington Post</h1>
              <p>Fast geschafft. Bestätige bitte noch deine Anmeldung zum Newsletter von Planet Smashburger.</p>
              <p><a href="${confirmUrl}" style="display:inline-block;padding:12px 18px;background:#6b2d8f;color:#fff;text-decoration:none;border-radius:8px">Anmeldung bestätigen</a></p>
              <p>Der Link ist 24 Stunden gültig. Wenn du dich nicht angemeldet hast, kannst du diese E-Mail ignorieren.</p>
            </div>`,
            tags:[{name:'category',value:'newsletter_double_opt_in'}]
          })
        });
        return wrap(json({ok:true},202));
      }
      if (url.pathname === '/newsletter/confirm' && request.method === 'GET') {
        if (!env.RESEND_API_KEY || !env.NEWSLETTER_SEGMENT_ID) return htmlPage('Newsletter noch nicht bereit','<p>Die Anmeldung kann gerade nicht abgeschlossen werden. Bitte versuche es später erneut.</p>');
        const rawToken = String(url.searchParams.get('token') || '');
        if (rawToken.length < 20 || rawToken.length > 200) return htmlPage('Link ungültig','<p>Dieser Bestätigungslink ist ungültig oder abgelaufen.</p>');
        const tokenHash = await sha256(rawToken);
        const row = await env.DB.prepare(`SELECT email,status,token_expires_at FROM newsletter_subscribers
          WHERE token_hash=? LIMIT 1`).bind(tokenHash).first();
        if (!row || row.status !== 'pending' || !row.token_expires_at || Date.parse(row.token_expires_at) < Date.now()) {
          return htmlPage('Link abgelaufen','<p>Dieser Bestätigungslink ist nicht mehr gültig. Bitte melde dich auf der Website erneut an.</p>');
        }

        await resend(env,'/contacts',{
          method:'POST',
          body:JSON.stringify({
            email:row.email,
            unsubscribed:false,
            segmentIds:[env.NEWSLETTER_SEGMENT_ID]
          })
        });

        const confirmedAt = new Date().toISOString();
        await env.DB.prepare(`UPDATE newsletter_subscribers
          SET status='confirmed',confirmed_at=?,token_hash=NULL,token_expires_at=NULL,resend_synced=1,updated_at=?
          WHERE email=?`).bind(confirmedAt,confirmedAt,row.email).run();

        return htmlPage('Anmeldung bestätigt','<p>Du bist jetzt für <strong>The Smashington Post</strong> angemeldet.</p><p>Ab jetzt können Neuigkeiten, Aktionen und besondere Planet-Smashburger-Missionen in deinem Postfach landen.</p>');
      }
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
          'SELECT name,score,created_at FROM game_highscores ORDER BY score DESC, created_at ASC LIMIT 25'
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

        const rankState = await env.DB.prepare(
          'SELECT COUNT(*) AS total, MIN(score) AS cutoff FROM (SELECT score FROM game_highscores ORDER BY score DESC, created_at ASC LIMIT 25)'
        ).first();
        const totalRanked = Number(rankState?.total || 0);
        const cutoff = Number(rankState?.cutoff || 0);

        if (totalRanked >= 25 && score <= cutoff) {
          return wrap(json({
            ok:true,
            qualified:false,
            cutoff
          },200));
        }

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
          'DELETE FROM game_highscores WHERE id NOT IN (SELECT id FROM game_highscores ORDER BY score DESC, created_at ASC LIMIT 25)'
        ).run();

        return wrap(json({
          ok:true,
          qualified:true,
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
