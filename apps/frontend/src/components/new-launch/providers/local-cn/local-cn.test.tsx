import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { LocalSettings } from './local-settings';
const state=vi.hoisted(()=>({context:{integration:{id:'channel-1'},value:[{content:'正文',image:[]}]},get:vi.fn()}));
vi.mock('@gitroom/frontend/components/launches/helpers/use.integration',()=>({useIntegration:()=>state.context}));
vi.mock('@gitroom/frontend/components/launches/helpers/use.custom.provider.function',()=>({useCustomProviderFunction:()=>({get:state.get})}));
vi.mock('@gitroom/frontend/components/new-launch/store',()=>({useLaunchStore:(select:any)=>select({current:'global',setGlobalValueText:()=>{},setInternalValueText:()=>{}})}));
function Form({channel='fanqie'}:{channel?:'fanqie'|'xiaohongshu'}) {
  const form=useForm({defaultValues:{title:'第一章',bookId:'',chapterNumber:1,useAI:false,confirmed:false}});
  const value=useWatch({control:form.control,name:'confirmed'});
  return <FormProvider {...form}><LocalSettings channel={channel}/><output aria-label="确认状态">{String(value)}</output></FormProvider>;
}
beforeEach(()=>{cleanup();state.context.value=[{content:'正文',image:[]}];state.get.mockReset();state.get.mockResolvedValue([{id:'90071992547409931',name:'我的小说'}]);});
describe('本机渠道编辑表单',()=>{
  it('番茄作品列表显示真实返回的标题并保留字符串 ID',async()=>{
    render(<Form/>);
    await screen.findByRole('option',{name:'我的小说'});
    fireEvent.change(screen.getByLabelText('目标作品'),{target:{value:'90071992547409931'}});
    expect((screen.getByLabelText('目标作品') as HTMLSelectElement).value).toBe('90071992547409931');
    expect(screen.getByText('导入 TXT 文稿')).toBeTruthy();
  });
  it('确认之后修改标题或正文，必须重新确认',async()=>{
    const view=render(<Form channel="xiaohongshu"/>);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByLabelText('确认状态').textContent).toBe('true');
    fireEvent.change(screen.getByLabelText('笔记标题'),{target:{value:'修改后的标题'}});
    await waitFor(()=>expect(screen.getByLabelText('确认状态').textContent).toBe('false'));
    fireEvent.click(screen.getByRole('checkbox'));
    state.context.value=[{content:'修改后的正文',image:[]}];
    view.rerender(<Form channel="xiaohongshu"/>);
    await waitFor(()=>expect(screen.getByLabelText('确认状态').textContent).toBe('false'));
  });
  it('作品读取失败时显示错误，不伪造作品或连接成功',async()=>{
    state.get.mockRejectedValue(Error('offline'));
    render(<Form/>);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('option',{name:'我的小说'})).toBeNull();
  });
});
