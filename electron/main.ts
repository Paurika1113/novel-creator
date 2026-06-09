import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    title: 'Novel Creator',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#16162a',
      symbolColor: '#ffffff',
      height: 38,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // 开发模式加载 Vite 开发服务器
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ====== IPC Handlers ======

// 文件系统操作
ipcMain.handle('fs:listDir', async (_event, dirPath: string) => {
  const fs = await import('fs/promises')
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
  }))
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  const fs = await import('fs/promises')
  const content = await fs.readFile(filePath, 'utf-8')
  return content
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  const fs = await import('fs/promises')
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
  const fs = await import('fs/promises')
  await fs.rm(filePath, { recursive: true, force: true })
  return true
})

ipcMain.handle('fs:ensureDir', async (_event, dirPath: string) => {
  const fs = await import('fs/promises')
  await fs.mkdir(dirPath, { recursive: true })
  return true
})

ipcMain.handle('fs:exists', async (_event, filePath: string) => {
  const fs = await import('fs/promises')
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('fs:copyDir', async (_event, src: string, dest: string) => {
  const fs = await import('fs/promises')
  await fs.cp(src, dest, { recursive: true })
  return true
})

ipcMain.handle('fs:getAppDataPath', () => {
  return path.join(app.getPath('userData'), 'novel-creator-data')
})

// 环境信息
ipcMain.handle('app:getPlatform', () => process.platform)
ipcMain.handle('app:getVersion', () => app.getVersion())
