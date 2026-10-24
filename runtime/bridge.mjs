import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { connectionFailure } from './onboarding-protocol.mjs'

// 这是经过回归验证的 npm 0.1.38 制品接口，不是可随上游升级的公开 API。
// 固定模块路径及运行版本；不搜索新 chunk、不修改依赖源码、不迁移认证内容。
export const authRuntimeVersion = '0.1.37'
const diagnosticCodes = new Set(['OPENAGENT_MCP_LOGIN_REQUIRED', 'OPENAGENT_MCP_PREFLIGHT_TIMEOUT',
  'OPENAGENT_MCP_PROTOCOL_CHANGED', 'OPENAGENT_MCP_PROTOCOL_ERROR', 'OPENAGENT_MCP_REPLAY_BLOCKED',
  'OPENAGENT_MCP_REQUEST_STOPPED', 'OPENAGENT_MCP_DUPLICATE_REQUEST'])
export async function loadBridgeRuntime() {
  const require = createRequire(import.meta.url)
  const manifest = JSON.parse(await readFile(require.resolve('mcp-remote/package.json'), 'utf8'))
  if (manifest.version !== '0.1.38') throw new Error('OpenAgent OAuth 桥接依赖版本不兼容。')
  const runtime = await import(pathToFileURL(require.resolve('mcp-remote/dist/chunk-65X3S4HB.js')).href)
  const required = ['NodeOAuthClientProvider', 'connectToRemoteServer', 'createLazyAuthCoordinator',
    'discoverOAuthServerInfo', 'parseCommandLineArgs']
  if (runtime.version !== authRuntimeVersion || required.some(name => typeof runtime[name] !== 'function')) {
    throw new Error('OpenAgent OAuth 桥接接口不兼容。')
  }
  return runtime
}

export function bridgeTransports(local, remote, { onFailure = () => {}, onClosed = () => {} } = {}) {
  const pending = new Set()
  let initializeId
  let closing
  const close = () => {
    if (!closing) closing = Promise.resolve().then(async () => {
      await Promise.allSettled([local.close(), remote.close()])
      onClosed()
    })
    return closing
  }
  let failed = false
  const fail = async error => {
    if (failed || closing) return
    failed = true
    onFailure(error)
    const http = Number.isInteger(error?.code) && error.code >= 100 && error.code <= 599 ? error.code : undefined
    const data = { connection_code: connectionFailure(error, 'mcp').code,
      ...(diagnosticCodes.has(error?.code) ? { code: error.code } : {}), ...(http ? { http_status: http } : {}) }
    await Promise.allSettled([...pending].map(id => local.send({ jsonrpc: '2.0', id, error: {
      code: -32000, message: (remote.wasSent?.(id) === false
        ? error?.code === 'OPENAGENT_MCP_LOGIN_REQUIRED'
          ? 'OpenAgent 当前凭据无法静默刷新，请由用户手动登录并完成授权；该请求尚未发送，不会自动重试。'
          : 'OpenAgent MCP 请求尚未发送，连接未完成；不会自动重试。'
        : 'OpenAgent MCP 连接中断，调用结果未确认；不会自动重试。') + (http ? `（HTTP ${http}）` : ''),
      ...(Object.keys(data).length ? { data } : {}),
    } })))
    pending.clear()
    await close()
  }
  local.onmessage = message => {
    if (failed || closing) return
    if (message.method && message.id !== undefined) pending.add(message.id)
    if (message.method === 'initialize') initializeId = message.id
    if (message.method === 'notifications/cancelled') pending.delete(message.params?.requestId)
    // 不串行等待长时间 tools/call，取消通知必须能立即转发。
    Promise.resolve().then(() => remote.send(message)).catch(fail)
  }
  remote.onmessage = message => {
    if (failed || closing) return
    if (initializeId !== undefined && message.id === initializeId && !message.method) {
      initializeId = undefined
      if (typeof message.result?.protocolVersion === 'string') remote.setProtocolVersion(message.result.protocolVersion)
    }
    // JSON-RPC error 与 result 都完整交给 Host；不假定 tools/list 一定有 result.tools。
    if (!message.method && message.id !== undefined) pending.delete(message.id)
    Promise.resolve().then(() => local.send(message)).catch(fail)
  }
  local.onerror = fail
  remote.onerror = fail
  local.onclose = close
  remote.onclose = () => { if (pending.size) void fail(); else void close() }
  return close
}

