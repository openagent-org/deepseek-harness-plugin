import { createHash, randomUUID } from 'node:crypto'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { browserRemote, validateHandoffUrl } from './browser-protocol.mjs'

const TIMEOUT_MS = 15000
const failure = code => ({ status: 'failed', code })
const sessionOf = execution => {
  if (!execution.agent?.id) throw new Error('OPENAGENT_BROWSER_NO_SESSION')
  return execution.agent.id
}
const handoffKey = (sessionId, selectionId, url) => createHash('sha256').update(JSON.stringify([sessionId, selectionId, url])).digest('hex')
const selectionKey = (sessionId, selectionId) => {
  if (typeof selectionId !== 'string' || !selectionId || selectionId.length > 512) throw new Error('OPENAGENT_BROWSER_INVALID_SELECTION')
  return JSON.stringify([sessionId, selectionId])
}

export class OpenAgentBrowser extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'openagentBrowser')
    this.clients = new Map()
    this.requests = new Map()
    this.handoffs = new Map()
    this.selections = new Map()
    this.tabs = new Map()
    ctx.effect(() => () => {
      for (const client of this.clients.values()) client.stop()
      for (const request of this.requests.values()) request.settle({ status: 'unconfirmed', code: 'BRIDGE_DISPOSED' })
      this.clients.clear()
      this.requests.clear()
      this.handoffs.clear()
      this.selections.clear()
      this.tabs.clear()
    }, 'openagent-browser.lifecycle')
  }

  async *watch(agent, clientId, signal) {
    const peer = this.ctx.invocation?.peer
    if (peer?.principal.kind !== 'owner') throw new Error('OPENAGENT_BROWSER_OWNER_REQUIRED')
    const sessionId = agent.id
    const key = `${peer.id}:${clientId}`
    if (this.clients.has(key)) throw new Error('OPENAGENT_BROWSER_DUPLICATE_CLIENT')
    const queue = []
    let wake
    let stopped = false
    const client = {
      key, clientId, peerId: peer.id, sessionId,
      send: value => { queue.push(value); wake?.(); wake = undefined },
      stop: () => { stopped = true; wake?.(); wake = undefined },
    }
    this.clients.set(key, client)
    const abort = () => client.stop()
    signal.addEventListener('abort', abort, { once: true })
    try {
      yield { type: 'ready', sessionId }
      while (!stopped && !signal.aborted) {
        if (!queue.length) await new Promise(resolve => { wake = resolve })
        while (queue.length && !stopped && !signal.aborted) yield queue.shift()
      }
    } finally {
      signal.removeEventListener('abort', abort)
      this.clients.delete(key)
      for (const request of this.requests.values()) {
        if (request.clientKey === key) request.settle({ status: 'unconfirmed', code: 'CLIENT_DISCONNECTED' })
      }
    }
  }

  claim(agent, clientId, requestId) {
    const peer = this.ctx.invocation?.peer
    const request = this.requests.get(requestId)
    if (peer?.principal.kind !== 'owner' || !request || request.sessionId !== agent.id || request.result
      || request.claimed || request.expiresAt <= Date.now() || request.clientKey !== `${peer.id}:${clientId}`) return { accepted: false }
    const clients = [...this.clients.values()].filter(client => client.sessionId === agent.id)
    if (clients.length !== 1 || clients[0].key !== request.clientKey) {
      request.settle(failure(clients.length ? 'AMBIGUOUS_CLIENT' : 'NO_CLIENT'))
      return { accepted: false }
    }
    request.claimed = true
    return { accepted: true }
  }

  respond(agent, clientId, requestId, receipt) {
    const peer = this.ctx.invocation?.peer
    const request = this.requests.get(requestId)
    if (peer?.principal.kind !== 'owner' || !request || request.sessionId !== agent.id
      || request.clientKey !== `${peer.id}:${clientId}` || !request.claimed || request.acknowledged) return { accepted: false }
    if ((request.type === 'open' && receipt.status === 'closed') || (request.type === 'close' && receipt.status === 'opened')) return { accepted: false }
    request.acknowledged = true
    let result
    if (receipt.status === 'opened') {
      this.tabs.set(request.tabHandle, { sessionId: request.sessionId, clientKey: request.clientKey, tabId: receipt.tabId, openRequest: request })
      result = { status: 'opened', tab_handle: request.tabHandle }
    } else if (receipt.status === 'closed') {
      const tab = this.tabs.get(request.tabHandle)
      if (tab) tab.openRequest.result = { status: 'closed', tab_handle: request.tabHandle }
      this.tabs.delete(request.tabHandle)
      result = { status: 'closed', tab_handle: request.tabHandle }
    } else result = { status: receipt.status, code: receipt.code }
    request.result = result
    request.settle(result)
    return { accepted: true }
  }

  async open(args, execution) {
    const sessionId = sessionOf(execution)
    const selection = selectionKey(sessionId, args.selection_id)
    this.selections.delete(selection)
    const url = validateHandoffUrl(args.handoff_url)
    const key = handoffKey(sessionId, args.selection_id, url)
    const previous = this.handoffs.get(key)
    if (previous) {
      this.selections.set(selection, previous)
      return previous.result ?? previous.promise
    }
    const clients = [...this.clients.values()].filter(client => client.sessionId === sessionId)
    if (clients.length !== 1) {
      const result = failure(clients.length ? 'AMBIGUOUS_CLIENT' : 'NO_CLIENT')
      this.selections.set(selection, { result })
      return result
    }
    const request = this.request(clients[0], 'open', randomUUID(), execution.signal, { url })
    this.handoffs.set(key, request)
    this.selections.set(selection, request)
    return request.promise
  }

  status(args, execution) {
    const key = selectionKey(sessionOf(execution), args.selection_id)
    return this.selections.get(key)?.result ?? { status: 'unconfirmed', code: 'NO_CONFIRMED_RECEIPT' }
  }

  async close(args, execution) {
    const sessionId = sessionOf(execution)
    const tab = this.tabs.get(args.tab_handle)
    if (!tab || tab.sessionId !== sessionId) return failure('UNKNOWN_OWNED_TAB')
    const client = this.clients.get(tab.clientKey)
    if (!client || client.sessionId !== sessionId) return { status: 'unconfirmed', code: 'NO_CLIENT' }
    if (tab.closeRequest) return tab.closeRequest.result ?? tab.closeRequest.promise
    tab.closeRequest = this.request(client, 'close', args.tab_handle, execution.signal)
    return tab.closeRequest.promise
  }

  request(client, type, tabHandle, signal, payload = {}) {
    const requestId = randomUUID()
    const request = { type, requestId, tabHandle, clientKey: client.key, sessionId: client.sessionId,
      acknowledged: false, claimed: false, expiresAt: Date.now() + TIMEOUT_MS }
    let complete
    request.promise = new Promise(resolve => { complete = resolve })
    let settled = false
    const abort = () => request.settle({ status: 'unconfirmed', code: 'CALL_CANCELLED' })
    const timer = setTimeout(() => request.settle({ status: 'unconfirmed', code: 'RECEIPT_TIMEOUT' }), TIMEOUT_MS)
    request.settle = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      request.result = result
      complete(result)
    }
    this.requests.set(requestId, request)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else client.send({ type, requestId, tabHandle, sessionId: client.sessionId, expiresAt: request.expiresAt, ...payload })
    return request
  }
}

