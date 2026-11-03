import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { TestimonialComponent } from '@gitroom/frontend/components/auth/testimonial.component';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <MantineWrapper>
      <Toaster />
      <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
        {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
        <ReturnUrlComponent />
        <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919]">
          <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
            {process.env.POSTIZ_LOCAL === 'true' ? <div><div className="text-[28px] font-semibold">中文内容工作台</div><p className="text-[13px] text-gray-400 mt-[8px]">Postiz 中文本机版 · AGPL-3.0 开源</p></div> : <LogoTextComponent />}
            <div className="flex">{children}</div>
            {process.env.POSTIZ_LOCAL === 'true' && <p className="text-[12px] text-gray-400">基于 <a className="underline" href="https://github.com/gitroomhq/postiz-app">Postiz</a> 修改。源码及许可证随安装目录提供；详见 README.md。</p>}
          </div>
        </div>
        {process.env.POSTIZ_LOCAL === 'true' ? <aside className="flex-1 p-[64px] hidden lg:flex flex-col justify-center gap-[24px]"><h2 className="text-[32px]">让内容创作有条理</h2><p>小红书图文 · 番茄长篇章节</p><p className="max-w-[480px] text-gray-400 leading-7">在本地管理文稿、素材和排期。发布前核对账号与内容，提交后保留任务记录。</p><p className="text-gray-400">开发预览版，真实账号发布尚待验收。</p></aside> : <div className="text-[36px] flex-1 pt-[88px] hidden lg:flex flex-col items-center">
          <div className="text-center">
            Over <span className="text-[42px] text-[#FC69FF]">20,000+</span>{' '}
            Entrepreneurs use
            <br />
            Postiz To Grow Their Social Presence
          </div>
          <TestimonialComponent />
        </div>}
      </div>
    </MantineWrapper>
  );
}
