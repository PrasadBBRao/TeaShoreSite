/**
 * AdminOrders.jsx — Admin orders management page.
 *
 * APIs used (all existing):
 *   GET  /api/admin/orders?status=&limit=&offset=&date_from=&date_to=
 *   GET  /api/admin/orders/{id}
 *   PATCH /api/admin/orders/{id}/status  { new_status }
 *
 * Date filter: Today / Yesterday / Select Date — passed as UTC ISO bounds
 * to the backend so pagination stays correct across all pages.
 *
 * Existing filters preserved:
 *   Status chips: All / Placed / Preparing / On the Way / Delivered / Cancelled
 *   Type dropdown: All types / Dine In / Takeaway / Delivery
 *   Order-number search (client-side on loaded page)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdminAuth } from "../context/AdminAuthContext";

/* ══════════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
══════════════════════════════════════════════════════════════════════ */

const PAGE_SIZE = 50;

const STATUS_CFG = {
  placed:    { label: "Placed",      color: "text-amber-700",   bg: "bg-amber-950/40   border-amber-800/40"   },
  preparing: { label: "Preparing",   color: "text-orange-700",  bg: "bg-orange-950/40  border-orange-800/40"  },
  active:    { label: "On the Way",  color: "text-blue-700",    bg: "bg-blue-950/40    border-blue-800/40"    },
  delivered: { label: "Delivered",   color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  cancelled: { label: "Cancelled",   color: "text-red-600",     bg: "bg-red-50     border-red-300/40"     },
};

const TYPE_LABELS = { dine_in: "Dine In", takeaway: "Takeaway", home_delivery: "Delivery" };
const TYPE_ICONS  = { dine_in: "🍽", takeaway: "🛍", home_delivery: "🚴" };

const NEXT_STATUSES = {
  placed:    ["preparing", "cancelled"],
  preparing: ["active",    "cancelled"],
  active:    ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function fmt(v)     { const n = parseFloat(v) || 0; return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`; }
function fmtDate(iso){ if (!iso) return "—"; return new Date(iso).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }); }
function fmtDT(iso)  { if (!iso) return "—"; return new Date(iso).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"numeric", minute:"2-digit", hour12:true }); }

/**
 * Return { date_from, date_to } as UTC ISO strings for the day boundaries
 * corresponding to a local calendar date offset from today.
 *   offset 0  → today
 *   offset -1 → yesterday
 * Returns null when no filter should be applied.
 */
function localDayBounds(offsetDays = 0) {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const next  = new Date(local); next.setDate(next.getDate() + 1);
  return {
    date_from: local.toISOString(),
    date_to:   next.toISOString(),
  };
}

/**
 * Same as localDayBounds but from a YYYY-MM-DD string.
 */
function pickedDayBounds(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y, m - 1, d);
  const next  = new Date(local); next.setDate(next.getDate() + 1);
  return {
    date_from: local.toISOString(),
    date_to:   next.toISOString(),
  };
}

/** Build date_from / date_to from current filter state. Returns {} when none active. */
function buildDateParams(dateMode, pickedDate) {
  if (dateMode === "today")     return localDayBounds(0);
  if (dateMode === "yesterday") return localDayBounds(-1);
  if (dateMode === "pick" && pickedDate) return pickedDayBounds(pickedDate) ?? {};
  return {};
}

/** Today's date as YYYY-MM-DD for the max attribute on the date input. */
function todayYMD() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

async function adminFetch(path, token, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

/* ══════════════════════════════════════════════════════════════════════
   SMALL REUSABLE COMPONENTS
══════════════════════════════════════════════════════════════════════ */

function StatusPill({ status }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "text-[#737C72]", bg: "bg-[#E4E6DE] border-[#D6D9D0]" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }) {
  return (
    <span className="inline-flex items-center gap-1 font-sans text-xs text-[#737C72]">
      <span aria-hidden="true">{TYPE_ICONS[type] ?? "📦"}</span>
      {TYPE_LABELS[type] ?? type}
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

/* ══════════════════════════════════════════════════════════════════════
   DATE CHIP  — single compact calendar button rendered inside the
   status-chips row.  No separate row.
══════════════════════════════════════════════════════════════════════ */

/**
 * Renders as a single chip alongside the status filter chips.
 * - No date active  → shows calendar icon + "Select Date"
 * - Date active     → shows the chosen date + × to clear, plus a small
 *                     "Change" link to re-open the picker
 *
 * Picker is opened programmatically via showPicker() on a hidden
 * uncontrolled <input type="date"> — reliable across all modern browsers.
 */
function DateChip({ dateMode, pickedDate, onModeChange, onPickedDateChange }) {
  const inputRef = useRef(null);

  function openPicker() {
    if (!inputRef.current) return;
    try { inputRef.current.showPicker(); }
    catch { inputRef.current.click(); }
  }

  function handleChipClick() {
    if (dateMode === "pick") {
      onModeChange("");          // clear
    } else {
      openPicker();              // open calendar
    }
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
      {/* Main chip */}
      <button
        onClick={handleChipClick}
        className={`${chipBase} ${isActive ? chipActive : chipIdle}`}
        aria-label={isActive ? `Date: ${dateLabel}. Click to clear` : "Filter by date"}
      >
        {/* Calendar icon */}
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round"
          className="w-3 h-3 shrink-0" aria-hidden="true">
          <rect x="1" y="2" width="12" height="11" rx="1.5"/>
          <path d="M1 5.5h12M4.5 1v2.5M9.5 1v2.5"/>
        </svg>
        {isActive ? dateLabel : "Select Date"}
        {isActive && <span className="text-[#4A6358]/70 leading-none" aria-hidden="true">×</span>}
      </button>

      {/* Change link — only when a date is active */}
      {isActive && (
        <button
          onClick={openPicker}
          className="font-sans text-[10px] text-[#737C72] hover:text-[#737C72] transition-colors underline underline-offset-2"
          aria-label="Change date"
        >
          change
        </button>
      )}

      {/* Hidden uncontrolled input — programmatically opened */}
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
   ORDER DETAIL PANEL (slide-in from right)
══════════════════════════════════════════════════════════════════════ */

function OrderDetail({ orderId, token, onClose, onStatusUpdated, onPaymentConfirmed }) {
  const [order,        setOrder]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [updating,     setUpdating]     = useState(false);
  const [updateError,  setUpdateError]  = useState(null);
  const [selectedStatus, setSelectedStatus] = useState("");

  // Payment confirmation state
  const [confirmingPayment, setConfirmingPayment] = useState(false);  // "cash" | "upi" | false
  const [paymentError,      setPaymentError]       = useState(null);
  const [paymentSuccess,    setPaymentSuccess]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await adminFetch(`/admin/orders/${orderId}`, token);
      setOrder(data); setSelectedStatus(data.status);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [orderId, token]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusUpdate() {
    if (!selectedStatus || selectedStatus === order?.status) return;
    setUpdating(true); setUpdateError(null);
    try {
      const updated = await adminFetch(`/admin/orders/${orderId}/status`, token, {
        method: "PATCH", body: JSON.stringify({ new_status: selectedStatus }),
      });
      setOrder(updated); setSelectedStatus(updated.status); onStatusUpdated(updated);
    } catch (err) { setUpdateError(err.message); }
    finally { setUpdating(false); }
  }

  const nextStatuses = order ? NEXT_STATUSES[order.status] ?? [] : [];
  const canUpdate = selectedStatus && selectedStatus !== order?.status;

  async function handleConfirmPayment(method) {
    setConfirmingPayment(method);
    setPaymentError(null);
    setPaymentSuccess(null);
    try {
      const updated = await adminFetch(`/admin/orders/${orderId}/payment`, token, {
        method: "PATCH",
        body: JSON.stringify({ payment_method: method }),
      });
      setOrder(updated);
      setPaymentSuccess(method === "cash" ? "Cash payment confirmed." : "UPI payment confirmed.");
      onPaymentConfirmed(updated);
    } catch (err) {
      setPaymentError(err.message || "Payment confirmation failed.");
    } finally {
      setConfirmingPayment(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog" aria-label="Order detail">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col bg-[#FFFFFF] border-l border-[#E4E6DE] shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between gap-3 border-b border-[#E4E6DE] px-5 py-4">
          <div>
            <p className="font-poppins text-base font-bold text-[#26372E]">
              {loading ? "Loading…" : order?.order_number ?? "Order"}
            </p>
            {!loading && order && (
              <p className="font-sans text-xs text-[#737C72] mt-0.5">{fmtDT(order.created_at)}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#737C72] hover:bg-[#E4E6DE] hover:text-[#737C72] transition-colors">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {loading && (
            <div className="space-y-3">
              {[100,80,120,60,90].map((w,i) => <Skeleton key={i} className={`h-5 w-${w}`} />)}
            </div>
          )}
          {!loading && error && <ErrorBanner message={error} onRetry={load} />}
          {!loading && order && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={order.status} />
                <TypeBadge type={order.order_type} />
                {order.daily_token_number && (
                  <span className="font-sans text-xs text-[#737C72]">Token #{order.daily_token_number}</span>
                )}
              </div>

              <Section title="Customer">
                <InfoRow label="User ID"    value={order.user_id    ? `…${String(order.user_id).slice(-12)}`    : "Guest"} />
                <InfoRow label="Session ID" value={order.session_id ? `…${String(order.session_id).slice(-12)}` : "—"} />
              </Section>

              {order.order_type === "home_delivery" && (
                <Section title="Delivery">
                  <InfoRow label="Address"  value={order.delivery_address ?? "—"} />
                  <InfoRow label="Distance" value={order.delivery_distance_km ? `${order.delivery_distance_km} km` : "—"} />
                  <InfoRow label="Charge"   value={order.delivery_charge  ? fmt(order.delivery_charge)  : "—"} />
                </Section>
              )}

              <Section title="Items">
                {(order.items ?? []).length === 0 ? (
                  <p className="font-sans text-xs text-[#737C72]">No item details available.</p>
                ) : (
                  <div className="space-y-2">
                    {order.items.map(item => (
                      <div key={item.id} className="flex items-baseline justify-between gap-3">
                        <span className="font-poppins text-sm font-semibold text-[#26372E] flex-1 min-w-0">
                          {item.menu_item_name}
                          <span className="font-sans font-normal text-[#737C72] ml-1.5">× {item.quantity}</span>
                        </span>
                        <span className="font-sans text-sm text-[#34483D] shrink-0">{fmt(item.line_total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Payment">
                {order.items_total != null && <InfoRow label="Items total"     value={fmt(order.items_total)} />}
                {order.delivery_charge != null && parseFloat(order.delivery_charge) > 0 && (
                  <InfoRow label="Delivery charge" value={fmt(order.delivery_charge)} />
                )}
                <div className="mt-2 flex justify-between border-t border-[#E4E6DE] pt-2">
                  <span className="font-poppins text-sm font-bold text-[#26372E]">Total</span>
                  <span className="font-poppins text-sm font-bold text-[#4A6358]">{fmt(order.total_price)}</span>
                </div>
                <InfoRow label="Status" value={
                  order.payment_status === "unpaid"    ? "Unpaid"
                  : order.payment_status === "paid"    ? "Paid"
                  : order.payment_status === "fake_paid" ? "Legacy (unverified)"
                  : order.payment_status ?? "—"
                } />
                {order.payment_method && (
                  <InfoRow label="Method" value={
                    order.payment_method === "cash" ? "Cash" :
                    order.payment_method === "upi"  ? "UPI"  :
                    order.payment_method
                  } />
                )}
              </Section>

              {/* Confirm Payment — only for unpaid orders */}
              {paymentSuccess && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-xs text-emerald-700"
                   role="status">
                  {paymentSuccess}
                </p>
              )}
              {order.payment_status === "unpaid" && (
                <Section title="Confirm Payment">
                  <p className="font-sans text-xs text-[#737C72] mb-3">
                    Confirm only after receiving cash or verifying UPI. This cannot be undone.
                  </p>
                  {paymentError && (
                    <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600"
                       role="alert">
                      {paymentError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirmPayment("cash")}
                      disabled={!!confirmingPayment}
                      aria-label="Confirm cash payment"
                      className="flex-1 rounded-lg border border-[#34483D] bg-[#34483D] px-3 py-2
                                 font-poppins text-sm font-semibold text-[#FFFFFF]
                                 hover:bg-[#4A6358] active:scale-[0.98] transition-all
                                 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {confirmingPayment === "cash" ? "Confirming…" : "Cash"}
                    </button>
                    <button
                      onClick={() => handleConfirmPayment("upi")}
                      disabled={!!confirmingPayment}
                      aria-label="Confirm UPI payment"
                      className="flex-1 rounded-lg border border-[#34483D] px-3 py-2
                                 font-poppins text-sm font-semibold text-[#34483D]
                                 hover:bg-[#E8EDE5] active:scale-[0.98] transition-all
                                 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {confirmingPayment === "upi" ? "Confirming…" : "UPI"}
                    </button>
                  </div>
                </Section>
              )}

              {nextStatuses.length > 0 && (
                <Section title="Update Status">
                  {updateError && (
                    <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-600">
                      {updateError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                      className="flex-1 rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] px-3 py-2
                                 font-sans text-sm text-[#26372E] focus:outline-none focus:border-[#34483D] transition-colors">
                      <option value={order.status}>{STATUS_CFG[order.status]?.label ?? order.status} (current)</option>
                      {nextStatuses.map(s => (
                        <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>
                      ))}
                    </select>
                    <button onClick={handleStatusUpdate} disabled={!canUpdate || updating}
                      className="rounded-lg bg-[#34483D] px-4 py-2 font-poppins text-sm font-semibold
                                 text-[#FFFFFF] transition-all hover:bg-[#4A6358] active:scale-[0.98]
                                 disabled:opacity-40 disabled:cursor-not-allowed">
                      {updating ? "Saving…" : "Update"}
                    </button>
                  </div>
                </Section>
              )}

              {(order.status === "delivered" || order.status === "cancelled") && (
                <p className="rounded-lg border border-[#E4E6DE] px-4 py-3 font-sans text-xs text-[#737C72] text-center">
                  This order is {order.status} — no further status changes allowed.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737C72]">{title}</p>
      <div className="rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="font-sans text-xs text-[#737C72] shrink-0">{label}</span>
      <span className="font-sans text-xs text-[#737C72] text-right break-all">{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */

export default function AdminOrders() {
  const { token } = useAdminAuth();

  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [page,      setPage]      = useState(0);
  const [hasMore,   setHasMore]   = useState(false);

  // Existing filters
  const [statusFilter,  setStatusFilter]  = useState("");
  const [typeFilter,    setTypeFilter]    = useState("");
  const [search,        setSearch]        = useState("");
  const [paymentFilter, setPaymentFilter] = useState(""); // "" | "unpaid" | "paid" | "fake_paid"

  // Date filter
  const [dateMode,   setDateMode]   = useState("");          // "" | "today" | "yesterday" | "pick"
  const [pickedDate, setPickedDate] = useState("");          // "YYYY-MM-DD"

  const [detailId, setDetailId] = useState(null);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  /* ── Fetch ──────────────────────────────────────────────────────── */
  const fetchPage = useCallback(async (pageIndex, replace = true) => {
    if (!token) return;
    if (replace) setLoading(true);
    setError(null);

    const offset = pageIndex * PAGE_SIZE;
    const dateBounds = buildDateParams(dateMode, pickedDate);

    let url = `/admin/orders?limit=${PAGE_SIZE}&offset=${offset}`;
    if (statusFilter)            url += `&status=${statusFilter}`;
    if (dateBounds.date_from)    url += `&date_from=${encodeURIComponent(dateBounds.date_from)}`;
    if (dateBounds.date_to)      url += `&date_to=${encodeURIComponent(dateBounds.date_to)}`;

    try {
      const data = await adminFetch(url, token);
      setOrders(prev => replace ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setPage(pageIndex);
    } catch (err) {
      setError(err.message || "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, dateMode, pickedDate]);

  // Re-fetch on any server-side filter change
  useEffect(() => { fetchPage(0, true); }, [fetchPage]);

  /* ── Client-side search + type + payment filter on loaded data ───── */
  const filtered = useMemo(() => {
    let list = orders;
    if (typeFilter) list = list.filter(o => o.order_type === typeFilter);
    if (paymentFilter) list = list.filter(o => o.payment_status === paymentFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o =>
        o.order_number.toLowerCase().includes(q) ||
        String(o.daily_token_number ?? "").includes(q)
      );
    }
    return list;
  }, [orders, typeFilter, paymentFilter, search]);

  function handleStatusUpdated(updatedOrder) {
    setOrders(prev =>
      prev.map(o => o.id === updatedOrder.id ? { ...o, status: updatedOrder.status } : o)
    );
  }

  function handlePaymentConfirmed(updatedOrder) {
    setOrders(prev =>
      prev.map(o => o.id === updatedOrder.id
        ? { ...o, payment_status: updatedOrder.payment_status, payment_method: updatedOrder.payment_method }
        : o
      )
    );
  }

  /* ── Payment counts on loaded page ──────────────────────────────── */
  const paymentCounts = useMemo(() => {
    const c = {};
    for (const o of orders) { c[o.payment_status] = (c[o.payment_status] ?? 0) + 1; }
    return c;
  }, [orders]);

  const PAYMENT_FILTERS = [
    { value: "",          label: "All Payments", count: orders.length               },
    { value: "unpaid",    label: "Unpaid",        count: paymentCounts.unpaid    ?? 0 },
    { value: "paid",      label: "Paid",          count: paymentCounts.paid      ?? 0 },
    { value: "fake_paid", label: "Legacy",        count: paymentCounts.fake_paid ?? 0 },
  ];

  /* ── Status counts on loaded page ───────────────────────────────── */
  const counts = useMemo(() => {
    const c = {};
    for (const o of orders) { c[o.status] = (c[o.status] ?? 0) + 1; }
    return c;
  }, [orders]);

  const STATUS_FILTERS = [
    { value: "",          label: "All",        count: orders.length        },
    { value: "placed",    label: "Placed",     count: counts.placed    ?? 0 },
    { value: "preparing", label: "Preparing",  count: counts.preparing ?? 0 },
    { value: "active",    label: "On the Way", count: counts.active    ?? 0 },
    { value: "delivered", label: "Delivered",  count: counts.delivered ?? 0 },
    { value: "cancelled", label: "Cancelled",  count: counts.cancelled ?? 0 },
  ];

  const TYPE_FILTERS = [
    { value: "",              label: "All types" },
    { value: "dine_in",       label: "Dine In"   },
    { value: "takeaway",      label: "Takeaway"  },
    { value: "home_delivery", label: "Delivery"  },
  ];

  /* ── Date mode helpers ───────────────────────────────────────────── */
  function handleDateModeChange(mode) {
    setDateMode(mode);
    setPage(0);
  }
  function handlePickedDateChange(ymd) {
    setPickedDate(ymd);
    setPage(0);
  }

  /* ── Active date label for subtitle ─────────────────────────────── */
  const activeDateLabel = useMemo(() => {
    if (dateMode === "today")     return "Today";
    if (dateMode === "yesterday") return "Yesterday";
    if (dateMode === "pick" && pickedDate)
      return new Date(pickedDate + "T00:00:00").toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
    return null;
  }, [dateMode, pickedDate]);

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-7xl mx-auto">

      {/* Page header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Orders</h1>
          <p className="mt-0.5 font-sans text-xs text-[#737C72]">
            {loading
              ? "Loading…"
              : `${filtered.length} order${filtered.length !== 1 ? "s" : ""} shown${activeDateLabel ? ` · ${activeDateLabel}` : ""}`}
          </p>
        </div>
        <button
          onClick={() => fetchPage(0, true)}
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

      {error && <ErrorBanner message={error} onRetry={() => fetchPage(0, true)} />}

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="mb-4 space-y-3">

        {/* Row 1: Status chips + date chip in the same flex-wrap row */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(0); }}
              className={[
                "flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs font-semibold transition-all",
                statusFilter === f.value
                  ? "border-[#34483D] bg-[#E8EDE5 text-[#4A6358]"
                  : "border-[#E4E6DE] text-[#737C72] hover:border-[#D6D9D0] hover:text-[#737C72]",
              ].join(" ")}
            >
              {f.label}
              {f.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold
                  ${statusFilter === f.value ? "bg-[#34483D]/20 text-[#4A6358]" : "bg-[#E4E6DE] text-[#737C72]"}`}>
                  {f.count}
                </span>
              )}
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

        {/* Row 2: Payment filter chips */}
        <div className="flex flex-wrap gap-2">
          {PAYMENT_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setPaymentFilter(f.value)}
              aria-pressed={paymentFilter === f.value}
              className={[
                "flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs font-semibold transition-all",
                paymentFilter === f.value
                  ? "border-[#34483D] bg-[#E8EDE5] text-[#4A6358]"
                  : "border-[#E4E6DE] text-[#737C72] hover:border-[#D6D9D0] hover:text-[#737C72]",
              ].join(" ")}
            >
              {f.label}
              {f.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold
                  ${paymentFilter === f.value ? "bg-[#34483D]/20 text-[#4A6358]" : "bg-[#E4E6DE] text-[#737C72]"}`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Row 3: Search + type filter */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737C72]" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="4.5"/><path d="M11 11l3 3"/>
            </svg>
            <input
              type="search"
              placeholder="Search order number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] pl-9 pr-4 py-2
                         font-sans text-sm text-[#26372E] placeholder:text-[#D6D9D0]
                         focus:outline-none focus:border-[#34483D] transition-colors"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="rounded-lg border border-[#E4E6DE] bg-[#FFFFFF] px-3 py-2
                       font-sans text-sm text-[#737C72] focus:outline-none focus:border-[#34483D] transition-colors"
          >
            {TYPE_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Orders table ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] overflow-hidden">

        <div className="hidden sm:grid grid-cols-[1fr_120px_110px_100px_90px] gap-4 px-5 py-3
                        border-b border-[#E4E6DE] bg-[#FFFFFF]">
          {["Order", "Type", "Status", "Total", "Date"].map(h => (
            <p key={h} className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#737C72]">{h}</p>
          ))}
        </div>

        {loading && (
          <div className="divide-y divide-[#E4E6DE]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid sm:grid-cols-[1fr_120px_110px_100px_90px] gap-4 px-5 py-4">
                <div className="space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
                <Skeleton className="hidden sm:block h-4 w-20" />
                <Skeleton className="hidden sm:block h-5 w-24 rounded-full" />
                <Skeleton className="hidden sm:block h-4 w-16" />
                <Skeleton className="hidden sm:block h-4 w-20" />
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="px-5 py-16 text-center">
            <p className="font-poppins font-semibold text-[#737C72]">No orders found</p>
            <p className="mt-1 font-sans text-xs text-[#D6D9D0]">
              {search || statusFilter || typeFilter || paymentFilter || dateMode
                ? "Try clearing some filters."
                : "No orders have been placed yet."}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-[#E4E6DE]">
            {filtered.map(order => (
              <button
                key={order.id}
                onClick={() => setDetailId(order.id)}
                className="w-full text-left grid sm:grid-cols-[1fr_120px_110px_100px_90px] gap-4
                           px-5 py-4 hover:bg-[#FFFFFF] transition-colors duration-100 group"
              >
                <div className="min-w-0">
                  <p className="font-poppins text-sm font-semibold text-[#26372E] group-hover:text-[#4A6358] transition-colors truncate">
                    {order.order_number}
                  </p>
                  {order.daily_token_number && (
                    <p className="font-sans text-xs text-[#737C72] mt-0.5">Token #{order.daily_token_number}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 sm:hidden">
                    <TypeBadge type={order.order_type} />
                    <StatusPill status={order.status} />
                    <span className="font-sans text-xs text-[#34483D]">{fmt(order.total_price)}</span>
                  </div>
                </div>
                <div className="hidden sm:flex items-center"><TypeBadge type={order.order_type} /></div>
                <div className="hidden sm:flex items-center"><StatusPill status={order.status} /></div>
                <div className="hidden sm:flex items-center">
                  <span className="font-sans text-sm font-semibold text-[#34483D]">{fmt(order.total_price)}</span>
                </div>
                <div className="hidden sm:flex items-center">
                  <span className="font-sans text-xs text-[#737C72]">{fmtDate(order.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-[#E4E6DE] px-5 py-3">
            <p className="font-sans text-xs text-[#D6D9D0]">
              Page {page + 1} · {orders.length} loaded
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page === 0 || loading}
                className="rounded-lg border border-[#E4E6DE] px-4 py-1.5 font-sans text-xs
                           text-[#737C72] hover:text-[#737C72] hover:border-[#D6D9D0]
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >← Prev</button>
              <button
                onClick={() => fetchPage(page + 1)}
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
      {detailId && (
        <OrderDetail
          orderId={detailId}
          token={token}
          onClose={() => setDetailId(null)}
          onStatusUpdated={handleStatusUpdated}
          onPaymentConfirmed={handlePaymentConfirmed}
        />
      )}
    </div>
  );
}
