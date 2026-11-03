import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLocalPost, localPostSettings, localEditorContent } from '../../../libraries/nestjs-libraries/src/integrations/social/local-cn.mapping.ts';
const post={id:'post-1',message:'正文',media:[],settings:{title:'第一章',bookId:'123',chapterNumber:1,useAI:false,confirmed:true}};
const config={uploadUrl:'http://localhost:4200/uploads/'};
test('Postiz 单章映射保留字符串作品 ID 与确认信息',()=>{
  const p=mapLocalPost('fanqie','author',post,config);
  assert.deepEqual(p,{taskId:'post-1',channel:'fanqie',accountId:'author',title:'第一章',body:'正文',media:[],settings:{bookId:'123',chapterNumber:1,useAI:false},confirmed:true});
});
test('Postiz 受管素材 URL 转成相对路径，拒绝第三方地址与路径穿越',()=>{
  const p={...post,media:[{type:'image',path:'http://localhost:4200/uploads/2026/cover.jpg'}]};
  assert.deepEqual(mapLocalPost('xiaohongshu','me',p,config).media,['2026/cover.jpg']);
  for(const path of ['https://evil.example/cover.jpg','http://localhost:4200/private.jpg','/etc/secret.jpg','http://localhost:4200/uploads/%2e%2e/secret.jpg']) {
    assert.throws(()=>mapLocalPost('xiaohongshu','me',{...p,media:[{type:'image',path}]},config),/LOCAL_MEDIA_ONLY/);
  }
});
test('后端映射拒绝未确认、视频及缺少作品参数，不信任前端校验',()=>{
  assert.throws(()=>mapLocalPost('fanqie','me',{...post,settings:{...post.settings,confirmed:false}},config),/CONFIRM/);
  assert.throws(()=>mapLocalPost('xiaohongshu','me',{...post,media:[{type:'video',path:'uploads/x.mp4'}]},config),/IMAGE_ONLY/);
  assert.throws(()=>mapLocalPost('fanqie','me',{...post,settings:{title:'一',useAI:false,confirmed:true}},config),/BOOK_REQUIRED/);
});
test('本机排期使用数据库的真实时间，外部渠道设置保持原样',()=>{
  assert.deepEqual(localPostSettings('fanqie','{"title":"一"}',new Date('2026-10-28T02:00:00Z')),{title:'一',dueAt:'2026-10-28T02:00:00.000Z'});
  assert.deepEqual(localPostSettings('bluesky','{"a":1}',new Date()),{a:1});
});
test('本机纯文本发布保留段落和换行标记，普通文本不改动',()=>{
  assert.equal(localEditorContent('fanqie','<p>第一段</p><p>第二段<br>换行</p>'),'<p>第一段</p>\n\n<p>第二段\n换行</p>\n\n');
  assert.equal(localEditorContent('xiaohongshu','纯文本\n第二行'),'纯文本\n第二行');
  assert.equal(localEditorContent('bluesky','<p>不改动</p>'),'<p>不改动</p>');
});
test('真实 Postiz 本地存储返回的绝对路径只在受管目录内转换',()=>{
 const p={...post,media:[{type:'image',path:'/project/.local/data/uploads/2026/cover.jpg'}]};
 const cfg={...config,mediaRoot:'/project/.local/data/uploads'};
 assert.deepEqual(mapLocalPost('xiaohongshu','me',p,cfg).media,['2026/cover.jpg']);
 for(const path of ['/etc/private.jpg','/project/.local/data/uploads-other/a.jpg','/project/.local/data/uploads/../secret.jpg'])assert.throws(()=>mapLocalPost('xiaohongshu','me',{...p,media:[{type:'image',path}]},cfg),/LOCAL_MEDIA_ONLY/);
});
