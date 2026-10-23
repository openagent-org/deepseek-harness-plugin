// 由 scripts/build_client.mjs 生成；修改 browser-client.mjs / browser-protocol.mjs。
window.__ModuleLoader__.load({
  id: 'dsh-openagent',
  factory: () => {
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
  },
})