// 只适配固定 OpenAgent 入口：它不支持独立 GET 或 GET 响应恢复，POST SSE 仍交给官方 SDK。
// 所有 Host ID 都映射为 wire ID；内部 ping/initialize 不进入 Host 的请求编号空间。
export async function createSessionTransport({ serverUrl, provider, headers, initializeAuth, status = () => {} }) {
  const { StreamableHTTPClientTransport, StreamableHTTPError } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const { UnauthorizedError } = await import('@modelcontextprotocol/sdk/client/auth.js')
  const requests = new Map()
  const wireRequests = new Map()
  let nextId = 0
  let generation
  let initial
  let gate = Promise.resolve()
  let stopped = false
  const safeError = code => Object.assign(new Error('OpenAgent MCP 连接未完成。'), { code })
  const forget = record => { requests.delete(record.hostId); wireRequests.delete(record.wireId) }
  const inFlight = () => [...wireRequests.values()].some(record => record.dispatched)
  const fail = error => { if (!stopped) { stopped = true; transport.onerror?.(error) } }
  const rejectUnsent = record => {
    forget(record)
    if (!record.cancelled) transport.onmessage?.({ jsonrpc: '2.0', id: record.hostId, error: {
      code: -32000, message: 'OpenAgent MCP 请求尚未发送；旧会话仍有未确认请求，不能自动更换会话。（HTTP 404）',
      data: { code: 'session_not_found', http_status: 404 },
    } })
  }

  const makeGeneration = async () => {
    const current = { internal: new Map(), handled: new WeakSet() }
    current.transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      authProvider: provider && new Proxy(provider, { get(target, key) {
        const value = Reflect.get(target, key, target)
        if (typeof value !== 'function') return value
        if (key === 'saveCodeVerifier' || key === 'redirectToAuthorization') return (...args) => {
          // 已连接后的预检只允许静默刷新；需要重新同意时交给用户显式登录。
          if (initial) throw safeError('OPENAGENT_MCP_LOGIN_REQUIRED')
          return value.apply(target, args)
        }
        return value.bind(target)
      } }), requestInit: { headers },
      fetch: async (url, options = {}) => {
        if (String(url) !== serverUrl) return fetch(url, options)
        if (options.method === 'GET') return new Response(null, { status: 405 })
        const message = options.method === 'POST' ? JSON.parse(options.body) : undefined
        const record = message?.method && message.id !== undefined ? wireRequests.get(message.id) : undefined
        const internal = message?.id !== undefined ? current.internal.get(message.id) : undefined
        if (stopped || generation !== current || record?.cancelled ||
            (message?.method && message.id !== undefined && !record && !internal)) {
          throw safeError('OPENAGENT_MCP_REQUEST_STOPPED')
        }
        // ping 承担标准 token 刷新；业务已发后不让 SDK 在 401/403 分支再次 POST。
        if (record && message.method !== 'initialize' && record.sent) throw safeError('OPENAGENT_MCP_REPLAY_BLOCKED')
        if (record) record.sent = true
        const response = await fetch(url, options)
        if (record && message.method !== 'initialize' && [401, 403].includes(response.status)) {
          await response.body?.cancel()
          throw new StreamableHTTPError(response.status, 'OpenAgent 请求被拒绝，未自动重发。')
        }
        if (internal?.method === 'ping' && response.status === 404) {
          const body = await response.clone().json().catch(() => null)
          if (body?.jsonrpc === '2.0' && body.id === message.id && body.error?.data?.code === 'session_not_found') {
            await response.body?.cancel()
            throw safeError('OPENAGENT_MCP_SESSION_EXPIRED')
          }
        }
        return response
      },
    })
    current.transport.onmessage = message => {
      if (stopped || generation !== current) return
      const internal = !message.method && current.internal.get(message.id)
      if (internal) {
        current.internal.delete(message.id)
        clearTimeout(internal.timeout)
        if (message.error) internal.reject(safeError('OPENAGENT_MCP_PROTOCOL_ERROR'))
        else internal.resolve(message.result)
        return
      }
      const record = !message.method && wireRequests.get(message.id)
      if (record) {
        if (record.message.method === 'initialize' && message.result) {
          initial = { params: record.message.params, result: message.result }
        }
        forget(record)
        if (!record.cancelled) transport.onmessage?.({ ...message, id: record.hostId })
      } else if (message.method) transport.onmessage?.(message)
    }
    current.transport.onerror = error => {
      // send() 会用同一 Error 拒绝；只把没有对应 rejection 的异步 POST SSE 错误交给总失败处理。
      setImmediate(() => {
        if (generation === current && !current.handled.has(error)) fail(error)
      })
    }
    current.transport.onclose = () => { if (generation === current && !stopped) transport.onclose?.() }
    generation = current
    await current.transport.start()
    return current
  }

  const send = async (current, message) => {
    try { await current.transport.send(message) }
    catch (error) {
      current.handled.add(error)
      if (stopped || generation !== current) return
      throw error
    }
  }
  const request = (current, method, params) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timeout = setTimeout(() => {
      current.internal.delete(id)
      reject(safeError('OPENAGENT_MCP_PREFLIGHT_TIMEOUT'))
    }, 15000)
    current.internal.set(id, { method, resolve, reject, timeout })
    void send(current, { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }).catch(error => {
      const pending = current.internal.get(id)
      if (!pending) return
      clearTimeout(timeout)
      current.internal.delete(id)
      reject(error)
    })
  })
  const preflight = async record => {
    const current = generation
    try { await request(current, 'ping') }
    catch (error) {
      if (error.code !== 'OPENAGENT_MCP_SESSION_EXPIRED') throw error
      if (inFlight()) { rejectUnsent(record); return false }
      if (stopped || record.cancelled) return false
      generation = undefined
      await current.transport.close()
      const replacement = await makeGeneration()
      const result = await request(replacement, 'initialize', initial.params)
      if (result?.protocolVersion !== initial.result.protocolVersion ||
          !isDeepStrictEqual(result.capabilities, initial.result.capabilities)) {
        throw safeError('OPENAGENT_MCP_PROTOCOL_CHANGED')
      }
      replacement.transport.setProtocolVersion(result.protocolVersion)
      await send(replacement, { jsonrpc: '2.0', method: 'notifications/initialized' })
      status('OPENAGENT_MCP_SESSION_RESTORED：MCP 会话已恢复，待发请求尚未执行。')
    }
    return true
  }
  const dispatch = async record => {
    const current = generation
    record.dispatched = true
    const message = { ...record.message, id: record.wireId }
    try { await send(current, message) }
    catch (error) {
      if (record.cancelled && !record.sent) { forget(record); return }
      if (message.method !== 'initialize' || !(error instanceof UnauthorizedError) || !initializeAuth) throw error
      const auth = await initializeAuth()
      const code = await auth.waitForAuthCode()
      if (stopped || record.cancelled) return
      await current.transport.finishAuth(code)
      await send(current, message)
    }
  }
  const transport = {
    wasSent: id => requests.get(id)?.sent ?? false,
    setProtocolVersion: version => generation?.transport.setProtocolVersion(version),
    send(message) {
      if (stopped) return
      if (message.method === 'notifications/cancelled') {
        const record = requests.get(message.params?.requestId)
        if (!record) return
        record.cancelled = true
        if (!record.dispatched) { forget(record); return }
        if (!record.sent) return
        // 已发送调用取消后仍保留在途记录，直到上游最终响应，不能凭取消通知更换会话。
        return send(generation, { ...message, params: { ...message.params, requestId: record.wireId } })
      }
      if (!message.method || message.id === undefined) return send(generation, message)
      if (requests.has(message.id)) throw safeError('OPENAGENT_MCP_DUPLICATE_REQUEST')
      const record = { hostId: message.id, wireId: ++nextId, message, sent: false, dispatched: false, cancelled: false }
      requests.set(record.hostId, record)
      wireRequests.set(record.wireId, record)
      gate = gate.then(async () => {
        if (stopped || record.cancelled) return
        if (message.method !== 'initialize' && initial && !await preflight(record)) return
        if (stopped || record.cancelled) return
        // 只等待短预检，不等待长业务；取消通知始终走上面的即时路径。
        void dispatch(record).catch(fail)
      }).catch(fail)
    },
    async close() {
      stopped = true
      const current = generation
      generation = undefined
      for (const pending of current?.internal.values() ?? []) {
        clearTimeout(pending.timeout)
        pending.reject(safeError('OPENAGENT_MCP_REQUEST_STOPPED'))
      }
      current?.internal.clear()
      await current?.transport.close()
    },
  }
  await makeGeneration()
  return transport
}

