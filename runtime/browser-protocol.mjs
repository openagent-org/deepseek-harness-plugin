// 两侧共享官方 Typert descriptor；严格 codec 只接受本桥接的字段。
const id = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) throw new Error('OPENAGENT_BROWSER_INVALID_ID')
  return value
}
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error('OPENAGENT_BROWSER_INVALID_MESSAGE')
  }
  return value
}
const codec = (name, parse) => ({ mode: 'strict', typeSymbol: `dsh-openagent#${name}`, create: () => ({ parse }) })
const identity = codec('Identity', id)
const uncertainCodes = ['CLIENT_DISCONNECTED', 'COMMIT_UNCONFIRMED', 'SESSION_CHANGED',
  'COMMIT_AMBIGUOUS', 'TAB_NOT_VISIBLE', 'BROWSER_OPERATION_FAILED']
const failureCodes = [...uncertainCodes, 'REQUEST_EXPIRED', 'SESSION_NOT_VISIBLE', 'BROWSER_UNAVAILABLE',
  'UNKNOWN_OWNED_TAB', 'OWNERSHIP_CHANGED', 'INVALID_REQUEST']
export function browserFailure(code) {
  if (!failureCodes.includes(code)) throw new Error('OPENAGENT_BROWSER_INVALID_RECEIPT')
  return { status: uncertainCodes.includes(code) ? 'unconfirmed' : 'failed', code }
}
const receipt = codec('Receipt', value => {
  exact(value, ['status', 'tabId', 'code'])
  if (!['opened', 'closed', 'failed', 'unconfirmed'].includes(value.status)) throw new Error('OPENAGENT_BROWSER_INVALID_RECEIPT')
  if (value.status === 'opened') id(value.tabId)
  if (['failed', 'unconfirmed'].includes(value.status) && browserFailure(value.code).status !== value.status) {
    throw new Error('OPENAGENT_BROWSER_INVALID_RECEIPT')
  }
  return value
})
const message = codec('Message', value => {
  exact(value, ['type', 'sessionId', 'requestId', 'tabHandle', 'url', 'expiresAt'])
  if (!['ready', 'open', 'close'].includes(value.type)) throw new Error('OPENAGENT_BROWSER_INVALID_MESSAGE')
  id(value.sessionId)
  if (value.type !== 'ready') {
    id(value.requestId)
    id(value.tabHandle)
    if (!Number.isFinite(value.expiresAt)) throw new Error('OPENAGENT_BROWSER_INVALID_DEADLINE')
  }
  if (value.type === 'open') validateHandoffUrl(value.url)
  return value
})
const accepted = codec('Accepted', value => {
  exact(value, ['accepted'])
  if (typeof value.accepted !== 'boolean') throw new Error('OPENAGENT_BROWSER_INVALID_ACK')
  return value
})
const agent = { name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent',
  codec: { ...identity, typeSymbol: '@deepseek-ai/dsh-session/types#SessionId' } }
const parameter = (name, codec) => ({ name, wire: name, source: 'json', codec })
const descriptor = (method, parameters, result, extra = {}) => ({
  id: `dsh-openagent#openagentBrowser/${method}`,
  service: 'openagentBrowser', namespace: 'openagentBrowser', method,
  invocation: { kind: 'direct' }, parameters: [agent, ...parameters], result, ...extra,
})

export const browserRemote = {
  package: 'dsh-openagent',
  descriptors: [
    descriptor('watch', [parameter('clientId', identity)], message, { mode: 'stream', cancellation: { parameter: 'signal' } }),
    descriptor('claim', [parameter('clientId', identity), parameter('requestId', identity)], accepted),
    descriptor('respond', [parameter('clientId', identity), parameter('requestId', identity), parameter('receipt', receipt)], accepted),
  ],
}

export function validateHandoffUrl(value) {
  if (typeof value !== 'string' || value.length > 16384) throw new Error('OPENAGENT_BROWSER_INVALID_HANDOFF')
  let parsed
  try { parsed = new URL(value) } catch { throw new Error('OPENAGENT_BROWSER_INVALID_HANDOFF') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash
    || !['/browser/handoff', '/openagent/agents'].includes(parsed.pathname)) {
    throw new Error('OPENAGENT_BROWSER_INVALID_HANDOFF')
  }
  return value
}
