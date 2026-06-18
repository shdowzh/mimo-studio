// chatStore.sendMessage fallback 决策测试
// 不跑真正的 API，只验证路由逻辑 + 状态变更

import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock 掉所有外部依赖
vi.mock('@/lib/mimoClient', () => ({
  mimoClient: {
    isConnected: false,
    connect: vi.fn(),
    on: vi.fn(() => () => {}),
    listSessions: vi.fn(() => Promise.resolve([])),
    createSession: vi.fn(() => Promise.resolve({ id: 'test-session', title: 'test', time: { updated: 0 } })),
    sendMessage: vi.fn(() => Promise.resolve()),
    setAuth: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/lib/directChat', () => ({
  directChat: vi.fn(() => Promise.resolve()),
  getDefaultProvider: vi.fn(() => Promise.resolve({ providerId: 'openai', modelId: 'gpt-4o' })),
}))

vi.mock('@/lib/ipc', () => ({
  isElectron: vi.fn(() => true),
  getAPI: vi.fn(() => ({
    settings: { get: vi.fn(() => Promise.resolve(null)), set: vi.fn(() => Promise.resolve()) },
    secret: { getApiKey: vi.fn(() => Promise.resolve('test-key')), setApiKey: vi.fn(() => Promise.resolve()), deleteApiKey: vi.fn(() => Promise.resolve()), listApiKeyProviders: vi.fn(() => Promise.resolve(['openai'])), isEncryptionAvailable: vi.fn(() => Promise.resolve(true)) },
    mimo: { startServer: vi.fn(() => Promise.resolve({ port: 0, password: '' })), stopServer: vi.fn(), serverStatus: vi.fn(() => Promise.resolve({ running: false, port: 0, password: '', mode: 'unknown' })), detect: vi.fn(() => Promise.resolve({ installed: false })), install: vi.fn(), onInstallProgress: vi.fn(() => () => {}), onStatus: vi.fn(() => () => {}) },
    terminal: { create: vi.fn(), write: vi.fn(), onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}), resize: vi.fn(), kill: vi.fn() },
    files: { readMemory: vi.fn(() => Promise.resolve(null)), writeMemory: vi.fn(), readSkills: vi.fn(() => Promise.resolve([])), readSkill: vi.fn(), writeSkill: vi.fn(), deleteSkill: vi.fn() },
    native: { openDirectory: vi.fn(), openFile: vi.fn(), showItemInFolder: vi.fn() },
  })),
}))

vi.mock('@/lib/secret', () => ({
  getApiKey: vi.fn(() => Promise.resolve('test-key')),
  setApiKey: vi.fn(() => Promise.resolve()),
  deleteApiKey: vi.fn(() => Promise.resolve()),
  listApiKeyProviders: vi.fn(() => Promise.resolve(['openai'])),
  loadAllApiKeys: vi.fn(() => Promise.resolve({ openai: 'test-key' })),
  isEncryptionAvailable: vi.fn(() => Promise.resolve(true)),
}))

import { useChatStore } from '@/stores/chatStore'
import { directChat, getDefaultProvider } from '@/lib/directChat'

describe('chatStore fallback 决策', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 重置 store 到初始状态
    const { serverConnected, serverReady, currentSessionID, currentProvider, currentModel } = useChatStore.getState()
    useChatStore.setState({
      serverConnected: false,
      serverReady: false,
      currentSessionID: null,
      currentProvider: 'openai',
      currentModel: 'gpt-4o',
      messages: {},
      sessionStatus: {},
      permissionRequests: {},
      sessionDiffs: {},
      lastError: null,
      initError: null,
    })
  })

  it('server 未连接时走 directChat fallback', async () => {
    const state = useChatStore.getState()
    expect(state.serverConnected).toBe(false)
    expect(state.serverReady).toBe(false)

    // sendMessage 应该走 fallback 路径
    await useChatStore.getState().sendMessage('test message')

    // directChat 应该被调用
    expect(directChat).toHaveBeenCalled()
  })

  it('空消息不触发任何调用', async () => {
    await useChatStore.getState().sendMessage('   ')
    expect(directChat).not.toHaveBeenCalled()
  })

  it('无可用 provider 时设置 lastError', async () => {
    vi.mocked(getDefaultProvider).mockResolvedValueOnce(null)
    useChatStore.setState({ currentModel: '' })

    await useChatStore.getState().sendMessage('test')

    // 应该设置了错误状态
    const state = useChatStore.getState()
    expect(state.lastError).toBeTruthy()
  })
})
