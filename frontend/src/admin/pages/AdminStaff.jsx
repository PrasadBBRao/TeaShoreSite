/**
 * AdminStaff.jsx — Head-admin-only staff management page.
 *
 * APIs used (all existing from Step 9A):
 *   GET   /api/admin/staff?include_inactive=true   list all staff accounts
 *   POST  /api/admin/staff                         create staff account
 *   PATCH /api/admin/staff/{id}                    activate/deactivate, reset password
 *
 * Security:
 *   - This page is only reachable by head_admin (route is hidden from staff
 *     in the sidebar AND AdminLayout redirects staff away from /admin/staff).
 *   - Backend remains authoritative — frontend visibility is a convenience only.
 *   - Passwords are never displayed.
 *   - Role field is intentionally absent from all forms.
 */

import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
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
  return res.json();
}

/* ══════════════════════════════════════════════════════════════════════
   SMALL UI
══════════════════════════════════════════════════════════════════════ */

function Skeleton({ className = "" }) {
  return <div className={`rounded bg-[#E4E6DE] animate-pulse ${className}`} />;
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-xl
                    border border-red-200 bg-red-50 px-5 py-3">
      <p className="font-sans text-sm text-red-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-300 px-3 py-1
                     font-sans text-xs font-semibold text-red-600
                     hover:bg-red-900/30 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}

