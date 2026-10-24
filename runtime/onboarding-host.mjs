import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createOnboardingStore } from './post-install.mjs'
import { onboardingRemote, onboardingPrompt, onboardingSkills, onboardingGuideTool, onboardingAccountTool } from './onboarding-protocol.mjs'

const TIMEOUT_MS = 600000
const PENDING_POLL_MS = 2000
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exactArgs = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const sourceId = execution => execution.agent?.id
const receipt = (record, status, code) => ({ status, request_id: record.requestId, session_id: record.targetSessionId, ...(code ? { code } : {}) })

// canonical value 只在官方 tools/result 中读取；不从 Assistant 正文或泛化报错猜测成功。
export function onboardingBusinessResult(result) {
  if (result.isError !== false || !object(result.value)) return undefined
  const value = result.value
  let data
  if (Object.hasOwn(value, 'structuredContent')) data = value.structuredContent
  else {
    const text = Array.isArray(value.content) ? value.content.filter(block => block?.type === 'text') : []
    if (text.length !== 1 || typeof text[0].text !== 'string') return undefined
    try { data = JSON.parse(text[0].text) } catch { return undefined }
  }
  return object(data) && !Object.hasOwn(data, 'error') && data.isError !== true ? data : undefined
}

export class OpenAgentOnboarding extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'openagentOnboarding')
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    this.store = createOnboardingStore({ profileDir: ctx.profileContext.dir, version })
    this.clients = new Map()
    this.requests = new Map()
    this.sources = new Map()
    this.targets = new Map()
    this.resuming = new Set()
    this.lifetime = new AbortController()
    ctx.on('session/created', session => {
      const request = this.targets.get(session.id)
      if (request && !request.target && !request.result) request.target = session
    })
    ctx.on('session/event', (session, event) => this.observeEvent(session, event))
    ctx.tools.guard(execution => this.beforeTool(execution))
    ctx.on('tools/result', (execution, result) => { this.observeTool(execution, result) })
    ctx.on('agent/status', ({ agent, status }) => { if (status === 'idle') void this.resumePending(agent) })
    const resumeVisible = () => {
      for (const id of new Set([...this.clients.values()].map(client => client.sessionId))) {
        const agent = this.ctx.agents.get(id)
        if (agent) void this.resumePending(agent)
      }
    }
    ctx.on('openagent/connection', resumeVisible)
    ctx.effect(() => {
      // 连接终态立即唤醒；轮询仅兜底观察外部 CLI 晚写入的预约。
      const pendingTimer = setInterval(resumeVisible, PENDING_POLL_MS)
      pendingTimer.unref()
      return () => {
        clearInterval(pendingTimer)
        this.lifetime.abort()
        for (const request of this.requests.values()) request.finish('unconfirmed', 'BRIDGE_DISPOSED')
        for (const client of this.clients.values()) client.stop()
        this.clients.clear()
      }
    }, 'openagent-onboarding.lifecycle')
  }

  async *watch(agent, clientId, signal) {
    const peer = this.ctx.invocation?.peer
    if (peer?.principal.kind !== 'owner') throw new Error('OPENAGENT_ONBOARDING_OWNER_REQUIRED')
    const key = `${peer.id}:${clientId}`
    if (this.clients.has(key)) throw new Error('OPENAGENT_ONBOARDING_DUPLICATE_CLIENT')
    const queue = []
    let wake
    let stopped = false
    let completionId
    const client = { key, sessionId: agent.id,
      send: value => {
        if (value.type === 'completed') {
          if (completionId === value.completion.result.request_id) return
          completionId = value.completion.result.request_id
        }
        queue.push(value); wake?.(); wake = undefined
      },
      stop: () => { stopped = true; wake?.(); wake = undefined } }
    this.clients.set(key, client)
    const abort = () => client.stop()
    signal.addEventListener('abort', abort, { once: true })
    try {
      yield { type: 'ready', sessionId: agent.id }
      try {
        const completion = await this.store.readCompletion(agent.id)
        if (completion) client.send({ type: 'completed', sessionId: agent.id, completion })
      } catch { this.ctx.logger.warn('OPENAGENT_ONBOARDING_COMPLETION_UNAVAILABLE') }
      void this.resumePending(agent)
      while (!stopped && !signal.aborted) {
        if (!queue.length) await new Promise(resolve => { wake = resolve })
        while (queue.length && !stopped && !signal.aborted) yield queue.shift()
      }
    } finally {
      signal.removeEventListener('abort', abort)
      this.clients.delete(key)
      for (const request of this.requests.values()) {
        // 新会话提交后，Client 正常转去观察新会话；验收继续由 Host 完成。
        if (request.clientKey === key && !request.submitted) request.finish('unconfirmed', 'CLIENT_DISCONNECTED')
      }
    }
  }

  matchingClient(agent, clientId, requestId) {
    const peer = this.ctx.invocation?.peer
    const request = this.requests.get(requestId)
    if (peer?.principal.kind !== 'owner' || !request || request.sourceId !== agent.id
      || request.clientKey !== `${peer.id}:${clientId}` || request.result || request.expiresAt <= Date.now()) return undefined
    return request
  }

  async claim(agent, clientId, requestId) {
    const request = this.matchingClient(agent, clientId, requestId)
    if (!request || request.claimed) return { accepted: false }
    request.claimed = true
    const connection = await this.connectionDetails()
    if (this.matchingClient(agent, clientId, requestId) !== request || this.finishConnection(request, connection)) return { accepted: false }
    const clients = this.visibleClients(agent.id)
    if (clients.length !== 1 || clients[0].key !== request.clientKey) {
      request.finish('failed', clients.length ? 'AMBIGUOUS_CLIENT' : 'NO_CLIENT')
      return { accepted: false }
    }
    return { accepted: true }
  }

  async authorize(agent, clientId, requestId) {
    const request = this.matchingClient(agent, clientId, requestId)
    if (!request?.claimed || request.authorized) return { accepted: false }
    // 领取发生在任何 await 之前；第二个窗口或重入不能再获得发送许可。
    request.authorized = true
    const target = this.ctx.agents.get(request.record.targetSessionId)
    if (!request.target || target?.session !== request.target || request.target.snapshotEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'user')) {
      request.finish('failed', 'TARGET_NOT_READY')
      return { accepted: false }
    }
    const failure = await this.readiness(target, request.signal)
    const connection = await this.connectionDetails()
    if (this.finishConnection(request, connection)) return { accepted: false }
    if (failure || request.result || request.signal.aborted || request.expiresAt <= Date.now()) {
      request.finish('failed', failure ?? 'REQUEST_EXPIRED')
      return { accepted: false }
    }
    if (this.ctx.agents.get(target.id) !== target || this.ctx.sessions.get(target.id) !== request.target
      || target.session !== request.target || this.visibleClients(agent.id).length !== 1
      || this.visibleClients(agent.id)[0].key !== request.clientKey
      || request.target.snapshotEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'user')) {
      request.finish('failed', 'TARGET_NOT_READY')
      return { accepted: false }
    }
    request.targetAgent = target
    return { accepted: true }
  }

  respond(agent, clientId, requestId, answer) {
    const request = this.matchingClient(agent, clientId, requestId)
    if (!request?.claimed || request.responded) return { accepted: false }
    request.responded = true
    if (answer.status === 'submitted' && request.authorized) {
      request.submitted = true
      this.completeIfVerified(request)
    } else request.finish(answer.status === 'failed' ? 'failed' : 'unconfirmed', answer.code ?? 'AUTHORIZATION_REFUSED')
    return { accepted: true }
  }

  visibleClients(id) { return [...this.clients.values()].filter(client => client.sessionId === id) }

  hasRequiredTools(agent) { return [onboardingGuideTool, onboardingAccountTool, 'skill'].every(name => this.ctx.tools.get(name, agent)) }

  pendingClient(agent, key) {
    if (this.lifetime.signal.aborted || this.ctx.agents.get(agent.id) !== agent || agent.status !== 'idle'
      || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) return undefined
    const clients = this.visibleClients(agent.id)
    return clients.length === 1 && (key === undefined || clients[0].key === key) ? clients[0] : undefined
  }

  async connectionDetails() {
    try { return await this.store.connectionDetails() }
    catch { return { status: 'unconfirmed', code: 'STATE_UNAVAILABLE' } }
  }

  waitForConnection(request) {
    return new Promise(resolve => {
      let done = false
      const finish = connection => {
        if (done) return
        done = true
        clearInterval(timer)
        unsubscribe()
        resolve(connection)
      }
      const inspect = async () => {
        if (done) return
        const connection = await this.connectionDetails()
        if (request.result || !['not_started', 'connecting'].includes(connection.status)) finish(connection)
      }
      const unsubscribe = this.ctx.on('openagent/connection', inspect)
      const timer = setInterval(inspect, PENDING_POLL_MS)
      timer.unref()
      // 取消、超时和卸载沿用本次请求的终态，清理等待后绝不补发。
      void request.promise.then(() => finish())
      void inspect()
    })
  }

  finishConnection(request, connection) {
    if (connection.status === 'ready') return false
    request.finish(connection.status === 'failed' ? 'failed' : 'unconfirmed',
      connection.status === 'failed' ? 'CONNECTION_FAILED' : 'CONNECTION_UNCONFIRMED', connection)
    return true
  }

  async readiness(agent, signal) {
    if (!this.hasRequiredTools(agent)) return 'MCP_UNAVAILABLE'
    try {
      const snapshot = await this.ctx.skills.snapshot({ scope: agent, cwd: this.ctx.workingDirectory.get(agent.session), signal })
      if (!snapshot.complete || !onboardingSkills.every(name => snapshot.skills.some(skill => skill.name === name && skill.provider === 'openagent' && skill.invocation.modelInvocable))) return 'SKILLS_UNAVAILABLE'
    } catch { return 'SKILLS_UNAVAILABLE' }
  }

  async start(args, execution, prepared, preparedExpiresAt = Infinity) {
    const id = sourceId(execution)
    if (!id || this.ctx.agents.get(id) !== execution.agent) return { status: 'failed', code: 'NO_SESSION' }
    if (this.sources.has(id)) return this.sources.get(id).promise
    const record = { ...(prepared ?? { requestId: randomUUID(), targetSessionId: randomUUID(), promptId: randomUUID(), locale: args.locale }) }
    try { onboardingPrompt(record.locale) } catch { return receipt(record, 'failed', 'INVALID_LOCALE') }
    const signal = AbortSignal.any([execution.signal, this.lifetime.signal])
    let clientKey
    let canReserve
    if (prepared) {
      const client = this.pendingClient(execution.agent)
      if (!client) return
      let connection = await this.connectionDetails()
      if (connection.status === 'ready') {
        const unavailable = await this.readiness(execution.agent, signal)
        connection = await this.connectionDetails()
        if (connection.status === 'ready' && unavailable) return
      }
      if (!['ready', 'failed', 'unconfirmed'].includes(connection.status)) return
      clientKey = client.key
      canReserve = () => !signal.aborted && Date.now() < preparedExpiresAt
        && this.pendingClient(execution.agent, clientKey) !== undefined
        && (connection.status !== 'ready' || this.hasRequiredTools(execution.agent))
      if (!canReserve()) return
    }
    // 只保存实际领取时源会话的可信轮次；后续聊天不会改变完成入口的位置。
    delete record.sourceTurn
    const sourceTurn = execution.agent.session.snapshotEvents().findLast(event => event.type === 'turn/start')?.data.turn
    if (Number.isSafeInteger(sourceTurn) && sourceTurn > 0) record.sourceTurn = sourceTurn
    let reserved
    try { reserved = await this.store.reserve(id, record, canReserve) } catch { return receipt(record, 'failed', 'STATE_UNAVAILABLE') }
    if (reserved.deferred) return
    if (!reserved.reserved) return reserved.result
    let resolve
    const promise = new Promise(done => { resolve = done })
    const request = { sourceId: id, record, promise, signal, expiresAt: Math.min(Date.now() + TIMEOUT_MS, preparedExpiresAt),
      calls: new Map(), skills: new Set(), guard: true }
    const abort = () => request.finish('unconfirmed', 'CALL_CANCELLED')
    const timer = setTimeout(() => request.finish('unconfirmed', 'VERIFICATION_TIMEOUT'), Math.max(0, request.expiresAt - Date.now()))
    request.finish = (status, code, connection) => {
      if (request.result) return
      request.result = { ...receipt(record, status, code), ...(connection ? { connection } : {}) }
      if (status === 'completed') Object.assign(request.result, { guide_loaded: true, guide_success: true, account_success: true, turn_completed: true })
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      void this.store.complete(id, request.result).then(result => {
        if (record.sourceTurn === undefined) return
        const completion = { sourceTurn: record.sourceTurn, locale: record.locale, result }
        for (const client of this.visibleClients(id)) client.send({ type: 'completed', sessionId: id, completion })
      }).catch(() => {
        request.result = receipt(record, 'unconfirmed', 'STATE_UNAVAILABLE')
      }).finally(() => { request.persisted = true; resolve(request.result) })
    }
    this.sources.set(id, request)
    this.requests.set(record.requestId, request)
    this.targets.set(record.targetSessionId, request)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    // 原生验收工具保持原安装轮进行中；连接就绪后直接创建新会话，无需先等原轮 idle。
    let connection = prepared ? await this.connectionDetails() : await this.waitForConnection(request)
    if (request.result || this.finishConnection(request, connection)) return promise
    const unavailable = await this.readiness(execution.agent, signal)
    connection = await this.connectionDetails()
    if (request.result || this.finishConnection(request, connection)) return promise
    if (request.expiresAt <= Date.now()) request.finish('failed', 'REQUEST_EXPIRED')
    else if (prepared && !this.pendingClient(execution.agent, clientKey)) request.finish('failed', 'TARGET_NOT_READY')
    else if (unavailable) request.finish('failed', unavailable)
    else {
      const clients = this.visibleClients(id)
      if (clients.length !== 1) request.finish('failed', clients.length ? 'AMBIGUOUS_CLIENT' : 'NO_CLIENT')
      else if (this.ctx.sessions.get(record.targetSessionId)) request.finish('failed', 'TARGET_NOT_BLANK')
      else {
        request.clientKey = clients[0].key
        let location
        try {
          const workspace = this.ctx.workspaceRegistry.list().find(item => item.sessionIds.includes(id))
          location = workspace ? { workspaceId: workspace.id } : { cwd: this.ctx.workingDirectory.get(execution.agent.session) }
        } catch { request.finish('failed', 'STATE_UNAVAILABLE'); return promise }
        clients[0].send({ type: 'verify', sessionId: id, requestId: record.requestId,
          targetSessionId: record.targetSessionId, promptId: record.promptId, locale: record.locale,
          ...location, expiresAt: request.expiresAt })
      }
    }
    return promise
  }

  async status(_args, execution) {
    const id = sourceId(execution)
    if (!id || this.ctx.agents.get(id) !== execution.agent) return { status: 'failed', code: 'NO_SESSION' }
    const current = this.sources.get(id)
    if (current) return current.persisted ? current.result : receipt(current.record, 'unconfirmed', 'ONBOARDING_ALREADY_CLAIMED')
    try {
      const result = await this.store.read(id) ?? await this.store.pendingStatus(id)
      if (result) return result
      const connection = await this.connectionDetails()
      return { status: 'failed', code: 'NO_ATTEMPT', connection_status: connection.status, connection }
    }
    catch { return { status: 'unconfirmed', code: 'STATE_UNAVAILABLE' } }
  }

  async resumePending(agent) {
    if (this.resuming.has(agent.id) || !this.pendingClient(agent)) return
    this.resuming.add(agent.id)
    try {
      const entry = (await this.store.pending()).find(item => item.sourceSessionId === agent.id && item.expiresAt > Date.now())
      if (entry && this.pendingClient(agent)) {
        await this.start({ locale: entry.record.locale }, { agent, signal: this.lifetime.signal }, entry.record, entry.expiresAt)
      }
    } catch { this.ctx.logger.warn('OPENAGENT_ONBOARDING_PENDING_UNAVAILABLE') }
    finally { this.resuming.delete(agent.id) }
  }

  beforeTool(execution) {
    const request = this.targets.get(execution.agent?.id)
    if (!request?.guard || !request.admitted) return
    const deny = code => {
      request.finish('failed', code)
      return '本次安装验收只允许按顺序加载 OpenAgent 引导并各验证一次引导和账号；失败后不重试。'
    }
    const args = execution.arguments
    let kind
    if (execution.name === 'skill' && args?.name === 'openagent-guide-agent') {
      if (request.result) return deny('UNEXPECTED_TOOL')
      if (request.skills.has(args.name)) return deny('DUPLICATE_TOOL')
      if (!exactArgs(args, ['name'])) return deny('GUIDE_SKILL_FAILED')
      request.skills.add(args.name)
      kind = 'skill'
    } else if (execution.name === onboardingGuideTool) {
      if (request.result) return deny('UNEXPECTED_TOOL')
      if (request.guideCall) return deny('DUPLICATE_TOOL')
      if (!request.guideLoaded || !exactArgs(args, ['mode', 'locale', 'idempotency_key']) || args.mode !== 'onboarding'
        || args.locale !== (request.record.locale === 'en' ? 'en-US' : 'zh-CN') || typeof args.idempotency_key !== 'string'
        || !/^[A-Za-z0-9_-]{16,128}$/.test(args.idempotency_key)) return deny('GUIDE_FAILED')
      request.guideCall = true
      kind = 'guide'
    } else if (execution.name === onboardingAccountTool) {
      if (request.result) return deny('UNEXPECTED_TOOL')
      if (request.accountCall) return deny('DUPLICATE_TOOL')
      if (!request.guideOk || !exactArgs(args, [])) return deny('ACCOUNT_FAILED')
      request.accountCall = true
      kind = 'account'
    } else if (execution.name.startsWith('mcp__openagent__')) return deny('UNEXPECTED_TOOL')
    // Harness 的 PTC 容器、原生读文件和其他 Skill 保持宿主原有行为。
    // 实际嵌套的 OpenAgent 调用仍会经过同一 ToolRuntime 检查。
    else return
    request.calls.set(execution.callId, kind)
  }

  observeTool(execution, result) {
    const request = this.targets.get(execution.agent?.id)
    if (!request || request.result || request.targetAgent !== execution.agent || !request.admitted || request.ended) return
    const kind = request.calls.get(execution.callId)
    if (!kind) return
    request.calls.delete(execution.callId)
    if (kind === 'skill') {
      if (result.isError === false && result.value?.name === 'openagent-guide-agent' && result.value.provider === 'openagent') request.guideLoaded = true
      else request.finish('failed', 'GUIDE_SKILL_FAILED')
    } else {
      const data = onboardingBusinessResult(result)
      if (kind === 'guide' && data?.view === 'onboarding' && data.status === 'ready') request.guideOk = true
      else if (kind === 'account' && data?.success === true) request.accountOk = true
      else request.finish('failed', kind === 'guide' ? 'GUIDE_FAILED' : 'ACCOUNT_FAILED')
    }
  }

  observeEvent(session, event) {
    const request = this.targets.get(session.id)
    if (!request || request.target !== session) return
    if (event.type === 'turn/start') request.currentTurn = event.data.turn
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const content = event.data.content
      if (request.admitted || !request.authorized || event.data.source.rpcId !== request.record.promptId
        || !Array.isArray(content) || content.length !== 1 || content[0].type !== 'text'
        || content[0].text !== onboardingPrompt(request.record.locale) || !Number.isInteger(request.currentTurn)) {
        request.finish('failed', 'PROMPT_MISMATCH')
      } else { request.admitted = true; request.turn = request.currentTurn }
    }
    if (event.type === 'turn/end' && event.data.turn === request.turn) {
      request.guard = false
      request.ended = true
      if (event.data.reason.kind !== 'completed') request.finish('failed', 'TURN_FAILED')
      else if (!request.guideLoaded || !request.guideOk || !request.accountOk) request.finish('failed', 'EVIDENCE_MISSING')
      else this.completeIfVerified(request)
    }
  }

  completeIfVerified(request) {
    if (request.submitted && request.admitted && request.ended && request.guideLoaded && request.guideOk && request.accountOk) request.finish('completed')
  }
}

