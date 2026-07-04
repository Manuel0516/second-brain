import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Login } from './pages/Login'
import { Calendar } from './pages/Calendar'
import { SettingsLayout } from './modules/settings/SettingsLayout'
import { GeneralSettings } from './modules/settings/GeneralSettings'
import { CalendarSettings } from './modules/settings/CalendarSettings'
import { NotesSettings } from './modules/settings/NotesSettings'
import { AdminSettings } from './modules/settings/AdminSettings'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'

const Notes = lazy(() =>
  import('./modules/notes/Notes').then((module) => ({ default: module.Notes })),
)

const Fitness = lazy(() =>
  import('./modules/fitness/Fitness').then((module) => ({
    default: module.Fitness,
  })),
)

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const section = location.pathname.split('/')[1] || 'root'
  return (
    <div
      key={section}
      style={{
        height: '100%',
        animation: 'pageEnter 0.32s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {children}
    </div>
  )
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          <p className="text-sm text-[var(--text-secondary)]">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <PageTransition>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <SettingsProvider>
                <Calendar />
              </SettingsProvider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes/:pageId?"
          element={
            <ProtectedRoute>
              <SettingsProvider>
                <Suspense
                  fallback={<main className="route-loading">Loading…</main>}
                >
                  <Notes />
                </Suspense>
              </SettingsProvider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/fitness"
          element={
            <ProtectedRoute>
              <SettingsProvider>
                <Suspense
                  fallback={<main className="route-loading">Loading…</main>}
                >
                  <Fitness />
                </Suspense>
              </SettingsProvider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsProvider>
                <SettingsLayout />
              </SettingsProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/settings/general" replace />} />
          <Route path="general" element={<GeneralSettings />} />
          <Route path="calendar" element={<CalendarSettings />} />
          <Route path="notes" element={<NotesSettings />} />
          <Route path="admin" element={<AdminSettings />} />
        </Route>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/calendar" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </PageTransition>
  )
}

export function App() {
  return (
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppRoutes />
    </BrowserRouter>
  )
}
