/**
 * AdminReservations.jsx — Admin reservations management page.
 *
 * APIs used (all existing):
 *   GET  /api/admin/reservations?limit=&offset=&date_from=&date_to=
 *   GET  /api/admin/tables
 *   PATCH /api/admin/reservations/{id}/cancel
 *
 * Date filter (new): Today / Yesterday / Select Date
 *   — filters by reservation_time on the server so pagination stays correct.
 *   — composes with the existing view tabs (Upcoming/Today/All/Cancelled),
 *     which continue to apply client-side on the loaded page.
 *
 * Existing features preserved:
 *   View tabs: Upcoming / Today / All / Cancelled
 *   Search by booking ref (last 8 of ID)
 *   Slide-in detail panel with cancel action
 *   Pagination (50/page)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";

/* ══════════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
══════════════════════════════════════════════════════════════════════ */

const PAGE_SIZE       = 50;
const RESERVATION_FEE = 200;

function fmt(v) {
  const n = parseFloat(v) || 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}

function fmtTime(iso) {
  if (!iso) return "—";
  const hasOffset = /Z$/.test(iso) || /[+\-]\d{2}:\d{2}$/.test(iso);
  if (hasOffset) {
    return new Date(iso).toLocaleTimeString("en-IN", { hour:"numeric", minute:"2-digit", hour12:true });
  }
  const [, t] = iso.split("T");
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return mStr === "00" ? `${h12} ${ampm}` : `${h12}:${mStr} ${ampm}`;
}

function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric", hour:"numeric", minute:"2-digit", hour12:true,
  });
}

function refId(id) { return `#${String(id).slice(-8).toUpperCase()}`; }

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() &&
         d.getMonth()    === n.getMonth()    &&
         d.getDate()     === n.getDate();
}

function isUpcoming(iso) { return !!iso && new Date(iso) > new Date(); }

/** Return UTC ISO day bounds for a local calendar day offset from today. */
function localDayBounds(offsetDays = 0) {
  const now   = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const next  = new Date(local); next.setDate(next.getDate() + 1);
  return { date_from: local.toISOString(), date_to: next.toISOString() };
}

/** Return UTC ISO day bounds for a "YYYY-MM-DD" string. */
function pickedDayBounds(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  const next  = new Date(local); next.setDate(next.getDate() + 1);
  return { date_from: local.toISOString(), date_to: next.toISOString() };
}

/** Build date_from / date_to from current filter state. Returns {} when none active. */
function buildDateParams(dateMode, pickedDate) {
  if (dateMode === "today")     return localDayBounds(0);
  if (dateMode === "yesterday") return localDayBounds(-1);
  if (dateMode === "pick" && pickedDate) return pickedDayBounds(pickedDate) ?? {};
  return {};
}

/** Today as YYYY-MM-DD for the date input max attribute. */
function todayYMD() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

