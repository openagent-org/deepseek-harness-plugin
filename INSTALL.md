# 安装 OpenAgent：DeepSeek Harness

由 DeepSeek Harness 的安装 Agent 实际执行以下四步，完成安装、登录和新对话验收，不要只把命令交给用户。建议在新对话选择“创造 / Creator”模式后交付本指南；当前会话已提供 `plugin_manager` 时直接继续。用户处理必要审批和网页授权，不提供密码或 Token。

本指南核对 Harness `0.2.1-rc.2`，支持 `>=0.2.1-rc.2 <0.3.0` 的本地 Desktop、Web 和 CLI。插件显示名称为 **OpenAgent**；工具参数和安装路径中的内部包名仍为 `dsh-openagent`。

## 1. 确认当前环境和原生工具

确认当前确实是目标机器上的 DeepSeek Harness，并核对版本。检查当前会话真实提供 `plugin_manager`、当前系统的 `bash` 或 `pwsh`、以及 `job_output`，并确认所用 shell 的实际 schema 支持 `run_in_background: true`；不支持时停止并报告宿主缺少后台执行能力。缺少安装工具时，说明当前模式不能完成自动安装，请用户新建 Creator 对话后再次交付本指南；已有对话不能在首轮后切换预设。不要手改 YAML、关闭审批或从当前聊天另起 `dsh plugin` 命令补装工具。

通过原生 shell 只核对宿主注入的 `DSH_HOME`、`DSH_PROFILE`、`DSH_PROFILE_DIR` 和 `DSH_SESSION_ID`。后续使用已确认的值；缺失或目标不符时停止，不猜测 profile，不改写变量指向其他 profile，也不读取凭据文件。

检查 Git 和 Node.js：需要 Node `22.19+`（22 系列）或 `24+`。有 `load_workspace_dependencies` 时使用它返回的 Node 绝对路径，否则使用当前环境已配置并验证过的 Node。后续示例的 `<Node 绝对路径>` 必须替换为该路径并正确引用。无需为 Desktop 另装 dsh。

`plugin_manager` 每次检查 `danger-full-access` 权限：已有该权限时直接执行，否则由宿主请求本次审批；不能给它添加 shell 权限参数，也不修改会话全局权限。登录和预约会写入 Harness 专用目录，执行前核对原生 shell 的实际 schema 支持 `sandbox_permissions: "danger-full-access"` 和 `justification`，首次调用就申请该次操作所需权限。参数缺失、审批拒绝或取消时停止，不换入口重试。

## 2. 用原生工具安装，暂不启用

先调用 `plugin_manager`：

```json
{"action":"list_bundles","limit":100}
```

解析工具返回的 JSON 字符串。`nextOffset` 非空时继续以该值作为 `offset` 读取，直到找到目标或查完。核对 `name="dsh-openagent"` 的记录及其 `source`、`version`、`installed`、`enabled`；来源必须实际对应以下官方 GitHub 或 Gitee 仓库的 `rel`，不能用 `official` 布尔值判断，它表示 Harness 内建目录归属。

已有该来源的安装时保留并继续；`already-installed` 也先回读确认，不移除重装。仅明确需要更新时按末尾“更新与移除”处理。未知同名来源、文件异常或未确认的本地修改均停止，不覆盖。

尚未安装时，调用一次 `plugin_manager`，明确暂不启用：

```json
{"action":"install_bundle","target":"git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel","enabled":false}
```

等待同一次调用结束，再用 `list_bundles` 回读包名、版本和来源。只有安装明确成功且目标包可读，才继续；`failed`、`cancelled`、`overridden` 或未知结果时报告阶段并停止，不重复安装。`restart-required` 先保留状态，完成登录后按第 4 步的预约分支处理。

仅明确发生 Git 下载的 DNS、连接、超时、传输中断或 HTTP 5xx 错误，且原操作已结束时，允许将 `target` 换为 `git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel` 再下载一次。审批拒绝、证书错误、401/403/404/429/451、校验、依赖构建、启用或 OAuth 失败不换源。返回 `pendingBuilds` 时报告构建脚本审批阻断并停止，不自行添加 `approvedBuilds` 或放开版本兼容检查。

原生管理器负责当前 profile 的依赖和插件列表。保留其他插件、模型、会话和配置，不删除 profile，不使用 `--from-default-profile`。

## 3. 登录一次，再原生启用

