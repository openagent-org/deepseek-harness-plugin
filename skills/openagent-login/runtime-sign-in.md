# OpenAgent runtime sign-in

## When to use

Use this only after the current OpenAgent connection explicitly reports missing or expired authentication, such as `MCP_AUTH_REQUIRED` or `MCP_TOKEN_INVALID`, or the user explicitly requests sign-in. Missing tools, an HTTP status alone, business errors, network failure, or an unknown execution result are not proof that login is needed. Do not test authentication before normal calls.

DeepSeek Harness uses this plugin's dedicated `mcp-remote` OAuth bridge. Credentials stay in the selected `DSH_HOME` under `openagent-auth`; the bridge owns token storage and refresh. Never read, print, copy, or edit that storage, and never use credentials from another client.

工具缺失或安装验收失败不构成登录恢复指令。报告真实失败阶段及保留的公开错误，不读取 Token，不用 curl、自制 HTTP/MCP 客户端或其他宿主连接替代原生工具，不为改变验收结果而自动重跑 OAuth。

协议会话检查由桥接器内部完成，不要求模型预先调用账号或登录工具。只有尚未发送的请求、内部检查明确 404 且没有其他在途请求时，桥接器才允许重建会话。业务已经发送后结果未知则停止，不重放。桥接退出后，工具名仍可见或新建对话都不能证明连接恢复；按下述正常重载规则处理，不能据此重跑登录。

## One authorization attempt

1. If the bridge has already opened or is waiting for a browser authorization, keep waiting for that same process. Do not start a second login, reopen the OAuth URL, restart the profile, or repeat the business call. Automatic bridge refresh or consent remains part of that connection's attempt.
2. Only after the previous attempt is confirmed ended and the user authorizes recovery, locate the installed `dsh-openagent` package root using the loaded Skill's trusted resource base, then use its `runtime/login.mjs`. Preserve the current `DSH_HOME` and profile. Run `node <installed-package>/runtime/login.mjs` once with the host's actual local terminal and continuation mechanism; do not copy another host's tool arguments.
3. Immediately before launch say “需要登录 OpenAgent 才能继续。正在打开登录页面…” in Chinese or “Please sign in to OpenAgent to continue. Opening the sign-in page…” in English. The bridge owns opening the page. A printed URL does not prove that the page opened; never compensate with a separate browser navigation.
4. Wait on the same process. The login helper has a bounded timeout and suppresses raw authentication output. `OPENAGENT_LOGIN_CONNECTED` plus successful process completion confirms this connection; it does not prove an account query, tool roster, or business result. Say “已登录 OpenAgent” or “Signed in to OpenAgent” only after that result.
5. A denial, cancellation, failure, or confirmed timeout ends the attempt. Preserve the state and report the failed stage without automatically relaunching, removing authentication files, changing endpoints, or resetting the profile. If the attempt's state is unknown, stop and report that uncertainty. A yielded terminal is not a timeout.

需要重新加载连接时（包括桥接已退出或登录完成后），仅在已获授权且没有活动业务调用时重新加载目标 profile。Desktop 运行中使用真实原生插件页面；需要重启时由用户正常退出并重新打开。不对运行中的 Desktop profile 执行 `dsh plugin`，不强制结束应用，不创建后台重启脚本。恢复后核对目标客户端实际暴露的 OpenAgent 工具；进程重开不代表验收通过。不为单独验证登录而调用账号或业务工具，不重放终态未知的 Run；用户后续明确要求可授权新的只读账号查询。未完成的 Installation Check 仍保持未完成，直到用户新发起的检查获得成功引导和账号结果；仅登录成功不能输出固定完成文案。
