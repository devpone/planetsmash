import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from './src.js';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('./migrations/0001_init.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('./migrations/0002_visitors.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('./migrations/0003_menu_feedback.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('./migrations/0004_game_highscores.sql',import.meta.url),'utf8'));
const env = {
  ALLOWED_ORIGIN:'https://planetsmashburger.de', SITE_HOSTNAME:'planetsmashburger.de',
  RATE_SECRET:'test-only-long-random-secret', ADMIN_TOKEN:'admin-test', TURNSTILE_SECRET:'test',
  DB:{prepare(sql){const statement=db.prepare(sql);return {first(){return statement.get()},all(){return {results:statement.all()}},bind(...args){return {
    run(){const info=statement.run(...args);return {meta:{changes:Number(info.changes)}}},
    first(){return statement.get(...args)},
    all(){return {results:statement.all(...args)}}
  }}}}}
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({success:true,hostname:'planetsmashburger.de'});
function request(path,method='GET',body,headers={}) {
  return new Request('https://api.example'+path,{method,headers:{Origin:'https://planetsmashburger.de','CF-Connecting-IP':'192.0.2.1',...headers},body:body?JSON.stringify(body):undefined});
}
test('public writes, pagination, reporting, moderation, and abuse limits',async () => {
  const entry={name:'  Cosmo  ',message:'Bester Burger im All!',token:'test-token'};
  let response=await worker.fetch(request('/messages','POST',entry),env);
  assert.equal(response.status,201);
  const saved=await response.json(); assert.equal(saved.name,'Cosmo');
  assert.equal(saved.message,entry.message);
  response=await worker.fetch(request('/messages'),env);
  const feed=await response.json();assert.equal(feed.total,1);assert.equal(feed.messages[0].id,saved.id);
  for(let i=0;i<3;i++) assert.equal((await worker.fetch(request('/messages','POST',{...entry,message:'Besuch '+i}),env)).status,201);
  assert.equal((await worker.fetch(request('/messages','POST',entry),env)).status,429);
  assert.equal((await worker.fetch(request('/messages','POST',{...entry,message:'<script>bad</script>'}),env)).status,400);
  assert.equal((await worker.fetch(request('/messages','POST',entry,{'Origin':'https://wrong.example'}),env)).status,403);
  assert.equal((await worker.fetch(request(`/messages/${saved.id}/report`,'POST'),env)).status,200);
  assert.equal((await worker.fetch(request(`/messages/${saved.id}/report`,'POST'),env)).status,200);
  let admin=await worker.fetch(request('/admin/messages','GET',undefined,{Authorization:'Bearer admin-test'}),env);
  assert.equal((await admin.json()).messages.find(x=>x.id===saved.id).reports,1);
  assert.equal((await worker.fetch(request(`/admin/messages/${saved.id}`,'DELETE',undefined,{Authorization:'Bearer admin-test'}),env)).status,200);
  response=await worker.fetch(request('/messages'),env);
  assert.equal((await response.json()).total,3);
  assert.equal((await worker.fetch(request('/admin/messages'),env)).status,401);
});

test('menu feedback survey availability, submissions, and admin readback',async () => {
  let response=await worker.fetch(request('/survey/menu-feedback'),env);
  assert.equal(response.status,200);
  assert.equal((await response.json()).ok,true);

  response=await worker.fetch(request('/survey/menu-feedback','POST',{missing:true,answer:'Dessert und Onion Rings'}),env);
  assert.equal(response.status,201);
  assert.equal((await response.json()).ok,true);

  response=await worker.fetch(request('/survey/menu-feedback','POST',{missing:false,answer:''}),env);
  assert.equal(response.status,201);

  response=await worker.fetch(request('/survey/menu-feedback','POST',{missing:true,answer:''}),env);
  assert.equal(response.status,400);

  response=await worker.fetch(request('/survey/menu-feedback','POST',{missing:true,answer:'https://spam.example'}),env);
  assert.equal(response.status,400);

  response=await worker.fetch(request('/survey/menu-feedback','POST',{missing:false,answer:''},{Origin:'https://wrong.example'}),env);
  assert.equal(response.status,403);

  response=await worker.fetch(request('/admin/survey/menu-feedback'),env);
  assert.equal(response.status,401);

  response=await worker.fetch(request('/admin/survey/menu-feedback','GET',undefined,{Authorization:'Bearer admin-test'}),env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.summary.total,2);
  assert.equal(data.summary.missing_yes,1);
  assert.equal(data.summary.missing_no,1);
  assert.equal(data.responses[0].missing,0);
});

test('global game highscores store, deduplicate, and rank scores',async () => {
  let response=await worker.fetch(request('/game/highscores'),env);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).scores,[]);

  response=await worker.fetch(request('/game/highscores','POST',{name:'Daniel',score:1200}),env);
  assert.equal(response.status,201);
  assert.equal((await response.json()).ok,true);

  const legacyTime=new Date(Date.now()-60_000).toISOString();
  response=await worker.fetch(request('/game/highscores','POST',{name:'Chip',score:1800,created_at:legacyTime}),env);
  assert.equal(response.status,201);

  response=await worker.fetch(request('/game/highscores','POST',{name:'Chip',score:1800,created_at:legacyTime}),env);
  assert.equal(response.status,200);
  assert.equal((await response.json()).duplicate,true);

  response=await worker.fetch(request('/game/highscores'),env);
  const data=await response.json();
  assert.equal(data.scores.length,2);
  assert.equal(data.scores[0].name,'Chip');
  assert.equal(data.scores[0].score,1800);
  assert.equal(data.scores[1].name,'Daniel');

  assert.equal((await worker.fetch(request('/game/highscores','POST',{name:'Bad',score:125}),env)).status,400);
  assert.equal((await worker.fetch(request('/game/highscores','POST',{name:'https://spam.example',score:100}),env)).status,400);
  assert.equal((await worker.fetch(request('/game/highscores','POST',{name:'Wrong Origin',score:100},{Origin:'https://wrong.example'}),env)).status,403);
});

globalThis.fetch=originalFetch;
