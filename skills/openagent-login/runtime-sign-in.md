# OpenAgent runtime sign-in

## When to use

Use this only after the current OpenAgent connection explicitly reports missing or expired authentication, such as `MCP_AUTH_REQUIRED` or `MCP_TOKEN_INVALID`, or the user explicitly requests sign-in. Missing tools, an HTTP status alone, business errors, network failure, or an unknown execution result are not proof that login is needed. Do not test authentication before normal calls.

DeepSeek Harness uses this plugin's dedicated `mcp-remote` OAuth bridge. Credentials stay in the selected `DSH_HOME` under `openagent-auth`; the bridge owns token storage and refresh. Never read, print, copy, or edit that storage, and never use credentials from another client.

## One authorization attempt

1. If the bridge has already opened or is waiting for a browser authorization, keep waiting for that same process. Do not start a second login, reopen the OAuth URL, restart the profile, or repeat the business call. Automatic bridge refresh or consent remains part of that connection's attempt.
2. Only after the previous attempt is confirmed ended and the user authorizes recovery, locate `login.mjs` at the installed `dsh-openagent` package root using the loaded Skill's trusted resource base. Preserve the current `DSH_HOME` and profile. Run `node <installed-package>/login.mjs` once with the host's actual local terminal and continuation mechanism; do not copy another host's tool arguments.
3. Immediately before launch say “需要登录 OpenAgent 才能继续。正在打开登录页面…” in Chinese or “Please sign in to OpenAgent to continue. Opening the sign-in page…” in English. The bridge owns opening the page. A printed URL does not prove that the page opened; never compensate with a separate browser navigation.
4. Wait on the same process. The login helper has a bounded timeout and suppresses raw authentication output. `OPENAGENT_LOGIN_CONNECTED` plus successful process completion confirms this connection; it does not prove an account query, tool roster, or business result. Say “已登录 OpenAgent” or “Signed in to OpenAgent” only after that result.
5. A denial, cancellation, failure, or confirmed timeout ends the attempt. Preserve the state and report the failed stage without automatically relaunching, removing authentication files, changing endpoints, or resetting the profile. If the attempt's state is unknown, stop and report that uncertainty. A yielded terminal is not a timeout.

After login, reload the affected profile only when authorized and no business invocation is active. Verify the actual exposed OpenAgent tool names. Do not invoke an account or business tool solely to verify login, and never replay a Run whose terminal state is unknown. A later explicit user request can authorize a new read-only account query.
