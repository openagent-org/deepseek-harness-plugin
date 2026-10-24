import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import { harnessHome, prepareAuthDirectory } from './login.mjs'
import * as Browser from './browser-host.mjs'
import * as Onboarding from './onboarding-host.mjs'
import { createOnboardingStore } from './post-install.mjs'

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
  ctx.inject(['typert', 'agents', 'sessions', 'profileContext', 'workingDirectory'], async scope => {
    await scope.plugin(Onboarding)
  })
  let store, attemptId, login, closed, stopping
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
    login = spawn(process.execPath, [fileURLToPath(new URL('./login.mjs', import.meta.url))], {
      env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'],
    })
    let connected = false
    let browserOpened = false
    let tail = ''
    login.stderr.on('data', chunk => {
      tail = (tail + String(chunk)).slice(-4096)
      if (tail.includes('OPENAGENT_LOGIN_CONNECTED：')) connected = true
      if (!browserOpened && tail.includes('OpenAgent 已打开浏览器，请完成授权。')) {
        browserOpened = true
        ctx.logger.info('OpenAgent 已打开浏览器，请完成本次授权；安装验收将在连接就绪后继续。')
      }
    })
    // 原始诊断不进入 Host 日志。只信本入口成功标记及同一子进程退出码。
    closed = new Promise(resolve => {
      login.once('error', () => {})
      login.once('close', (code, signal) => resolve({ code, signal }))
    })
    const outcome = await closed
    if (stopping || outcome.code !== 0 || outcome.signal || !connected) throw new Error('OPENAGENT_LOGIN_UNCONFIRMED')
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
  } catch {
    try { if (attemptId) await store.finishConnection(attemptId, stopping ? 'unconfirmed' : 'failed') }
    catch { ctx.logger.error('OPENAGENT_CONNECTION_STATE_UNAVAILABLE: OpenAgent 连接阶段无法保存，请先检查本 profile 的私有状态文件。') }
    ctx.logger.error('OPENAGENT_MCP_UNAVAILABLE: OpenAgent MCP 首次连接失败；Skills 与浏览器桥接仍保留，不能据此宣称 OpenAgent 可用。请先修复连接，再由真实账户工具确认。')
  }
}
