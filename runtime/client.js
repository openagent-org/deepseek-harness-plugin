// 由 scripts/build_client.mjs 生成；修改 browser / onboarding 的 client 与 protocol 源文件。
window.__ModuleLoader__.load({
  id: 'dsh-openagent',
  factory: require => {
    const browser = (() => {
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
function browserFailure(code) {
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

const browserRemote = {
  package: 'dsh-openagent',
  descriptors: [
    descriptor('watch', [parameter('clientId', identity)], message, { mode: 'stream', cancellation: { parameter: 'signal' } }),
    descriptor('claim', [parameter('clientId', identity), parameter('requestId', identity)], accepted),
    descriptor('respond', [parameter('clientId', identity), parameter('requestId', identity), parameter('receipt', receipt)], accepted),
  ],
}

function validateHandoffUrl(value) {
  if (typeof value !== 'string' || value.length > 16384) throw new Error('OPENAGENT_BROWSER_INVALID_HANDOFF')
  let parsed
  try { parsed = new URL(value) } catch { throw new Error('OPENAGENT_BROWSER_INVALID_HANDOFF') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash
    || !['/browser/handoff', '/openagent/agents'].includes(parsed.pathname)) {
    throw new Error('OPENAGENT_BROWSER_INVALID_HANDOFF')
  }
  return value
}


const name = 'openagent-browser-client'
const inject = ['remote', 'sidebarRight', 'sidebarRightTabs']

// 只观察 Harness 已提交的标签元数据，不访问 iframe/webview 或页面正文。
function createBrowserHandler(sidebar, tabTypes, document) {
  const owned = new Map()
  const completed = new Map()
  const visible = sessionId => document.visibilityState === 'visible' && sidebar.mounted.getSnapshot() === sessionId
  const tabs = sessionId => sidebar.openTabs.getSnapshot().filter(tab => tab.sessionId === sessionId)
  const reject = browserFailure

  const committed = (check, deadline, signal) => new Promise(resolve => {
    let done = false
    let unsubscribe = () => {}
    let timer
    const finish = value => {
      if (done) return
      done = true
      unsubscribe()
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      resolve(value)
    }
    const inspect = () => {
      const value = check()
      if (value) finish(value)
    }
    const abort = () => finish(reject('CLIENT_DISCONNECTED'))
    // 元数据通知可先于 navigation 回调；微任务检查读取同一提交的最终状态。
    unsubscribe = sidebar.openTabs.subscribe(() => queueMicrotask(inspect))
    timer = setTimeout(() => finish(reject('COMMIT_UNCONFIRMED')), Math.max(0, deadline - Date.now()))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else inspect()
  })

  async function perform(request, signal) {
    if (signal.aborted || Date.now() >= request.expiresAt) return reject('REQUEST_EXPIRED')
    if (!visible(request.sessionId)) return reject('SESSION_NOT_VISIBLE')
    if (request.type === 'open') {
      validateHandoffUrl(request.url)
      if (!tabTypes.get('browser')) return reject('BROWSER_UNAVAILABLE')
      const previous = new Set(tabs(request.sessionId).map(tab => tab.tabId))
      sidebar.openTab('browser', { params: { url: request.url } })
      return committed(() => {
        if (!visible(request.sessionId)) return reject('SESSION_CHANGED')
        const added = tabs(request.sessionId).filter(tab => tab.kind === 'browser' && !previous.has(tab.tabId))
        const matches = added.filter(tab => {
          try { return sidebar.tabDomain.occurrence(request.sessionId, { id: tab.tabId }).navigation.getSnapshot().params?.url === request.url }
          catch { return false }
        })
        if (matches.length > 1) return reject('COMMIT_AMBIGUOUS')
        if (matches.length !== 1) return undefined
        const tab = matches[0]
        if (!sidebar.isExpanded() || sidebar.active()?.id !== tab.tabId) return reject('TAB_NOT_VISIBLE')
        owned.set(request.tabHandle, { sessionId: request.sessionId, tabId: tab.tabId, contentId: tab.contentId })
        return { status: 'opened', tabId: tab.tabId }
      }, request.expiresAt, signal)
    }
    if (request.type === 'close') {
      const tab = owned.get(request.tabHandle)
      if (!tab || tab.sessionId !== request.sessionId) return reject('UNKNOWN_OWNED_TAB')
      const current = tabs(request.sessionId).find(item => item.tabId === tab.tabId)
      if (current && current.contentId !== tab.contentId) return reject('OWNERSHIP_CHANGED')
      if (current) sidebar.close(tab.tabId)
      return committed(() => {
        if (!visible(request.sessionId)) return reject('SESSION_CHANGED')
        if (tabs(request.sessionId).some(item => item.tabId === tab.tabId)) return undefined
        owned.delete(request.tabHandle)
        return { status: 'closed' }
      }, request.expiresAt, signal)
    }
    return reject('INVALID_REQUEST')
  }

  return (request, signal) => {
    if (!completed.has(request.requestId)) {
      completed.set(request.requestId, perform(request, signal).catch(() => reject('BROWSER_OPERATION_FAILED')))
    }
    return completed.get(request.requestId)
  }
}

async function apply(ctx) {
  await ctx.remote.$mount(browserRemote)
  await ctx.plugin({ inject: [...inject, 'remote.openagentBrowser'], apply: startClient })
}

function startClient(ctx) {
  const clientId = crypto.randomUUID()
  const handle = createBrowserHandler(ctx.sidebarRight, ctx.sidebarRightTabs, document)
  let stream
  let sessionId
  let disposed = false
  let changes = Promise.resolve()
  const synchronize = () => {
    changes = changes.then(async () => {
      const next = !disposed && document.visibilityState === 'visible' ? ctx.sidebarRight.mounted.getSnapshot() : undefined
      if (next === sessionId) return
      sessionId = next
      await stream?.dispose()
      stream = undefined
      if (!next) return
      const active = ctx.remote.$stream({
        name: 'OpenAgent browser',
        open: signal => ctx.remote.openagentBrowser.watch(next, clientId, signal),
        ended: () => new Error('OPENAGENT_BROWSER_STREAM_ENDED'),
      })
      stream = active
      void (async () => {
        for await (const item of active) {
          const request = item.value
          if (request.sessionId !== next) throw new Error('OPENAGENT_BROWSER_SESSION_MISMATCH')
          if (request.type === 'ready') { item.accept(); continue }
          // 副作用前向 Host 领取；排队期间已取消、过期或出现第二个窗口时不得开页。
          const claim = await ctx.remote.openagentBrowser.claim(next, clientId, request.requestId)
          if (!claim.ok || !claim.value.accepted) continue
          const receipt = await handle(request, item.signal)
          const answer = await ctx.remote.openagentBrowser.respond(next, clientId, request.requestId, receipt)
          if (!answer.ok || !answer.value.accepted) ctx.logger.warn('OPENAGENT_BROWSER_RECEIPT_UNCONFIRMED')
        }
      })().catch(() => {
        if (!active.signal.aborted) ctx.logger.warn('OPENAGENT_BROWSER_CLIENT_UNAVAILABLE')
      })
    }).catch(() => ctx.logger.warn('OPENAGENT_BROWSER_CLIENT_UNAVAILABLE'))
  }
  const unsubscribe = ctx.sidebarRight.mounted.subscribe(synchronize)
  document.addEventListener('visibilitychange', synchronize)
  ctx.effect(() => async () => {
    disposed = true
    unsubscribe()
    document.removeEventListener('visibilitychange', synchronize)
    await changes
    await stream?.dispose()
  }, 'openagent-browser.client')
  synchronize()
}

      return { name, inject, apply }
    })()
    const onboarding = (() => {
// 安装验收只传递固定语言、宿主生成的身份与脱敏回执；不接收业务提示词。
const onboardingSkills = [
  'openagent-first-task-router', 'openagent-guide-agent', 'openagent-query-account',
  'openagent-search-agent', 'openagent-run-agent',
]
const onboardingGuideTool = 'mcp__openagent__openagent_user_guide'
const onboardingAccountTool = 'mcp__openagent__openagent_account_credits'
const onboardingFailureCodes = [
  'NO_SESSION', 'NO_CLIENT', 'AMBIGUOUS_CLIENT', 'INVALID_LOCALE', 'MCP_UNAVAILABLE', 'SKILLS_UNAVAILABLE',
  'STATE_UNAVAILABLE', 'ONBOARDING_ALREADY_CLAIMED', 'NO_ATTEMPT', 'REQUEST_EXPIRED',
  'SESSION_NOT_VISIBLE', 'SESSION_CHANGED', 'CREATE_REJECTED', 'CREATE_UNCONFIRMED',
  'SESSION_ID_MISMATCH', 'TARGET_NOT_BLANK', 'TARGET_NOT_READY', 'AUTHORIZATION_REFUSED',
  'SEND_REJECTED', 'SEND_UNCONFIRMED', 'CLIENT_DISCONNECTED', 'BRIDGE_DISPOSED', 'CALL_CANCELLED',
  'VERIFICATION_TIMEOUT', 'GUIDE_SKILL_FAILED', 'GUIDE_FAILED', 'ACCOUNT_FAILED',
  'UNEXPECTED_TOOL', 'DUPLICATE_TOOL', 'PROMPT_MISMATCH', 'TURN_FAILED', 'EVIDENCE_MISSING',
  'CONNECTION_FAILED', 'CONNECTION_UNCONFIRMED',
]
function onboardingPrompt(locale) {
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
const onboardingConnectionCodes = [
  'AUTH_TIMEOUT', 'AUTH_REJECTED', 'NETWORK_TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR',
  'PROTOCOL_ERROR', 'DEPENDENCY_ERROR', 'LOGIN_FAILED', 'MCP_STARTUP_FAILED',
  'STATE_UNAVAILABLE', 'CONNECTION_STOPPED',
]
// 只提取已知错误类型与数字状态；不保留 message、stack、URL 或服务端正文。
function connectionFailure(error, stage, fallback = stage === 'mcp' ? 'MCP_STARTUP_FAILED' : 'LOGIN_FAILED') {
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
function checkedConnection(value) {
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
const onboardingRemote = {
  // Typert 按 package 独占注册，和已有 browserRemote 使用不同的贡献键。
  package: 'dsh-openagent-onboarding',
  descriptors: [
    descriptor('watch', [parameter('clientId', identity)], message, { mode: 'stream', cancellation: { parameter: 'signal' } }),
    descriptor('claim', [parameter('clientId', identity), parameter('requestId', identity)], accepted),
    descriptor('authorize', [parameter('clientId', identity), parameter('requestId', identity)], accepted),
    descriptor('respond', [parameter('clientId', identity), parameter('requestId', identity), parameter('receipt', receipt)], accepted),
  ],
}


const inject = ['remote', 'sidebarRight', 'sessions', 'uiWorkspace', 'conversation']
const failure = (code, status = 'unconfirmed') => ({ status, code })

// 只通过 Harness 的 Session/UI 服务新建与导航，不写已有输入框或读取业务正文。
function createOnboardingHandler(ctx, document) {
  const completed = new Map()
  const visible = id => document.visibilityState === 'visible' && ctx.sidebarRight.mounted.getSnapshot() === id
  const usable = (request, signal) => !signal.aborted && Date.now() < request.expiresAt
  const waitVisible = (request, signal) => new Promise(resolve => {
    let done = false
    let unsubscribe = () => {}
    let timer
    const finish = value => {
      if (done) return
      done = true
      unsubscribe()
      clearTimeout(timer)
      signal.removeEventListener('abort', inspect)
      document.removeEventListener('visibilitychange', inspect)
      resolve(value)
    }
    const inspect = () => {
      const selected = ctx.sidebarRight.mounted.getSnapshot()
      if (!usable(request, signal) || document.visibilityState !== 'visible') finish(false)
      else if (selected === request.targetSessionId) finish(true)
      else if (selected !== undefined && selected !== request.sessionId) finish(false)
    }
    unsubscribe = ctx.sidebarRight.mounted.subscribe(inspect)
    signal.addEventListener('abort', inspect, { once: true })
    document.addEventListener('visibilitychange', inspect)
    timer = setTimeout(() => finish(false), Math.max(0, request.expiresAt - Date.now()))
    inspect()
  })
  async function perform(request, signal, authorize) {
    if (!usable(request, signal)) return failure('REQUEST_EXPIRED', 'failed')
    if (!visible(request.sessionId)) return failure('SESSION_NOT_VISIBLE', 'failed')
    let target
    try {
      const location = request.workspaceId === undefined ? { cwd: request.cwd } : { workspaceId: request.workspaceId }
      target = await ctx.sessions.create({ sessionId: request.targetSessionId, ...location })
    }
    catch { return failure('CREATE_UNCONFIRMED') }
    if (target !== request.targetSessionId) return failure('SESSION_ID_MISMATCH')
    if (!usable(request, signal) || !visible(request.sessionId)) return failure('SESSION_CHANGED')
    const reference = ctx.sessions.retain(target, { source: 'controllerOperation', signal })
    try {
      const binding = await reference.ready
      const blank = () => {
        const state = binding.session.getSnapshot()
        const input = ctx.conversation.input.for(binding.ctx).state.getSnapshot()
        return state.openState === 'open' && state.blank && !state.running && !state.promptAttempted
          && state.pendingSubmissions.length === 0
          && input.draft === '' && input.attachmentIds.length === 0 && input.occurrences.length === 0 && input.phase === 'plain'
      }
      if (!usable(request, signal) || !visible(request.sessionId)) return failure('SESSION_CHANGED')
      if (!blank()) return failure('TARGET_NOT_BLANK', 'failed')
      ctx.uiWorkspace.openSession(target)
      // 由官方主区选择源确认导航提交；不把经过若干帧当作可见证明。
      if (!await waitVisible(request, signal)) return failure('SESSION_CHANGED')
      if (!blank()) return failure('TARGET_NOT_BLANK', 'failed')
      const permission = await authorize()
      if (!permission.ok || !permission.value.accepted) return failure('AUTHORIZATION_REFUSED')
      if (!usable(request, signal) || !visible(target) || !blank()) return failure('SESSION_CHANGED')
      // Host 预先生成身份；一次调用后无论回执如何都不重发，也不改写用户草稿。
      const result = await binding.session.prompt([{ type: 'text', text: onboardingPrompt(request.locale) }], 'queue', signal, request.promptId)
      if (!result.ok) return failure('SEND_UNCONFIRMED')
      return { status: 'submitted' }
    } catch { return failure('SEND_UNCONFIRMED') }
    finally { reference.release() }
  }
  return (request, signal, authorize) => {
    if (!completed.has(request.requestId)) completed.set(request.requestId, perform(request, signal, authorize))
    return completed.get(request.requestId)
  }
}

// 使用宿主的 React 单例；结果属于固定源轮次，按钮只导航已经创建的引导会话。
function createOnboardingResultCard(createElement) {
  return function OnboardingResultCard({ turn, useCompletion, openGuide }) {
    const completion = useCompletion(value => value)
    if (!completion || completion.sourceTurn !== turn.turn) return null
    const { result } = completion
    if (!['completed', 'failed', 'unconfirmed'].includes(result.status)) return null
    const english = completion.locale === 'en'
    if (result.status !== 'completed') {
      const connection = result.connection
      const connectionResult = ['CONNECTION_FAILED', 'CONNECTION_UNCONFIRMED'].includes(result.code)
      const title = connectionResult
        ? result.status === 'failed' ? (english ? 'OpenAgent connection failed' : 'OpenAgent 连接失败')
          : (english ? 'OpenAgent connection result unconfirmed' : 'OpenAgent 连接结果未确认')
        : result.status === 'failed' ? (english ? 'OpenAgent installation verification failed' : 'OpenAgent 安装验收未通过')
          : (english ? 'OpenAgent installation verification unconfirmed' : 'OpenAgent 安装验收结果未确认')
      const stages = english
        ? { preparing: 'Preparing connection', login: 'Signing in', waiting_authorization: 'Waiting for authorization', mcp: 'Loading tools' }
        : { preparing: '准备连接', login: '登录连接', waiting_authorization: '等待授权', mcp: '加载工具' }
      const reasons = english ? {
        AUTH_TIMEOUT: 'Authorization timed out. Check whether the browser authorization was completed.',
        AUTH_REJECTED: 'Authorization was rejected. Check the account and authorization permissions.',
        NETWORK_TIMEOUT: 'The connection timed out. Check the network and service availability.',
        NETWORK_ERROR: 'The service could not be reached. Check the network or proxy settings.',
        HTTP_ERROR: 'The service returned an error. Check the HTTP status and service availability.',
        PROTOCOL_ERROR: 'The service response was incompatible. Check the plugin and service versions.',
        DEPENDENCY_ERROR: 'A plugin dependency is unavailable or incompatible. Check the installation.',
        LOGIN_FAILED: 'Sign-in failed. Check the account and sign-in process.',
        MCP_STARTUP_FAILED: 'The tool connection could not start. Check the plugin installation and service connection.',
        STATE_UNAVAILABLE: 'The local connection state is unavailable. Check the profile directory and file permissions.',
        CONNECTION_STOPPED: 'The connection process stopped. Check whether Harness is still running.',
      } : {
        AUTH_TIMEOUT: '等待授权超时，请检查浏览器中的授权是否完成。',
        AUTH_REJECTED: '授权未通过，请检查登录账号及授权权限。',
        NETWORK_TIMEOUT: '连接超时，请检查网络及服务是否可用。',
        NETWORK_ERROR: '无法连接到服务，请检查网络或代理设置。',
        HTTP_ERROR: '服务返回错误，请根据 HTTP 状态检查服务是否可用。',
        PROTOCOL_ERROR: '服务响应不符合协议，请检查插件与服务版本是否兼容。',
        DEPENDENCY_ERROR: '插件依赖不可用或不兼容，请检查安装是否完整。',
        LOGIN_FAILED: '登录失败，请检查账号与登录流程。',
        MCP_STARTUP_FAILED: '工具连接未能启动，请检查插件安装和服务连接。',
        STATE_UNAVAILABLE: '无法读取本地连接状态，请检查 profile 目录及文件访问权限。',
        CONNECTION_STOPPED: '连接进程已停止，请检查 Harness 是否仍在运行。',
      }
      const reason = Object.hasOwn(reasons, connection?.code) ? reasons[connection.code] : undefined
      const detail = [Object.hasOwn(stages, connection?.stage) ? stages[connection.stage] : undefined,
        onboardingConnectionCodes.includes(connection?.code) ? connection.code
          : onboardingFailureCodes.includes(result.code) ? result.code : undefined,
        Number.isInteger(connection?.http_status) && connection.http_status >= 100 && connection.http_status <= 599
          ? `HTTP ${connection.http_status}` : undefined].filter(Boolean).join(' · ')
      return createElement('section', { role: 'status', 'data-openagent-install-result': result.request_id,
        style: { padding: '12px 14px', margin: '8px 0', border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: '12px', background: 'var(--dsw-alias-button-floating-fill)', color: 'var(--dsw-alias-label-primary)', fontSize: '13px' } },
      createElement('div', null, title),
      reason ? createElement('div', { style: { marginTop: '6px' } }, reason) : null,
      detail ? createElement('div', { style: { marginTop: '6px' } }, detail) : null,
      createElement('div', { style: { marginTop: '6px' } }, english
        ? 'This attempt has stopped without an automatic retry. Resolve the issue above; do not resend this onboarding prompt.'
        : '本次已停止，未自动重试。请处理上述问题，不要重复发送本次引导提示。'))
    }
    return createElement('section', {
      'data-openagent-install-result': result.request_id,
      style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px',
        justifyContent: 'space-between', padding: '12px 14px', margin: '8px 0',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px',
        background: 'var(--dsw-alias-button-floating-fill)', color: 'var(--dsw-alias-label-primary)' },
    }, createElement('span', { style: { fontSize: '13px' } },
      english ? 'OpenAgent installation and account verification passed' : 'OpenAgent 安装及账号验证通过'),
    createElement('button', {
      type: 'button', 'data-openagent-open-guide': result.session_id,
      onClick: () => openGuide(result.session_id),
      style: { flexShrink: 0, padding: '6px 10px', border: '1px solid var(--dsw-alias-border-l3)',
        borderRadius: '8px', background: 'transparent', color: 'inherit', font: 'inherit',
        fontSize: '13px', cursor: 'pointer' },
    }, english ? 'Open new user guide' : '打开新用户引导'))
  }
}

// 在缺少会话 UI 的 Host 上只挂起本功能，浏览器桥接仍可独立加载。
function applyOnboarding(ctx, createElement) {
  ctx.inject(inject, async scope => {
    await scope.remote.$mount(onboardingRemote)
    await scope.plugin({ inject: [...inject, 'remote.openagentOnboarding'], apply: client => startOnboardingClient(client, createElement) })
  })
}

function startOnboardingClient(ctx, createElement) {
  const page = document
  const clientId = crypto.randomUUID()
  const handle = createOnboardingHandler(ctx, page)
  const completions = new Map()
  const completionFor = id => {
    if (!completions.has(id)) {
      let value
      const listeners = new Set()
      completions.set(id, { getSnapshot: () => value,
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
        set: next => { value = next; for (const listener of listeners) listener() } })
    }
    return completions.get(id)
  }
  ctx.inject(['slots'], scope => {
    scope.slots.inject('conversation.chat.turnTail', () => scope.slots.register({
      name: 'conversation.chat.turnTail', id: 'openagent-installation-result', order: 30,
      inject: id => ({ hooks: { completion: completionFor(id) },
        openGuide: target => {
          const result = completionFor(id).getSnapshot()?.result
          if (result?.status === 'completed' && result.session_id === target) ctx.uiWorkspace.openSession(target)
        } }),
    }, createOnboardingResultCard(createElement)))
  })
  let stream
  let sessionId
  let pinned = false
  let disposed = false
  let changes = Promise.resolve()
  const synchronize = () => {
    changes = changes.then(async () => {
      if (pinned && !disposed) return
      const next = !disposed && page.visibilityState === 'visible' ? ctx.sidebarRight.mounted.getSnapshot() : undefined
      if (next === sessionId) return
      sessionId = next
      await stream?.dispose()
      stream = undefined
      if (!next) return
      const active = ctx.remote.$stream({ name: 'OpenAgent installation',
        open: signal => ctx.remote.openagentOnboarding.watch(next, clientId, signal),
        ended: () => new Error('OPENAGENT_ONBOARDING_STREAM_ENDED') })
      stream = active
      void (async () => {
        for await (const item of active) {
          const request = item.value
          if (request.sessionId !== next) throw new Error('OPENAGENT_ONBOARDING_SESSION_MISMATCH')
          if (request.type === 'ready') { completionFor(next).set(undefined); item.accept(); continue }
          if (request.type === 'completed') { completionFor(next).set(request.completion); item.accept(); continue }
          pinned = true
          try {
            const claim = await ctx.remote.openagentOnboarding.claim(next, clientId, request.requestId)
            if (!claim.ok || !claim.value.accepted) continue
            const receipt = await handle(request, item.signal,
              () => ctx.remote.openagentOnboarding.authorize(next, clientId, request.requestId))
            const answer = await ctx.remote.openagentOnboarding.respond(next, clientId, request.requestId, receipt)
            if (!answer.ok || !answer.value.accepted) ctx.logger.warn('OPENAGENT_ONBOARDING_RECEIPT_UNCONFIRMED')
            item.accept()
          } finally {
            pinned = false
            synchronize()
          }
        }
      })().catch(() => {
        if (!active.signal.aborted) ctx.logger.warn('OPENAGENT_ONBOARDING_CLIENT_UNAVAILABLE')
      })
    }).catch(() => ctx.logger.warn('OPENAGENT_ONBOARDING_CLIENT_UNAVAILABLE'))
  }
  const unsubscribe = ctx.sidebarRight.mounted.subscribe(synchronize)
  page.addEventListener('visibilitychange', synchronize)
  ctx.effect(() => async () => {
    disposed = true
    unsubscribe()
    page.removeEventListener('visibilitychange', synchronize)
    await changes
    await stream?.dispose()
    completions.clear()
  }, 'openagent-onboarding.client')
  synchronize()
}

      return { applyOnboarding }
    })()
    return { name: 'openagent-client', inject: ['remote'], async apply(ctx) {
      await ctx.plugin(browser)
      onboarding.applyOnboarding(ctx, require('react').createElement)
    } }
  },
})
