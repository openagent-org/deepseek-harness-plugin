# 安装 OpenAgent：DeepSeek Harness

由当前普通对话中的安装 Agent 实际执行以下步骤，完成安装和一次新对话验收，不要只交付命令。用户处理必要审批和网页授权，不提供密码或 Token。

本指南核对 Harness `0.2.1-rc.2`，支持 `>=0.2.1-rc.2 <0.3.0` 的本地 Desktop、Web 和 CLI。插件显示名称为 **OpenAgent**，内部包名为 `dsh-openagent`。在线安装依赖宿主的 profile 热加载；安装命令成功不证明 OAuth、工具加载或新对话验收已通过。

## 1. 核对当前宿主和执行工具

使用普通对话实际提供的 `bash` 或 `pwsh`、`job_output`。核对 shell schema 支持 `description`、`command`、`run_in_background: true`、`sandbox_permissions: "danger-full-access"` 和 `justification`。安装和保存预约会写入当前 Harness profile，首次调用就请求当次所需权限；不改全局权限。工具或参数缺失、审批拒绝或取消时停止，不换入口重试。

通过 shell 只核对宿主注入的 `DSH_HOME`、`DSH_PROFILE`、`DSH_PROFILE_DIR` 和 `DSH_SESSION_ID`，保留原值。确认 profile 目录确属该主目录、当前客户端和原安装会话；缺失或不符时停止，不猜测其他 profile，不读取凭据或会话正文。

核对 Git、Node 与 dsh 的版本和来源。Node 需要 `22.19+`（22 系列）或 `24+`；可使用 `load_workspace_dependencies` 返回的 Node 绝对路径。Desktop 必须定位**当前运行应用**内置的 `resources/runtime/cli/bin/dsh`（Windows 为 `dsh.cmd`），macOS 位于应用的 `Contents/Resources/runtime/cli/bin/dsh`；不要按固定应用名猜路径，也不要另装 npm dsh。非 Desktop 使用与当前 Host 属于同一安装的 dsh。用其绝对路径核对 `--version`，后续替换示例中的占位路径并正确引用。

只读检查当前 profile 的 `package.json` 中该包的依赖来源、`dsh.profile.bundles`、相关禁用记录和实际安装包的名称、版本；不要输出整份配置。认可来源仅为以下官方 GitHub/Gitee 仓库的 `rel`（包括包管理器保存的等价写法）。已有可信安装时保留，不再次 add；已禁用、旧版缺少本指南的状态入口、未知同名来源、文件异常或未确认的本地修改时停止，按维护流程处理，不擅自启用或覆盖。

## 2. 用当前宿主 CLI 安装一次

仅尚未安装时执行。先告知用户：“正在安装并连接 OpenAgent；如出现授权页，请在网页完成授权。”

macOS / Linux 的 `bash` 调用：

```json
{
  "description": "在当前 Harness profile 安装 OpenAgent",
  "command": ": \"${DSH_HOME:?未取得当前 Harness 主目录}\" \"${DSH_PROFILE:?未取得当前 profile}\" \"${DSH_PROFILE_DIR:?未取得当前 profile 路径}\" \"${DSH_SESSION_ID:?未取得当前会话标识}\"; \"<dsh 绝对路径>\" plugin --profile \"$DSH_PROFILE\" add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "本次安装需要下载官方插件并写入当前 Harness profile，由宿主加载 OpenAgent。"
}
```

Windows 的 `pwsh` 调用：

```json
{
  "description": "在当前 Harness profile 安装 OpenAgent",
  "command": "if (-not $env:DSH_HOME -or -not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw '未取得当前 Harness profile 或会话标识' }; & '<dsh.cmd 绝对路径>' plugin --profile $env:DSH_PROFILE add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "本次安装需要下载官方插件并写入当前 Harness profile，由宿主加载 OpenAgent。"
}
```

使用返回的真实 `jobId` 等待同一安装任务，每次最多 60 秒：

```json
{"job_id":"<上一步的 jobId>","wait":true,"timeout_ms":60000}
```

任务仍运行就继续等待原任务，不重新安装。仅明确发生 Git 下载的 DNS、连接、超时、传输中断或 HTTP 5xx 错误，且原进程已结束时，可将地址换为 `git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel` 再下载一次。审批拒绝、证书错误、401/403/404/429/451、校验、构建、兼容性、加载或 OAuth 问题不换源；不授予构建脚本权限、不增加版本豁免。其他失败、取消或未知结果保留现场并停止，不重放命令。

