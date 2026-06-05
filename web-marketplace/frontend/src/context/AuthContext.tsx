import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { api } from '../api/client'
import type { User } from '../types'

export type { User }

interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
}

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  updateUser: (u: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStoredUser(): User | null {
  try {
    const stored = localStorage.getItem('pds_user')
    return stored ? (JSON.parse(stored) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser)

  const saveUser = (u: User | null) => {
    if (u) {
      localStorage.setItem('pds_user', JSON.stringify(u))
    } else {
      localStorage.removeItem('pds_user')
    }
    setUser(u)
  }

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ user: User; message: string }>('/auth/login', { email, password })
    saveUser(result.user)
  }, [])

  const register = useCallback(async (data: RegisterData) => {
    const result = await api.post<{ user: User; message: string }>('/auth/register', data)
    saveUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    localStorage.removeItem('pds_user')
    setUser(null)
  }, [])

  // Re-fetch user from /auth/me on mount and on window focus so access flags
  // stay in sync without requiring a full re-login.
  useEffect(() => {
    const refresh = () => {
      const stored = localStorage.getItem('pds_user')
      if (!stored) return
      api.get<{ user: User }>('/auth/me')
        .then(r => saveUser(r.user))
        .catch(() => {}) // silently ignore — stale token will be cleared on next explicit action
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, logout, updateUser: saveUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