先判断是否已有同一端点的可信登录成功记录且连接可用；有则跳过重复登录。若已启用的插件正在授权，等待现有尝试，不并行运行登录入口。仅为 `https://openagent.org/mcp/v1/open-agent` 完成授权；不同端点的认证记录不得复制、改写或复用。

需要登录时，先告知用户：“正在连接 OpenAgent；如打开授权页，请在网页完成授权，我会等待同一进程。”安装 Agent 选择当前系统的一种原生 shell 调用，替换 Node 路径后执行一次。

macOS / Linux 使用 `bash`：

```json
{
  "description": "连接 OpenAgent 并等待网页授权",
  "command": "\"<Node 绝对路径>\" \"$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/login.mjs\"",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "本次登录需要写入当前 Harness 的 OpenAgent 专用认证目录并完成浏览器授权。"
}
```

Windows 使用 `pwsh`：

```json
{
  "description": "连接 OpenAgent 并等待网页授权",
  "command": "& '<Node 绝对路径>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/login.mjs')",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "本次登录需要写入当前 Harness 的 OpenAgent 专用认证目录并完成浏览器授权。"
}
```

记住返回的真实 `jobId`，使用 `job_output` 等待同一个任务，每次最多 60 秒：

```json
{"job_id":"<上一步的 jobId>","wait":true,"timeout_ms":60000}
```

短等待结束不代表登录失败；任务仍运行时继续等待原任务，不重跑命令。只有原命令退出码为 0 且输出 `OPENAGENT_LOGIN_CONNECTED`，才确认登录连接通过。取消、失败、超时或未知结果时停止，报告阶段和公开错误。授权页由登录入口打开，不另外补开 URL，不打印认证文件、完整授权地址或原始日志。

登录通过后，调用 `plugin_manager`：

```json
{"action":"set_bundle","target":"dsh-openagent","enabled":true}
```

回读目标包和实际工具目录。`application="applied"` 只证明配置已应用；MCP 工具与 Skills 已可用时直接进入第 4 步，不退出、不重启。明确返回 `restart-required` 时进入下方预约分支。其余失败或未知结果停止，不把“已启用”当作验收成功，也不靠再次登录排查工具缺失。

## 4. 自动打开新对话验收并交付

没有预约且尚未发起验收时，安装 Agent 在原安装会话调用一次 `openagent_install_verify`：

```json
{"locale":"zh-CN"}
```

保持目标 Desktop / Web 的原安装会话在唯一可见窗口中。工具会检查真实 MCP 工具和五项业务 Skills，自动创建并显示新对话，发送一次“OpenAgent 已安装，打开新用户引导”，保留原会话草稿。不要另外创建会话、手动补发提示或要求用户重复发送。

仅当 `status="completed"`，且 `guide_loaded`、`guide_success`、`account_success`、`turn_completed` 均严格为 `true`，才报告“OpenAgent 安装及账号验证通过，可以在新对话继续使用”。这要求新对话实际加载引导 Skill、引导返回 `view=onboarding/status=ready`、一次账号调用返回严格的 `success=true`，并正常结束该轮。工具列表、OAuth 成功或模型正文不能替代。

单次验收最多等待 600 秒。原调用超时或结果未知时，只调用一次只读 `openagent_install_status`：

```json
{}
```

按已有状态报告结果，不再调用 verify，不换会话绕过记录。`NO_ATTEMPT` 不能覆盖尚未开始的预约，也不是补发许可。失败时报告“OpenAgent 安装验收未完成”、阶段和公开错误，不重复引导、账号调用或 OAuth，不读取 Token、直连 MCP 或删除状态绕过验收。

### 仅在原生管理结果明确要求重开时预约

仅当结果明确为 `restart-required`，且没有预约、尚未调用 verify 或创建验收对话时，在原安装会话执行一次以下预约命令。使用第 1 步核对的 Node 和宿主注入变量；原生 `bash` / `pwsh` 调用请求本次 `sandbox_permissions: "danger-full-access"`，`justification` 说明“为当前安装会话保存一次性的新对话验收预约”。短时执行并等待退出，不关闭应用。

Bash：

```bash
: "${DSH_PROFILE:?未取得当前 profile}" "${DSH_PROFILE_DIR:?未取得当前 profile 路径}" "${DSH_SESSION_ID:?未取得当前会话标识}"
"<Node 绝对路径>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/post-install.mjs" --prepare --profile "$DSH_PROFILE" --locale zh-CN
```

