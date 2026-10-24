# Install OpenAgent: DeepSeek Harness

The installation Agent must execute these steps in the current ordinary conversation and complete one verification in a new conversation. Do not merely hand the user commands. The user handles required approvals and browser authorization without supplying passwords or Tokens.

This guide was checked against Harness `0.2.1-rc.2` and supports local Desktop, Web, and CLI on `>=0.2.1-rc.2 <0.3.0`. The displayed plugin name is **OpenAgent**; its internal package name is `dsh-openagent`. Online installation relies on the host's profile hot loading. A successful installation command does not prove OAuth, tool availability, or new-conversation verification.

## 1. Check the current host and execution tools

Use the ordinary conversation's actual `bash` or `pwsh` and `job_output` tools. Check that the shell schema supports `description`, `command`, `run_in_background: true`, `sandbox_permissions: "danger-full-access"`, and `justification`. Installation and preparation write to the current Harness profile: request the required access on the first call for each operation without changing global permissions. Stop if tools or arguments are unavailable or approval is denied or cancelled; do not retry through another entry point.

Through the shell, check only the host-injected `DSH_HOME`, `DSH_PROFILE`, `DSH_PROFILE_DIR`, and `DSH_SESSION_ID`, preserving their values. Confirm that the profile directory belongs to that home, current client, and original installation conversation. Stop if values are missing or inconsistent; do not guess another profile or read credentials or conversation contents.

Verify Git, Node, and dsh versions and their installation sources. Node must be `22.19+` in the 22 series or `24+`; the absolute Node path returned by `load_workspace_dependencies` may be used. For Desktop, locate `resources/runtime/cli/bin/dsh` inside the **currently running application**, or `dsh.cmd` on Windows; on macOS it is under `Contents/Resources/runtime/cli/bin/dsh`. Do not guess a fixed application name or install npm dsh separately. For non-Desktop hosts, use dsh from the same installation as the current Host. Check `--version` through its absolute path, then replace and correctly quote the placeholder paths below.

Read only the relevant dependency source, `dsh.profile.bundles`, disablement records, and installed package name and version from the current profile and package; do not print entire configuration files. Accept only the official GitHub/Gitee repositories below at `rel`, including equivalent package-manager representations. Preserve an existing trusted installation without adding it again. Stop for an existing disablement, an older package lacking this guide's status command, an unknown same-name source, abnormal files, or unconfirmed local changes; use the maintenance procedure without silently enabling or overwriting it.

## 2. Install once with the current host's CLI

Run this only when the plugin is not installed. First tell the user: “Installing and connecting OpenAgent. If an authorization page opens, please complete authorization there.”

For macOS / Linux, call `bash`:

```json
{
  "description": "Install OpenAgent in the current Harness profile",
  "command": ": \"${DSH_HOME:?Missing current Harness home}\" \"${DSH_PROFILE:?Missing current profile}\" \"${DSH_PROFILE_DIR:?Missing current profile directory}\" \"${DSH_SESSION_ID:?Missing current conversation ID}\"; \"<absolute dsh path>\" plugin --profile \"$DSH_PROFILE\" add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "This installation downloads the official plugin and writes to the current Harness profile so the host can load OpenAgent."
}
```

For Windows, call `pwsh`:

```json
{
  "description": "Install OpenAgent in the current Harness profile",
  "command": "if (-not $env:DSH_HOME -or -not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw 'Missing current Harness profile or conversation ID' }; & '<absolute dsh.cmd path>' plugin --profile $env:DSH_PROFILE add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "This installation downloads the official plugin and writes to the current Harness profile so the host can load OpenAgent."
}
```

Wait for the same installation task using its actual `jobId`, for at most 60 seconds per call:

```json
{"job_id":"<jobId from the preceding call>","wait":true,"timeout_ms":60000}
```

Keep waiting on that task while it is running; do not reinstall. Only a confirmed Git download failure caused by DNS, connection, timeout, interrupted transport, or HTTP 5xx allows one further download from `git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel` after the original process has ended. Do not switch sources for approval denial, certificate errors, 401/403/404/429/451, validation, builds, compatibility, loading, or OAuth issues. Do not grant build-script permissions or add version exemptions. Preserve the state and stop on other failures, cancellation, or unknown outcomes without replaying commands.