export async function runProxy(runtime, args, status) {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const options = await runtime.parseCommandLineArgs(args, 'OpenAgent MCP bridge')
  const { serverUrl, callbackPort, headers, host, staticOAuthClientMetadata, serverUrlHash, authTimeoutMs } = options
  const coordinator = runtime.createLazyAuthCoordinator(serverUrlHash, callbackPort, new EventEmitter(), authTimeoutMs)
  let authServer
  let closeBridge
  const stop = async () => {
    await closeBridge?.()
    authServer?.close()
    process.exit(process.exitCode || 0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  process.stdin.once('end', stop)
  try {
    const discovery = await runtime.discoverOAuthServerInfo(serverUrl, headers)
    const provider = new runtime.NodeOAuthClientProvider({
      serverUrl: discovery.authorizationServerUrl, callbackPort, host, clientName: 'MCP CLI Proxy',
      staticOAuthClientMetadata, serverUrlHash,
      authorizationServerMetadata: discovery.authorizationServerMetadata,
      protectedResourceMetadata: discovery.protectedResourceMetadata,
      wwwAuthenticateScope: discovery.wwwAuthenticateScope,
    })
    const initializeAuth = async () => {
      const auth = await coordinator.initializeAuth()
      authServer = auth.server
      if (auth.skipBrowserAuth) await delay(1000)
      return { waitForAuthCode: auth.waitForAuthCode, skipBrowserAuth: auth.skipBrowserAuth }
    }
    const remote = await createSessionTransport({ serverUrl, provider, headers, initializeAuth, status })
    const local = new StdioServerTransport()
    closeBridge = bridgeTransports(local, remote, {
      onFailure: error => {
        process.exitCode = 1
        status(`OPENAGENT_CONNECTION_DIAGNOSTIC ${JSON.stringify(connectionFailure(error, 'mcp'))}`)
        const http = Number.isInteger(error?.code) && error.code >= 100 && error.code <= 599 ? ` HTTP ${error.code}` : ''
        const code = diagnosticCodes.has(error?.code) ? ` ${error.code}` : ''
        status(`OPENAGENT_MCP_CONNECT_FAILED${http}${code}：OpenAgent MCP 连接未完成；未发送请求已停止，已发请求结果未确认，不会自动重试。`)
      },
      onClosed: () => { authServer?.close(); process.exit(process.exitCode || 0) },
    })
    await local.start()
  } catch (error) {
    authServer?.close()
    throw Object.assign(new Error('OpenAgent MCP 连接未完成。', { cause: error }), { code: 'OPENAGENT_MCP_CONNECT_FAILED' })
  }
}
