import { onboardingRemote, onboardingPrompt } from './onboarding-protocol.mjs'

const inject = ['remote', 'sidebarRight', 'sessions', 'uiWorkspace', 'conversation']
const failure = (code, status = 'unconfirmed') => ({ status, code })

// 只通过 Harness 的 Session/UI 服务新建与导航，不写已有输入框或读取业务正文。
export function createOnboardingHandler(ctx, document) {
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
    try { target = await ctx.sessions.create({ sessionId: request.targetSessionId, cwd: request.cwd }) }
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

// 在缺少会话 UI 的 Host 上只挂起本功能，浏览器桥接仍可独立加载。
export function applyOnboarding(ctx) {
  ctx.inject(inject, async scope => {
    await scope.remote.$mount(onboardingRemote)
    await scope.plugin({ inject: [...inject, 'remote.openagentOnboarding'], apply: startOnboardingClient })
  })
}

function startOnboardingClient(ctx) {
  const page = document
  const clientId = crypto.randomUUID()
  const handle = createOnboardingHandler(ctx, page)
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
          if (request.type === 'ready') { item.accept(); continue }
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
  }, 'openagent-onboarding.client')
  synchronize()
}
