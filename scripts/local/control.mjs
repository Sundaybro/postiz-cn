import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,open,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {createControlServer,requestControl} from './control-channel.mjs';
import dotenv from 'dotenv';
import pgClient from 'pg';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const local=resolve(root,'.local'), state=resolve(local,'state');
const controlPort=4319, tokenFile=resolve(state,'control-token');
const exec=promisify(execFile);
await mkdir(state,{recursive:true,mode:0o700});
await mkdir(resolve(local,'logs'),{recursive:true,mode:0o700});
let token;
try {token=(await readFile(tokenFile,'utf8')).trim();}
catch(e) {if(e.code!=='ENOENT')throw e;token=randomBytes(32).toString('hex');await writeFile(tokenFile,token,{mode:0o600,flag:'wx'});}
const request=path=>requestControl(controlPort,token,path);
const action=process.argv[2]||'status';
if(action==='status'||action==='stop') {
 try {console.log(JSON.stringify(await request(action==='stop'?'/stop':'/status'),null,2));}
 catch(e){if(['ENOENT','ECONNREFUSED'].includes(e.code))console.log('Postiz CN supervisor is not running.');else throw e;}
} else if(action==='start') {
 try {console.log(JSON.stringify(await request('/status'),null,2));process.exit(0);}catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;}
 const log=await open(resolve(local,'logs/supervisor.log'),'a',0o600);
 const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'supervise'],{cwd:root,detached:true,stdio:['ignore',log.fd,log.fd],env:process.env});child.unref();await log.close();
 for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,200));try{console.log(JSON.stringify(await request('/status'),null,2));process.exit(0);}catch{}}
 throw Error('Supervisor did not start; see .local/logs/supervisor.log');
} else if(action==='supervise') {
 // Parse data, never evaluate .env as shell code.
 const env={...process.env,...dotenv.parse(await readFile(resolve(root,'.env'))),NODE_OPTIONS:'--max-old-space-size=1024',PGPASSFILE:resolve(local,'data/pgpass'),PGHOST:'127.0.0.1',PGPORT:'5437',PGUSER:'postiz',NEXT_TELEMETRY_DISABLED:'1'};
 const pg=resolve(local,'runtime/postgres/package/native/bin');
 const children=[];let phase='starting',stopping=false,server;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 async function shutdown() {
  if(stopping)return;stopping=true;phase='stopping';
  for(const {child} of [...children].reverse()){
   if(child.exitCode!==null||child.signalCode)continue;
   try{process.kill(-child.pid,'SIGTERM');}catch{}
   for(let i=0;i<50&&child.exitCode===null&&!child.signalCode;i++)await wait(100);
   if(child.exitCode===null&&!child.signalCode)try{process.kill(-child.pid,'SIGKILL');}catch{}
  }
  server?.close();process.exit(0);
 }
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
 async function portOpen(port){return new Promise(yes=>{const s=net.connect({host:'127.0.0.1',port});s.setTimeout(200);s.once('connect',()=>{s.destroy();yes(true);});s.once('error',()=>{s.destroy();yes(false);});s.once('timeout',()=>{s.destroy();yes(false);});});}
 async function ready(port,child,seconds=90){for(let i=0;i<seconds*5;i++){if(stopping)throw Error('Stopping');if(child.exitCode!==null||child.signalCode)throw Error('Service exited; inspect its project log');if(await portOpen(port))return;await wait(200);}throw Error(`Timed out on port ${port}`);}
 async function launch(name,command,args,port,extraEnv={}){
  phase=`starting ${name}`;
  const log=await open(resolve(local,`logs/${name}.log`),'a',0o600);
  const child=spawn(command,args,{cwd:root,env:{...env,...extraEnv},detached:true,stdio:['ignore',log.fd,log.fd]});await log.close();
  child.on('error',()=>{phase=`failed ${name}`;shutdown();});
  children.push({name,child});
  child.on('exit',()=>{if(!stopping){console.error(`${name} exited; stopping project services.`);shutdown();}});
  if(port)await ready(port,child,name==='frontend'?180:90);
  return child;
 }
 try {
  server=createControlServer(token,async(req,res)=>{
   if(req.url==='/stop'&&req.method==='POST'){res.end(JSON.stringify({state:'stopping'}));shutdown();return;}
   if(req.url!=='/status'||req.method!=='GET'){res.writeHead(404);res.end();return;}
   const processes=await Promise.all(children.map(async({name,child})=>{
    let rssMB=null;try{const out=await exec('/bin/ps',['-o','rss=','-p',String(child.pid)]);rssMB=Math.round(Number(out.stdout.trim())/1024);}catch{}
    return {name,pid:child.pid,rssMB};
   }));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({state:phase,url:'http://localhost:4200',processes}));
  });server.listen(controlPort,'127.0.0.1');await new Promise((yes,no)=>{server.once('listening',yes);server.once('error',no);});
  for(const port of [5437,6387,7237,4318,4310,4311,4200])if(await portOpen(port))throw Error(`Port ${port} is already in use; no existing process was stopped.`);
  await access(resolve(root,'apps/backend/dist/apps/backend/src/main.js'));
  await access(resolve(root,'apps/orchestrator/dist/apps/orchestrator/src/main.js'));
  await access(resolve(root,'apps/frontend/.next/BUILD_ID'));

  const pgData=resolve(local,'data/postgres');let fresh=false;
  try{await access(resolve(pgData,'PG_VERSION'));}catch{fresh=true;phase='initializing postgres';await exec(resolve(pg,'initdb'),['-D',pgData,'-U','postiz','--auth-local=trust','--auth-host=scram-sha-256','--pwfile',resolve(local,'data/pg-password'),'--encoding=UTF8'],{env});}
  await launch('postgres',resolve(pg,'postgres'),['-D',pgData,'-h','127.0.0.1','-p','5437','-k',state,'-c','shared_buffers=32MB','-c','max_connections=20'],5437);
  const databaseURL=new URL(env.DATABASE_URL);
  if(databaseURL.hostname!=='127.0.0.1'||databaseURL.port!=='5437'||databaseURL.pathname!=='/postiz_cn')throw Error('Local supervisor requires its isolated postiz_cn database.');
  databaseURL.pathname='/postgres';
  const admin=new pgClient.Client({connectionString:databaseURL.href});
  await admin.connect();
  try{const existing=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',['postiz_cn']);if(!existing.rowCount)await admin.query('CREATE DATABASE postiz_cn');}finally{await admin.end();}
  phase='checking database schema';
  const schemaLog=await open(resolve(local,'logs/schema.log'),'a',0o600);
  const schema=spawn(process.execPath,[resolve(root,'node_modules/prisma/build/index.js'),'db','push','--skip-generate','--schema',resolve(root,'libraries/nestjs-libraries/src/database/prisma/schema.prisma')],{cwd:root,env,stdio:['ignore',schemaLog.fd,schemaLog.fd]});await schemaLog.close();
  await new Promise((yes,no)=>{schema.once('error',no);schema.once('exit',code=>code===0?yes():no(Error('Schema update failed; see .local/logs/schema.log. No forced reset was used.')));});
  await launch('redis',resolve(local,'runtime/redis/redis-7.4.12/src/redis-server'),[resolve(local,'data/redis/redis.conf')],6387);
  await launch('temporal',resolve(local,'runtime/temporal/temporal'),['server','start-dev','--ip','127.0.0.1','--port','7237','--headless','--db-filename',resolve(local,'data/temporal/temporal.db'),'--search-attribute','organizationId=Text','--search-attribute','postId=Text'],7237,{GOMEMLIMIT:'384MiB',GOMAXPROCS:'2'});
  await launch('bridge',process.execPath,['--experimental-strip-types',resolve(root,'apps/local-bridge/src/index.ts')],4318);
  await launch('backend',process.execPath,[resolve(root,'apps/backend/dist/apps/backend/src/main.js')],4310);
  await launch('orchestrator',process.execPath,[resolve(root,'apps/orchestrator/dist/apps/orchestrator/src/main.js')],4311);
  await launch('frontend',process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'start','-p','4200','-H','127.0.0.1',resolve(root,'apps/frontend')],4200);
  phase='running';console.log('Postiz CN ready: http://localhost:4200');
 }catch(e){console.error(e.message);await shutdown();}
} else {throw Error('Usage: control.mjs start|stop|status');}
