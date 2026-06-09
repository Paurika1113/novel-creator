const { contextBridge, ipcRenderer } = require('electron')

const electronAPI = {
  // 文件系统
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
  ensureDir: (dirPath) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  copyDir: (src, dest) => ipcRenderer.invoke('fs:copyDir', src, dest),
  getAppDataPath: () => ipcRenderer.invoke('fs:getAppDataPath'),

  // 环境信息
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
