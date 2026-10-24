import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import { harnessHome, prepareAuthDirectory } from './login.mjs'
import * as Browser from './browser-host.mjs'
import * as Onboarding from './onboarding-host.mjs'
import { createOnboardingStore } from './post-install.mjs'
import { checkedConnection, connectionFailure } from './onboarding-protocol.mjs'

export const name = 'openagent'
export const inject = ['tools', 'skills', 'profileContext']

export async function apply(ctx) {
  const home = harnessHome()
  await ctx.plugin(SkillFilesystem, {
    providerName: 'openagent',
    includeDefaultRoots: false,
    bundledSkillDir: fileURLToPath(new URL('../skills/', import.meta.url)),
  })
  ctx.inject(['typert'], async scope => { await scope.plugin(Browser) })
  // 在线新增 bundle 时先注册 Remote；授权期间预约保持待处理，不领取发送。
  ctx.inject(['typert', 'agents', 'sessions', 'profileContext', 'workingDirectory', 'workspaceRegistry'], async scope => {
    await scope.plugin(Onboarding)
  })
  let store, attemptId, login, closed, stopping
  let stage = 'preparing'
  let diagnostic
  let progress = Promise.resolve()
  const stop = () => stopping ??= (async () => {
    if (!login || login.exitCode !== null || login.signalCode !== null) return
    login.kill('SIGTERM')
    const timer = setTimeout(() => login.kill('SIGKILL'), 5000)
    timer.unref()
    try { await closed } finally { clearTimeout(timer) }
  })()
  // Cordis 会先通知卸载，再等待未完成的 apply；状态写入和登录都受同一生命周期约束。
  ctx.on('internal/plugin', fiber => {
    if (fiber === ctx.fiber && fiber.uid === null) return stop()
  }, { global: true })
  ctx.effect(() => stop, 'openagent.login')
  try {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    store = createOnboardingStore({ profileDir: ctx.profileContext.dir, version })
    attemptId = await store.beginConnection()
    if (stopping) throw new Error('OPENAGENT_LOGIN_UNCONFIRMED')
    const authDirectory = prepareAuthDirectory(home)
    const env = { DSH_HOME: home, MCP_REMOTE_CONFIG_DIR: authDirectory,
      ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }
    // 原生 MCP 初始化只有约 60 秒；先由现有登录入口等待完整授权，避免探测进程截断首次 OAuth。
    stage = 'login'
    await store.advanceConnection(attemptId, stage)
    login = spawn(process.execPath, [fileURLToPath(new URL('./login.mjs', import.meta.url))], {
      env: { ...scrubbedParentEnv(), ...env }, stdio: ['ignore', 'ignore', 'pipe'],
    })
    let connected = false
    let browserOpened = false
    let tail = ''
    const line = value => {
      if (value.startsWith('OPENAGENT_LOGIN_CONNECTED：')) connected = true
      if (!browserOpened && value === 'OPENAGENT_LOGIN_WAITING_AUTHORIZATION') {
        browserOpened = true
        stage = 'waiting_authorization'
        progress = progress.then(() => store.advanceConnection(attemptId, stage))
        // 异步状态写入错误由主路径收尾，不产生未处理 rejection。
        progress.catch(() => {})
        ctx.logger.info('请在打开的页面中登录 OpenAgent…')
      }
      if (value.startsWith('OPENAGENT_CONNECTION_DIAGNOSTIC ')) {
        try {
          const parsed = JSON.parse(value.slice('OPENAGENT_CONNECTION_DIAGNOSTIC '.length))
          checkedConnection({ ...parsed, status: 'failed' })
          if (parsed.stage && parsed.code && Object.keys(parsed).every(key => ['stage', 'code', 'http_status'].includes(key))) diagnostic = parsed
        } catch { /* 不信任原始子进程诊断，非法字段不保存。 */ }
      }
    }
    login.stderr.on('data', chunk => {
      tail += String(chunk)
      let boundary
      while ((boundary = tail.indexOf('\n')) !== -1) {
        const value = tail.slice(0, boundary)
        tail = tail.slice(boundary + 1)
        if (value.length <= 4096) line(value)
      }
      if (tail.length > 4096) tail = ''
    })
    // 原始诊断不进入 Host 日志。只信本入口成功标记及同一子进程退出码。
    closed = new Promise(resolve => {
      login.once('error', error => { diagnostic = connectionFailure(error, stage) })
      login.once('close', (code, signal) => resolve({ code, signal }))
    })
    const outcome = await closed
    await progress
    if (stopping || outcome.code !== 0 || outcome.signal || !connected) throw new Error('OPENAGENT_LOGIN_UNCONFIRMED')
    ctx.logger.info('已登录 OpenAgent')
    stage = 'mcp'
    diagnostic = undefined
    await store.advanceConnection(attemptId, stage)
    await ctx.plugin(McpClient, {
      serverName: 'openagent',
      transport: 'stdio',
      command: process.execPath,
      args: [fileURLToPath(new URL('./login.mjs', import.meta.url)), '--proxy'],
      env,
      toolCallTimeoutMs: 1800000,
      failOnStartupError: true,
      reconnect: { enabled: false },
    })
    if (stopping || !await store.finishConnection(attemptId, 'ready')) throw new Error('OPENAGENT_LOGIN_UNCONFIRMED')
    if (stopping) throw new Error('OPENAGENT_LOGIN_UNCONFIRMED')
  } catch (error) {
    await progress.catch(() => {})
    diagnostic = stopping ? { stage, code: 'CONNECTION_STOPPED' }
      : diagnostic ?? connectionFailure(error, stage, stage === 'preparing' ? 'DEPENDENCY_ERROR' : undefined)
    try { if (attemptId) await store.finishConnection(attemptId, stopping ? 'unconfirmed' : 'failed', diagnostic) }
    catch { ctx.logger.error('OPENAGENT_CONNECTION_STATE_UNAVAILABLE: OpenAgent 连接阶段无法保存，请先检查本 profile 的私有状态文件。') }
    ctx.logger.error(`OPENAGENT_CONNECTION_DIAGNOSTIC ${JSON.stringify(diagnostic)}`)
    ctx.logger.error('OPENAGENT_MCP_UNAVAILABLE: OpenAgent MCP 首次连接失败；Skills 与浏览器桥接仍保留，不能据此宣称 OpenAgent 可用。请先修复连接，再由真实账户工具确认。')
  }
}
