# OpenAgent

在 DeepSeek Harness 中发现和调用 OpenAgent、上传任务附件，并查询 OpenAgent 余额。支持 Harness `>=0.2.1-rc.2 <0.3.0` 的本地 Desktop、Web 和 CLI。

## 安装

在新对话选择“创造 / Creator”模式，把[中文安装指南](./INSTALL.md)或[英文安装指南](./INSTALL.en.md)交给安装 Agent，并要求实际安装和验收。当前会话已提供 `plugin_manager` 时可以直接继续，无需换模式。Agent 通过原生工具安装、等待一次登录并自动完成新对话验收；用户处理必要审批和网页授权。

MCP 与 Skills 已可用时无需重启。仅原生管理结果明确要求重开时，Agent 先保存验收预约；用户正常重开并回到原安装会话后自动继续。插件显示名称为 **OpenAgent**，内部包名仍为 `dsh-openagent`。

## 使用

验收通过后，在新打开的引导对话中继续查找 Agent、执行任务、上传附件或查询余额。失败或结果未知时保留原状态，由安装 Agent 按指南查询，不重复发送引导。

## 卸载

可让具备 `plugin_manager` 的 Agent 按[更新与移除说明](./INSTALL.md#更新与移除)通过原生工具卸载。使用以下一行脚本时，先结束相关任务并停止目标 profile；Desktop 须正常退出，再从独立的外部 Bash 终端执行，需要 curl 和 Python 3.9+：

```bash
bash -o pipefail -c 'curl -fsSL --proto "=https" --proto-redir "=https" https://raw.githubusercontent.com/openagent-org/deepseek-harness-plugin/rel/uninstall.py | python3 - --yes'
```

将 `--yes` 替换为 `--dry-run` 可预览；多个 profile 已安装时添加 `--profile <名称>`。脚本只处理官方安装，保留其他插件、配置和共享登录状态。自定义目录和 Desktop 定位参数见上述说明；失败或结果未知时停止，不自动重试。
