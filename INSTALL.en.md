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

Keep the current turn running while native verification is pending, and use the final reply in step 4 after verified completion. Only a user-accepted CLI fallback uses the preparation reply in step 3 and ends the original turn first. Opening the authorization page, successful sign-in, and a ready connection do not authorize installation-verification success wording.

## 1. Check the current host and execution tools

Use the ordinary conversation's actual `bash` or `pwsh` and `job_output` tools. Check that the shell schema supports `description`, `command`, `run_in_background: true`, `sandbox_permissions: "danger-full-access"`, and `justification`. Installation and verification records write to the current Harness profile: request the required access on the first call for each operation without changing global permissions. Stop if tools or arguments are unavailable or approval is denied or cancelled; do not retry through another entry point.

Through the shell, check only the host-injected `DSH_HOME`, `DSH_PROFILE`, `DSH_PROFILE_DIR`, and `DSH_SESSION_ID`, preserving their values. Confirm that the profile directory belongs to that home, current client, and original installation conversation. Stop if values are missing or inconsistent; do not guess another profile or read credentials or conversation contents.

Verify Git, Node, and dsh versions and their installation sources. Node must be `22.19+` in the 22 series or `24+`; the absolute Node path returned by `load_workspace_dependencies` may be used. For Desktop, locate `resources/runtime/cli/bin/dsh` inside the **currently running application**, or `dsh.cmd` on Windows; on macOS it is under `Contents/Resources/runtime/cli/bin/dsh`. Do not guess a fixed application name or install npm dsh separately. For non-Desktop hosts, use dsh from the same installation as the current Host. Check `--version` through its absolute path, then replace and correctly quote the placeholder paths below.

Read only the relevant dependency source, `dsh.profile.bundles`, disablement records, and installed package name and version from the current profile and package; do not print entire configuration files. Accept only the official GitHub/Gitee repositories below at `rel`, including equivalent package-manager representations. Preserve an existing trusted installation without adding it again. Stop for an existing disablement, an older package lacking this guide's status command, an unknown same-name source, abnormal files, or unconfirmed local changes; use the maintenance procedure without silently enabling or overwriting it.

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

First query status once in the original installation conversation through a read-only entry point in step 4. Start the first verification only if this installation has never called `--prepare` or `openagent_install_verify`, has no known verification conversation, and the query returns `NO_ATTEMPT` with `connection_status` equal to `not_started`, `connecting`, or `ready`. Preserve any existing preparation or attempt. Stop if `NO_ATTEMPT` follows a previous attempt, or the connection is `failed` / `unconfirmed`, missing, or invalid; do not create another attempt, extend expiry, or resend.

After confirming that `openagent_install_verify` is in the current native tool catalog, say “Connecting OpenAgent. The new user guide will open automatically when the connection is ready…” and **call that native tool directly once**:

```json
{"locale":"en"}
```

Do not nest the call inside `run_code` / PTC, also run `--prepare`, or invent wait, profile, conversation, or request arguments. **Keep the original installation turn running while the same tool call is pending. Do not give a final reply early or require the original conversation to become idle first.** The tool first reserves one persistent verification record, then waits for the same connection to become ready. Connection waiting, creating the new conversation, sending the guide, and all four verification results share a maximum of 600 seconds. Stop and preserve the record on failure, cancellation, timeout, or an unknown outcome. Do not retry, prepare another request, or sign in again; query the original state read-only when needed.

Hot loading may not have exposed the native tool in the current catalog yet. Keep this turn waiting for the current connection and check the refreshed catalog in a subsequent native tool step. Do not reinstall because the tool has not appeared, call a private RPC, emulate the tool, or claim that verification has been prepared. If the host cannot keep waiting, report that completion is still pending. Do not automatically switch to the fallback below, which ends the original turn early.

Once the connection status is `ready`, MCP and the five business Skills are actually available, and the original conversation is uniquely visible, the plugin creates and displays a new conversation and sends “OpenAgent installed. Open the new user guide.” once, preserving the original draft. The guide task inherits the original installation task's workspace; only an originally ungrouped task falls back to its working directory. Do not create another conversation, manually resend the fixed prompt, or ask the user to send it again. Only after the tool returns `completed` normally with all four evidence fields strictly `true` may you check the actual version and use the completion wording in step 4.