CLI 会将新 bundle 加入启用列表，宿主优先在线加载。每次加载 bundle 时，插件自动运行一次包内登录连接检查，不自动重试；已有有效授权时复用且不再打开授权页。只有同一进程输出 `OPENAGENT_LOGIN_CONNECTED` 且退出码为 0 后才挂载 MCP。首次授权的总时限为 330 秒，网页等待 300 秒，避免原生 MCP 初始化和探测阶段截断授权。**不要在 shell 另跑 `runtime/login.mjs`、补开授权 URL 或并行启动第二次登录**。已有同端点有效登录由该入口复用。仅为 `https://openagent.org/mcp/v1/open-agent` 完成授权；不同端点的认证记录不得复制、改写或复用。

安装进程退出码为 0 后，回读实际包的名称、版本、官方来源和启用列表，确认无禁用记录，再进入第 3 步。只报告安装文件已就绪，不从退出码推断连接成功。保留其他插件、模型、会话及配置，不删除 profile，不使用 `--from-default-profile`。

## 3. 保存一次预约，结束当前轮

先在原安装会话按第 4 步的只读入口查询一次状态。仅当本次从未调用 `--prepare` 或 `openagent_install_verify`、没有已知验收对话，且查询返回 `NO_ATTEMPT`、`connection_status` 为 `not_started`、`connecting` 或 `ready` 时，执行首次 `--prepare`。已有预约或尝试时沿用原状态；已发起过尝试却返回 `NO_ATTEMPT`，或连接为 `failed` / `unconfirmed`、字段缺失或值非法时均停止，不预约、续期或补发。使用第 1 步核对的 Node 与宿主变量，通过原生 shell 请求本次 `sandbox_permissions: "danger-full-access"`，`justification` 说明“为原安装会话保存一次新对话验收预约”。等待短命令结束，不关闭应用。

Bash：

```bash
: "${DSH_HOME:?未取得当前 Harness 主目录}" "${DSH_PROFILE:?未取得当前 profile}" "${DSH_PROFILE_DIR:?未取得当前 profile 路径}" "${DSH_SESSION_ID:?未取得当前会话标识}"
"<Node 绝对路径>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/post-install.mjs" --prepare --profile "$DSH_PROFILE" --locale zh-CN
```

PowerShell：

```powershell
if (-not $env:DSH_HOME -or -not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw '未取得当前 Harness profile 或会话标识' }
& '<Node 绝对路径>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/post-install.mjs') --prepare --profile $env:DSH_PROFILE --locale zh-CN
```

命令成功且输出 `OPENAGENT_ONBOARDING_PREPARED`、`status="pending"` 时，只报告：“安装文件已就绪，自动验收已预约。请完成已打开的授权页，并保持本安装会话在唯一可见窗口；插件就绪后会自动打开新对话。”**随即结束当前轮，不在本轮等待 completed，也不调用 `openagent_install_verify`。** 原会话必须先空闲，插件才能领取预约。

预约有效期 30 分钟。验收服务在等待登录前注册；登录或 MCP 未就绪时保留 pending，不提前领取。MCP 与五项业务 Skills 可用、原会话空闲且唯一可见时，插件自动创建并显示新对话，发送一次“OpenAgent 已安装，打开新用户引导”，保留原会话草稿。新引导任务继承原安装任务所属工作区；原任务未归入任何工作区时才沿用原工作目录。不要另外建对话、手动补发固定提示或要求用户再发一遍。输出已有状态或发生失败时保留该状态，不能把预约成功当作验收成功。

## 4. 读取结果；必要时沿用预约正常重开

首次预约前、新对话未自动出现或需要核对结果时，在**原安装会话**选择一个只读入口查询一次：已暴露 `openagent_install_status` 时传 `{}`；否则运行下列 `--status`。保留原 profile、会话和 Node 路径，按 shell 实际权限要求执行，不读取状态文件或凭据代替查询。

Bash：

```bash
"<Node 绝对路径>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/post-install.mjs" --status --profile "$DSH_PROFILE"
```

PowerShell：

```powershell
& '<Node 绝对路径>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/post-install.mjs') --status --profile $env:DSH_PROFILE
```

状态查询对 `pending` 或 `NO_ATTEMPT` 同时返回 `connection_status`：`not_started` 表示该版本尚无 Host 连接尝试；`connecting` 表示仍在等待同一登录或 MCP 初始化；`ready` 表示同一登录子进程成功且 MCP 初始化成功，仍不代表业务验收。`failed` 或 `unconfirmed` 必须停止，不能借重开重试 OAuth；缺少该字段或值非法按未知处理。冷启动可能需要完成网页授权后宿主才就绪。

`OPENAGENT_ONBOARDING_STATE` 后的回执或工具返回状态按下表处理：

