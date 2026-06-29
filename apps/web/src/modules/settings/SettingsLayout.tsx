import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { AppRail } from '../../components/AppRail'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'

function SettingsSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="skeleton" style={{ height: 22, width: 160 }} />
        <div className="skeleton" style={{ height: 14, width: 280 }} />
      </div>
      {[0, 1, 2].map((card) => (
        <div
          key={card}
          style={{
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-base)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div className="skeleton" style={{ height: 14, width: 140 }} />
          <div className="skeleton" style={{ height: 38, borderRadius: 7 }} />
          <div
            className="skeleton"
            style={{ height: 38, width: '70%', borderRadius: 7 }}
          />
        </div>
      ))}
    </div>
  )
}

const NAV_ITEMS = [
  { to: '/settings/general', label: 'General', disabled: false },
  { to: '/settings/calendar', label: 'Calendar', disabled: false },
  { to: '/settings/fitness', label: 'Fitness', disabled: true },
  { to: '/settings/food', label: 'Food', disabled: true },
  { to: '/settings/notes', label: 'Notes', disabled: true },
  { to: '/settings/security', label: 'Security', disabled: true },
]

const navBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  cursor: 'pointer',
  transition: 'background .15s',
}

export function SettingsLayout() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { loading } = useSettings()
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 800,
  )
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth > 800,
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const update = () => setIsMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // On mobile, close both sidebar and rail when toggling
  const toggleSidebar = () => {
    setSidebarOpen((open) => !open)
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {/* On mobile, hide rail when sidebar is closed */}
      {(!isMobile || sidebarOpen) && (
        <AppRail active="settings" onNavigate={navigate} />
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minWidth: 0,
          position: 'relative',
        }}
      >
        {/* Settings nav sidebar */}
        <nav
          className={`calendar-sidebar settings-nav ${sidebarOpen ? '' : 'closed'}`}
          style={{
            padding: '20px 10px',
          }}
        >
          <div className="sidebar-title" style={{ paddingLeft: 4 }}>
            <span>Settings</span>
            <div className="sidebar-title-actions">
              <button
                type="button"
                className="sidebar-close"
                aria-label="Close settings navigation"
                onClick={() => setSidebarOpen(false)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 2 }}>
            {NAV_ITEMS.map((item) =>
              item.disabled ? (
                <div
                  key={item.to}
                  className="settings-nav-item disabled"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 38,
                    padding: '6px 10px',
                    borderRadius: 8,
                    color: 'var(--text-tertiary)',
                    fontSize: 13,
                    cursor: 'default',
                  }}
                >
                  <span>{item.label}</span>
                  <span className="integration-status">Soon</span>
                </div>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/settings/general'}
                  className={({ isActive }) =>
                    `settings-nav-item ${isActive ? 'active' : ''}`
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 38,
                    padding: '6px 10px',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    transition: 'background .14s, color .14s',
                  }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.classList.contains('active')) {
                      e.currentTarget.style.background =
                        'color-mix(in srgb, var(--text-primary) 4%, transparent)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.classList.contains('active')) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {({ isActive }) => (
                    <span
                      style={{
                        color: isActive ? 'var(--text-primary)' : undefined,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {item.label}
                    </span>
                  )}
                </NavLink>
              ),
            )}
          </div>
        </nav>
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            role="presentation"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <div
          className="settings-main"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* Topbar with toggle button + title + account name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '18px 28px 14px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <button
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
              aria-pressed={sidebarOpen}
              style={navBtnStyle}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'var(--bg-raised)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'var(--bg-elevated)')
              }
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                <path d="M7.5 3.5v13" />
              </svg>
            </button>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-.01em',
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Settings
            </h2>
            {user?.username && (
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--text-tertiary)',
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {user.username}
              </span>
            )}
          </div>

          {/* Scrollable content area */}
          <div
            className="settings-content"
            style={{
              flex: 1,
              padding: '24px 28px',
              maxWidth: 760,
              overflow: 'auto',
              minWidth: 0,
            }}
          >
            {loading ? <SettingsSkeleton /> : <Outlet />}
          </div>
        </div>
      </div>
    </div>
  )
}
