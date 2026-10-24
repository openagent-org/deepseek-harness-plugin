#!/usr/bin/env node
// 安装预约只保存一次发送所需的标识；不重启应用，不读取认证或会话正文。
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { checkedConnection, onboardingFailureCodes } from './onboarding-protocol.mjs'

const fail = () => { throw new Error('OPENAGENT_ONBOARDING_STATE_INVALID') }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value, keys) => { if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) fail(); return value }
const id = value => { if (typeof value !== 'string' || !value || value.length > 512 || /[\x00-\x1f\x7f]/.test(value)) fail(); return value }
const hash = value => createHash('sha256').update(id(value)).digest('hex')
const versionOk = value => typeof value === 'string' && value.length <= 100 && /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(value)
const checkedRecord = value => {
  exact(value, ['targetSessionId', 'requestId', 'promptId', 'locale', 'sourceTurn'])
  for (const key of ['targetSessionId', 'requestId', 'promptId']) id(value[key])
  if (!['zh-CN', 'en'].includes(value.locale)) fail()
  if ('sourceTurn' in value && (!Number.isSafeInteger(value.sourceTurn) || value.sourceTurn <= 0)) fail()
  return { targetSessionId: value.targetSessionId, requestId: value.requestId, promptId: value.promptId, locale: value.locale,
    ...('sourceTurn' in value ? { sourceTurn: value.sourceTurn } : {}) }
}
const evidenceKeys = ['guide_loaded', 'guide_success', 'account_success', 'turn_completed']
const resultKeys = ['status', 'request_id', 'session_id', 'code', ...evidenceKeys, 'connection']
const checkedResult = (value, record) => {
  exact(value, resultKeys)
  if (!['completed', 'failed', 'unconfirmed'].includes(value.status)
    || value.request_id !== record.requestId || value.session_id !== record.targetSessionId) fail()
  if (value.status === 'completed') {
    if ('code' in value || 'connection' in value || evidenceKeys.some(key => value[key] !== true)) fail()
  } else if (!onboardingFailureCodes.includes(value.code)
    || evidenceKeys.some(key => key in value)) fail()
  if ('connection' in value) checkedConnection(value.connection)
  return Object.fromEntries(resultKeys.filter(key => key in value).map(key => [key, value[key]]))
}
const unknown = record => ({ status: 'unconfirmed', code: 'ONBOARDING_ALREADY_CLAIMED',
  request_id: record.requestId, session_id: record.targetSessionId })

async function inspect(path, directory, privateFile = false) {
  const stat = await lstat(path)
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile())) fail()
  if (privateFile && ((process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
    || (process.getuid && stat.uid !== process.getuid()) || (!directory && stat.nlink !== 1))) fail()
  return stat
}
async function readJson(path, privateFile = true) {
  try {
    const before = await inspect(path, false, privateFile)
    if (before.size > 65536) fail()
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const actual = await file.stat()
      if (before.ino !== actual.ino || before.dev !== actual.dev) fail()
      return JSON.parse(await file.readFile('utf8'))
    } finally { await file.close() }
  } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
async function writeExclusive(path, value) {
  const file = await open(path, 'wx', 0o600)
  // 写入失败保留占用标记，后续只能报未知，不能重新发送。
  try { await file.writeFile(JSON.stringify(value)); await file.sync() }
  finally { await file.close() }
}

