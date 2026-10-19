/**
 * Toast.jsx — Premium cream/brown toast stack for Teashore.
 *
 * Sits fixed at the bottom-centre of the viewport, above the mobile nav
 * (z-[70]).  Each toast slides up from below and fades out on dismiss.
 * Framer Motion handles the enter/exit animation; AnimatePresence handles
 * unmounting.
 *
 * Reads from ToastContext — just mount <ToastStack /> once in App.jsx.
 */

import { AnimatePresence, motion } from "motion/react";
import { useToast } from "../context/ToastContext";

/* ── Per-type styling ────────────────────────────────────────────────── */
const TYPE_STYLES = {
  success: {
    text: "text-[rgba(245,233,217,0.92)]",   // cream at full brightness
  },
  error: {
    text: "text-red-300",
  },
  info: {
    text: "text-[rgba(245,233,217,0.70)]",   // cream slightly dimmed
  },
};

/* ── Single toast pill ───────────────────────────────────────────────── */
function ToastItem({ toast, onDismiss }) {
  const style = TYPE_STYLES[toast.type] ?? TYPE_STYLES.success;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: 8,  scale: 0.96 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background:           "rgba(43, 30, 22, 0.72)",
        backdropFilter:       "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow:            "0 4px 20px rgba(0,0,0,0.28)",
        border:               "1px solid rgba(255,245,235,0.10)",
      }}
      className={[
        "flex items-center gap-2.5",
        "rounded-full px-4 py-2 md:px-5 md:py-2.5",
        "font-sans text-[10px] md:text-[11px] font-semibold tracking-widest uppercase",
        "cursor-default select-none",
        style.text,
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="max-w-[240px] truncate">{toast.message}</span>

      {/* Dismiss × — minimal, barely visible */}
      <button
        onClick={() => onDismiss(toast.id)}
        className="opacity-30 hover:opacity-70 transition-opacity shrink-0 -mr-1"
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5" aria-hidden="true">
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4"
                strokeLinecap="round" />
        </svg>
      </button>
    </motion.li>
  );
}

/* ── Stack ───────────────────────────────────────────────────────────── */
export default function ToastStack() {
  const { toasts, dismiss } = useToast();

  return (
    <ul
      aria-label="Notifications"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70]
                 flex flex-col items-center gap-2 pointer-events-none
                 md:bottom-6"
    >
      <AnimatePresence initial={false} mode="sync">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </AnimatePresence>
    </ul>
  );
}
