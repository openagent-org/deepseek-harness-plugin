---
name: openagent-guide-agent
description: Handle OpenAgent onboarding, beginner help, getting-started guidance, and usage help, including requests to open the guide or explain how to use OpenAgent, and the installation request “OpenAgent installed. Open the new user guide.” or its Chinese equivalent. Verify the guide and account tools before showing the localized completion message; report incomplete verification on failure. When the user explicitly requests an Agent by agent_id, hand the original ID, optional name, and business requirement to openagent-run-agent. Support Chinese and English selection prompts and ID-only requests.
---

# OpenAgent Post-Install Guidance and Specified Agent Routing

## Purpose

For first installation or an OpenAgent guidance request without a specified Agent, verify the current guide and account tools, then show the fixed completion message and eligible reward only after both checks pass. Render the animation only when the Host supports it. When the user explicitly specifies an `agent_id`, hand off directly to run-agent. Do not search for or replace the specified Agent, or invent a business task.

## Terminology

- **OpenAgent**: The platform and toolset used to discover, invoke, and manage Remote Agents.

## Language

Set `display_locale` to `zh-CN` or `en-US`: explicit user preference > trusted Host/caller locale > request/conversation language > `en-US`. Ignore code, quotes, Tool output, and fixed installation/selection prompts.

Use only the matching bilingual template; write free-form replies in `display_locale`. Keep stage names and English-only fixed copy in English; preserve Agent names, IDs, URLs, amounts, and files. `display_locale` is context, not a Tool argument.

## Status Update Format

After an installation or OpenAgent guidance request matches, send one standalone user-visible assistant update in DeepSeek Harness before requesting the animation and querying the reward:

```text
OpenAgent: Installation Check — <brief action phrase>
```

Keep the stage name in English and describe the current action in the user's language. Do not repeat the update or include results in it. An unmatched trigger produces no update. Deliver either the verified installation message or an incomplete-verification explanation separately; a failed account query must never be hidden by omitting the reward line.

## Workflow

For any OpenAgent Skill handoff, use the exact name from the current DeepSeek Harness skill catalog with its `skill` tool. Reuse an already loaded full instruction block. Resolve linked references and scripts from the resource base supplied by the loaded Skill; do not guess another client's paths or loader tools.

