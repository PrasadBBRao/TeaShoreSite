/**
 * Orders.jsx — Teashore Orders page.
 *
 * Fetches the authenticated user's orders from GET /api/orders.
 * Shows a list of order cards with status tracking.
 * Tapping a card expands a full detail panel inline.
 *
 * Design: cream background, palm-brown typography — matches Teashore premium aesthetic.
 * Auth: Bearer token from AuthContext. Redirects to /login if not authenticated.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { useAuth }  from "../context/AuthContext";
import { apiFetch } from "../lib/api";

/* ── helpers ─────────────────────────────────────────────────────────── */
function fmt(n) {
  if (n === null || n === undefined) return "—";
  const num = parseFloat(n);
  return `₹${Number.isInteger(num) ? num : num.toFixed(2)}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function fmtType(type) {
  return { dine_in: "Dine In", takeaway: "Takeaway", home_delivery: "Delivery" }[type] ?? type;
}

/* ── Status config ───────────────────────────────────────────────────── */
const STATUS_CONFIG = {
  placed:    { label: "Order Placed",  color: "text-amber-600",   bg: "bg-amber-50   border-amber-200",   step: 0 },
  preparing: { label: "Preparing",     color: "text-orange-600",  bg: "bg-orange-50  border-orange-200",  step: 1 },
  active:    { label: "On the Way",    color: "text-blue-600",    bg: "bg-blue-50    border-blue-200",    step: 2 },
  delivered: { label: "Delivered",     color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", step: 3 },
  cancelled: { label: "Cancelled",     color: "text-red-600",     bg: "bg-red-50     border-red-200",     step: -1 },
};

const STATUS_STEPS = ["placed", "preparing", "active", "delivered"];

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "text-palm-brown/60", bg: "bg-cream-dark border-cream-dark" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/* ── Progress stepper (for non-cancelled orders) ────────────────────── */
function StatusStepper({ status }) {
  const cfg  = STATUS_CONFIG[status];
  if (!cfg || cfg.step < 0) return null;
  const cur  = cfg.step;

  return (
    <div className="flex items-center gap-0" aria-label="Order progress">
      {STATUS_STEPS.map((s, i) => {
        const done   = i <= cur;
        const active = i === cur;
        return (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            {/* Dot */}
            <div className={[
              "w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300",
              done ? "bg-palm-brown" : "bg-cream-dark",
              active ? "ring-2 ring-palm-brown/30 ring-offset-1" : "",
            ].join(" ")} aria-label={STATUS_CONFIG[s]?.label} />
            {/* Line between dots */}
            {i < STATUS_STEPS.length - 1 && (
              <div className={[
                "flex-1 h-0.5 transition-colors duration-300",
                i < cur ? "bg-palm-brown" : "bg-cream-dark",
              ].join(" ")} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Order type badge ────────────────────────────────────────────────── */
function TypeBadge({ type }) {
  const icons = {
    dine_in:       "🍽",
    takeaway:      "🛍",
    home_delivery: "🚴",
  };
  return (
    <span className="inline-flex items-center gap-1 font-sans text-xs text-palm-brown/50">
      <span aria-hidden="true">{icons[type] ?? "📦"}</span>
      {fmtType(type)}
    </span>
  );
}

/* ── Payment status badge ────────────────────────────────────────────── */
const PAYMENT_CFG = {
  paid:      { label: "Paid",                  color: "text-emerald-700", bg: "bg-emerald-50  border-emerald-200" },
  unpaid:    { label: "Payment Pending",        color: "text-amber-700",   bg: "bg-amber-50    border-amber-200"   },
  fake_paid: { label: "Legacy — Unverified",    color: "text-palm-brown/50", bg: "bg-cream-dark  border-cream-dark"  },
};

function PaymentBadge({ paymentStatus }) {
  const cfg = PAYMENT_CFG[paymentStatus];
  // Unknown / missing value: render nothing rather than a misleading label
  if (!cfg) return null;
  return (
    <span
      role="status"
      aria-label={`Payment status: ${cfg.label}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}