export const inject = ['tools', 'skills', 'typert', 'agents', 'sessions', 'profileContext', 'workingDirectory', 'workspaceRegistry']
export async function apply(ctx) {
  await ctx.plugin(OpenAgentOnboarding)
  ctx.typert.register({ package: onboardingRemote.package, face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] }, invocations: onboardingRemote.descriptors })
  await ctx.plugin({ inject: ['tools', 'openagentOnboarding'], apply: scope => {
    for (const [method, tool, description, parameters] of [
      ['start', 'openagent_install_verify', '仅用于用户已授权的 OpenAgent 安装验收：保持当前安装轮进行中，等待同一次连接就绪后，在唯一可见窗口新建对话并发送一次固定新用户引导。最多等待600秒；只在真实引导、账号工具成功且该轮完成后确认成功。失败、取消或未知不得重试，改用 status。', { locale: { type: 'string', enum: ['zh-CN', 'en'], required: true } }],
      ['status', 'openagent_install_status', '只读取本安装会话已发起验收的脱敏状态，不创建对话、不重发引导。', {}],
    ]) scope.tools.register(defineTool({ name: tool, description, parameters,
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: (args, execution) => scope.openagentOnboarding[method](args, execution),
      presentCall: () => ({ card: 'generic', title: 'OpenAgent 安装验收' }),
    }))
  } })
}
