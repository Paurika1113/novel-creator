/**
 * Electron API 浏览器端 Mock
 * 当应用在浏览器中运行时提供文件系统操作的模拟实现，
 * 使用 localStorage + IndexedDB 进行数据持久化。
 * 在真机 Electron 环境中由 preload.js 注入真实实现。
 */

import type { ElectronAPI } from '../types/electron'

// 模拟文件系统：使用内存 Map 存储
const virtualFS = new Map<string, string>()

// 初始种子数据
function initSeedData() {
  if (!virtualFS.has('/')) {
    virtualFS.set('/', '')
  }
}

initSeedData()

export const electronAPIMock: ElectronAPI = {
  listDir: async (dirPath: string) => {
    const entries: { name: string; isDirectory: boolean; isFile: boolean }[] = []
    const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/'

    for (const key of virtualFS.keys()) {
      if (key.startsWith(prefix)) {
        const relative = key.slice(prefix.length)
        const parts = relative.split('/')
        if (parts.length >= 1 && parts[0]) {
          const name = parts[0]
          if (!entries.find((e) => e.name === name)) {
            entries.push({
              name,
              isDirectory: parts.length > 1,
              isFile: parts.length === 1,
            })
          }
        }
      }
    }
    return entries
  },

  readFile: async (filePath: string) => {
    const content = virtualFS.get(filePath)
    if (content === undefined) {
      // 尝试从 localStorage 恢复
      const saved = localStorage.getItem(`nc:${filePath}`)
      if (saved) {
        virtualFS.set(filePath, saved)
        return saved
      }
      throw new Error(`File not found: ${filePath}`)
    }
    return content
  },

  writeFile: async (filePath: string, content: string) => {
    virtualFS.set(filePath, content)
    localStorage.setItem(`nc:${filePath}`, content)
    return true
  },

  deleteFile: async (filePath: string) => {
    virtualFS.delete(filePath)
    localStorage.removeItem(`nc:${filePath}`)
    return true
  },

  ensureDir: async (_dirPath: string) => {
    return true
  },

  exists: async (filePath: string) => {
    return virtualFS.has(filePath) || localStorage.getItem(`nc:${filePath}`) !== null
  },

  copyDir: async (_src: string, _dest: string) => {
    return true
  },

  getAppDataPath: async () => {
    return '/novel-creator-data'
  },

  getPlatform: async () => 'win32',
  getVersion: async () => '1.0.0',
}

// 自动注入 mock（当 electronAPI 不存在时）
if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = electronAPIMock
}
