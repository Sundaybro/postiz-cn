import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridge } from '../src/server.ts';
const token='test-local-bridge-token-32-characters';
const headers={authorization:'Bearer '+token};
const p={taskId:'post-1',channel:'fanqie',accountId:'me',title:'晨光',body:'正文',media:[],settings:{bookId:'123',chapterNumber:1,useAI:true},confirmed:true};
async function setup(options={}) {
  let reads=0,writes=0;
  const dir=await mkdtemp(join(tmpdir(),'postiz-http-'));
  const adapter={status:async()=>{reads++;return {ready:true,accountId:'me',name:'作者'};},login:async()=>({ready:true,accountId:'me'}),publish:async()=>{writes++;return {state:'submitted'};},books:async()=>[{id:'123',name:'一本书'}]};
  const app=createBridge({token,dataDir:dir,mediaRoot:dir,adapters:{fanqie:adapter,xiaohongshu:adapter},enablePublish:true,...options});
  return {app,counts:()=>({reads,writes})};
}
test('所有接口验证 Bearer 密钥并拒绝浏览器 Origin',async()=>{
  const {app}=await setup();
  assert.equal((await app.dispatch('GET','/health',{},null)).status,401);
  assert.equal((await app.dispatch('GET','/health',{...headers,origin:'https://outside.example'},null)).status,403);
  assert.equal((await app.dispatch('GET','/health',headers,null)).status,200);
});
test('离线预览不调用账号、浏览器或发布，也不创建任务',async()=>{
  const {app,counts}=await setup();
  const value=await app.dispatch('POST','/v1/fanqie/preview',headers,{...p,confirmed:false});
  assert.equal(value.status,200); assert.equal(value.body.data.title,'晨光');
  assert.deepEqual(counts(),{reads:0,writes:0});
  assert.equal((await app.dispatch('GET','/v1/tasks/post-1',headers,null)).status,404);
});
test('发布确认、身份、渠道和功能开关在写入前检查',async()=>{
  const {app,counts}=await setup({enablePublish:false});
  assert.equal((await app.dispatch('POST','/v1/fanqie/publish',headers,p)).body.error,'PUBLISH_DISABLED');
  assert.equal((await app.dispatch('POST','/v1/fanqie/publish',headers,{...p,confirmed:false})).status,400);
  assert.equal((await app.dispatch('POST','/v1/xiaohongshu/publish',headers,p)).status,400);
  assert.equal(counts().writes,0);
});
test('真实路由串联校验、记账和适配，重复请求不重发',async()=>{
  const {app,counts}=await setup();
  assert.equal((await app.dispatch('POST','/v1/fanqie/publish',headers,p)).body.data.state,'submitted');
  assert.equal((await app.dispatch('POST','/v1/fanqie/publish',headers,p)).body.data.state,'submitted');
  assert.equal(counts().writes,1);
  assert.equal((await app.dispatch('POST','/v1/fanqie/publish',headers,{...p,body:'修改'})).status,409);
});
test('账号变化不能发布；接口没有任意命令或 MCP 透传',async()=>{
  const {app,counts}=await setup();
  assert.equal((await app.dispatch('POST','/v1/fanqie/publish',headers,{...p,accountId:'other'})).status,409);
  assert.equal((await app.dispatch('POST','/v1/fanqie/exec',headers,{command:'bad'})).status,404);
  assert.equal(counts().writes,0);
});
