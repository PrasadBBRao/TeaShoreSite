/**
 * MyReservations.jsx — Teashore My Reservations page.
 *
 * Fetches the authenticated user's reservations from GET /api/reservations.
 * Shows a list of reservation cards; tapping expands full detail inline.
 *
 * Architecture mirrors Orders.jsx exactly:
 *   same auth pattern, same cream design system, same expand/collapse cards.
 * Auth: Bearer token from AuthContext. Redirects to /login if not authenticated.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { useAuth }             from "../context/AuthContext";
import { fetchMyReservations } from "../services/reservation";

/* ── helpers ─────────────────────────────────────────────────────────── */
const RESERVATION_RATE = 200; // ₹200/hr

function fmt(n) {
  if (n === null || n === undefined) return "—";
  const num = parseFloat(n);
  return `₹${Number.isInteger(num) ? num : num.toFixed(2)}`;
}

function fmtDateOnly(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtTime(iso) {
  if (!iso) return "—";
  /* Local ISO "YYYY-MM-DDTHH:MM:SS" — read directly (no UTC shift).
     ISO with offset/Z → parse via Date. */
  const hasOffset = /Z$/.test(iso) || /[+\-]\d{2}:\d{2}$/.test(iso);
  if (hasOffset) {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  }
  const [, t] = iso.split("T");
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return mStr === "00" ? `${h12} ${ampm}` : `${h12}:${mStr} ${ampm}`;
}

function fmtCreatedAt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

/* Table number → human label (mirrors Reservation.jsx constants) */
const TABLE_LABELS = {
  1:"Window Seat A",  2:"Window Seat B",
  3:"Centre Table A", 4:"Centre Table B", 5:"Centre Table C",
  6:"Corner Table A", 7:"Corner Table B",
  8:"Group Table A",  9:"Group Table B",  10:"Group Table C",
  11:"Outdoor A",     12:"Outdoor B",
};
function tableLabel(num) { return TABLE_LABELS[num] ?? `Table ${num}`; }

/* Status pill */
const RES_STATUS = {
  confirmed: { label: "Confirmed", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  cancelled:  { label: "Cancelled", color: "text-red-600",     bg: "bg-red-50 border-red-200"         },
};

function StatusPill({ status }) {
  const cfg = RES_STATUS[status] ?? { label: status, color: "text-palm-brown/60", bg: "bg-cream-dark border-cream-dark" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/* ── Reservation detail panel ─────────────────────────────────────────── */
function ReservationDetail({ res }) {
  /* Backend returns reservation_time as ISO with tz offset.
     table_ids is list of UUIDs — we can't get table_number from them alone,
     but the backend ReservationDetail embeds table_ids. We display what we have. */
  const resTime = res.reservation_time;
  const addonList = res.addons ?? [];
  const addonTotal = parseFloat(res.addon_total ?? 0);

  /* Estimate duration from addon_total / reservation context — we don't
     have end_time in the schema, so show reservation_time only. */
  const refId = `#${String(res.id).slice(-8).toUpperCase()}`;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{    opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="border-t border-cream-dark pt-4 mt-1 flex flex-col gap-4">

        {/* Key details grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-sans text-sm">
          <span className="text-palm-brown/55">Reference</span>
          <span className="text-right font-semibold text-palm-brown">{refId}</span>

          <span className="text-palm-brown/55">Date</span>
          <span className="text-right font-semibold text-palm-brown">{fmtDateOnly(resTime)}</span>

          <span className="text-palm-brown/55">Time</span>
          <span className="text-right font-semibold text-palm-brown">{fmtTime(resTime)}</span>

          <span className="text-palm-brown/55">Guests</span>
          <span className="text-right font-semibold text-palm-brown">
            {res.party_size} {res.party_size === 1 ? "Guest" : "Guests"}
            {res.extra_chair && " + extra chair"}
          </span>

          <span className="text-palm-brown/55">Booked on</span>
          <span className="text-right font-semibold text-palm-brown">{fmtCreatedAt(res.created_at)}</span>
        </div>

        {/* Add-ons */}
        {addonList.length > 0 && (
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-widest text-palm-brown/45 mb-2">
              Add-ons
            </p>
            <div className="flex flex-col gap-1.5">
              {addonList.map((a) => (
                <div key={a.id} className="flex justify-between items-baseline gap-3">
                  <span className="font-poppins font-semibold text-sm text-palm-brown flex-1 min-w-0 truncate">
                    {a.addon_name}
                    <span className="font-sans text-xs text-palm-brown/40 ml-1">× {a.quantity}</span>
                  </span>
                  <span className="font-sans text-sm font-semibold text-palm-brown shrink-0">
                    {fmt(a.line_total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bill summary */}
        <div className="rounded-xl bg-cream border border-cream-dark px-4 py-3 flex flex-col gap-1.5">
          {addonTotal > 0 && (
            <div className="flex justify-between font-sans text-sm text-palm-brown/60">
              <span>Add-ons</span>
              <span>{fmt(addonTotal)}</span>
            </div>
          )}
          <div className="flex justify-between font-sans text-sm font-semibold text-palm-brown border-t border-cream-dark pt-1.5 mt-0.5">
            <span>Add-ons total</span>
            <span>{addonTotal > 0 ? fmt(addonTotal) : "None"}</span>
          </div>
        </div>

        {/* Gift message */}
        {res.gift_message && (
          <div className="rounded-xl border border-cream-dark bg-cream px-4 py-3">
            <p className="font-sans text-xs font-semibold uppercase tracking-widest text-palm-brown/45 mb-1.5">
              Gift Message
            </p>
            <p className="font-sans text-sm text-palm-brown/75 italic leading-relaxed">
              "{res.gift_message}"
            </p>
          </div>
        )}

        <p className="font-sans text-[10px] text-palm-brown/40 text-center">
          Booking deposit (₹{RESERVATION_RATE}/hr) will be deducted from your final food bill.
        </p>
      </div>
    </motion.div>
  );
}

/* ── Reservation card ──────────────────────────────────────────────────── */
function ReservationCard({ res }) {
  const [open, setOpen] = useState(false);
  const resTime = res.reservation_time;

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
              #{String(res.id).slice(-8).toUpperCase()}
            </span>
            <span className="inline-flex items-center gap-1 font-sans text-xs text-palm-brown/50">
              <span aria-hidden="true">🪑</span>
              {res.party_size} {res.party_size === 1 ? "guest" : "guests"}
            </span>
          </div>
          <p className="font-sans text-xs text-palm-brown/45 mt-1">
            {fmtDateOnly(resTime)} · {fmtTime(resTime)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusPill status={res.status} />
          {parseFloat(res.addon_total ?? 0) > 0 && (
            <span className="font-sans text-xs text-palm-brown/55">
              +{fmt(res.addon_total)} add-ons
            </span>
          )}
        </div>
      </div>

      {/* Collapsed preview */}
      {!open && res.addons?.length > 0 && (
        <p className="mt-2 font-sans text-xs text-palm-brown/45 truncate">
          <span className="font-poppins font-semibold">{res.addons.map((a) => a.addon_name).join(", ")}</span>
        </p>
      )}

      {/* Chevron */}
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

      <AnimatePresence initial={false}>
        {open && <ReservationDetail key="detail" res={res} />}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Skeleton card ─────────────────────────────────────────────────────── */
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
          <div className="h-3 bg-cream-dark rounded w-16" />
        </div>
      </div>
      <div className="mt-3 h-3 bg-cream-dark rounded w-3/5" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */
export default function MyReservations() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [authLoading, user, navigate]);

  const fetchReservations = useCallback(async ({ showLoading = true } = {}) => {
    if (!token) return;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await fetchMyReservations(token);
      /* Newest first */
      setReservations([...data].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ));
    } catch (err) {
      setError(err.message || "Failed to load reservations.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (authLoading || !user) return undefined;
    fetchReservations();
  }, [authLoading, user, fetchReservations]);

  /* ── Render ── */
  return (
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
            Back to Home
          </Link>
        </div>

        {/* Heading */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.24em] text-amber-accent">
              Booking history
            </p>
            <h1 className="mt-2 flex items-center gap-3 font-anton text-4xl text-palm-brown sm:text-5xl">
              <CalendarDays className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" strokeWidth={1.8} aria-hidden="true" />
              My Reservations
            </h1>
            {!loading && !error && reservations.length > 0 && (
              <p className="mt-1 font-sans text-sm text-palm-brown/50">
                {reservations.length} reservation{reservations.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          {!loading && (
            <button
              onClick={fetchReservations}
              className="shrink-0 flex items-center gap-1.5 rounded-full border border-cream-dark
                         px-4 py-2 font-sans text-xs font-semibold text-palm-brown/60
                         hover:text-palm-brown hover:border-palm-brown/30 transition-colors"
              aria-label="Refresh reservations"
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

        {/* Loading */}
        {(loading || authLoading) && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Error */}
        {!loading && !authLoading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="font-sans font-semibold text-sm text-red-700">Failed to load reservations</p>
              <p className="font-sans text-xs text-red-600/80 mt-0.5">{error}</p>
            </div>
            <button
              onClick={fetchReservations}
              className="shrink-0 px-5 py-2 rounded-full bg-palm-brown text-cream font-sans
                         text-xs font-semibold uppercase tracking-widest hover:bg-amber-accent transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !authLoading && !error && reservations.length === 0 && (
          <div className="flex flex-col items-center gap-5 py-20 text-center">
            <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 text-palm-brown/20" aria-hidden="true">
              <rect x="8" y="12" width="48" height="44" rx="4" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M8 24h48M22 8v8M42 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <p className="font-poppins font-semibold text-lg text-palm-brown/40">No reservations yet</p>
              <p className="mt-1 font-sans text-sm text-palm-brown/30">Your reservation history will appear here.</p>
            </div>
            <Link to="/reservation" className="btn-primary mt-2 text-sm">Book a Table</Link>
          </div>
        )}

        {/* List */}
        {!loading && !authLoading && !error && reservations.length > 0 && (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {reservations.map((res) => (
                <ReservationCard key={res.id} res={res} />
              ))}
            </AnimatePresence>
          </div>
        )}

      </main>
    </div>
  );
}
