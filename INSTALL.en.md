# Install OpenAgent in DeepSeek Harness

Give this guide to DeepSeek Harness and say, "Please follow this guide to install OpenAgent." Install into the Harness home directory and profile currently in use. The user signs in only on the authorization page and does not need to give the Agent a password or token.

This guide has been checked against DeepSeek Harness `0.2.1-rc.2` and supports local Desktop, Web, and CLI environments. Harness is still in developer preview; this plugin declares compatibility with `>=0.2.1-rc.2 <0.3.0`. Do not use Hermes installers, configuration formats, or commands with Harness.

## 1. Check the environment

Confirm the actual client, Harness version, current `DSH_HOME`, and profile. When `DSH_HOME` is unset, it is normally `~/.dsh`. Desktop uses `desktop`, Web defaults to `web`, and CLI uses the profile selected at startup. Do not read credential files or install a Desktop plugin into the `web` profile.

Git and Node.js `22.19+` in the 22 series, or `24+`, are required. Desktop can obtain the absolute path to its bundled Node executable through the native `load_workspace_dependencies` tool. In subsequent commands, `node` means the executable whose identity has been checked. CLI installation also requires the current Harness's `dsh` command and pnpm; Desktop's bundled `dsh` uses its bundled pnpm.

If Desktop has not registered the `dsh` command, prefer the native plugin page described below. If CLI access is needed, install the command through the application's "Manage dsh command…" menu, then open a new terminal and check `dsh --version`. Do not use a separately npm-installed dsh to modify the Desktop profile.

Choose the installation method first. While Desktop is running, install or enable the plugin only through its actual native plugin page. If the current conversation cannot operate that page, have the user perform the action there; do not fall back to running `dsh plugin` from that conversation's terminal. External CLI installation requires the target profile to be safely stopped. Never modify a Desktop profile through CLI while Desktop is running.

## 2. Install the native plugin package

Use GitHub for the first download:

```text
git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel
```

Only after the Git repository download fails because of DNS, connection, timeout, interrupted transfer, or HTTP 5xx errors, and the original operation has ended, may you retry the download once from the following repository with the same name:

```text
git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel
```

Do not switch sources for permission or approval denial, certificate errors, HTTP 401/403/404/429/451, content validation failures, dependency installation failures, enablement failures, or OAuth failures. Switching Git repositories cannot fix an npm dependency download failure. Preserve the original error, do not install repeatedly in a loop, and do not forcibly overwrite an existing package of unknown origin with the same name.

**Desktop / Web plugin page:** Open "Plugins" in the left sidebar, choose "Add plugin," and enter the Git address above. Confirm that the package name is `dsh-openagent`. Wait for the installation task to finish. Keep the plugin disabled until sign-in in step 3 is complete, then click "Enable now." If it is already enabled and authorization has started, wait for the existing bridge process; do not start a separate sign-in command concurrently.

**CLI:** Run the following in an external local terminal, replacing `<profile>` with the name confirmed in step 1:

```bash
dsh plugin --profile <profile> add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'
```

When using CLI for Desktop, first launch Desktop at least once to initialize its profile, confirm no task is active, quit normally, and verify from an independent external terminal that the application has fully exited. Use only that Desktop's bundled dsh to operate on `--profile desktop`, and reopen the application after completing step 3. Do not start an installation or restart flow from the Desktop conversation that will close. Never force-kill processes or write a background restart script to continue the current conversation. If safe exit cannot be confirmed, stop with the action pending. For Web / CLI, also install only after the target profile has stopped, and complete sign-in before restarting it.

The native package manager maintains dependencies and the bundle list. Preserve other plugins, models, sessions, and user patches. Do not use `--from-default-profile`, delete a profile, manually edit global YAML, or disable approvals to complete installation. If a package with the same name is already installed, first check its source and local modifications; only manage an installation confirmed to belong to one of the official repositories above.

