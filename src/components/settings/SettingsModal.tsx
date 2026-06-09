import Modal from '../ui/Modal'
import { SettingsPanel } from './SettingsPanel'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      bodyStyle={{ padding: 0 }}
    >
      <div
        style={{
          width: '100%',
          height: 560,
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <SettingsPanel onClose={onClose} />
      </div>
    </Modal>
  )
}
