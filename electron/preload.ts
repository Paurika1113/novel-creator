import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // 文件系统
  listDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  deleteFile: (filePath: string) => ipcRenderer.invoke('fs:deleteFile', filePath),
  ensureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
  copyDir: (src: string, dest: string) => ipcRenderer.invoke('fs:copyDir', src, dest),
  getAppDataPath: () => ipcRenderer.invoke('fs:getAppDataPath'),

  // 环境信息
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
