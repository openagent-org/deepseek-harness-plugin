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
  'CONNECTION_FAILED', 'CONNECTION_UNCONFIRMED',
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
export const onboardingConnectionCodes = [
  'AUTH_TIMEOUT', 'AUTH_REJECTED', 'NETWORK_TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR',
  'PROTOCOL_ERROR', 'DEPENDENCY_ERROR', 'LOGIN_FAILED', 'MCP_STARTUP_FAILED',
  'STATE_UNAVAILABLE', 'CONNECTION_STOPPED',
]
// 只提取已知错误类型与数字状态；不保留 message、stack、URL 或服务端正文。
export function connectionFailure(error, stage, fallback = stage === 'mcp' ? 'MCP_STARTUP_FAILED' : 'LOGIN_FAILED') {
  let code = fallback
  let http_status
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
    if (onboardingConnectionCodes.includes(current.data?.connection_code)) code = current.data.connection_code
    else if (onboardingConnectionCodes.includes(current.code)) code = current.code
    else if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', -32001].includes(current.code)
      || current.name === 'TimeoutError') code = 'NETWORK_TIMEOUT'
    else if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'].includes(current.code)) code = 'NETWORK_ERROR'
    else if (['access_denied', 'invalid_grant', 'unauthorized_client', 'invalid_client', 'invalid_scope'].includes(current.errorCode)) code = 'AUTH_REJECTED'
    else if (current.code === -32700 || current.code === -32600 || current.code === -32602 || current.name === 'ZodError') code = 'PROTOCOL_ERROR'
    const http = current.data?.http_status ?? current.code
    if (Number.isInteger(http) && http >= 100 && http <= 599) {
      http_status = http
      code = [401, 403].includes(http_status) ? 'AUTH_REJECTED' : 'HTTP_ERROR'
    }
  }
  return { stage, code, ...(http_status ? { http_status } : {}) }
}
export function checkedConnection(value) {
  exact(value, ['status', 'stage', 'code', 'http_status', 'started_at', 'updated_at'])
  if (!['not_started', 'connecting', 'ready', 'failed', 'unconfirmed'].includes(value.status)
    || ('stage' in value && !['preparing', 'login', 'waiting_authorization', 'mcp'].includes(value.stage))
    || ('code' in value && !onboardingConnectionCodes.includes(value.code))
    || ('http_status' in value && (!Number.isInteger(value.http_status) || value.http_status < 100 || value.http_status > 599))
    || ['started_at', 'updated_at'].some(key => key in value && (!Number.isSafeInteger(value[key]) || value[key] <= 0))) {
    throw new Error('OPENAGENT_ONBOARDING_INVALID_CONNECTION')
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
    const result = exact(completion.result, ['status', 'request_id', 'session_id', 'guide_loaded', 'guide_success', 'account_success', 'turn_completed', 'code', 'connection'])
    id(result.request_id); id(result.session_id)
    const evidence = ['guide_loaded', 'guide_success', 'account_success', 'turn_completed']
    if (result.status === 'completed') {
      if ('code' in result || 'connection' in result || evidence.some(key => result[key] !== true)) throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
    } else if (!['failed', 'unconfirmed'].includes(result.status) || !onboardingFailureCodes.includes(result.code)
      || evidence.some(key => key in result)) throw new Error('OPENAGENT_ONBOARDING_INVALID_MESSAGE')
    if ('connection' in result) checkedConnection(result.connection)
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
