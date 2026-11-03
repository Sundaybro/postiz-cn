import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {requestControl} from '../../../scripts/local/control-channel.mjs';
const token='t'.repeat(48);
async function holder(port=0){
 const code=`import {createControlServer} from './scripts/local/control-channel.mjs'; const s=createControlServer('${token}',(req,res)=>res.end(JSON.stringify({state:'ready'})));s.listen(${port},'127.0.0.1',()=>console.log(s.address().port));`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
 const lines=createInterface({input:child.stdout});
 const exited=once(child,'exit').then(()=>{throw Error('Control fixture exited before listening');});
 const line=await Promise.race([once(lines,'line').then(([line])=>line),exited]);lines.close();
 return {child,port:Number(line)};
}
test('监督进程异常退出后控制端口自动释放，重启不依赖残留锁文件',async()=>{
 let first,second;
 try{
  first=await holder();
  assert.equal((await requestControl(first.port,token,'/status')).state,'ready');
  await assert.rejects(requestControl(first.port,'wrong-token','/status'),/CONTROL_UNAUTHORIZED/);
  const death=once(first.child,'exit');first.child.kill('SIGKILL');await death;
  second=await holder(first.port);
  assert.equal((await requestControl(second.port,token,'/status')).state,'ready');
 }finally{for(const item of [first,second])if(item&&item.child.exitCode===null&&!item.child.signalCode){const death=once(item.child,'exit');item.child.kill();await death;}}
});
