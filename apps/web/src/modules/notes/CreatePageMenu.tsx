import { Popover } from '../../components/Popover'
import type { Page } from './types'

const PAGE_TYPES: { type: Page['type']; label: string; hint: string }[] = [
  { type: 'page', label: 'Page', hint: 'A blank note with blocks.' },
  { type: 'folder', label: 'Folder', hint: 'Organizes pages, no content.' },
  {
    type: 'database',
    label: 'Database',
    hint: 'Records with properties and views.',
  },
]

interface CreatePageMenuProps {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  onCreate: (type: Page['type']) => void
}

/** "New page" popover: pick what kind of page to create. */
export function CreatePageMenu({
  anchorRef,
  open,
  onClose,
  onCreate,
}: CreatePageMenuProps) {
  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      align="end"
      className="notes-create-menu"
      role="menu"
      ariaLabel="New page type"
    >
      {PAGE_TYPES.map((item) => (
        <button
          key={item.type}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            onCreate(item.type)
          }}
        >
          <span className="notes-create-menu-label">{item.label}</span>
          <span className="notes-create-menu-hint">{item.hint}</span>
        </button>
      ))}
    </Popover>
  )
}
