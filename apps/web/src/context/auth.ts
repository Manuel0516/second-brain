import { createContext, useContext } from 'react'

export interface User {
  id: string
  username: string
  email: string
  role?: string
  is_test_account?: boolean
}

export interface AuthContextType {
  isAuthenticated: boolean
  user: User | null
  totpEnabled: boolean
  loading: boolean
  login: (email: string, password: string, totp?: string) => Promise<string>
  logout: () => Promise<void>
  refreshToken: () => Promise<boolean>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
