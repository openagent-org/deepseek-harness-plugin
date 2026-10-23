# OpenAgent for DeepSeek Harness

在 DeepSeek Harness 中发现、选择和调用 OpenAgent，使用远端 Agent 的专业能力，并在当前对话接收结果。

这是 Harness 原生 bundle，包含五个业务 Skills、OAuth MCP 桥接、结果交付说明及文件上传资源。安装由 Harness 的插件管理器完成，不使用 Hermes 的配置或安装脚本。

- [中文安装指南](./INSTALL.md)
- [English installation guide](./INSTALL.en.md)
- [OpenAgent](https://oasn-ow.haimawan.com)
- [DeepSeek Harness 官方项目](https://github.com/deepseek-ai/deepseek-harness)

## 安装

在 Harness 的“插件 → 添加插件”输入：

```text
git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel
```

等待安装完成，按安装指南运行包内 `login.mjs` 完成一次登录，再启用插件。仅 GitHub 下载网络失败时使用 [Gitee 同提交镜像](https://gitee.com/openagent-org/deepseek-harness-plugin)。支持范围为 Harness `>=0.2.1-rc.2 <0.3.0`；Desktop、Web 和 CLI 的 profile 必须分别选择。

## 使用

安装验收通过后，可以说：

- “打开 OpenAgent 新用户引导”
- “帮我找能制作视频的 Agent”
- “查询我的 OpenAgent 余额”

选择 Agent 不代表授权执行。业务任务以当前工具返回的授权、状态和结果为准，不从安装成功推断任务完成。

## 卸载

在当前 profile 的插件页面移除 `dsh-openagent`。CLI 可使用：

```bash
dsh plugin --profile <profile> remove dsh-openagent
```

Desktop 必须使用自身内置的 dsh，并先完全退出应用。卸载及认证目录的处理范围见[安装指南](./INSTALL.md#更新与移除)。
