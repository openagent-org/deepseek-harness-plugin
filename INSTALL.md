# 安装 OpenAgent：DeepSeek Harness

将本指南交给 DeepSeek Harness，并说“请按这份指南安装 OpenAgent”。安装到当前正在使用的 Harness 主目录和 profile；用户只在授权页面完成登录，不需要向 Agent 提供密码或 Token。

本指南核对 DeepSeek Harness `0.2.1-rc.2`，支持 Desktop、Web 和 CLI 的本地运行环境。Harness 仍处于开发预览；本插件声明兼容 `>=0.2.1-rc.2 <0.3.0`。不要把 Hermes 的安装器、配置格式或命令用于 Harness。

## 1. 检查环境

确认实际客户端、Harness 版本、当前 `DSH_HOME` 和 profile。未设置 `DSH_HOME` 时通常为 `~/.dsh`；Desktop 使用 `desktop`，Web 默认使用 `web`，CLI 使用启动时选择的 profile。不要读取凭据文件，也不要把桌面安装写进 `web` profile。

需要 Git 和 Node.js `22.19+`（22 系列）或 `24+`。Desktop 可以通过原生 `load_workspace_dependencies` 取得其内置 Node 绝对路径；后续命令中的 `node` 指已核对的可执行文件。CLI 安装还需要当前 Harness 的 `dsh` 命令与 pnpm；Desktop 自带的 `dsh` 使用其内置 pnpm。

Desktop 没有注册 `dsh` 命令时，优先使用下面的原生插件页面。若需使用 CLI，可在应用菜单的“管理 dsh 命令…”安装该命令，再开新终端核对 `dsh --version`。不要用 npm 另装的 dsh 修改 Desktop profile。

先确定安装方式：正在运行的 Desktop 只通过真实的原生插件页面安装或启用；当前会话没有操作该页面的能力时，由用户在页面完成操作，不能退回到该会话的终端执行 `dsh plugin`。外部 CLI 方式只适用于目标 profile 已安全停止的情况，不能一边运行 Desktop 一边修改其 profile。

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

为 Desktop 使用 CLI 时，须先启动过 Desktop 以初始化 profile，确认没有活动任务后通过应用正常退出，再从独立的外部终端确认应用已完全退出；仅使用该 Desktop 自带的 dsh 操作 `--profile desktop`，完成第 3 步后重新打开应用。不要从将被关闭的 Desktop 聊天里启动安装或重启流程；禁止强制结束进程或编写后台重启脚本来继续当前聊天。无法确认安全退出时停止在待操作阶段。Web / CLI 同样在目标 profile 停止后安装，并在重新启动前完成登录。

原生包管理器维护依赖和 bundle 列表。保留其他插件、模型、会话和用户 patch；禁止通过 `--from-default-profile`、删除 profile、手改全局 YAML 或禁用审批来完成安装。已安装同名包时先核对来源和本地修改；只处理确认属于上述官方仓库的安装。

## 3. 完成一次登录，再启用连接

Harness 当前内置 MCP 客户端没有原生 OAuth 配置。本插件使用固定版本 `mcp-remote@0.1.38` 连接 OpenAgent，并把认证状态独立保存在当前 `DSH_HOME/openagent-auth`。它不复用 Hermes、Codex 或其他客户端的登录。

从旧官网域名升级到本版本时，先核对实际安装包的 `login.mjs` 端点为 `https://openagent.org/mcp/v1/open-agent`，再由用户明确授权，按本节正常执行一次登录。新域使用新的 OAuth issuer/resource，旧域登录成功不能代替新域授权。保留原认证文件；不复制旧 Token、不改写其 resource，也不把旧认证文件改名成新域的记录。桥接器按完整端点分别保存认证。

在安装后的包目录运行一次登录入口。下面以默认主目录的 Web profile 为例；Desktop 改为 `desktop`，其他 profile 使用实际名称。自定义 `DSH_HOME` 必须与目标 Harness 完全相同。Windows 使用相应的用户主目录与路径写法。

```bash
node "${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/dsh-openagent/login.mjs"
```

先告知用户“正在连接 OpenAgent；如打开授权页，请在网页完成授权，我会等待同一进程。”使用宿主真实支持的后台执行和等待工具，保留进程标识，每次最多等待 60 秒并继续同一进程。不要套用 Hermes 的 `terminal` 参数，不要因为工具暂时返回就重跑命令。

