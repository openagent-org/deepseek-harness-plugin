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

When upgrading from the former website domain, first verify that the installed `login.mjs` uses `https://openagent.org/mcp/v1/open-agent`, then obtain the user's explicit authorization and run the normal sign-in flow in this section once. The new domain uses a new OAuth issuer/resource; a successful old-domain login does not authorize the new domain. Preserve the existing authentication files. Do not copy old tokens, rewrite their resource, or rename old authentication files into new-domain records. The bridge stores authentication separately for each full endpoint.

Run the sign-in entry point once from the installed package directory. The following example uses the Web profile under the default home directory. For Desktop, replace `web` with `desktop`; for another profile, use its actual name. A custom `DSH_HOME` must exactly match the target Harness. On Windows, use the corresponding user home directory and path syntax.

```bash
node "${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/dsh-openagent/login.mjs"
```

First tell the user, "Connecting to OpenAgent. If an authorization page opens, please authorize access there; I will keep waiting for the same process." Use background execution and waiting tools actually supported by the host, retain the process identifier, wait at most 60 seconds each time, and continue waiting on the same process. Do not apply Hermes `terminal` parameters or rerun the command merely because a tool temporarily returned control.

The OAuth bridge handles opening the browser, the callback, the authorization-code exchange, and refresh. Do not print authentication files, full authorization URLs, or raw logs; do not open an additional authorization URL or read another client's token. The total sign-in wait is bounded. On cancellation, denial, failure, timeout, or an unknown result, preserve the current state and stop without automatic retries.

Only when the same process exits successfully and prints `OPENAGENT_LOGIN_CONNECTED` may you report, "The OpenAgent sign-in connection has been verified." Account or Agent functional verification is still incomplete at this point. Then enable `dsh-openagent` on the plugin page, or normally start the stopped target client. A plugin-page result of `applied`, or an actually enabled state, confirms only that plugin configuration was applied; it does not prove MCP, Skills, or account availability. When the current client can already use the plugin tools and Skills, proceed directly to step 4 without quitting or restarting. Use the reservation flow below only when the native page explicitly returns `restart-required` and the connection cannot be applied now. A process reappearing still does not replace verification.

### When the native page requires reopening: reserve verification before quitting

The installation Agent may reserve verification once only when the native page explicitly returns `restart-required` and this installation conversation has not called `openagent_install_verify`, created a verification conversation, or sent the guide prompt. Run the command in the original installation conversation's Harness shell, using the host-provided `DSH_PROFILE`, `DSH_PROFILE_DIR`, and `DSH_SESSION_ID`. First check that the profile name and directory match step 1. The default Desktop profile is `desktop`, the default Web profile is `web`, and other profiles keep their actual names. If a trusted session identifier is missing, leave verification pending; do not invent an ID or copy one from another conversation.

Bash:

```bash
: "${DSH_PROFILE:?Current profile unavailable}" "${DSH_PROFILE_DIR:?Current profile directory unavailable}" "${DSH_SESSION_ID:?Current session identifier unavailable}"
node "$DSH_PROFILE_DIR/node_modules/dsh-openagent/post-install.mjs" --prepare --profile "$DSH_PROFILE" --locale en
```

PowerShell:

```powershell
if (-not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw 'Current Harness profile or session identifier unavailable' }
node (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/post-install.mjs') --prepare --profile $env:DSH_PROFILE --locale en
```

Report that the reservation was saved only after the command exits successfully and prints `OPENAGENT_ONBOARDING_PREPARED`. A reservation writes one-time state in this profile; it does not quit the application, send a message, or establish successful verification. The installation Agent then ends its turn. After all tasks finish, the user quits normally, reopens the target client, and returns to the original installation conversation within 30 minutes of reservation creation, keeping it visible in exactly one client. Once that conversation is idle and MCP and Skills are available, the plugin automatically creates a new conversation and sends the guide prompt once. The user does not need to send another prompt, and the Agent must not call verify again. Never force-kill processes or invent a background restart script.

Reservations do not extend their deadline or retry automatically. Repeating the command returns the original reservation or existing state, not new permission to send. On `OPENAGENT_ONBOARDING_STATE`, failure, expiry, or an unknown result, preserve the state and report the actual stage; do not switch conversations, delete state, or manually resend. Inspect an already-started verification only once as described in step 4.

The separate initial sign-in keeps interactive authorization outside Harness's approximately 60-second MCP initialization window and short-lived stdio probe stage; normal connections still run the stdio probe. If the bridge has started browser authorization during initialization, wait for that same attempt; do not also run the sign-in entry point. Session checks after connection allow only silent refresh of existing credentials. If renewed consent is required, the bridge reports the failure and stops; follow sign-in recovery only after the user authorizes it. The plugin disables the host's automatic reconnect. Do not automatically replay business calls after a disconnect or an unknown result.

Before sending a new request, the bridge checks the session with an internal protocol `ping`. Only when that check returns HTTP 404 and no sent request is awaiting a result may it establish a new session and send the request for the first time. This does not ask the model to query the account or sign in separately. A disconnect, HTTP 404, or unknown result after a business request was sent still stops the call without automatic replay. After the bridge exits, tool names may remain visible, but creating a conversation does not reconnect it. End active tasks, then quit and reopen Harness normally. If verification was already attempted, return to the original installation conversation and query status only once. If a valid reservation exists, wait for it to continue without starting another attempt. Perform the first verification in step 4 only when it is confirmed that no attempt or reservation exists.

## 4. Verify in a new conversation in the target client

