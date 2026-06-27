import { format, parseISO } from 'date-fns'
import { useEffect, useRef } from 'react'

interface EventData {
  id: string
  title: string
  description?: string
  start_at: string
  end_at: string
  all_day: boolean
  calendar: {
    id: string
    name: string
    color: string
  }
}

interface EventDetailProps {
  event: EventData
  onClose: () => void
}

export function EventDetail({ event, onClose }: EventDetailProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Close on background click
  const handleBackgroundClick = (
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const startDate = parseISO(event.start_at)
  const endDate = parseISO(event.end_at)

  const formatTime = (date: Date) => {
    return format(date, 'h:mm a')
  }

  const formatDate = (date: Date) => {
    return format(date, 'EEEE, MMMM d, yyyy')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={handleBackgroundClick}
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-md bg-[var(--bg-elevated)] shadow-lg"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              Event Details
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
              aria-label="Close"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Title */}
            <div>
              <h3 className="text-2xl font-semibold text-[var(--text-primary)]">
                {event.title}
              </h3>
            </div>

            {/* Calendar */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Calendar
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: event.calendar.color }}
                />
                <span className="text-sm text-[var(--text-primary)]">
                  {event.calendar.name}
                </span>
              </div>
            </div>

            {/* Date/Time */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Date & Time
              </p>
              <div className="mt-2 space-y-1 text-sm text-[var(--text-primary)]">
                <p>{formatDate(startDate)}</p>
                {!event.all_day && (
                  <p>
                    {formatTime(startDate)} – {formatTime(endDate)}
                  </p>
                )}
                {event.all_day && (
                  <p className="text-[var(--text-secondary)]">All day</p>
                )}
              </div>
            </div>

            {/* Description */}
            {event.description && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                  Description
                </p>
                <p className="mt-2 text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                  {event.description}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border)] px-6 py-4">
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-[var(--bg-base)] px-4 py-2 font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-raised)]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
