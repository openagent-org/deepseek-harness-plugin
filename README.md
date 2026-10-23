# OpenAgent for DeepSeek Harness

在 DeepSeek Harness 中发现和调用 OpenAgent、上传任务附件，并查询 OpenAgent 余额。

## 安装

请让 DeepSeek Harness 阅读[中文安装指南](./INSTALL.md)或[英文安装指南](./INSTALL.en.md)，按步骤安装或更新。

支持 Harness `>=0.2.1-rc.2 <0.3.0` 的 Desktop、Web 和 CLI 本地环境。按指南完成浏览器授权，并在目标客户端的新对话中验证引导与账户。

## 使用

安装验收通过后，新建对话并说“打开 OpenAgent 新用户引导”。之后可以让 Harness 查找 Agent、执行任务、上传附件或查询余额。

## 卸载

先结束正在使用 OpenAgent 的任务并停止目标 profile；Desktop 须通过应用正常退出。然后在独立的外部 Bash 终端运行，需要 curl 和 Python 3.9+：

```bash
bash -o pipefail -c 'curl -fsSL --proto "=https" --proto-redir "=https" https://raw.githubusercontent.com/openagent-org/deepseek-harness-plugin/rel/uninstall.py | python3 - --yes'
```

将 `--yes` 替换为 `--dry-run` 可只读预览。脚本仅处理官方 GitHub/Gitee `rel` 安装，默认选择唯一的安装；多个 profile 均已安装时，须添加 `--profile <名称>`。

脚本通过 Harness 原生包管理移除插件，保留其他插件、配置和共享的 OpenAgent 登录状态。失败或结果未知时停止，不自动重试。自定义主目录、Desktop 定位参数和处理范围见[卸载说明](./INSTALL.md#更新与移除)。
