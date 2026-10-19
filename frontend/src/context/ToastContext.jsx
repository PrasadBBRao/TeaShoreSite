/**
 * ToastContext.jsx — Lightweight toast queue for Teashore.
 *
 * Exports:
 *   ToastProvider  — place once near the root (inside BrowserRouter)
 *   useToast()     → { showToast }
 *
 * showToast(message, type?)
 *   type: "success" | "error" | "info"  (default: "success")
 *   Toasts auto-dismiss after 2.8 s.
 *   Max 4 visible at once — oldest is removed when the queue overflows.
 */

import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);

let _nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "success") => {
    const id = ++_nextId;
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      return next.length > 4 ? next.slice(next.length - 4) : next;
    });
    setTimeout(() => dismiss(id), 2800);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast, toasts, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
