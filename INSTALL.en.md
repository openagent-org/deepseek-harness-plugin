# Install OpenAgent: DeepSeek Harness

The installation Agent in DeepSeek Harness must execute the four steps below, including installation, sign-in, and verification in a new conversation. Do not merely hand the user commands. Prefer a new conversation in **Creator** mode; continue in the current conversation if it already exposes `plugin_manager`. The user handles required approvals and browser authorization, without providing passwords or Tokens.

This guide was checked against Harness `0.2.1-rc.2` and supports local Desktop, Web, and CLI on `>=0.2.1-rc.2 <0.3.0`. The displayed plugin name is **OpenAgent**; its internal package name in tool arguments and installation paths remains `dsh-openagent`.

## 1. Confirm the current environment and native tools

Confirm that this is DeepSeek Harness on the target machine and check its version. Inspect the current conversation's actual tools for `plugin_manager`, the platform's `bash` or `pwsh`, and `job_output`. Confirm that the selected shell's actual schema supports `run_in_background: true`; otherwise stop and report missing background execution support. If the installation tool is missing, explain that this mode cannot complete automatic installation and ask the user to start a new Creator conversation with this guide. A conversation cannot switch presets after its first turn. Do not edit YAML, disable approvals, or launch `dsh plugin` from the current chat to add missing tools.

Use the native shell to check only the host-injected `DSH_HOME`, `DSH_PROFILE`, `DSH_PROFILE_DIR`, and `DSH_SESSION_ID`. Keep using those verified values. Stop if they are missing or identify the wrong target; do not guess a profile, redirect the variables to another profile, or read credential files.

Check Git and Node.js: Node `22.19+` on the 22 series or `24+` is required. When available, use the absolute Node path returned by `load_workspace_dependencies`; otherwise use a verified Node already configured in the environment. Replace `<absolute Node path>` below with that path and quote it correctly. Desktop does not need a separate dsh installation.

`plugin_manager` checks `danger-full-access` for each call: it proceeds if the session already has that access; otherwise the host requests approval for that operation. Do not add shell permission arguments to it or change the session's global permission mode. Sign-in and preparation write to Harness-specific directories. Before executing them, confirm that the native shell's actual schema supports `sandbox_permissions: "danger-full-access"` and `justification`, and request the required access on the first call. Stop if those arguments are unavailable or approval is denied or cancelled; do not retry through another entry point.

## 2. Install through the native tool, without enabling yet

First call `plugin_manager`:

```json
{"action":"list_bundles","limit":100}
```

Parse the JSON string returned by the tool. When `nextOffset` is non-null, continue with that value as `offset` until the target is found or the list ends. Inspect the entry with `name="dsh-openagent"` and its `source`, `version`, `installed`, and `enabled` fields. Its source must actually match the `rel` branch of the official GitHub or Gitee repositories below. Do not use the `official` boolean for this check; it identifies membership in Harness's built-in catalog.

Preserve an existing installation from that source and continue. For `already-installed`, reread the actual entry without removing and reinstalling it. Use “Update and removal” below only when an update is explicitly needed. Stop for an unknown same-name source, abnormal files, or unreviewed local changes rather than overwriting them.

If it is not installed, call `plugin_manager` once with activation explicitly disabled:

```json
{"action":"install_bundle","target":"git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel","enabled":false}
```

Wait for the same call to finish, then reread the package name, version, and source with `list_bundles`. Continue only after installation explicitly succeeds and the target package is readable. For `failed`, `cancelled`, `overridden`, or an unknown outcome, report the stage and stop without repeating installation. Preserve `restart-required` and follow the preparation branch in step 4 after sign-in.

Only a confirmed Git download failure caused by DNS, connection, timeout, interrupted transport, or HTTP 5xx permits one further download after the original operation has ended. Change `target` to `git+https://gitee.com/openagent-org/deepseek-harness-plugin.git#rel`. Approval denial, certificate errors, 401/403/404/429/451, validation, dependency builds, enablement, or OAuth failures do not permit switching sources. If `pendingBuilds` is returned, report the build-script approval blocker and stop; do not add `approvedBuilds` or relax version compatibility checks.

The native manager owns this profile's dependencies and plugin selection. Preserve other plugins, models, conversations, and configuration. Do not delete the profile or use `--from-default-profile`.

## 3. Sign in once, then enable natively

