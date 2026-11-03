import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePublish, resolveMedia, contentHash } from '../src/validation.ts';
import { PublishJournal } from '../src/journal.ts';

const request = (extra = {}) => ({ taskId:'p1', channel:'fanqie', accountId:'author-1',
  title:'晨光', body:'正文内容', media:[], settings:{bookId:'90071992547409931',chapterNumber:1,useAI:true}, confirmed:true, ...extra });
const result = {state:'submitted',remoteId:'chapter-1',url:'https://fanqienovel.com/main/writer/book-manage'};

test('番茄作品 ID 保留字符串精度，并要求用户明确确认和 AI 声明', () => {
  assert.equal(validatePublish(request()).settings.bookId, '90071992547409931');
  assert.throws(() => validatePublish(request({confirmed:false})), /CONFIRMATION_REQUIRED/);
  assert.throws(() => validatePublish(request({settings:{bookId:90071992547409931,chapterNumber:1,useAI:true}})), /INVALID/);
  assert.throws(() => validatePublish(request({settings:{bookId:'123',chapterNumber:1}})), /INVALID/);
});
test('拒绝越界序号、空正文、不符渠道媒体与未知字段', () => {
  for (const extra of [{body:''},{settings:{bookId:'123',chapterNumber:-1,useAI:false}}, {media:['x.jpg']},{shell:'echo wrong'}]) {
    assert.throws(() => validatePublish(request(extra)), /INVALID/);
  }
  assert.throws(() => validatePublish(request({channel:'xiaohongshu',media:[],settings:{useAI:false}})), /INVALID/);
});
test('排期必须有时区，错过时间不直接补发', () => {
  assert.throws(() => validatePublish(request({dueAt:'2026-10-28T10:00:00'})), /TIMEZONE/);
  assert.throws(() => validatePublish(request({dueAt:'2026-10-28T02:00:00Z'}), Date.parse('2026-10-28T02:05:00Z')), /MISSED_SCHEDULE/);
  assert.equal(validatePublish(request({dueAt:'2026-10-28T10:00:00+08:00'}), Date.parse('2026-10-28T02:00:00Z')).dueAt, '2026-10-28T10:00:00+08:00');
});
test('素材只允许受管目录，拒绝目录穿越和符号链接逃逸', async () => {
  const root = await mkdtemp(join(tmpdir(),'postiz-media-'));
  const outside = await mkdtemp(join(tmpdir(),'postiz-outside-'));
  await writeFile(join(root,'cover.jpg'),'image');
  await writeFile(join(outside,'secret.jpg'),'private');
  await symlink(join(outside,'secret.jpg'),join(root,'escape.jpg'));
  assert.equal(await resolveMedia(root,'cover.jpg'),await realpath(join(root,'cover.jpg')));
  await assert.rejects(resolveMedia(root,'../secret.jpg'), /INVALID_MEDIA/);
  await assert.rejects(resolveMedia(root,'escape.jpg'), /INVALID_MEDIA/);
  await assert.rejects(resolveMedia(root,'https://other/cover.jpg'), /INVALID_MEDIA/);
});
test('内容指纹忽略对象键顺序，但检测正文和目标账号变化', () => {
  assert.equal(contentHash(request()),contentHash({...request(),settings:{useAI:true,chapterNumber:1,bookId:'90071992547409931'}}));
  assert.notEqual(contentHash(request()),contentHash(request({body:'修改后的正文'})));
  assert.notEqual(contentHash(request()),contentHash(request({accountId:'another'})));
});
test('持久化结果跨实例复用，不二次提交', async () => {
  const dir=await mkdtemp(join(tmpdir(),'postiz-journal-'));
  let writes=0;
  const one=new PublishJournal(dir);
  await one.publish(request(),async()=>{writes++;return result;});
  const two=new PublishJournal(dir);
  assert.deepEqual(await two.publish(request(),async()=>{writes++;return result;}),result);
  assert.equal(writes,1);
  await assert.rejects(two.publish(request({body:'changed'}),async()=>result), /TASK_CONFLICT/);
});
test('提交后超时被记为待核查，重启不盲重试', async () => {
  const dir=await mkdtemp(join(tmpdir(),'postiz-journal-'));
  let writes=0;
  const one=new PublishJournal(dir);
  assert.equal((await one.publish(request(),async()=>{writes++;throw Error('network timeout');})).state,'unknown');
  const two=new PublishJournal(dir);
  assert.equal((await two.publish(request(),async()=>{writes++;return result;})).state,'unknown');
  assert.equal(writes,1);
});
test('并发重复任务只执行一次，同账号不同任务串行', async () => {
  const dir=await mkdtemp(join(tmpdir(),'postiz-journal-'));
  const journal=new PublishJournal(dir);
  let active=0,peak=0,writes=0;
  const send=async()=>{ writes++; peak=Math.max(peak,++active); await new Promise(r=>setTimeout(r,12)); active--; return result; };
  await Promise.all([journal.publish(request(),send),journal.publish(request(),send),journal.publish(request({taskId:'p2'}),send)]);
  assert.equal(writes,2); assert.equal(peak,1);
});
