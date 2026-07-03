import { useEffect, useMemo, useState } from 'react'
import { Dropdown } from './Dropdown'
import { apiCall } from '../lib/api'

interface FolderPage {
  id: string
  title: string
  parent_page_id: string | null
  position: string
  type: string
}

interface FolderPickerProps {
  value: string | null
  onChange: (id: string | null) => void
  label?: string
}

/**
 * Native select listing every folder page (type="folder"), depth-indented,
 * with a Root option. Used to pick where a note is created.
 */
export function FolderPicker({
  value,
  onChange,
  label = 'Folder',
}: FolderPickerProps) {
  const [pages, setPages] = useState<FolderPage[]>([])

  useEffect(() => {
    let active = true
    // ponytail: full page list fetch; fine at personal scale.
    apiCall('/api/pages')
      .then((response) => (response.ok ? response.json() : []))
      .then((result) => {
        if (active && Array.isArray(result)) setPages(result)
      })
      .catch(() => active && setPages([]))
    return () => {
      active = false
    }
  }, [])

  const options = useMemo(() => {
    const folders = pages.filter((page) => page.type === 'folder')
    const byParent = new Map<string | null, FolderPage[]>()
    const folderIds = new Set(folders.map((folder) => folder.id))
    for (const folder of folders) {
      // Folders nested under non-folder pages list at the top level.
      const parent =
        folder.parent_page_id && folderIds.has(folder.parent_page_id)
          ? folder.parent_page_id
          : null
      byParent.set(parent, [...(byParent.get(parent) ?? []), folder])
    }
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => a.position.localeCompare(b.position))
    }
    const flat: { id: string; title: string; depth: number }[] = []
    const walk = (parent: string | null, depth: number) => {
      for (const folder of byParent.get(parent) ?? []) {
        flat.push({ id: folder.id, title: folder.title, depth })
        walk(folder.id, depth + 1)
      }
    }
    walk(null, 0)
    return flat
  }, [pages])

  return (
    <Dropdown
      ariaLabel={label}
      value={value ?? ''}
      onChange={(id) => onChange(id || null)}
      placeholder="Root"
      options={[
        { value: '', label: 'Root' },
        ...options.map((option) => ({
          value: option.id,
          label:
            '\u00a0'.repeat(option.depth * 2) + (option.title || 'Untitled'),
        })),
      ]}
    />
  )
}
