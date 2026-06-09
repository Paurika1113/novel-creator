import type { PageId } from '../../App'

interface SidebarProps {
  currentPage: PageId
  onNavigate: (page: PageId) => void
  onOpenSettings?: () => void
}

const navItems: { id: PageId; icon: string; label: string }[] = [
  { id: 'library', icon: '📚', label: '作品库' },
  { id: 'editor', icon: '✍️', label: '创作台' },
  { id: 'git', icon: '🔀', label: '版本管理' },
  { id: 'persona', icon: '👤', label: '作者身份' },
]

export default function Sidebar({ currentPage, onNavigate, onOpenSettings }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">N</div>
        <span className="sidebar-brand-text">Novel Creator</span>
      </div>

      <div className="sidebar-nav">
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="nav-item settings" onClick={onOpenSettings}>
          <span className="nav-icon">⚙️</span>
          <span>设置</span>
        </div>
      </div>
    </nav>
  )
}