export const inject = ['tools', 'typert']
export async function apply(ctx) {
  await ctx.plugin(OpenAgentBrowser)
  ctx.typert.register({ package: browserRemote.package, face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] }, invocations: browserRemote.descriptors })
  await ctx.plugin({ inject: ['tools', 'openagentBrowser'], apply: registerTools })
}

function registerTools(ctx) {
  const handoff = {
    selection_id: { type: 'string', required: true, description: '服务器返回的原 selection_id。' },
    handoff_url: { type: 'string', required: true, description: '同一结果返回的原始 HTTPS handoff_url；不要修改。' },
  }
  for (const [method, description, parameters] of [
    ['open', '在当前会话唯一可见的 Harness 右侧浏览器打开 OpenAgent 选择页。opened 只确认标签提交，未确认网页加载。失败或未确认时不要重开。', handoff],
    ['status', '只读取本会话该选择最近一次 OpenAgent 开页请求的安全回执；用于一次超时恢复，不打开或读取网页，不返回 URL。', { selection_id: handoff.selection_id }],
    ['close', '仅关闭本流程创建且已确认的 OpenAgent 标签；只接受 open/status 返回的 tab_handle。', {
      tab_handle: { type: 'string', required: true, description: '当前流程 open/status 返回的 owned tab_handle。' },
    }],
  ]) {
    ctx.tools.register(defineTool({
      name: `openagent_browser_${method}`, description, parameters,
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: (args, execution) => ctx.openagentBrowser[method](args, execution),
      presentCall: () => ({ card: 'generic', title: 'OpenAgent 选择页' }),
    }))
  }
}
