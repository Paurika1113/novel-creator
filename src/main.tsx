// Electron API mock（浏览器环境，真实 Electron 由 preload 注入）
import './services/electronMock'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initPersistence } from './lib/persistence'
import './index.css'

// 初始化数据持久化
initPersistence()

// Dev-only: expose stores for testing via browser evaluate
if (import.meta.env.DEV) {
  import('./lib/devStores').then(({ exposeStores }) => exposeStores())
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
