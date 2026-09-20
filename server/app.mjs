import http from 'node:http';
import path from 'node:path';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createStore,passwordHash,passwordMatches,hash} from './store.mjs';
import {ApiError,fail,validateRecord,required} from './validation.mjs';
import {population,visitState,today} from '../web/domain.mjs';
const root=fileURLToPath(new URL('../web/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
export function createApp({directory=process.env.ASHA_DATA_DIR||'data',setupToken=process.env.ASHA_SETUP_TOKEN,allowedOrigins=(process.env.ASHA_ALLOWED_ORIGINS||'https://appassets.androidplatform.net').split(',').filter(Boolean),secure=process.env.NODE_ENV==='production'}={}){
  const store=createStore(directory),{db,record,pack,publicUser,audit}=store;
  if(!setupToken){const p=path.join(directory,'bootstrap-token');if(!existsSync(p))writeFileSync(p,randomBytes(24).toString('hex'),{mode:0o600});setupToken=readFileSync(p,'utf8').trim();}
  const attempts=new Map();
  const dummyPassword=passwordHash(randomBytes(24).toString('hex'));
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  async function body(req){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>9_000_000)fail('Request is too large.',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail('Invalid JSON.');}}
  function authenticated(req){const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];if(!token)fail('Sign in to continue.',401);
    const u=db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1').get(hash(token),Date.now());if(!u)fail('Your session has ended. Sign in again; offline edits are kept.',401);return u;}
  function requireAdmin(u){if(u.role!=='admin')fail('Administrator access required.',403);}
  function getRecord(id,u){const r=record(db.prepare('SELECT * FROM records WHERE id=?').get(id));if(!r||(r.kind!=='schedule'&&u.role!=='admin'&&r.ownerId!==u.id))fail('Record not found.',404);return r;}
  function rateLimit(req,username){const now=Date.now(),key=`${req.socket.remoteAddress}:${username}`,v=attempts.get(key);if(v&&v.expires>now&&v.count>=8)fail('Too many attempts. Try again in 15 minutes.',429);if(!v||v.expires<=now)attempts.set(key,{count:1,expires:now+900000});else v.count++;if(attempts.size>2000)for(const [k,x] of attempts)if(x.expires<=now)attempts.delete(k);return key;}
  function passwordCheck(p){if(typeof p!=='string'||p.length<12||p.length>256)fail('Use a password with 12–256 characters.');}
  function addUser(d,mustChange=true){required(d,'username',80);required(d,'name');required(d,'area');if(!/^[a-zA-Z0-9._-]{3,80}$/.test(d.username))fail('Username: use 3–80 letters, numbers, dots, hyphens or underscores.');if(!['asha','admin'].includes(d.role))fail('Invalid role.');passwordCheck(d.password);if(db.prepare('SELECT id FROM users WHERE username=?').get(d.username.toLowerCase()))fail('That username already exists.',409);const id=randomUUID();db.prepare('INSERT INTO users(id,username,name,area,role,password,must_change) VALUES(?,?,?,?,?,?,?)').run(id,d.username.toLowerCase(),d.name,d.area,d.role,passwordHash(d.password),mustChange?1:0);return db.prepare('SELECT * FROM users WHERE id=?').get(id);}
  function mutate(u,m){
    if(typeof m.id!=='string'||!/^[a-zA-Z0-9_-]{3,100}$/.test(m.id)||typeof m.mutationId!=='string'||m.mutationId.length>100)fail('Invalid record identity.');
    const digest=hash(JSON.stringify(m)),already=db.prepare('SELECT * FROM mutations WHERE user_id=? AND mutation_id=?').get(u.id,m.mutationId);
    if(already){if(already.body_hash!==digest)fail('Mutation identifier was reused.',409);return {id:already.record_id,version:already.version};}
    const old=record(db.prepare('SELECT * FROM records WHERE id=?').get(m.id));
    if(old&&u.role!=='admin'&&old.ownerId!==u.id)fail('Record not found.',404);
    if(old&&(old.kind!==m.kind||old.ownerId!==m.ownerId))fail('Record type and owner cannot be changed. Transfer households through an administrator.',409);
    if(!Number.isInteger(m.baseVersion)||m.baseVersion!==(old?.version||0))fail('This record changed on another device. Review the saved version before trying again.',409,{record:old,id:m.id});
    if(m.deleted)fail('Archive or correct records instead of deleting history.');
    const owner=m.ownerId||u.id;
    if(u.role!=='admin'&&owner!==u.id)fail('You can only save records for your own assignment.',403);
    if(!db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(owner))fail('Select an active ASHA.');
    if(m.kind==='schedule')requireAdmin(u);
    const d=validateRecord(m.kind,structuredClone(m.data));
    const ref=m.kind==='member'?d.householdId:d.memberId;
    if(ref){const parent=getRecord(ref,u);if(parent.kind!==(m.kind==='member'?'household':'member')||parent.ownerId!==owner)fail('The linked record must belong to the same ASHA.');}
    if(m.kind==='document'&&!d.content&&old)d.content=old.data.content;
    if(m.kind==='document'&&!d.content)fail('Attach a document.');
    if(m.kind==='event'&&d.type==='Birth'&&d.status!=='Voided'){
      const duplicates=db.prepare("SELECT * FROM records WHERE owner_id=? AND kind='event' AND id!=?").all(owner,m.id).map(record).some(r=>r.data.memberId===d.memberId&&r.data.type==='Birth'&&r.data.status!=='Voided');
      if(duplicates)fail('A birth event already exists for this member.',409);
    }
    if(m.kind==='report'){
      if(['Accepted','Returned'].includes(d.status))requireAdmin(u);
      if(old?.data.status==='Accepted'&&JSON.stringify(d)!==JSON.stringify(old.data))fail('Accepted reports are preserved. Create a corrected report with a new name.',409);
      if(old)d.snapshot=old.data.snapshot;
      else {
        const scope=u.role==='admin'?(d.scopeOwnerId||null):u.id;
        const rows=(scope?db.prepare('SELECT * FROM records WHERE owner_id=?').all(scope):db.prepare('SELECT * FROM records').all()).map(record).filter(r=>!r.deleted);
        const p=population(rows),events=rows.filter(r=>r.kind==='event'&&r.data.status==='Confirmed'&&r.data.date.startsWith(d.month)),visits=rows.filter(r=>r.kind==='visit');
        d.snapshot={generatedAt:new Date().toISOString(),populationAsOf:today(),residentPopulation:p.total,male:p.Male,female:p.Female,other:p.Other,unknown:p.Unknown,households:rows.filter(r=>r.kind==='household').length,childrenUnder5:p.under5,over80:p.over80,abhaNotRecorded:p.abhaMissing,activePregnancies:rows.filter(r=>r.kind==='pregnancy'&&r.data.status==='Active').length,births:events.filter(r=>r.data.type==='Birth').length,deaths:events.filter(r=>r.data.type==='Death').length,visitsDue:visits.filter(r=>r.data.dueDate.startsWith(d.month)).length,visitsCompleted:visits.filter(r=>r.data.status==='Completed'&&r.data.actualDate?.startsWith(d.month)).length,overdueAsOfToday:visits.filter(r=>visitState(r)==='Overdue').length,scope:scope?publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(scope))?.name||scope:'All managed ASHAs',lastSync:new Date().toISOString()};
      }
    }
    const version=(old?.version||0)+1,updated=new Date().toISOString();
    db.prepare('INSERT INTO records(id,kind,owner_id,data,version,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at').run(m.id,m.kind,owner,pack(d),version,updated);
    db.prepare('INSERT INTO mutations(user_id,mutation_id,body_hash,record_id,version) VALUES(?,?,?,?,?)').run(u.id,m.mutationId,digest,m.id,version);
    audit(u.id,old?'record.update':'record.create',m.id);return {id:m.id,version};
  }
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin,host=req.headers.host;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const sameOrigin=origin&&(origin===`https://${host}`||(!secure&&origin===`http://${host}`));
    if(origin&&!sameOrigin){if(!allowedOrigins.includes(origin)){json(res,403,{error:'Origin is not allowed.'});return;}res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'});res.end();return;}
    try{
      const url=new URL(req.url,'http://local'),p=url.pathname;
      if(p==='/api/health'){json(res,200,{name:'ASHA Saathi',version:'1.0.0',setupRequired:!db.prepare('SELECT id FROM users LIMIT 1').get()});return;}
      if(p==='/api/setup'&&req.method==='POST'){
        rateLimit(req,'setup');if(db.prepare('SELECT id FROM users LIMIT 1').get())fail('Workspace is already set up.',409);
        const d=await body(req),a=Buffer.from(String(d.setupToken||'')),b=Buffer.from(setupToken);
        if(a.length!==b.length||!timingSafeEqual(a,b))fail('Invalid setup token.',403);
        const u=addUser({...d,role:'admin'},false);audit(u.id,'workspace.setup',u.id);json(res,201,{user:publicUser(u)});return;
      }
      if(p==='/api/login'&&req.method==='POST'){
        const d=await body(req),username=String(d.username||'').toLowerCase().slice(0,80),key=rateLimit(req,username),u=db.prepare('SELECT * FROM users WHERE username=?').get(username);
        const ok=passwordMatches(String(d.password||'').slice(0,256),u?.password||dummyPassword);if(!ok||!u?.active)fail('Username or password is incorrect.',401);
        attempts.delete(key);const token=randomBytes(32).toString('base64url');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),u.id,Date.now()+8*3600000);audit(u.id,'login',u.id);json(res,200,{token,user:publicUser(u)});return;
      }
      if(p.startsWith('/api/')){
        const u=authenticated(req);
        if(p==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(req.headers.authorization.slice(7)));audit(u.id,'logout',u.id);json(res,200,{ok:true});return;}
        if(p==='/api/password'&&req.method==='POST'){
          const d=await body(req);if(!passwordMatches(String(d.currentPassword||''),u.password))fail('Current password is incorrect.',403);passwordCheck(d.newPassword);db.prepare('UPDATE users SET password=?,must_change=0 WHERE id=?').run(passwordHash(d.newPassword),u.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(u.id,hash(req.headers.authorization.slice(7)));audit(u.id,'password.change',u.id);json(res,200,{user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id))});return;
        }
        if(u.must_change)fail('Change your temporary password before continuing.',403,{mustChangePassword:true});
        if(p==='/api/sync'&&req.method==='GET'){
          const rows=u.role==='admin'?db.prepare('SELECT * FROM records ORDER BY updated_at').all():db.prepare("SELECT * FROM records WHERE owner_id=? OR kind='schedule' ORDER BY updated_at").all(u.id);
          const records=rows.map(record).map(r=>{if(r.kind==='document'){delete r.data.content;}return r;});
          const users=u.role==='admin'?db.prepare('SELECT * FROM users ORDER BY name').all().map(publicUser):[publicUser(u)];
          json(res,200,{records,users,syncedAt:new Date().toISOString(),user:publicUser(u)});return;
        }
        if(p==='/api/sync'&&req.method==='POST'){
          const {mutations}=await body(req);if(!Array.isArray(mutations)||!mutations.length||mutations.length>100)fail('Send 1–100 changes at a time.');
          db.exec('BEGIN IMMEDIATE');try{const saved=mutations.map(m=>mutate(u,m));db.exec('COMMIT');json(res,200,{saved});}catch(e){db.exec('ROLLBACK');throw e;}return;
        }
        if(p==='/api/users'&&req.method==='POST'){requireAdmin(u);const created=addUser(await body(req));audit(u.id,'user.create',created.id);json(res,201,{user:publicUser(created)});return;}
        if(p.startsWith('/api/users/')&&req.method==='PATCH'){
          requireAdmin(u);const id=p.split('/').at(-1),target=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!target)fail('User not found.',404);if(id===u.id)fail('Use your profile to change your own password.');const d=await body(req);
          if(d.password){passwordCheck(d.password);db.prepare('UPDATE users SET password=?,must_change=1 WHERE id=?').run(passwordHash(d.password),id);}
          if(typeof d.active==='boolean')db.prepare('UPDATE users SET active=? WHERE id=?').run(d.active?1:0,id);
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);audit(u.id,'user.update',id);json(res,200,{user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id))});return;
        }
        if(p==='/api/transfer'&&req.method==='POST'){
          requireAdmin(u);const d=await body(req),house=getRecord(d.householdId,u),owner=db.prepare("SELECT * FROM users WHERE id=? AND role='asha' AND active=1").get(d.ownerId);if(house.kind!=='household'||!owner)fail('Select a household and active ASHA.');required(d,'reason',1000);
          const all=db.prepare('SELECT * FROM records WHERE owner_id=?').all(house.ownerId).map(record),members=all.filter(r=>r.kind==='member'&&r.data.householdId===house.id),ids=new Set(members.map(r=>r.id)),related=all.filter(r=>r.id===house.id||ids.has(r.id)||ids.has(r.data.memberId));
          db.exec('BEGIN IMMEDIATE');try{for(const r of related)db.prepare('UPDATE records SET owner_id=?,version=version+1,updated_at=? WHERE id=?').run(owner.id,new Date().toISOString(),r.id);audit(u.id,'household.transfer',`${house.id}:${house.ownerId}:${owner.id}`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}json(res,200,{transferred:related.length});return;
        }
        if(p.startsWith('/api/documents/')&&req.method==='GET'){
          const r=getRecord(p.split('/').at(-1),u);if(r.kind!=='document')fail('Document not found.',404);audit(u.id,'document.download',r.id);res.writeHead(200,{'Content-Type':r.data.mime,'Content-Disposition':`attachment; filename="document-${r.id}.${r.data.mime==='application/pdf'?'pdf':r.data.mime.split('/')[1]}"`,'Cache-Control':'no-store'});res.end(Buffer.from(r.data.content,'base64'));return;
        }
        if(p==='/api/audit'&&req.method==='GET'){requireAdmin(u);json(res,200,{entries:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all()});return;}
        if(p==='/api/export-log'&&req.method==='POST'){audit(u.id,'report.export',String((await body(req)).name||'report').slice(0,200));json(res,200,{ok:true});return;}
        fail('Not found.',404);
      }
      if(!['GET','HEAD'].includes(req.method))fail('Method not allowed.',405);
      const decoded=decodeURIComponent(p),relative=decoded==='/'?'index.html':decoded.slice(1),f=path.resolve(root,relative);
      if(!f.startsWith(root)||relative.split('/').some(s=>s.startsWith('.'))||!mime[path.extname(f)])fail('Not found.',404);
      try{const data=readFileSync(f);res.writeHead(200,{'Content-Type':mime[path.extname(f)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);}catch{fail('Not found.',404);}
    }catch(e){if(!(e instanceof ApiError))console.error('Request failed:',e.message);json(res,e.status||500,{error:e.status?e.message:'An unexpected error occurred.',details:e.details});}
  });
  return {server,store,close:()=>new Promise(resolve=>server.close(()=>{store.close();resolve();}))};
}
