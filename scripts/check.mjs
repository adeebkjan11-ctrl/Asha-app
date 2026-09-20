import {readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
function check(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())check(p);else if(/\.(mjs|js)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});if(r.status)process.exit(r.status);}}}
for(const d of ['web','server','scripts','test'])check(d);
JSON.parse(readFileSync('web/manifest.webmanifest','utf8'));
console.log('JavaScript syntax and app manifest are valid.');
