import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
export const hash = s => createHash('sha256').update(s).digest('hex');
export function passwordHash(password, salt=randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
export function passwordMatches(password, saved) { try {const [salt,digest]=saved.split(':');return timingSafeEqual(Buffer.from(digest,'hex'),scryptSync(password,salt,64));}catch{return false;} }
export function createStore(directory) {
  mkdirSync(directory,{recursive:true,mode:0o700}); chmodSync(directory,0o700);
  const keyPath=path.join(directory,'encryption.key');
  if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32),{mode:0o600});
  const key=readFileSync(keyPath); if(key.length!==32)throw Error('Invalid encryption key');
  function encrypt(value) {const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return {iv:iv.toString('base64'),...seal(c,value)};}
  function seal(c,value){const ciphertext=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return {tag:c.getAuthTag().toString('base64'),body:ciphertext.toString('base64')};}
  function pack(value){return JSON.stringify(encrypt(value));}
  function unpack(value){const v=JSON.parse(value),d=createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64'));d.setAuthTag(Buffer.from(v.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(v.body,'base64')),d.final()]).toString());}
  const db=new DatabaseSync(path.join(directory,'asha.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, area TEXT NOT NULL, role TEXT NOT NULL, password TEXT NOT NULL, active INTEGER DEFAULT 1, must_change INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL,deleted INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS records_owner ON records(owner_id,kind);
    CREATE TABLE IF NOT EXISTS mutations(user_id TEXT NOT NULL,mutation_id TEXT NOT NULL,body_hash TEXT NOT NULL,record_id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(user_id,mutation_id));
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL);`);
  chmodSync(path.join(directory,'asha.sqlite'),0o600);
  const publicUser=u=>u?{id:u.id,username:u.username,name:u.name,area:u.area,role:u.role,active:!!u.active,mustChangePassword:!!u.must_change}:null;
  const record=r=>r?{id:r.id,kind:r.kind,ownerId:r.owner_id,data:unpack(r.data),version:r.version,updatedAt:r.updated_at,deleted:!!r.deleted}:null;
  const audit=(actor,action,target)=>db.prepare('INSERT INTO audit(at,actor,action,target) VALUES(?,?,?,?)').run(new Date().toISOString(),actor,action,target);
  return {db,pack,unpack,publicUser,record,audit,close:()=>db.close()};
}
