# OpenAgent

在 DeepSeek Harness 中发现和调用 OpenAgent、上传任务附件，并查询 OpenAgent 余额。支持 Harness `>=0.2.1-rc.2 <0.3.0` 的本地 Desktop、Web 和 CLI。

根目录保留包声明、安装文档和卸载入口；运行文件集中在 `runtime/`，语言资源和业务 Skills 分别保留在 `locale/` 和 `skills/`。

## 安装

在当前普通对话中，把[中文安装指南](./INSTALL.md)或[英文安装指南](./INSTALL.en.md)交给安装 Agent，要求实际安装和验收。Agent 使用当前宿主的 CLI 安装，保存一次验收预约并结束安装轮；用户处理必要审批和宿主打开的网页授权。

插件优先在线加载。原安装会话空闲且唯一可见后，插件自动打开新对话并发送一次引导提示；必要时按指南核对预约和连接状态，仅未领取预约的连接状态为 `not_started` 或 `ready` 时才正常重开并回到原会话继续；连接中等待原尝试，失败或未知时停止。无需用户重复发送提示。安装文件或预约就绪不等于验收通过，实际结果以引导和账号验证为准。插件显示名称为 **OpenAgent**，内部包名为 `dsh-openagent`。

## 使用

验收通过后，在新打开的引导对话中继续查找 Agent、执行任务、上传附件或查询余额。失败或结果未知时保留原状态，由安装 Agent 按指南只读查询，不重复发送引导或登录。

## 卸载

先结束相关任务并停止目标 profile；Desktop 须正常退出，再从独立的外部 Bash 终端执行以下一行脚本，需要 curl 和 Python 3.9+：

```bash
bash -o pipefail -c 'curl -fsSL --proto "=https" --proto-redir "=https" https://raw.githubusercontent.com/openagent-org/deepseek-harness-plugin/rel/uninstall.py | python3 - --yes'
```

将 `--yes` 替换为 `--dry-run` 可预览；多个 profile 已安装时添加 `--profile <名称>`。脚本只处理官方安装，保留其他插件、配置和共享登录状态。当前宿主有原生管理工具时也可按[更新与移除说明](./INSTALL.md#更新与移除)处理；首次在线安装不扩大为在线维护授权。自定义目录和 Desktop 定位参数见上述说明；失败或结果未知时停止，不自动重试。
