# OpenAgent

在 DeepSeek Harness 中发现和调用 OpenAgent、上传任务附件，并查询 OpenAgent 余额。支持 Harness `>=0.2.1-rc.2 <0.3.0` 的本地 Desktop、Web 和 CLI。

根目录保留包声明、安装文档和卸载入口；运行文件集中在 `runtime/`，语言资源和业务 Skills 分别保留在 `locale/` 和 `skills/`。

## 安装

首次安装优先 Gitee；仅明确的网络下载失败才尝试 GitHub 备用源一次。已有可信的官方来源可以保留。

在当前普通对话中，把[中文安装指南](./INSTALL.md)或[英文安装指南](./INSTALL.en.md)交给安装 Agent，要求实际安装和验收。Agent 使用当前宿主的 CLI 安装，保存一次验收预约并结束安装轮；用户处理必要审批和宿主打开的网页授权。

插件优先在线加载。原安装会话空闲且唯一可见后，插件在同一工作区自动打开新对话并发送一次引导提示；原任务未归入工作区时沿用原工作目录。必要时按指南核对预约和连接状态，仅未领取预约的连接状态为 `not_started` 或 `ready` 时才正常重开并回到原会话继续；连接中等待原尝试，失败或未知时停止。无需用户重复发送提示。安装文件或预约就绪不等于验收通过，实际结果以引导和账号验证为准。插件显示名称为 **OpenAgent**，内部包名为 `dsh-openagent`。

## 使用

验收通过后，在新打开的引导对话中继续查找 Agent、执行任务、上传附件或查询余额。插件不会自动切回原安装任务；返回原任务后，其安装轮最终回复下方会显示独立卡片“OpenAgent 安装及账号验证通过”。点击“打开新用户引导”只打开已有引导任务，不新建或重发；正常重开后返回原任务仍可查看已保存的完成卡片。无法确定原安装轮次时不显示卡片，验收结果仍可按指南查询。0.1.11 不迁移既有 0.1.10 引导任务或跨版本状态。失败或结果未知时保留原状态，由安装 Agent 按指南只读查询，不重复发送引导或登录。

## 卸载

先结束相关任务并停止目标 profile；Desktop 须正常退出，再从独立的外部 Bash 终端执行以下一行脚本，需要 curl 和 Python 3.9+：

```bash
bash -o pipefail -c 'curl -fsSL --proto "=https" --proto-redir "=https" https://gitee.com/openagent-org/deepseek-harness-plugin/raw/rel/uninstall.py | python3 - --yes'
```

若 Gitee 下载明确因网络失败且确认卸载尚未执行，可从 [GitHub 备用源](https://raw.githubusercontent.com/openagent-org/deepseek-harness-plugin/rel/uninstall.py) 下载一次；整条管道结果不明或卸载执行失败时停止，不自动换源重放。

将 `--yes` 替换为 `--dry-run` 可只读预览动作和执行前提；多个 profile 已安装时添加 `--profile <名称>`。完整卸载脚本移除并核对官方插件后，检查同一 `DSH_HOME` 下所有 profile：仍有 OpenAgent 使用记录时保留登录并列出 profile；最后一个使用者移除且检查通过后，默认删除专用 `DSH_HOME/openagent-auth` 的全部缓存版本。旧版已移除插件但仍有认证缓存时，也可用同一脚本清理。

原生 `plugin_manager` 或 CLI 的 remove 仅移除 bundle、保留登录，适用于[维护与更新](./INSTALL.md#更新与移除)。完整卸载不删除其他插件的认证、`.mcp-auth`、会话或 `.openagent-onboarding`，也不撤销服务端授权。自定义目录、停止要求和清理失败处理见上述指南；状态不明或失败时停止，不自动重试。
