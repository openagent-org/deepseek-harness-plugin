// 安装验收只传递固定语言、宿主生成的身份与脱敏回执；不接收业务提示词。
export const onboardingSkills = [
  'openagent-first-task-router', 'openagent-guide-agent', 'openagent-query-account',
  'openagent-search-agent', 'openagent-run-agent',
]
export const onboardingGuideTool = 'mcp__openagent__openagent_user_guide'
export const onboardingAccountTool = 'mcp__openagent__openagent_account_credits'
export const onboardingFailureCodes = [
  'NO_SESSION', 'NO_CLIENT', 'AMBIGUOUS_CLIENT', 'INVALID_LOCALE', 'MCP_UNAVAILABLE', 'SKILLS_UNAVAILABLE',
  'STATE_UNAVAILABLE', 'ONBOARDING_ALREADY_CLAIMED', 'NO_ATTEMPT', 'REQUEST_EXPIRED',
  'SESSION_NOT_VISIBLE', 'SESSION_CHANGED', 'CREATE_REJECTED', 'CREATE_UNCONFIRMED',
  'SESSION_ID_MISMATCH', 'TARGET_NOT_BLANK', 'TARGET_NOT_READY', 'AUTHORIZATION_REFUSED',
  'SEND_REJECTED', 'SEND_UNCONFIRMED', 'CLIENT_DISCONNECTED', 'BRIDGE_DISPOSED', 'CALL_CANCELLED',
  'VERIFICATION_TIMEOUT', 'GUIDE_SKILL_FAILED', 'GUIDE_FAILED', 'ACCOUNT_FAILED',
  'UNEXPECTED_TOOL', 'DUPLICATE_TOOL', 'PROMPT_MISMATCH', 'TURN_FAILED', 'EVIDENCE_MISSING',
]
export function onboardingPrompt(locale) {
  if (locale === 'zh-CN') return 'OpenAgent 已安装，打开新用户引导'
  if (locale === 'en') return 'OpenAgent installed. Open the new user guide.'
  throw new Error('OPENAGENT_ONBOARDING_INVALID_LOCALE')
}
const id = value => {
  if (typeof value !== 'string' || !value || value.length > 512) throw new Error('OPENAGENT_ONBOARDING_INVALID_ID')
  return value
}
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
  }
  return value
}
const codec = (name, parse) => ({ mode: 'strict', typeSymbol: `dsh-openagent#Onboarding${name}`, create: () => ({ parse }) })
const identity = codec('Identity', id)
const accepted = codec('Accepted', value => {
  exact(value, ['accepted'])
  if (typeof value.accepted !== 'boolean') throw new Error('OPENAGENT_ONBOARDING_INVALID_ACK')
  return value
})
const receipt = codec('Receipt', value => {
  exact(value, ['status', 'code'])
  if (!['submitted', 'failed', 'unconfirmed'].includes(value.status)
    || (value.status === 'submitted' ? value.code !== undefined : !onboardingFailureCodes.includes(value.code))) {
    throw new Error('OPENAGENT_ONBOARDING_INVALID_RECEIPT')
  }
  return value
})
const message = codec('Message', value => {
  if (!['ready', 'verify', 'completed'].includes(value?.type)) throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
  id(value.sessionId)
  if (value.type === 'ready') exact(value, ['type', 'sessionId'])
  else if (value.type === 'completed') {
    exact(value, ['type', 'sessionId', 'completion'])
    const completion = exact(value.completion, ['sourceTurn', 'locale', 'result'])
    if (!Number.isSafeInteger(completion.sourceTurn) || completion.sourceTurn <= 0) throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
    onboardingPrompt(completion.locale)
    const result = exact(completion.result, ['status', 'request_id', 'session_id', 'guide_loaded', 'guide_success', 'account_success', 'turn_completed'])
    id(result.request_id); id(result.session_id)
    if (result.status !== 'completed' || ['guide_loaded', 'guide_success', 'account_success', 'turn_completed'].some(key => result[key] !== true)) {
      throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
    }
  } else {
    exact(value, ['type', 'sessionId', 'requestId', 'targetSessionId', 'promptId', 'locale', 'cwd', 'workspaceId', 'expiresAt'])
    id(value.requestId); id(value.targetSessionId); id(value.promptId)
    onboardingPrompt(value.locale)
    if ('workspaceId' in value) {
      id(value.workspaceId)
      if ('cwd' in value) throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
    } else if (typeof value.cwd !== 'string' || !value.cwd || value.cwd.length > 16384) {
      throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
    }
    if (!Number.isFinite(value.expiresAt)) throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
  }
  return value
})

const agent = { name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent',
  codec: { ...identity, typeSymbol: '@deepseek-ai/dsh-session/types#SessionId' } }
const parameter = (name, codec) => ({ name, wire: name, source: 'json', codec })
const descriptor = (method, parameters, result, extra = {}) => ({
  id: `dsh-openagent#openagentOnboarding/${method}`, service: 'openagentOnboarding', namespace: 'openagentOnboarding',
  method, invocation: { kind: 'direct' }, parameters: [agent, ...parameters], result, ...extra,
})
export const onboardingRemote = {
  // Typert 按 package 独占注册，和已有 browserRemote 使用不同的贡献键。
  package: 'dsh-openagent-onboarding',
  descriptors: [
    descriptor('watch', [parameter('clientId', identity)], message, { mode: 'stream', cancellation: { parameter: 'signal' } }),
    descriptor('claim', [parameter('clientId', identity), parameter('requestId', identity)], accepted),
    descriptor('authorize', [parameter('clientId', identity), parameter('requestId', identity)], accepted),
    descriptor('respond', [parameter('clientId', identity), parameter('requestId', identity), parameter('receipt', receipt)], accepted),
  ],
}
