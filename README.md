# OpenAgent

在 DeepSeek Harness 中发现和调用 OpenAgent、上传任务附件，并查询 OpenAgent 余额。支持 Harness `>=0.2.1-rc.2 <0.3.0` 的本地 Desktop、Web 和 CLI。

## 安装

在当前普通对话中，把[中文安装指南](./INSTALL.md)或[英文安装指南](./INSTALL.en.md)交给安装 Agent，要求实际安装和验收。Agent 使用当前宿主 CLI 安装，再直接调用原生验收工具并保持原安装轮等待；用户处理必要审批和网页授权。

连接就绪后，插件自动打开同一工作区的新用户引导对话。引导和账号验证通过才算安装完成；失败时保留原状态和诊断。安装过程、固定提示及完成文案以安装指南为准。

## 使用

验收通过后，在新打开的引导对话中继续查找 Agent、执行任务、上传附件或查询余额。返回原安装任务，可在其完成卡片中点击“打开新用户引导”回到已有引导任务；正常重开后卡片仍保留。无法确定原安装轮次时不显示卡片，可按安装指南查询验收结果。

## 更新与移除

首次在线安装不扩大为在线更新、移除或断线恢复授权。先结束使用 OpenAgent 的任务，核对官方来源、版本和本地修改，备份需要保留的内容。未知来源或状态不明确时停止，不重复 add 充当更新。

当前会话真实提供 `plugin_manager` 时，可在宿主审批下按已核对的 `removable` 状态使用 `{"action":"remove_bundle","target":"dsh-openagent"}`，再回读包和运行状态；`stop-profile` 或 `restart-required` 按实际回执正常退出、重开后核对，不重复移除。该工具是可选维护入口，不是安装前提。

其他维护从独立外部终端进行：确认目标 profile 已停止，保留原 `DSH_HOME` 和 profile，Desktop 使用该应用内置 dsh。执行 `"<dsh 绝对路径>" plugin --profile "<原 profile>" remove dsh-openagent`；确认移除后才能按已授权更新要求重新安装。不要从将被关闭的聊天运行退出或卸载脚本，不清理包管理锁。已有有效登录不重复授权；失败、取消或未知结果停止。

上述两种原生移除仅移除 bundle 并保留登录，适用于维护和更新；清理本地登录使用下面的完整卸载入口。

### 卸载

完整卸载需要 curl 和 Python 3.9+，仅在 profile 停止后从外部 Bash 执行：

```bash
bash -o pipefail -c 'curl -fsSL --proto "=https" --proto-redir "=https" https://gitee.com/openagent-org/deepseek-harness-plugin/raw/rel/uninstall.py | python3 - --yes'
```

若 Gitee 下载明确因网络失败且确认卸载尚未执行，可从 [GitHub 备用源](https://raw.githubusercontent.com/openagent-org/deepseek-harness-plugin/rel/uninstall.py) 下载一次；整条管道结果不明或卸载执行失败时停止，不自动换源重放。

参数追加在 `python3 -` 后：

| 参数 | 用途 |
| --- | --- |
| `--yes` / `--dry-run` | 执行已核对的卸载及适用的认证清理 / 只读列出动作和执行前提，不写文件。 |
| `--profile <名称>` | 指定原 profile；多个官方安装时必须明确指定。 |
| `--dsh-home <路径>` | 指定原 Harness 主目录；缺省读取非空 `DSH_HOME`，否则使用 `~/.dsh`。 |
| `--desktop-app <路径>` | 指定 macOS 的 `.app` 或 Windows 安装根目录，定位内置 dsh。 |

原生移除前须确认目标 profile 已停止且无包管理锁；脚本不终止进程或清理锁。macOS 检查标准应用目录，Windows 使用已注册的内置 dsh；无法唯一定位时使用 `--desktop-app`。Linux Desktop 的 bundle 移除使用原生管理页面，该脚本不支持该移除场景。

原生移除成功并回读确认后，完整卸载脚本检查同一 `DSH_HOME` 下所有 profile。任何来源的 `dsh-openagent` 依赖、bundle 登记或包路径（包括失效链接）均算使用记录；仍有使用记录时保留登录，列出对应 profile，并正常结束。只有确认没有其他使用者、该主目录各 profile 均已停止、没有包管理锁，且专用认证路径及整棵目录树无符号链接、Windows junction 或特殊文件时，才删除整个 `DSH_HOME/openagent-auth`，包含全部缓存版本。删除前再次核对使用记录和路径。

实际执行时，无法核实其他 profile、运行状态或路径，或发现锁、异常文件，将保留认证缓存并以非零退出码报告“清理未完成”；删除期间发生文件系统错误时也以非零退出码报告可能仍有残留，不自动重试。旧版已移除插件而仅剩认证缓存时，可用同一脚本执行 `--yes` 或 `--dry-run`，无需为清理缓存再找到 dsh CLI；认证缓存也不存在时重复运行无操作。

清理不读取凭据正文、不备份 Token，保留其他插件、配置、其他认证目录（包括 `.mcp-auth`）、会话及 `.openagent-onboarding`。本地删除不等于撤销服务端授权，不能删除整个主目录或其他客户端凭据。