## 3. Sign in once, then enable the connection

Harness's current built-in MCP client has no native OAuth configuration. This plugin connects to OpenAgent through the pinned version `mcp-remote@0.1.38` and stores its authentication state separately under the current `DSH_HOME/openagent-auth`. It does not reuse sign-in from Hermes, Codex, or any other client.

Run the sign-in entry point once from the installed package directory. The following example uses the Web profile under the default home directory. For Desktop, replace `web` with `desktop`; for another profile, use its actual name. A custom `DSH_HOME` must exactly match the target Harness. On Windows, use the corresponding user home directory and path syntax.

```bash
node "${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/dsh-openagent/login.mjs"
```

First tell the user, "Connecting to OpenAgent. If an authorization page opens, please authorize access there; I will keep waiting for the same process." Use background execution and waiting tools actually supported by the host, retain the process identifier, wait at most 60 seconds each time, and continue waiting on the same process. Do not apply Hermes `terminal` parameters or rerun the command merely because a tool temporarily returned control.

The OAuth bridge handles opening the browser, the callback, the authorization-code exchange, and refresh. Do not print authentication files, full authorization URLs, or raw logs; do not open an additional authorization URL or read another client's token. The total sign-in wait is bounded. On cancellation, denial, failure, timeout, or an unknown result, preserve the current state and stop without automatic retries.

Only when the same process exits successfully and prints `OPENAGENT_LOGIN_CONNECTED` may you report, "The OpenAgent sign-in connection has been verified." Account or Agent functional verification is still incomplete at this point. Then enable `dsh-openagent` on the plugin page, or normally start the stopped target client. A plugin-page result of `applied`, or an actually enabled state, confirms only that plugin configuration was applied; it does not prove MCP, Skills, or account availability. `restart-required` means only that the change was saved. The user must still quit normally when no task is active and reopen the target client. A process reappearing does not replace verification in step 4.

The separate initial sign-in avoids Harness's approximately 60-second MCP initialization limit and its stdio probe process. The bridge manages refresh during normal operation. If credentials become invalid, it may still open the browser to renew authorization. In that case, wait for the existing attempt; do not also run the sign-in entry point. The plugin disables the host's automatic reconnect. Do not automatically replay business calls after a disconnect or an unknown result.

## 4. Verify in a new conversation in the target client

The installation Agent creates one new conversation visible to the user in the current target client and sends, "OpenAgent installed. Open the new user guide." Use conversation creation and message sending capabilities actually provided by the current host; do not guess tool names. If the host lacks these capabilities, report only completed stages supported by evidence and state, "Verification in a new conversation remains incomplete." Ask the user to create a conversation in the target client and send that sentence. Do not pretend that automatic navigation succeeded.

Confirm that the new conversation can discover these five Skills and load them through the native `skill` tool:

- `openagent-first-task-router`
- `openagent-guide-agent`
- `openagent-search-agent`
- `openagent-run-agent`
- `openagent-query-account`

Confirm that the new conversation's connection actually exposes OpenAgent tools with the `mcp__openagent__` prefix and can load the guide Skill through the native `skill` tool. Files on disk or an old conversation's tool list are not substitutes.

Verification must inspect actual guide and `openagent_account_credits` results in the new conversation. The guide call must complete successfully with `view=onboarding` and `status=ready`; then one account query must complete successfully with strictly `success=true`, and that turn must end normally. Only then report, "OpenAgent installation and account verification passed." A tool list, successful OAuth, the existence of a configuration file, or a model saying "installation succeeded" is not a substitute. If the animation cannot be displayed, do not claim it played; this differs from a failed guide tool call. A CLI child session cannot replace a visible new Desktop / Web conversation.

