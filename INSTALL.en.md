# Install OpenAgent: DeepSeek Harness

The installation Agent must execute these steps in the current ordinary conversation and complete one verification in a new conversation. Do not merely hand the user commands. The user handles required approvals and browser authorization without supplying passwords or Tokens.

This guide was checked against Harness `0.2.1-rc.2` and supports local Desktop, Web, and CLI on `>=0.2.1-rc.2 <0.3.0`. The displayed plugin name is **OpenAgent**; its internal package name is `dsh-openagent`. Online installation relies on the host's profile hot loading. A successful installation command does not prove OAuth, tool availability, or new-conversation verification.

Use these fixed user-visible progress messages. The host displays command details; do not append internal state or raw logs:

- When starting installation: “Installing OpenAgent…”
- Only when the same connection attempt confirms that the authorization page opened automatically and is waiting for the user: “Please sign in to OpenAgent on the page that opened…”
- Only after the same sign-in process emits its success marker and exits with code 0: “Signed in to OpenAgent”
- While waiting for native verification in the original installation turn: “Connecting OpenAgent. The new user guide will open automatically when the connection is ready…”
- When installation or connection fails: “Installation failed: {reason}. {solution}”. Replace the placeholders with the confirmed short reason and a currently actionable next step; do not guess the failed stage.
- On a confirmed authorization timeout: “Sign-in timed out. OpenAgent installation is incomplete. Check the failure card for the stage and reason.”

Keep the current turn running while native verification is pending, and use the final reply in step 4 after verified completion.

## 1. Check the current host and execution tools

Use the ordinary conversation's actual `bash` or `pwsh` and `job_output` tools. Check that the shell schema supports `description`, `command`, `run_in_background: true`, `sandbox_permissions: "danger-full-access"`, and `justification`. Installation and verification records write to the current Harness profile: request the required access on the first call for each operation without changing global permissions. Stop if tools or arguments are unavailable or approval is denied or cancelled; do not retry through another entry point.

Through the shell, check only the host-injected `DSH_HOME`, `DSH_PROFILE`, `DSH_PROFILE_DIR`, and `DSH_SESSION_ID`, preserving their values. Confirm that the profile directory belongs to that home, current client, and original installation conversation. Stop if values are missing or inconsistent; do not guess another profile or read credentials or conversation contents.

Verify Git, Node, and dsh versions and their installation sources. Node must be `22.19+` in the 22 series or `24+`; check the absolute path to Node available in the current host. For Desktop, locate `resources/runtime/cli/bin/dsh` inside the **currently running application**, or `dsh.cmd` on Windows; on macOS it is under `Contents/Resources/runtime/cli/bin/dsh`. Do not guess a fixed application name or install npm dsh separately. For non-Desktop hosts, use dsh from the same installation as the current Host. Check `--version` through its absolute path, then replace and correctly quote the placeholder paths below.

Read only the relevant dependency source, `dsh.profile.bundles`, disablement records, and installed package name and version from the current profile and package; do not print entire configuration files. Accept only the official GitHub/Gitee repositories below at `rel`, including equivalent package-manager representations. Preserve an existing trusted installation at version `0.1.15` or later without adding it again. Earlier versions lack this flow's built-in preparation check; report that the version is unsupported by this flow and stop. Stop for an existing disablement, an unknown same-name source, abnormal files, or unconfirmed local changes; do not silently enable or overwrite it.

## 2. Install once with the current host's CLI

Prefer Gitee for the initial download; use GitHub once as a fallback only for the network download failures defined below. Run this only when the plugin is not installed, using the fixed starting message above.

For macOS / Linux, call `bash`:

```json
{
  "description": "Install OpenAgent in the current Harness profile",
  "command": ": \"${DSH_HOME:?Missing current Harness home}\" \"${DSH_PROFILE:?Missing current profile}\" \"${DSH_PROFILE_DIR:?Missing current profile directory}\" \"${DSH_SESSION_ID:?Missing current conversation ID}\"; \"<absolute dsh path>\" plugin --profile \"$DSH_PROFILE\" add 'git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel'",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "This installation downloads the official plugin and writes to the current Harness profile so the host can load OpenAgent."
}
```

For Windows, call `pwsh`:

```json
{
  "description": "Install OpenAgent in the current Harness profile",
  "command": "if (-not $env:DSH_HOME -or -not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw 'Missing current Harness profile or conversation ID' }; & '<absolute dsh.cmd path>' plugin --profile $env:DSH_PROFILE add 'git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel'",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "This installation downloads the official plugin and writes to the current Harness profile so the host can load OpenAgent."
}
```

Wait for the same installation task using its actual `jobId`, for at most 60 seconds per call:

```json
{"job_id":"<jobId from the preceding call>","wait":true,"timeout_ms":60000}
```

Keep waiting on that task while it is running; do not reinstall. Only a confirmed Git download failure caused by DNS, connection, timeout, interrupted transport, or HTTP 5xx allows one further download from `git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel` after the original process has ended. Do not switch sources for approval denial, certificate errors, 401/403/404/429/451, validation, builds, compatibility, loading, or OAuth issues. Do not grant build-script permissions or add version exemptions. Preserve the state and stop on other failures, cancellation, or unknown outcomes without replaying commands.

