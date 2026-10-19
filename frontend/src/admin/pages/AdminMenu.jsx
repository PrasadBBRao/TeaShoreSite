/**
 * AdminMenu.jsx — Full admin menu management page.
 *
 * APIs used:
 *   GET    /api/admin/menu                        list all items (incl. unavailable)
 *   POST   /api/admin/menu                        create item
 *   PATCH  /api/admin/menu/{id}                   update item fields
 *   PATCH  /api/admin/menu/{id}/availability      toggle available/unavailable
 *   DELETE /api/admin/menu/{id}                   delete (backend guards FK)
 *
 * MenuItemOut fields: id, name, description, price, category, image_url, is_available
 * Note: nutrition fields are NOT in the backend model — not shown here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
  if (res.status === 204) return null;
  return res.json();
}

/* ══════════════════════════════════════════════════════════════════════
   SMALL UI COMPONENTS
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
    ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/40 bg-emerald-950/40 px-2 py-0.5 font-sans text-[10px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-current" />Available</span>
    : <span className="inline-flex items-center gap-1 rounded-full border border-[#D6D9D0] bg-[#E4E6DE] px-2 py-0.5 font-sans text-[10px] font-semibold text-[#737C72]"><span className="h-1.5 w-1.5 rounded-full bg-current" />Unavailable</span>;
}

const inputCls = "w-full rounded-lg border border-[#E4E6DE] bg-[#F7F6F0] px-3.5 py-2.5 font-sans text-sm text-[#26372E] placeholder:text-[#D6D9D0] focus:outline-none focus:border-[#34483D] transition-colors";
const labelCls = "block font-sans text-xs font-semibold uppercase tracking-[0.14em] text-[#737C72] mb-1.5";

/* ══════════════════════════════════════════════════════════════════════
   ITEM FORM MODAL (used for both Add and Edit)
══════════════════════════════════════════════════════════════════════ */

const EMPTY_FORM = { name: "", description: "", price: "", category: "", image_url: "", is_available: true };

