/**
 * CounterMenu.jsx — Entry point for café counter / takeaway QR ordering.
 *
 * Route: /counter
 *
 * Renders the full customer menu (reuses the existing Home page components)
 * with a persistent "Counter Order — Takeaway" banner so the customer knows
 * their order type before they reach the cart.
 *
 * When the customer proceeds to /cart, the cart already shows only Takeaway
 * and Delivery options (the existing cart behaviour). The banner here is
 * purely informational — no new state or session is required for takeaway.
 *
 * No QR session token is involved — takeaway orders do not use table sessions.
 */

import MenuPreview  from "../components/MenuPreview";
import Features     from "../components/Features";

export default function CounterMenu() {
  return (
    <>
      {/* Takeaway entry banner */}
      <div className="sticky top-0 z-20 flex items-center justify-center gap-2
                      bg-palm-brown px-4 py-2.5 text-cream shadow-sm">
        <span aria-hidden="true">☕</span>
        <p className="font-sans text-xs font-semibold uppercase tracking-widest">
          Counter Order — Takeaway
        </p>
      </div>

      <main>
        <MenuPreview />
        <Features />
      </main>
    </>
  );
}
