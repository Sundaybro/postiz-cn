# Postiz 中文本机版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在真实 Postiz 上接入小红书图文与番茄长篇章节，并提供项目内独立运行环境。
**Architecture:** Postiz 继续管理草稿、素材、日历和 Temporal 任务；宿主机 TypeScript 桥接服务执行 CLI/MCP。所有运行时、缓存与数据放项目 .local/，不安装全局软件。
**Tech Stack:** 上游 Next.js/NestJS/Prisma/Temporal；Node 22.23.4、pnpm 10.6.1；桥接采用 Node 原生 HTTP 与测试运行器。
**Spec:** ../specs-2026-10-28-local-cn.md；用户追加约束：独立环境、优先原生运行、运行前控制内存。

## Global Constraints
- 固定 upstream a5affe62c74e39c1e7ac960d50d8418b807d532c，分支 feat/chinese-local。
- 本机单用户；仅小红书图文和番茄已有长篇作品的单章发布。
- 不自动发布真实内容；离线预览不得触发浏览器编辑器或上传。
- Asia/Shanghai 显示、UTC 持久化；未知发布结果不盲重试。
- .local/、.env、原工具凭证与文稿均不得进入 Git。

## Review Focus
- 进程重启发生在平台提交之后：返回待核查，不重复提交。
- 同任务号内容改变、账号变更：拒绝复用原发布确认。
- 宿主机路径与 URL：只允许受管媒体目录，拒绝越界和符号链接逃逸。
- 日期无时区、电脑休眠错过排期：不静默集中补发。
- 浏览器验证、失效登录、MCP isError：真实反映，不能假报已发布。

### Task 1: 独立环境与上游基线
**Files:** scripts/local/bootstrap.sh、scripts/local/run.sh、.npmrc、.gitignore、LOCAL_BUILD.md。
**Interfaces:** run.sh <command...> 注入本项目 Node/pnpm、独立缓存；不改变系统 PATH 或 shell 配置。
- [x] 固定 Node/pnpm 并校验官方下载 Node 的 SHA256；幂等安装到 .local/。
- [x] 验证两次执行、缺失运行时错误和实际 node/pnpm 版本。
- [x] 使用固定 lockfile 下载依赖；记录上游基线失败，读取该版本 Next 开发文档后才写前端代码。
- [x] 本地提交基线与环境说明。

### Task 2: 桥接契约、校验、持久化防重复
**Files:** apps/local-bridge/src/{contracts,validation,journal,server}.ts；test/*.test.mjs。
**Interfaces:** /v1/:channel/status、login、books、chapters、preview、publish、tasks/:id；Bearer 密钥，只听 127.0.0.1；Postiz 服务端调用。
- [x] 先写并运行失败测试：非法字段、预览零写入、内容变化拒绝、进程恢复不重发、同账号串行、路径越界、Origin 拒绝。
- [x] 实现 PublishRequest {taskId,channel,accountId,title,body,media,settings,confirmed,dueAt} 与 BridgeResult {state,remoteId,url,message}。
- [x] 原子记账，领取任务后先持久化，再调用发布；异常进入 unknown；再次调用返回已记录结果。
- [x] 测试通过后本地提交。

### Task 3: 真实 CLI 与 MCP 适配
**Files:** apps/local-bridge/src/{process,xiaohongshu,fanqie,index}.ts。
**Interfaces:** ChannelAdapter {status,login,preview,publish,books?,chapters?}，只在用户点击连接时登录，只在确认发布时写入。
- [x] 先测试 JSON 信封、MCP isError、受控进程参数、字符串作品 ID、显式 AI 声明、没有远端 ID 不判发布。
- [x] 实现小红书 CLI 与番茄 stdio MCP；MCP 客户端通过本地现有工具安装定位 SDK，单进程复用。
- [x] 完整桥接离线集成测试：真实 HTTP + 临时目录 + 受控外部适配器；不使用个人凭证。
- [x] 测试通过后本地提交。

### Task 4: Postiz 渠道与中文编辑表单
**Files:** libraries/nestjs-libraries/src/integrations/social/{local.bridge,xiaohongshu,fanqie}.provider.ts；对应 DTO；integration.manager.ts；前端 providers/local-cn/ 与 show.all.providers.tsx；图标与主要文案。
**Interfaces:** 两渠道使用 Postiz 原有连接流程；身份只存本地引用；认证需真实状态检查；连接流程允许手动打开扫码；books/chapters 为 DashboardFunction 白名单。
- [x] 测试 PostDetails 到桥接请求映射、禁止线程/不符媒体、pending/unknown/failed 状态传播。
- [x] 接入 provider 注册与设置表单；番茄作品选择、TXT 导入与单章校验；原有预览保存不触发桥接写接口。
- [x] 编译前后端，验证核心页面与桥接接口；上游依赖阻塞明确记录。
- [x] 测试通过后本地提交。

### Task 5: 原生启动、资源检查和验收
**Files:** scripts/local/{setup,start,stop,status}.sh 或等价 Node 脚本；LOCAL_BUILD.md；.env.local.example。
**Interfaces:** 一条命令启动受控服务，独立本地数据目录与 PID 记录，逐个健康检查，停止仅影响本项目进程。
- [x] 核验可用的项目内 PostgreSQL、Redis、Temporal 分发；下载后记录版本、来源、校验与隔离路径。
- [x] 低内存配置，只启必需服务，启动前报告资源条件；不安装或启动系统服务。
- [x] 全套相关测试、类型检查、离线完整流程和重启验证，记录不能完成的真实环境事项。
- [x] 最终 fresh reviewer 审查全分支，修复重要问题；保留本地分支，不推送或开 PR。

## Execution record
- 用户已通过“开工”授权执行；2026-10-28 追加“允许下载，但是搞个独立环境”。不重复索要方案批准。
- 未发现遗留 pnpm 安装进程；此前系统级容器安装未成功，后续全改项目内环境。
