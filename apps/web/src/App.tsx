import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Login } from './pages/Login'
import { DeviceApprove } from './pages/DeviceApprove'
import { Calendar } from './pages/Calendar'
import { SettingsLayout } from './modules/settings/SettingsLayout'
import { GeneralSettings } from './modules/settings/GeneralSettings'
import { CalendarSettings } from './modules/settings/CalendarSettings'
import { FitnessSettings } from './modules/settings/FitnessSettings'
import { FoodSettings } from './modules/settings/FoodSettings'
import { NotesSettings } from './modules/settings/NotesSettings'
import { AdminSettings } from './modules/settings/AdminSettings'
import { AISettings } from './modules/settings/AISettings'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import { AssistantPanel } from './modules/assistant/AssistantPanel'

const Notes = lazy(() =>
  import('./modules/notes/Notes').then((module) => ({ default: module.Notes })),
)

const Fitness = lazy(() =>
  import('./modules/fitness/Fitness').then((module) => ({
    default: module.Fitness,
  })),
)

const Food = lazy(() =>
  import('./modules/food/Food').then((module) => ({
    default: module.Food,
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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/device" element={<DeviceApprove />} />
      <Route
        element={
          <ProtectedRoute>
            <SettingsProvider>
              <PageTransition>
                <Outlet />
              </PageTransition>
              <AssistantPanel />
            </SettingsProvider>
          </ProtectedRoute>
        }
      >
        <Route path="/calendar" element={<Calendar />} />
        <Route
          path="/notes/:pageId?"
          element={
            <Suspense
              fallback={<main className="route-loading">Loading…</main>}
            >
              <Notes />
            </Suspense>
          }
        />
        <Route
          path="/fitness"
          element={
            <Suspense
              fallback={<main className="route-loading">Loading…</main>}
            >
              <Fitness />
            </Suspense>
          }
        />
        <Route
          path="/food"
          element={
            <Suspense
              fallback={<main className="route-loading">Loading…</main>}
            >
              <Food />
            </Suspense>
          }
        />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="/settings/general" replace />} />
          <Route path="general" element={<GeneralSettings />} />
          <Route path="calendar" element={<CalendarSettings />} />
          <Route path="fitness" element={<FitnessSettings />} />
          <Route path="food" element={<FoodSettings />} />
          <Route path="notes" element={<NotesSettings />} />
          <Route path="ai" element={<AISettings />} />
          <Route path="admin" element={<AdminSettings />} />
        </Route>
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
