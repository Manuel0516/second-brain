import { useState } from 'react'
import { Sidebar } from '../modules/calendar/Sidebar'
import { MonthView } from '../modules/calendar/MonthView'
import { useAuth } from '../context/AuthContext'

export function Calendar() {
  const { user, logout } = useAuth()
  const [_currentDate, setCurrentDate] = useState(new Date())

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Top bar */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Calendar</h1>
            <p className="text-xs text-[var(--text-secondary)]">
              {user?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-base)]"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-7xl">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">
            <MonthView onNavigate={setCurrentDate} />
          </main>
        </div>
      </div>
    </div>
  )
}
