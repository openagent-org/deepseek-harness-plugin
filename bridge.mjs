import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

// 这是经过回归验证的 npm 0.1.38 制品接口，不是可随上游升级的公开 API。
// 固定模块路径及运行版本；不搜索新 chunk、不修改依赖源码、不迁移认证内容。
export const authRuntimeVersion = '0.1.37'
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
  const fail = async () => {
    if (failed || closing) return
    failed = true
    onFailure()
    await Promise.allSettled([...pending].map(id => local.send({ jsonrpc: '2.0', id, error: {
      code: -32000, message: 'OpenAgent MCP 连接中断，调用结果未确认；不会自动重试。',
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
    const remote = await runtime.connectToRemoteServer(null, serverUrl, provider, headers, initializeAuth, 'http-only')
    const local = new StdioServerTransport()
    closeBridge = bridgeTransports(local, remote, {
      onFailure: () => {
        process.exitCode = 1
        status('OpenAgent MCP 连接中断，调用结果未确认；不会自动重试。')
      },
      onClosed: () => { authServer?.close(); process.exit(process.exitCode || 0) },
    })
    await local.start()
  } catch {
    authServer?.close()
    throw Object.assign(new Error('OpenAgent MCP 连接未完成。'), { code: 'OPENAGENT_MCP_CONNECT_FAILED' })
  }
}
