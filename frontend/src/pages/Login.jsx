/**
 * Login.jsx — Teashore Login Page
 *
 * Design: Cream background, deep palm-brown text, minimal and premium.
 * Auth: Mobile number + password form connected to POST /api/auth/login.
 * Contrast pair: Login = cream bg / SignUp = dark bg.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../context/AuthContext";

const fadeUp = {
  initial:    { opacity: 0, y: 24 },
  animate:    { opacity: 1, y: 0  },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
};

export default function Login() {
  const [mobile,   setMobile]   = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!mobile.trim())   { setError("Please enter your mobile number."); return; }
    if (!password.trim()) { setError("Please enter your password.");       return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mobile_number: mobile.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // 401 → bad credentials; 422 → validation; 503 → DB down
        if (res.status === 401) {
          setError("Incorrect mobile number or password.");
        } else if (res.status === 503) {
          setError("Service temporarily unavailable. Please try again.");
        } else {
          setError(data?.detail ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Success — store token and navigate home
      await login(data);
      navigate("/", { replace: true });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col">

      {/* ── Main content ── */}
      <main className="flex flex-1 items-center justify-center px-6 pt-24 pb-8 md:pt-28 md:pb-12">
        <motion.div
          {...fadeUp}
          className="w-full max-w-[420px]"
        >
          {/* Heading */}
          <div className="mb-8 flex flex-col">
            <div>
              <h1 className="font-poppins font-bold text-3xl leading-tight text-palm-brown">
                Welcome back
              </h1>
              <p className="mt-2 font-sans text-sm text-palm-brown/55 leading-relaxed">
                Sign in to continue your Teashore experience.
              </p>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

            {/* Mobile Number */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-mobile"
                className="font-sans text-xs font-semibold uppercase tracking-widest text-palm-brown/60"
              >
                Mobile Number
              </label>
              <input
                id="login-mobile"
                type="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full rounded-xl border border-cream-dark bg-cream-light px-4 py-3.5
                           font-sans text-base text-palm-brown placeholder:text-palm-brown/40
                           focus:border-palm-brown/40 focus:outline-none focus:ring-2 focus:ring-palm-brown/15
                           transition-all duration-200"
                aria-label="Mobile number"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-password"
                className="font-sans text-xs font-semibold uppercase tracking-widest text-palm-brown/60"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-cream-dark bg-cream-light px-4 py-3.5 pr-12
                             font-sans text-base text-palm-brown placeholder:text-palm-brown/40
                             focus:border-palm-brown/40 focus:outline-none focus:ring-2 focus:ring-palm-brown/15
                             [&::-ms-reveal]:hidden [&::-ms-clear]:hidden
                             transition-all duration-200"
                  aria-label="Password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-palm-brown/40 hover:text-palm-brown transition-colors"
                  aria-label={showPass ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPass ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4.5 h-4.5 w-[18px] h-[18px]">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round"/>
                      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-[18px] h-[18px]">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              <a
                href="#forgot-password"
                className="mt-1 self-end font-sans text-xs font-semibold text-palm-brown/55 hover:underline hover:underline-offset-2 hover:text-palm-brown transition-colors"
              >
                Forgot password?
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-full
                         bg-palm-brown py-4 font-sans text-sm font-semibold uppercase
                         tracking-widest text-cream shadow-sm
                         hover:bg-palm-brown-light
                         active:scale-[0.98]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown/50"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Signing in…
                </>
              ) : "Login"}
            </button>
          </form>

          {/* OAuth is intentionally disabled until provider integration is implemented. */}
          {/*
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-cream-dark" />
            <span className="font-sans text-xs text-palm-brown/35 px-1">OR</span>
            <div className="h-px flex-1 bg-cream-dark" />
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleOAuth("Google")}
              className="flex w-full items-center justify-center gap-3 rounded-[16px]
                         border border-cream-dark bg-cream-light py-4
                         font-poppins text-base font-semibold text-palm-brown
                         hover:bg-cream hover:border-palm-brown/25
                         active:scale-[0.99] transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown/30"
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
                         border border-cream-dark bg-cream-light py-4
                         font-poppins text-base font-semibold text-palm-brown
                         hover:bg-cream hover:border-palm-brown/25
                         active:scale-[0.99] transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-palm-brown/30"
              aria-label="Continue with Apple"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.4.07 2.38.74 3.2.8 1.22-.24 2.38-.93 3.7-.84 1.58.12 2.76.74 3.53 1.9-3.25 1.95-2.48 6.08.84 7.26-.62 1.63-1.44 3.25-3.27 4.76zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>
          </div>
          */}

          {/* Sign up link */}
          <p className="mt-8 text-center font-poppins text-base text-palm-brown/70">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="font-bold text-palm-brown hover:underline hover:underline-offset-2 hover:text-palm-brown/80 transition-colors"
            >
              Sign up
            </Link>
          </p>

          {/* Legal */}
          <p className="mt-5 text-center font-sans text-xs text-palm-brown/30 leading-relaxed">
            By continuing you agree to our{" "}
            <a href="#" className="underline underline-offset-2 hover:text-palm-brown/50 transition-colors">Terms</a>
            {" "}and{" "}
            <a href="#" className="underline underline-offset-2 hover:text-palm-brown/50 transition-colors">Privacy Policy</a>.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