OAuth 桥接器负责浏览器打开、回调、换码和刷新。不要打印认证文件、完整授权 URL 或原始日志，不另外打开授权 URL，不读取其他客户端 Token。登录的总等待有上限；取消、拒绝、失败、超时或结果未知时保留现场并停止，不自动重试。

只有同一进程成功结束且输出 `OPENAGENT_LOGIN_CONNECTED`，才能说明“OpenAgent 登录连接已通过”；此时尚未完成账号或 Agent 业务验收。之后在插件页面启用 `dsh-openagent`，或正常启动已停止的目标客户端。插件页面返回 `applied` 或显示实际已启用只证明插件配置已应用，不能证明 MCP、Skills 或账号可用。当前客户端已能使用插件工具和 Skills 时，直接执行第 4 步，不退出、不重启。只有原生页面明确返回 `restart-required`、连接确需重载且当前不能应用时，才使用下方预约流程。进程重新出现仍不能替代验收。

### 原生页面要求重开时：先预约，再正常退出

仅在原生页面明确返回 `restart-required`，且本安装会话尚未调用 `openagent_install_verify`、创建验收对话或发送引导时，安装 Agent 才运行一次预约。命令在原安装会话的 Harness shell 中执行，使用宿主注入的 `DSH_PROFILE`、`DSH_PROFILE_DIR` 和 `DSH_SESSION_ID`；先核对前两者与第 1 步一致。默认 Desktop 应是 `desktop`，默认 Web 应是 `web`，其他 profile 保留实际名称。缺少可信会话标识时报告待完成，不能编造 ID 或复制其他会话的值。

Bash：

```bash
: "${DSH_PROFILE:?未取得当前 profile}" "${DSH_PROFILE_DIR:?未取得当前 profile 路径}" "${DSH_SESSION_ID:?未取得当前会话标识}"
node "$DSH_PROFILE_DIR/node_modules/dsh-openagent/post-install.mjs" --prepare --profile "$DSH_PROFILE" --locale zh-CN
```

PowerShell：

```powershell
if (-not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw '未取得当前 Harness profile 或会话标识' }
node (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/post-install.mjs') --prepare --profile $env:DSH_PROFILE --locale zh-CN
```

只有命令成功结束并输出 `OPENAGENT_ONBOARDING_PREPARED`，才能报告预约已保存。预约只写入本 profile 的一次性状态，不退出应用、不发送消息，也不证明验收通过。安装 Agent 随即结束本轮；用户在所有任务结束后正常退出并重开目标客户端，在预约创建后 30 分钟内回到原安装会话并保持该会话唯一可见。插件在原会话空闲、MCP 与 Skills 可用后自动创建新对话并发送一次引导，无需用户再发提示，也不要再调用 verify。不能强制结束进程或自行编写后台重启脚本。

预约不续期、不自动重试；重复命令只返回原预约或已有状态，不能当作新许可。输出 `OPENAGENT_ONBOARDING_STATE`、失败、过期或结果未知时保留状态并报告实际阶段，不换会话、删除状态或手动补发。已发起验收的状态只按第 4 步查询一次。

首次单独登录用于避免把交互授权等待放进约 60 秒的 MCP 初始化和短命 stdio 探测阶段；正常连接仍会执行 stdio 探测。初始化阶段若桥接器已发起浏览器授权，等待同一次尝试，不能同时再运行登录入口。已连接后的会话检查只允许静默刷新已有凭据；需要重新授权时明确报错并停止，待用户授权后按登录恢复流程处理。插件关闭宿主自动重连；断线和未知结果不得自动重放业务调用。

桥接器在发送新请求前使用内部协议 `ping` 检查会话；仅检查明确返回 404 且没有已发送的待决请求时，重建会话后首次发送该请求。这不要求模型另行查询账号或登录。业务请求已经发送后发生断线、404 或结果未知时仍停止，不自动重发。桥接退出后，工具名可能仍可见，但新建对话不会重建连接；结束活动任务后正常退出并重开 Harness。若已有验收尝试，回到原安装会话只查询一次 status；已有有效预约时等待原预约继续，不能重新发起。只有明确尚未发起且没有预约时，才按第 4 步执行首次验收。

## 4. 在目标客户端的新对话中验收