function ItemFormModal({ initial, title, token, onSaved, onClose }) {
  const [form,   setForm]   = useState(initial ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.price || !form.category.trim()) return;
    setSaving(true); setError(null);

    const body = {
      name:         form.name.trim(),
      description:  form.description.trim() || null,
      price:        parseFloat(form.price),
      category:     form.category.trim(),
      image_url:    form.image_url.trim() || null,
      is_available: form.is_available,
    };

    try {
      const isEdit = Boolean(initial?.id);
      const path   = isEdit ? `/admin/menu/${initial.id}` : "/admin/menu";
      const saved  = await adminFetch(path, token, {
        method: isEdit ? "PATCH" : "POST",
        body:   JSON.stringify(body),
      });
      onSaved(saved, !isEdit);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-8 px-4" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[#E4E6DE] bg-[#FFFFFF] p-6 shadow-2xl my-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-poppins text-base font-bold text-[#26372E]">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-[#737C72] hover:text-[#737C72] transition-colors">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5"><path d="m5 5 10 10M15 5 5 15"/></svg>
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Item Name *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} required placeholder="e.g. Masala Chai" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Category *</label>
              <input value={form.category} onChange={e => set("category", e.target.value)} required placeholder="e.g. Hot Drinks" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Price (₹) *</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => set("price", e.target.value)} required placeholder="0.00" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Description</label>
              <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="Short item description…" className={`${inputCls} resize-none`} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Image URL</label>
              <input value={form.image_url} onChange={e => set("image_url", e.target.value)} placeholder="https://…" className={inputCls} />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <button type="button"
                onClick={() => set("is_available", !form.is_available)}
                className={[
                  "relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 transition-colors duration-200",
                  form.is_available ? "bg-[#26372E] border-[#26372E]" : "bg-[#E4E6DE] border-[#D6D9D0]",
                ].join(" ")}
                role="switch" aria-checked={form.is_available}>
                <span className={[
                  "inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 mt-px",
                  form.is_available ? "translate-x-4" : "translate-x-px",
                ].join(" ")} />
              </button>
              <span className="font-sans text-sm text-[#737C72]">
                {form.is_available ? "Available" : "Unavailable"}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5 font-sans text-sm text-[#737C72] hover:text-[#737C72] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-[#34483D] px-4 py-2.5 font-poppins text-sm font-semibold text-[#FFFFFF] hover:bg-[#4A6358] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   DELETE CONFIRM
══════════════════════════════════════════════════════════════════════ */

function DeleteConfirm({ item, token, onDeleted, onClose }) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState(null);

  async function handleDelete() {
    setDeleting(true); setError(null);
    try {
      await adminFetch(`/admin/menu/${item.id}`, token, { method: "DELETE" });
      onDeleted(item.id);
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#E4E6DE] bg-[#FFFFFF] p-6 shadow-2xl">
        <h3 className="font-poppins text-base font-bold text-[#26372E] mb-2">Delete "{item.name}"?</h3>
        <p className="font-sans text-sm text-[#737C72] mb-2">
          This cannot be undone. Items referenced by existing orders cannot be deleted — mark them as unavailable instead.
        </p>
        {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600">{error}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 rounded-lg border border-[#E4E6DE] px-4 py-2.5 font-sans text-sm text-[#737C72] hover:text-[#737C72] transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 rounded-lg bg-red-800 px-4 py-2.5 font-poppins text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */

export default function AdminMenu() {
  const { token } = useAdminAuth();

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const [search,   setSearch]   = useState("");
  const [catFilter,setCatFilter] = useState("");
  const [availFilter, setAvailFilter] = useState(""); // ""|"available"|"unavailable"

  const [showAdd,    setShowAdd]    = useState(false);
  const [editItem,   setEditItem]   = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);

  const [togglingId, setTogglingId] = useState(null);  // id currently being toggled

  /* ── Fetch ─────────────────────────────────────────────────── */
  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await adminFetch("/admin/menu", token);
      setItems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* ── Derived data ───────────────────────────────────────────── */
  const categories = useMemo(() => {
    const cats = [...new Set(items.map(i => i.category))].sort();
    return cats;
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (catFilter)  list = list.filter(i => i.category === catFilter);
    if (availFilter === "available")   list = list.filter(i => i.is_available);
    if (availFilter === "unavailable") list = list.filter(i => !i.is_available);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    }
    return list;
  }, [items, catFilter, availFilter, search]);

  /* ── Toggle availability ────────────────────────────────────── */
  async function handleToggle(item) {
    setTogglingId(item.id);
    try {
      const updated = await adminFetch(`/admin/menu/${item.id}/availability`, token, {
        method: "PATCH",
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  }

  const availCount = items.filter(i => i.is_available).length;
  const unavailCount = items.length - availCount;

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Menu</h1>
          <p className="mt-0.5 font-sans text-xs text-[#737C72]">
            {loading ? "Loading…" : `${items.length} items · ${availCount} available · ${unavailCount} unavailable`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchItems} disabled={loading}
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
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#34483D] px-4 py-1.5
                       font-poppins text-xs font-semibold text-[#FFFFFF]
                       hover:bg-[#4A6358] transition-colors active:scale-[0.98]">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
              <path d="M8 3v10M3 8h10"/>
            </svg>
            Add Item
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchItems} />}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737C72]">
            <circle cx="6.5" cy="6.5" r="4.5"/><path d="M11 11l3 3"/>
          </svg>
          <input type="search" placeholder="Search items…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] pl-9 pr-4 py-2
                       font-sans text-sm text-[#26372E] placeholder:text-[#D6D9D0]
                       focus:outline-none focus:border-[#34483D] transition-colors" />
        </div>
        {/* Category */}
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] px-3 py-2
                     font-sans text-sm text-[#737C72] focus:outline-none focus:border-[#34483D] transition-colors">
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* Availability */}
        <select value={availFilter} onChange={e => setAvailFilter(e.target.value)}
          className="rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] px-3 py-2
                     font-sans text-sm text-[#737C72] focus:outline-none focus:border-[#34483D] transition-colors">
          <option value="">All availability</option>
          <option value="available">Available only</option>
          <option value="unavailable">Unavailable only</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] overflow-hidden">

        {/* Header row */}
        <div className="hidden lg:grid lg:grid-cols-[1fr_140px_120px_110px_180px] gap-4 px-5 py-3
                        border-b border-[#E4E6DE] bg-[#FFFFFF]">
          {["Item", "Category", "Price", "Status", "Actions"].map(h => (
            <p key={h} className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#737C72]">{h}</p>
          ))}
        </div>

        {/* Skeletons */}
        {loading && (
          <div className="divide-y divide-[#E4E6DE]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20 hidden lg:block" />
                <Skeleton className="h-4 w-16 hidden lg:block" />
                <Skeleton className="h-5 w-24 rounded-full hidden lg:block" />
                <Skeleton className="h-8 w-32 rounded-lg hidden lg:block" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="px-5 py-16 text-center">
            <p className="font-poppins font-semibold text-[#737C72]">No items found</p>
            <p className="mt-1 font-sans text-xs text-[#D6D9D0]">
              {search || catFilter || availFilter ? "Try clearing the filters." : "Add your first menu item."}
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-[#E4E6DE]">
            {filtered.map(item => (
              <div key={item.id}
                className="grid lg:grid-cols-[1fr_140px_120px_110px_180px] gap-3 px-5 py-4 items-center">

                {/* Name + description */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-poppins text-sm font-semibold text-[#26372E] truncate">{item.name}</p>
                    <span className="lg:hidden"><AvailBadge available={item.is_available} /></span>
                  </div>
                  {item.description && (
                    <p className="font-sans text-xs text-[#737C72] mt-0.5 truncate">{item.description}</p>
                  )}
                  {/* Mobile extras */}
                  <p className="font-sans text-xs text-[#737C72] mt-1 lg:hidden">
                    {item.category} · {fmt(item.price)}
                  </p>
                </div>

                {/* Category */}
                <p className="hidden lg:block font-sans text-sm text-[#737C72] truncate">{item.category}</p>

                {/* Price */}
                <p className="hidden lg:block font-poppins text-sm font-semibold text-[#34483D]">{fmt(item.price)}</p>

                {/* Status */}
                <div className="hidden lg:flex">
                  <AvailBadge available={item.is_available} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(item)}
                    disabled={togglingId === item.id}
                    className={[
                      "rounded-lg border px-3 py-1.5 font-sans text-xs font-semibold transition-colors",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      item.is_available
                        ? "border-[#D6D9D0] text-[#737C72] hover:border-red-200/50 hover:text-red-600"
                        : "border-emerald-800/50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
                    ].join(" ")}>
                    {togglingId === item.id ? "…" : item.is_available ? "Disable" : "Enable"}
                  </button>
                  {/* Edit */}
                  <button onClick={() => setEditItem(item)}
                    className="rounded-lg border border-[#E4E6DE] px-3 py-1.5 font-sans text-xs
                               text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0] transition-colors">
                    Edit
                  </button>
                  {/* Delete */}
                  <button onClick={() => setDeleteItem(item)}
                    className="rounded-lg border border-[#E4E6DE] px-3 py-1.5 font-sans text-xs
                               text-[#737C72] hover:text-red-600 hover:border-red-200/50 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <ItemFormModal title="Add Menu Item" token={token}
          onSaved={(saved) => { setItems(prev => [saved, ...prev]); setShowAdd(false); }}
          onClose={() => setShowAdd(false)} />
      )}
      {editItem && (
        <ItemFormModal title={`Edit: ${editItem.name}`} initial={editItem} token={token}
          onSaved={(saved) => { setItems(prev => prev.map(i => i.id === saved.id ? saved : i)); setEditItem(null); }}
          onClose={() => setEditItem(null)} />
      )}
      {deleteItem && (
        <DeleteConfirm item={deleteItem} token={token}
          onDeleted={id => { setItems(prev => prev.filter(i => i.id !== id)); setDeleteItem(null); }}
          onClose={() => setDeleteItem(null)} />
      )}
    </div>
  );
}
