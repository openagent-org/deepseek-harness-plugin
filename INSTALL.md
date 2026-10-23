# 安装 OpenAgent：DeepSeek Harness

将本指南交给 DeepSeek Harness，并说“请按这份指南安装 OpenAgent”。安装到当前正在使用的 Harness 主目录和 profile；用户只在授权页面完成登录，不需要向 Agent 提供密码或 Token。

本指南核对 DeepSeek Harness `0.2.1-rc.2`，支持 Desktop、Web 和 CLI 的本地运行环境。Harness 仍处于开发预览；本插件声明兼容 `>=0.2.1-rc.2 <0.3.0`。不要把 Hermes 的安装器、配置格式或命令用于 Harness。

## 1. 检查环境

确认实际客户端、Harness 版本、当前 `DSH_HOME` 和 profile。未设置 `DSH_HOME` 时通常为 `~/.dsh`；Desktop 使用 `desktop`，Web 默认使用 `web`，CLI 使用启动时选择的 profile。不要读取凭据文件，也不要把桌面安装写进 `web` profile。

需要 Git 和 Node.js `22.19+`（22 系列）或 `24+`。Desktop 可以通过原生 `load_workspace_dependencies` 取得其内置 Node 绝对路径；后续命令中的 `node` 指已核对的可执行文件。CLI 安装还需要当前 Harness 的 `dsh` 命令与 pnpm；Desktop 自带的 `dsh` 使用其内置 pnpm。

Desktop 没有注册 `dsh` 命令时，优先使用下面的原生插件页面。若需使用 CLI，可在应用菜单的“管理 dsh 命令…”安装该命令，再开新终端核对 `dsh --version`。不要用 npm 另装的 dsh 修改 Desktop profile。

## 2. 安装原生插件包

首次下载使用 GitHub：

```text
git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel
```

仅 Git 仓库下载发生 DNS、连接、超时、传输中断或 HTTP 5xx 失败，且原操作已结束时，允许用下列同名仓库再下载一次：

```text
git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel
```

权限或审批拒绝、证书错误、401/403/404/429/451、内容校验、依赖安装、启用或 OAuth 失败不换源。npm 依赖下载失败不能靠换 Git 仓库修复。保留原错误，不自动循环安装，不强制覆盖现有未知同名包。

**Desktop / Web 插件页面：** 打开左侧“插件 / Plugins”，选择“添加插件 / Add plugin”，填写上面的 Git 地址，确认安装包名称为 `dsh-openagent`。等待安装任务结束；先保持未启用状态，完成第 3 步登录后再点“立即启用 / Enable now”。如果已经启用并开始授权，等待现有桥接进程，不再并行启动登录命令。

**CLI：** 在外部本地终端运行，`<profile>` 替换为第 1 步确认的名称：

```bash
dsh plugin --profile <profile> add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'
```

为 Desktop 使用 CLI 时，须先启动过 Desktop 以初始化 profile，然后在无活动任务时完全退出应用；仅使用该 Desktop 自带的 dsh 操作 `--profile desktop`，完成第 3 步后重新打开应用。不要从将被关闭的 Desktop 聊天里启动依赖该聊天继续运行的安装命令。Web / CLI 同样在重新启动目标 profile 前完成登录。

原生包管理器维护依赖和 bundle 列表。保留其他插件、模型、会话和用户 patch；禁止通过 `--from-default-profile`、删除 profile、手改全局 YAML 或禁用审批来完成安装。已安装同名包时先核对来源和本地修改；只处理确认属于上述官方仓库的安装。

## 3. 完成一次登录，再启用连接

Harness 当前内置 MCP 客户端没有原生 OAuth 配置。本插件使用固定版本 `mcp-remote@0.1.38` 连接 OpenAgent，并把认证状态独立保存在当前 `DSH_HOME/openagent-auth`。它不复用 Hermes、Codex 或其他客户端的登录。

在安装后的包目录运行一次登录入口。下面以默认主目录的 Web profile 为例；Desktop 改为 `desktop`，其他 profile 使用实际名称。自定义 `DSH_HOME` 必须与目标 Harness 完全相同。Windows 使用相应的用户主目录与路径写法。

```bash
node "${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/dsh-openagent/login.mjs"
```

先告知用户“正在连接 OpenAgent；如打开授权页，请在网页完成授权，我会等待同一进程。”使用宿主真实支持的后台执行和等待工具，保留进程标识，每次最多等待 60 秒并继续同一进程。不要套用 Hermes 的 `terminal` 参数，不要因为工具暂时返回就重跑命令。

OAuth 桥接器负责浏览器打开、回调、换码和刷新。不要打印认证文件、完整授权 URL 或原始日志，不另外打开授权 URL，不读取其他客户端 Token。登录的总等待有上限；取消、拒绝、失败、超时或结果未知时保留现场并停止，不自动重试。

