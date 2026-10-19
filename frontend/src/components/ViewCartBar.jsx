/**
 * ViewCartBar.jsx — Floating "View Cart" sticky bar.
 *
 * Appears at the bottom of the screen (above the mobile nav) whenever
 * the cart has at least one item. Slides up from below on mount,
 * slides back down on unmount.
 *
 * Matches the Teashore glass/dark aesthetic (same background as the
 * mobile bottom nav). Tapping navigates to /cart.
 *
 * Rendered inside MenuPreview so it only shows while the menu is visible.
 * On desktop it sits at bottom-center, max-width constrained.
 */

import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

/* ── Cart icon ───────────────────────────────────────────────────────── */
function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4 shrink-0"
      aria-hidden="true"
    >
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

/* ── Arrow icon ──────────────────────────────────────────────────────── */
function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

export default function ViewCartBar() {
  const { cartCount } = useCart();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Never show during auth check, and never show when logged out
  const visible = !authLoading && !!user && cartCount > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          /* Sits above MobileBottomNav (z-60) — use z-[62] so bar clears the nav */
          className="fixed bottom-24 right-4 z-[62] pointer-events-none md:bottom-8"
        >
          <button
            onClick={() => navigate("/cart")}
            className="pointer-events-auto flex w-auto min-w-[120px] items-center justify-center gap-1
                       whitespace-nowrap rounded-2xl px-2.5 py-2
                       font-poppins font-semibold
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-accent/60"
            style={{
              background:           "#6b4d38",
              boxShadow:            "0 8px 28px rgba(43,30,22,0.28)",
              border:               "1px solid rgba(255,245,235,0.16)",
            }}
            aria-label={`View cart — ${cartCount} item${cartCount !== 1 ? "s" : ""}`}
          >
            {/* Left: icon + count badge */}
            <span className="flex items-center gap-2.5 text-cream-light">
              <span className="relative">
                <CartIcon />
                {/* Item count badge */}
                <span
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full
                             flex items-center justify-center
                             text-[9px] font-bold leading-none
                             bg-amber-accent text-cream"
                  aria-hidden="true"
                >
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              </span>
              <span className="sr-only">{cartCount} item{cartCount !== 1 ? "s" : ""}</span>
            </span>

            {/* Center: total */}
            <span className="flex items-center gap-1.5 text-sm text-cream-light tracking-wide">
              View Cart
              <ArrowIcon />
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
