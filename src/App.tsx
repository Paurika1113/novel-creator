import { useState } from 'react'
import Sidebar from './components/layout/Sidebar'
import LibraryPage from './pages/LibraryPage'
import PersonaPage from './pages/PersonaPage'
import EditorPage from './pages/EditorPage'
import GitPage from './pages/GitPage'
import SettingsModal from './components/settings/SettingsModal'

export type PageId = 'library' | 'persona' | 'editor' | 'git'

function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('library')
  const [showSettings, setShowSettings] = useState(false)

  const renderPage = () => {
    switch (currentPage) {
      case 'library':
        return <LibraryPage onNavigate={setCurrentPage} />
      case 'persona':
        return <PersonaPage />
      case 'editor':
        return <EditorPage />
      case 'git':
        return <GitPage />
      default:
        return <LibraryPage />
    }
  }

  return (
    <div className="window">
      {/* Titlebar */}
      <header className="titlebar">
        <div className="titlebar-dots">
          <span className="titlebar-dot dot-close" />
          <span className="titlebar-dot dot-minimize" />
          <span className="titlebar-dot dot-maximize" />
        </div>
        <span className="titlebar-title">
          Novel Creator<em> · AI 小说创作工作台</em>
        </span>
      </header>

      {/* Main Layout */}
      <div className="main">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} onOpenSettings={() => setShowSettings(true)} />
        <div className="pages">
          {renderPage()}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}

export default App
