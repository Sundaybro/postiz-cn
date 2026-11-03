import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localQueueAllowed } from '../../../libraries/nestjs-libraries/src/temporal/local-cn.queues.ts';
test('本机只启主队列和两个渠道，不额外创建平台和邮件 Worker',()=>{
  assert.deepEqual(['main','xiaohongshu','fanqie','x','youtube','email'].filter(q=>localQueueAllowed(q,true)),['main','xiaohongshu','fanqie']);
  assert.equal(localQueueAllowed('email',false),true);
});