The CLI adds the new bundle to the enabled list, and the host first attempts online loading. Whenever the bundle loads, the plugin runs its bundled sign-in connection check once without automatic retries. Existing valid authorization is reused without reopening the authorization page. MCP mounts only after that same process outputs `OPENAGENT_LOGIN_CONNECTED` and exits with code 0. First authorization has a 330-second total limit, including 300 seconds for browser authorization, preventing native MCP initialization and probing from cutting authorization short. **Do not run `runtime/login.mjs` separately in the shell, reopen the authorization URL, or start a concurrent sign-in.** That entry reuses valid sign-in for the same endpoint. Authorize only `https://openagent.org/mcp/v1/open-agent`; do not copy, rewrite, or reuse authentication records from a different endpoint.

After the installation process exits with code 0, reread the installed package name, version, official source, and enabled list, and confirm that no disablement record applies. Then continue to step 3. That result proves only that installation files are ready. Do not add a completion message or infer a working connection from the exit code. Preserve other plugins, models, conversations, and configuration. Do not delete the profile or use `--from-default-profile`.

## 3. Wait for verification in the original installation turn

After checking the installed files, confirm that `openagent_install_verify` is in the current native tool catalog, say “Connecting OpenAgent. The new user guide will open automatically when the connection is ready…”, and call it directly once:

```json
{"locale":"en"}
```

The tool checks the original conversation's existing preparation or verification record itself; a separate status precheck is unnecessary. It returns existing state when present. On the first call, it saves one persistent record and waits for the same connection to become ready. **Keep the original installation turn running until that same tool call returns; do not give a final reply early.** Connection waiting, creating the new conversation, sending the guide, and all four verification results share a maximum of 600 seconds. Preserve the record and stop on failure, cancellation, timeout, or an unknown outcome without signing in again, preparing another request, or resending. Use step 4 when diagnostics are needed.

If hot loading has not exposed the tool yet, check the refreshed catalog in a subsequent native tool step. If the host cannot keep waiting, report that completion is still pending. Do not reinstall or switch to a CLI preparation that ends the original turn.

Once the connection is ready, MCP and all five business Skills are available, and the original conversation is uniquely visible, the plugin opens a new conversation in the same workspace and sends “OpenAgent installed. Open the new user guide.” once, preserving the original draft. An originally ungrouped task uses its working directory. Handle the returned result according to step 4.

## 4. Read diagnostics and the completion result

If the original call has returned and its result needs checking, or an existing preparation has not opened a new conversation, query read-only status in the **original installation conversation**. Use `openagent_install_status` with `{}` if exposed; otherwise run `--status` below. Preserve the original profile, conversation, and Node path and follow the shell's actual permission requirements. While native verification is pending, keep waiting for that same call.

Bash:

```bash
"<absolute Node path>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/post-install.mjs" --status --profile "$DSH_PROFILE"
```

PowerShell:

```powershell
& '<absolute Node path>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/post-install.mjs') --status --profile $env:DSH_PROFILE
```

The query returns safe diagnostics in `connection`: `status` identifies the connection state, while `stage/code/http_status` describe the stage, public reason, and HTTP status when supported by a trusted record. Report only confirmed information from the receipt, without credentials, authorization URLs, raw logs, or business content.

Handle the tool receipt as follows:

| State | Action |
| --- | --- |
| `completed` with all four evidence fields strictly `true` | Reread the installed version and report completion using the rules below. |
| Existing `pending`, unclaimed and unexpired, with a `not_started/connecting/ready` connection | Preserve the original preparation and expiry without starting another verification request. The plugin continues once the original conversation is idle and uniquely visible and the connection is ready. |
| `NO_ATTEMPT` | Continue to step 3 only if verification has never been attempted; otherwise stop. |
| `failed`, `unconfirmed`, expired, or unverifiable | Use the fixed failure message with the actual stage, public reason, and actionable next step. Preserve state and stop. |

For a failed or unconfirmed connection, the plugin saves a failure card under the trusted original installation turn with the safe diagnostics above. Continuous querying is unnecessary. Without a trusted installation turn, use the read-only receipt.

The four evidence fields are `guide_loaded`, `guide_success`, `account_success`, and `turn_completed`, all strictly `true`: the new conversation loads the guide Skill, the guide returns `view=onboarding/status=ready`, one account call returns `success=true`, and that turn completes normally. Model prose, successful sign-in, or a card's appearance cannot replace that result.

When reporting completion, first obtain the completed receipt above, reread the actual installed package version without modifying it, and confirm it matches the installation version. If the real completion card is visible on the original installation turn, the final natural-language reply must contain exactly these two paragraphs with the actual version substituted. Do not append links, technical details, tool-loading reasons, task IDs, or other prose:

```text
OpenAgent {version} has been installed. The new user guide and account verification passed.

Select “Open new user guide” below to continue.
```

If the card is not visible or no trusted installation turn exists, replace the second paragraph with “Continue in the new user guide conversation that is already open.” Do not invent a button. Without every verification result, or if versions differ, do not use completion wording; report the actual stage and public reason for incompletion.

After the successful result is saved, the plugin shows a separate completion card below the final reply of the original installation turn: “OpenAgent installation and account verification passed”, with an “Open new user guide” button. It does not navigate back automatically. Returning to the original task, including after a normal reopen, shows the saved card. The button only opens the existing guide task; it does not create a task, resend the prompt, or call the model. If the installation turn cannot be established from trusted events, no card is shown; the read-only query above remains authoritative for verification. Verification state is not migrated across package versions, and existing guide tasks are preserved.