### Use the CLI fallback only when the user accepts it

Run `--prepare` once only if the native verification tool is unavailable, the user explicitly accepts ending the original installation turn first, and every first-attempt precheck above still holds. Never switch after native verification was called, while it is pending, or when its outcome is unknown. Use the Node path and host variables checked in step 1. Request `sandbox_permissions: "danger-full-access"` on the native shell call with a `justification` explaining “Save one new-conversation verification request for the original installation conversation.” Wait for the short command to exit without closing the application.

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

If the command succeeds and returns `OPENAGENT_ONBOARDING_PREPARED` with `status="pending"`, replace the version placeholder with the actual reread version. The final natural-language reply must contain exactly these two paragraphs, without links, logs, IDs, or installation-success wording:

```text
OpenAgent {version} installation files are ready, and automatic verification is prepared.

Keep this installation conversation in the only visible window. If an authorization page opened, complete authorization there. The new user guide will open automatically when the connection is ready.
```

**Only for this fallback, immediately end the current turn. Do not wait for completed in this turn or call `openagent_install_verify`.** The fallback preparation requires the original conversation to become idle before it can be claimed.

The fallback preparation expires after 30 minutes. The verification service registers before waiting for sign-in and leaves the preparation pending and unclaimed while the connection is still in progress. Only when the connection is ready, MCP and Skills are actually available, and the original conversation is idle and uniquely visible does it create the new conversation and send the guide once under the rules above. A failed or unconfirmed connection stops verification and shows diagnostics as described in step 4. Preserve any returned existing state or failure; successful preparation is not successful verification.

## 4. Read diagnostics and the completion result

Before the first verification, after the original call has returned and its result needs checking, or if the CLI fallback has not opened a new conversation, query one read-only entry point once in the **original installation conversation**. Use `openagent_install_status` with `{}` if exposed; otherwise run `--status` below. Preserve the original profile, conversation, and Node path, and follow the shell's actual permission requirements. Do not inspect state files or credentials instead of querying. While the native verification tool is still pending, keep waiting for that same call without parallel status queries or treating the wait as a failed result.

Bash:

```bash
"<absolute Node path>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/runtime/post-install.mjs" --status --profile "$DSH_PROFILE"
```

PowerShell:

```powershell
& '<absolute Node path>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/runtime/post-install.mjs') --status --profile $env:DSH_PROFILE
```

Status queries retain `connection_status` and return safe diagnostics in `connection`: required `status`, with optional `stage/code/http_status/started_at/updated_at` when supported by a trusted record. The timestamps are Unix milliseconds for the connection start and latest update. Before any attempt, the object is only `{status:"not_started"}`; do not invent a stage or time. `not_started` means this version has no Host connection attempt; `connecting` means the same attempt is still running; `ready` means the same sign-in process and MCP initialization succeeded, not that business verification passed. Stop for `failed` or `unconfirmed` without reopening to retry OAuth. Treat invalid fields or an unconfirmed state as unknown. A cold start may require completing browser authorization before the host becomes ready.

| `connection.stage` | Actual stage |
| --- | --- |
| `preparing` | Preparing the connection and checking runtime dependencies and the dedicated authentication directory. |
| `login` | Running the same sign-in connection check, entering authorization if necessary. |
| `waiting_authorization` | Confirmed that the authorization page opened automatically; waiting for this browser authorization. |
| `mcp` | The sign-in process succeeded and MCP is loading; use `connection.status` to determine readiness. |

Only allowlisted public reasons are used: `AUTH_TIMEOUT` / `AUTH_REJECTED` for authorization timeout or rejection, `NETWORK_TIMEOUT` / `NETWORK_ERROR` for network timeout or error, `HTTP_ERROR` with the actual HTTP status when available, `PROTOCOL_ERROR` for protocol errors, `DEPENDENCY_ERROR` for runtime dependency problems, `LOGIN_FAILED` for an otherwise unclassified sign-in failure, `MCP_STARTUP_FAILED` for MCP initialization failure, `STATE_UNAVAILABLE` for unavailable state, and `CONNECTION_STOPPED` for an interrupted attempt. Do not infer a particular network, authorization, or MCP cause from a generic failure. Never print Tokens, authorization URLs, callback parameters, raw stderr, or business content.