未预约、尚未发起验收时，安装 Agent 在原安装会话调用一次随包工具 `openagent_install_verify({"locale":"zh-CN"})`。该工具检查当前真实工具目录与五项 Skills，在当前唯一可见的 Desktop / Web 窗口通过 Harness 原生接口创建新对话、切换到该对话，再发送一次固定提示“OpenAgent 已安装，打开新用户引导”。它不修改原会话的输入草稿。MCP 和 Skills 已可用时直接完成这一步，无需重启。第 3 步预约成功的流程由插件自动执行同一验收，不再调用 verify。

工具只在新对话内的实际验收完成后返回 `status="completed"`，并同时确认 `guide_loaded=true`、`guide_success=true`、`account_success=true`、`turn_completed=true`。新对话创建、页面切换或消息提交都不是安装验收成功。单次验收最多等待 600 秒，预约验收还受原 30 分钟期限限制。原安装会话若等待超时或结果未知，只调用一次只读的 `openagent_install_status({})` 查看已有状态；它不新建对话，也不重发提示。尚未开始的预约不属于已发起状态，status 的 `NO_ATTEMPT` 不能作为另发一次的许可。不要再次调用 verify、换会话绕过一次性记录，或手动补发同一提示。

只有工具明确确认尚未发起、没有预约，且当前客户端确实没有可见新对话能力（例如 CLI）时，才保留“新对话验收待完成”，由用户在目标客户端手动创建对话并发送上述固定提示。已经预约、创建、发送或状态未知时，保留原验收会话和错误，不再创建第二个对话。缺少安装验收工具时同样报告待完成，不能猜测工具名或以后台 CLI 子会话代替。

确认新对话能发现以下五个 Skills，并能通过原生 `skill` 工具加载：

- `openagent-first-task-router`
- `openagent-guide-agent`
- `openagent-search-agent`
- `openagent-run-agent`
- `openagent-query-account`

确认新对话的连接实际暴露 `mcp__openagent__` 前缀的 OpenAgent 工具，且能通过原生 `skill` 工具加载引导 Skill；不能用磁盘文件或旧对话的工具列表替代。

验收须读取新对话内真实的引导及 `openagent_account_credits` 调用结果：引导调用正常完成并返回 `view=onboarding`、`status=ready`；随后一次账号查询正常完成且返回严格的 `success=true`，该轮也正常结束，才报告“OpenAgent 安装及账号验证通过”。工具列表、OAuth 成功、配置文件存在或模型说“安装成功”都不能替代。动画不可显示时不声称已播放；这与引导工具调用失败是不同结果。CLI 子会话不能代替 Desktop / Web 可见新对话。

工具缺失、引导或账号调用失败、结果不完整或状态未知时，报告“OpenAgent 安装验收未完成”、失败阶段和可公开的错误信息，停止固定成功文案。不要重发提示、重复账号调用或 OAuth；工具缺失或网络错误本身不代表需要重新登录。禁止读取 Token、用 curl 或自制客户端直连 MCP、修改 profile 或自制重启来绕过验收。后续恢复须针对已确认的失败阶段，由用户重新授权。

引导与账号查询不提交付费 Agent 任务，但使用模型会产生正常模型调用。搜索或选择 Agent 不等于授权执行；实际任务继续遵循已安装 Skills 的授权、上传、等待和结果验证规则。

## 配置与能力范围

- MCP：`https://openagent.org/mcp/v1/open-agent`，Streamable HTTP，由 stdio OAuth 桥接器接入。
- 请求头：`X-OASN-MCP-OAuth: required`、`X-OASN-MCP-Content-Mode: text-compatible`；不把 Bearer 写进 profile。
- 工具等待：1800 秒；未知终态不自动重跑。
- Skills、结果交付 reference、登录说明和 COS 上传 SDK 随包安装，不复制到用户全局 Skill 目录。
- 上传 SDK 压缩包及解压内容按随包锁定文件校验大小和 SHA-256；首次使用在执行 Skill 的 `scripts/.cos-sdk` 内生成缓存。该目录需当前用户可写；校验失败立即停止，不另装 SDK 或降级上传。
- Desktop 的原生侧栏浏览器模块可用、当前会话有唯一可见客户端时，可通过随包 `openagent_browser_open` / `openagent_browser_status` / `openagent_browser_close` 打开、核对和关闭此次选择页面。成功回执只证明侧栏已提交页面，不证明网页内容已加载或用户已选择；超时或未确认时不再次打开。
- Web 默认未启用侧栏浏览器模块，CLI 没有可见页面；页面能力缺失时保留服务端返回的原始链接，不声称已自动打开。不承诺 MCP Apps 卡片或所有媒体原生渲染；新用户引导动画不使用搜索选择页的浏览器流程。

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

