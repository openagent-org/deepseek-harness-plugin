import { chmodSync, lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { authRuntimeVersion, loadBridgeRuntime, runProxy } from './bridge.mjs'

export const endpoint = 'https://oasn-ow.haimawan.com/mcp/v1/open-agent'
export const headers = {
  'X-OASN-MCP-OAuth': 'required',
  'X-OASN-MCP-Content-Mode': 'text-compatible',
}

export function harnessHome(env = process.env) {
  const selected = env.DSH_HOME?.trim() ? env.DSH_HOME : join(homedir(), '.dsh')
  const expanded = selected === '~' ? homedir()
    : /^~[/\\]/.test(selected) ? join(homedir(), selected.slice(2)) : selected
  return resolve(expanded)
}

function privateDirectory(path) {
  try {
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('认证目录不能是链接或普通文件。')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    mkdirSync(path, { mode: 0o700 })
  }
  chmodSync(path, 0o700)
}

export function prepareAuthDirectory(home = harnessHome()) {
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const directory = join(home, 'openagent-auth')
  privateDirectory(directory)
  const store = join(directory, `mcp-remote-${authRuntimeVersion}`)
  privateDirectory(store)
  for (const entry of readdirSync(store)) {
    const path = join(store, entry)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('认证存储包含链接或非普通文件，已停止。')
    chmodSync(path, 0o600)
  }
  return directory
}

export function bridgeArguments() {
  return [endpoint, '--transport', 'http-only', '--auth-timeout', '300',
    '--static-oauth-client-metadata', JSON.stringify({ client_name: 'DeepSeek Harness', token_endpoint_auth_method: 'none' }),
    ...Object.entries(headers).flatMap(([key, value]) => ['--header', `${key}:${value}`])]
}

async function main() {
  const mode = process.argv[2]
  if (mode !== undefined && mode !== '--proxy') throw new Error('用法：node login.mjs')
  if (process.argv.length > 3) throw new Error('不接受额外参数。')
  const proxy = mode === '--proxy'
  const runtime = await loadBridgeRuntime()
  process.env.MCP_REMOTE_CONFIG_DIR = prepareAuthDirectory()
  // 此文件仅作为独立进程执行时修改 umask，不能改变 Harness Host 的权限策略。
  process.umask(0o077)
  const entry = createRequire(import.meta.url).resolve(`mcp-remote/dist/${proxy ? 'proxy' : 'client'}.js`)
  process.argv = [process.execPath, entry, ...bridgeArguments()]
  let connected = false
  let timedOut = false
  const status = message => process.stderr.write(`${message}\n`)
  // 上游会打印授权 URL、工具和资源正文；这里只输出固定阶段，不转发原始诊断。
  console.error = (message) => {
    if (typeof message !== 'string') return
    if (/^\[\d+\] Connected successfully!$/.test(message) && !connected) {
      connected = true
      // npm 0.1.38 的诊断客户端覆盖了 onmessage；连接后正常关闭，避免两次无效的列表等待。
      if (!proxy) setImmediate(() => process.emit('SIGINT'))
    }
    if (/^\[\d+\] Browser opened automatically\.$/.test(message)) status('OpenAgent 已打开浏览器，请完成授权。')
    if (/^\[\d+\] Could not open a browser automatically\./.test(message)) status('OpenAgent 无法自动打开浏览器；请检查本机浏览器环境后再手动登录。')
    if (proxy && /^\[\d+\] Fatal error:/.test(message)) status('OpenAgent MCP 连接失败；请检查连接和登录状态，不要自动重放业务调用。')
  }
  if (!proxy) {
    status('开始连接 OpenAgent；需要登录时将打开浏览器。')
    const timeout = setTimeout(() => {
      timedOut = true
      if (process.listenerCount('SIGINT')) process.emit('SIGINT')
      else process.exit(1)
    }, 330000)
    timeout.unref()
    process.on('exit', code => {
      const success = code === 0 && connected && !timedOut
      if (!success && code === 0) process.exitCode = 1
      status(success ? 'OPENAGENT_LOGIN_CONNECTED：OpenAgent 登录连接完成；这不代表工具或业务验收通过。请另行核验 Harness 工具与 Skills。' : 'OpenAgent 登录连接未完成，已停止；不会自动重新执行登录。')
    })
  }
  if (proxy) await runProxy(runtime, bridgeArguments(), status)
  else await import(pathToFileURL(entry).href)
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    process.stderr.write(error.code === 'OPENAGENT_MCP_CONNECT_FAILED'
      ? 'OPENAGENT_MCP_CONNECT_FAILED：OpenAgent MCP 连接未完成；请检查网络和登录状态，不会自动重试。\n'
      : 'OpenAgent 连接启动失败；请检查依赖安装与专用认证目录权限。\n')
    process.exitCode = 1
  })
}
