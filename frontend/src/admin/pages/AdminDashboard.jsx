/**
 * AdminDashboard.jsx — Live admin dashboard.
 *
 * Fetches all data on mount from real backend APIs (no mock data):
 *   GET /api/admin/dashboard/stats  → orders_today, revenue_today,
 *                                     active_sessions, upcoming_reservations
 *   GET /api/admin/orders?status=placed → pending order count
 *   GET /api/admin/reservations          → today's confirmed reservations
 *   GET /api/admin/tables                → free / occupied table counts
 *
 * All requests use the admin JWT from AdminAuthContext.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";

/* ── API helper ────────────────────────────────────────────────────────── */
async function adminFetch(path, token) {
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function isToday(isoString) {
  if (!isoString) return false;
  const d = new Date(isoString);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  );
}

function fmtCurrency(value) {
  const n = parseFloat(value) || 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

/* ── Stat card ─────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, accent, icon, to, loading }) {
  const inner = (
    <div className={[
      "rounded-xl border px-5 py-5 flex flex-col gap-2 transition-all duration-150",
      accent
        ? "border-[#34483D]/20 bg-[#E8EDE5"
        : "border-[#E4E6DE] bg-[#FFFFFF]",
      to ? "hover:border-[#34483D]/35 cursor-pointer" : "",
    ].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#737C72]">
          {label}
        </p>
        {icon && (
          <span className={`shrink-0 ${accent ? "text-[#34483D]" : "text-[#737C72]"}`}>
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-8 w-24 rounded bg-[#E4E6DE] animate-pulse" />
      ) : (
        <p className={`font-poppins text-2xl font-bold leading-none ${accent ? "text-[#4A6358]" : "text-[#26372E]"}`}>
          {value ?? "—"}
        </p>
      )}
      {sub && !loading && (
        <p className="font-sans text-xs text-[#737C72]">{sub}</p>
      )}
    </div>
  );

  return to ? <Link to={to}>{inner}</Link> : inner;
}

/* ── Section heading ───────────────────────────────────────────────────── */
function SectionHeading({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-3">
      <h2 className="font-poppins text-sm font-semibold text-[#737C72] uppercase tracking-[0.12em]">
        {title}
      </h2>
      {action}
    </div>
  );
}

/* ── Order status pill ─────────────────────────────────────────────────── */
const ORDER_STATUS = {
  placed:    { label: "Placed",    color: "text-amber-700",   bg: "bg-amber-50 border-amber-200"   },
  preparing: { label: "Preparing", color: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  active:    { label: "On the Way",color: "text-blue-700",    bg: "bg-blue-50 border-blue-200"     },
  delivered: { label: "Delivered", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200"},
  cancelled: { label: "Cancelled", color: "text-red-600",     bg: "bg-red-50 border-red-200"       },
};

function OrderPill({ status }) {
  const cfg = ORDER_STATUS[status] ?? { label: status, color: "text-[#737C72]", bg: "bg-[#E4E6DE] border-[#D6D9D0]" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/* ── Reservation status pill ───────────────────────────────────────────── */
function ResPill({ status }) {
  const cfg = status === "confirmed"
    ? { label: "Confirmed", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" }
    : { label: "Cancelled", color: "text-red-600",     bg: "bg-red-50 border-red-200"         };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */
function EmptyRow({ label }) {
  return (
    <div className="rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] px-4 py-4 text-center">
      <p className="font-sans text-xs text-[#737C72]">{label}</p>
    </div>
  );
}

/* ── Error banner ──────────────────────────────────────────────────────── */
function ErrorBanner({ message, onRetry }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
      <p className="font-sans text-sm text-red-600">{message}</p>
      <button
        onClick={onRetry}
        className="shrink-0 rounded-lg border border-red-300 px-4 py-1.5 font-sans text-xs
                   font-semibold text-red-600 hover:bg-red-900/30 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const { token } = useAdminAuth();

  const [stats,        setStats]        = useState(null);
  const [pendingOrders,setPendingOrders] = useState([]);
  const [recentOrders, setRecentOrders]  = useState([]);
  const [reservations, setReservations]  = useState([]);
  const [tables,       setTables]        = useState([]);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      // All 4 calls in parallel
      const [statsData, pendingData, allOrdersData, reservationsData, tablesData] =
        await Promise.all([
          adminFetch("/admin/dashboard/stats", token),
          adminFetch("/admin/orders?status=placed&limit=200", token),
          adminFetch("/admin/orders?limit=10", token),
          adminFetch("/admin/reservations?limit=200", token),
          adminFetch("/admin/tables", token),
        ]);

      setStats(statsData);
      setPendingOrders(pendingData);
      setRecentOrders(allOrdersData);
      setReservations(reservationsData);
      setTables(tablesData);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Derived counts ─────────────────────────────────────────────── */
  const freeTables     = tables.filter(t => t.status === "free").length;
  const occupiedTables = tables.filter(t => t.status === "occupied").length;

  const todaysReservations = reservations.filter(r =>
    isToday(r.reservation_time) && r.status === "confirmed"
  );

  // Upcoming reservations (next 24h) from confirmed list
  const now    = new Date();
  const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const upcomingReservations = reservations
    .filter(r => {
      const t = new Date(r.reservation_time);
      return r.status === "confirmed" && t >= now && t <= next24;
    })
    .sort((a, b) => new Date(a.reservation_time) - new Date(b.reservation_time))
    .slice(0, 5);

  const activeOrdersList = recentOrders
    .filter(o => !["delivered", "cancelled"].includes(o.status))
    .slice(0, 5);

  /* ── Refresh button ─────────────────────────────────────────────── */
  const RefreshBtn = (
    <button
      onClick={fetchAll}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-[#E4E6DE] px-3 py-1.5
                 font-sans text-xs font-semibold text-[#737C72]
                 hover:border-[#D6D9D0] hover:text-[#737C72] transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
      aria-label="Refresh dashboard"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true">
        <path d="M14 8A6 6 0 112 8"/><path d="M14 3v5h-5"/>
      </svg>
      {loading ? "Loading…" : "Refresh"}
    </button>
  );

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="max-w-7xl mx-auto">

      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Dashboard</h1>
          <p className="mt-0.5 font-sans text-xs text-[#737C72]">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>
        {RefreshBtn}
      </div>

      {/* Error banner */}
      {error && <ErrorBanner message={error} onRetry={fetchAll} />}

      {/* ── KPI grid — 8 stat cards in 2 rows ─────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">

        <StatCard
          label="Orders Today"
          value={stats?.orders_today ?? (loading ? null : 0)}
          sub="All order types"
          loading={loading && !stats}
          accent
          to="/admin/orders"
          icon={<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 3h12a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M6 7h6M6 10h4"/></svg>}
        />

        <StatCard
          label="Today's Order Value"
          value={stats ? fmtCurrency(stats.order_value_today) : null}
          sub="All order totals · not verified revenue"
          loading={loading && !stats}
          accent
          icon={<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="9" cy="9" r="7"/><path d="M9 5v8M6.5 7.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3H11"/></svg>}
        />

        <StatCard
          label="Pending Orders"
          value={loading ? null : pendingOrders.length}
          sub="Awaiting preparation"
          loading={loading}
          to="/admin/orders"
          icon={<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="9" cy="9" r="7"/><path d="M9 5v4l2.5 2.5"/></svg>}
        />

        <StatCard
          label="Active Sessions"
          value={stats?.active_sessions ?? (loading ? null : 0)}
          sub="Tables currently open"
          loading={loading && !stats}
          to="/admin/tables"
          icon={<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><ellipse cx="9" cy="6" rx="7" ry="3"/><path d="M2 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6"/><path d="M2 9c0 1.66 3.13 3 7 3s7-1.34 7-3"/></svg>}
        />

        <StatCard
          label="Today's Reservations"
          value={loading ? null : todaysReservations.length}
          sub="Confirmed today"
          loading={loading}
          to="/admin/reservations"
          icon={<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="3" width="14" height="13" rx="2"/><path d="M2 7h14M6 1v4M12 1v4"/></svg>}
        />

        <StatCard
          label="Upcoming (24h)"
          value={stats?.upcoming_reservations ?? (loading ? null : 0)}
          sub="Confirmed reservations"
          loading={loading && !stats}
          to="/admin/reservations"
          icon={<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="9" cy="9" r="7"/><path d="M9 5v4l3 3"/></svg>}
        />

        <StatCard
          label="Available Tables"
          value={loading ? null : freeTables}
          sub={loading ? "" : `of ${tables.length} total`}
          loading={loading}
          to="/admin/tables"
          icon={<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="7" width="14" height="7" rx="1.5"/><path d="M5 7V5M13 7V5M2 10h14"/></svg>}
        />

        <StatCard
          label="Occupied Tables"
          value={loading ? null : occupiedTables}
          sub={loading ? "" : `of ${tables.length} total`}
          loading={loading}
          to="/admin/tables"
          icon={<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="7" width="14" height="7" rx="1.5"/><path d="M5 7V5M13 7V5M2 10h14"/><path d="M7 13v1M11 13v1"/></svg>}
        />

      </div>

      {/* ── Lower panels — 2-column on desktop ─────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Active / Pending Orders */}
        <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] p-5">
          <SectionHeading
            title="Active Orders"
            action={
              <Link to="/admin/orders"
                className="font-sans text-xs text-[#737C72] hover:text-[#737C72] transition-colors">
                View all →
              </Link>
            }
          />

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-[#FFFFFF] animate-pulse"/>)}
            </div>
          ) : activeOrdersList.length === 0 ? (
            <EmptyRow label="No active orders right now." />
          ) : (
            <div className="space-y-2">
              {activeOrdersList.map(order => (
                <div key={order.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#E4E6DE]
                             bg-[#FFFFFF] px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-poppins text-sm font-semibold text-[#26372E] truncate">
                      {order.order_number}
                    </p>
                    <p className="font-sans text-xs text-[#737C72] mt-0.5">
                      {fmtDate(order.created_at)}
                      {order.order_type && (
                        <span className="ml-2 capitalize">
                          · {order.order_type.replace("_", " ")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-poppins text-sm font-semibold text-[#34483D]">
                      ₹{parseFloat(order.total_price || 0).toFixed(0)}
                    </span>
                    <OrderPill status={order.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Reservations */}
        <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] p-5">
          <SectionHeading
            title="Upcoming Reservations (24h)"
            action={
              <Link to="/admin/reservations"
                className="font-sans text-xs text-[#737C72] hover:text-[#737C72] transition-colors">
                View all →
              </Link>
            }
          />

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-[#FFFFFF] animate-pulse"/>)}
            </div>
          ) : upcomingReservations.length === 0 ? (
            <EmptyRow label="No reservations in the next 24 hours." />
          ) : (
            <div className="space-y-2">
              {upcomingReservations.map(res => (
                <div key={res.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#E4E6DE]
                             bg-[#FFFFFF] px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-poppins text-sm font-semibold text-[#26372E]">
                      {res.party_size} {res.party_size === 1 ? "guest" : "guests"}
                    </p>
                    <p className="font-sans text-xs text-[#737C72] mt-0.5">
                      {fmtDate(res.reservation_time)} · {fmtTime(res.reservation_time)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <ResPill status={res.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table status summary */}
        <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] p-5">
          <SectionHeading
            title="Table Status"
            action={
              <Link to="/admin/tables"
                className="font-sans text-xs text-[#737C72] hover:text-[#737C72] transition-colors">
                Manage →
              </Link>
            }
          />

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-[#FFFFFF] animate-pulse"/>)}
            </div>
          ) : tables.length === 0 ? (
            <EmptyRow label="No tables configured." />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tables.map(table => {
                const occupied = table.status === "occupied";
                return (
                  <div key={table.id}
                    className={[
                      "rounded-lg border px-3 py-3 text-center transition-colors",
                      occupied
                        ? "border-[#34483D]/20 bg-[#E8EDE5"
                        : "border-[#E4E6DE] bg-[#FFFFFF]",
                    ].join(" ")}>
                    <p className={`font-poppins text-sm font-bold ${occupied ? "text-[#4A6358]" : "text-[#737C72]"}`}>
                      T{table.table_number}
                    </p>
                    <p className={`font-sans text-[10px] uppercase tracking-widest mt-0.5 ${occupied ? "text-[#34483D]" : "text-[#D6D9D0]"}`}>
                      {occupied ? "Occupied" : "Free"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] p-5">
          <SectionHeading title="Quick Actions" />
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: "/admin/orders",       label: "View Orders",       sub: "Manage all orders"          },
              { to: "/admin/reservations", label: "Reservations",      sub: "View table bookings"        },
              { to: "/admin/tables",       label: "Tables & Sessions", sub: "Open or close sessions"     },
              { to: "/admin/menu",         label: "Menu Management",   sub: "Edit items & availability"  },
              { to: "/admin/users",        label: "Users",             sub: "Browse customer accounts"   },
              { to: "/admin/addons",       label: "Add-ons",           sub: "Toggle add-on availability" },
            ].map(({ to, label, sub }) => (
              <Link key={to} to={to}
                className="rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] px-4 py-4
                           hover:border-[#D6D9D0] hover:bg-[#F8F8F4] transition-all duration-150 group">
                <p className="font-poppins text-sm font-semibold text-[#26372E] group-hover:text-[#4A6358] transition-colors">
                  {label}
                </p>
                <p className="font-sans text-xs text-[#D6D9D0] mt-0.5">{sub}</p>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
