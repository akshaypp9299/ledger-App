import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, post, setUnauthorizedHandler, tokenStore } from '../api/client'
import type { UserInfo } from '../api/types'

interface Auth {
  user: UserInfo | null
  loading: boolean
  canWrite: boolean // ADMIN or MANAGER
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}
const Ctx = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(!!tokenStore.get())
  const qc = useQueryClient()

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); qc.clear() }, [qc])

  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); qc.clear() })
    if (!tokenStore.get()) return
    api<UserInfo>('/me').then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false))
  }, [qc])

  const login = useCallback(async (email: string, password: string) => {
    const res = await post<{ token: string; user: UserInfo }>('/auth/login', { email, password })
    tokenStore.set(res.token)
    setUser(res.user)
  }, [])

  const value: Auth = { user, loading, canWrite: user?.role === 'ADMIN' || user?.role === 'MANAGER', isAdmin: user?.role === 'ADMIN', login, logout }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