When no reservation or verification attempt exists, the installation Agent calls the bundled `openagent_install_verify({"locale":"en"})` tool once from the original installation conversation. It checks the current tool catalog and all five Skills, then uses native Harness APIs to create a new conversation in the single visible Desktop / Web window, navigate to it, and send the fixed prompt "OpenAgent installed. Open the new user guide." exactly once. It does not modify the original conversation's input draft. When MCP and Skills are available, this happens directly without a restart. A successful reservation from step 3 runs the same verification automatically; do not call verify again.

The tool returns `status="completed"` only after actual verification in the new conversation, with `guide_loaded=true`, `guide_success=true`, `account_success=true`, and `turn_completed=true`. Conversation creation, navigation, or prompt submission alone is not successful installation verification. Each verification waits at most 600 seconds; reserved verification also remains bounded by the original 30-minute deadline. If the original installation conversation times out or receives an unknown result, call the read-only `openagent_install_status({})` once to inspect existing state. It does not create a conversation or resend the prompt. A reservation that has not started is not an existing attempt, so `NO_ATTEMPT` from status does not authorize another send. Do not call verify again, switch conversations to bypass the one-time record, or manually resend the same prompt.

Only when the tool explicitly confirms that nothing was started, no reservation exists, and the client has no visible-conversation capability, such as CLI, leave "Verification in a new conversation remains incomplete" for the user to create a conversation and send the fixed prompt manually. If a reservation or conversation was created, a prompt was sent, or the outcome is unknown, preserve that verification conversation and the error without creating another. Missing installation-verification tools also leave verification pending; do not guess tool names or substitute a background CLI child session.

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

- MCP: `https://openagent.org/mcp/v1/open-agent`, using Streamable HTTP through a stdio OAuth bridge.
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

Keep `DSH_HOME/openagent-auth`; do not clear authentication or sign in again when the same new endpoint is already connected. A migration from the old domain still requires explicit authorization and one new-domain sign-in under step 3. If removal or reinstallation fails, is cancelled, or has an unknown result, stop without automatically replaying the entire update process. Switching sources remains limited to the failed download stages allowed in step 2. After installation succeeds, check the actual installed source and version, then enable the plugin or normally start the stopped target client. If it is already available, do not restart it again; verify in a new conversation as described in step 4. Package installation success alone does not establish that update verification passed.

### Uninstall

Finish any tasks using OpenAgent and stop the target profile. For Desktop, quit the application normally; do not uninstall from the Desktop conversation that will be closed or force-kill its processes. Run this one-line entry in a separate external Bash terminal. It requires curl and Python 3.9+:

```bash
bash -o pipefail -c 'curl -fsSL --proto "=https" --proto-redir "=https" https://raw.githubusercontent.com/openagent-org/deepseek-harness-plugin/rel/uninstall.py | python3 - --yes'
```

The script accepts only `rel` dependency sources for `openagent-org/deepseek-harness-plugin` on GitHub or Gitee and removes `dsh-openagent` through Harness's native package manager. It does not directly delete profiles, other plugins, or configuration; unofficial packages with the same name or residues with unverified ownership cause it to stop. Replace the final `--yes` with `--dry-run` for a read-only preview; add other arguments after `python3 -` as well:

| Argument | Purpose |
| --- | --- |
| `--yes` | Uninstall the verified target without an interactive confirmation. |
| `--dry-run` | Inspect and display the plan without uninstalling. |
| `--profile <name>` | Select the original installation profile. If omitted, select only a single verified official installation; multiple installations require an explicit profile. |
| `--dsh-home <path>` | Select a custom Harness home matching the original installation. If omitted, use a non-empty `DSH_HOME`, otherwise `~/.dsh`. |
| `--desktop-app <path>` | Specify the macOS `.app` directory or Windows application installation root to locate Desktop's bundled dsh. |

For macOS Desktop, automatic discovery checks `/Applications/DeepSeek Harness.app` and `~/Applications/DeepSeek Harness.app`. For Windows Desktop, it uses an existing dsh entry on PATH that points to the application's bundled CLI. Use `--desktop-app` if discovery cannot identify exactly one installation; do not substitute an npm-installed dsh. The script does not support Linux Desktop; use the native plugin page instead. Web and CLI use the existing dsh on PATH.

Before uninstalling, the script checks that the target profile is stopped. It stops on a running target Harness, a Harness process whose profile cannot be determined, an unverifiable process state, or a package-management lock, without terminating processes or clearing locks. `--dry-run` reports these prerequisites read-only without invoking native uninstallation. Stop on a failed download, check, or native command, cancellation, or unknown result. Keep the error; do not automatically switch sources, repeat execution, or delete files manually as a fallback.

Alternatively, remove `dsh-openagent` from the target profile's plugin page, or use the native command in an external terminal while the target profile is not running:

```bash
dsh plugin --profile <profile> remove dsh-openagent
```

Keep the original `DSH_HOME` for the manual command. For Desktop, continue to use its bundled dsh and fully quit the application first. Confirm that the native bundle and tools have been removed from the target profile; the packaged Skills are disabled with the plugin. Keep the shared, dedicated authentication directory `DSH_HOME/openagent-auth` to avoid disrupting other profiles with this plugin installed. Local uninstallation does not revoke server-side authorization. To sign out completely, first confirm that all profiles using this directory have stopped, then obtain the user's explicit authorization to handle this dedicated authentication directory and the server-side authorization. Never delete the entire `DSH_HOME` or another client's credentials.
