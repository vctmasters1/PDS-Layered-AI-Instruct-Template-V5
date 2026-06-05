/**
 * AuthContext.tsx
 * Manages the logged-in user throughout the WEB-HMI React app.
 *
 * Auth is SOFT — the app works without it (local WiFi/BLE connections always work).
 * Cloud features (device registry, config sync) require a valid session.
 *
 * Tokens are stored in an httpOnly cookie (set by WEB-HMI/api or WEB-Marketplace/api).
 * GET /v1/auth/me is called once on mount to restore the session.
 */

import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../services/apiClient';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  isStaff: boolean;
}

export interface AuthContextType {
  user: AuthUser | null;
  /** True while the initial /me check is in-flight — prevents a flash of "not logged in". */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount — only clear user on a real 401, not network errors
  useEffect(() => {
    api.get<AuthUser>('/auth/me')
      .then(setUser)
      .catch((err: any) => {
        // A 401 means the token is invalid/expired — clear session
        // A network error means the API is temporarily unreachable — keep current state
        if (err?.status === 401 || err?.message?.includes('401')) {
          setUser(null);
        }
        // Otherwise leave user as null (initial state) — cookie still valid
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<AuthUser>('/auth/login', { email, password });
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout', {}).catch(() => {/* ignore network errors on logout */});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};


