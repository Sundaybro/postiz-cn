import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createBridge } from './server.ts';
import { XiaohongshuAdapter } from './xiaohongshu.ts';
import { FanqieAdapter } from './fanqie.ts';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const dataDir=resolve(project,'.local/data/bridge');
await mkdir(dataDir,{recursive:true,mode:0o700});
const tokenFile=resolve(dataDir,'token');
let token=process.env.LOCAL_BRIDGE_TOKEN || '';
if (!token) {
  try { token=(await readFile(tokenFile,'utf8')).trim(); }
  catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    token=randomBytes(32).toString('hex');
    await writeFile(tokenFile,token,{mode:0o600,flag:'wx'});
  }
}
const mediaRoot=resolve(process.env.UPLOAD_DIRECTORY || resolve(project,'.local/data/uploads'));
const fanqie=new FanqieAdapter(resolve(process.env.FANQIE_PROJECT || resolve(project,'.local/connectors/fanqie')),resolve(project,'.local/data/fanqie'));
const bridge=createBridge({token,dataDir,mediaRoot,enablePublish:process.env.LOCAL_BRIDGE_ENABLE_PUBLISH === '1',adapters:{
  xiaohongshu:new XiaohongshuAdapter(process.env.XHS_COMMAND || resolve(project,'scripts/local/xhs.sh'),mediaRoot),fanqie,
}});
const port=Number(process.env.LOCAL_BRIDGE_PORT || 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid bridge port');
bridge.server.listen(port,'127.0.0.1',()=>console.error(`Postiz 本机桥接已启动：127.0.0.1:${port}；发布${process.env.LOCAL_BRIDGE_ENABLE_PUBLISH === '1' ? '已启用' : '未启用'}`));
const shutdown=()=> { bridge.server.close(); fanqie.close().finally(()=>process.exit(0)); };
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
