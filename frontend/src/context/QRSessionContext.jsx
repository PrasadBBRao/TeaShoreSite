/**
 * QRSessionContext.jsx — Tab-scoped QR dine-in session state.
 *
 * Storage: sessionStorage key "teashore_qr_session"
 *   • sessionStorage is per-tab: a different browser tab cannot read this
 *     session, and it is cleared automatically when the tab closes.
 *   • Never stored in localStorage, URLs, or React Router navigation state.
 *
 * Shape of stored value:
 *   {
 *     sessionId:    string (UUID)
 *     sessionToken: string (64-char random — the credential, treat as secret)
 *     tableId:      string (UUID)
 *     tableNumber:  number
 *   }
 *
 * Exports:
 *   QRSessionProvider  — wrap the QR subtree with this
 *   useQRSession()     — { session, setSession, clearSession }
 *
 * setSession(data)   — stores to context + sessionStorage
 * clearSession()     — removes from context + sessionStorage
 */

import { createContext, useContext, useState } from "react";

const SESSION_KEY = "teashore_qr_session";

const QRSessionContext = createContext(null);

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function QRSessionProvider({ children }) {
  // Hydrate from sessionStorage on mount — survives in-tab refresh
  const [session, setSessionState] = useState(() => loadSession());

  function setSession(data) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage quota errors (private browsing etc.)
    }
    setSessionState(data);
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    setSessionState(null);
  }

  return (
    <QRSessionContext.Provider value={{ session, setSession, clearSession }}>
      {children}
    </QRSessionContext.Provider>
  );
}

export function useQRSession() {
  const ctx = useContext(QRSessionContext);
  if (!ctx) throw new Error("useQRSession must be used inside <QRSessionProvider>");
  return ctx;
}
