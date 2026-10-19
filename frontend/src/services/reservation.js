/**
 * reservation.js — API helpers for the Reservation page.
 *
 * All calls go through the shared apiFetch() wrapper which handles
 * error normalisation and the /api proxy prefix.
 *
 * Functions
 * ──────────
 * fetchAvailableTables(reservationTime, partySize)
 *   GET /tables/available — public, no auth needed
 *   Returns [{id, table_number, capacity, is_available}]
 *
 * fetchAddons()
 *   GET /reservations/addons/available — public, no auth needed
 *   Returns [{id, name, description, price, is_available}]
 *
 * createReservation(body, token)
 *   POST /reservations — requires JWT
 *   body: { party_size, reservation_time, table_ids, extra_chair, addons }
 *   Returns full ReservationDetail
 *
 * fetchMyReservations(token)
 *   GET /reservations — requires JWT
 *   Returns [ReservationDetail]
 *
 * cancelReservation(id, token)
 *   PATCH /reservations/{id}/cancel — requires JWT
 *   Returns updated ReservationDetail
 */

import { apiFetch } from "../lib/api";

/**
 * Fetch all tables sized for `partySize` and annotated with availability
 * at the given ISO datetime.
 *
 * @param {string} reservationTime  ISO-8601 string, e.g. "2026-09-15T19:00:00"
 * @param {number} partySize        Number of guests (>= 1)
 * @returns {Promise<Array>}
 */
export async function fetchAvailableTables(reservationTime, partySize) {
  const params = new URLSearchParams({
    reservation_time: reservationTime,
    party_size: String(partySize),
  });
  return apiFetch(`/tables/available?${params}`);
}

/**
 * Fetch all available reservation addons (server-authoritative prices).
 *
 * @returns {Promise<Array>}  [{id, name, description, price, is_available}]
 */
export async function fetchAddons() {
  return apiFetch("/reservations/addons/available");
}

/**
 * Create a reservation.
 *
 * @param {{
 *   party_size:       number,
 *   reservation_time: string,   // ISO-8601
 *   table_ids:        string[], // UUIDs
 *   extra_chair:      boolean,
 *   addons:           Array<{addon_id: string, quantity: number}>
 * }} body
 * @param {string} token  JWT access token
 * @returns {Promise<Object>}  ReservationDetail
 */
export async function createReservation(body, token) {
  return apiFetch("/reservations", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

/**
 * Fetch the authenticated user's reservations (newest first).
 *
 * @param {string} token  JWT access token
 * @returns {Promise<Array>}  [ReservationDetail]
 */
export async function fetchMyReservations(token) {
  return apiFetch("/reservations", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Cancel a confirmed reservation.
 *
 * @param {string} id     Reservation UUID
 * @param {string} token  JWT access token
 * @returns {Promise<Object>}  Updated ReservationDetail
 */
export async function cancelReservation(id, token) {
  return apiFetch(`/reservations/${id}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/* ── Business-rule constants (must mirror backend) ───────────────────────
   SLOT_WINDOW_HOURS = 2  → used only for display copy, not logic
   Business hours: 11 AM – 11 PM in 1-hour slots (13 slots total)
   Advance booking: today same-day slots allowed if > 1 hr ahead, up to 30 days  */

export const BUSINESS_HOURS = {
  openHour:    11,  // 11:00 AM
  closeHour:   23,  // last slot 11:00 PM  (23:00)
  slotMinutes: 60,  // hourly slots: 11 AM, 12 PM … 11 PM
};

export const BOOKING_WINDOW = {
  minDaysAhead: 0,   // can book same-day slots in the future
  maxDaysAhead: 30,
};

/**
 * Generate all valid time slots for a given date as ISO-8601 strings.
 * Slots in the past (< 1 hour from now) are excluded for today.
 *
 * @param {Date} date  The selected date (local midnight)
 * @returns {Array<{iso: string, label: string, disabled: boolean}>}
 */
export function generateTimeSlots(date) {
  const { openHour, closeHour, slotMinutes } = BUSINESS_HOURS;
  const slots = [];
  const now = new Date();
  // Require at least 1 hour advance notice
  const minTime = new Date(now.getTime() + 60 * 60 * 1000);

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth()    === now.getMonth()    &&
    date.getDate()     === now.getDate();

  // Generate slots from openHour up to and including closeHour
  // e.g. 11 AM → 11 PM = 13 hourly slots
  const totalSlots = Math.floor((closeHour - openHour) * 60 / slotMinutes) + 1;

  for (let i = 0; i < totalSlots; i++) {
    const totalMins = i * slotMinutes;
    const h = openHour + Math.floor(totalMins / 60);
    const m = totalMins % 60;

    const slotDate = new Date(date);
    slotDate.setHours(h, m, 0, 0);

    const pad  = (n) => String(n).padStart(2, "0");
    const iso  = `${slotDate.getFullYear()}-${pad(slotDate.getMonth() + 1)}-${pad(slotDate.getDate())}T${pad(h)}:${pad(m)}:00`;
    const isPast = isToday && slotDate <= minTime;

    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm   = h < 12 ? "AM" : "PM";
    const label  = m === 0 ? `${hour12} ${ampm}` : `${hour12}:${pad(m)} ${ampm}`;

    slots.push({ iso, label, disabled: isPast });
  }

  return slots;
}

/**
 * Return an array of selectable Date objects for the booking calendar.
 * Starts from today, up to BOOKING_WINDOW.maxDaysAhead days ahead.
 *
 * @returns {Date[]}
 */
export function getBookableDates() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = BOOKING_WINDOW.minDaysAhead; i <= BOOKING_WINDOW.maxDaysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}
