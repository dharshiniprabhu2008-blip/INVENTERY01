import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from '../types';
import { apiRequest, setApiToken, setOnUnauthorized } from '../utils/api';

interface AuthContextValue {
  user: User | null;
  needsSetup: boolean;
  initializing: boolean;
  setupAdmin: (input: { name: string; email: string; password: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const status = await apiRequest<{ needsSetup: boolean }>('/auth/status');
      setNeedsSetup(status.needsSetup);
    } catch {
      // Ignore network hiccup on initial probe
    } finally {
      setInitializing(false);
    }
  }, []);

  const logout = useCallback(() => {
    setApiToken(null);
    setUser(null);
    void checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    setOnUnauthorized(logout);
    void checkStatus();
  }, [checkStatus, logout]);

  const setupAdmin = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const data = await apiRequest<{ token: string; user: User }>('/auth/setup-admin', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setApiToken(data.token);
      setUser(data.user);
      setNeedsSetup(false);
    },
    []
  );

  const login = useCallback(async (input: { email: string; password: string }) => {
    const data = await apiRequest<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setApiToken(data.token);
    setUser(data.user);
    setNeedsSetup(false);
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const data = await apiRequest<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setApiToken(data.token);
    setUser(data.user);
    setNeedsSetup(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await apiRequest<{ user: User }>('/auth/me');
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        needsSetup,
        initializing,
        setupAdmin,
        login,
        register,
        logout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