A failed connection returns `status=failed/code=CONNECTION_FAILED`; an unconfirmed connection returns `status=unconfirmed/code=CONNECTION_UNCONFIRMED`, with the diagnostics above. Native verification persists the failure once using its already-reserved record; the Host claims a CLI fallback preparation before saving its failure. Later connection recovery or Host reload does not replay that attempt. The plugin shows a card below the trusted source installation turn with the fixed stage, public reason, and applicable HTTP status. It states that verification stopped without automatic retries. The card has no retry button and does not invoke OAuth or the model; do not ask the user to keep querying. If the trusted installation turn cannot be established, do not promise a card; use the read-only query.

Handle the receipt following `OPENAGENT_ONBOARDING_STATE`, or the tool's returned state, as follows:

| State | Action |
| --- | --- |
| CLI fallback `pending`, unclaimed and unexpired, with `connection_status=not_started` or `ready` | Preserve the same preparation and end the query turn. Prefer online loading. If the conversation still does not appear and reopening is necessary, finish other tasks, quit and reopen Harness normally, and return to the same installation conversation within the original 30-minute expiry. Keep it uniquely visible and idle for automatic continuation. No reinstall, new preparation, or prompt is needed. |
| CLI fallback `pending` with `connection_status=connecting` | End the query turn and wait for the same connection attempt. Do not reopen, sign in separately, or resend the prompt. |
| `completed` with all four evidence fields strictly `true` | Reread the actual installed version and follow the completion rules below. Model prose or a card's appearance alone does not prove verification. |
| `NO_ATTEMPT` during the first precheck | Call native verification for the first time only when every condition in step 3 holds. The CLI fallback has additional eligibility conditions. Stop if there was a previous attempt. |
| Claimed, `unconfirmed`, `failed`, expired, or a `failed` / `unconfirmed`, missing, or invalid connection state | Use the fixed failure message with the actual stage, public reason, and actionable next step. Preserve state without reopening to retry, resending, extending expiry, or changing conversations to bypass the record. |

The four evidence fields are `guide_loaded`, `guide_success`, `account_success`, and `turn_completed`, all strictly `true`: the new conversation loads the guide Skill, the guide returns `view=onboarding/status=ready`, one account call returns strict `success=true`, and that turn completes normally. Native verification lasts at most 600 seconds, including connection waiting and all four verification results. CLI fallback verification must also stay within the preparation's remaining lifetime. A tool catalog, successful OAuth, a reopened process, or model prose cannot replace that evidence.

When reporting completion, first obtain the completed receipt above, reread the actual installed package version without modifying it, and confirm it matches the installation version. If the real completion card is visible on the original installation turn, the final natural-language reply must contain exactly these two paragraphs with the actual version substituted. Do not append links, technical details, tool-loading reasons, task IDs, other prose, or the Codex `::created-thread` directive:

```text
OpenAgent {version} has been installed. The new user guide and account verification passed.

Select “Open new user guide” below to continue.
```

If the card is not visible or no trusted installation turn exists, replace the second paragraph with “Continue in the new user guide conversation that is already open.” Do not invent a button. Without every verification result, or if versions differ, do not use completion wording; report the actual stage and public reason for incompletion. When the CLI fallback is used, its original pending reply is not rewritten as a success reply.

After the successful result is saved, the plugin shows a separate completion card below the final reply of the original installation turn: “OpenAgent installation and account verification passed”, with an “Open new user guide” button. It does not navigate back automatically. Returning to the original task, including after a normal reopen, shows the saved card. The button only opens the existing guide task; it does not create a task, resend the prompt, or call the model. If the installation turn cannot be established from trusted events, no card is shown; the read-only query above remains authoritative for verification. Verification state is not migrated across package versions, and existing guide tasks are preserved.

