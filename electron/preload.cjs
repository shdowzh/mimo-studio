const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // === Mimo Server 管理 ===
  mimo: {
    startServer: () => ipcRenderer.invoke('mimo:startServer'),
    stopServer: () => ipcRenderer.invoke('mimo:stopServer'),
    serverStatus: () => ipcRenderer.invoke('mimo:serverStatus'),
    detect: () => ipcRenderer.invoke('mimo:detect'),
    install: () => ipcRenderer.invoke('mimo:install'),
    onInstallProgress: (callback) => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('mimo:installProgress', handler)
      return () => ipcRenderer.removeListener('mimo:installProgress', handler)
    },
    onStatus: (callback) => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('mimo:status', handler)
      return () => ipcRenderer.removeListener('mimo:status', handler)
    },
  },

  // === 本地设置 ===
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },

  // === API Key 加密存储（safeStorage）===
  secret: {
    getApiKey: (providerId) => ipcRenderer.invoke('secret:getApiKey', providerId),
    setApiKey: (providerId, plain) => ipcRenderer.invoke('secret:setApiKey', providerId, plain),
    deleteApiKey: (providerId) => ipcRenderer.invoke('secret:deleteApiKey', providerId),
    listApiKeyProviders: () => ipcRenderer.invoke('secret:listApiKeyProviders'),
    isEncryptionAvailable: () => ipcRenderer.invoke('secret:isEncryptionAvailable'),
  },

  // === 终端 ===
  terminal: {
    create: (opts) => ipcRenderer.invoke('terminal:create', opts),
    write: (sessionId, data) => ipcRenderer.invoke('terminal:write', sessionId, data),
    onData: (sessionId, callback) => {
      const channel = `terminal:data:${sessionId}`
      const handler = (event, data) => callback(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    onExit: (sessionId, callback) => {
      const channel = `terminal:exit:${sessionId}`
      const handler = (event, code) => callback(code)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    onCleanup: (sessionId, callback) => {
      const channel = `terminal:cleanup:${sessionId}`
      const handler = () => callback()
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    resize: (sessionId, cols, rows) => ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
    kill: (sessionId) => ipcRenderer.invoke('terminal:kill', sessionId),
  },

  // === 文件 I/O ===
  files: {
    readMemory: (type) => ipcRenderer.invoke('files:readMemory', type),
    writeMemory: (type, content) => ipcRenderer.invoke('files:writeMemory', type, content),
    readSkills: () => ipcRenderer.invoke('files:readSkills'),
    readSkill: (name) => ipcRenderer.invoke('files:readSkill', name),
    writeSkill: (name, content) => ipcRenderer.invoke('files:writeSkill', name, content),
    deleteSkill: (name) => ipcRenderer.invoke('files:deleteSkill', name),
    readAsDataUrl: (path) => ipcRenderer.invoke('files:readAsDataUrl', path),
    stat: (path) => ipcRenderer.invoke('files:stat', path),
  },

  // === 原生功能 ===
  native: {
    openDirectory: () => ipcRenderer.invoke('native:openDirectory'),
    openFile: (filters) => ipcRenderer.invoke('native:openFile', filters),
    showItemInFolder: (path) => ipcRenderer.invoke('native:showItemInFolder', path),
    // 从 DataTransfer.files / clipboard File 拿到磁盘绝对路径
    // Electron 32+ 推荐 API，取代废弃的 file.path 属性
    // 截图等"无路径源"会返回空字符串，调用方需判空
    getPathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file) || ''
      } catch {
        return ''
      }
    },
  },

  // === 自动更新 ===
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onAvailable: (callback) => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('updater:available', handler)
      return () => ipcRenderer.removeListener('updater:available', handler)
    },
    onProgress: (callback) => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('updater:progress', handler)
      return () => ipcRenderer.removeListener('updater:progress', handler)
    },
    onDownloaded: (callback) => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('updater:downloaded', handler)
      return () => ipcRenderer.removeListener('updater:downloaded', handler)
    },
  },

  // === 平台标识（让渲染端区分 mac / win / linux 自绘 chrome） ===
  platform: process.platform,

  // === 窗口控制（frame:false 模式下渲染端调用） ===
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback) => {
      const handler = (event, isMax) => callback(isMax)
      ipcRenderer.on('window:maximize-change', handler)
      return () => ipcRenderer.removeListener('window:maximize-change', handler)
    },
  },
})
