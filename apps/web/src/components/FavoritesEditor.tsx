import { useCallback, useRef, useState } from 'react'

function RemoveIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  )
}

function EmojiTile({
  emoji,
  onRemove,
}: {
  emoji: string
  onRemove: () => void
}) {
  return (
    <div
      className="fav-tile"
      style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--r-sm)',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border-strong)',
        fontSize: 18,
      }}
    >
      <span className="event-icon-glyph">{emoji}</span>
      <button
        type="button"
        className="fav-remove"
        onClick={onRemove}
        aria-label={`Remove ${emoji}`}
      >
        <RemoveIcon />
      </button>
    </div>
  )
}

function ColorSwatch({
  color,
  onRemove,
}: {
  color: string
  onRemove: () => void
}) {
  return (
    <div
      className="fav-tile"
      style={{
        width: 21,
        height: 21,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: '0 0 0 1px var(--border-strong)',
      }}
    >
      <button
        type="button"
        className="fav-remove"
        onClick={onRemove}
        aria-label={`Remove colour ${color}`}
      >
        <RemoveIcon />
      </button>
    </div>
  )
}

function CoverTile({
  cover,
  onRemove,
}: {
  cover: string
  onRemove: () => void
}) {
  const isGradient = cover.startsWith('gradient:')
  return (
    <div
      className="fav-tile"
      style={{
        width: 64,
        height: 40,
        borderRadius: 'var(--r-sm)',
        border: '1px solid var(--border-strong)',
        backgroundImage: isGradient ? undefined : `url("${cover}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: isGradient ? 'var(--bg-raised)' : undefined,
        backgroundRepeat: 'no-repeat',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        className="fav-remove"
        onClick={onRemove}
        aria-label="Remove cover"
      >
        <RemoveIcon />
      </button>
    </div>
  )
}

interface FavoriteEmojiEditorProps {
  emojis: string[]
  onChange: (emojis: string[]) => void
  max?: number
}

/** Manage a list of favourite emojis — shown first in emoji pickers (calendar, notes). */
export function FavoriteEmojiEditor({
  emojis,
  onChange,
  max = 32,
}: FavoriteEmojiEditorProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const add = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || emojis.length >= max) return
    onChange([...emojis, trimmed])
    setInput('')
    inputRef.current?.focus()
  }, [input, emojis, max, onChange])

  const remove = useCallback(
    (index: number) => onChange(emojis.filter((_, i) => i !== index)),
    [emojis, onChange],
  )

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
      }}
    >
      {emojis.map((emoji, i) => (
        <EmojiTile
          key={`${emoji}-${i}`}
          emoji={emoji}
          onRemove={() => remove(i)}
        />
      ))}
      <div
        className="editor-icon-custom"
        style={{
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--r-sm)',
          border: '1px dashed var(--border-strong)',
          background: 'transparent',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          aria-label="Add emoji"
          placeholder="➕"
          maxLength={8}
          className="event-icon-glyph"
          style={{
            border: 'none',
            background: 'transparent',
            textAlign: 'center',
            fontSize: 16,
            color: 'var(--text-secondary)',
            outline: 'none',
            fontFamily:
              '"Symbols Nerd Font", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
          }}
          onFocus={(e) => {
            e.currentTarget.parentElement!.style.borderColor = 'var(--accent)'
          }}
          onBlur={(e) => {
            e.currentTarget.parentElement!.style.borderColor =
              'var(--border-strong)'
            if (e.currentTarget.value.trim()) add()
          }}
        />
      </div>
    </div>
  )
}

interface FavoriteColorEditorProps {
  colors: string[]
  onChange: (colors: string[]) => void
  max?: number
}

/** Manage a list of favourite hex colours — shown first in colour pickers. */
export function FavoriteColorEditor({
  colors,
  onChange,
  max = 24,
}: FavoriteColorEditorProps) {
  const add = useCallback(
    (color: string) => {
      if (colors.length >= max) return
      onChange([...colors, color])
    },
    [colors, max, onChange],
  )

  const remove = useCallback(
    (index: number) => onChange(colors.filter((_, i) => i !== index)),
    [colors, onChange],
  )

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}
    >
      {colors.map((color, i) => (
        <ColorSwatch
          key={`${color}-${i}`}
          color={color}
          onRemove={() => remove(i)}
        />
      ))}
      <label
        className="color-custom"
        title="Add colour"
        style={{
          width: 21,
          height: 21,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          background: 'var(--bg-elevated)',
          border: '1px dashed var(--border-strong)',
          position: 'relative',
        }}
      >
        <input
          type="color"
          aria-label="Add colour"
          onChange={(e) => add(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: 'pointer',
            width: '100%',
            height: '100%',
          }}
        />
        <span
          style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1 }}
        >
          +
        </span>
      </label>
    </div>
  )
}

interface FavoriteCoverEditorProps {
  covers: string[]
  onChange: (covers: string[]) => void
  max?: number
}

/** Manage a list of favourite cover image URLs — shown first in the cover picker. */
export function FavoriteCoverEditor({
  covers,
  onChange,
  max = 12,
}: FavoriteCoverEditorProps) {
  const [input, setInput] = useState('')

  const add = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || covers.length >= max) return
    onChange([...covers, trimmed])
    setInput('')
  }, [input, covers, max, onChange])

  const remove = useCallback(
    (index: number) => onChange(covers.filter((_, i) => i !== index)),
    [covers, onChange],
  )

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {covers.map((cover, i) => (
          <CoverTile
            key={`${cover}-${i}`}
            cover={cover}
            onRemove={() => remove(i)}
          />
        ))}
      </div>
      <input
        type="url"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
        placeholder="Paste image URL, press Enter…"
        aria-label="Add favourite cover image URL"
        style={{
          minHeight: 38,
          border: '1px solid var(--border-strong)',
          borderRadius: 7,
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontSize: 13,
          padding: '8px 10px',
          outline: 'none',
        }}
      />
    </div>
  )
}