/* ── Order detail panel ──────────────────────────────────────────────── */
function OrderDetail({ order }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{    opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="border-t border-cream-dark pt-4 mt-1 flex flex-col gap-4">

        {/* Progress stepper */}
        {order.status !== "cancelled" && (
          <div>
            <StatusStepper status={order.status} />
            <div className="flex justify-between mt-1.5">
              {STATUS_STEPS.map((s) => (
                <span key={s} className="font-sans text-[10px] text-palm-brown/40 flex-1 first:text-left last:text-right text-center">
                  {STATUS_CONFIG[s]?.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        <div>
          <p className="font-sans text-xs font-semibold uppercase tracking-widest text-palm-brown/45 mb-2">
            Items
          </p>
          <div className="flex flex-col gap-1.5">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-baseline gap-3">
                <span className="font-serif text-sm text-palm-brown leading-snug flex-1 min-w-0 truncate">
                  <span className="font-poppins font-semibold">{item.menu_item_name}</span>
                  <span className="font-sans text-xs text-palm-brown/40 ml-1">× {item.quantity}</span>
                </span>
                <span className="font-sans text-sm font-semibold text-palm-brown shrink-0">
                  {fmt(item.line_total)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bill summary */}
        <div className="rounded-xl bg-cream border border-cream-dark px-4 py-3 flex flex-col gap-1.5">
          <div className="flex justify-between font-sans text-sm text-palm-brown/60">
            <span>Item Total</span><span>{fmt(order.items_total)}</span>
          </div>
          {order.delivery_charge != null && parseFloat(order.delivery_charge) > 0 && (
            <div className="flex justify-between font-sans text-sm text-palm-brown/60">
              <span>Delivery</span><span>{fmt(order.delivery_charge)}</span>
            </div>
          )}
          <div className="flex justify-between font-sans text-sm font-semibold text-palm-brown border-t border-cream-dark pt-1.5 mt-0.5">
            <span>Total</span><span>{fmt(order.total_price)}</span>
          </div>
          <div className="flex justify-between items-center font-sans text-xs text-palm-brown/60 pt-0.5">
            <span>Payment</span>
            <PaymentBadge paymentStatus={order.payment_status} />
          </div>
        </div>

        {/* Delivery address + ETA */}
        {order.delivery_address && (
          <div className="flex flex-col gap-1">
            <p className="font-sans text-xs font-semibold uppercase tracking-widest text-palm-brown/45">
              Delivery Address
            </p>
            <p className="font-sans text-sm text-palm-brown/70 leading-relaxed">
              {order.delivery_address}
            </p>
            {order.estimated_delivery_minutes != null && (
              <p className="font-sans text-xs text-palm-brown/50 mt-0.5">
                Estimated delivery: <strong className="text-palm-brown/70">{order.estimated_delivery_minutes} min</strong>
                {order.estimated_delivery_at && (
                  <> · by {new Date(order.estimated_delivery_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</>
                )}
              </p>
            )}
          </div>
        )}

        {/* Token (takeaway) */}
        {order.daily_token_number != null && (
          <div className="flex items-center gap-2">
            <p className="font-sans text-xs font-semibold uppercase tracking-widest text-palm-brown/45">
              Pickup Token
            </p>
            <span className="font-poppins font-bold text-lg text-palm-brown">
              #{order.daily_token_number}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Order card ──────────────────────────────────────────────────────── */
function OrderCard({ order }) {
  const [open, setOpen] = useState(false);
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <motion.div
      layout
      className="bg-cream-light rounded-2xl border border-cream-dark shadow-card px-5 py-4 cursor-pointer"
      onClick={() => setOpen((v) => !v)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-poppins font-bold text-sm text-palm-brown">
              {order.order_number}
            </span>
            <TypeBadge type={order.order_type} />
          </div>
          <p className="font-sans text-xs text-palm-brown/45 mt-1">
            {fmtDate(order.created_at)} · {itemCount} item{itemCount !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusPill status={order.status} />
          <PaymentBadge paymentStatus={order.payment_status} />
          <span className="font-sans text-sm font-bold text-palm-brown">{fmt(order.total_price)}</span>
        </div>
      </div>

      {/* Item names preview (collapsed) */}
      {!open && (
        <p className="mt-2 font-sans text-xs text-palm-brown/45 truncate">
          <span className="font-poppins font-semibold">{order.items.map((i) => i.menu_item_name).join(", ")}</span>
        </p>
      )}

      {/* Expand / collapse chevron */}
      <div className="flex justify-center mt-3">
        <svg
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round"
          className={`w-4 h-4 text-palm-brown/30 transition-transform duration-250 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M3 6l5 5 5-5" />
        </svg>
      </div>

      {/* Detail panel */}
      <AnimatePresence initial={false}>
        {open && <OrderDetail key="detail" order={order} />}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Skeleton card ───────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="bg-cream-light rounded-2xl border border-cream-dark shadow-card px-5 py-4 animate-pulse">
      <div className="flex justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-cream-dark rounded w-28" />
          <div className="h-3 bg-cream-dark rounded w-44" />
        </div>
        <div className="space-y-2 items-end flex flex-col">
          <div className="h-6 bg-cream-dark rounded-full w-24" />
          <div className="h-4 bg-cream-dark rounded w-14" />
        </div>
      </div>
      <div className="mt-3 h-3 bg-cream-dark rounded w-4/5" />
    </div>
  );
}

/* ── DEV: client-side test-order status simulation ───────────────────────
   Written by Checkout.jsx into localStorage["teashore_test_orders"] as:
     [{ id, createdAt, simStatus? }]
   Timeline: placed(0s) → preparing(20s) → active(50s) → delivered(80s)
   Rule: never downgrade — once a step is reached it is persisted.
   When all orders reach "delivered" the key is cleared.
──────────────────────────────────────────────────────────────────────── */
const SIM_TIMELINE = [
  { after:  0, status: "placed"    },
  { after: 20, status: "preparing" },
  { after: 50, status: "active"    },
  { after: 80, status: "delivered" },
];
const STATUS_RANK = { placed: 0, preparing: 1, active: 2, delivered: 3 };

function getSimOverrides() {
  try {
    const raw = localStorage.getItem("teashore_test_orders");
    if (!raw) return {};
    const entries = JSON.parse(raw);
    if (!entries.length) return {};

    const now = Date.now();
    const overrides = {};
    const remaining = [];

    for (const entry of entries) {
      const elapsed = (now - entry.createdAt) / 1000;

      // Compute timeline status from elapsed seconds
      let computed = "placed";
      for (const step of SIM_TIMELINE) {
        if (elapsed >= step.after) computed = step.status;
      }

      // Never downgrade: take the best (highest rank) of computed vs persisted
      const persisted = entry.simStatus ?? "placed";
      const best =
        STATUS_RANK[computed] >= STATUS_RANK[persisted] ? computed : persisted;

      overrides[entry.id] = best;

      if (best !== "delivered") {
        // Persist the achieved level so a page remount doesn't reset it
        remaining.push({ ...entry, simStatus: best });
      }
      // "delivered" entries are dropped — simulation complete
    }

    localStorage.setItem("teashore_test_orders", JSON.stringify(remaining));
    return overrides;
  } catch {
    return {};
  }
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */
export default function Orders() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  // DEV: client-side status overrides — { [orderId]: simulated_status }
  // Initialised on mount from localStorage so remounts don't reset progress
  const [simOverrides, setSimOverrides] = useState(() => getSimOverrides());

  // Redirect to login if not authenticated (wait for auth check to finish)
  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [authLoading, user, navigate]);

  const fetchOrders = useCallback(async ({ showLoading = true } = {}) => {
    if (!token) return;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(data);
    } catch (err) {
      setError(err.message || "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (authLoading || !user) return undefined;

    fetchOrders();
    const pollId = window.setInterval(() => {
      fetchOrders({ showLoading: false });
      // DEV: advance simulation on each tick
      setSimOverrides(getSimOverrides());
    }, 5000);

    return () => window.clearInterval(pollId);
  }, [authLoading, user, fetchOrders]);

  /* ── Render ── */
  return (
    <>
      <div className="min-h-screen bg-cream">
        <main className="max-w-2xl mx-auto px-4 pt-24 pb-32 md:pt-28 md:pb-16">

        {/* Back link */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold
                       uppercase tracking-widest text-palm-brown/50 hover:text-palm-brown transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M10 3L5 8l5 5" />
            </svg>
            Back to Menu
          </Link>
        </div>

        {/* Heading */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.24em] text-amber-accent">
              Order history
            </p>
            <h1 className="mt-2 flex items-center gap-3 font-anton text-4xl text-palm-brown sm:text-5xl">
              <ClipboardList className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" strokeWidth={1.8} aria-hidden="true" />
              My Orders
            </h1>
            {!loading && !error && orders.length > 0 && (
              <p className="mt-1 font-sans text-sm text-palm-brown/50">
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          {/* Refresh button */}
          {!loading && (
            <button
              onClick={fetchOrders}
              className="shrink-0 flex items-center gap-1.5 rounded-full border border-cream-dark
                         px-4 py-2 font-sans text-xs font-semibold text-palm-brown/60
                         hover:text-palm-brown hover:border-palm-brown/30 transition-colors"
              aria-label="Refresh orders"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                <path d="M14 8A6 6 0 112 8" />
                <path d="M14 3v5h-5" />
              </svg>
              Refresh
            </button>
          )}
        </div>

        {/* ── Loading ── */}
        {(loading || authLoading) && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── Error ── */}
        {!loading && !authLoading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="font-sans font-semibold text-sm text-red-700">Failed to load orders</p>
              <p className="font-sans text-xs text-red-600/80 mt-0.5">{error}</p>
            </div>
            <button
              onClick={fetchOrders}
              className="shrink-0 px-5 py-2 rounded-full bg-palm-brown text-cream font-sans
                         text-xs font-semibold uppercase tracking-widest
                         hover:bg-amber-accent transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && !authLoading && !error && orders.length === 0 && (
          <div className="flex flex-col items-center gap-5 py-20 text-center">
            <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 text-palm-brown/20" aria-hidden="true">
              <rect x="12" y="8" width="40" height="48" rx="4" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M22 20h20M22 30h20M22 40h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <p className="font-poppins font-semibold text-lg text-palm-brown/40">No orders yet</p>
              <p className="mt-1 font-sans text-sm text-palm-brown/30">Your order history will appear here.</p>
            </div>
            <Link to="/#menu" className="btn-primary mt-2 text-sm">Browse Menu</Link>
          </div>
        )}

        {/* ── Orders list ── */}
        {!loading && !authLoading && !error && orders.length > 0 && (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {orders.map((order) => {
                // DEV: apply simulated status override if this order has one,
                // but never downgrade below what the API already returned
                const simStatus = simOverrides[order.id];
                const apiRank   = STATUS_RANK[order.status] ?? 0;
                const simRank   = STATUS_RANK[simStatus]    ?? 0;
                const finalStatus = simRank > apiRank ? simStatus : order.status;
                const displayed = finalStatus !== order.status
                  ? { ...order, status: finalStatus }
                  : order;
                return <OrderCard key={order.id} order={displayed} />;
              })}
            </AnimatePresence>
          </div>
        )}
        </main>
      </div>
    </>
  );
}
