import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXhsEnvelope, xhsArguments, xhsResult } from '../src/xiaohongshu.ts';
import { parseMcpResult, chapterArguments, chapterResult } from '../src/fanqie.ts';

const note={taskId:'p1',channel:'xiaohongshu',accountId:'me',title:'测试',body:'正文',media:['x.jpg'],settings:{useAI:true,topics:['读书']},confirmed:true};
test('CLI 返回必须检查业务信封，不能只检查进程退出码',()=>{
  assert.deepEqual(parseXhsEnvelope('{"ok":true,"data":{"id":"abc"}}'),{id:'abc'});
  assert.throws(()=>parseXhsEnvelope('{"ok":false,"error":{"message":"no"}}'), /CHANNEL_ERROR/);
  assert.throws(()=>parseXhsEnvelope('Uploaded: file\n{"ok":true}'),/INVALID_CHANNEL_RESPONSE/);
});
test('小红书发布使用参数数组，显式声明 AI 且不添加第二层定时',()=>{
  const args=xhsArguments(note,['/managed/x.jpg']);
  assert.deepEqual(args,['post','--title','测试','--body','正文','--images','/managed/x.jpg','--topic','读书','--ai-generated','--json']);
  assert.equal(args.includes('--schedule'),false);
  assert.equal(xhsArguments({...note,settings:{useAI:false}},['/x.jpg']).includes('--ai-generated'),false);
});
test('没有远端标识不判已发布；标识不插入未经编码的链接',()=>{
  assert.equal(xhsResult({}).state,'unknown');
  assert.equal(xhsResult({id:'abc123'}).state,'published');
  assert.equal(xhsResult({id:'abc123'}).url,'https://www.xiaohongshu.com/explore/abc123');
});
test('MCP 的 isError 和业务 ok 都参与结果判定',()=>{
  assert.throws(()=>parseMcpResult({isError:true,content:[{type:'text',text:'{"error":"bad"}'}]}),/CHANNEL_ERROR/);
  assert.throws(()=>parseMcpResult({content:[{type:'text',text:'{"ok":false}'}]}),/CHANNEL_ERROR/);
  assert.deepEqual(parseMcpResult({content:[{type:'text',text:'{"ok":true,"books":[]}'}]}),{ok:true,books:[]});
});
test('章节参数保留作品 ID 字符串，显式确认与 AI 标志，不调用预览工具',()=>{
  const value=chapterArguments({...note,channel:'fanqie',media:[],settings:{bookId:'90071992547409931',chapterNumber:12,useAI:false}});
  assert.deepEqual(value,{book_id:'90071992547409931',chapter_number:12,title:'测试',content:'正文',confirm:true,use_ai:false,headless:false});
});
test('番茄工具的 published 只表示提交完成，不跳过平台审核',()=>{
  assert.equal(chapterResult({ok:true,action:'published',message:'submitted'}).state,'submitted');
  assert.equal(chapterResult({ok:true,action:'filled-not-submitted'}).state,'unknown');
});