First check for trusted evidence of successful sign-in to this same endpoint and a usable connection; if present, skip duplicate sign-in. If an enabled plugin is already authorizing, wait for that attempt without starting a parallel login command. Authorization for the old domain does not authorize `https://openagent.org/mcp/v1/open-agent`. Migration requires the user's explicit authorization and one normal sign-in; preserve old authentication files without copying or rewriting Tokens.

When sign-in is needed, tell the user: “I am connecting OpenAgent. If an authorization page opens, complete authorization there; I will wait for the same process.” The installation Agent selects one native shell call for the platform, replaces the Node path, and runs it once.

On macOS / Linux, use `bash`:

```json
{
  "description": "Connect OpenAgent and wait for browser authorization",
  "command": "\"<absolute Node path>\" \"$DSH_PROFILE_DIR/node_modules/dsh-openagent/login.mjs\"",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "This sign-in needs to write the current Harness OpenAgent authentication directory and complete browser authorization."
}
```

On Windows, use `pwsh`:

```json
{
  "description": "Connect OpenAgent and wait for browser authorization",
  "command": "& '<absolute Node path>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/login.mjs')",
  "run_in_background": true,
  "sandbox_permissions": "danger-full-access",
  "justification": "This sign-in needs to write the current Harness OpenAgent authentication directory and complete browser authorization."
}
```

Keep the actual returned `jobId` and use `job_output` to wait for that same job, for at most 60 seconds per call:

```json
{"job_id":"<jobId returned above>","wait":true,"timeout_ms":60000}
```

A short wait ending is not a sign-in failure. If the job is running, keep waiting without rerunning the command. Confirm sign-in only when the original command exits with code 0 and outputs `OPENAGENT_LOGIN_CONNECTED`. Stop on cancellation, failure, timeout, or an unknown outcome and report the stage and public error. The sign-in entry opens the authorization page; do not open another URL or print credential files, complete authorization URLs, or raw logs.

After sign-in succeeds, call `plugin_manager`:

```json
{"action":"set_bundle","target":"dsh-openagent","enabled":true}
```

Reread the target bundle and actual tool catalog. `application="applied"` proves only that configuration was applied. When MCP tools and Skills are usable, proceed directly to step 4 without exiting or restarting. An explicit `restart-required` result leads to the preparation branch below. Stop for other failures or unknown outcomes; “enabled” is not verification, and missing tools are not a reason to sign in again.

## 4. Automatically verify in a new conversation and deliver the result

When no preparation exists and verification has not started, the installation Agent calls `openagent_install_verify` once from the original installation conversation:

```json
{"locale":"en"}
```

Keep the original installation conversation visible in exactly one target Desktop / Web window. The tool checks the actual MCP tools and five business Skills, creates and displays a new conversation, sends “OpenAgent installed. Open the new user guide.” once, and preserves the original conversation's draft. Do not create another conversation, send the prompt manually, or ask the user to send it again.

Report “OpenAgent installation and account verification passed; you can continue in the new conversation” only when `status="completed"` and `guide_loaded`, `guide_success`, `account_success`, and `turn_completed` are all strictly `true`. This requires the new conversation to actually load the guide Skill, receive `view=onboarding/status=ready` from the guide, receive strict `success=true` from one account call, and finish that turn normally. Tool listings, OAuth success, and model prose cannot substitute for this evidence.

One verification attempt waits at most 600 seconds. If the original call times out or its outcome is unknown, call the read-only `openagent_install_status` once:

```json
{}
```

Report the existing state without calling verify again or changing conversations to bypass its record. `NO_ATTEMPT` does not override a preparation that has not started and is not permission to send another prompt. On failure, report “OpenAgent installation verification is incomplete,” the stage, and the public error. Do not repeat the guide, account call, or OAuth, read Tokens, connect directly to MCP, or delete state to bypass verification.

### Prepare only when native management explicitly requires reopening

Only when the result explicitly says `restart-required` and there is no preparation, prior verify call, or verification conversation, run one preparation command below from the original installation conversation. Use the Node path and host-injected variables verified in step 1. Request `sandbox_permissions: "danger-full-access"` on the native `bash` / `pwsh` call with a `justification` explaining “Save a one-time new-conversation verification request for this installation conversation.” Run the short command and wait for its exit without closing the application.

Bash:

```bash
: "${DSH_PROFILE:?Current profile is missing}" "${DSH_PROFILE_DIR:?Current profile directory is missing}" "${DSH_SESSION_ID:?Current conversation ID is missing}"
"<absolute Node path>" "$DSH_PROFILE_DIR/node_modules/dsh-openagent/post-install.mjs" --prepare --profile "$DSH_PROFILE" --locale en
```

PowerShell:

