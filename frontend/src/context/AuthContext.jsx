/**
 * AuthContext.jsx — Global authentication state for Teashore.
 *
 * Storage: localStorage key "teashore_token"
 * On app load: calls GET /api/auth/me to validate any stored token.
 *   - Valid  → user is hydrated into context, session continues.
 *   - Invalid/expired → token is cleared, user treated as logged out.
 *
 * Exports:
 *   AuthProvider  — wrap the app with this
 *   useAuth()     — hook: { user, token, loading, login, logout }
 *
 * login(tokenData)  — called after a successful /auth/login or /auth/signup
 *                     response; stores the token and sets the user.
 * logout()          — clears storage and resets state.
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";

const TOKEN_KEY = "teashore_token";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null  = not yet determined (checking on mount)
  // false = determined: not authenticated
  // object = authenticated user data
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true); // true until /auth/me check completes

  /* ── Persist/clear token in localStorage ─────────────────────────── */
  const persistToken = useCallback((t) => {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    setToken(t);
  }, []);

  /* ── login — store the token, then make /auth/me the source of truth ── */
  const login = useCallback(async (tokenData) => {
    const nextToken = tokenData?.access_token;
    if (!nextToken) throw new Error("Authentication token missing.");

    persistToken(nextToken);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${nextToken}` },
      });

      if (!response.ok) {
        persistToken(null);
        setUser(false);
        throw new Error("Unable to verify the authenticated session.");
      }

      const currentUser = await response.json();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      persistToken(null);
      setUser(false);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [persistToken]);

  /* ── logout — clears everything ─────────────────────────────────── */
  const logout = useCallback(() => {
    persistToken(null);
    setUser(false);
  }, [persistToken]);

  /* ── On mount: verify stored token with /auth/me ─────────────────── */
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);

    if (!storedToken) {
      setUser(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          // UserOut: { id, name, mobile_number, ... }
          setUser(data);
        } else {
          // Token invalid or expired — log out silently
          persistToken(null);
          setUser(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Network error — treat as logged out so user can retry
        persistToken(null);
        setUser(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
