import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const local=resolve(root,'.local');
for(const dir of ['data/bridge','data/uploads','data/redis','data/temporal','state','logs']) await mkdir(resolve(local,dir),{recursive:true,mode:0o700});
const envFile=resolve(root,'.env');
try { await access(envFile); console.log('.env already exists; preserved.'); process.exit(0); } catch {}
const secret=()=>randomBytes(32).toString('hex');
const pgPassword=secret(), redisPassword=secret();
let bridgeToken;
try {bridgeToken=(await readFile(resolve(local,'data/bridge/token'),'utf8')).trim();}
catch {bridgeToken=secret();await writeFile(resolve(local,'data/bridge/token'),bridgeToken,{mode:0o600,flag:'wx'});}
const values={
  POSTIZ_LOCAL:'true',BIND_ADDRESS:'127.0.0.1',PORT:'4310',ORCHESTRATOR_PORT:'4311',
  FRONTEND_URL:'http://localhost:4200',NEXT_PUBLIC_BACKEND_URL:'http://localhost:4310',BACKEND_INTERNAL_URL:'http://127.0.0.1:4310',
  DATABASE_URL:`postgresql://postiz:${pgPassword}@127.0.0.1:5437/postiz_cn`,REDIS_URL:`redis://:${redisPassword}@127.0.0.1:6387`,
  JWT_SECRET:secret(),TEMPORAL_ADDRESS:'127.0.0.1:7237',TEMPORAL_NAMESPACE:'default',
  STORAGE_PROVIDER:'local',UPLOAD_DIRECTORY:resolve(local,'data/uploads'),NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY:'http://localhost:4200/uploads',
  NOT_SECURED:'true',IS_GENERAL:'true',DISABLE_REGISTRATION:'true',DISALLOW_PLUS:'true',
  LOCAL_BRIDGE_URL:'http://127.0.0.1:4318',LOCAL_BRIDGE_TOKEN:bridgeToken,LOCAL_BRIDGE_ENABLE_PUBLISH:'0',
  XHS_COMMAND:resolve(root,'scripts/local/xhs.sh'),FANQIE_PROJECT:resolve(local,'connectors/fanqie'),NEXT_TELEMETRY_DISABLED:'1',TZ:'Asia/Shanghai',
};
await writeFile(envFile,Object.entries(values).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
await writeFile(resolve(local,'data/pg-password'),pgPassword,{mode:0o600});
await writeFile(resolve(local,'data/pgpass'),`127.0.0.1:5437:*:postiz:${pgPassword}\n`,{mode:0o600});
await writeFile(resolve(local,'data/redis/redis.conf'),[
 'bind 127.0.0.1','port 6387','protected-mode yes',`requirepass ${redisPassword}`,`dir ${JSON.stringify(resolve(local,'data/redis'))}`,
 'maxmemory 128mb','maxmemory-policy noeviction','maxclients 64','appendonly yes','save 300 10',
].join('\n')+'\n',{mode:0o600});
console.log('Created project-local configuration and private credentials. Publishing remains disabled.');