The official Desktop maintenance instructions recommend quitting before maintenance. This guide's online path applies only to first installation of this plugin and is verified through actual loading and the result above; it does not assume that every plugin can hot-load. Do not terminate processes forcibly, write background restart scripts, call private Host RPCs, or rerun OAuth to troubleshoot verification. If CLI has no visible new-conversation capability, leave verification pending rather than using a background child conversation to impersonate Desktop / Web verification. The process uses the current model and incurs normal model calls, but does not submit a paid Agent task. Do not claim an animation played when it was not displayed.

## Updates and removal

First-time online installation does not authorize online updates, removal, or connection recovery. Finish tasks using OpenAgent, check the official source, version, and local changes, and back up anything that must be retained. Stop when the source or state is uncertain; adding the same package again is not an update procedure.

If the current conversation actually exposes `plugin_manager`, host approval and the verified `removable` state may be used for `{"action":"remove_bundle","target":"dsh-openagent"}`, followed by rereading package and runtime state. Follow an actual `stop-profile` or `restart-required` receipt with a normal exit or reopen and state check; do not remove again. This is an optional maintenance entry point, not an installation prerequisite.

Perform other maintenance from a separate external terminal after confirming that the target profile is stopped. Preserve its original `DSH_HOME` and profile, using the application's built-in dsh for Desktop. Run `"<absolute dsh path>" plugin --profile "<original profile>" remove dsh-openagent`; only reinstall for an authorized update after removal is confirmed. Do not run exit or uninstall scripts from the conversation that will be closed, and do not clear package-manager locks. Do not repeat authorization when valid sign-in already exists. Stop on failure, cancellation, or an unknown outcome.

Both native removal paths above remove only the bundle and preserve sign-in for maintenance and updates. Use the complete uninstaller below to clean up local sign-in data.

The complete one-line uninstaller is in the [README](https://gitee.com/openagent-org/deepseek-harness-plugin/blob/rel/README.md#%E5%8D%B8%E8%BD%BD). It requires curl and Python 3.9+ and runs only from an external Bash terminal after the profile is stopped. Append arguments after `python3 -`:

| Argument | Purpose |
| --- | --- |
| `--yes` / `--dry-run` | Execute the verified removal and applicable authentication cleanup / list actions and prerequisites without writing files. |
| `--profile <name>` | Select the original profile; required if multiple official installations exist. |
| `--dsh-home <path>` | Select the original Harness home; defaults to nonempty `DSH_HOME` or otherwise `~/.dsh`. |
| `--desktop-app <path>` | Select a macOS `.app` or Windows installation root to locate built-in dsh. |

Before native removal, the target profile must be stopped and free of package-manager locks. The script does not terminate processes or clear locks. It checks standard application directories on macOS and registered built-in dsh on Windows; use `--desktop-app` if the location is ambiguous. For Linux Desktop bundle removal, use the native plugin page; the script does not support that removal case.

After native removal succeeds and is verified, the complete uninstaller checks every profile under the same `DSH_HOME`. A `dsh-openagent` dependency, bundle registration, or package path from any source, including a broken link, counts as a usage record. If any remain, it preserves sign-in, lists the profiles, and exits successfully. It deletes the entire dedicated `DSH_HOME/openagent-auth` directory, including all cache versions, only after confirming that no other users remain, every profile in that home is stopped, no package-manager locks exist, and the authentication path and its entire tree contain no symbolic links, Windows junctions, or special files. Usage records and paths are checked again before deletion.

During an actual cleanup run, if another profile, runtime state, or path cannot be verified, or a lock or abnormal file is found, authentication data is preserved and incomplete cleanup is reported with a nonzero exit code. A filesystem error during deletion also produces a nonzero exit code and reports possible remaining data without automatically retrying. If an older uninstaller already removed the plugin but left authentication data, the same script supports `--yes` or `--dry-run` without requiring a dsh CLI just to clean the cache. Repeated execution does nothing when the cache is also absent.

Cleanup does not read credential contents or back up Tokens. It preserves other plugins, configuration, other authentication directories including `.mcp-auth`, conversations, and `.openagent-onboarding`. Local deletion does not revoke server-side authorization; never delete the entire home or another client's credentials.