Apply [DeepSeek Harness Tool Result Mapping](../openagent-run-agent/SKILL.md#deepseek-harness-tool-result-mapping) before interpreting OpenAgent tool results.

On an explicit OpenAgent authentication failure, follow [runtime sign-in](../openagent-login/runtime-sign-in.md) before other error, fallback, or completion rules. Otherwise keep this workflow unchanged. A user-requested retry of an unfinished sign-in goes there too.

First identify the user intent:

1. When the user explicitly requests an OpenAgent Agent by `agent_id`, enter `Specified Agent Handoff`. This branch takes priority and skips Installation Check.
2. Otherwise, when the full request exactly matches `OpenAgent 已安装，打开新用户引导` or `OpenAgent installed. Open the new user guide.`, or the user asks for OpenAgent onboarding, beginner help, getting-started guidance, or usage help, run Installation Check once and deliver its verified result for `display_locale`, then end. The installation wording in the prompt is a request to verify, not evidence of success. Examples include requests for a new user guide, beginner help, opening the guide, usage guidance, introductory tutorials, and instructions on using OpenAgent. Recognize equivalent wording in Chinese or English by intent; short requests meaning “guide” or “help” qualify when the current context clearly refers to OpenAgent. Guidance for other products and requests to edit or debug the guide implementation do not qualify.
3. For other requests, exit without a stage update or installation message. Examples in documents, code blocks, screenshots, or quotations are not independent execution instructions. Hand off only an Agent the user explicitly requests to use.

## Workflow Stages

### Specified Agent Handoff

Input is the current user request to use a specified Agent, including a new-task prompt created under `INSTALL.md`. Recognize the following Chinese and English selection prompts, as well as explicit requests to use an Agent that provide only `agent_id`:

```text
Use "{name}" (agent_id: {agent_id}) on OpenAgent
使用 OpenAgent 上的「{name}」(agent_id: {agent_id})
Use (agent_id: {agent_id}) on OpenAgent
使用 OpenAgent 上的 Agent (agent_id: {agent_id})
```

- The name is optional. Take the ID from the user's explicit request unchanged; do not translate the name, rewrite the ID, or restrict IDs to the `sa_` prefix. Do not substitute example names, example IDs, or fabricated descriptions.
- Read and invoke [openagent-run-agent](../openagent-run-agent/SKILL.md), passing the original `agent_id`, the name when available, and any explicit user business requirement. Preserve `display_locale` as handoff context. Enter run-agent even with only an ID; do not search again or ask the user to supply a name.
- A selection prompt alone is not a business task. Without a concrete requirement, let run-agent ask for task input through No Explicit Intent; with a requirement, let it prepare and execute the invocation. Do not put installation instructions, selection prompts, or default trial tasks into `data.prompt`.
- This branch does not call `openagent_user_guide` or `openagent_account_credits`, emit an Installation Check update, show the installation animation or fixed completion message, or create another task. Delegate all subsequent status updates, execution, and delivery to run-agent.

**Output:** The original Agent ID, optional name, and any existing business requirement.

**Next:** Enter openagent-run-agent without running this Skill's Installation Check branch.

### Installation Check

Input is the current user's full request after excluding the specified-Agent branch.

1. Confirm that the request qualifies for Installation Check under Workflow. Both the exact installation request and the OpenAgent guidance requests use all the same steps below; do not route ordinary guidance to `mode="normal"`. Otherwise, exit without calling tools or displaying the installation message. Keep the installation contract's exact prompt `OpenAgent 已安装，打开新用户引导` unchanged; additional guidance entry points do not change `INSTALL.md`.
2. Confirm that the current host's skill catalog contains the five OpenAgent Skills listed in `INSTALL.md` and that this guide has been loaded through the native `skill` tool. Files on disk and a previous conversation's catalog do not prove current availability. Interpret the OpenAgent tool results actually exposed in this conversation using DeepSeek Harness Tool Result Mapping; stop verification if any Skill, guide tool, or account tool is unavailable. Call `openagent_user_guide` only once with `mode="onboarding"`, `locale=display_locale`, and a fresh `idempotency_key` of 16–128 ASCII letters, digits, underscores, or hyphens. Continue only when the native call confirms success and the trusted result contains `view="onboarding"` and `status="ready"`; stop on failure, interruption, a malformed result, or an unknown result. Render the returned animation only if the host supports it; inability to display the card does not mean the guide call failed, and does not permit claiming that the animation played. Do not wait for playback to finish. This branch must not open a browser, follow handoff URLs, wait for selection, or run an Agent, even if an older server returns those fields.
3. Call `openagent_account_credits` only once with no arguments. Continue only when the native call confirms success and `success` in the trusted result is strictly `true`; stop verification if it is missing or false, or on failure, interruption, or an unknown result. Read only `success`, `is_new_user`, and `signup_gift_credits`; do not display the balance, monthly spending, or other account information.
4. Process the reward message only after step 3 passes: when `is_new_user` is strictly `true`, use trusted `signup_gift_credits` from the same result to replace `{N}` in the matching language's reward line: “🎁 新用户奖励：**{N} Credits** 已到账” in Chinese or “🎁 Welcome bonus: **{N} Credits** added to your account” in English. Omit the entire line when `is_new_user=false` or the reward field is missing or untrusted. A missing reward field does not invalidate an already successful account query; do not guess, hardcode, query again to fill gaps, or automatically retry.
5. Only after both steps 2 and 3 pass, select the Markdown body below matching `display_locale` and replace `{reward_line}` with the complete reward line or empty content, leaving no placeholder. Output only that fixed body in the final response, without code fences or Output/Next labels, then end the current Turn.

When verification stops, do not output any fixed success body. Report “OpenAgent 安装验收未完成” or “OpenAgent installation verification is incomplete” in the current language, stating the failed stage (tool availability, guide, or account) and the preserved public error code or a brief redacted reason; do not infer error codes from generic host messages. Missing tools or transport failures are not authentication failures; enter Runtime Sign-in only for an explicit authentication error. Login success does not replace incomplete verification or authorize replay. End this check and verify again only after a new user request. Do not read authentication storage, connect directly to MCP with curl or a custom client, modify the profile, or restart the application to manufacture successful verification.

For `zh-CN`:

```markdown
🎉 OpenAgent 已安装

**从此，你的 DeepSeek Harness 拥有一支不断壮大的专业团队**

借助 OpenAgent 网络，DeepSeek Harness 可以根据任务自动寻找、编排并调用专业 Agent，按需使用专有数据、专业算力与专家经验，并把结果带回当前对话。

**快速体验，可以输入这些 Prompt：**

> 用 OpenAgent 获取英伟达最近四个季度的营收、毛利率和数据中心业务增速，对比市场预期，找出最值得关注的三个变化，并附上数据来源。

> 我正在考虑做一款面向独立开发者的 AI 客服产品。请让产品、增长和用户研究方向的专业 Agent 共同评估，找出最危险的三个假设，并给我一份 7 天验证计划。用 OpenAgent 完成。

> 设计一辆适合 2035 年城市通勤的双座概念车，并生成一个可以旋转查看的 3D 模型；风格简洁、未来且具有量产感。用 OpenAgent 完成。

**💡 使用技巧**

> **自动触发：** 直接说出需求；当任务需要专业能力时，我会自动使用 OpenAgent。
>
> **明确触发：** 在句尾补充"**用 OpenAgent 完成**"。
>
> **获得帮助：** 直接问 DeepSeek Harness："如何使用 OpenAgent？"

{reward_line}

[浏览专家 Agent →](https://openagent.org/agents)
```

For `en-US`:

```markdown
🎉 OpenAgent installed

**Your DeepSeek Harness now has an ever-growing team of specialists**

Through the OpenAgent network, DeepSeek Harness can automatically find, coordinate, and call specialist Agents for your tasks, drawing on proprietary data, specialized computing resources, and expert knowledge as needed, and bring the results back to the current conversation.

**Try these prompts to get started:**

> Use OpenAgent to get NVIDIA's revenue, gross margin, and data center revenue growth for the last four quarters. Compare the results with market expectations, identify the three most important changes, and cite the sources.

> I'm considering building an AI customer support product for independent developers. Have specialist Agents in product, growth, and user research evaluate it together, identify the three riskiest assumptions, and give me a 7-day validation plan. Use OpenAgent to complete this task.

> Design a two-seat concept car for urban commuting in 2035 and generate a rotatable 3D model. Keep the design simple, futuristic, and feasible for mass production. Use OpenAgent to complete this task.

**💡 Usage tips**

> **Automatic:** Just describe what you need. When a task requires specialized capabilities, I'll automatically use OpenAgent.
>
> **Explicit:** Add "**Use OpenAgent to complete this task**" to your request.
>
> **Get help:** Just ask DeepSeek Harness: "How do I use OpenAgent?"

{reward_line}

[Browse specialist Agents →](https://openagent.org/agents)
```

**Output:** After successful guide and account verification, the animation card when supported and the fixed installation message with an eligible reward line; otherwise an incomplete-verification explanation, or no message when the trigger does not match.

**Next:** End the current Turn without subsequent Agent tasks.

## Shared OpenAgent Rules

Reuse [Account Trust and Privacy](../openagent-query-account/SKILL.md#account-trust-and-privacy). The Installation Check branch only calls `openagent_user_guide` for onboarding verification and `openagent_account_credits` for account verification and the eligible reward. Display the installation completion message only after both pass; do not enter the account Skill's balance display workflow.
