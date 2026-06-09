/**
 * 本地存储抽象层
 * 优先使用 Electron 文件系统 API，回退到 localStorage
 * 解决 localStorage 5-10MB 容量限制问题
 */

const STORAGE_PREFIX = 'nc:'

/**
 * 检测 localStorage 是否接近容量上限
 */
function isLocalStorageNearLimit(): boolean {
  try {
    const testKey = `${STORAGE_PREFIX}__capacity_test__`
    const testData = 'x'.repeat(1024 * 100) // 100KB
    localStorage.setItem(testKey, testData)
    localStorage.removeItem(testKey)
    return false
  } catch {
    return true
  }
}

/**
 * 保存文件内容
 * 优先使用 Electron API，回退到 localStorage
 */
export async function saveFileContent(bookId: string, filePath: string, content: string): Promise<void> {
  const key = `${STORAGE_PREFIX}${bookId}:${filePath}`

  // 尝试使用 Electron 文件系统 API
  if (window.electronAPI?.writeFile) {
    try {
      // 使用 Electron 的文件系统存储到应用数据目录
      const appPath = await window.electronAPI.getAppPath?.() || ''
      if (appPath) {
        const fullPath = `${appPath}/books/${bookId}/${filePath}`
        await window.electronAPI.writeFile(fullPath, content)
        return
      }
    } catch {
      // Electron API 失败，回退到 localStorage
    }
  }

  // 回退到 localStorage，但检测容量
  try {
    localStorage.setItem(key, content)
  } catch (e) {
    if (isLocalStorageNearLimit()) {
      console.warn('localStorage 接近容量上限，建议清理旧文件或使用 Electron 版本')
      throw new Error(`存储空间不足：无法保存 ${filePath}。请删除一些旧文件或升级到 Electron 版本以获得更大存储空间。`)
    }
    throw e
  }
}

/**
 * 读取文件内容
 */
export async function loadFileContent(bookId: string, filePath: string): Promise<string | null> {
  const key = `${STORAGE_PREFIX}${bookId}:${filePath}`

  // 尝试使用 Electron 文件系统 API
  if (window.electronAPI?.readFile) {
    try {
      const appPath = await window.electronAPI.getAppPath?.() || ''
      if (appPath) {
        const fullPath = `${appPath}/books/${bookId}/${filePath}`
        const content = await window.electronAPI.readFile(fullPath)
        return content
      }
    } catch {
      // Electron API 失败，回退到 localStorage
    }
  }

  // 回退到 localStorage
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * 删除文件内容
 */
export async function removeFileContent(bookId: string, filePath: string): Promise<void> {
  const key = `${STORAGE_PREFIX}${bookId}:${filePath}`

  // 尝试使用 Electron 文件系统 API
  if (window.electronAPI?.deleteFile) {
    try {
      const appPath = await window.electronAPI.getAppPath?.() || ''
      if (appPath) {
        const fullPath = `${appPath}/books/${bookId}/${filePath}`
        await window.electronAPI.deleteFile(fullPath)
        return
      }
    } catch {
      // Electron API 失败，回退到 localStorage
    }
  }

  // 回退到 localStorage
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * 获取当前存储使用情况的估算
 */
export function getStorageUsage(): { used: number; total: number; percentage: number } {
  let used = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX)) {
        const value = localStorage.getItem(key) || ''
        used += key.length + value.length
      }
    }
  } catch {
    // ignore
  }

  // localStorage 通常限制 5-10MB，这里按 5MB 保守估算
  const total = 5 * 1024 * 1024
  return {
    used,
    total,
    percentage: Math.min((used / total) * 100, 100),
  }
}