export function createOnboardingStore({ profileDir, version }) {
  if (!versionOk(version)) fail()
  const profile = resolve(profileDir)
  const root = join(profile, '.openagent-onboarding', version)
  const folder = async (create = false) => {
    await inspect(profile, true)
    if (await realpath(profile) !== profile) fail()
    for (const path of [dirname(root), root]) {
      if (create) await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
      try { await inspect(path, true, true) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
    }
    return root
  }
  const validate = (value, sourceSessionId, pending = false) => {
    exact(value, ['schema', 'version', 'sourceSessionId', 'record', ...(pending ? ['expiresAt'] : [])])
    if (value.schema !== 1 || value.version !== version || value.sourceSessionId !== id(sourceSessionId)) fail()
    checkedRecord(value.record)
    if (pending) { if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0) fail() }
    return value
  }
  const load = async source => {
    if (!await folder()) return null
    const value = await readJson(join(root, `${hash(source)}.json`))
    return value === null ? null : validate(value, source)
  }
  const loadPending = async source => {
    if (!await folder()) return null
    const value = await readJson(join(root, `${hash(source)}.pending.json`))
    return value === null ? null : validate(value, source, true)
  }
  const receipt = async (source, state) => {
    const value = await readJson(join(root, `${hash(source)}.result.json`))
    if (value === null) return null
    exact(value, ['schema', 'version', 'sourceSessionId', 'result'])
    if (!state || value.schema !== 1 || value.version !== version || value.sourceSessionId !== source) fail()
    return checkedResult(value.result, state.record)
  }
  const connectionPath = join(root, 'connection.json')
  const connectionRecord = async () => {
    if (!await folder()) return null
    const value = await readJson(connectionPath)
    if (value === null) return null
    exact(value, ['schema', 'version', 'attemptId', 'pid', 'phase', 'stage', 'code', 'http_status', 'started_at', 'updated_at'])
    if (value.schema !== 1 || value.version !== version || typeof value.attemptId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.attemptId)
      || !Number.isSafeInteger(value.pid) || value.pid <= 0 || value.pid > 2147483647
      || !['connecting', 'ready', 'failed', 'unconfirmed'].includes(value.phase)) fail()
    checkedConnection({ status: value.phase, ...Object.fromEntries(['stage', 'code', 'http_status', 'started_at', 'updated_at'].filter(key => key in value).map(key => [key, value[key]])) })
    return value
  }
  const changeConnection = async change => {
    await folder(true)
    // 只释放本次独占创建的锁；旧锁或并发写入一律停止，不自动接管。
    const lockPath = join(root, 'connection.lock')
    const lock = await open(lockPath, 'wx', 0o600)
    const temporary = join(root, `.connection-${randomUUID()}.tmp`)
    try {
      const next = change(await connectionRecord())
      if (!next) return false
      await writeExclusive(temporary, next)
      await rename(temporary, connectionPath)
      return next
    } finally {
      try { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
      finally { await lock.close(); await unlink(lockPath) }
    }
  }
  const store = {
    async connectionDetails() {
      const value = await connectionRecord()
      if (!value) return { status: 'not_started' }
      const details = { status: value.phase, ...Object.fromEntries(['stage', 'code', 'http_status', 'started_at', 'updated_at']
        .filter(key => key in value).map(key => [key, value[key]])) }
      if (value.phase === 'connecting') {
        try { process.kill(value.pid, 0) }
        catch (error) {
          if (error.code === 'ESRCH') return { ...details, status: 'unconfirmed', code: 'CONNECTION_STOPPED' }
          if (error.code !== 'EPERM') throw error
        }
      }
      return details
    },
    async connectionStatus() { return (await store.connectionDetails()).status },
    async beginConnection() {
      const now = Date.now()
      const value = await changeConnection(() => ({ schema: 1, version, attemptId: randomUUID(), pid: process.pid,
        phase: 'connecting', stage: 'preparing', started_at: now, updated_at: now }))
      return value.attemptId
    },
    async advanceConnection(attemptId, stage) {
      checkedConnection({ status: 'connecting', stage })
      return !!await changeConnection(current => current?.attemptId === attemptId && current.phase === 'connecting'
        ? { ...current, stage, updated_at: Date.now() } : null)
    },
    async finishConnection(attemptId, phase, diagnostic = {}) {
      if (!['ready', 'failed', 'unconfirmed'].includes(phase)) fail()
      exact(diagnostic, ['stage', 'code', 'http_status'])
      checkedConnection({ status: phase, ...diagnostic })
      return !!await changeConnection(current => current?.attemptId === attemptId
        ? { ...current, phase, ...diagnostic, updated_at: Date.now() } : null)
    },
    async reserve(source, record, canReserve) {
      id(source); record = checkedRecord(record)
      await folder(true)
      const existing = await store.read(source)
      if (existing) return { reserved: false, result: existing }
      const pending = await loadPending(source)
      if (pending && (pending.expiresAt <= Date.now()
        || ['requestId', 'targetSessionId', 'promptId', 'locale'].some(key => record[key] !== pending.record[key]))) {
        const result = await store.pendingStatus(source)
        if (!result) fail()
        return { reserved: false, result }
      }
      if (canReserve && !canReserve()) return { reserved: false, deferred: true }
      const value = { schema: 1, version, sourceSessionId: source, record }
      try { await writeExclusive(join(root, `${hash(source)}.json`), value); return { reserved: true } }
      catch (error) {
        if (error.code !== 'EEXIST') throw error
        const result = await store.read(source)
        if (!result) fail()
        return { reserved: false, result }
      }
    },
    async complete(source, result) {
      const state = await load(source)
      if (!state) fail()
      result = checkedResult(result, state.record)
      const path = join(root, `${hash(source)}.result.json`)
      try { await writeExclusive(path, { schema: 1, version, sourceSessionId: source, result }) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
      const completed = await receipt(source, state)
      if (!completed || !isDeepStrictEqual(completed, result)) fail()
      return completed
    },
    async read(source) {
      id(source)
      const state = await load(source)
      if (!await folder()) return null
      return await receipt(source, state) ?? (state ? unknown(state.record) : null)
    },
    async readCompletion(source) {
      id(source)
      const state = await load(source)
      const result = await receipt(source, state)
      if (!result || state.record.sourceTurn === undefined) return null
      return { sourceTurn: state.record.sourceTurn, locale: state.record.locale, result }
    },
    async pendingStatus(source) {
      id(source)
      const existing = await store.read(source)
      if (existing) return existing
      const value = await loadPending(source)
      if (value === null) return null
      // 读取预约期间可能已被 Host 领取；领取结果始终优先，不能报成未发送。
      const after = await store.read(source)
      if (after) return after
      const ids = { request_id: value.record.requestId, session_id: value.record.targetSessionId }
      const connection = await store.connectionDetails()
      if (['failed', 'unconfirmed'].includes(connection.status)) return { status: connection.status, ...ids,
        code: connection.status === 'failed' ? 'CONNECTION_FAILED' : 'CONNECTION_UNCONFIRMED',
        connection_status: connection.status, connection }
      return value.expiresAt > Date.now()
        ? { status: 'pending', ...ids, expires_at: value.expiresAt, connection_status: connection.status, connection }
        : { status: 'unconfirmed', ...ids, code: 'ONBOARDING_REQUEST_EXPIRED' }
    },
    async pending(source) {
      id(source)
      const value = await loadPending(source)
      if (!value || await store.read(source) || value.expiresAt <= Date.now()) return null
      return { sourceSessionId: source, record: value.record, expiresAt: value.expiresAt }
    },
  }
  return store
}

export async function prepareOnboarding({ profileDir, version, sourceSessionId, locale }) {
  id(sourceSessionId)
  const store = createOnboardingStore({ profileDir, version })
  const existing = await store.read(sourceSessionId)
  if (existing) return existing
  const record = checkedRecord({ targetSessionId: randomUUID(), requestId: randomUUID(), promptId: randomUUID(), locale })
  const root = join(resolve(profileDir), '.openagent-onboarding', version)
  for (const path of [dirname(root), root]) {
    await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
    await inspect(path, true, true)
  }
  const path = join(root, `${hash(sourceSessionId)}.pending.json`)
  const value = { schema: 1, version, sourceSessionId, record, expiresAt: Date.now() + 30 * 60 * 1000 }
  try { await writeExclusive(path, value) } catch (error) { if (error.code !== 'EEXIST') throw error }
  // 只验证本来源预约；不刷新期限、不替换任何已有预约。
  const pending = await store.pending(sourceSessionId)
  const after = await store.read(sourceSessionId)
  if (after) return after
  if (!pending) return { status: 'unconfirmed', code: 'ONBOARDING_REQUEST_EXPIRED' }
  return store.pendingStatus(sourceSessionId)
}

async function main() {
  const options = {}
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    if (['--prepare', '--status'].includes(key) && !options.action) options.action = key
    else if (['--profile', '--locale', '--session-id'].includes(key) && !(key in options) && args[i + 1] !== undefined) options[key] = args[++i]
    else fail()
  }
  const profileName = options['--profile']
  if (!options.action || typeof profileName !== 'string' || !profileName || ['.', '..', 'node_modules'].includes(profileName)
    || /[/\\\x00-\x1f]/.test(profileName)) fail()
  if (process.env.DSH_PROFILE && process.env.DSH_PROFILE !== profileName) fail()
  const sourceSessionId = process.env.DSH_SESSION_ID || options['--session-id']
  if (process.env.DSH_SESSION_ID && options['--session-id'] && process.env.DSH_SESSION_ID !== options['--session-id']) fail()
  id(sourceSessionId)
  const home = resolve(process.env.DSH_HOME?.trim() ? process.env.DSH_HOME : join(homedir(), '.dsh'))
  const profileDir = join(home, 'profiles', profileName)
  if (process.env.DSH_PROFILE_DIR && resolve(process.env.DSH_PROFILE_DIR) !== profileDir) fail()
  for (const path of [home, join(home, 'profiles'), profileDir, join(profileDir, 'node_modules')]) {
    await inspect(path, true)
    if (await realpath(path) !== path) fail()
  }
  const manifest = await readJson(join(profileDir, 'package.json'), false)
  if (!object(manifest)) fail()
  const sources = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap(key => {
    const dependencies = manifest[key] ?? {}
    if (!object(dependencies)) fail()
    return 'dsh-openagent' in dependencies ? [dependencies['dsh-openagent']] : []
  })
  const official = new Set(['github:openagent-org/deepseek-harness-plugin#rel',
    ...['git+https://', 'https://'].flatMap(prefix => ['github.com', 'gitee.com'].map(host => `${prefix}${host}/openagent-org/deepseek-harness-plugin.git#rel`))])
  if (!sources.length || sources.some(source => !official.has(source))) fail()
  const installed = await realpath(join(profileDir, 'node_modules', 'dsh-openagent'))
  if (!installed.startsWith(join(profileDir, 'node_modules') + sep) || installed !== dirname(dirname(fileURLToPath(import.meta.url)))) fail()
  const packageJson = await readJson(join(installed, 'package.json'), false)
  if (packageJson?.name !== 'dsh-openagent' || !versionOk(packageJson.version)) fail()
  const store = createOnboardingStore({ profileDir, version: packageJson.version })
  let result = options.action === '--prepare'
    ? await prepareOnboarding({ profileDir, version: packageJson.version, sourceSessionId, locale: options['--locale'] ?? 'zh-CN' })
    : await store.pendingStatus(sourceSessionId)
  if (!result) {
    const connection = await store.connectionDetails()
    result = { status: 'failed', code: 'NO_ATTEMPT', connection_status: connection.status, connection }
  }
  console.log(`${options.action === '--prepare' && result.status === 'pending' ? 'OPENAGENT_ONBOARDING_PREPARED' : 'OPENAGENT_ONBOARDING_STATE'} ${JSON.stringify(result)}`)
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === fileURLToPath(import.meta.url)) {
  await main().catch(() => { console.error('OpenAgent 自动验收状态操作未完成：来源、状态或文件权限无法核实；本命令未发送消息，也未重启客户端。'); process.exitCode = 1 })
}
