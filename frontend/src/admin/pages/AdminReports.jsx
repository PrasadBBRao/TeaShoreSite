/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";
import { useAdminAuth } from "../context/AdminAuthContext";

const ARCHIVE_PAGE_SIZE = 200;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER_STATUS_LABELS = {
  placed: "Placed",
  preparing: "Preparing",
  active: "Active",
  delivered: "Delivered",
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function adminFetch(path, token, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.detail || `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function dateParts(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month: month - 1, day };
}

function monthName(year, month) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));
}

function formatLongDate(isoDate) {
  if (!isoDate) return "—";
  const { year, month, day } = dateParts(isoDate);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, day, 12)));
}

function formatTimestamp(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatOrderValue(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function summaryFromReport(report) {
  const orders = report.report_data.orders;
  const reservations = report.report_data.reservations;
  return {
    business_date: report.business_date,
    business_timezone: report.business_timezone,
    generated_at: report.generated_at,
    order_count: orders.total_count,
    order_status_counts: orders.status_counts,
    order_value_all_orders: orders.order_value_all_orders,
    revenue_total: orders.revenue_total,
    revenue_available: orders.revenue_available,
    reservation_count: reservations.scheduled_count,
  };
}

function IconButton({ label, onClick, disabled, children, className = "" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#D6D9D0]
        text-[#737C72] transition-colors hover:border-[#4A6358] hover:text-[#4A6358]
        disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function PanelHeading({ icon: Icon, title, detail }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
        border border-[#D6D9D0] bg-[#F0F4F0] text-[#34483D]">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-poppins text-sm font-semibold text-[#26372E]">{title}</h2>
        {detail && <p className="mt-1 font-sans text-xs leading-5 text-[#8A9488]">{detail}</p>}
      </div>
    </div>
  );
}

function StateMessage({ icon: Icon = FileText, title, detail, action }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full
        border border-[#D6D9D0] bg-[#F0F4F0] text-[#737C72]">
        <Icon size={19} aria-hidden="true" />
      </span>
      <h3 className="font-poppins text-sm font-semibold text-[#26372E]">{title}</h3>
      {detail && <p className="mt-1 max-w-sm font-sans text-xs leading-5 text-[#8A9488]">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function CountList({ title, values, labels = {} }) {
  const entries = Object.entries(values || {});
  return (
    <section>
      <h3 className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A9488]">
        {title}
      </h3>
      {entries.length ? (
        <div className="flex flex-wrap gap-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 rounded-md border border-[#D6D9D0]
              bg-[#FFFFFF] px-2.5 py-1.5">
              <span className="font-sans text-xs text-[#737C72]">{labels[key] || key.replaceAll("_", " ")}</span>
              <span className="font-poppins text-xs font-semibold tabular-nums text-[#26372E]">
                {formatCount(value)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-sans text-xs text-[#8A9488]">No counts recorded.</p>
      )}
    </section>
  );
}

function RankedList({ rows, idField, nameField, valueField, emptyLabel }) {
  if (!rows?.length) {
    return <p className="py-3 font-sans text-xs text-[#8A9488]">{emptyLabel}</p>;
  }
  return (
    <ol className="divide-y divide-[#E4E6DE]">
      {rows.map((row, index) => (
        <li key={row[idField]} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md
            border border-[#D6D9D0] bg-[#F0F4F0] font-poppins text-[11px] font-semibold text-[#4A6358]">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1 truncate font-sans text-sm text-[#26372E]">
            {row[nameField] || "Unnamed item"}
          </span>
          <span className="shrink-0 font-poppins text-sm font-semibold tabular-nums text-[#4A6358]">
            {formatCount(row[valueField])}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function AdminReports() {
  const { admin, token, loading: authLoading } = useAdminAuth();
  const isHeadAdmin = admin?.role === "head_admin";
  const [archive, setArchive] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState(null);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [archiveVersion, setArchiveVersion] = useState(0);
  const [archiveOffset, setArchiveOffset] = useState(0);
  const [hasOlderReports, setHasOlderReports] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [selectedDate, setSelectedDate] = useState(utcToday);
  const [checkedDates, setCheckedDates] = useState(() => new Set());
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMissing, setReportMissing] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);
  const [finalizeMessage, setFinalizeMessage] = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadSecret, setDownloadSecret] = useState("");
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const didInitialSelection = useRef(false);

  const refreshArchive = useCallback(async () => {
    if (!token || !isHeadAdmin) return [];
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const rows = await adminFetch(
        `/admin/reports/daily?limit=${ARCHIVE_PAGE_SIZE}&offset=0`,
        token,
      );
      setArchive(rows);
      setArchiveOffset(rows.length);
      setHasOlderReports(rows.length === ARCHIVE_PAGE_SIZE);
      setArchiveLoaded(true);
      setArchiveVersion(version => version + 1);
      return rows;
    } catch (error) {
      setArchiveError(error.message || "Could not load the report archive.");
      throw error;
    } finally {
      setArchiveLoading(false);
    }
  }, [token, isHeadAdmin]);

  useEffect(() => {
    if (!authLoading && isHeadAdmin) refreshArchive().catch(() => {});
  }, [authLoading, isHeadAdmin, refreshArchive]);

  useEffect(() => {
    if (!archiveLoaded || didInitialSelection.current) return;
    didInitialSelection.current = true;
    if (archive.length) {
      const latestDate = archive[0].business_date;
      setSelectedDate(latestDate);
      const parts = dateParts(latestDate);
      setViewMonth({ year: parts.year, month: parts.month });
    }
  }, [archiveLoaded, archive]);

  const selectedSummary = useMemo(
    () => archive.find(item => item.business_date === selectedDate) || null,
    [archive, selectedDate],
  );

  useEffect(() => {
    if (!token || !isHeadAdmin || !selectedDate) {
      setReport(null);
      setReportMissing(false);
      setReportError(null);
      setReportLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setReport(null);
    setReportMissing(false);
    setReportError(null);
    setReportLoading(true);
    adminFetch(`/admin/reports/daily/${selectedDate}`, token, { signal: controller.signal })
      .then(data => {
        setReport(data);
        setCheckedDates(current => new Set(current).add(data.business_date));
        setArchive(current => {
          const next = current.filter(item => item.business_date !== data.business_date);
          return [summaryFromReport(data), ...next].sort((a, b) =>
            b.business_date.localeCompare(a.business_date));
        });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error.status === 404) {
          setReportMissing(true);
          setCheckedDates(current => new Set(current).add(selectedDate));
          setArchive(current => current.filter(item => item.business_date !== selectedDate));
          return;
        }
        setReportError(error.message || "Could not open this saved report.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setReportLoading(false);
      });

    return () => controller.abort();
  }, [token, isHeadAdmin, selectedDate, archiveVersion]);

  const savedDates = useMemo(
    () => new Map(archive.map(item => [item.business_date, item])),
    [archive],
  );
  const oldestLoadedDate = archive.at(-1)?.business_date;

  const monthDays = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(viewMonth.year, viewMonth.month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewMonth.year, viewMonth.month + 1, 0)).getUTCDate();
    return [
      ...Array(firstWeekday).fill(null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [viewMonth]);

  const completedDate = selectedDate < utcToday();

  function selectDate(isoDate) {
    setSelectedDate(isoDate);
    const parts = dateParts(isoDate);
    setViewMonth({ year: parts.year, month: parts.month });
    setConfirmFinalize(false);
    setFinalizeError(null);
    setFinalizeMessage(null);
  }

  function moveMonth(delta) {
    const next = new Date(Date.UTC(viewMonth.year, viewMonth.month + delta, 1));
    setViewMonth({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  }

  async function loadOlderReports() {
    if (!token || loadingOlder) return;
    setLoadingOlder(true);
    setArchiveError(null);
    try {
      const rows = await adminFetch(
        `/admin/reports/daily?limit=${ARCHIVE_PAGE_SIZE}&offset=${archiveOffset}`,
        token,
      );
      setArchive(current => {
        const byDate = new Map(current.map(item => [item.business_date, item]));
        rows.forEach(item => byDate.set(item.business_date, item));
        return [...byDate.values()].sort((a, b) => b.business_date.localeCompare(a.business_date));
      });
      setArchiveOffset(offset => offset + rows.length);
      setHasOlderReports(rows.length === ARCHIVE_PAGE_SIZE);
      setArchiveVersion(version => version + 1);
    } catch (error) {
      setArchiveError(error.message || "Could not load older reports.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function finalizeSelectedDate() {
    if (!completedDate || selectedSummary || finalizing || !token || !isHeadAdmin) return;
    if (!confirmFinalize) {
      setConfirmFinalize(true);
      setFinalizeError(null);
      setFinalizeMessage(null);
      return;
    }

    setFinalizing(true);
    setFinalizeError(null);
    setFinalizeMessage(null);
    try {
      const created = await adminFetch(
        `/admin/reports/daily/${selectedDate}/finalize`,
        token,
        { method: "POST" },
      );
      setReport(created);
      setReportMissing(false);
      setArchive(current => {
        const next = current.filter(item => item.business_date !== created.business_date);
        return [summaryFromReport(created), ...next].sort((a, b) =>
          b.business_date.localeCompare(a.business_date));
      });
      setConfirmFinalize(false);
      setFinalizeMessage("Report finalized and saved to the archive.");
      await refreshArchive();
    } catch (error) {
      setFinalizeError(error.message || "Could not finalize this report.");
      if (error.status === 409) {
        refreshArchive().catch(() => {});
      }
    } finally {
      setFinalizing(false);
    }
  }

  function closeDownloadPrompt() {
    if (downloadLoading) return;
    setDownloadOpen(false);
    setDownloadSecret("");
    setDownloadError(null);
  }

  async function downloadSelectedReport(event) {
    event.preventDefault();
    if (!report || !token || !isHeadAdmin || !downloadSecret || downloadLoading) return;

    const secret = downloadSecret;
    setDownloadSecret("");
    setDownloadLoading(true);
    setDownloadError(null);
    try {
      const response = await fetch(`/api/admin/reports/daily/${report.business_date}/download`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(body?.detail || `Download failed (${response.status})`, response.status);
      }

      const blob = await response.blob();
      if (blob.type !== "application/pdf") {
        throw new Error("The server did not return a PDF file.");
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `daily-report-${report.business_date}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      setDownloadOpen(false);
    } catch (error) {
      setDownloadError(error.message || "Could not download this report.");
    } finally {
      setDownloadSecret("");
      setDownloadLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl animate-pulse space-y-5" aria-label="Loading reports access">
        <div className="h-8 w-56 rounded bg-[#E4E6DE]" />
        <div className="grid gap-5 lg:grid-cols-[350px_minmax(0,1fr)]">
          <div className="h-[520px] rounded-xl border border-[#E4E6DE] bg-[#FFFFFF]" />
          <div className="h-[520px] rounded-xl border border-[#E4E6DE] bg-[#FFFFFF]" />
        </div>
      </div>
    );
  }

  if (!isHeadAdmin) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Historical Reports</h1>
          <p className="mt-1 font-sans text-sm text-[#8A9488]">Daily operational snapshots</p>
        </div>
        <section className="rounded-xl border border-[#D6D9D0] bg-[#FFFFFF]">
          <StateMessage
            icon={LockKeyhole}
            title="Head Admin access required"
            detail="Historical reports contain protected business data. Ask a Head Admin to review this page."
          />
        </section>
      </div>
    );
  }

  const reportData = report?.report_data;
  const orders = reportData?.orders;
  const reservations = reportData?.reservations;

  return (
    <div className="mx-auto max-w-7xl pb-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4A6358]">
            <ShieldCheck size={13} aria-hidden="true" /> Head Admin archive
          </div>
          <h1 className="font-poppins text-xl font-bold text-[#26372E]">Historical Reports</h1>
          <p className="mt-1 max-w-xl font-sans text-xs leading-5 text-[#8A9488]">
            Finalized daily snapshots. Saved reports are read-only and use UTC business dates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="report-date-jump">Choose a report date</label>
          <input
            id="report-date-jump"
            type="date"
            value={selectedDate}
            onChange={event => event.target.value && selectDate(event.target.value)}
            className="h-9 rounded-lg border border-[#D6D9D0] bg-[#FFFFFF] px-3 font-sans text-xs text-[#26372E]
              outline-none focus:border-[#34483D] [color-scheme:light]"
          />
          <IconButton label="Refresh report archive" onClick={() => refreshArchive().catch(() => {})} disabled={archiveLoading}>
            <RefreshCw size={15} className={archiveLoading ? "animate-spin" : ""} aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[350px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-[#D6D9D0] bg-[#FFFFFF]">
          <div className="flex items-center justify-between border-b border-[#E4E6DE] px-4 py-4">
            <PanelHeading icon={CalendarDays} title="Report archive" detail={`${formatCount(archive.length)} dates loaded`} />
            <div className="flex gap-1">
              <IconButton label="Previous month" onClick={() => moveMonth(-1)}>
                <ChevronLeft size={17} aria-hidden="true" />
              </IconButton>
              <IconButton label="Next month" onClick={() => moveMonth(1)}>
                <ChevronRight size={17} aria-hidden="true" />
              </IconButton>
            </div>
          </div>

          {archiveError && (
            <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p role="alert" className="font-sans text-xs leading-5 text-red-600">{archiveError}</p>
              <button type="button" onClick={() => refreshArchive().catch(() => {})}
                className="shrink-0 font-sans text-xs font-semibold text-red-700 underline underline-offset-2">
                Retry
              </button>
            </div>
          )}

          <div className="px-4 pb-4 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-poppins text-sm font-semibold text-[#26372E]">
                {monthName(viewMonth.year, viewMonth.month)}
              </h2>
              {archiveLoading && <span className="font-sans text-[10px] text-[#8A9488]">Refreshing…</span>}
            </div>

            <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${monthName(viewMonth.year, viewMonth.month)} report calendar`}>
              {WEEKDAYS.map(day => (
                <div key={day} role="columnheader" className="pb-1 text-center font-sans text-[10px] font-semibold text-[#8A9488]">
                  {day}
                </div>
              ))}
              {monthDays.map((day, index) => {
                if (day === null) return <div key={`blank-${index}`} role="gridcell" className="aspect-square" />;
                const isoDate = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const saved = savedDates.has(isoDate);
                const knownEmpty = !saved && (
                  checkedDates.has(isoDate)
                  || (archiveLoaded && (!oldestLoadedDate || isoDate >= oldestLoadedDate))
                );
                const selected = isoDate === selectedDate;
                const isToday = isoDate === utcToday();
                return (
                  <div role="gridcell" key={isoDate}>
                    <button
                      type="button"
                      onClick={() => selectDate(isoDate)}
                      aria-label={`${formatLongDate(isoDate)}${saved ? ", saved report" : knownEmpty ? ", no saved report" : ", report not checked"}`}
                      aria-pressed={selected}
                      title={`${isoDate}${saved ? " · Saved report" : knownEmpty ? " · No saved report" : " · Not yet loaded"}`}
                      className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-md border
                        font-sans text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[#34483D]
                        ${selected
                          ? "border-[#34483D] bg-[#34483D]/15 text-[#FFFFFF]"
                          : saved
                            ? "border-[#34483D]/30] bg-[#E8EDE5] text-[#26372E] hover:border-[#4A6358]"
                            : knownEmpty
                              ? "border-[#E4E6DE] text-[#737C72] hover:border-[#D6D9D0] hover:bg-[#F0F4F0]"
                              : "border-transparent text-[#737C72] hover:border-[#737C72] hover:bg-[#F0F4F0]"}
                        ${isToday && !selected ? "ring-1 ring-inset ring-[#34483D]" : ""}`}
                    >
                      <span className="tabular-nums">{day}</span>
                      {saved && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#4A6358]" aria-hidden="true" />}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#E4E6DE] pt-3">
              <span className="inline-flex items-center gap-1.5 font-sans text-[10px] text-[#737C72]">
                <span className="h-2 w-2 rounded-sm bg-[#4A6358]" aria-hidden="true" /> Saved report
              </span>
              <span className="inline-flex items-center gap-1.5 font-sans text-[10px] text-[#737C72]">
                <span className="h-2 w-2 rounded-sm border border-[#8A9488]" aria-hidden="true" /> No saved report
              </span>
              <span className="inline-flex items-center gap-1.5 font-sans text-[10px] text-[#737C72]">
                <span className="h-2 w-2 rounded-sm border border-dashed border-[#8A9488]" aria-hidden="true" /> Not yet loaded
              </span>
            </div>

            {!archiveLoading && archiveLoaded && archive.length === 0 && !archiveError && (
              <p className="mt-4 rounded-lg border border-dashed border-[#D6D9D0] px-3 py-3 font-sans text-xs leading-5 text-[#737C72]">
                No saved reports yet. Select a completed date to create the first snapshot.
              </p>
            )}

            {hasOlderReports && (
              <div className="mt-4 border-t border-[#E4E6DE] pt-3">
                <button type="button" onClick={loadOlderReports} disabled={loadingOlder}
                  className="w-full rounded-lg border border-[#D6D9D0] px-3 py-2 font-sans text-xs font-semibold text-[#737C72]
                    transition-colors hover:border-[#4A6358] hover:text-[#4A6358] disabled:opacity-50">
                  {loadingOlder ? "Loading older dates…" : "Load older reports"}
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-xl border border-[#D6D9D0] bg-[#FFFFFF]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E6DE] px-5 py-5 sm:px-6">
            <div>
              <div className="mb-1 flex items-center gap-2 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4A6358]">
                <FileText size={13} aria-hidden="true" /> Daily snapshot
              </div>
              <h2 className="font-poppins text-lg font-bold text-[#26372E]">{formatLongDate(selectedDate)}</h2>
              <p className="mt-1 font-sans text-xs text-[#8A9488]">Business date · UTC</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedSummary && (
                <div className="inline-flex items-center gap-2 rounded-full border border-[#34483D]/30] bg-[#E8EDE5] px-3 py-1.5
                  font-sans text-[11px] font-semibold text-[#26372E]">
                  <Check size={13} aria-hidden="true" /> Finalized
                </div>
              )}
              {report && isHeadAdmin && (
                <button type="button" onClick={() => { setDownloadOpen(true); setDownloadError(null); }}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#E4E6DE]
                    px-3 py-2 font-sans text-xs font-semibold text-[#26372E] transition-colors
                    hover:border-[#4A6358] hover:bg-[#F0F4F0]">
                  <Download size={14} aria-hidden="true" /> Download PDF
                </button>
              )}
            </div>
          </div>

          {reportLoading && (
            <div className="space-y-5 p-5 sm:p-6" aria-label="Loading saved report" aria-live="polite">
              <div className="h-4 w-52 animate-pulse rounded bg-[#E4E6DE]" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[1, 2, 3].map(value => <div key={value} className="h-24 animate-pulse rounded-lg border border-[#E4E6DE] bg-[#FFFFFF]" />)}
              </div>
              <div className="h-44 animate-pulse rounded-lg border border-[#E4E6DE] bg-[#FFFFFF]" />
            </div>
          )}

          {!reportLoading && reportError && (
            <StateMessage
              icon={FileText}
              title="Could not open this report"
              detail={reportError}
              action={(
                <button type="button" onClick={() => setArchiveVersion(version => version + 1)}
                  className="rounded-lg border border-[#E4E6DE] px-4 py-2 font-sans text-xs font-semibold text-[#26372E]
                    hover:bg-[#F0F4F0]">
                  Retry
                </button>
              )}
            />
          )}

          {!reportLoading && !reportError && reportMissing && (
            <div className="px-5 py-6 sm:px-6">
              <StateMessage
                icon={CalendarDays}
                title="No saved report for this date"
                detail={completedDate
                  ? "This completed date has not been finalized. Finalization creates a permanent snapshot and cannot replace an existing report."
                  : "Reports can only be finalized after the UTC business date has ended."}
              />

              {completedDate && (
                <div className="mx-auto max-w-lg border-t border-[#E4E6DE] pt-5 text-center">
                  {finalizeError && <p role="alert" className="mb-3 font-sans text-xs text-red-600">{finalizeError}</p>}
                  {finalizeMessage && <p role="status" className="mb-3 font-sans text-xs text-emerald-700">{finalizeMessage}</p>}
                  {confirmFinalize && (
                    <p className="mb-3 font-sans text-xs leading-5 text-[#737C72]">
                      This snapshot is final and cannot be regenerated. Confirm to continue.
                    </p>
                  )}
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={finalizeSelectedDate} disabled={finalizing || selectedSummary}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#34483D]
                        bg-[#34483D] px-4 py-2 font-sans text-xs font-semibold text-[#FFFFFF] transition-colors
                        hover:bg-[#2A3B32] disabled:cursor-not-allowed disabled:opacity-50">
                      {finalizing ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                      {finalizing ? "Finalizing…" : confirmFinalize ? "Confirm finalization" : "Finalize this date"}
                    </button>
                    {confirmFinalize && (
                      <button type="button" onClick={() => setConfirmFinalize(false)} disabled={finalizing}
                        className="min-h-10 rounded-lg border border-[#D6D9D0] px-4 py-2 font-sans text-xs font-semibold text-[#737C72]
                          hover:border-[#D6D9D0] disabled:opacity-50">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!reportLoading && !reportError && report && orders && reservations && (
            <div className="space-y-6 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#E4E6DE] pb-4">
                <span className="inline-flex items-center gap-1.5 font-sans text-xs text-[#737C72]">
                  <Clock3 size={14} aria-hidden="true" /> Generated {formatTimestamp(report.generated_at)}
                </span>
                <span className="font-sans text-xs text-[#8A9488]">Timezone: {report.business_timezone}</span>
                <span className="font-sans text-xs text-[#8A9488]">Snapshot ID: {String(report.id).slice(0, 8)}</span>
              </div>

              <section aria-label="Daily totals" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[#D6D9D0] bg-[#FFFFFF] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[#737C72]">Orders</p>
                    <ShoppingBag size={15} className="text-[#4A6358]" aria-hidden="true" />
                  </div>
                  <p className="mt-3 font-poppins text-2xl font-bold tabular-nums text-[#26372E]">{formatCount(orders.total_count)}</p>
                  <p className="mt-1 font-sans text-[11px] text-[#8A9488]">All order statuses</p>
                </div>

                <div className="rounded-lg border border-[#D6D9D0] bg-[#FFFFFF] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[#737C72]">Order value · all orders</p>
                    <CircleDollarSign size={15} className="text-[#4A6358]" aria-hidden="true" />
                  </div>
                  <p className="mt-3 font-poppins text-2xl font-bold tabular-nums text-[#26372E]">
                    {formatOrderValue(orders.order_value_all_orders)}
                  </p>
                  <p className="mt-1 font-sans text-[11px] leading-4 text-[#8A9488]">Recorded order totals, not revenue</p>
                </div>

                <div className="rounded-lg border border-[#E4E6DE] bg-[#F0F4F0] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4A6358]">Revenue</p>
                    <CircleDollarSign size={15} className="text-[#4A6358]" aria-hidden="true" />
                  </div>
                  <p className="mt-3 font-poppins text-xl font-bold text-[#26372E]">
                    {orders.revenue_available ? formatOrderValue(orders.revenue_total) : "Unavailable"}
                  </p>
                  <p className="mt-1 font-sans text-[11px] leading-4 text-[#737C72]">
                    {orders.revenue_unavailable_reason || "No verified settled-payment amount is recorded."}
                  </p>
                </div>
              </section>

              <section className="grid gap-5 border-b border-[#E4E6DE] pb-6 md:grid-cols-2">
                <CountList title="Order status counts" values={orders.status_counts} labels={ORDER_STATUS_LABELS} />
                <CountList title="Recorded payment statuses" values={orders.payment_status_counts} />
              </section>

              <section className="grid gap-5 border-b border-[#E4E6DE] pb-6 sm:grid-cols-2">
                <div>
                  <PanelHeading icon={Users} title="Reservations" detail="Reservations scheduled for this business date" />
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-poppins text-2xl font-bold tabular-nums text-[#26372E]">
                      {formatCount(reservations.scheduled_count)}
                    </span>
                    <span className="font-sans text-xs text-[#8A9488]">scheduled</span>
                  </div>
                  <p className="mt-1 font-sans text-[11px] text-[#8A9488]">
                    {formatCount(reservations.created_on_business_date_count)} created on this date
                  </p>
                  <div className="mt-3">
                    <CountList title="Reservation status counts" values={reservations.status_counts} />
                  </div>
                </div>

                <div className="rounded-lg border border-[#D6D9D0] bg-[#FFFFFF] p-4">
                  <div className="flex items-center gap-2">
                    <CircleDollarSign size={15} className="text-[#4A6358]" aria-hidden="true" />
                    <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#737C72]">
                      Reservation add-on fees
                    </h3>
                  </div>
                  <p className="mt-3 font-poppins text-lg font-bold text-[#26372E]">
                    {reservations.addon_fees_available
                      ? formatOrderValue(reservations.addon_fees_total)
                      : "Unavailable"}
                  </p>
                  <p className="mt-1 font-sans text-xs leading-5 text-[#8A9488]">
                    {reservations.addon_fees_unavailable_reason || "Purchase-time fee data is not available."}
                  </p>
                </div>
              </section>

              <section className="grid gap-6 md:grid-cols-2">
                <div>
                  <PanelHeading icon={BarChart3} title="Popular menu items" detail="Ranked by quantity ordered" />
                  <div className="mt-3">
                    <RankedList
                      rows={reportData.popular_menu_items}
                      idField="menu_item_id"
                      nameField="name_at_finalization"
                      valueField="quantity_ordered"
                      emptyLabel="No menu item quantities were recorded for this date."
                    />
                  </div>
                </div>
                <div>
                  <PanelHeading icon={ShoppingBag} title="Popular add-ons" detail="Selected on confirmed reservations" />
                  <div className="mt-3">
                    <RankedList
                      rows={reportData.popular_addons}
                      idField="addon_id"
                      nameField="name_at_finalization"
                      valueField="quantity_selected"
                      emptyLabel="No add-on selections were recorded for confirmed reservations."
                    />
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {downloadOpen && report && isHeadAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
          <section role="dialog" aria-modal="true" aria-labelledby="report-download-title"
            className="relative z-10 w-full max-w-md rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 flex items-center gap-2 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4A6358]">
                  <LockKeyhole size={13} aria-hidden="true" /> Protected download
                </p>
                <h2 id="report-download-title" className="font-poppins text-base font-bold text-[#26372E]">
                  Download {report.business_date}
                </h2>
                <p className="mt-1 font-sans text-xs leading-5 text-[#8A9488]">
                  Enter the separate report-download secret. It is sent only in the request body.
                </p>
              </div>
              <button type="button" onClick={closeDownloadPrompt} disabled={downloadLoading}
                aria-label="Close download prompt"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#737C72]
                  hover:bg-[#E4E6DE] hover:text-[#26372E] disabled:opacity-40">
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form onSubmit={downloadSelectedReport}>
              <label htmlFor="report-download-secret" className="mb-2 block font-sans text-xs font-semibold text-[#737C72]">
                Report-download secret
              </label>
              <input
                id="report-download-secret"
                type="password"
                value={downloadSecret}
                onChange={event => setDownloadSecret(event.target.value)}
                autoComplete="new-password"
                autoFocus
                required
                disabled={downloadLoading}
                className="h-11 w-full rounded-lg border border-[#737C72] bg-[#F7F6F0] px-3 font-sans text-sm text-[#26372E]
                  outline-none focus:border-[#34483D] disabled:opacity-60"
              />
              {downloadError && (
                <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs leading-5 text-red-600">
                  {downloadError}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={closeDownloadPrompt} disabled={downloadLoading}
                  className="min-h-10 rounded-lg border border-[#D6D9D0] px-4 py-2 font-sans text-xs font-semibold text-[#737C72]
                    hover:border-[#D6D9D0] disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={downloadLoading || !downloadSecret}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#34483D]
                    bg-[#34483D] px-4 py-2 font-sans text-xs font-semibold text-[#FFFFFF] transition-colors
                    hover:bg-[#2A3B32] disabled:cursor-not-allowed disabled:opacity-50">
                  {downloadLoading
                    ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                    : <Download size={14} aria-hidden="true" />}
                  {downloadLoading ? "Verifying…" : "Verify and download"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
