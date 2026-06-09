export interface ElectronAPI {
  // 文件系统
  listDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; isFile: boolean }[]>
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<boolean>
  deleteFile: (filePath: string) => Promise<boolean>
  ensureDir: (dirPath: string) => Promise<boolean>
  exists: (filePath: string) => Promise<boolean>
  copyDir: (src: string, dest: string) => Promise<boolean>
  getAppDataPath: () => Promise<string>
  getAppPath?: () => Promise<string> // 应用数据目录路径

  // 环境
  getPlatform: () => Promise<string>
  getVersion: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