| 状态 | 处理 |
| --- | --- |
| `pending`，未领取、未过期，且 `connection_status=not_started` 或 `ready` | 保留同一预约并结束查询轮。在线加载优先；仍未自动打开且确需重开时，待其他任务结束后正常退出并重开 Harness，在预约的原有 30 分钟期限内回到同一安装会话，保持唯一可见和空闲，插件自动继续。无需重装、重新预约或发送提示。 |
| `pending` 且 `connection_status=connecting` | 结束查询轮，等待同一连接尝试；不重开、不另行登录、不补发提示。 |
| `completed` 且四项证据均为 `true` | 报告“OpenAgent 安装及账号验证通过，可以在新对话继续使用”。 |
| 首次预检返回 `NO_ATTEMPT` | 仅满足第 3 步全部条件时创建首次预约；有过尝试后返回此值必须停止。 |
| 已领取、`unconfirmed`、`failed`、过期，或连接状态为 `failed` / `unconfirmed`、缺失、非法 | 报告“OpenAgent 安装验收未完成”、实际阶段和公开错误；保留状态，不重开重试、不补发、不续期、不换会话绕过记录。 |

四项证据为 `guide_loaded`、`guide_success`、`account_success`、`turn_completed`，必须严格为 `true`：新对话实际加载引导 Skill，引导返回 `view=onboarding/status=ready`，一次账号调用返回严格的 `success=true`，并正常结束该轮。验收最多使用 600 秒且不超过预约剩余期限。工具目录、OAuth 成功、进程重开或模型正文都不能替代该结果。

成功结果保存后，插件在原安装任务对应安装轮的最终回复下方显示独立完成卡片“OpenAgent 安装及账号验证通过”，按钮为“打开新用户引导”。页面不会自动切回原任务；用户返回原任务（包括正常重开后返回）即可查看已保存的卡片。点击按钮只打开已存在的引导任务，不创建任务、不重发提示、不调用模型。无法确定可信安装轮次时不显示卡片，实际验收结果仍以上述只读查询为准。0.1.11 不迁移既有 0.1.10 引导任务或跨版本状态。

官方 Desktop 维护说明建议退出应用后操作；本指南的在线路径仅用于新装本插件，并以真实加载及上述结果验收，不推定所有插件都能热加载。不得强制结束进程、编写后台重启脚本、调用 Host 私有 RPC 或重跑 OAuth 排查验收。CLI 没有可见新对话能力时保留验收待完成，不以后台子会话冒充 Desktop / Web 验收。该过程使用当前模型，会产生正常模型调用，但不提交付费 Agent 任务；不声称未显示的动画已播放。

## 更新与移除

首次在线安装不扩大为在线更新、移除或断线恢复授权。先结束使用 OpenAgent 的任务，核对官方来源、版本和本地修改，备份需要保留的内容。未知来源或状态不明确时停止，不重复 add 充当更新。

当前会话真实提供 `plugin_manager` 时，可在宿主审批下按已核对的 `removable` 状态使用 `{"action":"remove_bundle","target":"dsh-openagent"}`，再回读包和运行状态；`stop-profile` 或 `restart-required` 按实际回执正常退出、重开后核对，不重复移除。该工具是可选维护入口，不是安装前提。

其他维护从独立外部终端进行：确认目标 profile 已停止，保留原 `DSH_HOME` 和 profile，Desktop 使用该应用内置 dsh。执行 `"<dsh 绝对路径>" plugin --profile "<原 profile>" remove dsh-openagent`；确认移除后才能按已授权更新要求重新安装。不要从将被关闭的聊天运行退出或卸载脚本，不清理包管理锁。已有有效登录不重复授权；失败、取消或未知结果停止。

一行卸载入口见 [README](https://github.com/openagent-org/deepseek-harness-plugin/blob/rel/README.md#%E5%8D%B8%E8%BD%BD)，需要 curl 和 Python 3.9+，仅在 profile 停止后从外部 Bash 执行。参数追加在 `python3 -` 后：

| 参数 | 用途 |
| --- | --- |
| `--yes` / `--dry-run` | 执行已核对的卸载 / 只读预览。 |
| `--profile <名称>` | 指定原 profile；多个官方安装时必须明确指定。 |
| `--dsh-home <路径>` | 指定原 Harness 主目录；缺省读取非空 `DSH_HOME`，否则使用 `~/.dsh`。 |
| `--desktop-app <路径>` | 指定 macOS 的 `.app` 或 Windows 安装根目录，定位内置 dsh。 |

脚本无法核实运行状态或发现包管理锁时停止，不终止进程、不清理锁。macOS 检查标准应用目录，Windows 使用已注册的内置 dsh；无法唯一定位时使用 `--desktop-app`。Linux Desktop 使用原生管理页面，卸载脚本不支持该场景。保留其他插件、配置和共享的 `DSH_HOME/openagent-auth`；本地卸载不等于撤销服务端授权，不能删除整个主目录或其他客户端凭据。
