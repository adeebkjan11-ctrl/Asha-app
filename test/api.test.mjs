import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';
const directory=mkdtempSync(path.join(tmpdir(),'asha-api-'));
let app,base,admin,asha,other,ashaId,otherId;
const credentials={name:'Test Admin',area:'Test area',username:'admin',password:'Admin-test-password-2026'};
async function request(p,method='GET',payload,token,headers={}){const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...headers},body:payload===undefined?undefined:JSON.stringify(payload)});let data;try{data=await r.json();}catch{data=null;}return {status:r.status,data,headers:r.headers};}
const mutation=(id,kind,data,ownerId,baseVersion=0)=>({id,kind,data,ownerId,baseVersion,mutationId:randomUUID()});
const send=(m,token=asha)=>request('/api/sync','POST',{mutations:Array.isArray(m)?m:[m]},token);
before(async()=>{
 app=createApp({directory,setupToken:'test-setup-token'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;
 assert.equal((await request('/api/setup','POST',{...credentials,setupToken:'test-setup-token'})).status,201);
 admin=(await request('/api/login','POST',credentials)).data.token;
 for(const name of ['asha-one','asha-two']){const r=await request('/api/users','POST',{name,username:name,area:'Ward '+name,role:'asha',password:'Initial-password-2026'},admin);const id=r.data.user.id,login=await request('/api/login','POST',{username:name,password:'Initial-password-2026'}),token=login.data.token;assert.equal((await request('/api/sync','GET',undefined,token)).status,403);assert.equal((await request('/api/password','POST',{currentPassword:'Initial-password-2026',newPassword:'Changed-password-2026'},token)).status,200);if(name==='asha-one'){asha=token;ashaId=id;}else{other=token;otherId=id;}}
});
after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
test('setup is one-time and unauthenticated data access is denied',async()=>{assert.equal((await request('/api/setup','POST',{...credentials,setupToken:'test-setup-token'})).status,409);assert.equal((await request('/api/sync')).status,401);});
test('ASHA cannot create accounts or save another worker’s records',async()=>{assert.equal((await request('/api/users','POST',{},asha)).status,403);assert.equal((await send(mutation('bad-owner','household',{name:'House',address:'Street',locality:'Ward'},otherId))).status,403);});
test('sync persists encrypted records, is idempotent, and detects conflicts',async()=>{
 const h=mutation('family-one','household',{name:'Private Test Family',address:'Secret address',locality:'Ward'},ashaId);let r=await send(h);assert.equal(r.status,200);assert.equal((await send(h)).data.saved[0].version,1);
 const m=mutation('member-one','member',{name:'Private Patient',householdId:'family-one',dob:'2020-01-01',sex:'Unknown',residence:'Resident',registeredOn:'2026-01-01'},ashaId);assert.equal((await send(m)).status,200);
 r=await send({...h,mutationId:randomUUID(),data:{...h.data,name:'Updated Family'},baseVersion:0});assert.equal(r.status,409);assert.equal(r.data.details.record.version,1);
 assert.equal((await request('/api/sync','GET',undefined,other)).data.records.length,0);
 const raw=readFileSync(path.join(directory,'asha.sqlite'));assert.equal(raw.includes(Buffer.from('Private Patient')),false);const wal=readFileSync(path.join(directory,'asha.sqlite-wal'));assert.equal(wal.includes(Buffer.from('Private Patient')),false);
});
test('ASHA cannot read or overwrite a different worker’s existing record',async()=>{assert.equal((await send(mutation('family-one','household',{name:'Attack',address:'Street',locality:'Ward'},ashaId,1),other)).status,404);});
test('bad dates and cross-assignment parent links are rejected atomically',async()=>{
 const valid=mutation('rollback-family','household',{name:'Rollback',address:'Street',locality:'Ward'},ashaId),bad=mutation('rollback-member','member',{name:'Bad',householdId:'rollback-family',sex:'Male',residence:'Resident',dob:'2026-02-30',registeredOn:'2026-01-01'},ashaId);
 assert.equal((await send([valid,bad])).status,400);assert.equal((await request('/api/sync','GET',undefined,asha)).data.records.some(r=>r.id==='rollback-family'),false);
 const wrong=mutation('cross-member','member',{name:'Bad Link',householdId:'family-one',sex:'Female',residence:'Resident',registeredOn:'2026-01-01'},otherId);assert.equal((await send(wrong,admin)).status,400);
});
test('documents are private and omitted from bulk sync payloads',async()=>{
 const doc=mutation('document-one','document',{memberId:'member-one',name:'report.pdf',mime:'application/pdf',category:'Clinical report',content:Buffer.from('%PDF-1.4\nTest fixture').toString('base64')},ashaId);assert.equal((await send(doc)).status,200);
 const sync=(await request('/api/sync','GET',undefined,asha)).data;assert.equal(sync.records.find(r=>r.id==='document-one').data.content,undefined);
 assert.equal((await request('/api/documents/document-one','GET',undefined,other)).status,404);
 const response=await fetch(base+'/api/documents/document-one',{headers:{Authorization:`Bearer ${asha}`}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(await response.text(),/^%PDF/);
 assert.equal((await send(mutation('document-fake','document',{...doc.data,content:Buffer.from('<script>alert(1)</script>').toString('base64')},ashaId))).status,400);
});
test('births cannot be counted twice and visits require an actual completion date',async()=>{
 const ev={memberId:'member-one',type:'Birth',date:'2020-01-01',source:'Test clinic',status:'Confirmed'};assert.equal((await send(mutation('birth-one','event',ev,ashaId))).status,200);assert.equal((await send(mutation('birth-two','event',ev,ashaId))).status,409);
 assert.equal((await send(mutation('visit-bad','visit',{memberId:'member-one',program:'HBNC',dueDate:'2026-09-01',status:'Completed'},ashaId))).status,400);
});
test('server derives report totals and protects accepted snapshots',async()=>{
 let r=await send(mutation('report-one','report',{name:'Monthly',month:'2026-09',status:'Submitted',snapshot:{residentPopulation:9000}},ashaId));assert.equal(r.status,200);
 const report=(await request('/api/sync','GET',undefined,asha)).data.records.find(r=>r.id==='report-one');assert.equal(report.data.snapshot.residentPopulation,1);
 assert.equal((await send(mutation(report.id,'report',{...report.data,status:'Accepted'},ashaId,1))).status,403);
 assert.equal((await send(mutation(report.id,'report',{...report.data,status:'Accepted'},ashaId,1),admin)).status,200);
 assert.equal((await send(mutation(report.id,'report',{...report.data,status:'Draft'},ashaId,2),admin)).status,409);
});
test('approved schedule templates can only be changed by administrators',async()=>{
 const s={name:'Test schedule',program:'HBNC',approvedBy:'Test approver',source:'Test only',effectiveDate:'2026-01-01',unit:'days',offsets:[3,7],active:true};assert.equal((await send(mutation('schedule-bad','schedule',s,ashaId))).status,403);
 const user=(await request('/api/sync','GET',undefined,admin)).data.user;
 assert.equal((await send(mutation('schedule-ok','schedule',s,user.id),admin)).status,200);
 assert.ok((await request('/api/sync','GET',undefined,other)).data.records.some(r=>r.id==='schedule-ok'));
});
test('household transfer moves linked care records and keeps report history',async()=>{
 assert.equal((await request('/api/transfer','POST',{householdId:'family-one',ownerId:otherId,reason:'Boundary change'},admin)).status,200);
 const own=(await request('/api/sync','GET',undefined,asha)).data.records;assert.equal(own.some(r=>r.id==='member-one'),false);assert.ok(own.some(r=>r.id==='report-one'));
 const received=(await request('/api/sync','GET',undefined,other)).data.records;assert.ok(received.some(r=>r.id==='member-one'));assert.ok(received.some(r=>r.id==='document-one'));
});
test('account deactivation revokes existing sessions',async()=>{assert.equal((await request('/api/users/'+otherId,'PATCH',{active:false},admin)).status,200);assert.equal((await request('/api/sync','GET',undefined,other)).status,401);});
test('cross-origin requests and static traversal cannot expose data',async()=>{
 assert.equal((await request('/api/sync','GET',undefined,admin,{Origin:'https://untrusted.example'})).status,403);
 assert.equal((await request('/api/health','GET',undefined,undefined,{Origin:'https://appassets.androidplatform.net'})).headers.get('access-control-allow-origin'),'https://appassets.androidplatform.net');
 const r=await fetch(base+'/data/encryption.key');assert.equal(r.status,404);assert.equal(r.headers.get('x-content-type-options'),'nosniff');
});
