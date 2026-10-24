# 安装 OpenAgent：DeepSeek Harness

由当前普通对话中的安装 Agent 实际执行以下步骤，完成安装和一次新对话验收，不要只交付命令。用户处理必要审批和网页授权，不提供密码或 Token。

本指南核对 Harness `0.2.1-rc.2`，支持 `>=0.2.1-rc.2 <0.3.0` 的本地 Desktop、Web 和 CLI。插件显示名称为 **OpenAgent**，内部包名为 `dsh-openagent`。在线安装依赖宿主的 profile 热加载；安装命令成功不证明 OAuth、工具加载或新对话验收已通过。

用户可见的阶段提示使用以下固定文案；命令细节由宿主展示，不把内部状态或原始日志拼入提示：

- 开始执行安装：“正在安装 OpenAgent…”
- 同一连接尝试确认授权页已自动打开并等待用户时：“请在打开的页面中登录 OpenAgent…”
- 同一登录进程输出成功标记且退出码为 0 时：“已登录 OpenAgent”
- 在原安装轮等待原生验收时：“正在连接 OpenAgent，连接就绪后将自动打开新用户引导…”
- 安装或连接失败：“安装失败：{原因}。{解决方案}”。填入已确认的简短原因和当前可执行的处理，不输出占位符，不猜测失败阶段。
- 明确的授权超时：“登录超时，OpenAgent 安装尚未完成。请查看安装失败卡片中的阶段和原因。”

原生验收等待期间保持当前轮；真正完成后的最终回复按第 4 步。

## 1. 核对当前宿主和执行工具

使用普通对话实际提供的 `bash` 或 `pwsh`、`job_output`。核对 shell schema 支持 `description`、`command`、`run_in_background: true`、`sandbox_permissions: "danger-full-access"` 和 `justification`。安装和验收记录会写入当前 Harness profile，首次调用就请求当次所需权限；不改全局权限。工具或参数缺失、审批拒绝或取消时停止，不换入口重试。

通过 shell 只核对宿主注入的 `DSH_HOME`、`DSH_PROFILE`、`DSH_PROFILE_DIR` 和 `DSH_SESSION_ID`，保留原值。确认 profile 目录确属该主目录、当前客户端和原安装会话；缺失或不符时停止，不猜测其他 profile，不读取凭据或会话正文。

核对 Git、Node 与 dsh 的版本和来源。Node 需要 `22.19+`（22 系列）或 `24+`，核对当前宿主可用的 Node 绝对路径。Desktop 必须定位**当前运行应用**内置的 `resources/runtime/cli/bin/dsh`（Windows 为 `dsh.cmd`），macOS 位于应用的 `Contents/Resources/runtime/cli/bin/dsh`；不要按固定应用名猜路径，也不要另装 npm dsh。非 Desktop 使用与当前 Host 属于同一安装的 dsh。用其绝对路径核对 `--version`，后续替换示例中的占位路径并正确引用。

只读检查当前 profile 的 `package.json` 中该包的依赖来源、`dsh.profile.bundles`、相关禁用记录和实际安装包的名称、版本；不要输出整份配置。认可来源仅为以下官方 GitHub/Gitee 仓库的 `rel`（包括包管理器保存的等价写法）。已有可信且版本不低于 `0.1.15` 的安装时保留，不再次 add；低于该版本不具备本流程的内置预约检查，应报告版本不适用并停止。已禁用、未知同名来源、文件异常或未确认的本地修改时停止，不擅自启用或覆盖。

## 2. 用当前宿主 CLI 安装一次

首次下载优先 Gitee，仅符合下述网络下载失败条件时使用 GitHub 备用源一次。仅尚未安装时执行；开始时使用上方固定提示。

macOS / Linux 的 `bash` 调用：

```json
{
  "description": "在当前 Harness profile 安装 OpenAgent",
  "command": ": \"${DSH_HOME:?未取得当前 Harness 主目录}\" \"${DSH_PROFILE:?未取得当前 profile}\" \"${DSH_PROFILE_DIR:?未取得当前 profile 路径}\" \"${DSH_SESSION_ID:?未取得当前会话标识}\"; \"<dsh 绝对路径>\" plugin --profile \"$DSH_PROFILE\" add 'git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel'",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "本次安装需要下载官方插件并写入当前 Harness profile，由宿主加载 OpenAgent。"
}
```

Windows 的 `pwsh` 调用：

```json
{
  "description": "在当前 Harness profile 安装 OpenAgent",
  "command": "if (-not $env:DSH_HOME -or -not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw '未取得当前 Harness profile 或会话标识' }; & '<dsh.cmd 绝对路径>' plugin --profile $env:DSH_PROFILE add 'git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel'",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "本次安装需要下载官方插件并写入当前 Harness profile，由宿主加载 OpenAgent。"
}
```

使用返回的真实 `jobId` 等待同一安装任务，每次最多 60 秒：

```json
{"job_id":"<上一步的 jobId>","wait":true,"timeout_ms":60000}
```

任务仍运行就继续等待原任务，不重新安装。仅明确发生 Git 下载的 DNS、连接、超时、传输中断或 HTTP 5xx 错误，且原进程已结束时，可将地址换为 `git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel` 再下载一次。审批拒绝、证书错误、401/403/404/429/451、校验、构建、兼容性、加载或 OAuth 问题不换源；不授予构建脚本权限、不增加版本豁免。其他失败、取消或未知结果保留现场并停止，不重放命令。

