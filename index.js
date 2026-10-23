import { fileURLToPath } from 'node:url'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import { harnessHome, prepareAuthDirectory } from './login.mjs'

export const name = 'openagent'
export const inject = ['tools', 'skills']

export async function apply(ctx) {
  const home = harnessHome()
  const authDirectory = prepareAuthDirectory(home)
  await ctx.plugin(SkillFilesystem, {
    providerName: 'openagent',
    includeDefaultRoots: false,
    bundledSkillDir: fileURLToPath(new URL('./skills/', import.meta.url)),
  })
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
}
