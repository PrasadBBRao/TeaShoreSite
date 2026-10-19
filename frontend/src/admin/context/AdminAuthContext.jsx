/**
 * AdminAuthContext.jsx — Isolated admin authentication state.
 *
 * Completely separate from the customer AuthContext — uses a different
 * localStorage key and a different /admin/me validation endpoint.
 * Customer tokens cannot grant admin access (the backend also enforces this).
 *
 * Exports:
 *   AdminAuthProvider — wrap the admin subtree with this
 *   useAdminAuth()    — { admin, token, loading, login, logout }
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const ADMIN_TOKEN_KEY = "teashore_admin_token";
const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin,   setAdmin]   = useState(null);   // null=unknown, false=logged-out, obj=logged-in
  const [token,   setToken]   = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const persistToken = useCallback((t) => {
    if (t) {
      localStorage.setItem(ADMIN_TOKEN_KEY, t);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    setToken(t);
  }, []);

  /** Call after a successful POST /admin/login response */
  const login = useCallback(async (tokenData) => {
    const nextToken = tokenData?.access_token;
    if (!nextToken) throw new Error("Admin token missing from response.");

    persistToken(nextToken);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${nextToken}` },
      });
      if (!res.ok) {
        persistToken(null);
        setAdmin(false);
        throw new Error("Admin session could not be verified.");
      }
      const data = await res.json();
      setAdmin(data);
      return data;
    } catch (err) {
      persistToken(null);
      setAdmin(false);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [persistToken]);

  const logout = useCallback(() => {
    persistToken(null);
    setAdmin(false);
  }, [persistToken]);

  /** On mount: validate any stored token */
  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!stored) {
      setAdmin(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setAdmin(await res.json());
        } else {
          persistToken(null);
          setAdmin(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          persistToken(null);
          setAdmin(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AdminAuthContext.Provider value={{ admin, token, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  return ctx;
}
