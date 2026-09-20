const utf8=new TextEncoder(),decode=new TextDecoder();
const b64=a=>btoa(Array.from(new Uint8Array(a),b=>String.fromCharCode(b)).join(''));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('asha-saathi-vault',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function access(mode,operation){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('vault',mode),req=operation(tx.objectStore('vault'));let value;req.onsuccess=()=>value=req.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage failed'));});}finally{db.close();}}
async function derive(password,salt){const key=await crypto.subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
let activeKey=null,salt=null;
export const vault={
  async metadata(){const v=await access('readonly',s=>s.get('current'));return v?{user:v.user,pending:v.pending,server:v.server}:null;},
  async unlock(password){const v=await access('readonly',s=>s.get('current'));if(!v)throw Error('No offline workspace is saved.');const k=await derive(password,bytes(v.salt));try{const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(v.iv)},k,bytes(v.body));activeKey=k;salt=bytes(v.salt);return JSON.parse(decode.decode(clear));}catch{throw Error('Offline password is incorrect.');}},
  async create(password){if(password.length<8)throw Error('Use at least 8 characters for your offline password.');salt=crypto.getRandomValues(new Uint8Array(16));activeKey=await derive(password,salt);},
  async save(data,server){if(!activeKey)throw Error('Unlock offline storage first.');const iv=crypto.getRandomValues(new Uint8Array(12)),body=await crypto.subtle.encrypt({name:'AES-GCM',iv},activeKey,utf8.encode(JSON.stringify(data)));await access('readwrite',s=>s.put({salt:b64(salt),iv:b64(iv),body:b64(body),user:{id:data.user.id,name:data.user.name},pending:data.outbox.length,server},'current'));},
  lock(){activeKey=null;salt=null;},
  async remove(){activeKey=null;salt=null;await access('readwrite',s=>s.delete('current'));}
};
