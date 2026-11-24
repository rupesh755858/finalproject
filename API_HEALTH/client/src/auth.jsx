import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

/**
 * Holds the signed-in account (including its role) for the whole app.
 * The token lives in localStorage; the role is always re-read from the server
 * so a promotion or a disabled account takes effect on the next load.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const data = await api('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    refresh,
    logout,
    canAdmin: user?.role === 'admin' || user?.role === 'controller',
    isController: user?.role === 'controller',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export const ROLE_LABEL = { controller: 'Controller', admin: 'Admin', user: 'Member' };
