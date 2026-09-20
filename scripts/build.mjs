import {cpSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
const out='dist';rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
for(const item of ['server','web','docs','package.json','package-lock.json','README.md','Dockerfile','compose.yaml','.dockerignore'])cpSync(item,`${out}/server/${item}`,{recursive:true});
cpSync('web',`${out}/web`,{recursive:true});
mkdirSync('android/app/src/main/assets',{recursive:true});cpSync('web','android/app/src/main/assets',{recursive:true});
cpSync('web/assets',`${out}/brand`,{recursive:true});
writeFileSync(`${out}/BUILD-INFO.json`,JSON.stringify({name:'ASHA Saathi',version:'1.0.0',commit:process.env.GITHUB_SHA||'local',createdAt:new Date().toISOString(),androidPackage:'org.ashasaathi.app.preview',type:'preview; shared records require a configured HTTPS server'},null,2));
console.log('Built server, web, Android assets and brand packages.');
