import {createApp} from './app.mjs';
const app=createApp();
const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
app.server.listen(port,host,()=>{console.log(`ASHA Saathi is listening on ${host}:${port}.`);console.log('First use: open the app and create a workspace using the token in your data/bootstrap-token file.');});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await app.close();process.exit(0);});
