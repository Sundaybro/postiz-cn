'use client';
import React, { useEffect, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const field='w-full min-w-0 h-[42px] bg-newBgColorInner px-[12px] border border-newTableBorder rounded-[8px] text-textColor';
const group='flex flex-col gap-[6px]';
export function LocalSettings({channel}:{channel:'xiaohongshu'|'fanqie'}) {
  const form=useSettings();
  const values=useWatch({control:form.control});
  const {integration,value,date}=useIntegration();
  const functions=useCustomProviderFunction();
  const [books,setBooks]=useState<{id:string;name:string}[]>([]);
  const [loading,setLoading]=useState(channel === 'fanqie');
  const [error,setError]=useState('');
  const [imported,setImported]=useState('');
  const current=useLaunchStore(s=>s.current);
  const setGlobalValueText=useLaunchStore(s=>s.setGlobalValueText);
  const setInternalValueText=useLaunchStore(s=>s.setInternalValueText);
  const prefix=`local-${integration?.id || channel}`;
  const fingerprint=JSON.stringify([value,date?.toISOString(),values.title,values.bookId,values.chapterNumber,values.useAI,values.topics]);
  useEffect(()=>{form.setValue('confirmed',false,{shouldValidate:true});},[fingerprint]);
  useEffect(()=>{
    if (channel !== 'fanqie') return;
    let cancelled=false;
    setLoading(true);
    functions.get('localBooks').then(data=>{
      if (!Array.isArray(data) || data.some(b=>typeof b.id !== 'string' || typeof b.name !== 'string')) throw Error('INVALID_BOOKS');
      if (!cancelled) setBooks(data);
    }).catch(()=>{if(!cancelled)setError('无法读取作品。请检查番茄连接状态后重新打开编辑器。');})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[channel,integration?.id]);
  async function importText(file:File | undefined) {
    if (!file) return;
    setError('');setImported('');
    try {
      if (!file.name.toLowerCase().endsWith('.txt') || file.size > 1024*1024) throw Error();
      const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/,'');
      if (!text.trim() || Array.from(text).length > 80000) throw Error();
      const html=text.replace(/\r\n?/g,'\n').split('\n').map(line=>`<p>${line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') || '<br>'}</p>`).join('');
      if (current === 'global') setGlobalValueText(0,html);
      else if (integration?.id) setInternalValueText(integration.id,0,html);
      form.setValue('confirmed',false,{shouldValidate:true});
      setImported(`已导入 ${file.name}，共 ${Array.from(text).length} 字符，请预览后确认。`);
    } catch {setError('导入失败：请选择 1 MB 以内的 UTF-8 TXT，正文为 1–80000 字符。');}
  }
  const bodyLength=Array.from((value?.[0]?.content || '').replace(/<[^>]*>/g,'')).length;
  return <div className="flex flex-col gap-[14px] min-w-0">
    <div className="text-[14px]">{channel === 'fanqie' ? '番茄小说 · 单章发布' : '小红书 · 图文笔记'}</div>
    <label className={group} htmlFor={`${prefix}-title`}>
      <span>{channel === 'fanqie' ? '章节标题' : '笔记标题'}</span>
      <input id={`${prefix}-title`} className={field} maxLength={channel === 'fanqie' ? 100 : 20} {...form.register('title')}/>
    </label>
    {channel === 'fanqie' && <>
      <label className={group} htmlFor={`${prefix}-book`}><span>目标作品</span>
        <select id={`${prefix}-book`} className={field} disabled={loading} {...form.register('bookId')}>
          <option value="">{loading ? '正在读取作品…' : books.length ? '请选择作品' : '暂无作品，请先在番茄后台创建'}</option>
          {books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className={group} htmlFor={`${prefix}-number`}><span>章节序号</span>
        <input id={`${prefix}-number`} type="number" min={1} step={1} className={field} {...form.register('chapterNumber',{valueAsNumber:true})}/>
      </label>
      <label className={group} htmlFor={`${prefix}-file`}><span>导入 TXT 文稿</span>
        <input id={`${prefix}-file`} type="file" accept=".txt,text/plain" onChange={e=>void importText(e.target.files?.[0])}/>
      </label>
      <p className="text-[12px]">章节提交后请到番茄作者后台核查审核结果。当前版本保留待核查状态，不会自动判定审核通过。</p>
      {imported && <div role="status" className="text-[12px]">{imported}</div>}
    </>}
    {channel === 'xiaohongshu' && <label className={group} htmlFor={`${prefix}-topics`}><span>话题（逗号分隔，最多 10 个）</span>
      <input id={`${prefix}-topics`} className={field} value={(values.topics || []).join(', ')} onChange={e=>form.setValue('topics',e.target.value.split(/[,，]/).map(s=>s.trim().replace(/^#/, '')).filter(Boolean),{shouldValidate:true})}/>
    </label>}
    <label className={group} htmlFor={`${prefix}-ai`}><span>是否使用 AI 创作</span>
      <select id={`${prefix}-ai`} className={field} value={typeof values.useAI === 'boolean' ? values.useAI ? 'yes' : 'no' : ''} onChange={e=>form.setValue('useAI',e.target.value === '' ? undefined : e.target.value === 'yes',{shouldValidate:true})}>
        <option value="">请明确选择</option><option value="no">否</option><option value="yes">是</option>
      </select>
    </label>
    <div className="text-[12px]">正文约 {bodyLength} 字符。预览和保存草稿均在本地完成。</div>
    <label className="flex items-start gap-[8px]">
      <input type="checkbox" className="mt-[4px]" checked={values.confirmed === true} onChange={e=>form.setValue('confirmed',e.target.checked,{shouldValidate:true})}/>
      <span>我已核对目标账号、正文、素材和声明，确认本次发布。修改内容后需要重新勾选。</span>
    </label>
    <div className="text-[12px]">排期时请保持电脑开机、服务运行。错过排期会提示处理。</div>
    {error && <div role="alert" className="text-red-400 text-[12px]">{error}</div>}
    {Object.values(form.formState.errors).map((e:any,i)=><div key={i} className="text-red-400 text-[12px]">{String(e.message || '请检查平台参数')}</div>)}
  </div>;
}