PowerShell：

```powershell
if (-not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw '未取得当前 Harness profile 或会话标识' }
& '<Node 绝对路径>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/post-install.mjs') --prepare --profile $env:DSH_PROFILE --locale zh-CN
```

仅命令成功结束并输出 `OPENAGENT_ONBOARDING_PREPARED` 时报告：“安装文件已就绪，自动验收已预约。请在所有任务结束后正常退出并重开 Harness，30 分钟内回到本安装会话。”随即结束本轮。原会话空闲且唯一可见、MCP 与 Skills 可用后，插件自动完成上述验收，无需用户发提示，也不再调用 verify。禁止强制结束进程或编写后台重启脚本。

预约失败、过期、输出 `OPENAGENT_ONBOARDING_STATE` 或未知结果时保留原状态，报告实际阶段；不续期、删除记录、换会话或手动补发。已经发起的验收只按上文查询一次 status。

缺少验收工具或当前客户端没有可见新对话能力时，保留“新对话验收待完成”。CLI 不得用后台子会话冒充 Desktop / Web 的可见验收；仅明确没有预约且从未发起验收时，才可由用户在目标客户端手动创建对话并发送固定提示。验收使用当前模型，会产生正常模型调用，但不提交付费 Agent 任务；不声称未显示的动画已经播放。

## 更新与移除

由具备 `plugin_manager` 的安装 Agent 执行。先结束使用 OpenAgent 的任务，回读来源、版本、`removable` 并检查本地修改；仅处理上述官方 GitHub/Gitee `rel` 安装，备份需要保留的修改。该 Git 包没有可用的原生更新按钮，重复添加相同地址不能作为更新成功依据。

移除时调用 `plugin_manager`：

```json
{"action":"remove_bundle","target":"dsh-openagent"}
```

回读实际包与运行状态，确认移除后才报告成功。`restart-required` 表示尚需正常重开后核对运行状态，不重复移除。更新须在移除确认后回到第 2 步安装，再启用并验收；已有有效的同端点登录不重复授权。失败、取消或未知结果时停止，不自动重放流程。

若返回 `stop-profile`，由用户结束任务并正常退出目标客户端，再从独立外部终端处理原 profile。保持原 `DSH_HOME`；Desktop 使用应用内置 dsh，不用 npm 另装版本，也不从将被关闭的聊天运行退出或卸载脚本。确认 profile 已停止后执行：

```bash
dsh plugin --profile <原 profile> remove dsh-openagent
```

仅已确认移除、需要重装且 profile 仍停止时，使用 `dsh plugin --profile <原 profile> add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'`。启动前，用已核对的 Node 绝对路径运行该实际 profile 包目录中的 `runtime/login.mjs`，按第 3 步的单次登录规则处理；外部终端不假定存在宿主注入变量。重开后继续验收。原生插件页面也能完成安装、启用和移除，作为人工维护入口，不代替具备工具的安装 Agent 执行主流程。

独立外部终端的一行卸载入口见 [README](https://github.com/openagent-org/deepseek-harness-plugin/blob/rel/README.md#%E5%8D%B8%E8%BD%BD)，需要 curl 和 Python 3.9+。脚本要求目标 profile 已停止，只接受上述官方来源，保留其他插件和配置；参数追加在 `python3 -` 后：

| 参数 | 用途 |
| --- | --- |
| `--yes` / `--dry-run` | 执行已核对的卸载 / 只读预览。 |
| `--profile <名称>` | 指定原 profile；多个官方安装时必须明确指定。 |
| `--dsh-home <路径>` | 指定原 Harness 主目录；缺省读取非空 `DSH_HOME`，否则使用 `~/.dsh`。 |
| `--desktop-app <路径>` | 指定 macOS 的 `.app` 或 Windows 应用安装根目录，以定位内置 dsh。 |

脚本不能核实运行状态或发现包管理锁时停止，不终止进程、不清理锁。macOS 默认检查标准应用目录；Windows 默认使用已注册的内置 dsh；无法唯一定位时用 `--desktop-app`。脚本不支持 Linux Desktop，该场景使用原生管理工具或页面。

保留共享的 `DSH_HOME/openagent-auth`；本地卸载不等于撤销服务端授权。彻底退出账号须先确认所有使用该目录的 profile 已停止并取得用户明确授权；禁止删除整个 Harness 主目录或其他客户端凭据。
