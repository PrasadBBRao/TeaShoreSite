/**
 * SignUp.jsx — Teashore Sign Up Page
 *
 * Design: Deep palm-brown background, cream text.
 * Auth: Name + mobile number + password (with strength meter) + confirm password.
 *       Connected to POST /api/auth/signup. Auto-logs in and redirects to Home on success.
 * Social: Google + Apple OAuth UI is reserved for a future integration.
 */

import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../context/AuthContext";

const fadeUp = {
  initial:    { opacity: 0, y: 24 },
  animate:    { opacity: 1, y: 0  },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
};

/* ── SVG eye icons ─────────────────────────────────────────────────────── */
const EyeOpen = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-[18px] h-[18px]">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-[18px] h-[18px]">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round"/>
    <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round"/>
  </svg>
);

/* ── Password strength logic ───────────────────────────────────────────── */
function getStrength(pw) {
  const checks = {
    length:    pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    number:    /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Strong"];
  // color: 1=red, 2=orange, 3=yellow, 4-5=green (using Tailwind arbitrary values)
  const barColors = [
    "",
    "bg-red-400",
    "bg-orange-400",
    "bg-yellow-400",
    "bg-emerald-400",
    "bg-emerald-400",
  ];
  return { checks, score, label: labels[score], barColor: barColors[score] };
}

/* ── Password field + strength meter ──────────────────────────────────── */
function PasswordFieldWithStrength({ id, value, onChange, disabled }) {
  const [show, setShow] = useState(false);
  const { checks, score, label, barColor } = useMemo(() => getStrength(value), [value]);

  const REQUIREMENTS = [
    { key: "length",    text: "At least 8 characters" },
    { key: "uppercase", text: "One uppercase letter"  },
    { key: "lowercase", text: "One lowercase letter"  },
    { key: "number",    text: "One number"            },
    { key: "special",   text: "One special character (!@#$%^&*…)" },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-sans text-xs font-semibold uppercase tracking-widest text-cream/60"
      >
        Password
      </label>

      {/* Input */}
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={value}
          onChange={onChange}
          /* suppress browser's own reveal button */
          style={{ WebkitTextSecurity: show ? "none" : undefined }}
          className="w-full rounded-xl border border-cream-dark/60 bg-[#fbf3e8] px-4 py-3.5 pr-12
                     font-sans text-base text-palm-brown placeholder:text-palm-brown/45
                     focus:border-palm-brown/40 focus:outline-none focus:ring-2 focus:ring-palm-brown/10
                     [&::-ms-reveal]:hidden [&::-ms-clear]:hidden
                     transition-all duration-200"
          aria-label="Password"
          aria-describedby={`${id}-requirements`}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-palm-brown/50 hover:text-palm-brown transition-colors"
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {show ? <EyeOff /> : <EyeOpen />}
        </button>
      </div>

      {/* Strength meter — only show once user starts typing */}
      {value.length > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          {/* Bar row */}
          <div className="flex items-center justify-between gap-3">
            <span className="font-sans text-[11px] text-cream/40 shrink-0">Password strength</span>
            <div className="flex flex-1 items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={[
                    "h-1 flex-1 rounded-full transition-all duration-300",
                    i <= score ? barColor : "bg-cream/15",
                  ].join(" ")}
                />
              ))}
            </div>
            <span
              className={[
                "font-sans text-[11px] font-semibold shrink-0 transition-colors duration-300",
                score <= 1 ? "text-red-400"
                : score === 2 ? "text-orange-400"
                : score === 3 ? "text-yellow-400"
                : "text-emerald-400",
              ].join(" ")}
            >
              {label}
            </span>
          </div>

          {/* Requirements list */}
          <ul
            id={`${id}-requirements`}
            className="flex flex-col gap-1 pt-0.5"
            aria-label="Password requirements"
          >
            {REQUIREMENTS.map(({ key, text }) => {
              const met = checks[key];
              return (
                <li
                  key={key}
                  className={[
                    "flex items-center gap-2 font-sans text-[11px] transition-colors duration-200",
                    met ? "text-emerald-300/80" : "text-cream/70",
                  ].join(" ")}
                >
                  {/* Checkmark / circle icon */}
                  {met ? (
                    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0">
                      <circle cx="8" cy="8" r="7" fill="currentColor" fillOpacity="0.2"/>
                      <path d="M4.5 8l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                    </svg>
                  )}
                  {text}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Confirm password field — single eye icon only ─────────────────────
   The browser (Chrome/Edge) injects its own eye button into password fields.
   We suppress it with CSS so there's only our one icon at far-right.
────────────────────────────────────────────────────────────────────────── */
function ConfirmPasswordField({ id, value, onChange, disabled }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-sans text-xs font-semibold uppercase tracking-widest text-cream/60"
      >
        Confirm Password
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repeat password"
          value={value}
          onChange={onChange}
          className="w-full rounded-xl border border-cream-dark/60 bg-[#fbf3e8] px-4 py-3.5 pr-12
                     font-sans text-base text-palm-brown placeholder:text-palm-brown/45
                     focus:border-palm-brown/40 focus:outline-none focus:ring-2 focus:ring-palm-brown/10
                     [&::-ms-reveal]:hidden [&::-ms-clear]:hidden
                     transition-all duration-200"
          aria-label="Confirm password"
          disabled={disabled}
        />
        {/* Single eye icon — far-right only */}
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-palm-brown/50 hover:text-palm-brown transition-colors"
          aria-label={show ? "Hide confirm password" : "Show confirm password"}
          tabIndex={-1}
        >
          {show ? <EyeOff /> : <EyeOpen />}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function SignUp() {
  const [name,     setName]     = useState("");
  const [mobile,   setMobile]   = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!name.trim())         { setError("Please enter your name.");                   return; }
    if (!mobile.trim())       { setError("Please enter your mobile number.");          return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters.");  return; }
    if (password !== confirm) { setError("Passwords do not match.");                   return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:          name.trim(),
          mobile_number: mobile.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError("This mobile number is already registered. Try logging in.");
        } else if (res.status === 422) {
          // Pydantic validation error — extract first message if available
          const msg = data?.detail?.[0]?.msg ?? data?.detail;
          setError(typeof msg === "string" ? msg : "Please check your details and try again.");
        } else if (res.status === 503) {
          setError("Service temporarily unavailable. Please try again.");
        } else {
          setError(data?.detail ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Success — auto-login and go home
      await login(data);
      navigate("/", { replace: true });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-palm-brown flex flex-col">

      {/* ── Main content ── */}
      <main className="flex flex-1 items-center justify-center px-6 pt-24 pb-8 md:pt-28 md:pb-10">
        <motion.div
          {...fadeUp}
          className="w-full max-w-[440px]"
        >
          {/* Heading */}
          <div className="mb-8 flex flex-col">
            <div>
              <h1 className="font-poppins font-bold text-3xl leading-tight text-cream">
                Create your account
              </h1>
              <p className="mt-2 font-sans text-sm text-cream/55 leading-relaxed">
                Join us and make your next cup special.
              </p>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-400/30 bg-red-900/20 px-4 py-3 font-sans text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-name" className="font-sans text-xs font-semibold uppercase tracking-widest text-cream/60">
                Name
              </label>
              <input
                id="signup-name"
                type="text"
                autoComplete="name"
                placeholder="Aanya Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-cream-dark/60 bg-[#fbf3e8] px-4 py-3.5
                           font-sans text-base text-palm-brown placeholder:text-palm-brown/45
                           focus:border-palm-brown/40 focus:outline-none focus:ring-2 focus:ring-palm-brown/10
                           transition-all duration-200"
                aria-label="Full name"
                disabled={loading}
              />
            </div>

            {/* Mobile Number */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-mobile" className="font-sans text-xs font-semibold uppercase tracking-widest text-cream/60">
                Mobile Number
              </label>
              <input
                id="signup-mobile"
                type="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-xl border border-cream-dark/60 bg-[#fbf3e8] px-4 py-3.5
                           font-sans text-base text-palm-brown placeholder:text-palm-brown/45
                           focus:border-palm-brown/40 focus:outline-none focus:ring-2 focus:ring-palm-brown/10
                           transition-all duration-200"
                aria-label="Mobile number"
                disabled={loading}
              />
            </div>

            {/* Password + Strength meter */}
            <PasswordFieldWithStrength
              id="signup-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />

            {/* Confirm Password — single eye icon */}
            <ConfirmPasswordField
              id="signup-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
            />

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-full
                         bg-[#f4e8d8] py-4 font-poppins text-sm font-semibold uppercase
                         tracking-widest text-palm-brown shadow-sm
                         hover:bg-[#f8efe3]
                         active:scale-[0.98]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/40"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Creating account…
                </>
              ) : "Sign Up"}
            </button>
          </form>

          {/* OAuth is intentionally disabled until provider integration is implemented. */}
          {/*
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-cream/15" />
            <span className="font-sans text-xs text-cream/40 px-1">OR</span>
            <div className="h-px flex-1 bg-cream/15" />
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleOAuth("Google")}
              className="flex w-full items-center justify-center gap-3 rounded-[16px]
                         border border-cream-dark bg-[#f4e8d8] py-4
                         font-poppins text-base font-semibold text-palm-brown
                         hover:bg-[#f8efe3] hover:border-cream
                         active:scale-[0.99] transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/20"
              aria-label="Continue with Google"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => handleOAuth("Apple")}
              className="flex w-full items-center justify-center gap-3 rounded-[16px]
                         border border-cream-dark bg-[#f4e8d8] py-4
                         font-poppins text-base font-semibold text-palm-brown
                         hover:bg-[#f8efe3] hover:border-cream
                         active:scale-[0.99] transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/20"
              aria-label="Continue with Apple"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.4.07 2.38.74 3.2.8 1.22-.24 2.38-.93 3.7-.84 1.58.12 2.76.74 3.53 1.9-3.25 1.95-2.48 6.08.84 7.26-.62 1.63-1.44 3.25-3.27 4.76zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>
          </div>
          */}

          {/* Login link */}
          <p className="mt-8 text-center font-poppins text-base text-cream/70">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-bold text-cream hover:underline hover:underline-offset-2 hover:text-cream/80 transition-colors"
            >
              Login
            </Link>
          </p>

          {/* Legal */}
          <p className="mt-5 text-center font-sans text-xs text-cream/25 leading-relaxed">
            By signing up you agree to our{" "}
            <a href="#" className="underline underline-offset-2 hover:text-cream/45 transition-colors">Terms</a>
            {" "}and{" "}
            <a href="#" className="underline underline-offset-2 hover:text-cream/45 transition-colors">Privacy Policy</a>.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