保留 `DSH_HOME/openagent-auth`，不要清空认证或重复登录同一新端点已成功的连接；旧域迁移仍须先按第 3 步明确授权并完成一次新域登录。移除或重新安装失败、取消或结果未知时停止，不自动重放整个更新流程；网络换源仍只限第 2 步允许的失败下载阶段。安装成功后核对实际安装的来源和版本，启用插件或正常启动已停止的目标客户端；已可用时无需额外重启，按第 4 步在新对话验收；不能只凭包安装成功报告更新验收通过。

### 卸载

先结束正在使用 OpenAgent 的任务并停止目标 profile。Desktop 必须通过应用正常退出；不要从将被关闭的 Desktop 聊天中卸载，也不要强制结束进程。以下一行入口在独立的外部 Bash 终端执行，需要 curl 和 Python 3.9+：

```bash
bash -o pipefail -c 'curl -fsSL --proto "=https" --proto-redir "=https" https://raw.githubusercontent.com/openagent-org/deepseek-harness-plugin/rel/uninstall.py | python3 - --yes'
```

脚本仅接受 GitHub/Gitee 上 `openagent-org/deepseek-harness-plugin` 的 `rel` 依赖来源，并通过 Harness 原生包管理移除 `dsh-openagent`，不直接删除 profile、其他插件或配置；同名非官方来源或无法确认归属的残留均停止。将命令末尾的 `--yes` 替换为 `--dry-run` 可只读预览；其他参数同样添加在 `python3 -` 之后：

| 参数 | 用途 |
| --- | --- |
| `--yes` | 按已核对的目标执行卸载，跳过交互确认。 |
| `--dry-run` | 只读检查并显示计划，不执行卸载。 |
| `--profile <名称>` | 指定原安装的 profile。未指定时只自动选择唯一的官方安装；发现多个安装时停止，必须明确指定。 |
| `--dsh-home <路径>` | 指定自定义 Harness 主目录；须与原安装一致。未指定时读取非空 `DSH_HOME`，否则使用 `~/.dsh`。 |
| `--desktop-app <路径>` | 指定 macOS 的 `.app` 目录或 Windows 的应用安装根目录，用于定位 Desktop 内置 dsh。 |

macOS Desktop 默认检查 `/Applications/DeepSeek Harness.app` 和 `~/Applications/DeepSeek Harness.app`；Windows Desktop 默认使用 PATH 中已注册且指向应用内置 CLI 的 dsh 入口。无法唯一定位时使用 `--desktop-app`，不能用 npm 另装的 dsh 代替。脚本不支持 Linux Desktop，须改用原生插件页面；Web 和 CLI 使用 PATH 中已有的 dsh。

实际卸载前，脚本检查目标 profile 是否已停止；检测到运行中的目标 Harness、无法归属 profile 的 Harness 进程、运行状态无法核实或包管理锁时均停止，不终止进程或清理锁。`--dry-run` 只读提示这些待处理项，不调用原生卸载命令。下载、检查或原生命令失败、取消或结果未知时停止，保留错误，不自动换源、重复执行或改为手删文件。

也可在当前 profile 的插件页面移除 `dsh-openagent`，或在目标 profile 未运行时，从外部终端使用原生命令：

```bash
dsh plugin --profile <profile> remove dsh-openagent
```

手动命令须保持原安装的 `DSH_HOME`；Desktop 仍须使用其内置 dsh，且应用已完全退出。确认原生 bundle 和工具从目标 profile 移除；包内 Skills 随插件停用。共享的 `DSH_HOME/openagent-auth` 专用认证目录保留，避免破坏其他已安装本插件的 profile；本地卸载不等于服务端撤销授权。需要彻底退出账号时，先确认所有使用该目录的 profile 均已停止，再由用户明确授权处理该专用认证目录及服务端授权；禁止删除整个 `DSH_HOME` 或其他客户端的凭据。