function ActiveBadge({ active }) {
  return active
    ? <span className="inline-flex items-center gap-1 rounded-full border
                       border-emerald-800/40 bg-emerald-950/40 px-2.5 py-0.5
                       font-sans text-[10px] font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />Active
      </span>
    : <span className="inline-flex items-center gap-1 rounded-full border
                       border-[#D6D9D0] bg-[#E4E6DE] px-2.5 py-0.5
                       font-sans text-[10px] font-semibold text-[#737C72]">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />Inactive
      </span>;
}

const inputCls = "w-full rounded-lg border border-[#E4E6DE] bg-[#F7F6F0] px-3.5 py-2.5 font-sans text-sm text-[#26372E] placeholder:text-[#D6D9D0] focus:outline-none focus:border-[#34483D] transition-colors";
const labelCls = "block font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#737C72] mb-1.5";

/* ══════════════════════════════════════════════════════════════════════
   CREATE STAFF MODAL
══════════════════════════════════════════════════════════════════════ */

function CreateStaffModal({ token, onCreated, onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      const created = await adminFetch("/admin/staff", token, {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      aria-modal="true" role="dialog" aria-label="Create staff account">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#E4E6DE]
                      bg-[#FFFFFF] p-6 shadow-2xl">

        <div className="flex items-center justify-between mb-5">
          <h3 className="font-poppins text-base font-bold text-[#26372E]">Create Staff Account</h3>
          <button onClick={onClose} aria-label="Close"
            className="text-[#737C72] hover:text-[#737C72] transition-colors">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" className="w-5 h-5"><path d="m5 5 10 10M15 5 5 15"/></svg>
          </button>
        </div>

        {/* Role notice */}
        <div className="mb-4 rounded-lg border border-[#E4E6DE] bg-[#F7F6F0] px-4 py-3">
          <p className="font-sans text-xs text-[#737C72]">
            New accounts are always created with <span className="text-[#34483D] font-semibold">Staff</span> role.
            Role cannot be changed after creation.
          </p>
        </div>

        {error && <ErrorBanner message={error} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Username *</label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              required placeholder="e.g. staff_john" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Password * (min 8 characters)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Confirm Password *</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required placeholder="••••••••" className={inputCls} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5
                         font-sans text-sm text-[#737C72] hover:text-[#737C72] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !username || !password || !confirm}
              className="flex-1 rounded-lg bg-[#34483D] px-4 py-2.5 font-poppins text-sm
                         font-semibold text-[#FFFFFF] hover:bg-[#4A6358]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all active:scale-[0.98]">
              {saving ? "Creating…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   DEACTIVATE / REACTIVATE CONFIRM DIALOG
══════════════════════════════════════════════════════════════════════ */

function ToggleActiveDialog({ staff, token, onUpdated, onClose }) {
  const willDeactivate = staff.is_active;
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  async function handleConfirm() {
    setSaving(true); setError(null);
    try {
      const updated = await adminFetch(`/admin/staff/${staff.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !staff.is_active }),
      });
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#E4E6DE]
                      bg-[#FFFFFF] p-6 shadow-2xl">
        <h3 className="font-poppins text-base font-bold text-[#26372E] mb-2">
          {willDeactivate ? "Deactivate" : "Reactivate"} @{staff.username}?
        </h3>
        <p className="font-sans text-sm text-[#737C72] mb-4">
          {willDeactivate
            ? "The account will be blocked immediately. The staff member cannot log in until reactivated."
            : "The account will be restored and the staff member can log in again."}
        </p>
        {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5
                       font-sans text-sm text-[#737C72] hover:text-[#737C72]
                       disabled:opacity-40 transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className={[
              "flex-1 rounded-lg px-4 py-2.5 font-poppins text-sm font-semibold",
              "disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]",
              willDeactivate
                ? "bg-red-800 text-white hover:bg-red-700"
                : "bg-emerald-700 text-white hover:bg-emerald-600",
            ].join(" ")}>
            {saving ? "Please wait…" : willDeactivate ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   RESET PASSWORD MODAL
══════════════════════════════════════════════════════════════════════ */

function ResetPasswordModal({ staff, token, onClose }) {
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      await adminFetch(`/admin/staff/${staff.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#E4E6DE]
                      bg-[#FFFFFF] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-poppins text-base font-bold text-[#26372E]">
            Reset Password — @{staff.username}
          </h3>
          <button onClick={onClose} aria-label="Close"
            className="text-[#737C72] hover:text-[#737C72] transition-colors">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" className="w-5 h-5"><path d="m5 5 10 10M15 5 5 15"/></svg>
          </button>
        </div>

        {success ? (
          <div className="text-center py-4">
            <p className="font-poppins font-semibold text-emerald-700 mb-2">Password updated</p>
            <p className="font-sans text-xs text-[#737C72] mb-4">
              The new password is active immediately.
            </p>
            <button onClick={onClose}
              className="rounded-lg bg-[#34483D] px-6 py-2 font-poppins text-sm
                         font-semibold text-[#FFFFFF] hover:bg-[#4A6358] transition-colors">
              Done
            </button>
          </div>
        ) : (
          <>
            {error && <ErrorBanner message={error} />}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelCls}>New Password *</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="••••••••" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Confirm Password *</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required placeholder="••••••••" className={inputCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5
                             font-sans text-sm text-[#737C72] hover:text-[#737C72] transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving || !password || !confirm}
                  className="flex-1 rounded-lg bg-[#34483D] px-4 py-2.5 font-poppins text-sm
                             font-semibold text-[#FFFFFF] hover:bg-[#4A6358]
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all active:scale-[0.98]">
                  {saving ? "Saving…" : "Reset Password"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */

export default function AdminStaff() {
  const { admin, token } = useAdminAuth();

  // Hard redirect if not head_admin — backend also enforces this
  if (admin && admin.role !== "head_admin") {
    return <Navigate to="/admin" replace />;
  }

  const [staff,      setStaff]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toggleTarget,  setToggleTarget]  = useState(null); // staff obj for activate/deactivate
  const [resetTarget,   setResetTarget]   = useState(null); // staff obj for password reset
  const [showInactive,  setShowInactive]  = useState(false);

  /* ── Fetch ─────────────────────────────────────────────────────── */
  const fetchStaff = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await adminFetch(
        `/admin/staff?include_inactive=${showInactive}`, token
      );
      setStaff(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, showInactive]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  /* ── Callbacks from modals ─────────────────────────────────────── */
  function handleCreated(newStaff) {
    setStaff(prev => [newStaff, ...prev]);
    setShowCreate(false);
  }

  function handleUpdated(updated) {
    setStaff(prev => prev.map(s => s.id === updated.id ? updated : s));
    setToggleTarget(null);
  }

  const activeCount   = staff.filter(s => s.is_active).length;
  const inactiveCount = staff.filter(s => !s.is_active).length;

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Staff Accounts</h1>
          <p className="mt-0.5 font-sans text-xs text-[#737C72]">
            {loading ? "Loading…"
              : `${staff.length} account${staff.length !== 1 ? "s" : ""} · ${activeCount} active · ${inactiveCount} inactive`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Show/hide inactive toggle */}
          <button onClick={() => setShowInactive(v => !v)}
            className={[
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5",
              "font-sans text-xs font-semibold transition-colors",
              showInactive
                ? "border-[#34483D]/35 text-[#4A6358] bg-[#E8EDE5"
                : "border-[#E4E6DE] text-[#737C72] hover:border-[#D6D9D0] hover:text-[#737C72]",
            ].join(" ")}>
            {showInactive ? "Hiding inactive" : "Show inactive"}
          </button>
          {/* Refresh */}
          <button onClick={fetchStaff} disabled={loading}
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
          {/* Create */}
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#34483D] px-4 py-1.5
                       font-poppins text-xs font-semibold text-[#FFFFFF]
                       hover:bg-[#4A6358] transition-colors active:scale-[0.98]">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" className="w-3.5 h-3.5"><path d="M8 3v10M3 8h10"/></svg>
            Add Staff
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchStaff} />}

      {/* Head Admin info panel */}
      <div className="mb-5 rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                          bg-[#34483D]/15 font-poppins font-bold text-sm text-[#34483D]">
            {admin?.username?.[0]?.toUpperCase() ?? "H"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-poppins text-sm font-semibold text-[#26372E]">{admin?.username}</p>
              <span className="rounded-full border border-[#34483D]/25 bg-[#E8EDE5 px-2 py-0.5
                               font-sans text-[10px] font-semibold text-[#34483D]">
                Head Admin
              </span>
            </div>
            <p className="font-sans text-xs text-[#737C72] mt-0.5">You — managing staff accounts</p>
          </div>
        </div>
      </div>

      {/* Staff list */}
      <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] overflow-hidden">

        {/* Table header */}
        <div className="hidden sm:grid sm:grid-cols-[1fr_90px_100px_160px] gap-4 px-5 py-3
                        border-b border-[#E4E6DE] bg-[#FFFFFF]">
          {["Username", "Status", "Created", "Actions"].map(h => (
            <p key={h} className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#737C72]">{h}</p>
          ))}
        </div>

        {/* Skeletons */}
        {loading && (
          <div className="divide-y divide-[#E4E6DE]">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="hidden sm:block h-5 w-20 rounded-full" />
                <Skeleton className="hidden sm:block h-4 w-24" />
                <Skeleton className="hidden sm:block h-8 w-36 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && staff.length === 0 && (
          <div className="px-5 py-16 text-center">
            <p className="font-poppins font-semibold text-[#737C72]">No staff accounts yet</p>
            <p className="mt-1 font-sans text-xs text-[#D6D9D0]">
              Create the first staff account to get started.
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && staff.length > 0 && (
          <div className="divide-y divide-[#E4E6DE]">
            {staff.map(member => (
              <div key={member.id}
                className={[
                  "grid sm:grid-cols-[1fr_90px_100px_160px] gap-4 px-5 py-4 items-center",
                  !member.is_active ? "opacity-55" : "",
                ].join(" ")}>

                {/* Username */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                                    bg-[#E4E6DE] font-poppins font-bold text-xs text-[#737C72]">
                      {member.username?.[0]?.toUpperCase() ?? "S"}
                    </div>
                    <p className="font-poppins text-sm font-semibold text-[#26372E] truncate">
                      @{member.username}
                    </p>
                    <span className="rounded-full border border-[#E4E6DE] bg-[#FFFFFF] px-2 py-0.5
                                     font-sans text-[10px] text-[#737C72]">
                      Staff
                    </span>
                  </div>
                  {/* Mobile extras */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden">
                    <ActiveBadge active={member.is_active} />
                    <span className="font-sans text-xs text-[#737C72]">{fmtDT(member.created_at)}</span>
                  </div>
                </div>

                {/* Status */}
                <div className="hidden sm:flex">
                  <ActiveBadge active={member.is_active} />
                </div>

                {/* Created date */}
                <p className="hidden sm:block font-sans text-xs text-[#737C72]">
                  {fmtDT(member.created_at)}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Reset password */}
                  <button onClick={() => setResetTarget(member)}
                    className="rounded-lg border border-[#E4E6DE] px-2.5 py-1.5 font-sans text-xs
                               text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0] transition-colors">
                    Reset PW
                  </button>
                  {/* Activate / Deactivate */}
                  <button onClick={() => setToggleTarget(member)}
                    className={[
                      "rounded-lg border px-2.5 py-1.5 font-sans text-xs font-semibold transition-colors",
                      member.is_active
                        ? "border-[#D6D9D0] text-[#737C72] hover:text-red-600 hover:border-red-200/50"
                        : "border-emerald-800/50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
                    ].join(" ")}>
                    {member.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateStaffModal token={token} onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
      {toggleTarget && (
        <ToggleActiveDialog
          staff={toggleTarget} token={token}
          onUpdated={handleUpdated}
          onClose={() => setToggleTarget(null)}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          staff={resetTarget} token={token}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