只有同一进程成功结束且输出 `OPENAGENT_LOGIN_CONNECTED`，才能说明“OpenAgent 登录连接已通过”；此时尚未完成账号或 Agent 业务验收。之后在插件页面启用 `dsh-openagent`，或重新启动对应 Web / CLI / Desktop。插件页面返回 `applied` 或显示实际已启用才表示加载成功；`restart-required` 只表示保存成功，仍需完成目标客户端重启。

首次单独登录是为避开 Harness 约 60 秒的 MCP 初始化限制及 stdio 探测进程。正常运行由桥接器管理刷新；若凭据失效，桥接器仍可能发起浏览器续授权。此时等待已有尝试，不能同时再运行登录入口。插件关闭宿主自动重连；断线和未知结果不得自动重放业务调用。

## 4. 在目标客户端的新对话中验收

确认新对话能发现以下五个 Skills，并能通过原生 `skill` 工具加载：

- `openagent-first-task-router`
- `openagent-guide-agent`
- `openagent-search-agent`
- `openagent-run-agent`
- `openagent-query-account`

确认连接实际暴露 `mcp__openagent__` 前缀的 OpenAgent 工具。安装 Agent 在当前目标客户端创建一次用户可见的新对话并发送“OpenAgent 已安装，打开新用户引导”；使用当前宿主实际提供的创建和发送能力，不猜测工具名称。若宿主没有该能力，明确告知“文件及连接已配置，新对话验收待完成”，由用户在目标客户端新建对话后发送这句话，不伪造自动跳转成功。

验收须读取真实的引导及 `openagent_account_credits` 调用结果：一次账号查询返回严格的 `success=true`，且该轮正常结束，才报告“OpenAgent 安装及账号验证通过”。工具列表、OAuth 成功、配置文件存在或模型说“安装成功”都不能替代。CLI 子会话不能代替 Desktop / Web 可见新对话；失败或状态未知时不重发提示、不重复账号调用或 OAuth。

引导与账号查询不提交付费 Agent 任务，但使用模型会产生正常模型调用。搜索或选择 Agent 不等于授权执行；实际任务继续遵循已安装 Skills 的授权、上传、等待和结果验证规则。

## 配置与能力范围

- MCP：`https://oasn-ow.haimawan.com/mcp/v1/open-agent`，Streamable HTTP，由 stdio OAuth 桥接器接入。
- 请求头：`X-OASN-MCP-OAuth: required`、`X-OASN-MCP-Content-Mode: text-compatible`；不把 Bearer 写进 profile。
- 工具等待：1800 秒；未知终态不自动重跑。
- Skills、结果交付 reference、登录说明和 COS 上传 SDK 随包安装，不复制到用户全局 Skill 目录。
- 上传 SDK 压缩包及解压内容按随包锁定文件校验大小和 SHA-256；首次使用在执行 Skill 的 `scripts/.cos-sdk` 内生成缓存。该目录需当前用户可写；校验失败立即停止，不另装 SDK 或降级上传。
- 不承诺 MCP Apps 卡片、嵌入网页或所有媒体原生渲染。仅使用宿主确认可见的页面能力；能力缺失时保留服务端返回的原始链接。

## 更新与移除

该 Git 安装包没有可用的原生“更新”按钮，重复添加同一 Git 地址也不能作为更新成功依据。更新时，先结束相关任务，核对来源、版本和本地修改，备份需要保留的改动；在目标 profile 停用插件并停止该 profile。Desktop 必须完全退出应用，并在外部本地终端使用该 Desktop 内置的 dsh；其他客户端也使用第 1 步确认的 dsh、`DSH_HOME` 和 profile。

先通过原生命令移除旧包，`<profile>` 使用原安装的 profile：

```bash
dsh plugin --profile <profile> remove dsh-openagent
```

只有移除成功后，才在同一主目录、同一 profile 保持停止的状态下重新安装：

```bash
dsh plugin --profile <profile> add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'
```

保留 `DSH_HOME/openagent-auth`，不要清空认证或重复登录已成功的连接。移除或重新安装失败、取消或结果未知时停止，不自动重放整个更新流程；网络换源仍只限第 2 步允许的失败下载阶段。安装成功后核对实际安装的来源和版本，再启用或重启目标客户端，按第 4 步在新对话验收；不能只凭包安装成功报告更新验收通过。

卸载使用插件页面移除 `dsh-openagent`，或在目标 profile 未运行时执行：

```bash
dsh plugin --profile <profile> remove dsh-openagent
```

Desktop 仍须使用其内置 dsh，且应用已完全退出。确认原生 bundle 和工具从目标 profile 移除；包内 Skills 随插件停用。共享的 `DSH_HOME/openagent-auth` 专用认证目录保留，避免破坏其他已安装本插件的 profile；本地卸载不等于服务端撤销授权。需要彻底退出账号时，先确认所有使用该目录的 profile 均已停止，再由用户明确授权处理该专用认证目录及服务端授权；禁止删除整个 `DSH_HOME` 或其他客户端的凭据。
