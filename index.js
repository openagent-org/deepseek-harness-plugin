import { fileURLToPath } from 'node:url'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import { harnessHome, prepareAuthDirectory } from './login.mjs'
import * as Browser from './browser-host.mjs'
import * as Onboarding from './onboarding-host.mjs'

export const name = 'openagent'
export const inject = ['tools', 'skills']

export async function apply(ctx) {
  const home = harnessHome()
  await ctx.plugin(SkillFilesystem, {
    providerName: 'openagent',
    includeDefaultRoots: false,
    bundledSkillDir: fileURLToPath(new URL('./skills/', import.meta.url)),
  })
  ctx.inject(['typert'], async scope => { await scope.plugin(Browser) })
  try {
    const authDirectory = prepareAuthDirectory(home)
    await ctx.plugin(McpClient, {
      serverName: 'openagent',
      transport: 'stdio',
      command: process.execPath,
      args: [fileURLToPath(new URL('./login.mjs', import.meta.url)), '--proxy'],
      env: {
        DSH_HOME: home,
        MCP_REMOTE_CONFIG_DIR: authDirectory,
        ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      },
      toolCallTimeoutMs: 1800000,
      failOnStartupError: true,
      reconnect: { enabled: false },
    })
  } catch {
    ctx.logger.error('OPENAGENT_MCP_UNAVAILABLE: OpenAgent MCP 首次连接失败；Skills 与浏览器桥接仍保留，不能据此宣称 OpenAgent 可用。请先修复连接，再由真实账户工具确认。')
  }
  ctx.inject(['typert', 'agents', 'sessions', 'profileContext', 'workingDirectory'], async scope => {
    await scope.plugin(Onboarding)
  })
}
