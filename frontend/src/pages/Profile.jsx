/**
 * Profile.jsx — Teashore user profile page.
 *
 * Shows account information from AuthContext (name, mobile number,
 * member-since date) and quick-access links to activity pages.
 * Includes sign-out action.
 *
 * Design: matches Orders / MyReservations — cream bg, font-anton heading,
 * amber-accent eyebrow, palm-brown typography.
 * Auth: redirects to /login if not authenticated.
 */

import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User } from "lucide-react";

import { useAuth } from "../context/AuthContext";

/* ── helpers ──────────────────────────────────────────────────────────── */
function fmtMemberSince(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    month: "long", year: "numeric",
  });
}

/* Format mobile number — mask middle digits for display */
function fmtMobile(raw) {
  if (!raw) return "—";
  // Strip leading + or country code if present, keep last 10 digits
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return `${last10.slice(0, 2)} •••• •••• ${last10.slice(-2)}`;
  }
  return raw;
}

/* Initials from name (up to 2 chars) */
function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* ── Section wrapper ──────────────────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <div className="bg-cream-light rounded-2xl border border-cream-dark shadow-card overflow-hidden">
      {title && (
        <div className="px-5 py-3 border-b border-cream-dark">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-palm-brown/45">
            {title}
          </p>
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Info row ─────────────────────────────────────────────────────────── */
function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-cream-dark last:border-0">
      <span className="font-sans text-sm text-palm-brown/55 shrink-0">{label}</span>
      <span className="font-poppins font-semibold text-sm text-palm-brown text-right break-all">{value}</span>
    </div>
  );
}

/* ── Navigation row (link) ────────────────────────────────────────────── */
function NavRow({ to, icon, label, sublabel }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 px-5 py-4 border-b border-cream-dark last:border-0
                 hover:bg-cream transition-colors duration-150 group"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                       bg-cream border border-cream-dark text-palm-brown/60
                       group-hover:border-palm-brown/30 group-hover:text-palm-brown transition-colors">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-poppins font-semibold text-sm text-palm-brown">{label}</p>
        {sublabel && (
          <p className="font-sans text-xs text-palm-brown/45 mt-0.5">{sublabel}</p>
        )}
      </div>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" className="w-4 h-4 shrink-0 text-palm-brown/30
        group-hover:text-palm-brown/60 transition-colors" aria-hidden="true">
        <path d="M6 3l5 5-5 5" />
      </svg>
    </Link>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */
export default function Profile() {
  const { user, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  /* Redirect to login if not authenticated */
  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [authLoading, user, navigate]);

  /* Skeleton while auth is resolving */
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-cream">
        <main className="max-w-lg mx-auto px-4 pt-24 pb-32 md:pt-28 md:pb-16">
          <div className="animate-pulse space-y-4">
            <div className="h-3 bg-cream-dark rounded w-24" />
            <div className="h-10 bg-cream-dark rounded w-40" />
            <div className="mt-8 flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-cream-dark" />
              <div className="h-5 bg-cream-dark rounded w-32" />
              <div className="h-3 bg-cream-dark rounded w-24" />
            </div>
            <div className="mt-6 h-40 bg-cream-dark rounded-2xl" />
            <div className="h-32 bg-cream-dark rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  function handleSignOut() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-cream">
      <main className="max-w-lg mx-auto px-4 pt-24 pb-32 md:pt-28 md:pb-16">

        {/* Back link */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold
                       uppercase tracking-widest text-palm-brown/50 hover:text-palm-brown transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M10 3L5 8l5 5" />
            </svg>
            Back to Home
          </Link>
        </div>

        {/* Page heading — matches Orders / MyReservations pattern exactly */}
        <div className="mb-8">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.24em] text-amber-accent">
            My account
          </p>
          <h1 className="mt-2 flex items-center gap-3 font-anton text-4xl text-palm-brown sm:text-5xl">
            <User className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" strokeWidth={1.8} aria-hidden="true" />
            Profile
          </h1>
        </div>

        {/* Avatar + name hero block */}
        <div className="mb-6 flex flex-col items-center text-center py-6
                        bg-cream-light rounded-2xl border border-cream-dark shadow-card">
          {/* Avatar circle with initials */}
          <div className="w-20 h-20 rounded-full bg-palm-brown flex items-center justify-center
                          shadow-[0_0_0_6px_rgba(74,51,37,0.10)] mb-4" aria-hidden="true">
            <span className="font-poppins font-bold text-2xl text-cream-light tracking-wide">
              {initials(user.name)}
            </span>
          </div>

          <h2 className="font-poppins font-bold text-xl text-palm-brown leading-tight">
            {user.name}
          </h2>
          <p className="mt-1 font-sans text-sm text-palm-brown/50">
            Member since {fmtMemberSince(user.created_at)}
          </p>
        </div>

        {/* Account details */}
        <div className="mb-4">
          <Section title="Account Details">
            <InfoRow label="Full name"      value={user.name} />
            <InfoRow label="Mobile"         value={fmtMobile(user.mobile_number)} />
            <InfoRow label="Member since"   value={fmtMemberSince(user.created_at)} />
            <InfoRow
              label="Account ID"
              value={`#${String(user.id).slice(-8).toUpperCase()}`}
            />
          </Section>
        </div>

        {/* Quick links */}
        <div className="mb-4">
          <Section title="My Activity">
            <NavRow
              to="/orders"
              label="My Orders"
              sublabel="View order history and track active orders"
              icon={
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                  className="w-4.5 h-4.5" aria-hidden="true">
                  <path d="M4 6h12M4 10h8M4 14h5" />
                </svg>
              }
            />
            <NavRow
              to="/my-reservations"
              label="My Reservations"
              sublabel="View upcoming and past table bookings"
              icon={
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                  className="w-4.5 h-4.5" aria-hidden="true">
                  <rect x="3" y="4" width="14" height="14" rx="2" />
                  <path d="M3 8h14M8 2v4M12 2v4" />
                </svg>
              }
            />
            <NavRow
              to="/reservation"
              label="Book a Table"
              sublabel="Reserve a table for your next visit"
              icon={
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                  className="w-4.5 h-4.5" aria-hidden="true">
                  <circle cx="10" cy="10" r="8" />
                  <path d="M10 6v4l2.5 2.5" />
                </svg>
              }
            />
          </Section>
        </div>

        {/* Sign out */}
        <div className="mb-6">
          <Section>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-4 px-5 py-4
                         text-left hover:bg-red-50 transition-colors duration-150 group"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                               bg-red-50 border border-red-200 text-red-500
                               group-hover:bg-red-100 transition-colors">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                  className="w-4.5 h-4.5" aria-hidden="true">
                  <path d="M13 15l3-5-3-5M16 10H7" />
                  <path d="M9 18H5a2 2 0 01-2-2V4a2 2 0 012-2h4" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-poppins font-semibold text-sm text-red-600">Sign out</p>
                <p className="font-sans text-xs text-red-400/80 mt-0.5">
                  You'll need to sign in again to place orders
                </p>
              </div>
            </button>
          </Section>
        </div>

        {/* Teashore wordmark footer note */}
        <p className="text-center font-sans text-[11px] text-palm-brown/30 tracking-widest uppercase">
          Teashore · Healthy Café
        </p>

      </main>
    </div>
  );
}