async function adminFetch(path, token, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}`, ...(opts.headers||{}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

/* ══════════════════════════════════════════════════════════════════════
   SMALL COMPONENTS
══════════════════════════════════════════════════════════════════════ */

const RES_STATUS_CFG = {
  confirmed: { label:"Confirmed", color:"text-emerald-700", bg:"bg-emerald-50 border-emerald-200" },
  cancelled: { label:"Cancelled", color:"text-red-600",     bg:"bg-red-50     border-red-300/40"     },
};

function StatusPill({ status }) {
  const cfg = RES_STATUS_CFG[status] ?? { label:status, color:"text-[#737C72]", bg:"bg-[#E4E6DE] border-[#D6D9D0]" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function Skeleton({ className = "" }) {
  return <div className={`rounded bg-[#E4E6DE] animate-pulse ${className}`} />;
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
      <p className="font-sans text-sm text-red-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-300 px-4 py-1.5 font-sans text-xs font-semibold text-red-600 hover:bg-red-900/30 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div>
      <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737C72]">{title}</p>
      <div className="rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, valueClass = "" }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="font-sans text-xs text-[#737C72] shrink-0">{label}</span>
      <span className={`font-sans text-xs text-right break-all ${valueClass || "text-[#737C72]"}`}>{value ?? "—"}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   DATE CHIP  — single compact calendar button rendered inside the
   view-tabs row.  No separate row.
══════════════════════════════════════════════════════════════════════ */

function DateChip({ dateMode, pickedDate, onModeChange, onPickedDateChange }) {
  const inputRef = useRef(null);

  function openPicker() {
    if (!inputRef.current) return;
    try { inputRef.current.showPicker(); }
    catch { inputRef.current.click(); }
  }

  function handleChipClick() {
    if (dateMode === "pick") { onModeChange(""); } else { openPicker(); }
  }

  function handleDateChange(e) {
    const ymd = e.target.value;
    if (!ymd) return;
    onPickedDateChange(ymd);
    onModeChange("pick");
  }

  const isActive   = dateMode === "pick";
  const chipBase   = "flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs font-semibold transition-all";
  const chipActive = "border-[#34483D] bg-[#E8EDE5 text-[#4A6358]";
  const chipIdle   = "border-[#E4E6DE] text-[#737C72] hover:border-[#D6D9D0] hover:text-[#737C72]";

  const dateLabel = isActive && pickedDate
    ? new Date(pickedDate + "T00:00:00").toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })
    : null;

  return (
    <>
      <button
        onClick={handleChipClick}
        className={`${chipBase} ${isActive ? chipActive : chipIdle}`}
        aria-label={isActive ? `Date: ${dateLabel}. Click to clear` : "Filter by date"}
      >
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round"
          className="w-3 h-3 shrink-0" aria-hidden="true">
          <rect x="1" y="2" width="12" height="11" rx="1.5"/>
          <path d="M1 5.5h12M4.5 1v2.5M9.5 1v2.5"/>
        </svg>
        {isActive ? dateLabel : "Select Date"}
        {isActive && <span className="text-[#4A6358]/70 leading-none" aria-hidden="true">×</span>}
      </button>

      {isActive && (
        <button
          onClick={openPicker}
          className="font-sans text-[10px] text-[#737C72] hover:text-[#737C72] transition-colors underline underline-offset-2"
          aria-label="Change date"
        >
          change
        </button>
      )}

      <input
        ref={inputRef}
        type="date"
        max={todayYMD()}
        defaultValue={pickedDate || ""}
        onChange={handleDateChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   RESERVATION DETAIL PANEL
══════════════════════════════════════════════════════════════════════ */

function ReservationDetailPanel({ res, tableMap, token, onClose, onCancelled }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling,    setCancelling]    = useState(false);
  const [cancelError,   setCancelError]   = useState(null);

  async function handleCancel() {
    setCancelling(true); setCancelError(null);
    try {
      const updated = await adminFetch(`/admin/reservations/${res.id}/cancel`, token, { method:"PATCH" });
      onCancelled(updated);
      onClose();
    } catch (err) {
      setCancelError(err.message);
      setCancelling(false);
    }
  }

  const tableLabels = (res.table_ids ?? [])
    .map(id => tableMap[id] ? `Table ${tableMap[id]}` : `…${String(id).slice(-6)}`)
    .join(", ") || "—";

  const addonList  = res.addons ?? [];
  const addonTotal = parseFloat(res.addon_total ?? 0);
  const totalPaid  = RESERVATION_FEE + addonTotal;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog" aria-label="Reservation detail">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex h-full w-full max-w-lg flex-col bg-[#FFFFFF] border-l border-[#E4E6DE] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E4E6DE] px-5 py-4">
          <div>
            <p className="font-poppins text-base font-bold text-[#26372E]">{refId(res.id)}</p>
            <p className="font-sans text-xs text-[#737C72] mt-0.5">Booked {fmtDT(res.created_at)}</p>
          </div>
          <button onClick={onClose} aria-label="Close detail panel"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#737C72] hover:bg-[#E4E6DE] hover:text-[#737C72] transition-colors">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={res.status} />
            {res.extra_chair && (
              <span className="rounded-full border border-[#D6D9D0] bg-[#E4E6DE] px-2.5 py-0.5
                               font-sans text-[10px] font-semibold text-[#737C72]">
                Extra Chair
              </span>
            )}
          </div>

          <DetailSection title="Reservation">
            <InfoRow label="Date"     value={fmtDate(res.reservation_time)} />
            <InfoRow label="Time"     value={fmtTime(res.reservation_time)} />
            <InfoRow label="Duration" value="1 hour (standard slot)" />
            <InfoRow label="Guests"   value={`${res.party_size} ${res.party_size === 1 ? "guest" : "guests"}`} />
            <InfoRow label="Table"    value={tableLabels} />
          </DetailSection>

          <DetailSection title="Customer">
            <InfoRow label="User ID" value={`…${String(res.user_id).slice(-12)}`} />
          </DetailSection>

          {addonList.length > 0 && (
            <DetailSection title="Add-ons">
              {addonList.map(a => (
                <div key={a.id} className="flex items-baseline justify-between gap-3">
                  <span className="font-poppins text-sm font-semibold text-[#26372E] flex-1 min-w-0">
                    {a.addon_name}
                    {a.quantity > 1 && <span className="font-sans font-normal text-[#737C72] ml-1.5">× {a.quantity}</span>}
                  </span>
                  <span className="font-sans text-sm text-[#34483D] shrink-0">{fmt(a.line_total)}</span>
                </div>
              ))}
            </DetailSection>
          )}

          {res.gift_message && (
            <DetailSection title="Gift Message">
              <p className="font-sans text-sm text-[#737C72] italic leading-relaxed">"{res.gift_message}"</p>
            </DetailSection>
          )}

          <DetailSection title="Payment">
            <InfoRow label="Reservation deposit" value={fmt(RESERVATION_FEE)} />
            {addonTotal > 0 && <InfoRow label="Add-ons total" value={fmt(addonTotal)} />}
            <div className="mt-2 flex justify-between border-t border-[#E4E6DE] pt-2">
              <span className="font-poppins text-sm font-bold text-[#26372E]">Total paid</span>
              <span className="font-poppins text-sm font-bold text-[#4A6358]">{fmt(totalPaid)}</span>
            </div>
          </DetailSection>

          {res.status === "confirmed" && (
            <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] p-4">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737C72] mb-3">
                Cancel Reservation
              </p>
              {cancelError && (
                <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600">
                  {cancelError}
                </p>
              )}
              {!confirmCancel ? (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="w-full rounded-lg border border-red-200/50 bg-red-950/20 px-4 py-2.5
                             font-poppins text-sm font-semibold text-red-600
                             hover:bg-red-50 hover:border-red-300 transition-all"
                >
                  Cancel this reservation
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-red-600">Are you sure? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmCancel(false)}
                      disabled={cancelling}
                      className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2 font-sans text-sm
                                 text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0]
                                 disabled:opacity-40 transition-colors"
                    >
                      Keep it
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex-1 rounded-lg bg-red-800 px-4 py-2 font-poppins text-sm
                                 font-semibold text-white hover:bg-red-700 active:scale-[0.98]
                                 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {cancelling ? "Cancelling…" : "Yes, cancel"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */

const VIEWS = [
  { key:"upcoming",  label:"Upcoming"  },
  { key:"today",     label:"Today"     },
  { key:"all",       label:"All"       },
  { key:"cancelled", label:"Cancelled" },
];

export default function AdminReservations() {
  const { token } = useAdminAuth();

  const [reservations, setReservations] = useState([]);
  const [tableMap,     setTableMap]     = useState({});
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [page,         setPage]         = useState(0);
  const [hasMore,      setHasMore]      = useState(false);

  // Existing filters
  const [view,   setView]   = useState("upcoming");
  const [search, setSearch] = useState("");

  // Date filter (server-side)
  const [dateMode,   setDateMode]   = useState("");   // "" | "today" | "yesterday" | "pick"
  const [pickedDate, setPickedDate] = useState("");   // "YYYY-MM-DD"

  const [detailRes, setDetailRes] = useState(null);

  /* ── Fetch ─────────────────────────────────────────────────────── */
  const fetchAll = useCallback(async (pageIndex = 0) => {
    if (!token) return;
    setLoading(true);
    setError(null);

    const dateBounds = buildDateParams(dateMode, pickedDate);
    const offset = pageIndex * PAGE_SIZE;

    let url = `/admin/reservations?limit=${PAGE_SIZE}&offset=${offset}`;
    if (dateBounds.date_from) url += `&date_from=${encodeURIComponent(dateBounds.date_from)}`;
    if (dateBounds.date_to)   url += `&date_to=${encodeURIComponent(dateBounds.date_to)}`;

    try {
      const [resData, tablesData] = await Promise.all([
        adminFetch(url, token),
        pageIndex === 0 ? adminFetch("/admin/tables", token) : Promise.resolve(null),
      ]);

      setReservations(prev => pageIndex === 0 ? resData : [...prev, ...resData]);
      setHasMore(resData.length === PAGE_SIZE);
      setPage(pageIndex);

      if (tablesData) {
        const map = {};
        tablesData.forEach(t => { map[t.id] = t.table_number; });
        setTableMap(map);
      }
    } catch (err) {
      setError(err.message || "Failed to load reservations.");
    } finally {
      setLoading(false);
    }
  }, [token, dateMode, pickedDate]);

  useEffect(() => { fetchAll(0); }, [fetchAll]);

  /* ── Date mode handlers ────────────────────────────────────────── */
  function handleDateModeChange(mode) { setDateMode(mode); setPage(0); }
  function handlePickedDateChange(ymd) { setPickedDate(ymd); setPage(0); }

  /* ── Client-side view tab + search filter on loaded data ───────── */
  const filtered = useMemo(() => {
    let list = reservations;

    if (view === "upcoming")  list = list.filter(r => r.status === "confirmed" && isUpcoming(r.reservation_time));
    if (view === "today")     list = list.filter(r => isToday(r.reservation_time));
    if (view === "cancelled") list = list.filter(r => r.status === "cancelled");
    // "all" → no tab filter

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        String(r.id).slice(-8).toLowerCase().includes(q) ||
        String(r.party_size).includes(q)
      );
    }
    return list;
  }, [reservations, view, search]);

  /* ── View counts (on loaded data) ─────────────────────────────── */
  const counts = useMemo(() => ({
    upcoming:  reservations.filter(r => r.status === "confirmed" && isUpcoming(r.reservation_time)).length,
    today:     reservations.filter(r => isToday(r.reservation_time)).length,
    all:       reservations.length,
    cancelled: reservations.filter(r => r.status === "cancelled").length,
  }), [reservations]);

  /* ── Cancel callback ───────────────────────────────────────────── */
  function handleCancelled(updated) {
    setReservations(prev =>
      prev.map(r => r.id === updated.id ? { ...r, status:"cancelled" } : r)
    );
    setDetailRes(null);
  }

  /* ── Active date label for subtitle ─────────────────────────────── */
  const activeDateLabel = useMemo(() => {
    if (dateMode === "today")     return "Today";
    if (dateMode === "yesterday") return "Yesterday";
    if (dateMode === "pick" && pickedDate)
      return new Date(pickedDate + "T00:00:00").toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
    return null;
  }, [dateMode, pickedDate]);

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-7xl mx-auto">

      {/* Page header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Reservations</h1>
          <p className="mt-0.5 font-sans text-xs text-[#737C72]">
            {loading
              ? "Loading…"
              : `${filtered.length} reservation${filtered.length !== 1 ? "s" : ""} shown${activeDateLabel ? ` · ${activeDateLabel}` : ""}`}
          </p>
        </div>
        <button
          onClick={() => fetchAll(0)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[#E4E6DE] px-3 py-1.5
                     font-sans text-xs font-semibold text-[#737C72]
                     hover:border-[#D6D9D0] hover:text-[#737C72] transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true">
            <path d="M14 8A6 6 0 112 8"/><path d="M14 3v5h-5"/>
          </svg>
          Refresh
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => fetchAll(0)} />}

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="mb-4 space-y-3">

        {/* Row 1: View tabs + date chip in the same flex-wrap row */}
        <div className="flex flex-wrap gap-2">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={[
                "flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs font-semibold transition-all",
                view === v.key
                  ? "border-[#34483D] bg-[#E8EDE5 text-[#4A6358]"
                  : "border-[#E4E6DE] text-[#737C72] hover:border-[#D6D9D0] hover:text-[#737C72]",
              ].join(" ")}
            >
              {v.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold
                ${view === v.key ? "bg-[#34483D]/20 text-[#4A6358]" : "bg-[#E4E6DE] text-[#737C72]"}`}>
                {counts[v.key]}
              </span>
            </button>
          ))}

          {/* Divider */}
          <span className="self-center w-px h-4 bg-[#E4E6DE] shrink-0" aria-hidden="true" />

          {/* Date chip — inlined in the same row, wraps if needed */}
          <DateChip
            dateMode={dateMode}
            pickedDate={pickedDate}
            onModeChange={handleDateModeChange}
            onPickedDateChange={handlePickedDateChange}
          />
        </div>

        {/* Row 2: Search */}
        <div className="relative max-w-xs">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737C72]" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5"/><path d="M11 11l3 3"/>
          </svg>
          <input
            type="search"
            placeholder="Search by ref ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] pl-9 pr-4 py-2
                       font-sans text-sm text-[#26372E] placeholder:text-[#D6D9D0]
                       focus:outline-none focus:border-[#34483D] transition-colors"
          />
        </div>
      </div>

      {/* ── Reservation list ─────────────────────────────────────── */}
      <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] overflow-hidden">

        <div className="hidden sm:grid sm:grid-cols-[1fr_110px_90px_90px_100px] gap-4 px-5 py-3
                        border-b border-[#E4E6DE] bg-[#FFFFFF]">
          {["Booking", "Date & Time", "Guests", "Table", "Status"].map(h => (
            <p key={h} className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#737C72]">{h}</p>
          ))}
        </div>

        {loading && (
          <div className="divide-y divide-[#E4E6DE]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid sm:grid-cols-[1fr_110px_90px_90px_100px] gap-4 px-5 py-4">
                <div className="space-y-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20" /></div>
                <Skeleton className="hidden sm:block h-4 w-24" />
                <Skeleton className="hidden sm:block h-4 w-12" />
                <Skeleton className="hidden sm:block h-4 w-16" />
                <Skeleton className="hidden sm:block h-5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="px-5 py-16 text-center">
            <p className="font-poppins font-semibold text-[#737C72]">No reservations found</p>
            <p className="mt-1 font-sans text-xs text-[#D6D9D0]">
              {search || dateMode
                ? "Try clearing some filters."
                : "Nothing matches this view."}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-[#E4E6DE]">
            {filtered.map(res => {
              const tableLabels = (res.table_ids ?? [])
                .map(id => tableMap[id] ? `T${tableMap[id]}` : "?")
                .join(", ") || "—";

              return (
                <button
                  key={res.id}
                  onClick={() => setDetailRes(res)}
                  className="w-full text-left grid sm:grid-cols-[1fr_110px_90px_90px_100px] gap-4
                             px-5 py-4 hover:bg-[#FFFFFF] transition-colors duration-100 group"
                >
                  <div className="min-w-0">
                    <p className="font-poppins text-sm font-semibold text-[#26372E] group-hover:text-[#4A6358] transition-colors">
                      {refId(res.id)}
                    </p>
                    {res.addons?.length > 0 && (
                      <p className="font-sans text-xs text-[#737C72] mt-0.5 truncate">
                        {res.addons.map(a => a.addon_name).join(", ")}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden">
                      <span className="font-sans text-xs text-[#737C72]">
                        {fmtDate(res.reservation_time)} · {fmtTime(res.reservation_time)}
                      </span>
                      <span className="font-sans text-xs text-[#737C72]">{res.party_size} guests</span>
                      <StatusPill status={res.status} />
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center">
                    <div>
                      <p className="font-sans text-xs text-[#737C72]">{fmtDate(res.reservation_time)}</p>
                      <p className="font-sans text-xs text-[#737C72] mt-0.5">{fmtTime(res.reservation_time)}</p>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center">
                    <span className="font-sans text-sm text-[#737C72]">
                      {res.party_size} {res.party_size === 1 ? "guest" : "guests"}
                    </span>
                  </div>

                  <div className="hidden sm:flex items-center">
                    <span className="font-sans text-xs text-[#737C72]">{tableLabels}</span>
                  </div>

                  <div className="hidden sm:flex items-center">
                    <StatusPill status={res.status} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!loading && reservations.length > 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-[#E4E6DE] px-5 py-3">
            <p className="font-sans text-xs text-[#D6D9D0]">
              Page {page + 1} · {reservations.length} loaded
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchAll(page - 1)}
                disabled={page === 0 || loading}
                className="rounded-lg border border-[#E4E6DE] px-4 py-1.5 font-sans text-xs
                           text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0]
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >← Prev</button>
              <button
                onClick={() => fetchAll(page + 1)}
                disabled={!hasMore || loading}
                className="rounded-lg border border-[#E4E6DE] px-4 py-1.5 font-sans text-xs
                           text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0]
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detailRes && (
        <ReservationDetailPanel
          res={detailRes}
          tableMap={tableMap}
          token={token}
          onClose={() => setDetailRes(null)}
          onCancelled={handleCancelled}
        />
      )}
    </div>
  );
}