If tools are missing, a guide or account call fails, a result is incomplete, or the outcome is unknown, report "OpenAgent installation verification is incomplete", the failed stage, and public error details. Do not emit the fixed success message. Do not resend the prompt or repeat the account query or OAuth. Missing tools or network errors alone do not establish that sign-in is required. Never read tokens, call MCP through curl or a custom client, modify the profile, or invent a restart flow to bypass verification. Recovery must address the confirmed failed stage with renewed user authorization.

Guidance and the account query do not submit a paid Agent task, but using the model makes a normal model call. Searching for or selecting an Agent does not authorize execution. Actual tasks continue to follow the installed Skills' rules for authorization, uploads, waiting, and result verification.

## Configuration and capability scope

- MCP: `https://oasn-ow.haimawan.com/mcp/v1/open-agent`, using Streamable HTTP through a stdio OAuth bridge.
- Request headers: `X-OASN-MCP-OAuth: required` and `X-OASN-MCP-Content-Mode: text-compatible`. Do not write a Bearer token into the profile.
- Tool wait: 1800 seconds. Do not automatically rerun a call whose terminal state is unknown.
- Skills, the result delivery reference, sign-in instructions, and the COS upload SDK are installed with the package. Do not copy them to the user's global Skill directory.
- Verify the upload SDK archive and its extracted contents against the sizes and SHA-256 digests in the bundled lock file. First use creates a cache in the execution Skill's `scripts/.cos-sdk` directory, which must be writable by the current user. Stop immediately on a validation failure; do not install another SDK or fall back to a different upload path.
- When Desktop's native sidebar browser module is available and the current conversation has exactly one visible client, the bundled `openagent_browser_open` / `openagent_browser_status` / `openagent_browser_close` tools can open, verify, and close the current selection page. A successful receipt confirms only that the sidebar committed the page, not that its content loaded or a user selected an Agent. Do not reopen after a timeout or an unconfirmed outcome.
- Web does not enable the sidebar browser module by default, and CLI has no visible page. When page capabilities are unavailable, retain the original links returned by the server without claiming automatic opening. Do not promise native MCP Apps cards or rendering for every media type. The new-user animation does not use the search-selection browser flow.

## Update and removal

This Git-installed package has no available native "Update" button, and adding the same Git address again is not evidence of a successful update. To update, first end related tasks, check the source, version, and local modifications, and back up any changes that must be preserved. Disable the plugin in the target profile and stop that profile. For Desktop, fully quit the application and use that Desktop's bundled dsh in an external local terminal. For other clients, also use the dsh, `DSH_HOME`, and profile confirmed in step 1.

First remove the old package through the native command, replacing `<profile>` with the original installation's profile:

```bash
dsh plugin --profile <profile> remove dsh-openagent
```

Only after removal succeeds, reinstall under the same home directory and the same profile while keeping that profile stopped:

```bash
dsh plugin --profile <profile> add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'
```

Keep `DSH_HOME/openagent-auth`; do not clear authentication or sign in again when the connection has already succeeded. If removal or reinstallation fails, is cancelled, or has an unknown result, stop without automatically replaying the entire update process. Switching sources remains limited to the failed download stages allowed in step 2. After installation succeeds, check the actual installed source and version, then enable or restart the target client and verify in a new conversation as described in step 4. Package installation success alone does not establish that update verification passed.

To uninstall, remove `dsh-openagent` from the plugin page, or run the following while the target profile is not running:

```bash
dsh plugin --profile <profile> remove dsh-openagent
```

For Desktop, continue to use its bundled dsh and fully quit the application first. Confirm that the native bundle and tools have been removed from the target profile; the packaged Skills are disabled with the plugin. Keep the shared, dedicated authentication directory `DSH_HOME/openagent-auth` to avoid disrupting other profiles with this plugin installed. Local uninstallation does not revoke server-side authorization. To sign out completely, first confirm that all profiles using this directory have stopped, then obtain the user's explicit authorization to handle this dedicated authentication directory and the server-side authorization. Never delete the entire `DSH_HOME` or another client's credentials.
