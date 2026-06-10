import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMsg: string | null
}

export default class EditorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMsg: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error.message || '未知错误' }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[EditorErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-content">
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <div className="empty-icon">⚠️</div>
            <p className="empty-text">编辑器遇到错误</p>
            <p className="empty-subtext" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {this.state.errorMsg}
            </p>
            <button
              className="chat-action-btn active"
              style={{ marginTop: 12 }}
              onClick={() => {
                this.setState({ hasError: false, errorMsg: null })
                window.location.reload()
              }}
            >
              重新加载
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
