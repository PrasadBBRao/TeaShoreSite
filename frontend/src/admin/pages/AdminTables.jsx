/**
 * AdminTables.jsx — Full admin tables & sessions management page.
 *
 * APIs used (all existing):
 *   GET    /api/admin/tables
 *   POST   /api/admin/tables          { table_number, capacity, qr_secret }
 *   PATCH  /api/admin/tables/{id}     { capacity?, status? }
 *   DELETE /api/admin/tables/{id}
 *   GET    /api/admin/sessions?status=active
 *   POST   /api/admin/sessions        { table_id }
 *   PATCH  /api/admin/sessions/{id}/close
 *
 * Sections:
 *   1. Tables grid — status, number, capacity, type, action menu
 *   2. Active sessions list — table, started, token, force-close
 *   3. Add table modal
 *   4. Edit table modal (capacity / status only — TableUpdate schema)
 *   5. Delete confirmation
 *   6. Open session confirmation
 *   7. Close session confirmation
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

/* Table number → human category (mirrors frontend booking constants) */
const TABLE_CATEGORY = {
  1:"Window", 2:"Window",
  3:"Centre", 4:"Centre", 5:"Centre",
  6:"Corner", 7:"Corner",
  8:"Group",  9:"Group",  10:"Group",
  11:"Outdoor", 12:"Outdoor",
};
function tableType(num) { return TABLE_CATEGORY[num] ?? "Standard"; }

function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"numeric", minute:"2-digit", hour12:true,
  });
}