```powershell
if (-not $env:DSH_PROFILE -or -not $env:DSH_PROFILE_DIR -or -not $env:DSH_SESSION_ID) { throw 'Current Harness profile or conversation ID is missing' }
& '<absolute Node path>' (Join-Path $env:DSH_PROFILE_DIR 'node_modules/dsh-openagent/post-install.mjs') --prepare --profile $env:DSH_PROFILE --locale en
```

Only a successful command exit with `OPENAGENT_ONBOARDING_PREPARED` permits reporting: “The installation files are ready and automatic verification is scheduled. After all tasks finish, quit and reopen Harness normally, then return to this installation conversation within 30 minutes.” End this turn. Once the original conversation is idle and uniquely visible and MCP and Skills are ready, the plugin performs that verification automatically. The user does not send a prompt, and the installation Agent does not call verify again. Do not force-kill processes or write a background restart script.

For preparation failure, expiry, `OPENAGENT_ONBOARDING_STATE`, or an unknown outcome, preserve the state and report its actual stage. Do not extend the deadline, delete records, change conversations, or send the prompt manually. Once verification has started, use only the single status query described above.

If verification tools or visible new-conversation capability are missing, retain “new-conversation verification pending.” CLI must not use a background child conversation to impersonate visible Desktop / Web verification. Only when there is explicitly no preparation and verification has never started may the user manually create a conversation in the target client and send the fixed prompt. Verification uses the current model and incurs normal model calls, but does not submit a paid Agent task. Do not claim an animation played when it was not displayed.

## Update and removal

An installation Agent with `plugin_manager` performs these operations. First finish tasks using OpenAgent, reread the source, version, and `removable` flag, and inspect local changes. Handle only the official GitHub/Gitee `rel` installations above and back up changes that must be kept. This Git package has no usable native update button; adding the same address again is not evidence of an update.

To remove it, call `plugin_manager`:

```json
{"action":"remove_bundle","target":"dsh-openagent"}
```

Reread the actual package and runtime state, and report success only after removal is confirmed. `restart-required` means runtime state still needs checking after a normal reopen; do not repeat removal. For an update, return to step 2 only after removal is confirmed, then enable and verify again. Do not repeat authorization when the same endpoint already has valid sign-in. Stop on failure, cancellation, or an unknown outcome without replaying the procedure.

If `stop-profile` is returned, the user must finish tasks and quit the target client normally before the original profile is handled from an independent external terminal. Keep the original `DSH_HOME`. Desktop uses its bundled dsh, not a separate npm installation. Do not run quit or uninstall scripts from the conversation that will be closed. After confirming that the profile has stopped, run:

```bash
dsh plugin --profile <original profile> remove dsh-openagent
```

Only after removal is confirmed, reinstallation is needed, and the profile remains stopped, use `dsh plugin --profile <original profile> add 'git+https://github.com/openagent-org/deepseek-harness-plugin.git#rel'`. Before starting the client, use the verified absolute Node path to run `login.mjs` in that actual profile's package directory, following the single-attempt sign-in rules in step 3; do not assume host-injected variables exist in an external terminal. Continue verification after reopening. The native Plugins page also supports install, enable, and remove operations as a manual maintenance entry; it does not replace execution by an installation Agent that has the tools.

The one-line uninstaller for an independent external terminal is in the [README](https://github.com/openagent-org/deepseek-harness-plugin/blob/rel/README.md#%E5%8D%B8%E8%BD%BD) and requires curl and Python 3.9+. It requires a stopped target profile, accepts only the official sources above, and preserves other plugins and configuration. Append options after `python3 -`:

| Option | Purpose |
| --- | --- |
| `--yes` / `--dry-run` | Execute the verified removal / preview without removing anything. |
| `--profile <name>` | Select the original profile; required when several official installations exist. |
| `--dsh-home <path>` | Select the original Harness home; otherwise use non-empty `DSH_HOME`, then `~/.dsh`. |
| `--desktop-app <path>` | Select a macOS `.app` or Windows application installation root to locate bundled dsh. |

The script stops if it cannot verify runtime state or finds a package-manager lock; it does not terminate processes or clear locks. macOS checks standard application locations and Windows uses the registered bundled dsh by default; use `--desktop-app` when the target cannot be uniquely located. The script does not support Linux Desktop; use native management tools or the Plugins page there.

Preserve shared `DSH_HOME/openagent-auth`; local removal does not revoke server-side authorization. Fully signing out requires all profiles using that directory to be stopped and explicit user authorization. Never delete the entire Harness home or another client's credentials.
