/**
 * AdminAddons.jsx — Full admin reservation add-ons management.
 *
 * APIs used:
 *   GET   /api/admin/addons                       all add-ons incl. unavailable
 *   PATCH /api/admin/addons/{id}                  update name/description/price/image_url/is_available
 *   PATCH /api/admin/addons/{id}/availability     toggle only
 *
 * Features:
 *   - View all add-ons (enabled and disabled)
 *   - Edit name, description, price, image URL inline via modal
 *   - Toggle availability (instant, no modal)
 *   - Loading / error / empty states
 *   - No mock data — all real backend data
 */

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════ */

function fmt(v) {
  const n = parseFloat(v) || 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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

function AvailBadge({ available }) {
  return available
    ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/40 bg-emerald-950/40 px-2.5 py-0.5 font-sans text-[10px] font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />Enabled
      </span>
    : <span className="inline-flex items-center gap-1 rounded-full border border-[#D6D9D0] bg-[#E4E6DE] px-2.5 py-0.5 font-sans text-[10px] font-semibold text-[#737C72]">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />Disabled
      </span>;
}

const inputCls = "w-full rounded-lg border border-[#E4E6DE] bg-[#F7F6F0] px-3.5 py-2.5 font-sans text-sm text-[#26372E] placeholder:text-[#D6D9D0] focus:outline-none focus:border-[#34483D] transition-colors";
const labelCls = "block font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#737C72] mb-1.5";

/* ══════════════════════════════════════════════════════════════════════
   EDIT MODAL
══════════════════════════════════════════════════════════════════════ */

function EditAddonModal({ addon, token, onSaved, onClose }) {
  const [form,   setForm]   = useState({
    name:        addon.name,
    description: addon.description ?? "",
    price:       String(addon.price),
    image_url:   addon.image_url ?? "",
    is_available: addon.is_available,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.price) return;
    setSaving(true); setError(null);

    const body = {
      name:         form.name.trim(),
      description:  form.description.trim() || null,
      price:        parseFloat(form.price),
      image_url:    form.image_url.trim() || null,
      is_available: form.is_available,
    };

    try {
      const updated = await adminFetch(`/admin/addons/${addon.id}`, token, {
        method: "PATCH",
        body:   JSON.stringify(body),
      });
      onSaved(updated);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-8 px-4"
      aria-modal="true" role="dialog" aria-label={`Edit ${addon.name}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#E4E6DE] bg-[#FFFFFF] p-6 shadow-2xl my-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-poppins text-base font-bold text-[#26372E]">Edit Add-on</h3>
          <button onClick={onClose} aria-label="Close"
            className="text-[#737C72] hover:text-[#737C72] transition-colors">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" className="w-5 h-5"><path d="m5 5 10 10M15 5 5 15"/></svg>
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Name *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)}
              required placeholder="Add-on name" className={inputCls} />
          </div>

          {/* Price */}
          <div>
            <label className={labelCls}>Price (₹) *</label>
            <input type="number" min="0" step="0.01" value={form.price}
              onChange={e => set("price", e.target.value)} required
              placeholder="0.00" className={inputCls} />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              rows={2} placeholder="Short description…"
              className={`${inputCls} resize-none`} />
          </div>

          {/* Image URL */}
          <div>
            <label className={labelCls}>Image URL</label>
            <input value={form.image_url} onChange={e => set("image_url", e.target.value)}
              placeholder="https://…" className={inputCls} />
          </div>

          {/* Availability toggle */}
          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => set("is_available", !form.is_available)}
              role="switch" aria-checked={form.is_available}
              className={[
                "relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 transition-colors duration-200",
                form.is_available ? "bg-[#26372E] border-[#26372E]" : "bg-[#E4E6DE] border-[#D6D9D0]",
              ].join(" ")}>
              <span className={[
                "inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 mt-px",
                form.is_available ? "translate-x-4" : "translate-x-px",
              ].join(" ")} />
            </button>
            <span className="font-sans text-sm text-[#737C72]">
              {form.is_available ? "Enabled on reservation page" : "Hidden from customers"}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5 font-sans text-sm
                         text-[#737C72] hover:text-[#737C72] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-[#34483D] px-4 py-2.5 font-poppins text-sm
                         font-semibold text-[#FFFFFF] hover:bg-[#4A6358]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all active:scale-[0.98]">
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

export default function AdminAddons() {
  const { token } = useAdminAuth();

  const [addons,     setAddons]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [editAddon,  setEditAddon]  = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  /* ── Fetch ALL add-ons (incl. unavailable) ────────────────────── */
  const fetchAddons = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await adminFetch("/admin/addons", token);
      setAddons(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAddons(); }, [fetchAddons]);

  /* ── Toggle availability (quick action, no modal) ─────────────── */
  async function handleToggle(addon) {
    setTogglingId(addon.id);
    try {
      const updated = await adminFetch(`/admin/addons/${addon.id}/availability`, token, {
        method: "PATCH",
        body: JSON.stringify({ is_available: !addon.is_available }),
      });
      setAddons(prev => prev.map(a => a.id === updated.id ? updated : a));
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  }

  /* ── Save from edit modal ──────────────────────────────────────── */
  function handleSaved(updated) {
    setAddons(prev => prev.map(a => a.id === updated.id ? updated : a));
    setEditAddon(null);
  }

  const enabledCount  = addons.filter(a => a.is_available).length;
  const disabledCount = addons.length - enabledCount;

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Reservation Add-ons</h1>
          <p className="mt-0.5 font-sans text-xs text-[#737C72]">
            {loading
              ? "Loading…"
              : `${addons.length} add-ons · ${enabledCount} enabled · ${disabledCount} disabled`}
          </p>
        </div>
        <button onClick={fetchAddons} disabled={loading}
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
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchAddons} />}

      {/* Add-ons table */}
      <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] overflow-hidden">

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_90px_110px_160px] gap-4 px-5 py-3
                        border-b border-[#E4E6DE] bg-[#FFFFFF]">
          {["Add-on", "Price", "Status", "Actions"].map(h => (
            <p key={h} className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#737C72]">{h}</p>
          ))}
        </div>

        {/* Skeletons */}
        {loading && (
          <div className="divide-y divide-[#E4E6DE]">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="grid grid-cols-[1fr_90px_110px_160px] gap-4 px-5 py-4 items-center">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-8 w-16 rounded-lg" />
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && addons.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="font-poppins font-semibold text-[#737C72]">No add-ons found</p>
            <p className="mt-1 font-sans text-xs text-[#D6D9D0]">
              Run the backend seed script to populate reservation add-ons.
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && addons.length > 0 && (
          <div className="divide-y divide-[#E4E6DE]">
            {addons.map(addon => (
              <div key={addon.id}
                className={[
                  "grid grid-cols-[1fr_90px_110px_160px] gap-4 px-5 py-4 items-center transition-colors",
                  !addon.is_available ? "opacity-60" : "",
                ].join(" ")}>

                {/* Name + description */}
                <div className="min-w-0">
                  <p className="font-poppins text-sm font-semibold text-[#26372E] truncate">
                    {addon.name}
                  </p>
                  {addon.description && (
                    <p className="font-sans text-xs text-[#737C72] mt-0.5 truncate">
                      {addon.description}
                    </p>
                  )}
                </div>

                {/* Price */}
                <p className="font-poppins text-sm font-semibold text-[#34483D]">
                  {fmt(addon.price)}
                </p>

                {/* Status badge */}
                <div>
                  <AvailBadge available={addon.is_available} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {/* Edit */}
                  <button onClick={() => setEditAddon(addon)}
                    className="rounded-lg border border-[#E4E6DE] px-3 py-1.5 font-sans text-xs
                               text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0] transition-colors">
                    Edit
                  </button>
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(addon)}
                    disabled={togglingId === addon.id}
                    className={[
                      "rounded-lg border px-3 py-1.5 font-sans text-xs font-semibold transition-colors",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      addon.is_available
                        ? "border-[#D6D9D0] text-[#737C72] hover:border-red-200/50 hover:text-red-600"
                        : "border-emerald-800/50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
                    ].join(" ")}>
                    {togglingId === addon.id ? "…" : addon.is_available ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editAddon && (
        <EditAddonModal
          addon={editAddon}
          token={token}
          onSaved={handleSaved}
          onClose={() => setEditAddon(null)}
        />
      )}
    </div>
  );
}
