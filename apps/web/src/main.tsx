import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { AuthProvider } from './context/AuthContext'
import { applyCachedVisualStyleBeforeMount } from './lib/appearance'
import './styles.css'

applyCachedVisualStyleBeforeMount()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