The CLI adds the new bundle to the enabled list, and the host first attempts online loading. Whenever the bundle loads, the plugin runs its bundled sign-in connection check once without automatic retries. Existing valid authorization is reused without reopening the authorization page. MCP mounts only after that same process outputs `OPENAGENT_LOGIN_CONNECTED` and exits with code 0. First authorization has a 330-second total limit, including 300 seconds for browser authorization, preventing native MCP initialization and probing from cutting authorization short. **Do not run `runtime/login.mjs` separately in the shell, reopen the authorization URL, or start a concurrent sign-in.** That entry reuses valid sign-in for the same endpoint. Authorize only `https://openagent.org/mcp/v1/open-agent`; do not copy, rewrite, or reuse authentication records from a different endpoint.

After the installation process exits with code 0, reread the installed package name, version, official source, and enabled list, and confirm that no disablement record applies. Then continue to step 3. Report only that installation files are ready; do not infer a working connection from the exit code. Preserve other plugins, models, conversations, and configuration. Do not delete the profile or use `--from-default-profile`.

## 3. Prepare once and end the current turn

First query status once in the original installation conversation through a read-only entry point in step 4. Run the first `--prepare` only if this installation has never called `--prepare` or `openagent_install_verify`, has no known verification conversation, and the query returns `NO_ATTEMPT` with `connection_status` equal to `not_started`, `connecting`, or `ready`. Preserve any existing preparation or attempt. Stop if `NO_ATTEMPT` follows a previous attempt, or the connection is `failed` / `unconfirmed`, missing, or invalid; do not prepare, extend expiry, or resend. Use the Node path and host variables checked in step 1. Request `sandbox_permissions: "danger-full-access"` on the native shell call with a `justification` explaining “Save one new-conversation verification request for the original installation conversation.” Wait for the short command to exit without closing the application.

Bash:

```bash
: "${DSH_HOME:?Missing current Harness home}" "${DSH_PROFILE:?Missing current profile}" "${DSH_PROFILE_DIR:?Missing current profile directory}" "${DSH_SESSION_ID:?Missing current conversation ID}"
"<absolute Node path>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/post-install.mjs" --prepare --profile "$DSH_PROFILE" --locale en
```

PowerShell:

```powershell
if (-not $env:DSH_HOME -or -not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw 'Missing current Harness profile or conversation ID' }
& '<absolute Node path>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/post-install.mjs') --prepare --profile $env:DSH_PROFILE --locale en
```

If the command succeeds and returns `OPENAGENT_ONBOARDING_PREPARED` with `status="pending"`, report only: “Installation files are ready and automatic verification is prepared. Complete the authorization page if one opened, and keep this installation conversation in the only visible window. The plugin will open a new conversation when ready.” **Immediately end the current turn. Do not wait for completed in this turn or call `openagent_install_verify`.** The original conversation must become idle before the plugin can claim the preparation.

The preparation expires after 30 minutes. The verification service registers before waiting for sign-in; it keeps the preparation pending and unclaimed while sign-in or MCP is not ready. Once MCP and the five business Skills are available and the original conversation is idle and uniquely visible, the plugin creates and displays a new conversation and sends “OpenAgent installed. Open the new user guide.” once, preserving the original draft. Do not create another conversation, manually resend the fixed prompt, or ask the user to send it again. Preserve any returned existing state or failure; successful preparation is not successful verification.

## 4. Read the result; reopen normally with the same preparation if needed

Before the first preparation, if the new conversation does not appear automatically, or when the result needs checking, query one read-only entry point once in the **original installation conversation**. Use `openagent_install_status` with `{}` if exposed; otherwise run `--status` below. Preserve the original profile, conversation, and Node path, and follow the shell's actual permission requirements. Do not inspect state files or credentials instead of querying.

Bash:

```bash
"<absolute Node path>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/post-install.mjs" --status --profile "$DSH_PROFILE"
```

PowerShell:

```powershell
& '<absolute Node path>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/post-install.mjs') --status --profile $env:DSH_PROFILE
```

Status queries returning `pending` or `NO_ATTEMPT` also include `connection_status`: `not_started` means this version has no Host connection attempt; `connecting` means the same sign-in or MCP initialization is still in progress; `ready` means that same sign-in process succeeded and MCP initialization succeeded, not that business verification passed. Stop for `failed` or `unconfirmed` without reopening to retry OAuth. Treat a missing or invalid field as unknown. A cold start may require completing browser authorization before the host becomes ready.

Handle the receipt following `OPENAGENT_ONBOARDING_STATE`, or the tool's returned state, as follows:

