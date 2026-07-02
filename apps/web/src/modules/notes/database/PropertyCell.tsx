import { useEffect, useRef, useState } from 'react'
import { Dropdown } from '../../../components/Dropdown'
import { notesApi } from '../api'
import type { DatabaseProperty, SearchResult } from '../types'

interface PropertyCellProps {
  property: DatabaseProperty
  value: unknown
  onChange: (value: unknown) => void
}

/** Typed inline editor for one record cell. Native inputs wherever possible. */
export function PropertyCell({ property, value, onChange }: PropertyCellProps) {
  switch (property.type) {
    case 'checkbox':
      return (
        <input
          type="checkbox"
          aria-label={property.name}
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          aria-label={property.name}
          className="notes-cell-input"
          defaultValue={typeof value === 'number' ? value : ''}
          onBlur={(event) =>
            onChange(
              event.target.value === '' ? null : Number(event.target.value),
            )
          }
          onKeyDown={blurOnEnter}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          aria-label={property.name}
          className="notes-cell-input"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
        />
      )
    case 'select':
      return (
        <Dropdown
          ariaLabel={property.name}
          value={typeof value === 'string' ? value : ''}
          onChange={(value) => onChange(value || null)}
          placeholder="—"
          options={(property.config.options ?? []).map((option) => ({
            value: option,
            label: option,
          }))}
        />
      )
    case 'multi_select':
      return (
        <MultiSelectCell
          property={property}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      )
    case 'relation':
      return (
        <RelationCell
          property={property}
          value={typeof value === 'string' ? value : null}
          onChange={onChange}
        />
      )
    default:
      // text | url
      return (
        <input
          type={property.type === 'url' ? 'url' : 'text'}
          aria-label={property.name}
          className="notes-cell-input"
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(event) => onChange(event.target.value || null)}
          onKeyDown={blurOnEnter}
        />
      )
  }
}

const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur()
}

function usePopover(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  })
  return ref
}

function MultiSelectCell({
  property,
  value,
  onChange,
}: {
  property: DatabaseProperty
  value: string[]
  onChange: (value: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = usePopover(() => setOpen(false))
  const options = property.config.options ?? []
  return (
    <div className="notes-cell-popover-anchor" ref={ref}>
      <button
        type="button"
        className="notes-cell-trigger"
        aria-label={`${property.name} values`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {value.length ? (
          value.map((item) => (
            <span key={item} className="notes-cell-pill">
              {item}
            </span>
          ))
        ) : (
          <span className="notes-cell-empty">—</span>
        )}
      </button>
      {open && (
        <div
          className="notes-cell-popover"
          role="listbox"
          aria-label={property.name}
        >
          {options.map((option) => {
            const active = value.includes(option)
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() =>
                  onChange(
                    active
                      ? value.filter((item) => item !== option)
                      : [...value, option],
                  )
                }
              >
                <span className="notes-cell-pill">{option}</span>
                {active && '✓'}
              </button>
            )
          })}
          {!options.length && (
            <p className="notes-cell-empty">
              No options yet — add them on the column.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RelationCell({
  property,
  value,
  onChange,
}: {
  property: DatabaseProperty
  value: string | null
  onChange: (value: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [label, setLabel] = useState<string | null>(null)
  const [labelFor, setLabelFor] = useState(value)
  const ref = usePopover(() => setOpen(false))

  // Reset the resolved title when the linked page changes (render-adjust
  // pattern; avoids a cascading setState inside the effect).
  if (labelFor !== value) {
    setLabelFor(value)
    setLabel(null)
  }
  useEffect(() => {
    if (!value) return
    let active = true
    notesApi
      .get(value)
      .then((page) => active && setLabel(page.title || 'Untitled'))
      .catch(() => active && setLabel('Untitled'))
    return () => {
      active = false
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    let active = true
    notesApi
      .search(query)
      .then((items) =>
        active
          ? setResults(items.filter((item) => item.type === 'page'))
          : null,
      )
      .catch(() => active && setResults([]))
    return () => {
      active = false
    }
  }, [open, query])

  return (
    <div className="notes-cell-popover-anchor" ref={ref}>
      <button
        type="button"
        className="notes-cell-trigger"
        aria-label={property.name}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {value ? (
          <span className="notes-cell-pill">{label ?? '…'}</span>
        ) : (
          <span className="notes-cell-empty">—</span>
        )}
      </button>
      {open && (
        <div
          className="notes-cell-popover"
          role="dialog"
          aria-label={`Link ${property.name}`}
        >
          <input
            className="notes-cell-input"
            aria-label="Search pages"
            placeholder="Search pages…"
            value={query}
            ref={(input) => input?.focus()}
            onChange={(event) => setQuery(event.target.value)}
          />
          {results.slice(0, 8).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange(item.id)
                setOpen(false)
              }}
            >
              {item.title || 'Untitled'}
            </button>
          ))}
          {value && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