CLI 会将新 bundle 加入启用列表，宿主优先在线加载。每次加载 bundle 时，插件自动运行一次包内登录连接检查，不自动重试；已有有效授权时复用且不再打开授权页。只有同一进程输出 `OPENAGENT_LOGIN_CONNECTED` 且退出码为 0 后才挂载 MCP。首次授权的总时限为 330 秒，网页等待 300 秒，避免原生 MCP 初始化和探测阶段截断授权。**不要在 shell 另跑 `runtime/login.mjs`、补开授权 URL 或并行启动第二次登录**。已有同端点有效登录由该入口复用。仅为 `https://openagent.org/mcp/v1/open-agent` 完成授权；不同端点的认证记录不得复制、改写或复用。

安装进程退出码为 0 后，回读实际包的名称、版本、官方来源和启用列表，确认无禁用记录，再进入第 3 步。该结果仅证明安装文件已就绪，不另行输出完成提示，不从退出码推断连接成功。保留其他插件、模型、会话及配置，不删除 profile，不使用 `--from-default-profile`。

## 3. 在原安装轮直接等待验收

安装文件核对完成后，在当前原生工具目录中确认 `openagent_install_verify`，提示“正在连接 OpenAgent，连接就绪后将自动打开新用户引导…”，再直接调用一次：

```json
{"locale":"zh-CN"}
```

工具自行检查原会话的既有预约或验收记录，无需先调用状态查询。已有记录时返回原状态；首次调用保存一次性记录，等待同一连接就绪。**保持原安装轮运行，等待同一次工具调用返回，不提前输出最终回复。** 连接等待、创建新对话、发送引导和四项验收共用最多 600 秒。失败、取消、超时或未知结果时保留记录并停止，不重新登录、另建预约或补发提示；需要诊断时按第 4 步查询。

热加载尚未把工具暴露到当前目录时，在后续原生工具步骤核对刷新后的目录。若宿主无法继续等待，如实报告尚未完成，不重新安装或改用 CLI 预约结束原轮。

连接就绪、MCP 与五项业务 Skills 实际可用且原会话唯一可见后，插件自动打开同一工作区的新对话，发送一次“OpenAgent 已安装，打开新用户引导”，保留原会话草稿；原任务未归入工作区时沿用原工作目录。工具返回后按第 4 步处理结果。

## 4. 读取诊断与完成结果

原调用已返回但结果需要核对，或既有预约未自动打开新对话时，在**原安装会话**查询只读状态：已暴露 `openagent_install_status` 时传 `{}`；否则运行下列 `--status`。保留原 profile、会话和 Node 路径，按 shell 实际权限要求执行。原生验收仍在等待时，继续等待同一次调用。

Bash：

```bash
"<Node 绝对路径>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/post-install.mjs" --status --profile "$DSH_PROFILE"
```

PowerShell：

```powershell
& '<Node 绝对路径>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/post-install.mjs') --status --profile $env:DSH_PROFILE
```

查询通过 `connection` 返回安全诊断：`status` 表示连接状态，`stage/code/http_status` 在有可信记录时说明阶段、公开原因和 HTTP 状态。只转述回执中的已确认信息，不输出凭据、授权 URL、原始日志或业务正文。

按工具回执处理：

| 状态 | 处理 |
| --- | --- |
| `completed` 且四项证据均为 `true` | 回读实际安装版本，按下方规则报告完成。 |
| 既有 `pending`，未领取、未过期，连接为 `not_started/connecting/ready` | 保留原预约和期限，不改用新的验收请求；原会话空闲且唯一可见、连接就绪后由插件继续。 |
| `NO_ATTEMPT` | 仅确实从未发起验收时进入第 3 步；有过尝试则停止。 |
| `failed`、`unconfirmed`、过期或无法确认 | 使用固定失败文案说明实际阶段、公开原因和可执行处理，保留状态并停止。 |

连接失败或未知时，插件在可信的原安装轮下保存失败卡片，展示上述安全诊断，无需持续查询。无可信安装轮次时以只读回执为准。

四项证据为 `guide_loaded`、`guide_success`、`account_success`、`turn_completed`，必须严格为 `true`：新对话实际加载引导 Skill，引导返回 `view=onboarding/status=ready`，一次账号调用返回 `success=true`，并正常结束该轮。模型正文、登录成功或卡片外观不能替代该结果。

需要报告完成结果时，先取得上述 completed 回执，再次只读回读实际安装包版本并确认与安装时一致。若原安装轮的真实完成卡片可见，最终自然语言回复必须严格为以下两段，用实际版本替换占位符，不追加链接、技术说明、工具加载原因、任务 ID 或其他文字：

```text
OpenAgent {版本号} 已安装完成，新用户引导和账号验证已通过。

点击下方「打开新用户引导」继续。
```

若卡片不可见或没有可信安装轮次，第二段改为“请在已打开的新用户引导对话中继续。”，不得虚构按钮。未取得完整验收证据或版本不一致时，不使用完成文案，按实际阶段和公开原因报告未完成。

成功结果保存后，插件在原安装任务对应安装轮的最终回复下方显示独立完成卡片“OpenAgent 安装及账号验证通过”，按钮为“打开新用户引导”。页面不会自动切回原任务；用户返回原任务（包括正常重开后返回）即可查看已保存的卡片。点击按钮只打开已存在的引导任务，不创建任务、不重发提示、不调用模型。无法确定可信安装轮次时不显示卡片，实际验收结果仍以上述只读查询为准。验收状态不跨包版本迁移，既有引导任务保持原样。
