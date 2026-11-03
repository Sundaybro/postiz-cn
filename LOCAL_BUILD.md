# 本机安装与运行

## 环境与目录

已验证：macOS Apple Silicon、16 GB 内存。原生服务下载脚本目前只支持这一平台；Linux / Intel macOS 暂不属于已验证的一键安装范围。

安装前准备 Git、Xcode Command Line Tools、uv 与 Python 3.12+。下载需要访问国内 npm / PyPI 镜像以及 Redis、Temporal 的官方分发地址。国内镜像不保证始终可达。

所有项目写入均在当前仓库：

- `.local/runtime/`：Node 22.23.4、PostgreSQL 17.8、Redis 7.4.12、Temporal CLI 1.9.1。
- `.local/pnpm/`、`.local/cache/`：pnpm 10.6.1 与下载缓存。
- `.local/python/`、`.local/connectors/fanqie/`：独立渠道环境。
- `.local/data/`：数据库、任务记录、素材、平台登录信息。
- `.local/logs/`、`.local/state/`：日志与本项目进程控制。
- `.env`：本机配置与随机生成的密钥，不提交 Git。

使用已有 Python 只读取解释器；包安装到项目虚拟环境。使用 uv 自动下载解释器时，安装脚本把 Python 下载目录也设置在 `.local/runtime/python/`。

## 安装

```bash
# 若 python3 已经是 3.12+，直接执行
bash scripts/local/setup.sh

# 否则指定已有的 Python 3.12+ 路径
LOCAL_BOOTSTRAP_PYTHON=/absolute/path/to/python3.12 \
LOCAL_PYTHON=/absolute/path/to/python3.12 \
bash scripts/local/setup.sh
```

脚本依次安装本项目 Node/pnpm、锁定的工作区依赖，生成随机本机配置，下载校验原生服务，安装连接器并串行构建。不会注册系统服务或修改 shell 配置。

镜像可通过 `LOCAL_NODE_MIRROR`（官方或华为云允许列表）、`LOCAL_NPM_REGISTRY`、`LOCAL_PYPI_INDEX` 调整。Node/原生服务归档都有固定校验值；连接器的固定源码位于 `third_party/`，Python 包版本在 `scripts/local/requirements-xhs.txt`。

首次构建需要数 GB 临时内存：后端/任务服务堆上限 3.5 GB，前端 5 GB，依次构建。它们是构建进程上限，不是日常服务预留。不要同时运行多份构建。

安装需要约 8–12 GB 磁盘空间（依赖、缓存、运行时和构建产物，素材与数据库另计）。缓存和依赖不是常驻内存。

## 启动、停止

```bash
bash scripts/local/run.sh node scripts/local/control.mjs start
bash scripts/local/run.sh node scripts/local/control.mjs status
bash scripts/local/run.sh node scripts/local/control.mjs stop
```

`start` 返回启动阶段；等 `status` 显示 `running` 后打开 http://localhost:4200。后台日志在 `.local/logs/supervisor.log` 和各服务日志中。失败会停止本轮启动的项目服务。端口占用时拒绝启动，不停止其他项目进程。

| 服务 | 回环端口 |
| --- | --- |
| 前端 | 4200 |
| 后端 | 4310 |
| 任务服务 | 4311 |
| 本机桥接 | 4318 |
| 私有进程控制（Bearer 密钥） | 4319 |
| PostgreSQL | 5437 |
| Redis | 6387 |
| Temporal | 7237 |

所有服务仅监听回环地址。控制端口由系统随进程退出释放，不依赖磁盘锁文件。首次打开创建本地账户，不需要 Postiz 云注册；首个账户创建后关闭后续注册。

空闲启动的七个主进程 RSS 合计约 1.5 GB（2026-10-28 单次测量），不包括浏览器及所有子进程，也不代表峰值。打开浏览器、上传大图和发布会增加占用。内存不足时先停止项目；本版仅启用主队列、小红书、番茄三个任务 Worker。

## 连接与发布

在工作台的添加渠道中选择小红书或番茄，保留连接值 `local`。需要时由连接流程打开扫码窗口。请本人完成登录与验证码。连接器使用本项目数据目录，不导入系统浏览器 cookie。

小红书扫码和番茄浏览器流程需要已安装的 Google Chrome。项目不下载完整浏览器；具体可用性仍待真实账号验收。

番茄仅连接已有长篇作品。连接绑定作者昵称和可读作品 ID 集合；账号或作品集合改变后需重新连接。当前连接器没有稳定作者 ID，因此采取保守的失效处理。

真实发布默认关闭。准备好自行验收时，把 `.env` 中 `LOCAL_BRIDGE_ENABLE_PUBLISH="0"` 改成 `"1"`，停止后重新启动。该开关只启用写接口；仍需选择 AI 声明并勾选每次发布确认。预览、导入和保存草稿不会触发平台提交。

番茄提交后保持待核查状态，需去作者后台核查审核。异常结果也需人工核查；不要删除任务日志后重试。首版不提供自动审核状态判断。

显示时区目前跟随浏览器或个人设置；在海外使用时请手动选择 Asia/Shanghai。服务器时区设置不会覆盖浏览器显示。

排期使用 Postiz 计划时间传入桥接，持久化 UTC；电脑休眠等导致超过 120 秒窗口时不自动补发。需要人工核查后重新安排。

## 检查与排错

```bash
bash scripts/local/run.sh node --experimental-strip-types --test apps/local-bridge/test/*.test.mjs
bash scripts/local/run.sh pnpm exec vitest run --config vitest.local-cn.config.mts
bash scripts/local/run.sh pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json
# 仅验证 MCP 协议，不调用账号或发布工具
bash scripts/local/run.sh node --experimental-strip-types scripts/local/check-connectors.mjs
bash scripts/local/build.sh
```

本地服务的数据库只使用 `postiz_cn`，Prisma 更新不会传 `--force-reset` 或 `--accept-data-loss`。升级若需要破坏性变更会失败并保留数据；先备份再处理迁移。

若启动中断后端口仍占用，先检查 `.local/logs/` 和实际进程归属；脚本不会按端口强杀未知进程。`stop` 只通过本项目的回环控制接口 停止其拥有的子进程组。

不要公开 `.env`、`.local/`、数据库、截图或个人文稿。备份至少包含 `.env` 和 `.local/data/`，恢复时两者应匹配。

## 公开仓库前

保留 LICENSE、README.upstream.md、CHANGES_CN.md、THIRD_PARTY_NOTICES.md 和第三方源码许可证。运行测试，检查 Git 暂存区，确认没有个人数据。创建公开仓库后把实际地址补入 README，并在对外部署的界面提供相应源码链接。公开仓库为 https://github.com/Sundaybro/postiz-cn 。首次公开以源码快照发布，保留上游来源和许可证；本地开发历史另行保留。
