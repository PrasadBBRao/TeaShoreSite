/**
 * Reservation.jsx — Tea Shore Cafe · Premium reservation page.
 *
 * Steps:
 *   0 – Date         Wonderla-style horizontal scroll strip
 *   1 – Time         Premium hourly time-card grid (11 AM – 11 PM)
 *   2 – Guests + Table  1–6 single table | 7+ combined tables
 *   3 – Add-ons + Confirm
 *   ✓ – Confirmation card
 *
 * Rules:
 *   • No hardcoded availability — all states from /tables/available.
 *   • Table combinations allowed: Centre+Centre, Centre+Corner,
 *     Centre+Group, Corner+Group. Window & Outdoor cannot combine.
 *   • Gift Message addon reveals occasion + template + custom text UI.
 *   • Hours 11 AM – 11 PM from reservation.js constants.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  fetchAvailableTables,
  fetchAddons,
  createReservation,
} from "../services/reservation";
import resBgDesktop from "../assets/reswin.png";
import resBgMobile  from "../assets/resmob.png";

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════════ */

const DAY_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* Table number → category */
const TABLE_CATEGORY = {
  1:"window", 2:"window",
  3:"centre", 4:"centre", 5:"centre",
  6:"corner", 7:"corner",
  8:"group",  9:"group",  10:"group",
  11:"outdoor", 12:"outdoor",
};

/* Human labels matching seed.py */
const TABLE_LABELS = {
  1:"Window Seat A", 2:"Window Seat B",
  3:"Centre Table A", 4:"Centre Table B", 5:"Centre Table C",
  6:"Corner Table A", 7:"Corner Table B",
  8:"Group Table A",  9:"Group Table B",  10:"Group Table C",
  11:"Outdoor A",     12:"Outdoor B",
};

const CATEGORY_ICON = {
  window:"🪟", centre:"🪑", corner:"🪑", group:"👥", outdoor:"🌿",
};

function tableLabel(num) { return TABLE_LABELS[num] ?? `Table ${num}`; }
function tableIcon(num)  { return CATEGORY_ICON[TABLE_CATEGORY[num]] ?? "🪑"; }
function tableCat(num)   { return TABLE_CATEGORY[num] ?? "centre"; }

/* Which category-pairs can combine? */
const COMBINABLE = new Set([
  "centre-centre", "centre-corner", "corner-centre",
  "centre-group",  "group-centre",
  "corner-group",  "group-corner",
]);

function canCombine(numA, numB) {
  const key = `${tableCat(numA)}-${tableCat(numB)}`;
  return numA !== numB && COMBINABLE.has(key);
}

/* Gift Message addon name — must match seed exactly */
const GIFT_MSG_NAME = "Gift Message";

/* 4 selectable occasion chips shown in GiftMessageEditor */
const GIFT_OCCASIONS = [
  "Birthday", "Anniversary", "Congratulations", "Best Wishes",
];

const GIFT_TEMPLATES = {
  Birthday:       ["Happy Birthday! 🎂 Wishing you a wonderful day!",
                   "Many happy returns of the day! 🎉"],
  Anniversary:    ["Happy Anniversary! 💕 Here's to many more years together.",
                   "Celebrating you both on this special day! 🥂"],
  Congratulations:["Congratulations on your achievement! 🎊",
                   "So proud of you — you deserve this! ⭐"],
  "Best Wishes":  ["Wishing you all the very best! 🌟",
                   "Sending you warm wishes and good vibes. ✨"],
};

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════ */

function fmtDateFull(date) {
  return `${DAY_SHORT[date.getDay()]}, ${date.getDate()} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

function fmtTime(iso) {
  /* Local ISO "YYYY-MM-DDTHH:MM:SS" → read directly (no UTC shift).
     API response with Z/offset → parse via Date. */
  const hasOffset = /Z$/.test(iso) || /[+\-]\d{2}:\d{2}$/.test(iso);
  if (hasOffset) {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  }
  const [, t] = iso.split("T");
  const [hStr, mStr] = t.split(":");
  const h    = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return mStr === "00" ? `${h12} ${ampm}` : `${h12}:${mStr} ${ampm}`;
}

function fmt(n) {
  const num = parseFloat(n);
  return `₹${Number.isInteger(num) ? num : num.toFixed(2)}`;
}

function slide(dir = 1) {
  return {
    initial:    { opacity: 0, x: dir * 28 },
    animate:    { opacity: 1, x: 0 },
    exit:       { opacity: 0, x: dir * -28 },
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   STEP INDICATOR
═══════════════════════════════════════════════════════════════════════ */
const STEPS = ["Date","Time","Table","Confirm"];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center mb-10" role="list" aria-label="Booking steps">
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none" role="listitem">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={[
                "w-8 h-8 rounded-full flex items-center justify-center",
                "font-poppins font-bold text-sm transition-all duration-300",
                done  ? "bg-palm-brown text-cream"
                      : active ? "bg-palm-brown-light text-cream shadow-[0_0_0_4px_rgba(107,77,56,0.22)]"
                                : "bg-cream-dark text-palm-brown/35",
              ].join(" ")} aria-current={active ? "step" : undefined}>
                {done
                  ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
                      <path d="M3 8l4 4 6-7"/>
                    </svg>
                  : i + 1}
              </div>
              <span className={[
                "font-sans text-[10px] font-semibold uppercase tracking-widest",
                active ? "text-palm-brown-light" : done ? "text-palm-brown" : "text-palm-brown/30",
              ].join(" ")}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={[
                "flex-1 h-px mx-2 mb-5 transition-colors duration-500",
                done ? "bg-palm-brown" : "bg-cream-dark",
              ].join(" ")} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   BACK BUTTON
═══════════════════════════════════════════════════════════════════════ */
function BackButton({ onClick, label = "← Back" }) {
  return (
    <button onClick={onClick}
      className="px-5 py-3 rounded-btn border-2 border-cream-dark bg-cream
                 font-sans text-sm font-semibold text-palm-brown/55
                 hover:text-palm-brown hover:border-palm-brown/30
                 transition-colors duration-200 shrink-0">
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TIME PICKER — iPhone-style single vertical slot wheel.

  Generates minute-precise slots from 11:00 AM to 11:00 PM.
   Selected slot is centered, large, palm-brown-light.
   Adjacent slots fade and shrink progressively.
   Two pickers (From / To) side by side; To must be later than From.
   Once both are set the picker collapses to show the summary.
═══════════════════════════════════════════════════════════════════════ */

const SLOT_H   = 48;   // px per slot row
const VISIBLE  = 5;    // number of visible rows in the drum

/* Generate all valid slots for a date as { iso, label } */
function makeSlots(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const slots = [];
  // Every minute is selectable from 11:00 AM through 11:00 PM.
  for (let h = 11; h <= 23; h++) {
    const minutes = h === 23 ? [0] : Array.from({ length: 60 }, (_, minute) => minute);
    for (const m of minutes) {
      const iso = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(h)}:${pad(m)}:00`;
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const ap  = h < 12 ? "AM" : "PM";
      const label = `${h12}:${pad(m)} ${ap}`;
      slots.push({ iso, label });
    }
  }
  return slots;
}