| State | Action |
| --- | --- |
| `pending`, unclaimed and unexpired, with `connection_status=not_started` or `ready` | Preserve the same preparation and end the query turn. Prefer online loading. If the conversation still does not appear and reopening is necessary, finish other tasks, quit and reopen Harness normally, and return to the same installation conversation within the original 30-minute expiry. Keep it uniquely visible and idle for automatic continuation. No reinstall, new preparation, or prompt is needed. |
| `pending` with `connection_status=connecting` | End the query turn and wait for the same connection attempt. Do not reopen, sign in separately, or resend the prompt. |
| `completed` with all four evidence fields strictly `true` | Report “OpenAgent installation and account verification passed. Continue in the new conversation.” |
| `NO_ATTEMPT` during the first precheck | Create the first preparation only when every condition in step 3 holds. Stop if there was a previous attempt. |
| Claimed, `unconfirmed`, `failed`, expired, or a `failed` / `unconfirmed`, missing, or invalid connection state | Report “OpenAgent installation verification is incomplete,” the actual stage, and public error. Preserve state without reopening to retry, resending, extending expiry, or changing conversations to bypass the record. |

The four evidence fields are `guide_loaded`, `guide_success`, `account_success`, and `turn_completed`, all strictly `true`: the new conversation loads the guide Skill, the guide returns `view=onboarding/status=ready`, one account call returns strict `success=true`, and that turn completes normally. Verification lasts at most 600 seconds and never beyond the preparation's remaining lifetime. A tool catalog, successful OAuth, a reopened process, or model prose cannot replace that evidence.

The official Desktop maintenance instructions recommend quitting before maintenance. This guide's online path applies only to first installation of this plugin and is verified through actual loading and the result above; it does not assume that every plugin can hot-load. Do not terminate processes forcibly, write background restart scripts, call private Host RPCs, or rerun OAuth to troubleshoot verification. If CLI has no visible new-conversation capability, leave verification pending rather than using a background child conversation to impersonate Desktop / Web verification. The process uses the current model and incurs normal model calls, but does not submit a paid Agent task. Do not claim an animation played when it was not displayed.

## Updates and removal

First-time online installation does not authorize online updates, removal, or connection recovery. Finish tasks using OpenAgent, check the official source, version, and local changes, and back up anything that must be retained. Stop when the source or state is uncertain; adding the same package again is not an update procedure.

If the current conversation actually exposes `plugin_manager`, host approval and the verified `removable` state may be used for `{"action":"remove_bundle","target":"dsh-openagent"}`, followed by rereading package and runtime state. Follow an actual `stop-profile` or `restart-required` receipt with a normal exit or reopen and state check; do not remove again. This is an optional maintenance entry point, not an installation prerequisite.

Perform other maintenance from a separate external terminal after confirming that the target profile is stopped. Preserve its original `DSH_HOME` and profile, using the application's built-in dsh for Desktop. Run `"<absolute dsh path>" plugin --profile "<original profile>" remove dsh-openagent`; only reinstall for an authorized update after removal is confirmed. Do not run exit or uninstall scripts from the conversation that will be closed, and do not clear package-manager locks. Do not repeat authorization when valid sign-in already exists. Stop on failure, cancellation, or an unknown outcome.

The one-line uninstaller is in the [README](https://github.com/openagent-org/deepseek-harness-plugin/blob/rel/README.md#%E5%8D%B8%E8%BD%BD). It requires curl and Python 3.9+ and runs only from an external Bash terminal after the profile is stopped. Append arguments after `python3 -`:

| Argument | Purpose |
| --- | --- |
| `--yes` / `--dry-run` | Execute the verified removal / read-only preview. |
| `--profile <name>` | Select the original profile; required if multiple official installations exist. |
| `--dsh-home <path>` | Select the original Harness home; defaults to nonempty `DSH_HOME` or otherwise `~/.dsh`. |
| `--desktop-app <path>` | Select a macOS `.app` or Windows installation root to locate built-in dsh. |

The script stops when runtime state cannot be verified or a package-manager lock exists. It does not terminate processes or clear locks. It checks standard application directories on macOS and registered built-in dsh on Windows; use `--desktop-app` if the location is ambiguous. For Linux Desktop, use the native plugin page; the uninstaller does not support that case. Preserve other plugins, configuration, and shared `DSH_HOME/openagent-auth`. Local removal does not revoke server-side authorization; never delete the entire home or another client's credentials.