function elapsed(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

async function adminFetch(path, token, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ══════════════════════════════════════════════════════════════════════
   SMALL REUSABLE UI
══════════════════════════════════════════════════════════════════════ */

function Skeleton({ className = "" }) {
  return <div className={`rounded bg-[#E4E6DE] animate-pulse ${className}`} />;
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-3">
      <p className="font-sans text-sm text-red-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-300 px-3 py-1 font-sans text-xs font-semibold text-red-600 hover:bg-red-900/30 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}

function StatusDot({ status }) {
  return status === "occupied"
    ? <span className="h-2 w-2 rounded-full bg-[#4A6358] shrink-0" aria-label="Occupied" />
    : <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" aria-label="Free" />;
}

/* ── Confirm dialog ─────────────────────────────────────────────── */
function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#E4E6DE] bg-[#FFFFFF] p-6 shadow-2xl">
        <h3 className="font-poppins text-base font-bold text-[#26372E] mb-2">{title}</h3>
        <p className="font-sans text-sm text-[#737C72] mb-5">{body}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5 font-sans text-sm
                       text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0]
                       disabled:opacity-40 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={[
              "flex-1 rounded-lg px-4 py-2.5 font-poppins text-sm font-semibold transition-all active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              danger
                ? "bg-red-800 text-white hover:bg-red-700"
                : "bg-[#34483D] text-[#FFFFFF] hover:bg-[#4A6358]",
            ].join(" ")}>
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Form input ─────────────────────────────────────────────────── */
function FormField({ label, children }) {
  return (
    <div>
      <label className="block font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#737C72] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-[#E4E6DE] bg-[#F7F6F0] px-3.5 py-2.5 font-sans text-sm text-[#26372E] placeholder:text-[#D6D9D0] focus:outline-none focus:border-[#34483D] transition-colors";

/* ══════════════════════════════════════════════════════════════════════
   ADD TABLE MODAL
══════════════════════════════════════════════════════════════════════ */

function AddTableModal({ token, onCreated, onClose }) {
  const [form,    setForm]    = useState({ table_number: "", capacity: "", qr_secret: "" });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  /* Auto-generate a QR secret suggestion */
  useEffect(() => {
    const rand = Math.random().toString(36).slice(2, 18).toUpperCase();
    setForm(f => ({ ...f, qr_secret: `TABLE-${rand}` }));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.table_number || !form.capacity || !form.qr_secret) return;
    setSaving(true); setError(null);
    try {
      const created = await adminFetch("/admin/tables", token, {
        method: "POST",
        body: JSON.stringify({
          table_number: parseInt(form.table_number, 10),
          capacity:     parseInt(form.capacity, 10),
          qr_secret:    form.qr_secret.trim(),
        }),
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#E4E6DE] bg-[#FFFFFF] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-poppins text-base font-bold text-[#26372E]">Add Table</h3>
          <button onClick={onClose} className="text-[#737C72] hover:text-[#737C72] transition-colors" aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5"><path d="m5 5 10 10M15 5 5 15"/></svg>
          </button>
        </div>
        {error && <ErrorBanner message={error} />}
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Table Number">
            <input type="number" min="1" max="999" placeholder="e.g. 13" value={form.table_number}
              onChange={e => setForm(f => ({ ...f, table_number: e.target.value }))}
              required className={inputCls} />
          </FormField>
          <FormField label="Capacity (seats)">
            <input type="number" min="1" max="50" placeholder="e.g. 4" value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
              required className={inputCls} />
          </FormField>
          <FormField label="QR Secret">
            <input type="text" placeholder="Unique identifier for QR code" value={form.qr_secret}
              onChange={e => setForm(f => ({ ...f, qr_secret: e.target.value }))}
              required className={inputCls} />
            <p className="mt-1 font-sans text-[10px] text-[#D6D9D0]">Must be unique. Used to generate the table's QR code.</p>
          </FormField>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5 font-sans text-sm
                         text-[#737C72] hover:text-[#737C72] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-[#34483D] px-4 py-2.5 font-poppins text-sm
                         font-semibold text-[#FFFFFF] hover:bg-[#4A6358] disabled:opacity-50
                         disabled:cursor-not-allowed transition-all active:scale-[0.98]">
              {saving ? "Adding…" : "Add Table"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   EDIT TABLE MODAL
══════════════════════════════════════════════════════════════════════ */

function EditTableModal({ table, token, onUpdated, onClose }) {
  const [capacity, setCapacity] = useState(String(table.capacity));
  const [status,   setStatus]   = useState(table.status);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const updated = await adminFetch(`/admin/tables/${table.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          capacity: parseInt(capacity, 10),
          status,
        }),
      });
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#E4E6DE] bg-[#FFFFFF] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-poppins text-base font-bold text-[#26372E]">Edit Table {table.table_number}</h3>
          <button onClick={onClose} className="text-[#737C72] hover:text-[#737C72] transition-colors" aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5"><path d="m5 5 10 10M15 5 5 15"/></svg>
          </button>
        </div>
        {error && <ErrorBanner message={error} />}
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Capacity (seats)">
            <input type="number" min="1" max="50" value={capacity}
              onChange={e => setCapacity(e.target.value)} required className={inputCls} />
          </FormField>
          <FormField label="Status">
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
              <option value="free">Free</option>
              <option value="occupied">Occupied</option>
            </select>
          </FormField>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5 font-sans text-sm
                         text-[#737C72] hover:text-[#737C72] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-[#34483D] px-4 py-2.5 font-poppins text-sm
                         font-semibold text-[#FFFFFF] hover:bg-[#4A6358] disabled:opacity-50
                         disabled:cursor-not-allowed transition-all active:scale-[0.98]">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */

export default function AdminTables() {
  const { token } = useAdminAuth();

  const [tables,   setTables]   = useState([]);
  const [sessions, setSessions] = useState([]);  // active sessions only
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  /* Modal / action state */
  const [showAdd,      setShowAdd]      = useState(false);
  const [editTable,    setEditTable]    = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);  // table obj
  const [openTarget,   setOpenTarget]   = useState(null);  // table obj
  const [closeTarget,  setCloseTarget]  = useState(null);  // session obj

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState(null);

  /* ── Fetch ────────────────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [tablesData, sessionsData] = await Promise.all([
        adminFetch("/admin/tables", token),
        adminFetch("/admin/sessions?status=active&limit=200", token),
      ]);
      setTables(tablesData);
      setSessions(sessionsData);
    } catch (err) {
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Session map: table_id → active session ───────────────────── */
  const sessionByTableId = useMemo(() => {
    const m = {};
    sessions.forEach(s => { m[s.table_id] = s; });
    return m;
  }, [sessions]);

  /* ── Table counts ─────────────────────────────────────────────── */
  const freeCount     = tables.filter(t => t.status === "free").length;
  const occupiedCount = tables.filter(t => t.status === "occupied").length;

  /* ═══════════════════ ACTIONS ═══════════════════ */

  async function handleDelete() {
    setActionLoading(true); setActionError(null);
    try {
      await adminFetch(`/admin/tables/${deleteTarget.id}`, token, { method: "DELETE" });
      setTables(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleOpenSession() {
    setActionLoading(true); setActionError(null);
    try {
      const sess = await adminFetch("/admin/sessions", token, {
        method: "POST",
        body: JSON.stringify({ table_id: openTarget.id }),
      });
      // Mark table occupied
      setTables(prev => prev.map(t => t.id === openTarget.id ? { ...t, status: "occupied" } : t));
      setSessions(prev => [...prev, sess]);
      setOpenTarget(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCloseSession() {
    setActionLoading(true); setActionError(null);
    try {
      await adminFetch(`/admin/sessions/${closeTarget.id}/close`, token, { method: "PATCH" });
      // Mark table free and remove session from active list
      setTables(prev => prev.map(t => t.id === closeTarget.table_id ? { ...t, status: "free" } : t));
      setSessions(prev => prev.filter(s => s.id !== closeTarget.id));
      setCloseTarget(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Tables & Sessions</h1>
          <p className="mt-0.5 font-sans text-xs text-[#737C72]">
            {loading ? "Loading…" : `${tables.length} tables · ${freeCount} free · ${occupiedCount} occupied · ${sessions.length} active sessions`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[#E4E6DE] px-3 py-1.5
                       font-sans text-xs font-semibold text-[#737C72]
                       hover:border-[#D6D9D0] hover:text-[#737C72] transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}>
              <path d="M14 8A6 6 0 112 8"/><path d="M14 3v5h-5"/>
            </svg>
            Refresh
          </button>
          <button onClick={() => { setActionError(null); setShowAdd(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-[#34483D] px-4 py-1.5
                       font-poppins text-xs font-semibold text-[#FFFFFF]
                       hover:bg-[#4A6358] transition-colors active:scale-[0.98]">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" className="w-3.5 h-3.5">
              <path d="M8 3v10M3 8h10"/>
            </svg>
            Add Table
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchAll} />}

      {/* ══════════════════════════════════════════════════════
          SECTION 1 — TABLES GRID
      ══════════════════════════════════════════════════════ */}
      <section>
        <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737C72] mb-3">
          All Tables
        </h2>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && tables.length === 0 && (
          <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] px-6 py-12 text-center">
            <p className="font-poppins font-semibold text-[#737C72]">No tables configured</p>
            <p className="mt-1 font-sans text-xs text-[#D6D9D0]">Add your first table to get started.</p>
          </div>
        )}

        {/* Grid */}
        {!loading && tables.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {tables.map(table => {
              const occupied = table.status === "occupied";
              const activeSess = sessionByTableId[table.id];
              return (
                <div key={table.id}
                  className={[
                    "rounded-xl border p-4 flex flex-col gap-3 transition-all",
                    occupied
                      ? "border-[#34483D]/25 bg-[#E8EDE5"
                      : "border-[#E4E6DE] bg-[#FFFFFF]",
                  ].join(" ")}>

                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={table.status} />
                      <span className={`font-poppins text-lg font-bold leading-none ${occupied ? "text-[#4A6358]" : "text-[#26372E]"}`}>
                        T{table.table_number}
                      </span>
                    </div>
                    <span className={`font-sans text-[10px] font-semibold uppercase tracking-widest ${occupied ? "text-[#34483D]" : "text-[#D6D9D0]"}`}>
                      {occupied ? "Busy" : "Free"}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="space-y-0.5">
                    <p className="font-sans text-xs text-[#737C72]">{tableType(table.table_number)}</p>
                    <p className="font-sans text-xs text-[#737C72]">{table.capacity} seats</p>
                    {activeSess && (
                      <p className="font-sans text-[10px] text-[#34483D]">
                        Open {elapsed(activeSess.started_at)}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-auto flex flex-col gap-1.5">
                    {!occupied ? (
                      <button
                        onClick={() => { setActionError(null); setOpenTarget(table); }}
                        className="w-full rounded-lg border border-emerald-300 bg-emerald-50 py-1.5
                                   font-sans text-xs font-semibold text-emerald-700
                                   hover:bg-emerald-100 transition-colors">
                        Open Session
                      </button>
                    ) : activeSess ? (
                      <button
                        onClick={() => { setActionError(null); setCloseTarget(activeSess); }}
                        className="w-full rounded-lg border border-[#34483D]/25 bg-[#E8EDE5 py-1.5
                                   font-sans text-xs font-semibold text-[#4A6358]
                                   hover:bg-[#34483D]/15 transition-colors">
                        Close Session
                      </button>
                    ) : null}

                    <div className="flex gap-1">
                      <button
                        onClick={() => { setActionError(null); setEditTable(table); }}
                        className="flex-1 rounded-lg border border-[#E4E6DE] py-1 font-sans text-[10px]
                                   text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0] transition-colors">
                        Edit
                      </button>
                      <button
                        onClick={() => { setActionError(null); setDeleteTarget(table); }}
                        className="flex-1 rounded-lg border border-[#E4E6DE] py-1 font-sans text-[10px]
                                   text-[#737C72] hover:text-red-600 hover:border-red-200/50 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 2 — ACTIVE SESSIONS LIST
      ══════════════════════════════════════════════════════ */}
      <section>
        <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737C72] mb-3">
          Active Sessions ({sessions.length})
        </h2>

        <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] overflow-hidden">

          {/* Table head */}
          <div className="hidden sm:grid sm:grid-cols-[60px_1fr_160px_140px_100px] gap-4 px-5 py-3
                          border-b border-[#E4E6DE] bg-[#FFFFFF]">
            {["Table", "Session Token", "Started", "Duration", "Action"].map(h => (
              <p key={h} className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#737C72]">{h}</p>
            ))}
          </div>

          {loading && (
            <div className="divide-y divide-[#E4E6DE]">
              {[1, 2, 3].map(i => (
                <div key={i} className="grid sm:grid-cols-[60px_1fr_160px_140px_100px] gap-4 px-5 py-4">
                  {[16, 64, 28, 20, 20].map((w, j) => (
                    <Skeleton key={j} className={`h-4 w-${w}`} />
                  ))}
                </div>
              ))}
            </div>
          )}

          {!loading && sessions.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="font-sans text-sm text-[#D6D9D0]">No active sessions right now.</p>
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <div className="divide-y divide-[#E4E6DE]">
              {sessions.map(sess => (
                <div key={sess.id}
                  className="grid sm:grid-cols-[60px_1fr_160px_140px_100px] gap-4 px-5 py-4 items-center">

                  {/* Table number */}
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#4A6358] shrink-0" aria-hidden="true" />
                    <span className="font-poppins text-sm font-bold text-[#4A6358]">T{sess.table_number}</span>
                  </div>

                  {/* Token (truncated) */}
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-[#737C72] truncate">
                      {sess.session_token.slice(0, 24)}…
                    </p>
                    {/* Mobile extra info */}
                    <p className="font-sans text-[10px] text-[#D6D9D0] mt-0.5 sm:hidden">
                      {fmtDT(sess.started_at)} · {elapsed(sess.started_at)}
                    </p>
                  </div>

                  {/* Started */}
                  <p className="hidden sm:block font-sans text-xs text-[#737C72]">
                    {fmtDT(sess.started_at)}
                  </p>

                  {/* Duration */}
                  <p className="hidden sm:block font-poppins text-sm font-semibold text-[#34483D]">
                    {elapsed(sess.started_at)}
                  </p>

                  {/* Close button */}
                  <div>
                    <button
                      onClick={() => { setActionError(null); setCloseTarget(sess); }}
                      className="rounded-lg border border-red-200/50 bg-red-950/20 px-3 py-1.5
                                 font-sans text-xs font-semibold text-red-600
                                 hover:bg-red-50 hover:border-red-300 transition-colors">
                      Close
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          MODALS & DIALOGS
      ══════════════════════════════════════════════════════ */}

      {showAdd && (
        <AddTableModal
          token={token}
          onCreated={created => {
            setTables(prev => [...prev, created].sort((a, b) => a.table_number - b.table_number));
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editTable && (
        <EditTableModal
          table={editTable}
          token={token}
          onUpdated={updated => {
            setTables(prev => prev.map(t => t.id === updated.id ? updated : t));
            setEditTable(null);
          }}
          onClose={() => setEditTable(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete Table ${deleteTarget.table_number}?`}
          body={
            deleteTarget.status === "occupied"
              ? "This table has an active session. Close the session first, then delete."
              : "This will permanently remove the table. This action cannot be undone."
          }
          confirmLabel="Delete Table"
          danger
          onConfirm={deleteTarget.status === "occupied" ? () => setDeleteTarget(null) : handleDelete}
          onCancel={() => { setDeleteTarget(null); setActionError(null); }}
          loading={actionLoading}
        />
      )}

      {openTarget && (
        <ConfirmDialog
          title={`Open Session on Table ${openTarget.table_number}?`}
          body={`This will mark Table ${openTarget.table_number} as occupied and create an active session. Customers can then place dine-in orders.`}
          confirmLabel="Open Session"
          danger={false}
          onConfirm={handleOpenSession}
          onCancel={() => { setOpenTarget(null); setActionError(null); }}
          loading={actionLoading}
        />
      )}

      {closeTarget && (
        <ConfirmDialog
          title={`Force-Close Session on Table ${closeTarget.table_number}?`}
          body="All orders on this session must be paid before it can close. Confirm payment for any unpaid orders first, and resolve any legacy (unverified) orders. Once all orders are paid, closing will mark the table as free."
          confirmLabel="Close Session"
          danger
          onConfirm={handleCloseSession}
          onCancel={() => { setCloseTarget(null); setActionError(null); }}
          loading={actionLoading}
        />
      )}

      {/* Inline action error (shown when a confirm dialog dismisses but error persists) */}
      {actionError && !deleteTarget && !openTarget && !closeTarget && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-red-200
                        bg-red-950/90 px-5 py-4 shadow-2xl">
          <p className="font-sans text-sm text-red-600">{actionError}</p>
          <button onClick={() => setActionError(null)}
            className="mt-2 font-sans text-xs text-red-500 underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