/* Single slot wheel — iPhone alarm drum */
function SlotWheel({ slots, selectedIso, onSelect, disabled }) {
  const listRef    = useRef(null);
  const snapRef    = useRef(null);
  const selIdx     = slots.findIndex((s) => s.iso === selectedIso);
  const activeIdx  = selIdx >= 0 ? selIdx : 0;

  /* Scroll to selected slot, centering it */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: activeIdx * SLOT_H, behavior: "smooth" });
  }, [activeIdx]);

  function handleScroll() {
    clearTimeout(snapRef.current);
    snapRef.current = setTimeout(() => {
      const el = listRef.current;
      if (!el) return;
      const idx = Math.max(0, Math.min(slots.length - 1, Math.round(el.scrollTop / SLOT_H)));
      el.scrollTo({ top: idx * SLOT_H, behavior: "smooth" });
      onSelect(slots[idx].iso);
    }, 80);
  }

  return (
    <div
      className={["relative select-none overflow-hidden", disabled ? "opacity-30 pointer-events-none" : ""].join(" ")}
      style={{ height: SLOT_H * VISIBLE, width: 120 }}
      aria-label="Time slot selector"
    >
      {/* Top fade */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 z-10 pointer-events-none"
        style={{ height: SLOT_H * 2, background: "linear-gradient(to bottom, #fdf6ee 10%, transparent 100%)" }} />
      {/* Bottom fade */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
        style={{ height: SLOT_H * 2, background: "linear-gradient(to top, #fdf6ee 10%, transparent 100%)" }} />
      {/* Selection band */}
      <div aria-hidden="true" className="absolute inset-x-3 z-10 pointer-events-none rounded-xl"
        style={{
          top: SLOT_H * 2,
          height: SLOT_H,
          background: "rgba(107,77,56,0.10)",
          border: "1px solid rgba(107,77,56,0.18)",
        }} />

      {/* Scrollable list */}
      <ul
        ref={listRef}
        onScroll={handleScroll}
        style={{
          height: "100%",
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
        role="listbox"
      >
        {/* Padding spacers so first/last item can center */}
        <li aria-hidden="true" style={{ height: SLOT_H * 2, scrollSnapAlign: "none" }} />
        {slots.map((slot, i) => {
          const dist  = Math.abs(i - activeIdx); // 0=selected, 1=adjacent, 2+=far
          const scale = dist === 0 ? 1 : dist === 1 ? 0.88 : 0.76;
          const opacity = dist === 0 ? 1 : dist === 1 ? 0.45 : 0.2;
          const weight  = dist === 0 ? "700" : "500";
          const color   = dist === 0 ? "#6b4d38" : "#4a3325"; // palm-brown-light vs palm-brown

          return (
            <li
              key={slot.iso}
              role="option"
              aria-selected={i === activeIdx}
              onClick={() => {
                listRef.current?.scrollTo({ top: i * SLOT_H, behavior: "smooth" });
                onSelect(slot.iso);
              }}
              style={{
                height: SLOT_H,
                scrollSnapAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "transform 0.15s ease, opacity 0.15s ease",
                transform: `scale(${scale})`,
                opacity,
              }}
            >
              <span style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: dist === 0 ? "1.25rem" : "1rem",
                fontWeight: weight,
                letterSpacing: "0.03em",
                color,
                userSelect: "none",
              }}>
                {slot.label}
              </span>
            </li>
          );
        })}
        <li aria-hidden="true" style={{ height: SLOT_H * 2, scrollSnapAlign: "none" }} />
      </ul>

      {/* Hide webkit scrollbar */}
      <style>{`
        [data-slot-wheel] ul::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

/* isoToMins still needed for constraint checks */
function isoToMins(iso) {
  const [, t] = iso.split("T");
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function TimeSelector({ date, fromIso, toIso, onFromChange, onToChange }) {
  const slots    = date ? makeSlots(date) : [];
  const timeValid = fromIso && toIso && isoToMins(toIso) > isoToMins(fromIso);

  /* Default From on mount to first non-past slot */
  useEffect(() => {
    if (!fromIso && date && slots.length > 0) {
      const now     = new Date();
      const sameDay = now.getFullYear() === date.getFullYear() &&
                      now.getMonth()    === date.getMonth()    &&
                      now.getDate()     === date.getDate();
      const minH = sameDay ? Math.max(11, now.getHours() + 1) : 11;
      const first = slots.find((s) => {
        const [, t] = s.iso.split("T");
        return parseInt(t, 10) >= minH;
      }) ?? slots[0];
      onFromChange(first.iso);
      // Default To = first + 1h
      const fromMins = isoToMins(first.iso);
      const toSlot = slots.find((s) => isoToMins(s.iso) >= fromMins + 60) ?? slots[slots.length - 1];
      onToChange(toSlot.iso);
    }
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Nudge To forward if From advances past it */
  useEffect(() => {
    if (!fromIso || !toIso) return;
    if (isoToMins(toIso) <= isoToMins(fromIso)) {
      const fromMins = isoToMins(fromIso);
      const toSlot = slots.find((s) => isoToMins(s.iso) > fromMins) ?? slots[slots.length - 1];
      onToChange(toSlot.iso);
    }
  }, [fromIso]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Filter To slots to only those strictly after From */
  const toSlots = slots.filter((s) => !fromIso || isoToMins(s.iso) > isoToMins(fromIso));

  const duration = timeValid ? (() => {
    const diff = isoToMins(toIso) - isoToMins(fromIso);
    const h = Math.floor(diff / 60), m = diff % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  })() : null;

  return (
    <div>
      <p className="font-sans text-xs text-palm-brown/40 mb-6 text-center tracking-widest uppercase text-[10px]">
        OPEN DAILY · 11 AM – 11 PM
      </p>

      {/* Two wheels with arrow between */}
      <div className="flex items-center justify-center gap-3">
        <div className="flex flex-col items-center gap-2">
          <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-palm-brown/35">
            FROM
          </span>
          <div data-slot-wheel>
            <SlotWheel
              slots={slots}
              selectedIso={fromIso}
              onSelect={(iso) => { onFromChange(iso); setSelectedIds && setSelectedIds([]); }}
              disabled={slots.length === 0}
            />
          </div>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center gap-1 mt-5">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" className="w-5 h-5 text-palm-brown/25" aria-hidden="true">
            <path d="M4 10h12M11 5l5 5-5 5"/>
          </svg>
          {duration && (
            <span className="font-sans text-[9px] text-palm-brown/35 uppercase tracking-widest whitespace-nowrap">
              {duration}
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-palm-brown/35">
            TO
          </span>
          <div data-slot-wheel>
            <SlotWheel
              slots={toSlots}
              selectedIso={toSlots.find((s) => s.iso === toIso) ? toIso : toSlots[0]?.iso}
              onSelect={onToChange}
              disabled={!fromIso || toSlots.length === 0}
            />
          </div>
        </div>
      </div>

      {/* Validation */}
      {fromIso && toIso && !timeValid && (
        <p className="mt-4 text-center font-sans text-xs text-red-500">
          End time must be after start time
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STEP 2 — GUEST COUNTER
═══════════════════════════════════════════════════════════════════════ */
function GuestCounter({ guests, onChange }) {
  /* Soft cap: display 1-6 individually, 7+ shows "7+" label */
  const MAX = 12;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-6">
        <button
          onClick={() => onChange(Math.max(1, guests - 1))}
          disabled={guests <= 1}
          aria-label="Remove one guest"
          className="w-11 h-11 rounded-full border-2 border-cream-dark bg-cream-light
                     flex items-center justify-center font-poppins text-2xl font-bold text-palm-brown
                     disabled:opacity-25 disabled:cursor-not-allowed hover:border-palm-brown transition-colors"
        >−</button>

        <div className="flex flex-col items-center min-w-[5rem]">
          <span className="font-poppins font-black text-5xl text-palm-brown leading-none tabular-nums">
            {guests}
          </span>
          <span className="font-sans text-xs text-palm-brown/40 mt-1.5 uppercase tracking-widest">
            {guests === 1 ? "Guest" : "Guests"}
          </span>
        </div>

        <button
          onClick={() => onChange(Math.min(MAX, guests + 1))}
          disabled={guests >= MAX}
          aria-label="Add one guest"
          className="w-11 h-11 rounded-full border-2 border-cream-dark bg-cream-light
                     flex items-center justify-center font-poppins text-2xl font-bold text-palm-brown
                     disabled:opacity-25 disabled:cursor-not-allowed hover:border-palm-brown transition-colors"
        >+</button>
      </div>

      {guests > 6 && (
        <p className="font-sans text-xs text-palm-brown/50 text-center max-w-[18rem]">
          For {guests} guests we'll find two compatible tables to combine.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STEP 2 — TABLE PICKER  (single + combination modes)
═══════════════════════════════════════════════════════════════════════ */

/* Single table card */
function TableCard({ table, selectedIds, onSelect }) {
  const isSel = selectedIds.includes(table.id);
  const avail = table.is_available;
  const label = tableLabel(table.table_number);
  const icon  = tableIcon(table.table_number);

  return (
    <button
      disabled={!avail}
      onClick={() => avail && onSelect([table.id])}
      aria-pressed={isSel}
      aria-label={`${label}, seats ${table.capacity}${!avail ? ", already booked" : ""}`}
      className={[
        "relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left w-full",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown-light",
        !avail
          ? "border-cream-dark bg-cream opacity-45 cursor-not-allowed"
          : isSel
            ? "border-palm-brown-light bg-palm-brown-light shadow-[0_4px_24px_rgba(107,77,56,0.30)]"
            : "border-cream-dark bg-cream-light hover:border-palm-brown/40 hover:shadow-card cursor-pointer",
      ].join(" ")}
    >
      {!avail && (
        <span className="absolute top-2.5 right-2.5 font-sans text-[9px] font-bold uppercase
                         tracking-widest text-palm-brown/40 bg-cream-dark/60 rounded-full px-2 py-0.5">
          Booked
        </span>
      )}
      {isSel && avail && (
        <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-palm-brown
                         flex items-center justify-center shrink-0">
          <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5"
            strokeLinecap="round" className="w-3 h-3" aria-hidden="true"><path d="M3 8l4 4 6-7"/></svg>
        </span>
      )}
      <span className="text-xl leading-none" aria-hidden="true">{icon}</span>
      <div>
        <p className={["font-poppins font-bold text-sm leading-snug",
          isSel ? "text-cream" : "text-palm-brown"].join(" ")}>{label}</p>
        <p className={["font-sans text-xs mt-0.5",
          isSel ? "text-cream/55" : "text-palm-brown/40"].join(" ")}>Seats {table.capacity}</p>
      </div>
    </button>
  );
}

/* Combination card (two tables joined) */
function ComboCard({ combo, selectedIds, onSelect }) {
  const [a, b]  = combo;
  const isSel   = selectedIds.includes(a.id) && selectedIds.includes(b.id);
  const totalCap = a.capacity + b.capacity;

  return (
    <button
      onClick={() => onSelect([a.id, b.id])}
      aria-pressed={isSel}
      aria-label={`Combine ${tableLabel(a.table_number)} + ${tableLabel(b.table_number)}, seats ${totalCap}`}
      className={[
        "relative flex flex-col gap-2 rounded-2xl border-2 p-4 text-left w-full",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown-light",
        isSel
          ? "border-palm-brown-light bg-palm-brown-light shadow-[0_4px_24px_rgba(107,77,56,0.30)]"
          : "border-cream-dark bg-cream-light hover:border-palm-brown/40 hover:shadow-card cursor-pointer",
      ].join(" ")}
    >
      {isSel && (
        <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-palm-brown
                         flex items-center justify-center shrink-0">
          <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5"
            strokeLinecap="round" className="w-3 h-3" aria-hidden="true"><path d="M3 8l4 4 6-7"/></svg>
        </span>
      )}
      {/* Combined label */}
      <div className="flex items-center gap-1.5">
        <span className="text-base" aria-hidden="true">{tableIcon(a.table_number)}</span>
        <svg viewBox="0 0 16 8" fill="none" className="w-4 h-2 shrink-0" aria-hidden="true">
          <path d="M0 4h14M10 1l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span className="text-base" aria-hidden="true">{tableIcon(b.table_number)}</span>
      </div>
      <div>
        <p className={["font-poppins font-bold text-sm leading-snug",
          isSel ? "text-cream" : "text-palm-brown"].join(" ")}>
          {tableLabel(a.table_number)} + {tableLabel(b.table_number)}
        </p>
        <p className={["font-sans text-xs mt-0.5",
          isSel ? "text-cream/55" : "text-palm-brown/40"].join(" ")}>
          Combined · Seats {totalCap}
        </p>
      </div>
    </button>
  );
}

function TablePicker({ reservationTime, guests, selectedIds, onSelect, onTablesLoaded }) {
  const [tables,  setTables]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const needCombo = guests > 6;

  async function load() {
    setLoading(true); setError(null);
    try {
      /*
       * For combo mode we fetch with party_size=1 so the backend returns
       * ALL tables (any capacity), letting us compute combinations ourselves.
       * For single mode we pass the real guest count so the backend filters
       * out tables that are too small.
       */
      const fetchSize = needCombo ? 1 : guests;
      const data = await fetchAvailableTables(reservationTime, fetchSize);
      setTables(data);
      onTablesLoaded(data);

      /* Clear any selection that became unavailable */
      if (selectedIds.length > 0) {
        const stillOk = selectedIds.every((id) => {
          const t = data.find((x) => x.id === id);
          return t && t.is_available;
        });
        if (!stillOk) onSelect([]);
      }
    } catch (err) {
      setError(err.message || "Could not load tables. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [reservationTime, guests]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = tables.filter((t) =>  t.is_available);
  const booked    = tables.filter((t) => !t.is_available);

  /* Build valid combinations from available tables */
  const combos = [];
  if (needCombo) {
    for (let i = 0; i < available.length; i++) {
      for (let j = i + 1; j < available.length; j++) {
        const a = available[i], b = available[j];
        if (
          canCombine(a.table_number, b.table_number) &&
          a.capacity + b.capacity >= guests
        ) {
          combos.push([a, b]);
        }
      }
    }
  }

  const availCount = needCombo ? combos.length : available.length;
  const totalCount = needCombo ? combos.length + booked.length : tables.length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
        <h2 className="font-serif text-2xl text-palm-brown">
          {needCombo ? "Choose a Table Combination" : "Choose a Table"}
        </h2>
        {!loading && !error && tables.length > 0 && (
          <span className="font-sans text-xs text-palm-brown/40">
            {availCount}{needCombo ? " combos" : `/${totalCount}`} available · {guests} guests
          </span>
        )}
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} className="h-[104px] rounded-2xl bg-cream-dark animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-center justify-between gap-4">
          <p className="font-sans text-sm text-red-700">{error}</p>
          <button onClick={load}
            className="shrink-0 font-sans text-xs font-bold text-red-700 underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {/* Single-table mode */}
      {!loading && !error && !needCombo && (
        <>
          {available.length === 0 ? (
            <div className="rounded-2xl border border-cream-dark bg-cream px-5 py-8 text-center">
              <p className="font-serif text-base text-palm-brown/55">No tables available</p>
              <p className="font-sans text-sm text-palm-brown/35 mt-1">Try a different time or fewer guests.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {available.map((t) => (
                <TableCard key={t.id} table={t} selectedIds={selectedIds} onSelect={onSelect} />
              ))}
            </div>
          )}
          {booked.length > 0 && (
            <div className="mt-5">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest
                             text-palm-brown/28 mb-3">Already booked</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {booked.map((t) => (
                  <TableCard key={t.id} table={t} selectedIds={selectedIds} onSelect={onSelect} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Combo mode */}
      {!loading && !error && needCombo && (
        <>
          {combos.length === 0 ? (
            <div className="rounded-2xl border border-cream-dark bg-cream px-5 py-8 text-center">
              <p className="font-serif text-base text-palm-brown/55">No table combinations available</p>
              <p className="font-sans text-sm text-palm-brown/35 mt-1">
                Try a different time or split your group.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-palm-brown/10 bg-palm-brown/5 px-4 py-3 mb-5">
                <p className="font-sans text-xs text-palm-brown/60">
                  For large groups we combine two compatible tables. Window and outdoor seats cannot be combined.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {combos.map(([a, b]) => (
                  <ComboCard
                    key={`${a.id}-${b.id}`}
                    combo={[a, b]}
                    selectedIds={selectedIds}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function BookingTableSelection({ date, timeIso, timeToIso, guests, selectedTableId, onSelect, onChangeTime, onClose, onContinue }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [continueNotice, setContinueNotice] = useState(false);
  const selectedTableRef = useRef(selectedTableId);
  const hasValidTimeRange = Boolean(date && timeIso && timeToIso && new Date(timeToIso) > new Date(timeIso));

  useEffect(() => {
    selectedTableRef.current = selectedTableId;
  }, [selectedTableId]);

  useEffect(() => {
    let active = true;
    if (!date || !timeIso || !timeToIso || new Date(timeToIso) <= new Date(timeIso)) {
      setTables([]);
      setLoading(false);
      setError(null);
      if (selectedTableRef.current) onSelect(null);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    setContinueNotice(false);
    fetchAvailableTables(timeIso, guests)
      .then((results) => {
        if (!active) return;
        const validResults = results.filter(table => table.capacity >= guests);
        setTables(validResults);
        const chosen = validResults.find(table => table.id === selectedTableRef.current);
        if (selectedTableRef.current && (!chosen || !chosen.is_available)) onSelect(null);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Could not load available tables. Please retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [date, timeIso, timeToIso, guests, retry, onSelect]);

  const availableTables = tables.filter(table => table.capacity >= guests && table.is_available);
  const dateSummary = date
    ? `${String(date.getDate()).padStart(2, "0")} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`
    : "";
  const locationName = (table) => ({
    window: "Window", centre: "Centre", corner: "Corner", group: "Group", outdoor: "Outdoor",
  }[tableCat(table.table_number)]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto flex max-h-[calc(100dvh-24px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border p-4 shadow-card sm:p-6"
      style={{ background: "#f7f1e8", borderColor: "#e9dfd2" }}
      aria-labelledby="choose-table-heading"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 id="choose-table-heading" className="font-anton text-xl uppercase tracking-[0.06em] text-palm-brown">
            Choose Your Table
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-sans text-sm text-palm-brown/70">
            <span>{guests} {guests === 1 ? "Guest" : "Guests"}</span>
            <span>{dateSummary}</span>
            <span>{timeIso && timeToIso ? `${fmtTime(timeIso)} – ${fmtTime(timeToIso)}` : "Choose a time"}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close table selection"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-palm-brown/65 transition-colors hover:bg-cream-dark hover:text-palm-brown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown-light">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="h-4 w-4">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </header>

      <p className="mb-3 shrink-0 font-sans text-xs font-semibold uppercase tracking-[0.1em] text-palm-brown-light">
        Available for {guests} {guests === 1 ? "guest" : "guests"}
      </p>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
      {!hasValidTimeRange && (
        <div className="rounded-xl border border-cream-dark bg-cream px-5 py-8 text-center">
          <p className="font-poppins text-base font-semibold text-palm-brown">Choose a time to check availability</p>
          <button type="button" onClick={onChangeTime}
            className="mt-4 min-h-11 rounded-md border border-palm-brown/25 px-5 font-sans text-sm font-semibold text-palm-brown transition-colors hover:bg-cream-dark">
            Choose time
          </button>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading tables">
          {[1, 2, 3].map(index => (
            <div key={index} className="h-24 animate-pulse rounded-xl border border-cream-dark bg-cream" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-cream-dark bg-cream px-5 py-6 text-center">
          <p className="font-sans text-sm text-palm-brown">{error}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)}
            className="mt-3 font-sans text-sm font-semibold text-palm-brown underline underline-offset-4">
            Retry
          </button>
        </div>
      )}

      {hasValidTimeRange && !loading && !error && availableTables.length === 0 && (
        <div className="rounded-xl border border-cream-dark bg-cream px-5 py-8 text-center">
          <p className="font-poppins text-base font-semibold text-palm-brown">No tables available</p>
          <p className="mx-auto mt-2 max-w-sm font-sans text-sm text-palm-brown/65">
            We don't have a suitable table available for {guests} {guests === 1 ? "guest" : "guests"} at this time.
          </p>
          <button type="button" onClick={onChangeTime}
            className="mt-4 min-h-11 rounded-md border border-palm-brown/25 px-5 font-sans text-sm font-semibold text-palm-brown transition-colors hover:bg-cream-dark">
            Change time
          </button>
        </div>
      )}

      {hasValidTimeRange && !loading && !error && availableTables.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {availableTables.map(table => {
            const selected = selectedTableId === table.id;
            return (
              <button key={table.id} type="button" aria-pressed={selected}
                onClick={() => { onSelect(table.id); setContinueNotice(false); }}
                className="relative min-h-24 rounded-xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown-light"
                style={{
                  borderColor: selected ? "#4a3325" : "#e4d5c3",
                  borderWidth: selected ? 2 : 1,
                  background: selected ? "#eadcc9" : "#fdf8f1",
                }}>
                {selected && (
                  <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-palm-brown text-cream" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-3.5 w-3.5">
                      <path d="m3 8 3 3 7-7" />
                    </svg>
                  </span>
                )}
                <p className="pr-8 font-poppins text-sm font-semibold text-palm-brown">{tableLabel(table.table_number)}</p>
                <p className="mt-2 font-sans text-sm text-palm-brown/70">{table.capacity} {table.capacity === 1 ? "guest" : "guests"}</p>
                <p className="mt-0.5 font-sans text-xs text-palm-brown/55">{locationName(table)}</p>
              </button>
            );
          })}
        </div>
      )}
      </div>

      <footer className="mt-3 flex shrink-0 flex-col items-start justify-between gap-3 border-t border-cream-dark bg-[#f7f1e8] pt-3 sm:flex-row sm:items-center">
        <p className="font-sans text-xs text-palm-brown/60" aria-live="polite">
          {continueNotice ? "Table selected. Payment will be added in the next step." : ""}
        </p>
        <button type="button" disabled={!selectedTableId || loading || Boolean(error)}
          onClick={() => {
            const table = availableTables.find(item => item.id === selectedTableId);
            if (table) onContinue(table);
          }}
          className="min-h-12 w-full rounded-md px-6 font-sans text-sm font-semibold transition-all hover:bg-[#38251a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown-light active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          style={{ background: "#493224", color: "#fff8ee" }}>
          Continue to Payment →
        </button>
      </footer>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STEP 3 — GIFT MESSAGE ADDON UI
═══════════════════════════════════════════════════════════════════════ */
function GiftMessageEditor({ giftMsg, onChange }) {
  /* giftMsg: { occasion, text } */
  const { occasion, text } = giftMsg;
  const templates = GIFT_TEMPLATES[occasion] ?? [];

  function setOccasion(occ) {
    /* When occasion changes, auto-fill first template if one exists */
    const firstTpl = (GIFT_TEMPLATES[occ] ?? [])[0] ?? "";
    onChange({ occasion: occ, text: firstTpl });
  }

  function applyTemplate(tpl) {
    /* Allow editing/combining: append if user already typed something custom */
    onChange({ occasion, text: tpl });
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22 }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-3 border-t border-cream-dark space-y-3">

        {/* Occasion chips */}
        <div>
          <p className="font-sans text-[10px] font-semibold uppercase tracking-widest
                         text-palm-brown/38 mb-2">Occasion</p>
          <div className="flex flex-wrap gap-1.5">
            {GIFT_OCCASIONS.map((occ) => (
              <button
                key={occ}
                onClick={() => setOccasion(occ)}
                className={[
                  "px-3 py-1 rounded-full border font-sans text-xs font-semibold transition-all",
                  occasion === occ
                    ? "bg-palm-brown border-palm-brown text-cream"
                    : "border-cream-dark text-palm-brown/60 hover:border-palm-brown/40",
                ].join(" ")}
              >
                {occ}
              </button>
            ))}
          </div>
        </div>

        {/* Template suggestions */}
        {templates.length > 0 && (
          <div>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest
                           text-palm-brown/38 mb-2">Quick messages</p>
            <div className="flex flex-col gap-1.5">
              {templates.map((tpl) => (
                <button
                  key={tpl}
                  onClick={() => applyTemplate(tpl)}
                  className={[
                    "text-left px-3 py-2 rounded-xl border font-sans text-sm transition-all",
                    text === tpl
                      ? "border-palm-brown/40 bg-cream-dark text-palm-brown font-semibold"
                      : "border-cream-dark text-palm-brown/60 hover:border-palm-brown/30 hover:bg-cream-dark/40",
                  ].join(" ")}
                >
                  {tpl}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Free-text message */}
        <div>
          <p className="font-sans text-[10px] font-semibold uppercase tracking-widest
                         text-palm-brown/38 mb-1.5">
            {templates.length > 0 ? "Edit or write your own" : "Your message"}
          </p>
          <textarea
            value={text}
            onChange={(e) => onChange({ occasion, text: e.target.value })}
            rows={3}
            placeholder="Type your personalised message here…"
            maxLength={300}
            className="w-full rounded-xl border-2 border-cream-dark bg-cream px-3.5 py-2.5
                       font-sans text-sm text-palm-brown placeholder:text-palm-brown/30
                       focus:outline-none focus:border-palm-brown/40 resize-none
                       transition-colors"
          />
          <p className="font-sans text-[10px] text-palm-brown/30 text-right mt-1">
            {text.length}/300
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STEP 3 — ADDON PHOTO ASSETS
   Realistic Unsplash product photos, one per add-on name.
   Swap src strings here to update images without touching card markup.
   Photos: free to display under Unsplash licence (no attribution required).
═══════════════════════════════════════════════════════════════════════ */
const ADDON_PHOTOS = {
  "Gift Message":    "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&q=80&fit=crop&crop=center",
  "Flowers Bouquet": "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=400&q=80&fit=crop&crop=center",
  "Chocolates":      "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&q=80&fit=crop&crop=center",
  "Bento Cake":      "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=400&q=80&fit=crop&crop=center",
};

/* One-line short descriptions shown on the card (replaces the long backend copy) */
const ADDON_SHORT_DESC = {
  "Gift Message":    "A personalised message for your occasion.",
  "Flowers Bouquet": "Fresh premium blooms for your table.",
  "Chocolates":      "A box of handcrafted premium chocolates.",
  "Bento Cake":      "A cute single-serving celebration cake.",
};

/* ═══════════════════════════════════════════════════════════════════════
   STEP 3 — ADDON CARD
═══════════════════════════════════════════════════════════════════════ */
function AddonCard({ addon, qty, onToggle, onQty, giftMsg, onGiftMsg, compact = false }) {
  const on         = qty > 0;
  const isGiftMsg  = addon.name === GIFT_MSG_NAME;
  const photoSrc   = ADDON_PHOTOS[addon.name];
  const shortDesc  = ADDON_SHORT_DESC[addon.name];

  return (
    <div
      onClick={() => onToggle(addon.id, !on)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(addon.id, !on); } }}
      aria-pressed={on}
      aria-label={on ? `Remove ${addon.name}` : `Add ${addon.name}`}
      className={[
        "rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer",
        on ? "border-palm-brown bg-cream-light shadow-card" : "border-cream-dark bg-cream hover:border-palm-brown/30",
      ].join(" ")}
    >

      {/* Photo strip — only in full (non-compact) mode */}
      {!compact && photoSrc && (
        <div className="relative w-full overflow-hidden" style={{ height: 100 }}>
          <img
            src={photoSrc}
            alt={addon.name}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
          {/* Subtle warm overlay so photo blends with the cream card palette */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom, rgba(74,51,37,0.04) 0%, rgba(74,51,37,0.22) 100%)" }}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Name — Poppins semibold for clean modern feel */}
            <p className="font-poppins font-semibold text-[13px] text-palm-brown leading-snug">{addon.name}</p>
            {!compact && (
              /* Single short line; fall back to backend description if not mapped */
              <p className="font-poppins text-[11px] font-normal text-palm-brown/50 mt-0.5 leading-relaxed truncate">
                {shortDesc ?? addon.description}
              </p>
            )}
            {/* Price — Poppins bold */}
            <p className="font-poppins font-bold text-palm-brown text-sm mt-1">{fmt(addon.price)}</p>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onToggle(addon.id, !on); }}
            aria-pressed={on}
            aria-label={on ? `Remove ${addon.name}` : `Add ${addon.name}`}
            aria-hidden="true"
            tabIndex={-1}
            className={[
              "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5",
              "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown-light",
              on ? "bg-palm-brown border-palm-brown" : "bg-cream border-cream-dark hover:border-palm-brown",
            ].join(" ")}
          >
            {on && (
              <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5"
                strokeLinecap="round" className="w-3 h-3" aria-hidden="true"><path d="M3 8l4 4 6-7"/></svg>
            )}
          </button>
        </div>

      {/* Qty stepper (non-gift addons only) */}
      <AnimatePresence>
        {on && !isGiftMsg && !compact && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }}
            exit={{ opacity:0, height:0 }} transition={{ duration:0.18 }} className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-cream-dark">
              <span className="font-sans text-xs text-palm-brown/45 flex-1">Qty</span>
              <button onClick={() => onQty(addon.id, Math.max(1, qty - 1))} aria-label="Decrease quantity"
                className="w-7 h-7 rounded-full bg-cream-dark text-palm-brown font-bold text-sm
                           hover:bg-palm-brown/10 transition-colors flex items-center justify-center">−</button>
              <span className="font-poppins font-bold text-palm-brown w-4 text-center tabular-nums">{qty}</span>
              <button onClick={() => onQty(addon.id, Math.min(10, qty + 1))} aria-label="Increase quantity"
                className="w-7 h-7 rounded-full bg-cream-dark text-palm-brown font-bold text-sm
                           hover:bg-palm-brown/10 transition-colors flex items-center justify-center">+</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gift message editor */}
      <AnimatePresence>
        {on && isGiftMsg && !compact && (
          <div onClick={(e) => e.stopPropagation()}>
            <GiftMessageEditor giftMsg={giftMsg} onChange={onGiftMsg} />
          </div>
        )}
      </AnimatePresence>
      </div>{/* end p-3 */}
    </div>
  );
}

const RESERVATION_RATE = 200; // ₹200 per hour — booking deposit, deducted from final food bill

function calcDurationHours(startIso, endIso) {
  if (!startIso || !endIso) return 1;
  const start = new Date(startIso.replace("T", " "));
  const end   = new Date(endIso.replace("T", " "));
  const diffMs = end - start;
  if (diffMs <= 0) return 1;
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
}

function ReservationPaymentStage({ date, timeIso, timeToIso, guests, table, user, token, onClose }) {
  const navigate   = useNavigate();
  const { showToast } = useToast();
  const [addons,       setAddons]       = useState([]);
  const [addonQtys,    setAddonQtys]    = useState({});
  const [giftMsg,      setGiftMsg]      = useState({ occasion: "Birthday", text: "" });
  const [addonsLoading,setAddonsLoading]= useState(true);
  const [addonsError,  setAddonsError]  = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetchAddons()
      .then(data => { if (active) setAddons(data.filter(a => a.is_available && a.name !== "Balloon Decoration")); })
      .catch(err  => { if (active) setAddonsError(err.message || "Unable to load add-ons."); })
      .finally(()  => { if (active) setAddonsLoading(false); });
    return () => { active = false; };
  }, []);

  /* ── Derived billing ── */
  const selectedAddons = addons.filter(a => (addonQtys[a.id] ?? 0) > 0);
  const addonTotal = selectedAddons.reduce(
    (sum, a) => sum + (addonQtys[a.id] ?? 0) * Number(a.price), 0
  );
  const durationHours  = calcDurationHours(timeIso, timeToIso);
  const reservationFee = durationHours * RESERVATION_RATE;
  const total          = reservationFee + addonTotal;

  /* ── Display values ── */
  const selectedTableLabel = table ? tableLabel(table.table_number) : "—";
  const selectedTimeRange  = timeIso
    ? (timeToIso ? `${fmtTime(timeIso)} – ${fmtTime(timeToIso)}` : fmtTime(timeIso))
    : "—";

  /* ── Handlers ── */
  function toggleAddon(id, shouldAdd) {
    setAddonQtys(cur => ({ ...cur, [id]: shouldAdd ? 1 : 0 }));
  }
  function setQty(id, qty) {
    setAddonQtys(cur => ({ ...cur, [id]: qty }));
  }

  async function completeTestPayment() {
    if (submittedRef.current || submitting) return;
    if (!user || !token) { setSubmitError("Sign in to complete your reservation."); return; }
    if (!table?.id)      { setSubmitError("Select a table before continuing.");     return; }

    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      /* Build gift message string if Gift Message addon is selected */
      const giftAddon    = addons.find(a => a.name === GIFT_MSG_NAME);
      const giftSelected = giftAddon && (addonQtys[giftAddon.id] ?? 0) > 0;
      const giftMessagePayload = giftSelected && giftMsg.text
        ? `[${giftMsg.occasion}] ${giftMsg.text}`
        : null;

      /* Convert the naive local ISO ("YYYY-MM-DDTHH:MM:SS") to a UTC ISO
         string so the backend receives an unambiguous, timezone-aware value.
         We CANNOT use new Date(timeIso) — that parses a naive string as UTC.
         Instead we split the parts and pass them to the Date constructor,
         which treats positional arguments as local time. */
      const [datePart, timePart] = timeIso.split("T");
      const [year, month, day]   = datePart.split("-").map(Number);
      const [hour, minute]       = timePart.split(":").map(Number);
      const localSlotDate = new Date(year, month - 1, day, hour, minute, 0, 0);
      const reservationTimeUtc = localSlotDate.toISOString(); // e.g. "2026-10-07T13:30:00.000Z"

      const created = await createReservation({
        party_size:       guests,
        reservation_time: reservationTimeUtc,
        table_ids:        [table.id],
        extra_chair:      false,
        addons:           selectedAddons.map(a => ({ addon_id: a.id, quantity: addonQtys[a.id] })),
        gift_message:     giftMessagePayload,
      }, token);

      /* Exact same pattern as Orders checkout — toast then immediate replace navigate */
      showToast(`Reservation confirmed · #${String(created.id).slice(-8).toUpperCase()}`);
      navigate("/my-reservations", { replace: true });
    } catch (err) {
      submittedRef.current = false;
      setSubmitError(err.message || "Payment could not be completed. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Addons + Payment screen ── */
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex max-h-[calc(100dvh-24px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-card"
      style={{ background: "#f7f1e8", borderColor: "#e9dfd2" }}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-cream-dark px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-anton text-xl uppercase text-palm-brown">Add Something Special</h2>
          <p className="mt-1 font-sans text-xs text-palm-brown/60">Make your table a little more special.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close payment stage"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-palm-brown/65 transition-colors hover:bg-cream-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown-light">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 md:overflow-hidden">
        <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:gap-6">

            {/* ── Add-ons list ── */}
            <section aria-labelledby="addons-heading" className="min-w-0">
              <h3 id="addons-heading" className="mb-3 font-poppins text-sm font-semibold uppercase tracking-wide text-palm-brown">Add-ons</h3>
              {addonsLoading && <p className="py-4 font-sans text-sm text-palm-brown/60">Loading add-ons…</p>}
              {addonsError   && <p role="alert" className="py-4 font-sans text-sm text-red-700">{addonsError}</p>}
              {!addonsLoading && !addonsError && (
                <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible"
                  style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
                  {addons.map(addon => (
                    <div key={addon.id} className="shrink-0 w-[72vw] max-w-[260px] sm:w-auto sm:max-w-none"
                      style={{ scrollSnapAlign: "start" }}>
                      <AddonCard
                        addon={addon}
                        qty={addonQtys[addon.id] ?? 0}
                        onToggle={toggleAddon}
                        onQty={setQty}
                        giftMsg={giftMsg}
                        onGiftMsg={setGiftMsg}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Summary + billing sidebar ── */}
            <aside className="flex min-w-0 flex-col rounded-xl border border-cream-dark bg-cream-light p-4 sm:p-5"
              aria-labelledby="reservation-billing-heading">
              <h3 id="reservation-billing-heading"
                className="font-poppins text-sm font-semibold uppercase tracking-wide text-palm-brown">
                Your Reservation
              </h3>

              {/* Booking details — real state, no hardcoding */}
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 font-sans text-sm">
                <dt className="text-palm-brown/55">Guests</dt>
                <dd className="text-right font-medium text-palm-brown">{guests} {guests === 1 ? "Guest" : "Guests"}</dd>
                <dt className="text-palm-brown/55">Date</dt>
                <dd className="text-right font-medium text-palm-brown">{date ? fmtDateFull(date) : "—"}</dd>
                <dt className="text-palm-brown/55">Time</dt>
                <dd className="text-right font-medium text-palm-brown">{selectedTimeRange}</dd>
                <dt className="text-palm-brown/55">Table</dt>
                <dd className="text-right font-medium text-palm-brown">{selectedTableLabel}</dd>
              </dl>

              <div className="my-4 border-t border-cream-dark" />

              {/* Price breakdown */}
              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-palm-brown/55">
                Price Details
              </p>
              <dl className="mt-2 space-y-2 font-sans text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-palm-brown/65">
                    Reservation
                    <span className="ml-1 text-[10px] text-palm-brown/40">({durationHours}h × ₹{RESERVATION_RATE})</span>
                  </dt>
                  <dd className="font-medium text-palm-brown">{fmt(reservationFee)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-palm-brown/65">Add-ons</dt>
                  <dd className="font-medium text-palm-brown">{fmt(addonTotal)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-baseline justify-between border-t border-cream-dark pt-3">
                <span className="font-poppins text-base font-bold text-palm-brown">Total</span>
                <span className="font-poppins text-xl font-bold text-palm-brown">{fmt(total)}</span>
              </div>

              <p className="mt-2 font-sans text-[10px] text-palm-brown/45 leading-relaxed">
                The {fmt(reservationFee)} deposit ({durationHours}h × ₹{RESERVATION_RATE}/hr) will be deducted from your final food bill.
              </p>

              {!user && (
                <p className="mt-3 font-sans text-xs text-palm-brown/65">
                  Sign in is required before completing your reservation.
                </p>
              )}

              {submitError && (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-700">
                  {submitError}
                </p>
              )}

              {user && token ? (
                <button
                  type="button"
                  disabled={addonsLoading || Boolean(addonsError) || submitting}
                  onClick={completeTestPayment}
                  className="mt-4 flex min-h-12 w-full items-center justify-center rounded-md bg-palm-brown px-5 font-sans text-sm font-bold text-cream transition-colors hover:bg-palm-brown-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown-light disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/>
                      </svg>
                      Processing…
                    </span>
                  ) : `Pay ${fmt(total)} →`}
                </button>
              ) : (
                <Link
                  to="/login"
                  className="mt-4 flex min-h-12 w-full items-center justify-center rounded-md bg-palm-brown px-5 font-sans text-sm font-bold text-cream transition-colors hover:bg-palm-brown-dark"
                >
                  Sign in to continue
                </Link>
              )}

              <p className="mt-2 text-center font-sans text-[10px] text-palm-brown/40 tracking-wide">
                Test payment · No real payment charged
              </p>
            </aside>
          </div>
      </div>
    </motion.section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STEP 3 — SUMMARY ROW
═══════════════════════════════════════════════════════════════════════ */
function SummaryRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base w-5 text-center shrink-0 mt-0.5" aria-hidden="true">{icon}</span>
      <span className="font-sans text-[10px] font-semibold uppercase tracking-widest
                       text-palm-brown/38 w-14 shrink-0 pt-0.5">{label}</span>
      <span className="font-sans text-sm font-semibold text-palm-brown flex-1 leading-snug">{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STEP 3 — CONFIRM STEP
═══════════════════════════════════════════════════════════════════════ */
function ConfirmStep({
  date, timeIso, timeToIso, guests, selectedIds, allTables,
  addonQtys, setAddonQtys,
  giftMsg, setGiftMsg,
  extraChair, setExtraChair,
  onSubmit, submitting, submitError,
  user,
}) {
  const navigate = useNavigate();
  const [addonsData,    setAddonsData]    = useState([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [addonsError,   setAddonsError]   = useState(null);

  useEffect(() => {
    fetchAddons()
      .then((data) => setAddonsData(data.filter((a) => a.name !== "Balloon Decoration")))
      .catch((e) => setAddonsError(e.message || "Failed to load add-ons."))
      .finally(() => setAddonsLoading(false));
  }, []);

  const selectedTables = allTables.filter((t) => selectedIds.includes(t.id));
  const totalCapacity  = selectedTables.reduce((s, t) => s + t.capacity, 0);
  const isCombo        = selectedIds.length > 1;

  const addonTotal = addonsData.reduce(
    (sum, a) => sum + (addonQtys[a.id] ?? 0) * parseFloat(a.price), 0
  );

  function toggleAddon(id, on)  { setAddonQtys((p) => ({ ...p, [id]: on ? 1 : 0 })); }
  function setQty(id, qty)      { setAddonQtys((p) => ({ ...p, [id]: qty })); }

  /* Table summary label */
  const tableSummary = isCombo
    ? selectedTables.map((t) => tableLabel(t.table_number)).join(" + ") + ` · Combined seats ${totalCapacity}`
    : selectedTables[0]
      ? `${tableLabel(selectedTables[0].table_number)} · Seats ${totalCapacity}`
      : "—";

  return (
    <div>
      <h2 className="font-serif text-2xl text-palm-brown mb-6">Review & Confirm</h2>

      {/* Summary */}
      <div className="rounded-2xl border border-cream-dark bg-cream-light px-5 py-5 mb-6 space-y-3.5">
        <SummaryRow icon="📅" label="Date"   value={fmtDateFull(date)} />
        <SummaryRow icon="🕐" label="Time"
          value={timeToIso ? `${fmtTime(timeIso)} – ${fmtTime(timeToIso)}` : fmtTime(timeIso)} />
        <SummaryRow icon="👥" label="Guests" value={`${guests} ${guests === 1 ? "guest" : "guests"}`} />
        <SummaryRow icon={selectedTables[0] ? tableIcon(selectedTables[0].table_number) : "🪑"}
          label="Table" value={tableSummary} />
      </div>

      {/* Extra chair */}
      <div
        role="checkbox" aria-checked={extraChair} tabIndex={0}
        onClick={() => setExtraChair((v) => !v)}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setExtraChair((v) => !v)}
        className="flex items-center gap-3 cursor-pointer mb-6 group select-none"
      >
        <div className={[
          "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
          extraChair ? "bg-palm-brown border-palm-brown" : "bg-cream border-cream-dark group-hover:border-palm-brown",
        ].join(" ")}>
          {extraChair && (
            <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5"
              strokeLinecap="round" className="w-3 h-3" aria-hidden="true"><path d="M3 8l4 4 6-7"/></svg>
          )}
        </div>
        <div>
          <p className="font-sans text-sm font-semibold text-palm-brown">Request an extra chair</p>
          <p className="font-sans text-xs text-palm-brown/40 mt-0.5">
            We'll add one more chair to your table if space allows.
          </p>
        </div>
      </div>

      {/* Add-ons */}
      <div className="mb-6">
        <p className="font-sans text-[10px] font-semibold uppercase tracking-widest
                       text-palm-brown/38 mb-3">Optional Add-ons</p>
        {addonsLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1,2,3].map((i) => <div key={i} className="h-24 rounded-2xl bg-cream-dark animate-pulse" />)}
          </div>
        )}
        {addonsError && <p className="font-sans text-sm text-red-600">{addonsError}</p>}
        {!addonsLoading && !addonsError && (
          <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible"
            style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
            {addonsData.map((a) => (
              <div key={a.id} className="shrink-0 w-[72vw] max-w-[260px] sm:w-auto sm:max-w-none"
                style={{ scrollSnapAlign: "start" }}>
                <AddonCard
                  addon={a}
                  qty={addonQtys[a.id] ?? 0}
                  onToggle={toggleAddon}
                  onQty={setQty}
                  giftMsg={giftMsg}
                  onGiftMsg={setGiftMsg}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add-on total */}
      {addonTotal > 0 && (
        <div className="rounded-xl border border-cream-dark bg-cream px-4 py-3 mb-5
                         flex justify-between items-center">
          <span className="font-sans text-sm text-palm-brown/55">Add-ons total</span>
          <span className="font-poppins font-bold text-palm-brown">{fmt(addonTotal)}</span>
        </div>
      )}

      {/* Auth gate */}
      {!user && (
        <div className="rounded-2xl border border-palm-brown/20 bg-palm-brown/5 px-5 py-4 mb-5">
          <p className="font-sans text-sm font-semibold text-palm-brown">Sign in to complete your reservation</p>
          <p className="font-sans text-xs text-palm-brown/45 mt-0.5">
            Your selections are saved — log in and come right back.
          </p>
          <button onClick={() => navigate("/login")} className="mt-3 btn-primary text-sm px-6 py-2">
            Log in
          </button>
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-5">
          <p className="font-sans text-sm font-semibold text-red-700">Booking failed</p>
          <p className="font-sans text-xs text-red-600/80 mt-0.5">{submitError}</p>
        </div>
      )}

      {/* Confirm button */}
      {user && (
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="btn-primary w-full justify-center gap-2.5
                     disabled:opacity-55 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor"
                  strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/>
              </svg>
              Confirming…
            </>
          ) : "Confirm Reservation"}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CONFIRMATION SCREEN
═══════════════════════════════════════════════════════════════════════ */
function ConfirmationScreen({ reservation, giftMsg, onNewBooking }) {
  const rt = new Date(reservation.reservation_time);

  return (
    <motion.div
      initial={{ opacity:0, y:20 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.45, ease:[0.22,1,0.36,1] }}
      className="max-w-lg mx-auto"
    >
      {/* Check */}
      <div className="flex flex-col items-center text-center mb-8">
        <motion.div
          initial={{ scale:0.6, opacity:0 }}
          animate={{ scale:1, opacity:1 }}
          transition={{ delay:0.1, duration:0.45, ease:[0.34,1.56,0.64,1] }}
          className="w-20 h-20 rounded-full bg-palm-brown flex items-center justify-center
                     shadow-[0_0_0_10px_rgba(74,51,37,0.1)] mb-5"
        >
          <svg viewBox="0 0 32 32" fill="none" stroke="white" strokeWidth="2.5"
            strokeLinecap="round" className="w-10 h-10" aria-hidden="true">
            <path d="M6 16l7 7 13-13"/>
          </svg>
        </motion.div>
        <h2 className="font-serif text-3xl text-palm-brown">You're all set!</h2>
        <p className="font-sans text-sm text-palm-brown/50 mt-2 max-w-xs leading-relaxed">
          Your table is reserved. We look forward to welcoming you.
        </p>
      </div>

      {/* Receipt */}
      <div className="rounded-3xl border-2 border-cream-dark bg-cream-light overflow-hidden shadow-card mb-6">
        <div className="h-2 bg-btn-gradient" aria-hidden="true"/>
        <div className="px-6 py-6 space-y-4">
          {/* Ref */}
          <div className="flex items-center justify-between">
            <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-palm-brown/38">
              Booking Ref
            </span>
            <span className="font-poppins font-bold text-sm text-palm-brown-light tracking-widest">
              #{String(reservation.id).slice(-8).toUpperCase()}
            </span>
          </div>

          <div className="h-px bg-cream-dark"/>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <div>
              <p className="font-sans text-[10px] uppercase tracking-widest text-palm-brown/35 mb-0.5">Date</p>
              <p className="font-poppins font-bold text-sm text-palm-brown">{fmtDateFull(rt)}</p>
            </div>
            <div>
              <p className="font-sans text-[10px] uppercase tracking-widest text-palm-brown/35 mb-0.5">Time</p>
              <p className="font-poppins font-bold text-sm text-palm-brown">
                {fmtTime(reservation.reservation_time)}
              </p>
            </div>
            <div>
              <p className="font-sans text-[10px] uppercase tracking-widest text-palm-brown/35 mb-0.5">Guests</p>
              <p className="font-poppins font-bold text-sm text-palm-brown">{reservation.party_size}</p>
            </div>
            <div>
              <p className="font-sans text-[10px] uppercase tracking-widest text-palm-brown/35 mb-0.5">Status</p>
              <span className="inline-flex items-center gap-1.5 rounded-full
                               bg-emerald-50 border border-emerald-200 text-emerald-700
                               font-sans text-xs font-semibold px-2.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true"/>
                Confirmed
              </span>
            </div>
          </div>

          {/* Add-ons */}
          {reservation.addons?.length > 0 && (
            <>
              <div className="h-px bg-cream-dark"/>
              <div>
                <p className="font-sans text-[10px] uppercase tracking-widest text-palm-brown/35 mb-2.5">Add-ons</p>
                <div className="space-y-2">
                  {reservation.addons.map((a) => (
                    <div key={a.id} className="flex justify-between items-baseline">
                      <span className="font-sans text-sm text-palm-brown">
                        <span className="font-menu">{a.addon_name}</span><span className="text-palm-brown/40 ml-1">× {a.quantity}</span>
                      </span>
                      <span className="font-sans text-sm font-semibold text-palm-brown">{fmt(a.line_total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-baseline pt-2.5 mt-1.5 border-t border-cream-dark">
                  <span className="font-sans text-sm font-semibold text-palm-brown">Total</span>
                  <span className="font-poppins font-bold text-palm-brown">{fmt(reservation.addon_total)}</span>
                </div>
              </div>
            </>
          )}

          {/* Gift message preview */}
          {giftMsg?.text && (
            <>
              <div className="h-px bg-cream-dark"/>
              <div>
                <p className="font-sans text-[10px] uppercase tracking-widest text-palm-brown/35 mb-1.5">
                  Gift Message
                  {giftMsg.occasion && (
                    <span className="ml-2 text-palm-brown-light normal-case font-semibold">
                      · {giftMsg.occasion}
                    </span>
                  )}
                </p>
                <p className="font-sans text-sm text-palm-brown/70 italic leading-relaxed">
                  "{giftMsg.text}"
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={onNewBooking} className="flex-1 btn-secondary text-sm py-2.5">
          Book Another Table
        </button>
        <Link to="/" className="flex-1 btn-primary text-sm py-2.5 text-center">
          Back to Menu
        </Link>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HERO BOOKING PANEL
   Reference: T SHORE restaurant — cinematic hero, centered title block,
   wide dark booking panel, trust row below.
═══════════════════════════════════════════════════════════════════════ */

/* ── Calendar popover — compact monthly date picker ── */
function CalendarPopover({ selected, onCancel, onApply }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 30);

  const [draft, setDraft] = useState(selected);
  const initMonth = selected ?? today;
  const [viewYear, setViewYear] = useState(initMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initMonth.getMonth());
  const minMonthKey = today.getFullYear() * 12 + today.getMonth();
  const maxMonthKey = maxDate.getFullYear() * 12 + maxDate.getMonth();
  const viewMonthKey = viewYear * 12 + viewMonth;

  function changeMonth(offset) {
    const next = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(viewYear, viewMonth, 1 - mondayOffset);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          disabled={viewMonthKey <= minMonthKey}
          aria-label="Previous month"
          className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-colors hover:bg-[#eee4d7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d6e56] disabled:cursor-not-allowed disabled:opacity-30"
          style={{ color: "#614633" }}
        >
          ‹
        </button>
        <h2 className="font-anton text-center text-base uppercase tracking-[0.08em]"
          style={{ color: "#3e2b20" }}>
          {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(firstOfMonth)}
        </h2>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          disabled={viewMonthKey >= maxMonthKey}
          aria-label="Next month"
          className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-colors hover:bg-[#eee4d7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d6e56] disabled:cursor-not-allowed disabled:opacity-30"
          style={{ color: "#614633" }}
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7">
        {weekdays.map(day => (
          <div key={day} className="py-1 text-center font-sans text-[10px] font-semibold tracking-[0.08em]"
            style={{ color: "#927d6b" }}>{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0">
        {cells.map(cellDate => {
          const isInMonth = cellDate.getMonth() === viewMonth;
          const isDisabled = cellDate < today || cellDate > maxDate;
          const isSelected = draft && cellDate.toDateString() === draft.toDateString();
          const isToday = cellDate.toDateString() === today.toDateString();

          return (
            <button
              key={cellDate.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                setDraft(cellDate);
                if (!isInMonth) {
                  setViewYear(cellDate.getFullYear());
                  setViewMonth(cellDate.getMonth());
                }
              }}
              aria-label={cellDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              aria-pressed={Boolean(isSelected)}
              className="mx-auto flex h-11 w-11 items-center justify-center rounded-full font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d6e56] disabled:cursor-not-allowed"
              style={{
                background: isSelected ? "#493224" : isToday ? "#eee4d7" : "transparent",
                color: isSelected ? "#fff8ee" : isDisabled || !isInMonth ? "#c6b9aa" : "#49382b",
                fontWeight: isSelected ? 600 : 400,
                boxShadow: isToday && !isSelected ? "inset 0 0 0 1px #b9a48f" : "none",
                opacity: isDisabled && isInMonth ? 0.48 : 1,
              }}
            >
              {cellDate.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end gap-3 border-t pt-3" style={{ borderColor: "#e9dfd2" }}>
        <button type="button" onClick={onCancel}
          className="min-h-11 rounded-md border px-5 font-sans text-sm font-medium transition-colors hover:bg-[#eee4d7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d6e56]"
          style={{ borderColor: "#cdbba8", color: "#614633" }}>
          Cancel
        </button>
        <button type="button" onClick={() => onApply(draft)} disabled={!draft}
          className="min-h-11 rounded-md px-6 font-sans text-sm font-medium transition-colors hover:bg-[#38251a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d6e56] disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: "#493224", color: "#fff8ee" }}>
          Apply
        </button>
      </div>
    </div>
  );
}

const TIME_WHEEL_ROW_HEIGHT = 48;
const TIME_WHEEL_CENTER_INDEX = 4;
const TIME_WHEEL_CYCLE_SIZE = 9;

function createWheelCycle(values, selectedValue) {
  if (!values.length) return [];
  const selectedIndex = Math.max(0, values.indexOf(selectedValue));
  return Array.from({ length: TIME_WHEEL_CYCLE_SIZE }, (_, index) => {
    const valueIndex = selectedIndex + index - TIME_WHEEL_CENTER_INDEX;
    return values[(valueIndex + values.length * TIME_WHEEL_CYCLE_SIZE) % values.length];
  });
}

function TimeWheelColumn({ label, options, selectedValue, onSelect }) {
  const listRef = useRef(null);
  const snapRef = useRef(null);
  const optionSignature = options.join("|");
  const items = createWheelCycle(options, selectedValue);
  const [centeredIndex, setCenteredIndex] = useState(TIME_WHEEL_CENTER_INDEX);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    setCenteredIndex(TIME_WHEEL_CENTER_INDEX);
    list.scrollTo({ top: TIME_WHEEL_CENTER_INDEX * TIME_WHEEL_ROW_HEIGHT, behavior: "auto" });
  }, [optionSignature, selectedValue]);

  useEffect(() => () => clearTimeout(snapRef.current), []);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const nearestIndex = Math.max(0, Math.min(items.length - 1,
      Math.round(list.scrollTop / TIME_WHEEL_ROW_HEIGHT)));
    setCenteredIndex(nearestIndex);
    clearTimeout(snapRef.current);
    snapRef.current = setTimeout(() => {
      const currentList = listRef.current;
      if (!currentList) return;
      const index = Math.max(0, Math.min(items.length - 1,
        Math.round(currentList.scrollTop / TIME_WHEEL_ROW_HEIGHT)));
      currentList.scrollTo({ top: index * TIME_WHEEL_ROW_HEIGHT, behavior: "smooth" });
      setCenteredIndex(index);
      if (items[index] !== selectedValue) onSelect(items[index], index - TIME_WHEEL_CENTER_INDEX);
    }, 110);
  }

  function selectIndex(index) {
    listRef.current?.scrollTo({ top: index * TIME_WHEEL_ROW_HEIGHT, behavior: "smooth" });
    setCenteredIndex(index);
    if (items[index] !== selectedValue) onSelect(items[index], index - TIME_WHEEL_CENTER_INDEX);
  }

  function handleKeyDown(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    selectIndex(Math.max(0, Math.min(items.length - 1, centeredIndex + direction)));
  }

  return (
    <div className="relative h-[240px] min-w-0 overflow-hidden">
      <ul
        ref={listRef}
        className="time-wheel-list h-full overflow-y-scroll focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8d6e56]"
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        style={{
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
        }}
        role="listbox"
        aria-label={`${label} time`}
        tabIndex={0}
      >
        <li aria-hidden="true" style={{ height: TIME_WHEEL_ROW_HEIGHT * 2, scrollSnapAlign: "none" }} />
        {items.map((value, index) => {
          const distance = Math.abs(index - centeredIndex);
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.58 : distance === 2 ? 0.3 : 0.16;
          const scale = distance === 0 ? 1 : distance === 1 ? 0.9 : distance === 2 ? 0.82 : 0.74;
          const verticalOffset = label === "Hour" ? 0 : 2;
          return (
            <li
              key={`${label}-${index}-${value}`}
              className="font-sans"
              role="option"
              aria-selected={index === centeredIndex}
              aria-label={`${label} ${value}`}
              onClick={() => selectIndex(index)}
              style={{
                height: TIME_WHEEL_ROW_HEIGHT,
                scrollSnapAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                opacity,
                transform: `translateY(${verticalOffset}px) scale(${scale})`,
                transition: "opacity 0.14s ease, transform 0.14s ease",
                color: distance === 0 ? "#493224" : "#806b59",
                fontSize: distance === 0 ? "1.7rem" : "1.35rem",
                fontWeight: distance === 0 ? 600 : 400,
                userSelect: "none",
              }}
            >
              {value}
            </li>
          );
        })}
        <li aria-hidden="true" style={{ height: TIME_WHEEL_ROW_HEIGHT * 2, scrollSnapAlign: "none" }} />
      </ul>
      <style>{`.time-wheel-list::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

/* ── Time popover — three linked, snapping time wheels ── */
function TimePopover({ date, selectedIso, minIso, maxIso, title, onCancel, onConfirm }) {
  const slots = date ? makeSlots(date).filter(slot =>
    (!minIso || slot.iso > minIso) && (!maxIso || slot.iso <= maxIso)
  ) : [];
  const defaultIso = selectedIso ?? (minIso
    ? slots.find(slot => isoToMins(slot.iso) >= isoToMins(minIso) + 60)?.iso ?? slots[slots.length - 1]?.iso ?? null
    : slots[0]?.iso ?? null);
  const [localIso, setLocalIso] = useState(defaultIso);

  useEffect(() => {
    setLocalIso(selectedIso && slots.some(slot => slot.iso === selectedIso) ? selectedIso : defaultIso);
  }, [date, minIso, maxIso, selectedIso, defaultIso]);

  const slotParts = slots.map(slot => {
    const [hour24, minute] = slot.iso.split("T")[1].split(":").map(Number);
    return {
      iso: slot.iso,
      hour12: hour24 % 12 || 12,
      minute,
      period: hour24 < 12 ? "AM" : "PM",
      totalMinutes: hour24 * 60 + minute,
    };
  });
  const current = slotParts.find(slot => slot.iso === localIso) ?? slotParts[0];

  function closestSlot(candidates) {
    if (!candidates.length || !current) return null;
    return candidates.reduce((closest, slot) =>
      Math.abs(slot.totalMinutes - current.totalMinutes) < Math.abs(closest.totalMinutes - current.totalMinutes)
        ? slot
        : closest
    );
  }

  function chooseHour(hour) {
    const match = closestSlot(slotParts.filter(slot => slot.hour12 === Number(hour)));
    if (match) setLocalIso(match.iso);
  }

  function chooseMinute(_minute, minuteOffset) {
    const targetMinutes = Math.max(slotParts[0]?.totalMinutes ?? 11 * 60,
      Math.min(slotParts[slotParts.length - 1]?.totalMinutes ?? 23 * 60,
      current.totalMinutes + minuteOffset));
    const match = slotParts.find(slot => slot.totalMinutes === targetMinutes);
    if (match) setLocalIso(match.iso);
  }

  function choosePeriod(period) {
    const candidates = slotParts.filter(slot => slot.period === period);
    const exact = candidates.find(slot =>
      slot.hour12 === current.hour12 && slot.minute === current.minute
    );
    const match = exact ?? closestSlot(candidates);
    if (match) setLocalIso(match.iso);
  }

  const hourOptions = [...new Set(slotParts.map(slot => String(slot.hour12)))];
  const minuteOptions = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));
  const periodOptions = [...new Set(slotParts.map(slot => slot.period))];

  return (
    <div className="w-full">
      <p className="mb-3 text-center font-anton text-base uppercase tracking-[0.08em]"
        style={{ color: "#493224" }}>
        {title}
      </p>

      <div className="mb-1 grid grid-cols-3 gap-1 text-center font-sans text-[10px] font-semibold uppercase tracking-[0.08em] sm:gap-3"
        style={{ color: "#927d6b" }}>
        <span>Hour</span>
        <span>Minute</span>
        <span>AM / PM</span>
      </div>

      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-1 z-0 rounded-lg"
          style={{
            top: TIME_WHEEL_ROW_HEIGHT * 2,
            height: TIME_WHEEL_ROW_HEIGHT,
            background: "rgba(107,77,56,0.07)",
            borderTop: "1px solid rgba(107,77,56,0.14)",
            borderBottom: "1px solid rgba(107,77,56,0.14)",
          }} />

        <div className="relative z-[1] grid grid-cols-3 gap-1 sm:gap-3">
          <TimeWheelColumn label="Hour" options={hourOptions}
            selectedValue={current ? String(current.hour12) : ""} onSelect={chooseHour} />
          <TimeWheelColumn label="Minute" options={minuteOptions}
            selectedValue={current ? String(current.minute).padStart(2, "0") : ""} onSelect={chooseMinute} />
          <TimeWheelColumn label="AM / PM" options={periodOptions}
            selectedValue={current?.period ?? ""} onSelect={choosePeriod} />
        </div>

        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10"
          style={{ height: TIME_WHEEL_ROW_HEIGHT * 2, background: "linear-gradient(to bottom, #f7f1e8 8%, rgba(247,241,232,0) 100%)" }} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
          style={{ height: TIME_WHEEL_ROW_HEIGHT * 2, background: "linear-gradient(to top, #f7f1e8 8%, rgba(247,241,232,0) 100%)" }} />
      </div>

      <p className="mt-3 text-center font-sans text-[11px] font-medium uppercase tracking-[0.04em]"
        style={{ color: "#927d6b" }}>
        Open daily · 11 AM – 11 PM
      </p>

      <div className="mt-4 flex justify-end gap-3 border-t pt-3" style={{ borderColor: "#e9dfd2" }}>
        <button type="button" onClick={onCancel}
          className="min-h-11 rounded-md border px-5 font-sans text-sm font-medium transition-colors hover:bg-[#eee4d7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d6e56]"
          style={{ borderColor: "#cdbba8", color: "#614633" }}>
          Cancel
        </button>
        <button type="button" onClick={() => localIso && onConfirm(localIso)} disabled={!localIso}
          className="min-h-11 rounded-md px-6 font-sans text-sm font-medium transition-colors hover:bg-[#38251a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d6e56] disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: "#493224", color: "#fff8ee" }}>
          Save
        </button>
      </div>
    </div>
  );
}

/* ── Hero Booking Panel ── */
const PANEL_BG  = "rgba(28,18,11,0.90)";
const PANEL_BDR = "1px solid rgba(168,149,127,0.20)";

function HeroBookingPanel({ date, guests, timeIso, timeToIso, timePickerRequest, onDateChange, onGuestsChange, onTimeChange, onTimeToChange, onBook, bookError }) {
  const [open, setOpen] = useState(null); // "people"|"date"|"time"|null
  const [timeStage, setTimeStage] = useState("start");
  const panelRef = useRef(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    function h(e) { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(null); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    function h(e) { if (e.key === "Escape") setOpen(null); }
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (timePickerRequest > 0) {
      setTimeStage("start");
      setOpen("time");
    }
  }, [timePickerRequest]);

  /* Format display values */
  const peopleLbl = `${guests} ${guests === 1 ? "Person" : "People"}`;
  const dateLbl   = date
    ? `${String(date.getDate()).padStart(2,"0")} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`
    : "Select Date";
  const timeLbl   = timeIso
    ? `${fmtTime(timeIso)}${timeToIso ? ` – ${fmtTime(timeToIso)}` : ""}`
    : "Select start time";

  /* Field button — reused for all three */
  function Field({ id, icon, label, value, hasValue, disabled: dis, onOpen }) {
    const isOpen = open === id;
    return (
      <button
        onClick={() => {
          if (dis) return;
          if (!isOpen) onOpen?.();
          setOpen(isOpen ? null : id);
        }}
        disabled={dis}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative flex-1 flex items-center gap-3 px-5 py-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4955a]/50"
        style={{
          background: isOpen ? "rgba(212,149,90,0.08)" : "transparent",
          opacity: dis ? 0.4 : 1,
          cursor: dis ? "not-allowed" : "pointer",
          borderRadius: 0,
        }}
      >
        {/* Icon */}
        <span style={{ color:"#a8957f", flexShrink:0 }}>{icon}</span>
        {/* Text */}
        <span className="flex flex-col gap-0 min-w-0">
          <span style={{ fontFamily:"'Poppins',sans-serif", fontSize:"0.62rem", fontWeight:600,
            letterSpacing:"0.18em", textTransform:"uppercase", color:"#a8957f" }}>{label}</span>
          <span style={{ fontFamily:"'Poppins',sans-serif", fontSize:"0.95rem", fontWeight:600,
            color: hasValue ? "#f6ece0" : "#6b4d38", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {value}
          </span>
        </span>
        {/* Chevron */}
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className="w-3 h-3 ml-auto shrink-0" style={{ color:"#a8957f",
            transform: isOpen ? "rotate(180deg)" : "none", transition:"transform 0.2s" }} aria-hidden="true">
          <path d="M2 4l4 4 4-4"/>
        </svg>
      </button>
    );
  }

  /* Vertical divider */
  const Divider = () => (
    <div style={{ width:1, alignSelf:"stretch", background:"rgba(168,149,127,0.18)", flexShrink:0, margin:"12px 0" }} aria-hidden="true"/>
  );

  return (
    <div ref={panelRef} className="relative w-full max-w-4xl mx-auto px-4">

      {/* ── Desktop & Mobile panel ── */}
      <div
        className="rounded-[1.25rem] overflow-visible"
        style={{ background: PANEL_BG, border: PANEL_BDR, boxShadow:"0 12px 48px rgba(0,0,0,0.55)" }}
      >
        {/* Controls row */}
        <div className="flex flex-col sm:flex-row items-stretch">

          {/* People */}
          <Field id="people" hasValue={true} label="People"
            value={peopleLbl}
            icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="8" cy="6" r="3"/><path d="M2 18c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="15" cy="7" r="2.5"/><path d="M18 17.5c0-2.5-1.6-4.5-3.5-4.5"/></svg>}
          />
          <Divider />

          {/* Date */}
          <Field id="date" hasValue={Boolean(date)} label="Date"
            value={dateLbl}
            icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="4" width="16" height="14" rx="2"/><path d="M2 8h16M6 2v4M14 2v4"/></svg>}
          />
          <Divider />

          {/* Time */}
          <div className="flex-1">
            <Field id="time" hasValue={Boolean(timeIso)} label="Time"
              value={timeLbl} disabled={!date} onOpen={() => setTimeStage("start")}
              icon={<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l3 2"/></svg>}
            />
          </div>

          {/* CTA */}
          <div className="flex items-center px-4 py-3 sm:py-0">
            <button
              onClick={onBook}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-[0.625rem] font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6d9a4]/60 active:scale-[0.98]"
              style={{ background:"#f6d9a4", color:"#17100a", fontFamily:"'Poppins',sans-serif",
                fontSize:"0.8rem", letterSpacing:"0.12em", textTransform:"uppercase",
                whiteSpace:"nowrap", minWidth:160 }}
            >
              Book a Table
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg>
            </button>
          </div>
        </div>

        {/* Error */}
        {bookError && (
          <div className="px-5 pb-4">
            <p style={{ fontFamily:"'Poppins',sans-serif", fontSize:"0.75rem", color:"#f87171" }}>{bookError}</p>
          </div>
        )}
      </div>

      {/* ── Dropdown panels ── */}
      <AnimatePresence>
        {open === "people" && (
          <motion.div key="pop-people"
            initial={{ opacity:0, scale:0.98 }} animate={{ opacity:1, scale:1 }}
            exit={{ opacity:0, scale:0.98 }} transition={{ duration:0.16, ease:[0.22,1,0.36,1] }}
            className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-3"
          >
            <div className="pointer-events-auto w-full max-w-[400px] rounded-xl border p-3 shadow-2xl"
              style={{ background:"#f7f1e8", borderColor:"#e9dfd2", boxShadow:"0 16px 48px rgba(25,15,9,0.35)" }}
              role="dialog" aria-label="Select number of people">
              <p className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color:"#927d6b" }}>Number of Guests</p>
              <div className="grid grid-cols-5 gap-2">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n} onClick={() => { onGuestsChange(n); setOpen(null); }}
                    className="flex h-11 items-center justify-center rounded-full border font-sans text-sm font-semibold transition-colors hover:bg-[#eee4d7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d6e56]"
                    style={{
                      background: guests === n ? "#493224" : "transparent",
                      borderColor: guests === n ? "#493224" : "#e9dfd2",
                      color: guests === n ? "#fff8ee" : "#49382b",
                    }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {open === "date" && (
          <motion.div key="pop-date"
            initial={{ opacity:0, scale:0.98 }} animate={{ opacity:1, scale:1 }}
            exit={{ opacity:0, scale:0.98 }} transition={{ duration:0.16, ease:[0.22,1,0.36,1] }}
            className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-3"
          >
            <div className="pointer-events-auto max-h-[calc(100dvh-24px)] w-full max-w-[400px] overflow-y-auto rounded-xl border p-3 shadow-2xl"
              style={{ background:"#f7f1e8", borderColor:"#e9dfd2", boxShadow:"0 16px 48px rgba(25,15,9,0.35)" }}
              role="dialog" aria-label="Select date">
              <CalendarPopover
                selected={date}
                onCancel={() => setOpen(null)}
                onApply={(d) => { if (d) onDateChange(d); setOpen(null); }}
              />
            </div>
          </motion.div>
        )}

        {open === "time" && date && (
          <motion.div key="pop-time"
            initial={{ opacity:0, scale:0.98 }} animate={{ opacity:1, scale:1 }}
            exit={{ opacity:0, scale:0.98 }} transition={{ duration:0.16, ease:[0.22,1,0.36,1] }}
            className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-3"
          >
            <div className="pointer-events-auto max-h-[calc(100dvh-24px)] w-full max-w-[400px] overflow-y-auto rounded-xl border p-3 shadow-xl"
              style={{ background:"#f7f1e8", borderColor:"#e9dfd2", boxShadow:"0 12px 32px rgba(25,15,9,0.2)" }}
              role="dialog" aria-label="Select time">
              <TimePopover
                date={date}
                selectedIso={timeStage === "start" ? timeIso : timeToIso}
                minIso={timeStage === "end" ? timeIso : null}
                maxIso={timeStage === "start"
                  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T22:59:00`
                  : null}
                title={timeStage === "start" ? "Select start time" : "Select end time"}
                onCancel={() => {
                  if (timeStage === "end") setTimeStage("start");
                  else setOpen(null);
                }}
                onConfirm={(iso) => {
                  if (timeStage === "start") {
                    onTimeChange(iso);
                    setTimeStage("end");
                  } else {
                    onTimeToChange(iso);
                    setOpen(null);
                  }
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION LABEL — compact header for each card section.
   Shows a small numbered circle, the section title, and a summary
   of the selection once completed.
═══════════════════════════════════════════════════════════════════════ */
function SectionLabel({ number, title, done, summary }) {
  return (
    <div className="flex items-center gap-3">
      <div className={[
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
        "font-poppins font-bold text-xs transition-colors duration-300",
        done ? "bg-palm-brown text-cream" : "bg-cream-dark text-palm-brown/50",
      ].join(" ")} aria-hidden="true">
        {done
          ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" className="w-3.5 h-3.5"><path d="M3 8l4 4 6-7"/></svg>
          : number}
      </div>
      <div className="min-w-0">
        <p className="font-poppins font-bold text-sm text-palm-brown leading-none">{title}</p>
        {summary && (
          <p className="font-sans text-xs text-palm-brown-light font-semibold mt-0.5 truncate">
            {summary}
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ROOT — MAIN PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function Reservation() {
  const { user, token } = useAuth();

  const [date,      setDate]      = useState(null);
  const [timeIso,   setTimeIso]   = useState(null);
  const [timeToIso, setTimeToIso] = useState(null);
  const [guests,    setGuests]    = useState(2);
  const [bookError, setBookError] = useState(null);
  const [tableSelectionOpen, setTableSelectionOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [reservationStage, setReservationStage] = useState("table");
  const [timePickerRequest, setTimePickerRequest] = useState(0);

  const selectTable = useCallback((tableId) => {
    setSelectedTableId(tableId);
    if (!tableId) setSelectedTable(null);
  }, []);

  function selectDate(d)   { setDate(d); setTimeIso(null); setTimeToIso(null); }
  function changeGuests(n) { setGuests(n); }

  function handleBarBook() {
    setBookError(null);
    if (!date)    { setBookError("Please select a date.");  return; }
    if (!Number.isInteger(guests) || guests < 1) { setBookError("Please select the number of guests."); return; }
    if (!timeIso) { setBookError("Please select a time.");  return; }
    if (!timeToIso || new Date(timeToIso) <= new Date(timeIso)) {
      setBookError("Please select an end time later than the start time.");
      return;
    }
    const [, t] = timeIso.split("T");
    const h = parseInt(t, 10);
    if (h < 11 || h > 23) { setBookError("Reservations are available 11 AM – 11 PM only."); return; }
    const now = new Date();
    const slotDate = new Date(timeIso.replace("T", " "));
    if (slotDate <= now) { setBookError("Please select a future time."); return; }
    setSelectedTableId(null);
    setSelectedTable(null);
    setReservationStage("table");
    setTableSelectionOpen(true);
  }

  /* ── Render ── */
  return (
    <div
      className="min-h-screen relative"
      style={{
        backgroundImage:    `url(${resBgDesktop})`,
        backgroundSize:     "cover",
        backgroundPosition: "center",
        backgroundRepeat:   "no-repeat",
      }}
    >
      {/* Mobile background */}
      <div className="sm:hidden absolute inset-0 pointer-events-none"
        style={{ backgroundImage:`url(${resBgMobile})`, backgroundSize:"cover", backgroundPosition:"center", backgroundRepeat:"no-repeat" }}
        aria-hidden="true" />

      {/* Gradient overlay — darker at bottom for panel readability */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
        style={{ background:"linear-gradient(to bottom, rgba(23,16,10,0.55) 0%, rgba(23,16,10,0.45) 50%, rgba(23,16,10,0.78) 100%)" }} />

      {/* ── Cinematic hero ── */}
      <div className="relative flex flex-col items-center justify-center min-h-[88vh] pb-8 pt-28 px-4">

        {/* Title block */}
        <div className="text-center mb-12 max-w-2xl mx-auto">
          {/* Divider line */}
          <div style={{ height:1, background:"rgba(246,236,224,0.25)", marginBottom:"1.5rem" }} aria-hidden="true" />

          {/* "Book A Table" — Anton, matches Explore Our Menu style */}
          <h1 className="font-anton uppercase text-[#f6ece0] tracking-tight leading-none text-[clamp(2.8rem,7vw,5rem)] mb-4">
            Book A Table
          </h1>

          {/* Subtitle small caps */}
          <p style={{
            fontFamily:    "'Poppins', sans-serif",
            fontSize:      "0.7rem",
            fontWeight:    600,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color:         "#a8957f",
            marginBottom:  "0.875rem",
          }}>
            Good Food Brings People Together
          </p>
        </div>

        {/* ── Booking panel ── */}
        <HeroBookingPanel
          date={date}
          guests={guests}
          timeIso={timeIso}
          timeToIso={timeToIso}
          timePickerRequest={timePickerRequest}
          onDateChange={selectDate}
          onGuestsChange={changeGuests}
          onTimeChange={(iso) => { setTimeIso(iso); setTimeToIso(null); }}
          onTimeToChange={setTimeToIso}
          onBook={handleBarBook}
          bookError={bookError}
        />

        {/* ── Trust row ── */}
        <div className="mt-16 w-full max-w-2xl mx-auto">
          <div className="flex flex-row items-center justify-center">
            {[
              { icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M10 2l2.4 5.1 5.6.8-4 3.9.9 5.5L10 15l-4.9 2.3.9-5.5L2 8l5.6-.8z"/></svg>,  line1:"Instant", line2:"Confirmation" },
              { icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="7" cy="7" r="4"/><path d="M1 18c0-3.3 2.7-6 6-6"/><circle cx="14" cy="9" r="3"/><path d="M11 18c0-2.5 1.3-4.7 3-5.9"/></svg>, line1:"Perfect for Friends", line2:"& Family" },
              { icon: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="8" width="14" height="10" rx="2"/><path d="M7 8V6a3 3 0 016 0v2"/></svg>, line1:"Safe & Secure", line2:"Booking" },
            ].map((item, i) => (
              <div key={i} className="flex items-center flex-1">
                {i > 0 && (
                  <div className="w-px h-8 shrink-0" style={{ background:"rgba(168,149,127,0.55)" }} aria-hidden="true"/>
                )}
                <div className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 w-full">
                  <span className="shrink-0" style={{ color:"#a8957f" }}>{item.icon}</span>
                  <div className="min-w-0">
                    <p style={{ fontFamily:"'Poppins',sans-serif", fontSize:"0.7rem", fontWeight:400, color:"rgba(246,236,224,0.50)", lineHeight:1.3, whiteSpace:"nowrap" }}>{item.line1}</p>
                    <p style={{ fontFamily:"'Poppins',sans-serif", fontSize:"0.65rem", fontWeight:400, color:"rgba(246,236,224,0.50)", lineHeight:1.3, whiteSpace:"nowrap" }}>{item.line2}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {tableSelectionOpen && reservationStage === "table" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[2px] sm:p-5"
            onClick={() => setTableSelectionOpen(false)}
          >
            <div className="my-auto max-h-[calc(100dvh-24px)] w-full max-w-6xl overflow-y-auto md:overflow-hidden">
            <BookingTableSelection
              date={date}
              timeIso={timeIso}
              timeToIso={timeToIso}
              guests={guests}
              selectedTableId={selectedTableId}
              onSelect={selectTable}
              onClose={() => setTableSelectionOpen(false)}
              onContinue={(table) => {
                setSelectedTable(table);
                setReservationStage("checkout");
              }}
              onChangeTime={() => {
                setTableSelectionOpen(false);
                setTimePickerRequest(request => request + 1);
              }}
            />
            </div>
          </motion.div>
        )}
        {tableSelectionOpen && reservationStage === "checkout" && selectedTable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[2px] sm:p-5"
            onClick={() => setTableSelectionOpen(false)}
          >
            <div className="my-auto max-h-[calc(100dvh-24px)] w-full max-w-6xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <ReservationPaymentStage
                date={date}
                timeIso={timeIso}
                timeToIso={timeToIso}
                guests={guests}
                table={selectedTable}
                user={user}
                token={token}
                onClose={() => setTableSelectionOpen(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
